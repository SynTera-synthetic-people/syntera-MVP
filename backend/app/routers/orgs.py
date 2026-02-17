from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas.organization import OrgRead
from app.schemas.response import SuccessResponse, ErrorResponse
from app.models.user import User
from app.services import organization as org_service
from app.routers.auth_dependencies import get_current_active_user

router = APIRouter(prefix="/orgs", tags=["organization"])

@router.get("/", response_model=SuccessResponse)
async def get_my_organization(current_user: User = Depends(get_current_active_user)):
    org = await org_service.get_organization_by_owner(current_user.id)
    
    if not org:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(status="error", message="Organization not found").dict()
        )

    return SuccessResponse(
        message="Organization fetched successfully",
        data=org
    )
