"""
Billing service — plan catalog, subscription state, billing profile.

Payment provider integration (Stripe/Razorpay) is NOT implemented here.
All stripe_* fields are reserved as NULL placeholders until that work begins.

Subscription state is kept in sync with User.account_tier so existing code
that reads account_tier continues to work without changes.
"""
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import BillingProfile, SubscriptionPlan, UserSubscription
from app.models.user import User
from app.services.product_state import DEFAULT_PLAN_CAPABILITIES

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Plan catalog — seeded on startup
# ---------------------------------------------------------------------------

_PLAN_SEED = [
    {
        "slug": "free",
        "name": "Free Trial",
        "description": "Get started with 1 exploration to experience the platform.",
        "exploration_limit": 1,
        "features": json.dumps(DEFAULT_PLAN_CAPABILITIES["free"]),
    },
    {
        "slug": "explorer",
        "name": "Explorer Pack",
        "description": "Run up to 3 explorations with full qualitative and quantitative access.",
        "exploration_limit": 3,
        "features": json.dumps(DEFAULT_PLAN_CAPABILITIES["explorer"]),
    },
    {
        "slug": "enterprise",
        "name": "Enterprise",
        "description": "Organisation-level access with custom exploration quota and priority support.",
        "exploration_limit": 0,  # 0 = governed by org.exploration_limit
        "features": json.dumps(DEFAULT_PLAN_CAPABILITIES["enterprise"]),
    },
]


async def seed_subscription_plans(session: AsyncSession) -> None:
    """
    Idempotent startup seed — inserts plan rows that do not yet exist.
    Existing rows are never overwritten (safe to run on every boot).
    """
    for plan_data in _PLAN_SEED:
        existing = await session.scalar(
            select(SubscriptionPlan).where(SubscriptionPlan.slug == plan_data["slug"])
        )
        if not existing:
            plan = SubscriptionPlan(**plan_data)
            session.add(plan)
            logger.info("Seeded subscription plan", extra={"slug": plan_data["slug"]})
        else:
            # Keep custom edits intact while backfilling newly introduced capability keys.
            try:
                existing_features = json.loads(existing.features or "{}")
            except (json.JSONDecodeError, TypeError):
                existing_features = {}
            desired_features = json.loads(plan_data["features"])
            merged_features = {**desired_features, **existing_features}
            if merged_features != existing_features:
                existing.features = json.dumps(merged_features)
                session.add(existing)
                logger.info(
                    "Backfilled subscription plan capability keys",
                    extra={"slug": plan_data["slug"]},
                )

    await session.commit()


# ---------------------------------------------------------------------------
# Plan helpers
# ---------------------------------------------------------------------------

async def list_plans(session: AsyncSession) -> list[SubscriptionPlan]:
    result = await session.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.is_active.is_(True))
    )
    return list(result.scalars().all())


async def get_plan_by_slug(session: AsyncSession, slug: str) -> Optional[SubscriptionPlan]:
    return await session.scalar(
        select(SubscriptionPlan).where(SubscriptionPlan.slug == slug)
    )


# ---------------------------------------------------------------------------
# Subscription helpers
# ---------------------------------------------------------------------------

async def get_user_subscription(
    session: AsyncSession,
    user: User,
) -> Optional[UserSubscription]:
    """
    Return the user's most recent subscription row.

    Enterprise members may not have a direct subscription row — their plan
    is inferred from organization membership. Returns None for those users;
    callers must handle the None case with an org-level check.
    """
    result = await session.execute(
        select(UserSubscription)
        .where(UserSubscription.user_id == user.id)
        .order_by(UserSubscription.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_or_create_subscription_for_user(
    session: AsyncSession,
    user: User,
) -> tuple[UserSubscription, SubscriptionPlan]:
    """
    Ensure a UserSubscription row exists for the user.

    Called on first billing read if no row exists yet (handles existing users
    created before this system was introduced).
    """
    slug_map = {"free": "free", "tier1": "explorer", "enterprise": "enterprise"}
    slug = slug_map.get(user.account_tier, "free")

    sub = await get_user_subscription(session, user)
    if sub:
        plan = await session.get(SubscriptionPlan, sub.plan_id)
        if plan and plan.slug == slug:
            return sub, plan
        logger.warning(
            "Repairing user subscription to match current account tier",
            extra={
                "user_id": user.id,
                "account_tier": user.account_tier,
                "expected_plan": slug,
                "subscription_id": sub.id,
                "actual_plan": plan.slug if plan else None,
            },
        )

    plan = await get_plan_by_slug(session, slug)
    if not plan:
        raise HTTPException(status_code=500, detail="Subscription plan catalog not initialised")

    sub = UserSubscription(
        user_id=user.id,
        plan_id=plan.id,
        status="active" if user.is_active else "cancelled",
    )
    session.add(sub)
    await session.commit()
    await session.refresh(sub)
    logger.info(
        "Back-filled subscription for existing user",
        extra={"user_id": user.id, "slug": slug},
    )
    return sub, plan


async def create_subscription(
    session: AsyncSession,
    user: User,
    plan_slug: str,
    expires_at: Optional[datetime] = None,
) -> UserSubscription:
    """
    Write a new UserSubscription row for a plan transition.

    Existing rows are left intact (historical record). The newest row is the
    active one (get_user_subscription orders by created_at DESC).

    Does NOT update User.account_tier — callers must do that themselves
    so both systems stay in sync.
    """
    plan = await get_plan_by_slug(session, plan_slug)
    if not plan:
        raise HTTPException(status_code=500, detail=f"Plan '{plan_slug}' not found in catalog")

    sub = UserSubscription(
        user_id=user.id,
        plan_id=plan.id,
        status="active",
        expires_at=expires_at,
    )
    session.add(sub)
    # Note: caller must commit — allows batching with User field updates
    logger.info(
        "Subscription created",
        extra={"user_id": user.id, "plan": plan_slug},
    )
    return sub


# ---------------------------------------------------------------------------
# Billing profile helpers
# ---------------------------------------------------------------------------

async def get_billing_profile(session: AsyncSession, user_id: str) -> Optional[BillingProfile]:
    return await session.scalar(
        select(BillingProfile).where(BillingProfile.user_id == user_id)
    )


async def upsert_billing_profile(
    session: AsyncSession,
    user: User,
    **fields,
) -> BillingProfile:
    """
    Create or update the billing profile for a user.
    Only fields explicitly passed are updated (None values are ignored).
    """
    profile = await get_billing_profile(session, user.id)
    if not profile:
        profile = BillingProfile(user_id=user.id)
        session.add(profile)

    for key, value in fields.items():
        if value is not None and hasattr(profile, key):
            setattr(profile, key, value)

    profile.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(profile)
    return profile
