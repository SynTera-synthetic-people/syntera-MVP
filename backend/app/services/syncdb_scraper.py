"""
SyncDB Source Link Scraper — parallel rewrite.

Flow:
    1. XLSX/CSV processed → rows with "Source Link" + "URL Valid = Yes" extracted
    2. URLs fetched in parallel (asyncio.gather + Semaphore, default 8 concurrent)
       with retry for transient errors (timeout, connection reset)
    3. Fetch results collected in memory — no DB interaction during fetch phase
    4. Successful fetches written to DB sequentially (safe: single AsyncSession)
       - register sync_source.document row
       - batch-insert content_chunk rows
       - commit per URL
    5. Final ScrapeReport returned with success/failure breakdown

Phase separation (fetch vs. write) keeps AsyncSession usage safe and lets
asyncio parallelise the expensive I/O without concurrent DB contention.

Dependencies:
    pip install httpx beautifulsoup4 pypdf
"""

import asyncio
import io
import logging
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.id_generator import generate_id
from app.services.syncdb_source import (
    DATA_TYPE_SCRAPED,
    _MAX_SCRAPED_CONTENT_LENGTH,
    _SOFT_MAX_SCRAPED_CHUNKS,
    _extract_readable_webpage_text,
    _save_text_chunks,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tuning constants
# ---------------------------------------------------------------------------

_MAX_CONCURRENT    = 8      # parallel HTTP connections (safe for prod)
_FETCH_BATCH       = 100    # URLs per asyncio.gather call
_REQUEST_TIMEOUT   = 20     # seconds per request attempt
_MAX_CONTENT_BYTES = 10_485_760  # 10 MB — skip huge pages

_MAX_RETRIES    = 2     # retries for transient failures
_RETRY_DELAY    = 1.5   # base back-off in seconds (multiplied by attempt number)
_RATE_LIMIT_WAIT = 10.0  # seconds to wait on HTTP 429

_USER_AGENT = (
    "Mozilla/5.0 (compatible; SyncDBBot/1.0; +https://syntheticpeople.ai)"
)

# Columns we look for in XLSX/CSV rows (case-insensitive)
_URL_COLUMN   = "Source Link"
_VALID_COLUMN = "URL Valid"
_VALID_VALUE  = "yes"

# Exception types that are safe to retry
_TRANSIENT = (
    httpx.TimeoutException,
    httpx.ConnectError,
    httpx.ReadError,
    httpx.RemoteProtocolError,
    httpx.WriteError,
)


# ---------------------------------------------------------------------------
# Result dataclasses
# ---------------------------------------------------------------------------

@dataclass
class FailedURL:
    url: str
    reason: str


@dataclass
class ScrapeReport:
    total_attempted: int       = 0
    total_succeeded: int       = 0
    total_failed: int          = 0
    failed_urls: list[FailedURL] = field(default_factory=list)

    def add_failure(self, url: str, reason: str) -> None:
        self.failed_urls.append(FailedURL(url=url, reason=reason))
        self.total_failed += 1

    def add_success(self) -> None:
        self.total_succeeded += 1

    def to_dict(self) -> dict:
        return {
            "total_attempted": self.total_attempted,
            "total_succeeded": self.total_succeeded,
            "total_failed":    self.total_failed,
            "failed_urls": [
                {"url": f.url, "reason": f.reason}
                for f in self.failed_urls
            ],
        }


@dataclass
class _FetchResult:
    """Internal result of a single URL fetch attempt."""
    url: str
    text: Optional[str] = None    # None → failure
    error: Optional[str] = None
    is_permanent: bool = False    # True → don't bother retrying on future runs


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

def _iter_candidate_rows(chunks: list[dict]) -> list[dict[str, Any]]:
    """
    Iterate rows from document chunks.
    Defensive: skips any chunk/row that is not a valid dict.
    """
    rows: list[dict[str, Any]] = []

    for chunk in chunks:
        # FIX: chunk itself must be a dict
        if not isinstance(chunk, dict):
            logger.debug("Skipping non-dict chunk in _iter_candidate_rows | type=%s", type(chunk))
            continue

        content = chunk.get("content")

        # FIX: content could be None if the DB column was NULL
        if content is None:
            logger.debug(
                "Skipping URL due to invalid content: chunk content is None "
                "| chunk_id=%s", chunk.get("id")
            )
            continue

        if isinstance(content, dict) and "rows" in content:
            candidate_rows = content.get("rows") or []
        elif isinstance(content, dict):
            candidate_rows = [content]
        else:
            # String content (scraped/document type) — not iterable as rows
            continue

        for row in candidate_rows:
            # FIX: each row must also be a dict before appending
            if isinstance(row, dict):
                rows.append(row)
            else:
                logger.debug(
                    "Skipping non-dict row in candidate_rows | type=%s", type(row)
                )

    return rows


def _detect_tabular_columns(chunks: list[dict]) -> set[str]:
    columns: set[str] = set()
    for row in _iter_candidate_rows(chunks):
        columns.update(str(key) for key in row.keys())
    return columns


def _is_pdf_url(url: str) -> bool:
    if not url:
        return False
    return url.lower().split("?")[0].endswith(".pdf")


def _extract_urls_from_xlsx_chunks(chunks: list[dict]) -> list[str]:
    """
    Extract valid Source Link URLs from document chunks.

    Handles both storage formats:
    - New (per-row): chunk["content"] is a flat row dict
      e.g. {"Source Link": "https://...", "URL Valid": "Yes", ...}
    - Legacy (per-sheet): chunk["content"] is {"sheet": "...", "rows": [...]}
    Deduplicates — same URL won't be scraped twice per document.
    """
    seen: set[str] = set()
    urls: list[str] = []

    for row in _iter_candidate_rows(chunks):
        # FIX: row is guaranteed dict by _iter_candidate_rows, but be safe
        if not isinstance(row, dict):
            continue

        try:
            row_lower = {str(k).lower(): v for k, v in row.items()}
        except Exception as exc:
            logger.debug("Skipping row, failed to lower-case keys | reason=%s", exc)
            continue

        raw_url = row_lower.get(_URL_COLUMN.lower())
        raw_valid = row_lower.get(_VALID_COLUMN.lower())

        # FIX: both values could be None
        url = str(raw_url or "").strip()
        valid = str(raw_valid or "").strip().lower()

        if not url or valid != _VALID_VALUE:
            continue
        if url in seen:
            continue
        seen.add(url)
        urls.append(url)

    return urls


# ---------------------------------------------------------------------------
# Content fetchers
# ---------------------------------------------------------------------------

async def _fetch_pdf(client: httpx.AsyncClient, url: str) -> str:
    """Download PDF and extract plain text via pypdf. Always returns str."""
    response = await client.get(url, follow_redirects=True)
    response.raise_for_status()
    if len(response.content) > _MAX_CONTENT_BYTES:
        raise ValueError(f"PDF too large ({len(response.content)} bytes)")
    try:
        from pypdf import PdfReader
    except ImportError:
        import PyPDF2 as pypdf_fallback  # type: ignore[import]
        reader = pypdf_fallback.PdfReader(io.BytesIO(response.content))
        return "\n".join(p.extract_text() or "" for p in reader.pages)
    reader = PdfReader(io.BytesIO(response.content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


async def _fetch_webpage(client: httpx.AsyncClient, url: str) -> str:
    """Fetch web page and extract readable text via BeautifulSoup. Always returns str."""
    response = await client.get(url, follow_redirects=True)
    response.raise_for_status()
    if len(response.content) > _MAX_CONTENT_BYTES:
        raise ValueError(f"Page too large ({len(response.content)} bytes)")

    # FIX: _extract_readable_webpage_text now always returns str,
    # but guard against None response.text just in case
    html = response.text or ""
    if not html.strip():
        logger.warning("Extraction returned None: HTTP response body is empty | url=%s", url)
        return ""

    result = _extract_readable_webpage_text(html)

    # FIX: result must be a str — _extract_readable_webpage_text guarantees this,
    # but add a final defensive check
    if result is None:
        logger.warning(
            "Extraction returned None: _extract_readable_webpage_text returned None "
            "| url=%s", url
        )
        return ""

    return result


async def _fetch_content(client: httpx.AsyncClient, url: str) -> str:
    """
    Route to PDF or web fetcher based on URL.
    Always returns str — never None.
    Raises on HTTP/network errors (handled by _fetch_one).
    """
    if not url or not url.strip():
        raise ValueError("URL is empty or None")

    if _is_pdf_url(url):
        result = await _fetch_pdf(client, url)
    else:
        result = await _fetch_webpage(client, url)

    # FIX: final guard — fetchers should always return str, but be defensive
    if result is None:
        logger.warning(
            "Extraction returned None: fetcher returned None | url=%s", url
        )
        return ""

    return result


async def _fetch_one(
    client: httpx.AsyncClient,
    url: str,
    semaphore: asyncio.Semaphore,
) -> _FetchResult:
    """
    Fetch a single URL with semaphore-bounded concurrency and retry logic.

    - Retries up to _MAX_RETRIES times for transient errors (timeout, connection reset)
    - 429 rate-limit → waits _RATE_LIMIT_WAIT seconds then retries
    - 403 / 404 / 410 → permanent failure, no retry
    - 5xx → retries (server might recover)
    - Never raises — always returns a _FetchResult
    """
    # FIX: guard against None/empty url before even entering semaphore
    if not url or not url.strip():
        logger.warning("Skipping URL due to invalid content: url is empty/None")
        return _FetchResult(url=url or "", error="URL is empty or None", is_permanent=True)

    async with semaphore:
        last_error = "Unknown error"

        for attempt in range(1 + _MAX_RETRIES):
            try:
                raw_text = await _fetch_content(client, url)

                # FIX: raw_text is now guaranteed str from _fetch_content,
                # but guard against None defensively
                if raw_text is None:
                    logger.warning(
                        "Extraction returned None: _fetch_content returned None "
                        "| url=%s | attempt=%d", url, attempt + 1
                    )
                    return _FetchResult(
                        url=url,
                        error="Extraction returned None",
                        is_permanent=True,
                    )

                if not raw_text.strip():
                    logger.warning(
                        "Skipping URL due to invalid content: empty text after extraction "
                        "| url=%s | attempt=%d", url, attempt + 1
                    )
                    return _FetchResult(
                        url=url,
                        error="Empty content after extraction",
                        is_permanent=True,
                    )

                return _FetchResult(url=url, text=raw_text)

            except httpx.HTTPStatusError as exc:
                code = exc.response.status_code
                if code in (403, 404, 410):
                    return _FetchResult(
                        url=url, error=f"HTTP {code}", is_permanent=True
                    )
                if code == 429:
                    wait = _RATE_LIMIT_WAIT * (attempt + 1)
                    logger.warning(
                        "Rate limited | url=%s | attempt=%d | waiting=%.0fs",
                        url, attempt + 1, wait,
                    )
                    await asyncio.sleep(wait)
                    last_error = "HTTP 429 Rate Limited"
                else:
                    last_error = f"HTTP {code}"
                    if attempt < _MAX_RETRIES:
                        await asyncio.sleep(_RETRY_DELAY * (attempt + 1))

            except _TRANSIENT as exc:  # type: ignore[misc]
                last_error = f"{type(exc).__name__}"
                if attempt < _MAX_RETRIES:
                    logger.debug(
                        "Transient error, retrying | url=%s | attempt=%d | reason=%s",
                        url, attempt + 1, last_error,
                    )
                    await asyncio.sleep(_RETRY_DELAY * (attempt + 1))

            except Exception as exc:
                # FIX: log the full reason so we can trace unexpected errors
                error_msg = str(exc)[:200]
                logger.warning(
                    "Skipping URL due to invalid content: unexpected error "
                    "| url=%s | attempt=%d | reason=%s", url, attempt + 1, error_msg
                )
                return _FetchResult(
                    url=url, error=error_msg, is_permanent=True
                )

        return _FetchResult(url=url, error=last_error)


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

async def _register_url_document(
    db: AsyncSession,
    url: str,
    domain: Optional[str],
    exploration_id: Optional[str],
    user_id: str,
) -> str:
    """Insert a document row for a scraped URL. Returns doc_id."""
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
            "id":             doc_id,
            "title":          url,
            "url":            url,
            "domain":         domain,
            "exploration_id": exploration_id,
            "uploaded_by":    user_id,
        },
    )
    return doc_id


async def _save_scraped_chunks(
    db: AsyncSession,
    document_id: str,
    raw_text: str,
) -> tuple[int, Any]:
    """Clean, trim, chunk, and save scraped content."""
    # FIX: guard before passing down — _save_text_chunks also checks, but be explicit
    if not raw_text or not raw_text.strip():
        logger.warning(
            "Skipping URL due to invalid content: raw_text is empty before chunking "
            "| doc_id=%s", document_id
        )
        from app.services.syncdb_source import ChunkPlan, CHUNK_SIZE, _CHUNK_OVERLAP
        empty_plan = ChunkPlan(
            cleaned_length=0,
            prepared_length=0,
            chunk_size=CHUNK_SIZE,
            chunk_overlap=_CHUNK_OVERLAP,
            chunk_count=0,
            was_trimmed=False,
            chunks=[],
        )
        return 0, empty_plan

    return await _save_text_chunks(
        db,
        document_id,
        raw_text,
        data_type=DATA_TYPE_SCRAPED,
        max_content_length=_MAX_SCRAPED_CONTENT_LENGTH,
        soft_max_chunks=_SOFT_MAX_SCRAPED_CHUNKS,
    )


# ---------------------------------------------------------------------------
# Main public function
# ---------------------------------------------------------------------------

async def scrape_and_save_source_links(
    db: AsyncSession,
    xlsx_chunks: list[dict],
    domain: Optional[str],
    exploration_id: Optional[str],
    user_id: str,
    max_concurrent: int = _MAX_CONCURRENT,
) -> ScrapeReport:
    """
    Extract Source Link URLs from chunks, scrape in parallel, save to DB.

    Two-phase approach:
    - Phase 1 (parallel): all URLs fetched concurrently via asyncio.gather
      with a Semaphore capping active connections at max_concurrent.
    - Phase 2 (sequential): successful fetches written to DB one at a time
      (AsyncSession is not safe for concurrent access across coroutines).

    Never raises — all failures captured in the returned ScrapeReport.
    """
    # FIX: guard against None chunks list
    if not xlsx_chunks:
        logger.info("No chunks provided to scrape_and_save_source_links.")
        return ScrapeReport(total_attempted=0)

    urls = _extract_urls_from_xlsx_chunks(xlsx_chunks)
    report = ScrapeReport(total_attempted=len(urls))

    if not urls:
        logger.info("No valid Source Link URLs found in chunks.")
        return report

    total_batches = (len(urls) + _FETCH_BATCH - 1) // _FETCH_BATCH
    logger.info(
        "Scrape started | total_urls=%d | concurrency=%d | batches=%d | domain=%s",
        len(urls), max_concurrent, total_batches, domain,
    )

    semaphore = asyncio.Semaphore(max_concurrent)
    headers = {
        "User-Agent": _USER_AGENT,
        "Accept":     "text/html,application/xhtml+xml,application/pdf,*/*",
    }

    async with httpx.AsyncClient(
        headers=headers,
        verify=False,
        timeout=httpx.Timeout(_REQUEST_TIMEOUT),
        limits=httpx.Limits(
            max_connections=max_concurrent + 5,
            max_keepalive_connections=max_concurrent,
        ),
    ) as client:

        for batch_start in range(0, len(urls), _FETCH_BATCH):
            batch_urls  = urls[batch_start : batch_start + _FETCH_BATCH]
            batch_num   = batch_start // _FETCH_BATCH + 1

            logger.info(
                "Batch %d/%d — fetching %d URLs in parallel",
                batch_num, total_batches, len(batch_urls),
            )

            # ── Phase 1: parallel fetch ────────────────────────────────────
            fetch_results: list[_FetchResult] = await asyncio.gather(
                *[_fetch_one(client, url, semaphore) for url in batch_urls]
            )

            # ── Phase 2: sequential DB write ──────────────────────────────
            batch_ok = batch_fail = 0

            for result in fetch_results:
                # FIX: result itself could be None if gather produced one (shouldn't, but guard)
                if result is None:
                    logger.warning(
                        "Skipping URL due to invalid content: _fetch_one returned None result"
                    )
                    report.add_failure("unknown", "fetch returned None result")
                    batch_fail += 1
                    continue

                if result.text is None:
                    report.add_failure(result.url, result.error or "Unknown error")
                    batch_fail += 1
                    logger.warning(
                        "Scrape URL failed | url=%s | reason=%s | permanent=%s",
                        result.url, result.error, result.is_permanent,
                    )
                    continue

                # FIX: double-check text is non-empty before writing to DB
                if not result.text.strip():
                    report.add_failure(result.url, "Empty text after fetch (post-check)")
                    batch_fail += 1
                    logger.warning(
                        "Skipping URL due to invalid content: text is empty post-fetch "
                        "| url=%s", result.url
                    )
                    continue

                try:
                    doc_id = await _register_url_document(
                        db,
                        url=result.url,
                        domain=domain,
                        exploration_id=exploration_id,
                        user_id=user_id,
                    )
                    chunks_created, chunk_plan = await _save_scraped_chunks(
                        db, doc_id, result.text
                    )

                    if chunks_created == 0:
                        # _save_scraped_chunks already logged the reason
                        # Still commit the document row so it's registered
                        logger.warning(
                            "Scrape URL produced 0 chunks | url=%s | doc_id=%s",
                            result.url, doc_id,
                        )

                    await db.execute(
                        text("UPDATE sync_source.document SET is_processed = TRUE WHERE id = :id"),
                        {"id": doc_id},
                    )
                    await db.commit()
                    report.add_success()
                    batch_ok += 1
                    logger.info(
                        "Content prepared | url=%s | length=%d | prepared_length=%d | "
                        "chunk_size=%d | chunk_overlap=%d",
                        result.url,
                        chunk_plan.cleaned_length,
                        chunk_plan.prepared_length,
                        chunk_plan.chunk_size,
                        chunk_plan.chunk_overlap,
                    )
                    logger.info(
                        "Scrape URL saved | url=%s | doc_id=%s | chunks=%d | trimmed=%s",
                        result.url, doc_id, chunks_created, chunk_plan.was_trimmed,
                    )

                except Exception as exc:
                    await db.rollback()
                    report.add_failure(result.url, f"DB error: {exc}")
                    batch_fail += 1
                    logger.warning(
                        "DB save failed | url=%s | reason=%s", result.url, exc
                    )

            logger.info(
                "Batch %d/%d complete | succeeded=%d | failed=%d | "
                "running_total=%d/%d",
                batch_num, total_batches,
                batch_ok, batch_fail,
                report.total_succeeded + report.total_failed,
                report.total_attempted,
            )

    # ── Final summary ─────────────────────────────────────────────────────
    success_rate = (
        report.total_succeeded / report.total_attempted * 100
        if report.total_attempted
        else 0.0
    )
    logger.info(
        "Scrape complete | total=%d | succeeded=%d | failed=%d | success_rate=%.1f%%",
        report.total_attempted,
        report.total_succeeded,
        report.total_failed,
        success_rate,
    )

    if report.failed_urls:
        reason_counts = Counter(f.reason for f in report.failed_urls)
        logger.warning(
            "Failure breakdown: %s",
            " | ".join(f"{r}={c}" for r, c in reason_counts.most_common()),
        )

    return report


async def scrape_urls_from_document(
    db: AsyncSession,
    document_id: str,
    domain: Optional[str],
    exploration_id: Optional[str],
    user_id: str,
) -> ScrapeReport:
    """
    Convenience wrapper: fetch all chunks for a document, extract Source Link URLs,
    and scrape each one in parallel.

    Intended for use as a background task after CSV/XLSX ingestion.
    Returns a ScrapeReport — never raises.
    """
    from app.services.syncdb_source import get_document_chunks, get_source_document

    doc = await get_source_document(db, document_id)

    # FIX: doc could be None if document_id is invalid
    if doc is None:
        logger.warning(
            "Scrape skipped: document not found | doc_id=%s", document_id
        )
        return ScrapeReport(total_attempted=0)

    source_type = (doc or {}).get("source_type") or "xlsx"
    logger.info(
        "Scrape document lookup | doc_id=%s | source_type=%s | domain=%s | exploration_id=%s",
        document_id, source_type, domain, exploration_id,
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
        # FIX: filter out any None entries from batch defensively
        valid_batch = [c for c in batch if c is not None and isinstance(c, dict)]
        chunks.extend(valid_batch)
        logger.info(
            "Loaded document chunk batch | doc_id=%s | offset=%d | fetched=%d | "
            "valid=%d | running_total=%d",
            document_id, offset, len(batch), len(valid_batch), len(chunks),
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
    )