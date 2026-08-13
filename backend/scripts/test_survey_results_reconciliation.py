"""Manual, standalone validation of _validate_survey_results_reconciliation() in
app/services/report_generation_quant_claude.py — the blocking gate generate_md_report()
runs on SurveySimulation.results before it reaches the LLM.

Context: SurveySimulation.results is always written by build_normalized_survey_results()
(survey_results_normalize.py) or _combine_persona_results() (survey_simulation_combined.py),
both of which already guarantee a respondent-count denominator for multi-select `pct` and an
exact total_sample_size sum for single-select counts — so in the current codebase this gate
should always pass on real data. Its job is to catch drift if a future write path bypasses
those helpers (or data gets hand-edited), which is exactly the failure mode the "Q12 shows 47%
instead of 42%" style audit finding describes: a multi-select percentage computed against the
wrong denominator.

No live API calls, no live DB — exercises _validate_survey_results_reconciliation() directly
against synthetic survey_results dicts.

Usage (from backend/):
    .venv/Scripts/python.exe scripts/test_survey_results_reconciliation.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.report_generation_quant_claude import _validate_survey_results_reconciliation

FAILURES: list[str] = []


def _check(condition: bool, message: str) -> None:
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {message}")
    if not condition:
        FAILURES.append(message)


def test_correctly_normalized_data_passes() -> None:
    print("\n#### TEST 1: correctly normalized single + multi-select data reconciles cleanly ####")
    total = 400
    survey_results = {
        "Do you exercise regularly?": [
            {"option": "Yes", "count": 240, "pct": 60.0},
            {"option": "No", "count": 160, "pct": 40.0},
        ],
        "Which wellness apps do you use?": [
            {"option": "Meditation", "count": 167, "pct": 41.8},
            {"option": "Streaks", "count": 45, "pct": 11.3},
        ],
    }
    question_types = {
        "Do you exercise regularly?": "single_select",
        "Which wellness apps do you use?": "multi_select",
    }
    issues = _validate_survey_results_reconciliation(survey_results, total, question_types)
    _check(issues == [], f"no issues on correctly normalized data (got {issues})")


def test_catches_multi_select_wrong_denominator() -> None:
    print("\n#### TEST 2: catches the audit's 'Q12 shows 47% instead of 42%' style bug ####")
    total = 400
    # 190/400 = 47.5% (matches the reported "wrong" 47%), but audit says true count is 167
    # (167/400 = 41.75% ~= 42%). Simulate the bug directly: pct computed against a different
    # denominator (e.g. 190/400 stored correctly=47.5, but here we corrupt it to look like it
    # was computed against total responses instead of respondents: 190/420=45.2, still wrong
    # relative to the true respondent-denominator value of 47.5 for count=190).
    survey_results = {
        "Which wellness apps do you use?": [
            {"option": "Meditation", "count": 190, "pct": 45.2},  # should be 47.5 for count=190/400
        ],
    }
    question_types = {"Which wellness apps do you use?": "multi_select"}
    issues = _validate_survey_results_reconciliation(survey_results, total, question_types)
    _check(len(issues) == 1, f"exactly one issue flagged (got {len(issues)}: {issues})")
    _check(bool(issues) and "wrong denominator" in issues[0], f"issue explains the denominator mismatch (got {issues})")


def test_catches_single_select_count_drift() -> None:
    print("\n#### TEST 3: catches single-select counts that don't sum to total_sample_size ####")
    total = 400
    survey_results = {
        "Primary motivation": [
            {"option": "Health", "count": 200, "pct": 50.0},
            {"option": "Social", "count": 110, "pct": 27.5},  # 200+110=310, missing 90 respondents
        ],
    }
    question_types = {"Primary motivation": "single_select"}
    issues = _validate_survey_results_reconciliation(survey_results, total, question_types)
    _check(len(issues) == 1, f"exactly one issue flagged (got {len(issues)}: {issues})")
    _check(bool(issues) and "sum to 310" in issues[0], f"issue reports the actual sum (got {issues})")


def test_multi_select_not_summing_to_total_is_fine() -> None:
    print("\n#### TEST 4: multi-select counts legitimately not summing to total_sample_size is NOT flagged ####")
    total = 400
    survey_results = {
        "Which wellness apps do you use?": [
            {"option": "Meditation", "count": 167, "pct": 41.8},
            {"option": "Streaks", "count": 45, "pct": 11.3},
            {"option": "Sleep", "count": 208, "pct": 52.0},  # sum = 420, > total_sample_size, by design
        ],
    }
    question_types = {"Which wellness apps do you use?": "multi_select"}
    issues = _validate_survey_results_reconciliation(survey_results, total, question_types)
    _check(issues == [], f"no issues even though option counts sum to 420 > 400 respondents (got {issues})")


def test_unknown_question_type_does_not_false_positive_on_sum() -> None:
    print("\n#### TEST 5: unknown question_type skips the single-select sum check (avoids false positives) ####")
    total = 400
    survey_results = {
        "Untyped question": [
            {"option": "A", "count": 167, "pct": 41.8},
            {"option": "B", "count": 45, "pct": 11.3},
        ],
    }
    issues = _validate_survey_results_reconciliation(survey_results, total, question_types={})
    _check(issues == [], f"no sum-mismatch issue when the question's type is unknown (got {issues})")


def test_multi_select_count_exceeding_total_is_flagged() -> None:
    print("\n#### TEST 6: a multi-select option count above total_sample_size is impossible and flagged ####")
    total = 400
    survey_results = {
        "Which wellness apps do you use?": [
            {"option": "Meditation", "count": 450, "pct": 100.0},
        ],
    }
    question_types = {"Which wellness apps do you use?": "multi_select"}
    issues = _validate_survey_results_reconciliation(survey_results, total, question_types)
    _check(any("exceeds total_sample_size" in i for i in issues), f"count > total_sample_size flagged (got {issues})")


if __name__ == "__main__":
    test_correctly_normalized_data_passes()
    test_catches_multi_select_wrong_denominator()
    test_catches_single_select_count_drift()
    test_multi_select_not_summing_to_total_is_fine()
    test_unknown_question_type_does_not_false_positive_on_sum()
    test_multi_select_count_exceeding_total_is_flagged()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED:")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("All checks PASSED.")
