"""
Enterprise tier management endpoints.

Role access model:
  POST /enterprise/organizations              → sp_admin, admin only
  GET  /enterprise/organizations              → sp_admin, admin only
  GET  /enterprise/organizations/{org_id}     → sp_admin, admin, enterprise_admin (own org)
  PATCH /enterprise/organizations/{org_id}/limit → sp_admin, admin only
  POST /enterprise/organizations/{org_id}/members → enterprise_admin (own org)
  GET  /enterprise/organizations/{org_id}/members → enterprise_admin (own org), sp_admin, admin
  DELETE /enterprise/organizations/{org_id}/members/{user_id} → enterprise_admin (own org)
  GET  /enterprise/organizations/{org_id}/explorations → enterprise_admin (own org), sp_admin, admin

All endpoints require authentication. Role checks are enforced inline.
"""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.schemas.enterprise import (
    EnterpriseAddMemberIn,
    EnterpriseMemberOut,
    EnterpriseOrgCreate,
    EnterpriseOrgOut,
    EnterpriseUpdateLimitIn,
)
from app.schemas.response import SuccessResponse
from app.services import enterprise_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/enterprise", tags=["Enterprise"])


# ---------------------------------------------------------------------------
# Internal guards
# ---------------------------------------------------------------------------

def _require_sp_admin(current_user: User) -> None:
    """Only sp_admin (super_admin) or internal admin may call this."""
    if current_user.role not in ("super_admin", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def _require_enterprise_admin_or_sp(current_user: User, org_id: str) -> None:
    """
    Allow if:
      - SP admin / internal admin, OR
      - enterprise_admin whose organization_id matches org_id.
    """
    if current_user.role in ("super_admin", "admin"):
        return
    if current_user.role == "enterprise_admin" and current_user.organization_id == org_id:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


# ---------------------------------------------------------------------------
# Organisation CRUD (SP admin)
# ---------------------------------------------------------------------------

@router.post("/organizations", response_model=SuccessResponse, status_code=201)
async def provision_enterprise_org(
    payload: EnterpriseOrgCreate,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Provision a new enterprise organisation and its enterprise_admin user.

    Sends credentials to the enterprise admin via email.
    SP admin / internal admin only.
    """
    _require_sp_admin(current_user)

    org, admin_user, temp_password = await enterprise_service.provision_enterprise_org(
        session=session,
        data=payload,
        created_by_id=current_user.id,
    )

    from app.utils.email_utils import send_enterprise_welcome_email
    background_tasks.add_task(
        send_enterprise_welcome_email,
        admin_user.email,
        admin_user.full_name,
        temp_password,
    )

    logger.info(
        "Enterprise org provisioned via API",
        extra={"org_id": org.id, "provisioned_by": current_user.id},
    )
    return SuccessResponse(
        message="Enterprise organisation created. Credentials sent to admin via email.",
        data={
            "org_id": org.id,
            "org_name": org.name,
            "exploration_limit": org.exploration_limit,
            "admin_user_id": admin_user.id,
            "admin_email": admin_user.email,
        },
    )


@router.get("/organizations", response_model=SuccessResponse)
async def list_enterprise_orgs(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """List all enterprise organisations. SP admin / internal admin only."""
    _require_sp_admin(current_user)
    orgs = await enterprise_service.list_enterprise_orgs(session)
    return SuccessResponse(
        message="Enterprise organisations fetched successfully",
        data=[EnterpriseOrgOut.model_validate(o).model_dump() for o in orgs],
    )


@router.get("/organizations/{org_id}", response_model=SuccessResponse)
async def get_enterprise_org(
    org_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Fetch details of a specific enterprise org."""
    _require_enterprise_admin_or_sp(current_user, org_id)
    org = await enterprise_service.get_enterprise_org(session, org_id)
    return SuccessResponse(
        message="Enterprise organisation fetched successfully",
        data=EnterpriseOrgOut.model_validate(org).model_dump(),
    )


@router.patch("/organizations/{org_id}/limit", response_model=SuccessResponse)
async def update_org_exploration_limit(
    org_id: str,
    payload: EnterpriseUpdateLimitIn,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Adjust an enterprise org's exploration quota. SP admin / internal admin only."""
    _require_sp_admin(current_user)
    org = await enterprise_service.update_enterprise_org_limit(
        session=session,
        org_id=org_id,
        new_limit=payload.exploration_limit,
    )
    logger.info(
        "Org limit updated via API",
        extra={"org_id": org_id, "new_limit": payload.exploration_limit, "by": current_user.id},
    )
    return SuccessResponse(
        message="Exploration limit updated successfully",
        data={
            "org_id": org.id,
            "exploration_limit": org.exploration_limit,
            "exploration_count": org.exploration_count,
        },
    )


# ---------------------------------------------------------------------------
# Member management (enterprise_admin)
# ---------------------------------------------------------------------------

@router.post("/organizations/{org_id}/members", response_model=SuccessResponse, status_code=201)
async def add_enterprise_member(
    org_id: str,
    payload: EnterpriseAddMemberIn,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Add a standard user to the enterprise org.

    Enterprise admin (of this org) or SP admin only.
    Sends login credentials to the new user via email.
    """
    _require_enterprise_admin_or_sp(current_user, org_id)

    user, temp_password = await enterprise_service.add_enterprise_member(
        session=session,
        org_id=org_id,
        data=payload,
        added_by_id=current_user.id,
    )

    from app.utils.email_utils import send_enterprise_welcome_email
    background_tasks.add_task(
        send_enterprise_welcome_email,
        user.email,
        user.full_name,
        temp_password,
    )

    logger.info(
        "Enterprise member added via API",
        extra={"org_id": org_id, "new_user_id": user.id, "by": current_user.id},
    )
    return SuccessResponse(
        message="Member added successfully. Credentials sent via email.",
        data=EnterpriseMemberOut.model_validate(user).model_dump(),
    )


@router.get("/organizations/{org_id}/members", response_model=SuccessResponse)
async def list_enterprise_members(
    org_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """List all members of an enterprise org."""
    _require_enterprise_admin_or_sp(current_user, org_id)
    members = await enterprise_service.list_enterprise_members(session, org_id)
    return SuccessResponse(
        message="Enterprise members fetched successfully",
        data=[EnterpriseMemberOut.model_validate(m).model_dump() for m in members],
    )


@router.delete("/organizations/{org_id}/members/{user_id}", response_model=SuccessResponse)
async def remove_enterprise_member(
    org_id: str,
    user_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Remove a member from the enterprise org.

    Unlinks the user (sets organization_id=None, reverts to free tier).
    Does NOT hard-delete the user account.
    """
    _require_enterprise_admin_or_sp(current_user, org_id)
    await enterprise_service.remove_enterprise_member(
        session=session,
        org_id=org_id,
        user_id=user_id,
        removed_by_id=current_user.id,
    )
    logger.info(
        "Enterprise member removed via API",
        extra={"org_id": org_id, "user_id": user_id, "by": current_user.id},
    )
    return SuccessResponse(message="Member removed from enterprise organisation successfully")


# ---------------------------------------------------------------------------
# Cross-workspace exploration view (enterprise admin)
# ---------------------------------------------------------------------------

@router.get("/organizations/{org_id}/explorations", response_model=SuccessResponse)
async def list_org_explorations(
    org_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Return all explorations across every workspace in the enterprise org.

    Provides the cross-workspace view that enterprise admins need.
    SP admin and enterprise_admin (own org) only.
    """
    _require_enterprise_admin_or_sp(current_user, org_id)
    explorations = await enterprise_service.list_enterprise_explorations(session, org_id)
    return SuccessResponse(
        message="Enterprise explorations fetched successfully",
        data=[
            {
                "id": e.id,
                "workspace_id": e.workspace_id,
                "title": e.title,
                "description": e.description,
                "is_quantitative": e.is_quantitative,
                "is_qualitative": e.is_qualitative,
                "is_end": e.is_end,
                "created_by": e.created_by,
                "created_at": e.created_at,
            }
            for e in explorations
        ],
    )
