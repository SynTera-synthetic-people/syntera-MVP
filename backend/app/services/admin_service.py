from sqlalchemy import select, func
from sqlalchemy import case, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import Float
from app.models.population import PopulationSimulation
from app.models.survey_simulation import SurveySimulation
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.models.exploration import Exploration
from app.models.organization import Organization
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.models.user import User
from app.models.persona import Persona
from app.models.exploration import Exploration
from datetime import date
from app.models.workspace import Workspace
from app.models.user import User
from sqlalchemy import extract
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from sqlalchemy import func, select, cast, Float, literal_column
from sqlalchemy.orm import aliased
from sqlalchemy.sql import lateral


from sqlalchemy import extract

def year_month_expr(column):
    """
    Returns labeled expressions for year and month extraction
    """
    year_expr = extract("year", column).label("year")
    month_expr = extract("month", column).label("month")
    return year_expr, month_expr



def get_date_range(start_date: date | None, end_date: date | None):
    if start_date and end_date:
        start_dt = datetime.combine(start_date, time.min)
        end_dt = datetime.combine(end_date, time.max)
        return start_dt, end_dt

    # default: last 6 months including today
    end_dt = datetime.utcnow()
    start_dt = end_dt - relativedelta(months=5)

    return start_dt, end_dt


def month_label():
    return func.to_char(func.date_trunc("month", func.cast(func.now(), func.TIMESTAMP)), "Mon")



async def users_monthly_count(
    session: AsyncSession,
    start_dt: datetime,
    end_dt: datetime,
):
    year_expr = extract("year", User.created_at).label("year")
    month_expr = extract("month", User.created_at).label("month")

    stmt = (
        select(
            year_expr,
            month_expr,
            func.count(User.id).label("count"),
        )
        .where(User.created_at >= start_dt)
        .where(User.created_at <= end_dt)
        .group_by(year_expr, month_expr)
        .order_by(year_expr, month_expr)
    )

    result = await session.execute(stmt)

    return [
        {
            "year": int(row.year),
            "month": int(row.month),
            "count": row.count,
        }
        for row in result.all()
    ]



async def new_users_monthly(session: AsyncSession, start_dt: date, end_dt: date):
    year_expr, month_expr = year_month_expr(User.created_at)

    stmt = (
        select(
            year_expr,
            month_expr,
            func.count(User.id).label("count"),
        )
        .where(User.created_at >= start_dt)
        .where(User.created_at <= end_dt)
        .group_by(year_expr, month_expr)
        .order_by(year_expr, month_expr)
    )

    result = await session.execute(stmt)

    return [
        {
            "year": int(row.year),
            "month": int(row.month),
            "new_users": row.count
        }
        for row in result.all()
    ]



async def workspaces_monthly_count(
    session: AsyncSession,
    start_dt: date,
    end_dt: date,
):
    year_expr = extract("year", Workspace.created_at).label("year")
    month_expr = extract("month", Workspace.created_at).label("month")

    stmt = (
        select(
            year_expr,
            month_expr,
            func.count(Workspace.id).label("count"),
        )
        .where(Workspace.created_at >= start_dt)
        .where(Workspace.created_at <= end_dt)
        .group_by(year_expr, month_expr)
        .order_by(year_expr, month_expr)
    )

    result = await session.execute(stmt)

    return [
        {
            "year": int(row.year),
            "month": int(row.month),
            "count": row.count,
        }
        for row in result.all()
    ]




async def explorations_monthly_count(
    session: AsyncSession,
    start_dt: date,
    end_dt: date,
):
    year_expr = extract("year", Exploration.created_at).label("year")
    month_expr = extract("month", Exploration.created_at).label("month")

    stmt = (
        select(
            year_expr,
            month_expr,
            func.count(Exploration.id).label("count"),
        )
        .where(Exploration.created_at >= start_dt)
        .where(Exploration.created_at <= end_dt)
        .group_by(year_expr, month_expr)
        .order_by(year_expr, month_expr)
    )
    print(">>>>>", stmt)
    result = await session.execute(stmt)

    return [
        {
            "year": int(row.year),
            "month": int(row.month),
            "count": row.count,
        }
        for row in result.all()
    ]



async def persona_distribution(session: AsyncSession):
    auto_count = await session.scalar(
        select(func.count(Persona.id))
        .where(Persona.auto_generated_persona == True)
    )

    manual_count = await session.scalar(
        select(func.count(Persona.id))
        .where(Persona.auto_generated_persona == False)
    )

    return {
        "auto_generated": auto_count or 0,
        "manual": manual_count or 0,
    }


async def update_user_active_status(
    session: AsyncSession,
    user_id: str,
    is_active: bool
) -> User:
    result = await session.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = is_active

    session.add(user)
    await session.commit()
    await session.refresh(user)

    return user


async def list_users(session: AsyncSession):
    result = await session.execute(
        select(User).where(User.role != "super_admin")
    )
    users = result.scalars().all()

    return [
        {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "user_type": user.user_type,
            "created_at": user.created_at,
            "status": "Active" if user.is_active else "Inactive",
        }
        for user in users
    ]


async def get_user_stats(session: AsyncSession, user_id: str):
    # Count workspaces via organization ownership
    workspace_count = await session.scalar(
        select(func.count(Workspace.id))
        .join(Organization, Workspace.organization_id == Organization.id)
        .where(Organization.owner_id == user_id)
    )

    # Count explorations created by user
    exploration_count = await session.scalar(
        select(func.count(Exploration.id))
        .where(Exploration.created_by == user_id)
    )

    return {
        "user_id": user_id,
        "total_workspaces": workspace_count or 0,
        "total_explorations": exploration_count or 0,
    }


async def get_user_counts(
    session: AsyncSession,
    user_id: str,
) -> dict:
    # Workspace count (via organization ownership)
    workspace_count = await session.scalar(
        select(func.count(Workspace.id))
        .join(
            Organization,
            Workspace.organization_id == Organization.id
        )
        .where(Organization.owner_id == user_id)
    )

    # Exploration count (direct)
    exploration_count = await session.scalar(
        select(func.count(Exploration.id))
        .where(Exploration.created_by == user_id)
    )

    return {
        "workspace_count": workspace_count or 0,
        "exploration_count": exploration_count or 0,
    }


from datetime import datetime, timedelta
from sqlalchemy import select, func, extract, Float, case, and_
from sqlalchemy.ext.asyncio import AsyncSession


def get_date_filter(filter_type: str):
    now = datetime.utcnow()

    if filter_type == "6_months":
        return now - timedelta(days=180)
    elif filter_type == "1_year":
        return now - timedelta(days=365)
    elif filter_type == "2_years":
        return now - timedelta(days=730)
    else:
        return None


async def get_user_dashboard(
    session: AsyncSession,
    user_id: str,
    filter_type: str
):

    date_from = get_date_filter(filter_type)

    # ==================================================
    # ACTIVE CHART (MONTHLY DATA)
    # ==================================================

    exploration_stmt = (
        select(
            extract("year", Exploration.created_at).label("year"),
            extract("month", Exploration.created_at).label("month"),
            func.count(Exploration.id).label("count")
        )
        .where(
            Exploration.created_by == user_id,
            Exploration.is_deleted == False
        )
        .group_by("year", "month")
        .order_by("year", "month")
    )

    if date_from:
        exploration_stmt = exploration_stmt.where(
            Exploration.created_at >= date_from
        )

    exploration_result = await session.execute(exploration_stmt)

    explorations_monthly = [
        {
            "year": int(row.year),
            "month": int(row.month),
            "count": row.count
        }
        for row in exploration_result.all()
    ]

    # -----------------------------
    # Workspace Monthly
    # -----------------------------

    workspace_stmt = (
        select(
            extract("year", Workspace.created_at).label("year"),
            extract("month", Workspace.created_at).label("month"),
            func.count(func.distinct(Workspace.id)).label("count")
        )
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user_id)
        .group_by("year", "month")
        .order_by("year", "month")
    )

    if date_from:
        workspace_stmt = workspace_stmt.where(
            Workspace.created_at >= date_from
        )

    workspace_result = await session.execute(workspace_stmt)

    workspaces_monthly = [
        {
            "year": int(row.year),
            "month": int(row.month),
            "count": row.count
        }
        for row in workspace_result.all()
    ]

    # -----------------------------
    # Report Download Monthly
    # -----------------------------

    download_stmt = (
        select(
            extract("year", SurveySimulation.created_at).label("year"),
            extract("month", SurveySimulation.created_at).label("month"),
            func.count(SurveySimulation.id).label("count")
        )
        .where(
            SurveySimulation.created_by == user_id,
            SurveySimulation.is_download == True
        )
        .group_by("year", "month")
        .order_by("year", "month")
    )

    if date_from:
        download_stmt = download_stmt.where(
            SurveySimulation.created_at >= date_from
        )

    download_result = await session.execute(download_stmt)

    downloads_monthly = [
        {
            "year": int(row.year),
            "month": int(row.month),
            "count": row.count
        }
        for row in download_result.all()
    ]

    # ==================================================
    # QUALITY LOGS
    # ==================================================

    # Avg Persona Confidence
    persona_conf_stmt = (
        select(
            Workspace.name,
            func.avg(
                func.cast(
                    func.replace(
                        Persona.persona_details["confidence_scoring"]["score"].astext,
                        "%",
                        ""
                    ),
                    Float
                )
            ).label("avg_confidence")
        )
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .join(Persona, Persona.workspace_id == Workspace.id)
        .where(
            WorkspaceMember.user_id == user_id,
            Persona.persona_details.isnot(None)
        )
        .group_by(Workspace.name)
    )

    if date_from:
        persona_conf_stmt = persona_conf_stmt.where(
            Persona.created_at >= date_from
        )

    persona_conf_result = await session.execute(persona_conf_stmt)

    avg_persona_confidence = [
        {
            "workspace_name": row.name,
            "avg_confidence": round(float(row.avg_confidence or 0), 2)
        }
        for row in persona_conf_result.all()
    ]

    # Avg Population Confidence
    json_each = lateral(
        func.jsonb_each(PopulationSimulation.global_insights.cast(JSONB))
    ).alias("json_each")

    population_conf_stmt = (
        select(
            Workspace.name,
            func.avg(
                cast(
                    literal_column("json_each.value ->> 'confidence_score'"),
                    Float
                )
            ).label("avg_confidence")
        )
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .join(PopulationSimulation, PopulationSimulation.workspace_id == Workspace.id)
        .join(json_each, literal_column("true"))
        .where(WorkspaceMember.user_id == user_id)
        .group_by(Workspace.name)
    )

    if date_from:
        population_conf_stmt = population_conf_stmt.where(
            PopulationSimulation.created_at >= date_from
        )

    population_conf_result = await session.execute(population_conf_stmt)

    avg_population_confidence = [
        {
            "workspace_name": row.name,
            "avg_confidence": round(float(row.avg_confidence or 0), 2)
        }
        for row in population_conf_result.all()
    ]

    # -----------------------------
    # Persona Count
    # -----------------------------

    persona_count_stmt = (
        select(
            Workspace.name,
            func.count(Persona.id).label("total_count")
        )
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .join(Persona, Persona.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user_id)
        .group_by(Workspace.name)
    )

    if date_from:
        persona_count_stmt = persona_count_stmt.where(
            Persona.created_at >= date_from
        )

    persona_count_result = await session.execute(persona_count_stmt)

    total_persona_simulated = [
        {
            "workspace_name": row.name,
            "total_count": row.total_count
        }
        for row in persona_count_result.all()
    ]

    # -----------------------------
    # Population Count
    # -----------------------------

    population_count_stmt = (
        select(
            Workspace.name,
            func.count(PopulationSimulation.id).label("total_count")
        )
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .join(
            PopulationSimulation,
            PopulationSimulation.workspace_id == Workspace.id
        )
        .where(WorkspaceMember.user_id == user_id)
        .group_by(Workspace.name)
    )

    if date_from:
        population_count_stmt = population_count_stmt.where(
            PopulationSimulation.created_at >= date_from
        )

    population_count_result = await session.execute(population_count_stmt)

    total_population_simulated = [
        {
            "workspace_name": row.name,
            "total_count": row.total_count
        }
        for row in population_count_result.all()
    ]

    # ==================================================
    # BUSINESS IMPACT
    # ==================================================

    business_stmt = select(

        # Qualitative Only
        func.sum(
            case(
                (
                    and_(
                        Exploration.is_qualitative.is_(True),
                        Exploration.is_quantitative.is_(False)
                    ),
                    1
                ),
                else_=0
            )
        ).label("qual_count"),

        # Quantitative Only
        func.sum(
            case(
                (
                    and_(
                        Exploration.is_quantitative.is_(True),
                        Exploration.is_qualitative.is_(False)
                    ),
                    1
                ),
                else_=0
            )
        ).label("quant_count"),

        # Both
        func.sum(
            case(
                (
                    and_(
                        Exploration.is_quantitative.is_(True),
                        Exploration.is_qualitative.is_(True)
                    ),
                    1
                ),
                else_=0
            )
        ).label("both_count")

    ).where(
        Exploration.created_by == user_id,
        Exploration.is_deleted.is_(False)  # 🔥 IMPORTANT FIX
    )

    if date_from:
        business_stmt = business_stmt.where(
            Exploration.created_at >= date_from
        )

    business_result = await session.execute(business_stmt)
    business_counts = business_result.one()

    total_explorations = await session.scalar(
        select(func.count(Exploration.id)).where(
            Exploration.created_by == user_id,
            Exploration.is_deleted == False,
            Exploration.created_at >= date_from if date_from else True
        )
    )

    total_workspaces = await session.scalar(
        select(func.count(func.distinct(Workspace.id)))
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(
            WorkspaceMember.user_id == user_id,
            Workspace.created_at >= date_from if date_from else True
        )
    )

    # ==================================================
    # FINAL RESPONSE
    # ==================================================

    return {
        "kpi_cards": {
            "total_explorations": total_explorations or 0,
            "total_workspaces": total_workspaces or 0,
        },
        "active_chart": {
            "explorations_monthly": explorations_monthly,
            "workspaces_monthly": workspaces_monthly,
            "report_downloads_monthly": downloads_monthly,
        },
        "quality_logs": {
            "avg_persona_confidence": avg_persona_confidence,
            "avg_population_confidence": avg_population_confidence,
            "total_persona_simulated": total_persona_simulated,
            "total_population_simulated": total_population_simulated,
        },
        "business_impact": {
            "qualitative_count": business_counts.qual_count or 0,
            "quantitative_count": business_counts.quant_count or 0,
            "both_count": business_counts.both_count or 0,
        }
    }

