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
_sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
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


def _fetch_transactions(subject_key: str, domain: str) -> pd.DataFrame:
    platforms = DOMAIN_PLATFORMS[domain]
    placeholders = ", ".join(f"'{p}'" for p in platforms)

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
          AND LOWER(data->'payload'->>'source_name') IN ({placeholders})
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

    return {
        "orders_per_week":           orders_per_week,
        "growth_rate":               growth_rate,
        "recency_weighted_frequency": recency_weighted,
        "volatility":                volatility,
        "trend_slope":               trend_slope,
        "avg_order_value":           avg_order_value,
        "spending_trend":            spending_trend,
        "price_sensitivity":         price_sensitivity,
        "basket_size":               basket_size,
        "discount_usage_rate":       discount_usage_rate,
        "night_order_ratio":         night_order_ratio,
        "weekend_ratio":             weekend_ratio,
        "peak_hour_preference":      peak_hour,
        "seasonality_index":         seasonality_index,
        "inter_order_time":          inter_order_time,
    }


def _get_features_sync(subject_key: str, domain: str) -> dict:
    df = _fetch_transactions(subject_key, domain)

    if len(df) == 0:
        raise ValueError(
            f"No transactions found for subject_key='{subject_key}' in domain='{domain}'. "
            f"Make sure the subject_key is correct and data has been synced."
        )
    if len(df) < 5:
        raise ValueError(
            f"Only {len(df)} transactions found for this user in domain='{domain}'. "
            f"Minimum 5 required for a reliable prediction."
        )

    return _compute_features(df, subject_key, domain)


async def get_user_features(subject_key: str, domain: str) -> dict:
    """
    Async wrapper — runs sync DB fetch + feature computation in a thread
    so the FastAPI event loop is not blocked.
    """
    return await asyncio.to_thread(_get_features_sync, subject_key, domain)
