"""
SyncDB ingestion helpers.
"""
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def parse_json_strings(obj: Any, _path: str = "") -> Any:
    """
    Recursively walk a dict/list and parse any string values that look like
    JSON arrays or objects into their native Python equivalents.

    Rules:
    - Only strings whose first non-whitespace character is '[' or '{' are attempted.
    - On success   → replaced with the parsed value; recursion continues inside it
                     so nested JSON strings are also expanded.
    - On failure   → original string kept unchanged (never crashes ingestion).
    - Already-parsed dicts/lists are recursed into without re-serialisation
      (no double-parsing risk).

    Args:
        obj:    The value to process (any type).
        _path:  Dot-notation path used in log messages (auto-built on recursion).

    Returns:
        A new object with the same structure but JSON strings expanded.
    """
    if isinstance(obj, dict):
        return {
            k: parse_json_strings(v, _path=f"{_path}.{k}" if _path else k)
            for k, v in obj.items()
        }

    if isinstance(obj, list):
        return [
            parse_json_strings(item, _path=f"{_path}[{i}]")
            for i, item in enumerate(obj)
        ]

    if isinstance(obj, str):
        stripped = obj.strip()
        if stripped and stripped[0] in ("{", "["):
            try:
                parsed = json.loads(stripped)
                # Only expand if the result is a container — a bare JSON number
                # like "123" is not a JSON string we care about.
                if isinstance(parsed, (dict, list)):
                    logger.debug("syncdb: parsed JSON string at '%s'", _path)
                    # Recurse so nested JSON strings inside the parsed object
                    # are also expanded.
                    return parse_json_strings(parsed, _path=_path)
            except (json.JSONDecodeError, ValueError):
                logger.warning(
                    "syncdb: field '%s' looks like JSON but failed to parse — "
                    "keeping original string value",
                    _path,
                )

    return obj
