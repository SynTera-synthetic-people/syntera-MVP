from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
from app.utils.id_generator import generate_id


class UserSettings(SQLModel, table=True):
    __tablename__ = "user_settings"

    id: str = Field(default_factory=generate_id, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)

    # Notification preferences
    notification_email: bool = Field(default=True)
    notification_in_app: bool = Field(default=True)
    notification_research_updates: bool = Field(default=True)
    notification_billing_alerts: bool = Field(default=True)
    notification_product_updates: bool = Field(default=True)
    notification_security_alerts: bool = Field(default=True)

    # Display preferences
    language: str = Field(default="en")
    theme: str = Field(default="system")  # system | light | dark

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default=None)


class OrgSettings(SQLModel, table=True):
    __tablename__ = "org_settings"

    id: str = Field(default_factory=generate_id, primary_key=True)
    org_id: str = Field(foreign_key="organization.id", index=True)

    # JSON-encoded list of allowed email domains (e.g. ["acme.com", "acme.io"])
    # Stored as TEXT to avoid JSONB dependency issues; service layer handles parsing
    allowed_email_domains: str = Field(default="[]")

    # Default role assigned to new members invited to the org
    default_member_role: str = Field(default="user")

    # Reserved for future SSO integration
    enforce_sso: bool = Field(default=False)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default=None)
