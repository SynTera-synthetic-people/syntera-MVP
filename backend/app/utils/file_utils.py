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
