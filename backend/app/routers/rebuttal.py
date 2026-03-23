# app/routers/rebuttal.py
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from app.schemas.rebuttal import (
    SectionOut, RebuttalStartRequest, RebuttalStartOut,
    RebuttalReplyRequest, RebuttalReplyOut, RebuttalSessionOut,
    RebuttalSessionListItem
)
from app.routers.auth_dependencies import get_current_active_user
from app.models.user import User
from app.services import workspace as workspace_service  
from app.services.rebuttal import (
    list_questionnaire_sections,
    start_rebuttal_session,
    reply_rebuttal_session,
    get_rebuttal_session,
    list_rebuttal_sessions
)
from app.services.workspace import list_workspace_members

router = APIRouter(prefix="/workspaces/{workspace_id}/explorations/{exploration_id}/rebuttal", tags=["Rebuttal"])


@router.get("/questions", response_model=list[SectionOut])
async def get_questions_for_rebuttal(
    workspace_id: str, 
    exploration_id: str, 
    simulation_id: Optional[str] = None,
    survey_simulation_id: Optional[str] = None,
    current_user: User = Depends(get_current_active_user)
):
    # Permission: workspace member
    members = await list_workspace_members(workspace_id)
    if not any(m.user_id == current_user.id for m in members):
        raise HTTPException(403, "Not a workspace member")

    # Get simulation-specific questionnaire with survey results if survey_simulation_id provided
    sections = await list_questionnaire_sections(
        workspace_id, 
        exploration_id, 
        simulation_id,
        survey_simulation_id
    )
    return sections


@router.post("/start", response_model=RebuttalStartOut)
async def start_rebuttal_api(workspace_id: str, exploration_id: str, payload: RebuttalStartRequest = Body(...), current_user: User = Depends(get_current_active_user)):
    members = await list_workspace_members(workspace_id)
    if not any(m.user_id == current_user.id for m in members):
        raise HTTPException(403, "Not a workspace member")

    try:
        out = await start_rebuttal_session(
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            persona_id=payload.persona_id,
            simulation_id=payload.simulation_id,
            question_id=payload.question_id,
            sample_size=payload.sample_size,
            user_id=current_user.id
        )
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

    return RebuttalStartOut(
        session_id=out["session_id"],
        starter_message=out["starter_message"],
        question=out["question"]
    )


@router.post("/reply", response_model=RebuttalReplyOut)
async def reply_rebuttal_api(payload: RebuttalReplyRequest = Body(...), current_user: User = Depends(get_current_active_user)):
    try:
        out = await reply_rebuttal_session(payload.session_id, payload.user_message, current_user.id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

    return RebuttalReplyOut(
        session_id=out["session_id"],
        llm_response=out["llm_response"],
        metadata=out.get("metadata")
    )


@router.get("/sessions", response_model=list[RebuttalSessionListItem])
async def list_sessions(
    workspace_id: str, 
    exploration_id: str, 
    current_user: User = Depends(get_current_active_user)
):
    members = await list_workspace_members(workspace_id)
    if not any(m.user_id == current_user.id for m in members):
        raise HTTPException(403, "Not a workspace member")
    
    sessions = await list_rebuttal_sessions(workspace_id, exploration_id)
    return sessions


@router.get("/session/{session_id}", response_model=RebuttalSessionOut)
async def get_session(session_id: str, current_user: User = Depends(get_current_active_user)):
    s = await get_rebuttal_session(session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return RebuttalSessionOut(**s)
