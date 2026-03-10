import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.db import get_session
from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.schemas.admin import AdminCreateUserIn, AdminUpdateUserIn, AdminUserDetailOut
from app.schemas.response import SuccessResponse
from app.services import admin_service
from app.services.admin_service import (
    list_users,
    get_user_stats,
    update_user_active_status,
    get_date_range,
    users_monthly_count,
    workspaces_monthly_count,
    explorations_monthly_count,
    persona_distribution,
    new_users_monthly,
    get_user_dashboard,
    create_user_by_admin,
    update_user_by_admin,
    delete_user_by_admin,
    reset_user_password_by_admin,
)
from app.services import workspace as ws_service
from app.utils.email_utils import send_welcome_email
from datetime import date

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])


def _require_admin(current_user: User) -> None:
    """Guard: only admin or super_admin roles are permitted."""
    if current_user.role not in ("admin", "super_admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")




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


# New user management routes (admin + super_admin)

@router.post("/users/provision", response_model=SuccessResponse, status_code=201)
async def admin_create_user(
    payload: AdminCreateUserIn,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Admin provisions a new user with a generated temporary password.

    Sends a welcome email with credentials in the background.
    The temporary password is also returned in the response as a backup
    in case the email is not delivered.
    """
    _require_admin(current_user)
    user, temp_password = await create_user_by_admin(session, payload)
    background_tasks.add_task(send_welcome_email, user.email, temp_password)
    logger.info(
        "User provisioned by admin",
        extra={"created_by": current_user.id, "new_user_id": user.id},
    )
    return SuccessResponse(
        message="User created successfully. Welcome email sent.",
        data={
            "user_id": user.id,
            "email": user.email,
            "role": user.role,
            "is_trial": user.is_trial,
            "temporary_password": temp_password,
        }
    )


@router.get("/users/{user_id}/detail", response_model=SuccessResponse)
async def admin_get_user_detail(
    user_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Fetch a single user's full profile including trial state."""
    _require_admin(current_user)
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return SuccessResponse(
        message="User fetched successfully.",
        data=AdminUserDetailOut.model_validate(user).model_dump(),
    )


@router.put("/users/{user_id}", response_model=SuccessResponse)
async def admin_update_user(
    user_id: str,
    payload: AdminUpdateUserIn,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Update a user's profile or trial settings (partial update)."""
    _require_admin(current_user)
    user = await update_user_by_admin(session, user_id, payload)
    return SuccessResponse(
        message="User updated successfully.",
        data=AdminUserDetailOut.model_validate(user).model_dump(),
    )


@router.patch("/users/{user_id}/deactivate", response_model=SuccessResponse)
async def admin_deactivate_user(
    user_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Deactivate a user account (sets is_active=False)."""
    _require_admin(current_user)
    user = await update_user_active_status(session=session, user_id=user_id, is_active=False)
    logger.info("Admin deactivated user", extra={"admin_id": current_user.id, "user_id": user_id})
    return SuccessResponse(
        message="User deactivated successfully.",
        data={"user_id": user.id, "is_active": user.is_active},
    )


@router.delete("/users/{user_id}", status_code=204)
async def admin_delete_user(
    user_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Hard-delete a user. This action is irreversible."""
    _require_admin(current_user)
    await delete_user_by_admin(session, user_id)


@router.post("/users/{user_id}/reset-password", response_model=SuccessResponse)
async def admin_reset_password(
    user_id: str,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Reset a user's password to a new temporary password.

    Sends new credentials via email. The temporary password is also
    returned in the response as a backup.
    """
    _require_admin(current_user)
    result = await session.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    temp_password = await reset_user_password_by_admin(session, user_id)
    background_tasks.add_task(send_welcome_email, target_user.email, temp_password)
    logger.info(
        "Admin reset user password",
        extra={"admin_id": current_user.id, "user_id": user_id},
    )
    return SuccessResponse(
        message="Password reset successfully. New credentials sent via email.",
        data={"user_id": user_id, "temporary_password": temp_password},
    )
