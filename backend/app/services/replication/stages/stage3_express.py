"""
Stage 3 — Re-Expression Engine

Rebuilds the persona for the target market using ONLY:
  1. Locked PsychographicCore (Stage 1)
  2. MarketContext (Stage 2)
  3. Schema contract — field NAMES only, no source values

ARCHITECTURE CONTRACT (Issue 1 fix):
  Stage 3 MUST NOT receive any source market expressions.
  The third input is a schema_contract — a dict where every value
  is a sentinel placeholder string. No source brands, geographies,
  platforms, logistics, or indexed traits cross the Stage 3 boundary.

  Anchor enforcement happens POST-GENERATION: even if the LLM
  drifts on anchor fields, _enforce_anchor_locks() overwrites them.

Model: gpt-4o — re-expression requires behavioral simulation quality.
"""

from __future__ import annotations

import logging
from typing import Any

from openai import AsyncOpenAI

from app.config import OPENAI_API_KEY
from app.services.replication.models import (
    MarketContext,
    PsychographicCore,
    ReplicatedTraits,
)
from app.services.replication.prompts import STAGE3_SYSTEM, STAGE3_USER
from app.services.replication.utils import parse_llm_json

import json

logger = logging.getLogger(__name__)

_client = AsyncOpenAI(api_key=OPENAI_API_KEY)


def _to_str(value: Any) -> str | None:
    """Coerce LLM output to str. Joins lists with ', '; passes str/None through."""
    if value is None:
        return None
    if isinstance(value, list):
        return ", ".join(str(v) for v in value if v)
    return str(value) if not isinstance(value, str) else value


async def re_express_persona(
    psychographic_core: PsychographicCore,
    market_context: MarketContext,
    schema_contract: dict[str, Any],
) -> ReplicatedTraits:
    """
    Stage 3: rebuild the persona for the target market.

    Parameters
    ----------
    psychographic_core : PsychographicCore
        Locked Stage 1 output. Zero market expressions.
    market_context : MarketContext
        Stage 2 environmental constraint block for the target country.
    schema_contract : dict
        Field names extracted from the source persona with ALL values
        replaced by sentinel placeholders (see utils.extract_schema_contract).
        This tells the LLM WHAT fields to emit without revealing any
        source market content.
    """
    core_json = json.dumps(
        psychographic_core.model_dump(exclude_none=True),
        ensure_ascii=False, default=str,
    )
    context_json = json.dumps(
        market_context.model_dump(exclude_none=True),
        ensure_ascii=False, default=str,
    )
    schema_json = json.dumps(schema_contract, ensure_ascii=False, default=str)

    prompt = STAGE3_USER.format(
        target_country=market_context.target_country,
        psychographic_core_json=core_json,
        market_context_json=context_json,
        source_schema_json=schema_json,
    )

    response = await _client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": STAGE3_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        temperature=0.5,
        response_format={"type": "json_object"},
    )

    full_persona = parse_llm_json(
        response.choices[0].message.content, stage="Stage 3"
    )

    # Enforce anchor locks: overwrite any fields the LLM may have changed
    full_persona = _enforce_anchor_locks(full_persona, psychographic_core)

    traits = ReplicatedTraits(
        income_bracket=_to_str(full_persona.get("income_range")),
        occupation=_to_str(full_persona.get("occupation")),
        family_structure=_to_str(full_persona.get("family_size")),
        geography=_to_str(full_persona.get("geography")) or market_context.target_country,
        lifestyle=_to_str(full_persona.get("lifestyle")),
        values_expression=_to_str(full_persona.get("values")),
        interests=full_persona.get("interests") if isinstance(
            full_persona.get("interests"), list
        ) else None,
        motivations=_to_str(full_persona.get("motivations")),
        trust_building_expression=_to_str(full_persona.get("trust_building_expression")),
        status_expression=_to_str(full_persona.get("status_expression")),
        community_expression=_to_str(full_persona.get("digital_activity")),
        quality_expression=_to_str(full_persona.get("brand_sensitivity")),
        price_sensitivity_range=_to_str(full_persona.get("price_sensitivity")),
        brand_vocabulary=full_persona.get("brand_vocabulary"),
        friction_sources=full_persona.get("friction_sources"),
        key_triggers=full_persona.get("purchase_triggers"),
        primary_barriers=full_persona.get("purchase_barriers"),
        full_persona_json=full_persona,
    )

    logger.debug(
        "Stage 3 complete: country=%r, persona_name=%r",
        market_context.target_country,
        full_persona.get("name"),
    )
    return traits


def _enforce_anchor_locks(
    generated: dict,
    core: PsychographicCore,
) -> dict:
    """
    Post-generation safety net: restore all anchor field values from the
    locked psychographic core.

    This is a hard override — the LLM's output for these fields is discarded.
    The only authoritative source for anchor values is the PsychographicCore.
    """
    if core.ocean_profile:
        flat = core.ocean_profile.model_dump(exclude_none=True)
        labels = {
            k: ("High" if v >= 0.7 else "Medium" if v >= 0.4 else "Low")
            for k, v in flat.items()
        }
        generated["ocean_profile"] = {"scores": flat, "labels": labels}
    if core.schwartz_values:
        generated["schwartz_values"] = core.schwartz_values
    if core.behavioral_archetype:
        generated["behavioral_archetype"] = core.behavioral_archetype
    if core.say_do_gap:
        generated["say_do_gap"] = core.say_do_gap
    if core.decision_making_style:
        generated["decision_making_style"] = core.decision_making_style
    if core.risk_tolerance_posture:
        generated["risk_tolerance_posture"] = core.risk_tolerance_posture
    if core.emotional_response_profile:
        generated["emotional_response_profile"] = core.emotional_response_profile
    return generated
