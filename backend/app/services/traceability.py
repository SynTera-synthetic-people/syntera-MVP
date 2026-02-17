import json
from typing import Any, Dict, List, Optional
from datetime import datetime
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from openai import AsyncOpenAI
from app.db import async_engine
from app.config import OPENAI_API_KEY
from app.models.traceability import TraceabilityRecord
from app.schemas.traceability import TraceabilityOut
from app.utils.id_generator import generate_id
from app.models.persona import Persona
from app.models.interview import Interview, InterviewSection, InterviewQuestion
from app.models.survey_simulation import SurveySimulation
from app.models.rebuttal import RebuttalSession
from app.models.exploration import Exploration


client = AsyncOpenAI(api_key=OPENAI_API_KEY)


def _to_primitive(obj: Any):
    """Recursively convert datetimes and SQLModel-like objects to JSON-safe primitives."""
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {k: _to_primitive(v) for k, v in obj.items()}
    if isinstance(obj, list) or isinstance(obj, tuple):
        return [_to_primitive(v) for v in obj]
    if hasattr(obj, "model_dump"):
        return _to_primitive(obj.model_dump())
    if hasattr(obj, "dict"):
        try:
            return _to_primitive(obj.dict())
        except Exception:
            pass
    if hasattr(obj, "__dict__"):
        return _to_primitive(vars(obj))
    return str(obj)


def _json_dumps_safe(o: Any) -> str:
    return json.dumps(_to_primitive(o), indent=2)


async def fetch_all_context(workspace_id: str, exploration_id: str) -> Dict[str, Any]:
    """
    Fetches and returns:
      - exploration (research objective)
      - all personas for workspace+exploration
      - all in-depth interviews for workspace+exploration
      - all survey simulations for workspace+exploration
      - all rebuttal sessions for workspace+exploration
      - discussion guides (optional)
    """
    async with AsyncSession(async_engine) as session:
        stmt = select(Exploration).where(Exploration.id == exploration_id)
        res = await session.execute(stmt)
        exploration = res.scalars().first()

        p_stmt = select(Persona).where(
            Persona.workspace_id == workspace_id,
            Persona.exploration_id == exploration_id
        )
        p_res = await session.execute(p_stmt)
        personas = p_res.scalars().all()

        i_stmt = select(Interview).where(
            Interview.workspace_id == workspace_id,
            Interview.exploration_id == exploration_id
        )
        i_res = await session.execute(i_stmt)
        interviews = i_res.scalars().all()

        s_stmt = select(SurveySimulation).where(
            SurveySimulation.workspace_id == workspace_id,
            SurveySimulation.exploration_id == exploration_id
        )
        s_res = await session.execute(s_stmt)
        surveys = s_res.scalars().all()

        r_stmt = select(RebuttalSession).where(
            RebuttalSession.workspace_id == workspace_id,
            RebuttalSession.exploration_id == exploration_id
        )
        r_res = await session.execute(r_stmt)
        rebuttals = r_res.scalars().all()

        section_stmt = select(InterviewSection).where(
            InterviewSection.workspace_id == workspace_id,
            InterviewSection.exploration_id == exploration_id
        )
        section_res = await session.execute(section_stmt)
        sections = section_res.scalars().all()
        
        interview_guide = []
        for section in sections:
            question_stmt = select(InterviewQuestion).where(
                InterviewQuestion.section_id == section.id
            )
            question_res = await session.execute(question_stmt)
            questions = question_res.scalars().all()
            interview_guide.append({
                "section_id": section.id,
                "title": section.title,
                "questions": [q.text for q in questions]
            })

    return {
        "exploration": exploration,
        "personas": personas,
        "interviews": interviews,
        "surveys": surveys,
        "rebuttals": rebuttals,
        "interview_guide": interview_guide,
    }


async def generate_traceability_layers_from_context(context: Dict[str, Any], custom_notes: Optional[str] = "") -> Dict[str, Any]:
    """
    Given the combined context dict, produce a traceability report using the LLM.
    Returns dict with foundation_layer, generation_process, validation_layer, narrative_summary.
    """
    exploration = context.get("exploration")
    research_desc = exploration.description if exploration else "Not provided"

    personas_json = _json_dumps_safe(context.get("personas", []))
    interviews_json = _json_dumps_safe(context.get("interviews", []))
    surveys_json = _json_dumps_safe(context.get("surveys", []))
    rebuttals_json = _json_dumps_safe(context.get("rebuttals", []))
    interview_guide_json = _json_dumps_safe(context.get("interview_guide", []))

    prompt = f"""
You are an AI system generating a transparent, audit-ready TRACEABILITY REPORT.

BASE YOUR REASONING ONLY on the provided evidence blocks below.
Do NOT invent numbers, external datasets, or citations. Use generic terms like
"survey signals", "persona traits", "interview themes", "rebuttal patterns".

RESEARCH OBJECTIVE:
{research_desc}

PERSONAS (FULL JSON):
{personas_json}

IN-DEPTH INTERVIEWS (FULL JSON):
{interviews_json}

SURVEY SIMULATIONS (FULL JSON):
{surveys_json}

REBUTTAL SESSIONS (FULL JSON):
{rebuttals_json}

INTERVIEW GUIDE (FULL JSON):
{interview_guide_json}

CUSTOM NOTES:
{custom_notes or 'Not provided'}

OUTPUT RULES:
- Return STRICT JSON only (no prose outside JSON).
- If a block has no data, set fields to "Not provided" where appropriate.
- Do not invent numeric benchmarks or external citations.

REQUIRED JSON STRUCTURE:
{{
  "foundation_layer": {{
    "source_mapping": "Explain how exploration, personas, interviews, surveys and rebuttals contributed to inputs.",
    "audit_logs": "Describe preprocessing (cleaning, deduplication), selection logic, and notes about data quality."
  }},
  "generation_process": {{
    "statistical_models_used": "Describe plausible model choices (clustering, regression, Bayesian, agent-based, etc.) and why they match the evidence.",
    "bias_encoding": "Explain which persona/interview/survey signals suggest particular biases (price sensitivity, brand loyalty, social proof)."
  }},
  "validation_layer": {{
    "benchmarking": "Explain how the outputs should be compared against market signals or triangulated across interviews/surveys/rebuttals (no fake numbers).",
    "error_metrics": "Describe validation logic: cross-validation, divergence checks, sanity checks, qualitative triangulation."
  }},
  "narrative_summary": {{
    "high_level_explanation": "A concise stakeholder-friendly synthesis across all evidence sources.",
    "confidence_score": "Return an integer 0-100 representing confidence based on completeness & consistency of evidence."
  }}
}}
"""

    print("\n===== TRACEABILITY PROMPT START =====\n")
    print(prompt)
    print("\n===== TRACEABILITY PROMPT END =====\n")

    try:
        res = await client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You generate factual, non-hallucinating traceability logs."},
                {"role": "user", "content": prompt}
            ],
        )
        raw = res.choices[0].message.content
        data = raw if isinstance(raw, dict) else json.loads(raw)
        return data
    except Exception as e:
        return {
            "foundation_layer": {"source_mapping": "error", "audit_logs": str(e)},
            "generation_process": {"statistical_models_used": "error", "bias_encoding": "error"},
            "validation_layer": {"benchmarking": "error", "error_metrics": "error"},
            "narrative_summary": {"high_level_explanation": str(e), "confidence_score": 0}
        }


async def create_traceability(
    workspace_id: str,
    exploration_id: str,
    created_by: str,
    custom_notes: Optional[str] = ""
) -> TraceabilityOut:
    """
    Fetches full context for the exploration and generates a traceability record.
    """
    context = await fetch_all_context(workspace_id, exploration_id)

    logs = await generate_traceability_layers_from_context(context, custom_notes or "")

    async with AsyncSession(async_engine) as session:
        rec = TraceabilityRecord(
            id=generate_id(),
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            foundation_layer=logs.get("foundation_layer", {}),
            generation_process=logs.get("generation_process", {}),
            validation_layer=logs.get("validation_layer", {}),
            narrative_summary=logs.get("narrative_summary", {}),
            created_by=created_by
        )
        session.add(rec)
        await session.commit()
        await session.refresh(rec)
        return TraceabilityOut.model_validate(rec)


async def regenerate_traceability(record_id: str, custom_notes: Optional[str] = "") -> Optional[TraceabilityOut]:
    """
    Regenerates traceability for an existing record (overwrites layers).
    """
    async with AsyncSession(async_engine) as session:
        stmt = select(TraceabilityRecord).where(TraceabilityRecord.id == record_id)
        res = await session.execute(stmt)
        rec = res.scalars().first()
        if not rec:
            return None

        context = await fetch_all_context(rec.workspace_id, rec.exploration_id)
        logs = await generate_traceability_layers_from_context(context, custom_notes or "")

        rec.foundation_layer = logs.get("foundation_layer", {})
        rec.generation_process = logs.get("generation_process", {})
        rec.validation_layer = logs.get("validation_layer", {})
        rec.narrative_summary = logs.get("narrative_summary", {})

        session.add(rec)
        await session.commit()
        await session.refresh(rec)
        return TraceabilityOut.model_validate(rec)


async def get_traceability(record_id: str) -> Optional[TraceabilityOut]:
    async with AsyncSession(async_engine) as session:
        stmt = select(TraceabilityRecord).where(TraceabilityRecord.id == record_id)
        res = await session.execute(stmt)
        rec = res.scalars().first()
        return TraceabilityOut.model_validate(rec) if rec else None


async def get_traceability_layer(payload: Dict):
    async with AsyncSession(async_engine) as session:
        stmt = select(TraceabilityRecord).where(TraceabilityRecord.id == payload.record_id)
        res = await session.execute(stmt)
        rec = res.scalars().first()
        if not rec:
            return None

        context = await fetch_all_context(rec.workspace_id, rec.exploration_id)
        logs = await generate_traceability_layers_from_context(context, payload.custom_notes or "")

        rec.foundation_layer = logs.get("foundation_layer", {})
        rec.generation_process = logs.get("generation_process", {})
        rec.validation_layer = logs.get("validation_layer", {})
        rec.narrative_summary = logs.get("narrative_summary", {})

        session.add(rec)
        await session.commit()
        await session.refresh(rec)
        return TraceabilityOut.model_validate(rec)