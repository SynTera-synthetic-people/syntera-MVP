"""
Rule-based source governance classifier.

Determines domain, source_group, authority_tier, approval_status, and
allowed_use from a source's URL and/or content snippet. No LLM call.

Priority chain:
  1. Known URL rules (hostname pattern match)
  2. TLD-based official detection (.gov.in, .nic.in, etc.)
  3. Content keyword frequency
  4. Safe defaults
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlparse


@dataclass
class SourceClassification:
    domain: Optional[str]
    source_group: str
    authority_tier: str
    approval_status: str
    allowed_use: list[str] = field(default_factory=list)


# ── Known-URL rules ───────────────────────────────────────────────────────────
# Each entry: (hostname_contains, domain, source_group, authority_tier, auto_approve)
# Listed most-specific first. First match wins.

_URL_RULES: list[tuple[str, Optional[str], str, str, bool]] = [
    # Finance — official regulatory
    ("rbi.org.in",            "finance",  "finance",        "official",      True),
    ("sebi.gov.in",           "finance",  "finance",        "official",      True),
    ("npci.org.in",           "finance",  "finance",        "official",      True),
    ("irdai.gov.in",          "finance",  "finance",        "official",      True),
    ("finmin.nic.in",         "finance",  "finance",        "official",      True),
    ("mospi.gov.in",          "finance",  "finance",        "official",      True),
    ("dpiit.gov.in",          "finance",  "finance",        "official",      True),

    # Finance — fintechs / platforms
    ("phonepe.com",           "finance",  "finance",        "partner",       True),
    ("paytm.com",             "finance",  "finance",        "partner",       True),
    ("razorpay.com",          "finance",  "finance",        "partner",       True),
    ("bharatpe.com",          "finance",  "finance",        "partner",       False),
    ("groww.in",              "finance",  "finance",        "partner",       False),
    ("zerodha.com",           "finance",  "finance",        "partner",       False),
    ("bankbazaar.com",        "finance",  "finance",        "curated",       False),

    # Food delivery
    ("zomato.com",            "food",     "food_delivery",  "partner",       True),
    ("swiggy.com",            "food",     "food_delivery",  "partner",       True),
    ("blinkit.com",           "food",     "food_delivery",  "partner",       False),
    ("dunzo.com",             "food",     "food_delivery",  "partner",       False),
    ("fssai.gov.in",          "food",     "food_delivery",  "official",      True),

    # Ecommerce
    ("amazon.in",             "ecom",     "ecom",           "partner",       True),
    ("amazon.com",            "ecom",     "ecom",           "partner",       True),
    ("flipkart.com",          "ecom",     "ecom",           "partner",       True),
    ("myntra.com",            "ecom",     "ecom",           "partner",       False),
    ("meesho.com",            "ecom",     "ecom",           "partner",       False),
    ("snapdeal.com",          "ecom",     "ecom",           "partner",       False),
    ("nykaa.com",             "ecom",     "ecom",           "partner",       False),

    # Mobility
    ("uber.com",              "mobility", "mobility",       "partner",       True),
    ("ola.auto",              "mobility", "mobility",       "partner",       True),
    ("olacabs.com",           "mobility", "mobility",       "partner",       True),
    ("rapido.bike",           "mobility", "mobility",       "partner",       False),
    ("blusmartmobility.com",  "mobility", "mobility",       "partner",       False),

    # Market research / consulting
    ("mckinsey.com",          None,       "market_research","curated",       True),
    ("bcg.com",               None,       "market_research","curated",       True),
    ("bain.com",              None,       "market_research","curated",       True),
    ("deloitte.com",          None,       "market_research","curated",       True),
    ("pwc.com",               None,       "market_research","curated",       True),
    ("ey.com",                None,       "market_research","curated",       True),
    ("kpmg.com",              None,       "market_research","curated",       True),
    ("accenture.com",         None,       "market_research","curated",       True),
    ("nielsen.com",           None,       "market_research","curated",       True),
    ("kantar.com",            None,       "market_research","curated",       True),
    ("ipsos.com",             None,       "market_research","curated",       True),
    ("forrester.com",         None,       "market_research","curated",       True),
    ("gartner.com",           None,       "market_research","curated",       True),
    ("statista.com",          None,       "market_research","curated",       True),
    ("redseerconsulting.com", None,       "market_research","curated",       True),
    ("blume.vc",              None,       "market_research","curated",       True),
    ("redseer.com",           None,       "market_research","curated",       True),
]

# ── Official TLD patterns ─────────────────────────────────────────────────────
_OFFICIAL_TLD_SUFFIXES = (
    ".gov.in", ".nic.in", ".gov.uk", ".gov.au", ".gov",
    ".edu.in", ".ac.in", ".ac.uk",
)

# ── allowed_use by authority_tier ─────────────────────────────────────────────
_ALLOWED_USE_BY_TIER: dict[str, list[str]] = {
    "official":      ["qual_report", "quant_report", "citation"],
    "partner":       ["qual_report", "quant_report", "citation"],
    "curated":       ["qual_report", "quant_report", "citation"],
    "user_uploaded": ["qual_report", "citation"],
    "experimental":  ["qual_report"],
}

# ── Content keyword rules ─────────────────────────────────────────────────────
# Format: (keyword_list, domain, source_group)
# Minimum 2 keyword hits required to classify.

_CONTENT_RULES: list[tuple[list[str], Optional[str], str]] = [
    (
        ["payment", "upi", "neft", "rtgs", "fintech", "banking", "loan",
         "emi", "credit card", "debit card", "wallet", "investment", "mutual fund",
         "insurance", "financial", "bank"],
        "finance", "finance",
    ),
    (
        ["food delivery", "restaurant", "order food", "meal", "swiggy", "zomato",
         "dining", "cuisine", "qsr", "quick service", "cloud kitchen"],
        "food", "food_delivery",
    ),
    (
        ["ecommerce", "e-commerce", "online shopping", "cart", "checkout",
         "flipkart", "amazon", "purchase online", "marketplace", "seller"],
        "ecom", "ecom",
    ),
    (
        ["ride sharing", "cab", "rideshare", "taxi", "auto rickshaw",
         "mobility", "commute", "uber", "ola", "ride hailing"],
        "mobility", "mobility",
    ),
    (
        ["consumer behaviour", "market research", "survey", "brand perception",
         "nps", "net promoter", "sentiment analysis", "focus group",
         "consumer insights", "qualitative research", "quantitative research"],
        None, "market_research",
    ),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_hostname(url: str) -> str:
    try:
        netloc = urlparse(url or "").netloc or ""
        return netloc.lower().removeprefix("www.")
    except Exception:
        return ""


def _match_url_rule(hostname: str) -> Optional[tuple]:
    for pattern, domain, source_group, tier, auto_approve in _URL_RULES:
        if pattern in hostname:
            return domain, source_group, tier, auto_approve
    return None


def _is_official_tld(hostname: str) -> bool:
    return any(hostname.endswith(tld) for tld in _OFFICIAL_TLD_SUFFIXES)


def _match_content(text: str) -> tuple[Optional[str], Optional[str]]:
    lowered = text.lower()
    best_hits = 0
    best_domain: Optional[str] = None
    best_group: Optional[str] = None
    for keywords, domain, source_group in _CONTENT_RULES:
        hits = sum(1 for kw in keywords if kw in lowered)
        if hits >= 2 and hits > best_hits:
            best_hits = hits
            best_domain = domain
            best_group = source_group
    return best_domain, best_group


# ── Public API ────────────────────────────────────────────────────────────────

def classify_source(
    *,
    url: Optional[str] = None,
    title: Optional[str] = None,
    content_snippet: Optional[str] = None,
) -> SourceClassification:
    """
    Auto-classify governance fields for a source.

    Pass any combination of url, title, content_snippet.
    More signals → more accurate result.
    """
    hostname = _extract_hostname(url or "")
    probe = f"{title or ''} {content_snippet or ''}".strip()

    # 1. Known URL rules (most reliable)
    match = _match_url_rule(hostname)
    if match:
        domain, source_group, tier, auto_approve = match
        # If domain is None from the rule (e.g. research firms), try content
        if domain is None and probe:
            content_domain, _ = _match_content(probe)
            domain = content_domain
        return SourceClassification(
            domain=domain,
            source_group=source_group,
            authority_tier=tier,
            approval_status="approved" if auto_approve else "pending",
            allowed_use=_ALLOWED_USE_BY_TIER[tier],
        )

    # 2. TLD-based official detection
    if hostname and _is_official_tld(hostname):
        domain, source_group = _match_content(probe) if probe else (None, None)
        return SourceClassification(
            domain=domain,
            source_group=source_group or "official_docs",
            authority_tier="official",
            approval_status="approved",
            allowed_use=_ALLOWED_USE_BY_TIER["official"],
        )

    # 3. Content keyword classification
    if probe:
        domain, source_group = _match_content(probe)
        if source_group:
            return SourceClassification(
                domain=domain,
                source_group=source_group,
                authority_tier="curated",
                approval_status="pending",
                allowed_use=_ALLOWED_USE_BY_TIER["curated"],
            )

    # 4. Safe defaults — unknown source
    return SourceClassification(
        domain=None,
        source_group="general",
        authority_tier="user_uploaded",
        approval_status="pending",
        allowed_use=_ALLOWED_USE_BY_TIER["user_uploaded"],
    )


def merge_with_explicit(
    auto: SourceClassification,
    *,
    domain: Optional[str],
    source_group: Optional[str],
    authority_tier: Optional[str],
    approval_status: Optional[str],
    allowed_use: Optional[list[str]],
) -> dict:
    """
    Merge auto-classification with values the caller explicitly provided.
    Explicit (non-None) caller values always win over auto-detected ones.
    """
    return {
        "domain":          domain          if domain          is not None else auto.domain,
        "source_group":    source_group    if source_group    is not None else auto.source_group,
        "authority_tier":  authority_tier  if authority_tier  is not None else auto.authority_tier,
        "approval_status": approval_status if approval_status is not None else auto.approval_status,
        "allowed_use":     allowed_use     if allowed_use     is not None else auto.allowed_use,
    }
