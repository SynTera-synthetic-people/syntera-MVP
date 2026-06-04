"""
Stage 1 — Psychographic Core Extraction

Reads source persona_details JSON and extracts the permanent psychological
blueprint. Uses gpt-4o-mini (cheap model — this is structured extraction,
not creative generation).

Output: PsychographicCore — immutable for all downstream stages.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from openai import AsyncOpenAI

from app.config import OPENAI_API_KEY
from app.services.replication.models import (
    OceanProfile,
    PsychographicCore,
    SplitTraitCore,
)
from app.services.replication.prompts import STAGE1_SYSTEM, STAGE1_USER
from app.services.replication.utils import parse_llm_json

logger = logging.getLogger(__name__)

_client = AsyncOpenAI(api_key=OPENAI_API_KEY)


def _try_extract_ocean(details: dict) -> OceanProfile | None:
    """
    Try to read OCEAN scores from known locations in the source persona.
    Returns None if the source has no usable OCEAN data (LLM will infer).

    Handles two stored formats:
      Flat:   {"openness": 0.75, "conscientiousness": 0.6, ...}
      Nested: {"scores": {"openness": 0.75, ...}, "labels": {...}}
    Both formats are produced by the LLM prompts in this codebase.
    """
    for key in ("ocean_profile", "ocean_scores", "OCEAN"):
        raw = details.get(key)
        if not isinstance(raw, dict):
            continue
        # Nested format: {"scores": {...}, "labels": {...}}
        scores = raw.get("scores") if isinstance(raw.get("scores"), dict) else raw
        profile = OceanProfile(
            openness=scores.get("openness") or scores.get("O"),
            conscientiousness=scores.get("conscientiousness") or scores.get("C"),
            extraversion=scores.get("extraversion") or scores.get("E"),
            agreeableness=scores.get("agreeableness") or scores.get("A"),
            neuroticism=scores.get("neuroticism") or scores.get("N"),
        )
        if any(v is not None for v in (
            profile.openness, profile.conscientiousness,
            profile.extraversion, profile.agreeableness, profile.neuroticism,
        )):
            return profile
    return None


async def extract_psychographic_core(
    source_persona_details: dict[str, Any],
) -> PsychographicCore:
    """
    Stage 1: extract and lock the psychographic core from source persona.

    Any fields the LLM cannot determine from the source are set to None
    rather than hallucinated.
    """
    existing_ocean = _try_extract_ocean(source_persona_details)

    source_json = json.dumps(source_persona_details, ensure_ascii=False, default=str)

    response = await _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": STAGE1_SYSTEM},
            {"role": "user", "content": STAGE1_USER.format(source_json=source_json)},
        ],
        temperature=0.2,   # low temperature — extraction, not generation
        response_format={"type": "json_object"},
    )

    parsed = parse_llm_json(response.choices[0].message.content, stage="Stage 1")

    # Validate + coerce into typed model
    try:
        core = PsychographicCore(
            ocean_profile=OceanProfile(**parsed["ocean_profile"])
            if isinstance(parsed.get("ocean_profile"), dict)
            else existing_ocean,
            schwartz_values=parsed.get("schwartz_values") or [],
            behavioral_archetype=parsed.get("behavioral_archetype"),
            say_do_gap=parsed.get("say_do_gap"),
            decision_making_style=parsed.get("decision_making_style"),
            risk_tolerance_posture=parsed.get("risk_tolerance_posture"),
            emotional_response_profile=parsed.get("emotional_response_profile"),
            split_traits=SplitTraitCore(
                **(parsed.get("split_traits") or {})
            ),
        )
    except Exception as exc:
        logger.error("Stage 1: model validation error — %s\nParsed: %s", exc, parsed)
        raise ValueError(f"Stage 1 response failed validation: {exc}") from exc

    # If we had explicit OCEAN from source and the LLM hallucinated different values,
    # trust the source data over LLM inference.
    if existing_ocean is not None:
        core.ocean_profile = existing_ocean

    logger.debug(
        "Stage 1 complete: archetype=%r, split_traits_set=%d",
        core.behavioral_archetype,
        sum(1 for v in core.split_traits.model_dump().values() if v),
    )
    return core
