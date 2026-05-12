"""
Billing router — plan catalog, subscription state, billing profile.

Payment processing is NOT implemented here.
All endpoints are read/write on local models only.

Routes:
  GET  /billing/plans              → list all active plans (public, authenticated)
  GET  /billing/me                 → current user's subscription + plan detail
  PATCH /billing/profile           → upsert billing contact info
  GET  /billing/profile            → retrieve billing contact info
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.schemas.billing import (
    AdditionalExplorationQuoteOut,
    BillingProfileIn,
    BillingProfileOut,
    CurrentSubscriptionOut,
    InvoiceShareIn,
    SubscriptionPlanOut,
    UserSubscriptionOut,
)
from app.schemas.response import SuccessResponse
from app.services import billing_service
from app.services.product_state import (
    build_invoice_placeholder,
    compute_usage_summary,
    compute_user_product_state,
    quote_additional_explorations,
)

router = APIRouter(prefix="/billing", tags=["Billing"])


@router.get("/plans", response_model=SuccessResponse)
async def list_plans(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Return all active subscription plans (for plan-comparison UI)."""
    plans = await billing_service.list_plans(session)
    return SuccessResponse(
        message="Subscription plans fetched successfully",
        data=[SubscriptionPlanOut.from_orm_with_features(p).model_dump() for p in plans],
    )


@router.get("/me", response_model=SuccessResponse)
async def get_my_subscription(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Return the authenticated user's current subscription and plan details.

    For enterprise members (no personal subscription row), the org plan
    is returned with account_tier="enterprise".
    """
    sub, plan = await billing_service.get_or_create_subscription_for_user(session, current_user)

    # Determine effective exploration limit for the UI
    if current_user.account_tier == "enterprise" and current_user.organization_id:
        from app.models.organization import Organization
        org = await session.get(Organization, current_user.organization_id)
        exploration_limit = org.exploration_limit if org else 0
        exploration_count = org.exploration_count if org else 0
    else:
        exploration_limit = current_user.trial_exploration_limit
        exploration_count = current_user.exploration_count

    product_state = await compute_user_product_state(session, current_user)

    out = CurrentSubscriptionOut(
        subscription=UserSubscriptionOut.model_validate(sub),
        plan=SubscriptionPlanOut.from_orm_with_features(plan),
        account_tier=current_user.account_tier,
        is_trial=current_user.is_trial,
        exploration_count=exploration_count,
        exploration_limit=exploration_limit,
        product_state=product_state,
    )
    return SuccessResponse(
        message="Subscription fetched successfully",
        data=out.model_dump(),
    )


@router.get("/state", response_model=SuccessResponse)
async def get_billing_product_state(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Return computed plan/product state for upgrade, renewal, and gating UI."""
    state = await compute_user_product_state(session, current_user)
    return SuccessResponse(
        message="Product state fetched successfully",
        data=state,
    )


@router.get("/usage", response_model=SuccessResponse)
async def get_usage_summary(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Return usage aggregation for plan and invoice visibility."""
    summary = await compute_usage_summary(session, current_user)
    return SuccessResponse(
        message="Usage summary fetched successfully",
        data=summary,
    )


@router.get("/invoices", response_model=SuccessResponse)
async def list_invoice_placeholders(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Return invoice-ready metadata without payment-provider integration.

    Free Trial users get an empty list because the design keeps Billing disabled
    until upgrade.
    """
    summary = await compute_usage_summary(session, current_user)
    invoice = build_invoice_placeholder(current_user, summary)
    invoices = [invoice] if invoice else []
    return SuccessResponse(
        message="Invoices fetched successfully",
        data=invoices,
    )


@router.get("/invoices/{invoice_id}/download", response_model=SuccessResponse)
async def get_invoice_download_placeholder(
    invoice_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Placeholder hook for future invoice PDF generation/download."""
    return SuccessResponse(
        message="Invoice download is not available until payment integration is enabled.",
        data={
            "invoice_id": invoice_id,
            "download_available": False,
            "payment_provider_connected": False,
        },
    )


@router.post("/invoices/{invoice_id}/share", response_model=SuccessResponse)
async def share_invoice_placeholder(
    invoice_id: str,
    payload: InvoiceShareIn,
    current_user: User = Depends(get_current_active_user),
):
    """Placeholder hook for future invoice sharing."""
    return SuccessResponse(
        message="Invoice share request captured as metadata placeholder.",
        data={
            "invoice_id": invoice_id,
            "share_available": True,
            "sent": False,
            "recipient_email": payload.email,
            "payment_provider_connected": False,
        },
    )


@router.get("/quotes/additional-explorations", response_model=SuccessResponse)
async def quote_additional_exploration_pack(
    count: int = 3,
    current_user: User = Depends(get_current_active_user),
):
    """Return add-exploration quote metadata for the modal."""
    plan_slug = "explorer" if current_user.account_tier != "enterprise" else "enterprise"
    quote = quote_additional_explorations(plan_slug, count)
    return SuccessResponse(
        message="Additional exploration quote fetched successfully",
        data=AdditionalExplorationQuoteOut(**quote).model_dump(),
    )


@router.get("/profile", response_model=SuccessResponse)
async def get_billing_profile(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Return the user's billing contact information (may be null for new users)."""
    profile = await billing_service.get_billing_profile(session, current_user.id)
    return SuccessResponse(
        message="Billing profile fetched successfully",
        data=BillingProfileOut.model_validate(profile).model_dump() if profile else None,
    )


@router.patch("/profile", response_model=SuccessResponse)
async def upsert_billing_profile(
    payload: BillingProfileIn,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Create or update billing contact info.

    All fields are optional. Only non-None values are written.
    """
    if all(v is None for v in payload.model_dump().values()):
        raise HTTPException(status_code=400, detail="No billing fields provided to update.")

    profile = await billing_service.upsert_billing_profile(
        session,
        current_user,
        **payload.model_dump(exclude_none=True),
    )
    return SuccessResponse(
        message="Billing profile updated successfully",
        data=BillingProfileOut.model_validate(profile).model_dump(),
    )
