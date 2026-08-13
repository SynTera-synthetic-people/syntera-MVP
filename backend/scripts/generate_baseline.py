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
import pathlib
import re
import sys
from typing import Any

import psycopg2
import psycopg2.extras

# See the equivalent note in schema_inventory.py.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

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

    # ---- sequences -------------------------------------------------------
    # Must be created BEFORE the tables that reference them: a serial column
    # carries DEFAULT nextval('seq'::regclass), and PostgreSQL resolves that
    # regclass cast at CREATE TABLE time. Without this, creating public.studies
    # fails with 'relation "studies_id_seq" does not exist'.
    seq_rows = fetch(
        cur,
        """
        SELECT n.nspname AS schema, c.relname AS name,
               format_type(s.seqtypid, NULL) AS data_type,
               s.seqstart, s.seqincrement, s.seqmin, s.seqmax,
               s.seqcache, s.seqcycle
        FROM pg_sequence s
        JOIN pg_class c     ON c.oid = s.seqrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY(%s)
        ORDER BY 1, 2
        """,
        (schema_list,),
    )
    sequences: list[str] = []
    for r in seq_rows:
        sequences.append(
            f"CREATE SEQUENCE {qualified(r['schema'], r['name'])} "
            f"AS {r['data_type']} "
            f"START WITH {r['seqstart']} "
            f"INCREMENT BY {r['seqincrement']} "
            f"MINVALUE {r['seqmin']} "
            f"MAXVALUE {r['seqmax']} "
            f"CACHE {r['seqcache']} "
            f"{'CYCLE' if r['seqcycle'] else 'NO CYCLE'}"
        )

    # Serial columns own their sequence (pg_depend deptype 'a'), which is what
    # makes DROP TABLE drop the sequence too. Reproduce that link after the
    # tables exist so the ownership semantics match the source database.
    owner_rows = fetch(
        cur,
        """
        SELECT sn.nspname AS seq_schema, sc.relname AS seq_name,
               tn.nspname AS tbl_schema, tc.relname AS tbl_name, a.attname AS col
        FROM pg_class sc
        JOIN pg_namespace sn ON sn.oid = sc.relnamespace
        JOIN pg_depend d     ON d.objid = sc.oid
                            AND d.classid = 'pg_class'::regclass
                            AND d.deptype = 'a'
        JOIN pg_class tc     ON tc.oid = d.refobjid
        JOIN pg_namespace tn ON tn.oid = tc.relnamespace
        JOIN pg_attribute a  ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
        WHERE sc.relkind = 'S' AND sn.nspname = ANY(%s)
        ORDER BY 1, 2
        """,
        (schema_list,),
    )
    sequence_owners = [
        f"ALTER SEQUENCE {qualified(r['seq_schema'], r['seq_name'])} "
        f"OWNED BY {qualified(r['tbl_schema'], r['tbl_name'])}.{q(r['col'])}"
        for r in owner_rows
    ]

    # ---- functions -------------------------------------------------------
    # pg_get_functiondef emits a complete CREATE OR REPLACE FUNCTION statement,
    # including the language, volatility and dollar-quoted body. Functions
    # owned by an extension are excluded — the extension owns their lifecycle.
    func_rows = fetch(
        cur,
        """
        SELECT n.nspname AS schema, p.proname AS name,
               pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = ANY(%s)
          AND p.prokind IN ('f', 'p')
          AND NOT EXISTS (
              SELECT 1 FROM pg_depend d
              WHERE d.objid = p.oid AND d.deptype = 'e'
          )
        ORDER BY 1, 2
        """,
        (schema_list,),
    )
    functions = [r["definition"] for r in func_rows]
    function_names = [
        f"{r['schema']}.{r['name']}" for r in func_rows
    ]

    # ---- triggers --------------------------------------------------------
    # tgisinternal excludes the triggers PostgreSQL creates to enforce foreign
    # keys — there are 86 of those here and none of them belong in a baseline.
    # Triggers are emitted last: they depend on both their table and their
    # function existing.
    trig_rows = fetch(
        cur,
        """
        SELECT n.nspname AS schema, c.relname AS table, t.tgname AS name,
               pg_get_triggerdef(t.oid) AS definition
        FROM pg_trigger t
        JOIN pg_class c     ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal AND n.nspname = ANY(%s)
        ORDER BY 1, 2, 3
        """,
        (schema_list,),
    )
    triggers = [r["definition"] for r in trig_rows if r["table"] not in SKIP_TABLES]

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
        "sequences": sequences,
        "sequence_owners": sequence_owners,
        "functions": functions,
        "function_names": function_names,
        "triggers": triggers,
    }


def render(data: dict[str, Any], revision: str, down_revision: str | None) -> str:
    def lit(statements: list[str]) -> str:
        """Render SQL as Python string literals.

        Function bodies arrive from pg_get_functiondef() containing dollar
        quoting ($function$), backslashes and embedded quotes, so a naive
        triple-quote wrapper can produce a file that will not parse. Use the
        readable triple-quoted form only when the text is provably safe for it,
        and fall back to repr(), which escapes everything correctly.
        """
        if not statements:
            return "()"
        out = ["("]
        for s in statements:
            body = s.strip()
            safe_for_triple_quote = (
                "\n" in body
                and '"""' not in body
                and "\\" not in body
                and not body.endswith('"')
            )
            if safe_for_triple_quote:
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
created implicitly by their constraint), {len(data["sequences"])} sequences,
{len(data["functions"])} functions, {len(data["triggers"])} triggers.

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

# Sequences come FIRST. A serial column's default is
# nextval('seq'::regclass), and PostgreSQL resolves that regclass cast when the
# table is created — so the sequence must already exist or CREATE TABLE fails.
SEQUENCES: tuple[str, ...] = {lit(data["sequences"])}

CREATE_TABLES: tuple[str, ...] = {lit(data["create_tables"])}

# Re-establishes the serial ownership link (pg_depend deptype 'a') that makes
# DROP TABLE also drop the sequence. Applied after the tables exist.
SEQUENCE_OWNERS: tuple[str, ...] = {lit(data["sequence_owners"])}

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

# Complete CREATE OR REPLACE FUNCTION statements from pg_get_functiondef().
# Emitted before triggers, which reference them.
FUNCTIONS: tuple[str, ...] = {lit(data["functions"])}

# Trigger definitions from pg_get_triggerdef(). Foreign-key enforcement
# triggers are excluded — those are created implicitly with their constraint.
TRIGGERS: tuple[str, ...] = {lit(data["triggers"])}

# Drop order for downgrade(). CASCADE handles inter-table dependencies.
TABLES: tuple[str, ...] = {tuple(drop_order)!r}
FUNCTION_NAMES: tuple[str, ...] = {tuple(data["function_names"])!r}


def upgrade() -> None:
    for schema in SCHEMAS:
        op.execute(f'CREATE SCHEMA IF NOT EXISTS "{{schema}}"')
    for statement in SEQUENCES:
        op.execute(statement)
    for statement in CREATE_TABLES:
        op.execute(statement)
    for statement in SEQUENCE_OWNERS:
        op.execute(statement)
    for statement in KEYS_AND_CHECKS:
        op.execute(statement)
    for statement in FOREIGN_KEYS:
        op.execute(statement)
    for statement in INDEXES:
        op.execute(statement)
    for statement in FUNCTIONS:
        op.execute(statement)
    for statement in TRIGGERS:
        op.execute(statement)


def downgrade() -> None:
    """Drop everything this revision created.

    Only ever reachable on a database this revision actually built — a stamped
    database would find nothing to drop and is not expected to downgrade past
    the baseline. CASCADE is required because foreign keys span tables.
    """
    # Tables first: CASCADE takes their triggers and any sequence they own.
    for qualified_name in reversed(TABLES):
        schema, table = qualified_name.split(".", 1)
        op.execute(f'DROP TABLE IF EXISTS "{{schema}}"."{{table}}" CASCADE')
    # Functions are not owned by any table, so they must be dropped explicitly.
    for function_name in FUNCTION_NAMES:
        schema, name = function_name.split(".", 1)
        op.execute(f'DROP FUNCTION IF EXISTS "{{schema}}"."{{name}}"() CASCADE')
    # Any sequence not owned by a dropped column still exists at this point.
    for statement in SEQUENCES:
        name = statement.split()[2]
        op.execute(f"DROP SEQUENCE IF EXISTS {{name}} CASCADE")
    for schema in SCHEMAS:
        op.execute(f'DROP SCHEMA IF EXISTS "{{schema}}" CASCADE')
'''


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--url", help="defaults to app.config.settings.DATABASE_URL")
    p.add_argument("--out", required=True)
    p.add_argument("--revision", default="0001_baseline")
    p.add_argument("--down-revision", default=None)
    p.add_argument("--schemas", nargs="*", default=list(DEFAULT_SCHEMAS))
    args = p.parse_args()

    # Same resolution the migration Job uses, so the baseline is generated from
    # the database the app actually talks to.
    from schema_inventory import resolve_url

    data = build(resolve_url(args.url), tuple(args.schemas))
    text = render(data, args.revision, args.down_revision)

    # `--out -` writes the revision to stdout so it can be captured across a
    # `kubectl exec` boundary; the summary goes to stderr so it does not end up
    # inside the generated file.
    stream = sys.stderr if args.out == "-" else sys.stdout
    if args.out == "-":
        sys.stdout.write(text)
    else:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text)

    print(f"baseline -> {args.out}", file=stream)
    print(f"  server            : {data['server_version']}", file=stream)
    print(f"  schemas           : {', '.join(data['schemas'])}", file=stream)
    print(f"  tables            : {len(data['tables'])}", file=stream)
    print(f"  keys/checks       : {len(data['keys'])}", file=stream)
    print(f"  foreign keys      : {len(data['foreign_keys'])}", file=stream)
    print(f"  explicit indexes  : {len(data['indexes'])}", file=stream)
    print(
        f"  backing indexes   : {data['skipped_backing_indexes']} (implicit, omitted)",
        file=stream,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
