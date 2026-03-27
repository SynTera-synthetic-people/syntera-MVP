import uuid
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_engine
from app.models.report_cache import ReportCache

CACHE_TTL_HOURS = 24


def _cache_key_filter(
    exploration_id: str,
    cta_type: str,
    simulation_id: Optional[str],
):
    return and_(
        ReportCache.exploration_id == exploration_id,
        ReportCache.cta_type == cta_type,
        ReportCache.simulation_id == simulation_id,
    )


async def get_cached_report(
    exploration_id: str,
    cta_type: str,
    simulation_id: Optional[str] = None,
) -> Optional[ReportCache]:
    """Return a valid (non-expired, done) cache entry, or None on miss."""
    async with AsyncSession(async_engine) as session:
        stmt = (
            select(ReportCache)
            .where(
                and_(
                    _cache_key_filter(exploration_id, cta_type, simulation_id),
                    ReportCache.status == "done",
                    ReportCache.expires_at > datetime.utcnow(),
                )
            )
            .order_by(ReportCache.created_at.desc(), ReportCache.id.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        return result.scalars().first()


async def store_report_cache(
    exploration_id: str,
    cta_type: str,
    pdf_path: Optional[str],
    report_type: str,
    simulation_id: Optional[str] = None,
) -> ReportCache:
    """Persist a newly generated report to the cache table."""
    async with AsyncSession(async_engine) as session:
        now = datetime.utcnow()
        expires_at = now + timedelta(hours=CACHE_TTL_HOURS)
        stmt = (
            select(ReportCache)
            .where(_cache_key_filter(exploration_id, cta_type, simulation_id))
            .order_by(ReportCache.created_at.desc(), ReportCache.id.desc())
        )
        result = await session.execute(stmt)
        existing_entries = list(result.scalars())

        if existing_entries:
            cache = existing_entries[0]
            cache.report_type = report_type
            cache.status = "done"
            cache.pdf_path = pdf_path
            cache.content_md = None
            cache.error_message = None
            cache.created_at = now
            cache.expires_at = expires_at

            for duplicate in existing_entries[1:]:
                await session.delete(duplicate)
        else:
            cache = ReportCache(
                id=uuid.uuid4().hex,
                exploration_id=exploration_id,
                simulation_id=simulation_id,
                report_type=report_type,
                cta_type=cta_type,
                status="done",
                pdf_path=pdf_path,
                expires_at=expires_at,
            )
            session.add(cache)

        await session.commit()
        await session.refresh(cache)
        return cache


async def invalidate_cache(
    exploration_id: str,
    simulation_id: Optional[str] = None,
) -> None:
    """
    Mark all cache entries for this exploration as expired.
    Call this whenever underlying interview/survey data changes.
    """
    async with AsyncSession(async_engine) as session:
        conditions = [ReportCache.exploration_id == exploration_id]
        if simulation_id is not None:
            conditions.append(ReportCache.simulation_id == simulation_id)

        stmt = (
            update(ReportCache)
            .where(and_(*conditions))
            .values(expires_at=datetime.utcnow())
        )
        await session.execute(stmt)
        await session.commit()
