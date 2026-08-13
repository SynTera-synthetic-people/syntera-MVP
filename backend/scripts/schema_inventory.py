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
import pathlib
import re
import sys
from typing import Any

import psycopg2
import psycopg2.extras

# Running this as a script puts scripts/ on sys.path, not the backend root, so
# `from app.config import ...` would fail. Add the backend root explicitly.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

DEFAULT_SCHEMAS = ("public", "sync_action", "sync_survey", "sync_source")

# Objects whose presence is expected to differ between a stamped database and a
# freshly built one, and which carry no schema meaning.
IGNORED_TABLES = {"alembic_version"}


def resolve_url(url: str | None) -> str:
    """Fall back to the application's own configuration when --url is omitted.

    Inside a Kubernetes pod this resolves DATABASE_URL through app.config,
    which imports app.parameters and loads it from AWS SSM — the same path the
    application and the migration Job use. That removes any chance of
    inspecting one database while the app talks to another.
    """
    if url:
        return url
    from app.config import settings  # imported lazily: needs app deps present

    # These tools talk to psycopg2 directly, which rejects SQLAlchemy's
    # "+driver" suffix, so normalise to a plain libpq DSN.
    resolved = re.sub(r"\+\w+://", "://", settings.DATABASE_URL)
    resolved = re.sub(r"([?&])ssl=require\b", r"\1sslmode=require", resolved)
    print(
        f"# resolved DATABASE_URL from app.config -> {resolved.split('@')[-1]}",
        file=sys.stderr,
    )
    return resolved


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
    # Parameters, not just names: a sequence with the wrong increment or start
    # value is a real difference, and a serial column silently losing its
    # ownership link changes what DROP TABLE does.
    cur.execute(
        """
        SELECT n.nspname || '.' || c.relname AS name,
               format_type(s.seqtypid, NULL) AS data_type,
               s.seqstart, s.seqincrement, s.seqmin, s.seqmax, s.seqcycle
        FROM pg_sequence s
        JOIN pg_class c     ON c.oid = s.seqrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ANY(%s)
        ORDER BY 1
        """,
        (schema_list,),
    )
    sequences = {
        r["name"]: {
            "type": r["data_type"],
            "start": int(r["seqstart"]),
            "increment": int(r["seqincrement"]),
            "min": int(r["seqmin"]),
            "max": int(r["seqmax"]),
            "cycle": bool(r["seqcycle"]),
        }
        for r in cur.fetchall()
    }

    cur.execute(
        """
        SELECT sn.nspname || '.' || sc.relname AS seq,
               tn.nspname || '.' || tc.relname || '.' || a.attname AS owner
        FROM pg_class sc
        JOIN pg_namespace sn ON sn.oid = sc.relnamespace
        JOIN pg_depend d     ON d.objid = sc.oid
                            AND d.classid = 'pg_class'::regclass
                            AND d.deptype = 'a'
        JOIN pg_class tc     ON tc.oid = d.refobjid
        JOIN pg_namespace tn ON tn.oid = tc.relnamespace
        JOIN pg_attribute a  ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
        WHERE sc.relkind = 'S' AND sn.nspname = ANY(%s)
        """,
        (schema_list,),
    )
    for r in cur.fetchall():
        if r["seq"] in sequences:
            sequences[r["seq"]]["owned_by"] = r["owner"]

    # ---- functions -------------------------------------------------------
    # Extension-owned functions are excluded: the extension owns their
    # lifecycle, and they are not part of this schema's definition.
    cur.execute(
        """
        SELECT n.nspname || '.' || p.proname AS name,
               pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = ANY(%s)
          AND p.prokind IN ('f', 'p')
          AND NOT EXISTS (
              SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'
          )
        ORDER BY 1
        """,
        (schema_list,),
    )
    functions = {r["name"]: _norm(r["definition"]) for r in cur.fetchall()}

    # ---- triggers --------------------------------------------------------
    # tgisinternal excludes foreign-key enforcement triggers, which are created
    # implicitly by their constraint and already compared as constraints.
    cur.execute(
        """
        SELECT n.nspname || '.' || c.relname || '.' || t.tgname AS name,
               pg_get_triggerdef(t.oid) AS definition
        FROM pg_trigger t
        JOIN pg_class c     ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal AND n.nspname = ANY(%s)
        ORDER BY 1
        """,
        (schema_list,),
    )
    triggers = {r["name"]: _norm(r["definition"]) for r in cur.fetchall()}

    # ---- extensions ------------------------------------------------------
    # An index or default that depends on a missing extension fails at CREATE
    # time, so a difference here is worth surfacing even though the baseline
    # does not currently install extensions.
    cur.execute(
        "SELECT extname FROM pg_extension WHERE extname <> 'plpgsql' ORDER BY 1"
    )
    extensions = [r["extname"] for r in cur.fetchall()]

    # ---- views -----------------------------------------------------------
    cur.execute(
        """
        SELECT table_schema || '.' || table_name AS name, view_definition AS definition
        FROM information_schema.views
        WHERE table_schema = ANY(%s)
        ORDER BY 1
        """,
        (schema_list,),
    )
    views = {r["name"]: _norm(r["definition"]) for r in cur.fetchall()}

    cur.execute(
        """
        SELECT schemaname || '.' || matviewname AS name, definition
        FROM pg_matviews WHERE schemaname = ANY(%s) ORDER BY 1
        """,
        (schema_list,),
    )
    for r in cur.fetchall():
        views[r["name"]] = _norm(r["definition"])

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
        "functions": functions,
        "triggers": triggers,
        "views": views,
        "extensions": extensions,
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
    _compare_maps(diff, "ENUM", base["enums"], cand["enums"])

    # Sequences were once recorded as a bare list of names. Compare richly when
    # both sides carry the newer dict form, and fall back to a name-only
    # comparison so snapshots taken before this change still work — with a
    # warning, because a name-only match is weaker evidence.
    b_seq, c_seq = base["sequences"], cand["sequences"]
    if isinstance(b_seq, dict) and isinstance(c_seq, dict):
        _compare_maps(diff, "SEQUENCE", b_seq, c_seq)
    else:
        print(
            "NOTE: one snapshot predates sequence-parameter capture; comparing "
            "sequence NAMES only. Re-take the snapshot for full coverage."
        )
        _compare_sets(diff, "SEQUENCE", set(b_seq), set(c_seq))

    # Object classes added after the first snapshots were taken. A snapshot
    # that lacks the key is reported as unverified rather than silently passing
    # — absence of data is not evidence of absence of the object.
    for key, label in (
        ("functions", "FUNCTION"),
        ("triggers", "TRIGGER"),
        ("views", "VIEW"),
    ):
        if key not in base or key not in cand:
            print(
                f"NOTE: {label} comparison skipped — one snapshot predates "
                f"{key} capture. Re-take it to verify this object class."
            )
            continue
        _compare_maps(diff, label, base[key], cand[key])

    if "extensions" in base and "extensions" in cand:
        _compare_sets(
            diff, "EXTENSION", set(base["extensions"]), set(cand["extensions"])
        )

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
        # utf-8-sig tolerates the BOM that PowerShell's Out-File writes; it is
        # a no-op on normal UTF-8.
        if path == "-":
            return json.loads(sys.stdin.buffer.read().decode("utf-8-sig"))
        with open(path, encoding="utf-8-sig") as fh:
            return json.load(fh)
    if url:
        return snapshot(url, schemas, with_rows)
    raise SystemExit("need either a snapshot file or a --*-url")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)

    common = dict(nargs="*", default=list(DEFAULT_SCHEMAS))

    s = sub.add_parser("snapshot", help="write a structural snapshot to JSON")
    s.add_argument("--url", help="defaults to app.config.settings.DATABASE_URL")
    s.add_argument("--out", required=True, help="file path, or - for stdout")
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
        data = snapshot(resolve_url(args.url), tuple(args.schemas), args.rows)

        if args.out == "-":
            # Machine-readable on stdout so it can be piped or captured from
            # `kubectl logs`; the human summary goes to stderr.
            json.dump(data, sys.stdout, indent=2, sort_keys=True)
            sys.stdout.write("\n")
            print(
                f"# tables={len(data['tables'])} columns={len(data['columns'])} "
                f"indexes={len(data['indexes'])} constraints={len(data['constraints'])}",
                file=sys.stderr,
            )
            return 0

        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, sort_keys=True)
        print(
            f"snapshot -> {args.out}\n"
            f"  server   : {data['server_version']}\n"
            f"  tables   : {len(data['tables'])}\n"
            f"  columns  : {len(data['columns'])}\n"
            f"  indexes  : {len(data['indexes'])}\n"
            f"  constrts : {len(data['constraints'])}\n"
            f"  sequences: {len(data['sequences'])}\n"
            f"  functions: {len(data['functions'])}\n"
            f"  triggers : {len(data['triggers'])}\n"
            f"  views    : {len(data['views'])}\n"
            f"  extensns : {len(data['extensions'])}"
        )
        if args.rows:
            print(f"  rows     : {sum(data['row_counts'].values())} across all tables")
        return 0

    schemas = tuple(args.schemas)
    base = _load(args.baseline, args.baseline_url, schemas, args.rows)
    cand = _load(args.candidate, args.candidate_url, schemas, args.rows)
    if base.get("server_version") != cand.get("server_version"):
        print(
            f"NOTE: PostgreSQL versions differ "
            f"(baseline {base.get('server_version')} vs candidate "
            f"{cand.get('server_version')}). Rendering differences are more "
            f"likely; genuine losses and changes are still reported normally."
        )
    diff = compare(base, cand, args.rows_must_not_shrink)
    return report(diff, args.strict)


if __name__ == "__main__":
    sys.exit(main())
