from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.schemas.response import SuccessResponse
from app.services.admin_service import list_users, get_user_stats, update_user_active_status, get_date_range, \
    users_monthly_count, workspaces_monthly_count, explorations_monthly_count, persona_distribution, new_users_monthly, \
    get_user_dashboard
from app.routers.auth_dependencies import get_current_active_user
from app.models.user import User
from app.services import workspace as ws_service
from app.services import admin_service
from datetime import date


router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("", response_model=SuccessResponse)
async def super_admin_dashboard(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    # if current_user.role != "super_admin":
    #     raise HTTPException(403, "Forbidden")

    start, end = get_date_range(start_date, end_date)

    users = await users_monthly_count(session, start, end)
    workspaces = await workspaces_monthly_count(session, start, end)
    explorations = await explorations_monthly_count(session, start, end)
    new_users = await new_users_monthly(session, start, end)
    personas = await persona_distribution(session)

    return SuccessResponse(
        message="Dashboard data fetched successfully",
        data={
            "range": {
                "start_date": start,
                "end_date": end,
            },
            "users": users,
            "new_users": new_users,
            "workspaces": workspaces,
            "explorations": explorations,
            "persona_distribution": personas,
        }
    )



@router.patch("/{user_id}/active", response_model=SuccessResponse)
async def toggle_user_active_status(
    user_id: str,
    is_active: bool,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    if current_user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden"
        )

    user = await update_user_active_status(
        session=session,
        user_id=user_id,
        is_active=is_active
    )

    return SuccessResponse(
        message="User status updated successfully",
        data={
            "user_id": user.id,
            "is_active": user.is_active
        }
    )


@router.get("/users", response_model=SuccessResponse)
async def get_users(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    users = await list_users(session)

    return SuccessResponse(
        message="Users fetched successfully",
        data=users,
    )



@router.get("/users/{user_id}/stats", response_model=SuccessResponse)
async def get_user_stats(
    user_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    counts = await admin_service.get_user_counts(
        session=session,
        user_id=user_id,
    )

    return SuccessResponse(
        message="User stats fetched successfully",
        data={
            "user_id": user_id,
            **counts
        }
    )


@router.get("/dashboard")
async def user_dashboard(
    filter_type: str,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_active_user),
):
    return await get_user_dashboard(
        session=session,
        user_id=current_user.id,
        filter_type=filter_type
    )


