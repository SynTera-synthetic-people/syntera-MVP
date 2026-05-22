from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class UserSettingsIn(BaseModel):
    """Partial update; only supplied fields are written."""
    notification_email: Optional[bool] = None
    notification_in_app: Optional[bool] = None
    notification_research_updates: Optional[bool] = None
    notification_billing_alerts: Optional[bool] = None
    notification_product_updates: Optional[bool] = None
    notification_security_alerts: Optional[bool] = None
    notifications: Optional[Dict[str, bool]] = None
    appearance: Optional[Dict[str, str]] = None
    language: Optional[str] = None
    theme: Optional[str] = None  # system | light | dark


class UserSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    notification_email: bool
    notification_in_app: bool
    notification_research_updates: bool
    notification_billing_alerts: bool
    notification_product_updates: bool
    notification_security_alerts: bool
    language: str
    theme: str
    notifications: Optional[Dict[str, bool]] = None
    appearance: Optional[Dict[str, str]] = None
    created_at: datetime
    updated_at: Optional[datetime]


class HelpSupportIn(BaseModel):
    subject: str
    message: str
    category: Optional[str] = "general"


class HelpResourceOut(BaseModel):
    help_centre_url: str
    usage_manual_url: str
    terms_version: str
    privacy_policy_version: str
    support_email: str


class OrgSettingsIn(BaseModel):
    """Partial update; only supplied fields are written."""
    allowed_email_domains: Optional[List[str]] = None
    default_member_role: Optional[str] = None   # user | enterprise_admin
    enforce_sso: Optional[bool] = None


class OrgSettingsOut(BaseModel):
    id: str
    org_id: str
    allowed_email_domains: List[str]
    default_member_role: str
    enforce_sso: bool
    created_at: datetime
    updated_at: Optional[datetime]


class OrgProfileIn(BaseModel):
    """Partial update; only supplied fields are written."""
    name: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    domain: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None


class OrgProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    account_tier: str
    description: Optional[str]
    logo_url: Optional[str]
    domain: Optional[str]
    industry: Optional[str]
    website: Optional[str]
    owner_id: Optional[str]
    exploration_limit: int
    exploration_count: int
    created_at: datetime
