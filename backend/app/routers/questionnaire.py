import logging
from typing import Optional
from io import BytesIO
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import update
from app.models.survey_simulation import SurveySimulation
from app.schemas.response import SuccessResponse, ErrorResponse
from app.schemas.questionnaire import QuestionnaireGenerateRequest
from app.services.questionnaire import generate_questionnaire
from app.services.persona import get_persona
from app.services.population import get_simulation
from app.services.exploration import get_exploration
from app.routers.auth_dependencies import get_current_active_user
from app.models.user import User
from fastapi import APIRouter, Depends, HTTPException
from app.schemas.response import SuccessResponse
from app.schemas.questionnaire import (
    SectionCreate, SectionUpdate,
    QuestionCreate, QuestionUpdate,
    QuestionnaireGenerateRequest,
    SectionReorderItem, QuestionReorderItem,
)
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from app.db import get_session, async_engine
from app.services import questionnaire as service
from app.routers.auth_dependencies import get_current_active_user
from fastapi import File, UploadFile
from app.utils.file_parser import parse_file
from app.utils.file_utils_questionnaire import save_upload_file
from app.models.user import User
from app.services import workspace as ws_service
from fastapi import Body
from app.schemas.survey import SurveySimulationRequest, SurveySimulationOut
from app.services.survey_simulation import simulate_and_store
from app.services.persona import get_persona
from app.services.population import get_simulation
from app.services.exploration import get_exploration
from app.services.questionnaire import get_full_questionnaire, get_questionnaire_by_simulation as get_questionnaire_by_sim
from fastapi.responses import StreamingResponse, Response
from app.utils.pdf_generator import generate_survey_pdf
from app.services.survey_simulation import (
    get_survey_simulation_by_id,
    get_survey_simulation_by_source_id,
    get_latest_survey_results_map,
    parse_survey_results_field,
    _to_percent_string,
)
from app.services.persona import get_persona
from app.services.exploration import get_exploration
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form, Query
from app.services import questionnaire as questionnaire_service
from app.services import workspace as ws_service
from app.utils.questionnaire_csv import questionnaire_sections_to_csv_bytes
from app.services.question_engine import analysis_options_for_question, get_question_type_catalog


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/explorations/{exploration_id}/questionnaire",
    tags=["Questionnaire"]
)


async def _ensure_workspace_member(workspace_id: str, current_user: User):
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m.get("user_id") == current_user.id for m in members):
        raise HTTPException(
            403, ErrorResponse(status="error", message="Not a workspace member").dict()
        )


@router.get("/question-types", response_model=SuccessResponse)
async def list_question_types(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
):
    await _ensure_workspace_member(workspace_id, current_user)
    return SuccessResponse(message="Question types fetched", data=get_question_type_catalog())


@router.post("/questions/validate", response_model=SuccessResponse)
async def validate_question(
    workspace_id: str,
    exploration_id: str,
    payload: QuestionCreate,
    current_user: User = Depends(get_current_active_user),
):
    await _ensure_workspace_member(workspace_id, current_user)
    try:
        data = await service.validate_question_payload(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return SuccessResponse(message="Question payload is valid", data=data)


@router.put("/sections/reorder", response_model=SuccessResponse)
async def reorder_sections(
    workspace_id: str,
    exploration_id: str,
    payload: list[SectionReorderItem],
    current_user: User = Depends(get_current_active_user),
):
    await _ensure_workspace_member(workspace_id, current_user)
    data = await service.reorder_sections(
        workspace_id,
        exploration_id,
        [item.model_dump() for item in payload],
    )
    return SuccessResponse(message="Sections reordered", data=data)


@router.put("/questions/reorder", response_model=SuccessResponse)
async def reorder_questions(
    workspace_id: str,
    exploration_id: str,
    payload: list[QuestionReorderItem],
    current_user: User = Depends(get_current_active_user),
):
    await _ensure_workspace_member(workspace_id, current_user)
    data = await service.reorder_questions(
        workspace_id,
        exploration_id,
        [item.model_dump() for item in payload],
    )
    return SuccessResponse(message="Questions reordered", data=data)


@router.post("/upload", response_model=SuccessResponse)
async def upload_questionnaire_file(
    workspace_id: str,
    exploration_id: str,
    file: UploadFile = File(...),
    simulation_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_active_user)
):
    await _ensure_workspace_member(workspace_id, current_user)
    if simulation_id in {"", "undefined", "null"}:
        simulation_id = None

    try:
        saved_path, stored_name, _ = await save_upload_file(file)
    except ValueError as e:
        msg = str(e)
        if "exceed" in msg.lower() or "size" in msg.lower():
            raise HTTPException(
                413,
                ErrorResponse(status="error", message="File may exceed size limits of 2MB").dict(),
            )
        raise HTTPException(
            422,
            ErrorResponse(
                status="error",
                message="The file is in an unsupported format (PDF, Word, Excel only)",
            ).dict(),
        )
    except Exception as e:
        raise HTTPException(
            400,
            ErrorResponse(status="error", message=f"Failed to save file: {str(e)}").dict(),
        )

    try:
        parsed = parse_file(saved_path, file.filename)
    except ValueError as e:
        raise HTTPException(
            422,
            ErrorResponse(
                status="error",
                message="The file is in an unsupported format (PDF, Word, Excel only)",
            ).dict(),
        )
    except Exception as e:
        raise HTTPException(
            422,
            ErrorResponse(status="error", message=f"Failed to parse file: {str(e)}").dict(),
        )

    try:
        stored = await questionnaire_service.store_parsed_json(
            workspace_id, exploration_id, parsed, current_user.id, simulation_id
        )
    except Exception as e:
        raise HTTPException(
            500,
            ErrorResponse(
                status="error",
                message=f"Failed to store parsed data: {str(e)}"
            ).dict()
        )

    respondent_counts_available = False
    if simulation_id:
        cm = await get_latest_survey_results_map(simulation_id)
        respondent_counts_available = bool(cm)

    return SuccessResponse(
        message="File parsed & stored successfully",
        data={
            "sections": stored,
            "respondent_counts_available": respondent_counts_available,
        },
    )


@router.post("/generate", response_model=SuccessResponse)
async def generate_questionnaire_api(
    workspace_id: str,
    exploration_id: str,
    payload: QuestionnaireGenerateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    await _ensure_workspace_member(workspace_id, current_user)
    if payload.exploration_id != exploration_id:
        raise HTTPException(400, "Payload exploration_id does not match route exploration_id")

    objective = await get_exploration(session, payload.exploration_id)
    if not objective:
        raise HTTPException(404, "Research objective not found")

    # simulation_id is optional — only validate when provided.
    simulation = None
    if payload.simulation_id:
        simulation = await get_simulation(payload.simulation_id)
        if not simulation:
            raise HTTPException(404, "Population simulation not found")

    # Idempotency: reuse existing questionnaire instead of re-running the LLM.
    if payload.simulation_id:
        existing = await service.get_questionnaire_by_simulation(
            workspace_id, payload.exploration_id, payload.simulation_id
        )
        # Fallback: questionnaire was uploaded before any population simulation existed.
        # Only treat as existing if sections actually contain questions (guard against empty uploads).
        if not existing:
            unlinked = await service.get_unlinked_questionnaire(workspace_id, payload.exploration_id)
            has_questions = any(q for s in unlinked for q in s.get("questions", []))
            if unlinked and has_questions:
                # Attach uploaded sections to this simulation so allquestionnaires/{sim_id} finds them.
                await service.link_questionnaire_to_simulation(
                    workspace_id, payload.exploration_id, payload.simulation_id
                )
                existing = await service.get_questionnaire_by_simulation(
                    workspace_id, payload.exploration_id, payload.simulation_id
                )
    else:
        existing = await service.get_full_questionnaire(workspace_id, payload.exploration_id)

    if existing:
        return SuccessResponse(
            message="Questionnaire already exists",
            data={
                "status": "completed",
                "questionnaire": existing,
            },
        )

    if not payload.persona_id:
        raise HTTPException(400, "persona_id must be provided")

    personas_list = []
    persona_names = []
    
    for persona_id in payload.persona_id:
        persona = await get_persona(persona_id)
        if persona:
            personas_list.append(persona)
            persona_names.append(persona.get("name", "Unknown"))

    if not personas_list:
        raise HTTPException(400, "No valid personas found")

    job, should_start = await service.enqueue_questionnaire_generation_job(
        workspace_id,
        payload.exploration_id,
        [p.get("id") for p in personas_list if p.get("id")],
        current_user.id,
        payload.simulation_id,
    )
    if should_start:
        background_tasks.add_task(service.run_questionnaire_generation_job, job.id)

    return SuccessResponse(
        message=f"AI questionnaire generation {job.status} for {len(personas_list)} persona(s): {', '.join(persona_names)}",
        data={
            **service.questionnaire_generation_job_to_dict(job),
            "should_poll": True,
            "personas_considered": [
                {
                    "persona_id": pid,
                    "persona_name": pname
                }
                for pid, pname in zip(payload.persona_id, persona_names)
            ],
            "total_personas": len(personas_list)
        }
    )


@router.get("/generation/{job_id}", response_model=SuccessResponse)
async def get_questionnaire_generation_status(
    workspace_id: str,
    exploration_id: str,
    job_id: str,
    current_user: User = Depends(get_current_active_user),
):
    await _ensure_workspace_member(workspace_id, current_user)
    job = await service.get_questionnaire_generation_job(job_id, workspace_id, exploration_id)
    if not job:
        raise HTTPException(404, "Questionnaire generation job not found")

    payload = service.questionnaire_generation_job_to_dict(job)
    if job.status == "completed":
        payload["questionnaire"] = (
            await service.get_questionnaire_by_simulation(workspace_id, exploration_id, job.simulation_id)
            if job.simulation_id
            else await service.get_full_questionnaire(workspace_id, exploration_id)
        )

    return SuccessResponse(
        message=f"Questionnaire generation status: {job.status}",
        data=payload,
    )

@router.get("/allquestionnaires/{simulation_id}", response_model=SuccessResponse)
async def get_questionnaire_by_simulation(
    workspace_id: str,
    exploration_id: str,
    simulation_id: str,
    current_user: User = Depends(get_current_active_user)
):
    questionnaires = await service.get_questionnaire_by_simulation(workspace_id, exploration_id, simulation_id)
    
    return SuccessResponse(
        message="Questionnaires fetched successfully",
        data=questionnaires
    )


@router.get("/export-csv", response_model=None)
async def export_questionnaire_csv_for_exploration(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Download all questionnaire sections for an exploration as CSV (no simulation needed)."""
    await _ensure_workspace_member(workspace_id, current_user)
    questionnaires = await service.get_full_questionnaire(workspace_id, exploration_id)
    if not questionnaires:
        raise HTTPException(status_code=404, detail="No questionnaire found for this exploration")
    body = questionnaire_sections_to_csv_bytes(questionnaires, None)
    return StreamingResponse(
        BytesIO(body),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="questionnaire.csv"'},
    )


@router.get("/export-csv/{simulation_id}")
async def export_questionnaire_csv(
    workspace_id: str,
    exploration_id: str,
    simulation_id: str,
    survey_simulation_id: Optional[str] = Query(
        None,
        description="Optional survey run id; kept for compatibility. Questionnaire downloads do not include response counts.",
    ),
    current_user: User = Depends(get_current_active_user),
):
    """Download questionnaire as CSV: Q No., Question Description, Options."""
    await _ensure_workspace_member(workspace_id, current_user)

    questionnaires = await service.get_questionnaire_by_simulation(workspace_id, exploration_id, simulation_id)
    if not questionnaires:
        raise HTTPException(status_code=404, detail="No questionnaire found for this simulation")

    counts_map = None
    if survey_simulation_id:
        ss = await get_survey_simulation_by_id(survey_simulation_id)
        if not ss:
            raise HTTPException(status_code=404, detail="Survey simulation not found")
        if ss.workspace_id != workspace_id or ss.exploration_id != exploration_id:
            raise HTTPException(status_code=400, detail="Survey simulation does not match workspace or exploration")
        if ss.simulation_source_id != simulation_id:
            raise HTTPException(status_code=400, detail="Survey simulation does not match this population simulation")
        counts_map = parse_survey_results_field(ss.results)
    else:
        counts_map = await get_latest_survey_results_map(simulation_id)

    body = questionnaire_sections_to_csv_bytes(questionnaires, counts_map)
    return StreamingResponse(
        BytesIO(body),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="questionnaire_exploration.csv"'},
    )


@router.post("/sections", response_model=SuccessResponse)
async def create_section(workspace_id: str, exploration_id: str, payload: SectionCreate,
                         current_user: User = Depends(get_current_active_user)):
    await _ensure_workspace_member(workspace_id, current_user)

    if payload.simulation_id:
        simulation = await get_simulation(payload.simulation_id)
        if not simulation:
            raise HTTPException(404, "Population simulation not found")
        if simulation.workspace_id != workspace_id or simulation.exploration_id != exploration_id:
            raise HTTPException(400, "Population simulation does not match workspace or exploration")

    sec = await service.create_section(
        workspace_id,
        exploration_id,
        payload.title,
        current_user.id,
        payload.simulation_id,
        payload.parent_section_id,
        payload.order_index,
        payload.metadata,
    )
    return SuccessResponse(message="Section created", data=sec)

@router.put("/sections/{section_id}", response_model=SuccessResponse)
async def update_section(
    workspace_id: str,
    exploration_id: str,
    section_id: str,
    payload: SectionUpdate,
    current_user: User = Depends(get_current_active_user)
):
    await _ensure_workspace_member(workspace_id, current_user)
    sec = await service.update_section(
        section_id,
        workspace_id,
        exploration_id,
        payload.title,
        payload.parent_section_id,
        payload.order_index,
        payload.metadata,
    )
    if not sec:
        raise HTTPException(404, "Section not found")
    return SuccessResponse(message="Section updated", data=sec)

@router.delete("/sections/{section_id}", response_model=SuccessResponse)
async def delete_section(
    workspace_id: str,
    exploration_id: str,
    section_id: str,
    current_user: User = Depends(get_current_active_user)
):
    await _ensure_workspace_member(workspace_id, current_user)
    ok = await service.delete_section(section_id, workspace_id, exploration_id)
    if not ok:
        raise HTTPException(404, "Section not found")
    return SuccessResponse(message="Section deleted", data=True)

@router.post("/sections/{section_id}/questions", response_model=SuccessResponse)
async def create_question(section_id: str, payload: QuestionCreate,
                          workspace_id: str,
                          exploration_id: str,
                          current_user: User = Depends(get_current_active_user)):
    await _ensure_workspace_member(workspace_id, current_user)
    try:
        q = await service.create_question(
            section_id,
            workspace_id,
            exploration_id,
            payload.text,
            payload.options,
            current_user.id,
            payload.question_type,
            payload.config,
            payload.question_key,
            payload.order_index,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if not q:
        raise HTTPException(404, "Section not found")
    return SuccessResponse(message="Question created", data=q)

@router.put("/questions/{question_id}", response_model=SuccessResponse)
async def update_question(
    workspace_id: str,
    exploration_id: str,
    question_id: str,
    payload: QuestionUpdate,
    current_user: User = Depends(get_current_active_user)
):
    await _ensure_workspace_member(workspace_id, current_user)
    try:
        q = await service.update_question(
            question_id,
            workspace_id,
            exploration_id,
            payload.text,
            payload.options,
            payload.question_type,
            payload.config,
            payload.question_key,
            payload.order_index,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if not q:
        raise HTTPException(404, "Question not found")
    return SuccessResponse(message="Question updated", data=q)

@router.delete("/questions/{question_id}", response_model=SuccessResponse)
async def delete_question(
    workspace_id: str,
    exploration_id: str,
    question_id: str,
    current_user: User = Depends(get_current_active_user)
):
    await _ensure_workspace_member(workspace_id, current_user)
    ok = await service.delete_question(question_id, workspace_id, exploration_id)
    if not ok:
        raise HTTPException(404, "Question not found")
    return SuccessResponse(message="Question deleted", data=True)


@router.post("/questions/{question_id}/assets", response_model=SuccessResponse)
async def upload_question_asset(
    workspace_id: str,
    exploration_id: str,
    question_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):
    await _ensure_workspace_member(workspace_id, current_user)
    try:
        asset = await service.save_question_asset(
            question_id,
            workspace_id,
            exploration_id,
            file,
            current_user.id,
        )
    except ValueError as exc:
        msg = str(exc)
        status_code = 413 if "size" in msg.lower() or "exceed" in msg.lower() else 422
        raise HTTPException(status_code=status_code, detail=msg)
    if not asset:
        raise HTTPException(404, "Question not found")
    return SuccessResponse(message="Question asset uploaded", data=asset)


@router.get("/questions/{question_id}/assets", response_model=SuccessResponse)
async def list_question_assets(
    workspace_id: str,
    exploration_id: str,
    question_id: str,
    current_user: User = Depends(get_current_active_user),
):
    await _ensure_workspace_member(workspace_id, current_user)
    assets = await service.list_question_assets(question_id, workspace_id, exploration_id)
    if assets is None:
        raise HTTPException(404, "Question not found")
    return SuccessResponse(message="Question assets fetched", data=assets)


@router.delete("/questions/assets/{asset_id}", response_model=SuccessResponse)
async def delete_question_asset(
    workspace_id: str,
    exploration_id: str,
    asset_id: str,
    current_user: User = Depends(get_current_active_user),
):
    await _ensure_workspace_member(workspace_id, current_user)
    ok = await service.delete_question_asset(asset_id, workspace_id, exploration_id)
    if not ok:
        raise HTTPException(404, "Question asset not found")
    return SuccessResponse(message="Question asset deleted", data=True)


@router.get("/all", response_model=SuccessResponse)
async def get_all(workspace_id: str, exploration_id: str):
    data = await service.get_full_questionnaire(workspace_id, exploration_id)
    return SuccessResponse(message="Fetched", data=data)

@router.post("/simulate", response_model=SuccessResponse)
async def simulate_survey(
    workspace_id: str,
    exploration_id: str,
    payload: SurveySimulationRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session)
):
    logger.info(
        "Survey simulation POST received | workspace_id=%s route_exploration_id=%s payload_exploration_id=%s "
        "population_simulation_id=%s persona_count=%s force_rerun=%s supplied_question_sections=%s user_id=%s",
        workspace_id,
        exploration_id,
        payload.exploration_id,
        payload.simulation_id,
        len(payload.persona_id or []),
        payload.force_rerun,
        len(payload.questions or []),
        current_user.id,
    )
    if exploration_id != payload.exploration_id:
        logger.warning(
            "Survey simulation route/payload exploration mismatch | workspace_id=%s route_exploration_id=%s "
            "payload_exploration_id=%s population_simulation_id=%s user_id=%s",
            workspace_id,
            exploration_id,
            payload.exploration_id,
            payload.simulation_id,
            current_user.id,
        )
    objective = await get_exploration(session, payload.exploration_id)
    if not objective:
        logger.warning(
            "Survey simulation blocked: exploration not found | workspace_id=%s exploration_id=%s "
            "population_simulation_id=%s user_id=%s",
            workspace_id,
            payload.exploration_id,
            payload.simulation_id,
            current_user.id,
        )
        raise HTTPException(status_code=404, detail="Research objective not found")

    if not payload.persona_id:
        logger.warning(
            "Survey simulation blocked: missing persona_id | workspace_id=%s exploration_id=%s "
            "population_simulation_id=%s user_id=%s",
            workspace_id,
            payload.exploration_id,
            payload.simulation_id,
            current_user.id,
        )
        raise HTTPException(status_code=400, detail="persona_id must be provided")

    # Idempotency guard: if a survey simulation already exists for this population
    # simulation, return the stored result instead of re-running the AI simulation.
    # Skipped when force_rerun=True (user edited the questionnaire and wants a fresh run).
    if payload.simulation_id and not payload.force_rerun:
        logger.info(
            "Survey simulation idempotency lookup | workspace_id=%s exploration_id=%s "
            "population_simulation_id=%s user_id=%s",
            workspace_id,
            payload.exploration_id,
            payload.simulation_id,
            current_user.id,
        )
        existing = await get_survey_simulation_by_source_id(payload.simulation_id)
        if existing:
            logger.info(
                "Survey simulation idempotency hit | survey_simulation_id=%s workspace_id=%s "
                "exploration_id=%s population_simulation_id=%s total_sample_size=%s",
                existing.id,
                existing.workspace_id,
                existing.exploration_id,
                existing.simulation_source_id,
                existing.total_sample_size,
            )
            sections = await build_survey_report_sections(existing)
            return SuccessResponse(
                message="Survey simulation already exists for this population run",
                data={
                    "id": existing.id,
                    "workspace_id": existing.workspace_id,
                    "exploration_id": existing.exploration_id,
                    "total_sample_size": existing.total_sample_size,
                    "personas": (existing.narrative or {}).get("personas", []),
                    "sections": sections,
                    "results": existing.results,
                    "normalized_results": existing.normalized_results,
                    "narrative": existing.narrative,
                    "created_at": existing.created_at.isoformat(),
                },
            )

    questions = payload.questions
    if not questions:
        if payload.simulation_id:
            from app.services.questionnaire import get_questionnaire_by_simulation
            q_all = await get_questionnaire_by_simulation(workspace_id, payload.exploration_id, payload.simulation_id)
        else:
            q_all = await get_full_questionnaire(workspace_id, payload.exploration_id)

        logger.info(
            "Survey simulation questionnaire loaded | workspace_id=%s exploration_id=%s "
            "population_simulation_id=%s section_count=%s question_count=%s",
            workspace_id,
            payload.exploration_id,
            payload.simulation_id,
            len(q_all or []),
            sum(len(sec.get("questions", [])) for sec in (q_all or [])),
        )
        
        questions = []
        for sec in q_all:
            questions.append({
                "title": sec.get("title"),
                "questions": [
                    {
                        "id": q.get("id"),
                        "question_key": q.get("question_key") or q.get("id"),
                        "question_type": q.get("question_type") or "single_select",
                        "text": q.get("text"),
                        "options": q.get("options") or analysis_options_for_question(q),
                        "option_schema": q.get("option_schema") or (q.get("config") or {}).get("options") or [],
                        "config": q.get("config") or {},
                    } for q in sec.get("questions", [])
                ]
            })

    if not questions:
        logger.warning(
            "Survey simulation blocked: no questions available | workspace_id=%s exploration_id=%s "
            "population_simulation_id=%s user_id=%s",
            workspace_id,
            payload.exploration_id,
            payload.simulation_id,
            current_user.id,
        )
        raise HTTPException(status_code=400, detail="No questions available to simulate")

    personas_list = []
    persona_samples = {}
    population_sim = None
    if payload.simulation_id:
        population_sim = await get_simulation(payload.simulation_id)
        if not population_sim:
            logger.warning(
                "Survey simulation population source missing | workspace_id=%s exploration_id=%s "
                "population_simulation_id=%s user_id=%s",
                workspace_id,
                payload.exploration_id,
                payload.simulation_id,
                current_user.id,
            )
    
    for persona_id in payload.persona_id:
        persona = await get_persona(persona_id)
        if not persona:
            logger.warning(
                "Survey simulation skipped missing persona | workspace_id=%s exploration_id=%s "
                "population_simulation_id=%s persona_id=%s user_id=%s",
                workspace_id,
                payload.exploration_id,
                payload.simulation_id,
                persona_id,
                current_user.id,
            )
            continue

        sample_size = payload.sample_size
        if not sample_size:
            if payload.simulation_id:
                if population_sim:
                    try:
                        sample_size = int(population_sim.sample_distribution.get(persona_id, 50))
                    except Exception:
                        sample_size = int(population_sim.persona_scores.get(persona_id, 50)) if (population_sim.persona_scores and persona_id in population_sim.persona_scores) else 50
                else:
                    sample_size = 50
            else:
                sample_size = 50

        personas_list.append(persona)
        persona_samples[persona_id] = sample_size

    if not personas_list:
        logger.warning(
            "Survey simulation blocked: no valid personas resolved | workspace_id=%s exploration_id=%s "
            "population_simulation_id=%s requested_persona_ids=%s user_id=%s",
            workspace_id,
            payload.exploration_id,
            payload.simulation_id,
            payload.persona_id,
            current_user.id,
        )
        raise HTTPException(400, "No valid personas found")

    from app.services.survey_simulation_combined import simulate_combined_and_store

    logger.info(
        "Survey simulation dispatching to background | workspace_id=%s exploration_id=%s population_simulation_id=%s "
        "resolved_persona_count=%s persona_samples=%s section_count=%s question_count=%s user_id=%s",
        workspace_id,
        payload.exploration_id,
        payload.simulation_id,
        len(personas_list),
        persona_samples,
        len(questions),
        sum(len(sec.get("questions", [])) for sec in questions),
        current_user.id,
    )

    # Convert ORM object to a plain dict so the background task does not hold a
    # reference to a detached SQLAlchemy session object after the request closes.
    objective_data = {
        "id": getattr(objective, "id", None),
        "description": getattr(objective, "description", "") or "",
    }

    # Run the heavy LLM work as a background task.  The client must poll
    # GET /simulation/by-source/{simulation_source_id} until the row appears.
    background_tasks.add_task(
        simulate_combined_and_store,
        workspace_id=workspace_id,
        research_objective=objective_data,
        personas_list=personas_list,
        persona_samples=persona_samples,
        simulation_id=payload.simulation_id,
        questions_sections=questions,
        user_id=current_user.id,
        exploration_id=payload.exploration_id,
        replace_existing=payload.force_rerun,
    )

    return SuccessResponse(
        message=f"Survey simulation started for {len(personas_list)} persona(s). Poll simulation/by-source/{payload.simulation_id} for results.",
        data={
            "should_poll": True,
            "simulation_source_id": payload.simulation_id,
            "status": "pending",
        },
    )


async def build_survey_report_sections(sim) -> list:
    """
    Section/question/results structure used by survey preview and PDF download.
    Parses `sim.results` when stored as JSON string so keys match question text.
    Filters by the population simulation that produced this survey run so only
    the correct questionnaire is included (not all sections for the exploration).
    """
    if sim.simulation_source_id:
        sections = await get_questionnaire_by_sim(sim.workspace_id, sim.exploration_id, sim.simulation_source_id)
    else:
        sections = await get_full_questionnaire(sim.workspace_id, sim.exploration_id)
    results_raw = parse_survey_results_field(sim.results)
    canonical_results = sim.normalized_results if isinstance(getattr(sim, "normalized_results", None), dict) else {}
    canonical_questions = canonical_results.get("questions", {}) if isinstance(canonical_results, dict) else {}
    if results_raw is None and isinstance(sim.results, dict):
        results_raw = sim.results
    if not isinstance(results_raw, dict):
        results_raw = {}
    grouped = []
    for sec in sections:
        qs = []
        for q in sec["questions"]:
            qtext = q["text"]
            results = results_raw.get(qtext, [])
            qkey = q.get("question_key") or q.get("id")
            if not results and qkey in canonical_questions:
                results = canonical_questions[qkey].get("results") or []
            formatted_results = [
                {
                    "option": opt.get("option"),
                    "count": opt.get("count"),
                    "percentage": _to_percent_string(opt.get("pct", 0)),
                }
                for opt in results
            ]
            qs.append({
                "id": q.get("id"),
                "question_key": q.get("question_key") or q.get("id"),
                "question_type": q.get("question_type") or "single_select",
                "question": qtext,
                "config": q.get("config") or {},
                "results": formatted_results,
            })
        grouped.append({"title": sec["title"], "questions": qs})
    return grouped


@router.get("/simulation/by-source/{simulation_source_id}", response_model=SuccessResponse)
async def get_survey_simulation_by_source(
    workspace_id: str,
    exploration_id: str,
    simulation_source_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """
    Return the most recent completed survey simulation for a given population
    simulation ID (simulation_source_id).  Used by the frontend to avoid
    re-running the AI simulation when the user navigates away and back.
    Returns the same payload shape as POST /simulate so the frontend can
    treat both responses identically.
    """
    logger.info(
        "Survey simulation by-source GET received | workspace_id=%s exploration_id=%s "
        "population_simulation_id=%s user_id=%s",
        workspace_id,
        exploration_id,
        simulation_source_id,
        current_user.id,
    )
    existing = await get_survey_simulation_by_source_id(simulation_source_id)
    if not existing:
        logger.warning(
            "Survey simulation by-source cache miss | workspace_id=%s exploration_id=%s "
            "population_simulation_id=%s user_id=%s",
            workspace_id,
            exploration_id,
            simulation_source_id,
            current_user.id,
        )
        raise HTTPException(status_code=404, detail="No survey simulation found for this population run")

    logger.info(
        "Survey simulation by-source cache hit | survey_simulation_id=%s workspace_id=%s "
        "exploration_id=%s population_simulation_id=%s total_sample_size=%s user_id=%s",
        existing.id,
        existing.workspace_id,
        existing.exploration_id,
        existing.simulation_source_id,
        existing.total_sample_size,
        current_user.id,
    )
    sections = await build_survey_report_sections(existing)
    return SuccessResponse(
        message="Survey simulation fetched successfully",
        data={
            "id": existing.id,
            "workspace_id": existing.workspace_id,
            "exploration_id": existing.exploration_id,
            "total_sample_size": existing.total_sample_size,
            "personas": (existing.narrative or {}).get("personas", []),
            "sections": sections,
            "results": existing.results,
            "narrative": existing.narrative,
            "normalized_results": existing.normalized_results,
            "created_at": existing.created_at.isoformat(),
        },
    )


@router.get("/simulation/{simulation_id}/preview", response_model=SuccessResponse)
async def preview_survey_report(
    workspace_id: str,
    exploration_id: str,
    simulation_id: str,
    current_user: User = Depends(get_current_active_user)
):
    sim = await get_survey_simulation_by_id(simulation_id)
    if not sim:
        raise HTTPException(404, "Survey Simulation not found")

    persona_ids = sim.persona_id if isinstance(sim.persona_id, list) else [sim.persona_id] if sim.persona_id else []
    
    personas_data = []
    for pid in persona_ids:
        persona = await get_persona(pid)
        if persona:
            personas_data.append({
                "persona_id": pid,
                "name": persona.get("name", "Unknown"),
                "age_range": persona.get("age_range"),
                "occupation": persona.get("occupation"),
                "sample_size": sim.persona_sample_sizes.get(pid) if sim.persona_sample_sizes else None
            })
    
    from app.db import async_engine
    from sqlalchemy.ext.asyncio import AsyncSession
    async with AsyncSession(async_engine) as session:
        objective = await get_exploration(session, sim.exploration_id)

    grouped = await build_survey_report_sections(sim)

    preview_data = {
        "simulation_id": sim.id,
        "workspace_id": sim.workspace_id,
        "exploration_id": sim.exploration_id,
        "total_sample_size": sim.total_sample_size if hasattr(sim, 'total_sample_size') else sim.sample_size if hasattr(sim, 'sample_size') else 0,
        "created_at": sim.created_at.isoformat() if sim.created_at else None,
        "personas": personas_data,
        "persona_sample_sizes": sim.persona_sample_sizes if hasattr(sim, 'persona_sample_sizes') else {},
        "research_objective": objective.description if objective and hasattr(objective, 'description') else "",
        "narrative": sim.narrative or {},
        "normalized_results": sim.normalized_results or {},
        "sections": grouped,
        "summary": {
            "total_questions": sum(len(sec["questions"]) for sec in grouped),
            "total_sections": len(grouped),
            "total_personas": len(personas_data)
        }
    }
    
    return SuccessResponse(message="Survey report preview", data=preview_data)


@router.get("/simulation/{simulation_id}/download")
async def download_survey_pdf(
    workspace_id: str,
    exploration_id: str,
    simulation_id: str,
    current_user: User = Depends(get_current_active_user)
):
    sim = await get_survey_simulation_by_id(simulation_id)
    if not sim:
        raise HTTPException(404, "Survey Simulation not found")

    persona_ids = sim.persona_id if isinstance(sim.persona_id, list) else [sim.persona_id] if sim.persona_id else []
    
    personas_list = []
    for pid in persona_ids:
        persona = await get_persona(pid)
        if persona:
            personas_list.append(persona)
    
    from app.db import async_engine
    from sqlalchemy.ext.asyncio import AsyncSession

    # Same data as preview: deterministic ReportLab PDF (not LLM-generated).
    grouped = await build_survey_report_sections(sim)

    async with AsyncSession(async_engine) as session:
        objective = await get_exploration(session, sim.exploration_id)
        # Read while session is active; ORM instance is detached after commit
        research_objective_text = (
            (objective.description or "") if objective is not None else ""
        )
        await session.execute(
            update(SurveySimulation)
            .where(SurveySimulation.id == simulation_id)
            .values(is_download=True)
        )
        await session.commit()

    pdf_buffer = generate_survey_pdf(
        sim,
        grouped,
        personas_list,
        {"description": research_objective_text},
    )
    pdf_body = pdf_buffer.getvalue()

    return Response(
        content=pdf_body,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="survey_report_{simulation_id}.pdf"'},
    )

