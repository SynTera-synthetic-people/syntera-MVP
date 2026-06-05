"""
Shared utilities for the Persona Replication Engine.

Centralizes:
  - tolerant LLM JSON response parsing
  - source persona schema extraction: field names only, no values
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def parse_llm_json(raw: str | None, stage: str) -> dict:
    """
    Parse a JSON object returned by an LLM.

    Handles common failure modes:
      - None or empty response
      - JSON wrapped in markdown code fences
      - short wrapper text before or after the JSON object

    Raises ValueError with a stage label so the API can return a useful error.
    """
    if not raw or not raw.strip():
        raise ValueError(f"{stage}: LLM returned empty response")

    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        lines = lines[1:] if lines else []
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            logger.error(
                "%s: JSON object not found len=%d\nRaw head: %.500s\nRaw tail: %.500s",
                stage,
                len(raw),
                raw,
                raw[-500:],
            )
            raise ValueError(f"{stage}: LLM returned invalid JSON object")
        try:
            parsed = json.loads(text[start:end + 1])
        except json.JSONDecodeError as exc:
            logger.error(
                "%s: JSON parse error: %s len=%d\nRaw head: %.500s\nRaw tail: %.500s",
                stage,
                exc,
                len(raw),
                raw,
                raw[-500:],
            )
            raise ValueError(f"{stage}: LLM returned invalid JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise ValueError(f"{stage}: LLM returned {type(parsed).__name__}, expected dict")

    return parsed


_ANCHOR_FIELD_KEYS: frozenset[str] = frozenset({
    "ocean_profile",
    "ocean_scores",
    "OCEAN",
    "schwartz_values",
    "behavioral_archetype",
    "say_do_gap",
    "decision_making_style",
    "risk_tolerance_posture",
    "emotional_response_profile",
})

_EXCLUDED_SCHEMA_KEYS: frozenset[str] = frozenset({
    "evidence_snapshot",
    "calibration_breakdown",
    "auto_fill_report",
    "raw_traits",
    "raw_form_payload",
    "confidence_scoring",
    "replication_mode",
    "replication_artifacts",
})

_SCHEMA_SENTINEL = "<derive_from_target_market>"


def extract_schema_contract(source_persona_details: dict[str, Any]) -> dict[str, Any]:
    """
    Build a source-schema contract without leaking source market values.

    Every non-anchor field key from the source is preserved, but every value is
    replaced with a sentinel. Stage 3 can see the desired output shape, not the
    original market expressions.
    """
    contract: dict[str, Any] = {}

    for key, value in source_persona_details.items():
        if key in _ANCHOR_FIELD_KEYS or key in _EXCLUDED_SCHEMA_KEYS:
            continue

        if isinstance(value, dict):
            contract[key] = _sentinel_dict(value)
        elif isinstance(value, list):
            contract[key] = [_SCHEMA_SENTINEL] if value else []
        else:
            contract[key] = _SCHEMA_SENTINEL

    return contract


def _sentinel_dict(payload: dict) -> dict:
    result = {}
    for key, value in payload.items():
        if key in _EXCLUDED_SCHEMA_KEYS:
            continue
        if isinstance(value, dict):
            result[key] = _sentinel_dict(value)
        elif isinstance(value, list):
            result[key] = [_SCHEMA_SENTINEL] if value else []
        else:
            result[key] = _SCHEMA_SENTINEL
    return result
