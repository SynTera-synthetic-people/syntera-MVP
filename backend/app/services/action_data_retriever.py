"""Fetch sync_action.record transaction data for use as digital_brain_pipeline()'s
action_data_df input.

sync_action.record carries no first-class "category" column — only a JSONB `data`
payload plus `region`. Category is matched against the source dataset's file name
as a best-effort signal; geography is matched against `region` and the JSONB
city/state fields.
"""
import logging

import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_MAX_ROWS = 5000


async def get_action_data_df(
    db: AsyncSession,
    workspace_id: str,
    category: str | None = None,
    geography: str | None = None,
) -> pd.DataFrame:
    """Return a flat pandas DataFrame of action-data records for a workspace,
    optionally narrowed by category and geography. Empty DataFrame if none found."""
    conditions = ["r.workspace_id = :workspace_id"]
    params: dict = {"workspace_id": workspace_id}

    if geography:
        conditions.append(
            "(r.region ILIKE :geo OR r.data->>'city' ILIKE :geo OR r.data->>'state' ILIKE :geo)"
        )
        params["geo"] = f"%{geography.split(',')[0].strip()}%"

    if category:
        conditions.append("d.source_file ILIKE :category")
        params["category"] = f"%{category.split('-')[0].strip()}%"

    where_clause = " AND ".join(conditions)

    rows = await db.execute(
        text(f"""
            SELECT r.data
            FROM sync_action.record r
            JOIN sync_action.dataset d ON d.id = r.dataset_id
            WHERE {where_clause}
            ORDER BY r.created_at DESC
            LIMIT :limit
        """),
        {**params, "limit": _MAX_ROWS},
    )
    records = [row[0] for row in rows.fetchall()]

    if not records:
        logger.info(
            "No action data found (workspace=%s, category=%s, geography=%s)",
            workspace_id, category, geography,
        )
        return pd.DataFrame()

    return pd.DataFrame(records)
