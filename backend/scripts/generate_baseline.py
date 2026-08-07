"""Generate the Alembic baseline revision from a live database.

Why this exists instead of ``alembic revision --autogenerate``
--------------------------------------------------------------
Autogenerate derives the schema from ``SQLModel.metadata``. In this project the
database contains objects that metadata does not know about:

  * the 12 tables in ``sync_action`` / ``sync_survey`` / ``sync_source``,
    which have no SQLModel models at all;
  * ``public.audit_log``, which has neither a model nor a raw CREATE in
    ``app/migrations/startup.py``;
  * columns whose live type differs from the model's, because
    ``app/migrations/startup.py`` and ``SQLModel.create_all`` both defined the
    same table and whichever ran first won.

Autogenerate would emit ``op.drop_table()`` for the first two groups and would
silently normalise the third. Neither is acceptable when the requirement is to
lose nothing.

So the baseline is generated from the database itself, using PostgreSQL's own
catalog formatters:

  ``format_type()``            exact column types
  ``pg_get_expr()``            exact column defaults
  ``pg_get_constraintdef()``   exact PK / UNIQUE / FK / CHECK definitions
  ``pg_indexes.indexdef``      exact index definitions, including partial
                               predicates, expression indexes and access methods

The generated revision is therefore raw DDL rather than Alembic ops. That is a
deliberate trade for the baseline only: fidelity matters more than idiom for a
revision whose entire job is to reproduce an existing schema exactly. Every
revision after this one should use normal Alembic operations.

Usage
-----
    python scripts/generate_baseline.py \\
        --url postgresql://user:pw@localhost:5432/synthdb \\
        --out alembic/versions/0001_baseline.py
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
from typing import Any

import psycopg2
import psycopg2.extras

DEFAULT_SCHEMAS = ("public", "sync_action", "sync_survey", "sync_source")
SKIP_TABLES = {"alembic_version"}

# PostgreSQL reserved words that must stay quoted in generated DDL.
NEEDS_QUOTE = re.compile(r"^[a-z_][a-z0-9_]*$")


def q(ident: str) -> str:
    """Quote an identifier unless it is unambiguously safe unquoted."""
    reserved = {"user", "order", "group", "table", "column", "default", "check", "references"}
    if ident in reserved or not NEEDS_QUOTE.match(ident):
        return f'"{ident}"'
    return ident


def qualified(schema: str, name: str) -> str:
    return f"{q(schema)}.{q(name)}"


def fetch(cur, sql: str, params: tuple) -> list:
    cur.execute(sql, params)
    return cur.fetchall()


def build(url: str, schemas: tuple[str, ...]) -> dict[str, Any]:
    conn = psycopg2.connect(url)
    conn.set_session(readonly=True, autocommit=True)
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    schema_list = list(schemas)

    cur.execute("SHOW server_version")
    server_version = cur.fetchone()[0]

    # ---- schemas that actually exist -------------------------------------
    existing_schemas = [
        r["nspname"]
        for r in fetch(
            cur,
            "SELECT nspname FROM pg_namespace WHERE nspname = ANY(%s) ORDER BY 1",
            (schema_list,),
        )
    ]

    # ---- tables ----------------------------------------------------------
    tables = [
        (r["table_schema"], r["table_name"])
        for r in fetch(
            cur,
            """
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_schema = ANY(%s) AND table_type = 'BASE TABLE'
            ORDER BY 1, 2
            """,
            (schema_list,),
        )
        if r["table_name"] not in SKIP_TABLES
    ]

    # ---- columns ---------------------------------------------------------
    col_rows = fetch(
        cur,
        """
        SELECT n.nspname AS schema, c.relname AS table, a.attname AS column,
               format_type(a.atttypid, a.atttypmod) AS type,
               a.attnotnull AS notnull,
               pg_get_expr(d.adbin, d.adrelid) AS default,
               a.attnum
        FROM pg_attribute a
        JOIN pg_class c     ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname = ANY(%s) AND c.relkind = 'r'
          AND a.attnum > 0 AND NOT a.attisdropped
        ORDER BY 1, 2, a.attnum
        """,
        (schema_list,),
    )
    cols: dict[tuple[str, str], list[str]] = {}
    for r in col_rows:
        if r["table"] in SKIP_TABLES:
            continue
        piece = f"{q(r['column'])} {r['type']}"
        if r["default"] is not None:
            piece += f" DEFAULT {r['default']}"
        if r["notnull"]:
            piece += " NOT NULL"
        cols.setdefault((r["schema"], r["table"]), []).append(piece)

    create_tables: list[str] = []
    for schema, table in tables:
        body = ",\n    ".join(cols.get((schema, table), []))
        create_tables.append(
            f"CREATE TABLE {qualified(schema, table)} (\n    {body}\n)"
        )

    # ---- constraints -----------------------------------------------------
    # Split by type so ordering is safe: PK/UNIQUE/CHECK first (they are
    # self-contained), then FK once every referenced key exists.
    con_rows = fetch(
        cur,
        """
        SELECT n.nspname AS schema, rel.relname AS table,
               con.conname AS name, con.contype AS type,
               pg_get_constraintdef(con.oid) AS definition,
               con.conindid AS index_oid
        FROM pg_constraint con
        JOIN pg_class rel   ON rel.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = ANY(%s) AND con.contype IN ('p','u','c','f')
        ORDER BY 1, 2, 3
        """,
        (schema_list,),
    )

    keys: list[str] = []
    foreign_keys: list[str] = []
    constraint_index_oids: set[int] = set()

    for r in con_rows:
        if r["table"] in SKIP_TABLES:
            continue
        if r["index_oid"]:
            constraint_index_oids.add(r["index_oid"])
        stmt = (
            f"ALTER TABLE {qualified(r['schema'], r['table'])} "
            f"ADD CONSTRAINT {q(r['name'])} {r['definition']}"
        )
        (foreign_keys if r["type"] == "f" else keys).append(stmt)

    # ---- indexes ---------------------------------------------------------
    # Indexes that merely back a PK or UNIQUE constraint are created implicitly
    # by that constraint; emitting them again would fail.
    idx_rows = fetch(
        cur,
        """
        SELECT i.schemaname AS schema, i.tablename AS table,
               i.indexname AS name, i.indexdef AS definition,
               c.oid AS index_oid
        FROM pg_indexes i
        JOIN pg_class c     ON c.relname = i.indexname
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = i.schemaname
        WHERE i.schemaname = ANY(%s)
        ORDER BY 1, 2, 3
        """,
        (schema_list,),
    )
    indexes: list[str] = []
    skipped_backing = 0
    for r in idx_rows:
        if r["table"] in SKIP_TABLES:
            continue
        if r["index_oid"] in constraint_index_oids:
            skipped_backing += 1
            continue
        indexes.append(r["definition"])

    conn.close()

    return {
        "server_version": server_version,
        "schemas": existing_schemas,
        "tables": tables,
        "create_tables": create_tables,
        "keys": keys,
        "foreign_keys": foreign_keys,
        "indexes": indexes,
        "skipped_backing_indexes": skipped_backing,
    }


def render(data: dict[str, Any], revision: str, down_revision: str | None) -> str:
    def lit(statements: list[str]) -> str:
        if not statements:
            return "()"
        out = ["("]
        for s in statements:
            body = s.strip()
            if "\n" in body:
                out.append('    """' + body + '""",')
            else:
                out.append(f"    {body!r},")
        out.append(")")
        return "\n".join(out)

    created = dt.datetime.now().isoformat(timespec="seconds")
    schemas = [s for s in data["schemas"] if s != "public"]
    drop_order = [f"{s}.{t}" for s, t in data["tables"]]

    return f'''"""baseline: full existing schema

Generated by scripts/generate_baseline.py from a live database
(PostgreSQL {data["server_version"]}) on {created}.

THIS REVISION IS NEVER RUN AGAINST AN EXISTING DATABASE.

  * Databases that already have this schema (local, staging) are brought under
    Alembic control with `alembic stamp {revision}`, which records the revision
    and executes nothing.
  * A brand-new database (production) runs `alembic upgrade head`, and this
    revision creates the schema in full.

Fidelity: every statement below was read from PostgreSQL's own catalog
formatters — format_type(), pg_get_expr(), pg_get_constraintdef() and
pg_indexes.indexdef — so types, defaults, partial-index predicates, expression
indexes, access methods and ON DELETE actions are reproduced exactly as they
exist today, including drift between SQLModel models and
app/migrations/startup.py. Reconciling that drift is deliberately left to later
revisions so that this one can be proven byte-equivalent to the current schema.

Verify with:
    python scripts/schema_inventory.py compare \\
        --baseline-url $EXISTING_DB --candidate-url $SCRATCH_DB_AT_THIS_REVISION

Contents: {len(data["tables"])} tables, {len(data["keys"])} keys/checks,
{len(data["foreign_keys"])} foreign keys, {len(data["indexes"])} explicit indexes
({data["skipped_backing_indexes"]} constraint-backing indexes omitted — they are
created implicitly by their constraint).

Revision ID: {revision}
Revises: {down_revision or ""}
"""

from __future__ import annotations

from alembic import op

revision: str = {revision!r}
down_revision: str | None = {down_revision!r}
branch_labels: str | None = None
depends_on: str | None = None


SCHEMAS: tuple[str, ...] = {tuple(schemas)!r}

CREATE_TABLES: tuple[str, ...] = {lit(data["create_tables"])}

# Primary keys, unique constraints and check constraints. Applied before
# foreign keys so that every referenced key exists by the time FKs are added.
KEYS_AND_CHECKS: tuple[str, ...] = {lit(data["keys"])}

# Foreign keys, with their exact ON DELETE actions. Constraints that are
# currently NOT VALID in the source database are reproduced as NOT VALID here so
# this revision is provably identical to it; revision 0002 validates them.
FOREIGN_KEYS: tuple[str, ...] = {lit(data["foreign_keys"])}

# Explicit indexes only. Indexes backing a PRIMARY KEY or UNIQUE constraint are
# created by the constraint itself and are not repeated.
INDEXES: tuple[str, ...] = {lit(data["indexes"])}

# Drop order for downgrade(). CASCADE handles inter-table dependencies.
TABLES: tuple[str, ...] = {tuple(drop_order)!r}


def upgrade() -> None:
    for schema in SCHEMAS:
        op.execute(f'CREATE SCHEMA IF NOT EXISTS "{{schema}}"')
    for statement in CREATE_TABLES:
        op.execute(statement)
    for statement in KEYS_AND_CHECKS:
        op.execute(statement)
    for statement in FOREIGN_KEYS:
        op.execute(statement)
    for statement in INDEXES:
        op.execute(statement)


def downgrade() -> None:
    """Drop everything this revision created.

    Only ever reachable on a database this revision actually built — a stamped
    database would find nothing to drop and is not expected to downgrade past
    the baseline. CASCADE is required because foreign keys span tables.
    """
    for qualified_name in reversed(TABLES):
        schema, table = qualified_name.split(".", 1)
        op.execute(f'DROP TABLE IF EXISTS "{{schema}}"."{{table}}" CASCADE')
    for schema in SCHEMAS:
        op.execute(f'DROP SCHEMA IF EXISTS "{{schema}}" CASCADE')
'''


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--url", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--revision", default="0001_baseline")
    p.add_argument("--down-revision", default=None)
    p.add_argument("--schemas", nargs="*", default=list(DEFAULT_SCHEMAS))
    args = p.parse_args()

    data = build(args.url, tuple(args.schemas))
    text = render(data, args.revision, args.down_revision)

    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(text)

    print(f"baseline -> {args.out}")
    print(f"  server            : {data['server_version']}")
    print(f"  schemas           : {', '.join(data['schemas'])}")
    print(f"  tables            : {len(data['tables'])}")
    print(f"  keys/checks       : {len(data['keys'])}")
    print(f"  foreign keys      : {len(data['foreign_keys'])}")
    print(f"  explicit indexes  : {len(data['indexes'])}")
    print(f"  backing indexes   : {data['skipped_backing_indexes']} (implicit, omitted)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
