"""
SyncDB Source Bank Service.

Upload flows:
- PDF / DOCX / TXT  → file bytes stored in DB (bytea); call /process to extract chunks
- CSV / XLSX / XLS  → parsed inline on upload; each row stored as individual JSONB chunk
- URL               → scraped on registration; text stored as chunks

All tabular (CSV/Excel) and URL documents are marked is_processed=TRUE immediately
on upload — no separate /process call required for these types.
"""

import io
import json
import logging
import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.id_generator import generate_id

logger = logging.getLogger(__name__)

CHUNK_SIZE          = 1_200    # default / smallest text chunk size
_MAX_LIMIT          = 1_000    # hard cap for list / search endpoints
_CHUNK_INSERT_BATCH = 2_000    # max rows per INSERT (4 cols × 2000 < 32767 asyncpg limit)
_TABULAR_BATCH      = 2_000    # rows per INSERT for CSV/Excel

_TABULAR_TYPES = frozenset({"csv", "xlsx", "xls"})
_CHUNK_OVERLAP = 180
_MAX_SCRAPED_CONTENT_LENGTH = 18_000
_SOFT_MAX_SCRAPED_CHUNKS = 24
_DYNAMIC_MEDIUM_THRESHOLD = 5_000
_DYNAMIC_LARGE_THRESHOLD = 20_000
_MEDIUM_CHUNK_SIZE = 1_500
_LARGE_CHUNK_SIZE = 1_900

DATA_TYPE_TABULAR = "tabular"
DATA_TYPE_SCRAPED = "scraped"
DATA_TYPE_DOCUMENT = "document"
_VALID_DATA_TYPES = frozenset({DATA_TYPE_TABULAR, DATA_TYPE_SCRAPED, DATA_TYPE_DOCUMENT})

_NOISE_LINE_PATTERNS = (
    re.compile(r"^(menu|navigation|skip to content|back to top)$", re.IGNORECASE),
    re.compile(r"^(privacy policy|terms of use|terms and conditions|cookie policy)$", re.IGNORECASE),
    re.compile(r"^(follow us|share this|related articles|recommended articles)$", re.IGNORECASE),
    re.compile(r"^(sign in|log in|register|subscribe|newsletter)$", re.IGNORECASE),
)
_NOISE_ELEMENT_KEYWORDS = (
    "nav", "menu", "footer", "header", "breadcrumb", "sidebar", "share",
    "social", "cookie", "consent", "modal", "popup", "banner", "related",
    "recommend", "newsletter", "subscribe", "country", "language", "locale",
)


@dataclass
class ChunkPlan:
    cleaned_length: int
    prepared_length: int
    chunk_size: int
    chunk_overlap: int
    chunk_count: int
    was_trimmed: bool
    chunks: list[str]


# ---------------------------------------------------------------------------
# Internal helpers — text extraction
# ---------------------------------------------------------------------------

def _sanitize_chunk(value: str) -> str:
    """Strip \\x00 null bytes — PostgreSQL TEXT/JSONB both reject them."""
    if value is None:                          # FIX: guard against None input
        return ""
    return str(value).replace("\x00", "")


def _normalize_whitespace(value: str) -> str:
    if not value:                              # FIX: guard against None/empty
        return ""
    value = _sanitize_chunk(value).replace("\r", "\n")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def _looks_like_menu_or_country_list(line: str) -> bool:
    if not line:                               # FIX: guard
        return False
    items = [item.strip() for item in re.split(r"[|,•/·]+", line) if item.strip()]
    if len(items) < 8:
        return False
    short_items = sum(1 for item in items if len(item.split()) <= 3 and len(item) <= 30)
    return short_items / max(len(items), 1) >= 0.8


def _clean_extracted_text(raw_text: str) -> str:
    """
    Clean extracted text.
    Always returns a str — never None.
    Falls back to the original text (normalized) if cleaning produces nothing.
    """
    # FIX: guard against None input
    if raw_text is None:
        logger.warning("Cleaning returned empty content: input was None")
        return ""

    normalized_text = _normalize_whitespace(raw_text)
    if not normalized_text:
        logger.warning("Cleaning returned empty content: normalized text is empty")
        return ""

    try:
        raw_lines = [re.sub(r"\s+", " ", line).strip() for line in normalized_text.splitlines()]
        raw_lines = [line for line in raw_lines if line]
        repeated_counts = Counter(line.lower() for line in raw_lines)
        seen_counts: Counter[str] = Counter()
        cleaned_lines: list[str] = []

        for line in raw_lines:
            line_key = line.lower()
            if len(line) <= 2:
                continue
            if any(pattern.match(line) for pattern in _NOISE_LINE_PATTERNS):
                continue
            if _looks_like_menu_or_country_list(line):
                continue
            if repeated_counts[line_key] > 2 and seen_counts[line_key] >= 1:
                continue
            if len(line.split()) <= 2 and repeated_counts[line_key] > 1:
                continue
            if re.fullmatch(r"[\W_]+", line):
                continue
            seen_counts[line_key] += 1
            cleaned_lines.append(line)

        cleaned_text = "\n".join(cleaned_lines)
        cleaned_text = re.sub(r"\n{3,}", "\n\n", cleaned_text)
        result = cleaned_text.strip()

        # FIX: if aggressive cleaning wiped everything, fall back to normalized original
        if not result:
            logger.warning(
                "Cleaning returned empty content after filtering; "
                "falling back to normalized text (len=%d)", len(normalized_text)
            )
            return normalized_text

        return result

    except Exception as exc:
        # FIX: never let cleaning crash the pipeline — return normalized fallback
        logger.warning(
            "Cleaning raised exception, falling back to normalized text | reason=%s", exc
        )
        return normalized_text


def _select_chunk_size(content_length: int) -> int:
    if content_length < _DYNAMIC_MEDIUM_THRESHOLD:
        return CHUNK_SIZE
    if content_length <= _DYNAMIC_LARGE_THRESHOLD:
        return _MEDIUM_CHUNK_SIZE
    return _LARGE_CHUNK_SIZE


def _trim_content_preserving_top(text: str, max_content_length: Optional[int]) -> tuple[str, bool]:
    if not text:                               # FIX: guard
        return "", False
    if max_content_length is None or len(text) <= max_content_length:
        return text, False

    trim_marker = "\n\n[... trimmed for storage ...]\n\n"
    head_length = int(max_content_length * 0.78)
    tail_length = max(max_content_length - head_length - len(trim_marker), 1_500)
    head = text[:head_length].strip()
    tail = text[-tail_length:].strip()
    prepared = f"{head}{trim_marker}{tail}".strip()
    if len(prepared) > max_content_length:
        prepared = prepared[:max_content_length].rstrip()
    return prepared, True


def _extract_readable_webpage_text(html: str) -> str:
    """
    Extract human-readable text from HTML.
    Always returns a str — never None.
    Wrapped in a top-level try-except so a broken page never crashes the caller.
    """
    # FIX: guard against None/empty HTML input
    if not html:
        logger.warning("Extraction returned None: html input is empty/None")
        return ""

    try:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")

        # Remove noise tags
        for tag in soup(["script", "style", "nav", "footer", "header",
                          "aside", "form", "noscript", "svg", "img", "button"]):
            try:
                tag.decompose()
            except Exception:
                pass  # FIX: decompose on already-gone tag — safe to skip

        # Remove noise by attribute keywords
        # FIX: collect tags first, then decompose — avoids operating on stale references
        tags_to_decompose: list[Any] = []
        for tag in list(soup.find_all(True)):
            try:
                # FIX: tag.attrs can be None on malformed/decomposed tags
                attrs = getattr(tag, "attrs", None)
                if not isinstance(attrs, dict):
                    continue

                marker_parts: list[str] = []
                for attr_name in ("id", "role", "aria-label"):
                    attr_value = attrs.get(attr_name)
                    if isinstance(attr_value, str):
                        marker_parts.append(attr_value)

                classes = attrs.get("class") or []
                if isinstance(classes, list):
                    marker_parts.extend(str(v) for v in classes)

                marker_blob = " ".join(marker_parts).lower()
                if marker_blob and any(kw in marker_blob for kw in _NOISE_ELEMENT_KEYWORDS):
                    tags_to_decompose.append(tag)
            except Exception as exc:
                # FIX: individual tag inspection failure should never crash the loop
                logger.debug("Tag inspection skipped | reason=%s", exc)
                continue

        for tag in tags_to_decompose:
            try:
                tag.decompose()
            except Exception:
                pass  # FIX: already decomposed — skip safely

        # Find main content area
        candidates = []
        for selector in (
            "article", "main", "[role='main']", "#content",
            ".content", ".article", ".post", ".entry-content", ".story-body",
        ):
            try:
                candidates.extend(soup.select(selector))
            except Exception:
                pass  # FIX: bad selector on weird HTML — skip

        unique_candidates = []
        seen_ids: set[int] = set()
        for candidate in candidates:
            cid = id(candidate)
            if cid not in seen_ids:
                unique_candidates.append(candidate)
                seen_ids.add(cid)

        # FIX: wrap max() in try-except; soup.body could be None
        try:
            root = max(
                unique_candidates,
                key=lambda t: len((t.get_text(" ", strip=True) or "") if t else ""),
                default=None,
            )
        except Exception:
            root = None

        if root is None:
            root = soup.body if soup.body is not None else soup

        # FIX: final safety — if root is still None, bail out with raw text fallback
        if root is None:
            logger.warning("Extraction returned None: could not identify root element")
            return ""

        # Extract text from content tags
        text_parts: list[str] = []
        try:
            for tag in root.find_all(["h1", "h2", "h3", "p", "li"]):
                try:
                    raw = tag.get_text(" ", strip=True)
                    if raw:
                        text_parts.append(re.sub(r"\s+", " ", raw).strip())
                except Exception:
                    continue
        except Exception as exc:
            logger.warning("tag.find_all failed | reason=%s", exc)

        # Fallback: raw line split
        if not text_parts:
            try:
                text_parts = [
                    re.sub(r"\s+", " ", line).strip()
                    for line in root.get_text(separator="\n").splitlines()
                    if line.strip()
                ]
            except Exception as exc:
                logger.warning("Root get_text fallback failed | reason=%s", exc)
                return ""

        result = _clean_extracted_text("\n".join(text_parts))

        # FIX: _clean_extracted_text always returns str, but double-check
        if result is None:
            logger.warning("Extraction returned None: cleaning step returned None")
            return ""

        return result

    except Exception as exc:
        # FIX: top-level catch — extraction must never crash the caller
        logger.warning(
            "Extraction returned None: unexpected exception in BeautifulSoup pipeline | reason=%s", exc
        )
        return ""


def _extract_text_pdf(file_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except ImportError:
        import PyPDF2
        reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        raise ValueError(f"PDF extraction failed: {exc}") from exc


def _extract_text_docx(file_bytes: bytes) -> str:
    try:
        import docx
        doc = docx.Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as exc:
        raise ValueError(f"DOCX extraction failed: {exc}") from exc


def _extract_text(file_bytes: bytes, source_type: str) -> str:
    st = source_type.lower()
    if st == "pdf":
        return _extract_text_pdf(file_bytes)
    if st in ("docx", "doc"):
        return _extract_text_docx(file_bytes)
    if st == "txt":
        return file_bytes.decode("utf-8", errors="replace")
    raise ValueError(f"Unsupported source_type for text extraction: {source_type}")


def _split_into_chunks(
    raw_text: str,
    chunk_size: int = CHUNK_SIZE,
    chunk_overlap: int = _CHUNK_OVERLAP,
) -> list[str]:
    # FIX: guard against None/empty
    if not raw_text:
        return []

    text = _normalize_whitespace(raw_text)
    if not text:
        return []

    chunks: list[str] = []
    start = 0
    text_length = len(text)

    while start < text_length:
        target_end = min(start + chunk_size, text_length)
        end = target_end

        if target_end < text_length:
            search_floor = max(start + chunk_size // 2, target_end - 250)
            search_ceiling = min(text_length, target_end + 250)
            boundary = max(
                text.rfind("\n\n", search_floor, search_ceiling),
                text.rfind("\n", search_floor, search_ceiling),
                text.rfind(". ", search_floor, search_ceiling),
                text.rfind(" ", search_floor, min(text_length, target_end + 120)),
            )
            if boundary > start:
                end = boundary

        chunk = text[start:end].strip()
        if chunk and (not chunks or chunk != chunks[-1]):
            chunks.append(chunk)

        if end >= text_length:
            break

        next_start = max(end - chunk_overlap, start + 1)
        if next_start <= start:
            next_start = end
        start = next_start

    return chunks


def _build_chunk_plan(
    raw_text: str,
    *,
    max_content_length: Optional[int],
    chunk_overlap: int = _CHUNK_OVERLAP,
    soft_max_chunks: Optional[int] = None,
) -> ChunkPlan:
    # FIX: guard against None input
    if not raw_text:
        logger.warning("_build_chunk_plan received empty/None raw_text — returning empty plan")
        return ChunkPlan(
            cleaned_length=0,
            prepared_length=0,
            chunk_size=CHUNK_SIZE,
            chunk_overlap=chunk_overlap,
            chunk_count=0,
            was_trimmed=False,
            chunks=[],
        )

    cleaned_text = _clean_extracted_text(raw_text)

    # FIX: _clean_extracted_text always returns str, but be safe
    if not cleaned_text:
        logger.warning(
            "Cleaning returned empty content: _build_chunk_plan got empty cleaned_text "
            "from raw_text of length %d", len(raw_text)
        )
        return ChunkPlan(
            cleaned_length=0,
            prepared_length=0,
            chunk_size=CHUNK_SIZE,
            chunk_overlap=chunk_overlap,
            chunk_count=0,
            was_trimmed=False,
            chunks=[],
        )

    cleaned_length = len(cleaned_text)
    chunk_size = _select_chunk_size(cleaned_length)
    prepared_text, was_trimmed = _trim_content_preserving_top(cleaned_text, max_content_length)

    # FIX: prepared_text could theoretically be empty after trim edge case
    if not prepared_text:
        logger.warning("_trim_content_preserving_top returned empty — using cleaned text")
        prepared_text = cleaned_text
        was_trimmed = False

    chunks = _split_into_chunks(prepared_text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

    if soft_max_chunks is not None and len(chunks) > soft_max_chunks:
        logger.warning(
            "Soft chunk cap reached | generated=%d | retained=%d | cleaned_length=%d | prepared_length=%d",
            len(chunks), soft_max_chunks, cleaned_length, len(prepared_text),
        )
        chunks = chunks[: soft_max_chunks - 1] + [chunks[-1]]

    return ChunkPlan(
        cleaned_length=cleaned_length,
        prepared_length=len(prepared_text),
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        chunk_count=len(chunks),
        was_trimmed=was_trimmed,
        chunks=chunks,
    )


# ---------------------------------------------------------------------------
# Internal helpers — DB inserts
# ---------------------------------------------------------------------------

async def _insert_chunk_batch(
    db: AsyncSession,
    batch: list[dict[str, Any]],
) -> int:
    """Batch-insert plain text chunks (content only, no content_json)."""
    if not batch:
        return 0
    placeholders = []
    params: dict[str, Any] = {}
    for i, row in enumerate(batch):
        placeholders.append(
            f"(:id_{i}, :document_id_{i}, :chunk_index_{i}, :content_{i}, :data_type_{i})"
        )
        params[f"id_{i}"]           = row["id"]
        params[f"document_id_{i}"]  = row["document_id"]
        params[f"chunk_index_{i}"]  = row["chunk_index"]
        params[f"content_{i}"]      = row["content"]
        params[f"data_type_{i}"]    = row.get("data_type", DATA_TYPE_DOCUMENT)
    await db.execute(
        text(f"""
            INSERT INTO sync_source.content_chunk
                (id, document_id, chunk_index, content, data_type)
            VALUES {", ".join(placeholders)}
        """),
        params,
    )
    logger.debug("Inserted text chunk batch of %d rows.", len(batch))
    return len(batch)


async def _insert_tabular_chunk_batch(
    db: AsyncSession,
    batch: list[dict[str, Any]],
) -> int:
    """
    Batch-insert tabular (CSV/Excel) row chunks.
    Writes content (JSON string for FTS) and content_json (JSONB for queries).
    """
    if not batch:
        return 0
    placeholders = []
    params: dict[str, Any] = {}
    for i, row in enumerate(batch):
        placeholders.append(
            f"(:id_{i}, :document_id_{i}, :chunk_index_{i}, "
            f":content_{i}, CAST(:content_json_{i} AS JSONB), :data_type_{i})"
        )
        params[f"id_{i}"]           = row["id"]
        params[f"document_id_{i}"]  = row["document_id"]
        params[f"chunk_index_{i}"]  = row["chunk_index"]
        params[f"content_{i}"]      = row["content"]
        params[f"content_json_{i}"] = row["content"]  # same string → cast to JSONB
        params[f"data_type_{i}"]    = row.get("data_type", DATA_TYPE_TABULAR)
    await db.execute(
        text(f"""
            INSERT INTO sync_source.content_chunk
                (id, document_id, chunk_index, content, content_json, data_type)
            VALUES {", ".join(placeholders)}
        """),
        params,
    )
    logger.debug("Inserted tabular chunk batch of %d rows.", len(batch))
    return len(batch)


# ---------------------------------------------------------------------------
# Internal helpers — tabular row sanitization
# ---------------------------------------------------------------------------

def _sanitize_tabular_row(row: dict) -> dict:
    """Replace NaN / Inf floats with None so the dict is JSON-serialisable."""
    result: dict[str, Any] = {}
    for k, v in row.items():
        if v is None:
            result[k] = None
        elif isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            result[k] = None
        else:
            result[k] = v
    return result


async def _ingest_tabular_rows(
    db: AsyncSession,
    doc_id: str,
    file_bytes: bytes,
    source_type: str,
) -> tuple[list[str], int]:
    """
    Parse CSV or Excel, store each row as an individual JSONB chunk.
    Updates document.metadata with columns + row_count and sets is_processed=TRUE.
    Returns (columns, total_rows).
    """
    import pandas as pd

    st = source_type.lower()
    if st in ("xlsx", "xls"):
        df = pd.read_excel(io.BytesIO(file_bytes))
    else:
        df = pd.read_csv(io.BytesIO(file_bytes))

    df = df.dropna(how="all").where(pd.notnull(df), None)
    columns = list(df.columns)
    rows = df.to_dict(orient="records")

    batch: list[dict[str, Any]] = []
    total_inserted = 0

    for idx, row in enumerate(rows):
        clean_row = _sanitize_tabular_row(row)
        content_str = json.dumps(clean_row, default=str)
        batch.append({
            "id":          generate_id(),
            "document_id": doc_id,
            "chunk_index": idx,
            "content":     content_str,
            "data_type":   DATA_TYPE_TABULAR,
        })
        if len(batch) >= _TABULAR_BATCH:
            total_inserted += await _insert_tabular_chunk_batch(db, batch)
            batch.clear()

    if batch:
        total_inserted += await _insert_tabular_chunk_batch(db, batch)

    null_json_rows = await db.execute(
        text("""
            SELECT COUNT(*)
            FROM sync_source.content_chunk
            WHERE document_id = :doc_id
              AND data_type = :data_type
              AND content_json IS NULL
        """),
        {"doc_id": doc_id, "data_type": DATA_TYPE_TABULAR},
    )
    null_json_count = int(null_json_rows.scalar() or 0)

    await db.execute(
        text("""
            UPDATE sync_source.document
            SET metadata     = CAST(:meta AS JSONB),
                is_processed = TRUE
            WHERE id = :id
        """),
        {
            "id":   doc_id,
            "meta": json.dumps({"columns": columns, "row_count": total_inserted}),
        },
    )

    logger.info(
        "Tabular ingestion complete | doc_id=%s | rows=%d | cols=%d | content_json_null=%d",
        doc_id, total_inserted, len(columns), null_json_count,
    )
    return columns, total_inserted


# ---------------------------------------------------------------------------
# Internal helpers — URL fetch
# ---------------------------------------------------------------------------

async def _fetch_pdf_text(client: Any, url: str) -> str:
    response = await client.get(url, follow_redirects=True, timeout=20)
    response.raise_for_status()
    try:
        from pypdf import PdfReader
    except ImportError:
        import PyPDF2 as _pypdf  # type: ignore[import]
        reader = _pypdf.PdfReader(io.BytesIO(response.content))
        return "\n".join(p.extract_text() or "" for p in reader.pages)
    reader = PdfReader(io.BytesIO(response.content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


async def _fetch_webpage_text(client: Any, url: str) -> str:
    response = await client.get(url, follow_redirects=True, timeout=20)
    response.raise_for_status()
    # FIX: _extract_readable_webpage_text now always returns str — safe to call directly
    return _extract_readable_webpage_text(response.text or "")


async def _save_text_chunks(
    db: AsyncSession,
    doc_id: str,
    raw_text: str,
    *,
    data_type: str,
    max_content_length: Optional[int],
    soft_max_chunks: Optional[int] = None,
) -> tuple[int, ChunkPlan]:
    """Clean, chunk, and batch-insert text into content_chunk."""
    # FIX: guard against None/empty raw_text — skip silently with log
    if not raw_text or not raw_text.strip():
        logger.warning(
            "Skipping URL due to invalid content: _save_text_chunks received "
            "empty/None raw_text | doc_id=%s | data_type=%s", doc_id, data_type
        )
        empty_plan = ChunkPlan(
            cleaned_length=0,
            prepared_length=0,
            chunk_size=CHUNK_SIZE,
            chunk_overlap=_CHUNK_OVERLAP,
            chunk_count=0,
            was_trimmed=False,
            chunks=[],
        )
        return 0, empty_plan

    plan = _build_chunk_plan(
        raw_text,
        max_content_length=max_content_length,
        soft_max_chunks=soft_max_chunks,
    )
    if not plan.chunks:
        logger.warning(
            "Skipping URL due to invalid content: chunk plan produced 0 chunks "
            "| doc_id=%s | data_type=%s | raw_len=%d",
            doc_id, data_type, len(raw_text),
        )
        return 0, plan

    logger.info(
        "Content prepared | doc_id=%s | data_type=%s | cleaned_length=%d | "
        "prepared_length=%d | chunk_size=%d | chunk_overlap=%d | trimmed=%s",
        doc_id,
        data_type,
        plan.cleaned_length,
        plan.prepared_length,
        plan.chunk_size,
        plan.chunk_overlap,
        plan.was_trimmed,
    )

    batch: list[dict[str, Any]] = []
    total = 0
    for idx, chunk_text in enumerate(plan.chunks):
        c = _sanitize_chunk(chunk_text)
        if not c:
            continue
        batch.append({
            "id":          generate_id(),
            "document_id": doc_id,
            "chunk_index": idx,
            "content":     c,
            "data_type":   data_type,
        })
        if len(batch) >= _CHUNK_INSERT_BATCH:
            total += await _insert_chunk_batch(db, batch)
            batch.clear()
    if batch:
        total += await _insert_chunk_batch(db, batch)

    logger.info(
        "Chunks created | doc_id=%s | data_type=%s | total=%d",
        doc_id, data_type, total,
    )
    return total, plan


def _normalize_data_type_filter(data_type: Optional[str]) -> Optional[str]:
    if data_type is None:
        return None
    normalized = data_type.strip().lower()
    if not normalized:
        return None
    if normalized not in _VALID_DATA_TYPES:
        raise ValueError(f"Unsupported data_type '{data_type}'. Expected one of {sorted(_VALID_DATA_TYPES)}")
    return normalized


def _resolve_chunk_order_by(order_by: str) -> str:
    normalized = (order_by or "chunk_index").strip().lower()
    if normalized == "created_at":
        return "created_at"
    if normalized != "chunk_index":
        raise ValueError("order_by must be either 'chunk_index' or 'created_at'")
    return "chunk_index"


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------

async def upload_source_document(
    db: AsyncSession,
    file_bytes: bytes,
    filename: str,
    title: str,
    domain: Optional[str],
    source_type: str,
    exploration_id: Optional[str],
    user_id: str,
) -> Optional[dict]:
    """
    Store a source document.

    - PDF / DOCX / TXT: file bytes saved as bytea; document is NOT yet processed.
      Caller must invoke process_document() to extract and chunk the content.
    - CSV / XLSX / XLS: rows parsed and stored as individual JSONB chunks inline;
      document is marked is_processed=TRUE immediately — no /process step needed.
    """
    from pathlib import Path
    doc_id = generate_id()
    ext = Path(filename).suffix.lstrip(".").lower() or source_type
    is_tabular = ext in _TABULAR_TYPES

    await db.execute(
        text("""
            INSERT INTO sync_source.document
                (id, title, source_type, source_url,
                 file_data, file_name,
                 domain, exploration_id, uploaded_by)
            VALUES
                (:id, :title, :source_type, NULL,
                 :file_data, :file_name,
                 :domain, :exploration_id, :uploaded_by)
        """),
        {
            "id":             doc_id,
            "title":          title,
            "source_type":    ext,
            "file_data":      None if is_tabular else file_bytes,
            "file_name":      filename,
            "domain":         domain,
            "exploration_id": exploration_id,
            "uploaded_by":    user_id,
        },
    )

    if is_tabular:
        try:
            await _ingest_tabular_rows(db, doc_id, file_bytes, ext)
        except Exception:
            await db.rollback()
            logger.exception(
                "Tabular source ingestion failed | doc_id=%s | file=%s",
                doc_id, filename,
            )
            raise

    await db.commit()

    logger.info(
        "Source document uploaded | doc_id=%s | file=%s | type=%s | tabular=%s | user=%s | size=%d bytes",
        doc_id, filename, ext, is_tabular, user_id, len(file_bytes),
    )
    return await get_source_document(db, doc_id)


async def register_url_document(
    db: AsyncSession,
    url: str,
    title: str,
    domain: Optional[str],
    exploration_id: Optional[str],
    user_id: str,
) -> Optional[dict]:
    """
    Register a URL, fetch its content, and save as text chunks.
    Supports PDF URLs (pypdf) and HTML web pages (BeautifulSoup).

    If the fetch fails the document row is still committed (is_processed=FALSE)
    so the caller knows the URL was registered and can retry via /process.
    """
    import httpx

    doc_id = generate_id()

    await db.execute(
        text("""
            INSERT INTO sync_source.document
                (id, title, source_type, source_url,
                 file_data, file_name,
                 domain, exploration_id, uploaded_by)
            VALUES
                (:id, :title, 'url', :url,
                 NULL, NULL,
                 :domain, :exploration_id, :uploaded_by)
        """),
        {
            "id":             doc_id,
            "title":          title,
            "url":            url,
            "domain":         domain,
            "exploration_id": exploration_id,
            "uploaded_by":    user_id,
        },
    )

    _headers = {
        "User-Agent": "Mozilla/5.0 (compatible; SyncDBBot/1.0; +https://syntheticpeople.ai)",
        "Accept":     "text/html,application/xhtml+xml,application/pdf,*/*",
    }

    try:
        async with httpx.AsyncClient(headers=_headers, verify=False) as client:
            is_pdf = url.lower().split("?")[0].endswith(".pdf")
            raw_text = (
                await _fetch_pdf_text(client, url)
                if is_pdf
                else await _fetch_webpage_text(client, url)
            )

        # FIX: guard against None or empty extraction result
        if not raw_text or not raw_text.strip():
            logger.warning(
                "Skipping URL due to invalid content: empty text after extraction "
                "| doc_id=%s | url=%s", doc_id, url
            )
        else:
            chunks_created, plan = await _save_text_chunks(
                db,
                doc_id,
                raw_text,
                data_type=DATA_TYPE_SCRAPED,
                max_content_length=_MAX_SCRAPED_CONTENT_LENGTH,
                soft_max_chunks=_SOFT_MAX_SCRAPED_CHUNKS,
            )
            await db.execute(
                text("UPDATE sync_source.document SET is_processed = TRUE WHERE id = :id"),
                {"id": doc_id},
            )
            logger.info(
                "URL scraped | doc_id=%s | url=%s | cleaned_length=%d | "
                "prepared_length=%d | chunk_size=%d | chunks=%d",
                doc_id, url,
                plan.cleaned_length,
                plan.prepared_length,
                plan.chunk_size,
                chunks_created,
            )

    except Exception as exc:
        logger.warning(
            "URL fetch failed — document registered unprocessed | doc_id=%s | url=%s | reason=%s",
            doc_id, url, exc,
        )

    await db.commit()

    logger.info("URL document registered | doc_id=%s | url=%s | user=%s", doc_id, url, user_id)
    return await get_source_document(db, doc_id)


async def process_document(db: AsyncSession, document_id: str) -> dict:
    """
    Extract text from a stored PDF/DOCX/TXT document and split into searchable chunks.

    - Fully transactional: any failure rolls back all chunk inserts.
    - Idempotent: previous chunks deleted before re-processing.
    - CSV / XLSX / XLS / URL documents are processed at upload time;
      calling this on them returns the existing chunk count as a no-op.

    Returns {"document_id": ..., "chunks_created": ..., "total_characters": ...}
    """
    row = await db.execute(
        text("SELECT * FROM sync_source.document WHERE id = :id"),
        {"id": document_id},
    )
    doc = row.mappings().first()
    if doc is None:
        raise ValueError(f"Document {document_id} not found")

    doc = dict(doc)
    source_type = doc["source_type"].lower()

    # Already processed at upload time — return current count
    if source_type in _TABULAR_TYPES or source_type == "url":
        existing = await db.execute(
            text("SELECT COUNT(*) FROM sync_source.content_chunk WHERE document_id = :did"),
            {"did": document_id},
        )
        count: int = existing.scalar() or 0
        return {"document_id": document_id, "chunks_created": count, "total_characters": 0}

    file_bytes: Optional[bytes] = doc.get("file_data")
    if not file_bytes:
        raise ValueError(f"No file data found for document: {document_id}")

    logger.info(
        "Processing document | doc_id=%s | type=%s | file=%s",
        document_id, source_type, doc.get("file_name"),
    )

    try:
        raw_text = _extract_text(file_bytes, source_type)
        total_characters = len(_sanitize_chunk(raw_text))

        # FIX: guard against empty extraction from file
        if not raw_text or not raw_text.strip():
            logger.warning(
                "Extraction returned None: file produced empty text "
                "| doc_id=%s | type=%s", document_id, source_type
            )
            return {"document_id": document_id, "chunks_created": 0, "total_characters": 0}

        await db.execute(
            text("DELETE FROM sync_source.content_chunk WHERE document_id = :did"),
            {"did": document_id},
        )

        total_inserted, plan = await _save_text_chunks(
            db,
            document_id,
            raw_text,
            data_type=DATA_TYPE_DOCUMENT,
            max_content_length=None,
            soft_max_chunks=None,
        )

        await db.execute(
            text("UPDATE sync_source.document SET is_processed = TRUE WHERE id = :id"),
            {"id": document_id},
        )
        await db.commit()

        logger.info(
            "Document processed | doc_id=%s | cleaned_length=%d | chunk_size=%d | chunks=%d",
            document_id,
            plan.cleaned_length,
            plan.chunk_size,
            total_inserted,
        )

        return {
            "document_id":      document_id,
            "chunks_created":   total_inserted,
            "total_characters": total_characters,
        }

    except Exception:
        await db.rollback()
        logger.exception(
            "Document processing failed — rolled back | doc_id=%s", document_id,
        )
        raise


# ---------------------------------------------------------------------------
# Query APIs
# ---------------------------------------------------------------------------

async def get_source_document(
    db: AsyncSession,
    document_id: str,
) -> Optional[dict]:
    row = await db.execute(
        text("""
            SELECT id, title, source_type, source_url, file_name,
                   domain, exploration_id, uploaded_by,
                   is_processed, uploaded_at, metadata
            FROM sync_source.document
            WHERE id = :id
        """),
        {"id": document_id},
    )
    result = row.mappings().first()
    return dict(result) if result else None


async def list_source_documents(
    db: AsyncSession,
    domain: Optional[str] = None,
    exploration_id: Optional[str] = None,
) -> list[dict]:
    conditions: list[str] = []
    params: dict[str, Any] = {}

    if domain:
        conditions.append("domain = :domain")
        params["domain"] = domain
    if exploration_id:
        conditions.append("exploration_id = :eid")
        params["eid"] = exploration_id

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    rows = await db.execute(
        text(f"""
            SELECT id, title, source_type, source_url, file_name,
                   domain, exploration_id, uploaded_by,
                   is_processed, uploaded_at, metadata
            FROM sync_source.document
            {where}
            ORDER BY uploaded_at DESC
        """),
        params,
    )
    return [dict(r) for r in rows.mappings().all()]


async def get_document_chunks(
    db: AsyncSession,
    document_id: str,
    source_type: str,
    limit: int = 100,
    offset: int = 0,
    enforce_max_limit: bool = True,
    data_type: Optional[str] = None,
    order_by: str = "chunk_index",
) -> list[dict]:
    limit = max(limit, 1)
    if enforce_max_limit:
        limit = min(limit, _MAX_LIMIT)
    offset = max(offset, 0)
    normalized_data_type = _normalize_data_type_filter(data_type)
    ordering = _resolve_chunk_order_by(order_by)

    where_data_type = ""
    params: dict[str, Any] = {"did": document_id, "limit": limit, "offset": offset}
    if normalized_data_type:
        where_data_type = "AND data_type = :data_type"
        params["data_type"] = normalized_data_type

    rows = await db.execute(
        text(f"""
            SELECT id, document_id, chunk_index, content, content_json, data_type, created_at
            FROM sync_source.content_chunk
            WHERE document_id = :did
            {where_data_type}
            ORDER BY {ordering}, chunk_index, created_at, id
            LIMIT :limit OFFSET :offset
        """),
        params,
    )

    is_tabular = source_type.lower() in _TABULAR_TYPES
    result = []
    for r in rows.mappings().all():
        row = dict(r)
        if row.get("data_type") == DATA_TYPE_TABULAR or is_tabular:
            # content_json is already a dict (asyncpg deserialises JSONB automatically)
            if row.get("content_json") is not None:
                row["content"] = row["content_json"]
            else:
                logger.warning(
                    "Tabular chunk missing content_json | chunk_id=%s | doc_id=%s",
                    row.get("id"), document_id,
                )
                try:
                    row["content"] = json.loads(row["content"])
                except (json.JSONDecodeError, ValueError):
                    pass
        result.append(row)
    return result


async def search_source_chunks(
    db: AsyncSession,
    query: str,
    domain: Optional[str] = None,
    limit: int = 20,
    data_type: Optional[str] = None,
) -> list[dict]:
    """Full-text search across content chunks. Returns ranked results."""
    query_text = query.strip()
    if not query_text:
        return []

    limit = min(max(limit, 1), _MAX_LIMIT)
    params: dict[str, Any] = {"query_text": query_text, "limit": limit}
    normalized_data_type = _normalize_data_type_filter(data_type)

    domain_clause = ""
    if domain:
        domain_clause = "AND d.domain = :domain"
        params["domain"] = domain

    data_type_clause = ""
    if normalized_data_type:
        data_type_clause = "AND c.data_type = :data_type"
        params["data_type"] = normalized_data_type

    rows = await db.execute(
        text(f"""
            SELECT
                c.id            AS chunk_id,
                c.document_id,
                d.title         AS document_title,
                d.domain,
                c.data_type,
                c.chunk_index,
                c.content       AS snippet
            FROM sync_source.content_chunk c
            JOIN sync_source.document d ON d.id = c.document_id
            WHERE to_tsvector('simple', COALESCE(c.content, ''))
                  @@ websearch_to_tsquery('simple', :query_text)
            {domain_clause}
            {data_type_clause}
            ORDER BY ts_rank_cd(
                to_tsvector('simple', COALESCE(c.content, '')),
                websearch_to_tsquery('simple', :query_text)
            ) DESC,
            c.document_id,
            c.data_type,
            c.chunk_index
            LIMIT :limit
        """),
        params,
    )
    return [dict(r) for r in rows.mappings().all()]