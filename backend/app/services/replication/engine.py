"""
Persona Replication Engine — Orchestrator

Routes between:
  FAST_LOCALIZATION    — legacy single-prompt geo-adaptation (gpt-4o-mini)
                         Preserves 100% of existing behavior.
  DEEP_PSYCHOGRAPHIC   — 5-stage psychographic reconstruction pipeline

Returns a fully-populated ReplicationArtifact regardless of mode.
In fast mode only metadata is set; core/context/divergence/confidence are None.
In deep mode all stages run and all artifacts are populated.

The caller (persona.py service) is responsible for writing the output
to the DB — this module produces no side effects.
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

from openai import AsyncOpenAI

from app.config import OPENAI_API_KEY
from app.services.replication.models import (
    ReplicationArtifact,
    ReplicationMetadata,
)
from app.services.replication.prompts import FAST_LOCALIZATION_PATCH_PROMPT
from app.services.replication.stages import (
    extract_psychographic_core,
    generate_divergence_flags,
    inject_market_context,
    re_express_persona,
    re_score_confidence,
)
from app.services.replication.utils import extract_schema_contract, parse_llm_json
from app.services.llm_usage_tracker import record_llm_usage, extract_usage_openai_chat

logger = logging.getLogger(__name__)

_client = AsyncOpenAI(api_key=OPENAI_API_KEY)


def _persona_context(source_persona: dict[str, Any]) -> dict[str, Optional[str]]:
    """Extracts exploration_id/workspace_id/persona_id/created_by from a
    persona_to_dict()-shaped dict, so every replication stage can tag its
    usage rows without new params threaded in from further up the call chain."""
    return {
        "exploration_id": source_persona.get("exploration_id"),
        "workspace_id": source_persona.get("workspace_id"),
        "persona_id": source_persona.get("id"),
        "created_by": source_persona.get("created_by"),
    }


class ReplicationResult:
    """
    Returned to the calling service.

    adapted_persona_json  — the full persona JSON to write into the DB
    artifact              — full ReplicationArtifact to store in replication_artifacts
    confidence_int        — integer 0-100 for the calibration_confidence column
    """

    def __init__(
        self,
        adapted_persona_json: dict,
        artifact: ReplicationArtifact,
        confidence_int: int,
    ) -> None:
        self.adapted_persona_json = adapted_persona_json
        self.artifact = artifact
        self.confidence_int = confidence_int


async def replicate(
    source_persona: dict[str, Any],
    target_country: str,
    mode: str = "full_replication",
    seed_inputs: Optional[str] = None,
) -> ReplicationResult:
    """
    Main entry point.

    source_persona: the full persona dict as returned by persona_to_dict()
    target_country: human-readable country name (e.g. "India", "USA")
    mode: "full_replication" | "anchor_preview" | legacy aliases
    seed_inputs: optional free-text client data about the target market
    """
    if mode in {"full_replication", "deep_psychographic"}:
        return await _deep_replicate(
            source_persona,
            target_country,
            seed_inputs,
            metadata_mode="full_replication" if mode == "full_replication" else "deep_psychographic",
        )
    if mode == "anchor_preview":
        return await _anchor_preview(source_persona, target_country, seed_inputs)
    return await _fast_replicate(source_persona, target_country)


# ---------------------------------------------------------------------------
# FAST_LOCALIZATION — preserved legacy behavior
# ---------------------------------------------------------------------------

_FAST_LOCALIZATION_SOURCE_KEYS: tuple[str, ...] = (
    "name",
    "age_range",
    "gender",
    "location_country",
    "location_state",
    "education_level",
    "occupation",
    "income_range",
    "family_size",
    "geography",
    "lifestyle",
    "values",
    "personality",
    "interests",
    "motivations",
    "brand_sensitivity",
    "price_sensitivity",
    "mobility",
    "accommodation",
    "marital_status",
    "daily_rhythm",
    "hobbies",
    "professional_traits",
    "digital_activity",
    "preferences",
    "backstory",
    "decision_making_style",
    "consumption_frequency",
    "purchase_channel",
    "purchase_triggers",
    "purchase_barriers",
    "barriers_pain_points",
    "triggers_opportunities",
    "media_consumption_patterns",
    "digital_behaviour",
    "category_awareness",
    "behavioral_archetype",
    "say_do_gap",
    "risk_tolerance_posture",
    "emotional_response_profile",
    "schwartz_values",
)

_FAST_UPDATE_ALLOWED_KEYS: frozenset[str] = frozenset(_FAST_LOCALIZATION_SOURCE_KEYS)

_FAST_PROMPT_EXCLUDED_KEYS: frozenset[str] = frozenset({
    "persona_details",
    "raw_traits",
    "raw_form_payload",
    "evidence_snapshot",
    "calibration_breakdown",
    "auto_fill_report",
    "confidence_scoring",
    "confidence_calculation_detail",
    "replication_mode",
    "replication_artifacts",
    "created_at",
    "created_by",
    "created_by_name",
    "persona_source",
    "parent_persona_id",
    "auto_generated_persona",
    "calibration_status",
    "calibration_confidence",
    "confidence_score",
})


def _build_fast_source_snapshot(source_persona: dict[str, Any]) -> dict[str, Any]:
    """Build a compact prompt payload from persona-visible fields only."""
    source_details = source_persona.get("persona_details") or {}
    snapshot: dict[str, Any] = {}

    for key in _FAST_LOCALIZATION_SOURCE_KEYS:
        value = source_details.get(key)
        if _is_empty(value):
            value = source_persona.get(key)
        if _is_empty(value):
            continue
        snapshot[key] = _trim_for_prompt(value)

    return snapshot


def _trim_for_prompt(value: Any) -> Any:
    if isinstance(value, str):
        text = value.strip()
        return text[:900] if len(text) > 900 else text
    if isinstance(value, list):
        return [_trim_for_prompt(item) for item in value[:12] if not _is_empty(item)]
    if isinstance(value, dict):
        trimmed: dict[str, Any] = {}
        for key, item in value.items():
            if key in _FAST_PROMPT_EXCLUDED_KEYS or _is_empty(item):
                continue
            trimmed[key] = _trim_for_prompt(item)
            if len(trimmed) >= 12:
                break
        return trimmed
    return value


def _clean_fast_updates(parsed: dict[str, Any], target_country: str) -> dict[str, Any]:
    updates_source = parsed.get("updates") if isinstance(parsed.get("updates"), dict) else parsed
    updates: dict[str, Any] = {}
    for key, value in updates_source.items():
        if key not in _FAST_UPDATE_ALLOWED_KEYS or key in _FAST_PROMPT_EXCLUDED_KEYS:
            continue
        if _is_empty(value):
            continue
        updates[key] = value

    updates["location_country"] = target_country
    if not updates.get("geography"):
        updates["geography"] = target_country
    return updates


def _merge_fast_updates(
    source_persona: dict[str, Any],
    updates: dict[str, Any],
    target_country: str,
) -> dict[str, Any]:
    source_details = source_persona.get("persona_details") or {}
    adapted = dict(source_details)
    if not adapted:
        adapted = {
            key: source_persona.get(key)
            for key in _FAST_LOCALIZATION_SOURCE_KEYS
            if not _is_empty(source_persona.get(key))
        }

    adapted.pop("replication_mode", None)
    adapted.pop("replication_artifacts", None)
    adapted.update(updates)
    adapted["location_country"] = target_country
    adapted["geography"] = adapted.get("geography") or target_country
    return adapted


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


async def _fast_replicate(
    source_persona: dict[str, Any],
    target_country: str,
) -> ReplicationResult:
    """
    Single-prompt lightweight geo-adaptation.

    Identical to the original replicate_persona() prompt logic.
    """
    source_details = source_persona.get("persona_details") or {}
    source_snapshot = _build_fast_source_snapshot(source_persona)
    started_at = time.perf_counter()
    logger.info(
        "replication.fast:start source=%s target=%r source_detail_keys=%d snapshot_keys=%d snapshot_bytes=%d",
        source_persona.get("id", "?"),
        target_country,
        len(source_details),
        len(source_snapshot),
        len(json.dumps(source_snapshot, ensure_ascii=False, default=str)),
    )
    prompt = FAST_LOCALIZATION_PATCH_PROMPT.format(
        source_json=json.dumps(source_snapshot, ensure_ascii=False, default=str),
        target_country=target_country,
    )

    llm_started_at = time.perf_counter()
    response = await _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
        response_format={"type": "json_object"},
        max_tokens=2500,
        timeout=150.0,
    )
    input_tokens, output_tokens, usage_raw = extract_usage_openai_chat(response)
    await record_llm_usage(
        stage="replication_fast",
        provider="openai",
        model="gpt-4o-mini",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        usage_raw=usage_raw,
        **_persona_context(source_persona),
    )
    raw_content = response.choices[0].message.content
    logger.info(
        "replication.fast:llm_done source=%s target=%r elapsed_ms=%d finish_reason=%s response_bytes=%d",
        source_persona.get("id", "?"),
        target_country,
        int((time.perf_counter() - llm_started_at) * 1000),
        response.choices[0].finish_reason,
        len(raw_content or ""),
    )
    parsed_updates = parse_llm_json(raw_content, stage="fast_localization")
    updates = _clean_fast_updates(parsed_updates, target_country)
    adapted = _merge_fast_updates(source_persona, updates, target_country)
    logger.info(
        "replication.fast:patch_applied source=%s target=%r update_keys=%d",
        source_persona.get("id", "?"),
        target_country,
        len(updates),
    )

    artifact = ReplicationArtifact(
        metadata=_build_metadata(
            source_persona_id=source_persona.get("id", ""),
            target_country=target_country,
            mode="fast_localization",
        ),
    )

    source_conf = source_persona.get("calibration_confidence")
    confidence_int = _fast_confidence(adapted, source_conf)

    logger.info(
        "replication.fast:complete source=%s country=%r confidence=%d total_elapsed_ms=%d",
        source_persona.get("id", "?"),
        target_country,
        confidence_int,
        int((time.perf_counter() - started_at) * 1000),
    )
    return ReplicationResult(
        adapted_persona_json=adapted,
        artifact=artifact,
        confidence_int=confidence_int,
    )


def _fast_confidence(adapted: dict, source_confidence: Optional[int]) -> int:
    """Replicate the original confidence extraction logic."""
    from app.services.auto_generated_persona import _extract_calibration_confidence
    conf = _extract_calibration_confidence(adapted)
    if conf:
        return conf
    if source_confidence:
        return source_confidence
    return 75


# ---------------------------------------------------------------------------
# DEEP_PSYCHOGRAPHIC — 5-stage pipeline
# ---------------------------------------------------------------------------

async def _anchor_preview(
    source_persona: dict[str, Any],
    target_country: str,
    seed_inputs: Optional[str],
) -> ReplicationResult:
    """
    Docs v5 Anchor-Only Preview.

    Runs Stage 1 and Stage 2 only. No persona JSON is produced and callers
    should not persist a replicated persona from this result.
    """
    source_id = source_persona.get("id", "")
    source_details = source_persona.get("persona_details") or {}
    source_confidence = source_persona.get("calibration_confidence")
    started_at = time.perf_counter()

    top_level_ocean = source_persona.get("ocean_profile")
    if isinstance(top_level_ocean, dict) and not source_details.get("ocean_profile"):
        source_details = dict(source_details)
        source_details["ocean_profile"] = top_level_ocean

    logger.info(
        "replication.anchor_preview:start source=%s country=%r source_detail_keys=%d",
        source_id,
        target_country,
        len(source_details),
    )

    stage_started_at = time.perf_counter()
    core = await extract_psychographic_core(source_details, **_persona_context(source_persona))
    logger.info(
        "replication.anchor_preview:stage1_core_done source=%s elapsed_ms=%d",
        source_id,
        int((time.perf_counter() - stage_started_at) * 1000),
    )

    stage_started_at = time.perf_counter()
    market_context = await inject_market_context(
        core, target_country, seed_inputs, **_persona_context(source_persona),
    )
    logger.info(
        "replication.anchor_preview:stage2_market_done source=%s elapsed_ms=%d",
        source_id,
        int((time.perf_counter() - stage_started_at) * 1000),
    )

    artifact = ReplicationArtifact(
        metadata=_build_metadata(source_id, target_country, "anchor_preview"),
        psychographic_core=core,
        market_context=market_context,
    )

    logger.info(
        "replication.anchor_preview:complete source=%s country=%r total_elapsed_ms=%d",
        source_id,
        target_country,
        int((time.perf_counter() - started_at) * 1000),
    )
    return ReplicationResult(
        adapted_persona_json={},
        artifact=artifact,
        confidence_int=source_confidence or 75,
    )


async def _deep_replicate(
    source_persona: dict[str, Any],
    target_country: str,
    seed_inputs: Optional[str],
    metadata_mode: str = "full_replication",
) -> ReplicationResult:
    """
    Full 5-stage psychographic reconstruction pipeline.
    """
    source_id = source_persona.get("id", "")
    source_details = source_persona.get("persona_details") or {}
    source_confidence = source_persona.get("calibration_confidence")
    started_at = time.perf_counter()

    # Inject top-level ocean_profile (DB column) into source_details when it isn't
    # already embedded there. This covers personas whose OCEAN was generated by the
    # /preview endpoint and saved only to the ocean_profile column, not persona_details.
    top_level_ocean = source_persona.get("ocean_profile")
    if isinstance(top_level_ocean, dict) and not source_details.get("ocean_profile"):
        source_details = dict(source_details)
        source_details["ocean_profile"] = top_level_ocean

    logger.info(
        "replication.deep:start source=%s country=%r source_detail_keys=%d",
        source_id,
        target_country,
        len(source_details),
    )

    # Stage 1 — extract psychographic core
    stage_started_at = time.perf_counter()
    core = await extract_psychographic_core(source_details, **_persona_context(source_persona))
    logger.info(
        "replication.deep:stage1_core_done source=%s elapsed_ms=%d",
        source_id,
        int((time.perf_counter() - stage_started_at) * 1000),
    )

    # Stage 2 — inject market context
    stage_started_at = time.perf_counter()
    market_context = await inject_market_context(
        core, target_country, seed_inputs, **_persona_context(source_persona),
    )
    logger.info(
        "replication.deep:stage2_market_done source=%s elapsed_ms=%d",
        source_id,
        int((time.perf_counter() - stage_started_at) * 1000),
    )

    # Stage 3 — re-express persona
    # Contract: extract schema (field names only, zero source values) before Stage 3.
    # source_details must NOT be passed to Stage 3 directly — only its structural shape.
    schema_contract = extract_schema_contract(source_details)
    stage_started_at = time.perf_counter()
    replicated_traits = await re_express_persona(
        core, market_context, schema_contract, **_persona_context(source_persona),
    )
    logger.info(
        "replication.deep:stage3_express_done source=%s elapsed_ms=%d",
        source_id,
        int((time.perf_counter() - stage_started_at) * 1000),
    )

    adapted = replicated_traits.full_persona_json
    adapted["name"] = _replicated_expression_name(source_persona, core, target_country)

    # Stage 4 — divergence flags
    stage_started_at = time.perf_counter()
    divergence_report = await generate_divergence_flags(
        source_persona_details=source_details,
        replicated_persona_json=adapted,
        psychographic_core=core,
        target_country=target_country,
        **_persona_context(source_persona),
    )
    logger.info(
        "replication.deep:stage4_diverge_done source=%s flags=%d elapsed_ms=%d",
        source_id,
        len(divergence_report.flags),
        int((time.perf_counter() - stage_started_at) * 1000),
    )

    # Stage 5 — confidence re-scoring (no LLM)
    stage_started_at = time.perf_counter()
    confidence_comparison = re_score_confidence(
        source_confidence=source_confidence,
        source_persona_details=source_details,
        target_country=target_country,
        psychographic_core=core,
    )
    logger.info(
        "replication.deep:stage5_confidence_done source=%s elapsed_ms=%d",
        source_id,
        int((time.perf_counter() - stage_started_at) * 1000),
    )

    # Assemble artifact
    artifact = ReplicationArtifact(
        metadata=_build_metadata(source_id, target_country, metadata_mode),
        psychographic_core=core,
        market_context=market_context,
        divergence_report=divergence_report,
        confidence_comparison=confidence_comparison,
    )

    # Final confidence integer for DB column
    replicated_scores = confidence_comparison.replicated_scores
    confidence_int = replicated_scores.to_int_percent() or source_confidence or 75

    logger.info(
        "replication.deep:complete source=%s country=%r confidence=%d flags=%d total_elapsed_ms=%d",
        source_id,
        target_country,
        confidence_int,
        len(divergence_report.flags),
        int((time.perf_counter() - started_at) * 1000),
    )
    return ReplicationResult(
        adapted_persona_json=adapted,
        artifact=artifact,
        confidence_int=confidence_int,
    )


def _replicated_expression_name(
    source_persona: dict[str, Any],
    core: Any,
    target_country: str,
) -> str:
    source_details = source_persona.get("persona_details") or {}
    raw_name = (
        source_details.get("name")
        or source_persona.get("name")
        or getattr(core, "behavioral_archetype", None)
        or "Replicated Persona"
    )
    base = str(raw_name).split(":")[0].strip() or "Replicated Persona"
    return f"{base}: {target_country} Expression"


def _build_metadata(
    source_persona_id: str,
    target_country: str,
    mode: str,
) -> ReplicationMetadata:
    return ReplicationMetadata(
        source_persona_id=source_persona_id,
        target_country=target_country,
        replication_mode=mode,
        framework_version="v5.0",
        anchor_count=7,
        split_trait_count=6,
        indexed_trait_count=6,
        replication_timestamp=datetime.now(timezone.utc).isoformat(),
    )
