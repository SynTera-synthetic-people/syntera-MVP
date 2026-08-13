"""
Fetch and compute ML features for a single subject_key from sync_action.record.
Mirrors the logic in syntera-ml-pipeline/features/feature_engineering.py
but targets one user and runs inside the FastAPI process.
"""

import asyncio
import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

from app.config import settings

# Sync engine (psycopg2) — feature computation is CPU-bound, run via to_thread
# psycopg2 uses sslmode=require; asyncpg/cloud URLs often have ssl=true or ssl=require which psycopg2 rejects.
_sync_url = (
    settings.DATABASE_URL
    .replace("postgresql+asyncpg://", "postgresql://")
    .replace("?ssl=true", "?sslmode=require")
    .replace("&ssl=true", "&sslmode=require")
    .replace("?ssl=require", "?sslmode=require")
    .replace("&ssl=require", "&sslmode=require")
)
_engine = None


def _get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(_sync_url)
    return _engine


DOMAIN_PLATFORMS = {
    "ecom":     ("ajio", "amazon", "bigbasket", "flipkart", "nykaa", "myntra"),
    "finance":  ("phonepe", "paytm", "hdfc", "icici"),
    "food":     ("swiggy", "zomato"),
    "mobility": ("uber", "ola"),
}

# source_category values inside data->payload->>'source_category'
DOMAIN_CATEGORIES = {
    "ecom":     ("ecommerce", "e-commerce", "shopping", "retail"),
    "finance":  ("financial", "finance", "banking", "payment"),
    "food":     ("food", "food_delivery", "food delivery", "restaurant"),
    "mobility": ("mobility", "ride", "ride_sharing", "ride-sharing", "transport"),
}


def _domain_filter_sql(domain: str) -> tuple[str, list[str]]:
    """
    Return (sql_fragment, values_list) that matches records belonging to a domain
    via EITHER source_name (platform list) OR source_category (category list).
    """
    platforms = DOMAIN_PLATFORMS[domain]
    categories = DOMAIN_CATEGORIES[domain]
    all_values = list(platforms) + list(categories)
    placeholders = ", ".join(f"'{v}'" for v in all_values)
    sql = f"""(
        LOWER(data->'payload'->>'source_name')     IN ({placeholders})
        OR LOWER(data->'payload'->>'source_category') IN ({placeholders})
    )"""
    return sql, all_values


def _fetch_transactions(subject_key: str, domain: str) -> pd.DataFrame:
    domain_filter, _ = _domain_filter_sql(domain)

    query = text(f"""
        SELECT
            subject_key,
            CASE
                WHEN data->'payload'->>'order_time' IS NOT NULL
                    THEN CAST(data->'payload'->>'order_time' AS timestamp)
                WHEN data->'payload'->>'pickupTime' ~ '^[0-9]+$'
                    THEN to_timestamp(CAST(data->'payload'->>'pickupTime' AS bigint))
                WHEN data->'payload'->>'pickupTime' IS NOT NULL
                    THEN CAST(data->'payload'->>'pickupTime' AS timestamp)
                WHEN data->'payload'->>'receivedDate' ~ '^[0-9]+$'
                    THEN to_timestamp(CAST(data->'payload'->>'receivedDate' AS bigint))
                WHEN data->'payload'->>'receivedDate' IS NOT NULL
                    THEN CAST(data->'payload'->>'receivedDate' AS timestamp)
                WHEN data->'payload'->>'transaction_date' ~ '^[0-9]+$'
                    THEN to_timestamp(CAST(data->'payload'->>'transaction_date' AS bigint))
                WHEN data->'payload'->>'transaction_date' IS NOT NULL
                    THEN CAST(data->'payload'->>'transaction_date' AS timestamp)
                ELSE NULL
            END AS transaction_date,
            CAST(data->'payload'->>'totalCharged' AS float) AS transaction_amount,
            CAST(COALESCE(data->'payload'->>'deliveryFee', '0') AS float) AS discount_applied
        FROM sync_action.record
        WHERE subject_key = :subject_key
          AND {domain_filter}
    """)

    with _get_engine().connect() as conn:
        df = pd.read_sql(query, conn, params={"subject_key": subject_key})

    df["transaction_date"] = pd.to_datetime(df["transaction_date"], errors="coerce")
    df = df.dropna(subset=["transaction_date", "transaction_amount"])
    df = df.sort_values("transaction_date")
    return df


def _compute_features(df: pd.DataFrame, subject_key: str, domain: str) -> dict:
    days_span = max((df["transaction_date"].max() - df["transaction_date"].min()).days, 1)

    # Frequency (5)
    weekly = df.groupby(df["transaction_date"].dt.to_period("W")).size()
    orders_per_week = len(df) / (days_span / 7)

    growth_rate = 0.0
    if len(df) >= 4:
        mid = len(df) // 2
        f, s = df.iloc[:mid], df.iloc[mid:]
        fd = max((f["transaction_date"].max() - f["transaction_date"].min()).days, 1)
        sd = max((s["transaction_date"].max() - s["transaction_date"].min()).days, 1)
        fr, sr = len(f) / fd, len(s) / sd
        growth_rate = (sr - fr) / fr if fr else 0.0

    latest = df["transaction_date"].max()
    df2 = df.copy()
    df2["days_ago"] = (latest - df2["transaction_date"]).dt.days
    df2["weight"] = np.exp(-df2["days_ago"] / 30)
    recency_weighted = df2["weight"].sum() / len(df2)

    volatility = weekly.std() if len(weekly) > 1 else 0.0

    trend_slope = 0.0
    if len(weekly) >= 2:
        trend_slope = float(np.polyfit(np.arange(len(weekly)), weekly.values, 1)[0])

    # Monetary (5)
    amounts = df["transaction_amount"]
    avg_order_value = float(amounts.mean())

    monthly_spend = df.groupby(df["transaction_date"].dt.to_period("M"))["transaction_amount"].mean()
    spending_trend = 0.0
    if len(monthly_spend) >= 2:
        spending_trend = float(np.polyfit(np.arange(len(monthly_spend)), monthly_spend.values, 1)[0])

    price_sensitivity = float(amounts.std() / (amounts.mean() + 1)) if amounts.mean() > 0 else 0.0
    q75, q25 = amounts.quantile(0.75), amounts.quantile(0.25)
    basket_size = float(q75 / (q25 + 1)) if q25 > 0 else 0.0
    discount_usage_rate = float((df["discount_applied"].fillna(0) > 0).mean())

    # Temporal (5)
    df3 = df.copy()
    df3["hour"] = df3["transaction_date"].dt.hour
    df3["dow"] = df3["transaction_date"].dt.dayofweek
    night_order_ratio = float(((df3["hour"] >= 22) | (df3["hour"] <= 6)).mean())
    weekend_ratio = float((df3["dow"] >= 5).mean())
    peak_hour = int(df3["hour"].mode()[0]) if len(df3) > 0 else 12

    monthly_counts = df.groupby(df["transaction_date"].dt.month).size()
    seasonality_index = float(monthly_counts.std() / monthly_counts.mean()) if len(monthly_counts) >= 2 and monthly_counts.mean() > 0 else 0.0

    inter_times = df3.sort_values("transaction_date")["transaction_date"].diff().dt.total_seconds() / 3600
    inter_order_time = float(inter_times.median()) if len(inter_times) > 1 else 0.0

    # RFM features
    last_tx = df["transaction_date"].max()
    if hasattr(last_tx, "tzinfo") and last_tx.tzinfo is not None:
        last_tx = last_tx.tz_localize(None)
    recency_days = (pd.Timestamp.now() - last_tx).days
    recency_score = float(1 / (1 + recency_days / 30))
    frequency_score = float(len(df) / days_span)
    monetary_score = float(df["transaction_amount"].mean())
    rfm_score = float((recency_score + frequency_score + monetary_score) / 3)

    # Time pattern features
    hour_std = float(df3["hour"].std()) if len(df3) > 1 else 0.0
    time_consistency = float(1 / (1 + hour_std))
    rush_hours = {7, 8, 9, 12, 13, 14, 19, 20, 21, 22}
    rush_hour_ratio = float(df3["hour"].isin(rush_hours).mean())
    weekday_preference = float(df3["dow"].mode()[0]) if len(df3) > 0 else 0.0

    # Loyalty features
    tenure_days = float(max(days_span, 1))
    activity_density = float(len(df) / tenure_days)
    weeks_with_orders = df.groupby(df["transaction_date"].dt.isocalendar().week).ngroups
    total_weeks = max(tenure_days / 7, 1)
    retention_rate = float(weeks_with_orders / total_weeks)

    return {
        # Frequency (note: orders_per_week kept for context builder but NOT fed to model)
        "orders_per_week":            orders_per_week,
        "growth_rate":                growth_rate,
        "recency_weighted_frequency": recency_weighted,
        "volatility":                 volatility,
        "trend_slope":                trend_slope,
        # Monetary
        "avg_order_value":            avg_order_value,
        "spending_trend":             spending_trend,
        "price_sensitivity":          price_sensitivity,
        "basket_size":                basket_size,
        "discount_usage_rate":        discount_usage_rate,
        # Temporal
        "night_order_ratio":          night_order_ratio,
        "weekend_ratio":              weekend_ratio,
        "peak_hour_preference":       peak_hour,
        "seasonality_index":          seasonality_index,
        "inter_order_time":           inter_order_time,
        # RFM
        "recency_score":              recency_score,
        "frequency_score":            frequency_score,
        "monetary_score":             monetary_score,
        "rfm_score":                  rfm_score,
        # Time patterns
        "time_consistency":           time_consistency,
        "rush_hour_ratio":            rush_hour_ratio,
        "weekday_preference":         weekday_preference,
        # Loyalty
        "tenure_days":                tenure_days,
        "activity_density":           activity_density,
        "retention_rate":             retention_rate,
    }


def _get_features_sync(subject_key: str, domain: str) -> dict:
    df = _fetch_transactions(subject_key, domain)

    if len(df) == 0:
        raise ValueError(
            f"No transactions found for subject_key='{subject_key}' in domain='{domain}'."
        )

    return _compute_features(df, subject_key, domain)


async def get_user_features(subject_key: str, domain: str) -> dict:
    """
    Async wrapper — runs sync DB fetch + feature computation in a thread
    so the FastAPI event loop is not blocked.
    """
    return await asyncio.to_thread(_get_features_sync, subject_key, domain)


def _find_subject_key_sync(domain: str, min_tx: int = 1, workspace_id: str | None = None) -> str | None:
    """
    Return the subject_key with the most qualifying transactions for the given
    domain. Searches across all workspaces unless workspace_id is given, in
    which case the search is scoped to that workspace's own transactions.
    """
    domain_filter, _ = _domain_filter_sql(domain)
    workspace_clause = "AND workspace_id = :workspace_id" if workspace_id else ""

    query = text(f"""
        SELECT subject_key, COUNT(*) AS tx_count
        FROM sync_action.record
        WHERE subject_key IS NOT NULL
          AND {domain_filter}
          {workspace_clause}
          AND (
              data->'payload'->>'order_time'        IS NOT NULL OR
              data->'payload'->>'pickupTime'        IS NOT NULL OR
              data->'payload'->>'receivedDate'      IS NOT NULL OR
              data->'payload'->>'transaction_date'  IS NOT NULL
          )
        GROUP BY subject_key
        HAVING COUNT(*) >= :min_tx
        ORDER BY tx_count DESC
        LIMIT 1
    """)

    params: dict = {"min_tx": min_tx}
    if workspace_id:
        params["workspace_id"] = workspace_id

    print(f"[ML:find_subject_key] domain={domain!r} min_tx={min_tx} workspace_id={workspace_id!r}")
    with _get_engine().connect() as conn:
        row = conn.execute(query, params).fetchone()

    if row:
        print(f"[ML:find_subject_key] ✓ found subject_key={row[0]!r} tx_count={row[1]}")
        return row[0]

    print(f"[ML:find_subject_key] ✗ no data found for domain={domain!r} workspace_id={workspace_id!r}")
    return None


async def find_subject_key(domain: str, min_tx: int = 1, workspace_id: str | None = None) -> str | None:
    """
    Async wrapper — find best subject_key for a domain. Searches across all
    workspaces unless workspace_id is given.
    """
    return await asyncio.to_thread(_find_subject_key_sync, domain, min_tx, workspace_id)


def _find_subject_keys_sync(domain: str, limit: int, min_tx: int = 1) -> list[str]:
    """
    Return up to `limit` subject_keys with the most qualifying transactions for
    the given domain, ranked by transaction count descending. Used to ground
    multiple personas in distinct real behavior profiles instead of all of
    them sharing the single top transactor's stats.
    """
    domain_filter, _ = _domain_filter_sql(domain)

    query = text(f"""
        SELECT subject_key, COUNT(*) AS tx_count
        FROM sync_action.record
        WHERE subject_key IS NOT NULL
          AND {domain_filter}
          AND (
              data->'payload'->>'order_time'        IS NOT NULL OR
              data->'payload'->>'pickupTime'        IS NOT NULL OR
              data->'payload'->>'receivedDate'      IS NOT NULL OR
              data->'payload'->>'transaction_date'  IS NOT NULL
          )
        GROUP BY subject_key
        HAVING COUNT(*) >= :min_tx
        ORDER BY tx_count DESC
        LIMIT :limit
    """)

    print(f"[ML:find_subject_keys] domain={domain!r} min_tx={min_tx} limit={limit}")
    with _get_engine().connect() as conn:
        rows = conn.execute(query, {"min_tx": min_tx, "limit": limit}).fetchall()

    keys = [row[0] for row in rows]
    print(f"[ML:find_subject_keys] found {len(keys)} subject_key(s) for domain={domain!r}")
    return keys


async def find_subject_keys(domain: str, limit: int, min_tx: int = 1) -> list[str]:
    """Async wrapper — find up to `limit` distinct subject_keys for a domain, ranked by activity."""
    return await asyncio.to_thread(_find_subject_keys_sync, domain, limit, min_tx)
