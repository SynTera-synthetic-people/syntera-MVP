"""
Reports router — serves three independently downloadable report types:
  - Transcripts (DOCX, deterministic Q/A transcript format)
  - Decision Intelligence (PDF, LLM)
  - Behavior Archaeology (PDF, LLM)

URL pattern:
  /workspaces/{workspace_id}/explorations/{exploration_id}/reports/qual/<type>
  /workspaces/{workspace_id}/explorations/{exploration_id}/reports/quant/{simulation_id}/<type>
"""
import asyncio
import base64
import json
import logging
import os
import shutil
import tempfile
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr

from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.services import report_orchestrator as cache
from app.services.report_generation_qual_claude import (
    generate_combined_interviews_pdf,
    generate_docx_path,
    generate_qual_transcripts_docx,
    generate_qual_transcripts_pdf,
    generate_pdf_path,
    llm_md_to_pdf,
)
from app.services.report_generation_quant_claude import generate_md_report
from app.services.survey_simulation import (
    get_survey_simulation_by_id,
    get_survey_simulation_by_source_id,
    parse_survey_results_field,
)
from app.services.questionnaire import get_questionnaire_by_simulation
from app.utils.questionnaire_csv import (
    questionnaire_sections_to_csv_bytes,
    build_survey_results_csv_bytes,
    build_quant_transcripts_zip,
)
from app.services.persona import get_persona
from app.utils.email_utils import send_share_report_email

router = APIRouter(
    prefix="/workspaces/{workspace_id}/explorations/{exploration_id}/reports",
    tags=["reports"],
)

QUAL_TRANSCRIPTS_CACHE_KEY = "TRANSCRIPTS_QA_DOCX_V6"
QUAL_TRANSCRIPTS_LEGACY_CACHE_KEYS = ("TRANSCRIPTS", "QUAL_VERBATIM_V1")
QUAL_TRANSCRIPTS_PDF_CACHE_KEY = "TRANSCRIPTS_PDF_V1"
QUAL_DI_CACHE_KEY = "DECISION_INTELLIGENCE_V8"
QUAL_DI_LEGACY_CACHE_KEYS = ("QUAL_DECISION_INTELLIGENCE_V1",)
QUAL_BA_CACHE_KEY = "BEHAVIORAL_ARCHAEOLOGY_V8"
QUAL_BA_LEGACY_CACHE_KEYS = (
    "QUAL_BEHAVIOUR_ARCHAEOLOGY_V1",
    "QUAL_BEHAVIORAL_ARCHAEOLOGY_V1",
    "IN_DEPTH_ALL_INTERVIEWS_BA_V1",
)
QUAL_ALL_CACHE_KEY = "ALL_COMBINED_V4"
QUANT_TRANSCRIPTS_CACHE_KEY = "TRANSCRIPTS_V2"
QUANT_DI_CACHE_KEY = "DECISION_INTELLIGENCE_V2"
QUANT_BA_CACHE_KEY = "BEHAVIORAL_ARCHAEOLOGY_V2"
QUAL_PREPARE_CONFIG = {
    "decision-intelligence": {
        "cache_key": QUAL_DI_CACHE_KEY,
        "cta": "DECISION_INTELLIGENCE",
        "prefix": "qual_di",
    },
    "behavior-archaeology": {
        "cache_key": QUAL_BA_CACHE_KEY,
        "cta": "BEHAVIORAL_ARCHAEOLOGY",
        "prefix": "qual_ba",
    },
    "all-combined": {
        "cache_key": QUAL_ALL_CACHE_KEY,
        "cta": "ALL_COMBINED",
        "prefix": "qual_all_combined",
    },
}
QUAL_SHARE_CONFIG: dict[str, dict] = {
    "transcripts": {"cache_key": QUAL_TRANSCRIPTS_PDF_CACHE_KEY, "label": "Interview Verbatim"},
    "decision-intelligence": {"cache_key": QUAL_DI_CACHE_KEY, "label": "Decision Intelligence"},
    "behavior-archaeology": {"cache_key": QUAL_BA_CACHE_KEY, "label": "Behaviour Archaeology"},
    "all-combined": {"cache_key": QUAL_ALL_CACHE_KEY, "label": "All Combined Report"},
}

class ShareReportRequest(BaseModel):
    recipient_email: EmailStr

QUAL_PENDING_STALE_SECONDS = int(os.getenv("QUAL_REPORT_PENDING_STALE_SECONDS", "1800"))
FILE_CACHE_KIND = "report_file_b64_v1"
_qual_report_tasks: dict[tuple[str, str], asyncio.Task] = {}


# ─── helpers ─────────────────────────────────────────────────────────────────

def _read_file(path: str) -> bytes:
    with open(path, "rb") as f:
        return f.read()


def _write_file(path: str, content: bytes) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "wb") as f:
        f.write(content)


def _pack_cached_file(content: bytes, media_type: str, filename: str) -> str:
    return json.dumps(
        {
            "kind": FILE_CACHE_KIND,
            "media_type": media_type,
            "filename": filename,
            "content_b64": base64.b64encode(content).decode("ascii"),
        },
        separators=(",", ":"),
    )


def _unpack_cached_file(content_md: Optional[str]) -> Optional[dict]:
    if not content_md:
        return None
    try:
        payload = json.loads(content_md)
    except (TypeError, ValueError):
        return None
    if not isinstance(payload, dict) or payload.get("kind") != FILE_CACHE_KIND:
        return None
    encoded = payload.get("content_b64")
    if not isinstance(encoded, str) or not encoded:
        return None
    try:
        content = base64.b64decode(encoded.encode("ascii"), validate=True)
    except Exception:
        return None
    return {
        "content": content,
        "media_type": payload.get("media_type") or "application/octet-stream",
        "filename": payload.get("filename") or "report",
    }


def _cached_file_ready(cached) -> bool:
    return bool(
        cached
        and (
            (cached.pdf_path and os.path.exists(cached.pdf_path))
            or _unpack_cached_file(cached.content_md)
        )
    )


def _legacy_content_ready(cached) -> bool:
    return bool(cached and cached.status == "done" and cached.content_md)


def _legacy_report_ready(cached) -> bool:
    return _cached_file_ready(cached) or _legacy_content_ready(cached)


def _read_cached_file(cached) -> bytes:
    if cached and cached.pdf_path and os.path.exists(cached.pdf_path):
        return _read_file(cached.pdf_path)
    unpacked = _unpack_cached_file(getattr(cached, "content_md", None))
    if unpacked:
        return unpacked["content"]
    raise FileNotFoundError("Cached report file is not available")


def _safe_attachment_name(filename: str) -> str:
    return os.path.basename(filename or "report") or "report"


def _materialize_cached_file(cached, fallback_filename: str) -> tuple[str, Optional[str]]:
    if cached and cached.pdf_path and os.path.exists(cached.pdf_path):
        return cached.pdf_path, None

    unpacked = _unpack_cached_file(getattr(cached, "content_md", None))
    if not unpacked:
        raise FileNotFoundError("Cached report file is not available")

    temp_dir = tempfile.mkdtemp(prefix="shared_report_")
    filename = _safe_attachment_name(unpacked.get("filename") or fallback_filename)
    file_path = os.path.join(temp_dir, filename)
    _write_file(file_path, unpacked["content"])
    return file_path, temp_dir


async def _send_share_report_email_with_cleanup(
    *,
    cleanup_dir: Optional[str] = None,
    **kwargs,
) -> None:
    try:
        await send_share_report_email(**kwargs)
    finally:
        if cleanup_dir:
            shutil.rmtree(cleanup_dir, ignore_errors=True)


async def _store_file_report_cache(
    exploration_id: str,
    cta_type: str,
    path: Optional[str],
    report_type: str,
    content: bytes,
    media_type: str,
    filename: str,
    simulation_id: Optional[str] = None,
):
    return await cache.store_report_cache(
        exploration_id,
        cta_type,
        path,
        report_type,
        simulation_id,
        content_md=_pack_cached_file(content, media_type, filename),
    )


async def _first_ready_cached_report(
    exploration_id: str,
    cta_types: tuple[str, ...],
    simulation_id: Optional[str] = None,
):
    for cta_type in cta_types:
        cached = await cache.get_cached_report(exploration_id, cta_type, simulation_id)
        if _cached_file_ready(cached):
            return cached
    return None


async def _first_legacy_ready_report(
    exploration_id: str,
    cta_types: tuple[str, ...],
    simulation_id: Optional[str] = None,
):
    for cta_type in cta_types:
        cached = await cache.get_cached_report(exploration_id, cta_type, simulation_id)
        if _legacy_report_ready(cached):
            return cached
    return None


async def _latest_report_for_keys(
    exploration_id: str,
    cta_types: tuple[str, ...],
    simulation_id: Optional[str] = None,
):
    for cta_type in cta_types:
        latest = await cache.get_latest_report(exploration_id, cta_type, simulation_id)
        if latest:
            return latest, cta_type
    return None, cta_types[0]


def _qual_transcripts_filename(exploration_id: str) -> str:
    return f"transcripts_{exploration_id}.docx"


def _qual_pdf_filename(report_slug: str, exploration_id: str) -> str:
    return f"{report_slug}_{exploration_id}.pdf"


def _legacy_markdown(content_md: Optional[str]) -> Optional[str]:
    if not content_md:
        return None
    try:
        parsed = json.loads(content_md)
    except (TypeError, ValueError):
        return content_md.strip() or None

    if isinstance(parsed, str):
        return parsed.strip() or None
    if isinstance(parsed, dict):
        for key in ("markdown", "content", "report", "text"):
            value = parsed.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


async def _ensure_legacy_qual_pdf_cached(
    exploration_id: str,
    cache_key: str,
    legacy_cache_keys: tuple[str, ...],
    prefix: str,
    filename: str,
):
    current = await cache.get_cached_report(exploration_id, cache_key)
    if _cached_file_ready(current):
        return current

    current_markdown = _legacy_markdown(getattr(current, "content_md", None))
    if current and current.status == "done" and current_markdown:
        out_path = generate_pdf_path(prefix=prefix)
        pdf_path = await asyncio.to_thread(
            llm_md_to_pdf,
            current_markdown,
            out_path,
            "app/css/report_generation.css",
        )
        content = _read_file(pdf_path)
        return await _store_file_report_cache(
            exploration_id=exploration_id,
            cta_type=cache_key,
            path=pdf_path,
            report_type="qual",
            content=content,
            media_type="application/pdf",
            filename=filename,
        )

    for legacy_key in legacy_cache_keys:
        legacy = await cache.get_cached_report(exploration_id, legacy_key)
        if not legacy:
            continue

        if _cached_file_ready(legacy):
            content = _read_cached_file(legacy)
            return await _store_file_report_cache(
                exploration_id=exploration_id,
                cta_type=cache_key,
                path=legacy.pdf_path,
                report_type="qual",
                content=content,
                media_type="application/pdf",
                filename=filename,
            )

        markdown_content = _legacy_markdown(legacy.content_md)
        if legacy.status == "done" and markdown_content:
            out_path = generate_pdf_path(prefix=prefix)
            pdf_path = await asyncio.to_thread(
                llm_md_to_pdf,
                markdown_content,
                out_path,
                "app/css/report_generation.css",
            )
            content = _read_file(pdf_path)
            return await _store_file_report_cache(
                exploration_id=exploration_id,
                cta_type=cache_key,
                path=pdf_path,
                report_type="qual",
                content=content,
                media_type="application/pdf",
                filename=filename,
            )

    return current


async def _ensure_qual_transcripts_cached(exploration_id: str):
    current = await cache.get_cached_report(exploration_id, QUAL_TRANSCRIPTS_CACHE_KEY)
    if _cached_file_ready(current):
        if _unpack_cached_file(current.content_md):
            return current
        content = _read_cached_file(current)
        return await _store_file_report_cache(
            exploration_id=exploration_id,
            cta_type=QUAL_TRANSCRIPTS_CACHE_KEY,
            path=current.pdf_path,
            report_type="qual",
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=_qual_transcripts_filename(exploration_id),
        )

    for legacy_key in QUAL_TRANSCRIPTS_LEGACY_CACHE_KEYS:
        legacy = await cache.get_cached_report(exploration_id, legacy_key)
        if _cached_file_ready(legacy):
            content = _read_cached_file(legacy)
            return await _store_file_report_cache(
                exploration_id=exploration_id,
                cta_type=QUAL_TRANSCRIPTS_CACHE_KEY,
                path=legacy.pdf_path,
                report_type="qual",
                content=content,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                filename=_qual_transcripts_filename(exploration_id),
            )

    out_path = generate_docx_path(prefix="qual_transcripts")
    try:
        docx_path = await generate_qual_transcripts_docx(
            objective_id=exploration_id,
            out_path=out_path,
        )
    except ValueError as exc:
        logger.warning(
            "transcript export skipped — exploration=%s reason=%s",
            exploration_id, exc,
        )
        raise HTTPException(
            status_code=422,
            detail=str(exc) or "No completed interviews found. Run interviews first.",
        )
    content = _read_file(docx_path)
    return await _store_file_report_cache(
        exploration_id=exploration_id,
        cta_type=QUAL_TRANSCRIPTS_CACHE_KEY,
        path=docx_path,
        report_type="qual",
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=_qual_transcripts_filename(exploration_id),
    )


def _is_stale_pending_report(report) -> bool:
    if not report or report.status not in {"pending", "generating"} or not report.created_at:
        return False

    created_at = report.created_at
    if getattr(created_at, "tzinfo", None) is not None:
        created_at = created_at.replace(tzinfo=None)

    return datetime.utcnow() - created_at > timedelta(seconds=QUAL_PENDING_STALE_SECONDS)


def _survey_simulation_matches_context(sim, workspace_id: str, exploration_id: str) -> bool:
    return bool(
        sim
        and sim.workspace_id == workspace_id
        and sim.exploration_id == exploration_id
    )


async def _resolve_quant_survey_simulation(workspace_id: str, exploration_id: str, simulation_id: str):
    sim = await get_survey_simulation_by_id(simulation_id)
    if _survey_simulation_matches_context(sim, workspace_id, exploration_id):
        return sim
    if sim:
        raise HTTPException(404, "Survey simulation not found")

    # Older/current clients can pass the population simulation id here. Resolve
    # the latest linked survey run so reports are generated from survey data.
    sim = await get_survey_simulation_by_source_id(simulation_id)
    if _survey_simulation_matches_context(sim, workspace_id, exploration_id):
        return sim

    raise HTTPException(404, "Survey simulation not found")


async def _personas_for_simulation(sim):
    persona_ids = sim.persona_id if isinstance(sim.persona_id, list) else ([sim.persona_id] if sim.persona_id else [])
    personas = []
    for pid in persona_ids:
        p = await get_persona(pid)
        if p:
            personas.append(p)
    return personas


def _qual_task_key(exploration_id: str, cache_key: str) -> tuple[str, str]:
    return (exploration_id, cache_key)


async def _run_qual_report_generation(
    exploration_id: str,
    cache_key: str,
    cta: str,
    prefix: str,
) -> None:
    task_key = _qual_task_key(exploration_id, cache_key)
    try:
        out_path = generate_pdf_path(prefix=prefix)
        pdf_path = await generate_combined_interviews_pdf(
            objective_id=exploration_id,
            out_path=out_path,
            cta=cta,
        )
        content = _read_file(pdf_path)
        await _store_file_report_cache(
            exploration_id=exploration_id,
            cta_type=cache_key,
            path=pdf_path,
            report_type="qual",
            content=content,
            media_type="application/pdf",
            filename=f"{prefix}_{exploration_id}.pdf",
        )
    except asyncio.CancelledError:
        # CancelledError is a BaseException, not Exception — it is raised when the worker
        # is killed (server restart, proxy timeout). Without this block the DB status stays
        # "pending" forever. We shield the DB write so it survives the cancellation signal.
        logger.warning(
            "report generation cancelled — exploration=%s cache_key=%s",
            exploration_id, cache_key,
        )
        try:
            await asyncio.shield(
                cache.set_report_status(
                    exploration_id=exploration_id,
                    cta_type=cache_key,
                    report_type="qual",
                    status="failed",
                    error_message="Report generation was cancelled (server timeout or restart). Please retry.",
                )
            )
        except Exception:
            pass
        raise
    except Exception as exc:
        logger.exception(
            "report generation failed — exploration=%s cache_key=%s: %s",
            exploration_id, cache_key, exc,
        )
        await cache.set_report_status(
            exploration_id=exploration_id,
            cta_type=cache_key,
            report_type="qual",
            status="failed",
            error_message=str(exc),
        )
    finally:
        _qual_report_tasks.pop(task_key, None)


async def _ensure_qual_report_preparing(
    exploration_id: str,
    report_slug: str,
) -> dict:
    config = QUAL_PREPARE_CONFIG.get(report_slug)
    if not config:
        raise HTTPException(404, "Unsupported qualitative report type")

    cache_key = config["cache_key"]
    cached = await cache.get_cached_report(exploration_id, cache_key)
    if _cached_file_ready(cached):
        return {"status": "done", "available": True}

    task_key = _qual_task_key(exploration_id, cache_key)
    existing_task = _qual_report_tasks.get(task_key)
    if existing_task and not existing_task.done():
        return {"status": "pending", "available": False}

    await cache.set_report_status(
        exploration_id=exploration_id,
        cta_type=cache_key,
        report_type="qual",
        status="pending",
    )
    _qual_report_tasks[task_key] = asyncio.create_task(
        _run_qual_report_generation(
            exploration_id=exploration_id,
            cache_key=cache_key,
            cta=config["cta"],
            prefix=config["prefix"],
        )
    )
    return {"status": "pending", "available": False}


# ─── QUAL REPORTS ─────────────────────────────────────────────────────────────

@router.post("/qual/{report_slug}/prepare")
async def prepare_qual_report(
    workspace_id: str,
    exploration_id: str,
    report_slug: str,
    current_user: User = Depends(get_current_active_user),
):
    """Start qualitative report generation in the background and return immediately."""
    return await _ensure_qual_report_preparing(exploration_id, report_slug)


@router.post("/qual/{report_slug}/share")
async def share_qual_report(
    workspace_id: str,
    exploration_id: str,
    report_slug: str,
    body: ShareReportRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
):
    """Email a generated qualitative report as an attachment to the given recipient."""
    config = QUAL_SHARE_CONFIG.get(report_slug)
    if not config:
        raise HTTPException(status_code=404, detail="Unsupported report type")

    if report_slug == "transcripts":
        # Prefer PDF; fall back to DOCX for legacy explorations.
        cached = await cache.get_cached_report(exploration_id, QUAL_TRANSCRIPTS_PDF_CACHE_KEY)
        if not _cached_file_ready(cached):
            cached = await _ensure_qual_transcripts_cached(exploration_id)
    else:
        cached = await cache.get_cached_report(exploration_id, config["cache_key"])
        if not _cached_file_ready(cached) and report_slug == "decision-intelligence":
            cached = await _ensure_legacy_qual_pdf_cached(
                exploration_id=exploration_id,
                cache_key=QUAL_DI_CACHE_KEY,
                legacy_cache_keys=QUAL_DI_LEGACY_CACHE_KEYS,
                prefix="qual_di",
                filename=_qual_pdf_filename("decision_intelligence", exploration_id),
            )
        elif not _cached_file_ready(cached) and report_slug == "behavior-archaeology":
            cached = await _ensure_legacy_qual_pdf_cached(
                exploration_id=exploration_id,
                cache_key=QUAL_BA_CACHE_KEY,
                legacy_cache_keys=QUAL_BA_LEGACY_CACHE_KEYS,
                prefix="qual_ba",
                filename=_qual_pdf_filename("behavior_archaeology", exploration_id),
            )

    if not _cached_file_ready(cached):
        raise HTTPException(
            status_code=404,
            detail="Report is not ready yet. Please generate it first.",
        )

    file_path, cleanup_dir = _materialize_cached_file(
        cached,
        fallback_filename=f"{report_slug}_{exploration_id}",
    )
    background_tasks.add_task(
        _send_share_report_email_with_cleanup,
        recipient_email=str(body.recipient_email),
        report_type=config["label"],
        file_path=file_path,
        shared_by_email=current_user.email,
        cleanup_dir=cleanup_dir,
    )
    return {"message": "Report shared successfully"}


@router.get("/qual/transcripts")
async def qual_transcripts(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Verbatim interview transcript PDF — deterministic, no LLM call, same speed as before."""
    # Serve from cache if already generated.
    pdf_cached = await cache.get_cached_report(exploration_id, QUAL_TRANSCRIPTS_PDF_CACHE_KEY)
    if _cached_file_ready(pdf_cached):
        content = _read_cached_file(pdf_cached)
        return Response(
            content=content,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="transcripts_{exploration_id}.pdf"'},
        )

    out_path = generate_pdf_path(prefix="qual_transcripts_pdf")
    try:
        pdf_path = await generate_qual_transcripts_pdf(
            objective_id=exploration_id,
            out_path=out_path,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc) or "No completed interviews found. Run interviews first.",
        )

    content = _read_file(pdf_path)
    await _store_file_report_cache(
        exploration_id=exploration_id,
        cta_type=QUAL_TRANSCRIPTS_PDF_CACHE_KEY,
        path=pdf_path,
        report_type="qual",
        content=content,
        media_type="application/pdf",
        filename=f"transcripts_{exploration_id}.pdf",
    )
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="transcripts_{exploration_id}.pdf"'},
    )


@router.get("/qual/decision-intelligence")
async def qual_decision_intelligence(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Decision Intelligence PDF for qualitative interviews."""
    cached = await _ensure_legacy_qual_pdf_cached(
        exploration_id=exploration_id,
        cache_key=QUAL_DI_CACHE_KEY,
        legacy_cache_keys=QUAL_DI_LEGACY_CACHE_KEYS,
        prefix="qual_di",
        filename=_qual_pdf_filename("decision_intelligence", exploration_id),
    )
    if not _cached_file_ready(cached):
        raise HTTPException(
            status_code=404,
            detail="Report not ready. Please generate it first using the /prepare endpoint.",
        )
    content = _read_cached_file(cached)
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
    cached = await _ensure_legacy_qual_pdf_cached(
        exploration_id=exploration_id,
        cache_key=QUAL_BA_CACHE_KEY,
        legacy_cache_keys=QUAL_BA_LEGACY_CACHE_KEYS,
        prefix="qual_ba",
        filename=_qual_pdf_filename("behavior_archaeology", exploration_id),
    )
    if not _cached_file_ready(cached):
        raise HTTPException(
            status_code=404,
            detail="Report not ready. Please generate it first using the /prepare endpoint.",
        )
    content = _read_cached_file(cached)
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
    cached = await cache.get_cached_report(exploration_id, QUAL_ALL_CACHE_KEY)
    if not _cached_file_ready(cached):
        raise HTTPException(
            status_code=404,
            detail="Report not ready. Please generate it first using the /prepare endpoint.",
        )
    content = _read_cached_file(cached)
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

    simulation_id is normally the SURVEY simulation ID. If a legacy client sends
    the population simulation ID, the latest linked survey simulation is used.
    Population sim is resolved via simulation_source_id for the questionnaire lookup.
    """
    survey_sim = await _resolve_quant_survey_simulation(workspace_id, exploration_id, simulation_id)
    resolved_simulation_id = survey_sim.id

    cached = await cache.get_cached_report(exploration_id, QUANT_TRANSCRIPTS_CACHE_KEY, resolved_simulation_id)
    if _cached_file_ready(cached):
        content = _read_cached_file(cached)
    else:
        population_sim_id = survey_sim.simulation_source_id
        if not population_sim_id:
            raise HTTPException(422, "Survey simulation has no linked population simulation")

        # ── CSV 1: Questionnaire overview (Q No., Question, Options, Count) ──
        questionnaires = await get_questionnaire_by_simulation(workspace_id, exploration_id, population_sim_id)
        if not questionnaires:
            raise HTTPException(404, "No questionnaire found for this simulation")

        counts_map = parse_survey_results_field(survey_sim.results)
        questionnaire_csv = questionnaire_sections_to_csv_bytes(
            questionnaires,
            counts_map,
            include_count=True,
        )

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

        question_types: dict = {}
        for sec in questionnaires:
            for q in sec.get("questions") or []:
                qtext = (q.get("text") or "").strip()
                if qtext:
                    question_types[qtext] = q.get("question_type") or "single_select"

        results_data = parse_survey_results_field(survey_sim.results) or {}
        survey_results_csv = build_survey_results_csv_bytes(
            results=results_data,
            persona_sample_sizes=persona_sample_sizes,
            persona_names_map=persona_names_map,
            seed=resolved_simulation_id,
            question_types=question_types,
        )

        # ── Combine into ZIP ──
        content = build_quant_transcripts_zip(questionnaire_csv, survey_results_csv)

        path = generate_pdf_path(prefix="quant_transcripts").replace(".pdf", ".zip")
        _write_file(path, content)
        await _store_file_report_cache(
            exploration_id=exploration_id,
            cta_type=QUANT_TRANSCRIPTS_CACHE_KEY,
            path=path,
            report_type="quant",
            content=content,
            media_type="application/zip",
            filename=f"survey_transcripts_{resolved_simulation_id}.zip",
            simulation_id=resolved_simulation_id,
        )

    return Response(
        content=content,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="survey_transcripts_{resolved_simulation_id}.zip"'},
    )


@router.get("/quant/{simulation_id}/decision-intelligence")
async def quant_decision_intelligence(
    workspace_id: str,
    exploration_id: str,
    simulation_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Decision Intelligence PDF for quantitative survey."""
    survey_sim = await _resolve_quant_survey_simulation(workspace_id, exploration_id, simulation_id)
    resolved_simulation_id = survey_sim.id

    cached = await cache.get_cached_report(exploration_id, QUANT_DI_CACHE_KEY, resolved_simulation_id)
    if _cached_file_ready(cached):
        content = _read_cached_file(cached)
    else:
        personas = await _personas_for_simulation(survey_sim)
        pdf_bytes = await generate_md_report(
            exploration_id, resolved_simulation_id, personas,
            cta="DECISION_INTELLIGENCE", workspace_id=workspace_id,
        )
        path = generate_pdf_path(prefix="quant_di")
        _write_file(path, pdf_bytes)
        await _store_file_report_cache(
            exploration_id=exploration_id,
            cta_type=QUANT_DI_CACHE_KEY,
            path=path,
            report_type="quant",
            content=pdf_bytes,
            media_type="application/pdf",
            filename=f"decision_intelligence_{resolved_simulation_id}.pdf",
            simulation_id=resolved_simulation_id,
        )
        content = pdf_bytes

    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="decision_intelligence_{resolved_simulation_id}.pdf"'},
    )


@router.get("/quant/{simulation_id}/behavior-archaeology")
async def quant_behavior_archaeology(
    workspace_id: str,
    exploration_id: str,
    simulation_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Behavior Archaeology PDF for quantitative survey."""
    survey_sim = await _resolve_quant_survey_simulation(workspace_id, exploration_id, simulation_id)
    resolved_simulation_id = survey_sim.id

    cached = await cache.get_cached_report(exploration_id, QUANT_BA_CACHE_KEY, resolved_simulation_id)
    if _cached_file_ready(cached):
        content = _read_cached_file(cached)
    else:
        personas = await _personas_for_simulation(survey_sim)
        pdf_bytes = await generate_md_report(
            exploration_id, resolved_simulation_id, personas,
            cta="BEHAVIORAL_ARCHAEOLOGY", workspace_id=workspace_id,
        )
        path = generate_pdf_path(prefix="quant_ba")
        _write_file(path, pdf_bytes)
        await _store_file_report_cache(
            exploration_id=exploration_id,
            cta_type=QUANT_BA_CACHE_KEY,
            path=path,
            report_type="quant",
            content=pdf_bytes,
            media_type="application/pdf",
            filename=f"behavior_archaeology_{resolved_simulation_id}.pdf",
            simulation_id=resolved_simulation_id,
        )
        content = pdf_bytes

    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="behavior_archaeology_{resolved_simulation_id}.pdf"'},
    )


# ─── STATUS ───────────────────────────────────────────────────────────────────

def _isoformat_or_none(value):
    return value.isoformat() if value else None


@router.get("/status")
async def report_status(
    workspace_id: str,
    exploration_id: str,
    simulation_id: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_active_user),
):
    """Check which reports are cached and ready — no generation triggered."""
    qual_ctas: dict[str, tuple[str, ...]] = {
        "TRANSCRIPTS": (QUAL_TRANSCRIPTS_CACHE_KEY, *QUAL_TRANSCRIPTS_LEGACY_CACHE_KEYS),
        "DECISION_INTELLIGENCE": (QUAL_DI_CACHE_KEY, *QUAL_DI_LEGACY_CACHE_KEYS),
        "BEHAVIORAL_ARCHAEOLOGY": (QUAL_BA_CACHE_KEY, *QUAL_BA_LEGACY_CACHE_KEYS),
    }
    quant_ctas = {
        "CSV_DATA": QUANT_TRANSCRIPTS_CACHE_KEY,
        "DECISION_INTELLIGENCE": QUANT_DI_CACHE_KEY,
        "BEHAVIORAL_ARCHAEOLOGY": QUANT_BA_CACHE_KEY,
    }

    result = {"qual": {}, "quant": {}}
    for public_cta, cache_ctas in qual_ctas.items():
        cached = await _first_ready_cached_report(exploration_id, cache_ctas)
        if not cached:
            cached = await _first_legacy_ready_report(exploration_id, cache_ctas)
        latest, latest_cta = await _latest_report_for_keys(exploration_id, cache_ctas)
        available = _legacy_report_ready(cached)
        status = "done" if available else "idle"
        error_message = None
        if not available and latest:
            if _is_stale_pending_report(latest):
                error_message = "Report generation timed out. Please retry."
                task = _qual_report_tasks.get(_qual_task_key(exploration_id, latest_cta))
                if task and not task.done():
                    task.cancel()
                latest = await cache.set_report_status(
                    exploration_id=exploration_id,
                    cta_type=latest_cta,
                    report_type="qual",
                    status="failed",
                    error_message=error_message,
                )
                status = latest.status
            elif latest.status in {"pending", "generating", "failed"}:
                status = "pending" if latest.status == "generating" else latest.status
                error_message = latest.error_message
        result["qual"][public_cta] = {
            "available": available,
            "generated_at": cached.created_at.isoformat() if available else None,
            "expires_at": cached.expires_at.isoformat() if available and cached.expires_at else None,
            "status": status,
            "error_message": error_message,
        }

    if simulation_id:
        for public_cta, cache_cta in quant_ctas.items():
            cached = await cache.get_cached_report(exploration_id, cache_cta, simulation_id)
            available = _cached_file_ready(cached)
            result["quant"][public_cta] = {
                "available": available,
                "generated_at": cached.created_at.isoformat() if available else None,
                "expires_at": cached.expires_at.isoformat() if available and cached.expires_at else None,
            }

    return result
