from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    BackgroundTasks,
    Query,
)
import secrets
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from app.db import get_session
from app.models.user import User
from app.schemas.response import SuccessResponse, ErrorResponse, DeleteResponse
from app.schemas.workspace import WorkspaceCreate, WorkspaceOut, InviteMemberIn, RoleUpdate
from app.routers.auth_dependencies import get_current_active_user
from app.services import workspace as ws_service
from app.services import organization as org_service
from app.services.auth import get_user_by_email
from app.utils.email_utils import send_invite_email

# Omi integration
from app.utils.omi_helpers import notify_omi_stage_change
from app.models.omi import WorkflowStage

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


@router.get("/", response_model=SuccessResponse)
async def list_workspaces(current_user: User = Depends(get_current_active_user)):
    org = await org_service.get_organization_by_owner(current_user.id)
    if not org:
        raise HTTPException(
            404,
            ErrorResponse(
                status="error",
                message="Organization not found for this user"
            ).dict()
        )

    workspaces = await ws_service.get_workspaces_by_org(org.id)

    return SuccessResponse(
        message="Workspaces fetched successfully",
        data=workspaces
    )


@router.post("/", response_model=SuccessResponse, status_code=201)
async def create_workspace(
    payload: WorkspaceCreate,
    current_user: User = Depends(get_current_active_user),
):
    org = await org_service.get_organization_by_owner(current_user.id)
    if not org:
        raise HTTPException(
            404,
            ErrorResponse(
                status="error",
                message="Organization not found. Cannot create a workspace."
            ).dict()
        )

    workspace = await ws_service.create_workspace(
        org_id=org.id,
        name=payload.name,
        description=payload.description,
        department_name=payload.department_name,
        creator_id=current_user.id,
        creator_email=current_user.email,
    )
    
    # Initialize Omi session for this workspace
    try:
        await notify_omi_stage_change(
            workspace.id,
            current_user.id,
            WorkflowStage.WORKSPACE_SETUP
        )
    except Exception as e:
        # Don't fail workspace creation if Omi fails
        print(f"Omi initialization failed: {e}")

    return SuccessResponse(
        message="Workspace created successfully",
        data=workspace
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
            ErrorResponse(status="error", message="Workspace not found").dict()
        )

    is_member = await ws_service.is_workspace_member(workspace_id, current_user.id)
    if not is_member:
        raise HTTPException(
            403,
            ErrorResponse(
                status="error",
                message="You are not a member of this workspace"
            ).dict()
        )
    
    # Ensure Omi session exists when user accesses workspace
    try:
        await notify_omi_stage_change(
            workspace_id,
            current_user.id,
            WorkflowStage.WORKSPACE_SETUP
        )
    except Exception as e:
        # Don't fail workspace access if Omi fails
        print(f"Omi session check failed: {e}")

    return SuccessResponse(
        message="Workspace fetched successfully",
        data=workspace
    )


@router.put("/{workspace_id}", response_model=SuccessResponse)
async def update_workspace(
    workspace_id: str,
    payload: WorkspaceCreate,
    current_user: User = Depends(get_current_active_user),
):
    org = await org_service.get_organization_by_workspace_id(workspace_id)

    if not org:
        raise HTTPException(
            404,
            ErrorResponse(
                status="error",
                message="Workspace not found"
            ).dict()
        )

    if org.owner_id != current_user.id:
        raise HTTPException(
            403,
            ErrorResponse(
                status="error",
                message="Only workspace owners can update workspace details"
            ).dict()
        )

    updated = await ws_service.update_workspace(workspace_id, payload)

    return SuccessResponse(
        message="Workspace updated successfully",
        data=updated
    )


@router.post("/{workspace_id}/invite", response_model=SuccessResponse, status_code=201)
async def invite_member(
    workspace_id: str,
    payload: InviteMemberIn,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
):
    workspace = await ws_service.get_workspace_by_id(workspace_id)
    if not workspace:
        raise HTTPException(
            404,
            ErrorResponse(status="error", message="Workspace not found").dict()
        )

    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(
            403,
            ErrorResponse(
                status="error",
                message="Only workspace admins can invite new members"
            ).dict()
        )

    token = secrets.token_urlsafe(32)

    await ws_service.create_workspace_invite(
        workspace_id=workspace.id,
        email=payload.email,
        role=payload.role,
        token=token,
        expiry_days=7,
    )

    background_tasks.add_task(send_invite_email, payload.email, token)

    return SuccessResponse(
        message="Invitation sent successfully",
        data={"invite_token": token}
    )


@router.post("/invitations/accept", response_model=SuccessResponse)
async def accept_invitation(token: str = Query(...)):

    invite = await ws_service.get_invite_by_token(token)
    if not invite:
        raise HTTPException(
            404, ErrorResponse(status="error", message="Invalid or expired invite token").dict()
        )

    if invite.token_expiry < datetime.utcnow():
        raise HTTPException(
            400, ErrorResponse(status="error", message="Invitation has expired").dict()
        )

    user = await get_user_by_email(invite.email)
    if not user:
        return SuccessResponse(
            message="Please sign up first using the same email.",
            data=None
        )

    success, msg = await ws_service.accept_invite(token, user)
    if not success:
        raise HTTPException(
            400,
            ErrorResponse(status="error", message=msg).dict()
        )

    return SuccessResponse(message="Invitation accepted successfully")


@router.get("/{workspace_id}/members", response_model=SuccessResponse)
async def list_members(
    workspace_id: str,
    current_user: User = Depends(get_current_active_user),
):
    members = await ws_service.list_workspace_members(workspace_id)

    if not any(m.user_id == current_user.id for m in members):
        raise HTTPException(
            403,
            ErrorResponse(
                status="error",
                message="You are not a member of this workspace"
            ).dict()
        )

    return SuccessResponse(
        message="Workspace members fetched successfully",
        data=members
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
                message="Only workspace admins can change member roles"
            ).dict()
        )

    await ws_service.change_member_role(workspace_id, member_id, payload.new_role)

    return SuccessResponse(
        message=f"Member role updated to {payload.new_role}"
    )


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
                message="Only workspace admins can remove members"
            ).dict()
        )

    await ws_service.remove_member(workspace_id, member_id)

    return DeleteResponse(message="Workspace member removed successfully")


@router.get("/invitations/accept")
async def accept_invitation_link(token: str = Query(...)):
    invite = await ws_service.get_invite_by_token(token)
    if not invite:
        return {"message": "Invalid invite token"}

    if invite.token_expiry < datetime.utcnow():
        return {"message": "This invitation link has expired."}

    if invite.accepted:
        return {"message": "You’ve already accepted this invitation."}

    user = await get_user_by_email(invite.email)
    if not user:
        return {
            "message": (
                f"No account found for {invite.email}. "
                "Please sign up using the same email to accept this invite."
            )
        }

    success, msg = await ws_service.accept_invite(token, user)
    if success:
        return {"message": "Invitation accepted successfully! You can now access the workspace."}

    return {"message": msg}



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
                message="Workspace not found"
            ).dict()
        )

    org = await org_service.get_organization_by_workspace_id(workspace_id)
    if not org:
        raise HTTPException(
            404,
            ErrorResponse(status="error", message="Organization not found").dict()
        )

    if org.owner_id != current_user.id:
        raise HTTPException(
            403,
            ErrorResponse(
                status="error",
                message="Only organization owners can delete a workspace"
            ).dict()
        )

    has_ro = await ws_service.workspace_has_research_objectives(
        session,
        workspace_id
    )

    if has_ro:
        raise HTTPException(
            status_code=409,
            detail=(
                "Workspace cannot be deleted because one or more explorations "
                "have a finalized research objective."
            )
        )

    await ws_service.delete_workspace(workspace_id)

    return DeleteResponse(message="Workspace deleted successfully")
