from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_session
from app.schemas.exploration import (
    ExplorationCreate,
    ExplorationUpdate,
    ExplorationOut, ExplorationMethodSelect
)
from app.services.exploration import (
    create_exploration,
    get_explorations_by_workspace,
    get_exploration,
    update_exploration,
    delete_exploration, select_exploration_method,
)
from sqlmodel import select
from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.models import research_objectives
from app.models.research_objectives import ResearchObjectives

router = APIRouter(prefix="/explorations", tags=["Explorations"])


@router.post(
    "",
    response_model=ExplorationOut,
    status_code=201
)
async def create(
    data: ExplorationCreate,
    session: AsyncSession = Depends(get_session),
    user_id: User = Depends(get_current_active_user)
):
    return await create_exploration(
        session,
        data.workspace_id,
        user_id.id,
        data
    )



@router.get(
    "/workspace/{workspace_id}",
    response_model=list[ExplorationOut]
)
async def get_all(
    workspace_id: str,
    session: AsyncSession = Depends(get_session),
):
    return await get_explorations_by_workspace(session, workspace_id)



@router.get(
    "/{exploration_id}",
    response_model=ExplorationOut
)
async def get_one(
    exploration_id: str,
    session: AsyncSession = Depends(get_session),
):
    exploration = await get_exploration(session, exploration_id)
    if not exploration:
        raise HTTPException(status_code=404, detail="Exploration not found")

    return exploration


@router.put("/{exploration_id}", response_model=ExplorationOut)
async def update(
    exploration_id: str,
    data: ExplorationUpdate,
    session: AsyncSession = Depends(get_session),
):
    exploration = await get_exploration(session, exploration_id)
    if not exploration:
        raise HTTPException(status_code=404, detail="Exploration not found")

    return await update_exploration(session, exploration, data)


@router.delete("/{exploration_id}", status_code=204)
async def delete(
    exploration_id: str,
    session: AsyncSession = Depends(get_session),
):
    exploration = await get_exploration(session, exploration_id)
    if not exploration:
        raise HTTPException(status_code=404, detail="Exploration not found")

    ro = await session.execute(
        select(ResearchObjectives.id).where(
            ResearchObjectives.exploration_id == exploration_id
        )
    )

    if ro.first():
        raise HTTPException(
            status_code=409,
            detail="Exploration cannot be deleted after research objective creation"
        )

    await delete_exploration(session, exploration)

    return {
        "status": "success",
        "message": "Exploration deleted successfully"
    }


@router.post("/{exploration_id}/method")
async def select_method(
    exploration_id: str,
    payload: ExplorationMethodSelect,
    session: AsyncSession = Depends(get_session),
):
    try:
        return await select_exploration_method(
            session=session,
            exploration_id=exploration_id,
            data=payload,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

