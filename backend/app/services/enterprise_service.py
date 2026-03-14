"""
Enterprise tier service layer.

Handles enterprise org provisioning, member management, and cross-workspace
exploration visibility for enterprise admins.

Follows existing patterns:
  - async SQLAlchemy sessions injected via Depends(get_session)
  - SELECT FOR UPDATE for concurrency-safe counter operations
  - Structured logging with structured extra fields
  - HTTPException raised for domain errors (consistent with admin_service.py)
"""
import logging
import secrets
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.exploration import Exploration
from app.models.organization import Organization
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.enterprise import EnterpriseOrgCreate, EnterpriseAddMemberIn
from app.utils.security import hash_password

logger = logging.getLogger(__name__)


async def _assign_missing_org_owner(session: AsyncSession, org: Organization) -> bool:
    """
    Repair legacy enterprise org rows that were created without an owner_id.

    Preference order:
      1. enterprise_admin of the org
      2. any user linked to the org
    """
    if org.owner_id:
        return False

    owner_id = await session.scalar(
        select(User.id)
        .where(
            User.organization_id == org.id,
            User.role == "enterprise_admin",
        )
        .order_by(User.created_at.asc())
        .limit(1)
    )

    if not owner_id:
        owner_id = await session.scalar(
            select(User.id)
            .where(User.organization_id == org.id)
            .order_by(User.created_at.asc())
            .limit(1)
        )

    if not owner_id:
        logger.warning(
            "Enterprise org has no owner and no linked users",
            extra={"org_id": org.id},
        )
        return False

    org.owner_id = owner_id
    session.add(org)
    logger.info(
        "Backfilled missing enterprise org owner",
        extra={"org_id": org.id, "owner_id": owner_id},
    )
    return True


# ---------------------------------------------------------------------------
# Organisation provisioning (SP admin)
# ---------------------------------------------------------------------------

async def provision_enterprise_org(
    session: AsyncSession,
    data: EnterpriseOrgCreate,
    created_by_id: str,
) -> tuple[Organization, User, str]:
    """
    Atomically create an enterprise organisation and its enterprise_admin user.

    Steps:
      1. Reject duplicate email.
      2. Create Organization with account_tier="enterprise" and the given exploration_limit.
      3. Create User (enterprise_admin) linked to that org via organization_id.
      4. Set must_change_password=True; return temp password for email delivery.

    Returns:
        (org, admin_user, temp_password)
    """
    # Guard: email must be unique
    existing = await session.execute(select(User).where(User.email == data.admin_email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    temp_password = secrets.token_urlsafe(12)

    # Create the enterprise organisation
    org = Organization(
        name=data.org_name,
        owner_id=created_by_id,   # SP admin owns it initially — updated after user creation
        account_tier="enterprise",
        exploration_limit=data.exploration_limit,
        exploration_count=0,
    )
    session.add(org)
    await session.flush()   # get org.id without committing

    # Create the enterprise admin user, linked to this org
    admin_user = User(
        full_name=data.admin_full_name,
        email=data.admin_email,
        hashed_password=hash_password(temp_password),
        role="enterprise_admin",
        is_verified=True,
        is_active=True,
        is_trial=False,
        account_tier="enterprise",
        trial_exploration_limit=0,
        organization_id=org.id,
        must_change_password=True,
    )
    session.add(admin_user)
    await session.flush()   # get admin_user.id

    # Transfer org ownership to the enterprise admin
    org.owner_id = admin_user.id
    session.add(org)

    await session.commit()
    await session.refresh(org)
    await session.refresh(admin_user)

    logger.info(
        "Enterprise org provisioned",
        extra={
            "org_id": org.id,
            "admin_user_id": admin_user.id,
            "exploration_limit": org.exploration_limit,
            "provisioned_by": created_by_id,
        },
    )
    return org, admin_user, temp_password


# ---------------------------------------------------------------------------
# Member management (enterprise_admin)
# ---------------------------------------------------------------------------

async def add_enterprise_member(
    session: AsyncSession,
    org_id: str,
    data: EnterpriseAddMemberIn,
    added_by_id: str,
) -> tuple[User, str]:
    """
    Add a standard user to an enterprise org.

    Creates a new User with account_tier="enterprise" and organization_id=org_id.

    Returns:
        (user, temp_password)
    """
    # Validate org exists and is enterprise tier
    org = await session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Enterprise organisation not found")
    if org.account_tier != "enterprise":
        raise HTTPException(status_code=400, detail="Organisation is not an enterprise account")

    existing = await session.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    temp_password = secrets.token_urlsafe(12)

    user = User(
        full_name=data.full_name,
        email=data.email,
        hashed_password=hash_password(temp_password),
        role="user",
        is_verified=True,
        is_active=True,
        is_trial=False,
        account_tier="enterprise",
        trial_exploration_limit=0,   # org-level limit applies
        organization_id=org_id,
        must_change_password=True,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    logger.info(
        "Enterprise member added",
        extra={
            "org_id": org_id,
            "new_user_id": user.id,
            "added_by": added_by_id,
        },
    )
    return user, temp_password


async def remove_enterprise_member(
    session: AsyncSession,
    org_id: str,
    user_id: str,
    removed_by_id: str,
) -> None:
    """
    Unlink a user from the enterprise org (sets organization_id to None, deactivates).

    Does NOT hard-delete the user — use admin delete for that.
    """
    result = await session.execute(
        select(User).where(User.id == user_id, User.organization_id == org_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found in this enterprise organisation",
        )

    user.organization_id = None
    user.account_tier = "free"
    user.is_trial = True
    user.trial_exploration_limit = 1
    session.add(user)
    await session.commit()

    logger.info(
        "Enterprise member removed",
        extra={"org_id": org_id, "user_id": user_id, "removed_by": removed_by_id},
    )


# ---------------------------------------------------------------------------
# Read operations
# ---------------------------------------------------------------------------

async def list_enterprise_orgs(session: AsyncSession) -> list[Organization]:
    """Return all enterprise-tier organisations. SP admin only."""
    result = await session.execute(
        select(Organization).where(Organization.account_tier == "enterprise")
    )
    orgs = result.scalars().all()

    repaired = False
    for org in orgs:
        repaired = await _assign_missing_org_owner(session, org) or repaired

    if repaired:
        await session.commit()

    return orgs


async def get_enterprise_org(session: AsyncSession, org_id: str) -> Organization:
    """Fetch a single enterprise org by ID."""
    org = await session.get(Organization, org_id)
    if not org or org.account_tier != "enterprise":
        raise HTTPException(status_code=404, detail="Enterprise organisation not found")

    if await _assign_missing_org_owner(session, org):
        await session.commit()

    return org


async def list_enterprise_members(session: AsyncSession, org_id: str) -> list[User]:
    """List all users belonging to an enterprise org."""
    result = await session.execute(
        select(User).where(User.organization_id == org_id)
    )
    return result.scalars().all()


async def list_enterprise_explorations(
    session: AsyncSession,
    org_id: str,
) -> list[Exploration]:
    """
    Return all non-deleted explorations across every workspace in the enterprise org.

    This gives enterprise admins a cross-workspace view — a feature not available
    to personal/free/tier1 users.
    """
    # Get all workspace IDs in the org
    ws_result = await session.execute(
        select(Workspace.id).where(Workspace.organization_id == org_id)
    )
    workspace_ids = ws_result.scalars().all()

    if not workspace_ids:
        return []

    result = await session.execute(
        select(Exploration).where(
            Exploration.workspace_id.in_(workspace_ids),
            Exploration.is_deleted.is_(False),
        )
    )
    return result.scalars().all()


async def update_enterprise_org_limit(
    session: AsyncSession,
    org_id: str,
    new_limit: int,
) -> Organization:
    """Allow SP admin to adjust an enterprise org's exploration quota."""
    org = await session.get(Organization, org_id)
    if not org or org.account_tier != "enterprise":
        raise HTTPException(status_code=404, detail="Enterprise organisation not found")

    org.exploration_limit = new_limit
    session.add(org)
    await session.commit()
    await session.refresh(org)

    logger.info(
        "Enterprise org limit updated",
        extra={"org_id": org_id, "new_limit": new_limit},
    )
    return org
