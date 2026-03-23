"""Single place to build the Anthropic client from app settings (.env)."""
from anthropic import Anthropic

from app.config import settings


def _normalize_api_key(raw: str) -> str:
    k = (raw or "").strip()
    if len(k) >= 2 and ((k[0] == k[-1] == '"') or (k[0] == k[-1] == "'")):
        k = k[1:-1].strip()
    return k


def get_anthropic_client() -> Anthropic:
    key = _normalize_api_key(settings.ANTHROPIC_API_KEY or "")
    if not key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set in backend/.env. "
            "Create a key at https://console.anthropic.com/settings/keys"
        )
    return Anthropic(api_key=key)
