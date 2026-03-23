import os
import asyncio
from datetime import datetime

from sqlalchemy import select
from passlib.context import CryptContext
from app.utils.security import hash_password, verify_password

from app.db import async_session
from app.models.user import User



async def ensure_superadmin_exists():
    """
    Idempotent:
    - Creates super admin if missing
    - Does nothing if already exists
    """

    name = os.getenv("SUPERADMIN_NAME")
    email = os.getenv("SUPERADMIN_EMAIL")
    password = os.getenv("SUPERADMIN_PASSWORD")
    # If env vars not set, silently skip
    if not all([name, email, password]):
        return

    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.email == email)
        )
        existing_user = result.scalar_one_or_none()

        if existing_user:
            print(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>", existing_user)

            return

        superadmin = User(
            full_name=name,
            email=email,
            hashed_password=hash_password(password),
            user_type="Admin",
            role="super_admin",
            is_verified=True,
            created_at=datetime.utcnow(),
        )

        session.add(superadmin)
        await session.commit()
