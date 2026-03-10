"""
Pydantic schemas for Enterprise tier management.

These DTOs are used exclusively by the /enterprise/* router and enterprise_service.
They are separate from admin schemas to keep concerns isolated.
"""
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, Literal


class EnterpriseOrgCreate(BaseModel):
    """
    Payload for SP admin to provision a new enterprise organisation.

    Creates the org AND an enterprise_admin user in one atomic operation.
    Credentials for the enterprise admin are delivered via email only.
    """
    org_name: str
    admin_full_name: str
    admin_email: EmailStr
    admin_user_type: Literal["Student", "Startup", "Researcher"] = "Researcher"
    # Default exploration quota — overridable per contract
    exploration_limit: int = 10


class EnterpriseOrgOut(BaseModel):
    """Summary of an enterprise organisation returned by list/get endpoints."""
    id: str
    name: str
    account_tier: str
    exploration_limit: int
    exploration_count: int
    owner_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class EnterpriseAddMemberIn(BaseModel):
    """
    Payload for an enterprise_admin to add a standard user to their org.

    A temporary password is generated and emailed to the new user.
    """
    full_name: str
    email: EmailStr
    user_type: Literal["Student", "Startup", "Researcher"] = "Researcher"


class EnterpriseMemberOut(BaseModel):
    """User profile as seen by enterprise admin in the member list."""
    id: str
    full_name: str
    email: str
    role: str
    account_tier: str
    organization_id: Optional[str]
    is_active: bool
    exploration_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class EnterpriseUpdateLimitIn(BaseModel):
    """Allow SP admin to adjust an enterprise org's exploration quota."""
    exploration_limit: int
