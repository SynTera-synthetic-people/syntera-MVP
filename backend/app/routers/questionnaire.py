from typing import Optional
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException
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
    QuestionnaireGenerateRequest
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


@router.post("/upload", response_model=SuccessResponse)
async def upload_questionnaire_file(
    workspace_id: str,
    exploration_id: str,
    simulation_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user)
):
    await _ensure_workspace_member(workspace_id, current_user)

    try:
        saved_path, stored_name, _ = await save_upload_file(file)
    except Exception as e:
        raise HTTPException(
            400,
            ErrorResponse(
                status="error",
                message=f"Failed to save file: {str(e)}"
            ).dict()
        )

    try:
        parsed = parse_file(saved_path, file.filename)
    except Exception as e:
        raise HTTPException(
            500,
            ErrorResponse(
                status="error",
                message=f"Failed to parse file: {str(e)}"
            ).dict()
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
    payload: QuestionnaireGenerateRequest,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    objective = await get_exploration(session, payload.exploration_id)
    if not objective:
        raise HTTPException(404, "Research objective not found")

    simulation = await get_simulation(payload.simulation_id)
    if not simulation:
        raise HTTPException(404, "Population simulation not found")

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

    output, error = await generate_questionnaire(objective, personas_list, simulation, payload.exploration_id)

    if error:
        raise HTTPException(500, f"Failed to generate questionnaire: {error}")

    stored = await service.store_ai_generated_questionnaire(
        workspace_id,
        payload.exploration_id,
        output,
        current_user.id,
        payload.simulation_id
    )

    return SuccessResponse(
        message=f"AI Questionnaire generated successfully considering {len(personas_list)} persona(s): {', '.join(persona_names)}",
        data={
            "questionnaire": stored,
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


@router.get("/export-csv/{simulation_id}")
async def export_questionnaire_csv(
    workspace_id: str,
    exploration_id: str,
    simulation_id: str,
    survey_simulation_id: Optional[str] = Query(
        None,
        description="Optional survey run id; when set, counts come from that run. Otherwise uses latest survey for this population simulation.",
    ),
    current_user: User = Depends(get_current_active_user),
):
    """Download questionnaire as CSV: Q No., Question Description, Options, Count (from survey simulation if available)."""
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
    sec = await service.update_section(section_id, workspace_id, exploration_id, payload.title)
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
    q = await service.create_question(
        section_id,
        workspace_id,
        exploration_id,
        payload.text,
        payload.options,
        current_user.id
    )
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
    q = await service.update_question(question_id, workspace_id, exploration_id, payload.text, payload.options)
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


@router.get("/all", response_model=SuccessResponse)
async def get_all(workspace_id: str, exploration_id: str):
    data = await service.get_full_questionnaire(workspace_id, exploration_id)
    return SuccessResponse(message="Fetched", data=data)

@router.post("/simulate", response_model=SuccessResponse)
async def simulate_survey(
    workspace_id: str,
    payload: SurveySimulationRequest,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session)
):
    objective = await get_exploration(session, payload.exploration_id)
    if not objective:
        raise HTTPException(status_code=404, detail="Research objective not found")

    if not payload.persona_id:
        raise HTTPException(status_code=400, detail="persona_id must be provided")

    # Idempotency guard: if a survey simulation already exists for this population
    # simulation, return the stored result instead of re-running the AI simulation.
    # Skipped when force_rerun=True (user edited the questionnaire and wants a fresh run).
    if payload.simulation_id and not payload.force_rerun:
        existing = await get_survey_simulation_by_source_id(payload.simulation_id)
        if existing:
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
        
        questions = []
        for sec in q_all:
            questions.append({
            "title": sec.get("title"),
            "questions": [
                {
                    "text": q.get("text"),
                    "options": q.get("options") or []
                } for q in sec.get("questions", [])
            ]
        })

    if not questions:
        raise HTTPException(status_code=400, detail="No questions available to simulate")

    personas_list = []
    persona_samples = {}
    
    for persona_id in payload.persona_id:
        persona = await get_persona(persona_id)
        if not persona:
            continue

        sample_size = payload.sample_size
        if not sample_size:
            if payload.simulation_id:
                sim = await get_simulation(payload.simulation_id)
                if sim:
                    try:
                        sample_size = int(sim.sample_distribution.get(persona_id, 50))
                    except Exception:
                        sample_size = int(sim.persona_scores.get(persona_id, 50)) if (sim.persona_scores and persona_id in sim.persona_scores) else 50
                else:
                    sample_size = 50
            else:
                sample_size = 50

        personas_list.append(persona)
        persona_samples[persona_id] = sample_size

    if not personas_list:
        raise HTTPException(400, "No valid personas found")

    from app.services.survey_simulation_combined import simulate_combined_and_store

    result = await simulate_combined_and_store(
        workspace_id=workspace_id,
        research_objective=objective,
        personas_list=personas_list,
        persona_samples=persona_samples,
        simulation_id=payload.simulation_id,
        questions_sections=questions,
        user_id=current_user.id,
        exploration_id=payload.exploration_id
    )

    return SuccessResponse(
        message=f"Combined survey simulation created for {len(personas_list)} persona(s) with {result['total_sample_size']} total respondents",
        data=result
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
            formatted_results = [
                {
                    "option": opt.get("option"),
                    "count": opt.get("count"),
                    "percentage": _to_percent_string(opt.get("pct", 0)),
                }
                for opt in results
            ]
            qs.append({"question": qtext, "results": formatted_results})
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
    existing = await get_survey_simulation_by_source_id(simulation_source_id)
    if not existing:
        raise HTTPException(status_code=404, detail="No survey simulation found for this population run")

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

