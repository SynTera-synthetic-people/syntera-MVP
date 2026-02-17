from sqlmodel import select

from app.models.organization import Organization
from app.models.workspace import Workspace, WorkspaceMember
from app.db import async_engine
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
import secrets
from app.utils.email_utils import send_invite_email
from sqlalchemy import select
from app.models import exploration, research_objectives
from app.models.exploration import Exploration
from app.models.research_objectives import ResearchObjectives
from sqlalchemy import select, func


async def count_workspaces_by_owner(
    session: AsyncSession,
    user_id: str
) -> int:
    result = await session.scalar(
        select(func.count(Workspace.id))
        .join(
            Organization,
            Workspace.organization_id == Organization.id
        )
        .where(Organization.owner_id == user_id)
    )

    return result or 0




async def create_workspace(
    org_id: str,
    name: str,
    description: str = None,
    department_name: str = None,
    creator_id: str = None,
    creator_email: str = None
):
    async with AsyncSession(async_engine) as session:
        workspace = Workspace(
            name=name,
            description=description,
            department_name=department_name,
            organization_id=org_id
        )
        session.add(workspace)
        await session.commit()
        await session.refresh(workspace)

        workspace_data = {
            "id": workspace.id,
            "name": workspace.name,
            "description": workspace.description,
            "department_name": workspace.department_name,
        }

        if creator_id and creator_email:
            admin_member = WorkspaceMember(
                workspace_id=workspace.id,
                user_id=creator_id,
                email=creator_email,
                role="admin",
                accepted=True
            )
            session.add(admin_member)
            await session.commit()

        return workspace_data


async def get_workspaces_by_org(org_id: str):
    async with AsyncSession(async_engine) as session:
        getWorkspace = select(Workspace).where(Workspace.organization_id == org_id)
        response = await session.execute(getWorkspace)
        return response.scalars().all()


async def update_workspace(workspace_id: str, data):
    async with AsyncSession(async_engine) as session:
        updateWorkspace = select(Workspace).where(Workspace.id == workspace_id)
        response = await session.execute(updateWorkspace)
        workspace = response.scalars().first()

        if not workspace:
            raise ValueError("Workspace not found")

        workspace.name = data.name
        workspace.description = data.description
        workspace.department_name = data.department_name

        session.add(workspace)
        await session.commit()
        await session.refresh(workspace)
        return workspace


async def create_workspace_invite(
    workspace_id: str,
    email: str,
    role: str,
    token: str = None,
    expiry_days: int = 7
):
    token = token or secrets.token_urlsafe(32)
    expiry = datetime.utcnow() + timedelta(days=expiry_days)

    async with AsyncSession(async_engine) as session:
        invite = WorkspaceMember(
            workspace_id=workspace_id,
            email=email,
            role=role,
            token=token,
            token_expiry=expiry,
            accepted=False
        )
        session.add(invite)
        await session.commit()
        await session.refresh(invite)

    # # 🟢 Try sending email, don't break app if email fails
    # try:
    #     await send_invite_email(email, token)
    # except Exception as e:
    #     print(f"[EMAIL WARNING] Failed to send invite email to {email}: {e}")

    return invite


async def get_invite_by_token(token: str):
    async with AsyncSession(async_engine) as session:
        inviteUser = select(WorkspaceMember).where(WorkspaceMember.token == token)
        response = await session.execute(inviteUser)
        return response.scalars().first()


async def accept_invite(token: str, user):
    async with AsyncSession(async_engine) as session:
        acceptInvite = select(WorkspaceMember).where(WorkspaceMember.token == token)
        response = await session.execute(acceptInvite)
        invite = response.scalars().first()

        if not invite:
            return False, "Invalid token"
        if invite.accepted:
            return False, "Already accepted"
        if invite.token_expiry < datetime.utcnow():
            return False, "Invite expired"

        invite.user_id = user.id
        invite.accepted = True
        invite.token = None
        invite.token_expiry = None

        session.add(invite)
        await session.commit()
        return True, "Invite accepted successfully"


async def list_workspace_members(workspace_id: str):
    async with AsyncSession(async_engine) as session:
        listMembers = select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id)
        response = await session.execute(listMembers)
        return response.scalars().all()


async def is_workspace_admin(workspace_id: str, user_id: str):
    async with AsyncSession(async_engine) as session:
        workspaceAdmin = select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.role == "admin"
        )
        response = await session.execute(workspaceAdmin)
        return response.scalars().first() is not None


async def change_member_role(workspace_id: str, member_id: str, new_role: str):
    async with AsyncSession(async_engine, expire_on_commit=False) as session:
        changeRole = select(WorkspaceMember).where(
            WorkspaceMember.id == member_id,
            WorkspaceMember.workspace_id == workspace_id
        )
        response = await session.execute(changeRole)
        member = response.scalars().first()

        if not member:
            raise ValueError("Workspace member not found")

        member.role = new_role
        session.add(member)
        await session.flush()
        await session.commit()
        await session.refresh(member)

        return member


async def remove_member(workspace_id: str, member_id: str):
    async with AsyncSession(async_engine, expire_on_commit=False) as session:
        removeMember = select(WorkspaceMember).where(
            WorkspaceMember.id == member_id,
            WorkspaceMember.workspace_id == workspace_id
        )
        response = await session.execute(removeMember)
        member = response.scalars().first()

        if not member:
            raise ValueError("Workspace member not found")

        await session.delete(member)
        await session.flush()
        await session.commit()

        return {"message": f"Member {member.email} removed successfully"}


async def get_first_workspace(org_id: str):
    async with AsyncSession(async_engine) as session:
        firstWorkspace = select(Workspace).where(Workspace.organization_id == org_id)
        response = await session.execute(firstWorkspace)
        return response.scalars().first()


async def get_workspace_by_id(workspace_id: str):
    async with AsyncSession(async_engine) as session:
        getWorkspaceByid = select(Workspace).where(Workspace.id == workspace_id)
        response = await session.execute(getWorkspaceByid)
        return response.scalars().first()


async def is_workspace_member(workspace_id: str, user_id: str):
    async with AsyncSession(async_engine) as session:
        query = select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.accepted == True
        )
        result = await session.execute(query)
        return result.scalars().first() is not None


async def delete_workspace(workspace_id: str):
    async with AsyncSession(async_engine, expire_on_commit=False) as session:

        members_query = select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id
        )
        members_result = await session.execute(members_query)
        members = members_result.scalars().all()

        for member in members:
            await session.delete(member)

        workspace_query = select(Workspace).where(Workspace.id == workspace_id)
        workspace_result = await session.execute(workspace_query)
        workspace = workspace_result.scalars().first()

        if not workspace:
            raise ValueError("Workspace not found")

        await session.delete(workspace)
        await session.commit()

        return {"message": "Workspace deleted"}


async def workspace_has_research_objectives(
    session: AsyncSession,
    workspace_id: str,
) -> bool:
    # get explorations under workspace
    exploration_ids_result = await session.execute(
        select(Exploration.id).where(
            Exploration.workspace_id == workspace_id,
            Exploration.is_deleted == False
        )
    )

    exploration_ids = exploration_ids_result.scalars().all()

    if not exploration_ids:
        return False

    # check if any research objective exists
    ro_exists = await session.execute(
        select(ResearchObjectives.id).where(
            ResearchObjectives.exploration_id.in_(exploration_ids)
        ).limit(1)
    )

    return ro_exists.first() is not None
