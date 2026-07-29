"""Manual, standalone validation of the Audience Characteristics chart pipeline:
app/services/quant_report_charts.py (chart rendering) and the chart-injection
logic added to _normalize_quant_tables() in
app/services/report_generation_quant_claude.py.

Context: production validation against a real generated DI report (2026-07-29)
showed two bugs this test suite is written to catch:

1. The LLM renders Table 1 (Sample Characteristics) / Table 2 (Sample Profile)
   as ONE combined table per Table 1/Table 2, with rows grouped in blocks by
   question (first row of each block carries the "Characteristic"/"Question"
   label, continuation rows leave that cell blank) — NOT one table per
   question as originally assumed. Charts must be matched positionally against
   which chart-eligible table is encountered Nth in the section (Table 1 then
   Table 2), and each combined table must be split into one short mini-table
   per characteristic so it can be paired side by side with its own chart.
2. A fully empty <td></td> (a blank continuation cell) broke xhtml2pdf's
   <colgroup> column-width resolution for the WHOLE table, collapsing/
   overlapping columns — reproduced with the unmodified renderer before any
   chart code was involved, so _escape_text() now substitutes a non-breaking
   space for empty cell content project-wide.

Also covers a third bug found the same way, one iteration later: a
characteristic's subheading rendered as a sibling element ahead of its
chart+table row could be stranded alone at the bottom of a page while the
(atomic, unsplittable) row below it moved to the next page — reproduced by
generating a real PDF and inspecting element bounding boxes with
pdfminer.six. Fixed by moving the heading INSIDE the same <tr> as the chart
cell (see _wrap_table_with_chart in report_generation_quant_claude.py) —
verified empirically that xhtml2pdf keeps everything in one <tr> together,
but does NOT reliably keep multiple <tr>s of the same <table> together even
with page-break-inside:avoid on the table itself.

Also covers the deterministic chart-type selection strategy (pie vs.
horizontal bar) in quant_report_charts.py — chart type is never an LLM
decision.

No live API calls, no live DB, no PDF rendering here (see backend/scripts/
_scratch_*.py, not checked in, for how each fix above was verified against
an actual xhtml2pdf-rendered PDF via pdfminer.six bounding boxes).

Usage (from backend/):
    .venv/Scripts/python.exe scripts/test_quant_charts.py
"""
from __future__ import annotations

import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.quant_report_charts import (
    ChartType,
    render_audience_characteristics_charts,
    select_chart_type,
)
from app.services.report_generation_quant_claude import _escape_text, _normalize_quant_tables

FAILURES: list[str] = []


def _check(condition: bool, message: str) -> None:
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {message}")
    if not condition:
        FAILURES.append(message)


_SAMPLE_AUDIENCE_CHARACTERISTICS = {
    "sample_characteristics": {
        "questions_and_options": [
            {
                "question": "City of residence",
                "options": {
                    "Mumbai": {"count": 1960, "percentage": 49.0},
                    "Bangalore": {"count": 2040, "percentage": 51.0},
                },
            },
            {
                "question": "Age",
                "options": {
                    "25-29": {"count": 1220, "percentage": 31.0},
                    "30-34": {"count": 1680, "percentage": 42.0},
                    "35-40": {"count": 1100, "percentage": 28.0},
                },
            },
        ]
    },
    "sample_profile": {
        "questions": [
            {
                "question": "Marital status",
                "responses": {
                    "Single": {"count": 1530, "percentage": 38.0},
                    "Married": {"count": 2220, "percentage": 56.0},
                    "Other": {"count": 250, "percentage": 6.0},
                },
            },
        ]
    },
}


# The real markdown-table shape the LLM actually produces (verified against a
# generated PDF): ONE table per Table 1/Table 2, "Characteristic"/"Question"
# blank on continuation rows within the same group.
_REAL_SHAPE_HTML = (
    "<h2>AUDIENCE CHARACTERISTICS</h2>"
    "<p>Narrative paragraph describing the sample in prose, not reusing the exact question labels.</p>"
    "<p><strong>Table 1, Sample Characteristics</strong></p>"
    "<table><thead><tr><th>Characteristic</th><th>Option</th><th>Count</th><th>Percentage</th></tr></thead>"
    "<tbody>"
    "<tr><td>City of residence</td><td>Mumbai</td><td>1,960</td><td>49%</td></tr>"
    "<tr><td></td><td>Bangalore</td><td>2,040</td><td>51%</td></tr>"
    "<tr><td>Age</td><td>25-29</td><td>1,220</td><td>31%</td></tr>"
    "<tr><td></td><td>30-34</td><td>1,680</td><td>42%</td></tr>"
    "<tr><td></td><td>35-40</td><td>1,100</td><td>28%</td></tr>"
    "</tbody></table>"
    "<p><strong>Table 2, Sample Profile</strong></p>"
    "<table><thead><tr><th>Question</th><th>Response</th><th>Count</th><th>Percentage</th></tr></thead>"
    "<tbody>"
    "<tr><td>Marital status</td><td>Single</td><td>1,530</td><td>38%</td></tr>"
    "<tr><td></td><td>Married</td><td>2,220</td><td>56%</td></tr>"
    "<tr><td></td><td>Other</td><td>250</td><td>6%</td></tr>"
    "</tbody></table>"
    "<h2>DECISION BRIEF</h2>"
    "<table><thead><tr><th>Unrelated</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>"
)


def test_charts_are_ordered_lists_per_table() -> None:
    print("\n#### TEST 1: charts are returned as ordered (label, chart) lists per table, not a flat dict ####")
    charts = render_audience_characteristics_charts(_SAMPLE_AUDIENCE_CHARACTERISTICS)
    _check(
        [label for label, _ in charts["sample_characteristics"]] == ["City of residence", "Age"],
        f"sample_characteristics preserves source order (got {[l for l, _ in charts['sample_characteristics']]})",
    )
    _check(
        [label for label, _ in charts["sample_profile"]] == ["Marital status"],
        f"sample_profile preserves source order (got {[l for l, _ in charts['sample_profile']]})",
    )
    for _, data_uri in charts["sample_characteristics"] + charts["sample_profile"]:
        _check(data_uri.startswith("data:image/png;base64,"), "every chart is a base64 PNG data URI")
        raw = data_uri.split(",", 1)[1]
        decoded = base64.b64decode(raw, validate=True)
        _check(decoded[:8] == b"\x89PNG\r\n\x1a\n", "chart decodes to a PNG file signature")


def test_empty_audience_characteristics_yields_no_charts() -> None:
    print("\n#### TEST 2: empty/missing audience_characteristics never raises, yields empty lists ####")
    empty = render_audience_characteristics_charts({})
    _check(empty == {"sample_characteristics": [], "sample_profile": []}, "empty dict -> empty lists")
    none_result = render_audience_characteristics_charts(None)
    _check(none_result == {"sample_characteristics": [], "sample_profile": []}, "None -> empty lists")


def test_real_shape_splits_into_subblocks_with_charts() -> None:
    print("\n#### TEST 3: a combined LLM table is split into one chart-paired mini-block per characteristic ####")
    charts = render_audience_characteristics_charts(_SAMPLE_AUDIENCE_CHARACTERISTICS)
    normalized = _normalize_quant_tables(_REAL_SHAPE_HTML, charts)

    _check(
        normalized.count('class="quant-chart-heading-cell"') == 3,
        f"3 subblocks total: City of residence + Age (Table 1) + Marital status (Table 2), "
        f"got {normalized.count('quant-chart-heading-cell')}",
    )
    _check(
        normalized.count('class="quant-chart-table-layout"') == 3,
        f"all 3 subblocks got a chart, rendered as one atomic chart+heading+table row each, got "
        f"{normalized.count('quant-chart-table-layout')}",
    )
    _check(
        "quant-audience-subblock" not in normalized,
        "the no-chart fallback wrapper is unused when every characteristic has a chart",
    )

    # Full data URI, not a short prefix: PNG headers share identical leading
    # bytes across small charts of the same size, so a short prefix isn't a
    # reliable per-chart fingerprint.
    city_chart = dict(charts["sample_characteristics"])["City of residence"]
    age_chart = dict(charts["sample_characteristics"])["Age"]
    marital_chart = dict(charts["sample_profile"])["Marital status"]

    city_pos = normalized.find(city_chart)
    age_pos = normalized.find(age_chart)
    marital_pos = normalized.find(marital_chart)
    _check(-1 not in (city_pos, age_pos, marital_pos), "every chart's own image bytes appear in the output")
    _check(
        city_pos < age_pos < marital_pos,
        f"charts appear in source order: City({city_pos}) < Age({age_pos}) < Marital({marital_pos})",
    )

    unrelated_table_idx = normalized.find(">Unrelated<")
    last_subblock_end = normalized.rfind("quant-chart-table-layout")
    _check(
        unrelated_table_idx != -1 and last_subblock_end < unrelated_table_idx,
        "the unrelated table outside Audience Characteristics is untouched (not wrapped/split)",
    )
    _check("<td>Mumbai</td>" in normalized, "row data survives the split (Mumbai option preserved)")
    _check("<td>Married</td>" in normalized, "row data survives the split (Married response preserved)")


def test_no_charts_still_splits_but_renders_without_images() -> None:
    print("\n#### TEST 4: an empty chart map still splits into subblocks, just without chart images ####")
    normalized = _normalize_quant_tables(_REAL_SHAPE_HTML, {})
    _check(normalized.count('class="quant-audience-subblock"') == 3, "still splits into 3 subblocks")
    _check(normalized.count('class="quant-chart-heading-cell"') == 3, "every subblock still gets its heading")
    _check("quant-chart-table-layout" not in normalized, "no chart wraps when no charts are available")
    _check("<td>Bangalore</td>" in normalized, "table data still renders correctly")


def test_omitted_audience_charts_arg_is_backward_compatible() -> None:
    print("\n#### TEST 5: omitting the audience_charts arg entirely matches passing {} (backward compatible) ####")
    normalized_no_arg = _normalize_quant_tables(_REAL_SHAPE_HTML)
    normalized_empty = _normalize_quant_tables(_REAL_SHAPE_HTML, {})
    _check(normalized_no_arg == normalized_empty, "omitted vs explicit {} produce identical output")


def test_malformed_first_cell_falls_back_to_plain_table() -> None:
    print("\n#### TEST 6: a table with no label on its first row falls back to the plain compact renderer ####")
    html_body = (
        "<h2>AUDIENCE CHARACTERISTICS</h2>"
        "<table><thead><tr><th>Characteristic</th><th>Option</th><th>Count</th><th>Percentage</th></tr></thead>"
        "<tbody><tr><td></td><td>Mumbai</td><td>1,960</td><td>49%</td></tr></tbody></table>"
    )
    normalized = _normalize_quant_tables(html_body, {"sample_characteristics": [("City", "data:image/png;base64,x")]})
    _check("quant-audience-subblock" not in normalized, "malformed table is not split")
    _check("<td>Mumbai</td>" in normalized or "Mumbai" in normalized, "data still renders via the plain fallback")


def test_escape_text_never_emits_a_fully_empty_cell() -> None:
    print("\n#### TEST 7: _escape_text substitutes &nbsp; for blank cells (fixes the xhtml2pdf colgroup bug) ####")
    _check(_escape_text("") == "&nbsp;", "empty string -> &nbsp;")
    _check(_escape_text(None) == "&nbsp;", "None -> &nbsp;")
    _check(_escape_text("Mumbai") == "Mumbai", "non-empty text is unaffected")


def test_heading_lives_inside_the_atomic_chart_row() -> None:
    print("\n#### TEST 8: a characteristic's heading is inside the SAME <tr> as its chart, not a preceding sibling ####")
    charts = {"sample_characteristics": [("City of residence", "data:image/png;base64,ABC")]}
    html_body = (
        "<h2>AUDIENCE CHARACTERISTICS</h2>"
        "<table><thead><tr><th>Characteristic</th><th>Option</th><th>Count</th><th>Percentage</th></tr></thead>"
        "<tbody><tr><td>City of residence</td><td>Mumbai</td><td>1,960</td><td>49%</td></tr></tbody></table>"
    )
    normalized = _normalize_quant_tables(html_body, charts)

    table_start = normalized.find('<table class="quant-chart-table-layout">')
    table_end = normalized.find("</table>", table_start) + len("</table>")
    block = normalized[table_start:table_end]
    _check(table_start != -1, "the chart+table block renders as a quant-chart-table-layout table")

    heading_pos = block.find("quant-chart-heading-cell")
    img_pos = block.find("<img")
    _check(heading_pos != -1 and img_pos != -1, "heading and image are both present in the block")

    # The nested mini-table (Option/Count/Percentage) has its OWN <tr>s, so
    # counting <tr> across the whole block isn't meaningful — what matters is
    # that no </tr> closes before BOTH the heading and the image have
    # appeared, i.e. they're both still inside the single outer row.
    region = block[: max(heading_pos, img_pos) + 10]
    _check(region.count("<tr>") == 1, f"exactly one <tr> opened before both heading and image appear (found {region.count('<tr>')})")
    _check(region.count("</tr>") == 0, "no </tr> has closed yet when both heading and image appear — same outer row")


# Every example from the product spec, plus real questions observed in a
# generated report — see select_chart_type()'s docstring for why override
# rules (ranking/ordered/long-label) must be checked before the 2/3-category
# pie rules.
_CHART_TYPE_CASES = [
    ("Gender", ["Male", "Female"], [48.0, 52.0], ChartType.PIE),
    ("Urban or Rural", ["Urban", "Rural"], [60.0, 40.0], ChartType.PIE),
    ("Do you have children?", ["Yes", "No"], [43.0, 57.0], ChartType.PIE),
    ("Marital status", ["Single", "Married", "Other"], [38.0, 56.0, 6.0], ChartType.PIE),
    ("Age Group", ["25-29", "30-34", "35-40"], [31.0, 42.0, 28.0], ChartType.BAR),
    ("Approximate annual household income", ["Below INR 3 lakh", "INR 3-6 lakh", "Above INR 6 lakh"], [30.0, 50.0, 20.0], ChartType.BAR),
    ("Highest educational qualification", ["High School", "Undergraduate", "Postgraduate"], [18.0, 50.0, 33.0], ChartType.BAR),
    ("Occupation", ["Business", "Service"], [38.0, 62.0], ChartType.BAR),
    ("City of residence", ["Mumbai", "Bangalore"], [49.0, 51.0], ChartType.BAR),
    ("Profession", ["Doctor", "Engineer", "Teacher", "Lawyer"], [25.0, 30.0, 25.0, 20.0], ChartType.BAR),
    ("Role", ["Senior Product Manager", "Consultant", "Growth Lead"], [34.0, 34.0, 32.0], ChartType.BAR),
    ("Rank your top priority", ["Price", "Quality"], [55.0, 45.0], ChartType.BAR),
    ("Industry", ["Fintech", "Tech", "Consulting", "Retail"], [35.0, 41.0, 14.0, 10.0], ChartType.BAR),
    # Multi-select: percentages don't sum to ~100 -> never pie, even with 2 options.
    ("Which platforms do you use?", ["Instagram", "WhatsApp"], [70.0, 65.0], ChartType.BAR),
]


def test_chart_type_selection_matches_spec() -> None:
    print("\n#### TEST 9: deterministic chart-type selection matches every product-spec example ####")
    for question, labels, percentages, expected in _CHART_TYPE_CASES:
        got = select_chart_type(question, labels, percentages)
        _check(got == expected, f"{question!r} ({len(labels)} categories) -> {got.value} (expected {expected.value})")


def test_chart_renderers_produce_visually_distinct_pngs() -> None:
    print("\n#### TEST 10: pie and bar renderers both produce valid, differently-shaped PNGs ####")
    charts = render_audience_characteristics_charts(
        {
            "sample_characteristics": {
                "questions_and_options": [
                    {"question": "Gender", "options": {  # -> pie
                        "Male": {"count": 192, "percentage": 48.0},
                        "Female": {"count": 208, "percentage": 52.0},
                    }},
                    {"question": "Age Group", "options": {  # -> bar (ordered keyword)
                        "18-25": {"count": 60, "percentage": 15.0},
                        "26-35": {"count": 340, "percentage": 85.0},
                    }},
                ]
            }
        }
    )
    by_label = dict(charts["sample_characteristics"])
    for label in ("Gender", "Age Group"):
        raw = base64.b64decode(by_label[label].split(",", 1)[1], validate=True)
        _check(raw[:8] == b"\x89PNG\r\n\x1a\n", f"{label!r} chart decodes to a valid PNG")
    _check(by_label["Gender"] != by_label["Age Group"], "pie and bar charts produce different image bytes")


if __name__ == "__main__":
    test_charts_are_ordered_lists_per_table()
    test_empty_audience_characteristics_yields_no_charts()
    test_real_shape_splits_into_subblocks_with_charts()
    test_no_charts_still_splits_but_renders_without_images()
    test_omitted_audience_charts_arg_is_backward_compatible()
    test_malformed_first_cell_falls_back_to_plain_table()
    test_escape_text_never_emits_a_fully_empty_cell()
    test_heading_lives_inside_the_atomic_chart_row()
    test_chart_type_selection_matches_spec()
    test_chart_renderers_produce_visually_distinct_pngs()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED:")
        for f in FAILURES:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("All checks PASSED.")
