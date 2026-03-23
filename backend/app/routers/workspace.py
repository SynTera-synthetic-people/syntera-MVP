from datetime import datetime
import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.organization import Organization
from app.models.user import User
from app.models.omi import WorkflowStage
from app.routers.auth_dependencies import get_current_active_user
from app.schemas.response import DeleteResponse, ErrorResponse, SuccessResponse
from app.schemas.workspace import InviteMemberIn, RoleUpdate, WorkspaceCreate
from app.services import workspace as ws_service
from app.services.auth import get_user_by_email
from app.utils.email_utils import send_invite_email
from app.utils.omi_helpers import notify_omi_stage_change

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


def _workspace_to_dict(workspace) -> dict:
    return {
        "id": workspace.id,
        "name": workspace.name,
        "description": workspace.description,
        "department_name": workspace.department_name,
        "created_at": workspace.created_at,
        "is_hidden": getattr(workspace, "is_hidden", False),
        "is_default_personal": getattr(workspace, "is_default_personal", False),
    }


@router.get("/", response_model=SuccessResponse)
async def list_workspaces(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    workspaces = await ws_service.list_accessible_workspaces(session, current_user)
    return SuccessResponse(
        message="Workspaces fetched successfully",
        data=[_workspace_to_dict(workspace) for workspace in workspaces],
    )


@router.post("/", response_model=SuccessResponse, status_code=201)
async def create_workspace(
    payload: WorkspaceCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    if current_user.role != "enterprise_admin" or not current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(
                status="error",
                message="Only enterprise admins can create workspaces.",
            ).dict(),
        )

    org = await session.get(Organization, current_user.organization_id)
    if not org or org.account_tier != "enterprise":
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                status="error",
                message="Enterprise organization not found. Cannot create a workspace.",
            ).dict(),
        )

    workspace = await ws_service.create_workspace(
        org_id=org.id,
        name=payload.name,
        description=payload.description,
        department_name=payload.department_name,
        creator_id=current_user.id,
        creator_email=current_user.email,
    )

    try:
        await notify_omi_stage_change(
            workspace["id"],
            current_user.id,
            WorkflowStage.WORKSPACE_SETUP,
        )
    except Exception as exc:
        print(f"Omi initialization failed: {exc}")

    return SuccessResponse(
        message="Workspace created successfully",
        data=workspace,
    )


@router.get("/invitations/details", response_model=SuccessResponse)
async def get_invitation_details(token: str = Query(...)):
    invite = await ws_service.get_invite_by_token(token)
    if not invite:
        raise HTTPException(
            404,
            ErrorResponse(status="error", message="Invalid or expired invite token").dict(),
        )

    workspace = await ws_service.get_workspace_by_id(invite.workspace_id)
    if not workspace:
        raise HTTPException(
            404,
            ErrorResponse(status="error", message="Workspace not found").dict(),
        )

    is_expired = bool(invite.token_expiry and invite.token_expiry < datetime.utcnow())
    return SuccessResponse(
        message="Invitation fetched successfully",
        data={
            "email": invite.email,
            "workspace_id": invite.workspace_id,
            "workspace_name": workspace.name,
            "accepted": invite.accepted,
            "expired": is_expired,
        },
    )


@router.post("/invitations/accept", response_model=SuccessResponse)
async def accept_invitation(
    token: str = Query(...),
    current_user: User = Depends(get_current_active_user),
):
    invite = await ws_service.get_invite_by_token(token)
    if not invite:
        raise HTTPException(
            404,
            ErrorResponse(status="error", message="Invalid or expired invite token").dict(),
        )

    if invite.token_expiry and invite.token_expiry < datetime.utcnow():
        raise HTTPException(
            400,
            ErrorResponse(status="error", message="Invitation has expired").dict(),
        )

    success, msg, workspace_id = await ws_service.accept_invite(token, current_user)
    if not success:
        raise HTTPException(
            400 if "match" not in msg.lower() else 403,
            ErrorResponse(status="error", message=msg).dict(),
        )

    return SuccessResponse(
        message="Invitation accepted successfully",
        data={"workspace_id": workspace_id},
    )


@router.get("/{workspace_id}", response_model=SuccessResponse)
async def get_workspace_by_id(
    workspace_id: str,
    current_user: User = Depends(get_current_active_user),
):
    workspace = await ws_service.get_workspace_by_id(workspace_id)
    if not workspace:
        raise HTTPException(
            404,
            ErrorResponse(status="error", message="Workspace not found").dict(),
        )

    has_access = await ws_service.has_workspace_access(workspace_id, current_user)
    if not has_access:
        raise HTTPException(
            403,
            ErrorResponse(
                status="error",
                message="You do not have access to this workspace",
            ).dict(),
        )

    try:
        await notify_omi_stage_change(
            workspace_id,
            current_user.id,
            WorkflowStage.WORKSPACE_SETUP,
        )
    except Exception as exc:
        print(f"Omi session check failed: {exc}")

    return SuccessResponse(
        message="Workspace fetched successfully",
        data=_workspace_to_dict(workspace),
    )


@router.put("/{workspace_id}", response_model=SuccessResponse)
async def update_workspace(
    workspace_id: str,
    payload: WorkspaceCreate,
    current_user: User = Depends(get_current_active_user),
):
    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(
            403,
            ErrorResponse(
                status="error",
                message="Only workspace admins can update workspace details",
            ).dict(),
        )

    updated = await ws_service.update_workspace(workspace_id, payload)
    return SuccessResponse(
        message="Workspace updated successfully",
        data=updated,
    )


@router.post("/{workspace_id}/invite", response_model=SuccessResponse, status_code=201)
async def invite_member(
    workspace_id: str,
    payload: InviteMemberIn,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    workspace = await ws_service.get_workspace_by_id(workspace_id)
    if not workspace:
        raise HTTPException(
            404,
            ErrorResponse(status="error", message="Workspace not found").dict(),
        )

    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(
            403,
            ErrorResponse(
                status="error",
                message="Only workspace admins can invite new members",
            ).dict(),
        )

    org = await session.get(Organization, workspace.organization_id)
    if not org or org.account_tier != "enterprise":
        raise HTTPException(
            403,
            ErrorResponse(
                status="error",
                message="Workspace invitations are only available for enterprise workspaces.",
            ).dict(),
        )

    email = payload.email.strip().lower()
    existing_user = await get_user_by_email(session, email)
    temp_password = None

    if not existing_user:
        try:
            _, temp_password = await ws_service.provision_workspace_invite_user(
                session,
                workspace.id,
                email,
            )
        except ValueError as exc:
            raise HTTPException(
                400,
                ErrorResponse(status="error", message=str(exc)).dict(),
            )

    token = secrets.token_urlsafe(32)
    try:
        await ws_service.create_workspace_invite(
            workspace_id=workspace.id,
            email=email,
            role=payload.role,
            token=token,
            expiry_days=7,
        )
    except ValueError as exc:
        raise HTTPException(
            400,
            ErrorResponse(status="error", message=str(exc)).dict(),
        )
    background_tasks.add_task(send_invite_email, email, token, workspace.name, temp_password)

    return SuccessResponse(
        message="Invitation sent successfully",
        data={"invite_token": token, "account_created": temp_password is not None},
    )


@router.get("/{workspace_id}/members", response_model=SuccessResponse)
async def list_members(
    workspace_id: str,
    current_user: User = Depends(get_current_active_user),
):
    if not await ws_service.has_workspace_access(workspace_id, current_user):
        raise HTTPException(
            403,
            ErrorResponse(
                status="error",
                message="You are not a member of this workspace",
            ).dict(),
        )

    members = await ws_service.list_workspace_members(workspace_id)
    return SuccessResponse(
        message="Workspace members fetched successfully",
        data=members,
    )


@router.put("/{workspace_id}/members/{member_id}/role", response_model=SuccessResponse)
async def change_role(
    workspace_id: str,
    member_id: str,
    payload: RoleUpdate,
    current_user: User = Depends(get_current_active_user),
):
    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(
            403,
            ErrorResponse(
                status="error",
                message="Only workspace admins can change member roles",
            ).dict(),
        )

    await ws_service.change_member_role(workspace_id, member_id, payload.new_role)
    return SuccessResponse(message=f"Member role updated to {payload.new_role}")


@router.delete("/{workspace_id}/members/{member_id}", response_model=DeleteResponse)
async def remove_member(
    workspace_id: str,
    member_id: str,
    current_user: User = Depends(get_current_active_user),
):
    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(
            403,
            ErrorResponse(
                status="error",
                message="Only workspace admins can remove members",
            ).dict(),
        )

    await ws_service.remove_member(workspace_id, member_id)
    return DeleteResponse(message="Workspace member removed successfully")


@router.delete("/{workspace_id}", response_model=DeleteResponse)
async def delete_workspace(
    workspace_id: str,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    workspace = await ws_service.get_workspace_by_id(workspace_id)
    if not workspace:
        raise HTTPException(
            404,
            ErrorResponse(
                status="error",
                message="Workspace not found",
            ).dict(),
        )

    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(
            403,
            ErrorResponse(
                status="error",
                message="Only workspace admins can delete a workspace",
            ).dict(),
        )

    has_ro = await ws_service.workspace_has_research_objectives(session, workspace_id)
    if has_ro:
        raise HTTPException(
            status_code=409,
            detail=(
                "Workspace cannot be deleted because one or more explorations "
                "have a finalized research objective."
            ),
        )

    await ws_service.delete_workspace(workspace_id)
    return DeleteResponse(message="Workspace deleted successfully")
