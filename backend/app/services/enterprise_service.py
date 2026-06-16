"""
Enterprise tier service layer.

Handles enterprise org provisioning, member management, cross-workspace
exploration visibility, and full analytics for enterprise admins.

Follows existing patterns:
  - async SQLAlchemy sessions injected via Depends(get_session)
  - SELECT FOR UPDATE for concurrency-safe counter operations
  - Structured logging with structured extra fields
  - HTTPException raised for domain errors (consistent with admin_service.py)
"""
import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import Float, and_, case, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.exploration import Exploration
from app.models.interview import Interview
from app.models.organization import Organization
from app.models.persona import Persona
from app.models.population import PopulationSimulation
from app.models.rebuttal import RebuttalSession
from app.models.survey_simulation import SurveySimulation
from app.models.traceability import TraceabilityRecord
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.enterprise import EnterpriseOrgCreate, EnterpriseAddMemberIn
from app.utils.security import hash_password

# ---------------------------------------------------------------------------
# Analytics constants
# ---------------------------------------------------------------------------

_MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Conservative industry estimates used for economics calculations:
#   120 hrs  → time saved when SP replaced a full human study (~3 traditional weeks)
#   8 hrs    → time saved per regular completed exploration vs manual analysis
#   $15 000  → typical B2B qualitative research cost per study

_HRS_PER_REPLACED_STUDY = 120
_HRS_PER_EXPLORATION    = 8
_USD_PER_REPLACED_STUDY = 15_000


def _period_dates(period: str) -> tuple[datetime, datetime]:
    """Map a period string to an inclusive (date_from, date_to) window."""
    now = datetime.utcnow()
    deltas: dict[str, timedelta] = {
        "1_week":   timedelta(days=7),
        "1_month":  timedelta(days=30),
        "6_months": timedelta(days=180),
        "1_year":   timedelta(days=365),
        "2_years":  timedelta(days=730),
    }
    return now - deltas.get(period, timedelta(days=730)), now   # default ~2 years


def _lbl(year: int, month: int) -> str:
    return f"{_MONTH_NAMES[int(month)]} {int(year)}"


def _empty_analytics(total_workspaces: int = 0, total_users: int = 0) -> dict:
    """Zeroed analytics payload — returned when the org has no workspaces yet."""
    return {
        "usage_metrics": {
            "total_workspaces": total_workspaces,
            "total_explorations": 0,
            "total_users": total_users,
        },
        "outcome_influenced": {
            "decisions_influenced": 0, "decisions_influenced_pct": 0,
            "human_studies_replaced": 0, "human_sample_reduced": 0,
        },
        "economics": {"research_time_unlocked_hrs": 0, "research_spend_saved_usd": 0},
        "adoption": {
            "workspaces_created": total_workspaces, "explorations_launched": 0,
            "personas_calibrated": 0, "reports_downloaded": 0,
            "chart_workspaces_created": [], "chart_explorations_launched": [],
            "chart_personas_calibrated": [], "chart_reports_downloaded": [],
        },
        "user_engagement": {
            "registered_users": total_users, "active_users": 0,
            "avg_time_per_exploration_hrs": 0.0, "collaboration_rate_pct": 0,
            "chart_registered_users": [], "chart_active_users": [],
            "chart_avg_time_per_exploration": [], "chart_collaboration_rate": [],
        },
        "conviction": {
            "avg_persona_confidence_pct": 0, "avg_population_confidence_pct": 0,
            "total_rebuttal_sessions": 0, "total_interviews": 0,
            "total_traceability_records": 0,
            "chart_persona_confidence": [], "chart_population_confidence": [],
            "chart_rebuttal_sessions": [], "chart_interviews": [],
            "chart_traceability_records": [],
        },
        "value_delivered": {
            "decisions_influenced_pct": 0, "time_saved_hrs": 0,
            "research_spend_saved_usd": 0, "human_studies_replaced": 0,
            "human_sample_reduced": 0,
            "chart_decisions_influenced": [], "chart_time_saved": [],
            "chart_research_spend_saved": [], "chart_human_studies_replaced": [],
            "chart_human_sample_reduced": [],
        },
        "banner": {
            "total_explorations": 0, "decisions_influenced": 0,
            "research_time_unlocked_hrs": 0, "research_spend_saved_usd": 0,
        },
    }

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
    _admin_parts = (data.admin_full_name or "").strip().split(" ", 1)
    admin_user = User(
        first_name=_admin_parts[0],
        last_name=_admin_parts[1] if len(_admin_parts) > 1 else "",
        full_name=(data.admin_full_name or "").strip(),
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

    _member_parts = (data.full_name or "").strip().split(" ", 1)
    user = User(
        first_name=_member_parts[0],
        last_name=_member_parts[1] if len(_member_parts) > 1 else "",
        full_name=(data.full_name or "").strip(),
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


# ---------------------------------------------------------------------------
# Organisation analytics  (enterprise_admin + SP admin)
# ---------------------------------------------------------------------------

async def get_org_analytics(
    session: AsyncSession,
    org_id: str,
    period: str = "all_time",
) -> dict:
    """
    Return comprehensive, PostgreSQL-backed analytics for an enterprise org dashboard.

    All figures come from live database rows — no mock values, no hardcoded numbers.

    period values: "all_time" (default, ~2 yr window) | "1_year" | "6_months" |
                   "1_month" | "1_week"

    Chart shapes produced:
      DeptPoint    → {"dept": label, "value": number}
      LinePoint    → {"name": label, "value": number}
      StackedPoint → {"month": label, "singleUser": number, "multiUser": number}
    """
    date_from, date_to = _period_dates(period)

    # ── 1. Workspace catalogue ─────────────────────────────────────────────
    ws_rows = (await session.execute(
        select(Workspace.id, Workspace.name)
        .where(Workspace.organization_id == org_id)
    )).fetchall()

    ws_ids = [r.id for r in ws_rows]
    total_workspaces = len(ws_ids)

    # ── 2. User count ──────────────────────────────────────────────────────
    total_users = await session.scalar(
        select(func.count(User.id))
        .where(User.organization_id == org_id, User.is_deleted == False)
    ) or 0

    if not ws_ids:
        return _empty_analytics(total_workspaces, total_users)

    # ── 3. Exploration IDs (all-time, needed as join target) ───────────────
    exp_id_rows = (await session.execute(
        select(Exploration.id)
        .where(
            Exploration.workspace_id.in_(ws_ids),
            Exploration.is_deleted == False,
        )
    )).fetchall()
    exp_ids = [r.id for r in exp_id_rows]

    # ── 4. Scalar totals ───────────────────────────────────────────────────
    total_explorations = len(exp_ids)

    decisions_influenced = await session.scalar(
        select(func.count(Exploration.id))
        .where(
            Exploration.workspace_id.in_(ws_ids),
            Exploration.is_deleted == False,
            Exploration.is_end == True,
        )
    ) or 0

    decisions_influenced_pct = (
        int(decisions_influenced / total_explorations * 100)
        if total_explorations > 0 else 0
    )

    if exp_ids:
        human_studies_replaced = await session.scalar(
            select(func.count(SurveySimulation.id))
            .where(
                SurveySimulation.exploration_id.in_(exp_ids),
                SurveySimulation.is_download == True,
            )
        ) or 0

        human_sample_reduced = await session.scalar(
            select(func.count(PopulationSimulation.id))
            .where(PopulationSimulation.exploration_id.in_(exp_ids))
        ) or 0

        personas_calibrated = await session.scalar(
            select(func.count(Persona.id))
            .where(Persona.exploration_id.in_(exp_ids))
        ) or 0
    else:
        human_studies_replaced = human_sample_reduced = personas_calibrated = 0

    # Reports = completed explorations (is_end=True) — broader than survey downloads
    reports_downloaded = await session.scalar(
        select(func.count(Exploration.id))
        .where(
            Exploration.workspace_id.in_(ws_ids),
            Exploration.is_deleted == False,
            Exploration.is_end == True,
        )
    ) or 0

    # ── 5. Economics ───────────────────────────────────────────────────────
    research_time_unlocked_hrs = int(
        human_studies_replaced * _HRS_PER_REPLACED_STUDY
        + max(0, total_explorations - human_studies_replaced) * _HRS_PER_EXPLORATION
    )
    research_spend_saved_usd = human_studies_replaced * _USD_PER_REPLACED_STUDY

    # ── 6. Engagement scalars ──────────────────────────────────────────────
    active_users = await session.scalar(
        select(func.count(func.distinct(Exploration.created_by)))
        .where(
            Exploration.workspace_id.in_(ws_ids),
            Exploration.is_deleted == False,
            Exploration.created_at >= date_from,
        )
    ) or 0

    # Average time from exploration creation to first survey download
    if exp_ids:
        avg_hrs_row = (await session.execute(
            select(
                func.avg(
                    extract("epoch", SurveySimulation.created_at - Exploration.created_at)
                    / 3600.0
                ).label("avg_hrs")
            )
            .join(Exploration, Exploration.id == SurveySimulation.exploration_id)
            .where(
                SurveySimulation.exploration_id.in_(exp_ids),
                SurveySimulation.is_download == True,
                Exploration.is_deleted == False,
            )
        )).one()
        avg_time_hrs = round(float(avg_hrs_row.avg_hrs or 0), 1)
    else:
        avg_time_hrs = 0.0

    # Workspaces with >2 accepted members are "multi-user"
    ws_member_count_rows = (await session.execute(
        select(
            WorkspaceMember.workspace_id,
            func.count(WorkspaceMember.id).label("cnt"),
        )
        .where(
            WorkspaceMember.workspace_id.in_(ws_ids),
            WorkspaceMember.accepted == True,
            WorkspaceMember.user_id.isnot(None),
        )
        .group_by(WorkspaceMember.workspace_id)
    )).fetchall()

    multi_ws_ids = [r.workspace_id for r in ws_member_count_rows if r.cnt > 2]

    if total_explorations > 0 and multi_ws_ids:
        multi_user_exps = await session.scalar(
            select(func.count(Exploration.id))
            .where(
                Exploration.workspace_id.in_(multi_ws_ids),
                Exploration.is_deleted == False,
            )
        ) or 0
        collaboration_rate_pct = int(multi_user_exps / total_explorations * 100)
    else:
        collaboration_rate_pct = 0

    # ── 7. Conviction scalars ──────────────────────────────────────────────
    if exp_ids:
        avg_persona_conf = int(await session.scalar(
            select(func.avg(Persona.calibration_confidence))
            .where(
                Persona.exploration_id.in_(exp_ids),
                Persona.calibration_confidence.isnot(None),
            )
        ) or 0)

        raw_pop_conf = await session.scalar(
            select(func.avg(PopulationSimulation.weighted_score))
            .where(
                PopulationSimulation.exploration_id.in_(exp_ids),
                PopulationSimulation.weighted_score.isnot(None),
            )
        ) or 0
        avg_population_conf = int(raw_pop_conf * 100)

        total_rebuttal_sessions = await session.scalar(
            select(func.count(RebuttalSession.id))
            .where(RebuttalSession.exploration_id.in_(exp_ids))
        ) or 0

        total_interviews = await session.scalar(
            select(func.count(Interview.id))
            .where(Interview.exploration_id.in_(exp_ids))
        ) or 0

        total_traceability = await session.scalar(
            select(func.count(TraceabilityRecord.id))
            .where(TraceabilityRecord.exploration_id.in_(exp_ids))
        ) or 0
    else:
        avg_persona_conf = avg_population_conf = 0
        total_rebuttal_sessions = total_interviews = total_traceability = 0

    # ── 8. Period-scoped time-series charts ────────────────────────────────

    # 8a. Workspaces created per month
    ws_monthly = (await session.execute(
        select(
            extract("year",  Workspace.created_at).label("year"),
            extract("month", Workspace.created_at).label("month"),
            func.count(Workspace.id).label("value"),
        )
        .where(
            Workspace.organization_id == org_id,
            Workspace.created_at >= date_from,
            Workspace.created_at <= date_to,
        )
        .group_by("year", "month").order_by("year", "month")
    )).fetchall()
    chart_workspaces_created = [{"dept": _lbl(r.year, r.month), "value": r.value} for r in ws_monthly]

    # 8b. Explorations per workspace (workspace name on X-axis)
    exp_by_ws = (await session.execute(
        select(Workspace.name, func.count(Exploration.id).label("value"))
        .join(Exploration, Exploration.workspace_id == Workspace.id)
        .where(
            Workspace.organization_id == org_id,
            Exploration.is_deleted == False,
            Exploration.created_at >= date_from,
            Exploration.created_at <= date_to,
        )
        .group_by(Workspace.name)
        .order_by(func.count(Exploration.id).desc())
    )).fetchall()
    chart_explorations_launched = [{"dept": r.name, "value": r.value} for r in exp_by_ws]

    # 8c. Personas per workspace — OMI-generated (singleUser) vs manual (multiUser)
    if exp_ids:
        persona_by_ws = (await session.execute(
            select(
                Workspace.name,
                func.sum(case((Persona.auto_generated_persona == True,  1), else_=0)).label("omi"),
                func.sum(case((Persona.auto_generated_persona == False, 1), else_=0)).label("manual"),
            )
            .join(Workspace, Workspace.id == Persona.workspace_id)
            .where(
                Persona.exploration_id.in_(exp_ids),
                Persona.created_at >= date_from,
                Persona.created_at <= date_to,
            )
            .group_by(Workspace.name)
            .order_by(Workspace.name)
        )).fetchall()
        chart_personas_calibrated = [
            {"month": r.name, "singleUser": int(r.omi or 0), "multiUser": int(r.manual or 0)}
            for r in persona_by_ws
        ]
    else:
        chart_personas_calibrated = []

    # 8d. Reports downloaded per workspace — completed explorations (is_end=True) per workspace
    ws_reports_rows = (await session.execute(
        select(Workspace.name, func.count(Exploration.id).label("value"))
        .join(Exploration, Exploration.workspace_id == Workspace.id)
        .where(
            Workspace.organization_id == org_id,
            Exploration.is_deleted == False,
            Exploration.is_end == True,
            Exploration.created_at >= date_from,
            Exploration.created_at <= date_to,
        )
        .group_by(Workspace.name)
        .order_by(func.count(Exploration.id).desc())
    )).fetchall()
    chart_reports_downloaded = [{"name": r.name, "value": r.value} for r in ws_reports_rows]

    # 8e. Registered users per month
    users_monthly = (await session.execute(
        select(
            extract("year",  User.created_at).label("year"),
            extract("month", User.created_at).label("month"),
            func.count(User.id).label("value"),
        )
        .where(
            User.organization_id == org_id,
            User.is_deleted == False,
            User.created_at >= date_from,
            User.created_at <= date_to,
        )
        .group_by("year", "month").order_by("year", "month")
    )).fetchall()
    chart_registered_users = [{"name": _lbl(r.year, r.month), "value": r.value} for r in users_monthly]

    # 8f. Active users per month (distinct exploration creators)
    active_monthly = (await session.execute(
        select(
            extract("year",  Exploration.created_at).label("year"),
            extract("month", Exploration.created_at).label("month"),
            func.count(func.distinct(Exploration.created_by)).label("value"),
        )
        .where(
            Exploration.workspace_id.in_(ws_ids),
            Exploration.is_deleted == False,
            Exploration.created_at >= date_from,
            Exploration.created_at <= date_to,
        )
        .group_by("year", "month").order_by("year", "month")
    )).fetchall()
    chart_active_users = [{"name": _lbl(r.year, r.month), "value": r.value} for r in active_monthly]

    # 8g. Avg time per exploration — per workspace (all-time, workspace x-axis)
    if exp_ids:
        time_by_ws = (await session.execute(
            select(
                Workspace.name,
                func.avg(
                    extract("epoch", SurveySimulation.created_at - Exploration.created_at) / 3600.0
                ).label("avg_hrs"),
            )
            .join(Exploration, Exploration.id == SurveySimulation.exploration_id)
            .join(Workspace,   Workspace.id   == Exploration.workspace_id)
            .where(
                SurveySimulation.exploration_id.in_(exp_ids),
                SurveySimulation.is_download == True,
                Exploration.is_deleted == False,
            )
            .group_by(Workspace.name)
        )).fetchall()
        chart_avg_time = [{"dept": r.name, "value": round(float(r.avg_hrs or 0), 1)} for r in time_by_ws]
    else:
        chart_avg_time = []

    # 8h. Collaboration rate per workspace (workspace name on X-axis)
    # Each workspace bar shows: singleUser = explorations in single-user workspace,
    # multiUser = explorations in multi-user workspace (>2 accepted members)
    multi_ws_set = set(multi_ws_ids)
    ws_collab_rows = (await session.execute(
        select(
            Workspace.name,
            Workspace.id.label("ws_id"),
            func.count(Exploration.id).label("total"),
        )
        .join(Exploration, Exploration.workspace_id == Workspace.id)
        .where(
            Workspace.organization_id == org_id,
            Exploration.is_deleted == False,
            Exploration.created_at >= date_from,
            Exploration.created_at <= date_to,
        )
        .group_by(Workspace.name, Workspace.id)
        .order_by(Workspace.name)
    )).fetchall()
    chart_collaboration_rate = [
        {
            "month": r.name,
            "singleUser": 0 if r.ws_id in multi_ws_set else int(r.total),
            "multiUser":  int(r.total) if r.ws_id in multi_ws_set else 0,
        }
        for r in ws_collab_rows
    ]

    # 8i–8k. Conviction per workspace (all-time, workspace x-axis)
    if exp_ids:
        persona_conf_ws = (await session.execute(
            select(Workspace.name, func.avg(Persona.calibration_confidence).label("avg"))
            .join(Workspace, Workspace.id == Persona.workspace_id)
            .where(Persona.exploration_id.in_(exp_ids), Persona.calibration_confidence.isnot(None))
            .group_by(Workspace.name)
        )).fetchall()
        chart_persona_confidence = [{"name": r.name, "value": int(r.avg or 0)} for r in persona_conf_ws]

        pop_conf_ws = (await session.execute(
            select(Workspace.name, func.avg(PopulationSimulation.weighted_score).label("avg"))
            .join(Workspace, Workspace.id == PopulationSimulation.workspace_id)
            .where(PopulationSimulation.exploration_id.in_(exp_ids), PopulationSimulation.weighted_score.isnot(None))
            .group_by(Workspace.name)
        )).fetchall()
        chart_population_confidence = [{"name": r.name, "value": int((r.avg or 0) * 100)} for r in pop_conf_ws]

        rebuttal_ws = (await session.execute(
            select(Workspace.name, func.count(RebuttalSession.id).label("total"))
            .join(Workspace, Workspace.id == RebuttalSession.workspace_id)
            .where(RebuttalSession.exploration_id.in_(exp_ids))
            .group_by(Workspace.name)
        )).fetchall()
        chart_rebuttal_sessions = [{"name": r.name, "value": r.total} for r in rebuttal_ws]

        interview_ws = (await session.execute(
            select(Workspace.name, func.count(Interview.id).label("total"))
            .join(Workspace, Workspace.id == Interview.workspace_id)
            .where(Interview.exploration_id.in_(exp_ids))
            .group_by(Workspace.name)
        )).fetchall()
        chart_interviews = [{"name": r.name, "value": r.total} for r in interview_ws]

        trace_ws = (await session.execute(
            select(Workspace.name, func.count(TraceabilityRecord.id).label("total"))
            .join(Workspace, Workspace.id == TraceabilityRecord.workspace_id)
            .where(TraceabilityRecord.exploration_id.in_(exp_ids))
            .group_by(Workspace.name)
        )).fetchall()
        chart_traceability_records = [{"name": r.name, "value": r.total} for r in trace_ws]
    else:
        chart_persona_confidence = chart_population_confidence = []
        chart_rebuttal_sessions  = chart_interviews = chart_traceability_records = []

    # 8l. Value delivered — decisions influenced per month
    decisions_monthly = (await session.execute(
        select(
            extract("year",  Exploration.created_at).label("year"),
            extract("month", Exploration.created_at).label("month"),
            func.count(Exploration.id).label("total"),
            func.sum(case((Exploration.is_end == True, 1), else_=0)).label("influenced"),
        )
        .where(
            Exploration.workspace_id.in_(ws_ids),
            Exploration.is_deleted == False,
            Exploration.created_at >= date_from,
            Exploration.created_at <= date_to,
        )
        .group_by("year", "month").order_by("year", "month")
    )).fetchall()
    chart_decisions_influenced = [
        {"month": _lbl(r.year, r.month), "singleUser": r.total, "multiUser": r.influenced}
        for r in decisions_monthly
    ]

    # 8m. Time saved and spend saved per workspace (survey downloads × constants)
    if exp_ids:
        study_count_ws = (await session.execute(
            select(Workspace.name, func.count(SurveySimulation.id).label("cnt"))
            .join(Exploration, Exploration.id == SurveySimulation.exploration_id)
            .join(Workspace,   Workspace.id   == Exploration.workspace_id)
            .where(SurveySimulation.exploration_id.in_(exp_ids), SurveySimulation.is_download == True)
            .group_by(Workspace.name)
        )).fetchall()
        chart_time_saved          = [{"name": r.name, "value": r.cnt * _HRS_PER_REPLACED_STUDY} for r in study_count_ws]
        chart_research_spend_saved = [{"name": r.name, "value": r.cnt * _USD_PER_REPLACED_STUDY} for r in study_count_ws]
    else:
        chart_time_saved = chart_research_spend_saved = []

    # 8n. Human studies replaced per month
    if exp_ids:
        hs_monthly = (await session.execute(
            select(
                extract("year",  Exploration.created_at).label("year"),
                extract("month", Exploration.created_at).label("month"),
                func.count(func.distinct(Exploration.id)).label("total"),
                func.count(func.distinct(SurveySimulation.id)).label("replaced"),
            )
            .outerjoin(
                SurveySimulation,
                and_(
                    SurveySimulation.exploration_id == Exploration.id,
                    SurveySimulation.is_download == True,
                ),
            )
            .where(
                Exploration.workspace_id.in_(ws_ids),
                Exploration.is_deleted == False,
                Exploration.created_at >= date_from,
                Exploration.created_at <= date_to,
            )
            .group_by("year", "month").order_by("year", "month")
        )).fetchall()
        chart_human_studies_replaced = [
            {"month": _lbl(r.year, r.month), "singleUser": r.total, "multiUser": r.replaced}
            for r in hs_monthly
        ]
    else:
        chart_human_studies_replaced = []

    # 8o. Human sample reduced per month
    if exp_ids:
        hsr_monthly = (await session.execute(
            select(
                extract("year",  Exploration.created_at).label("year"),
                extract("month", Exploration.created_at).label("month"),
                func.count(func.distinct(Exploration.id)).label("total"),
                func.count(func.distinct(PopulationSimulation.id)).label("reduced"),
            )
            .outerjoin(PopulationSimulation, PopulationSimulation.exploration_id == Exploration.id)
            .where(
                Exploration.workspace_id.in_(ws_ids),
                Exploration.is_deleted == False,
                Exploration.created_at >= date_from,
                Exploration.created_at <= date_to,
            )
            .group_by("year", "month").order_by("year", "month")
        )).fetchall()
        chart_human_sample_reduced = [
            {"month": _lbl(r.year, r.month), "singleUser": r.total, "multiUser": r.reduced}
            for r in hsr_monthly
        ]
    else:
        chart_human_sample_reduced = []

    # ── 9. Assemble and return ─────────────────────────────────────────────
    return {
        "usage_metrics": {
            "total_workspaces":  total_workspaces,
            "total_explorations": total_explorations,
            "total_users":       total_users,
        },
        "outcome_influenced": {
            "decisions_influenced":     decisions_influenced,
            "decisions_influenced_pct": decisions_influenced_pct,
            "human_studies_replaced":   human_studies_replaced,
            "human_sample_reduced":     human_sample_reduced,
        },
        "economics": {
            "research_time_unlocked_hrs": research_time_unlocked_hrs,
            "research_spend_saved_usd":   research_spend_saved_usd,
        },
        "adoption": {
            "workspaces_created":    total_workspaces,
            "explorations_launched": total_explorations,
            "personas_calibrated":   personas_calibrated,
            "reports_downloaded":    reports_downloaded,
            "chart_workspaces_created":    chart_workspaces_created,
            "chart_explorations_launched": chart_explorations_launched,
            "chart_personas_calibrated":   chart_personas_calibrated,
            "chart_reports_downloaded":    chart_reports_downloaded,
        },
        "user_engagement": {
            "registered_users":             total_users,
            "active_users":                 active_users,
            "avg_time_per_exploration_hrs": avg_time_hrs,
            "collaboration_rate_pct":       collaboration_rate_pct,
            "chart_registered_users":        chart_registered_users,
            "chart_active_users":            chart_active_users,
            "chart_avg_time_per_exploration": chart_avg_time,
            "chart_collaboration_rate":      chart_collaboration_rate,
        },
        "conviction": {
            "avg_persona_confidence_pct":    avg_persona_conf,
            "avg_population_confidence_pct": avg_population_conf,
            "total_rebuttal_sessions":       total_rebuttal_sessions,
            "total_interviews":              total_interviews,
            "total_traceability_records":    total_traceability,
            "chart_persona_confidence":      chart_persona_confidence,
            "chart_population_confidence":   chart_population_confidence,
            "chart_rebuttal_sessions":       chart_rebuttal_sessions,
            "chart_interviews":              chart_interviews,
            "chart_traceability_records":    chart_traceability_records,
        },
        "value_delivered": {
            "decisions_influenced_pct": decisions_influenced_pct,
            "time_saved_hrs":           research_time_unlocked_hrs,
            "research_spend_saved_usd": research_spend_saved_usd,
            "human_studies_replaced":   human_studies_replaced,
            "human_sample_reduced":     human_sample_reduced,
            "chart_decisions_influenced":     chart_decisions_influenced,
            "chart_time_saved":               chart_time_saved,
            "chart_research_spend_saved":     chart_research_spend_saved,
            "chart_human_studies_replaced":   chart_human_studies_replaced,
            "chart_human_sample_reduced":     chart_human_sample_reduced,
        },
        "banner": {
            "total_explorations":         total_explorations,
            "decisions_influenced":       decisions_influenced,
            "research_time_unlocked_hrs": research_time_unlocked_hrs,
            "research_spend_saved_usd":   research_spend_saved_usd,
        },
    }
