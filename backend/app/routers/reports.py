"""
Reports router — serves three independently downloadable report types:
  - Transcripts (DOCX, deterministic Q/A transcript format)
  - Decision Intelligence (PDF, LLM)
  - Behavior Archaeology (PDF, LLM)

URL pattern:
  /workspaces/{workspace_id}/explorations/{exploration_id}/reports/qual/<type>
  /workspaces/{workspace_id}/explorations/{exploration_id}/reports/quant/{simulation_id}/<type>
"""
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.services import report_orchestrator as cache
from app.services.report_generation_qual_claude import (
    generate_combined_interviews_pdf,
    generate_docx_path,
    generate_qual_transcripts_docx,
    generate_pdf_path,
)
from app.services.report_generation_quant_claude import generate_md_report
from app.services.survey_simulation import get_survey_simulation_by_id, parse_survey_results_field
from app.services.questionnaire import get_questionnaire_by_simulation
from app.utils.questionnaire_csv import (
    questionnaire_sections_to_csv_bytes,
    build_survey_results_csv_bytes,
    build_quant_transcripts_zip,
)
from app.services.persona import get_persona

router = APIRouter(
    prefix="/workspaces/{workspace_id}/explorations/{exploration_id}/reports",
    tags=["reports"],
)

QUAL_TRANSCRIPTS_CACHE_KEY = "TRANSCRIPTS_QA_DOCX_V3"
QUANT_DI_CACHE_KEY = "DECISION_INTELLIGENCE_V2"
QUANT_BA_CACHE_KEY = "BEHAVIORAL_ARCHAEOLOGY_V2"


# ─── helpers ─────────────────────────────────────────────────────────────────

def _read_file(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()


def _write_file(path: str, content: bytes) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "wb") as f:
        f.write(content)


async def _personas_for_simulation(simulation_id: str):
    sim = await get_survey_simulation_by_id(simulation_id)
    if not sim:
        raise HTTPException(404, "Survey simulation not found")
    persona_ids = sim.persona_id if isinstance(sim.persona_id, list) else ([sim.persona_id] if sim.persona_id else [])
    personas = []
    for pid in persona_ids:
        p = await get_persona(pid)
        if p:
            personas.append(p)
    return personas


# ─── QUAL REPORTS ─────────────────────────────────────────────────────────────

@router.get("/qual/transcripts")
async def qual_transcripts(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Verbatim interview Q&A DOCX in discussion-guide transcript format."""
    cached = await cache.get_cached_report(exploration_id, QUAL_TRANSCRIPTS_CACHE_KEY)
    if cached and cached.pdf_path and os.path.exists(cached.pdf_path):
        content = _read_file(cached.pdf_path)
    else:
        out_path = generate_docx_path(prefix="qual_transcripts")
        docx_path = await generate_qual_transcripts_docx(
            objective_id=exploration_id,
            out_path=out_path,
        )
        content = _read_file(docx_path)
        await cache.store_report_cache(exploration_id, QUAL_TRANSCRIPTS_CACHE_KEY, docx_path, "qual")

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="transcripts_{exploration_id}.docx"'},
    )


@router.get("/qual/decision-intelligence")
async def qual_decision_intelligence(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Decision Intelligence PDF for qualitative interviews."""
    cached = await cache.get_cached_report(exploration_id, "DECISION_INTELLIGENCE")
    if cached and cached.pdf_path and os.path.exists(cached.pdf_path):
        content = _read_file(cached.pdf_path)
    else:
        out_path = generate_pdf_path(prefix="qual_di")
        pdf_path = await generate_combined_interviews_pdf(
            objective_id=exploration_id,
            out_path=out_path,
            cta="DECISION_INTELLIGENCE",
        )
        content = _read_file(pdf_path)
        await cache.store_report_cache(exploration_id, "DECISION_INTELLIGENCE", pdf_path, "qual")

    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="decision_intelligence_{exploration_id}.pdf"'},
    )


@router.get("/qual/behavior-archaeology")
async def qual_behavior_archaeology(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Behavior Archaeology PDF for qualitative interviews."""
    cached = await cache.get_cached_report(exploration_id, "BEHAVIORAL_ARCHAEOLOGY")
    if cached and cached.pdf_path and os.path.exists(cached.pdf_path):
        content = _read_file(cached.pdf_path)
    else:
        out_path = generate_pdf_path(prefix="qual_ba")
        pdf_path = await generate_combined_interviews_pdf(
            objective_id=exploration_id,
            out_path=out_path,
            cta="BEHAVIORAL_ARCHAEOLOGY",
        )
        content = _read_file(pdf_path)
        await cache.store_report_cache(exploration_id, "BEHAVIORAL_ARCHAEOLOGY", pdf_path, "qual")

    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="behavior_archaeology_{exploration_id}.pdf"'},
    )


@router.get("/qual/all-combined")
async def qual_all_combined(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """
    Master report — all three sections (Transcripts + DI + BA) in a single PDF.
    Uses CTA=ALL_COMBINED which instructs the LLM to generate every section.
    """
    cached = await cache.get_cached_report(exploration_id, "ALL_COMBINED")
    if cached and cached.pdf_path and os.path.exists(cached.pdf_path):
        content = _read_file(cached.pdf_path)
    else:
        out_path = generate_pdf_path(prefix="qual_all_combined")
        pdf_path = await generate_combined_interviews_pdf(
            objective_id=exploration_id,
            out_path=out_path,
            cta="ALL_COMBINED",
        )
        content = _read_file(pdf_path)
        await cache.store_report_cache(exploration_id, "ALL_COMBINED", pdf_path, "qual")

    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="all_combined_{exploration_id}.pdf"'},
    )


# ─── QUANT REPORTS ────────────────────────────────────────────────────────────

@router.get("/quant/{simulation_id}/transcripts")
async def quant_transcripts(
    workspace_id: str,
    exploration_id: str,
    simulation_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """
    Returns a ZIP containing two CSVs — no LLM call:
      1. questionnaire_overview.csv  — Q No., Question Description, Options, Count
      2. survey_results.csv          — one row per respondent (wide format)

    simulation_id is the SURVEY simulation ID.
    Population sim is resolved via simulation_source_id for the questionnaire lookup.
    """
    cached = await cache.get_cached_report(exploration_id, "TRANSCRIPTS", simulation_id)
    if cached and cached.pdf_path and os.path.exists(cached.pdf_path):
        content = _read_file(cached.pdf_path)
    else:
        survey_sim = await get_survey_simulation_by_id(simulation_id)
        if not survey_sim:
            raise HTTPException(404, "Survey simulation not found")

        population_sim_id = survey_sim.simulation_source_id
        if not population_sim_id:
            raise HTTPException(422, "Survey simulation has no linked population simulation")

        # ── CSV 1: Questionnaire overview (Q No., Question, Options, Count) ──
        questionnaires = await get_questionnaire_by_simulation(workspace_id, exploration_id, population_sim_id)
        if not questionnaires:
            raise HTTPException(404, "No questionnaire found for this simulation")

        counts_map = parse_survey_results_field(survey_sim.results)
        questionnaire_csv = questionnaire_sections_to_csv_bytes(questionnaires, counts_map)

        # ── CSV 2: Survey results (one row per respondent, wide format) ──
        persona_sample_sizes: dict = survey_sim.persona_sample_sizes or {}
        persona_ids: list = survey_sim.persona_id or []

        # Resolve persona names
        persona_names_map: dict[str, str] = {}
        for pid in persona_ids:
            p = await get_persona(pid)
            if p:
                name = p.get("name") or p.get("persona_name") or pid
                persona_names_map[pid] = name

        results_data = parse_survey_results_field(survey_sim.results) or {}
        survey_results_csv = build_survey_results_csv_bytes(
            results=results_data,
            persona_sample_sizes=persona_sample_sizes,
            persona_names_map=persona_names_map,
            seed=simulation_id,
        )

        # ── Combine into ZIP ──
        content = build_quant_transcripts_zip(questionnaire_csv, survey_results_csv)

        path = generate_pdf_path(prefix="quant_transcripts").replace(".pdf", ".zip")
        _write_file(path, content)
        await cache.store_report_cache(exploration_id, "TRANSCRIPTS", path, "quant", simulation_id)

    return Response(
        content=content,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="survey_transcripts_{simulation_id}.zip"'},
    )


@router.get("/quant/{simulation_id}/decision-intelligence")
async def quant_decision_intelligence(
    workspace_id: str,
    exploration_id: str,
    simulation_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Decision Intelligence PDF for quantitative survey."""
    cached = await cache.get_cached_report(exploration_id, QUANT_DI_CACHE_KEY, simulation_id)
    if cached and cached.pdf_path and os.path.exists(cached.pdf_path):
        content = _read_file(cached.pdf_path)
    else:
        personas = await _personas_for_simulation(simulation_id)
        pdf_bytes = await generate_md_report(exploration_id, simulation_id, personas, cta="DECISION_INTELLIGENCE")
        path = generate_pdf_path(prefix="quant_di")
        _write_file(path, pdf_bytes)
        await cache.store_report_cache(exploration_id, QUANT_DI_CACHE_KEY, path, "quant", simulation_id)
        content = pdf_bytes

    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="decision_intelligence_{simulation_id}.pdf"'},
    )


@router.get("/quant/{simulation_id}/behavior-archaeology")
async def quant_behavior_archaeology(
    workspace_id: str,
    exploration_id: str,
    simulation_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Behavior Archaeology PDF for quantitative survey."""
    cached = await cache.get_cached_report(exploration_id, QUANT_BA_CACHE_KEY, simulation_id)
    if cached and cached.pdf_path and os.path.exists(cached.pdf_path):
        content = _read_file(cached.pdf_path)
    else:
        personas = await _personas_for_simulation(simulation_id)
        pdf_bytes = await generate_md_report(exploration_id, simulation_id, personas, cta="BEHAVIORAL_ARCHAEOLOGY")
        path = generate_pdf_path(prefix="quant_ba")
        _write_file(path, pdf_bytes)
        await cache.store_report_cache(exploration_id, QUANT_BA_CACHE_KEY, path, "quant", simulation_id)
        content = pdf_bytes

    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="behavior_archaeology_{simulation_id}.pdf"'},
    )


# ─── STATUS ───────────────────────────────────────────────────────────────────

@router.get("/status")
async def report_status(
    workspace_id: str,
    exploration_id: str,
    simulation_id: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_active_user),
):
    """Check which reports are cached and ready — no generation triggered."""
    qual_ctas = {
        "TRANSCRIPTS": QUAL_TRANSCRIPTS_CACHE_KEY,
        "DECISION_INTELLIGENCE": "DECISION_INTELLIGENCE",
        "BEHAVIORAL_ARCHAEOLOGY": "BEHAVIORAL_ARCHAEOLOGY",
    }
    quant_ctas = {
        "CSV_DATA": "CSV_DATA",
        "DECISION_INTELLIGENCE": QUANT_DI_CACHE_KEY,
        "BEHAVIORAL_ARCHAEOLOGY": QUANT_BA_CACHE_KEY,
    }

    result = {"qual": {}, "quant": {}}
    for public_cta, cache_cta in qual_ctas.items():
        cached = await cache.get_cached_report(exploration_id, cache_cta)
        result["qual"][public_cta] = {
            "available": cached is not None,
            "generated_at": cached.created_at.isoformat() if cached else None,
            "expires_at": cached.expires_at.isoformat() if cached else None,
        }

    if simulation_id:
        for public_cta, cache_cta in quant_ctas.items():
            cached = await cache.get_cached_report(exploration_id, cache_cta, simulation_id)
            result["quant"][public_cta] = {
                "available": cached is not None,
                "generated_at": cached.created_at.isoformat() if cached else None,
                "expires_at": cached.expires_at.isoformat() if cached else None,
            }

    return result
