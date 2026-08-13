"""Alembic environment for the Syntera backend.

Design notes — every one of these exists to prevent a specific failure:

1.  ``app.config`` is imported first so the AWS SSM parameter load in
    ``app.parameters`` runs before ``settings.DATABASE_URL`` is read. Migrations
    therefore resolve their connection exactly the way the application does; a
    Job and an app pod can never disagree about which database they are using.

2.  Migrations run on the **sync** psycopg2 driver, not asyncpg. Migrations do
    not need async, and the sync driver keeps the Alembic CLI free of
    event-loop handling. ``psycopg2-binary`` is already a dependency.

3.  ``include_schemas=True`` — without it Alembic does not reflect the
    ``sync_action`` / ``sync_survey`` / ``sync_source`` schemas at all.

4.  ``include_object`` refuses to autogenerate a DROP for anything that is not
    in ``SQLModel.metadata``. Several tables (all of ``sync_*``, plus
    ``public.audit_log``) exist in the database with no model backing them. The
    default autogenerate behaviour would propose dropping every one of them.
    This is a safety interlock, not a style choice.

5.  ``lock_timeout`` / ``statement_timeout`` — a migration that cannot acquire a
    lock must fail fast rather than queue behind an application query while
    holding ACCESS EXCLUSIVE locks and stalling the entire fleet.

6.  A PostgreSQL advisory lock serialises concurrent migration attempts. The
    lock id matches the one in ``app/migrations/startup.py`` so that the legacy
    startup path and Alembic can never run at the same moment during cutover.

7.  ``transaction_per_migration=True`` bounds lock hold time to a single
    revision and lets an individual revision opt into ``autocommit_block()``
    for ``CREATE INDEX CONCURRENTLY``.
"""

from __future__ import annotations

import logging
import os
import re
import time
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool, text
from sqlmodel import SQLModel

# Imported for its side effect: app.config imports app.parameters, which loads
# AWS SSM parameters into os.environ before Settings() resolves DATABASE_URL.
from app.config import settings
from app.models import register_all_models

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

logger = logging.getLogger("alembic.env")


# ---------------------------------------------------------------------------
# Target metadata
# ---------------------------------------------------------------------------
# SQLModel only populates metadata for model classes that have been imported.
# The project already centralises this rather than relying on import side
# effects, so env.py just has to call it.
register_all_models()
target_metadata = SQLModel.metadata


# ---------------------------------------------------------------------------
# Objects Alembic must never touch
# ---------------------------------------------------------------------------
# Schemas with no SQLModel models at all. Their DDL lives in the baseline
# revision and in hand-written revisions thereafter.
UNMANAGED_SCHEMAS: frozenset[str] = frozenset(
    {"sync_action", "sync_survey", "sync_source"}
)

# Tables in the default schema that exist in the database but have no model.
# Listed explicitly so that adding a model later is a deliberate act.
#
# These are the legacy/other-feature tables verified present on staging with no
# SQLModel model and no DDL in app/migrations/startup.py. They hold real data,
# so autogenerate must never propose dropping them. The generic guard in
# include_object() below already covers any reflected table absent from
# metadata; this list makes the known set explicit and reviewable.
#
# audit_log is deliberately NOT listed: it exists only in the older local
# schema, not on staging, and is therefore not part of the baseline.
UNMANAGED_TABLES: frozenset[str] = frozenset(
    {
        "alembic_version",
        "embedded_actions",
        "embedded_chunks",
        "market_research_extractions",
        "studies",
        "test_lab_leads",
        "test_lab_profiles",
        "test_lab_reports",
        "test_lab_survey_manual",
        "test_lab_surveys",
        "test_lab_validation_runs",
        "test_lab_verdict",
        "users",
    }
)


def include_name(name: str | None, type_: str, parent_names: dict) -> bool:
    """Restrict which schemas autogenerate reflects."""
    if type_ == "schema":
        return name is None or name not in UNMANAGED_SCHEMAS
    return True


def include_object(obj, name: str, type_: str, reflected: bool, compare_to) -> bool:
    """Never autogenerate a change against an object we do not own.

    The dangerous case is a *reflected* table with no counterpart in
    target_metadata: Alembic's default is to emit ``op.drop_table()``. Every
    such table in this database contains real data or is a deliberate
    unmanaged artefact, so the answer is always "leave it alone".
    """
    schema = getattr(obj, "schema", None)
    if schema in UNMANAGED_SCHEMAS:
        return False

    if type_ == "table":
        if name in UNMANAGED_TABLES:
            return False
        # Reflected table absent from metadata -> would render as a DROP.
        if reflected and compare_to is None:
            logger.warning(
                "autogenerate: ignoring unmanaged table %r (present in database, "
                "absent from SQLModel.metadata)",
                name,
            )
            return False

    # Columns of an unmanaged table would otherwise render as drop_column.
    if type_ == "column":
        table_name = getattr(getattr(obj, "table", None), "name", None)
        if table_name in UNMANAGED_TABLES:
            return False

    return True


# ---------------------------------------------------------------------------
# Connection URL
# ---------------------------------------------------------------------------
def _to_sync_url(url: str) -> str:
    """Convert the application's async URL into a psycopg2 URL.

    asyncpg and psycopg2 spell TLS options differently. app/parameters.py
    checks for both ``ssl=require`` and ``sslmode=require``, so both forms are
    known to occur in this project's SSM parameters; translate rather than
    assume.
    """
    url = url.replace("+asyncpg", "+psycopg2")
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    # asyncpg's ssl=require -> psycopg2's sslmode=require
    url = re.sub(r"([?&])ssl=require\b", r"\1sslmode=require", url)
    return url


def get_url() -> str:
    # An explicit -x db_url=... always wins; used by tests and by the parity
    # tooling to point at a scratch database.
    override = context.get_x_argument(as_dictionary=True).get("db_url")
    return _to_sync_url(override or settings.DATABASE_URL)


def _safe_target(url: str) -> str:
    """host:port/dbname — never the credentials."""
    try:
        return url.split("@", 1)[1]
    except IndexError:
        return "<unparsed>"


# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
_STEP_STARTED: dict[str, float] = {}


def on_version_apply(ctx, step, heads, run_args) -> None:
    """Structured per-revision logging.

    Mirrors the telemetry that app/migrations/startup.py:_run_step already
    emits, so the observability of the current system is not lost in the move.
    """
    # MigrationInfo exposes revision ids directly; the human-readable message
    # lives on the Script object behind up_revision, which is absent for stamps.
    rev = step.up_revision_id if step.is_upgrade else step.down_revision_ids
    doc = getattr(getattr(step, "up_revision", None), "doc", None)
    logger.info(
        "revision %s %s",
        rev,
        "applied" if step.is_upgrade else "reverted",
        extra={
            "revision": str(rev),
            "direction": "upgrade" if step.is_upgrade else "downgrade",
            "doc": doc,
            "ssm_path": os.environ.get("SSM_PATH", "unset"),
        },
    )


# ---------------------------------------------------------------------------
# Lock coordination
# ---------------------------------------------------------------------------
# Same id as _STARTUP_MIGRATION_LOCK_ID in app/migrations/startup.py, so the
# legacy startup path and Alembic mutually exclude during the cutover window.
MIGRATION_LOCK_ID = 914_202_605_110

LOCK_TIMEOUT = os.environ.get("MIGRATION_LOCK_TIMEOUT", "10s")
STATEMENT_TIMEOUT = os.environ.get("MIGRATION_STATEMENT_TIMEOUT", "900s")


def run_migrations_offline() -> None:
    """Render SQL to stdout without connecting.

    Used by ``alembic upgrade head --sql`` so reviewers can read the actual DDL
    a release will execute instead of the Python that generates it.
    """
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        include_object=include_object,
        include_name=include_name,
        compare_type=True,
        version_table="alembic_version",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = get_url()
    logger.info("migrations: target=%s", _safe_target(url))

    cfg = config.get_section(config.config_ini_section, {}) or {}
    cfg["sqlalchemy.url"] = url

    connectable = engine_from_config(cfg, prefix="sqlalchemy.", poolclass=pool.NullPool)

    with connectable.connect() as connection:
        connection.execute(text(f"SET lock_timeout = '{LOCK_TIMEOUT}'"))
        connection.execute(text(f"SET statement_timeout = '{STATEMENT_TIMEOUT}'"))
        connection.commit()

        waited = time.perf_counter()
        connection.execute(
            text("SELECT pg_advisory_lock(:lock_id)"), {"lock_id": MIGRATION_LOCK_ID}
        )
        connection.commit()
        logger.info(
            "migrations: advisory lock acquired after %.2fs",
            time.perf_counter() - waited,
        )

        started = time.perf_counter()
        try:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                include_schemas=True,
                include_object=include_object,
                include_name=include_name,
                compare_type=True,
                # Server defaults are compared only when explicitly requested.
                # The baseline pass sets ALEMBIC_COMPARE_SERVER_DEFAULT=1 to
                # surface default drift; steady state leaves it off because
                # SQLModel's Python-side defaults make it noisy.
                compare_server_default=bool(
                    os.environ.get("ALEMBIC_COMPARE_SERVER_DEFAULT")
                ),
                transaction_per_migration=True,
                on_version_apply=on_version_apply,
                version_table="alembic_version",
            )
            with context.begin_transaction():
                context.run_migrations()
        finally:
            elapsed = time.perf_counter() - started
            connection.execute(
                text("SELECT pg_advisory_unlock(:lock_id)"),
                {"lock_id": MIGRATION_LOCK_ID},
            )
            connection.commit()
            logger.info("migrations: finished in %.2fs, advisory lock released", elapsed)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
