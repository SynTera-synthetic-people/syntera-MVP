"""Manual, standalone validation of build_survey_results_csv_bytes() in
app/utils/questionnaire_csv.py — the per-respondent CSV generator used by the
GET /quant/{simulation_id}/transcripts endpoint (Raw Data Shell ZIP).

Bug fixed: the previous implementation drew one option per respondent per
question via independent weighted random sampling, even for multi-select
questions. That meant (a) multi-select respondents could never be recorded as
picking more than one option, so per-option tallies in survey_results.csv
could never reconcile with questionnaire_overview.csv's Count column, and
(b) even single-select tallies only matched the aggregate counts approximately
(sampling noise), not exactly. This script proves the fix: the CSV is now
built from an exact, shuffled realization of the aggregate counts, so summing
the CSV always reproduces `results` exactly, and multi-select respondents can
carry more than one selection.

No live API calls, no live DB — exercises build_survey_results_csv_bytes()
directly against synthetic `results` dicts.

Usage (from backend/):
    .venv/Scripts/python.exe scripts/test_survey_results_csv_reconciliation.py
"""
from __future__ import annotations

import csv
import io
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.utils.questionnaire_csv import build_survey_results_csv_bytes

FAILURES: list[str] = []


def _check(condition: bool, message: str) -> None:
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {message}")
    if not condition:
        FAILURES.append(message)


def _parse_csv(csv_bytes: bytes) -> tuple[list[str], list[list[str]]]:
    """Row 1 = column headers, row 2 = full question text (added after this test was
    written), row 3+ = one row per respondent."""
    text = csv_bytes.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    return rows[0], rows[2:]


def test_single_select_reconciles_exactly() -> None:
    print("\n#### TEST 1: single-select tallies match results counts exactly ####")
    results = {
        "Do you exercise regularly?": [
            {"option": "Yes", "count": 7, "pct": 70.0},
            {"option": "No", "count": 3, "pct": 30.0},
        ],
    }
    persona_sample_sizes = {"persona_a": 10}
    persona_names_map = {"persona_a": "Persona A"}
    question_types = {"Do you exercise regularly?": "single_select"}

    csv_bytes = build_survey_results_csv_bytes(
        results, persona_sample_sizes, persona_names_map,
        seed="seed-1", question_types=question_types,
    )
    headers, rows = _parse_csv(csv_bytes)
    col = len(headers) - 1  # only one question column
    values = [row[col] for row in rows]

    _check(len(rows) == 10, f"10 respondent rows written (got {len(rows)})")
    tally = Counter(values)
    _check(tally.get("Yes", 0) == 7, f"'Yes' tally == 7 (got {tally.get('Yes', 0)})")
    _check(tally.get("No", 0) == 3, f"'No' tally == 3 (got {tally.get('No', 0)})")
    _check(all(v in ("Yes", "No") for v in values), "every respondent assigned exactly one option")


def test_multi_select_allows_multiple_and_reconciles() -> None:
    print("\n#### TEST 2: multi-select tallies match results counts exactly, allow >1 per respondent ####")
    results = {
        "Which wellness apps do you use?": [
            {"option": "Meditation", "count": 3, "pct": 30.0},
            {"option": "Fitness Tracker", "count": 6, "pct": 60.0},
            {"option": "Sleep Tracker", "count": 2, "pct": 20.0},
        ],
    }
    persona_sample_sizes = {"persona_a": 10}
    persona_names_map = {"persona_a": "Persona A"}
    question_types = {"Which wellness apps do you use?": "multi_select"}

    csv_bytes = build_survey_results_csv_bytes(
        results, persona_sample_sizes, persona_names_map,
        seed="seed-2", question_types=question_types,
    )
    headers, rows = _parse_csv(csv_bytes)
    col = len(headers) - 1
    cell_values = [row[col] for row in rows]
    picks_per_respondent = [
        [v.strip() for v in cell.split(";") if v.strip()] for cell in cell_values
    ]

    _check(len(rows) == 10, f"10 respondent rows written (got {len(rows)})")

    option_tally = Counter(opt for picks in picks_per_respondent for opt in picks)
    _check(option_tally.get("Meditation", 0) == 3, f"'Meditation' tally == 3 (got {option_tally.get('Meditation', 0)})")
    _check(option_tally.get("Fitness Tracker", 0) == 6, f"'Fitness Tracker' tally == 6 (got {option_tally.get('Fitness Tracker', 0)})")
    _check(option_tally.get("Sleep Tracker", 0) == 2, f"'Sleep Tracker' tally == 2 (got {option_tally.get('Sleep Tracker', 0)})")

    # This is the crux of the bug: total selections (11) exceeds respondent count (10),
    # which is only representable if at least one respondent picked more than one option.
    total_selections = sum(len(p) for p in picks_per_respondent)
    _check(total_selections == 11, f"total selections == 11, i.e. sum of independent option counts (got {total_selections})")
    _check(any(len(p) > 1 for p in picks_per_respondent), "at least one respondent has more than one selection")


def test_reconciles_with_questionnaire_overview_style_counts() -> None:
    print("\n#### TEST 3: CSV tallies reconcile against the same counts questionnaire_overview.csv would show ####")
    # Mixed single-select + multi-select in one questionnaire, across two personas —
    # mirrors the real /quant/{simulation_id}/transcripts flow (both CSVs derive from
    # the same `results` dict and question_types map).
    results = {
        "Primary motivation": [
            {"option": "Health", "count": 12, "pct": 60.0},
            {"option": "Social", "count": 8, "pct": 40.0},
        ],
        "Wellness apps used": [
            {"option": "Meditation", "count": 9, "pct": 45.0},
            {"option": "Journaling", "count": 5, "pct": 25.0},
        ],
    }
    persona_sample_sizes = {"persona_a": 12, "persona_b": 8}
    persona_names_map = {"persona_a": "Persona A", "persona_b": "Persona B"}
    question_types = {
        "Primary motivation": "single_select",
        "Wellness apps used": "multi_select",
    }

    csv_bytes = build_survey_results_csv_bytes(
        results, persona_sample_sizes, persona_names_map,
        seed="seed-3", question_types=question_types,
    )
    headers, rows = _parse_csv(csv_bytes)
    _check(len(rows) == 20, f"20 respondent rows written across both personas (got {len(rows)})")

    motivation_col = headers.index(next(h for h in headers if h.startswith("Q1_")))
    apps_col = headers.index(next(h for h in headers if h.startswith("Q2_")))

    motivation_tally = Counter(row[motivation_col] for row in rows)
    _check(motivation_tally.get("Health", 0) == 12, f"'Health' tally == 12 (got {motivation_tally.get('Health', 0)})")
    _check(motivation_tally.get("Social", 0) == 8, f"'Social' tally == 8 (got {motivation_tally.get('Social', 0)})")

    apps_tally = Counter()
    for row in rows:
        for opt in [v.strip() for v in row[apps_col].split(";") if v.strip()]:
            apps_tally[opt] += 1
    _check(apps_tally.get("Meditation", 0) == 9, f"'Meditation' tally == 9 (got {apps_tally.get('Meditation', 0)})")
    _check(apps_tally.get("Journaling", 0) == 5, f"'Journaling' tally == 5 (got {apps_tally.get('Journaling', 0)})")


def test_missing_question_type_defaults_to_single_select() -> None:
    print("\n#### TEST 4: question absent from question_types map falls back to single-select behavior ####")
    results = {
        "Untyped question": [
            {"option": "A", "count": 5, "pct": 50.0},
            {"option": "B", "count": 5, "pct": 50.0},
        ],
    }
    persona_sample_sizes = {"persona_a": 10}
    persona_names_map = {"persona_a": "Persona A"}

    csv_bytes = build_survey_results_csv_bytes(
        results, persona_sample_sizes, persona_names_map, seed="seed-4",
    )
    headers, rows = _parse_csv(csv_bytes)
    col = len(headers) - 1
    _check(all(";" not in row[col] for row in rows), "no multi-value cells when question_type is unknown")


if __name__ == "__main__":
    test_single_select_reconciles_exactly()
    test_multi_select_allows_multiple_and_reconciles()
    test_reconciles_with_questionnaire_overview_style_counts()
    test_missing_question_type_defaults_to_single_select()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED:")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("All checks PASSED.")
