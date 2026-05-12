from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
from app.utils.id_generator import generate_id


class SubscriptionPlan(SQLModel, table=True):
    __tablename__ = "subscription_plan"

    id: str = Field(default_factory=generate_id, primary_key=True)
    slug: str = Field(unique=True, index=True)  # free | explorer | enterprise
    name: str
    description: Optional[str] = None
    # Encoded plan capabilities — feature gate keys and their values
    features: Optional[str] = Field(default="{}", sa_column_kwargs={"server_default": "{}"})
    exploration_limit: int = Field(default=0)  # 0 = unlimited
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UserSubscription(SQLModel, table=True):
    __tablename__ = "user_subscription"

    id: str = Field(default_factory=generate_id, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    plan_id: str = Field(foreign_key="subscription_plan.id", index=True)

    # active | cancelled | past_due | trialing
    status: str = Field(default="active")

    started_at: datetime = Field(default_factory=datetime.utcnow)
    # None = no expiry (enterprise/lifetime); set for trial/tier1 if time-boxed
    expires_at: Optional[datetime] = Field(default=None)
    cancelled_at: Optional[datetime] = Field(default=None)

    # Reserved for future payment provider integration (NOT populated yet)
    stripe_subscription_id: Optional[str] = Field(default=None)
    stripe_customer_id: Optional[str] = Field(default=None)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default=None)


class BillingProfile(SQLModel, table=True):
    __tablename__ = "billing_profile"

    id: str = Field(default_factory=generate_id, primary_key=True)
    # One billing profile per user (UNIQUE enforced in migration)
    user_id: str = Field(foreign_key="user.id", index=True)
    # Optional link to enterprise org
    org_id: Optional[str] = Field(default=None, foreign_key="organization.id", index=True)

    billing_name: Optional[str] = Field(default=None)
    billing_email: Optional[str] = Field(default=None)
    company_name: Optional[str] = Field(default=None)
    gst_number: Optional[str] = Field(default=None)

    # Address fields — all optional until payment provider requires them
    address_line1: Optional[str] = Field(default=None)
    address_line2: Optional[str] = Field(default=None)
    city: Optional[str] = Field(default=None)
    state: Optional[str] = Field(default=None)
    country: Optional[str] = Field(default=None)
    postal_code: Optional[str] = Field(default=None)

    # Reserved for future payment provider (NOT populated yet)
    stripe_customer_id: Optional[str] = Field(default=None)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default=None)
