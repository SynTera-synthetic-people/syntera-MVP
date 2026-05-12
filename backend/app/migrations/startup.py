"""Deterministic startup-time migrations.

This module keeps the current non-Alembic approach, but makes the execution
order explicit and domain-owned. SQLModel creates missing base tables first;
these migrations then repair older or partially migrated schemas.
"""

from __future__ import annotations

import logging
import time
from contextvars import ContextVar
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlmodel import SQLModel

from app.db import async_engine
from app.models import register_all_models


logger = logging.getLogger(__name__)

# Stable app-level lock id. It only needs to be unique within this database.
_STARTUP_MIGRATION_LOCK_ID = 914_202_605_110
_STEP_ROWS_AFFECTED: ContextVar[int | None] = ContextVar(
    "_STEP_ROWS_AFFECTED",
    default=None,
)


async def run_startup_migrations() -> None:
    """Run all startup schema migrations under a PostgreSQL advisory lock."""
    started = time.perf_counter()
    total_steps = len(_MIGRATION_STEPS)
    logger.info("Startup migrations: waiting for advisory lock")
    async with async_engine.connect() as lock_conn:
        await lock_conn.execute(
            text("SELECT pg_advisory_lock(:lock_id)"),
            {"lock_id": _STARTUP_MIGRATION_LOCK_ID},
        )
        logger.info("Startup migrations: advisory lock acquired")
        completed_steps = 0
        try:
            async with async_engine.begin() as conn:
                for index, (phase, name, step) in enumerate(_MIGRATION_STEPS, start=1):
                    await _run_step(conn, index, total_steps, phase, name, step)
                    completed_steps = index
        finally:
            await lock_conn.execute(
                text("SELECT pg_advisory_unlock(:lock_id)"),
                {"lock_id": _STARTUP_MIGRATION_LOCK_ID},
            )
            logger.info("Startup migrations: advisory lock released")
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            status = "completed" if completed_steps == total_steps else "failed"
            logger.info(
                "Startup migrations %s: %s/%s steps in %sms",
                status,
                completed_steps,
                total_steps,
                elapsed_ms,
                extra={
                    "completed_steps": completed_steps,
                    "total_steps": total_steps,
                    "elapsed_ms": elapsed_ms,
                    "success": completed_steps == total_steps,
                },
            )


MigrationStep = Callable[[AsyncConnection], Awaitable[None]]


async def _run_step(
    conn: AsyncConnection,
    index: int,
    total: int,
    phase: str,
    name: str,
    step: MigrationStep,
) -> None:
    started = time.perf_counter()
    token = _STEP_ROWS_AFFECTED.set(0)
    logger.info(
        "[%s/%s] %s started (phase=%s)",
        index,
        total,
        name,
        phase,
        extra={"phase": phase, "step": name, "step_index": index, "total_steps": total},
    )
    try:
        await step(conn)
    except Exception as exc:
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        logger.exception(
            "[%s/%s] %s failed after %sms (phase=%s): %s",
            index,
            total,
            name,
            elapsed_ms,
            phase,
            exc,
            extra={
                "phase": phase,
                "step": name,
                "step_index": index,
                "total_steps": total,
                "elapsed_ms": elapsed_ms,
                "success": False,
            },
        )
        raise
    finally:
        rows_affected = _STEP_ROWS_AFFECTED.get()
        _STEP_ROWS_AFFECTED.reset(token)

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    rows_suffix = (
        f"; rows affected={rows_affected}"
        if rows_affected is not None and rows_affected > 0
        else ""
    )
    logger.info(
        "[%s/%s] %s completed in %sms (phase=%s%s)",
        index,
        total,
        name,
        elapsed_ms,
        phase,
        rows_suffix,
        extra={
            "phase": phase,
            "step": name,
            "step_index": index,
            "total_steps": total,
            "elapsed_ms": elapsed_ms,
            "success": True,
            "rows_affected": rows_affected,
        },
    )


async def _exec(conn: AsyncConnection, sql: str, params: dict[str, Any] | None = None):
    result = await conn.execute(text(sql), params or {})
    if _tracks_rows_affected(sql) and result.rowcount is not None and result.rowcount > 0:
        current_rows = _STEP_ROWS_AFFECTED.get()
        if current_rows is not None:
            _STEP_ROWS_AFFECTED.set(current_rows + result.rowcount)
    return result


def _tracks_rows_affected(sql: str) -> bool:
    statement = sql.lstrip().upper()
    return statement.startswith(("UPDATE", "DELETE", "INSERT", "WITH"))


async def ensure_schema(conn: AsyncConnection, schema: str) -> None:
    await _exec(conn, f"CREATE SCHEMA IF NOT EXISTS {schema}")


async def ensure_table(conn: AsyncConnection, ddl: str) -> None:
    await _exec(conn, ddl)


async def ensure_column(conn: AsyncConnection, table: str, column_definition: str) -> None:
    await _exec(conn, f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column_definition}")


async def ensure_index(conn: AsyncConnection, ddl: str) -> None:
    await _exec(conn, ddl)


async def constraint_exists(conn: AsyncConnection, schema: str, table: str, name: str) -> bool:
    result = await _exec(
        conn,
        """
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = :schema
          AND table_name = :table
          AND constraint_name = :name
        LIMIT 1
        """,
        {"schema": schema, "table": table, "name": name},
    )
    return result.scalar_one_or_none() is not None


async def _foreign_key_exists(
    conn: AsyncConnection,
    schema: str,
    table: str,
    column: str,
    referenced_schema: str,
    referenced_table: str,
    referenced_column: str,
) -> bool:
    result = await _exec(
        conn,
        """
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.constraint_schema = kcu.constraint_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.constraint_schema = tc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = :schema
          AND tc.table_name = :table
          AND kcu.column_name = :column
          AND ccu.table_schema = :referenced_schema
          AND ccu.table_name = :referenced_table
          AND ccu.column_name = :referenced_column
        LIMIT 1
        """,
        {
            "schema": schema,
            "table": table,
            "column": column,
            "referenced_schema": referenced_schema,
            "referenced_table": referenced_table,
            "referenced_column": referenced_column,
        },
    )
    return result.scalar_one_or_none() is not None


async def ensure_foreign_key(
    conn: AsyncConnection,
    *,
    table_sql: str,
    schema: str,
    table: str,
    column: str,
    referenced_schema: str = "public",
    referenced_table: str,
    referenced_column: str = "id",
    constraint_name: str,
    on_delete: str | None = None,
) -> None:
    if await _foreign_key_exists(
        conn,
        schema,
        table,
        column,
        referenced_schema,
        referenced_table,
        referenced_column,
    ):
        return
    delete_clause = f" ON DELETE {on_delete}" if on_delete else ""
    referenced_table_sql = f'"{referenced_table}"' if referenced_table == "user" else referenced_table
    await _exec(
        conn,
        f"""
        ALTER TABLE {table_sql}
        ADD CONSTRAINT {constraint_name}
        FOREIGN KEY ({column})
        REFERENCES {referenced_schema}.{referenced_table_sql}({referenced_column})
        {delete_clause}
        NOT VALID
        """,
    )


async def ensure_unique_index_after_dedupe(
    conn: AsyncConnection,
    *,
    table: str,
    partition_by: str,
    order_by: str,
    index_sql: str,
    label: str,
    where: str | None = None,
) -> None:
    where_clause = f"WHERE {where}" if where else ""
    result = await _exec(
        conn,
        f"""
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY {partition_by}
                       ORDER BY {order_by}
                   ) AS rn
            FROM {table}
            {where_clause}
        )
        DELETE FROM {table} t
        USING ranked
        WHERE t.id = ranked.id
          AND ranked.rn > 1
        """,
    )
    deleted = result.rowcount if result.rowcount is not None else -1
    if deleted and deleted > 0:
        logger.warning(
            "Startup migration removed duplicate rows before unique index",
            extra={"label": label, "deleted_rows": deleted},
        )
    await ensure_index(conn, index_sql)


async def _create_sqlmodel_tables(conn: AsyncConnection) -> None:
    register_all_models()
    await conn.run_sync(SQLModel.metadata.create_all)


async def _repair_core_public_schema(conn: AsyncConnection) -> None:
    # User/account/profile columns used by auth, billing, admin and settings.
    for column in (
        "first_name VARCHAR NOT NULL DEFAULT ''",
        "last_name VARCHAR NOT NULL DEFAULT ''",
        "full_name VARCHAR NOT NULL DEFAULT ''",
        "user_type VARCHAR NOT NULL DEFAULT 'Student'",
        "role VARCHAR NOT NULL DEFAULT 'user'",
        "is_verified BOOLEAN NOT NULL DEFAULT FALSE",
        "verification_token VARCHAR",
        "verification_expiry TIMESTAMP WITHOUT TIME ZONE",
        "reset_token VARCHAR",
        "reset_token_expiry TIMESTAMP WITHOUT TIME ZONE",
        "is_active BOOLEAN NOT NULL DEFAULT TRUE",
        "is_trial BOOLEAN NOT NULL DEFAULT TRUE",
        "exploration_count INTEGER NOT NULL DEFAULT 0",
        "trial_exploration_limit INTEGER NOT NULL DEFAULT 1",
        "must_change_password BOOLEAN NOT NULL DEFAULT FALSE",
        "account_tier VARCHAR NOT NULL DEFAULT 'free'",
        "organization_id VARCHAR",
        "phone VARCHAR",
        "avatar_url VARCHAR",
        "trial_expires_at TIMESTAMP WITHOUT TIME ZONE",
        "is_deleted BOOLEAN NOT NULL DEFAULT FALSE",
        "deleted_at TIMESTAMP WITHOUT TIME ZONE",
        "deleted_by VARCHAR",
        "created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()",
        "last_activity_at TIMESTAMP WITHOUT TIME ZONE",
    ):
        await ensure_column(conn, '"user"', column)
    await ensure_index(conn, 'CREATE INDEX IF NOT EXISTS ix_user_email ON "user" (email)')
    await ensure_index(conn, 'CREATE INDEX IF NOT EXISTS ix_user_organization_id ON "user" (organization_id)')
    await ensure_index(conn, 'CREATE INDEX IF NOT EXISTS ix_user_is_deleted ON "user" (is_deleted)')
    await ensure_foreign_key(
        conn,
        table_sql='"user"',
        schema="public",
        table="user",
        column="organization_id",
        referenced_table="organization",
        constraint_name="fk_user_organization_id",
        on_delete="SET NULL",
    )
    await ensure_foreign_key(
        conn,
        table_sql='"user"',
        schema="public",
        table="user",
        column="deleted_by",
        referenced_table="user",
        constraint_name="fk_user_deleted_by",
        on_delete="SET NULL",
    )

    # Organization and workspace ownership.
    for column in (
        "account_tier VARCHAR NOT NULL DEFAULT 'standard'",
        "exploration_limit INTEGER NOT NULL DEFAULT 0",
        "exploration_count INTEGER NOT NULL DEFAULT 0",
        "description TEXT",
        "logo_url VARCHAR",
        "domain VARCHAR",
        "industry VARCHAR",
        "website VARCHAR",
    ):
        await ensure_column(conn, "organization", column)
    for column in (
        "department_name VARCHAR",
        "is_hidden BOOLEAN NOT NULL DEFAULT FALSE",
        "is_default_personal BOOLEAN NOT NULL DEFAULT FALSE",
    ):
        await ensure_column(conn, "workspace", column)
    await ensure_index(
        conn,
        "CREATE INDEX IF NOT EXISTS ix_workspace_is_default_personal ON workspace (is_default_personal)",
    )

    # Exploration lifecycle, deletion and Omi clarification tracking.
    for column in (
        "audience_type VARCHAR NOT NULL DEFAULT 'B2C'",
        "clarification_attempts INTEGER NOT NULL DEFAULT 0",
        "is_quantitative BOOLEAN NOT NULL DEFAULT FALSE",
        "is_qualitative BOOLEAN NOT NULL DEFAULT FALSE",
        "updated_at TIMESTAMP WITHOUT TIME ZONE",
        "is_end BOOLEAN NOT NULL DEFAULT FALSE",
        "is_deleted BOOLEAN NOT NULL DEFAULT FALSE",
        "deleted_at TIMESTAMP WITHOUT TIME ZONE",
        "deleted_by VARCHAR",
        "updated_by VARCHAR",
    ):
        await ensure_column(conn, "explorations", column)
    await ensure_index(conn, "CREATE INDEX IF NOT EXISTS ix_explorations_is_deleted ON explorations (is_deleted)")
    await ensure_foreign_key(
        conn,
        table_sql="explorations",
        schema="public",
        table="explorations",
        column="deleted_by",
        referenced_table="user",
        constraint_name="fk_explorations_deleted_by",
        on_delete="SET NULL",
    )
    await ensure_foreign_key(
        conn,
        table_sql="explorations",
        schema="public",
        table="explorations",
        column="updated_by",
        referenced_table="user",
        constraint_name="fk_explorations_updated_by",
        on_delete="SET NULL",
    )

    await ensure_column(conn, "interviewsection", "description TEXT NOT NULL DEFAULT ''")
    await ensure_column(conn, "interviewsection", "is_download BOOLEAN NOT NULL DEFAULT FALSE")

    for column in (
        "persona_sample_sizes JSONB",
        "total_sample_size INTEGER NOT NULL DEFAULT 0",
        "simulation_source_id VARCHAR",
        "normalized_results JSONB",
        "narrative JSONB",
        "is_download BOOLEAN NOT NULL DEFAULT FALSE",
        "simulation_result JSONB NOT NULL DEFAULT '{}'::jsonb",
    ):
        await ensure_column(conn, "surveysimulation", column)

    await _repair_questionnaire_schema(conn)
    await _repair_persona_schema(conn)
    await _repair_research_objectives_schema(conn)
    await _repair_omi_schema(conn)
    await _repair_rebuttal_schema(conn)
    await _repair_traceability_schema(conn)


async def _repair_questionnaire_schema(conn: AsyncConnection) -> None:
    for column in (
        "simulation_id VARCHAR",
        "parent_section_id VARCHAR",
        "order_index INTEGER NOT NULL DEFAULT 0",
        "metadata JSONB NOT NULL DEFAULT '{}'::jsonb",
    ):
        await ensure_column(conn, "questionnairesection", column)
    for column in (
        "question_key VARCHAR",
        "question_type VARCHAR NOT NULL DEFAULT 'single_select'",
        "options JSONB NOT NULL DEFAULT '[]'::jsonb",
        "config JSONB NOT NULL DEFAULT '{}'::jsonb",
        "order_index INTEGER NOT NULL DEFAULT 0",
    ):
        await ensure_column(conn, "questionnairequestion", column)
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS questionnairequestionasset (
            id VARCHAR PRIMARY KEY,
            question_id VARCHAR NOT NULL,
            workspace_id VARCHAR NOT NULL,
            exploration_id VARCHAR NOT NULL,
            filename VARCHAR NOT NULL,
            original_name VARCHAR NOT NULL,
            content_type VARCHAR,
            size INTEGER,
            asset_type VARCHAR NOT NULL DEFAULT 'file',
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            uploaded_by VARCHAR NOT NULL,
            uploaded_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        )
        """,
    )
    for column in (
        "asset_type VARCHAR NOT NULL DEFAULT 'file'",
        "metadata JSONB NOT NULL DEFAULT '{}'::jsonb",
    ):
        await ensure_column(conn, "questionnairequestionasset", column)
    for index_sql in (
        "CREATE INDEX IF NOT EXISTS ix_questionnairesection_parent_section_id ON questionnairesection (parent_section_id)",
        "CREATE INDEX IF NOT EXISTS ix_questionnairesection_order_index ON questionnairesection (order_index)",
        "CREATE INDEX IF NOT EXISTS ix_questionnairequestion_question_key ON questionnairequestion (question_key)",
        "CREATE INDEX IF NOT EXISTS ix_questionnairequestion_question_type ON questionnairequestion (question_type)",
        "CREATE INDEX IF NOT EXISTS ix_questionnairequestion_order_index ON questionnairequestion (order_index)",
        "CREATE INDEX IF NOT EXISTS ix_questionnairequestionasset_question_id ON questionnairequestionasset (question_id)",
        "CREATE INDEX IF NOT EXISTS ix_questionnairequestionasset_workspace_id ON questionnairequestionasset (workspace_id)",
        "CREATE INDEX IF NOT EXISTS ix_questionnairequestionasset_exploration_id ON questionnairequestionasset (exploration_id)",
        "CREATE INDEX IF NOT EXISTS ix_questionnairequestionasset_asset_type ON questionnairequestionasset (asset_type)",
    ):
        await ensure_index(conn, index_sql)


async def _repair_persona_schema(conn: AsyncConnection) -> None:
    for column in (
        "backstory TEXT",
        "ocean_profile JSONB",
        "persona_details JSONB NOT NULL DEFAULT '{}'::jsonb",
        "auto_generated_persona BOOLEAN NOT NULL DEFAULT FALSE",
        "calibration_confidence INTEGER",
        "parent_persona_id VARCHAR",
        "calibration_status VARCHAR",
    ):
        await ensure_column(conn, "persona", column)
    await _exec(
        conn,
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'persona'
                  AND column_name = 'interests'
                  AND data_type <> 'jsonb'
            ) THEN
                ALTER TABLE persona
                ALTER COLUMN interests TYPE JSONB
                USING to_jsonb(interests);
            END IF;
        END $$;
        """,
    )


async def _repair_research_objectives_schema(conn: AsyncConnection) -> None:
    for column in (
        "validation_status VARCHAR NOT NULL DEFAULT 'pending'",
        "ai_interpretation JSONB NOT NULL DEFAULT '{}'::jsonb",
        "confidence_level INTEGER NOT NULL DEFAULT 0",
    ):
        await ensure_column(conn, "research_objectives", column)


async def _repair_omi_schema(conn: AsyncConnection) -> None:
    for column in (
        "workspace_id VARCHAR",
        "current_stage VARCHAR NOT NULL DEFAULT 'RESEARCH_OBJECTIVES'",
        "current_state VARCHAR NOT NULL DEFAULT 'IDLE'",
        "context JSONB NOT NULL DEFAULT '{}'::jsonb",
        "conversation_history JSONB NOT NULL DEFAULT '[]'::jsonb",
        "completed_stages JSONB NOT NULL DEFAULT '[]'::jsonb",
        "updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()",
        "last_interaction TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()",
    ):
        await ensure_column(conn, "omisession", column)
    for column in (
        "workflow_stage VARCHAR",
        "omi_state VARCHAR",
    ):
        await ensure_column(conn, "omimessage", column)
    for column in (
        "progress_percentage INTEGER",
        "completed_at TIMESTAMP WITHOUT TIME ZONE",
        "result JSONB",
    ):
        await ensure_column(conn, "omiworkflowaction", column)


async def _repair_rebuttal_schema(conn: AsyncConnection) -> None:
    for column in (
        "simulation_id VARCHAR",
        "starter_message TEXT",
        "messages JSONB NOT NULL DEFAULT '[]'::jsonb",
        "user_message TEXT",
        "llm_response TEXT",
        "llm_metadata JSONB",
        "responded_at TIMESTAMP WITHOUT TIME ZONE",
    ):
        await ensure_column(conn, "rebuttalsession", column)


async def _repair_traceability_schema(conn: AsyncConnection) -> None:
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS traceability_report (
            id VARCHAR PRIMARY KEY,
            exploration_id VARCHAR NOT NULL,
            ro_traceability JSONB NOT NULL DEFAULT '{}'::jsonb,
            persona_traceability JSONB NOT NULL DEFAULT '{}'::jsonb,
            quant_traceability JSONB NOT NULL DEFAULT '{}'::jsonb,
            qual_traceability JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        )
        """,
    )
    await ensure_unique_index_after_dedupe(
        conn,
        table="traceability_report",
        partition_by="exploration_id",
        order_by="updated_at DESC NULLS LAST, id DESC",
        index_sql="CREATE UNIQUE INDEX IF NOT EXISTS ix_traceability_report_exploration_id ON traceability_report (exploration_id)",
        label="traceability_report(exploration_id)",
    )


async def _run_core_backfills(conn: AsyncConnection) -> None:
    await _exec(
        conn,
        """
        UPDATE "user"
        SET
            first_name = COALESCE(NULLIF(first_name, ''), TRIM(SPLIT_PART(full_name, ' ', 1))),
            last_name = COALESCE(
                NULLIF(last_name, ''),
                TRIM(
                    CASE
                        WHEN POSITION(' ' IN full_name) > 0
                        THEN SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)
                        ELSE ''
                    END
                )
            )
        WHERE COALESCE(first_name, '') = ''
           OR COALESCE(last_name, '') = ''
        """,
    )
    await _exec(
        conn,
        """
        UPDATE explorations
        SET audience_type = 'B2C'
        WHERE audience_type IS NULL OR TRIM(audience_type) = ''
        """,
    )
    await _exec(
        conn,
        """
        UPDATE questionnairequestion
        SET question_key = id
        WHERE question_key IS NULL OR TRIM(question_key) = ''
        """,
    )


async def _repair_syncdb_schema(conn: AsyncConnection) -> None:
    for schema in ("sync_action", "sync_survey", "sync_source"):
        await ensure_schema(conn, schema)

    await _repair_sync_action_schema(conn)
    await _repair_sync_survey_schema(conn)
    await _repair_sync_source_schema(conn)


async def _repair_sync_action_schema(conn: AsyncConnection) -> None:
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS sync_action.dataset (
            id VARCHAR PRIMARY KEY,
            source_file VARCHAR,
            row_count INTEGER NOT NULL DEFAULT 0,
            columns JSONB NOT NULL DEFAULT '[]'::jsonb,
            exploration_id VARCHAR,
            uploaded_by VARCHAR,
            uploaded_at TIMESTAMP NOT NULL DEFAULT now(),
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        )
        """,
    )
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS sync_action.record (
            id VARCHAR PRIMARY KEY,
            dataset_id VARCHAR NOT NULL REFERENCES sync_action.dataset(id) ON DELETE CASCADE,
            row_index INTEGER NOT NULL,
            data JSONB NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT now()
        )
        """,
    )
    for column in (
        "row_count INTEGER NOT NULL DEFAULT 0",
        "columns JSONB NOT NULL DEFAULT '[]'::jsonb",
        "exploration_id VARCHAR",
        "uploaded_by VARCHAR",
        "uploaded_at TIMESTAMP NOT NULL DEFAULT now()",
        "metadata JSONB NOT NULL DEFAULT '{}'::jsonb",
    ):
        await ensure_column(conn, "sync_action.dataset", column)
    for column in (
        "status VARCHAR NOT NULL DEFAULT 'pending'",
        "workspace_id VARCHAR",
        "region VARCHAR",
        "year INTEGER",
        "source_format VARCHAR",
        "subject_key VARCHAR",
    ):
        await ensure_column(conn, "sync_action.record", column)
    for index_sql in (
        "CREATE INDEX IF NOT EXISTS idx_sync_action_record_dataset ON sync_action.record (dataset_id)",
        "CREATE INDEX IF NOT EXISTS idx_sync_action_record_data ON sync_action.record USING GIN (data)",
        "CREATE INDEX IF NOT EXISTS idx_sync_action_record_status ON sync_action.record (status)",
        "CREATE INDEX IF NOT EXISTS idx_sync_action_record_workspace ON sync_action.record (workspace_id)",
    ):
        await ensure_index(conn, index_sql)


async def _repair_sync_survey_schema(conn: AsyncConnection) -> None:
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS sync_survey.dataset (
            id VARCHAR PRIMARY KEY,
            source_file VARCHAR,
            respondent_count INTEGER NOT NULL DEFAULT 0,
            question_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
            exploration_id VARCHAR,
            uploaded_by VARCHAR,
            uploaded_at TIMESTAMP NOT NULL DEFAULT now(),
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        )
        """,
    )
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS sync_survey.response (
            id VARCHAR PRIMARY KEY,
            dataset_id VARCHAR NOT NULL REFERENCES sync_survey.dataset(id) ON DELETE CASCADE,
            respondent_id VARCHAR,
            answers JSONB NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT now()
        )
        """,
    )
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS sync_survey.aggregation (
            id VARCHAR PRIMARY KEY,
            dataset_id VARCHAR NOT NULL UNIQUE REFERENCES sync_survey.dataset(id) ON DELETE CASCADE,
            results JSONB NOT NULL,
            computed_at TIMESTAMP NOT NULL DEFAULT now()
        )
        """,
    )
    for column in (
        "respondent_count INTEGER NOT NULL DEFAULT 0",
        "question_schema JSONB NOT NULL DEFAULT '[]'::jsonb",
        "exploration_id VARCHAR",
        "uploaded_by VARCHAR",
        "uploaded_at TIMESTAMP NOT NULL DEFAULT now()",
        "metadata JSONB NOT NULL DEFAULT '{}'::jsonb",
    ):
        await ensure_column(conn, "sync_survey.dataset", column)
    for column in (
        "status VARCHAR NOT NULL DEFAULT 'pending'",
        "workspace_id VARCHAR",
        "region VARCHAR",
        "year INTEGER",
        "source_format VARCHAR",
        "subject_key VARCHAR",
    ):
        await ensure_column(conn, "sync_survey.response", column)
    for index_sql in (
        "CREATE INDEX IF NOT EXISTS idx_sync_survey_response_dataset ON sync_survey.response (dataset_id)",
        "CREATE INDEX IF NOT EXISTS idx_sync_survey_response_status ON sync_survey.response (status)",
        "CREATE INDEX IF NOT EXISTS idx_sync_survey_response_workspace ON sync_survey.response (workspace_id)",
    ):
        await ensure_index(conn, index_sql)
    await ensure_unique_index_after_dedupe(
        conn,
        table="sync_survey.aggregation",
        partition_by="dataset_id",
        order_by="computed_at DESC NULLS LAST, id DESC",
        index_sql="CREATE UNIQUE INDEX IF NOT EXISTS ux_sync_survey_aggregation_dataset_id ON sync_survey.aggregation (dataset_id)",
        label="sync_survey.aggregation(dataset_id)",
    )


async def _repair_sync_source_schema(conn: AsyncConnection) -> None:
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS sync_source.document (
            id VARCHAR PRIMARY KEY,
            title VARCHAR NOT NULL,
            source_type VARCHAR NOT NULL,
            source_url VARCHAR,
            file_data BYTEA,
            file_name VARCHAR,
            domain VARCHAR,
            file_path VARCHAR,
            is_processed BOOLEAN NOT NULL DEFAULT FALSE,
            exploration_id VARCHAR,
            uploaded_by VARCHAR,
            uploaded_at TIMESTAMP NOT NULL DEFAULT now(),
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb
        )
        """,
    )
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS sync_source.content_chunk (
            id VARCHAR PRIMARY KEY,
            document_id VARCHAR NOT NULL REFERENCES sync_source.document(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            content_json JSONB,
            data_type VARCHAR NOT NULL DEFAULT 'document',
            created_at TIMESTAMP NOT NULL DEFAULT now()
        )
        """,
    )
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS sync_source.scrape_url (
            id VARCHAR PRIMARY KEY,
            source_document_id VARCHAR REFERENCES sync_source.document(id) ON DELETE CASCADE,
            source_document_key VARCHAR NOT NULL DEFAULT '',
            exploration_id VARCHAR,
            url TEXT NOT NULL,
            domain VARCHAR,
            status VARCHAR NOT NULL DEFAULT 'pending',
            failure_reason TEXT,
            failure_category VARCHAR,
            retryable BOOLEAN NOT NULL DEFAULT TRUE,
            retry_count INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 3,
            http_status INTEGER,
            method_used VARCHAR,
            content_chars INTEGER NOT NULL DEFAULT 0,
            first_seen_at TIMESTAMP NOT NULL DEFAULT now(),
            last_attempt_at TIMESTAMP,
            next_retry_at TIMESTAMP,
            scraped_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
        """,
    )
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS sync_source.scrape_url_attempt (
            id VARCHAR PRIMARY KEY,
            scrape_url_id VARCHAR NOT NULL REFERENCES sync_source.scrape_url(id) ON DELETE CASCADE,
            attempt_no INTEGER NOT NULL,
            status VARCHAR NOT NULL,
            method_used VARCHAR,
            http_status INTEGER,
            failure_reason TEXT,
            failure_category VARCHAR,
            retryable BOOLEAN NOT NULL DEFAULT TRUE,
            content_chars INTEGER NOT NULL DEFAULT 0,
            started_at TIMESTAMP NOT NULL DEFAULT now(),
            finished_at TIMESTAMP NOT NULL DEFAULT now(),
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            UNIQUE (scrape_url_id, attempt_no)
        )
        """,
    )

    for column in (
        "file_data BYTEA",
        "file_name VARCHAR",
        "file_path VARCHAR",
        "domain VARCHAR",
        "is_processed BOOLEAN NOT NULL DEFAULT FALSE",
        "exploration_id VARCHAR",
        "uploaded_by VARCHAR",
        "uploaded_at TIMESTAMP NOT NULL DEFAULT now()",
        "metadata JSONB NOT NULL DEFAULT '{}'::jsonb",
    ):
        await ensure_column(conn, "sync_source.document", column)
    for column in (
        "content_json JSONB",
        "data_type VARCHAR NOT NULL DEFAULT 'document'",
        "created_at TIMESTAMP NOT NULL DEFAULT now()",
    ):
        await ensure_column(conn, "sync_source.content_chunk", column)
    for column in (
        "source_document_key VARCHAR NOT NULL DEFAULT ''",
        "failure_category VARCHAR",
        "retryable BOOLEAN NOT NULL DEFAULT TRUE",
        "retry_count INTEGER NOT NULL DEFAULT 0",
        "max_retries INTEGER NOT NULL DEFAULT 3",
        "http_status INTEGER",
        "method_used VARCHAR",
        "content_chars INTEGER NOT NULL DEFAULT 0",
        "first_seen_at TIMESTAMP NOT NULL DEFAULT now()",
        "last_attempt_at TIMESTAMP",
        "next_retry_at TIMESTAMP",
        "scraped_at TIMESTAMP",
        "created_at TIMESTAMP NOT NULL DEFAULT now()",
        "updated_at TIMESTAMP NOT NULL DEFAULT now()",
    ):
        await ensure_column(conn, "sync_source.scrape_url", column)
    for column in (
        "failure_category VARCHAR",
        "retryable BOOLEAN NOT NULL DEFAULT TRUE",
        "content_chars INTEGER NOT NULL DEFAULT 0",
        "metadata JSONB NOT NULL DEFAULT '{}'::jsonb",
    ):
        await ensure_column(conn, "sync_source.scrape_url_attempt", column)

    for index_sql in (
        "CREATE INDEX IF NOT EXISTS idx_sync_source_chunk_document ON sync_source.content_chunk (document_id)",
        "CREATE INDEX IF NOT EXISTS idx_sync_source_chunk_data_type ON sync_source.content_chunk (data_type)",
        "CREATE INDEX IF NOT EXISTS idx_sync_source_chunk_fts ON sync_source.content_chunk USING GIN (to_tsvector('simple', COALESCE(content, '')))",
        "CREATE INDEX IF NOT EXISTS idx_sync_source_chunk_content_json ON sync_source.content_chunk USING GIN (content_json)",
        "CREATE INDEX IF NOT EXISTS idx_sync_source_chunk_doc_type_order ON sync_source.content_chunk (document_id, data_type, chunk_index, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_sync_source_scrape_url_retry ON sync_source.scrape_url (next_retry_at, retry_count) WHERE retryable = TRUE AND status IN ('failed', 'low_quality') AND retry_count < max_retries",
        "CREATE INDEX IF NOT EXISTS idx_sync_source_scrape_url_status ON sync_source.scrape_url (status)",
        "CREATE INDEX IF NOT EXISTS idx_sync_source_scrape_url_domain ON sync_source.scrape_url (domain)",
        "CREATE INDEX IF NOT EXISTS idx_sync_source_scrape_attempt_url ON sync_source.scrape_url_attempt (scrape_url_id)",
    ):
        await ensure_index(conn, index_sql)


async def _run_syncdb_backfills(conn: AsyncConnection) -> None:
    await _exec(
        conn,
        """
        UPDATE sync_source.content_chunk AS c
        SET data_type = CASE
            WHEN c.content_json IS NOT NULL
              OR d.source_type IN ('csv', 'xlsx', 'xls') THEN 'tabular'
            WHEN d.source_type = 'url' THEN 'scraped'
            ELSE 'document'
        END
        FROM sync_source.document AS d
        WHERE d.id = c.document_id
          AND (c.data_type IS NULL OR BTRIM(c.data_type) = '')
        """,
    )
    await _exec(
        conn,
        """
        ALTER TABLE sync_source.content_chunk
        ALTER COLUMN data_type SET DEFAULT 'document'
        """,
    )
    await _exec(
        conn,
        """
        UPDATE sync_source.scrape_url
        SET source_document_key = COALESCE(source_document_id, '')
        WHERE source_document_key IS NULL OR source_document_key = ''
        """,
    )
    await ensure_unique_index_after_dedupe(
        conn,
        table="sync_source.scrape_url",
        partition_by="source_document_key, url",
        order_by="updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC",
        index_sql="CREATE UNIQUE INDEX IF NOT EXISTS ux_sync_source_scrape_url_doc_url ON sync_source.scrape_url (source_document_key, url)",
        label="sync_source.scrape_url(source_document_key,url)",
    )


async def _repair_report_cache_schema(conn: AsyncConnection) -> None:
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS report_cache (
            id VARCHAR PRIMARY KEY,
            exploration_id VARCHAR NOT NULL,
            simulation_id VARCHAR,
            report_type VARCHAR NOT NULL DEFAULT 'qual',
            cta_type VARCHAR NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'done',
            pdf_path VARCHAR,
            content_md TEXT,
            error_message TEXT,
            created_at TIMESTAMP DEFAULT now(),
            expires_at TIMESTAMP
        )
        """,
    )
    for column in (
        "report_type VARCHAR NOT NULL DEFAULT 'qual'",
        "cta_type VARCHAR NOT NULL DEFAULT ''",
        "status VARCHAR NOT NULL DEFAULT 'done'",
        "pdf_path VARCHAR",
        "content_md TEXT",
        "error_message TEXT",
        "created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()",
        "expires_at TIMESTAMP WITHOUT TIME ZONE",
    ):
        await ensure_column(conn, "report_cache", column)
    await ensure_index(
        conn,
        "CREATE INDEX IF NOT EXISTS idx_report_cache_lookup ON report_cache (exploration_id, simulation_id, cta_type)",
    )
    await ensure_unique_index_after_dedupe(
        conn,
        table="report_cache",
        partition_by="exploration_id, cta_type",
        order_by="created_at DESC NULLS LAST, id DESC",
        where="simulation_id IS NULL",
        index_sql="CREATE UNIQUE INDEX IF NOT EXISTS uq_report_cache_qual ON report_cache (exploration_id, cta_type) WHERE simulation_id IS NULL",
        label="report_cache qualitative cache",
    )
    await ensure_unique_index_after_dedupe(
        conn,
        table="report_cache",
        partition_by="exploration_id, simulation_id, cta_type",
        order_by="created_at DESC NULLS LAST, id DESC",
        where="simulation_id IS NOT NULL",
        index_sql="CREATE UNIQUE INDEX IF NOT EXISTS uq_report_cache_quant ON report_cache (exploration_id, simulation_id, cta_type) WHERE simulation_id IS NOT NULL",
        label="report_cache quantitative cache",
    )


async def _repair_billing_schema(conn: AsyncConnection) -> None:
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS subscription_plan (
            id VARCHAR PRIMARY KEY,
            slug VARCHAR NOT NULL,
            name VARCHAR NOT NULL,
            description TEXT,
            features TEXT NOT NULL DEFAULT '{}',
            exploration_limit INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
        )
        """,
    )
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS user_subscription (
            id VARCHAR PRIMARY KEY,
            user_id VARCHAR NOT NULL,
            plan_id VARCHAR NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'active',
            started_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMP WITHOUT TIME ZONE,
            cancelled_at TIMESTAMP WITHOUT TIME ZONE,
            stripe_subscription_id VARCHAR,
            stripe_customer_id VARCHAR,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITHOUT TIME ZONE
        )
        """,
    )
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS billing_profile (
            id VARCHAR PRIMARY KEY,
            user_id VARCHAR NOT NULL,
            org_id VARCHAR,
            billing_name VARCHAR,
            billing_email VARCHAR,
            company_name VARCHAR,
            gst_number VARCHAR,
            address_line1 VARCHAR,
            address_line2 VARCHAR,
            city VARCHAR,
            state VARCHAR,
            country VARCHAR,
            postal_code VARCHAR,
            stripe_customer_id VARCHAR,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITHOUT TIME ZONE
        )
        """,
    )
    for column in (
        "description TEXT",
        "features TEXT NOT NULL DEFAULT '{}'",
        "exploration_limit INTEGER NOT NULL DEFAULT 0",
        "is_active BOOLEAN NOT NULL DEFAULT TRUE",
        "created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()",
    ):
        await ensure_column(conn, "subscription_plan", column)
    for column in (
        "status VARCHAR NOT NULL DEFAULT 'active'",
        "started_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()",
        "expires_at TIMESTAMP WITHOUT TIME ZONE",
        "cancelled_at TIMESTAMP WITHOUT TIME ZONE",
        "stripe_subscription_id VARCHAR",
        "stripe_customer_id VARCHAR",
        "created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()",
        "updated_at TIMESTAMP WITHOUT TIME ZONE",
    ):
        await ensure_column(conn, "user_subscription", column)
    for column in (
        "org_id VARCHAR",
        "billing_name VARCHAR",
        "billing_email VARCHAR",
        "company_name VARCHAR",
        "gst_number VARCHAR",
        "address_line1 VARCHAR",
        "address_line2 VARCHAR",
        "city VARCHAR",
        "state VARCHAR",
        "country VARCHAR",
        "postal_code VARCHAR",
        "stripe_customer_id VARCHAR",
        "created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()",
        "updated_at TIMESTAMP WITHOUT TIME ZONE",
    ):
        await ensure_column(conn, "billing_profile", column)
    await ensure_unique_index_after_dedupe(
        conn,
        table="subscription_plan",
        partition_by="slug",
        order_by="created_at DESC NULLS LAST, id DESC",
        index_sql="CREATE UNIQUE INDEX IF NOT EXISTS ix_subscription_plan_slug ON subscription_plan (slug)",
        label="subscription_plan(slug)",
    )
    for index_sql in (
        "CREATE INDEX IF NOT EXISTS ix_user_subscription_user_id ON user_subscription (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_user_subscription_plan_id ON user_subscription (plan_id)",
        "CREATE INDEX IF NOT EXISTS ix_user_subscription_status ON user_subscription (status)",
        "CREATE INDEX IF NOT EXISTS ix_billing_profile_org_id ON billing_profile (org_id)",
    ):
        await ensure_index(conn, index_sql)
    await ensure_unique_index_after_dedupe(
        conn,
        table="billing_profile",
        partition_by="user_id",
        order_by="updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC",
        index_sql="CREATE UNIQUE INDEX IF NOT EXISTS ux_billing_profile_user_id ON billing_profile (user_id)",
        label="billing_profile(user_id)",
    )
    await ensure_foreign_key(
        conn,
        table_sql="user_subscription",
        schema="public",
        table="user_subscription",
        column="user_id",
        referenced_table="user",
        constraint_name="fk_user_subscription_user_id",
        on_delete="CASCADE",
    )
    await ensure_foreign_key(
        conn,
        table_sql="user_subscription",
        schema="public",
        table="user_subscription",
        column="plan_id",
        referenced_table="subscription_plan",
        constraint_name="fk_user_subscription_plan_id",
    )
    await ensure_foreign_key(
        conn,
        table_sql="billing_profile",
        schema="public",
        table="billing_profile",
        column="user_id",
        referenced_table="user",
        constraint_name="fk_billing_profile_user_id",
        on_delete="CASCADE",
    )
    await ensure_foreign_key(
        conn,
        table_sql="billing_profile",
        schema="public",
        table="billing_profile",
        column="org_id",
        referenced_table="organization",
        constraint_name="fk_billing_profile_org_id",
        on_delete="SET NULL",
    )


async def _repair_settings_schema(conn: AsyncConnection) -> None:
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS user_settings (
            id VARCHAR PRIMARY KEY,
            user_id VARCHAR NOT NULL,
            notification_email BOOLEAN NOT NULL DEFAULT TRUE,
            notification_in_app BOOLEAN NOT NULL DEFAULT TRUE,
            notification_research_updates BOOLEAN NOT NULL DEFAULT TRUE,
            notification_billing_alerts BOOLEAN NOT NULL DEFAULT TRUE,
            notification_product_updates BOOLEAN NOT NULL DEFAULT TRUE,
            notification_security_alerts BOOLEAN NOT NULL DEFAULT TRUE,
            language VARCHAR NOT NULL DEFAULT 'en',
            theme VARCHAR NOT NULL DEFAULT 'system',
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITHOUT TIME ZONE
        )
        """,
    )
    await ensure_table(
        conn,
        """
        CREATE TABLE IF NOT EXISTS org_settings (
            id VARCHAR PRIMARY KEY,
            org_id VARCHAR NOT NULL,
            allowed_email_domains TEXT NOT NULL DEFAULT '[]',
            default_member_role VARCHAR NOT NULL DEFAULT 'user',
            enforce_sso BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITHOUT TIME ZONE
        )
        """,
    )
    for column in (
        "notification_email BOOLEAN NOT NULL DEFAULT TRUE",
        "notification_in_app BOOLEAN NOT NULL DEFAULT TRUE",
        "notification_research_updates BOOLEAN NOT NULL DEFAULT TRUE",
        "notification_billing_alerts BOOLEAN NOT NULL DEFAULT TRUE",
        "notification_product_updates BOOLEAN NOT NULL DEFAULT TRUE",
        "notification_security_alerts BOOLEAN NOT NULL DEFAULT TRUE",
        "language VARCHAR NOT NULL DEFAULT 'en'",
        "theme VARCHAR NOT NULL DEFAULT 'system'",
        "created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()",
        "updated_at TIMESTAMP WITHOUT TIME ZONE",
    ):
        await ensure_column(conn, "user_settings", column)
    for column in (
        "allowed_email_domains TEXT NOT NULL DEFAULT '[]'",
        "default_member_role VARCHAR NOT NULL DEFAULT 'user'",
        "enforce_sso BOOLEAN NOT NULL DEFAULT FALSE",
        "created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()",
        "updated_at TIMESTAMP WITHOUT TIME ZONE",
    ):
        await ensure_column(conn, "org_settings", column)
    await ensure_unique_index_after_dedupe(
        conn,
        table="user_settings",
        partition_by="user_id",
        order_by="updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC",
        index_sql="CREATE UNIQUE INDEX IF NOT EXISTS ux_user_settings_user_id ON user_settings (user_id)",
        label="user_settings(user_id)",
    )
    await ensure_unique_index_after_dedupe(
        conn,
        table="org_settings",
        partition_by="org_id",
        order_by="updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC",
        index_sql="CREATE UNIQUE INDEX IF NOT EXISTS ux_org_settings_org_id ON org_settings (org_id)",
        label="org_settings(org_id)",
    )
    await ensure_foreign_key(
        conn,
        table_sql="user_settings",
        schema="public",
        table="user_settings",
        column="user_id",
        referenced_table="user",
        constraint_name="fk_user_settings_user_id",
        on_delete="CASCADE",
    )
    await ensure_foreign_key(
        conn,
        table_sql="org_settings",
        schema="public",
        table="org_settings",
        column="org_id",
        referenced_table="organization",
        constraint_name="fk_org_settings_org_id",
        on_delete="CASCADE",
    )


_MIGRATION_STEPS: tuple[tuple[str, str, MigrationStep], ...] = (
    ("base", "create_sqlmodel_tables", _create_sqlmodel_tables),
    ("public", "repair_core_public_schema", _repair_core_public_schema),
    ("public", "run_core_backfills", _run_core_backfills),
    ("syncdb", "repair_syncdb_schema", _repair_syncdb_schema),
    ("syncdb", "run_syncdb_backfills", _run_syncdb_backfills),
    ("reports", "repair_report_cache_schema", _repair_report_cache_schema),
    ("billing", "repair_billing_schema", _repair_billing_schema),
    ("settings", "repair_settings_schema", _repair_settings_schema),
)
