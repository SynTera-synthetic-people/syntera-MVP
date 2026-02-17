from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, status
from app.schemas.auth import (
    SignupIn,
    LoginIn,
    Token,
    ForgotPasswordIn,
    ResetPasswordIn,
)
from app.utils.security import create_access_token, verify_password
from app.utils.email_utils import send_verification_email, send_reset_password_email
from app.services import auth as auth_service
from app.routers.auth_dependencies import get_current_active_user
from app.models.user import User
from app.schemas.response import SuccessResponse, ErrorResponse
from datetime import datetime
from app.db import get_session
from sqlalchemy.ext.asyncio import AsyncSession


router = APIRouter(prefix="/auth", tags=["Authentication"])


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
        payload.user_type,
        role="user"
    )

    # background_tasks.add_task(
    #     send_verification_email,
    #     user.email,
    #     user.verification_token
    # )

    return SuccessResponse(
        message="Signup successful. Verification email sent to your inbox.",
        data={
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "user_type": user.user_type
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
    # user = await auth_service.get_user_by_email(payload.email)
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
                message="contact super admin for active your account"
            ).dict()
        )

    user.last_activity_at = datetime.utcnow()
    await session.commit()

    token = create_access_token(
        subject=str(user.id),
        role=user.role
    )

    return SuccessResponse(
        message="Login successful",
        data={
            "user_id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
            "user_type": user.user_type,
            "access_token": token,
            "token_type": "bearer"
        }
    )


@router.get("/me", response_model=SuccessResponse)
async def get_current_user(current_user: User = Depends(get_current_active_user)):

    return SuccessResponse(
        message="User profile fetched successfully",
        data={
            "id": current_user.id,
            "full_name": current_user.full_name,
            "email": current_user.email,
            "role": current_user.role,
            "user_type": current_user.user_type,
            "is_verified": current_user.is_verified,
            "created_at": current_user.created_at,
        }
    )


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
