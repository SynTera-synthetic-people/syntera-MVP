from fastapi import APIRouter
from app.schemas.omi_workflow import (
    OmiWorkflowEventIn,
    OmiWorkflowResponse
)
from app.services.omi_workflow import handle_omi_workflow_event

router = APIRouter(prefix="/omi/workflow", tags=["OMI Workflow"])


@router.post("/event", response_model=OmiWorkflowResponse)
async def omi_workflow_event(event: OmiWorkflowEventIn):
    return await handle_omi_workflow_event(
        event=event.event,
        payload=event.payload
    )
