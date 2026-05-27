import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _format_count(value: int | None) -> str | None:
    if not value or value <= 0:
        return None
    if value >= 1_000_000:
        formatted = value / 1_000_000
        return f"{formatted:.1f} million".replace(".0 million", " million")
    if value >= 1_000:
        formatted = value / 1_000
        return f"{formatted:.1f}k".replace(".0k", "k")
    return str(value)


def _join_labels(labels: list[str], total_count: int) -> str | None:
    cleaned = [label.strip() for label in labels if label and label.strip()]
    if not cleaned:
        return None
    if len(cleaned) == 1:
        base = cleaned[0]
    elif len(cleaned) == 2:
        base = f"{cleaned[0]} and {cleaned[1]}"
    else:
        base = f"{', '.join(cleaned[:-1])}, and {cleaned[-1]}"

    remaining = max(total_count - len(cleaned), 0)
    if remaining:
        return f"{base} plus {remaining} more"
    return base


async def _scalar(session: AsyncSession, sql: str, params: dict[str, Any] | None = None) -> Any:
    result = await session.execute(text(sql), params or {})
    return result.scalar()


async def _rows(session: AsyncSession, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    result = await session.execute(text(sql), params or {})
    return [dict(row) for row in result.mappings().all()]


async def _table_exists(session: AsyncSession, table_name: str) -> bool:
    exists = await _scalar(session, "SELECT to_regclass(:table_name)", {"table_name": table_name})
    return bool(exists)


async def build_persona_loader_context(
    session: AsyncSession,
    *,
    workspace_id: str,
    exploration_id: str,
) -> dict[str, Any]:
    """
    Return display-safe loader metadata from backend-owned sources.

    This endpoint is intentionally read-only and tolerant of partially configured
    SyncDB schemas so the persona loader never exposes placeholder copy.
    """
    defaults = {
        "datasetSize": "available behavioural datasets",
        "peopleCount": "matching behavioural clusters",
        "neuroscienceCount": "available calibration signals",
        "sourcesCount": "available",
        "conversationsCount": "available",
        "platforms": "source-bank channels",
    }

    try:
        if not await _table_exists(session, "sync_source.document"):
            return {
                "dynamic_values": defaults,
                "summary": {
                    "source_documents": 0,
                    "relevant_source_documents": 0,
                    "evidence_signals": 0,
                    "source_channels": 0,
                    "source": "defaults",
                },
            }

        source_count = await _scalar(
            session,
            """
            SELECT COUNT(*)
            FROM sync_source.document
            WHERE approval_status = 'approved'
              AND is_processed IS TRUE
            """,
        ) or 0

        relevant_source_count = await _scalar(
            session,
            """
            SELECT COUNT(*)
            FROM sync_source.document
            WHERE approval_status = 'approved'
              AND is_processed IS TRUE
              AND (
                    exploration_id = :exploration_id
                    OR exploration_id IS NULL
                  )
            """,
            {"exploration_id": exploration_id},
        ) or 0

        evidence_signals = 0
        if await _table_exists(session, "sync_source.content_chunk"):
            evidence_signals = await _scalar(
                session,
                """
                SELECT COUNT(*)
                FROM sync_source.content_chunk c
                JOIN sync_source.document d ON d.id = c.document_id
                WHERE d.approval_status = 'approved'
                  AND d.is_processed IS TRUE
                  AND (
                        d.exploration_id = :exploration_id
                        OR d.exploration_id IS NULL
                      )
                """,
                {"exploration_id": exploration_id},
            ) or 0

        channel_rows = await _rows(
            session,
            """
            SELECT channel, COUNT(*) AS doc_count
            FROM (
                SELECT COALESCE(
                    NULLIF(TRIM(source_group), ''),
                    NULLIF(TRIM(domain), ''),
                    NULLIF(TRIM(source_type), '')
                ) AS channel
                FROM sync_source.document
                WHERE approval_status = 'approved'
                  AND is_processed IS TRUE
                  AND (
                        exploration_id = :exploration_id
                        OR exploration_id IS NULL
                      )
            ) channels
            WHERE channel IS NOT NULL
            GROUP BY channel
            ORDER BY doc_count DESC, channel ASC
            LIMIT 4
            """,
            {"exploration_id": exploration_id},
        )
        total_channels = await _scalar(
            session,
            """
            SELECT COUNT(DISTINCT channel)
            FROM (
                SELECT COALESCE(
                    NULLIF(TRIM(source_group), ''),
                    NULLIF(TRIM(domain), ''),
                    NULLIF(TRIM(source_type), '')
                ) AS channel
                FROM sync_source.document
                WHERE approval_status = 'approved'
                  AND is_processed IS TRUE
                  AND (
                        exploration_id = :exploration_id
                        OR exploration_id IS NULL
                      )
            ) channels
            WHERE channel IS NOT NULL
            """,
            {"exploration_id": exploration_id},
        ) or 0

        source_count_label = _format_count(relevant_source_count)
        evidence_count_label = _format_count(evidence_signals)
        channel_label = _join_labels([str(row["channel"]) for row in channel_rows], total_channels)

        dynamic_values = {
            "datasetSize": (
                f"{evidence_count_label} evidence signals"
                if evidence_count_label
                else f"{source_count_label} source documents"
                if source_count_label
                else defaults["datasetSize"]
            ),
            "peopleCount": defaults["peopleCount"],
            "neuroscienceCount": defaults["neuroscienceCount"],
            "sourcesCount": source_count_label or defaults["sourcesCount"],
            "conversationsCount": evidence_count_label or source_count_label or defaults["conversationsCount"],
            "platforms": channel_label or defaults["platforms"],
        }

        return {
            "dynamic_values": dynamic_values,
            "summary": {
                "source_documents": source_count,
                "relevant_source_documents": relevant_source_count,
                "evidence_signals": evidence_signals,
                "source_channels": total_channels,
                "workspace_id": workspace_id,
                "exploration_id": exploration_id,
                "source": "sync_source",
            },
        }
    except Exception:
        logger.exception(
            "Persona loader context fallback used",
            extra={"workspace_id": workspace_id, "exploration_id": exploration_id},
        )
        return {
            "dynamic_values": defaults,
            "summary": {
                "source_documents": 0,
                "relevant_source_documents": 0,
                "evidence_signals": 0,
                "source_channels": 0,
                "workspace_id": workspace_id,
                "exploration_id": exploration_id,
                "source": "fallback_after_error",
            },
        }
