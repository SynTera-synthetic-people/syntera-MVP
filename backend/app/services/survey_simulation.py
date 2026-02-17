import json
import re
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from math import isfinite
from app.models.survey_simulation import SurveySimulation
from app.utils.id_generator import generate_id
from app.db import async_engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from app.config import OPENAI_API_KEY
from openai import AsyncOpenAI

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


def _ensure_int(v: Any, default: int = 0) -> int:
    try:
        return int(float(v))
    except Exception:
        return default


def _build_simulation_prompt(research_desc: str, persona: dict, sample_size: int, questions: List[Dict]) -> str:
    """
    Returns a strict prompt asking the LLM to simulate responses for sample_size people.
    The LLM must return a JSON object that contains 'sample_size', 'question_results', 'summary' and
    an overall 'llm_source_explanation' block describing where the numbers were sourced from.
    """
    qs_text = []
    for i, q in enumerate(questions, start=1):
        opts = q.get("options") or []
        qs_text.append(f"{i}. QUESTION: {q.get('text')}\nOPTIONS: {json.dumps(opts)}")

    qs_joined = "\n\n".join(qs_text)

    prompt = f"""
You are an expert market-research statistician. Simulate how a population of exactly {sample_size} people
who match the PERSONA below would answer the questionnaire.

PERSONA:
{json.dumps(persona, indent=2, default=str)}

RESEARCH OBJECTIVE:
{research_desc}

QUESTIONS:
{qs_joined}

REQUIREMENTS (STRICT):
1) Return ONLY valid JSON, and nothing else.
2) JSON must have these top-level keys:
   - sample_size: integer
   - question_results: array of objects, each:
     {{
       "text": "<question text>",
       "options": [
         {{ "option": "<option text>", "count": <int>, "pct": <float> }},
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

3) For each question:
   - counts must be integers and MUST sum to sample_size.
   - pct must equal round(100 * count / sample_size, 1)
4) Be realistic and conservative: bias answers only according to the persona text above.
5) If options are empty or free-text, distribute uniformly.
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

def _fallback_simulation(sample_size: int, questions: List[Dict]) -> Dict:
    """
    Deterministic fallback: uniform distribution across provided options.
    """
    q_results = []
    for q in questions:
        opts = q.get("options") or []
        n_opts = max(1, len(opts))
        base = sample_size // n_opts
        remainder = sample_size - (base * n_opts)
        counts = [base + (1 if i < remainder else 0) for i in range(n_opts)]

        opt_results = []
        for opt, cnt in zip(opts, counts):
            pct = round(100.0 * cnt / sample_size, 1) if sample_size > 0 else 0.0
            opt_results.append({"option": opt, "count": cnt, "pct": pct})

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
            opts = q.get("options") or []
            flat_questions.append({"text": text, "options": opts})

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

    normalized_results: Dict[str, List[Dict]] = {}
    for q in data.get("question_results", []):
        text = q.get("text", "") or ""
        opts = q.get("options", []) or []

        processed = []
        total_counts = 0
        for o in opts:
            if isinstance(o, dict):
                opt_text = o.get("option", "")
                cnt = _ensure_int(o.get("count", 0), 0)
            else:
                opt_text = str(o)
                cnt = 0
            processed.append({"option": opt_text, "count": cnt})
            total_counts += cnt

        if len(processed) == 0:
            processed = [{"option": "No option provided", "count": sample_size}]
            total_counts = sample_size

        if total_counts != sample_size:
            if total_counts == 0:
                n_opts = max(1, len(processed))
                base = sample_size // n_opts
                rem = sample_size - base * n_opts
                for i, p in enumerate(processed):
                    cnt = base + (1 if i < rem else 0)
                    p["count"] = cnt
            else:
                raw_counts = [ (p["count"] / total_counts) * sample_size for p in processed ]
                ints = [int(rc) for rc in raw_counts]
                remainder = sample_size - sum(ints)
                fracs = sorted([(raw_counts[i] - ints[i], i) for i in range(len(ints))], reverse=True)
                for r in range(remainder):
                    _, idx = fracs[r]
                    ints[idx] += 1
                for i, p in enumerate(processed):
                    p["count"] = ints[i]

        for p in processed:
            cnt = int(p["count"])
            pct = round(100.0 * cnt / sample_size, 1) if sample_size > 0 else 0.0
            p["pct"] = pct

        normalized_results[text] = processed

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
        sample_size=sample_size,
        results=normalized_results,
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
        "sample_size": sim_obj.sample_size,
        "sections": grouped_output,
        "results": sim_obj.results,
        "narrative": sim_obj.narrative,
        "llm_source_explanation": llm_source_explanation,
        "created_at": sim_obj.created_at.isoformat()
    }

    return out


async def get_survey_simulation_by_id(simulation_id: str):
    async with AsyncSession(async_engine) as session:
        survey = select(SurveySimulation).where(SurveySimulation.id == simulation_id)
        res = await session.execute(survey)
        return res.scalars().first()


