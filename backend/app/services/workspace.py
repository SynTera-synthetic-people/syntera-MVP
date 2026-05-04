from datetime import datetime, timedelta
import secrets

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_engine
from app.models.organization import Organization
from app.models.research_objectives import ResearchObjectives
from app.models.exploration import Exploration
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.utils.security import hash_password


PERSONAL_WORKSPACE_NAME = "Personal Workspace"
PERSONAL_WORKSPACE_DESCRIPTION = "System managed workspace for personal explorations."


def _build_invited_user_name(email: str) -> str:
    local_part = email.split("@", 1)[0].replace(".", " ").replace("_", " ").replace("-", " ")
    normalized = " ".join(segment for segment in local_part.split() if segment)
    return normalized.title() or email


async def count_workspaces_by_owner(
    session: AsyncSession,
    user_id: str,
) -> int:
    result = await session.scalar(
        select(func.count(Workspace.id))
        .join(Organization, Workspace.organization_id == Organization.id)
        .where(Organization.owner_id == user_id, Workspace.is_hidden.is_(False))
    )
    return result or 0


async def _get_owned_organization(session: AsyncSession, user_id: str) -> Organization | None:
    result = await session.execute(
        select(Organization)
        .where(Organization.owner_id == user_id)
        .order_by(Organization.created_at.desc())
    )
    return result.scalars().first()


async def get_or_create_personal_org(session: AsyncSession, user: User) -> Organization:
    org = await _get_owned_organization(session, user.id)
    if not org:
        org = Organization(name="My Organization", owner_id=user.id)
        session.add(org)
        await session.flush()
        await session.refresh(org)
    return org


async def _get_workspace_by_id(session: AsyncSession, workspace_id: str) -> Workspace | None:
    result = await session.execute(
        select(Workspace).where(Workspace.id == workspace_id)
    )
    return result.scalars().first()


async def ensure_personal_workspace(
    session: AsyncSession,
    user: User,
) -> Workspace:
    org = await _get_owned_organization(session, user.id)
    mutated = False

    if not org:
        org = Organization(name="My Organization", owner_id=user.id)
        session.add(org)
        await session.flush()
        mutated = True

    result = await session.execute(
        select(Workspace)
        .where(
            Workspace.organization_id == org.id,
            Workspace.is_default_personal.is_(True),
        )
        .order_by(Workspace.created_at.desc())
    )
    workspace = result.scalars().first()

    if not workspace:
        workspace = Workspace(
            name=PERSONAL_WORKSPACE_NAME,
            description=PERSONAL_WORKSPACE_DESCRIPTION,
            organization_id=org.id,
            is_hidden=True,
            is_default_personal=True,
        )
        session.add(workspace)
        await session.flush()
        mutated = True

    member_result = await session.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace.id,
            WorkspaceMember.email == user.email,
        )
    )
    member = member_result.scalars().first()
    if not member:
        member = WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            email=user.email,
            role="admin",
            accepted=True,
        )
        session.add(member)
        mutated = True
    else:
        if member.user_id != user.id:
            member.user_id = user.id
            mutated = True
        if not member.accepted:
            member.accepted = True
            mutated = True
        if member.role != "admin":
            member.role = "admin"
            mutated = True

    if mutated:
        await session.commit()
        await session.refresh(workspace)

    return workspace


async def list_accessible_workspaces(
    session: AsyncSession,
    user: User,
    *,
    include_hidden: bool = False,
) -> list[Workspace]:
    if user.role == "super_admin":
        return []

    if user.account_tier == "enterprise":
        if user.role == "enterprise_admin" and user.organization_id:
            stmt = (
                select(Workspace)
                .where(Workspace.organization_id == user.organization_id)
                .order_by(Workspace.created_at.desc())
            )
            if not include_hidden:
                stmt = stmt.where(Workspace.is_hidden.is_(False))
            result = await session.execute(stmt)
            return result.scalars().all()

        stmt = (
            select(Workspace)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(
                WorkspaceMember.user_id == user.id,
                WorkspaceMember.accepted.is_(True),
            )
            .order_by(Workspace.created_at.desc())
        )
        if not include_hidden:
            stmt = stmt.where(Workspace.is_hidden.is_(False))
        result = await session.execute(stmt)
        return result.scalars().all()

    # tier1: return workspaces they own or are a member of (non-hidden by default)
    org = await _get_owned_organization(session, user.id)
    owned_ws_ids = []
    if org:
        owned_result = await session.execute(
            select(Workspace.id).where(Workspace.organization_id == org.id)
        )
        owned_ws_ids = [row[0] for row in owned_result.all()]

    member_stmt = (
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.accepted.is_(True),
        )
        .order_by(Workspace.created_at.desc())
    )
    if not include_hidden:
        member_stmt = member_stmt.where(Workspace.is_hidden.is_(False))
    member_result = await session.execute(member_stmt)
    member_workspaces = list(member_result.scalars().all())

    if owned_ws_ids:
        owned_stmt = (
            select(Workspace)
            .where(Workspace.id.in_(owned_ws_ids))
            .order_by(Workspace.created_at.desc())
        )
        if not include_hidden:
            owned_stmt = owned_stmt.where(Workspace.is_hidden.is_(False))
        owned_result2 = await session.execute(owned_stmt)
        owned_workspaces = list(owned_result2.scalars().all())
        seen = {ws.id for ws in member_workspaces}
        for ws in owned_workspaces:
            if ws.id not in seen:
                member_workspaces.append(ws)
                seen.add(ws.id)

    if include_hidden:
        personal = await ensure_personal_workspace(session, user)
        if personal.id not in {ws.id for ws in member_workspaces}:
            member_workspaces.append(personal)

    return member_workspaces


async def get_workspace_bootstrap(
    session: AsyncSession,
    user: User,
) -> dict:
    if user.role == "super_admin":
        return {
            "landing_type": "admin_dashboard",
            "preferred_workspace_id": None,
            "default_workspace_id": None,
            "has_accessible_workspaces": False,
            "can_create_workspace": False,
        }

    accessible_workspaces = await list_accessible_workspaces(
        session,
        user,
        include_hidden=False,
    )
    preferred_workspace_id = accessible_workspaces[0].id if accessible_workspaces else None

    if user.account_tier == "enterprise":
        landing_type = "workspace_dashboard" if preferred_workspace_id else (
            "enterprise_setup" if user.role == "enterprise_admin" else "landing"
        )
        return {
            "landing_type": landing_type,
            "preferred_workspace_id": preferred_workspace_id,
            "default_workspace_id": None,
            "has_accessible_workspaces": bool(accessible_workspaces),
            "can_create_workspace": user.role == "enterprise_admin",
        }

    if user.account_tier == "tier1":
        if not preferred_workspace_id:
            personal = await ensure_personal_workspace(session, user)
            preferred_workspace_id = personal.id
        return {
            "landing_type": "personal_workspace",
            "preferred_workspace_id": preferred_workspace_id,
            "default_workspace_id": preferred_workspace_id,
            "has_accessible_workspaces": True,
            "can_create_workspace": True,
        }

    # free trial — always ensure personal workspace exists
    if not preferred_workspace_id:
        personal = await ensure_personal_workspace(session, user)
        preferred_workspace_id = personal.id
    return {
        "landing_type": "personal_workspace",
        "preferred_workspace_id": preferred_workspace_id,
        "default_workspace_id": preferred_workspace_id,
        "has_accessible_workspaces": True,
        "can_create_workspace": False,
    }


async def has_workspace_access(
    workspace_id: str,
    user: User,
) -> bool:
    async with AsyncSession(async_engine) as session:
        workspace = await _get_workspace_by_id(session, workspace_id)
        if not workspace:
            return False

        if user.role == "super_admin":
            return True

        if user.account_tier == "enterprise":
            if user.role == "enterprise_admin" and user.organization_id == workspace.organization_id:
                return True
            result = await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.user_id == user.id,
                    WorkspaceMember.accepted.is_(True),
                )
            )
            return result.scalars().first() is not None

        result = await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user.id,
                WorkspaceMember.accepted.is_(True),
            )
        )
        return result.scalars().first() is not None


async def create_workspace(
    org_id: str,
    name: str,
    description: str = None,
    department_name: str = None,
    creator_id: str = None,
    creator_email: str = None,
    *,
    is_hidden: bool = False,
    is_default_personal: bool = False,
):
    async with AsyncSession(async_engine) as session:
        workspace = Workspace(
            name=name,
            description=description,
            department_name=department_name,
            organization_id=org_id,
            is_hidden=is_hidden,
            is_default_personal=is_default_personal,
        )
        session.add(workspace)
        await session.commit()
        await session.refresh(workspace)

        workspace_data = {
            "id": workspace.id,
            "name": workspace.name,
            "description": workspace.description,
            "department_name": workspace.department_name,
            "created_at": workspace.created_at,
            "is_hidden": workspace.is_hidden,
            "is_default_personal": workspace.is_default_personal,
        }

        if creator_id and creator_email:
            admin_member = WorkspaceMember(
                workspace_id=workspace.id,
                user_id=creator_id,
                email=creator_email,
                role="admin",
                accepted=True,
            )
            session.add(admin_member)
            await session.commit()

        return workspace_data


async def get_workspaces_by_org(org_id: str):
    async with AsyncSession(async_engine) as session:
        result = await session.execute(
            select(Workspace)
            .where(
                Workspace.organization_id == org_id,
                Workspace.is_hidden.is_(False),
            )
            .order_by(Workspace.created_at.desc())
        )
        return result.scalars().all()


async def update_workspace(
    workspace_id: str,
    name: str,
    description: str | None = None,
    department_name: str | None = None,
):
    async with AsyncSession(async_engine) as session:
        workspace = await _get_workspace_by_id(session, workspace_id)
        if not workspace:
            raise ValueError("Workspace not found")

        workspace.name = name
        workspace.description = description
        workspace.department_name = department_name

        session.add(workspace)
        await session.commit()
        await session.refresh(workspace)
        return {
            "id": workspace.id,
            "name": workspace.name,
            "description": workspace.description,
            "department_name": workspace.department_name,
            "created_at": workspace.created_at,
            "is_hidden": workspace.is_hidden,
            "is_default_personal": workspace.is_default_personal,
        }


async def create_workspace_invite(
    workspace_id: str,
    email: str,
    role: str,
    token: str = None,
    expiry_days: int = 7,
):
    token = token or secrets.token_urlsafe(32)
    expiry = datetime.utcnow() + timedelta(days=expiry_days)

    async with AsyncSession(async_engine) as session:
        existing_result = await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.email == email,
            )
        )
        existing_invite = existing_result.scalars().first()

        if existing_invite and existing_invite.accepted:
            raise ValueError("This user already has access to the workspace.")

        if existing_invite:
            existing_invite.role = role
            existing_invite.token = token
            existing_invite.token_expiry = expiry
            existing_invite.accepted = False
            session.add(existing_invite)
            await session.commit()
            await session.refresh(existing_invite)
            return existing_invite

        invite = WorkspaceMember(
            workspace_id=workspace_id,
            email=email,
            role=role,
            token=token,
            token_expiry=expiry,
            accepted=False,
        )
        session.add(invite)
        await session.commit()
        await session.refresh(invite)
        return invite


async def provision_workspace_invite_user(
    session: AsyncSession,
    workspace_id: str,
    email: str,
) -> tuple[User, str]:
    workspace = await _get_workspace_by_id(session, workspace_id)
    if not workspace:
        raise ValueError("Workspace not found")

    org = await session.get(Organization, workspace.organization_id)
    if not org:
        raise ValueError("Workspace organization not found.")

    existing_result = await session.execute(select(User).where(User.email == email))
    existing_user = existing_result.scalars().first()
    if existing_user:
        raise ValueError("User already exists")

    is_enterprise_org = org.account_tier == "enterprise"
    temp_password = secrets.token_urlsafe(12)
    invited_full_name = _build_invited_user_name(email)
    _inv_parts = invited_full_name.split(" ", 1)
    user = User(
        first_name=_inv_parts[0],
        last_name=_inv_parts[1] if len(_inv_parts) > 1 else "",
        full_name=invited_full_name,
        email=email,
        hashed_password=hash_password(temp_password),
        role="user",
        is_verified=True,
        is_active=True,
        is_trial=is_enterprise_org is False,
        account_tier="enterprise" if is_enterprise_org else "free",
        trial_exploration_limit=1 if not is_enterprise_org else 0,
        organization_id=org.id if is_enterprise_org else None,
        must_change_password=True,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user, temp_password


async def get_invite_by_token(token: str):
    async with AsyncSession(async_engine) as session:
        response = await session.execute(
            select(WorkspaceMember).where(WorkspaceMember.token == token)
        )
        return response.scalars().first()


async def accept_invite(token: str, user: User):
    async with AsyncSession(async_engine) as session:
        response = await session.execute(
            select(WorkspaceMember).where(WorkspaceMember.token == token)
        )
        invite = response.scalars().first()

        if not invite:
            return False, "Invalid token", None
        if invite.accepted:
            return False, "Already accepted", invite.workspace_id
        if invite.token_expiry and invite.token_expiry < datetime.utcnow():
            return False, "Invite expired", invite.workspace_id
        if invite.email.lower() != user.email.lower():
            return False, "Invitation email does not match the signed-in account.", invite.workspace_id

        workspace = await _get_workspace_by_id(session, invite.workspace_id)
        if not workspace:
            return False, "Workspace not found", None

        org = await session.get(Organization, workspace.organization_id)
        if org and org.account_tier == "enterprise":
            user.organization_id = org.id
            user.account_tier = "enterprise"
            user.is_trial = False
            user.trial_exploration_limit = 0
            session.add(user)

        invite.user_id = user.id
        invite.accepted = True
        invite.token = None
        invite.token_expiry = None

        session.add(invite)
        await session.commit()
        return True, "Invite accepted successfully", invite.workspace_id


async def list_workspace_members(workspace_id: str):
    async with AsyncSession(async_engine) as session:
        response = await session.execute(
            select(WorkspaceMember, User.full_name, User.avatar_url)
            .outerjoin(User, WorkspaceMember.user_id == User.id)
            .where(WorkspaceMember.workspace_id == workspace_id)
            .order_by(WorkspaceMember.accepted.desc(), WorkspaceMember.email)
        )
        members = response.all()
        return [
            {
                "id": member.id,
                "workspace_id": member.workspace_id,
                "user_id": member.user_id,
                "email": member.email,
                "role": member.role,
                "accepted": member.accepted,
                "full_name": full_name,
                "avatar_url": avatar_url,
                "invited_at": member.token_expiry.isoformat() if member.token_expiry else None,
            }
            for member, full_name, avatar_url in members
        ]


async def list_accessible_workspaces_with_members(
    session: AsyncSession,
    user: User,
) -> list[dict]:
    """
    Same as list_accessible_workspaces but enriches each workspace with
    a 'users' list so the frontend can render Active Users avatars.
    Fetches all members in a single query to avoid N+1.
    """
    workspaces = await list_accessible_workspaces(session, user)
    if not workspaces:
        return []

    workspace_ids = [ws.id for ws in workspaces]

    members_result = await session.execute(
        select(WorkspaceMember, User.full_name, User.avatar_url)
        .outerjoin(User, WorkspaceMember.user_id == User.id)
        .where(
            WorkspaceMember.workspace_id.in_(workspace_ids),
            WorkspaceMember.accepted.is_(True),
        )
    )
    all_members = members_result.all()

    # Group members by workspace_id
    members_by_workspace: dict[str, list[dict]] = {}
    for member, full_name, avatar_url in all_members:
        members_by_workspace.setdefault(member.workspace_id, []).append(
            {
                "id": member.user_id or member.id,
                "full_name": full_name or "",
                "email": member.email,
                "avatar_url": avatar_url,
            }
        )

    result = []
    for ws in workspaces:
        result.append(
            {
                "id": ws.id,
                "name": ws.name,
                "description": ws.description,
                "department_name": ws.department_name,
                "created_at": ws.created_at,
                "is_hidden": getattr(ws, "is_hidden", False),
                "is_default_personal": getattr(ws, "is_default_personal", False),
                "users": members_by_workspace.get(ws.id, []),
            }
        )
    return result


async def list_all_org_members(session: AsyncSession, user: User) -> list[dict]:
    """
    Return all unique members across every workspace visible to the caller.

    Used by Settings > Team Management (mode='team').
    - enterprise_admin   → all members in their org's workspaces
    - workspace admin    → members in workspaces they admin
    - super_admin        → empty list (use admin panel instead)
    Each record includes the workspace_name they were found in.
    Duplicate users (member of multiple workspaces) are deduplicated,
    keeping the entry from the most recently created workspace.
    """
    if user.role == "super_admin":
        return []

    accessible_workspaces = await list_accessible_workspaces(session, user, include_hidden=False)
    if not accessible_workspaces:
        return []

    workspace_ids = [ws.id for ws in accessible_workspaces]
    workspace_name_map = {ws.id: ws.name for ws in accessible_workspaces}

    members_result = await session.execute(
        select(WorkspaceMember, User.full_name, User.avatar_url)
        .outerjoin(User, WorkspaceMember.user_id == User.id)
        .where(WorkspaceMember.workspace_id.in_(workspace_ids))
        .order_by(WorkspaceMember.workspace_id, WorkspaceMember.accepted.desc())
    )
    all_rows = members_result.all()

    # Deduplicate by user_id (or email when user_id is absent for pending invites)
    seen: dict[str, dict] = {}
    for member, full_name, avatar_url in all_rows:
        dedup_key = member.user_id or member.email
        if dedup_key not in seen:
            seen[dedup_key] = {
                "id": member.id,
                "user_id": member.user_id,
                "email": member.email,
                "full_name": full_name or "",
                "role": member.role,
                "accepted": member.accepted,
                "avatar_url": avatar_url,
                "workspace_name": workspace_name_map.get(member.workspace_id, ""),
                "workspace_id": member.workspace_id,
                "invited_at": member.token_expiry.isoformat() if member.token_expiry else None,
            }

    return list(seen.values())


async def update_member_details(
    workspace_id: str,
    member_id: str,
    requesting_user: User,
    first_name: str | None,
    last_name: str | None,
) -> dict:
    """
    Update a workspace member's display name.

    - Only workspace admins or enterprise_admin of the same org may do this.
    - Updates User.full_name for the actual user account (not just the member row).
    - Returns the updated member record.
    """
    async with AsyncSession(async_engine, expire_on_commit=False) as session:
        # Fetch the member row
        member_result = await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.id == member_id,
                WorkspaceMember.workspace_id == workspace_id,
            )
        )
        member = member_result.scalars().first()
        if not member:
            raise ValueError("Workspace member not found.")

        # Permission check
        is_admin = await is_workspace_admin(workspace_id, requesting_user.id)
        if not is_admin:
            raise PermissionError("Only workspace admins can edit member details.")

        # Update the actual user's full_name if they have an account
        updated_full_name = None
        if member.user_id and (first_name is not None or last_name is not None):
            user_obj = await session.get(User, member.user_id)
            if user_obj:
                new_first = (first_name or "").strip() if first_name is not None else user_obj.first_name
                new_last = (last_name or "").strip() if last_name is not None else user_obj.last_name
                if new_first:  # first_name is required
                    user_obj.first_name = new_first
                    user_obj.last_name = new_last
                    user_obj.full_name = f"{new_first} {new_last}".strip()
                    session.add(user_obj)
                    updated_full_name = user_obj.full_name

        await session.commit()

        return {
            "id": member.id,
            "workspace_id": member.workspace_id,
            "user_id": member.user_id,
            "email": member.email,
            "role": member.role,
            "accepted": member.accepted,
            "full_name": updated_full_name,
        }


async def is_workspace_admin(workspace_id: str, user_id: str):
    async with AsyncSession(async_engine) as session:
        user = await session.get(User, user_id)
        workspace = await _get_workspace_by_id(session, workspace_id)
        if not user or not workspace:
            return False

        if user.role == "super_admin":
            return True

        if user.role == "enterprise_admin" and user.organization_id == workspace.organization_id:
            return True

        response = await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.role == "admin",
                WorkspaceMember.accepted.is_(True),
            )
        )
        return response.scalars().first() is not None


async def change_member_role(workspace_id: str, member_id: str, new_role: str):
    async with AsyncSession(async_engine, expire_on_commit=False) as session:
        response = await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.id == member_id,
                WorkspaceMember.workspace_id == workspace_id,
            )
        )
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
        response = await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.id == member_id,
                WorkspaceMember.workspace_id == workspace_id,
            )
        )
        member = response.scalars().first()
        if not member:
            raise ValueError("Workspace member not found")

        await session.delete(member)
        await session.flush()
        await session.commit()
        return {"message": f"Member {member.email} removed successfully"}


async def get_first_workspace(org_id: str):
    async with AsyncSession(async_engine) as session:
        response = await session.execute(
            select(Workspace)
            .where(
                Workspace.organization_id == org_id,
                Workspace.is_hidden.is_(False),
            )
            .order_by(Workspace.created_at.desc())
        )
        return response.scalars().first()


async def get_workspace_by_id(workspace_id: str):
    async with AsyncSession(async_engine) as session:
        return await _get_workspace_by_id(session, workspace_id)


async def is_workspace_member(workspace_id: str, user_id: str):
    async with AsyncSession(async_engine) as session:
        user = await session.get(User, user_id)
        workspace = await _get_workspace_by_id(session, workspace_id)
        if not user or not workspace:
            return False

        if user.role == "super_admin":
            return True

        if user.role == "enterprise_admin" and user.organization_id == workspace.organization_id:
            return True

        result = await session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
                WorkspaceMember.accepted.is_(True),
            )
        )
        return result.scalars().first() is not None


async def delete_workspace(workspace_id: str):
    async with AsyncSession(async_engine, expire_on_commit=False) as session:
        members_result = await session.execute(
            select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id)
        )
        members = members_result.scalars().all()
        for member in members:
            await session.delete(member)

        workspace = await _get_workspace_by_id(session, workspace_id)
        if not workspace:
            raise ValueError("Workspace not found")

        await session.delete(workspace)
        await session.commit()
        return {"message": "Workspace deleted"}


async def workspace_has_research_objectives(
    session: AsyncSession,
    workspace_id: str,
) -> bool:
    exploration_ids_result = await session.execute(
        select(Exploration.id).where(
            Exploration.workspace_id == workspace_id,
            Exploration.is_deleted.is_(False),
        )
    )
    exploration_ids = exploration_ids_result.scalars().all()
    if not exploration_ids:
        return False

    ro_exists = await session.execute(
        select(ResearchObjectives.id).where(
            ResearchObjectives.exploration_id.in_(exploration_ids)
        ).limit(1)
    )
    return ro_exists.first() is not None
