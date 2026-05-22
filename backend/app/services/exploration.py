import logging
from datetime import datetime
from typing import Optional

from sqlmodel import Session, select
from sqlalchemy import update, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exploration import Exploration
from app.models.organization import Organization
from app.models.user import User
from app.schemas.exploration import ExplorationCreate, ExplorationUpdate, ExplorationMethodSelect, ExplorationStep
from app.models.research_objectives import ResearchObjectives
from app.models.persona import Persona as PersonaModel
from app.models.interview import InterviewSection, Interview as InterviewModel
from app.models.questionnaire import QuestionnaireSection
from app.models.population import PopulationSimulation
from app.models.survey_simulation import SurveySimulation

logger = logging.getLogger(__name__)


class TrialLimitReachedException(Exception):
    """Raised when a free-trial user has exhausted their single exploration quota."""
    pass


class PlanLimitReachedException(Exception):
    """Raised when a tier1 or enterprise user has exhausted their plan exploration quota."""
    pass


class WorkflowError(Exception):
    """Raised when an action is attempted at the wrong workflow step."""
    def __init__(self, message: str, current_step: str):
        self.message = message
        self.current_step = current_step
        super().__init__(message)


async def create_exploration(
    session: AsyncSession,
    workspace_id: str,
    user_id: str,
    data: ExplorationCreate,
    current_user: Optional[User] = None,
) -> Exploration:
    tier = getattr(current_user, "account_tier", "free") if current_user else None

    if current_user is not None and current_user.is_trial:
        locked_result = await session.execute(
            select(User).where(User.id == user_id).with_for_update()
        )
        locked_user = locked_result.scalar_one_or_none()
        if locked_user and locked_user.exploration_count >= locked_user.trial_exploration_limit:
            logger.warning(
                "Trial limit reached — exploration creation blocked",
                extra={
                    "user_id": user_id,
                    "exploration_count": locked_user.exploration_count,
                    "trial_exploration_limit": locked_user.trial_exploration_limit,
                }
            )
            raise TrialLimitReachedException()

    elif current_user is not None and tier == "tier1":
        locked_result = await session.execute(
            select(User).where(User.id == user_id).with_for_update()
        )
        locked_user = locked_result.scalar_one_or_none()
        if locked_user and locked_user.exploration_count >= locked_user.trial_exploration_limit:
            logger.warning(
                "Tier-1 plan limit reached — exploration creation blocked",
                extra={
                    "user_id": user_id,
                    "exploration_count": locked_user.exploration_count,
                    "tier1_limit": locked_user.trial_exploration_limit,
                }
            )
            raise PlanLimitReachedException()

    elif current_user is not None and tier == "enterprise" and current_user.organization_id:
        locked_result = await session.execute(
            select(Organization)
            .where(Organization.id == current_user.organization_id)
            .with_for_update()
        )
        locked_org = locked_result.scalar_one_or_none()
        if (
            locked_org
            and locked_org.exploration_limit > 0
            and locked_org.exploration_count >= locked_org.exploration_limit
        ):
            logger.warning(
                "Enterprise org exploration limit reached — creation blocked",
                extra={
                    "user_id": user_id,
                    "org_id": current_user.organization_id,
                    "org_exploration_count": locked_org.exploration_count,
                    "org_exploration_limit": locked_org.exploration_limit,
                }
            )
            raise PlanLimitReachedException()

    exploration = Exploration(
        workspace_id=workspace_id,
        title=data.title,
        description=data.description,
        audience_type=data.audience_type,
        created_by=user_id,
    )
    session.add(exploration)

    if current_user is not None and (current_user.is_trial or tier == "tier1"):
        await session.execute(
            update(User)
            .where(User.id == user_id)
            .values(exploration_count=User.exploration_count + 1)
        )
    elif current_user is not None and tier == "enterprise" and current_user.organization_id:
        await session.execute(
            update(Organization)
            .where(Organization.id == current_user.organization_id)
            .values(exploration_count=Organization.exploration_count + 1)
        )

    await session.commit()
    await session.refresh(exploration)

    logger.info(
        "Exploration created",
        extra={
            "user_id": user_id,
            "exploration_id": exploration.id,
            "account_tier": tier,
            "is_trial": bool(current_user and current_user.is_trial),
        }
    )
    return exploration


async def get_exploration(
    session: AsyncSession,
    exploration_id: str
) -> Exploration | None:
    stmt = select(Exploration).where(
        Exploration.id == exploration_id,
        Exploration.is_deleted.is_(False)
    )
    result = await session.execute(stmt)
    return result.scalars().first()


async def get_exploration_by_id(
    session: AsyncSession,
    exploration_id: str
) -> Exploration | None:
    result = await session.execute(
        select(Exploration).where(Exploration.id == exploration_id, Exploration.is_deleted == False)
    )
    return result.scalar_one_or_none()


def _compute_step(e: Exploration, has_ro: bool, has_persona: bool) -> ExplorationStep:
    """Granular step for frontend "Continue" button routing."""
    if e.is_end:
        return ExplorationStep.completed
    if e.is_quantitative:
        return ExplorationStep.step_4
    if e.is_qualitative:
        return ExplorationStep.step_3
    if has_persona:
        return ExplorationStep.step_3   # personas exist, method selection pending
    if has_ro:
        return ExplorationStep.step_2   # RO done, needs personas
    return ExplorationStep.step_1       # needs research objectives


def _compute_qual_step_from_flags(has_guide: bool, has_interviews: bool) -> str:
    """Sync helper: which sub-step within qualitative Step 3 the exploration is at."""
    if not has_guide:
        return "guide"
    if not has_interviews:
        return "interviews"
    return "insights"


def _compute_quant_step_from_flags(
    has_questionnaire: bool, has_population: bool, has_survey: bool
) -> str:
    """Which sub-step within quantitative Step 4 the exploration is at."""
    if not has_questionnaire:
        return "questionnaire"
    if not has_population:
        return "population"
    if not has_survey:
        return "survey"
    return "insights"


def _ready_persona_clause():
    """A draft manual persona is not yet usable for downstream research steps."""
    return or_(
        PersonaModel.calibration_status.is_(None),
        PersonaModel.calibration_status != "draft",
    )


async def get_explorations_by_workspace(
    session: AsyncSession,
    workspace_id: str,
    current_user: Optional[User] = None,
) -> list[dict]:
    stmt = select(Exploration).where(
        Exploration.workspace_id == workspace_id,
        Exploration.is_deleted == False,
    )
    result = await session.execute(stmt)
    explorations = result.scalars().all()

    if not explorations:
        return []

    exp_ids = [e.id for e in explorations]

    # Batch: avoid N+1 — two queries instead of 2×N
    ro_rows = await session.execute(
        select(ResearchObjectives.exploration_id)
        .where(ResearchObjectives.exploration_id.in_(exp_ids))
        .distinct()
    )
    has_ro: set[str] = {row[0] for row in ro_rows.all()}

    persona_rows = await session.execute(
        select(PersonaModel.exploration_id)
        .where(PersonaModel.exploration_id.in_(exp_ids))
        .where(_ready_persona_clause())
        .distinct()
    )
    has_persona: set[str] = {row[0] for row in persona_rows.all()}

    # Batch: qual sub-step flags (avoids N+1 for Step 3 granularity)
    guide_rows = await session.execute(
        select(InterviewSection.exploration_id)
        .where(InterviewSection.exploration_id.in_(exp_ids))
        .distinct()
    )
    has_guide: set[str] = {row[0] for row in guide_rows.all()}

    iv_rows = await session.execute(
        select(InterviewModel.exploration_id)
        .where(InterviewModel.exploration_id.in_(exp_ids))
        .distinct()
    )
    has_interviews: set[str] = {row[0] for row in iv_rows.all()}

    # Batch: quant sub-step flags
    q_section_rows = await session.execute(
        select(QuestionnaireSection.exploration_id)
        .where(QuestionnaireSection.exploration_id.in_(exp_ids))
        .distinct()
    )
    has_questionnaire: set[str] = {row[0] for row in q_section_rows.all()}

    pop_rows = await session.execute(
        select(PopulationSimulation.exploration_id)
        .where(PopulationSimulation.exploration_id.in_(exp_ids))
        .distinct()
    )
    has_population: set[str] = {row[0] for row in pop_rows.all()}

    survey_rows = await session.execute(
        select(SurveySimulation.exploration_id)
        .where(SurveySimulation.exploration_id.in_(exp_ids))
        .distinct()
    )
    has_survey: set[str] = {row[0] for row in survey_rows.all()}

    access_state = None
    if current_user is not None:
        from app.services.product_state import compute_user_product_state

        product_state = await compute_user_product_state(session, current_user)
        access_state = {
            "workspace_locked": product_state["flags"]["workspace_locked"],
            "read_only_access": product_state["flags"]["read_only_access"],
            "can_create_exploration": product_state["actions"]["can_create_exploration"],
            "can_run_behavioral_simulation": product_state["actions"]["can_run_behavioral_simulation"],
            "can_view_reports": product_state["actions"]["can_view_reports"],
            "can_view_traceability": product_state["actions"]["can_view_traceability"],
            "restrictions": product_state["restrictions"],
        }

    return [
        {
            "id": e.id,
            "workspace_id": e.workspace_id,
            "title": e.title,
            "description": e.description,
            "audience_type": e.audience_type,
            "created_by": e.created_by,
            "created_at": e.created_at,
            "updated_at": e.updated_at,
            "is_end": e.is_end,
            "is_quantitative": e.is_quantitative,
            "is_qualitative": e.is_qualitative,
            "current_step": _compute_step(e, e.id in has_ro, e.id in has_persona),
            # None for non-qualitative explorations; "guide"|"interviews"|"insights" otherwise
            "qual_step": (
                _compute_qual_step_from_flags(e.id in has_guide, e.id in has_interviews)
                if e.is_qualitative else None
            ),
            # None for non-quantitative; "questionnaire"|"population"|"survey"|"insights" otherwise
            "quant_step": (
                _compute_quant_step_from_flags(
                    e.id in has_questionnaire,
                    e.id in has_population,
                    e.id in has_survey,
                )
                if e.is_quantitative else None
            ),
            "access": access_state,
        }
        for e in explorations
    ]


async def get_exploration_enriched(
    session: AsyncSession,
    exploration_id: str,
    current_user: Optional[User] = None,
) -> dict | None:
    """Single-fetch equivalent of get_explorations_by_workspace — returns granular current_step."""
    e = await get_exploration(session, exploration_id)
    if not e:
        return None

    ro_r = await session.execute(
        select(ResearchObjectives.exploration_id)
        .where(ResearchObjectives.exploration_id == exploration_id)
        .limit(1)
    )
    has_ro = ro_r.scalar() is not None

    p_r = await session.execute(
        select(PersonaModel.exploration_id)
        .where(PersonaModel.exploration_id == exploration_id)
        .where(_ready_persona_clause())
        .limit(1)
    )
    has_persona = p_r.scalar() is not None

    guide_r = await session.execute(
        select(InterviewSection.exploration_id)
        .where(InterviewSection.exploration_id == exploration_id)
        .limit(1)
    )
    has_guide = guide_r.scalar() is not None

    iv_r = await session.execute(
        select(InterviewModel.exploration_id)
        .where(InterviewModel.exploration_id == exploration_id)
        .limit(1)
    )
    has_interviews = iv_r.scalar() is not None

    qs_r = await session.execute(
        select(QuestionnaireSection.exploration_id)
        .where(QuestionnaireSection.exploration_id == exploration_id)
        .limit(1)
    )
    has_questionnaire = qs_r.scalar() is not None

    pop_r = await session.execute(
        select(PopulationSimulation.exploration_id)
        .where(PopulationSimulation.exploration_id == exploration_id)
        .limit(1)
    )
    has_population = pop_r.scalar() is not None

    sv_r = await session.execute(
        select(SurveySimulation.exploration_id)
        .where(SurveySimulation.exploration_id == exploration_id)
        .limit(1)
    )
    has_survey = sv_r.scalar() is not None

    access_state = None
    if current_user is not None:
        from app.services.product_state import compute_user_product_state

        product_state = await compute_user_product_state(session, current_user)
        access_state = {
            "workspace_locked": product_state["flags"]["workspace_locked"],
            "read_only_access": product_state["flags"]["read_only_access"],
            "can_create_exploration": product_state["actions"]["can_create_exploration"],
            "can_run_behavioral_simulation": product_state["actions"]["can_run_behavioral_simulation"],
            "can_view_reports": product_state["actions"]["can_view_reports"],
            "can_view_traceability": product_state["actions"]["can_view_traceability"],
            "restrictions": product_state["restrictions"],
        }

    return {
        "id": e.id,
        "workspace_id": e.workspace_id,
        "title": e.title,
        "description": e.description,
        "audience_type": e.audience_type,
        "created_by": e.created_by,
        "created_at": e.created_at,
        "updated_at": e.updated_at,
        "is_end": e.is_end,
        "is_quantitative": e.is_quantitative,
        "is_qualitative": e.is_qualitative,
        "current_step": _compute_step(e, has_ro, has_persona),
        "qual_step": (
            _compute_qual_step_from_flags(has_guide, has_interviews)
            if e.is_qualitative else None
        ),
        "quant_step": (
            _compute_quant_step_from_flags(has_questionnaire, has_population, has_survey)
            if e.is_quantitative else None
        ),
        "access": access_state,
    }


async def require_ro_exists(session: AsyncSession, exploration_id: str) -> None:
    """Guard: raise WorkflowError if no research objective exists yet."""
    r = await session.execute(
        select(ResearchObjectives.exploration_id)
        .where(ResearchObjectives.exploration_id == exploration_id)
        .limit(1)
    )
    if r.scalar() is None:
        raise WorkflowError(
            "Research objectives must be created before adding personas.",
            ExplorationStep.step_1.value,
        )


async def require_persona_exists(session: AsyncSession, exploration_id: str) -> None:
    """Guard: raise WorkflowError if no persona exists yet."""
    r = await session.execute(
        select(PersonaModel.exploration_id)
        .where(PersonaModel.exploration_id == exploration_id)
        .where(_ready_persona_clause())
        .limit(1)
    )
    if r.scalar() is None:
        raise WorkflowError(
            "At least one calibrated persona must be created before starting research.",
            ExplorationStep.step_2.value,
        )


async def update_exploration(
    session: AsyncSession,
    exploration: Exploration,
    data: ExplorationUpdate,
    updated_by: Optional[str] = None,
) -> Exploration:
    if data.title is not None:
        exploration.title = data.title
    if data.description is not None:
        exploration.description = data.description
    if data.audience_type is not None:
        exploration.audience_type = data.audience_type

    exploration.updated_at = datetime.utcnow()
    exploration.updated_by = updated_by

    session.add(exploration)
    await session.commit()
    await session.refresh(exploration)
    return exploration


async def delete_exploration(
    session: AsyncSession,
    exploration: Exploration,
    current_user: Optional[User] = None,
) -> None:
    """
    Cascade-delete all child records, then soft-delete the exploration.
    Also decrements the exploration counter for trial/tier1/enterprise users.
    All operations run in a single transaction.
    """
    from app.models.research_objectives import ResearchObjectives, ResearchObjectivesFile
    from app.models.persona import Persona
    from app.models.interview import InterviewSection, InterviewQuestion, Interview, InterviewFile
    from app.models.survey_simulation import SurveySimulation
    from app.models.population import PopulationSimulation
    from app.models.traceability import TraceabilityReport
    from app.models.rebuttal import RebuttalSession
    from app.models.questionnaire import QuestionnaireSection, QuestionnaireQuestion
    from app.models.omi import OmiSession

    eid = exploration.id

    # --- Collect IDs of children we need to cascade into ---
    ro_ids_result = await session.execute(
        select(ResearchObjectives.id).where(ResearchObjectives.exploration_id == eid)
    )
    ro_ids = [row[0] for row in ro_ids_result.all()]

    section_ids_result = await session.execute(
        select(InterviewSection.id).where(InterviewSection.exploration_id == eid)
    )
    section_ids = [row[0] for row in section_ids_result.all()]

    interview_ids_result = await session.execute(
        select(Interview.id).where(Interview.exploration_id == eid)
    )
    interview_ids = [row[0] for row in interview_ids_result.all()]

    q_section_ids_result = await session.execute(
        select(QuestionnaireSection.id).where(QuestionnaireSection.exploration_id == eid)
    )
    q_section_ids = [row[0] for row in q_section_ids_result.all()]

    # --- Cascade deletes (order strictly respects FK constraints) ---

    # 1. Leaf tables with no dependents
    await session.execute(
        delete(TraceabilityReport).where(TraceabilityReport.exploration_id == eid)
    )
    await session.execute(
        delete(SurveySimulation).where(SurveySimulation.exploration_id == eid)
    )
    await session.execute(
        delete(PopulationSimulation).where(PopulationSimulation.exploration_id == eid)
    )

    # 2. Interview files → interviews → interview sections
    if interview_ids:
        await session.execute(
            delete(InterviewFile).where(InterviewFile.interview_id.in_(interview_ids))
        )
    await session.execute(
        delete(Interview).where(Interview.exploration_id == eid)
    )
    if section_ids:
        await session.execute(
            delete(InterviewQuestion).where(InterviewQuestion.section_id.in_(section_ids))
        )
    await session.execute(
        delete(InterviewSection).where(InterviewSection.exploration_id == eid)
    )

    # 3. RebuttalSession must go before QuestionnaireQuestion (FK dep)
    await session.execute(
        delete(RebuttalSession).where(RebuttalSession.exploration_id == eid)
    )

    # 4. Questionnaire questions → sections
    if q_section_ids:
        await session.execute(
            delete(QuestionnaireQuestion).where(
                QuestionnaireQuestion.section_id.in_(q_section_ids)
            )
        )
    await session.execute(
        delete(QuestionnaireSection).where(QuestionnaireSection.exploration_id == eid)
    )

    # 5. Personas
    await session.execute(
        delete(Persona).where(Persona.exploration_id == eid)
    )

    # 6. Research objective files → research objectives
    if ro_ids:
        await session.execute(
            delete(ResearchObjectivesFile).where(
                ResearchObjectivesFile.research_objectives_id.in_(ro_ids)
            )
        )
    await session.execute(
        delete(ResearchObjectives).where(ResearchObjectives.exploration_id == eid)
    )

    # 7. OmiSession
    await session.execute(
        delete(OmiSession).where(OmiSession.exploration_id == eid)
    )

    # --- Soft-delete the exploration itself ---
    now = datetime.utcnow()
    exploration.is_deleted = True
    exploration.deleted_at = now
    exploration.updated_at = now
    exploration.deleted_by = current_user.id if current_user else None
    session.add(exploration)

    # --- Decrement exploration counter ---
    if current_user is not None:
        tier = getattr(current_user, "account_tier", "free")
        if current_user.is_trial or tier == "tier1":
            await session.execute(
                update(User)
                .where(User.id == current_user.id, User.exploration_count > 0)
                .values(exploration_count=User.exploration_count - 1)
            )
        elif tier == "enterprise" and current_user.organization_id:
            await session.execute(
                update(Organization)
                .where(
                    Organization.id == current_user.organization_id,
                    Organization.exploration_count > 0,
                )
                .values(exploration_count=Organization.exploration_count - 1)
            )

    await session.commit()

    logger.info(
        "Exploration deleted (cascade)",
        extra={
            "exploration_id": eid,
            "deleted_by": current_user.id if current_user else None,
        }
    )


async def select_exploration_method(
    session: AsyncSession,
    exploration_id: str,
    data: ExplorationMethodSelect,
) -> Exploration:
    exploration = await session.get(Exploration, exploration_id)

    if not exploration:
        raise ValueError("Exploration not found")

    if (
        data.is_quantitative is not None
        or data.is_qualitative is not None
        or data.is_end
    ):
        await require_ro_exists(session, exploration_id)
        await require_persona_exists(session, exploration_id)

    if data.is_quantitative is not None:
        exploration.is_quantitative = data.is_quantitative

    if data.is_qualitative is not None:
        exploration.is_qualitative = data.is_qualitative

    if (
        (data.is_quantitative is not None or data.is_qualitative is not None)
        and not (exploration.is_quantitative or exploration.is_qualitative)
    ):
        raise ValueError("At least one research method must be selected")

    if data.is_end:
        if not (exploration.is_quantitative or exploration.is_qualitative):
            raise ValueError("A research method must be selected before completing exploration")
        exploration.is_end = True

    exploration.updated_at = datetime.utcnow()

    session.add(exploration)
    await session.commit()
    await session.refresh(exploration)
    return exploration
