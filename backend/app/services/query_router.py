"""
Route queries to ML or RAG based on user transaction count.

Decision rule (per system spec):
  subject_key has ≥5 transactions in domain  → ML_PREDICTION
  otherwise (no subject_key / no domain / <5) → RAG_INSIGHTS
"""

import asyncio
from enum import Enum
from typing import Optional

from sqlalchemy import create_engine, text

VALID_DOMAINS = {"ecom", "food", "mobility", "finance"}

_DOMAIN_PLATFORMS = {
    "ecom":     ("ajio", "amazon", "bigbasket", "flipkart", "nykaa", "myntra"),
    "finance":  ("phonepe", "paytm", "hdfc", "icici"),
    "food":     ("swiggy", "zomato"),
    "mobility": ("uber", "ola"),
}

_DOMAIN_CATEGORIES = {
    "ecom":     ("ecommerce", "e-commerce", "shopping", "retail"),
    "finance":  ("financial", "finance", "banking", "payment"),
    "food":     ("food", "food_delivery", "food delivery", "restaurant"),
    "mobility": ("mobility", "ride", "ride_sharing", "ride-sharing", "transport"),
}

_sync_engine = None


def _get_sync_engine():
    global _sync_engine
    if _sync_engine is None:
        from app.config import settings
        sync_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
        _sync_engine = create_engine(sync_url)
    return _sync_engine


class QueryType(Enum):
    ML_PREDICTION = "ml"
    RAG_INSIGHTS = "rag"


def _count_transactions_sync(subject_key: str, domain: str) -> int:
    all_values = list(_DOMAIN_PLATFORMS[domain]) + list(_DOMAIN_CATEGORIES[domain])
    placeholders = ", ".join(f"'{v}'" for v in all_values)
    domain_filter = f"""(
        LOWER(data->'payload'->>'source_name')        IN ({placeholders})
        OR LOWER(data->'payload'->>'source_category') IN ({placeholders})
    )"""

    query = text(f"""
        SELECT COUNT(*) FROM sync_action.record
        WHERE subject_key = :subject_key
          AND {domain_filter}
          AND (
              data->'payload'->>'order_time'        IS NOT NULL OR
              data->'payload'->>'pickupTime'        IS NOT NULL OR
              data->'payload'->>'receivedDate'      IS NOT NULL OR
              data->'payload'->>'transaction_date'  IS NOT NULL
          )
    """)

    with _get_sync_engine().connect() as conn:
        result = conn.execute(query, {"subject_key": subject_key})
        return result.scalar() or 0


async def route_query(subject_key: Optional[str], domain: Optional[str]) -> QueryType:
    """
    Route based on transaction count:
    - ≥5 valid transactions in domain → ML_PREDICTION
    - anything else                   → RAG_INSIGHTS
    """
    if not subject_key or not domain:
        return QueryType.RAG_INSIGHTS

    domain = domain.lower()
    if domain not in VALID_DOMAINS:
        return QueryType.RAG_INSIGHTS

    try:
        count = await asyncio.to_thread(_count_transactions_sync, subject_key, domain)
        return QueryType.ML_PREDICTION if count >= 5 else QueryType.RAG_INSIGHTS
    except Exception:
        return QueryType.RAG_INSIGHTS
