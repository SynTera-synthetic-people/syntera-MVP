import aiofiles
from pathlib import Path
from uuid import uuid4
from typing import Tuple
import mimetypes


# Allow all formats we support
ALLOWED_EXT = {
    ".pdf", ".docx", ".txt",
    ".xls", ".xlsx", ".csv",
    ".png", ".jpg", ".jpeg"
}

MAX_FILE_BYTES = 20 * 1024 * 1024  # 20 MB

UPLOAD_DIR = Path("uploads/questionnaire")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def save_upload_file(upload_file) -> Tuple[str, str, str]:
    """
    Saves uploaded file and returns:
    (absolute_path, stored_filename, mime_type)
    """

    original_name = upload_file.filename
    ext = Path(original_name).suffix.lower()

    if ext not in ALLOWED_EXT:
        raise ValueError(f"Unsupported file type: {ext}")

    # read file bytes
    content = await upload_file.read()
    size = len(content)

    if size > MAX_FILE_BYTES:
        raise ValueError("File exceeds 20 MB size limit")

    mime_type = upload_file.content_type or mimetypes.guess_type(original_name)[0]

    stored_name = f"{uuid4().hex}{ext}"
    saved_path = UPLOAD_DIR / stored_name

    async with aiofiles.open(saved_path, "wb") as f:
        await f.write(content)

    # return absolute path for parser, stored_name, and mime type
    return str(saved_path), stored_name, mime_type
