import json
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_engine
from app.models.report_cache import ReportCache

CACHE_TTL_HOURS = None


# ── Report identity: public CTA name vs storage cache key ─────────────────────
#
# A report is known by two different names, and confusing them breaks lookups
# silently:
#
#   public CTA   what the product calls the report — "DECISION_INTELLIGENCE".
#                It appears in API paths, in report generators and in prompts.
#   cache key    what the row is actually stored under in report_cache.cta_type.
#                It is versioned ("DECISION_INTELLIGENCE_V8") so changing a
#                report's format does not have to serve stale rows, and the
#                qual and quant pipelines are versioned independently.
#
# get_cached_report() matches cta_type with ==, so it must always be handed a
# CACHE KEY. A caller that passes a public CTA matches nothing, forever, and
# without raising. REPORT_CACHE_KEYS below is the single place that translation
# lives; add new report versions here, not in a caller.

QUAL_TRANSCRIPTS_CACHE_KEY = "TRANSCRIPTS_QA_DOCX_V6"
QUAL_TRANSCRIPTS_LEGACY_CACHE_KEYS = ("TRANSCRIPTS", "QUAL_VERBATIM_V1")
QUAL_TRANSCRIPTS_PDF_CACHE_KEY = "TRANSCRIPTS_PDF_V1"
QUAL_DI_CACHE_KEY = "DECISION_INTELLIGENCE_V8"
QUAL_DI_LEGACY_CACHE_KEYS = ("QUAL_DECISION_INTELLIGENCE_V1",)
QUAL_BA_CACHE_KEY = "BEHAVIORAL_ARCHAEOLOGY_V8"
QUAL_BA_LEGACY_CACHE_KEYS = (
    "QUAL_BEHAVIOUR_ARCHAEOLOGY_V1",
    "QUAL_BEHAVIORAL_ARCHAEOLOGY_V1",
    "IN_DEPTH_ALL_INTERVIEWS_BA_V1",
)
QUAL_ALL_CACHE_KEY = "ALL_COMBINED_V4"
# Bump whenever either CSV's layout changes: the cache stores the whole ZIP
# (base64 in report_cache.content_md), so a stale entry keeps being served
# indefinitely no matter what the code does.
#   V3: survey_results.csv gained one column per grid/scale item (Q<n>_01, …).
#   V4: questionnaire_overview.csv gained the Sub-Question column and analyses
#       each grid/scale item separately. V3 entries written between the two
#       changes hold a new survey_results.csv beside an old overview.
QUANT_TRANSCRIPTS_CACHE_KEY = "TRANSCRIPTS_V4"
QUANT_DI_CACHE_KEY = "DECISION_INTELLIGENCE_V2"
QUANT_BA_CACHE_KEY = "BEHAVIORAL_ARCHAEOLOGY_V2"

# (report_type, public CTA) -> the cache keys to try, current format first.
REPORT_CACHE_KEYS: dict[tuple[str, str], tuple[str, ...]] = {
    ("qual", "TRANSCRIPTS"): (QUAL_TRANSCRIPTS_CACHE_KEY, *QUAL_TRANSCRIPTS_LEGACY_CACHE_KEYS),
    ("qual", "DECISION_INTELLIGENCE"): (QUAL_DI_CACHE_KEY, *QUAL_DI_LEGACY_CACHE_KEYS),
    ("qual", "BEHAVIORAL_ARCHAEOLOGY"): (QUAL_BA_CACHE_KEY, *QUAL_BA_LEGACY_CACHE_KEYS),
    ("quant", "CSV_DATA"): (QUANT_TRANSCRIPTS_CACHE_KEY,),
    ("quant", "DECISION_INTELLIGENCE"): (QUANT_DI_CACHE_KEY,),
    ("quant", "BEHAVIORAL_ARCHAEOLOGY"): (QUANT_BA_CACHE_KEY,),
}


def cache_keys_for(report_type: str, public_cta: str) -> tuple[str, ...]:
    """The cache keys a public CTA is stored under, current format first."""
    return REPORT_CACHE_KEYS.get((report_type, public_cta), ())


def extract_report_text(content_md: Optional[str]) -> Optional[str]:
    """The readable text of a cached report, or None if the row holds no text.

    report_cache.content_md is not always markdown. Depending on which
    generator wrote the row it holds raw markdown, a JSON envelope around the
    text, or a JSON envelope around a base64 PDF/DOCX. Only the first two can
    be read; a packed file has no text keys and correctly returns None here
    rather than a wall of base64.
    """
    if not content_md:
        return None
    try:
        parsed = json.loads(content_md)
    except (TypeError, ValueError):
        return content_md.strip() or None

    if isinstance(parsed, str):
        return parsed.strip() or None
    if isinstance(parsed, dict):
        for key in ("markdown", "content", "report", "text"):
            value = parsed.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


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
    """Return a valid cached report; reports only expire when upstream input changes."""
    async with AsyncSession(async_engine) as session:
        stmt = (
            select(ReportCache)
            .where(
                and_(
                    _cache_key_filter(exploration_id, cta_type, simulation_id),
                    ReportCache.status == "done",
                    or_(
                        ReportCache.expires_at.is_(None),
                        ReportCache.expires_at > datetime.utcnow(),
                    ),
                )
            )
            .order_by(ReportCache.created_at.desc(), ReportCache.id.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        return result.scalars().first()


async def get_latest_report(
    exploration_id: str,
    cta_type: str,
    simulation_id: Optional[str] = None,
) -> Optional[ReportCache]:
    """Return the latest cache row for a report, regardless of status."""
    async with AsyncSession(async_engine) as session:
        stmt = (
            select(ReportCache)
            .where(_cache_key_filter(exploration_id, cta_type, simulation_id))
            .order_by(ReportCache.created_at.desc(), ReportCache.id.desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        return result.scalars().first()


async def get_report_text(
    exploration_id: str,
    report_type: str,
    public_cta: str,
    simulation_id: Optional[str] = None,
) -> Optional[tuple[str, str]]:
    """(text, cache_key) for the newest readable copy of a report, else None.

    Takes the PUBLIC CTA and resolves the cache keys itself, so callers cannot
    reintroduce the mismatch this mapping exists to prevent. Keys are tried
    current-format-first, and a key whose row holds a packed PDF is skipped
    rather than returned as unreadable bytes — an older row that still has the
    markdown is more use to a reader than a new row that does not.
    """
    for cache_key in cache_keys_for(report_type, public_cta):
        cached = await get_cached_report(exploration_id, cache_key, simulation_id)
        text = extract_report_text(getattr(cached, "content_md", None)) if cached else None
        if text:
            return text, cache_key
    return None


async def latest_simulation_id_with_report(exploration_id: str) -> Optional[str]:
    """The simulation the most recent finished quant report was built from.

    Quant rows are keyed by simulation, and an exploration can hold several
    simulations. The newest reported-on one is the one the user has actually
    been shown, which makes it the simulation any later reader should be
    looking at too.
    """
    quant_keys = [
        key
        for (report_type, _), keys in REPORT_CACHE_KEYS.items()
        if report_type == "quant"
        for key in keys
    ]
    async with AsyncSession(async_engine) as session:
        result = await session.execute(
            select(ReportCache.simulation_id)
            .where(
                ReportCache.exploration_id == exploration_id,
                ReportCache.cta_type.in_(quant_keys),
                ReportCache.status == "done",
                ReportCache.simulation_id.is_not(None),
            )
            .order_by(ReportCache.created_at.desc(), ReportCache.id.desc())
            .limit(1)
        )
        return result.scalars().first()


async def store_report_cache(
    exploration_id: str,
    cta_type: str,
    pdf_path: Optional[str],
    report_type: str,
    simulation_id: Optional[str] = None,
    content_md: Optional[str] = None,
) -> ReportCache:
    """Persist a newly generated report to the cache table."""
    async with AsyncSession(async_engine) as session:
        now = datetime.utcnow()
        # Keep generated insights idempotent; invalidate_cache handles input changes.
        expires_at = None
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
            cache.content_md = content_md
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
                content_md=content_md,
                expires_at=expires_at,
            )
            session.add(cache)

        await session.commit()
        await session.refresh(cache)
        return cache


async def set_report_status(
    exploration_id: str,
    cta_type: str,
    report_type: str,
    status: str,
    simulation_id: Optional[str] = None,
    pdf_path: Optional[str] = None,
    error_message: Optional[str] = None,
) -> ReportCache:
    """Persist a non-terminal or failed report status for polling clients."""
    async with AsyncSession(async_engine) as session:
        now = datetime.utcnow()
        # Pending/failed status should also persist until replaced or invalidated.
        expires_at = None
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
            cache.status = status
            cache.pdf_path = pdf_path
            cache.content_md = None
            cache.error_message = error_message
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
                status=status,
                pdf_path=pdf_path,
                error_message=error_message,
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
