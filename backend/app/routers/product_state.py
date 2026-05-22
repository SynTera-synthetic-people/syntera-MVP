from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.schemas.response import SuccessResponse
from app.services.product_state import compute_user_product_state

router = APIRouter(prefix="/product-state", tags=["Product State"])


@router.get("/me", response_model=SuccessResponse)
async def get_my_product_state(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    state = await compute_user_product_state(session, current_user)
    return SuccessResponse(
        message="Product state fetched successfully",
        data=state,
    )
