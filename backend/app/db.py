from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.config import settings
from sqlalchemy import text
from app.models import user, organization, workspace, exploration, persona, interview, population

async_engine = create_async_engine(settings.DATABASE_URL, echo=True)
async_session = sessionmaker(
    async_engine, class_=AsyncSession, expire_on_commit=False
)

AsyncSessionLocal = sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

async def init_db():
    from app.models import user, organization, workspace, exploration, persona, interview, population
    async with async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)



async def add_is_active_column():
    async with async_engine.begin() as conn:

        await conn.execute(text("""
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
        """))

        await conn.execute(text("""
            ALTER TABLE "surveysimulation"
            ADD COLUMN IF NOT EXISTS is_download BOOLEAN NOT NULL DEFAULT TRUE;
        """))

        await conn.execute(text("""
            ALTER TABLE "interviewsection"
            ADD COLUMN IF NOT EXISTS is_download BOOLEAN NOT NULL DEFAULT TRUE;
        """))

        await conn.execute(text("""
            ALTER TABLE explorations
            ADD COLUMN IF NOT EXISTS is_quantitative BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS is_qualitative BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS is_end BOOLEAN NOT NULL DEFAULT FALSE;
        """))
        # await conn.execute(text("""
        # ALTER TABLE persona
        # ADD COLUMN IF NOT EXISTS persona_details JSONB;
        # """))
        #

        await conn.execute(text("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'persona'
                  AND column_name = 'interests'
            ) THEN
                ALTER TABLE persona
                ALTER COLUMN interests TYPE JSONB
                USING to_jsonb(interests);
            END IF;
        END $$;
        """))

        await conn.execute(text("""
        ALTER TABLE surveysimulation
            ADD COLUMN IF NOT EXISTS simulation_result JSONB NOT NULL DEFAULT '{}'::jsonb;
        """))

        await conn.execute(text("""
        CREATE TABLE IF NOT EXISTS traceability_report
        (
            id VARCHAR PRIMARY KEY, 
            exploration_id VARCHAR NOT NULL UNIQUE,
            ro_traceability JSONB NOT NULL DEFAULT '{}':: jsonb,
            persona_traceability JSONB NOT NULL DEFAULT '{}':: jsonb, 
            quant_traceability JSONB NOT NULL DEFAULT '{}' ::jsonb,
            qual_traceability JSONB NOT NULL DEFAULT '{}':: jsonb,
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW());
        """)
        )

