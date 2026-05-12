"""
Settings router — user notification/display preferences.

Routes:
  GET   /settings/me   → get (or auto-create with defaults) user settings
  PATCH /settings/me   → partial update user settings
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.schemas.response import SuccessResponse
from app.config import settings
from app.schemas.settings import HelpSupportIn, UserSettingsIn
from app.services import settings_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("/me", response_model=SuccessResponse)
async def get_my_settings(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Return the authenticated user's notification and display preferences."""
    prefs = await settings_service.get_or_create_user_settings(session, current_user)
    return SuccessResponse(
        message="Settings fetched successfully",
        data=settings_service.format_user_settings(prefs),
    )


@router.patch("/me", response_model=SuccessResponse)
async def update_my_settings(
    payload: UserSettingsIn,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Update the authenticated user's notification and display preferences.

    All fields are optional — only supplied values are written.
    """
    payload_data = payload.model_dump()
    if all(v is None for v in payload_data.values()):
        raise HTTPException(status_code=400, detail="No settings fields provided to update.")

    notifications = payload.notifications or {}
    appearance = payload.appearance or {}

    try:
        prefs = await settings_service.update_user_settings(
            session,
            current_user,
            notification_email=payload.notification_email if payload.notification_email is not None else notifications.get("email"),
            notification_in_app=payload.notification_in_app if payload.notification_in_app is not None else notifications.get("in_app"),
            notification_research_updates=(
                payload.notification_research_updates
                if payload.notification_research_updates is not None
                else notifications.get("research_updates")
            ),
            notification_billing_alerts=(
                payload.notification_billing_alerts
                if payload.notification_billing_alerts is not None
                else notifications.get("billing_alerts")
            ),
            notification_product_updates=(
                payload.notification_product_updates
                if payload.notification_product_updates is not None
                else notifications.get("product_updates")
            ),
            notification_security_alerts=(
                payload.notification_security_alerts
                if payload.notification_security_alerts is not None
                else notifications.get("security_alerts")
            ),
            language=payload.language if payload.language is not None else appearance.get("language"),
            theme=payload.theme if payload.theme is not None else appearance.get("theme"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return SuccessResponse(
        message="Settings updated successfully",
        data=settings_service.format_user_settings(prefs),
    )


@router.get("/help/resources", response_model=SuccessResponse)
async def get_help_resources(
    current_user: User = Depends(get_current_active_user),
):
    """Return static help/manual/legal resource metadata for Account > Help."""
    base_url = settings.FRONTEND_URL.rstrip("/")
    return SuccessResponse(
        message="Help resources fetched successfully",
        data={
            "help_centre_url": f"{base_url}/help",
            "usage_manual_url": f"{base_url}/help/manual",
            "terms_version": "2026-05-11",
            "privacy_policy_version": "2026-05-11",
            "terms_url": f"{base_url}/terms",
            "privacy_policy_url": f"{base_url}/privacy",
            "support_email": "humans@synthetic-people.ai",
        },
    )


@router.post("/help/support", response_model=SuccessResponse)
async def submit_support_request(
    payload: HelpSupportIn,
    current_user: User = Depends(get_current_active_user),
):
    """
    Capture support/help request metadata without adding a ticketing integration.
    """
    if not payload.subject.strip() or not payload.message.strip():
        raise HTTPException(status_code=422, detail="Subject and message are required.")

    return SuccessResponse(
        message="Support request received.",
        data={
            "ticket_created": False,
            "ticket_provider_connected": False,
            "reference": f"support-{current_user.id[:8]}",
            "category": payload.category,
            "support_email": "humans@synthetic-people.ai",
        },
    )
