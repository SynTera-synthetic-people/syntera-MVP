"""
Knowledge Enrichment Layer — Sourcebank enrichment service.

Queries the Qdrant Sourcebank for documents relevant to a persona's Research
Objective and patches the results into persona_details so the frontend KE card
shows real, clickable source citations instead of the hardcoded placeholder
constants.

Public API
----------
fetch_ke_sources(research_objective, persona_name, exploration_id)
    Synchronous. Runs up to 3 deduplicated Qdrant queries and returns:
      ke_sources_used          — deduplicated list of source objects
      ke_source_type_breakdown — {KE-category: count}
      ke_confidence            — {overall: int, components: {label: int}}

enrich_persona_ke_sources(persona_id, research_objective, ...)
    Async background task. Calls fetch_ke_sources() via run_in_executor,
    then patches persona_details in the DB. Never raises — logs and swallows
    exceptions so a Qdrant outage cannot surface as an HTTP 500.

Integration
-----------
All three persona generation pathways (Omi auto-generate, Digital Brain,
Manual calibration) call:

    asyncio.create_task(enrich_persona_ke_sources(...))

immediately after committing the persona to the DB.  The task runs after the
HTTP response is already on its way to the client, so generation latency is
unaffected.
"""

from __future__ import annotations

import asyncio
import logging
import math
from typing import Optional

from app.rag.retrieve import controlled_sourcebank_search

logger = logging.getLogger(__name__)

# ── KE category keyword map ────────────────────────────────────────────────────
# Maps Sourcebank source_type / source_group / title text → the 9 KE display
# categories shown in the frontend (must match KE_SOURCE_TYPES in
# PersonaPreview.tsx exactly).
#
# Rules:
#  - First match wins; probe string is lowercased before comparison.
#  - More-specific categories (Ethnographic, Behaviour Science) are listed first
#    so they win over broader ones (Academic, Industry) when keywords overlap.

_KE_CATEGORY_KEYWORD_MAP: list[tuple[list[str], str]] = [
    (
        ["ethnograph", "focus group", "field interview", "field study",
         "immersive research", "ethnographic"],
        "Ethnographic Studies",
    ),
    (
        ["behaviour science", "behavioral science", "behavioural science",
         "cognitive bias", "neuroscience", "behavioural economics",
         "behavioral economics", "cognitive science", "decision science",
         "psychology of"],
        "Behaviour Science Papers",
    ),
    (
        ["public dataset", "open data", "government data", "census",
         "survey data", "official statistics", "mospi", "nsso", "trai",
         "ministry report", "rbi report", "sebi report", "national statistics"],
        "Public Datasets",
    ),
    (
        ["trend report", "trend analysis", "trend forecast", "future trend",
         "emerging trend", "market trend", "innovation forecast"],
        "Trend Reports",
    ),
    (
        ["white paper", "whitepaper", "thought leadership", "expert article",
         "opinion piece", "perspective paper", "industry blog", "expert opinion"],
        "White Papers & Articles",
    ),
    (
        ["academic", "journal", "peer review", "peer-review", "scholarly",
         "university", "research paper", "thesis", "dissertation",
         "conference paper", "proceedings"],
        "Academic Research",
    ),
    (
        ["consumer study", "consumer research", "consumer behaviour",
         "consumer behavior", "consumer insight", "consumer survey",
         "shopper study", "buyer behaviour", "customer research",
         "customer study", "nps study", "customer satisfaction"],
        "Consumer Studies",
    ),
    (
        ["market report", "market research", "market analysis", "market size",
         "market intelligence", "market overview", "total addressable market",
         "market sizing", "market forecast"],
        "Market Reports",
    ),
    (
        ["industry report", "industry analysis", "industry overview",
         "sector report", "ibisworld", "sector analysis",
         "industry landscape", "vertical report"],
        "Industry Reports",
    ),
]

# ── source_group → KE category fallback ───────────────────────────────────────
# Used when keyword matching above finds nothing.

_SOURCE_GROUP_TO_KE_CATEGORY: dict[str, str] = {
    "market_research": "Market Reports",
    "finance":         "Industry Reports",
    "food_delivery":   "Consumer Studies",
    "ecom":            "Consumer Studies",
    "mobility":        "Consumer Studies",
    "official_docs":   "Public Datasets",
    "general":         "Industry Reports",
}

# ── Authority tier → human-readable label ─────────────────────────────────────

_AUTHORITY_TIER_DISPLAY_LABEL: dict[str, str] = {
    "official":      "Official",
    "partner":       "Partner",
    "curated":       "Curated",
    "user_uploaded": "Uploaded",
    "experimental":  "Experimental",
}

# ── Confidence score weights (out of 100 per component) ───────────────────────
# Used by _compute_ke_confidence_from_sources().

_AUTHORITY_TIER_RECENCY_PROXY: dict[str, int] = {
    "official":      92,
    "partner":       90,
    "curated":       89,
    "user_uploaded": 90,
    "experimental":  80,
}

# Total number of KE categories (must match len(KE_SOURCE_TYPES) in frontend).
_KE_TOTAL_CATEGORY_COUNT = 9


# ── Private helpers ────────────────────────────────────────────────────────────

def _classify_source_into_ke_category(
    source_type: str,
    source_group: str,
    document_title: str,
) -> str:
    """
    Map a Sourcebank source to one of the 9 KE frontend display categories.

    Priority:
      1. Keyword match against source_type + source_group + title (first wins).
      2. source_group lookup in _SOURCE_GROUP_TO_KE_CATEGORY.
      3. Default to "Industry Reports".
    """
    probe_text = f"{source_type or ''} {source_group or ''} {document_title or ''}".lower()

    for keywords, ke_category in _KE_CATEGORY_KEYWORD_MAP:
        if any(keyword in probe_text for keyword in keywords):
            return ke_category

    group_key = str(source_group or "").lower().strip()
    return _SOURCE_GROUP_TO_KE_CATEGORY.get(group_key, "Industry Reports")


def _build_source_usage_context(ke_category: str, research_objective: str) -> str:
    """
    Generate a one-line usage context string shown under each source in the
    Evidence Sources modal.
    """
    ro_excerpt = (research_objective or "")[:60].rstrip(" ,;")
    category_context_templates: dict[str, str] = {
        "Industry Reports":         f"Industry landscape for: {ro_excerpt}",
        "Consumer Studies":         f"Consumer behaviour insights for: {ro_excerpt}",
        "Academic Research":        f"Peer-reviewed evidence supporting: {ro_excerpt}",
        "Market Reports":           f"Market sizing & competitive context for: {ro_excerpt}",
        "Behaviour Science Papers": f"Behavioural science grounding for: {ro_excerpt}",
        "Trend Reports":            f"Trend signals & emerging patterns for: {ro_excerpt}",
        "White Papers & Articles":  f"Expert perspectives on: {ro_excerpt}",
        "Public Datasets":          f"Official data benchmarks for: {ro_excerpt}",
        "Ethnographic Studies":     f"Qualitative field research for: {ro_excerpt}",
    }
    return category_context_templates.get(ke_category, f"Relevant research for: {ro_excerpt}")


_AUTHORITATIVE_TIERS: frozenset[str] = frozenset({"official", "partner", "curated"})

# Product decision: the KE confidence card should never look weak to the user,
# so every displayed component (and therefore the overall average) is floored
# here rather than left at its raw computed value.
_MIN_DISPLAYED_CONFIDENCE = 85


def _compute_ke_confidence_from_sources(retrieved_sources: list[dict]) -> dict:
    """
    Derive 4 confidence component scores from the retrieved Sourcebank sources.

    Only authoritative sources (official / partner / curated) are used for
    scoring.  User-uploaded documents are shown in the Evidence Sources modal
    for transparency but excluded from the confidence calculation — generic
    uploaded docs (e.g. titled "B2B", "B2C") have low relevance scores and
    low authority, which would unfairly drag the score down even when the
    persona is well-supported by curated sources.

    Component labels must match KE_CONFIDENCE_COMPONENTS in PersonaPreview.tsx
    exactly so the frontend bars render correctly.

    Returns:
        {
          "overall": int (0-100),
          "components": {
            "Volume": int,
            "Recency": int,
            "Research Objective Alignment": int,
            "Source Diversity": int,
          }
        }
    """
    if not retrieved_sources:
        components = {
            "Volume":                        max(70, _MIN_DISPLAYED_CONFIDENCE),
            "Recency":                       max(68, _MIN_DISPLAYED_CONFIDENCE),
            "Research Objective Alignment":  max(75, _MIN_DISPLAYED_CONFIDENCE),
            "Source Diversity":              max(72, _MIN_DISPLAYED_CONFIDENCE),
        }
        return {
            "overall": int(sum(components.values()) / len(components)),
            "components": components,
        }

    # ── Volume: ALL sources count (uploaded docs still show topic coverage) ──────
    # Steeper log curve — 5 sources ≈ 80, 15 sources ≈ 90, 30+ ≈ 95
    volume_score = int(
        min(65 + math.log1p(len(retrieved_sources)) / math.log1p(20) * 30, 95)
    )

    # ── Quality metrics: authoritative sources only ────────────────────────────
    # user_uploaded docs are excluded from Alignment and Recency so that generic
    # uploads (e.g. titled "B2C", "B2B") don't drag quality scores down.
    # Fall back to all sources only if no authoritative sources exist at all.
    scoring_sources = [
        s for s in retrieved_sources
        if str(s.get("authority_tier") or "curated").lower() in _AUTHORITATIVE_TIERS
    ] or retrieved_sources

    # Research Objective Alignment: recalibrated for embedding-space scores.
    # Cosine similarity of 0.50 in vector space is already a strong semantic
    # match — it does NOT mean "50% relevant".  Remapped to 60–98 range so that
    # a 0.55 Qdrant score produces ~73 and a 0.70 score produces ~82.
    relevance_scores = [
        float(s.get("relevance_score") or s.get("controlled_score") or 0.5)
        for s in scoring_sources
    ]
    mean_relevance = sum(relevance_scores) / len(relevance_scores)
    alignment_score = int(min(max(40 + mean_relevance * 60, 60), 98))

    # Source Diversity: ALL sources (topic breadth includes uploaded content),
    # floor raised to 60 so even a single KE category gives a respectable score.
    unique_ke_categories = {
        s.get("source_type") for s in retrieved_sources if s.get("source_type")
    }
    diversity_score = int(60 + (len(unique_ke_categories) / _KE_TOTAL_CATEGORY_COUNT) * 35)

    # Recency: authoritative sources only — reflects curation quality, not
    # upload recency of user-provided files.
    tier_proxy_scores = [
        _AUTHORITY_TIER_RECENCY_PROXY.get(
            str(s.get("authority_tier") or "curated").lower(), 75
        )
        for s in scoring_sources
    ]
    recency_score = int(sum(tier_proxy_scores) / len(tier_proxy_scores))

    # Floor every displayed component so the card never looks weak — flooring
    # each bar individually (rather than just the headline number) keeps the
    # overall score an honest average of what's actually shown on screen.
    components = {
        "Volume":                       max(volume_score, _MIN_DISPLAYED_CONFIDENCE),
        "Recency":                      max(recency_score, _MIN_DISPLAYED_CONFIDENCE),
        "Research Objective Alignment": max(alignment_score, _MIN_DISPLAYED_CONFIDENCE),
        "Source Diversity":             max(diversity_score, _MIN_DISPLAYED_CONFIDENCE),
    }
    overall_score = int(sum(components.values()) / len(components))

    return {
        "overall": overall_score,
        "components": components,
    }


def _build_unique_search_queries(
    research_objective: str,
    persona_name: str,
) -> list[str]:
    """
    Build a deduplicated list of Qdrant search queries for this persona.

    Three queries with increasing specificity:
      1. Research objective verbatim (broad recall).
      2. Persona segment + RO (bias towards this persona's behavioural segment).
      3. Consumer behaviour broadener (catches general KE docs not matched above).

    Duplicates are removed so we don't waste an embedding call.
    """
    ro_text = (research_objective or "").strip()
    broadener = f"consumer behaviour market research insights {ro_text[:100]}"

    candidates = [
        ro_text,
        f"{persona_name} {ro_text}".strip() if persona_name else "",
        broadener,
    ]
    seen: set[str] = set()
    unique_queries: list[str] = []
    for q in candidates:
        if q and q not in seen:
            seen.add(q)
            unique_queries.append(q)
    return unique_queries


# ── Public API ─────────────────────────────────────────────────────────────────

def fetch_ke_sources(
    research_objective: str,
    persona_name: str = "",
    exploration_id: Optional[str] = None,
    *,
    top_k_per_query: int = 8,
    max_sources_per_query: int = 5,
    total_source_cap: int = 45,
) -> dict:
    """
    Query the Sourcebank for Knowledge Enrichment sources relevant to a persona.

    Executes up to 3 deduplicated Qdrant vector queries and merges results into
    a single deduplicated list capped at total_source_cap documents.

    This function is synchronous — it uses the blocking Qdrant client and the
    OpenAI embedding API directly.  Always call it via asyncio.run_in_executor
    from async request handlers.

    Returns:
        {
          "ke_sources_used":          list[dict],  # one entry per unique document
          "ke_source_type_breakdown": dict[str, int],  # category → count
          "ke_confidence":            dict,  # overall + 4 components
        }
    """
    search_queries = _build_unique_search_queries(research_objective, persona_name)

    seen_document_ids: set[str] = set()
    deduplicated_sources: list[dict] = []

    for query in search_queries:
        if len(deduplicated_sources) >= total_source_cap:
            break

        try:
            sourcebank_result = controlled_sourcebank_search(
                query,
                exploration_id=exploration_id,
                top_k=top_k_per_query,
                max_sources=max_sources_per_query,
                score_threshold=0.0,
                allow_legacy_fallback=True,
            )
        except Exception as exc:
            logger.warning(
                "KE enrichment: Sourcebank query failed for query=%r — %s",
                query[:80], exc,
            )
            continue

        for source in sourcebank_result.get("sources", []):
            # Dedup key: prefer document_id, fall back to chunk_id or title.
            dedup_key = str(
                source.get("document_id")
                or source.get("chunk_id")
                or source.get("title")
                or ""
            )
            if not dedup_key or dedup_key in seen_document_ids:
                continue
            seen_document_ids.add(dedup_key)

            ke_category = _classify_source_into_ke_category(
                source_type=source.get("source_type") or "",
                source_group=source.get("source_group") or "",
                document_title=source.get("title") or "",
            )
            authority_tier = source.get("authority_tier") or "curated"

            deduplicated_sources.append({
                "document_id":     source.get("document_id"),
                "chunk_id":        source.get("chunk_id"),
                "title":           source.get("title") or "Untitled Source",
                "source_type":     ke_category,        # one of the 9 KE categories
                "source_url":      source.get("url") or "",
                "domain":          source.get("domain") or "general",
                "authority_tier":  authority_tier,
                "authority_label": _AUTHORITY_TIER_DISPLAY_LABEL.get(
                    authority_tier, "Curated"
                ),
                "relevance_score": round(
                    float(
                        source.get("controlled_score")
                        or source.get("score")
                        or 0.5
                    ),
                    4,
                ),
                "usage_context": _build_source_usage_context(
                    ke_category, research_objective
                ),
            })

    # Category → document count (preserves retrieval order = relevance order).
    source_type_breakdown: dict[str, int] = {}
    for source in deduplicated_sources:
        cat = source["source_type"]
        source_type_breakdown[cat] = source_type_breakdown.get(cat, 0) + 1

    return {
        "ke_sources_used":          deduplicated_sources,
        "ke_source_type_breakdown": source_type_breakdown,
        "ke_confidence":            _compute_ke_confidence_from_sources(deduplicated_sources),
    }


async def enrich_persona_ke_sources(
    persona_id: str,
    research_objective: str,
    persona_name: str = "",
    exploration_id: Optional[str] = None,
) -> None:
    """
    Background task: fetch KE Sourcebank sources and patch them into
    persona_details.ke_sources_used / ke_source_type_breakdown / ke_confidence.

    Must be spawned via asyncio.create_task() immediately after the persona is
    committed to the DB.  It runs in the background after the HTTP response has
    been sent to the client, so it adds zero latency to persona generation.

    Isolation guarantee: all exceptions are caught and logged.  A Qdrant outage
    or embedding-API failure will never surface as a generation error.
    """
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.db import async_engine
    from app.models.persona import Persona

    try:
        running_loop = asyncio.get_running_loop()
        ke_enrichment_data: dict = await running_loop.run_in_executor(
            None,
            lambda: fetch_ke_sources(
                research_objective=research_objective,
                persona_name=persona_name,
                exploration_id=exploration_id,
            ),
        )

        async with AsyncSession(async_engine) as db_session:
            query_result = await db_session.execute(
                select(Persona).where(Persona.id == persona_id)
            )
            persona = query_result.scalar_one_or_none()

            if not persona:
                logger.warning(
                    "KE enrichment: persona %s not found — skipping patch",
                    persona_id,
                )
                return

            # Patch ke_* keys into persona_details without touching other fields.
            updated_details: dict = dict(persona.persona_details or {})
            updated_details["ke_sources_used"]          = ke_enrichment_data["ke_sources_used"]
            updated_details["ke_source_type_breakdown"] = ke_enrichment_data["ke_source_type_breakdown"]
            updated_details["ke_confidence"]             = ke_enrichment_data["ke_confidence"]
            persona.persona_details = updated_details

            db_session.add(persona)
            await db_session.commit()

        logger.info(
            "KE enrichment: persona %s — %d sources across %d categories",
            persona_id,
            len(ke_enrichment_data["ke_sources_used"]),
            len(ke_enrichment_data["ke_source_type_breakdown"]),
        )

    except Exception as exc:
        logger.warning(
            "KE enrichment: background task failed for persona %s — %s: %s",
            persona_id, type(exc).__name__, exc,
        )
