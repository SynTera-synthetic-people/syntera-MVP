"""Check a downloaded quant transcripts export against the expected structure.

Usage:
    python scripts/check_quant_excel_output.py "<path to survey_transcripts_*.zip>"
    python scripts/check_quant_excel_output.py "<path to survey_results.csv>"

Verifies the three things the export used to get wrong:
  1. Grid / Likert questions expand into one column per item (Q<n>_01, Q<n>_02, …)
  2. No respondent's answer is the statement/item text itself
  3. Open-ended questions are not blank for every respondent

Exits non-zero if any check fails, so it can gate a release.
"""
from __future__ import annotations

import csv
import io
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

ITEM_COL = re.compile(r"^Q(\d+)_(\d+):\s*(.+)$")
FLAT_COL = re.compile(r"^Q(\d+)_")


def load_rows(path: Path) -> list[list[str]]:
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as z:
            name = next(
                (n for n in z.namelist() if n.endswith("survey_results.csv")), None
            )
            if not name:
                sys.exit(f"No survey_results.csv inside {path.name} (found: {z.namelist()})")
            raw = z.read(name).decode("utf-8-sig")
    else:
        raw = path.read_text(encoding="utf-8-sig")
    return list(csv.reader(io.StringIO(raw)))


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        sys.exit(__doc__)
    path = Path(argv[1])
    if not path.exists():
        sys.exit(f"Not found: {path}")

    rows = load_rows(path)
    if len(rows) < 3:
        sys.exit("File has no respondent rows")

    header, qtext_row, data = rows[0], rows[1], rows[2:]
    print(f"File      : {path.name}")
    print(f"Respondents: {len(data)}   Columns: {len(header)}\n")

    # ── Group the per-item columns by their parent question ──────────────────
    groups: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for i, h in enumerate(header):
        m = ITEM_COL.match(h)
        if m:
            groups[m.group(1)].append((i, m.group(3).strip()))

    failures: list[str] = []

    def check(ok: bool, msg: str) -> None:
        print(f"  [{'PASS' if ok else 'FAIL'}] {msg}")
        if not ok:
            failures.append(msg)

    # ── 1. Grid expansion ────────────────────────────────────────────────────
    print("1) Grid / Likert questions expanded into per-item columns")
    if groups:
        for qno, cols in sorted(groups.items(), key=lambda kv: int(kv[0])):
            print(f"       Q{qno}: {len(cols)} item columns  e.g. {cols[0][1][:58]!r}")
        check(True, f"{len(groups)} grid/scale question(s) expanded")
    else:
        check(
            False,
            "no Q<n>_NN columns found — either this questionnaire has no grid/Likert "
            "question, or the export is stale (old cached ZIP / backend not restarted)",
        )

    # ── 2. Item text must never be the answer ────────────────────────────────
    print("\n2) Item/statement text never appears as a respondent answer")
    if not groups:
        # Nothing to inspect. Reporting PASS here would be a vacuous green tick
        # on the very file that failed check 1.
        print("  [SKIP] no per-item columns to inspect (see check 1)")
    else:
        bad: list[str] = []
        for qno, cols in groups.items():
            item_texts = {label.strip().lower() for _, label in cols}
            for idx, label in cols:
                for r in data:
                    if idx < len(r) and r[idx].strip().lower() in item_texts:
                        bad.append(f"Q{qno} col {header[idx][:44]!r} -> {r[idx][:56]!r}")
                        break
        check(not bad, f"no statement-as-answer cells ({len(bad)} offending column(s))")
        for b in bad[:5]:
            print(f"         {b}")

    # ── 3. No question column is blank for everyone ──────────────────────────
    print("\n3) No question column is blank for every respondent")
    blank_cols: list[str] = []
    for i, h in enumerate(header):
        if not FLAT_COL.match(h):
            continue
        if all(i >= len(r) or not r[i].strip() for r in data):
            blank_cols.append(f"{h[:52]}  |  {qtext_row[i][:58] if i < len(qtext_row) else ''}")
    check(not blank_cols, f"{len(blank_cols)} fully-blank question column(s)")
    for b in blank_cols:
        print(f"         {b}")

    print("\n" + "=" * 78)
    if failures:
        print(f"RESULT: {len(failures)} CHECK(S) FAILED")
        return 1
    print("RESULT: ALL CHECKS PASSED — export matches the expected structure")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
