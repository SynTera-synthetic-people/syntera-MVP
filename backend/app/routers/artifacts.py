from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.schemas.artifacts import (
    ArtifactRunResultsOut,
    ArtifactRunStatusOut,
    CreateArtifactRunOut,
    CreateArtifactRunRequest,
    GenerateArtifactPersonaResponsesRequest,
    GenerateArtifactPopulationRequest,
)
from app.services import workspace as workspace_service
from app.services.artifact_pipeline_orchestrator import (
    ArtifactRunValidationError,
    create_run,
    get_run_results,
    get_run_status,
    list_artifact_files,
    run_artifact_pipeline_stages_1_to_3,
    run_persona_response_stage,
    run_population_simulation_stage,
    start_persona_response_stage,
    start_population_simulation_stage,
)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/explorations/{exploration_id}/artifacts",
    tags=["Artifact Pipeline"],
)


async def _assert_member(workspace_id: str, current_user: User) -> None:
    members = await workspace_service.list_workspace_members(workspace_id)
    if not any(m.get("user_id") == current_user.id for m in members):
        raise HTTPException(403, "Not a workspace member")


@router.get("/available-files")
async def get_available_artifact_files(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
):
    await _assert_member(workspace_id, current_user)
    files = await list_artifact_files(exploration_id)
    return {"status": "success", "message": "Available artifact files fetched", "data": files}


@router.post("/runs", response_model=CreateArtifactRunOut, status_code=202)
async def create_artifact_run(
    workspace_id: str,
    exploration_id: str,
    payload: CreateArtifactRunRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
):
    await _assert_member(workspace_id, current_user)
    try:
        run_id = await create_run(
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            created_by=current_user.id,
            source_file_ids=payload.source_file_ids,
            instruction=payload.instruction,
            artifact_type=payload.artifact_type,
            artifact_category=payload.artifact_category,
            comparison_mode=payload.comparison_mode,
            run_type=payload.run_type,
        )
    except ArtifactRunValidationError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(500, str(exc))

    background_tasks.add_task(run_artifact_pipeline_stages_1_to_3, run_id)
    return CreateArtifactRunOut(
        status="success",
        message="Artifact pipeline run started",
        data={"run_id": run_id},
    )


@router.post("/runs/{run_id}/personas", response_model=CreateArtifactRunOut, status_code=202)
async def generate_artifact_persona_responses(
    workspace_id: str,
    exploration_id: str,
    run_id: str,
    payload: GenerateArtifactPersonaResponsesRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
):
    """Qual Stage 4: call once the guide is ready (run status="questionnaire_ready").
    Each listed persona individually answers every guide question."""
    await _assert_member(workspace_id, current_user)

    status = await get_run_status(run_id)
    if status is None or status["workspace_id"] != workspace_id or status["exploration_id"] != exploration_id:
        raise HTTPException(404, "Artifact run not found")

    try:
        await start_persona_response_stage(run_id, payload.persona_ids)
    except ArtifactRunValidationError as exc:
        raise HTTPException(400, str(exc))

    background_tasks.add_task(run_persona_response_stage, run_id)
    return CreateArtifactRunOut(
        status="success",
        message="Persona response generation started",
        data={"run_id": run_id},
    )


@router.post("/runs/{run_id}/population-simulation", response_model=CreateArtifactRunOut, status_code=202)
async def generate_artifact_population_simulation(
    workspace_id: str,
    exploration_id: str,
    run_id: str,
    payload: GenerateArtifactPopulationRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
):
    """Quant Stage 4: call once the questionnaire is ready (run
    status="questionnaire_ready"). Each persona represents a cohort of
    sample_size simulated respondents."""
    await _assert_member(workspace_id, current_user)

    status = await get_run_status(run_id)
    if status is None or status["workspace_id"] != workspace_id or status["exploration_id"] != exploration_id:
        raise HTTPException(404, "Artifact run not found")

    personas_selection = [item.model_dump() for item in payload.personas_selection]
    try:
        await start_population_simulation_stage(run_id, personas_selection)
    except ArtifactRunValidationError as exc:
        raise HTTPException(400, str(exc))

    background_tasks.add_task(run_population_simulation_stage, run_id, personas_selection)
    return CreateArtifactRunOut(
        status="success",
        message="Population simulation started",
        data={"run_id": run_id},
    )


@router.get("/runs/{run_id}", response_model=ArtifactRunStatusOut)
async def get_artifact_run_status(
    workspace_id: str,
    exploration_id: str,
    run_id: str,
    current_user: User = Depends(get_current_active_user),
):
    await _assert_member(workspace_id, current_user)
    data = await get_run_status(run_id)
    if data is None or data["workspace_id"] != workspace_id or data["exploration_id"] != exploration_id:
        raise HTTPException(404, "Artifact run not found")
    return data


@router.get("/runs/{run_id}/results", response_model=ArtifactRunResultsOut)
async def get_artifact_run_results(
    workspace_id: str,
    exploration_id: str,
    run_id: str,
    current_user: User = Depends(get_current_active_user),
):
    await _assert_member(workspace_id, current_user)
    data = await get_run_results(run_id)
    if data is None or data["workspace_id"] != workspace_id or data["exploration_id"] != exploration_id:
        raise HTTPException(404, "Artifact run not found")
    return data
