"""Stage 4 (quant) of the artifact pipeline: population simulation grounded
in the asset dissection, instead of one persona giving one individual answer.

Deliberately a thin adapter over app.services.survey_simulation_combined's
existing brain-archetype simulation engine rather than a parallel
reimplementation — that module already has tested, tuned logic for
OCEAN-driven personality-flavor variation, say-do-gap response splitting,
per-persona LLM calls with usage tracking, and LLM-failure fallback. The only
genuinely new work here is:
  1. Converting the artifact questionnaire's rating-scale questions (Stage 3
     output, "scale": "1-10") into the single-select {options/option_schema}
     shape that engine's prompt builder expects, treating each integer on
     the scale as one discrete choice.
  2. Grounding the simulation prompt in the asset dissection (Stage 1
     output) by folding it into the research-objective description text,
     since the reused engine has no asset-specific parameter of its own.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, Optional

from app.schemas.artifact_pipeline import ComparisonMode, PipelineStageError
from app.services.survey_simulation_combined import (
    _call_single_brain_llm,
    _fetch_digital_brain_context,
    _flatten_questions,
    _combine_persona_results,
)
from app.utils.survey_results_normalize import build_normalized_survey_results

logger = logging.getLogger(__name__)


def _artifact_questions_to_sections(questionnaire: dict) -> list[dict]:
    """DiscussionGuide.model_dump() (run_type=quant) -> questions_sections
    shape survey_simulation_combined._flatten_questions() expects.

    Each rating question's "scale" (e.g. "1-10") becomes a single-select
    question with one discrete option per integer on the scale.
    """
    sections: list[dict] = []
    for section in questionnaire.get("sections", []):
        questions = []
        for q in section.get("questions", []):
            scale = q.get("scale") or "1-10"
            try:
                lo_str, hi_str = scale.split("-", 1)
                lo, hi = int(lo_str), int(hi_str)
            except (ValueError, AttributeError):
                lo, hi = 1, 10
            options = [str(i) for i in range(lo, hi + 1)]
            questions.append({
                "id": None,
                "question_key": None,
                "question_type": "single_select",
                "text": q.get("question", ""),
                "options": options,
                "option_schema": options,
                "config": {},
            })
        sections.append({"questions": questions})
    return sections


def _build_asset_context_block(
    asset_dissections: dict[str, dict],
    comparison_mode: ComparisonMode,
) -> str:
    """Same dissection-grounding text persona_response.py already builds for
    the qual flow, reused here so the population-simulation prompt is
    grounded in the actual asset too, not just the RO."""
    if comparison_mode == ComparisonMode.COMPARISON and len(asset_dissections) > 1:
        ordered_keys = sorted(
            asset_dissections.keys(),
            key=lambda k: int(k.rsplit("_", 1)[-1]) if k.rsplit("_", 1)[-1].isdigit() else k,
        )
        assets_text = "\n\n".join(
            f"Asset {i + 1}: message={d.get('overall_message')!r} tone={d.get('overall_tone')!r} "
            f"cta={d.get('cta')!r} structure={d.get('visual_structure')!r}"
            for i, key in enumerate(ordered_keys)
            for d in [asset_dissections[key]]
        )
        return f"ARTIFACTS BEING COMPARED ({len(asset_dissections)}):\n{assets_text}"

    first = next(iter(asset_dissections.values()), {})
    return (
        "ARTIFACT BEING EVALUATED:\n"
        f"Message: {first.get('overall_message')}\n"
        f"Tone: {first.get('overall_tone')}\n"
        f"CTA: {first.get('cta')}\n"
        f"Visual structure: {first.get('visual_structure')}"
    )


async def simulate_artifact_population_responses(
    run_id: str,
    exploration_id: str,
    workspace_id: str,
    ro_description: str,
    asset_dissections: dict[str, dict],
    questionnaire: dict,
    comparison_mode: ComparisonMode,
    personas_selection: list[dict],
    created_by: Optional[str] = None,
) -> dict[str, Any]:
    """
    personas_selection: [{"persona_id": str, "sample_size": int}, ...]

    Returns:
    {
      "results": {question_text: [{"option","count","pct"}]},
      "personas_simulated": [{"persona_id","persona_name","sample_size","percentage"}],
      "total_sample_size": int,
      "narrative": {"summary": "...", "personas": [...]},
    }
    """
    if not personas_selection:
        raise PipelineStageError("population_simulation", "personas_selection must not be empty")

    total_sample = sum(p.get("sample_size", 0) for p in personas_selection)
    if total_sample <= 0:
        raise PipelineStageError("population_simulation", "total sample size must be greater than 0")

    questions_sections = _artifact_questions_to_sections(questionnaire)
    flat_questions = _flatten_questions(questions_sections)
    if not flat_questions:
        raise PipelineStageError("population_simulation", "questionnaire has no questions")

    asset_block = _build_asset_context_block(asset_dissections, comparison_mode)
    grounded_ro_description = f"{ro_description}\n\n{asset_block}"

    request_id = uuid.uuid4().hex

    async def _simulate_one(p_sel: dict) -> dict:
        persona_id = p_sel["persona_id"]
        sample_size = p_sel["sample_size"]

        ctx = await _fetch_digital_brain_context(persona_id)
        if not ctx:
            raise PipelineStageError("population_simulation", f"persona {persona_id} not found")

        data = await _call_single_brain_llm(
            research_objective_desc=grounded_ro_description,
            research_objective_data=ctx["research_objective_data"],
            brain_assignment=ctx["brain_assignment"],
            evidence=ctx["evidence"],
            say_do_gap=ctx["say_do_gap"],
            ocean=ctx["ocean"],
            sample_size=sample_size,
            flat_questions=flat_questions,
            exploration_id=exploration_id,
            workspace_id=workspace_id,
            persona_id=persona_id,
            created_by=created_by,
            request_id=request_id,
        )
        # _call_single_brain_llm already falls back to a deterministic uniform
        # distribution internally on any LLM/parse failure — never raises.
        normalized = build_normalized_survey_results(
            data.get("question_results", []), flat_questions, sample_size,
        )
        return {
            "persona_id": persona_id,
            "persona_name": ctx["persona"].get("name", "Unknown"),
            "sample_size": sample_size,
            "normalized": normalized,
        }

    per_persona = await asyncio.gather(*(_simulate_one(p) for p in personas_selection))

    combined_results = _combine_persona_results(
        [p["normalized"] for p in per_persona], flat_questions, total_sample,
    )

    personas_simulated = [
        {
            "persona_id": p["persona_id"],
            "persona_name": p["persona_name"],
            "sample_size": p["sample_size"],
            "percentage": round(100.0 * p["sample_size"] / total_sample, 1) if total_sample else 0.0,
        }
        for p in per_persona
    ]

    logger.info(
        "Run %s: population simulation complete — %d persona(s), %d total sample",
        run_id, len(personas_selection), total_sample,
    )

    return {
        "results": combined_results,
        "personas_simulated": personas_simulated,
        "total_sample_size": total_sample,
        "narrative": {
            "summary": (
                f"Population distribution across {len(personas_selection)} persona "
                f"cohort(s) ({total_sample} total simulated respondents), grounded in "
                "the dissected asset."
            ),
            "personas": personas_simulated,
        },
    }
