from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from app.config import settings
from app.models.user import User
from app.db import async_engine
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from datetime import timedelta
from app.db import get_session

security = HTTPBearer()
async def get_current_active_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
):
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM]
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    stmt = select(User).where(User.id == str(user_id))
    result = await session.execute(stmt)
    user = result.scalars().first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.utcnow()
    # 🔒 IDLE TIMEOUT CHECK
    if user.last_activity_at:
        if now - user.last_activity_at > timedelta(minutes=settings.IDLE_TIMEOUT):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired due to inactivity"
            )

    # ✅ UPDATE ACTIVITY (sliding session)
    user.last_activity_at = now
    await session.commit()

    return user  # ✅ STILL BOUND TO SESSION
