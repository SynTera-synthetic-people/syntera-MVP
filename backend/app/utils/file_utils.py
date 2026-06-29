# app/utils/file_utils.py
import aiofiles
from pathlib import Path
from uuid import uuid4
from typing import Tuple
import mimetypes

ALLOWED_EXT = {".pdf", ".docx", ".txt"}
MAX_FILE_BYTES = 10 * 1024 * 1024

UPLOAD_DIR = Path("uploads/research")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

async def save_upload_file(upload_file) -> Tuple[str, int, str]:
    original_name = upload_file.filename
    ext = Path(original_name).suffix.lower()

    if ext not in ALLOWED_EXT:
        raise ValueError(f"Unsupported file type: {ext}")

    content = await upload_file.read()
    size = len(content)

    if size > MAX_FILE_BYTES:
        raise ValueError("File exceeds 10 MB size limit")

    content_type = upload_file.content_type or mimetypes.guess_type(original_name)[0]
    stored_name = f"{uuid4().hex}{ext}"
    dest = UPLOAD_DIR / stored_name

    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    return stored_name, size, content_type


# ── Research Objective Framer materials ────────────────────────────────────
# Separate constants/dir from the block above on purpose: the Framer's "Add
# Material" tab needs a broader set of formats (legacy PPT/XLS, PPTX/XLSX/CSV,
# PNG/JPG/GIF/WEBP/SVG) than the existing RO file-attach flow above, and
# changing the shared ALLOWED_EXT would silently loosen validation for that
# unrelated, already-working flow.

MATERIAL_ALLOWED_EXT = {
    ".pdf", ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls", ".csv",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
}
MATERIAL_MAX_FILE_BYTES = 20 * 1024 * 1024

MATERIAL_UPLOAD_DIR = Path("uploads/research_materials")
MATERIAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def save_material_file(upload_file) -> Tuple[str, int, str, str]:
    """Saves a Framer-material upload. Returns (stored_name, size, content_type, ext)."""
    original_name = upload_file.filename
    ext = Path(original_name).suffix.lower()

    if ext not in MATERIAL_ALLOWED_EXT:
        raise ValueError(f"Unsupported file type: {ext}")

    content = await upload_file.read()
    size = len(content)

    if size > MATERIAL_MAX_FILE_BYTES:
        raise ValueError("File exceeds 20 MB size limit")

    content_type = upload_file.content_type or mimetypes.guess_type(original_name)[0]
    return await save_material_bytes(content, ext, content_type)


async def save_material_bytes(content: bytes, ext: str, content_type: str | None) -> Tuple[str, int, str, str]:
    """Persists raw bytes (e.g. downloaded from a pasted link) the same way as an
    uploaded file. Returns (stored_name, size, content_type, ext)."""
    stored_name = f"{uuid4().hex}{ext}"
    dest = MATERIAL_UPLOAD_DIR / stored_name

    async with aiofiles.open(dest, "wb") as f:
        await f.write(content)

    return stored_name, len(content), content_type, ext


def material_file_path(stored_name: str) -> Path:
    return MATERIAL_UPLOAD_DIR / stored_name
