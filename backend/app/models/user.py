from sqlmodel import SQLModel, Field, Relationship
from typing import Optional
from datetime import datetime
from app.utils.id_generator import generate_id

class User(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)

    # Primary name fields — source of truth
    first_name: str = Field(default="")
    last_name: str = Field(default="")
    # Kept for backward compat with existing DB rows and old code;
    # always synced with first_name + last_name on every write.
    full_name: str = Field(default="")

    email: str = Field(unique=True, index=True)
    hashed_password: str
    user_type: str = Field(default="Student")
    role: str = Field(default="user")
    is_verified: bool = Field(default=False)

    verification_token: Optional[str] = None
    verification_expiry: Optional[datetime] = None
    reset_token: Optional[str] = None
    reset_token_expiry: Optional[datetime] = None

    is_active: bool = Field(default=True)
    is_trial: bool = Field(default=True)
    exploration_count: int = Field(default=0)
    trial_exploration_limit: int = Field(default=1)
    must_change_password: bool = Field(default=False)

    # Pricing tier: "free" | "tier1" | "enterprise"
    account_tier: str = Field(default="free")
    # For enterprise users: FK to their shared enterprise Organization
    organization_id: Optional[str] = Field(default=None, foreign_key="organization.id", index=True)

    # Profile fields
    phone: Optional[str] = Field(default=None)
    avatar_url: Optional[str] = Field(default=None)

    # Soft-delete fields
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = Field(default=None)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_activity_at: Optional[datetime] = None

    organization: Optional["Organization"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[User.organization_id]"}
    )
