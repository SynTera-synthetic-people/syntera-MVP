"""
Background asyncio loop: polls Postgres for pending chunks and ingests them into Qdrant.
Starts with the FastAPI app — no external broker or worker process needed.
"""
import asyncio
import logging

from sqlalchemy import text

from app.config import settings
from app.db import AsyncSessionLocal

logger = logging.getLogger(__name__)

_running = False
_lock = asyncio.Lock()


async def _count_pending() -> int:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text(
                "SELECT COUNT(*) FROM sync_source.content_chunk "
                "WHERE embedding_status IS NULL OR embedding_status = 'pending'"
            )
        )
        return result.scalar() or 0


async def _run_ingest_once() -> None:
    """Single ingest cycle. Lock prevents concurrent runs."""
    if _lock.locked():
        logger.info("ingest_worker: cycle already running, skipping")
        return
    async with _lock:
        try:
            from app.rag.ingest_qdrant import ingest_to_qdrant
            await ingest_to_qdrant()
        except Exception:
            logger.exception("ingest_worker: ingest cycle failed — will retry next poll")


def _ensure_qdrant_indexes() -> None:
    try:
        from app.rag.create_governance_indexes import create_governance_indexes
        create_governance_indexes()
        logger.info("ingest_worker: Qdrant governance indexes verified")
    except Exception:
        logger.exception("ingest_worker: governance index creation failed — continuing")


async def ingest_loop() -> None:
    """
    Long-running task started at app startup via asyncio.create_task().
    Polls every INGEST_POLL_INTERVAL_SECONDS seconds and embeds pending chunks.
    """
    global _running
    _running = True
    interval = settings.INGEST_POLL_INTERVAL_SECONDS
    logger.info("ingest_worker: started | poll_interval=%ds", interval)

    # Create Qdrant payload indexes once at startup
    _ensure_qdrant_indexes()

    while _running:
        try:
            pending = await _count_pending()
            if pending > 0:
                logger.info("ingest_worker: %d pending chunks found — starting ingest", pending)
                await _run_ingest_once()
            else:
                logger.debug("ingest_worker: no pending chunks")
        except Exception:
            logger.exception("ingest_worker: poll error")
        await asyncio.sleep(interval)


async def trigger_ingest() -> None:
    """Called by admin endpoint to force an immediate ingest cycle."""
    asyncio.create_task(_run_ingest_once())


def stop_loop() -> None:
    global _running
    _running = False
