"""Persona Library routes.

The library is a read-only view over the personas the organisation already
owns — no publish step, nothing to curate. Routes are scoped under a workspace
so the organisation is resolved from the workspace (the authoritative link) and
authorisation reuses the same workspace-membership check every other persona
route already applies.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.schemas.response import ErrorResponse, SuccessResponse
from app.services import persona_library as library_service
from app.services import workspace as ws_service
from app.services.persona_library import PersonaLibraryError

router = APIRouter(
    prefix="/workspaces/{workspace_id}/persona-library",
    tags=["persona-library"],
)

logger = logging.getLogger(__name__)


def _error(message: str, code: int) -> HTTPException:
    return HTTPException(
        status_code=code,
        detail=ErrorResponse(status="error", message=message).dict(),
    )


async def _context(session: AsyncSession, workspace_id: str, user: User) -> str:
    """Authorise the caller and return the organisation the library belongs to."""
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m["user_id"] == user.id for m in members):
        raise _error("Not a member of this workspace", status.HTTP_403_FORBIDDEN)
    try:
        return await library_service.resolve_organization_id(session, workspace_id)
    except PersonaLibraryError as e:
        raise _error(e.message, e.status_code) from e


@router.get("", response_model=SuccessResponse)
async def list_persona_library(
    workspace_id: str,
    exploration_id: Optional[str] = Query(
        default=None,
        description=(
            "The exploration the picker was opened from. Its own personas are "
            "excluded, and personas already reused into it are flagged."
        ),
    ),
    origin_workspace_id: Optional[str] = Query(
        default=None, description="Filter to personas created in one workspace"
    ),
    search: Optional[str] = Query(default=None, alias="q", max_length=200),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Every reusable persona in this workspace's organisation."""
    org_id = await _context(session, workspace_id, current_user)

    items, total = await library_service.list_library_personas(
        session,
        org_id,
        exploration_id=exploration_id,
        origin_workspace_id=origin_workspace_id,
        search=search,
        limit=limit,
        offset=offset,
    )
    return SuccessResponse(
        message="Persona library fetched",
        data={"items": items, "total": total, "limit": limit, "offset": offset},
    )


@router.get("/{persona_id}", response_model=SuccessResponse)
async def get_persona_library_item(
    workspace_id: str,
    persona_id: str,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Full detail for one library persona."""
    org_id = await _context(session, workspace_id, current_user)
    try:
        item = await library_service.get_library_persona(session, org_id, persona_id)
    except PersonaLibraryError as e:
        raise _error(e.message, e.status_code) from e
    return SuccessResponse(message="Persona library item fetched", data=item)
