from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.config import settings
from sqlalchemy import text
from app.models import user, organization, workspace, exploration, persona, interview, population

async_engine = create_async_engine(settings.DATABASE_URL, echo=settings.SQLALCHEMY_ECHO)

async_session = sessionmaker(
    async_engine, class_=AsyncSession, expire_on_commit=False
)

AsyncSessionLocal = sessionmaker(
    bind=async_engine, class_=AsyncSession, expire_on_commit=False
)


async def get_session() -> AsyncSession:
    async with async_session() as session:
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


async def add_trial_columns():
    """Safe migration: add free trial management columns to the user table."""
    async with async_engine.begin() as conn:
        await conn.execute(text("""
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS is_trial BOOLEAN NOT NULL DEFAULT TRUE;
        """))
        await conn.execute(text("""
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS exploration_count INTEGER NOT NULL DEFAULT 0;
        """))
        await conn.execute(text("""
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS trial_exploration_limit INTEGER NOT NULL DEFAULT 1;
        """))
        await conn.execute(text("""
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
        """))


async def add_enterprise_columns():
    """Safe migration: add enterprise pricing tier columns to user and organization."""
    async with async_engine.begin() as conn:
        # User: pricing tier label
        await conn.execute(text("""
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS account_tier VARCHAR NOT NULL DEFAULT 'free';
        """))
        # User: nullable FK to the enterprise org this user belongs to
        await conn.execute(text("""
            ALTER TABLE "user"
            ADD COLUMN IF NOT EXISTS organization_id VARCHAR
            REFERENCES organization(id) ON DELETE SET NULL;
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_user_organization_id
            ON "user" (organization_id);
        """))
        # Organization: tier label ("standard" | "enterprise")
        await conn.execute(text("""
            ALTER TABLE organization
            ADD COLUMN IF NOT EXISTS account_tier VARCHAR NOT NULL DEFAULT 'standard';
        """))
        # Organization: max explorations (0 = no cap, used for personal orgs)
        await conn.execute(text("""
            ALTER TABLE organization
            ADD COLUMN IF NOT EXISTS exploration_limit INTEGER NOT NULL DEFAULT 0;
        """))
        # Organization: running exploration count (incremented atomically for enterprise)
        await conn.execute(text("""
            ALTER TABLE organization
            ADD COLUMN IF NOT EXISTS exploration_count INTEGER NOT NULL DEFAULT 0;
        """))


async def add_workspace_visibility_columns():
    """Safe migration: add hidden/default flags for personal workspaces."""
    async with async_engine.begin() as conn:
        await conn.execute(text("""
            ALTER TABLE workspace
            ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;
        """))
        await conn.execute(text("""
            ALTER TABLE workspace
            ADD COLUMN IF NOT EXISTS is_default_personal BOOLEAN NOT NULL DEFAULT FALSE;
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_workspace_is_default_personal
            ON workspace (is_default_personal);
        """))


async def add_exploration_audience_type_column():
    """Safe migration: add audience_type to explorations and backfill legacy rows."""
    async with async_engine.begin() as conn:
        await conn.execute(text("""
            ALTER TABLE explorations
            ADD COLUMN IF NOT EXISTS audience_type VARCHAR NOT NULL DEFAULT 'B2C';
        """))
        await conn.execute(text("""
            UPDATE explorations
            SET audience_type = 'B2C'
            WHERE audience_type IS NULL OR TRIM(audience_type) = '';
        """))
