import logging

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.auth import (
    SignupIn,
    LoginIn,
    Token,
    ForgotPasswordIn,
    ResetPasswordIn,
    ChangePasswordIn,
    UpdateProfileIn,
)
from app.utils.security import create_access_token, verify_password
from app.utils.email_utils import send_verification_email, send_reset_password_email, send_welcome_email, send_tier1_welcome_email, send_enterprise_inquiry_email
from app.services import auth as auth_service
from app.services import workspace as workspace_service
from app.services.auth import upgrade_to_tier1, update_profile, delete_account
from app.services.product_state import compute_user_product_state
from app.routers.auth_dependencies import get_current_active_user
from app.models.user import User
from app.schemas.response import SuccessResponse, ErrorResponse
from datetime import datetime
from app.db import get_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.get("/check-user", response_model=SuccessResponse)
async def check_user(
    email: str,
    session: AsyncSession = Depends(get_session),
):
    existing = await auth_service.get_user_by_email(session, email)

    return SuccessResponse(
        message="User lookup completed successfully",
        data={"exists": bool(existing)},
    )


@router.post("/signup", response_model=SuccessResponse, status_code=201)
async def signup(payload: SignupIn, background_tasks: BackgroundTasks, session: AsyncSession = Depends(get_session),):

    existing = await auth_service.get_user_by_email(session, payload.email)
    if existing:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                status="error",
                message="This email is already registered. Please log in instead."
            ).dict()
        )

    user = await auth_service.create_user(
        payload.email,
        payload.password,
        payload.full_name,
        role="user",
        is_trial=True,
    )

    # Send welcome email in the background (non-blocking)
    background_tasks.add_task(send_welcome_email, user.email)

    return SuccessResponse(
        message="Signup successful. Welcome email sent to your inbox.",
        data={
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
        }
    )


@router.get("/verify-email/{token}", response_model=SuccessResponse)
async def verify_email(token: str):
    verified = await auth_service.verify_user_token(token)

    if not verified:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            ErrorResponse(
                status="error",
                message="Invalid or expired verification token."
            ).dict()
        )

    return SuccessResponse(
        message="Email verified successfully. You can now log in."
    )


@router.post("/login", response_model=SuccessResponse)
async def login(payload: LoginIn,  session: AsyncSession = Depends(get_session),):
    user = await auth_service.get_user_by_email(session, payload.email)

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail=ErrorResponse(
                status="error",
                message="Invalid email or password."
            ).dict()
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="Your account is not verified. Please verify your email first."
            ).dict()
        )
    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="Contact your super admin to activate your account"
            ).dict()
        )

    user.last_activity_at = datetime.utcnow()
    await session.commit()

    token = create_access_token(
        subject=str(user.id),
        role=user.role
    )
    bootstrap = await workspace_service.get_workspace_bootstrap(session, user)
    product_state = await compute_user_product_state(session, user)

    return SuccessResponse(
        message="Login successful",
        data={
            "user_id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "account_tier": user.account_tier,
            "must_change_password": user.must_change_password,
            "access_token": token,
            "token_type": "bearer",
            "product_state": product_state,
            **bootstrap,
        }
    )


@router.get("/me", response_model=SuccessResponse)
async def get_current_user(
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    bootstrap = await workspace_service.get_workspace_bootstrap(session, current_user)
    product_state = await compute_user_product_state(session, current_user)

    return SuccessResponse(
        message="User profile fetched successfully",
        data={
            "id": current_user.id,
            "first_name": current_user.first_name,
            "last_name": current_user.last_name,
            "full_name": current_user.full_name,
            "email": current_user.email,
            "phone": current_user.phone,
            "avatar_url": current_user.avatar_url,
            "role": current_user.role,
            "is_verified": current_user.is_verified,
            "is_trial": current_user.is_trial,
            "account_tier": current_user.account_tier,
            "organization_id": current_user.organization_id,
            "exploration_count": current_user.exploration_count,
            "trial_exploration_limit": current_user.trial_exploration_limit,
            "must_change_password": current_user.must_change_password,
            "created_at": current_user.created_at,
            "product_state": product_state,
            **bootstrap,
        }
    )


@router.post("/logout", response_model=SuccessResponse)
async def logout(
    current_user: User = Depends(get_current_active_user),
):
    """
    Acknowledge logout for the current stateless JWT session.

    The frontend should discard the bearer token. Server-side token revocation
    can be added later with a token blacklist/session table.
    """
    return SuccessResponse(
        message="Logout successful.",
        data={
            "token_invalidated": False,
            "client_should_discard_token": True,
        },
    )


@router.patch("/me", response_model=SuccessResponse)
async def update_current_user_profile(
    payload: UpdateProfileIn,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Update the authenticated user's own profile.

    All fields are optional — only provided fields are updated.
    Email cannot be changed here for security; use a dedicated
    email-change flow if needed.
    """
    # Guard: at least one field must be present
    if payload.first_name is None and payload.last_name is None and payload.phone is None:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                status="error",
                message="No profile fields provided to update."
            ).dict()
        )

    try:
        updated_user = await update_profile(
            session=session,
            user=current_user,
            first_name=payload.first_name,
            last_name=payload.last_name,
            phone=payload.phone,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(status="error", message=str(exc)).dict()
        )

    return SuccessResponse(
        message="Profile updated successfully.",
        data={
            "id": updated_user.id,
            "first_name": updated_user.first_name,
            "last_name": updated_user.last_name,
            "full_name": updated_user.full_name,
            "email": updated_user.email,
            "phone": updated_user.phone,
            "avatar_url": updated_user.avatar_url,
            "role": updated_user.role,
            "account_tier": updated_user.account_tier,
        }
    )


@router.delete("/me", response_model=SuccessResponse)
async def delete_own_account(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Permanently deactivate and soft-delete the authenticated user's account.

    - The account is immediately marked inactive (existing tokens rejected on next use).
    - Email is anonymised so the same address can be re-registered later.
    - No data is hard-deleted; audit trail remains.
    - Super-admins cannot self-delete through this endpoint to prevent lockout.
    """
    if current_user.role == "super_admin":
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="Super-admin accounts cannot be self-deleted. Contact another super-admin."
            ).dict()
        )

    await delete_account(session=session, user=current_user)
    return SuccessResponse(message="Your account has been deleted successfully.")


@router.post("/forgot-password", response_model=SuccessResponse)
async def forgot_password(
    payload: ForgotPasswordIn,
    background_tasks: BackgroundTasks
):
    token = await auth_service.create_reset_token(payload.email)

    if not token:
        raise HTTPException(
            404,
            ErrorResponse(
                status="error",
                message="Email not found. Please check and try again."
            ).dict()
        )

    background_tasks.add_task(
        send_reset_password_email,
        payload.email,
        token
    )

    return SuccessResponse(
        message="Password reset email sent successfully."
    )


@router.post("/reset-password/{token}", response_model=SuccessResponse)
async def reset_password(token: str, payload: ResetPasswordIn):

    success = await auth_service.reset_password(token, payload.new_password)

    if not success:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                status="error",
                message="Invalid or expired password reset token."
            ).dict()
        )

    return SuccessResponse(message="Password reset successful.")


@router.patch("/change-password", response_model=SuccessResponse)
async def change_password(
    payload: ChangePasswordIn,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Allow an authenticated user to change their own password.

    Verifies the current password before applying the new one.
    Clears the must_change_password flag on success.
    """
    success = await auth_service.change_password(
        session=session,
        user=current_user,
        current_password=payload.current_password,
        new_password=payload.new_password,
    )
    if not success:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                status="error",
                message="Current password is incorrect."
            ).dict()
        )
    return SuccessResponse(message="Password changed successfully.")


@router.post("/upgrade", response_model=SuccessResponse)
async def upgrade_plan(
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Upgrade current user to Explorer Pack (tier1).
    Resets exploration count, sets limit to 3, sends welcome email.
    """
    updated_user = await upgrade_to_tier1(session, current_user)
    background_tasks.add_task(send_tier1_welcome_email, updated_user.email)
    return SuccessResponse(
        message="Explorer Pack activated successfully!",
        data={
            "account_tier": updated_user.account_tier,
            "is_trial": updated_user.is_trial,
            "exploration_count": updated_user.exploration_count,
            "trial_exploration_limit": updated_user.trial_exploration_limit,
        }
    )


@router.post("/contact-enterprise", response_model=SuccessResponse)
async def contact_enterprise(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
):
    """
    Notify internal team when a user is interested in the Enterprise Pack.
    Sends an email to humans@synthetic-people.ai for manual follow-up.
    """
    background_tasks.add_task(
        send_enterprise_inquiry_email,
        current_user.email,
        current_user.full_name,
    )
    return SuccessResponse(
        message="Thank you! Our team will contact you shortly."
    )
