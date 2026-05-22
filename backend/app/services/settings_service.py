"""
Settings service — user preferences and enterprise org settings.

Handles get/upsert for UserSettings and OrgSettings.
All operations are simple CRUD — no business logic side-effects.
"""
import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.user_settings import OrgSettings, UserSettings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# User settings
# ---------------------------------------------------------------------------

async def get_user_settings(session: AsyncSession, user_id: str) -> Optional[UserSettings]:
    return await session.scalar(
        select(UserSettings).where(UserSettings.user_id == user_id)
    )


async def get_or_create_user_settings(session: AsyncSession, user: User) -> UserSettings:
    settings = await get_user_settings(session, user.id)
    if not settings:
        settings = UserSettings(user_id=user.id)
        session.add(settings)
        await session.commit()
        await session.refresh(settings)
        logger.info("Created default user settings", extra={"user_id": user.id})
    return settings


async def update_user_settings(
    session: AsyncSession,
    user: User,
    notification_email: Optional[bool] = None,
    notification_in_app: Optional[bool] = None,
    notification_research_updates: Optional[bool] = None,
    notification_billing_alerts: Optional[bool] = None,
    notification_product_updates: Optional[bool] = None,
    notification_security_alerts: Optional[bool] = None,
    language: Optional[str] = None,
    theme: Optional[str] = None,
) -> UserSettings:
    settings = await get_or_create_user_settings(session, user)

    if notification_email is not None:
        settings.notification_email = notification_email
    if notification_in_app is not None:
        settings.notification_in_app = notification_in_app
    if notification_research_updates is not None:
        settings.notification_research_updates = notification_research_updates
    if notification_billing_alerts is not None:
        settings.notification_billing_alerts = notification_billing_alerts
    if notification_product_updates is not None:
        settings.notification_product_updates = notification_product_updates
    if notification_security_alerts is not None:
        settings.notification_security_alerts = notification_security_alerts
    if language is not None:
        settings.language = language
    if theme is not None:
        if theme not in ("system", "light", "dark"):
            raise ValueError("theme must be one of: system, light, dark")
        settings.theme = theme

    settings.updated_at = datetime.utcnow()
    session.add(settings)
    await session.commit()
    await session.refresh(settings)
    return settings


def format_user_settings(settings: UserSettings) -> dict:
    """Return old flat settings plus grouped settings for autosave UIs."""
    return {
        "id": settings.id,
        "user_id": settings.user_id,
        "notification_email": settings.notification_email,
        "notification_in_app": settings.notification_in_app,
        "notification_research_updates": settings.notification_research_updates,
        "notification_billing_alerts": settings.notification_billing_alerts,
        "notification_product_updates": settings.notification_product_updates,
        "notification_security_alerts": settings.notification_security_alerts,
        "language": settings.language,
        "theme": settings.theme,
        "notifications": {
            "email": settings.notification_email,
            "in_app": settings.notification_in_app,
            "research_updates": settings.notification_research_updates,
            "billing_alerts": settings.notification_billing_alerts,
            "product_updates": settings.notification_product_updates,
            "security_alerts": settings.notification_security_alerts,
        },
        "appearance": {
            "language": settings.language,
            "theme": settings.theme,
        },
        "created_at": settings.created_at,
        "updated_at": settings.updated_at,
    }


# ---------------------------------------------------------------------------
# Org settings
# ---------------------------------------------------------------------------

async def get_org_settings(session: AsyncSession, org_id: str) -> Optional[OrgSettings]:
    return await session.scalar(
        select(OrgSettings).where(OrgSettings.org_id == org_id)
    )


async def get_or_create_org_settings(session: AsyncSession, org_id: str) -> OrgSettings:
    settings = await get_org_settings(session, org_id)
    if not settings:
        settings = OrgSettings(org_id=org_id)
        session.add(settings)
        await session.commit()
        await session.refresh(settings)
        logger.info("Created default org settings", extra={"org_id": org_id})
    return settings


async def update_org_settings(
    session: AsyncSession,
    org_id: str,
    allowed_email_domains: Optional[list] = None,
    default_member_role: Optional[str] = None,
    enforce_sso: Optional[bool] = None,
) -> OrgSettings:
    settings = await get_or_create_org_settings(session, org_id)

    if allowed_email_domains is not None:
        settings.allowed_email_domains = json.dumps(allowed_email_domains)
    if default_member_role is not None:
        if default_member_role not in ("user", "enterprise_admin"):
            raise ValueError("default_member_role must be 'user' or 'enterprise_admin'")
        settings.default_member_role = default_member_role
    if enforce_sso is not None:
        settings.enforce_sso = enforce_sso

    settings.updated_at = datetime.utcnow()
    session.add(settings)
    await session.commit()
    await session.refresh(settings)
    return settings


def parse_org_settings(settings: OrgSettings) -> dict:
    """Decode stored JSON fields into Python types for response serialisation."""
    try:
        domains = json.loads(settings.allowed_email_domains or "[]")
    except (json.JSONDecodeError, TypeError):
        domains = []
    return {
        "id": settings.id,
        "org_id": settings.org_id,
        "allowed_email_domains": domains,
        "default_member_role": settings.default_member_role,
        "enforce_sso": settings.enforce_sso,
        "created_at": settings.created_at,
        "updated_at": settings.updated_at,
    }
