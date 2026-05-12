"""
Computed product/business state for plan-aware frontend flows.

This module intentionally does not create subscriptions, charge payments, or
modify quota counters. It reads the existing User/Organization/Billing models
and returns a stable state payload for the UI to consume directly.
"""
import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import BillingProfile, SubscriptionPlan, UserSubscription
from app.models.exploration import Exploration
from app.models.interview import Interview
from app.models.organization import Organization
from app.models.persona import Persona
from app.models.population import PopulationSimulation
from app.models.survey_simulation import SurveySimulation
from app.models.traceability import TraceabilityReport
from app.models.user import User
from app.models.workspace import Workspace


PLAN_SLUG_BY_ACCOUNT_TIER = {
    "free": "free",
    "tier1": "explorer",
    "enterprise": "enterprise",
}


DEFAULT_PLAN_CAPABILITIES: dict[str, dict[str, Any]] = {
    "free": {
        "included_explorations": 1,
        "included_personas": 2,
        "workspaces": 1,
        "qualitative": True,
        "quantitative": False,
        "unlimited_follow_up_conversations": True,
        "reports": True,
        "traceability": True,
        "first_party_data": False,
        "integrations": False,
        "api_access": False,
        "priority_support": False,
        "dedicated_account_manager": False,
        "billing_visible": False,
    },
    "explorer": {
        "included_explorations": 3,
        "included_personas": 2,
        "workspaces": 3,
        "qualitative": True,
        "quantitative": True,
        "unlimited_follow_up_conversations": True,
        "reports": True,
        "traceability": True,
        "first_party_data": False,
        "integrations": False,
        "api_access": False,
        "priority_support": False,
        "dedicated_account_manager": False,
        "billing_visible": True,
        "additional_exploration_minimum": 3,
        "additional_exploration_unit_amount_cents": 3300,
        "renewal_exploration_count": 3,
        "renewal_amount_cents": 9900,
    },
    "enterprise": {
        "included_explorations": "custom",
        "included_personas": 4,
        "workspaces": "unlimited",
        "qualitative": True,
        "quantitative": True,
        "unlimited_follow_up_conversations": True,
        "reports": True,
        "traceability": True,
        "first_party_data": True,
        "integrations": True,
        "api_access": True,
        "priority_support": True,
        "dedicated_account_manager": True,
        "billing_visible": True,
        "fixed_research_exploration_count": 10,
        "fixed_research_exploration_unit_amount_cents": 29900,
        "additional_exploration_unit_amount_cents": 19900,
    },
}


def parse_plan_features(plan: Optional[SubscriptionPlan]) -> dict[str, Any]:
    if not plan:
        return {}
    if isinstance(plan.features, dict):
        return plan.features
    try:
        return json.loads(plan.features or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}


def plan_capabilities(plan_slug: str, plan: Optional[SubscriptionPlan] = None) -> dict[str, Any]:
    """Return canonical capability metadata, merging DB feature overrides."""
    base = dict(DEFAULT_PLAN_CAPABILITIES.get(plan_slug, {}))
    base.update(parse_plan_features(plan))
    return base


def effective_plan_slug(user: User) -> str:
    return PLAN_SLUG_BY_ACCOUNT_TIER.get(user.account_tier, "free")


async def get_effective_plan(
    session: AsyncSession,
    user: User,
) -> tuple[Optional[SubscriptionPlan], Optional[UserSubscription], str]:
    slug = effective_plan_slug(user)
    sub = await session.scalar(
        select(UserSubscription)
        .where(UserSubscription.user_id == user.id)
        .order_by(UserSubscription.created_at.desc())
        .limit(1)
    )
    plan = await session.get(SubscriptionPlan, sub.plan_id) if sub else None

    if plan and plan.slug != slug:
        plan = None

    if not plan:
        result = await session.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.slug == slug)
        )
        plan = result.scalar_one_or_none()

    return plan, sub, slug


async def _quota_for_user(session: AsyncSession, user: User) -> dict[str, Any]:
    completed = await _completed_exploration_count_for_user(session, user)
    if user.account_tier == "enterprise" and user.organization_id:
        org = await session.get(Organization, user.organization_id)
        limit = org.exploration_limit if org else 0
        used = org.exploration_count if org else 0
        return {
            "scope": "organization",
            "limit": limit,
            "used": used,
            "completed": completed,
            "remaining": None if limit == 0 else max(limit - used, 0),
            "unlimited": limit == 0,
            "organization_id": user.organization_id,
        }

    limit = user.trial_exploration_limit
    used = user.exploration_count
    return {
        "scope": "user",
        "limit": limit,
        "used": used,
        "completed": completed,
        "remaining": None if limit == 0 else max(limit - used, 0),
        "unlimited": limit == 0,
        "organization_id": None,
    }


async def _completed_exploration_count_for_user(session: AsyncSession, user: User) -> int:
    if user.account_tier == "enterprise" and user.organization_id:
        return await session.scalar(
            select(func.count(Exploration.id))
            .join(Workspace, Exploration.workspace_id == Workspace.id)
            .where(
                Workspace.organization_id == user.organization_id,
                Exploration.is_deleted.is_(False),
                Exploration.is_end.is_(True),
            )
        ) or 0

    return await session.scalar(
        select(func.count(Exploration.id)).where(
            Exploration.created_by == user.id,
            Exploration.is_deleted.is_(False),
            Exploration.is_end.is_(True),
        )
    ) or 0


def _is_expired(user: User, subscription: Optional[UserSubscription]) -> bool:
    now = datetime.utcnow()
    if user.is_trial and user.trial_expires_at and user.trial_expires_at <= now:
        return True
    return bool(subscription and subscription.expires_at and subscription.expires_at <= now)


async def compute_user_product_state(session: AsyncSession, user: User) -> dict[str, Any]:
    plan, subscription, slug = await get_effective_plan(session, user)
    capabilities = plan_capabilities(slug, plan)
    quota = await _quota_for_user(session, user)

    quota_exceeded = bool(not quota["unlimited"] and quota["used"] >= quota["limit"])
    quota_completed = bool(not quota["unlimited"] and quota["completed"] >= quota["limit"])
    expired = _is_expired(user, subscription)
    trial_exhausted = slug == "free" and (quota_completed or expired)
    explorer_completed = slug == "explorer" and quota_completed
    explorer_expired = slug == "explorer" and expired
    subscription_inactive = bool(subscription and subscription.status not in ("active", "trialing"))

    upgrade_required = trial_exhausted or explorer_completed or explorer_expired or subscription_inactive
    renewal_available = slug == "explorer" and (explorer_completed or explorer_expired)
    read_only_access = trial_exhausted or explorer_completed or explorer_expired
    workspace_locked = read_only_access

    billing_profile = await session.scalar(
        select(BillingProfile).where(BillingProfile.user_id == user.id)
    )
    billing_visible = bool(capabilities.get("billing_visible", slug != "free"))

    can_create_exploration = not quota_exceeded and not expired and not subscription_inactive
    if slug == "enterprise":
        can_create_workspace = user.role == "enterprise_admin"
    elif slug == "explorer":
        can_create_workspace = True
    else:
        can_create_workspace = False

    can_run_behavioral_simulation = not quota_completed and not expired and not subscription_inactive
    # Designs keep generated research artifacts available after quota exhaustion.
    can_view_reports = read_only_access or bool(capabilities.get("reports", True))
    can_view_traceability = read_only_access or bool(capabilities.get("traceability", True))

    restriction_reasons: list[str] = []
    if quota_exceeded:
        restriction_reasons.append("quota_exceeded")
    if expired:
        restriction_reasons.append("subscription_expired")
    if subscription_inactive:
        restriction_reasons.append(f"subscription_{subscription.status}")

    if trial_exhausted:
        primary_cta = {
            "type": "upgrade_to_explorer",
            "label": "Upgrade Now",
            "recommended_plan": "explorer",
        }
    elif renewal_available:
        primary_cta = {
            "type": "renew_explorer",
            "label": "Renew Now",
            "recommended_plan": "explorer",
        }
    elif slug == "enterprise":
        primary_cta = {
            "type": "contact_support",
            "label": "Contact Us",
            "recommended_plan": "enterprise",
        }
    else:
        primary_cta = None

    return {
        "account_tier": user.account_tier,
        "plan_slug": slug,
        "plan_name": plan.name if plan else slug.title(),
        "subscription_status": subscription.status if subscription else None,
        "subscription_expires_at": subscription.expires_at if subscription else None,
        "is_trial": user.is_trial,
        "trial_expires_at": user.trial_expires_at,
        "quota": quota,
        "capabilities": capabilities,
        "flags": {
            "trial_exhausted": trial_exhausted,
            "explorer_completed": explorer_completed,
            "explorer_expired": explorer_expired,
            "upgrade_required": upgrade_required,
            "renewal_available": renewal_available,
            "workspace_locked": workspace_locked,
            "quota_exceeded": quota_exceeded,
            "quota_completed": quota_completed,
            "read_only_access": read_only_access,
            "billing_visible": billing_visible,
            "billing_contact_required": billing_visible and billing_profile is None,
        },
        "actions": {
            "can_create_exploration": can_create_exploration,
            "can_create_workspace": can_create_workspace,
            "can_run_behavioral_simulation": can_run_behavioral_simulation,
            "can_view_reports": can_view_reports,
            "can_view_traceability": can_view_traceability,
            "can_view_billing": billing_visible,
            "can_download_invoice": billing_visible,
            "can_share_invoice": billing_visible,
        },
        "restrictions": [
            {"code": code, "message": _restriction_message(code)}
            for code in restriction_reasons
        ],
        "primary_cta": primary_cta,
    }


def _restriction_message(code: str) -> str:
    messages = {
        "quota_exceeded": "Your plan exploration quota has been used.",
        "subscription_expired": "Your current plan has expired.",
    }
    return messages.get(code, "This action is restricted for the current plan state.")


async def compute_usage_summary(session: AsyncSession, user: User) -> dict[str, Any]:
    state = await compute_user_product_state(session, user)
    quota = state["quota"]

    now = datetime.utcnow()
    period_start = datetime(now.year, now.month, 1)
    if now.month == 12:
        period_end = datetime(now.year + 1, 1, 1)
    else:
        period_end = datetime(now.year, now.month + 1, 1)

    accessible_workspace_ids = await _workspace_ids_for_usage(session, user)
    exploration_filters = [Exploration.is_deleted.is_(False)]
    if user.account_tier == "enterprise" and accessible_workspace_ids:
        exploration_filters.append(Exploration.workspace_id.in_(accessible_workspace_ids))
    else:
        exploration_filters.append(Exploration.created_by == user.id)

    total_explorations = await session.scalar(
        select(func.count(Exploration.id)).where(*exploration_filters)
    ) or 0
    completed_explorations = await session.scalar(
        select(func.count(Exploration.id)).where(*exploration_filters, Exploration.is_end.is_(True))
    ) or 0
    period_explorations = await session.scalar(
        select(func.count(Exploration.id)).where(
            *exploration_filters,
            Exploration.created_at >= period_start,
            Exploration.created_at < period_end,
        )
    ) or 0

    if accessible_workspace_ids:
        persona_count = await session.scalar(
            select(func.count(Persona.id)).where(Persona.workspace_id.in_(accessible_workspace_ids))
        ) or 0
        interview_count = await session.scalar(
            select(func.count(Interview.id)).where(Interview.workspace_id.in_(accessible_workspace_ids))
        ) or 0
        population_count = await session.scalar(
            select(func.count(PopulationSimulation.id)).where(
                PopulationSimulation.workspace_id.in_(accessible_workspace_ids)
            )
        ) or 0
        survey_count = await session.scalar(
            select(func.count(SurveySimulation.id)).where(
                SurveySimulation.workspace_id.in_(accessible_workspace_ids)
            )
        ) or 0
        traceability_count = await session.scalar(
            select(func.count(TraceabilityReport.id))
            .join(Exploration, TraceabilityReport.exploration_id == Exploration.id)
            .where(Exploration.workspace_id.in_(accessible_workspace_ids))
        ) or 0
    else:
        persona_count = interview_count = population_count = survey_count = traceability_count = 0

    return {
        "billing_period": {
            "start": period_start,
            "end": period_end,
            "timezone": "UTC",
        },
        "plan": {
            "slug": state["plan_slug"],
            "name": state["plan_name"],
        },
        "quota": quota,
        "usage": {
            "explorations_total": total_explorations,
            "explorations_completed": completed_explorations,
            "explorations_in_period": period_explorations,
            "personas_total": persona_count,
            "qualitative_interviews_total": interview_count,
            "population_simulations_total": population_count,
            "survey_simulations_total": survey_count,
            "traceability_reports_total": traceability_count,
        },
        "invoice_ready": {
            "enabled": state["flags"]["billing_visible"],
            "payment_provider_connected": False,
            "amount_finalized": False,
            "notes": "Usage snapshot only. Payment integration is not enabled yet.",
        },
        "state": state,
    }


async def _workspace_ids_for_usage(session: AsyncSession, user: User) -> list[str]:
    from app.services.workspace import list_accessible_workspaces

    workspaces = await list_accessible_workspaces(session, user, include_hidden=True)
    return [workspace.id for workspace in workspaces]


def build_invoice_placeholder(
    user: User,
    usage_summary: dict[str, Any],
    issued_at: Optional[datetime] = None,
) -> dict[str, Any]:
    issued_at = issued_at or datetime.utcnow()
    state = usage_summary["state"]
    plan_slug = state["plan_slug"]
    if not state["flags"]["billing_visible"]:
        return {}

    amount_cents = None
    amount_display = "$0000"
    capabilities = state["capabilities"]
    if plan_slug == "explorer":
        amount_cents = capabilities.get("renewal_amount_cents")
        amount_display = "$99" if amount_cents == 9900 else "$0000"

    invoice_id = f"draft-{user.id[:8]}-{issued_at.strftime('%Y%m')}"
    return {
        "id": invoice_id,
        "receipt_no": invoice_id.upper(),
        "title": f"{state['plan_name']} usage",
        "status": "draft",
        "issued_on": issued_at,
        "billing_period": usage_summary["billing_period"],
        "amount_cents": amount_cents,
        "amount_display": amount_display,
        "currency": "USD",
        "no_of_explorations": usage_summary["usage"]["explorations_in_period"],
        "payment_provider_connected": False,
        "download_available": False,
        "share_available": True,
        "metadata": {
            "source": "usage_snapshot",
            "payment_integration": "pending",
        },
    }


def quote_additional_explorations(plan_slug: str, count: int) -> dict[str, Any]:
    capabilities = DEFAULT_PLAN_CAPABILITIES.get(plan_slug, DEFAULT_PLAN_CAPABILITIES["explorer"])
    minimum = int(capabilities.get("additional_exploration_minimum", 3))
    effective_count = max(count, minimum)
    unit_amount_cents = int(capabilities.get("additional_exploration_unit_amount_cents", 3300))
    total_cents = effective_count * unit_amount_cents
    return {
        "requested_count": count,
        "minimum_count": minimum,
        "effective_count": effective_count,
        "minus_enabled": effective_count > minimum,
        "unit_amount_cents": unit_amount_cents,
        "total_amount_cents": total_cents,
        "currency": "USD",
        "payment_provider_connected": False,
        "checkout_available": False,
    }
