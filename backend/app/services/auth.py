from sqlmodel import select
from app.models.user import User
from app.db import async_engine
from app.utils.security import hash_password, verify_password
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
import secrets
from app.services.organization import create_organization_for_user


async def get_user_by_email(
    session: AsyncSession,
    email: str,
):
    result = await session.execute(
        select(User).where(User.email == email)
    )
    return result.scalars().first()


async def create_user(email: str, password: str, full_name: str, user_type: str = "Student", role: str = "user"):
    hashed = hash_password(password)
    # token = secrets.token_urlsafe(32)
    expiry = datetime.utcnow() + timedelta(hours=24)

    new_user = User(
        email=email,
        full_name=full_name,
        hashed_password=hashed,
        role=role,
        user_type=user_type,
        is_verified=True,
        verification_token=None,
        verification_expiry=None
    )

    async with AsyncSession(async_engine) as session:
        session.add(new_user)
        await session.commit()
        await session.refresh(new_user)

    await create_organization_for_user(new_user, name="My Organization")

    return new_user


async def verify_user_token(token: str):
    async with AsyncSession(async_engine) as session:
        verifyToken = select(User).where(User.verification_token == token)
        response = await session.execute(verifyToken)
        user = response.scalars().first()

        if not user:
            return False

        if user.verification_expiry < datetime.utcnow():
            return False 

        user.is_verified = True
        user.verification_token = None
        user.verification_expiry = None
        session.add(user)
        await session.commit()
        return True

async def create_reset_token(email: str):
    async with AsyncSession(async_engine) as session:
        resetToken = select(User).where(User.email == email)
        response = await session.execute(resetToken)
        user = response.scalars().first()

        if not user:
            return None

        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expiry = datetime.utcnow() + timedelta(hours=24)
        session.add(user)
        await session.commit()

    # ✉️ Send reset password email
    # try:
    #     await send_reset_password_email(email, token)
    # except Exception as e:
    #     print(f"[EMAIL WARNING] Failed to send reset email: {e}")

    return token

async def authenticate_user(email: str, password: str):
    user = await get_user_by_email(email)
    if not user or not verify_password(password, user.hashed_password):
        return None
    if not user.is_verified:
        return "UNVERIFIED"
    return user

async def verify_reset_token(token: str) -> bool:
    async with AsyncSession(async_engine) as session:
        resetToken = select(User).where(User.reset_token == token)
        response = await session.execute(resetToken)
        user = response.scalars().first()
        if not user or user.reset_token_expiry < datetime.utcnow():
            return False
        return True

async def reset_password(token: str, new_password: str) -> bool:
    async with AsyncSession(async_engine) as session:
        resetPassword = select(User).where(User.reset_token == token)
        response = await session.execute(resetPassword)
        user = response.scalars().first()

        if not user or user.reset_token_expiry < datetime.utcnow():
            return False

        user.hashed_password = hash_password(new_password)
        user.reset_token = None
        user.reset_token_expiry = None

        session.add(user)
        await session.commit()
        return True