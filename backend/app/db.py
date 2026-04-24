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


async def create_sync_schemas():
    """Create the 3 SyncDB PostgreSQL schemas and their tables (idempotent)."""
    async with async_engine.begin() as conn:
        # ── schemas ──────────────────────────────────────────────────────────
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS sync_action"))
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS sync_survey"))
        await conn.execute(text("CREATE SCHEMA IF NOT EXISTS sync_source"))

        # ── sync_action ───────────────────────────────────────────────────────
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_action.dataset (
                id          VARCHAR PRIMARY KEY,
                name        VARCHAR NOT NULL,
                domain      VARCHAR,
                source_file VARCHAR,
                row_count   INTEGER NOT NULL DEFAULT 0,
                columns     JSONB NOT NULL DEFAULT '[]'::jsonb,
                exploration_id VARCHAR,
                uploaded_by VARCHAR,
                uploaded_at TIMESTAMP NOT NULL DEFAULT now(),
                metadata    JSONB NOT NULL DEFAULT '{}'::jsonb
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_action.record (
                id          VARCHAR PRIMARY KEY,
                dataset_id  VARCHAR NOT NULL
                            REFERENCES sync_action.dataset(id) ON DELETE CASCADE,
                row_index   INTEGER NOT NULL,
                data        JSONB NOT NULL,
                created_at  TIMESTAMP NOT NULL DEFAULT now()
            )
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_action_record_dataset
            ON sync_action.record (dataset_id)
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_action_record_data
            ON sync_action.record USING GIN (data)
        """))

        # ── sync_survey ───────────────────────────────────────────────────────
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_survey.dataset (
                id               VARCHAR PRIMARY KEY,
                name             VARCHAR NOT NULL,
                domain           VARCHAR,
                source_file      VARCHAR,
                respondent_count INTEGER NOT NULL DEFAULT 0,
                question_schema  JSONB NOT NULL DEFAULT '[]'::jsonb,
                exploration_id   VARCHAR,
                uploaded_by      VARCHAR,
                uploaded_at      TIMESTAMP NOT NULL DEFAULT now(),
                metadata         JSONB NOT NULL DEFAULT '{}'::jsonb
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_survey.response (
                id            VARCHAR PRIMARY KEY,
                dataset_id    VARCHAR NOT NULL
                              REFERENCES sync_survey.dataset(id) ON DELETE CASCADE,
                respondent_id VARCHAR,
                answers       JSONB NOT NULL,
                created_at    TIMESTAMP NOT NULL DEFAULT now()
            )
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_survey_response_dataset
            ON sync_survey.response (dataset_id)
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_survey.aggregation (
                id          VARCHAR PRIMARY KEY,
                dataset_id  VARCHAR NOT NULL UNIQUE
                            REFERENCES sync_survey.dataset(id) ON DELETE CASCADE,
                results     JSONB NOT NULL,
                computed_at TIMESTAMP NOT NULL DEFAULT now()
            )
        """))

        # ── sync_source ───────────────────────────────────────────────────────
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_source.document (
                id           VARCHAR PRIMARY KEY,
                title        VARCHAR NOT NULL,
                source_type  VARCHAR NOT NULL,
                source_url   VARCHAR,
                file_data    BYTEA,
                file_name    VARCHAR,
                domain       VARCHAR,
                is_processed BOOLEAN NOT NULL DEFAULT FALSE,
                exploration_id VARCHAR,
                uploaded_by  VARCHAR,
                uploaded_at  TIMESTAMP NOT NULL DEFAULT now(),
                metadata     JSONB NOT NULL DEFAULT '{}'::jsonb
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sync_source.content_chunk (
                id           VARCHAR PRIMARY KEY,
                document_id  VARCHAR NOT NULL
                             REFERENCES sync_source.document(id) ON DELETE CASCADE,
                chunk_index  INTEGER NOT NULL,
                content      TEXT NOT NULL,
                content_json JSONB,
                data_type    VARCHAR NOT NULL DEFAULT 'document',
                created_at   TIMESTAMP NOT NULL DEFAULT now()
            )
        """))

        # ── FIX: ensure data_type + content_json exist on already-created tables ──
        # If content_chunk was created by an older migration (without these columns),
        # ADD COLUMN IF NOT EXISTS safely backfills them — no-op if already present.
        await conn.execute(text("""
            ALTER TABLE sync_source.content_chunk
            ADD COLUMN IF NOT EXISTS content_json JSONB;
        """))
        await conn.execute(text("""
            ALTER TABLE sync_source.content_chunk
            ADD COLUMN IF NOT EXISTS data_type VARCHAR NOT NULL DEFAULT 'document';
        """))
        # Backfill any NULL data_type values left by the old schema
        await conn.execute(text("""
            UPDATE sync_source.content_chunk AS c
            SET data_type = CASE
                WHEN c.content_json IS NOT NULL
                     OR d.source_type IN ('csv', 'xlsx', 'xls') THEN 'tabular'
                WHEN d.source_type = 'url' THEN 'scraped'
                ELSE 'document'
            END
            FROM sync_source.document AS d
            WHERE d.id = c.document_id
              AND (c.data_type IS NULL OR BTRIM(c.data_type) = '');
        """))
        # ── end fix ───────────────────────────────────────────────────────────

        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_source_chunk_document
            ON sync_source.content_chunk (document_id)
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_source_chunk_data_type
            ON sync_source.content_chunk (data_type)
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_source_chunk_fts
            ON sync_source.content_chunk
            USING GIN (to_tsvector('simple', COALESCE(content, '')))
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_source_chunk_content_json
            ON sync_source.content_chunk
            USING GIN (content_json);
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_source_chunk_doc_type_order
            ON sync_source.content_chunk (document_id, data_type, chunk_index, created_at);
        """))


async def add_syncdb_envelope_columns():
    """
    Safe migration: add envelope columns (status, workspace_id, region, year,
    source_format, subject_key) to sync_action.record and sync_survey.response.
    Idempotent — uses ADD COLUMN IF NOT EXISTS.
    """
    async with async_engine.begin() as conn:
        for table in ("sync_action.record", "sync_survey.response"):
            await conn.execute(text(f"""
                ALTER TABLE {table}
                ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'pending'
            """))
            await conn.execute(text(f"""
                ALTER TABLE {table}
                ADD COLUMN IF NOT EXISTS workspace_id VARCHAR
            """))
            await conn.execute(text(f"""
                ALTER TABLE {table}
                ADD COLUMN IF NOT EXISTS region VARCHAR
            """))
            await conn.execute(text(f"""
                ALTER TABLE {table}
                ADD COLUMN IF NOT EXISTS year INTEGER
            """))
            await conn.execute(text(f"""
                ALTER TABLE {table}
                ADD COLUMN IF NOT EXISTS source_format VARCHAR
            """))
            await conn.execute(text(f"""
                ALTER TABLE {table}
                ADD COLUMN IF NOT EXISTS subject_key VARCHAR
            """))

        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_action_record_status
            ON sync_action.record (status)
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_survey_response_status
            ON sync_survey.response (status)
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_action_record_workspace
            ON sync_action.record (workspace_id)
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_survey_response_workspace
            ON sync_survey.response (workspace_id)
        """))


async def create_report_cache_table():
    """Create report_cache table and enforce one cache row per logical report."""
    async with async_engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS report_cache (
                id VARCHAR PRIMARY KEY,
                exploration_id VARCHAR NOT NULL,
                simulation_id VARCHAR,
                report_type VARCHAR NOT NULL,
                cta_type VARCHAR NOT NULL,
                status VARCHAR NOT NULL DEFAULT 'done',
                pdf_path VARCHAR,
                content_md TEXT,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT now(),
                expires_at TIMESTAMP
            )
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_report_cache_lookup
            ON report_cache (exploration_id, simulation_id, cta_type)
        """))
        await conn.execute(text("""
            WITH ranked AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY exploration_id, cta_type, simulation_id
                        ORDER BY created_at DESC NULLS LAST, id DESC
                    ) AS rn
                FROM report_cache
                WHERE simulation_id IS NOT NULL
            )
            DELETE FROM report_cache rc
            USING ranked
            WHERE rc.id = ranked.id
              AND ranked.rn > 1
        """))
        await conn.execute(text("""
            WITH ranked AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY exploration_id, cta_type
                        ORDER BY created_at DESC NULLS LAST, id DESC
                    ) AS rn
                FROM report_cache
                WHERE simulation_id IS NULL
            )
            DELETE FROM report_cache rc
            USING ranked
            WHERE rc.id = ranked.id
              AND ranked.rn > 1
        """))
        await conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_report_cache_qual
            ON report_cache (exploration_id, cta_type)
            WHERE simulation_id IS NULL
        """))
        await conn.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_report_cache_quant
            ON report_cache (exploration_id, simulation_id, cta_type)
            WHERE simulation_id IS NOT NULL
        """))


async def migrate_source_document_file_storage():
    async with async_engine.begin() as conn:
        await conn.execute(text("""
            ALTER TABLE sync_source.document
            ADD COLUMN IF NOT EXISTS file_data BYTEA;
        """))

        await conn.execute(text("""
            ALTER TABLE sync_source.document
            ADD COLUMN IF NOT EXISTS file_name VARCHAR;
        """))


async def migrate_source_content_json():
    """
    Ensure content_json/data_type columns + supporting indexes exist on
    content_chunk, and metadata JSONB column exists on document.
    Idempotent — all operations use IF NOT EXISTS.
    """
    async with async_engine.begin() as conn:
        await conn.execute(text("""
            ALTER TABLE sync_source.content_chunk
            ADD COLUMN IF NOT EXISTS content_json JSONB;
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_source_chunk_content_json
            ON sync_source.content_chunk
            USING GIN (content_json);
        """))
        await conn.execute(text("""
            ALTER TABLE sync_source.content_chunk
            ADD COLUMN IF NOT EXISTS data_type VARCHAR;
        """))
        await conn.execute(text("""
            UPDATE sync_source.content_chunk AS c
            SET data_type = CASE
                WHEN c.content_json IS NOT NULL OR d.source_type IN ('csv', 'xlsx', 'xls') THEN 'tabular'
                WHEN d.source_type = 'url' THEN 'scraped'
                ELSE 'document'
            END
            FROM sync_source.document AS d
            WHERE d.id = c.document_id
              AND (c.data_type IS NULL OR BTRIM(c.data_type) = '');
        """))
        await conn.execute(text("""
            ALTER TABLE sync_source.content_chunk
            ALTER COLUMN data_type SET DEFAULT 'document';
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_source_chunk_data_type
            ON sync_source.content_chunk (data_type);
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sync_source_chunk_doc_type_order
            ON sync_source.content_chunk (document_id, data_type, chunk_index, created_at);
        """))
        await conn.execute(text("""
            ALTER TABLE sync_source.document
            ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
        """))