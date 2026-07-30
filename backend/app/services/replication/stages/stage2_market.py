"""
Stage 2 — Market Context Injection

Generates an environmental constraint block for the target country.

RETRIEVAL-GROUNDED (Issue 2 fix):
  Before falling back to pure LLM synthesis, Stage 2 now queries the
  existing Qdrant Source Bank via app.rag.retrieve.search_qdrant.
  Retrieved chunks are injected into the prompt as priority-1 data.
  This makes market context grounded in stored evidence rather than
  purely hallucinated.

  Query strategy: build 3 targeted queries from the psychographic core
  and retrieve top-3 each, then deduplicate + inject.

  Graceful degradation: if the Source Bank returns no results (empty
  collection, Qdrant unavailable, etc.), the stage falls back to
  LLM-only synthesis without failing the pipeline.

Client seed inputs (optional): free-text caller-provided market data
takes highest priority — injected before retrieved chunks.

Output: MarketContext
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from openai import AsyncOpenAI

from app.config import OPENAI_API_KEY
from app.services.replication.models import MarketContext, PsychographicCore
from app.services.replication.prompts import STAGE2_SYSTEM, STAGE2_USER
from app.services.replication.utils import parse_llm_json

logger = logging.getLogger(__name__)

_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

# Maximum chunks to inject from retrieval — keep tokens reasonable
_MAX_RETRIEVED_CHUNKS = 5
_RETRIEVAL_SCORE_THRESHOLD = 0.35


async def inject_market_context(
    psychographic_core: PsychographicCore,
    target_country: str,
    seed_inputs: Optional[str] = None,
) -> MarketContext:
    """
    Stage 2: generate target market environmental context.

    Priority order for market intelligence:
    1. Client seed inputs (if provided)
    2. Qdrant Source Bank retrieval
    3. LLM synthesis from training knowledge
    """
    core_json = json.dumps(
        psychographic_core.model_dump(exclude_none=True),
        ensure_ascii=False, default=str,
    )

    # Build intelligence section: seed inputs > retrieved chunks > nothing
    intelligence_section = _build_intelligence_section(
        psychographic_core=psychographic_core,
        target_country=target_country,
        seed_inputs=seed_inputs,
    )

    prompt = STAGE2_USER.format(
        target_country=target_country,
        psychographic_core_json=core_json,
        seed_inputs_section=intelligence_section,
    )

    response = await _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": STAGE2_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    parsed = parse_llm_json(response.choices[0].message.content, stage="Stage 2")

    try:
        ctx = MarketContext(
            target_country=target_country,
            income_tier=parsed.get("income_tier", ""),
            trust_mechanisms=_to_list(parsed.get("trust_mechanisms")),
            status_signal_vocabulary=_to_list(parsed.get("status_signal_vocabulary")),
            community_infrastructure=_to_list(parsed.get("community_infrastructure")),
            brand_landscape=_to_list(parsed.get("brand_landscape")),
            logistics_baseline=parsed.get("logistics_baseline", ""),
            quality_signal_vocabulary=_to_list(parsed.get("quality_signal_vocabulary")),
            price_segment=parsed.get("price_segment", ""),
            friction_sources=_to_list(parsed.get("friction_sources")),
        )
    except Exception as exc:
        logger.error("Stage 2: model validation error — %s", exc)
        raise ValueError(f"Stage 2 response failed validation: {exc}") from exc

    logger.debug(
        "Stage 2 complete: country=%r, trust_mechanisms=%d, friction_sources=%d",
        target_country, len(ctx.trust_mechanisms), len(ctx.friction_sources),
    )
    return ctx


def _build_intelligence_section(
    psychographic_core: PsychographicCore,
    target_country: str,
    seed_inputs: Optional[str],
) -> str:
    """
    Build the intelligence section injected into the Stage 2 prompt.

    Assembles: client seed inputs (priority 1) + retrieved Source Bank
    evidence (priority 2). Falls back to empty string if neither available.
    """
    parts: list[str] = []

    # Priority 1: client-provided seed inputs
    if seed_inputs and seed_inputs.strip():
        parts.append(
            "CLIENT SEED INPUTS (highest priority — use this data directly):\n"
            + seed_inputs.strip()
        )

    # Priority 2: Source Bank retrieval
    retrieved = _retrieve_market_evidence(psychographic_core, target_country)
    if retrieved:
        evidence_text = "\n\n".join(
            f"[Source: {r.get('document_title', 'Unknown')}]\n"
            + (r.get("content") or r.get("content_preview") or "")[:400]
            for r in retrieved
        )
        parts.append(
            f"SOURCE BANK EVIDENCE for {target_country} (use as priority 2 if relevant):\n"
            + evidence_text
        )

    return "\n\n".join(parts) if parts else ""


def _retrieve_market_evidence(
    core: PsychographicCore,
    target_country: str,
) -> list[dict]:
    """
    Query the Qdrant Source Bank for market-relevant evidence.

    Builds 2 targeted queries from the psychographic core and deduplicates.
    Returns up to _MAX_RETRIEVED_CHUNKS results. Returns [] on any error
    (graceful degradation — Stage 2 falls back to LLM synthesis).
    """
    try:
        from app.rag.retrieve import search_qdrant
    except ImportError:
        logger.debug("Stage 2: RAG module not available — using LLM-only synthesis")
        return []

    archetype = core.behavioral_archetype or ""
    split_keywords = " ".join(
        v for v in [
            core.split_traits.trust_building_need,
            core.split_traits.community_belonging_need,
            core.split_traits.status_signaling_drive,
        ] if v
    )

    queries = [
        f"consumer behavior {target_country} {archetype}",
        f"market context trust community platform {target_country} {split_keywords}",
    ]

    seen_ids: set[str] = set()
    results: list[dict] = []

    for query in queries:
        if len(results) >= _MAX_RETRIEVED_CHUNKS:
            break
        try:
            hits = search_qdrant(
                query,
                domain=None,
                top_k=3,
                score_threshold=_RETRIEVAL_SCORE_THRESHOLD,
                allow_unfiltered_fallback=True,
            )
            for hit in hits:
                doc_id = str(hit.get("document_id") or hit.get("chunk_id") or "")
                if doc_id and doc_id in seen_ids:
                    continue
                seen_ids.add(doc_id)
                results.append(hit)
                if len(results) >= _MAX_RETRIEVED_CHUNKS:
                    break
        except Exception as exc:
            logger.warning("Stage 2: retrieval query failed (%r) — %s", query[:50], exc)
            continue

    logger.debug(
        "Stage 2 retrieval: country=%r, chunks_retrieved=%d",
        target_country, len(results),
    )
    return results


def _to_list(value: Any) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if v]
    if isinstance(value, str):
        return [value] if value.strip() else []
    return []
