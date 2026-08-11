import json
import logging
import re
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from math import isfinite
from app.models.survey_simulation import SurveySimulation
from app.utils.id_generator import generate_id
from app.utils.survey_results_normalize import (
    build_canonical_survey_results,
    build_item_level_results,
    build_normalized_survey_results,
)
from app.db import async_engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from app.config import OPENAI_API_KEY
from openai import AsyncOpenAI
from app.services.question_engine import (
    analysis_options_for_question,
    grid_item_allows_multiple,
    is_verbatim_question_type,
    question_grid_items,
)
from app.services.anti_sycophancy_rules import ANTI_SYCOPHANCY_RULES

logger = logging.getLogger(__name__)

# Injected alongside ANTI_SYCOPHANCY_RULES: that block governs the *tone* of an
# individual answer, this one governs the *shape* of the aggregate distribution
# the LLM returns for a question (counts across options for one persona's whole
# sample_size). Without it, models default to flat/near-uniform splits that read
# as "safe" but don't reflect a persona with actual convictions.
DISTRIBUTION_REALISM_RULES = """
DISTRIBUTION REALISM RULES (apply to every question_results option distribution):

1. NO FLAT/UNIFORM DEFAULTS
   - Do not spread counts near-evenly across options "to be safe"
   - A persona with real convictions produces a skewed distribution: one
     dominant option, a smaller-but-plausible secondary, and a minority tail
   - Only produce a genuinely flat distribution when the persona would
     actually be torn on that specific question

2. CALIBRATION-DRIVEN SKEW
   - Use the persona's calibration_confidence (0-100) to size the skew:
     higher calibration -> sharper dominant option, smaller secondary, thin tail
     lower calibration -> flatter, more hedged spread across plausible options
   - Scale the size of any in-character "contrarian" minority (an option that
     cuts against the persona's expected lean) by (1 - calibration_confidence):
     confident personas allow a small contrarian minority, uncertain personas
     should not manufacture contrarian mass they wouldn't actually have

3. ANTI-SYCOPHANCY APPLIES TO THE SHAPE, NOT JUST THE WORDING
   - The ANTI_SYCOPHANCY_RULES below govern tone, but the same authenticity
     must show up as skew: don't bunch counts into the middle options to
     avoid committing to an extreme distribution
   - If this persona would genuinely reject/dislike/avoid something, that
     should read as a small "positive" count, not a moderate one
"""

client = AsyncOpenAI(api_key=OPENAI_API_KEY)


def _to_percent_string(value: float) -> str:
    """Convert float 35.0 -> '35%' (1 decimal if needed trimmed)."""
    try:
        v = round(float(value), 1)
        if v.is_integer():
            return f"{int(v)}%"
        return f"{v}%"
    except Exception:
        return "0%"


def _normalize_pct(p):
    try:
        p = float(p)
        if not isfinite(p):
            return 0.0
        return max(0.0, min(100.0, p))
    except Exception:
        return 0.0


def _build_simulation_prompt(research_desc: str, persona: dict, sample_size: int, questions: List[Dict]) -> str:
    """
    Returns a strict prompt asking the LLM to simulate responses for sample_size people.
    The LLM must return a JSON object that contains 'sample_size', 'question_results', 'summary' and
    an overall 'llm_source_explanation' block describing where the numbers were sourced from.
    """
    qs_text = []
    verbatim_question_ids = []
    grid_question_ids = []
    for i, q in enumerate(questions, start=1):
        opts = q.get("options") or []
        q_id = q.get("question_key") or q.get("id") or f"Q{i}"
        is_verbatim = is_verbatim_question_type(q.get("question_type"))
        grid_items, grid_scale = question_grid_items(q)
        is_grid = bool(grid_items and grid_scale)

        if is_grid:
            response_shape = "items"
        elif is_verbatim:
            response_shape = "verbatims"
        else:
            response_shape = "options"

        q_meta = {
            "question_id": q_id,
            "type": q.get("question_type") or "single_select",
            "config": q.get("config") or {},
            "response_shape": response_shape,
        }
        if is_grid:
            # The item list and the response scale are different axes; sending
            # only a flat "options" list collapses them and the model answers
            # the grid as if it were one question.
            q_meta["items"] = grid_items
            q_meta["response_scale"] = grid_scale
            q_meta["multi_response_per_item"] = grid_item_allows_multiple(q)
            grid_question_ids.append(q_id)
        elif is_verbatim:
            verbatim_question_ids.append(q_id)
        else:
            q_meta["options"] = q.get("option_schema") or opts

        qs_text.append(f"{i}. QUESTION: {q.get('text')}\nSCHEMA: {json.dumps(q_meta, default=str)}")

    qs_joined = "\n\n".join(qs_text)

    grid_instructions = ""
    if grid_question_ids:
        grid_instructions = f"""
GRID / SCALE-MATRIX QUESTIONS ({", ".join(grid_question_ids)}):
These ask the SAME response scale about several separate items, so one
distribution cannot represent them. Do NOT return "options". Return "items":
one entry per item in the schema's "items" list, each with its own
distribution over the schema's "response_scale".

Every item must appear, and each must get its OWN distribution — items differ
from one another, so never repeat a single distribution across them. An item's
answer may only be a label from "response_scale"; the item text itself is never
an answer.
"""

    verbatim_instructions = ""
    if verbatim_question_ids:
        verbatim_instructions = f"""
OPEN-ENDED / FREE-TEXT QUESTIONS ({", ".join(verbatim_question_ids)}):
For these questions, do NOT return "options". Instead return "verbatims": a list of
5-8 short first-person quotes representative of how this persona's sample would answer,
in their own voice.

Each verbatim should read as one natural paragraph (2-4 sentences) that blends these
four aspects without labeling them:
1. OPENING: a hook or attention-grab tied to the question
2. CONTEXT: the life situation/experience that shapes this persona's answer
3. KEY MESSAGE: the direct, concrete answer to the question
4. CONCLUSION: a personal takeaway or verdict

Vary the verbatims across the set (different angles, not restatements of the same
sentence) and apply the anti-sycophancy and distribution-realism rules below: not
every verbatim should be positive about the subject if this persona wouldn't be.
"""



    prompt = f"""
You are an expert market-research statistician. Simulate how a population of exactly {sample_size} people
who match the PERSONA below would answer the questionnaire.

PERSONA:
{json.dumps(persona, indent=2, default=str)}

RESEARCH OBJECTIVE:
{research_desc}

QUESTIONS:
{qs_joined}

{ANTI_SYCOPHANCY_RULES}

{DISTRIBUTION_REALISM_RULES}
{verbatim_instructions}{grid_instructions}
REQUIREMENTS (STRICT):
1) Return ONLY valid JSON, and nothing else.
2) JSON must have these top-level keys:
   - sample_size: integer
   - question_results: array of objects. Each question uses ONE of these two shapes,
     per its "response_shape" in the SCHEMA above:
     Shape "options" (default, single/multi-select, rating, ranking, etc.):
     {{
       "text": "<question text>",
       "options": [
         {{ "option": "<option text>", "count": <int>, "pct": <float> }},
         ...
       ],
       "total": <int>
     }}
     Shape "verbatims" (free-text/open-ended questions only):
     {{
       "text": "<question text>",
       "verbatims": ["<quote 1>", "<quote 2>", ...],
       "total": <int>
     }}
     Shape "items" (grid / scale-matrix questions only):
     {{
       "text": "<question text>",
       "items": [
         {{
           "item": "<exact item text from the schema's items list>",
           "options": [
             {{ "option": "<exact label from response_scale>", "count": <int>, "pct": <float> }},
             ...
           ]
         }},
         ...
       ],
       "total": <int>
     }}
   - summary: a short human-readable summary (2-3 bullets or sentences)
   - llm_source_explanation: one object describing where you used evidence from to derive the percentages.
       It must contain keys:
        - used_persona_traits (list of strings)
        - used_population_signals (list of strings)
        - used_research_objective_elements (list of strings)
        - final_reasoning_summary (string)

3) For "options"-shape questions:
   - counts must be integers and MUST sum to sample_size.
   - pct must equal round(100 * count / sample_size, 1)
   - Follow the DISTRIBUTION REALISM RULES above — do not default to flat/uniform splits.
4) Be realistic and conservative: bias answers only according to the persona text above.
5) For "verbatims"-shape questions, follow the OPEN-ENDED instructions above instead of rule 3.
5b) For "items"-shape questions, follow the GRID instructions above instead of rule 3: each item's
   counts must sum to sample_size (unless multi_response_per_item is true, where each option's
   count is an independent frequency).
6) Do NOT invent external documents or cite external sources. The llm_source_explanation should reference only persona, research objective, and sample/population signals.
7) Output JSON only (no explanatory text).

Return the JSON now.
"""
    return prompt

async def _call_llm_simulation(research_desc: str, persona: dict, sample_size: int, questions: List[Dict]) -> Tuple[Optional[Dict], Optional[str]]:
    prompt = _build_simulation_prompt(research_desc, persona, sample_size, questions)

    try:
        res = await client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are a precise simulation engine that returns strict JSON."},
                {"role": "user", "content": prompt}
            ],
        )
    except Exception as e:
        return None, f"LLM call failed: {e}"

    raw = res.choices[0].message.content

    if isinstance(raw, (dict, list)):
        data = raw
    else:
        try:
            data = json.loads(raw)
        except Exception:
            m = re.search(r"\{.*\}", str(raw), flags=re.DOTALL)
            if m:
                try:
                    data = json.loads(m.group(0))
                except Exception:
                    return None, "LLM returned invalid JSON blob"
            else:
                return None, "LLM returned non-JSON output"

    if not isinstance(data, dict) or "question_results" not in data:
        return None, "Invalid LLM simulation response shape"
    return data, None

_FALLBACK_VERBATIMS = [
    "I don't have a strong reaction either way, honestly.",
    "It's fine, but nothing about it really stands out to me.",
    "I'd need to see more before I could say anything definite.",
]


def _fallback_simulation(sample_size: int, questions: List[Dict]) -> Dict:
    """
    Deterministic fallback: uniform distribution across provided options
    (or a small set of neutral verbatims for free-text questions).
    """
    q_results = []
    for q in questions:
        if is_verbatim_question_type(q.get("question_type")):
            q_results.append({
                "text": q.get("text", ""),
                "verbatims": list(_FALLBACK_VERBATIMS),
                "total": sample_size
            })
            continue

        grid_items, grid_scale = question_grid_items(q)
        if grid_items and grid_scale:
            # Grid questions need one distribution per item; a flat option
            # list here would leave every item column empty downstream.
            n_scale = max(1, len(grid_scale))
            base = sample_size // n_scale
            rem = sample_size - (base * n_scale)
            counts = [base + (1 if i < rem else 0) for i in range(n_scale)]
            q_results.append({
                "text": q.get("text", ""),
                "items": [
                    {
                        "item": item,
                        "options": [
                            {
                                "option": label,
                                "count": cnt,
                                "pct": round(100.0 * cnt / sample_size, 1) if sample_size > 0 else 0.0,
                            }
                            for label, cnt in zip(grid_scale, counts)
                        ],
                    }
                    for item in grid_items
                ],
                "total": sample_size,
            })
            continue

        opts = q.get("options") or []
        n_opts = max(1, len(opts))
        base = sample_size // n_opts
        remainder = sample_size - (base * n_opts)
        counts = [base + (1 if i < remainder else 0) for i in range(n_opts)]

        opt_results = []
        for opt, cnt in zip(opts, counts):
            pct = round(100.0 * cnt / sample_size, 1) if sample_size > 0 else 0.0
            opt_label = str(opt.get("text", "") or "") if isinstance(opt, dict) else str(opt)
            opt_results.append({"option": opt_label, "count": cnt, "pct": pct})

        q_results.append({
            "text": q.get("text", ""),
            "options": opt_results,
            "total": sample_size
        })

    return {
        "sample_size": sample_size,
        "question_results": q_results,
        "summary": "Uniform fallback simulation (deterministic).",
        "llm_source_explanation": {
            "used_persona_traits": [],
            "used_population_signals": [f"fallback_uniform_{sample_size}"],
            "used_research_objective_elements": [],
            "final_reasoning_summary": "Fallback uniform distribution applied because LLM simulation failed."
        }
    }

def _group_results_by_section(sections: List[Dict], results_map: Dict[str, List[Dict]]):
    """
    sections: [{title, questions: [{text, options}]}, ...]
    results_map: { question_text: [ {option,count,pct}, ... ], ... }

    Return:
      [
        {
          "title": "Section title",
          "questions": [
             {
               "question": "<text>",
               "results": [
                  {"option": "<opt>", "count": 10, "percentage": "20%"},
                  ...
               ]
             }, ...
          ]
        }, ...
      ]
    """
    grouped = []

    for sec in sections:
        sec_title = sec.get("title", "Section")
        sec_block = {"title": sec_title, "questions": []}

        for q in sec.get("questions", []):
            q_text = q.get("text", "")
            sim_results = results_map.get(q_text)
            if not sim_results:
                continue

            is_verbatim_row = bool(sim_results) and "verbatim" in sim_results[0]
            if is_verbatim_row:
                sec_block["questions"].append({
                    "question": q_text,
                    "verbatims": [row.get("verbatim", "") for row in sim_results if row.get("verbatim")]
                })
                continue

            formatted_opt = []
            for opt in sim_results:
                pct = opt.get("pct", 0.0)
                formatted_opt.append({
                    "option": opt.get("option", ""),
                    "count": int(opt.get("count", 0)),
                    "percentage": _to_percent_string(pct)
                })

            sec_block["questions"].append({
                "question": q_text,
                "results": formatted_opt
            })

        grouped.append(sec_block)

    return grouped

async def simulate_and_store(
    workspace_id: str,
    research_objective: Any,
    persona: Any,
    persona_id: str,
    simulation_id: Optional[str],
    sample_size: int,
    questions_sections: List[Dict],
    user_id: str
):
    """
    Simulate survey responses and store a SurveySimulation record.

    Returns a dict containing:
      - id, workspace_id, exploration_id, persona_id, sample_size
      - sections: grouped UI-ready results (percentage strings)
      - results: raw mapping {question_text: [{option,count,pct},...]}
      - narrative: {summary, llm_error}
      - llm_source_explanation: overall explanation object (if provided)
      - created_at
    """

    flat_questions = []
    for sec in questions_sections:
        for q in sec.get("questions", []):
            text = q.get("text") or ""
            # analysis_options_for_question() invents reporting buckets
            # ("Response provided" / "No response") for free-text questions.
            # Handing those to the simulation as if they were real options
            # makes the model answer in option shape, and the verbatim pool
            # then comes back empty — the question's column ends up blank for
            # every respondent. Free-text questions must reach the prompt with
            # no options at all.
            if is_verbatim_question_type(q.get("question_type")):
                opts = []
            else:
                opts = q.get("options") or analysis_options_for_question(q)
            flat_questions.append({
                "id": q.get("id"),
                "question_key": q.get("question_key") or q.get("id"),
                "question_type": q.get("question_type") or "single_select",
                "text": text,
                "options": opts,
                "option_schema": q.get("option_schema") or (q.get("config") or {}).get("options") or [],
                "config": q.get("config") or {},
            })

    if not flat_questions:
        raise ValueError("No questions provided to simulate")

    try:
        sample_size = int(sample_size)
        if sample_size <= 0:
            sample_size = 50
    except Exception:
        sample_size = 50

    if hasattr(research_objective, "model_dump"):
        ro_desc = research_objective.model_dump().get("description", "")
        ro_id = research_objective.model_dump().get("id")
    elif isinstance(research_objective, dict):
        ro_desc = research_objective.get("description", "")
        ro_id = research_objective.get("id")
    else:
        ro_desc = str(getattr(research_objective, "description", "") or "")
        ro_id = str(getattr(research_objective, "id", ""))

    if hasattr(persona, "model_dump"):
        persona_dict = persona.model_dump()
    elif isinstance(persona, dict):
        persona_dict = persona
    else:
        try:
            persona_dict = {k: getattr(persona, k) for k in dir(persona) if not k.startswith("_")}
        except Exception:
            persona_dict = {"id": persona_id}

    try:
        data, err = await _call_llm_simulation(ro_desc, persona_dict, sample_size, flat_questions)
        if err or not data:
            data = _fallback_simulation(sample_size, flat_questions)
            llm_error = err
        else:
            llm_error = None
    except Exception as e:
        data = _fallback_simulation(sample_size, flat_questions)
        llm_error = str(e)

    llm_source_explanation = data.get("llm_source_explanation", {})

    normalized_results = build_normalized_survey_results(
        data.get("question_results", []),
        flat_questions,
        sample_size,
    )
    item_results = build_item_level_results(
        data.get("question_results", []),
        flat_questions,
        sample_size,
    )
    canonical_results = build_canonical_survey_results(
        normalized_results,
        flat_questions,
        sample_size,
        item_results=item_results,
    )

    grouped_output = _group_results_by_section(questions_sections, normalized_results)

    narrative = {
        "summary": data.get("summary", ""),
        "llm_error": llm_error,
    }

    # narrative["llm_source_explanation"] = llm_source_explanation

    exploration_id = None
    if ro_id:
        exploration_id = ro_id
    else:
        try:
            exploration_id = getattr(research_objective, "id", None)
        except Exception:
            exploration_id = None

    sim_obj = SurveySimulation(
        id=generate_id(),
        workspace_id=workspace_id,
        exploration_id=exploration_id,
        persona_id=persona_id,
        simulation_source_id=simulation_id,
        persona_sample_sizes={persona_id: sample_size},
        total_sample_size=sample_size,
        results=normalized_results,
        normalized_results=canonical_results,
        narrative=narrative,
        created_by=user_id,
        created_at=datetime.utcnow()
    )

    async with AsyncSession(async_engine) as session:
        session.add(sim_obj)
        await session.commit()
        await session.refresh(sim_obj)

    out = {
        "id": sim_obj.id,
        "workspace_id": sim_obj.workspace_id,
        "exploration_id": sim_obj.exploration_id,
        "persona_id": sim_obj.persona_id,
        "sample_size": sim_obj.total_sample_size,
        "sections": grouped_output,
        "results": sim_obj.results,
        "normalized_results": sim_obj.normalized_results,
        "narrative": sim_obj.narrative,
        "llm_source_explanation": llm_source_explanation,
        "created_at": sim_obj.created_at.isoformat()
    }

    return out


def parse_survey_results_field(raw: Any) -> Optional[Dict[str, Any]]:
    """
    ORM JSON columns sometimes deserialize as dict; rarely as a JSON string.
    Survey counts CSV needs a dict: { question_text: [ {option, count}, ... ] }.
    """
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return None
        try:
            parsed = json.loads(s)
            return parsed if isinstance(parsed, dict) else None
        except (json.JSONDecodeError, TypeError):
            return None
    return None


async def get_survey_simulation_by_id(simulation_id: str):
    async with AsyncSession(async_engine) as session:
        survey = select(SurveySimulation).where(SurveySimulation.id == simulation_id)
        res = await session.execute(survey)
        return res.scalars().first()


async def get_survey_simulation_by_source_id(simulation_source_id: str):
    """Return the most recent SurveySimulation for a given population simulation_source_id."""
    async with AsyncSession(async_engine) as session:
        logger.info(
            "SurveySimulation lookup by source started | population_simulation_id=%s",
            simulation_source_id,
        )
        stmt = (
            select(SurveySimulation)
            .where(SurveySimulation.simulation_source_id == simulation_source_id)
            .order_by(SurveySimulation.created_at.desc())
        )
        res = await session.execute(stmt)
        survey_simulation = res.scalars().first()
        if survey_simulation:
            logger.info(
                "SurveySimulation lookup by source hit | survey_simulation_id=%s workspace_id=%s "
                "exploration_id=%s population_simulation_id=%s created_at=%s",
                survey_simulation.id,
                survey_simulation.workspace_id,
                survey_simulation.exploration_id,
                survey_simulation.simulation_source_id,
                survey_simulation.created_at,
            )
        else:
            logger.warning(
                "SurveySimulation lookup by source miss | population_simulation_id=%s",
                simulation_source_id,
            )
        return survey_simulation


async def get_latest_survey_results_map(simulation_source_id: str) -> Optional[Dict]:
    """
    Results dict: { question_text: [ {option, count, pct?}, ... ], ... }
    for the most recent survey run tied to this population simulation id.
    """
    async with AsyncSession(async_engine) as session:
        stmt = (
            select(SurveySimulation)
            .where(SurveySimulation.simulation_source_id == simulation_source_id)
            .order_by(SurveySimulation.created_at.desc())
        )
        res = await session.execute(stmt)
        ss = res.scalars().first()
        if not ss:
            return None
        return parse_survey_results_field(ss.results)


