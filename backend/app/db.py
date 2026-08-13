from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings


async_engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.SQLALCHEMY_ECHO,
)

async_session = sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

AsyncSessionLocal = sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session


# NOTE: init_db() was removed deliberately. It called
# SQLModel.metadata.create_all, which made SQLModel a second schema authority
# alongside app/migrations/startup.py — that is how the same column ended up
# with different types depending on a database's deployment history
# (e.g. questionnairequestionasset.metadata is `json` here but `jsonb` on
# databases where the column predated create_all).
#
# Alembic is now the single source of schema truth. Do not reintroduce
# create_all: to change the schema, add a revision under alembic/versions/.
