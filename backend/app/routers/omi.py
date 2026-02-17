from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from app.schemas.response import SuccessResponse, ErrorResponse
from app.schemas.omi import (
    OmiChatRequest, OmiChatResponse,
    OmiGuidanceRequest, OmiGuidanceResponse,
    OmiValidationRequest, OmiValidationResponse,
    OmiStateUpdate, OmiSessionOut, OmiMessageOut, OmiActionOut
)
from app.services import omi as omi_service
from app.services import workspace as ws_service
from app.models.user import User
from app.models.omi import WorkflowStage, OmiState
from app.routers.auth_dependencies import get_current_active_user
from app.services.exploration import get_exploration_by_id
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_session

router = APIRouter(
    prefix="/workspaces/omi",
    tags=["Omi Copilot"]
)


@router.post("/session", response_model=SuccessResponse)
async def initialize_omi_session(
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Initialize or get existing Omi session for workspace"""

    exploration = await get_exploration_by_id(session, exploration_id)
    if not exploration:
        raise HTTPException(status_code=404, detail="Exploration not found")

    if not await ws_service.is_workspace_member(
        exploration.workspace_id, current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="You don't have access to this workspace"
            ).dict()
        )
    
    session, is_new  = await omi_service.get_or_create_session(exploration_id, current_user.id)

    greeting = None

    if is_new:
        greeting = (
            "Hey, I’m Omi. Think of me as your research co-pilot. You bring the curiosity; I’ll handle the heavy lifting👋 "
            "What’s the question that’s been bouncing around your head lately? Let’s start there."
        )

    return SuccessResponse(
        message="Omi session initialized successfully",
        data={
            "session_id": session.id,
            "current_stage": session.current_stage,
            "current_state": session.current_state,
            "context": session.context,
            "completed_stages": session.completed_stages,
            "greeting": greeting
        }
    )


@router.get("/session", response_model=SuccessResponse)
async def get_omi_session(
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),

):
    """Get current Omi session"""
    exploration = await get_exploration_by_id(session, exploration_id)
    if not exploration:
        raise HTTPException(status_code=404, detail="Exploration not found")

    if not await ws_service.is_workspace_member(
        exploration.workspace_id, current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="You don't have access to this workspace"
            ).dict()
        )
    
    session, is_new = await omi_service.get_or_create_session(exploration_id, current_user.id)
    
    return SuccessResponse(
        message="Omi session retrieved successfully",
        data={
            "session_id": session.id,
            "current_stage": session.current_stage,
            "current_state": session.current_state,
            "context": session.context,
            "completed_stages": session.completed_stages,
            "last_interaction": session.last_interaction.isoformat()
        }
    )


@router.post("/chat")
async def chat_endpoint(
    payload: OmiChatRequest,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):

    try:

        exploration = await get_exploration_by_id(
            db, payload.exploration_id
        )

        response = await omi_service.chat_with_omi(
            db=db,
            session_id=payload.session_id,
            user_message=payload.message,
            exploration=exploration
        )

        return SuccessResponse(
            message="Omi response generated",
            data=response.dict()
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": str(e),
                "type": e.__class__.__name__
            }
        )


# @router.post("/chat", response_model=SuccessResponse)
# async def chat_with_omi(
#     exploration_id: str,
#     request: OmiChatRequest,
#     current_user: User = Depends(get_current_active_user),
#     session: AsyncSession = Depends(get_session),
#
# ):
#     """Chat with Omi"""
#
#     exploration = await get_exploration_by_id(session, exploration_id)
#     if not exploration:
#         raise HTTPException(status_code=404, detail="Exploration not found")
#
#     if not await ws_service.is_workspace_member(
#             exploration.workspace_id, current_user.id
#     ):
#         raise HTTPException(
#             status_code=403,
#             detail=ErrorResponse(
#                 status="error",
#                 message="You don't have access to this workspace"
#             ).dict()
#         )
#
#
#
#     session, is_new = await omi_service.get_or_create_session(exploration_id, current_user.id)
#     # Chat with Omi
#     response = await omi_service.chat_with_omi(
#         session.id,
#         request.message,
#         request.context,
#         exploration
#     )
#
#     return SuccessResponse(
#         message="Omi response generated",
#         data={
#             "response": response.message,
#             "omi_state": response.omi_state,
#             "suggestions": response.suggestions,
#             "next_steps": response.next_steps
#         }
#     )


@router.post("/guidance", response_model=SuccessResponse)
async def get_guidance(
    workspace_id: str,
    request: OmiGuidanceRequest,
    current_user: User = Depends(get_current_active_user)
):
    """Get Omi's guidance for a specific stage"""
    
    if not await ws_service.is_workspace_member(workspace_id, current_user.id):
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="You don't have access to this workspace"
            ).dict()
        )
    
    # Get guidance
    guidance = await omi_service.get_ai_guidance(
        request.stage,
        user_input=str(request.user_input) if request.user_input else None,
        context=request.user_input
    )
    
    return SuccessResponse(
        message="Guidance generated successfully",
        data={
            "guidance": guidance.guidance,
            "omi_state": guidance.omi_state,
            "workflow_actions": guidance.workflow_actions,
            "tips": guidance.tips,
            "warnings": guidance.warnings
        }
    )


@router.post("/validate", response_model=SuccessResponse)
async def validate_input(
    workspace_id: str,
    request: OmiValidationRequest,
    current_user: User = Depends(get_current_active_user)
):
    """Validate user input with Omi"""
    
    if not await ws_service.is_workspace_member(workspace_id, current_user.id):
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="You don't have access to this workspace"
            ).dict()
        )
    
    # Get or create session
    session = await omi_service.get_or_create_session(workspace_id, current_user.id)
    
    # Validate
    validation = await omi_service.validate_with_omi(
        session.id,
        request.stage,
        request.data
    )
    
    return SuccessResponse(
        message="Validation completed",
        data={
            "valid": validation.valid,
            "message": validation.message,
            "omi_state": validation.omi_state,
            "issues": validation.issues,
            "suggestions": validation.suggestions
        }
    )


@router.put("/state", response_model=SuccessResponse)
async def update_omi_state(
    workspace_id: str,
    state_update: OmiStateUpdate,
    current_user: User = Depends(get_current_active_user)
):
    """Update Omi's state and stage"""
    
    if not await ws_service.is_workspace_member(workspace_id, current_user.id):
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="You don't have access to this workspace"
            ).dict()
        )
    
    # Get session
    session = await omi_service.get_or_create_session(workspace_id, current_user.id)
    
    # Update state
    updated_session = await omi_service.update_session_state(
        session.id,
        state=state_update.state,
        stage=state_update.stage
    )
    
    return SuccessResponse(
        message="Omi state updated successfully",
        data={
            "current_state": updated_session.current_state,
            "current_stage": updated_session.current_stage,
            "completed_stages": updated_session.completed_stages
        }
    )


@router.get("/conversation", response_model=SuccessResponse)
async def get_conversation_history(
    workspace_id: str,
    exploration_id: str,
    limit: int = 50,
    current_user: User = Depends(get_current_active_user)
):
    """Get conversation history with Omi"""
    
    if not await ws_service.is_workspace_member(workspace_id, current_user.id):
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="You don't have access to this workspace"
            ).dict()
        )
    
    # Get session
    session, _ = await omi_service.get_or_create_session(exploration_id, current_user.id)
    
    # Get history
    messages = await omi_service.get_conversation_history(session.id, limit)
    
    return SuccessResponse(
        message="Conversation history retrieved",
        data={
            "messages": [
                {
                    "id": msg.id,
                    "role": msg.role,
                    "content": msg.content,
                    "message_type": msg.message_type,
                    "workflow_stage": msg.workflow_stage,
                    "omi_state": msg.omi_state,
                    "created_at": msg.created_at.isoformat()
                }
                for msg in messages
            ]
        }
    )


@router.get("/actions", response_model=SuccessResponse)
async def get_active_actions(
    workspace_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Get active workflow actions"""
    
    if not await ws_service.is_workspace_member(workspace_id, current_user.id):
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="You don't have access to this workspace"
            ).dict()
        )
    
    # Get session
    session = await omi_service.get_or_create_session(workspace_id, current_user.id)
    
    # Get actions
    actions = await omi_service.get_active_actions(session.id)
    
    return SuccessResponse(
        message="Active actions retrieved",
        data={
            "actions": [
                {
                    "id": action.id,
                    "action_type": action.action_type,
                    "description": action.description,
                    "status": action.status,
                    "progress_percentage": action.progress_percentage,
                    "started_at": action.started_at.isoformat()
                }
                for action in actions
            ]
        }
    )


# ============================================================================
# STAGE-SPECIFIC ENDPOINTS
# ============================================================================

@router.post("/guide/research-objectives", response_model=SuccessResponse)
async def guide_research_objectives(
    workspace_id: str,
    description: str,
    current_user: User = Depends(get_current_active_user)
):
    """Get Omi's guidance for research objectives"""
    
    if not await ws_service.is_workspace_member(workspace_id, current_user.id):
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="You don't have access to this workspace"
            ).dict()
        )
    
    # Get session
    session = await omi_service.get_or_create_session(workspace_id, current_user.id)
    
    # Guide
    result = await omi_service.guide_research_objectives(session.id, description)
    
    return SuccessResponse(
        message="Research objectives guidance provided",
        data=result
    )


@router.post("/guide/persona", response_model=SuccessResponse)
async def guide_persona_building(
    workspace_id: str,
    persona_data: dict,
    current_user: User = Depends(get_current_active_user)
):
    """Get Omi's guidance for persona building"""
    
    if not await ws_service.is_workspace_member(workspace_id, current_user.id):
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="You don't have access to this workspace"
            ).dict()
        )
    
    # Get session
    session = await omi_service.get_or_create_session(workspace_id, current_user.id)
    
    # Guide
    result = await omi_service.guide_persona_building(session.id, persona_data)
    
    return SuccessResponse(
        message="Persona building guidance provided",
        data=result
    )
