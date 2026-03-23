"""
Dummy data seed script for Syntera MVP.

Usage (from backend/ directory):
    python seed.py

Seeds the following test accounts (all passwords: Test@123):

  FREE TRIAL
    free1@test.com          — Free trial, 0/1 explorations used
    free_maxed@test.com     — Free trial, LIMIT REACHED (1/1 used)

  TIER 1
    tier1@test.com          — Tier 1, 0/3 explorations used
    tier1_maxed@test.com    — Tier 1, LIMIT REACHED (3/3 used)

  EDGE CASES
    inactive@test.com       — Free trial, account INACTIVE (is_active=False)
    mustchange@test.com     — Free trial, must change password on next login

  ENTERPRISE
    ent_admin@test.com      — Enterprise Admin (org: Acme Corp, quota: 10)
    ent_member1@test.com    — Enterprise Member 1
    ent_member2@test.com    — Enterprise Member 2

  ADMIN
    admin@test.com          — Platform admin (role: admin)

Script is idempotent — re-running skips existing emails.
"""

import asyncio
import sys
import os

# Allow imports from app/
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.db import async_engine, async_session
from app.models.user import User
from app.models.organization import Organization
from app.utils.security import hash_password
from app.utils.id_generator import generate_id

PASSWORD = "Test@123"
HASHED = hash_password(PASSWORD)


async def get_or_skip(session: AsyncSession, email: str) -> bool:
    """Return True if user already exists (skip creation)."""
    result = await session.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none() is not None


async def create_user(session: AsyncSession, **kwargs) -> User:
    user = User(**kwargs)
    session.add(user)
    await session.flush()
    await session.refresh(user)
    return user


async def create_personal_org(session: AsyncSession, user: User, name: str = "My Organization") -> Organization:
    org = Organization(name=name, owner_id=user.id)
    session.add(org)
    await session.flush()
    return org


async def seed():
    async with async_session() as session:
        created = []
        skipped = []

        # ── FREE TRIAL users ─────────────────────────────────────────────────

        if await get_or_skip(session, "free1@test.com"):
            skipped.append("free1@test.com")
        else:
            u = await create_user(session,
                full_name="Free User One",
                email="free1@test.com",
                hashed_password=HASHED,
                role="user",
                user_type="Researcher",
                is_verified=True,
                is_active=True,
                is_trial=True,
                account_tier="free",
                exploration_count=0,
                trial_exploration_limit=1,
                must_change_password=False,
            )
            await create_personal_org(session, u)
            created.append(("free1@test.com", "Free Trial", "0/1 explorations"))

        if await get_or_skip(session, "free_maxed@test.com"):
            skipped.append("free_maxed@test.com")
        else:
            u = await create_user(session,
                full_name="Free Maxed User",
                email="free_maxed@test.com",
                hashed_password=HASHED,
                role="user",
                user_type="Student",
                is_verified=True,
                is_active=True,
                is_trial=True,
                account_tier="free",
                exploration_count=1,       # already at limit
                trial_exploration_limit=1,
                must_change_password=False,
            )
            await create_personal_org(session, u)
            created.append(("free_maxed@test.com", "Free Trial", "LIMIT REACHED 1/1"))

        # ── TIER 1 users ─────────────────────────────────────────────────────

        if await get_or_skip(session, "tier1@test.com"):
            skipped.append("tier1@test.com")
        else:
            u = await create_user(session,
                full_name="Tier One User",
                email="tier1@test.com",
                hashed_password=HASHED,
                role="user",
                user_type="Startup",
                is_verified=True,
                is_active=True,
                is_trial=False,
                account_tier="tier1",
                exploration_count=1,
                trial_exploration_limit=3,
                must_change_password=False,
            )
            await create_personal_org(session, u)
            created.append(("tier1@test.com", "Tier 1", "1/3 explorations"))

        if await get_or_skip(session, "tier1_maxed@test.com"):
            skipped.append("tier1_maxed@test.com")
        else:
            u = await create_user(session,
                full_name="Tier One Maxed",
                email="tier1_maxed@test.com",
                hashed_password=HASHED,
                role="user",
                user_type="Startup",
                is_verified=True,
                is_active=True,
                is_trial=False,
                account_tier="tier1",
                exploration_count=3,       # already at limit
                trial_exploration_limit=3,
                must_change_password=False,
            )
            await create_personal_org(session, u)
            created.append(("tier1_maxed@test.com", "Tier 1", "LIMIT REACHED 3/3"))

        # ── EDGE CASE users ───────────────────────────────────────────────────

        if await get_or_skip(session, "inactive@test.com"):
            skipped.append("inactive@test.com")
        else:
            u = await create_user(session,
                full_name="Inactive User",
                email="inactive@test.com",
                hashed_password=HASHED,
                role="user",
                user_type="Student",
                is_verified=True,
                is_active=False,           # INACTIVE — login should 403
                is_trial=True,
                account_tier="free",
                exploration_count=0,
                trial_exploration_limit=1,
                must_change_password=False,
            )
            await create_personal_org(session, u)
            created.append(("inactive@test.com", "Free Trial", "INACTIVE account"))

        if await get_or_skip(session, "mustchange@test.com"):
            skipped.append("mustchange@test.com")
        else:
            u = await create_user(session,
                full_name="Must Change Password",
                email="mustchange@test.com",
                hashed_password=HASHED,
                role="user",
                user_type="Researcher",
                is_verified=True,
                is_active=True,
                is_trial=True,
                account_tier="free",
                exploration_count=0,
                trial_exploration_limit=1,
                must_change_password=True,  # forced password change on login
            )
            await create_personal_org(session, u)
            created.append(("mustchange@test.com", "Free Trial", "must_change_password=True"))

        # ── PLATFORM ADMIN ────────────────────────────────────────────────────

        if await get_or_skip(session, "admin@test.com"):
            skipped.append("admin@test.com")
        else:
            u = await create_user(session,
                full_name="Platform Admin",
                email="admin@test.com",
                hashed_password=HASHED,
                role="admin",
                user_type="Researcher",
                is_verified=True,
                is_active=True,
                is_trial=False,
                account_tier="free",
                exploration_count=0,
                trial_exploration_limit=0,
                must_change_password=False,
            )
            await create_personal_org(session, u)
            created.append(("admin@test.com", "Admin", "role=admin"))

        # ── ENTERPRISE org + admin + members ──────────────────────────────────

        ent_admin_email = "ent_admin@test.com"
        if await get_or_skip(session, ent_admin_email):
            skipped.append(ent_admin_email)
        else:
            # 1. Create admin user first (organization_id=None initially — no org yet)
            ent_admin = await create_user(session,
                full_name="Enterprise Admin",
                email=ent_admin_email,
                hashed_password=HASHED,
                role="enterprise_admin",
                user_type="Researcher",
                is_verified=True,
                is_active=True,
                is_trial=False,
                account_tier="enterprise",
                exploration_count=0,
                trial_exploration_limit=0,
                organization_id=None,
                must_change_password=False,
            )

            # 2. Create org with real owner_id
            org = Organization(
                name="Acme Corp",
                owner_id=ent_admin.id,
                account_tier="enterprise",
                exploration_limit=10,
                exploration_count=2,
            )
            session.add(org)
            await session.flush()  # get org.id

            # 3. Link admin user back to the org
            ent_admin.organization_id = org.id
            session.add(ent_admin)

            created.append((ent_admin_email, "Enterprise Admin", f"org=Acme Corp quota=10"))

            # Enterprise members
            for i, (name, email) in enumerate([
                ("Enterprise Member One", "ent_member1@test.com"),
                ("Enterprise Member Two", "ent_member2@test.com"),
            ], start=1):
                if await get_or_skip(session, email):
                    skipped.append(email)
                else:
                    m = await create_user(session,
                        full_name=name,
                        email=email,
                        hashed_password=HASHED,
                        role="user",
                        user_type="Researcher",
                        is_verified=True,
                        is_active=True,
                        is_trial=False,
                        account_tier="enterprise",
                        exploration_count=i,
                        trial_exploration_limit=0,
                        organization_id=org.id,
                        must_change_password=False,
                    )
                    # Personal org so workspace creation routes still work
                    await create_personal_org(session, m, name=f"{name}'s Workspace Org")
                    created.append((email, "Enterprise Member", f"org=Acme Corp"))

        await session.commit()

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n" + "="*65)
    print("  SEED COMPLETE")
    print("="*65)
    print(f"  Default password for all accounts: {PASSWORD}")
    print("-"*65)
    if created:
        print(f"  {'Email':<35} {'Tier':<20} {'Notes'}")
        print(f"  {'-'*33} {'-'*18} {'-'*15}")
        for email, tier, notes in created:
            print(f"  {email:<35} {tier:<20} {notes}")
    if skipped:
        print(f"\n  Skipped (already exist): {', '.join(skipped)}")
    print("="*65 + "\n")


if __name__ == "__main__":
    asyncio.run(seed())