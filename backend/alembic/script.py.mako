"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Created: ${create_date}

Checklist before merging this revision
--------------------------------------
[ ] `alembic upgrade head` succeeds against an empty database
[ ] `alembic downgrade -1` then `alembic upgrade head` succeeds
[ ] `alembic upgrade head --sql` reviewed — the DDL is what you intended
[ ] Indexes on large tables use postgresql_concurrently inside an
    autocommit_block(), or the table is small enough not to matter
[ ] Data changes live in their own revision, separate from schema changes
[ ] Nothing here drops a column or table that the previous release still writes
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
import sqlmodel
${imports if imports else ""}

revision: str = ${repr(up_revision)}
down_revision: str | None = ${repr(down_revision)}
branch_labels: str | None = ${repr(branch_labels)}
depends_on: str | None = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
