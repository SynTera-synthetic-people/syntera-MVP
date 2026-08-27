from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


MAX_IMPORT_BATCH = 50


class PersonaLibraryImportRequest(BaseModel):
    """Reuse the selected library personas in this exploration.

    Ids are source persona ids — the library is a live view over the
    organisation's personas, not a separate table.
    """
    source_persona_ids: List[str] = Field(min_length=1, max_length=MAX_IMPORT_BATCH)

    @field_validator("source_persona_ids")
    @classmethod
    def _dedupe(cls, v: List[str]) -> List[str]:
        """Order-preserving de-duplication.

        Duplicate ids in one request are a client bug, not an error worth
        failing on — importing the same persona twice into one exploration
        would create two identical rows and silently burn two quota slots.
        """
        seen: set[str] = set()
        out: List[str] = []
        for item in v:
            item = (item or "").strip()
            if item and item not in seen:
                seen.add(item)
                out.append(item)
        if not out:
            raise ValueError("source_persona_ids must contain at least one non-empty id")
        return out


class PersonaLibraryItemOut(BaseModel):
    """Card-level projection of one reusable persona."""
    id: str
    name: Optional[str] = None

    origin_exploration_id: Optional[str] = None
    origin_exploration_title: Optional[str] = None
    origin_workspace_id: Optional[str] = None
    origin_workspace_name: Optional[str] = None

    age_range: Optional[str] = None
    gender: Optional[str] = None
    location_state: Optional[str] = None
    geography: Optional[str] = None
    occupation: Optional[str] = None
    income_range: Optional[str] = None
    industry: Optional[str] = None

    master_calibration_confidence: Optional[int] = None
    persona_source: Optional[str] = None
    calibration_status: Optional[str] = None

    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: Optional[datetime] = None

    times_reused: int = 0
    already_imported: bool = False


class PersonaLibraryImportSkipped(BaseModel):
    source_persona_id: str
    reason: Literal[
        "already_imported", "draft", "not_found", "not_in_organization", "limit_reached"
    ]
    message: str
