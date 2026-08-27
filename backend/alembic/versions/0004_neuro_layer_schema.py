"""add the neuro-layer tables and the two columns that shipped without a revision

Everything here already existed in app/migrations/startup.py, and only there.
That module now runs solely when RUN_STARTUP_MIGRATIONS is set and it defaults
to False, so a normal deploy creates none of it while the models declare all of
it.

The gap was measured, not guessed: two scratch databases were built — one from
`alembic upgrade head`, one from run_startup_migrations() — and their
information_schema compared. The difference was exactly:

    tables   neuro_conversation_state, neuro_event, neuro_flag,
             neuro_model_version, neuro_question_feature
    columns  interviewquestion.config
             traceabilityrecord.ground_truth_breakdown

interviewquestion.config is the one that takes the product down. SQLModel names
every column explicitly in its SELECT, so a missing column does not fail only
where the feature is used — it fails on every read of that table. With config
absent, POST /in-depth/interviews returns 500 and the browser reports it as a
CORS error, because an unhandled exception bypasses CORSMiddleware and the
response carries no Access-Control-Allow-Origin header.

traceabilityrecord.ground_truth_breakdown is the same failure waiting on the
traceability screen. It is JSON rather than JSONB because the model declares
Column(JSON); this codebase already carries json/jsonb drift and matching the
model is what keeps a fresh database identical to an existing one.

The neuro tables are less urgent — neuro/service.py::is_enabled() wraps its flag
lookup in try/except precisely so "the flag lookup itself must not take down a
request path", so their absence degrades to neuro-disabled rather than a 500.
But NEURO_MODE cannot be switched on until they exist, so they belong here too.

DDL is copied from _repair_neuro_schema, including the index names, which match
what SQLModel emits for Field(index=True). Every statement is IF NOT EXISTS: any
database that ran the legacy startup migrations already has these objects, and
this revision must be a no-op there rather than failing the deploy.

Revision ID: 0004_neuro_layer
Revises: 0003_persona_library
"""

from __future__ import annotations

from alembic import op

revision: str = "0004_neuro_layer"
down_revision: str | None = "0003_persona_library"
branch_labels: str | None = None
depends_on: str | None = None


TABLES: tuple[str, ...] = (
    """CREATE TABLE IF NOT EXISTS public.neuro_conversation_state (
        conversation_key VARCHAR PRIMARY KEY,
        workspace_id     VARCHAR NOT NULL,
        exploration_id   VARCHAR NOT NULL,
        persona_id       VARCHAR,
        turn_index       INTEGER NOT NULL DEFAULT 0,
        state_json       JSONB NOT NULL DEFAULT '{}',
        updated_at       TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS public.neuro_event (
        id                 VARCHAR PRIMARY KEY,
        conversation_key   VARCHAR NOT NULL,
        workspace_id       VARCHAR NOT NULL,
        exploration_id     VARCHAR NOT NULL,
        persona_id         VARCHAR,
        question_id        VARCHAR,
        question_text_hash VARCHAR,
        turn_index         INTEGER NOT NULL DEFAULT 0,
        surface            VARCHAR NOT NULL,
        shadow             BOOLEAN NOT NULL DEFAULT TRUE,
        state_json         JSONB NOT NULL DEFAULT '{}',
        error              VARCHAR,
        neuro_version      VARCHAR NOT NULL DEFAULT '',
        created_at         TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS public.neuro_model_version (
        id                     VARCHAR PRIMARY KEY,
        model_version          VARCHAR NOT NULL,
        artifact_version       VARCHAR NOT NULL,
        renderer_version       VARCHAR NOT NULL,
        feature_schema_version VARCHAR NOT NULL,
        notes                  VARCHAR,
        created_at             TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS public.neuro_question_feature (
        id              VARCHAR PRIMARY KEY,
        question_id     VARCHAR NOT NULL,
        question_source VARCHAR NOT NULL,
        features        JSONB NOT NULL DEFAULT '{}',
        neuro_version   VARCHAR NOT NULL DEFAULT '',
        created_at      TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS public.neuro_flag (
        key        VARCHAR PRIMARY KEY,
        value      VARCHAR NOT NULL,
        updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
    )""",
)

INDEXES: tuple[str, ...] = (
    "CREATE INDEX IF NOT EXISTS ix_neuro_conversation_state_workspace_id ON public.neuro_conversation_state (workspace_id)",
    "CREATE INDEX IF NOT EXISTS ix_neuro_conversation_state_exploration_id ON public.neuro_conversation_state (exploration_id)",
    "CREATE INDEX IF NOT EXISTS ix_neuro_conversation_state_persona_id ON public.neuro_conversation_state (persona_id)",
    "CREATE INDEX IF NOT EXISTS ix_neuro_event_conversation_key ON public.neuro_event (conversation_key)",
    "CREATE INDEX IF NOT EXISTS ix_neuro_event_workspace_id ON public.neuro_event (workspace_id)",
    "CREATE INDEX IF NOT EXISTS ix_neuro_event_exploration_id ON public.neuro_event (exploration_id)",
    "CREATE INDEX IF NOT EXISTS ix_neuro_event_persona_id ON public.neuro_event (persona_id)",
    "CREATE INDEX IF NOT EXISTS ix_neuro_event_question_id ON public.neuro_event (question_id)",
    "CREATE INDEX IF NOT EXISTS ix_neuro_event_surface ON public.neuro_event (surface)",
    "CREATE INDEX IF NOT EXISTS ix_neuro_event_neuro_version ON public.neuro_event (neuro_version)",
    "CREATE INDEX IF NOT EXISTS ix_neuro_event_created_at ON public.neuro_event (created_at)",
    "CREATE INDEX IF NOT EXISTS ix_neuro_model_version_model_version ON public.neuro_model_version (model_version)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_neuro_question_feature_question_id ON public.neuro_question_feature (question_id)",
    "CREATE INDEX IF NOT EXISTS ix_neuro_question_feature_question_source ON public.neuro_question_feature (question_source)",
)

# JSONB for config (Column(JSONB) on the model) and JSON for
# ground_truth_breakdown (Column(JSON)) — matching each model exactly, so a
# database built from this revision is identical to one built by create_all.
COLUMNS: tuple[str, ...] = (
    "ALTER TABLE public.interviewquestion ADD COLUMN IF NOT EXISTS config JSONB",
    "ALTER TABLE public.traceabilityrecord ADD COLUMN IF NOT EXISTS ground_truth_breakdown JSON",
)


def upgrade() -> None:
    for statement in TABLES:
        op.execute(statement)
    for statement in COLUMNS:
        op.execute(statement)
    for statement in INDEXES:
        op.execute(statement)


def downgrade() -> None:
    op.execute("ALTER TABLE public.traceabilityrecord DROP COLUMN IF EXISTS ground_truth_breakdown")
    op.execute("ALTER TABLE public.interviewquestion DROP COLUMN IF EXISTS config")
    for table in (
        "neuro_flag",
        "neuro_question_feature",
        "neuro_model_version",
        "neuro_event",
        "neuro_conversation_state",
    ):
        op.execute(f"DROP TABLE IF EXISTS public.{table}")
