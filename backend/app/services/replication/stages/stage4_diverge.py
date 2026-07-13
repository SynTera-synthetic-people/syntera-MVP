"""
Stage 4 — Divergence Flag Engine
=================================

WHAT THIS STAGE DOES
--------------------
Compares the original (source) persona to the newly built (replicated)
persona and explains WHAT changed and WHY.

The core question it answers:

    Same psychology, different country →
    What behaviors look different, and why?

Example (India → Singapore):

    Trust building:   Asking friends/family  →  Reading LinkedIn reviews
    Status signaling: Gold jewellery          →  Apple products
    Community:        Extended family WhatsApp →  Alumni LinkedIn groups
    Price-value:      Hard bargaining          →  Transparent-pricing apps

Each difference is called a **Divergence Flag**.


HOW IT WORKS
------------

Step 1 — Slim down both personas
    Strip large blobs (evidence, calibration data) to reduce token cost.
    Only behavioural and descriptive fields are sent to the LLM.

Step 2 — First LLM call
    Send source persona + replicated persona + psychographic core to the LLM.
    Ask it to find between 5 and 12 divergence flags.
    Each flag must say:
        - flag_name                  — short label
        - psychological_dimension    — which Split Trait is involved
        - source_market_expression   — how it looks in the original market
        - target_market_expression   — how it looks in the new market
        - impact_level               — HIGH / MEDIUM / LOW
        - strategic_implication      — what this means for the brand/product

Step 3 — Contract check
    The engine enforces a coverage contract.
    All 6 Split Trait categories must have at least one flag:

        trust_building         (trust, proof, certainty…)
        status_signaling       (status, prestige, identity…)
        community_belonging    (community, tribe, belonging…)
        value_consciousness    (value, fairness, deal…)
        quality_consciousness  (quality, spec, certification…)
        social_orientation     (collective, peer, influence…)

    If any category is missing, or fewer than 5 flags were returned →
    go to Step 4.

Step 4 — Retry (only if needed)
    The LLM is called again with an explicit instruction listing the missing
    categories. The new flags are merged into the existing set.
    If coverage is still incomplete after the retry, a WARNING is logged
    and the engine continues (it does not crash the pipeline).

Step 5 — Cap at 12 flags
    Any flags beyond 12 are dropped.

Step 6 — Return DivergenceReport
    A typed object (validated by Pydantic) is returned to the engine.


OUTPUT SCHEMA (one flag)
------------------------

    {
        "flag_name": "Trust-Signal Shift",
        "psychological_dimension": "trust_building — moves from peer word-of-mouth to digital proof",
        "source_market_expression": "Trusts recommendations from extended family and local shop owners",
        "target_market_expression": "Trusts LinkedIn endorsements, Google reviews, certified vendor badges",
        "impact_level": "HIGH",
        "strategic_implication": "Display third-party certifications and verified user reviews prominently"
    }


MODEL USED
----------
gpt-4o-mini — structured analytical comparison, not creative generation.
Low temperature (0.3) so output is consistent and factual.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from openai import AsyncOpenAI

from app.config import OPENAI_API_KEY
from app.services.replication.models import (
    DivergenceFlag,
    DivergenceReport,
    PsychographicCore,
)
from app.services.replication.prompts import STAGE4_SYSTEM, STAGE4_USER
from app.services.replication.utils import parse_llm_json
from app.services.llm_usage_tracker import record_llm_usage, extract_usage_openai_chat

logger = logging.getLogger(__name__)

_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

_VALID_IMPACT = frozenset({"HIGH", "MEDIUM", "LOW"})

# Split-trait keyword groups used to validate coverage
# Each set contains words that, if present in flag_name or psychological_dimension,
# indicate coverage of that split-trait category.
_SPLIT_TRAIT_KEYWORDS: dict[str, frozenset[str]] = {
    "trust_building":      frozenset({"trust", "proof", "certainty", "commit", "deceiv"}),
    "status_signaling":    frozenset({"status", "signal", "identity", "prestige", "insider"}),
    "community_belonging": frozenset({"community", "belonging", "tribe", "validation", "social"}),
    "value_consciousness": frozenset({"value", "overcharg", "fairness", "price-to-quality", "deal"}),
    "quality_consciousness": frozenset({"quality", "spec", "certif", "standard", "material"}),
    "social_orientation":  frozenset({"social orient", "collective", "independent", "influenc", "peer"}),
}


async def generate_divergence_flags(
    source_persona_details: dict[str, Any],
    replicated_persona_json: dict[str, Any],
    psychographic_core: PsychographicCore,
    target_country: str,
    *,
    exploration_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    persona_id: Optional[str] = None,
    created_by: Optional[str] = None,
) -> DivergenceReport:
    """
    Stage 4 entry point.

    Asks the LLM: "Same psychology, different market — what changed?"
    Enforces the split-trait coverage contract and retries once if needed.
    Returns a validated DivergenceReport.
    """
    core_json = json.dumps(
        psychographic_core.model_dump(exclude_none=True),
        ensure_ascii=False, default=str,
    )

    # Slim both personas before sending — removes large evidence blobs
    # so we stay within token budget.
    source_lean = _lean_persona(source_persona_details)
    replicated_lean = _lean_persona(replicated_persona_json)

    base_prompt = STAGE4_USER.format(
        target_country=target_country,
        source_json=json.dumps(source_lean, ensure_ascii=False, default=str),
        replicated_json=json.dumps(replicated_lean, ensure_ascii=False, default=str),
        psychographic_core_json=core_json,
    )

    # --- First LLM call ---
    flags = await _call_and_parse(
        base_prompt, target_country,
        exploration_id=exploration_id, workspace_id=workspace_id,
        persona_id=persona_id, created_by=created_by,
    )

    # --- Contract enforcement ---
    # All 6 split-trait categories must have at least one flag.
    # If any are missing, OR fewer than 5 flags came back → retry.
    missing_categories = _find_missing_split_trait_coverage(flags)

    if missing_categories or len(flags) < 5:
        gap_note = ""
        if missing_categories:
            gap_note = (
                f"\n\nCRITICAL: The following Split Trait categories still need a divergence flag: "
                f"{', '.join(missing_categories)}. "
                f"Add flags specifically covering these categories. "
                f"The psychological dimension must name the split trait explicitly."
            )
        if len(flags) < 5:
            gap_note += f"\nCRITICAL: Only {len(flags)} flags generated. Minimum is 5."

        # --- Retry call — same prompt + explicit gap instruction ---
        retry_prompt = base_prompt + gap_note
        retry_flags = await _call_and_parse(
            retry_prompt, target_country,
            exploration_id=exploration_id, workspace_id=workspace_id,
            persona_id=persona_id, created_by=created_by,
        )

        # Merge: for each missing category, take the first retry flag that covers it.
        # One flag per category is enough; we don't need duplicates.
        covered = {cat for cat in _SPLIT_TRAIT_KEYWORDS if _category_covered(cat, flags)}
        for flag in retry_flags:
            for cat in missing_categories:
                if cat not in covered and _category_covered(cat, [flag]):
                    flags.append(flag)
                    covered.add(cat)
                    break  # one flag per category; move to next retry flag

        # If still below minimum of 5, fill from retry flags (no duplicates).
        if len(flags) < 5:
            needed = 5 - len(flags)
            new_flags = [f for f in retry_flags if f not in flags]
            flags.extend(new_flags[:needed])

        # Log any remaining gaps — pipeline continues, does not raise.
        still_missing = _find_missing_split_trait_coverage(flags)
        if still_missing:
            logger.warning(
                "Stage 4 contract: split-trait coverage still incomplete after retry — "
                "missing: %s (country=%r, flags=%d)",
                still_missing, target_country, len(flags),
            )

    # Hard cap at 12 flags — drop excess.
    flags = flags[:12]

    report = DivergenceReport(target_country=target_country, flags=flags)

    logger.debug(
        "Stage 4 complete: country=%r, flags=%d (HIGH=%d, MEDIUM=%d, LOW=%d)",
        target_country, len(flags),
        sum(1 for f in flags if f.impact_level == "HIGH"),
        sum(1 for f in flags if f.impact_level == "MEDIUM"),
        sum(1 for f in flags if f.impact_level == "LOW"),
    )
    return report


async def _call_and_parse(
    prompt: str, target_country: str,
    *, exploration_id: Optional[str] = None, workspace_id: Optional[str] = None,
    persona_id: Optional[str] = None, created_by: Optional[str] = None,
) -> list[DivergenceFlag]:
    """Single LLM call + parse cycle."""
    response = await _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": STAGE4_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    input_tokens, output_tokens, usage_raw = extract_usage_openai_chat(response)
    await record_llm_usage(
        exploration_id=exploration_id,
        stage="replication_stage4",
        provider="openai",
        model="gpt-4o-mini",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        usage_raw=usage_raw,
        workspace_id=workspace_id,
        persona_id=persona_id,
        created_by=created_by,
    )
    parsed = parse_llm_json(response.choices[0].message.content, stage="Stage 4")
    return _parse_flags(parsed)


def _parse_flags(parsed: dict) -> list[DivergenceFlag]:
    raw_flags = parsed.get("flags") or []
    flags: list[DivergenceFlag] = []
    for item in raw_flags:
        if not isinstance(item, dict):
            continue
        impact = str(item.get("impact_level", "MEDIUM")).upper()
        if impact not in _VALID_IMPACT:
            impact = "MEDIUM"
        try:
            flags.append(DivergenceFlag(
                flag_name=item.get("flag_name", "Unnamed Flag"),
                psychological_dimension=item.get("psychological_dimension", ""),
                source_market_expression=item.get("source_market_expression", ""),
                target_market_expression=item.get("target_market_expression", ""),
                impact_level=impact,
                strategic_implication=item.get("strategic_implication", ""),
            ))
        except Exception as exc:
            logger.warning("Stage 4: skipped malformed flag — %s", exc)
    return flags


def _find_missing_split_trait_coverage(flags: list[DivergenceFlag]) -> list[str]:
    """Return the split-trait category names that have no coverage in flags."""
    missing = []
    for category in _SPLIT_TRAIT_KEYWORDS:
        if not _category_covered(category, flags):
            missing.append(category)
    return missing


def _category_covered(category: str, flags: list[DivergenceFlag]) -> bool:
    """Return True if at least one flag covers the given split-trait category."""
    keywords = _SPLIT_TRAIT_KEYWORDS[category]
    for flag in flags:
        text = (flag.flag_name + " " + flag.psychological_dimension).lower()
        if any(kw in text for kw in keywords):
            return True
    return False


def _lean_persona(details: dict) -> dict:
    """Strip evidence blobs and truncate to reduce token cost."""
    _STRIP = frozenset({
        "evidence_snapshot", "calibration_breakdown", "auto_fill_report",
        "raw_traits", "raw_form_payload", "confidence_scoring",
    })

    def _truncate(v: Any, limit: int = 300) -> Any:
        if isinstance(v, str) and len(v) > limit:
            return v[:limit] + "..."
        if isinstance(v, dict):
            return {k: _truncate(val) for k, val in v.items() if k not in _STRIP}
        if isinstance(v, list):
            return [_truncate(i) for i in v[:8]]
        return v

    return _truncate(details)
