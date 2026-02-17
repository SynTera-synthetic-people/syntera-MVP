from sqlmodel import Session, select
from datetime import datetime
from app.models.exploration import Exploration
from app.schemas.exploration import ExplorationCreate, ExplorationUpdate, ExplorationMethodSelect
from sqlalchemy.ext.asyncio import AsyncSession

async def create_exploration(
    session: AsyncSession,
    workspace_id: str,
    user_id: str,
    data: ExplorationCreate,
) -> Exploration:
    exploration = Exploration(
        workspace_id=workspace_id,
        title=data.title,
        description=data.description,
        created_by=user_id,
    )

    session.add(exploration)
    await session.commit()
    await session.refresh(exploration)
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
    exploration: Exploration
) -> None:
    exploration.deleted_at = datetime.utcnow()
    exploration.updated_at = datetime.utcnow()
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



