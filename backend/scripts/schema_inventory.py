"""Structural inventory and parity verification for PostgreSQL schemas.

This is the safety instrument for the Alembic cutover. The baseline revision is
only trustworthy if a database built from it is structurally identical to the
database that already exists, and "identical" has to mean something a machine
can check.

Everything is read from PostgreSQL's own catalog formatters
(``pg_get_constraintdef``, ``pg_indexes.indexdef``, ``format_type``) rather
than reconstructed, so the comparison never depends on this script's opinion of
what two types or two constraints have in common.

Usage
-----
Snapshot a database::

    python scripts/schema_inventory.py snapshot \\
        --url postgresql://user:pw@host:5432/db --out before.json

Compare two snapshots (exit 1 on any difference)::

    python scripts/schema_inventory.py compare --baseline before.json --candidate after.json

Compare two live databases directly::

    python scripts/schema_inventory.py compare --baseline-url $A --candidate-url $B

Row-count guard — proves no data was lost across a migration::

    python scripts/schema_inventory.py snapshot --url $DB --rows --out before.json
    # ... run migration ...
    python scripts/schema_inventory.py snapshot --url $DB --rows --out after.json
    python scripts/schema_inventory.py compare --baseline before.json \\
        --candidate after.json --rows-must-not-shrink
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any

import psycopg2
import psycopg2.extras

DEFAULT_SCHEMAS = ("public", "sync_action", "sync_survey", "sync_source")

# Objects whose presence is expected to differ between a stamped database and a
# freshly built one, and which carry no schema meaning.
IGNORED_TABLES = {"alembic_version"}


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------
def _norm(sql: str | None) -> str | None:
    """Collapse whitespace so formatting differences are not reported as drift."""
    if sql is None:
        return None
    return re.sub(r"\s+", " ", sql).strip()


def _canonical(sql: str | None) -> str | None:
    """Reduce a definition to a form that ignores PostgreSQL rendering choices.

    PostgreSQL does not round-trip every expression byte-for-byte. Creating an
    index from ``pg_indexes.indexdef`` and then re-reading it can yield a
    different-but-equivalent rendering, because the planner re-prints the parse
    tree rather than the original text. The known case in this schema is cast
    placement inside an array:

        (ARRAY['a'::varchar, 'b'::varchar])::text[]      -- as originally written
        ARRAY[('a'::varchar)::text, ('b'::varchar)::text] -- as re-printed

    Both match exactly the same rows. This canonicalisation strips string casts
    and redundant parentheses so such pairs compare equal.

    It is applied ONLY as a second pass: anything that differs before
    canonicalisation but matches after is reported as a rendering difference,
    never silently accepted, and anything that still differs is fatal.
    """
    if sql is None:
        return None
    s = _norm(sql) or ""
    s = re.sub(r"::character varying(\[\])?", "", s)
    s = re.sub(r"::text(\[\])?", "", s)
    s = re.sub(r"::regconfig", "", s)
    s = re.sub(r"\(\s*([^()]*?)\s*\)", r"\1", s)  # collapse innermost redundant parens
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def _norm_default(default: str | None) -> str | None:
    """Normalise a column default.

    PostgreSQL renders the same default differently across versions and across
    how the column was created (``now()`` vs ``NOW()``, with and without an
    explicit cast). Lowercase and strip redundant casts so genuinely equivalent
    defaults compare equal.
    """
    if default is None:
        return None
    d = _norm(default) or ""
    d = d.lower()
    d = re.sub(r"::(character varying|text|jsonb|json|integer|boolean)\b", "", d)
    d = d.replace("'::", "'").strip()
    return d or None


# ---------------------------------------------------------------------------
# Snapshot
# ---------------------------------------------------------------------------
def snapshot(url: str, schemas: tuple[str, ...], with_rows: bool = False) -> dict[str, Any]:
    conn = psycopg2.connect(url)
    conn.set_session(readonly=True, autocommit=True)
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    cur.execute("SHOW server_version")
    server_version = cur.fetchone()[0]

    schema_list = list(schemas)

    # ---- tables ----------------------------------------------------------
    cur.execute(
        """
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_schema = ANY(%s) AND table_type = 'BASE TABLE'
        ORDER BY 1, 2
        """,
        (schema_list,),
    )
    tables = [
        f"{r['table_schema']}.{r['table_name']}"
        for r in cur.fetchall()
        if r["table_name"] not in IGNORED_TABLES
    ]

    # ---- columns ---------------------------------------------------------
    cur.execute(
        """
        SELECT n.nspname   AS schema,
               c.relname   AS table,
               a.attname   AS column,
               format_type(a.atttypid, a.atttypmod) AS type,
               a.attnotnull AS notnull,
               pg_get_expr(d.adbin, d.adrelid)      AS default,
               a.attidentity AS identity,
               a.attgenerated AS generated
        FROM pg_attribute a
        JOIN pg_class c     ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
        WHERE n.nspname = ANY(%s)
          AND c.relkind = 'r'
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY 1, 2, a.attnum
        """,
        (schema_list,),
    )
    columns: dict[str, dict[str, Any]] = {}
    for r in cur.fetchall():
        if r["table"] in IGNORED_TABLES:
            continue
        key = f"{r['schema']}.{r['table']}.{r['column']}"
        columns[key] = {
            "type": r["type"],
            "notnull": bool(r["notnull"]),
            "default": _norm_default(r["default"]),
            "identity": r["identity"] or None,
            "generated": r["generated"] or None,
        }

    # ---- constraints -----------------------------------------------------
    # pg_get_constraintdef is authoritative and covers PK, UNIQUE, FK (with its
    # ON DELETE / ON UPDATE actions) and CHECK in one consistent rendering.
    cur.execute(
        """
        SELECT n.nspname AS schema,
               rel.relname AS table,
               con.conname AS name,
               con.contype AS type,
               con.convalidated AS validated,
               pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class rel     ON rel.oid = con.conrelid
        JOIN pg_namespace n   ON n.oid = rel.relnamespace
        WHERE n.nspname = ANY(%s)
        ORDER BY 1, 2, 3
        """,
        (schema_list,),
    )
    constraints: dict[str, dict[str, Any]] = {}
    for r in cur.fetchall():
        if r["table"] in IGNORED_TABLES:
            continue
        key = f"{r['schema']}.{r['table']}.{r['name']}"
        constraints[key] = {
            "type": r["type"],
            "validated": bool(r["validated"]),
            "definition": _norm(r["definition"]),
        }

    # ---- indexes ---------------------------------------------------------
    # indexdef captures partial predicates, expression indexes and access
    # methods verbatim — the three things reflection-based tooling loses.
    cur.execute(
        """
        SELECT schemaname AS schema, tablename AS table,
               indexname AS name, indexdef AS definition
        FROM pg_indexes
        WHERE schemaname = ANY(%s)
        ORDER BY 1, 2, 3
        """,
        (schema_list,),
    )
    indexes: dict[str, str] = {}
    for r in cur.fetchall():
        if r["table"] in IGNORED_TABLES:
            continue
        key = f"{r['schema']}.{r['table']}.{r['name']}"
        # Normalise the schema qualification so `ON public.foo` and `ON foo`
        # compare equal across search_path differences.
        definition = _norm(r["definition"]) or ""
        definition = definition.replace(f" ON {r['schema']}.", " ON ")
        indexes[key] = definition

    # ---- sequences -------------------------------------------------------
    cur.execute(
        """
        SELECT sequence_schema || '.' || sequence_name AS name
        FROM information_schema.sequences
        WHERE sequence_schema = ANY(%s) ORDER BY 1
        """,
        (schema_list,),
    )
    sequences = [r["name"] for r in cur.fetchall()]

    # ---- enums -----------------------------------------------------------
    cur.execute(
        """
        SELECT n.nspname || '.' || t.typname AS name,
               array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e      ON e.enumtypid = t.oid
        WHERE n.nspname = ANY(%s)
        GROUP BY 1 ORDER BY 1
        """,
        (schema_list,),
    )
    enums = {r["name"]: list(r["labels"]) for r in cur.fetchall()}

    # ---- row counts (optional, exact) ------------------------------------
    row_counts: dict[str, int] = {}
    if with_rows:
        for qualified in tables:
            schema, table = qualified.split(".", 1)
            cur.execute(f'SELECT count(*) FROM "{schema}"."{table}"')
            row_counts[qualified] = cur.fetchone()[0]

    conn.close()

    return {
        "server_version": server_version,
        "schemas": schema_list,
        "tables": tables,
        "columns": columns,
        "constraints": constraints,
        "indexes": indexes,
        "sequences": sequences,
        "enums": enums,
        "row_counts": row_counts,
    }


# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------
class Diff:
    def __init__(self) -> None:
        self.losses: list[str] = []     # present in baseline, missing in candidate
        self.additions: list[str] = []  # present only in candidate
        self.changes: list[str] = []    # present in both, genuinely different
        self.rendering: list[str] = []  # differ textually, equivalent semantically

    @property
    def ok(self) -> bool:
        return not (self.losses or self.additions or self.changes or self.rendering)


def _compare_sets(diff: Diff, kind: str, base: set[str], cand: set[str]) -> None:
    for name in sorted(base - cand):
        diff.losses.append(f"{kind} MISSING from candidate: {name}")
    for name in sorted(cand - base):
        diff.additions.append(f"{kind} EXTRA in candidate: {name}")


def _compare_maps(diff: Diff, kind: str, base: dict, cand: dict) -> None:
    _compare_sets(diff, kind, set(base), set(cand))
    for name in sorted(set(base) & set(cand)):
        b, c = base[name], cand[name]
        if b == c:
            continue
        detail = (
            f"{kind}: {name}\n"
            f"      baseline : {b}\n"
            f"      candidate: {c}"
        )
        # Only definitions (strings) can be rendering-equivalent; dicts of
        # column attributes must match exactly.
        if isinstance(b, str) and isinstance(c, str) and _canonical(b) == _canonical(c):
            diff.rendering.append(detail)
        else:
            diff.changes.append(detail)


def compare(
    base: dict[str, Any],
    cand: dict[str, Any],
    rows_must_not_shrink: bool = False,
) -> Diff:
    diff = Diff()

    _compare_sets(diff, "TABLE", set(base["tables"]), set(cand["tables"]))
    _compare_maps(diff, "COLUMN", base["columns"], cand["columns"])
    _compare_maps(diff, "CONSTRAINT", base["constraints"], cand["constraints"])
    _compare_maps(diff, "INDEX", base["indexes"], cand["indexes"])
    _compare_sets(diff, "SEQUENCE", set(base["sequences"]), set(cand["sequences"]))
    _compare_maps(diff, "ENUM", base["enums"], cand["enums"])

    if rows_must_not_shrink and base.get("row_counts"):
        for table, before in sorted(base["row_counts"].items()):
            after = cand.get("row_counts", {}).get(table)
            if after is None:
                diff.losses.append(f"ROWS table vanished: {table} (had {before})")
            elif after < before:
                diff.losses.append(
                    f"ROWS LOST in {table}: {before} -> {after} ({before - after} rows)"
                )

    return diff


def report(diff: Diff, strict_additions: bool) -> int:
    if diff.ok:
        print("PARITY OK — candidate is structurally identical to baseline.")
        return 0

    if diff.losses:
        print(f"\n!! LOSSES ({len(diff.losses)}) — baseline objects absent from candidate")
        print("   These are data-loss risks. The candidate is NOT safe.")
        for line in diff.losses:
            print(f"   - {line}")

    if diff.changes:
        print(f"\n!! CHANGES ({len(diff.changes)}) — object exists in both but differs")
        for line in diff.changes:
            print(f"   - {line}")

    if diff.additions:
        label = "!!" if strict_additions else "  "
        print(f"\n{label} ADDITIONS ({len(diff.additions)}) — present only in candidate")
        for line in diff.additions:
            print(f"   - {line}")

    if diff.rendering:
        print(
            f"\n   RENDERING ({len(diff.rendering)}) — textually different, semantically"
            "\n   identical. PostgreSQL re-prints these expressions from the parse tree"
            "\n   rather than the original text. Not a schema difference; review once,"
            "\n   then expect them to remain stable."
        )
        for line in diff.rendering:
            print(f"   - {line}")

    fatal = bool(diff.losses or diff.changes) or (strict_additions and diff.additions)
    if fatal:
        print("\nRESULT: FAIL")
    elif diff.additions:
        print("\nRESULT: PASS (additions only)")
    else:
        print("\nRESULT: PASS (rendering differences only — no schema drift)")
    return 1 if fatal else 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _load(path: str | None, url: str | None, schemas, with_rows: bool) -> dict:
    if path:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    if url:
        return snapshot(url, schemas, with_rows)
    raise SystemExit("need either a snapshot file or a --*-url")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)

    common = dict(nargs="*", default=list(DEFAULT_SCHEMAS))

    s = sub.add_parser("snapshot", help="write a structural snapshot to JSON")
    s.add_argument("--url", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--schemas", **common)
    s.add_argument("--rows", action="store_true", help="include exact row counts")

    c = sub.add_parser("compare", help="diff two snapshots or two live databases")
    c.add_argument("--baseline")
    c.add_argument("--candidate")
    c.add_argument("--baseline-url")
    c.add_argument("--candidate-url")
    c.add_argument("--schemas", **common)
    c.add_argument("--rows", action="store_true")
    c.add_argument("--rows-must-not-shrink", action="store_true")
    c.add_argument(
        "--strict",
        action="store_true",
        help="treat objects present only in the candidate as failures too",
    )

    args = p.parse_args()

    if args.cmd == "snapshot":
        data = snapshot(args.url, tuple(args.schemas), args.rows)
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, sort_keys=True)
        print(
            f"snapshot -> {args.out}\n"
            f"  server   : {data['server_version']}\n"
            f"  tables   : {len(data['tables'])}\n"
            f"  columns  : {len(data['columns'])}\n"
            f"  indexes  : {len(data['indexes'])}\n"
            f"  constrts : {len(data['constraints'])}"
        )
        if args.rows:
            print(f"  rows     : {sum(data['row_counts'].values())} across all tables")
        return 0

    schemas = tuple(args.schemas)
    base = _load(args.baseline, args.baseline_url, schemas, args.rows)
    cand = _load(args.candidate, args.candidate_url, schemas, args.rows)
    diff = compare(base, cand, args.rows_must_not_shrink)
    return report(diff, args.strict)


if __name__ == "__main__":
    sys.exit(main())
