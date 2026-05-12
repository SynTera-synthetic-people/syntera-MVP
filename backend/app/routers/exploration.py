from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_session
from app.schemas.exploration import (
    ExplorationCreate,
    ExplorationUpdate,
    ExplorationOut,
    ExplorationMethodSelect,
)
from app.services.exploration import (
    create_exploration,
    get_explorations_by_workspace,
    get_exploration,
    get_exploration_enriched,
    update_exploration,
    delete_exploration,
    select_exploration_method,
    TrialLimitReachedException,
    PlanLimitReachedException,
    WorkflowError,
)
from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.services.product_state import compute_user_product_state

router = APIRouter(prefix="/explorations", tags=["Explorations"])


def _assert_owner_or_admin(exploration, current_user: User) -> None:
    if current_user.role in ("admin", "super_admin"):
        return
    if exploration.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this exploration")


@router.post("", response_model=ExplorationOut, status_code=201)
async def create(
    data: ExplorationCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    try: return await create_exploration(
            session,
            data.workspace_id,
            current_user.id,
            data,
            current_user=current_user,
        )
    except TrialLimitReachedException:
        product_state = await compute_user_product_state(session, current_user)
        return JSONResponse(
            status_code=403,
            content=jsonable_encoder({
                "status": "error",
                "message": "Trial limit reached. Upgrade your plan to continue.",
                "upgrade_required": True,
                "product_state": product_state,
            }),
        )
    except PlanLimitReachedException:
        product_state = await compute_user_product_state(session, current_user)
        return JSONResponse(
            status_code=403,
            content=jsonable_encoder({
                "status": "error",
                "message": "Exploration limit reached for your current plan. Please contact support to purchase additional explorations.",
                "upgrade_required": True,
                "product_state": product_state,
            }),
        )


@router.get("/workspace/{workspace_id}", response_model=list[ExplorationOut])
async def get_all(
    workspace_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    return await get_explorations_by_workspace(session, workspace_id, current_user=current_user)


@router.get("/{exploration_id}", response_model=ExplorationOut)
async def get_one(
    exploration_id: str,
    session: AsyncSession = Depends(get_session),
):
    # Use enriched fetch so current_step is granular (same as list endpoint)
    exploration = await get_exploration_enriched(session, exploration_id)
    if not exploration:
        raise HTTPException(status_code=404, detail="Exploration not found")
    return exploration


@router.put("/{exploration_id}", response_model=ExplorationOut)
async def update(
    exploration_id: str,
    data: ExplorationUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    exploration = await get_exploration(session, exploration_id)
    if not exploration:
        raise HTTPException(status_code=404, detail="Exploration not found")

    _assert_owner_or_admin(exploration, current_user)

    return await update_exploration(session, exploration, data, updated_by=current_user.id)


@router.delete("/{exploration_id}", status_code=200)
async def delete(
    exploration_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    exploration = await get_exploration(session, exploration_id)
    if not exploration:
        raise HTTPException(status_code=404, detail="Exploration not found")

    _assert_owner_or_admin(exploration, current_user)

    await delete_exploration(session, exploration, current_user=current_user)

    return {"status": "success", "message": "Exploration deleted successfully"}


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
    except WorkflowError as e:
        raise HTTPException(status_code=400, detail=e.message)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
