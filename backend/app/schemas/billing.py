"""
Billing DTOs.

Designed to be stable across future payment provider integrations.
provider-specific fields (stripe_*) are excluded from responses.
"""
import json
from pydantic import BaseModel, ConfigDict, EmailStr
from datetime import datetime
from typing import Any, Dict, Optional


class SubscriptionPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    slug: str
    name: str
    description: Optional[str]
    exploration_limit: int
    is_active: bool
    # Parse stored JSON string → dict for frontend consumption
    features: Any = None

    @classmethod
    def from_orm_with_features(cls, plan) -> "SubscriptionPlanOut":
        data = cls.model_validate(plan)
        if isinstance(data.features, str):
            try:
                data.features = json.loads(data.features)
            except (json.JSONDecodeError, TypeError):
                data.features = {}
        return data


class UserSubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    plan_id: str
    status: str
    started_at: datetime
    expires_at: Optional[datetime]
    cancelled_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]


class CurrentSubscriptionOut(BaseModel):
    """Combined view returned by GET /billing/me."""
    subscription: Optional[UserSubscriptionOut]
    plan: Optional[SubscriptionPlanOut]
    # Convenience fields duplicated from User for the billing UI
    account_tier: str
    is_trial: bool
    exploration_count: int
    exploration_limit: int  # user-level or org-level depending on tier
    product_state: Optional[Dict[str, Any]] = None


class UsageSummaryOut(BaseModel):
    billing_period: Dict[str, Any]
    plan: Dict[str, Any]
    quota: Dict[str, Any]
    usage: Dict[str, Any]
    invoice_ready: Dict[str, Any]
    state: Dict[str, Any]


class InvoiceSummaryOut(BaseModel):
    id: str
    receipt_no: str
    title: str
    status: str
    issued_on: datetime
    billing_period: Dict[str, Any]
    amount_cents: Optional[int]
    amount_display: str
    currency: str
    no_of_explorations: int
    payment_provider_connected: bool
    download_available: bool
    share_available: bool
    metadata: Dict[str, Any]


class InvoiceShareIn(BaseModel):
    email: EmailStr
    message: Optional[str] = None


class AdditionalExplorationQuoteOut(BaseModel):
    requested_count: int
    minimum_count: int
    effective_count: int
    minus_enabled: bool
    unit_amount_cents: int
    total_amount_cents: int
    currency: str
    payment_provider_connected: bool
    checkout_available: bool


class BillingProfileIn(BaseModel):
    """All fields optional — partial update supported."""
    billing_name: Optional[str] = None
    billing_email: Optional[EmailStr] = None
    company_name: Optional[str] = None
    gst_number: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None


class BillingProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    org_id: Optional[str]
    billing_name: Optional[str]
    billing_email: Optional[str]
    company_name: Optional[str]
    gst_number: Optional[str]
    address_line1: Optional[str]
    address_line2: Optional[str]
    city: Optional[str]
    state: Optional[str]
    country: Optional[str]
    postal_code: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]
