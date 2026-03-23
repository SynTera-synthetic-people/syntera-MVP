import asyncio
import io
import json
import os
import pathlib
import uuid
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_engine
from app.models.survey_simulation import SurveySimulation
from app.services.auto_generated_persona import get_description
from app.services.quant_report_cta_prompt import CTA_ROUTED_QUANT_REPORT_PROMPT_V1
from app.services.report_generation_qual_claude import llm_md_to_pdf
from app.services.survey_simulation import parse_survey_results_field
from app.utils.anthropic_client import get_anthropic_client

load_dotenv()

_REPORT_CSS_PATH = (
    pathlib.Path(__file__).resolve().parent.parent / "css" / "report_generation.css"
)

upload_dir = "./reports"


def generate_pdf_path(prefix: str = "report") -> str:
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{prefix}_{uuid.uuid4().hex}.pdf"
    return os.path.join(upload_dir, filename)


async def call_anthropic(
    user_message_content: str,
    model: str = "claude-sonnet-4-5",
    max_tokens: int = 20000,
    temperature: float = 0.9,
):
    client = get_anthropic_client()
    response = await asyncio.to_thread(
        client.messages.create,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        messages=[
            {
                "role": "user",
                "content": user_message_content,
            }
        ],
    )
    return response


async def get_simulation_results(
    session: AsyncSession,
    simulation_id: str,
) -> Optional[Dict[str, Any]]:
    """Fetch fields needed to ground the PDF report in stored simulation data."""
    stmt = (
        select(
            SurveySimulation.results,
            SurveySimulation.simulation_result,
            SurveySimulation.narrative,
            SurveySimulation.total_sample_size,
            SurveySimulation.persona_sample_sizes,
            SurveySimulation.persona_id,
        ).where(SurveySimulation.id == simulation_id)
    )

    result = await session.execute(stmt)
    row = result.one_or_none()

    if row is None:
        return None

    return {
        "results": row.results,
        "simulation_result": row.simulation_result,
        "narrative": row.narrative,
        "total_sample_size": row.total_sample_size,
        "persona_sample_sizes": row.persona_sample_sizes,
        "persona_id": row.persona_id,
    }


def pdf_file_to_buffer(pdf_path: str) -> io.BytesIO:
    buffer = io.BytesIO()
    with open(pdf_path, "rb") as f:
        buffer.write(f.read())
    buffer.seek(0)
    return buffer


def _compact_personas(persona_details: Any) -> List[Dict[str, Any]]:
    """Trim persona objects for the LLM context window."""
    if not persona_details:
        return []
    if not isinstance(persona_details, list):
        persona_details = [persona_details]
    out: List[Dict[str, Any]] = []
    for p in persona_details:
        if hasattr(p, "model_dump"):
            d = p.model_dump()
        elif isinstance(p, dict):
            d = dict(p)
        else:
            d = {}
        desc = d.get("description") or ""
        if isinstance(desc, str) and len(desc) > 4000:
            desc = desc[:4000] + "…"
        out.append(
            {
                "id": d.get("id"),
                "name": d.get("name"),
                "occupation": d.get("occupation"),
                "description": desc,
            }
        )
    return out


async def generate_md_report(exploration_id, sim_id, persona_details):
    async with AsyncSession(async_engine) as session:
        data = await get_simulation_results(session, sim_id)

        if data is None:
            raise ValueError("Simulation not found")

    raw_results = data.get("results")
    survey_results = parse_survey_results_field(raw_results)
    if survey_results is None and isinstance(raw_results, dict):
        survey_results = raw_results

    research_objective = await get_description(exploration_id)

    payload: Dict[str, Any] = {
        "research_objective": research_objective,
        "simulation_id": sim_id,
        "total_sample_size": data.get("total_sample_size"),
        "persona_ids": data.get("persona_id"),
        "persona_sample_sizes": data.get("persona_sample_sizes"),
        "personas": _compact_personas(persona_details),
        "survey_results": survey_results,
        "simulation_result": data.get("simulation_result"),
        "narrative": data.get("narrative"),
    }

    # Verbatim CTA prompt (unchanged) + actual simulation payload only (fixes empty-input hallucinations).
    user_message_content = CTA_ROUTED_QUANT_REPORT_PROMPT_V1 + "\n\n" + json.dumps(
        payload, ensure_ascii=False, default=str
    )

    response = await call_anthropic(user_message_content)

    md = response.content[0].text.strip()

    if not md:
        raise ValueError("Empty response from Claude")
    output_pdf_path = generate_pdf_path(prefix="quant_survey")
    css_path = (
        str(_REPORT_CSS_PATH)
        if _REPORT_CSS_PATH.is_file()
        else "app/css/report_generation.css"
    )
    pdf_path = await asyncio.to_thread(llm_md_to_pdf, md, output_pdf_path, css_path)
    pdf_buffer = pdf_file_to_buffer(pdf_path)
    return pdf_buffer.getvalue()
