"""Data Playground analysis computations (frequency, crosstab now; chart/
insights land in later phases).

Every analysis is cached in dp_analysis, keyed by (dataset_id, analysis_type,
parameters) — an identical re-run is served from Postgres instead of
re-reading the file and recomputing. Row access always goes through
data_playground.dataframe_for_dataset(), the single source-of-truth reader.
"""

import logging
from typing import Any, Iterable, Optional

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_playground import DataPlaygroundAnalysis, DataPlaygroundDataset
from app.services.data_playground import (
    _cell,
    _sort_labels,
    dataframe_for_dataset,
    list_variables,
)

logger = logging.getLogger(__name__)


# ── Analysis cache (dp_analysis) ────────────────────────────────────────────

async def _get_cached_analysis(
    db: AsyncSession, dataset_id: str, analysis_type: str, parameters: dict[str, Any]
) -> Optional[dict[str, Any]]:
    result = await db.execute(
        select(DataPlaygroundAnalysis).where(
            DataPlaygroundAnalysis.dataset_id == dataset_id,
            DataPlaygroundAnalysis.analysis_type == analysis_type,
        )
    )
    for row in result.scalars().all():
        if row.parameters == parameters:
            return row.result
    return None


async def _save_analysis(
    db: AsyncSession,
    *,
    dataset_id: str,
    analysis_type: str,
    parameters: dict[str, Any],
    result: dict[str, Any],
    user_id: Optional[str],
) -> None:
    db.add(
        DataPlaygroundAnalysis(
            dataset_id=dataset_id,
            analysis_type=analysis_type,
            parameters=parameters,
            result=result,
            created_by=user_id,
        )
    )
    await db.commit()


# ── Shared category ordering ────────────────────────────────────────────────

def _category_order(
    value_labels: Optional[list[dict[str, Any]]],
    observed_values: Iterable[str],
    *,
    include_all_known: bool = False,
) -> list[str]:
    """Row/column order for a variable's categories: the stable order from
    value_labels assigned at ingest (keeps Frequency Table / Cross Tabs /
    future Coded-Labelled Data consistent), then any observed value not
    covered by that map (numeric/open_text/identifier variables have no
    value_labels) appended via the same alphabetical/numeric sort used at
    ingest. With include_all_known=True, every known category is kept even
    if it has zero occurrences here — used for crosstabs, where banner
    columns should stay a fixed, comparable shape across tables."""
    known_labels = [item["label"] for item in (value_labels or [])]
    known_set = set(known_labels)
    observed_set = set(observed_values)
    order = list(known_labels) if include_all_known else [
        label for label in known_labels if label in observed_set
    ]
    leftover = _sort_labels(list(observed_set - known_set))
    return order + leftover


def _clean_series(series: pd.Series) -> pd.Series:
    """Trim + blank-to-missing normalization, without dropping rows — keeps
    index alignment so two cleaned columns can be paired and dropna()'d
    together (crosstab needs both variables missing-in-either dropped)."""
    cleaned = series.map(_cell)
    return cleaned.mask(cleaned == "")


# ── Frequency ────────────────────────────────────────────────────────────────

def _frequency_for_variable(df, total_rows: int, variable) -> dict[str, Any]:
    name = variable.variable_name
    series = df[name].dropna().astype(str).str.strip()
    series = series[series != ""]
    non_missing = len(series)
    missing = total_rows - non_missing

    counts = series.value_counts()
    order = _category_order(variable.value_labels, counts.index.tolist())

    rows = []
    cumulative = 0.0
    for label in order:
        frequency = int(counts.get(label, 0))
        if frequency == 0:
            continue
        percent = round(frequency / total_rows * 100, 1) if total_rows else 0.0
        valid_percent = round(frequency / non_missing * 100, 1) if non_missing else 0.0
        cumulative = round(cumulative + valid_percent, 1)
        rows.append(
            {
                "label": label,
                "frequency": frequency,
                "percent": percent,
                "valid_percent": valid_percent,
                "cumulative_percent": cumulative,
            }
        )

    return {
        "variable": name,
        "title": variable.display_name,
        "base": total_rows,
        "missing": missing,
        "rows": rows,
    }


async def compute_frequency(
    db: AsyncSession,
    dataset: DataPlaygroundDataset,
    variables: list[str],
    user_id: Optional[str],
) -> dict[str, Any]:
    known = await list_variables(db, dataset_id=dataset.id)
    known_by_name = {v.variable_name: v for v in known}
    unknown = [name for name in variables if name not in known_by_name]
    if unknown:
        raise ValueError(f"Unknown variable(s): {', '.join(unknown)}")

    parameters = {"variables": variables}
    cached = await _get_cached_analysis(db, dataset.id, "frequency", parameters)
    if cached is not None:
        return cached

    df = dataframe_for_dataset(dataset)
    total_rows = len(df)
    results = [
        _frequency_for_variable(df, total_rows, known_by_name[name])
        for name in variables
    ]
    payload = {"results": results}

    await _save_analysis(
        db,
        dataset_id=dataset.id,
        analysis_type="frequency",
        parameters=parameters,
        result=payload,
        user_id=user_id,
    )
    return payload


# ── Cross tabs ───────────────────────────────────────────────────────────────

def _crosstab_table(
    df, total_rows: int, banner_name: str, banner_series: pd.Series,
    column_labels: list[str], base_by_column: list[int], main_variable,
) -> dict[str, Any]:
    main_name = main_variable.variable_name
    main_series = _clean_series(df[main_name])

    pair = pd.DataFrame({"main": main_series, "banner": banner_series}).dropna()
    counts = pd.crosstab(pair["main"], pair["banner"]) if not pair.empty else pd.DataFrame()

    row_labels = _category_order(
        main_variable.value_labels, pair["main"].unique().tolist(), include_all_known=True
    )
    label_to_code = {item["label"]: item["code"] for item in (main_variable.value_labels or [])}
    counts = counts.reindex(index=row_labels, columns=column_labels, fill_value=0)

    rows = []
    for row_label in row_labels:
        row_counts = counts.loc[row_label]
        row_total = int(row_counts.sum())
        total_pct = round(row_total / total_rows * 100, 1) if total_rows else 0.0

        # Leading "Total" column: the grand total across the whole sample,
        # unbroken by banner. Every crosstab table in the approved design
        # leads with this column before the per-banner-category ones — it's
        # not one of the mutually-exclusive banner segments, so both its
        # col_pct and row_pct are just the row's share of the full sample.
        cells = [{"count": row_total, "col_pct": total_pct, "row_pct": total_pct}]
        cells += [
            {
                "count": int(row_counts[col_label]),
                "col_pct": round(int(row_counts[col_label]) / col_base * 100, 1) if col_base else 0.0,
                "row_pct": round(int(row_counts[col_label]) / row_total * 100, 1) if row_total else 0.0,
            }
            for col_label, col_base in zip(column_labels, base_by_column)
        ]
        rows.append(
            {
                "code": label_to_code.get(row_label),
                "label": row_label,
                "total": {"count": row_total, "pct": total_pct},
                "cells": cells,
            }
        )

    columns = [{"banner_variable": None, "label": "Total"}]
    columns += [{"banner_variable": banner_name, "label": label} for label in column_labels]

    return {
        "main_variable": main_name,
        "title": main_variable.display_name,
        "banner_title": None,  # filled in by the caller (shared across all tables)
        "columns": columns,
        "base": {"total": total_rows, "by_column": [total_rows, *base_by_column]},
        "rows": rows,
    }


async def compute_crosstab(
    db: AsyncSession,
    dataset: DataPlaygroundDataset,
    banner_variables: list[str],
    main_variables: list[str],
    user_id: Optional[str],
) -> dict[str, Any]:
    if not banner_variables:
        raise ValueError("At least one banner variable is required")
    if not main_variables:
        raise ValueError("At least one main variable is required")

    known = await list_variables(db, dataset_id=dataset.id)
    known_by_name = {v.variable_name: v for v in known}
    unknown = [n for n in [*banner_variables, *main_variables] if n not in known_by_name]
    if unknown:
        raise ValueError(f"Unknown variable(s): {', '.join(sorted(set(unknown)))}")

    parameters = {"banner_variables": banner_variables, "main_variables": main_variables}
    cached = await _get_cached_analysis(db, dataset.id, "crosstab", parameters)
    if cached is not None:
        return cached

    df = dataframe_for_dataset(dataset)
    total_rows = len(df)

    # V1 simplification: only the first banner variable defines columns —
    # matches the current UI, which renders one fixed banner column set
    # regardless of how many banner variables are added. Every requested
    # banner variable still contributes to banner_title, same as the UI's
    # getBannerTitle() joining all selected banner labels.
    banner_name = banner_variables[0]
    banner_variable = known_by_name[banner_name]
    banner_series = _clean_series(df[banner_name])
    banner_counts = banner_series.dropna().value_counts()
    column_labels = _category_order(
        banner_variable.value_labels, banner_counts.index.tolist(), include_all_known=True
    )
    base_by_column = [int(banner_counts.get(label, 0)) for label in column_labels]
    banner_title = ", ".join(known_by_name[n].display_name for n in banner_variables)

    tables = []
    for main_name in main_variables:
        table = _crosstab_table(
            df, total_rows, banner_name, banner_series,
            column_labels, base_by_column, known_by_name[main_name],
        )
        table["banner_title"] = banner_title
        tables.append(table)

    payload = {"tables": tables}
    await _save_analysis(
        db,
        dataset_id=dataset.id,
        analysis_type="crosstab",
        parameters=parameters,
        result=payload,
        user_id=user_id,
    )
    return payload


# ── Charts ───────────────────────────────────────────────────────────────────

_ALLOWED_CHART_TYPES = {"bar", "line", "pie", "dual"}


def _chart_overlay(df, known_by_name: dict[str, Any], variables: list[str]) -> dict[str, Any]:
    """No breakdown: one series per requested variable over a shared label
    axis (e.g. comparing several same-scale grid questions like S7_1..S7_7).
    Each series' percentages are relative to its own total, standard for
    bar/pie chart labels."""
    total_rows = len(df)
    per_var_counts: dict[str, pd.Series] = {}
    all_observed: set[str] = set()
    for name in variables:
        series = df[name].dropna().astype(str).str.strip()
        series = series[series != ""]
        counts = series.value_counts()
        per_var_counts[name] = counts
        all_observed.update(counts.index.tolist())

    primary_variable = known_by_name[variables[0]]
    labels = _category_order(primary_variable.value_labels, all_observed)

    series_out = []
    for name in variables:
        counts = per_var_counts[name]
        values = [int(counts.get(label, 0)) for label in labels]
        series_total = sum(values)
        percentages = [
            round(v / series_total * 100, 1) if series_total else 0.0 for v in values
        ]
        series_out.append({"name": name, "values": values, "percentages": percentages})

    return {"labels": labels, "series": series_out, "base": total_rows}


async def _chart_with_breakdown(
    db: AsyncSession,
    dataset: DataPlaygroundDataset,
    main_variable: str,
    breakdown_variable: str,
    user_id: Optional[str],
) -> dict[str, Any]:
    """Reuses compute_crosstab (main variable x breakdown variable) and
    transposes it into chart series — one series per breakdown category, so
    the same counts stay consistent between Cross Tabs and Chart/Visuals
    instead of a second, divergent computation path."""
    crosstab_payload = await compute_crosstab(db, dataset, [breakdown_variable], [main_variable], user_id)
    table = crosstab_payload["tables"][0]
    labels = [row["label"] for row in table["rows"]]
    series_out = [
        {
            "name": column["label"],
            "values": [row["cells"][col_idx]["count"] for row in table["rows"]],
            "percentages": [row["cells"][col_idx]["col_pct"] for row in table["rows"]],
        }
        for col_idx, column in enumerate(table["columns"])
        if column["banner_variable"] is not None  # skip the synthetic Total column
    ]
    return {"labels": labels, "series": series_out, "base": table["base"]["total"]}


async def compute_chart(
    db: AsyncSession,
    dataset: DataPlaygroundDataset,
    variables: list[str],
    chart_type: str,
    breakdown_variable: Optional[str],
    user_id: Optional[str],
) -> dict[str, Any]:
    if not variables:
        raise ValueError("At least one variable is required")
    if chart_type not in _ALLOWED_CHART_TYPES:
        raise ValueError(f"Unsupported chart_type. Must be one of {sorted(_ALLOWED_CHART_TYPES)}")
    if breakdown_variable and len(variables) != 1:
        raise ValueError("breakdown_variable requires exactly one variable in 'variables'")

    known = await list_variables(db, dataset_id=dataset.id)
    known_by_name = {v.variable_name: v for v in known}
    requested = [*variables, *([breakdown_variable] if breakdown_variable else [])]
    unknown = [n for n in requested if n not in known_by_name]
    if unknown:
        raise ValueError(f"Unknown variable(s): {', '.join(sorted(set(unknown)))}")

    parameters = {
        "variables": variables,
        "chart_type": chart_type,
        "breakdown_variable": breakdown_variable,
    }
    cached = await _get_cached_analysis(db, dataset.id, "chart", parameters)
    if cached is not None:
        return cached

    if breakdown_variable:
        shaped = await _chart_with_breakdown(db, dataset, variables[0], breakdown_variable, user_id)
    else:
        shaped = _chart_overlay(dataframe_for_dataset(dataset), known_by_name, variables)

    payload = {"chart_type": chart_type, **shaped}
    await _save_analysis(
        db,
        dataset_id=dataset.id,
        analysis_type="chart",
        parameters=parameters,
        result=payload,
        user_id=user_id,
    )
    return payload


# ── Insights ─────────────────────────────────────────────────────────────────
# Rule-based only in V1 — no LLM. Each rule below is independent and cheap;
# this is meant to be a starting skeleton, not an exhaustive stats engine.

_MISSING_RATE_THRESHOLD = 0.3    # >=30% missing on a variable -> anomaly
_CONCENTRATION_THRESHOLD = 0.6   # >=60% of valid responses in one category -> key pattern
_LOW_BASE_THRESHOLD = 30         # dataset smaller than this -> anomaly
_MAX_LISTED = 5                  # cap each list to the most notable N, most-severe first


async def compute_insights(
    db: AsyncSession, dataset: DataPlaygroundDataset, user_id: Optional[str]
) -> dict[str, Any]:
    parameters: dict[str, Any] = {}
    cached = await _get_cached_analysis(db, dataset.id, "insights", parameters)
    if cached is not None:
        return cached

    variables = await list_variables(db, dataset_id=dataset.id)
    total_rows = dataset.row_count
    df = dataframe_for_dataset(dataset) if variables else None

    missing_candidates: list[tuple[float, str]] = []
    single_category: list[str] = []
    concentration_candidates: list[tuple[float, str, str]] = []

    for variable in variables:
        missing_rate = variable.missing_count / total_rows if total_rows else 0.0
        if missing_rate >= _MISSING_RATE_THRESHOLD:
            missing_candidates.append((missing_rate, variable.variable_name))

        if variable.data_type not in {"categorical", "demographic"} or not total_rows:
            continue
        if variable.unique_values_count == 1 and variable.missing_count < total_rows:
            single_category.append(variable.variable_name)
        elif variable.unique_values_count > 1:
            series = df[variable.variable_name].dropna().astype(str).str.strip()
            series = series[series != ""]
            if len(series):
                counts = series.value_counts()
                share = counts.iloc[0] / len(series)
                if share >= _CONCENTRATION_THRESHOLD:
                    concentration_candidates.append((share, variable.variable_name, counts.index[0]))

    anomalies = [
        f"{name} has {round(rate * 100, 1)}% missing values"
        for rate, name in sorted(missing_candidates, key=lambda x: -x[0])[:_MAX_LISTED]
    ]
    anomalies += [
        f"{name} has a single category (no variance)" for name in single_category[:_MAX_LISTED]
    ]
    if total_rows and total_rows < _LOW_BASE_THRESHOLD:
        anomalies.append(
            f"Sample size is small (N={total_rows}); results may not be statistically reliable"
        )

    key_patterns = [
        f"{round(share * 100, 1)}% of respondents fall in '{top_label}' ({name})"
        for share, name, top_label in sorted(concentration_candidates, key=lambda x: -x[0])[:_MAX_LISTED]
    ]

    variables_with_missing = sum(1 for v in variables if v.missing_count > 0)
    summary = (
        f"{total_rows} respondent{'s' if total_rows != 1 else ''} across "
        f"{len(variables)} variable{'s' if len(variables) != 1 else ''}. "
        f"{variables_with_missing} variable{'s' if variables_with_missing != 1 else ''} "
        f"{'have' if variables_with_missing != 1 else 'has'} at least one missing value."
    )

    payload = {
        "title": f"{dataset.name} — summary",
        "summary": summary,
        "key_patterns": key_patterns,
        "anomalies": anomalies,
    }
    await _save_analysis(
        db,
        dataset_id=dataset.id,
        analysis_type="insights",
        parameters=parameters,
        result=payload,
        user_id=user_id,
    )
    return payload
