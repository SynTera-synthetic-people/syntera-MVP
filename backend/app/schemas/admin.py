from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, Literal


class UserListOut(BaseModel):
    id: str
    full_name: str
    email: str
    user_type: str
    created_at: datetime
    status: str


class UserStatsOut(BaseModel):
    user_id: str
    total_workspaces: int
    total_explorations: int


# ---------------------------------------------------------------------------
# User Management DTOs (admin provisioning)
# ---------------------------------------------------------------------------

class AdminCreateUserIn(BaseModel):
    """DTO for admin-provisioned user creation."""
    full_name: str
    email: EmailStr
    role: Literal["user"] = "user"
    user_type: Literal["Student", "Startup", "Researcher"] = "Student"
    is_trial: bool = True
    # Pricing tier: "free" | "tier1" | "enterprise"
    account_tier: Literal["free", "tier1"] = "free"


class AdminUpdateUserIn(BaseModel):
    """DTO for admin updating a user. All fields are optional (partial update)."""
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[Literal["user", "enterprise_admin"]] = None
    user_type: Optional[str] = None
    is_trial: Optional[bool] = None
    trial_exploration_limit: Optional[int] = None
    # Changing account_tier auto-adjusts is_trial and trial_exploration_limit in the service
    account_tier: Optional[Literal["free", "tier1", "enterprise"]] = None


class AdminUserDetailOut(BaseModel):
    """Full user detail for admin views including trial state and pricing tier."""
    id: str
    full_name: str
    email: str
    role: str
    user_type: str
    is_active: bool
    is_trial: bool
    account_tier: str
    exploration_count: int
    trial_exploration_limit: int
    must_change_password: bool
    created_at: datetime

    class Config:
        from_attributes = True
