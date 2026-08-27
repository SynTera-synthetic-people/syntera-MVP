import asyncio
import json
import logging
import uuid
from typing import Dict, List, Optional, Any
from datetime import datetime
from app.models.survey_simulation import SurveySimulation
from app.utils.id_generator import generate_id
from app.db import async_engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from app.config import OPENAI_API_KEY, settings
from openai import AsyncOpenAI
from app.services.survey_simulation import _group_results_by_section, _fallback_simulation
from app.utils.survey_results_normalize import (
    build_canonical_survey_results,
    build_item_level_results,
    build_normalized_survey_results,
)
from app.services.question_engine import (
    analysis_options_for_question,
    is_verbatim_question_type,
    question_grid_items,
)
from app.neuro import service as neuro_service
from app.services.persona import get_persona
from app.services.auto_generated_persona import get_description
from app.services.llm_usage_tracker import record_llm_usage, extract_usage_openai_chat
from app.services.anti_sycophancy_rules import ANTI_SYCOPHANCY_RULES

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=OPENAI_API_KEY)
_survey_source_locks: Dict[str, asyncio.Lock] = {}

_DEFAULT_BRAIN_ASSIGNMENT = {
    "primary_brain": "Pragmatist",
    "primary_confidence": 0.7,
    "secondary_brain": None,
    "secondary_confidence": None,
    "primary_reasoning": "",
    "secondary_reasoning": "",
}


def _survey_source_lock(source_id: str) -> asyncio.Lock:
    lock = _survey_source_locks.get(source_id)
    if lock is None:
        lock = asyncio.Lock()
        _survey_source_locks[source_id] = lock
    return lock


def _survey_result_payload(
    sim_obj: SurveySimulation,
    questions_sections: List[Dict],
    *,
    llm_source_explanation: Optional[Dict] = None,
) -> Dict:
    results = sim_obj.results if isinstance(sim_obj.results, dict) else {}
    return {
        "id": sim_obj.id,
        "workspace_id": sim_obj.workspace_id,
        "exploration_id": sim_obj.exploration_id,
        "total_sample_size": sim_obj.total_sample_size,
        "personas": (sim_obj.narrative or {}).get("personas", []),
        "sections": _group_results_by_section(questions_sections, results),
        "results": sim_obj.results,
        "normalized_results": sim_obj.normalized_results,
        "narrative": sim_obj.narrative,
        "llm_source_explanation": llm_source_explanation or {},
        "created_at": sim_obj.created_at.isoformat(),
    }


async def _get_existing_by_source(session: AsyncSession, simulation_source_id: str) -> Optional[SurveySimulation]:
    stmt = (
        select(SurveySimulation)
        .where(SurveySimulation.simulation_source_id == simulation_source_id)
        .order_by(SurveySimulation.created_at.desc())
    )
    res = await session.execute(stmt)
    return res.scalars().first()


def _simulation_question_type_code(question_type: Any) -> str:
    qtype = str(question_type or "single_select").lower().strip()
    if qtype in {"m", "multi_select", "grid_multi_select", "reusable_answer_lists"}:
        return "M"
    if qtype in {"oe", "text", "essay", "auto_suggest"}:
        return "OE"
    return "S"


def _format_question_for_prompt(index: int, q: Dict) -> str:
    """Render one question for the prompt in the shape its answer must take.

    Grid and free-text questions need a different answer shape from a flat
    select, so they must be presented differently — a grid listed as a flat
    option list comes back as one distribution for what are really N
    sub-questions, and a free-text question listed with options comes back as
    counts instead of quotes.
    """
    text = q.get("text", "")
    items, scale = question_grid_items(q)

    if items and scale:
        item_lines = "\n".join(f"  {i:02d}. {item}" for i, item in enumerate(items, 1))
        scale_lines = "\n".join(f"  - {s}" for s in scale)
        mode = (
            "each respondent may tick SEVERAL scale options per item"
            if str(q.get("question_type") or "").lower().strip() == "grid_multi_select"
            else "each respondent picks EXACTLY ONE scale option per item"
        )
        return (
            f"Q{index} [GRID]: {text}\n"
            f"Items (answer each one separately, {mode}):\n{item_lines}\n"
            f"Response scale (the ONLY valid answers for every item):\n{scale_lines}"
        )

    if is_verbatim_question_type(q.get("question_type")):
        return f"Q{index} [OE]: {text}\n(Open-ended — no options; answer with verbatim quotes.)"

    opts = q.get("option_schema") or q.get("options") or []
    opts_text = "\n".join(
        f"  - {(o.get('text') if isinstance(o, dict) else o)}" for o in opts
    )
    qtype_code = _simulation_question_type_code(q.get("question_type"))
    return f"Q{index} [{qtype_code}]: {text}\nOptions:\n{opts_text}"


def _flatten_questions(questions_sections: List[Dict]) -> List[Dict]:
    flat_questions = []
    for sec in questions_sections or []:
        for q in sec.get("questions", []):
            # Free-text questions must carry no options: the synthetic
            # reporting buckets analysis_options_for_question() returns for
            # them ("Response provided" / "No response") read as real answer
            # choices in the prompt, and the model then returns counts instead
            # of quotes — leaving the question blank in every export.
            if is_verbatim_question_type(q.get("question_type")):
                options = []
            else:
                options = q.get("options") or analysis_options_for_question(q)
            flat_questions.append({
                "id": q.get("id"),
                "question_key": q.get("question_key") or q.get("id"),
                "question_type": q.get("question_type") or "single_select",
                "text": q.get("text") or "",
                "options": options,
                "option_schema": q.get("option_schema") or (q.get("config") or {}).get("options") or [],
                "config": q.get("config") or {},
            })
    return flat_questions


def _resolve_research_objective(research_objective: Any) -> tuple[str, Any]:
    """Returns (ro_desc, ro_id). Accepts a model with .model_dump(), a plain
    dict, or an arbitrary object with .description/.id attributes — mirrors
    every shape questionnaire.py has historically passed in."""
    if hasattr(research_objective, "model_dump"):
        dumped = research_objective.model_dump()
        return dumped.get("description", ""), dumped.get("id")
    if isinstance(research_objective, dict):
        return research_objective.get("description", ""), research_objective.get("id")
    return (
        str(getattr(research_objective, "description", "") or ""),
        str(getattr(research_objective, "id", "")),
    )


def _extract_ocean_scores(ocean_profile: Optional[Dict]) -> Dict[str, float]:
    """
    Persona.ocean_profile shape is inconsistent across the two persona flows:
    auto-generated personas store a flat dict (digital_brain_pipeline.py's
    layer_1_framework.ocean: {"openness": 0.7, ...}), manual personas store a
    nested {"scores": {...}, "labels": {...}} dict (manual_digital_brain_persona.py).
    This normalizes both into one flat lowercase dict, defaulting missing
    dimensions to 0.5 (neutral).
    """
    ocean_profile = ocean_profile or {}
    raw = ocean_profile.get("scores") if isinstance(ocean_profile.get("scores"), dict) else ocean_profile
    out = {}
    for dim in ("openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"):
        val = raw.get(dim)
        if val is None:
            # Tolerate Title-Case keys from older callers.
            val = raw.get(dim.capitalize())
        try:
            out[dim] = float(val) if val is not None else 0.5
        except (TypeError, ValueError):
            out[dim] = 0.5
    return out


def _build_brain_variation_framework(
    brain_assignment: Dict,
    ocean: Dict[str, float],
) -> Dict:
    """
    Create 3-4 personality flavor descriptions for the brain archetype,
    explaining how individual respondents vary within the same brain.
    Returns {"flavors": [{"name", "trait", "behavior", "example", "estimated_percent"}, ...]}.
    """
    primary_brain = brain_assignment.get("primary_brain") or "Pragmatist"

    flavors = []
    if ocean.get("openness", 0.5) >= 0.7:
        flavors.append({
            "name": f"The Adventurous {primary_brain}",
            "trait": "High openness, seeks novelty and unconventional experiences",
            "behavior": "Tries new things, questions norms, creative",
            "example": "First to try new products/experiences",
            "estimated_percent": round(20 + (ocean.get("openness", 0.5) - 0.5) * 40),
        })
    if ocean.get("conscientiousness", 0.5) >= 0.7:
        flavors.append({
            "name": f"The Disciplined {primary_brain}",
            "trait": "High conscientiousness, organized, planned approach",
            "behavior": "Researches before deciding, follows routines, minimizes risk",
            "example": "Compares options carefully, makes deliberate choices",
            "estimated_percent": round(20 + (ocean.get("conscientiousness", 0.5) - 0.5) * 40),
        })
    if ocean.get("extraversion", 0.5) >= 0.7:
        flavors.append({
            "name": f"The Social {primary_brain}",
            "trait": "High extraversion, people-focused, social validation",
            "behavior": "Values peer input, group experiences, social proof",
            "example": "Influenced by friends' recommendations, prefers group activities",
            "estimated_percent": round(20 + (ocean.get("extraversion", 0.5) - 0.5) * 40),
        })
    if ocean.get("agreeableness", 0.5) >= 0.7:
        flavors.append({
            "name": f"The Cooperative {primary_brain}",
            "trait": "High agreeableness, harmony-focused, considerate",
            "behavior": "Values fairness, avoids conflict, altruistic",
            "example": "Considers impact on others, prioritizes harmony",
            "estimated_percent": round(20 + (ocean.get("agreeableness", 0.5) - 0.5) * 40),
        })

    if len(flavors) < 3:
        presets = {
            "Hedonist": [
                {"name": "The Impulsive Hedonist", "trait": "Immediate gratification", "behavior": "Acts spontaneously", "example": "Buys on a whim", "estimated_percent": 28},
                {"name": "The Social Hedonist", "trait": "Group pleasure", "behavior": "Seeks social experiences", "example": "Wants experiences with others", "estimated_percent": 35},
                {"name": "The Aesthetic Hedonist", "trait": "Refined pleasure", "behavior": "Curates quality experiences", "example": "Seeks beautiful things", "estimated_percent": 22},
                {"name": "The Cautious Hedonist", "trait": "Calculated pleasure", "behavior": "Balances pleasure and practicality", "example": "Enjoys indulgences within limits", "estimated_percent": 15},
            ],
            "Optimizer": [
                {"name": "The Analytical Optimizer", "trait": "Data-driven", "behavior": "Researches extensively", "example": "Reads reviews, compares specs", "estimated_percent": 32},
                {"name": "The Pragmatic Optimizer", "trait": "Efficient", "behavior": "Values time and ROI", "example": "Takes shortcuts when justified", "estimated_percent": 38},
                {"name": "The Risk-Aware Optimizer", "trait": "Cautious", "behavior": "Minimizes downside", "example": "Hedges bets, diversifies", "estimated_percent": 30},
            ],
            "Connector": [
                {"name": "The Empathetic Connector", "trait": "People-focused", "behavior": "Values relationships", "example": "Remembers personal details", "estimated_percent": 35},
                {"name": "The Collaborative Connector", "trait": "Team-oriented", "behavior": "Builds consensus", "example": "Seeks group input before deciding", "estimated_percent": 40},
                {"name": "The Influence-Seeking Connector", "trait": "Status-aware", "behavior": "Values social proof", "example": "Follows trends, seeks peer validation", "estimated_percent": 25},
            ],
            "Achiever": [
                {"name": "The Ambitious Achiever", "trait": "Status-driven", "behavior": "Seeks recognition", "example": "Chooses premium/visible options", "estimated_percent": 35},
                {"name": "The Focused Achiever", "trait": "Goal-oriented", "behavior": "Single-minded on targets", "example": "Laser-focused on metrics", "estimated_percent": 38},
                {"name": "The Competitive Achiever", "trait": "Benchmark-oriented", "behavior": "Wants to win", "example": "Compares performance vs others", "estimated_percent": 27},
            ],
        }
        flavors = presets.get(primary_brain) or [
            {"name": f"The Passionate {primary_brain}", "trait": "Strongly committed", "behavior": "Acts decisively", "example": "Strong preferences", "estimated_percent": 30},
            {"name": f"The Balanced {primary_brain}", "trait": "Moderate expression", "behavior": "Measured approach", "example": "Considers trade-offs", "estimated_percent": 40},
            {"name": f"The Skeptical {primary_brain}", "trait": "Questioning", "behavior": "Hesitant, needs convincing", "example": "Requires proof/evidence", "estimated_percent": 30},
        ]

    total_percent = sum(f.get("estimated_percent", 0) for f in flavors)
    if total_percent > 0:
        for f in flavors:
            f["estimated_percent"] = round(f["estimated_percent"] * 100 / total_percent)

    return {"flavors": flavors}


def _build_single_brain_simulation_prompt(
    research_objective_desc: str,
    research_objective_data: Dict,
    brain_assignment: Dict,
    evidence: Dict,
    say_do_gap: Optional[Dict],
    ocean: Dict[str, float],
    sample_size: int,
    questions: List[Dict],
    flavor_framework: Dict,
) -> str:
    """
    Prompt for one brain archetype answering as `sample_size` individual
    respondents, with within-brain personality-flavor variation grounded in
    the persona's Digital Brain profile (brain_assignment / evidence / say_do_gap),
    not the older EBPB Schwartz/tag system.
    """
    primary_brain = brain_assignment.get("primary_brain") or "Pragmatist"
    primary_confidence = brain_assignment.get("primary_confidence", 0.7)
    secondary_brain = brain_assignment.get("secondary_brain")
    secondary_confidence = brain_assignment.get("secondary_confidence")
    primary_reasoning = brain_assignment.get("primary_reasoning", "")
    secondary_reasoning = brain_assignment.get("secondary_reasoning", "")

    def _ocean_desc(name, score):
        level = "High" if score >= 0.7 else "Low" if score <= 0.3 else "Moderate"
        return f"{level} {name} ({score:.2f})"

    ocean_interpretation = "\n".join([
        _ocean_desc("Openness", ocean.get("openness", 0.5)),
        _ocean_desc("Conscientiousness", ocean.get("conscientiousness", 0.5)),
        _ocean_desc("Extraversion", ocean.get("extraversion", 0.5)),
        _ocean_desc("Agreeableness", ocean.get("agreeableness", 0.5)),
        _ocean_desc("Neuroticism", ocean.get("neuroticism", 0.5)),
    ])

    action_data = (evidence or {}).get("action_data") or []
    web_evidence = (evidence or {}).get("web_evidence") or []
    hq_research = (evidence or {}).get("hq_research") or []

    def _verdict_lines(verdicts: list, field: str, limit: int = 3) -> str:
        lines = [str(v.get(field)) for v in verdicts if isinstance(v, dict) and v.get(field)]
        return "\n".join(f"- {line}" for line in lines[:limit]) or "(none available)"

    action_summary = _verdict_lines(action_data, "pattern_detected")
    web_summary = _verdict_lines(web_evidence, "representative_quote") or _verdict_lines(web_evidence, "key_discussion_themes")
    hq_summary = _verdict_lines(hq_research, "finding_summary")

    if say_do_gap:
        gap_claim = say_do_gap.get("claim", "")
        gap_actual = say_do_gap.get("evidence_based_observation", "")
        gap_reasoning = say_do_gap.get("reasoning", "")
        gap_section = f"""PART 4: SAY-DO-GAP (Authentic Contradiction)

STATED: "{gap_claim}"
ACTUAL BEHAVIOR: "{gap_actual}"
WHY: {gap_reasoning}

Distribute respondents: roughly 40-50% answer per the stated/aspirational claim, 30-40% answer per the actual/practical behavior, 10-20% hedge between both."""
    else:
        gap_section = "PART 4: SAY-DO-GAP\n\nNo significant gap detected for this persona. Respondents' stated answers align with their actual behavior."

    ro_components_section = ""
    if research_objective_data:
        ro_components_section = "\n\nRESEARCH OBJECTIVE COMPONENTS:\n" + "\n".join(
            f"- {k}: {v}" for k, v in research_objective_data.items() if v
        )

    flavors_section = "\n\nPART 6: INDIVIDUAL VARIATION FRAMEWORK\n\n"
    flavors_section += f"All {sample_size} respondents share the {primary_brain} archetype, but express it through different flavors:\n\n"
    for i, f in enumerate((flavor_framework or {}).get("flavors", []), 1):
        flavors_section += (
            f"FLAVOR {i}: {f['name']}\n"
            f"- Trait: {f['trait']}\n"
            f"- Behavior: {f['behavior']}\n"
            f"- Example: {f['example']}\n"
            f"- Estimated %: {f['estimated_percent']}%\n\n"
        )

    questions_formatted = [
        _format_question_for_prompt(i, q) for i, q in enumerate(questions, 1)
    ]
    questions_section = "\n\n".join(questions_formatted)

    prompt = f"""You are a market-research statistician simulating persona-based survey responses.

TASK: Generate responses for exactly {sample_size} individual respondents who all share
the SAME BRAIN ARCHETYPE but have UNIQUE INDIVIDUAL VARIATIONS.

═══════════════════════════════════════════════════════════════════════════════

PART 1: BRAIN ARCHETYPE (Shared Foundation for All {sample_size} Respondents)

BRAIN NAME: {primary_brain}
PRIMARY CONFIDENCE: {primary_confidence} (0.0-1.0)
SECONDARY BRAIN: {secondary_brain or "None"} ({secondary_confidence if secondary_confidence is not None else "N/A"})

Brain Reasoning: {primary_reasoning}
Secondary Reasoning: {secondary_reasoning}

═══════════════════════════════════════════════════════════════════════════════

PART 2: OCEAN PERSONALITY PROFILE (applies to all {sample_size} respondents)

{ocean_interpretation}

All respondents share this OCEAN profile but apply it differently through personality flavors.

═══════════════════════════════════════════════════════════════════════════════

PART 3: DIGITAL BRAIN EVIDENCE (real behavioral grounding, or an honest LLM-generated
stand-in where real coverage was thin — never present a stand-in as a literal fact)

ACTION DATA PATTERNS:
{action_summary}

WEB EVIDENCE THEMES:
{web_summary}

HQ RESEARCH FINDINGS:
{hq_summary}

═══════════════════════════════════════════════════════════════════════════════

{gap_section}

═══════════════════════════════════════════════════════════════════════════════

PART 5: RESEARCH OBJECTIVE

{research_objective_desc or "Not provided"}{ro_components_section}

═══════════════════════════════════════════════════════════════════════════════

{flavors_section}

PART 7: QUESTIONNAIRE

{questions_section}

═══════════════════════════════════════════════════════════════════════════════

{ANTI_SYCOPHANCY_RULES}

═══════════════════════════════════════════════════════════════════════════════

RESPONSE GENERATION REQUIREMENTS:

1) SAMPLE SIZE: Exactly {sample_size} respondents; for single-select [S] questions each respondent
   gives ONE answer; for multi-select [M] questions each respondent may select multiple options.
2) WITHIN-BRAIN VARIATION: All respondents are {primary_brain}, expressed through different flavors.
3) DISTRIBUTION SHARPNESS (single-select): top option must lead bottom option by at least 12-15 points.
   NEVER produce uniform/equal distributions.
4) SAY-DO-GAP: distribute authentically per Part 4 if a gap was detected.
5) MULTI-SELECT [M] questions: each option's count is the number of respondents (out of {sample_size})
   who selected it — options are independent, counts do NOT need to sum to {sample_size}, and must
   show varied (not equal) selection rates across options.
6) REALISM: apply plausible variation in language and confidence; respondents grounded in
   LLM-generated (not real) evidence should sound less certain ("I think...", "maybe...").

═══════════════════════════════════════════════════════════════════════════════

OUTPUT FORMAT (STRICT JSON, no explanatory text):

{{
  "sample_size": {sample_size},
  "brain_archetype": "{primary_brain}",
  "question_results": [
    {{
      "text": "<EXACT question text from input>",
      "options": [
        {{"option": "<EXACT option text from input>", "count": <int>, "pct": <float>}}
      ],
      "total": {sample_size}
    }}
  ],
  "summary": "<2-3 sentence summary>",
  "variation_analysis": {{
    "dominant_flavor": "<which flavor dominated>",
    "say_do_gap_impact": "<how much the gap affected responses>",
    "secondary_brain_influence": "<how much {secondary_brain or 'the secondary brain'} showed up>"
  }},
  "llm_source_explanation": {{
    "used_brain_traits": ["..."],
    "used_flavors": ["..."],
    "final_reasoning_summary": "<how brain + flavors drove the distributions>"
  }}
}}

TWO QUESTION TYPES REPLACE "options" WITH A DIFFERENT KEY:

[GRID] questions — use "items" instead of "options". One entry per listed item,
each carrying its own distribution over the SHARED response scale:
{{
  "text": "<EXACT question text from input>",
  "total": {sample_size},
  "items": [
    {{
      "item": "<EXACT item text from input>",
      "options": [{{"option": "<EXACT scale label>", "count": <int>, "pct": <float>}}]
    }}
  ]
}}
Every listed item MUST appear, each with its own distribution — items differ
from one another, so do NOT repeat one distribution across them. An item's
answers may only come from the response scale, never from the item list.

[OE] questions — use "verbatims" instead of "options": 5-8 short first-person
quotes (2-4 sentences each) in this persona's own voice, varied in angle:
{{
  "text": "<EXACT question text from input>",
  "total": {sample_size},
  "verbatims": ["<quote 1>", "<quote 2>", "..."]
}}

CRITICAL RULES:
- "option" must be the EXACT option text from the input — never an option_id, never paraphrased.
- For single-select [S] questions, counts must sum to {sample_size}; pct = round(100 * count / {sample_size}, 1).
- For multi-select [M] questions, counts are independent per-option frequencies (no sum constraint).
- For [GRID] questions, each item's counts sum to {sample_size} unless the item allows several ticks.
- [OE] questions must NEVER return "options" or counts — quotes only.
- NEVER use uniform distributions (e.g. all options at the same percentage).
- "question_results" must list every question in the SAME ORDER as the input.

Return JSON only.
"""
    return prompt


async def _call_single_brain_llm(
    research_objective_desc: str,
    research_objective_data: Dict,
    brain_assignment: Dict,
    evidence: Dict,
    say_do_gap: Optional[Dict],
    ocean: Dict[str, float],
    sample_size: int,
    flat_questions: List[Dict],
    *,
    exploration_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    persona_id: Optional[str] = None,
    created_by: Optional[str] = None,
    request_id: Optional[str] = None,
) -> Dict:
    """Call the LLM for one brain archetype's individually-varied responses.
    Falls back to _fallback_simulation() if the call or JSON parsing fails.

    Shared by both _simulate_single_brain and _simulate_multiple_brains
    (one call per persona) — instrumenting here covers both flows.
    """
    flavor_framework = _build_brain_variation_framework(brain_assignment, ocean)

    prompt = _build_single_brain_simulation_prompt(
        research_objective_desc=research_objective_desc,
        research_objective_data=research_objective_data,
        brain_assignment=brain_assignment,
        evidence=evidence,
        say_do_gap=say_do_gap,
        ocean=ocean,
        sample_size=sample_size,
        questions=flat_questions,
        flavor_framework=flavor_framework,
    )

    survey_model = (settings.SURVEY_SIMULATION_MODEL or "gpt-4o-mini").strip()

    try:
        res = await client.chat.completions.create(
            model=survey_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are a precise simulation engine that returns strict JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
        )
        input_tokens, output_tokens, usage_raw = extract_usage_openai_chat(res)
        await record_llm_usage(
            exploration_id=exploration_id,
            stage="survey_simulation",
            operation="persona_simulation",
            provider="openai",
            model=survey_model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            usage_raw=usage_raw,
            workspace_id=workspace_id,
            persona_id=persona_id,
            created_by=created_by,
            request_id=request_id,
        )
        raw = res.choices[0].message.content
        data = raw if isinstance(raw, (dict, list)) else json.loads(raw)
        if not isinstance(data, dict) or "question_results" not in data:
            logger.warning("Single-brain LLM returned invalid shape; using fallback.")
            return _fallback_simulation(sample_size, flat_questions)
        return data
    except Exception as e:
        logger.warning("Single-brain LLM call failed (%s); using fallback.", e)
        return _fallback_simulation(sample_size, flat_questions)


def _combine_persona_results(
    per_persona_normalized: List[Dict[str, List[Dict]]],
    flat_questions: List[Dict],
    total_sample: int,
) -> Dict[str, List[Dict]]:
    """
    Sum already-normalized per-persona results (each {qtext: [{option,count,pct}]},
    produced by build_normalized_survey_results against that persona's own sample
    size) into one combined, sample-size-weighted result set.
    """
    combined: Dict[str, List[Dict]] = {}

    for q in flat_questions:
        qtext = (q.get("text") or "").strip()

        # Free-text questions carry {"verbatim": ...} rows, which have no
        # option/count to sum — pool every persona's quotes instead.
        verbatims: List[str] = []
        seen_verbatims: set = set()
        for persona_result in per_persona_normalized:
            for row in persona_result.get(qtext, []):
                if not isinstance(row, dict) or "verbatim" not in row:
                    continue
                text = str(row.get("verbatim") or "").strip()
                if text and text.lower() not in seen_verbatims:
                    seen_verbatims.add(text.lower())
                    verbatims.append(text)
        if verbatims:
            combined[qtext] = [{"verbatim": text} for text in verbatims]
            continue

        # Preserve canonical option order/labels from the first persona that has them.
        ordered_options: List[str] = []
        for persona_result in per_persona_normalized:
            for row in persona_result.get(qtext, []):
                if not isinstance(row, dict) or "option" not in row:
                    continue
                if row["option"] not in ordered_options:
                    ordered_options.append(row["option"])

        option_counts = {opt: 0 for opt in ordered_options}
        for persona_result in per_persona_normalized:
            for row in persona_result.get(qtext, []):
                if not isinstance(row, dict) or "option" not in row:
                    continue
                option_counts[row["option"]] = option_counts.get(row["option"], 0) + int(row.get("count", 0) or 0)

        combined[qtext] = [
            {
                "option": opt,
                "count": count,
                "pct": round(100.0 * count / total_sample, 1) if total_sample > 0 else 0.0,
            }
            for opt, count in option_counts.items()
        ]

    return combined


def _combine_item_results(
    per_persona_items: List[Dict[str, List[Dict]]],
    flat_questions: List[Dict],
    total_sample: int,
) -> Dict[str, List[Dict]]:
    """Sum per-persona grid item distributions into one combined set, keeping
    each item's own distribution separate from every other item's."""
    combined: Dict[str, List[Dict]] = {}

    for q in flat_questions:
        qtext = (q.get("text") or "").strip()
        items, scale = question_grid_items(q)
        if not items or not scale:
            continue

        multi = False
        blocks: List[Dict] = []
        for item_label in items:
            option_counts: Dict[str, int] = {label: 0 for label in scale}
            for persona_items in per_persona_items:
                for block in persona_items.get(qtext, []):
                    if not isinstance(block, dict) or block.get("item") != item_label:
                        continue
                    multi = multi or bool(block.get("multi_response"))
                    for row in block.get("results") or []:
                        if isinstance(row, dict) and row.get("option") in option_counts:
                            option_counts[row["option"]] += int(row.get("count", 0) or 0)

            blocks.append({
                "item": item_label,
                "results": [
                    {
                        "option": label,
                        "count": count,
                        "pct": round(100.0 * count / total_sample, 1) if total_sample > 0 else 0.0,
                    }
                    for label, count in option_counts.items()
                ],
                "total": total_sample,
                "multi_response": multi,
            })

        combined[qtext] = blocks

    return combined


async def _fetch_digital_brain_context(persona_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a persona and extract its Digital Brain fields. Returns None if
    the persona doesn't exist. get_persona() returns a plain dict (see
    app/services/persona.py), not an ORM object."""
    persona = await get_persona(persona_id)
    if not persona:
        return None

    persona_details = persona.get("persona_details") or {}
    return {
        "persona": persona,
        "brain_assignment": persona_details.get("brain_assignment") or _DEFAULT_BRAIN_ASSIGNMENT,
        "evidence": persona_details.get("evidence") or {},
        "say_do_gap": persona_details.get("say_do_gap"),
        "research_objective_data": persona_details.get("research_objective") or {},
        "ocean": _extract_ocean_scores(persona.get("ocean_profile")),
    }


async def _simulate_single_brain(
    workspace_id: str,
    research_objective: Any,
    persona_id: str,
    sample_size: int,
    simulation_id: Optional[str],
    questions_sections: List[Dict],
    user_id: str,
    exploration_id: str,
    replace_existing: bool,
    *,
    request_id: Optional[str] = None,
) -> Dict:
    """1 persona -> `sample_size` respondents, all sharing one brain archetype
    with individual flavor variation."""
    logger.info(
        "Single-brain survey simulation started | workspace_id=%s exploration_id=%s "
        "persona_id=%s sample_size=%s user_id=%s",
        workspace_id, exploration_id, persona_id, sample_size, user_id,
    )

    ctx = await _fetch_digital_brain_context(persona_id)
    if not ctx:
        raise ValueError(f"Persona {persona_id} not found")

    flat_questions = _flatten_questions(questions_sections)
    if not flat_questions:
        raise ValueError("No questions provided to simulate")

    ro_desc, ro_id = _resolve_research_objective(research_objective)
    ro_description = await get_description(exploration_id) or ro_desc

    data = await _call_single_brain_llm(
        research_objective_desc=ro_description,
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
        created_by=user_id,
        request_id=request_id,
    )

    normalized_results = build_normalized_survey_results(
        data.get("question_results", []), flat_questions, sample_size,
    )
    item_results = build_item_level_results(
        data.get("question_results", []), flat_questions, sample_size,
    )
    canonical_results = build_canonical_survey_results(
        normalized_results, flat_questions, sample_size,
        item_results=item_results,
    )
    llm_source_explanation = data.get("llm_source_explanation", {})

    narrative = {
        "summary": data.get("summary", ""),
        "brain_archetype": ctx["brain_assignment"].get("primary_brain"),
        "personas": [{
            "persona_id": persona_id,
            "persona_name": ctx["persona"].get("name", "Unknown"),
            "sample_size": sample_size,
        }],
        "all_persona_ids": [persona_id],
        "is_combined": False,
        "variation_analysis": data.get("variation_analysis", {}),
    }

    sim_obj = SurveySimulation(
        id=generate_id(),
        workspace_id=workspace_id,
        exploration_id=ro_id,
        persona_id=[persona_id],
        persona_sample_sizes={persona_id: sample_size},
        total_sample_size=sample_size,
        simulation_source_id=simulation_id,
        results=normalized_results,
        normalized_results=canonical_results,
        narrative=narrative,
        created_by=user_id,
        created_at=datetime.utcnow(),
        simulation_result=data,
    )

    sim_obj = await _persist_simulation(sim_obj, simulation_id, replace_existing, questions_sections)
    if isinstance(sim_obj, dict):
        return sim_obj  # short-circuited: unique-constraint hit an existing row

    logger.info(
        "Single-brain survey simulation completed | survey_simulation_id=%s brain=%s sample_size=%s",
        sim_obj.id, ctx["brain_assignment"].get("primary_brain"), sample_size,
    )

    await neuro_service.record_survey_shadow_turns(
        workspace_id=workspace_id,
        exploration_id=exploration_id,
        persona_id=persona_id,
        question_texts=[q.get("text") or "" for q in flat_questions],
        simulation_id=simulation_id,
    )

    return _survey_result_payload(sim_obj, questions_sections, llm_source_explanation=llm_source_explanation)


async def _simulate_multiple_brains(
    workspace_id: str,
    research_objective: Any,
    personas_selection: List[Dict],
    total_sample: int,
    simulation_id: Optional[str],
    questions_sections: List[Dict],
    user_id: str,
    exploration_id: str,
    replace_existing: bool,
    *,
    request_id: Optional[str] = None,
) -> Dict:
    """2+ personas, each with their own sample size and brain archetype. Each
    persona gets its own LLM call (individual flavor variation), then results
    are combined weighted by sample size."""
    logger.info(
        "Multiple-brain survey simulation started | workspace_id=%s exploration_id=%s "
        "persona_count=%d total_sample=%d user_id=%s",
        workspace_id, exploration_id, len(personas_selection), total_sample, user_id,
    )

    flat_questions = _flatten_questions(questions_sections)
    if not flat_questions:
        raise ValueError("No questions provided to simulate")

    ro_desc, ro_id = _resolve_research_objective(research_objective)
    ro_description = await get_description(exploration_id) or ro_desc

    async def _simulate_one(p_sel: Dict) -> Dict[str, Any]:
        persona_id = p_sel["persona_id"]
        sample_size = p_sel["sample_size"]
        ctx = await _fetch_digital_brain_context(persona_id)
        if not ctx:
            logger.warning("Persona %s not found; using fallback for this slot.", persona_id)
            data = _fallback_simulation(sample_size, flat_questions)
            persona_name = "Unknown"
            brain_name = "Unknown"
        else:
            data = await _call_single_brain_llm(
                research_objective_desc=ro_description,
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
                created_by=user_id,
                request_id=request_id,
            )
            persona_name = ctx["persona"].get("name", "Unknown")
            brain_name = ctx["brain_assignment"].get("primary_brain")

        normalized = build_normalized_survey_results(
            data.get("question_results", []), flat_questions, sample_size,
        )
        items = build_item_level_results(
            data.get("question_results", []), flat_questions, sample_size,
        )
        return {
            "persona_id": persona_id,
            "persona_name": persona_name,
            "brain": brain_name,
            "sample_size": sample_size,
            "normalized": normalized,
            "item_results": items,
        }

    persona_runs = await asyncio.gather(*(_simulate_one(p) for p in personas_selection))

    combined_results = _combine_persona_results(
        [run["normalized"] for run in persona_runs], flat_questions, total_sample,
    )
    combined_item_results = _combine_item_results(
        [run["item_results"] for run in persona_runs], flat_questions, total_sample,
    )
    canonical_results = build_canonical_survey_results(
        combined_results, flat_questions, total_sample,
        item_results=combined_item_results,
    )

    personas_info = [
        {
            "persona_id": run["persona_id"],
            "persona_name": run["persona_name"],
            "brain": run["brain"],
            "sample_size": run["sample_size"],
            "percentage": round(100 * run["sample_size"] / total_sample, 1) if total_sample else 0.0,
        }
        for run in persona_runs
    ]
    narrative = {
        "summary": f"Combined simulation across {len(personas_selection)} personas ({total_sample} total respondents)",
        "personas": personas_info,
        "all_persona_ids": [run["persona_id"] for run in persona_runs],
        "total_sample_size": total_sample,
        "is_combined": True,
    }

    persona_ids = [run["persona_id"] for run in persona_runs]
    persona_sample_sizes = {run["persona_id"]: run["sample_size"] for run in persona_runs}

    sim_obj = SurveySimulation(
        id=generate_id(),
        workspace_id=workspace_id,
        exploration_id=ro_id,
        persona_id=persona_ids,
        persona_sample_sizes=persona_sample_sizes,
        total_sample_size=total_sample,
        simulation_source_id=simulation_id,
        results=combined_results,
        normalized_results=canonical_results,
        narrative=narrative,
        created_by=user_id,
        created_at=datetime.utcnow(),
        simulation_result={"personas": personas_info},
    )

    sim_obj = await _persist_simulation(sim_obj, simulation_id, replace_existing, questions_sections)
    if isinstance(sim_obj, dict):
        return sim_obj  # short-circuited: unique-constraint hit an existing row

    logger.info(
        "Multiple-brain survey simulation completed | survey_simulation_id=%s personas=%d total_sample=%d",
        sim_obj.id, len(personas_selection), total_sample,
    )

    return _survey_result_payload(sim_obj, questions_sections)


async def _persist_simulation(
    sim_obj: SurveySimulation,
    simulation_id: Optional[str],
    replace_existing: bool,
    questions_sections: List[Dict],
):
    """Shared insert/replace/unique-constraint-recovery logic for both flows.
    Returns the persisted SurveySimulation, OR a result dict if a concurrent
    request already won the unique-source-id race (mirrors the previous
    combined-call implementation's behavior)."""
    try:
        async with AsyncSession(async_engine) as session:
            if simulation_id and replace_existing:
                existing = await _get_existing_by_source(session, simulation_id)
                if existing:
                    existing.workspace_id = sim_obj.workspace_id
                    existing.exploration_id = sim_obj.exploration_id
                    existing.persona_id = sim_obj.persona_id
                    existing.persona_sample_sizes = sim_obj.persona_sample_sizes
                    existing.total_sample_size = sim_obj.total_sample_size
                    existing.results = sim_obj.results
                    existing.normalized_results = sim_obj.normalized_results
                    existing.narrative = sim_obj.narrative
                    existing.created_by = sim_obj.created_by
                    existing.created_at = datetime.utcnow()
                    existing.simulation_result = sim_obj.simulation_result
                    await session.commit()
                    await session.refresh(existing)
                    return existing
            session.add(sim_obj)
            await session.commit()
            await session.refresh(sim_obj)
            return sim_obj
    except IntegrityError:
        logger.warning(
            "Survey simulation DB insert hit unique source constraint; returning existing row | "
            "survey_simulation_id=%s simulation_source_id=%s",
            sim_obj.id, simulation_id,
        )
        async with AsyncSession(async_engine) as session:
            if simulation_id:
                existing = await _get_existing_by_source(session, simulation_id)
                if existing:
                    return _survey_result_payload(existing, questions_sections)
        raise
    except Exception:
        logger.exception(
            "Survey simulation DB insert failed | survey_simulation_id=%s simulation_source_id=%s",
            sim_obj.id, simulation_id,
        )
        raise


async def simulate_combined_and_store(
    workspace_id: str,
    research_objective: Any,
    personas_selection: List[Dict],
    simulation_id: Optional[str] = None,
    questions_sections: List[Dict] = None,
    user_id: str = None,
    exploration_id: str = None,
    replace_existing: bool = False,
) -> Dict:
    """
    Unified entry point for quantitative survey simulation.

    personas_selection: list of {"persona_id": str, "sample_size": int}.
    1 entry  -> single-brain flow (one persona, individual flavor variation).
    2+ entries -> multiple-brain flow (one LLM call per persona, combined
                  weighted by sample size).
    """
    if not personas_selection or not isinstance(personas_selection, list):
        raise ValueError("personas_selection must be a non-empty list of {persona_id, sample_size}")

    total_sample = sum(p.get("sample_size", 0) for p in personas_selection)
    if total_sample <= 0:
        raise ValueError("Total sample size must be greater than 0")

    logger.info(
        "Survey simulation initiated | workspace_id=%s exploration_id=%s "
        "persona_count=%d total_sample=%d user_id=%s",
        workspace_id, exploration_id, len(personas_selection), total_sample, user_id,
    )

    # One request_id per simulation run — correlates every per-persona
    # llm_usage_event row from this call (single- or multi-brain).
    request_id = uuid.uuid4().hex

    async def _dispatch():
        if len(personas_selection) == 1:
            return await _simulate_single_brain(
                workspace_id=workspace_id,
                research_objective=research_objective,
                persona_id=personas_selection[0]["persona_id"],
                sample_size=personas_selection[0]["sample_size"],
                simulation_id=simulation_id,
                questions_sections=questions_sections,
                user_id=user_id,
                exploration_id=exploration_id,
                replace_existing=replace_existing,
                request_id=request_id,
            )
        return await _simulate_multiple_brains(
            workspace_id=workspace_id,
            research_objective=research_objective,
            personas_selection=personas_selection,
            total_sample=total_sample,
            simulation_id=simulation_id,
            questions_sections=questions_sections,
            user_id=user_id,
            exploration_id=exploration_id,
            replace_existing=replace_existing,
            request_id=request_id,
        )

    if not simulation_id:
        return await _dispatch()

    lock = _survey_source_lock(simulation_id)
    async with lock:
        async with AsyncSession(async_engine) as session:
            existing = await _get_existing_by_source(session, simulation_id)
            if existing and not replace_existing:
                logger.info(
                    "Survey simulation source lock hit existing row | survey_simulation_id=%s "
                    "workspace_id=%s exploration_id=%s simulation_source_id=%s",
                    existing.id, existing.workspace_id, existing.exploration_id, existing.simulation_source_id,
                )
                return _survey_result_payload(existing, questions_sections)

        return await _dispatch()
