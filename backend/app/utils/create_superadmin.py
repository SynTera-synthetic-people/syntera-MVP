import os
from datetime import datetime

from sqlalchemy import select

from app.db import async_session
from app.models.user import User
from app.utils.security import hash_password


async def ensure_superadmin_exists():
    name = os.getenv("SUPERADMIN_NAME")
    email = os.getenv("SUPERADMIN_EMAIL")
    password = os.getenv("SUPERADMIN_PASSWORD")
    if not all([name, email, password]):
        return

    async with async_session() as session:
        result = await session.execute(select(User).where(User.email == email))
        existing_user = result.scalar_one_or_none()
        print(">>>>>>>>...", existing_user)

        if existing_user:
            return

        superadmin = User(
            full_name=name,
            email=email,
            hashed_password=hash_password(password),
            user_type="Admin",
            role="super_admin",
            is_verified=True,
            is_active=True,
            created_at=datetime.utcnow(),
        )
        session.add(superadmin)
        await session.commit()
