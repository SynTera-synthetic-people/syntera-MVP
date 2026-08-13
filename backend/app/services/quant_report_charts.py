"""
Deterministic chart rendering for the quant Audience Characteristics section
(DECISION_INTELLIGENCE only — see extract_audience_characteristics in
report_generation_quant_claude.py).

Charts are rendered directly from the same `audience_characteristics` dict
that seeds the LLM's Table 1/Table 2 — never from LLM output, and chart TYPE
is never an LLM decision either (see ChartSelectionStrategy below) — so
there is no risk of a chart disagreeing with the numbers in the adjacent
table, and no dependency on the LLM faithfully reproducing markup.

Images are returned as base64 data URIs, never written to disk: the report
pipeline generates PDFs concurrently for different explorations, and a
disk-based cache keyed by question label would race across requests.

Charts are returned as ORDERED (label, data_uri) lists, one list per table
(sample_characteristics -> Table 1, sample_profile -> Table 2), in the same
order the corresponding rows are fed to the LLM. The report-rendering layer
pairs them with the LLM's rendered table by position (Nth chart-eligible
table in the Audience Characteristics section <-> Nth list here), not by
text-matching against the LLM's own phrasing of each label — the LLM is
free to shorten/reword a characteristic's label in the table, so matching
by source order is the only reliable correspondence.
"""

import io
import base64
from enum import Enum
from typing import Any, Dict, List, Optional, Protocol, Tuple

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

_DPI = 150
_MAX_OPTIONS = 8  # long tails (e.g. open-ended "Other" geographies) clutter a bar chart

# Brand palette (see quant_report_cta_prompt.py Section 8 "GLOBAL OUTPUT FORMATTING
# RULES": Navy #1F4788, Teal #40B5AD, Alert #C0392B, Warning #E67E22, Success #27AE60)
# reused here so charts read as one visual system with the rest of the report.
_BAR_COLOR = "#1F4788"
_PIE_COLORS = ["#1F4788", "#40B5AD", "#E67E22", "#27AE60", "#C0392B"]


# ---------------------------------------------------------------------------
# Chart type selection — a deterministic strategy, never an LLM decision.
#
# select_chart_type() evaluates a short list of (predicate, ChartType) rules
# in priority order and returns the first match; renderers are looked up
# from a registry keyed by ChartType. Adding a new chart type (e.g. a
# donut or stacked bar) means: add an enum member, add a renderer class
# implementing ChartRenderer, register it in _RENDERERS, and add one rule
# tuple — no existing rule or renderer needs to change.
#
# Rule PRIORITY (not the flat 1-6 numbering a spec might list them in)
# matters: "ordered categories" (Age, Income, Education) and "long labels"
# (Occupation, City, Role) must be checked BEFORE the 2/3-category pie
# rules, or a 3-category ordered field like Age would incorrectly become a
# pie chart before its override is ever consulted.
# ---------------------------------------------------------------------------


class ChartType(str, Enum):
    BAR = "bar"
    PIE = "pie"


class ChartRenderer(Protocol):
    def render(self, question: str, labels: List[str], percentages: List[float]) -> Optional[str]: ...


_RANKING_KEYWORDS = ("rank", "ranking", "priorit", "compar", " vs ", "versus")
_ORDERED_KEYWORDS = (
    "age", "income", "salary", "earning", "education", "qualification",
    "experience", "tenure", "band", "bracket", "grade", "generation",
)
_LONG_LABEL_KEYWORDS = (
    "occupation", "city", "profession", "role", "job title", "location",
    "designation", "company", "employer", "organization",
)
_LONG_OPTION_LABEL_THRESHOLD = 16  # chars; catches e.g. "Senior Product Manager"
_PIE_SUM_TOLERANCE = 5.0  # percentage points; allows for rounding, not for multi-select overlap


def _matches_any_keyword(text: str, keywords: Tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(kw in lowered for kw in keywords)


def _has_long_option_labels(labels: List[str]) -> bool:
    return any(len(label) > _LONG_OPTION_LABEL_THRESHOLD for label in labels)


def _sums_to_whole(percentages: List[float]) -> bool:
    """True when percentages plausibly partition a whole (single-select-shaped),
    within rounding tolerance — a multi-select question's percentages are
    independent and legitimately don't sum to ~100%, so those never qualify
    for a pie chart regardless of category count."""
    return abs(sum(percentages) - 100.0) <= _PIE_SUM_TOLERANCE


def select_chart_type(question: str, labels: List[str], percentages: List[float]) -> ChartType:
    """Deterministically pick a chart type for one question's option data.
    See module docstring for the rule-priority rationale."""
    rules: List[Tuple[bool, ChartType]] = [
        (_matches_any_keyword(question, _RANKING_KEYWORDS), ChartType.BAR),
        (_matches_any_keyword(question, _ORDERED_KEYWORDS), ChartType.BAR),
        (_matches_any_keyword(question, _LONG_LABEL_KEYWORDS) or _has_long_option_labels(labels), ChartType.BAR),
        (len(labels) == 2 and _sums_to_whole(percentages), ChartType.PIE),
        (len(labels) == 3 and not _has_long_option_labels(labels) and _sums_to_whole(percentages), ChartType.PIE),
    ]
    for matched, chart_type in rules:
        if matched:
            return chart_type
    return ChartType.BAR  # default: 4+ categories, or anything not otherwise pie-eligible


class HorizontalBarChartRenderer:
    """Bar chart for ordered, long-label, ranking, or 4+ category data."""

    _FIG_SIZE = (3.4, 2.0)

    def render(self, question: str, labels: List[str], percentages: List[float]) -> Optional[str]:
        if not labels:
            return None

        fig, ax = plt.subplots(figsize=self._FIG_SIZE, dpi=_DPI)
        try:
            bars = ax.barh(labels, percentages, color=_BAR_COLOR)
            ax.invert_yaxis()  # first option on top, matching table row order
            ax.set_xlabel("% of respondents", fontsize=6)
            ax.set_xlim(0, max(percentages + [10]) * 1.15)
            ax.tick_params(axis="both", labelsize=6)
            ax.spines["top"].set_visible(False)
            ax.spines["right"].set_visible(False)
            for bar, pct in zip(bars, percentages):
                ax.text(
                    bar.get_width() + 0.5,
                    bar.get_y() + bar.get_height() / 2,
                    f"{pct:.0f}%",
                    va="center",
                    fontsize=6,
                )
            fig.tight_layout()
            return _figure_to_data_uri(fig)
        finally:
            plt.close(fig)  # matplotlib figures leak otherwise across a long-lived worker process


class PieChartRenderer:
    """Pie chart for 2-3 category part-of-whole data with short labels."""

    _FIG_SIZE = (2.8, 2.2)

    def render(self, question: str, labels: List[str], percentages: List[float]) -> Optional[str]:
        if not labels:
            return None

        fig, ax = plt.subplots(figsize=self._FIG_SIZE, dpi=_DPI)
        try:
            colors = _PIE_COLORS[: len(labels)]
            wedges, _texts, autotexts = ax.pie(
                percentages,
                labels=labels,
                colors=colors,
                autopct="%1.0f%%",
                startangle=90,
                textprops={"fontsize": 6.5},
                wedgeprops={"edgecolor": "white", "linewidth": 1},
            )
            for autotext in autotexts:
                autotext.set_color("white")
                autotext.set_fontweight("bold")
            ax.axis("equal")
            fig.tight_layout()
            return _figure_to_data_uri(fig)
        finally:
            plt.close(fig)


def _figure_to_data_uri(fig) -> str:
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", bbox_inches="tight")
    buffer.seek(0)
    encoded = base64.b64encode(buffer.read()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


_RENDERERS: Dict[ChartType, ChartRenderer] = {
    ChartType.BAR: HorizontalBarChartRenderer(),
    ChartType.PIE: PieChartRenderer(),
}


def render_chart_base64(question: str, labels: List[str], percentages: List[float]) -> Optional[str]:
    """Select a chart type deterministically and render it. Single entry point
    used by _charts_for_rows below; also the extension point for callers that
    want a chart for arbitrary label/percentage data outside Audience
    Characteristics."""
    if not labels:
        return None
    chart_type = select_chart_type(question, labels, percentages)
    return _RENDERERS[chart_type].render(question, labels, percentages)


def _charts_for_rows(rows: List[Dict[str, Any]], value_key: str) -> List[Tuple[str, str]]:
    charts: List[Tuple[str, str]] = []
    for row in rows:
        question = row.get("question")
        values = row.get(value_key) or {}
        if not question or not values:
            continue

        # Largest options first; a long tail beyond _MAX_OPTIONS is dropped from the
        # chart only (the table alongside it still shows every option, per the
        # AH ground-truth rule that full tables are the authoritative record).
        sorted_values = sorted(
            values.items(), key=lambda kv: (kv[1] or {}).get("percentage", 0) or 0, reverse=True
        )[:_MAX_OPTIONS]
        labels = [str(k) for k, _ in sorted_values]
        percentages = [float((v or {}).get("percentage", 0) or 0) for _, v in sorted_values]

        chart = render_chart_base64(question, labels, percentages)
        if chart:
            charts.append((question, chart))
    return charts


def render_audience_characteristics_charts(
    audience_characteristics: Dict[str, Any],
) -> Dict[str, List[Tuple[str, str]]]:
    """Return {"sample_characteristics": [...], "sample_profile": [...]}, each an
    ordered list of (question_label, base64_png_data_uri) matching the order of
    the corresponding rows in `audience_characteristics`.

    A question with no options/responses in the source data produces no chart —
    consistent with the prompt's own "state plainly this data wasn't available"
    rule rather than a separate empty/error state to maintain.
    """
    if not audience_characteristics:
        return {"sample_characteristics": [], "sample_profile": []}

    characteristics_rows = (
        audience_characteristics.get("sample_characteristics", {}).get("questions_and_options", []) or []
    )
    profile_rows = audience_characteristics.get("sample_profile", {}).get("questions", []) or []

    return {
        "sample_characteristics": _charts_for_rows(characteristics_rows, "options"),
        "sample_profile": _charts_for_rows(profile_rows, "responses"),
    }
