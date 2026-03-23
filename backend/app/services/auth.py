import logging

from sqlmodel import select
from app.models.user import User
from app.db import async_engine
from app.utils.security import hash_password, verify_password
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta
import secrets
from app.services.organization import create_organization_for_user
from app.config import settings

logger = logging.getLogger(__name__)


async def get_user_by_email(
    session: AsyncSession,
    email: str,
):
    result = await session.execute(
        select(User).where(User.email == email)
    )
    return result.scalars().first()


async def create_user(
    email: str,
    password: str,
    full_name: str,
    role: str = "user",
    is_trial: bool = True,
    must_change_password: bool = False,
    account_tier: str = "free",
):
    hashed = hash_password(password)

    new_user = User(
        email=email,
        full_name=full_name,
        hashed_password=hashed,
        role=role,
        is_verified=True,
        verification_token=None,
        verification_expiry=None,
        is_trial=is_trial,
        must_change_password=must_change_password,
        account_tier=account_tier,
    )

    async with AsyncSession(async_engine) as session:
        session.add(new_user)
        await session.commit()
        await session.refresh(new_user)

    await create_organization_for_user(new_user)

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


async def upgrade_to_tier1(session: AsyncSession, user: User) -> User:
    """
    Upgrade a free/trial user to Explorer Pack (tier1).
    Resets exploration_count to 0 and sets the tier1 limit.
    """
    user.account_tier = "tier1"
    user.is_trial = False
    user.trial_exploration_limit = settings.TIER1_EXPLORATION_LIMIT
    user.exploration_count = 0
    session.add(user)
    await session.commit()
    await session.refresh(user)
    logger.info("User upgraded to tier1", extra={"user_id": user.id})
    return user


async def change_password(
    session: AsyncSession,
    user: User,
    current_password: str,
    new_password: str,
) -> bool:
    """
    Verify current password and set a new one for an authenticated user.

    Clears must_change_password on success.
    Returns False if the current password does not match.
    """
    if not verify_password(current_password, user.hashed_password):
        logger.warning("Password change failed: wrong current password", extra={"user_id": user.id})
        return False
    user.hashed_password = hash_password(new_password)
    user.must_change_password = False
    session.add(user)
    await session.commit()
    logger.info("Password changed successfully", extra={"user_id": user.id})
    return True
