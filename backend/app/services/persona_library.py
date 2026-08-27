"""Persona Library service.

The library is a **live view over the personas an organisation already owns** —
there is no publish step and no separate library table. Every calibrated persona
created in any workspace of the organisation is automatically available for
reuse in a new exploration.

Reusing one materialises a NEW `Persona` row in the target exploration, copied
from the source. It is never a shared reference, because:

  * `Persona.exploration_id` is NOT NULL — a persona cannot span explorations.
  * Deleting an exploration hard-deletes its personas
    (`delete(Persona).where(Persona.exploration_id == eid)` in
    services/exploration.py).
  * Seven tables (interview, questionnaire, survey, rebuttal, artifact, neuro,
    llm_usage) reference `persona.id` with no exploration discriminator, so one
    shared row would mix study data.

See docs/persona-library-proposal.md.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Iterable, Optional

from sqlalchemy import func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models.exploration import Exploration
from app.models.organization import Organization
from app.models.persona import Persona
from app.models.user import User
from app.models.workspace import Workspace
from app.services.persona import persona_to_dict
from app.utils.id_generator import generate_id

logger = logging.getLogger(__name__)


class PersonaLibraryError(Exception):
    """Domain error carrying an HTTP status for the router to translate."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


# Flat Persona columns that travel with a copy. Everything exploration specific
# (id, exploration_id, workspace_id, created_at, created_by) is deliberately
# excluded and re-derived at import time.
_STR_FIELDS = (
    "name", "age_range", "gender",
    "location_country", "location_state", "education_level", "occupation",
    "income_range", "family_size", "geography",
    "lifestyle", "values", "personality", "motivations",
    "brand_sensitivity", "price_sensitivity",
    "mobility", "accommodation", "marital_status", "daily_rhythm",
    "hobbies", "professional_traits", "digital_activity", "preferences",
    "backstory",
)

# Columns the Persona table declares NOT NULL — a copy must always supply a
# string for these, even if the source is missing them.
_REQUIRED_STR_FIELDS = (
    "name", "age_range", "gender",
    "location_country", "education_level", "occupation", "income_range",
)


def _coerce_str(value: Any) -> Optional[str]:
    """Mirror of persona service's coercion: any scalar/list → str for VARCHAR."""
    if value is None:
        return None
    if isinstance(value, list):
        joined = ", ".join(str(v) for v in value if v)
        return joined or None
    if isinstance(value, dict):
        return None
    return value if isinstance(value, str) else str(value)


def _json_safe(payload: Any) -> Any:
    """Guarantee asyncpg receives something JSONB can store.

    persona_details is free-form LLM output: it can carry datetimes, NaN, or
    Decimal. Doing this before the write surfaces a failure as a plain
    ValueError instead of an opaque DBAPIError mid-transaction.
    """
    return json.loads(json.dumps(payload, default=str))


# ── Organisation resolution ─────────────────────────────────────────────────

async def resolve_organization_id(session: AsyncSession, workspace_id: str) -> str:
    """Workspace → organisation. The workspace is the authoritative link.

    Resolving from the workspace rather than the JWT means an ordinary member
    of an enterprise org reaches the right library even if their token predates
    the organization_id claim.
    """
    org_id = await session.scalar(
        select(Workspace.organization_id).where(Workspace.id == workspace_id)
    )
    if not org_id:
        raise PersonaLibraryError("Workspace not found", status_code=404)
    return org_id


async def is_enterprise_organization(session: AsyncSession, org_id: str) -> bool:
    tier = await session.scalar(
        select(Organization.account_tier).where(Organization.id == org_id)
    )
    return (tier or "").strip().lower() == "enterprise"


# ── The library query ───────────────────────────────────────────────────────

def _library_filters(org_id: str, exclude_exploration_id: Optional[str]):
    """Which personas count as reusable library entries.

    Excluded, in order of importance:
      * personas outside this organisation — the isolation boundary
      * personas from soft-deleted explorations — the study is gone
      * drafts — no calibrated traits worth reusing yet
      * personas that are themselves library copies — otherwise reusing a
        persona twice makes it appear three times in the list
      * personas already in the exploration the picker was opened from —
        they are not "reusable elsewhere", they are already here
    """
    filters = [
        Workspace.organization_id == org_id,
        Exploration.is_deleted == False,  # noqa: E712
        Persona.library_source_persona_id.is_(None),
        or_(
            Persona.calibration_status.is_(None),
            Persona.calibration_status != "draft",
        ),
    ]
    if exclude_exploration_id:
        filters.append(Persona.exploration_id != exclude_exploration_id)
    return filters


def _base_query(org_id: str, exclude_exploration_id: Optional[str]):
    return (
        select(Persona, Exploration.title, Workspace.name, Workspace.id)
        .join(Exploration, Persona.exploration_id == Exploration.id)
        .join(Workspace, Persona.workspace_id == Workspace.id)
        .where(*_library_filters(org_id, exclude_exploration_id))
    )


def _summary(
    persona: Persona,
    *,
    exploration_title: Optional[str],
    workspace_name: Optional[str],
    workspace_id: Optional[str],
    creator_name: Optional[str] = None,
    times_reused: int = 0,
    already_imported: bool = False,
) -> dict:
    """Card-level projection. Deliberately not the whole persona: the picker
    lists many at once and the full persona_details blob is large."""
    details = persona.persona_details if isinstance(persona.persona_details, dict) else {}
    confidence = persona.master_calibration_confidence
    if confidence is None:
        confidence = persona.calibration_confidence

    if persona.parent_persona_id:
        source = "replicated"
    elif persona.auto_generated_persona:
        source = "omi"
    else:
        source = "manual"

    return {
        # `id` is the source persona's id — that is what the client sends back
        # to reuse it.
        "id": persona.id,
        "name": persona.name,
        "origin_exploration_id": persona.exploration_id,
        "origin_exploration_title": exploration_title,
        "origin_workspace_id": workspace_id,
        "origin_workspace_name": workspace_name,
        "age_range": persona.age_range,
        "gender": persona.gender,
        "location_state": persona.location_state,
        "geography": persona.geography or persona.location_country,
        "occupation": persona.occupation,
        "income_range": persona.income_range,
        "master_calibration_confidence": confidence,
        "persona_source": source,
        "calibration_status": persona.calibration_status,
        "created_by": persona.created_by,
        "created_by_name": "Omi" if source == "omi" else creator_name,
        "created_at": persona.created_at,
        "times_reused": times_reused,
        "already_imported": already_imported,
        "industry": details.get("industry"),
    }


async def _creator_names(session: AsyncSession, personas: Iterable[Persona]) -> dict:
    ids = {p.created_by for p in personas if p.created_by}
    if not ids:
        return {}
    rows = await session.execute(select(User).where(User.id.in_(ids)))
    names: dict[str, str] = {}
    for u in rows.scalars().all():
        display = u.full_name or f"{u.first_name or ''} {u.last_name or ''}".strip()
        if display:
            names[u.id] = display
    return names


async def _reuse_counts(session: AsyncSession, persona_ids: list[str]) -> dict:
    """How many times each persona has already been reused elsewhere.

    Derived rather than stored — a counter column would drift the moment a
    copy is deleted.
    """
    if not persona_ids:
        return {}
    rows = await session.execute(
        select(Persona.library_source_persona_id, func.count())
        .where(Persona.library_source_persona_id.in_(persona_ids))
        .group_by(Persona.library_source_persona_id)
    )
    return {src: int(n) for src, n in rows.all() if src}


async def list_library_personas(
    session: AsyncSession,
    org_id: str,
    *,
    exploration_id: Optional[str] = None,
    origin_workspace_id: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """Every reusable persona in the organisation, newest first."""
    extra = []
    if origin_workspace_id:
        extra.append(Persona.workspace_id == origin_workspace_id)
    if search:
        pattern = f"%{search.strip()}%"
        extra.append(
            or_(
                Persona.name.ilike(pattern),
                Persona.occupation.ilike(pattern),
                Persona.geography.ilike(pattern),
                Persona.location_country.ilike(pattern),
                Exploration.title.ilike(pattern),
            )
        )

    total = await session.scalar(
        select(func.count())
        .select_from(Persona)
        .join(Exploration, Persona.exploration_id == Exploration.id)
        .join(Workspace, Persona.workspace_id == Workspace.id)
        .where(*_library_filters(org_id, exploration_id), *extra)
    ) or 0

    rows = await session.execute(
        _base_query(org_id, exploration_id)
        .where(*extra)
        .order_by(Persona.created_at.desc())
        .limit(max(1, min(limit, 200)))
        .offset(max(0, offset))
    )
    records = rows.all()
    personas = [r[0] for r in records]
    ids = [p.id for p in personas]

    # Which of these already have a copy in the exploration the picker was
    # opened from, so the UI can disable them instead of creating duplicates.
    imported: set = set()
    if exploration_id and ids:
        res = await session.execute(
            select(Persona.library_source_persona_id).where(
                Persona.exploration_id == exploration_id,
                Persona.library_source_persona_id.in_(ids),
            )
        )
        imported = {r for r in res.scalars().all() if r}

    names = await _creator_names(session, personas)
    reuse = await _reuse_counts(session, ids)

    return [
        _summary(
            persona,
            exploration_title=title,
            workspace_name=ws_name,
            workspace_id=ws_id,
            creator_name=names.get(persona.created_by),
            times_reused=reuse.get(persona.id, 0),
            already_imported=persona.id in imported,
        )
        for persona, title, ws_name, ws_id in records
    ], int(total)


async def get_library_persona(
    session: AsyncSession, org_id: str, persona_id: str
) -> dict:
    """Full detail for one library persona, for the preview panel."""
    persona = await _load_org_persona(session, org_id, persona_id)
    creator = None
    if persona.created_by:
        u = await session.get(User, persona.created_by)
        if u:
            creator = u.full_name or f"{u.first_name or ''} {u.last_name or ''}".strip() or None

    exploration = await session.get(Exploration, persona.exploration_id)
    workspace = await session.get(Workspace, persona.workspace_id)
    reuse = await _reuse_counts(session, [persona.id])

    out = _summary(
        persona,
        exploration_title=exploration.title if exploration else None,
        workspace_name=workspace.name if workspace else None,
        workspace_id=persona.workspace_id,
        creator_name=creator,
        times_reused=reuse.get(persona.id, 0),
    )
    out["persona"] = persona_to_dict(persona, creator_full_name=creator)
    return out


async def _load_org_persona(
    session: AsyncSession, org_id: str, persona_id: str
) -> Persona:
    """Fetch a persona, enforcing the organisation boundary.

    404 rather than 403 on a persona from another tenant: never confirm
    existence across organisations.
    """
    row = (
        await session.execute(
            select(Persona)
            .join(Workspace, Persona.workspace_id == Workspace.id)
            .where(Persona.id == persona_id, Workspace.organization_id == org_id)
        )
    ).scalars().first()
    if not row:
        raise PersonaLibraryError("Persona not found", status_code=404)
    return row


# ── Reuse (copy into a target exploration) ──────────────────────────────────

def _persona_kwargs_from_source(
    source: Persona,
    *,
    exploration_id: str,
    workspace_id: str,
    created_by: str,
) -> dict:
    """Map a source persona onto a fresh Persona row for another exploration.

    parent_persona_id is intentionally left unset: that column means "country
    replicated variant" and is excluded from the persona quota count in
    routers/personas.py::_count_primary_personas. A library reuse is a primary
    persona and must count toward the exploration's limit, otherwise selecting
    N from the library would still generate N more.
    """
    kwargs: dict[str, Any] = {
        "id": generate_id(),
        "exploration_id": exploration_id,
        "workspace_id": workspace_id,
        "created_by": created_by,
        "library_source_persona_id": source.id,
        "library_imported_at": datetime.utcnow(),
        "created_at": datetime.utcnow(),
    }

    for field in _STR_FIELDS:
        value = _coerce_str(getattr(source, field, None))
        if field in _REQUIRED_STR_FIELDS:
            kwargs[field] = value or ""
        elif value is not None:
            kwargs[field] = value

    kwargs["interests"] = source.interests if isinstance(source.interests, list) else None
    kwargs["ocean_profile"] = source.ocean_profile if isinstance(source.ocean_profile, dict) else None

    details = dict(source.persona_details) if isinstance(source.persona_details, dict) else {}
    # Breadcrumb inside the snapshot so a persona exported or inspected later
    # still shows where it came from, independent of the column.
    details["library_origin"] = {
        "source_persona_id": source.id,
        "origin_exploration_id": source.exploration_id,
        "origin_workspace_id": source.workspace_id,
        "imported_at": kwargs["library_imported_at"].isoformat(),
    }
    kwargs["persona_details"] = _json_safe(details)

    # A library persona is calibrated by definition (drafts are filtered out of
    # the listing); carrying the status forward keeps it out of the "draft"
    # branches in the persona routes.
    status = source.calibration_status or "calibrated"
    kwargs["calibration_status"] = "calibrated" if status == "draft" else status

    kwargs["calibration_confidence"] = source.calibration_confidence
    kwargs["master_calibration_confidence"] = source.master_calibration_confidence

    # Preserve how the persona was originally made (Omi vs hand-built) so the
    # existing "Created By" rendering stays truthful.
    kwargs["auto_generated_persona"] = bool(source.auto_generated_persona)

    for passthrough in ("subject_key", "ml_domain"):
        value = getattr(source, passthrough, None)
        if value:
            kwargs[passthrough] = value

    return kwargs


async def import_personas(
    session: AsyncSession,
    *,
    org_id: str,
    workspace_id: str,
    exploration_id: str,
    source_persona_ids: list[str],
    user_id: str,
    persona_limit: int,
    current_persona_count: int,
) -> tuple[list[Persona], list[dict]]:
    """Copy the selected library personas into an exploration.

    Returns (created, skipped) where each skipped entry explains why. One
    commit: a half-applied import would leave the exploration's persona count
    wrong and the quota maths downstream broken.
    """
    rows = await session.execute(
        select(Persona, Workspace.organization_id)
        .join(Workspace, Persona.workspace_id == Workspace.id)
        .where(Persona.id.in_(source_persona_ids))
    )
    by_id = {p.id: (p, org) for p, org in rows.all()}

    already = await session.execute(
        select(Persona.library_source_persona_id).where(
            Persona.exploration_id == exploration_id,
            Persona.library_source_persona_id.in_(source_persona_ids),
        )
    )
    already_ids = {r for r in already.scalars().all() if r}

    created: list[Persona] = []
    skipped: list[dict] = []
    remaining = max(persona_limit - current_persona_count, 0)

    # Preserve the caller's selection order so personas land in the order the
    # user ticked them.
    for persona_id in source_persona_ids:
        entry = by_id.get(persona_id)
        if entry is None:
            skipped.append({
                "source_persona_id": persona_id,
                "reason": "not_found",
                "message": "This persona is no longer available.",
            })
            continue

        source, source_org = entry
        if source_org != org_id:
            skipped.append({
                "source_persona_id": persona_id,
                "reason": "not_in_organization",
                "message": "This persona belongs to a different organisation.",
            })
            continue
        if source.exploration_id == exploration_id:
            skipped.append({
                "source_persona_id": persona_id,
                "reason": "already_imported",
                "message": f"'{source.name}' is already in this exploration.",
            })
            continue
        if persona_id in already_ids:
            skipped.append({
                "source_persona_id": persona_id,
                "reason": "already_imported",
                "message": f"'{source.name}' is already in this exploration.",
            })
            continue
        if (source.calibration_status or "").strip().lower() == "draft":
            skipped.append({
                "source_persona_id": persona_id,
                "reason": "draft",
                "message": f"'{source.name}' is still a draft and cannot be reused.",
            })
            continue
        if len(created) >= remaining:
            skipped.append({
                "source_persona_id": persona_id,
                "reason": "limit_reached",
                "message": (
                    f"'{source.name}' was not added — this exploration allows "
                    f"{persona_limit} personas."
                ),
            })
            continue

        persona = Persona(**_persona_kwargs_from_source(
            source,
            exploration_id=exploration_id,
            workspace_id=workspace_id,
            created_by=user_id,
        ))
        session.add(persona)
        created.append(persona)

    if created:
        await session.commit()
        for p in created:
            await session.refresh(p)
        logger.info(
            "persona_library.import org=%s exploration=%s imported=%d skipped=%d by=%s",
            org_id, exploration_id, len(created), len(skipped), user_id,
        )
    # No rollback on the empty path on purpose: session.add() happens only
    # inside the branch that appends to `created`, so an all-skipped import
    # leaves nothing pending. Calling rollback() "just in case" would expire
    # every object already loaded in the caller's session — including rows the
    # router still needs to serialise.

    return created, skipped
