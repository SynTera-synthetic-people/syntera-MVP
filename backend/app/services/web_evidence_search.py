"""
Web Evidence Search — dedicated gap-fill component for the Knowledge
Enrichment evidence pipeline.

get_additional_web_sources() is called only when Sourcebank + filtering leave
the KE evidence set below its minimum size (see ke_sourcebank_enrichment.py).
It knows nothing about "KE categories" or personas beyond what's passed in —
it takes a research objective/questions, generates search queries, runs ONE
batched live web search (Anthropic's native web_search tool — the same
mechanism already used in digital_brain_pipeline.py, just generalized beyond
its fixed 6-platform list), scores results for credibility + relevance,
dedupes against what's already known, and returns a plain list of source
dicts for the caller to classify and merge.

Responsibilities kept out of this module on purpose:
  - KE category classification (caller's job, via the existing
    _classify_source_into_ke_category()).
  - KE confidence scoring (unaffected by web sources entirely — see the
    docstring on _compute_ke_confidence_from_sources()).
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlparse

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import async_engine
from app.rag.retrieve import resolve_source_identity
from app.services.ro_extractor import build_ke_search_queries
from app.utils.anthropic_client import get_async_anthropic_client
from app.utils.id_generator import generate_id
from app.services.llm_usage_tracker import record_llm_usage, extract_usage_anthropic_message

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-6"
_MAX_QUERIES = 6
_MAX_SEARCH_USES = 15

# ── Credibility matrix ──────────────────────────────────────────────────────
# Domain-lookup-table approach, same style as AUTHORITY_SCORES in
# app/rag/retrieve.py, extended to the open web. Plain module constants —
# expected to need manual tuning over time as new domains come up.

TIER_SCORES: dict[int, float] = {1: 1.00, 2: 0.85, 3: 0.65, 4: 0.40, 5: 0.20}

_TIER1_GOV_SUFFIXES = (".gov", ".gov.in", ".gov.uk", ".nic.in", ".mil")
_TIER1_REGULATOR_DOMAINS = frozenset({
    "rbi.org.in", "sebi.gov.in", "trai.gov.in", "sec.gov", "ftc.gov",
    "who.int", "imf.org", "worldbank.org", "oecd.org", "un.org",
})

_TIER2_RESEARCH_FIRM_DOMAINS = frozenset({
    "nielsen.com", "mckinsey.com", "statista.com", "gartner.com",
    "forrester.com", "euromonitor.com", "ibisworld.com", "kantar.com",
    "deloitte.com", "pwc.com", "bain.com", "bcg.com", "accenture.com",
})
_TIER2_ACADEMIC_SUFFIXES = (".edu", ".ac.in", ".ac.uk")
_TIER2_ACADEMIC_DOMAINS = frozenset({
    "scholar.google.com", "researchgate.net", "ncbi.nlm.nih.gov",
    "jstor.org", "sciencedirect.com", "springer.com", "tandfonline.com",
})

_TIER3_PUBLICATION_DOMAINS = frozenset({
    "reuters.com", "bloomberg.com", "ft.com", "wsj.com", "economist.com",
    "forbes.com", "businessinsider.com", "cnbc.com", "livemint.com",
    "economictimes.indiatimes.com", "business-standard.com",
    "hindustantimes.com", "thehindu.com", "moneycontrol.com",
})

_TIER4_DOMAINS = frozenset({"medium.com", "reddit.com", "quora.com"})
_TIER4_SUBDOMAIN_MARKERS = ("blog.", "substack.")

_IR_PATH_MARKERS = ("investor-relations", "annual-report", "sec-filings", "/ir/")
_IR_SUBDOMAIN_MARKERS = ("investor.", "ir.")


def _normalize_domain(url: str) -> str:
    try:
        host = urlparse(url).netloc.lower()
    except ValueError:
        return ""
    return host[4:] if host.startswith("www.") else host


def _looks_like_ir_page(url: str, domain: str) -> bool:
    if any(domain.startswith(marker) for marker in _IR_SUBDOMAIN_MARKERS):
        return True
    path = (urlparse(url).path or "").lower()
    return any(marker in path for marker in _IR_PATH_MARKERS)


def score_source_credibility(url: str) -> tuple[int, float]:
    """
    Returns (tier, score) for a web result's domain.

    Known, stated limitation: general "official company website" detection
    (beyond investor-relations pages) is brand-dependent and has no clean
    brand-agnostic pattern — not attempted here rather than guessed at.
    """
    domain = _normalize_domain(url)
    if not domain:
        return 5, TIER_SCORES[5]

    if domain.endswith(_TIER1_GOV_SUFFIXES) or domain in _TIER1_REGULATOR_DOMAINS:
        return 1, TIER_SCORES[1]
    if _looks_like_ir_page(url, domain):
        return 1, TIER_SCORES[1]

    if (
        domain in _TIER2_RESEARCH_FIRM_DOMAINS
        or domain.endswith(_TIER2_ACADEMIC_SUFFIXES)
        or domain in _TIER2_ACADEMIC_DOMAINS
    ):
        return 2, TIER_SCORES[2]

    if domain in _TIER3_PUBLICATION_DOMAINS:
        return 3, TIER_SCORES[3]

    if domain in _TIER4_DOMAINS or any(domain.startswith(m) for m in _TIER4_SUBDOMAIN_MARKERS):
        return 4, TIER_SCORES[4]

    return 5, TIER_SCORES[5]


_TIER_LABELS = {1: "Tier 1", 2: "Tier 2", 3: "Tier 3", 4: "Tier 4", 5: "Tier 5"}


# ── Relevance scoring ────────────────────────────────────────────────────────
# Cheap keyword-overlap heuristic — no extra embedding-API calls per result.
# An embedding-based upgrade (reusing create_query_embedding() from
# app/rag/retrieve.py) is a reasonable future improvement if this proves too
# coarse, but adds per-result API cost this v1 avoids.

_STOPWORD_LEN = 2


def _tokenize(text_value: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", (text_value or "").lower()) if len(w) > _STOPWORD_LEN}


def _score_relevance(candidate_text: str, query_tokens: set[str]) -> float:
    if not query_tokens:
        return 0.5
    candidate_tokens = _tokenize(candidate_text)
    if not candidate_tokens:
        return 0.0
    overlap = len(candidate_tokens & query_tokens)
    return round(min(overlap / len(query_tokens), 1.0), 4)


# ── Query generation ─────────────────────────────────────────────────────────

def _build_web_search_queries(
    research_objective: str,
    persona_name: str,
    research_questions: Optional[list[str]],
    gap_topics: Optional[list[str]],
    ro_components: Optional[dict] = None,
) -> list[str]:
    """
    Inputs, per the requirement: research objective, persona, research
    questions, and gap topics (caller-supplied — for KE these are the
    KE categories not yet covered by Sourcebank; this function doesn't need
    to know what a "KE category" is).

    When `ro_components` (the structured 12-field RO dict from
    extract_ro_components_for_pipeline()) is available, queries are built
    from it via build_ke_search_queries() — the same structured builder the
    Sourcebank query step uses (see ke_sourcebank_enrichment.py /
    ro_extractor.py for why: raw RO text used to silently drop
    category/geography signal once it ran long, and how geography is now
    preserved verbatim in every query). Capped at the existing _MAX_QUERIES
    (6) so web-search call volume/cost is unchanged.

    Legacy fallback (ro_components is None): unchanged raw-text builder
    below, so this function never breaks a caller that hasn't been updated
    to supply structured RO components.
    """
    if ro_components:
        return build_ke_search_queries(
            ro_components,
            persona_name=persona_name,
            gap_topics=gap_topics,
            max_queries=_MAX_QUERIES,
            fallback_text=research_objective,
        )

    ro_text = (research_objective or "").strip()
    candidates: list[str] = [ro_text]

    for question in (research_questions or [])[:5]:
        q = (question or "").strip()
        if q:
            candidates.append(f"{q} {ro_text}".strip())

    if persona_name:
        candidates.append(f"{persona_name} {ro_text} consumer behaviour".strip())

    for topic in (gap_topics or []):
        if topic:
            candidates.append(f"{ro_text} {topic}".strip())

    seen: set[str] = set()
    queries: list[str] = []
    for q in candidates:
        if q and q not in seen:
            seen.add(q)
            queries.append(q)
        if len(queries) >= _MAX_QUERIES:
            break
    return queries


# ── Cache ────────────────────────────────────────────────────────────────────

def _query_hash(queries: list[str]) -> str:
    normalized = "\n".join(sorted(q.strip().lower() for q in queries))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


async def _load_cached_sources(db: AsyncSession, exploration_id: str, query_hash: str) -> Optional[list[dict]]:
    result = await db.execute(
        text("""
            SELECT sources FROM sync_source.ke_web_source_cache
            WHERE exploration_id = :exploration_id AND query_hash = :query_hash
              AND expires_at > now()
        """),
        {"exploration_id": exploration_id, "query_hash": query_hash},
    )
    row = result.first()
    if row is None:
        return None
    sources = row[0]
    return sources if isinstance(sources, list) else None


async def _write_cache(db: AsyncSession, exploration_id: str, query_hash: str, sources: list[dict]) -> None:
    expires_at = datetime.utcnow() + timedelta(hours=settings.KE_WEB_SOURCE_CACHE_TTL_HOURS)
    await db.execute(
        text("""
            INSERT INTO sync_source.ke_web_source_cache (id, exploration_id, query_hash, sources, expires_at)
            VALUES (:id, :exploration_id, :query_hash, CAST(:sources AS JSONB), :expires_at)
            ON CONFLICT (exploration_id, query_hash)
            DO UPDATE SET sources = EXCLUDED.sources, expires_at = EXCLUDED.expires_at, created_at = now()
        """),
        {
            "id": generate_id(),
            "exploration_id": exploration_id,
            "query_hash": query_hash,
            "sources": json.dumps(sources, ensure_ascii=False),
            "expires_at": expires_at,
        },
    )
    await db.commit()


# ── Live retrieval ───────────────────────────────────────────────────────────

async def _run_web_search(queries: list[str], *, exploration_id: Optional[str]) -> list[dict]:
    """
    One batched Anthropic web_search call — same pattern as the batched
    Stage-3B call in digital_brain_pipeline.py. Only API-marked citations are
    kept (fabrication firewall); nothing freeform from the model's own text
    is treated as a source.
    """
    prompt = "\n".join(queries)
    citations: list[dict] = []
    try:
        client = get_async_anthropic_client()
        response = await client.messages.create(
            model=MODEL,
            max_tokens=4096,
            tools=[{
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": _MAX_SEARCH_USES,
            }],
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:
        logger.warning("get_additional_web_sources: Anthropic web_search failed — %s", exc)
        return []

    if exploration_id:
        try:
            input_tokens, output_tokens, usage_raw = extract_usage_anthropic_message(response)
            await record_llm_usage(
                exploration_id=exploration_id,
                stage="ke_evidence_enrichment",
                operation="web_search_topup",
                provider="anthropic",
                model=MODEL,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                usage_raw=usage_raw,
            )
        except Exception:
            logger.debug("get_additional_web_sources: usage tracking failed — non-fatal", exc_info=True)

    for block in getattr(response, "content", []) or []:
        if getattr(block, "type", None) != "text":
            continue
        for c in (getattr(block, "citations", None) or []):
            url = getattr(c, "url", None)
            if not url:
                continue
            citations.append({
                "url": url,
                "title": getattr(c, "title", None) or url,
                "quote": getattr(c, "cited_text", None) or "",
            })
    return citations


# ── Public API ───────────────────────────────────────────────────────────────

async def get_additional_web_sources(
    *,
    research_objective: str,
    persona_name: str = "",
    research_questions: Optional[list[str]] = None,
    existing_sources: list[dict],
    needed_count: int,
    gap_topics: Optional[list[str]] = None,
    exploration_id: Optional[str] = None,
    db: Optional[AsyncSession] = None,
    ro_components: Optional[dict] = None,
) -> list[dict]:
    """
    Fetches up to `needed_count` credibility-ranked web sources not already
    covered by `existing_sources` (Sourcebank entries — dicts with
    document_id/source_url/title, same shape as ke_sources_used entries).

    `ro_components`, when supplied, is the structured 12-field RO dict from
    extract_ro_components_for_pipeline() — used both to build structured,
    geography-anchored queries (see _build_web_search_queries()) and to widen
    the relevance-scoring token set below with category/target_audience/
    geography signal, so a candidate result actually matching the RO's
    category and geography scores higher than one that only matches the raw
    RO text loosely. Optional and backward compatible: omitting it preserves
    the original raw-text query + relevance behavior exactly.

    Returns generic dicts: {document_id: None, chunk_id: None, title,
    source_url, domain, authority_tier: None, authority_label: None,
    relevance_score, usage_context: None, origin: "web", credibility_score,
    source_tier, retrieval_reason}. Caller is responsible for KE-category
    classification and merging — this function has no opinion on either.

    Never raises — a search failure just means fewer/zero sources returned,
    same "no live evidence surfaced" outcome as thin Sourcebank coverage.
    """
    if needed_count <= 0:
        return []

    queries = _build_web_search_queries(
        research_objective, persona_name, research_questions, gap_topics, ro_components,
    )
    if not queries:
        return []

    owns_session = db is None
    session = db or AsyncSession(async_engine)
    try:
        cached: Optional[list[dict]] = None
        q_hash = _query_hash(queries)
        if exploration_id:
            try:
                cached = await _load_cached_sources(session, exploration_id, q_hash)
            except Exception:
                logger.debug("get_additional_web_sources: cache lookup failed — treating as miss", exc_info=True)

        if cached is not None:
            candidates = cached
        else:
            citations = await _run_web_search(queries, exploration_id=exploration_id)
            candidates = citations
            if exploration_id and candidates:
                try:
                    await _write_cache(session, exploration_id, q_hash, candidates)
                except Exception:
                    logger.debug("get_additional_web_sources: cache write failed — non-fatal", exc_info=True)

        if not candidates:
            return []

        # Seed dedup with existing Sourcebank identities so Sourcebank always
        # wins a URL collision (structural priority, not just preference).
        seen: set[str] = set()
        for src in existing_sources:
            key = resolve_source_identity(
                document_id=src.get("document_id"),
                url=src.get("source_url"),
                chunk_id=src.get("chunk_id"),
                title=src.get("title"),
            )
            if key:
                seen.add(key)

        # Widen the relevance-scoring token set with structured RO signal
        # (category/target_audience/geography/business_objective) when
        # available, so _score_relevance() rewards a candidate that actually
        # matches the RO's topic and geography — not just loose overlap with
        # the raw RO text. Falls back to the original raw-text-only context
        # when ro_components isn't supplied.
        context_parts = [research_objective or "", persona_name or ""] + list(research_questions or [])
        if ro_components:
            context_parts += [
                str(ro_components.get(key, "") or "")
                for key in ("category", "sub_category", "target_audience", "geography", "business_objective")
            ]
        query_context = " ".join(context_parts)
        query_tokens = _tokenize(query_context)

        scored: list[dict] = []
        for c in candidates:
            url = c.get("url")
            if not url:
                continue
            key = resolve_source_identity(url=url, title=c.get("title"))
            if not key or key in seen:
                continue
            seen.add(key)

            tier, credibility_score = score_source_credibility(url)
            relevance_score = _score_relevance(f"{c.get('title', '')} {c.get('quote', '')}", query_tokens)
            final_score = credibility_score * 0.55 + relevance_score * 0.45
            scored.append({
                "document_id": None,
                "chunk_id": None,
                "title": c.get("title") or url,
                "source_url": url,
                "domain": _normalize_domain(url),
                "authority_tier": None,
                "authority_label": None,
                "relevance_score": relevance_score,
                "usage_context": None,
                "origin": "web",
                "credibility_score": credibility_score,
                "source_tier": _TIER_LABELS[tier],
                "retrieval_reason": f"web-search gap-fill for: {(research_objective or '')[:60]}",
                "_final_score": final_score,
            })

        scored.sort(key=lambda s: s["_final_score"], reverse=True)

        selected: list[dict] = []
        domain_counts: dict[str, int] = {}
        deferred: list[dict] = []
        for s in scored:
            if len(selected) >= needed_count:
                break
            domain = s["domain"]
            if domain_counts.get(domain, 0) >= settings.KE_MAX_PER_DOMAIN:
                deferred.append(s)
                continue
            domain_counts[domain] = domain_counts.get(domain, 0) + 1
            selected.append(s)

        # Fail-open on the domain cap: relax it rather than under-deliver the
        # requested count if we ran out of diverse candidates.
        for s in deferred:
            if len(selected) >= needed_count:
                break
            selected.append(s)

        for s in selected:
            s.pop("_final_score", None)
        return selected[:needed_count]
    finally:
        if owns_session:
            await session.close()
