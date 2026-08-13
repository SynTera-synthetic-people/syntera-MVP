"""validate the foreign keys that were created NOT VALID

app/migrations/startup.py:ensure_foreign_key() adds every constraint with
NOT VALID (startup.py:267) to avoid the full-table scan that validation
requires. That is a sound lock-avoidance technique, but nothing in the codebase
ever ran VALIDATE CONSTRAINT afterwards, so 15 foreign keys have been sitting
unvalidated indefinitely.

An unvalidated constraint still enforces on new rows, but PostgreSQL has never
confirmed that existing rows satisfy it, and the planner cannot rely on it.

ensure_fk_on_delete() (startup.py:286-319) makes two of these worse: it drops
and re-adds constraints that SQLModel's create_all had originally created as
VALID, in order to correct their ON DELETE action, and re-adds them NOT VALID.
interview_persona_id_fkey and persona_artifact_response_persona_id_fkey are
both in that category.

Validation is cheap here: every table involved is small (the largest,
public.interview, is in the low hundreds of rows), and VALIDATE CONSTRAINT
takes only SHARE UPDATE EXCLUSIVE — it does not block reads or writes.

If validation FAILS, that is a real finding, not a migration bug: it means rows
exist that violate the constraint. Do not weaken the constraint to make this
pass. Find the orphaned rows first:

    SELECT child.* FROM <child_table> child
    LEFT JOIN <parent_table> parent ON parent.id = child.<fk_column>
    WHERE child.<fk_column> IS NOT NULL AND parent.id IS NULL;

Revision ID: 0002_validate_fks
Revises: 0001_baseline
"""

from __future__ import annotations

from alembic import context, op
import sqlalchemy as sa

revision: str = "0002_validate_fks"
down_revision: str | None = "0001_baseline"
branch_labels: str | None = None
depends_on: str | None = None


# (schema, table, constraint) for every foreign key found NOT VALID.
# Listed explicitly rather than discovered dynamically so that the set of
# constraints this revision touches is visible in code review.
NOT_VALID_FOREIGN_KEYS: tuple[tuple[str, str, str], ...] = (
    ("public", "decision_room_message", "fk_drm_session_id"),
    ("public", "decision_room_session", "fk_drs_created_by"),
    ("public", "decision_room_session", "fk_drs_exploration_id"),
    ("public", "decision_room_session", "fk_drs_workspace_id"),
    ("public", "dp_analysis", "fk_dpa_dataset_id"),
    ("public", "dp_dataset", "fk_dpd_created_by"),
    ("public", "dp_dataset", "fk_dpd_exploration_id"),
    ("public", "dp_dataset", "fk_dpd_workspace_id"),
    ("public", "dp_variable", "fk_dpv_dataset_id"),
    ("public", "explorations", "fk_explorations_deleted_by"),
    ("public", "explorations", "fk_explorations_updated_by"),
    ("public", "interview", "interview_persona_id_fkey"),
    ("public", "persona_artifact_response", "persona_artifact_response_persona_id_fkey"),
    ("public", "research_objectives_file", "fk_research_objectives_file_exploration_id"),
    ("public", "user", "fk_user_deleted_by"),
)


def upgrade() -> None:
    # Offline mode (`alembic upgrade head --sql`) has no connection to inspect,
    # so emit every statement unconditionally. VALIDATE CONSTRAINT on an
    # already-valid constraint is a no-op, which makes that safe.
    if context.is_offline_mode():
        for schema, table, constraint in NOT_VALID_FOREIGN_KEYS:
            op.execute(
                f'ALTER TABLE "{schema}"."{table}" VALIDATE CONSTRAINT "{constraint}"'
            )
        return

    conn = op.get_bind()
    for schema, table, constraint in NOT_VALID_FOREIGN_KEYS:
        # Skip constraints that are already valid or absent, so this revision is
        # safe to re-run and safe on a database whose history differs slightly.
        needs_validation = conn.execute(
            sa.text(
                """
                SELECT 1
                FROM pg_constraint con
                JOIN pg_class rel     ON rel.oid = con.conrelid
                JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                WHERE nsp.nspname = :schema
                  AND rel.relname = :table
                  AND con.conname = :constraint
                  AND NOT con.convalidated
                """
            ),
            {"schema": schema, "table": table, "constraint": constraint},
        ).scalar()

        if needs_validation:
            op.execute(
                f'ALTER TABLE "{schema}"."{table}" VALIDATE CONSTRAINT "{constraint}"'
            )


def downgrade() -> None:
    """Intentionally a no-op.

    PostgreSQL offers no way to mark a validated constraint NOT VALID again;
    reverting would mean dropping and re-adding each constraint. There is no
    scenario in which having *more* verified referential integrity is the
    problem, so downgrading this revision does nothing rather than performing a
    pointless drop/recreate cycle that would itself risk a lock.
    """
