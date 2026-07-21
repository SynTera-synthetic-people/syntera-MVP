"""Read-side aggregation for app.models.llm_usage.LLMUsageEvent.

Backs GET /explorations/{exploration_id}/usage. See
docs/llm_usage_tracking_plan.md, Section 5, for the design.
"""

from datetime import datetime
from typing import Any, Dict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_USAGE_QUERY = text(
    """
    SELECT stage, provider, model, status,
           COUNT(*) AS call_count,
           COALESCE(SUM(input_tokens), 0) AS input_tokens,
           COALESCE(SUM(output_tokens), 0) AS output_tokens,
           SUM(cost_usd) AS cost_usd,
           COUNT(*) FILTER (WHERE cost_usd IS NULL) AS null_cost_count
    FROM llm_usage_event
    WHERE exploration_id = :exploration_id
    GROUP BY stage, provider, model, status
    """
)


async def get_exploration_llm_usage(db: AsyncSession, exploration_id: str) -> Dict[str, Any]:
    """One indexed GROUP BY query over llm_usage_event, re-aggregated in
    Python into the by_stage / by_model views the endpoint returns."""
    result = await db.execute(_USAGE_QUERY, {"exploration_id": exploration_id})
    rows = result.mappings().all()

    total_input_tokens = 0
    total_output_tokens = 0
    total_cost_usd = 0.0
    cost_usd_incomplete = False
    call_count = 0
    error_count = 0

    by_stage: Dict[str, Dict[str, Any]] = {}
    by_model: Dict[tuple, Dict[str, Any]] = {}

    for row in rows:
        row_input = row["input_tokens"]
        row_output = row["output_tokens"]
        row_cost = row["cost_usd"]  # None if every row in this group had an unrated model
        row_calls = row["call_count"]

        total_input_tokens += row_input
        total_output_tokens += row_output
        if row_cost is not None:
            total_cost_usd += row_cost
        if row["null_cost_count"] > 0:
            cost_usd_incomplete = True
        call_count += row_calls
        if row["status"] == "error":
            error_count += row_calls

        stage_bucket = by_stage.setdefault(row["stage"], {
            "stage": row["stage"],
            "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "call_count": 0,
        })
        stage_bucket["input_tokens"] += row_input
        stage_bucket["output_tokens"] += row_output
        stage_bucket["call_count"] += row_calls
        if row_cost is not None:
            stage_bucket["cost_usd"] += row_cost

        model_key = (row["provider"], row["model"])
        model_bucket = by_model.setdefault(model_key, {
            "provider": row["provider"], "model": row["model"],
            "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "call_count": 0,
        })
        model_bucket["input_tokens"] += row_input
        model_bucket["output_tokens"] += row_output
        model_bucket["call_count"] += row_calls
        if row_cost is not None:
            model_bucket["cost_usd"] += row_cost

    return {
        "exploration_id": exploration_id,
        "total_input_tokens": total_input_tokens,
        "total_output_tokens": total_output_tokens,
        "total_tokens": total_input_tokens + total_output_tokens,
        "total_cost_usd": round(total_cost_usd, 8),
        "cost_usd_incomplete": cost_usd_incomplete,
        "call_count": call_count,
        "error_count": error_count,
        "by_stage": sorted(by_stage.values(), key=lambda b: b["stage"]),
        "by_model": sorted(by_model.values(), key=lambda b: (b["provider"], b["model"])),
        "generated_at": datetime.utcnow(),
    }
