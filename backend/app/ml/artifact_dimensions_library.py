"""In-memory loader for the Artifact Dimensions Library.

Deliberately NOT database-backed (no ArtifactDimension table/migration) — this
reads the JSON file shipped in app/data/ once per process and serves it from
memory. Wiring this into a real table is separate, later work.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

_LIBRARY_PATH = Path(__file__).resolve().parent.parent / "data" / "artifact_dimensions_library.json"

# dim_026 is a meta-entry: it has no questions of its own, it just points to
# type_specific dimension *names* per artifact type (e.g. "hook_strength" for
# ad_creative). Those have no canned questions in the library, so they're
# expanded into lightweight dimension dicts the LLM stages fill in around.
_TYPE_SPECIFIC_DIMENSION_ID = "dim_026"


@lru_cache(maxsize=1)
def _load_library() -> dict:
    with open(_LIBRARY_PATH, encoding="utf-8") as f:
        return json.load(f)


class ArtifactDimensionLibrary:
    """Read-only access to the 26-dimension library (25 core + type-specific)."""

    def __init__(self):
        self._library = _load_library()
        self._by_code = {d["code"]: d for d in self._library["dimensions"]}

    def get_core_dimensions(self) -> list[dict]:
        """The 25 universal dimensions that apply to every artifact type."""
        return [
            d for d in self._library["dimensions"]
            if d["id"] != _TYPE_SPECIFIC_DIMENSION_ID
        ]

    def get_type_specific_dimensions(self, artifact_type: str) -> list[dict]:
        """Lightweight dimension dicts synthesized from dim_026's type_specific map."""
        meta = self._by_code.get("artifact_specific_dimensions", {})
        codes = meta.get("type_specific", {}).get(artifact_type, [])
        return [
            {
                "id": f"{artifact_type}_{code}",
                "name": code.replace("_", " ").title(),
                "code": code,
                "theme": "Artifact-Specific Performance",
                "purpose": f"Artifact-type-specific dimension for {artifact_type}.",
                "discussion_questions": [],
                "artifact_types": [artifact_type],
                "is_core": False,
            }
            for code in codes
        ]

    def get_dimensions_for_type(self, artifact_type: str) -> list[dict]:
        """All candidate dimensions (core + type-specific) for one artifact type."""
        return self.get_core_dimensions() + self.get_type_specific_dimensions(artifact_type)

    def get_dimension(self, code: str) -> Optional[dict]:
        return self._by_code.get(code)

    def get_artifact_types(self) -> list[str]:
        return list(self._library["artifact_types"].keys())


artifact_dimension_library = ArtifactDimensionLibrary()
