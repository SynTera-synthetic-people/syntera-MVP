"""
Hybrid SyncDB Source Link Scraper.

Architecture:
    Layer 1: fast async httpx + BeautifulSoup extraction for static HTML/PDFs.
    Layer 2: optional async Playwright fallback for JavaScript-heavy pages.
    Layer 3: retry/recovery with rotated headers, longer timeouts, and backoff.

The public API is intentionally unchanged. Scraped content is still persisted via
sync_source.document and sync_source.content_chunk without schema changes.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import random
import re
import sys
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.syncdb_constants import PERMANENTLY_BLOCKED_DOMAINS
from app.services.syncdb_source import (
    DATA_TYPE_SCRAPED,
    _MAX_SCRAPED_CONTENT_LENGTH,
    _SOFT_MAX_SCRAPED_CHUNKS,
    _clean_extracted_text,
    _extract_readable_webpage_text,
    _extract_readable_webpage_text_relaxed,
    _save_text_chunks,
    _score_content_quality,
)
from app.utils.id_generator import generate_id

logger = logging.getLogger(__name__)

PLAYWRIGHT_AVAILABLE: bool = True
_PLAYWRIGHT_CHECKED: bool = False
NO_RETRY_HTTP_STATUSES: frozenset[int] = frozenset({403, 404, 410, 451})
RETRY_LIMITS: dict[str, int] = {
    "ReadTimeout": 2,
    "ConnectError": 1,
    "default": 3,
}
TIMEOUT_SECONDS: dict[str, int] = {
    "first_attempt": 30,
    "after_timeout": 15,
    "playwright": 30,
}

# ---------------------------------------------------------------------------
# Tuning and config
# ---------------------------------------------------------------------------


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "t", "yes", "y", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("Invalid integer config | key=%s | value=%r | default=%d", name, raw, default)
        return default


_MAX_CONCURRENT = _env_int("SYNCDB_SCRAPER_MAX_CONCURRENT", 20)
_MAX_DYNAMIC_CONCURRENT = _env_int("SYNCDB_SCRAPER_MAX_DYNAMIC_CONCURRENT", 4)
_FETCH_BATCH = _env_int("SYNCDB_SCRAPER_FETCH_BATCH", 300)
_REQUEST_TIMEOUT = _env_int("SYNCDB_SCRAPER_REQUEST_TIMEOUT", 40)
_RETRY_LIMIT = _env_int("SYNCDB_SCRAPER_RETRY_LIMIT", 5)
_MAX_CONTENT_BYTES = _env_int("SYNCDB_SCRAPER_MAX_CONTENT_BYTES", 104_857_600)
_ENABLE_DYNAMIC_SCRAPING = _env_bool("SYNCDB_ENABLE_DYNAMIC_SCRAPING", True)

_MIN_CLEANED_CHARS = _env_int("SYNCDB_SCRAPER_MIN_CLEANED_CHARS", 100)
_DYNAMIC_FALLBACK_CHARS = _env_int("SYNCDB_SCRAPER_DYNAMIC_FALLBACK_CHARS", 200)
_DYNAMIC_RAW_BYTES_THRESHOLD = _env_int("SYNCDB_SCRAPER_DYNAMIC_RAW_BYTES_THRESHOLD", 50_000)
_DYNAMIC_MIN_EXTRACTION_EFFICIENCY = float(
    os.getenv("SYNCDB_SCRAPER_DYNAMIC_MIN_EXTRACTION_EFFICIENCY", "0.05")
)
_DOMAIN_RATE_LIMIT_SECONDS = float(os.getenv("SYNCDB_SCRAPER_DOMAIN_RATE_LIMIT_SECONDS", "0.35"))
_RETRY_DELAY = float(os.getenv("SYNCDB_SCRAPER_RETRY_DELAY_SECONDS", "1.5"))
_RATE_LIMIT_WAIT = float(os.getenv("SYNCDB_SCRAPER_429_WAIT_SECONDS", "10.0"))
_STATIC_CLASSIFICATION_DOMAINS = frozenset(
    item.strip().lower().removeprefix("www.")
    for item in os.getenv("SYNCDB_STATIC_DOMAINS", "").split(",")
    if item.strip()
)
_BLOCKED_CLASSIFICATION_DOMAINS = frozenset(
    item.strip().lower().removeprefix("www.")
    for item in os.getenv("SYNCDB_BLOCKED_DOMAINS", "").split(",")
    if item.strip()
) | PERMANENTLY_BLOCKED_DOMAINS
_SCRAPER_COOKIE = os.getenv("SYNCDB_SCRAPER_COOKIE", "").strip()
_PLAYWRIGHT_BROWSER_CHANNEL = os.getenv("SYNCDB_PLAYWRIGHT_BROWSER_CHANNEL", "").strip()
_PLAYWRIGHT_EXECUTABLE_PATH = os.getenv("SYNCDB_PLAYWRIGHT_EXECUTABLE_PATH", "").strip()
_SKIP_LOW_VALUE_URLS = _env_bool("SYNCDB_SKIP_LOW_VALUE_URLS", True)
_FAILED_URLS_JSONL_PATH = os.getenv("SYNCDB_FAILED_URLS_JSONL", "").strip()
_LOW_QUALITY_SCORE_THRESHOLD = float(os.getenv("SYNCDB_LOW_QUALITY_SCORE_THRESHOLD", "0.25"))

_URL_COLUMN = "Source Link"
_VALID_COLUMN = "URL Valid"
_VALID_VALUE = "yes"

_DYNAMIC_DOMAIN_HINTS = {
    "medium.com",
    "notion.site",
    "webflow.io",
    "substack.com",
    "linkedin.com",
    "x.com",
    "twitter.com",
    "instagram.com",
    "facebook.com",
}

_LOW_VALUE_URL_RE = re.compile(
    r"(?i)"
    r"[?&](q|query|search|keyword[s]?|s|term|find|kw)="  # search query params
    r"|/search(/|\?|$)"                # /search path
    r"|/results(/|\?|$)"               # /results path
    r"|/find(/|\?|$)"                  # /find path
    r"|/listings?(/|\?|$)"            # /listing or /listings
    r"|/category/[^/?#]"               # /category/X
    r"|/tags?/"                        # /tags/
    r"|/page/\d+"                      # /page/N pagination
    r"|[?&]page=\d+"                   # ?page=N pagination
    r"|/sitemap(\.xml)?(/|$)"          # sitemaps
    r"|robots\.txt"                    # robots.txt
)

_USER_AGENTS = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (compatible; SyncDBBot/1.0; +https://syntheticpeople.ai)",
)

_TRANSIENT = (
    httpx.TimeoutException,
    httpx.ConnectError,
    httpx.ReadError,
    httpx.RemoteProtocolError,
    httpx.WriteError,
)


# ---------------------------------------------------------------------------
# Failure categorization
# ---------------------------------------------------------------------------

#: Categories are stable strings used as dict keys and written to JSONL.
_FAILURE_CATEGORIES = frozenset({
    "blocked",    # 401/403/410/451, known blocklist domains
    "not_found",  # 404
    "network",    # timeouts, connect errors  — retryable
    "content",    # page returned 200 but text too short / empty — not retryable
    "dynamic",    # JS-rendered page that needs Playwright but it failed — retryable
    "low_value",  # URL pattern identified as search/listing page — not retryable
    "other",      # unclassified
})


def _categorize_failure(
    reason: str,
    http_status: Optional[int] = None,
) -> tuple[str, bool]:
    """
    Return (category, retryable) for a scrape failure.

    Network errors are retryable; content/access failures are not.
    """
    if http_status in {401, 403, 410, 451}:
        return "blocked", False
    if http_status == 404:
        return "not_found", False
    if http_status == 429:
        return "network", True  # rate-limited → retry with backoff

    r = (reason or "").lower()

    if any(kw in r for kw in ("timeout", "connecterror", "readerror", "network", "connect error")):
        return "network", True
    if any(kw in r for kw in ("too short", "empty", "low content", "0 chars", "no chunks")):
        return "content", False
    if any(kw in r for kw in ("dynamic", "playwright", "dynamic fallback")):
        return "dynamic", True
    if any(kw in r for kw in ("blocklist", "blocked", "domain_blocklisted")):
        return "blocked", False
    if "low_value" in r:
        return "low_value", False
    if http_status and http_status >= 500:
        return "network", True  # server errors → worth retrying

    return "other", False


# ---------------------------------------------------------------------------
# Result dataclasses
# ---------------------------------------------------------------------------


@dataclass
class FailedURL:
    url: str
    reason: str
    domain: str = ""
    category: str = "other"
    retryable: bool = False
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "domain": self.domain,
            "reason": self.reason,
            "category": self.category,
            "retryable": self.retryable,
        }

    def to_jsonl_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "domain": self.domain,
            "failure_reason": self.reason,
            "category": self.category,
            "retryable": self.retryable,
            "timestamp": round(self.timestamp, 3),
            "ts_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.timestamp)),
        }


@dataclass
class URLScrapeLog:
    url: str
    status: str = "failed"
    http_status: Optional[int] = None
    method_used: str = "bs4"
    raw_content_length: int = 0
    cleaned_length: int = 0
    final_saved_length: int = 0
    chunks_created: int = 0
    time_taken_ms: int = 0
    retry_count: int = 0
    failure_reason: Optional[str] = None
    extraction_efficiency: float = 0.0
    total_time_ms: int = 0
    content_quality_score: float = 0.0
    quality_label: str = "unknown"
    dynamic_used: bool = False
    dynamic_success: bool = False

    def to_dict(self) -> dict[str, Any]:
        total_time_ms = self.total_time_ms or self.time_taken_ms
        return {
            "url": self.url,
            "status": self.status,
            "http_status": self.http_status,
            "method_used": self.method_used,
            "raw_content_length": self.raw_content_length,
            "cleaned_length": self.cleaned_length,
            "final_saved_length": self.final_saved_length,
            "chunks_created": self.chunks_created,
            "time_taken_ms": self.time_taken_ms,
            "total_time_ms": total_time_ms,
            "retry_count": self.retry_count,
            "failure_reason": self.failure_reason,
            "extraction_efficiency": round(self.extraction_efficiency, 6),
            "content_quality_score": self.content_quality_score,
            "quality_label": self.quality_label,
            "dynamic_used": self.dynamic_used,
            "dynamic_success": self.dynamic_success,
        }


@dataclass
class ScrapeReport:
    total_attempted: int = 0
    total_succeeded: int = 0
    total_failed: int = 0
    failed_urls: list[FailedURL] = field(default_factory=list)
    # ---- per-category failure breakdown ----
    failed_by_category: dict[str, int] = field(default_factory=dict)
    retryable_count: int = 0
    non_retryable_count: int = 0
    # ---- aggregate metrics (computed in finalize) ----
    success_rate: float = 0.0
    avg_content_length: float = 0.0
    avg_extraction_efficiency: float = 0.0
    dynamic_page_percent: float = 0.0
    failure_reason_percent: dict[str, float] = field(default_factory=dict)
    failed_domains: dict[str, int] = field(default_factory=dict)
    empty_extraction_percent: float = 0.0
    skipped_blocklisted: int = 0
    skipped_low_value: int = 0
    failed_permanent: int = 0
    low_quality_count: int = 0
    dynamic_used_count: int = 0

    # ------------------------------------------------------------------
    # Mutation helpers
    # ------------------------------------------------------------------

    def _make_failed_url(
        self,
        url: str,
        reason: str,
        http_status: Optional[int] = None,
    ) -> FailedURL:
        category, retryable = _categorize_failure(reason, http_status)
        return FailedURL(
            url=url,
            reason=reason,
            domain=_domain_from_url(url),
            category=category,
            retryable=retryable,
        )

    def _register(self, fu: FailedURL) -> None:
        self.failed_urls.append(fu)
        self.total_failed += 1
        self.failed_by_category[fu.category] = (
            self.failed_by_category.get(fu.category, 0) + 1
        )
        if fu.retryable:
            self.retryable_count += 1
        else:
            self.non_retryable_count += 1

    def add_failure(
        self,
        url: str,
        reason: str,
        *,
        http_status: Optional[int] = None,
    ) -> FailedURL:
        fu = self._make_failed_url(url, reason, http_status)
        self._register(fu)
        return fu

    def add_success(self) -> None:
        self.total_succeeded += 1

    def add_skipped_blocklisted(self) -> None:
        self.skipped_blocklisted += 1

    def add_skipped_low_value(self) -> None:
        self.skipped_low_value += 1

    def add_permanent_failure(
        self,
        url: str,
        reason: str,
        *,
        http_status: Optional[int] = None,
    ) -> FailedURL:
        fu = self._make_failed_url(url, reason, http_status)
        self._register(fu)
        self.failed_permanent += 1
        return fu

    # ------------------------------------------------------------------
    # Finalization
    # ------------------------------------------------------------------

    def finalize(self, logs: list[URLScrapeLog]) -> None:
        skipped_total = self.skipped_blocklisted + self.skipped_low_value
        counted_total = max(self.total_attempted - skipped_total, 0)
        self.success_rate = (
            self.total_succeeded / counted_total * 100
            if counted_total
            else 0.0
        )
        successful = [entry for entry in logs if entry.status == "success"]
        self.avg_content_length = (
            sum(entry.cleaned_length for entry in successful) / len(successful)
            if successful
            else 0.0
        )
        efficiencies = [
            entry.extraction_efficiency
            for entry in logs
            if entry.raw_content_length > 0 and entry.status == "success"
        ]
        self.avg_extraction_efficiency = (
            sum(efficiencies) / len(efficiencies) if efficiencies else 0.0
        )
        dynamic_count = sum(1 for entry in logs if entry.dynamic_used)
        self.dynamic_used_count = dynamic_count
        self.low_quality_count = sum(
            1 for entry in logs if entry.status == "success" and entry.quality_label == "low"
        )
        empty_count = sum(
            1
            for entry in logs
            if entry.raw_content_length > 0
            and entry.cleaned_length < _DYNAMIC_FALLBACK_CHARS
            or _normalize_failure_reason(entry.failure_reason or "") == "empty"
        )
        self.dynamic_page_percent = (
            dynamic_count / self.total_attempted * 100
            if self.total_attempted
            else 0.0
        )
        self.empty_extraction_percent = (
            empty_count / self.total_attempted * 100
            if self.total_attempted
            else 0.0
        )
        reason_counts = Counter(_normalize_failure_reason(f.reason) for f in self.failed_urls)
        self.failure_reason_percent = {
            reason: count / max(self.total_failed, 1) * 100
            for reason, count in reason_counts.items()
        }
        self.failed_domains = dict(
            Counter(_domain_from_url(f.url) for f in self.failed_urls if _domain_from_url(f.url))
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_attempted": self.total_attempted,
            "total_succeeded": self.total_succeeded,
            "total_failed": self.total_failed,
            "retryable_count": self.retryable_count,
            "non_retryable_count": self.non_retryable_count,
            "failed_by_category": dict(self.failed_by_category),
            "skipped_blocklisted": self.skipped_blocklisted,
            "skipped_low_value": self.skipped_low_value,
            "low_quality_count": self.low_quality_count,
            "dynamic_used_count": self.dynamic_used_count,
            "failed_urls": [f.to_dict() for f in self.failed_urls],
            "success_rate": round(self.success_rate, 2),
            "avg_content_length": round(self.avg_content_length, 2),
            "avg_extraction_efficiency": round(self.avg_extraction_efficiency, 4),
            "dynamic_page_percent": round(self.dynamic_page_percent, 2),
            "failure_reason_percent": {
                reason: round(percent, 2)
                for reason, percent in self.failure_reason_percent.items()
            },
            "failed_domains": self.failed_domains,
            "empty_extraction_percent": round(self.empty_extraction_percent, 2),
            "failed_permanent": self.failed_permanent,
            "playwright_available": PLAYWRIGHT_AVAILABLE,
            "retry_limits_used": RETRY_LIMITS,
        }


@dataclass
class _FetchResult:
    url: str
    text: Optional[str] = None
    error: Optional[str] = None
    is_permanent: bool = False
    http_status: Optional[int] = None
    method_used: str = "bs4"
    raw_content_length: int = 0
    cleaned_length: int = 0
    retry_count: int = 0
    time_taken_ms: int = 0
    status: str = "failed"
    dynamic_used: bool = False
    dynamic_success: bool = False
    content_quality_score: float = 0.0
    quality_label: str = "unknown"


@dataclass
class _RawFetch:
    text: str
    http_status: Optional[int]
    raw_content_length: int
    method_used: str
    raw_html: Optional[str] = None


class _DomainRateLimiter:
    def __init__(self, min_interval_seconds: float) -> None:
        self.min_interval_seconds = min_interval_seconds
        self._last_seen: dict[str, float] = defaultdict(float)
        self._locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def wait(self, url: str) -> None:
        domain = _domain_from_url(url) or "unknown"
        async with self._locks[domain]:
            now = time.monotonic()
            elapsed = now - self._last_seen[domain]
            wait_for = self.min_interval_seconds - elapsed
            if wait_for > 0:
                await asyncio.sleep(wait_for)
            self._last_seen[domain] = time.monotonic()


class _DynamicScraper:
    def __init__(self, max_concurrent: int) -> None:
        self._max_concurrent = max(max_concurrent, 1)
        self._semaphore = asyncio.Semaphore(self._max_concurrent)
        self._playwright: Any = None
        self._browser: Any = None
        self._lock = asyncio.Lock()

    async def __aenter__(self) -> "_DynamicScraper":
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        await self.close()

    async def _ensure_browser(self) -> Any:
        if not PLAYWRIGHT_AVAILABLE:
            raise RuntimeError("Playwright unavailable for this session")
        if self._browser is not None:
            return self._browser

        async with self._lock:
            if self._browser is not None:
                return self._browser
            try:
                from playwright.async_api import async_playwright
            except ImportError as exc:
                raise RuntimeError(
                    "Playwright is not installed; install playwright and run playwright install chromium"
                ) from exc

            self._playwright = await async_playwright().start()
            self._browser = await self._launch_browser()
            return self._browser

    async def _launch_browser(self) -> Any:
        errors: list[str] = []
        for launch_options in _playwright_launch_candidates():
            try:
                browser = await self._playwright.chromium.launch(**launch_options)
                logger.info(
                    "Playwright browser launched | mode=%s",
                    _describe_playwright_launch_options(launch_options),
                )
                return browser
            except Exception as exc:
                errors.append(
                    f"{_describe_playwright_launch_options(launch_options)}: {str(exc)[:220]}"
                )

        raise RuntimeError(
            "Playwright could not launch a browser. On locked-down Windows, set "
            "SYNCDB_PLAYWRIGHT_BROWSER_CHANNEL=msedge or "
            "SYNCDB_PLAYWRIGHT_EXECUTABLE_PATH to an approved Chrome/Edge executable. "
            "Launch attempts: " + " | ".join(errors)
        )

    async def fetch_dynamic(self, url: str, *, attempt: int = 0) -> _RawFetch:
        if not PLAYWRIGHT_AVAILABLE:
            logger.warning("Dynamic fallback skipped - Playwright unavailable | url=%s", url)
            raise RuntimeError("Playwright unavailable for this session")

        async with self._semaphore:
            if _should_use_threaded_playwright():
                return await asyncio.to_thread(_fetch_dynamic_sync, url, attempt)

            try:
                from playwright.async_api import TimeoutError as PlaywrightTimeoutError
            except ImportError as exc:
                raise RuntimeError(
                    "Playwright is not installed; install playwright and run playwright install chromium"
                ) from exc

            browser = await self._ensure_browser()
            headers = _headers_for_attempt(attempt)
            extra_headers = {
                "Accept-Language": headers["Accept-Language"],
                "DNT": headers["DNT"],
            }
            if _SCRAPER_COOKIE:
                extra_headers["Cookie"] = _SCRAPER_COOKIE
            context = await browser.new_context(
                user_agent=headers["User-Agent"],
                viewport={"width": 1366, "height": 900},
                extra_http_headers=extra_headers,
            )

            page = await context.new_page()
            try:
                response = await page.goto(
                    url,
                    wait_until="domcontentloaded",
                    timeout=(_REQUEST_TIMEOUT + 20) * 1000,
                )
                try:
                    await page.wait_for_load_state("networkidle", timeout=12_000)
                except PlaywrightTimeoutError as exc:
                    logger.warning("Playwright networkidle wait timed out | url=%s | reason=%s", url, exc)
                await page.wait_for_timeout(1_000)
                text_value = await page.locator("body").inner_text(timeout=12_000)
                html = await page.content()
                return _RawFetch(
                    text=clean_text(text_value or ""),
                    http_status=response.status if response else None,
                    raw_content_length=len(html.encode("utf-8", errors="ignore")),
                    method_used="playwright",
                )
            finally:
                await page.close()
                await context.close()

    async def close(self) -> None:
        if self._browser is not None:
            await self._browser.close()
            self._browser = None
        if self._playwright is not None:
            await self._playwright.stop()
            self._playwright = None


# ---------------------------------------------------------------------------
# Structured logging and metrics helpers
# ---------------------------------------------------------------------------


def _log_url_event(level: int, event: URLScrapeLog) -> None:
    logger.log(level, "syncdb_scrape_url %s", json.dumps(event.to_dict(), sort_keys=True))


def log_metrics(level: int, event: URLScrapeLog) -> None:
    _log_url_event(level, event)


def _log_summary(report: ScrapeReport) -> None:
    logger.info("syncdb_scrape_summary %s", json.dumps(report.to_dict(), sort_keys=True))


async def _check_playwright() -> bool:
    global PLAYWRIGHT_AVAILABLE

    if sys.platform == "win32":
        loop = asyncio.get_running_loop()
        if loop.__class__.__name__ != "ProactorEventLoop":
            logger.warning(
                "Playwright unavailable - subprocess spawning blocked or unsupported by current Windows event loop. "
                "Dynamic fallback disabled for this session. "
                "Fix: uninstall Windows Store Python and install from python.org, or run with WindowsProactorEventLoopPolicy."
            )
            PLAYWRIGHT_AVAILABLE = False
            return False

    try:
        from playwright.async_api import async_playwright
    except Exception as exc:
        logger.warning("Playwright unavailable - import failed: %s. Dynamic fallback disabled.", exc)
        PLAYWRIGHT_AVAILABLE = False
        return False

    try:
        async with async_playwright() as p:
            for launch_options in _playwright_launch_candidates():
                browser = None
                try:
                    browser = await p.chromium.launch(**launch_options)
                    await browser.close()
                    PLAYWRIGHT_AVAILABLE = True
                    return True
                except Exception as launch_exc:
                    logger.warning(
                        "Playwright launch check failed | mode=%s | reason=%s",
                        _describe_playwright_launch_options(launch_options),
                        launch_exc,
                    )
                finally:
                    if browser is not None:
                        try:
                            await browser.close()
                        except Exception as close_exc:
                            logger.warning("Playwright browser close failed during check | reason=%s", close_exc)
        PLAYWRIGHT_AVAILABLE = False
        logger.warning("Playwright unavailable - all browser launch candidates failed. Dynamic fallback disabled.")
        return False
    except NotImplementedError:
        logger.warning(
            "Playwright unavailable - subprocess spawning blocked (likely Windows Store Python). "
            "Dynamic fallback disabled for this session. "
            "Fix: uninstall Windows Store Python and install from python.org"
        )
        PLAYWRIGHT_AVAILABLE = False
        return False
    except Exception as exc:
        logger.warning("Playwright unavailable - %s. Dynamic fallback disabled.", exc)
        PLAYWRIGHT_AVAILABLE = False
        return False


async def _ensure_playwright_checked() -> bool:
    global _PLAYWRIGHT_CHECKED

    if _PLAYWRIGHT_CHECKED:
        return PLAYWRIGHT_AVAILABLE
    _PLAYWRIGHT_CHECKED = True
    return await _check_playwright()


def _log_retry_event(
    url: str,
    *,
    reason: str,
    attempt: int,
    http_status: Optional[int] = None,
    method_used: str = "bs4",
    raw_content_length: int = 0,
    cleaned_length: int = 0,
    started: Optional[float] = None,
) -> None:
    _log_url_event(
        logging.INFO,
        URLScrapeLog(
            url=url,
            status="retry",
            http_status=http_status,
            method_used=method_used,
            raw_content_length=raw_content_length,
            cleaned_length=cleaned_length,
            retry_count=attempt,
            time_taken_ms=_elapsed_ms(started) if started is not None else 0,
            failure_reason=reason,
            extraction_efficiency=_extraction_efficiency(cleaned_length, raw_content_length),
        ),
    )


def _domain_from_url(url: str) -> str:
    try:
        return (urlparse(url).netloc or "").lower().removeprefix("www.")
    except Exception:
        return ""


def _is_blocked(url: str) -> bool:
    domain = _domain_from_url(url)
    return domain in PERMANENTLY_BLOCKED_DOMAINS or domain in _BLOCKED_CLASSIFICATION_DOMAINS


def _normalize_failure_reason(reason: str) -> str:
    normalized = (reason or "unknown").lower()
    if "403" in normalized:
        return "403"
    if "timeout" in normalized:
        return "timeout"
    if "empty" in normalized or "too short" in normalized:
        return "empty"
    if "429" in normalized:
        return "429"
    if normalized.startswith("http "):
        return normalized.split(":", 1)[0]
    return normalized[:60]


def _headers_for_attempt(attempt: int) -> dict[str, str]:
    user_agent = _USER_AGENTS[attempt % len(_USER_AGENTS)]
    headers = {
        "User-Agent": user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache" if attempt else "max-age=0",
        "DNT": "1",
    }
    if _SCRAPER_COOKIE:
        headers["Cookie"] = _SCRAPER_COOKIE
    return headers


def clean_text(raw_text: str) -> str:
    return _clean_extracted_text(raw_text or "")


def extract_text(html: str) -> str:
    return _extract_readable_webpage_text(html or "")


def _extraction_efficiency(cleaned_length: int, raw_content_length: int) -> float:
    if raw_content_length <= 0:
        return 0.0
    return cleaned_length / raw_content_length


def _playwright_launch_candidates() -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[tuple[str, str], ...]] = set()

    def add(options: dict[str, Any]) -> None:
        normalized = tuple(sorted((key, str(value)) for key, value in options.items()))
        if normalized not in seen:
            seen.add(normalized)
            candidates.append(options)

    base_args = [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-first-run",
    ]
    if _PLAYWRIGHT_EXECUTABLE_PATH:
        add({
            "headless": True,
            "executable_path": _PLAYWRIGHT_EXECUTABLE_PATH,
            "args": base_args,
        })

    if _PLAYWRIGHT_BROWSER_CHANNEL:
        add({
            "headless": True,
            "channel": _PLAYWRIGHT_BROWSER_CHANNEL,
            "args": base_args,
        })

    for channel in ("msedge", "chrome"):
        add({"headless": True, "channel": channel, "args": base_args})

    add({"headless": True, "args": base_args})
    return candidates


def _describe_playwright_launch_options(options: dict[str, Any]) -> str:
    if "executable_path" in options:
        return f"executable_path={options['executable_path']}"
    if "channel" in options:
        return f"channel={options['channel']}"
    return "bundled-chromium"


def _should_use_threaded_playwright() -> bool:
    if sys.platform != "win32":
        return False
    loop = asyncio.get_running_loop()
    return loop.__class__.__name__ != "ProactorEventLoop"


def _fetch_dynamic_sync(url: str, attempt: int = 0) -> _RawFetch:
    try:
        if sys.platform == "win32":
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception as exc:
        logger.warning("Failed to set Windows Proactor event loop policy for Playwright thread | reason=%s", exc)

    try:
        from playwright.sync_api import TimeoutError as PlaywrightSyncTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "Playwright is not installed; install playwright or disable dynamic scraping"
        ) from exc

    headers = _headers_for_attempt(attempt)
    extra_headers = {
        "Accept-Language": headers["Accept-Language"],
        "DNT": headers["DNT"],
    }
    if _SCRAPER_COOKIE:
        extra_headers["Cookie"] = _SCRAPER_COOKIE

    errors: list[str] = []
    with sync_playwright() as p:
        for launch_options in _playwright_launch_candidates():
            browser = None
            try:
                browser = p.chromium.launch(**launch_options)
                context = browser.new_context(
                    user_agent=headers["User-Agent"],
                    viewport={"width": 1366, "height": 900},
                    extra_http_headers=extra_headers,
                )
                page = context.new_page()
                try:
                    response = page.goto(
                        url,
                        wait_until="domcontentloaded",
                        timeout=(_REQUEST_TIMEOUT + 20) * 1000,
                    )
                    try:
                        page.wait_for_load_state("networkidle", timeout=12_000)
                    except PlaywrightSyncTimeoutError as exc:
                        logger.warning("Threaded Playwright networkidle wait timed out | url=%s | reason=%s", url, exc)
                    page.wait_for_timeout(1_000)
                    text_value = page.locator("body").inner_text(timeout=12_000)
                    html = page.content()
                    return _RawFetch(
                        text=clean_text(text_value or ""),
                        http_status=response.status if response else None,
                        raw_content_length=len(html.encode("utf-8", errors="ignore")),
                        method_used="playwright",
                    )
                finally:
                    page.close()
                    context.close()
            except Exception as exc:
                errors.append(
                    f"{_describe_playwright_launch_options(launch_options)}: {str(exc)[:220]}"
                )
            finally:
                if browser is not None:
                    browser.close()

    raise RuntimeError("Threaded Playwright dynamic fetch failed: " + " | ".join(errors))


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------


def _iter_candidate_rows(chunks: list[dict]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for chunk in chunks:
        if not isinstance(chunk, dict):
            logger.debug("Skipping non-dict chunk in _iter_candidate_rows | type=%s", type(chunk))
            continue

        content = chunk.get("content")
        if content is None:
            logger.debug("Skipping chunk with null content | chunk_id=%s", chunk.get("id"))
            continue

        if isinstance(content, dict) and "rows" in content:
            candidate_rows = content.get("rows") or []
        elif isinstance(content, dict):
            candidate_rows = [content]
        else:
            continue

        rows.extend(row for row in candidate_rows if isinstance(row, dict))
    return rows


def _detect_tabular_columns(chunks: list[dict]) -> set[str]:
    columns: set[str] = set()
    for row in _iter_candidate_rows(chunks):
        columns.update(str(key) for key in row.keys())
    return columns


def _is_pdf_url(url: str) -> bool:
    return bool(url and url.lower().split("?")[0].endswith(".pdf"))


def _extract_urls_from_xlsx_chunks(chunks: list[dict]) -> list[str]:
    seen: set[str] = set()
    urls: list[str] = []

    for row in _iter_candidate_rows(chunks):
        try:
            row_lower = {str(k).lower(): v for k, v in row.items()}
        except Exception as exc:
            logger.debug("Skipping row, failed to lower-case keys | reason=%s", exc)
            continue

        url = str(row_lower.get(_URL_COLUMN.lower()) or "").strip()
        valid = str(row_lower.get(_VALID_COLUMN.lower()) or "").strip().lower()
        if not url or valid != _VALID_VALUE or url in seen:
            continue

        seen.add(url)
        urls.append(url)

    return urls


def _needs_dynamic_fallback(url: str, text: str, reason: Optional[str] = None) -> bool:
    if _is_pdf_url(url):
        return False
    cleaned_length = len(clean_text(text))
    raw_content_length = len((text or "").encode("utf-8", errors="ignore"))
    return _needs_dynamic_fallback_for_lengths(url, raw_content_length, cleaned_length, reason)


def _needs_dynamic_fallback_for_lengths(
    url: str,
    raw_content_length: int,
    cleaned_length: int,
    reason: Optional[str] = None,
) -> bool:
    if _is_pdf_url(url):
        return False
    if _is_known_dynamic_domain(url):
        return True
    if reason and "empty" in reason.lower():
        return True
    if cleaned_length < _DYNAMIC_FALLBACK_CHARS:
        return True
    return (
        raw_content_length > _DYNAMIC_RAW_BYTES_THRESHOLD
        and _extraction_efficiency(cleaned_length, raw_content_length) < _DYNAMIC_MIN_EXTRACTION_EFFICIENCY
    )


def _is_known_dynamic_domain(url: str) -> bool:
    domain = _domain_from_url(url)
    return any(domain == hint or domain.endswith("." + hint) for hint in _DYNAMIC_DOMAIN_HINTS)


def classify_url(url: str) -> str:
    domain = _domain_from_url(url)
    if not url or not url.strip():
        return "blocked"
    if _is_blocked(url):
        return "blocked"
    if _is_pdf_url(url) or domain in _STATIC_CLASSIFICATION_DOMAINS:
        return "static"
    if _is_known_dynamic_domain(url):
        return "dynamic"
    return "static"


def _is_low_value_url(url: str) -> bool:
    """Return True for search pages, listing pages, and paginated index pages."""
    if not url:
        return False
    return bool(_LOW_VALUE_URL_RE.search(url))


# ---------------------------------------------------------------------------
# Failed URL persistence — FailedURLStore
# ---------------------------------------------------------------------------


def _append_to_file(path: str, content: str) -> None:
    """Synchronous, append-only file write. Called via asyncio.to_thread."""
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(content)


class FailedURLStore:
    """
    Async-safe, append-only JSONL store for failed URLs.

    Design decisions:
    - **Deduplication**: tracks seen URLs within a single scrape run via a set.
      Cross-run deduplication is left to the reader (use read_failed_urls_jsonl).
    - **Non-blocking**: pending records are buffered in memory; flushed to disk
      via asyncio.to_thread so the event loop is never blocked on I/O.
    - **Append-only**: each flush appends a batch of JSONL lines. File is never
      truncated or rewritten — crash-safe at the line boundary.
    - **Resilient flush**: if a flush fails the records are re-queued at the
      front of the buffer so no failures are silently dropped.
    - **No path**: if jsonl_path is empty the store is a no-op for I/O but still
      tracks failures in memory (accessible via .records).
    """

    def __init__(self, jsonl_path: Optional[str] = None) -> None:
        self._path = jsonl_path or ""
        self._seen: set[str] = set()
        self._pending: list[str] = []      # buffered JSONL lines not yet flushed
        self._lock = asyncio.Lock()

    async def record(
        self,
        url: str,
        reason: str,
        *,
        http_status: Optional[int] = None,
    ) -> Optional[FailedURL]:
        """
        Record a failure. Returns the FailedURL created, or None if this URL
        was already recorded in this run (duplicate suppressed).
        """
        async with self._lock:
            if url in self._seen:
                return None
            self._seen.add(url)
            category, retryable = _categorize_failure(reason, http_status)
            fu = FailedURL(
                url=url,
                reason=reason,
                domain=_domain_from_url(url),
                category=category,
                retryable=retryable,
            )
            if self._path:
                self._pending.append(
                    json.dumps(fu.to_jsonl_dict(), ensure_ascii=False)
                )
            return fu

    async def flush(self) -> int:
        """
        Write all pending JSONL lines to disk. Returns the number of lines
        written. Safe to call multiple times — re-queues on write failure.
        """
        async with self._lock:
            if not self._path or not self._pending:
                return 0
            lines, self._pending = list(self._pending), []

        content = "\n".join(lines) + "\n"
        try:
            await asyncio.to_thread(_append_to_file, self._path, content)
            logger.info(
                "FailedURLStore flushed | count=%d | path=%s", len(lines), self._path
            )
            return len(lines)
        except Exception as exc:
            logger.warning(
                "FailedURLStore flush failed — re-queuing | path=%s | reason=%s",
                self._path,
                exc,
            )
            async with self._lock:
                self._pending = lines + self._pending  # re-queue at front
            return 0

    @property
    def seen_count(self) -> int:
        return len(self._seen)

    @property
    def pending_count(self) -> int:
        return len(self._pending)


async def _record_scrape_url_failure(
    db: AsyncSession,
    *,
    source_document_id: Optional[str],
    exploration_id: Optional[str],
    url: str,
    reason: str,
    http_status: Optional[int],
    method_used: str,
    content_chars: int,
) -> None:
    category, retryable = _categorize_failure(reason, http_status)
    source_document_key = source_document_id or ""
    row = await db.execute(
        text("""
            UPDATE sync_source.scrape_url
            SET
                exploration_id = COALESCE(:exploration_id, sync_source.scrape_url.exploration_id),
                domain = :domain,
                status = 'failed',
                failure_reason = :failure_reason,
                failure_category = :failure_category,
                retryable = :retryable,
                retry_count = sync_source.scrape_url.retry_count + 1,
                http_status = :http_status,
                method_used = :method_used,
                content_chars = :content_chars,
                last_attempt_at = now(),
                next_retry_at = CASE
                    WHEN :retryable THEN
                        now() + (
                            LEAST(
                                86400,
                                (300 * power(2, LEAST(sync_source.scrape_url.retry_count + 1, 8)))::integer
                            ) * interval '1 second'
                        )
                    ELSE NULL
                END,
                updated_at = now()
            WHERE source_document_key = :source_document_key
              AND url = :url
            RETURNING id
        """),
        {
            "source_document_id": source_document_id,
            "source_document_key": source_document_key,
            "exploration_id": exploration_id,
            "url": url,
            "domain": _domain_from_url(url),
            "failure_reason": reason,
            "failure_category": category,
            "retryable": retryable,
            "http_status": http_status,
            "method_used": method_used,
            "content_chars": max(content_chars or 0, 0),
        },
    )
    scrape_url_id = row.scalar_one_or_none()
    if scrape_url_id is None:
        row = await db.execute(
            text("""
                INSERT INTO sync_source.scrape_url (
                    id, source_document_id, source_document_key, exploration_id,
                    url, domain, status, failure_reason, failure_category,
                    retryable, retry_count, http_status, method_used,
                    content_chars, last_attempt_at, next_retry_at, updated_at
                )
                VALUES (
                    :id, :source_document_id, :source_document_key, :exploration_id,
                    :url, :domain, 'failed', :failure_reason, :failure_category,
                    :retryable, 1, :http_status, :method_used, :content_chars,
                    now(),
                    CASE
                        WHEN :retryable THEN now() + (300 * interval '1 second')
                        ELSE NULL
                    END,
                    now()
                )
                RETURNING id
            """),
            {
                "id": generate_id(),
                "source_document_id": source_document_id,
                "source_document_key": source_document_key,
                "exploration_id": exploration_id,
                "url": url,
                "domain": _domain_from_url(url),
                "failure_reason": reason,
                "failure_category": category,
                "retryable": retryable,
                "http_status": http_status,
                "method_used": method_used,
                "content_chars": max(content_chars or 0, 0),
            },
        )
        scrape_url_id = row.scalar_one()
    await db.execute(
        text("""
            INSERT INTO sync_source.scrape_url_attempt (
                id, scrape_url_id, attempt_no, status, method_used, http_status,
                failure_reason, failure_category, retryable, content_chars, metadata
            )
            SELECT
                :id,
                CAST(:scrape_url_id AS VARCHAR),
                COALESCE(MAX(attempt_no), 0) + 1,
                'failed',
                :method_used,
                :http_status,
                :failure_reason,
                :failure_category,
                :retryable,
                :content_chars,
                '{}'::jsonb
            FROM sync_source.scrape_url_attempt
            WHERE scrape_url_id = CAST(:scrape_url_id AS VARCHAR)
        """),
        {
            "id": generate_id(),
            "scrape_url_id": scrape_url_id,
            "method_used": method_used,
            "http_status": http_status,
            "failure_reason": reason,
            "failure_category": category,
            "retryable": retryable,
            "content_chars": max(content_chars or 0, 0),
        },
    )


async def _record_scrape_url_success(
    db: AsyncSession,
    *,
    source_document_id: Optional[str],
    exploration_id: Optional[str],
    url: str,
    http_status: Optional[int],
    method_used: str,
    content_chars: int,
) -> None:
    source_document_key = source_document_id or ""
    row = await db.execute(
        text("""
            UPDATE sync_source.scrape_url
            SET
                exploration_id = COALESCE(:exploration_id, sync_source.scrape_url.exploration_id),
                domain = :domain,
                status = 'success',
                failure_reason = NULL,
                failure_category = NULL,
                retryable = FALSE,
                http_status = :http_status,
                method_used = :method_used,
                content_chars = :content_chars,
                last_attempt_at = now(),
                next_retry_at = NULL,
                scraped_at = now(),
                updated_at = now()
            WHERE source_document_key = :source_document_key
              AND url = :url
            RETURNING id
        """),
        {
            "source_document_id": source_document_id,
            "source_document_key": source_document_key,
            "exploration_id": exploration_id,
            "url": url,
            "domain": _domain_from_url(url),
            "http_status": http_status,
            "method_used": method_used,
            "content_chars": max(content_chars or 0, 0),
        },
    )
    scrape_url_id = row.scalar_one_or_none()
    if scrape_url_id is None:
        row = await db.execute(
            text("""
                INSERT INTO sync_source.scrape_url (
                    id, source_document_id, source_document_key, exploration_id,
                    url, domain, status, failure_reason, failure_category,
                    retryable, http_status, method_used, content_chars,
                    last_attempt_at, next_retry_at, scraped_at, updated_at
                )
                VALUES (
                    :id, :source_document_id, :source_document_key, :exploration_id,
                    :url, :domain, 'success', NULL, NULL, FALSE, :http_status,
                    :method_used, :content_chars, now(), NULL, now(), now()
                )
                RETURNING id
            """),
            {
                "id": generate_id(),
                "source_document_id": source_document_id,
                "source_document_key": source_document_key,
                "exploration_id": exploration_id,
                "url": url,
                "domain": _domain_from_url(url),
                "http_status": http_status,
                "method_used": method_used,
                "content_chars": max(content_chars or 0, 0),
            },
        )
        scrape_url_id = row.scalar_one()
    await db.execute(
        text("""
            INSERT INTO sync_source.scrape_url_attempt (
                id, scrape_url_id, attempt_no, status, method_used, http_status,
                retryable, content_chars, metadata
            )
            SELECT
                :id,
                CAST(:scrape_url_id AS VARCHAR),
                COALESCE(MAX(attempt_no), 0) + 1,
                'success',
                :method_used,
                :http_status,
                FALSE,
                :content_chars,
                '{}'::jsonb
            FROM sync_source.scrape_url_attempt
            WHERE scrape_url_id = CAST(:scrape_url_id AS VARCHAR)
        """),
        {
            "id": generate_id(),
            "scrape_url_id": scrape_url_id,
            "method_used": method_used,
            "http_status": http_status,
            "content_chars": max(content_chars or 0, 0),
        },
    )


# ---------------------------------------------------------------------------
# Retry helpers (usable independently of a live scrape run)
# ---------------------------------------------------------------------------


def read_failed_urls_jsonl(path: str) -> list[dict[str, Any]]:
    """
    Read a JSONL file produced by FailedURLStore. Skips malformed lines.
    Returns a list of dicts — one per recorded failure.
    """
    records: list[dict[str, Any]] = []
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    logger.debug("Skipping malformed JSONL line | path=%s", path)
    except FileNotFoundError:
        logger.warning("Failed URLs JSONL not found | path=%s", path)
    return records


def filter_retryable_urls(records: list[dict[str, Any]]) -> list[str]:
    """Return de-duplicated list of retryable URLs from JSONL records."""
    seen: set[str] = set()
    urls: list[str] = []
    for r in records:
        url = r.get("url", "")
        if url and r.get("retryable") is True and url not in seen:
            seen.add(url)
            urls.append(url)
    return urls


def generate_retry_list(jsonl_path: str, output_path: str) -> int:
    """
    Read a JSONL file, filter retryable URLs, write them one-per-line to
    output_path. Returns the number of URLs written.

    Example usage:
        count = generate_retry_list("/var/log/failed.jsonl", "/tmp/retry.txt")
        print(f"Retry {count} URLs")
    """
    records = read_failed_urls_jsonl(jsonl_path)
    urls = filter_retryable_urls(records)
    if not urls:
        logger.info("generate_retry_list: no retryable URLs found | src=%s", jsonl_path)
        return 0
    with open(output_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(urls) + "\n")
    logger.info(
        "Retry list written | count=%d | src=%s | dst=%s", len(urls), jsonl_path, output_path
    )
    return len(urls)


# ---------------------------------------------------------------------------
# Fetch layer
# ---------------------------------------------------------------------------


async def _fetch_pdf(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict[str, str],
    timeout: float,
) -> _RawFetch:
    response = await client.get(url, follow_redirects=True, headers=headers, timeout=timeout)
    response.raise_for_status()
    if len(response.content) > _MAX_CONTENT_BYTES:
        raise ValueError(f"PDF too large ({len(response.content)} bytes)")

    try:
        from pypdf import PdfReader
    except ImportError:
        import PyPDF2 as pypdf_fallback  # type: ignore[import]

        reader = pypdf_fallback.PdfReader(io.BytesIO(response.content))
        text_value = "\n".join(p.extract_text() or "" for p in reader.pages)
    else:
        reader = PdfReader(io.BytesIO(response.content))
        text_value = "\n".join(page.extract_text() or "" for page in reader.pages)

    return _RawFetch(
        text=text_value,
        http_status=response.status_code,
        raw_content_length=len(response.content),
        method_used="bs4",
    )


async def _fetch_webpage_fast(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict[str, str],
    timeout: float,
) -> _RawFetch:
    response = await client.get(url, follow_redirects=True, headers=headers, timeout=timeout)
    response.raise_for_status()
    if len(response.content) > _MAX_CONTENT_BYTES:
        raise ValueError(f"Page too large ({len(response.content)} bytes)")

    html = response.text or ""
    return _RawFetch(
        text=extract_text(html),
        http_status=response.status_code,
        raw_content_length=len(response.content),
        method_used="bs4",
        raw_html=html,
    )


async def _fetch_content_fast(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict[str, str],
    timeout: float,
) -> _RawFetch:
    if not url or not url.strip():
        raise ValueError("URL is empty or None")
    if _is_pdf_url(url):
        return await _fetch_pdf(client, url, headers=headers, timeout=timeout)
    return await _fetch_webpage_fast(client, url, headers=headers, timeout=timeout)


async def fetch_static(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict[str, str],
    timeout: float,
) -> _RawFetch:
    return await _fetch_content_fast(client, url, headers=headers, timeout=timeout)


async def fetch_dynamic(dynamic_scraper: _DynamicScraper, url: str, *, attempt: int = 0) -> _RawFetch:
    return await dynamic_scraper.fetch_dynamic(url, attempt=attempt)


async def _safe_fetch_dynamic(
    dynamic_scraper: _DynamicScraper,
    url: str,
    *,
    attempt: int = 0,
) -> Optional[_RawFetch]:
    if not PLAYWRIGHT_AVAILABLE:
        logger.warning("Dynamic fallback skipped - Playwright unavailable | url=%s", url)
        return None

    try:
        return await asyncio.wait_for(
            fetch_dynamic(dynamic_scraper, url, attempt=attempt),
            timeout=TIMEOUT_SECONDS["playwright"],
        )
    except NotImplementedError as exc:
        logger.warning("Playwright blocked by platform sandbox | url=%s | reason=%s", url, exc)
        return None
    except asyncio.TimeoutError as exc:
        logger.warning("Playwright timed out | url=%s | reason=%s", url, exc)
        return None
    except Exception as exc:
        logger.error("Playwright error | url=%s | reason=%s", url, exc)
        return None


async def _scrape_url_pipeline(
    client: httpx.AsyncClient,
    url: str,
    rate_limiter: _DomainRateLimiter,
    dynamic_scraper: _DynamicScraper,
) -> _FetchResult:
    started = time.perf_counter()
    last_error = "Unknown error"
    last_error_type: Optional[str] = None
    last_status: Optional[int] = None
    last_raw_length = 0
    last_cleaned_length = 0
    method_used = "bs4"

    if not url or not url.strip():
        return _FetchResult(
            url=url or "",
            error="URL is empty or None",
            is_permanent=True,
            status="failed_permanent",
            time_taken_ms=_elapsed_ms(started),
        )
    if _is_blocked(url):
        logger.info(
            "syncdb_scrape_url skipped - domain blocklisted | url=%s | status=skipped | failure_reason=domain_blocklisted | chunks_created=0",
            url,
        )
        return _FetchResult(
            url=url,
            error="domain_blocklisted",
            is_permanent=True,
            status="skipped",
            time_taken_ms=_elapsed_ms(started),
        )
    if _SKIP_LOW_VALUE_URLS and _is_low_value_url(url):
        logger.info(
            "syncdb_scrape_url skipped - low value URL | url=%s | status=skipped_low_value",
            url,
        )
        return _FetchResult(
            url=url,
            error="low_value_url",
            is_permanent=True,
            status="skipped_low_value",
            time_taken_ms=_elapsed_ms(started),
        )

    dynamic_used = False
    dynamic_success = False
    attempt = 0
    retry_count = 0
    while True:
        max_retries_for_error = RETRY_LIMITS.get(last_error_type or "default", RETRY_LIMITS["default"])
        if retry_count > max_retries_for_error:
            break

        try:
            await rate_limiter.wait(url)
            use_dynamic_first = classify_url(url) == "dynamic" and _ENABLE_DYNAMIC_SCRAPING
            timeout_seconds = (
                TIMEOUT_SECONDS["after_timeout"]
                if last_error_type == "ReadTimeout"
                else TIMEOUT_SECONDS["first_attempt"]
            )
            raw = await (
                _safe_fetch_dynamic(dynamic_scraper, url, attempt=attempt)
                if use_dynamic_first
                else fetch_static(
                    client,
                    url,
                    headers=_headers_for_attempt(attempt),
                    timeout=timeout_seconds,
                )
            )
            if raw is None:
                last_error = "Dynamic fallback skipped or failed"
                last_error_type = "DynamicUnavailable"
                if retry_count >= max_retries_for_error:
                    break
                retry_count += 1
                attempt += 1
                _log_retry_event(
                    url,
                    reason=last_error,
                    attempt=retry_count,
                    http_status=last_status,
                    method_used=method_used,
                    raw_content_length=last_raw_length,
                    cleaned_length=last_cleaned_length,
                    started=started,
                )
                await _backoff(retry_count)
                continue

            text_value = raw.text or ""
            cleaned_length = len(clean_text(text_value))
            last_status = raw.http_status
            last_raw_length = raw.raw_content_length
            last_cleaned_length = cleaned_length
            method_used = raw.method_used

            if last_status in NO_RETRY_HTTP_STATUSES:
                last_error = f"HTTP {last_status} - non-retryable"
                logger.warning(
                    "syncdb_scrape_url permanent failure - no retry | url=%s | http_status=%s | status=failed_permanent | failure_reason=%s",
                    url,
                    last_status,
                    last_error,
                )
                return _FetchResult(
                    url=url,
                    error=last_error,
                    is_permanent=True,
                    http_status=last_status,
                    method_used=method_used,
                    raw_content_length=last_raw_length,
                    cleaned_length=last_cleaned_length,
                    retry_count=retry_count,
                    time_taken_ms=_elapsed_ms(started),
                    status="failed_permanent",
                )

            if (
                method_used != "playwright"
                and _needs_dynamic_fallback_for_lengths(
                    url,
                    raw.raw_content_length,
                    cleaned_length,
                    "Empty content after extraction" if cleaned_length == 0 else None,
                )
            ):
                if _ENABLE_DYNAMIC_SCRAPING:
                    dynamic_used = True
                    dyn_raw = await _safe_fetch_dynamic(dynamic_scraper, url, attempt=attempt)
                    if dyn_raw is not None:
                        dyn_text = dyn_raw.text or ""
                        dyn_cleaned = len(clean_text(dyn_text))
                        if dyn_cleaned > cleaned_length:
                            raw = dyn_raw
                            text_value = dyn_text
                            cleaned_length = dyn_cleaned
                            dynamic_success = True
                        last_status = dyn_raw.http_status or last_status
                        last_raw_length = max(last_raw_length, dyn_raw.raw_content_length)
                        last_cleaned_length = cleaned_length
                        method_used = raw.method_used
                        if last_status in NO_RETRY_HTTP_STATUSES:
                            last_error = f"HTTP {last_status} - non-retryable"
                            logger.warning(
                                "syncdb_scrape_url permanent failure - no retry | url=%s | http_status=%s | status=failed_permanent | failure_reason=%s",
                                url,
                                last_status,
                                last_error,
                            )
                            return _FetchResult(
                                url=url,
                                error=last_error,
                                is_permanent=True,
                                http_status=last_status,
                                method_used=method_used,
                                raw_content_length=last_raw_length,
                                cleaned_length=last_cleaned_length,
                                retry_count=retry_count,
                                time_taken_ms=_elapsed_ms(started),
                                dynamic_used=dynamic_used,
                                dynamic_success=dynamic_success,
                                status="failed_permanent",
                            )
                    else:
                        last_error = "Dynamic fallback skipped or failed"
                        logger.debug(
                            "syncdb_scrape_url dynamic_used=true dynamic_success=false | url=%s",
                            url,
                        )
                else:
                    last_error = "Empty content after extraction; dynamic scraping disabled"

            # Relaxed extraction fallback: if BS4 strict cleaning yielded too little,
            # try body.get_text() with minimal normalization on the stored raw HTML.
            if (
                cleaned_length < _DYNAMIC_FALLBACK_CHARS
                and not dynamic_success
                and getattr(raw, "raw_html", None)
            ):
                relaxed_text = _extract_readable_webpage_text_relaxed(raw.raw_html)
                relaxed_len = len(relaxed_text)
                if relaxed_len > cleaned_length:
                    logger.debug(
                        "Relaxed extraction improved content | url=%s | before=%d | after=%d",
                        url, cleaned_length, relaxed_len,
                    )
                    text_value = relaxed_text
                    cleaned_length = relaxed_len
                    last_cleaned_length = relaxed_len

            if cleaned_length < _MIN_CLEANED_CHARS:
                # Content too short after all fallbacks — no retry; network retries
                # would return the same page. Record as permanent content failure.
                last_error = f"Cleaned content too short ({cleaned_length} chars)"
                logger.warning(
                    "syncdb_scrape_url content_too_short | url=%s | cleaned=%d | "
                    "dynamic_used=%s | dynamic_success=%s | raw=%d",
                    url, cleaned_length, dynamic_used, dynamic_success, last_raw_length,
                )
                return _FetchResult(
                    url=url,
                    error=last_error,
                    is_permanent=True,
                    http_status=last_status,
                    method_used=method_used,
                    raw_content_length=last_raw_length,
                    cleaned_length=cleaned_length,
                    retry_count=retry_count,
                    time_taken_ms=_elapsed_ms(started),
                    dynamic_used=dynamic_used,
                    dynamic_success=dynamic_success,
                    status="failed",
                )

            quality_score, quality_label = _score_content_quality(text_value)
            return _FetchResult(
                url=url,
                text=text_value,
                http_status=last_status,
                method_used=method_used,
                raw_content_length=last_raw_length,
                cleaned_length=cleaned_length,
                retry_count=retry_count,
                time_taken_ms=_elapsed_ms(started),
                dynamic_used=dynamic_used,
                dynamic_success=dynamic_success,
                content_quality_score=quality_score,
                quality_label=quality_label,
                status="success",
            )

        except httpx.HTTPStatusError as exc:
            code = exc.response.status_code
            last_status = code
            last_error = f"HTTP {code}"
            last_error_type = f"HTTP{code}"
            if code in NO_RETRY_HTTP_STATUSES:
                logger.warning(
                    "syncdb_scrape_url permanent failure - no retry | url=%s | http_status=%s | status=failed_permanent | failure_reason=HTTP %s - non-retryable",
                    url,
                    code,
                    code,
                )
                return _FetchResult(
                    url=url,
                    error=f"HTTP {code} - non-retryable",
                    is_permanent=True,
                    http_status=code,
                    method_used=method_used,
                    raw_content_length=last_raw_length,
                    cleaned_length=last_cleaned_length,
                    retry_count=retry_count,
                    time_taken_ms=_elapsed_ms(started),
                    status="failed_permanent",
                )

            if retry_count < max_retries_for_error:
                retry_count += 1
                _log_retry_event(
                    url,
                    reason=last_error,
                    attempt=retry_count,
                    http_status=code,
                    method_used=method_used,
                    started=started,
                )
                if code == 429:
                    await asyncio.sleep(min(_RATE_LIMIT_WAIT * retry_count, 30))
                else:
                    await _backoff(retry_count)
                attempt += 1
                continue
            else:
                break

        except httpx.ReadTimeout as exc:
            last_error_type = "ReadTimeout"
            last_error = "ReadTimeout"
            logger.warning("Scrape read timeout | url=%s | attempt=%d | reason=%s", url, retry_count + 1, exc)
            max_retries_for_error = RETRY_LIMITS["ReadTimeout"]
            if retry_count < max_retries_for_error:
                retry_count += 1
                _log_retry_event(
                    url,
                    reason=last_error,
                    attempt=retry_count,
                    http_status=last_status,
                    method_used=method_used,
                    started=started,
                )
                await _backoff(retry_count)
                attempt += 1
                continue
            else:
                break

        except httpx.ConnectError as exc:
            last_error_type = "ConnectError"
            last_error = "ConnectError"
            logger.warning("Scrape connection error | url=%s | attempt=%d | reason=%s", url, retry_count + 1, exc)
            max_retries_for_error = RETRY_LIMITS["ConnectError"]
            if retry_count < max_retries_for_error:
                retry_count += 1
                _log_retry_event(
                    url,
                    reason=last_error,
                    attempt=retry_count,
                    http_status=last_status,
                    method_used=method_used,
                    started=started,
                )
                await _backoff(retry_count)
                attempt += 1
                continue
            else:
                break

        except _TRANSIENT as exc:  # type: ignore[misc]
            last_error_type = type(exc).__name__
            last_error = last_error_type
            logger.warning("Transient scrape error | url=%s | attempt=%d | reason=%s", url, retry_count + 1, exc)
            max_retries_for_error = RETRY_LIMITS.get(last_error_type, RETRY_LIMITS["default"])
            if retry_count < max_retries_for_error:
                retry_count += 1
                _log_retry_event(
                    url,
                    reason=last_error,
                    attempt=retry_count,
                    http_status=last_status,
                    method_used=method_used,
                    started=started,
                )
                await _backoff(retry_count)
                attempt += 1
                continue
            break

        except Exception as exc:
            last_error = str(exc)[:200] or type(exc).__name__
            last_error_type = type(exc).__name__
            logger.warning("Unexpected scrape error | url=%s | attempt=%d | reason=%s", url, retry_count + 1, exc)
            break

    return _FetchResult(
        url=url,
        error=last_error,
        http_status=last_status,
        method_used=method_used,
        raw_content_length=last_raw_length,
        cleaned_length=last_cleaned_length,
        retry_count=retry_count,
        time_taken_ms=_elapsed_ms(started),
        is_permanent=last_status in NO_RETRY_HTTP_STATUSES,
        dynamic_used=dynamic_used,
        dynamic_success=dynamic_success,
        status="failed_permanent" if last_status in NO_RETRY_HTTP_STATUSES else "failed",
    )


def _backoff_seconds(attempt: int) -> float:
    jitter = random.uniform(0, 0.4)
    return (_RETRY_DELAY * (2**attempt)) + jitter


async def _backoff(attempt: int, base: float = 2.0) -> None:
    wait = min(base**attempt, 30)
    await asyncio.sleep(wait)


def _elapsed_ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


async def _scrape_batch(
    client: httpx.AsyncClient,
    urls: list[str],
    *,
    max_concurrent: int,
    dynamic_scraper: _DynamicScraper,
    rate_limiter: _DomainRateLimiter,
) -> list[_FetchResult]:
    queue: asyncio.Queue[str] = asyncio.Queue()
    results: list[_FetchResult] = []
    result_lock = asyncio.Lock()

    for url in urls:
        queue.put_nowait(url)

    async def worker() -> None:
        while True:
            try:
                url = queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            try:
                result = await _scrape_url_pipeline(client, url, rate_limiter, dynamic_scraper)
                async with result_lock:
                    results.append(result)
            finally:
                queue.task_done()

    worker_count = min(max(max_concurrent, 1), len(urls))
    workers = [asyncio.create_task(worker()) for _ in range(worker_count)]
    await queue.join()
    await asyncio.gather(*workers, return_exceptions=True)
    results_by_url = {result.url: result for result in results}
    return [results_by_url.get(url, _FetchResult(url=url, error="Worker did not return result")) for url in urls]


# ---------------------------------------------------------------------------
# Data pipeline and DB helpers
# ---------------------------------------------------------------------------


async def _register_url_document(
    db: AsyncSession,
    url: str,
    domain: Optional[str],
    exploration_id: Optional[str],
    user_id: str,
) -> str:
    doc_id = generate_id()
    await db.execute(
        text("""
            INSERT INTO sync_source.document
                (id, title, source_type, source_url,
                 file_data, file_name,
                 domain, exploration_id, uploaded_by, is_processed)
            VALUES
                (:id, :title, 'url', :url,
                 NULL, NULL,
                 :domain, :exploration_id, :uploaded_by, FALSE)
        """),
        {
            "id": doc_id,
            "title": url,
            "url": url,
            "domain": domain,
            "exploration_id": exploration_id,
            "uploaded_by": user_id,
        },
    )
    return doc_id


async def _save_scraped_chunks(
    db: AsyncSession,
    document_id: str,
    raw_text: str,
) -> tuple[int, Any]:
    return await _save_text_chunks(
        db,
        document_id,
        raw_text,
        data_type=DATA_TYPE_SCRAPED,
        max_content_length=_MAX_SCRAPED_CONTENT_LENGTH,
        soft_max_chunks=_SOFT_MAX_SCRAPED_CHUNKS,
    )


async def save_chunks(db: AsyncSession, document_id: str, raw_text: str) -> tuple[int, Any]:
    return await _save_scraped_chunks(db, document_id, raw_text)


async def _save_successful_result(
    db: AsyncSession,
    result: _FetchResult,
    *,
    domain: Optional[str],
    exploration_id: Optional[str],
    user_id: str,
) -> tuple[int, Any]:
    if not result.text or not result.text.strip():
        raise ValueError("Empty text after fetch")

    cleaned_length = len(clean_text(result.text))
    if cleaned_length < _MIN_CLEANED_CHARS:
        raise ValueError(f"Cleaned content too short ({cleaned_length} chars)")

    doc_id = await _register_url_document(
        db,
        url=result.url,
        domain=domain,
        exploration_id=exploration_id,
        user_id=user_id,
    )
    chunks_created, chunk_plan = await save_chunks(db, doc_id, result.text)
    if chunks_created == 0:
        raise ValueError("No chunks created")

    await db.execute(
        text("UPDATE sync_source.document SET is_processed = TRUE WHERE id = :id"),
        {"id": doc_id},
    )
    await db.commit()
    return chunks_created, chunk_plan


# ---------------------------------------------------------------------------
# Main public functions
# ---------------------------------------------------------------------------


async def scrape_and_save_source_links(
    db: AsyncSession,
    xlsx_chunks: list[dict],
    domain: Optional[str],
    exploration_id: Optional[str],
    user_id: str,
    source_document_id: Optional[str] = None,
    max_concurrent: int = _MAX_CONCURRENT,
) -> ScrapeReport:
    if not xlsx_chunks:
        logger.info("No chunks provided to scrape_and_save_source_links.")
        return ScrapeReport(total_attempted=0)

    urls = _extract_urls_from_xlsx_chunks(xlsx_chunks)
    report = ScrapeReport(total_attempted=len(urls))
    if not urls:
        logger.info("No valid Source Link URLs found in chunks.")
        return report

    max_concurrent = min(max(max_concurrent, 1), _MAX_CONCURRENT)
    total_batches = (len(urls) + _FETCH_BATCH - 1) // _FETCH_BATCH
    logger.info(
        "Scrape started | total_urls=%d | concurrency=%d | dynamic_concurrency=%d | "
        "batches=%d | dynamic_enabled=%s | domain=%s",
        len(urls),
        max_concurrent,
        _MAX_DYNAMIC_CONCURRENT,
        total_batches,
        _ENABLE_DYNAMIC_SCRAPING,
        domain,
    )

    logs: list[URLScrapeLog] = []
    store = FailedURLStore(_FAILED_URLS_JSONL_PATH)
    rate_limiter = _DomainRateLimiter(_DOMAIN_RATE_LIMIT_SECONDS)
    if _ENABLE_DYNAMIC_SCRAPING:
        await _ensure_playwright_checked()

    timeout = httpx.Timeout(_REQUEST_TIMEOUT)
    async with _DynamicScraper(_MAX_DYNAMIC_CONCURRENT) as dynamic_scraper, httpx.AsyncClient(
            headers=_headers_for_attempt(0),
            verify=False,
            timeout=timeout,
            limits=httpx.Limits(
                max_connections=max_concurrent + _MAX_DYNAMIC_CONCURRENT + 5,
                max_keepalive_connections=max_concurrent,
            ),
        ) as client:
        for batch_start in range(0, len(urls), _FETCH_BATCH):
            batch_urls = urls[batch_start : batch_start + _FETCH_BATCH]
            batch_num = batch_start // _FETCH_BATCH + 1
            logger.info("Batch %d/%d fetching | urls=%d", batch_num, total_batches, len(batch_urls))

            fetch_results = await _scrape_batch(
                client,
                batch_urls,
                max_concurrent=max_concurrent,
                dynamic_scraper=dynamic_scraper,
                rate_limiter=rate_limiter,
            )

            batch_ok = 0
            batch_fail = 0
            batch_skipped = 0
            batch_low_quality = 0
            batch_dynamic_used = 0
            for result in fetch_results:
                event = URLScrapeLog(
                    url=result.url,
                    status=result.status if result.text is None else "success",
                    http_status=result.http_status,
                    method_used=result.method_used,
                    raw_content_length=result.raw_content_length,
                    cleaned_length=result.cleaned_length,
                    retry_count=result.retry_count,
                    time_taken_ms=result.time_taken_ms,
                    total_time_ms=result.time_taken_ms,
                    failure_reason=result.error,
                    extraction_efficiency=_extraction_efficiency(
                        result.cleaned_length,
                        result.raw_content_length,
                    ),
                    content_quality_score=result.content_quality_score,
                    quality_label=result.quality_label,
                    dynamic_used=result.dynamic_used,
                    dynamic_success=result.dynamic_success,
                )
                if result.dynamic_used:
                    batch_dynamic_used += 1

                if result.text is None:
                    if result.status in ("skipped", "skipped_low_value"):
                        if result.status == "skipped_low_value":
                            report.add_skipped_low_value()
                        else:
                            report.add_skipped_blocklisted()
                        batch_skipped += 1
                    elif result.status == "failed_permanent":
                        report.add_permanent_failure(
                            result.url,
                            result.error or "Permanent failure",
                            http_status=result.http_status,
                        )
                        await _record_scrape_url_failure(
                            db,
                            source_document_id=source_document_id,
                            exploration_id=exploration_id,
                            url=result.url,
                            reason=result.error or "Permanent failure",
                            http_status=result.http_status,
                            method_used=result.method_used,
                            content_chars=result.cleaned_length,
                        )
                        await store.record(
                            result.url,
                            result.error or "Permanent failure",
                            http_status=result.http_status,
                        )
                        batch_fail += 1
                    else:
                        report.add_failure(
                            result.url,
                            result.error or "Unknown error",
                            http_status=result.http_status,
                        )
                        await _record_scrape_url_failure(
                            db,
                            source_document_id=source_document_id,
                            exploration_id=exploration_id,
                            url=result.url,
                            reason=result.error or "Unknown error",
                            http_status=result.http_status,
                            method_used=result.method_used,
                            content_chars=result.cleaned_length,
                        )
                        await store.record(
                            result.url,
                            result.error or "Unknown error",
                            http_status=result.http_status,
                        )
                        batch_fail += 1
                    logs.append(event)
                    log_metrics(logging.INFO if "skipped" in (result.status or "") else logging.WARNING, event)
                    continue

                try:
                    chunks_created, chunk_plan = await _save_successful_result(
                        db,
                        result,
                        domain=domain,
                        exploration_id=exploration_id,
                        user_id=user_id,
                    )
                    event.status = "success"
                    event.cleaned_length = chunk_plan.cleaned_length
                    event.final_saved_length = chunk_plan.prepared_length
                    event.chunks_created = chunks_created
                    event.failure_reason = None
                    event.extraction_efficiency = _extraction_efficiency(
                        event.cleaned_length,
                        event.raw_content_length,
                    )
                    await _record_scrape_url_success(
                        db,
                        source_document_id=source_document_id,
                        exploration_id=exploration_id,
                        url=result.url,
                        http_status=result.http_status,
                        method_used=result.method_used,
                        content_chars=event.cleaned_length,
                    )
                    await db.commit()
                    if event.quality_label == "low":
                        batch_low_quality += 1
                    report.add_success()
                    batch_ok += 1
                    log_metrics(logging.INFO, event)
                except Exception as exc:
                    await db.rollback()
                    reason = f"DB/pipeline error: {str(exc)[:180]}"
                    event.status = "failed"
                    event.failure_reason = reason
                    event.extraction_efficiency = _extraction_efficiency(
                        event.cleaned_length,
                        event.raw_content_length,
                    )
                    report.add_failure(result.url, reason, http_status=result.http_status)
                    await _record_scrape_url_failure(
                        db,
                        source_document_id=source_document_id,
                        exploration_id=exploration_id,
                        url=result.url,
                        reason=reason,
                        http_status=result.http_status,
                        method_used=result.method_used,
                        content_chars=event.cleaned_length,
                    )
                    await store.record(result.url, reason, http_status=result.http_status)
                    await db.commit()
                    batch_fail += 1
                    log_metrics(logging.WARNING, event)

                logs.append(event)

            logger.info(
                "Batch %d/%d complete | succeeded=%d | failed=%d | skipped=%d | "
                "low_quality=%d | dynamic_used=%d | running_total=%d/%d",
                batch_num,
                total_batches,
                batch_ok,
                batch_fail,
                batch_skipped,
                batch_low_quality,
                batch_dynamic_used,
                report.total_succeeded + report.total_failed + report.skipped_blocklisted + report.skipped_low_value,
                report.total_attempted,
            )
            # Flush after every batch — partial results are safe on crash.
            await db.commit()
            await store.flush()

    report.finalize(logs)
    _log_summary(report)
    if report.failed_domains:
        logger.warning("syncdb_scrape_failed_domains %s", json.dumps(report.failed_domains, sort_keys=True))
    await store.flush()  # final flush (catches any stragglers)
    return report


async def scrape_urls_from_document(
    db: AsyncSession,
    document_id: str,
    domain: Optional[str],
    exploration_id: Optional[str],
    user_id: str,
) -> ScrapeReport:
    from app.services.syncdb_source import get_document_chunks, get_source_document

    doc = await get_source_document(db, document_id)
    if doc is None:
        logger.warning("Scrape skipped: document not found | doc_id=%s", document_id)
        return ScrapeReport(total_attempted=0)

    source_type = (doc or {}).get("source_type") or "xlsx"
    logger.info(
        "Scrape document lookup | doc_id=%s | source_type=%s | domain=%s | exploration_id=%s",
        document_id,
        source_type,
        domain,
        exploration_id,
    )

    fetch_limit = 2_000
    chunks: list[dict] = []
    offset = 0
    while True:
        batch = await get_document_chunks(
            db,
            document_id,
            source_type=source_type,
            limit=fetch_limit,
            offset=offset,
            enforce_max_limit=False,
        )
        if not batch:
            break
        valid_batch = [c for c in batch if c is not None and isinstance(c, dict)]
        chunks.extend(valid_batch)
        logger.info(
            "Loaded document chunk batch | doc_id=%s | offset=%d | fetched=%d | valid=%d | running_total=%d",
            document_id,
            offset,
            len(batch),
            len(valid_batch),
            len(chunks),
        )
        if len(batch) < fetch_limit:
            break
        offset += fetch_limit

    detected_columns = _detect_tabular_columns(chunks)
    detected_column_names = sorted(detected_columns)
    has_source_link = _URL_COLUMN.lower() in {name.lower() for name in detected_columns}
    extracted_urls = _extract_urls_from_xlsx_chunks(chunks)

    logger.info(
        "Scrape document prepared | doc_id=%s | chunk_count=%d | detected_columns=%s | extracted_urls=%d",
        document_id,
        len(chunks),
        detected_column_names,
        len(extracted_urls),
    )

    if source_type.lower() in {"csv", "xlsx", "xls"} and not has_source_link:
        logger.warning(
            "Scrape skipped: Source Link column not found | doc_id=%s | available_columns=%s",
            document_id,
            detected_column_names,
        )
        return ScrapeReport(total_attempted=0)

    return await scrape_and_save_source_links(
        db=db,
        xlsx_chunks=chunks,
        domain=domain,
        exploration_id=exploration_id,
        user_id=user_id,
        source_document_id=document_id,
    )
