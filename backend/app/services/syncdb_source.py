"""
SyncDB Source Bank Service

Stores and processes trusted reference documents (PDFs, DOCX, TXT).
Text is extracted and split into chunks stored in sync_source.content_chunk.
Search uses PostgreSQL full-text search over the content column.
"""
import io
import json
from pathlib import Path
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.utils.id_generator import generate_id

UPLOAD_DIR = Path("uploads/syncdb_source")
CHUNK_SIZE = 1000  # characters per chunk


def _ensure_upload_dir():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _save_file(file_bytes: bytes, filename: str) -> str:
    """Save uploaded bytes to disk. Returns the stored file path."""
    _ensure_upload_dir()
    stored_name = f"{generate_id()}_{filename}"
    path = UPLOAD_DIR / stored_name
    path.write_bytes(file_bytes)
    return str(path)


def _extract_text_pdf(file_bytes: bytes) -> str:
    """Extract plain text from a PDF using PyPDF2."""
    try:
        import PyPDF2

        reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        pages = []
        for page in reader.pages:
            text = page.extract_text() or ""
            pages.append(text)
        return "\n".join(pages)
    except Exception as exc:
        raise ValueError(f"PDF extraction failed: {exc}") from exc


def _extract_text_docx(file_bytes: bytes) -> str:
    """Extract plain text from a DOCX file."""
    try:
        import docx

        doc = docx.Document(io.BytesIO(file_bytes))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception as exc:
        raise ValueError(f"DOCX extraction failed: {exc}") from exc


def _extract_xlsx_as_json_chunks(file_bytes: bytes) -> list[str]:
    """
    Parse an XLSX file and return one JSON string per sheet.
    Each JSON string has the shape:
        {"sheet": "...", "headers": [...], "rows": [{...}, ...]}
    """
    try:
        import openpyxl

        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
        try:
            sheet_chunks: list[str] = []
            for sheet in wb.worksheets:
                all_rows = [
                    [cell for cell in row]
                    for row in sheet.iter_rows(values_only=True)
                    if any(cell is not None for cell in row)
                ]
                if not all_rows:
                    continue
                headers = [str(h).strip() if h is not None else "" for h in all_rows[0]]
                rows = []
                for row in all_rows[1:]:
                    rows.append({
                        headers[i]: str(row[i]).strip() if i < len(row) and row[i] is not None else ""
                        for i in range(len(headers))
                    })
                sheet_chunks.append(json.dumps({"sheet": sheet.title, "headers": headers, "rows": rows}, ensure_ascii=False))
        finally:
            wb.close()
        return sheet_chunks
    except Exception as exc:
        raise ValueError(f"XLSX extraction failed: {exc}") from exc


def _extract_text(file_bytes: bytes, source_type: str) -> str:
    """Dispatch to the correct extractor based on source_type."""
    st = source_type.lower()
    if st == "pdf":
        return _extract_text_pdf(file_bytes)
    if st in ("docx", "doc"):
        return _extract_text_docx(file_bytes)
    if st == "txt":
        return file_bytes.decode("utf-8", errors="replace")
    raise ValueError(f"Unsupported source_type: {source_type}")


def _split_into_chunks(text: str, chunk_size: int = CHUNK_SIZE) -> list[str]:
    """Split text into overlapping chunks on paragraph or word boundaries."""
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) + 1 <= chunk_size:
            current = (current + "\n" + para).strip()
        else:
            if current:
                chunks.append(current)
            # If a single paragraph exceeds chunk_size, split it hard
            if len(para) > chunk_size:
                for i in range(0, len(para), chunk_size):
                    chunks.append(para[i : i + chunk_size])
                current = ""
            else:
                current = para
    if current:
        chunks.append(current)
    return chunks


# ── Public service functions ─────────────────────────────────────────────────

async def upload_source_document(
    db: AsyncSession,
    file_bytes: bytes,
    filename: str,
    title: str,
    source_type: str,
    exploration_id: Optional[str],
    user_id: str,
) -> dict:
    """
    Save file to disk, register document in DB.
    Does NOT extract content yet — call process_document() separately.
    """
    file_path = _save_file(file_bytes, filename)
    doc_id = generate_id()

    ext = Path(filename).suffix.lstrip(".").lower() or source_type
    await db.execute(
        text("""
            INSERT INTO sync_source.document
                (id, title, source_type, source_url, file_path,
                 exploration_id, uploaded_by)
            VALUES
                (:id, :title, :source_type, NULL, :file_path,
                 :exploration_id, :uploaded_by)
        """),
        {
            "id": doc_id,
            "title": title,
            "source_type": ext,
            "file_path": file_path,
            "exploration_id": exploration_id,
            "uploaded_by": user_id,
        },
    )
    await db.commit()
    return await get_source_document(db, doc_id)


async def register_url_document(
    db: AsyncSession,
    url: str,
    title: str,
    exploration_id: Optional[str],
    user_id: str,
) -> dict:
    """Register a URL-based document (PDF or webpage). Content extracted later."""
    doc_id = generate_id()
    await db.execute(
        text("""
            INSERT INTO sync_source.document
                (id, title, source_type, source_url, file_path,
                 exploration_id, uploaded_by)
            VALUES
                (:id, :title, 'url', :url, NULL,
                 :exploration_id, :uploaded_by)
        """),
        {
            "id": doc_id,
            "title": title,
            "url": url,
            "exploration_id": exploration_id,
            "uploaded_by": user_id,
        },
    )
    await db.commit()
    return await get_source_document(db, doc_id)


async def process_document(db: AsyncSession, document_id: str) -> dict:
    """
    Extract text from a stored document, chunk it, and save to content_chunk.
    Marks document as is_processed=True on success.
    """
    row = await db.execute(
        text("SELECT * FROM sync_source.document WHERE id = :id"),
        {"id": document_id},
    )
    doc = row.mappings().first()
    if doc is None:
        raise ValueError(f"Document {document_id} not found")

    doc = dict(doc)
    if doc["source_type"] == "url":
        raise ValueError("URL-based document extraction is not yet supported. Download the file first.")

    file_path = doc.get("file_path")
    if not file_path or not Path(file_path).exists():
        raise ValueError(f"File not found at path: {file_path}")

    file_bytes = Path(file_path).read_bytes()
    source_type = doc["source_type"].lower()

    if source_type in ("xlsx", "xls"):
        chunks = _extract_xlsx_as_json_chunks(file_bytes)
        total_characters = sum(len(c) for c in chunks)
    else:
        raw_text = _extract_text(file_bytes, source_type)
        chunks = _split_into_chunks(raw_text)
        total_characters = len(raw_text)

    # Delete previous chunks (idempotent re-process)
    await db.execute(
        text("DELETE FROM sync_source.content_chunk WHERE document_id = :did"),
        {"did": document_id},
    )

    for idx, chunk_text in enumerate(chunks):
        await db.execute(
            text("""
                INSERT INTO sync_source.content_chunk
                    (id, document_id, chunk_index, content)
                VALUES (:id, :document_id, :chunk_index, :content)
            """),
            {
                "id": generate_id(),
                "document_id": document_id,
                "chunk_index": idx,
                "content": chunk_text,
            },
        )

    await db.execute(
        text("UPDATE sync_source.document SET is_processed = TRUE WHERE id = :id"),
        {"id": document_id},
    )
    await db.commit()

    return {
        "document_id": document_id,
        "chunks_created": len(chunks),
        "total_characters": total_characters,
    }


async def get_source_document(db: AsyncSession, document_id: str) -> Optional[dict]:
    row = await db.execute(
        text("SELECT * FROM sync_source.document WHERE id = :id"),
        {"id": document_id},
    )
    result = row.mappings().first()
    return dict(result) if result else None


async def list_source_documents(
    db: AsyncSession,
    exploration_id: Optional[str] = None,
) -> list[dict]:
    if exploration_id:
        rows = await db.execute(
            text("SELECT * FROM sync_source.document WHERE exploration_id = :eid ORDER BY uploaded_at DESC"),
            {"eid": exploration_id},
        )
    else:
        rows = await db.execute(
            text("SELECT * FROM sync_source.document ORDER BY uploaded_at DESC")
        )
    return [dict(r) for r in rows.mappings().all()]


async def get_document_chunks(
    db: AsyncSession,
    document_id: str,
    source_type: str,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    rows = await db.execute(
        text("""
            SELECT id, document_id, chunk_index, content
            FROM sync_source.content_chunk
            WHERE document_id = :did
            ORDER BY chunk_index
            LIMIT :limit OFFSET :offset
        """),
        {"did": document_id, "limit": limit, "offset": offset},
    )
    is_xlsx = source_type.lower() in ("xlsx", "xls")
    result = []
    for r in rows.mappings().all():
        row = dict(r)
        if is_xlsx:
            try:
                row["content"] = json.loads(row["content"])
            except (json.JSONDecodeError, ValueError):
                pass
        result.append(row)
    return result


async def search_source_chunks(
    db: AsyncSession,
    query: str,
    limit: int = 20,
) -> list[dict]:
    """Full-text search across content chunks using PostgreSQL text search, ranked by relevance."""
    query_text = query.strip()
    if not query_text:
        return []

    rows = await db.execute(
        text("""
            SELECT
                c.id        AS chunk_id,
                c.document_id,
                d.title     AS document_title,
                c.chunk_index,
                c.content   AS snippet
            FROM sync_source.content_chunk c
            JOIN sync_source.document d ON d.id = c.document_id
            WHERE to_tsvector('simple', COALESCE(c.content, ''))
                  @@ websearch_to_tsquery('simple', :query_text)
            ORDER BY ts_rank_cd(
                to_tsvector('simple', COALESCE(c.content, '')),
                websearch_to_tsquery('simple', :query_text)
            ) DESC,
            c.document_id,
            c.chunk_index
            LIMIT :limit
        """),
        {"query_text": query_text, "limit": limit},
    )
    return [dict(r) for r in rows.mappings().all()]
