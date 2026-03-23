from fastapi import APIRouter, Depends, HTTPException
from app.schemas.response import SuccessResponse
from app.schemas.population import PopulationSimCreate
from app.services import population as population_service
from app.services import workspace as ws_service
from app.routers.auth_dependencies import get_current_active_user
from app.services.exploration import get_exploration
from app.models.user import User
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_session

router = APIRouter(prefix="/workspaces/{workspace_id}/explorations/{exploration_id}/population", tags=["Population"])


@router.post("/simulate", response_model=SuccessResponse)
async def simulate_population(
    workspace_id: str,
    payload: PopulationSimCreate,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):

    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m.user_id == current_user.id for m in members):
        raise HTTPException(status_code=403, detail="Not a workspace member")

    research_obj = await get_exploration(session, payload.exploration_id)
    if not research_obj:
        raise HTTPException(status_code=404, detail="Objective not found")

    sim = await population_service.create_population_simulation(
        workspace_id=workspace_id,
        exploration_id=payload.exploration_id,
        persona_ids=payload.persona_ids,
        sample_distribution=payload.sample_distribution,
        user_id=current_user.id,
        session=session,
    )

    return SuccessResponse(
        message="Population simulation created",
        data={
            "id": sim.id,
            "workspace_id": sim.workspace_id,
            "exploration_id": sim.exploration_id,
            "persona_ids": sim.persona_ids,
            "sample_distribution": sim.sample_distribution,
            "persona_scores": sim.persona_scores,
            "weighted_score": sim.weighted_score,
            "global_insights": sim.global_insights
        },
    )


@router.get("/simulations", response_model=SuccessResponse)
async def list_simulations_for_objective(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user)
):

    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m.user_id == current_user.id for m in members):
        raise HTTPException(status_code=403, detail="Not a workspace member")

    sims = await population_service.list_simulations_for_objective(workspace_id, exploration_id)

    return SuccessResponse(
        message="Population simulations fetched",
        data=sims
    )


@router.get("/simulations/{sim_id}", response_model=SuccessResponse)
async def get_simulation(
    workspace_id: str,
    sim_id: str,
    current_user: User = Depends(get_current_active_user),
):

    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m.user_id == current_user.id for m in members):
        raise HTTPException(status_code=403, detail="Not a workspace member")

    sim = await population_service.get_simulation(sim_id)
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    return SuccessResponse(message="Simulation fetched", data=sim)
