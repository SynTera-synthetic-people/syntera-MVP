"""add the persona-library provenance columns

The Persona Library records, on a persona that was copied out of the library,
which persona it was copied from. Two nullable columns carry that:

    library_source_persona_id  the persona this row was copied from
    library_imported_at        when the copy was made

Both were originally added only to app/migrations/startup.py. That module now
runs solely when RUN_STARTUP_MIGRATIONS is set, and it defaults to False
(app/config.py), so on any normal deploy nothing creates these columns while
app/models/persona.py declares them. SQLModel names every column explicitly in
its SELECT, so the mismatch does not fail lazily on the rows that use the
feature — it fails on *every* persona read, turning GET /personas/ into a 500
and taking the persona grid, chat view and questionnaire with it.

Deliberately no foreign key on library_source_persona_id. The origin persona is
hard-deleted along with its exploration
(services/exploration.py: delete(Persona).where(Persona.exploration_id == eid)),
so a real constraint would either block that delete or erase the provenance the
library card still wants to show. The column is a soft pointer and readers treat
"not found" as expected.

The index matches the name SQLModel emits for Field(index=True), so a database
that had already been through startup.py converges on the same object rather
than ending up with two.

Revision ID: 0003_persona_library
Revises: 0002_validate_fks
"""

from __future__ import annotations

from alembic import op

revision: str = "0003_persona_library"
down_revision: str | None = "0002_validate_fks"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # IF NOT EXISTS rather than op.add_column(): staging and any developer
    # database that ran the legacy startup migrations already has these, and
    # this revision must be a no-op there instead of failing the deploy.
    op.execute(
        "ALTER TABLE public.persona "
        "ADD COLUMN IF NOT EXISTS library_source_persona_id character varying"
    )
    op.execute(
        "ALTER TABLE public.persona "
        "ADD COLUMN IF NOT EXISTS library_imported_at timestamp without time zone"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_persona_library_source_persona_id "
        "ON public.persona (library_source_persona_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS public.ix_persona_library_source_persona_id")
    op.execute(
        "ALTER TABLE public.persona DROP COLUMN IF EXISTS library_imported_at"
    )
    op.execute(
        "ALTER TABLE public.persona DROP COLUMN IF EXISTS library_source_persona_id"
    )
