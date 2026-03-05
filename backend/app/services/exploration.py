import logging
from datetime import datetime
from typing import Optional

from sqlmodel import Session, select
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exploration import Exploration
from app.models.user import User
from app.schemas.exploration import ExplorationCreate, ExplorationUpdate, ExplorationMethodSelect

logger = logging.getLogger(__name__)


class TrialLimitReachedException(Exception):
    """Raised when a trial user has exhausted their exploration quota."""
    pass


async def create_exploration(
    session: AsyncSession,
    workspace_id: str,
    user_id: str,
    data: ExplorationCreate,
    current_user: Optional[User] = None,
) -> Exploration:
    """
    Create a new exploration.

    If current_user is a trial user, enforces the exploration limit using
    a SELECT FOR UPDATE lock to prevent race conditions, then atomically
    increments exploration_count within the same transaction.
    """
    # --- Trial enforcement (concurrency-safe via row-level lock) ---
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

    exploration = Exploration(
        workspace_id=workspace_id,
        title=data.title,
        description=data.description,
        created_by=user_id,
    )
    session.add(exploration)

    # Atomically increment exploration_count for trial users (same transaction)
    if current_user is not None and current_user.is_trial:
        await session.execute(
            update(User)
            .where(User.id == user_id)
            .values(exploration_count=User.exploration_count + 1)
        )

    await session.commit()
    await session.refresh(exploration)

    logger.info(
        "Exploration created",
        extra={
            "user_id": user_id,
            "exploration_id": exploration.id,
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

async def get_explorations_by_workspace(
    session: AsyncSession,
    workspace_id: str,
) -> list[Exploration]:
    stmt = select(Exploration).where(
        Exploration.workspace_id == workspace_id,
        Exploration.is_deleted == False
    )

    result = await session.execute(stmt)
    return result.scalars().all()

async def update_exploration(
    session: AsyncSession,
    exploration: Exploration,
    data: ExplorationUpdate,
) -> Exploration:

    if data.title is not None:
        exploration.title = data.title

    if data.description is not None:
        exploration.description = data.description

    exploration.updated_at = datetime.utcnow()

    session.add(exploration)
    await session.commit()
    await session.refresh(exploration)

    return exploration

async def delete_exploration(
    session: AsyncSession,
    exploration: Exploration,
    current_user: Optional[User] = None,
) -> None:
    now = datetime.utcnow()
    exploration.deleted_at = now
    exploration.updated_at = now
    exploration.is_deleted = True
    session.add(exploration)

    await session.commit()


async def select_exploration_method(
    session: AsyncSession,
    exploration_id: str,
    data: ExplorationMethodSelect,
) -> Exploration:

    exploration = await session.get(Exploration, exploration_id)

    if not exploration:
        raise ValueError("Exploration not found")

    # 🔹 Update research methods if provided
    if data.is_quantitative is not None:
        exploration.is_quantitative = data.is_quantitative

    if data.is_qualitative is not None:
        exploration.is_qualitative = data.is_qualitative

    # 🔹 Validate only when methods are being changed
    if (
        (data.is_quantitative is not None or data.is_qualitative is not None)
        and not (exploration.is_quantitative or exploration.is_qualitative)
    ):
        raise ValueError("At least one research method must be selected")

    # 🔹 Handle end exploration
    if data.is_end:
        exploration.is_end = True
        exploration.updated_at = datetime.utcnow()

    exploration.updated_at = datetime.utcnow()

    session.add(exploration)
    await session.commit()
    await session.refresh(exploration)

    return exploration
