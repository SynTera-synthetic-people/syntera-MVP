from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.schemas.decision_room import (
    CreateSessionOut,
    CreateSessionRequest,
    DeleteSessionOut,
    SendMessageOut,
    SendMessageRequest,
    SessionDetail,
    SessionListItem,
)
from app.services import workspace as workspace_service
from app.services import decision_room as dr_service

router = APIRouter(
    prefix="/workspaces/{workspace_id}/explorations/{exploration_id}/decision-room",
    tags=["Decision Room"],
)


async def _assert_member(workspace_id: str, current_user: User) -> None:
    members = await workspace_service.list_workspace_members(workspace_id)
    if not any(m.get("user_id") == current_user.id for m in members):
        raise HTTPException(403, "Not a workspace member")


@router.post("/sessions", response_model=CreateSessionOut)
async def create_session(
    workspace_id: str,
    exploration_id: str,
    payload: CreateSessionRequest,
    current_user: User = Depends(get_current_active_user),
):
    await _assert_member(workspace_id, current_user)
    if payload.flow not in ("qual", "quant"):
        raise HTTPException(400, "flow must be 'qual' or 'quant'")
    try:
        data = await dr_service.create_session(
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            flow=payload.flow,
            user_id=current_user.id,
        )
    except Exception as exc:
        raise HTTPException(500, str(exc))
    return CreateSessionOut(status="success", message="Session created", data=data)


@router.get("/sessions", response_model=list[SessionListItem])
async def list_sessions(
    workspace_id: str,
    exploration_id: str,
    flow: str | None = None,
    current_user: User = Depends(get_current_active_user),
):
    await _assert_member(workspace_id, current_user)
    sessions = await dr_service.list_sessions(
        workspace_id=workspace_id,
        exploration_id=exploration_id,
        user_id=current_user.id,
        flow=flow,
    )
    return sessions


@router.get("/sessions/{session_id}", response_model=SessionDetail)
async def get_session(
    workspace_id: str,
    exploration_id: str,
    session_id: str,
    current_user: User = Depends(get_current_active_user),
):
    await _assert_member(workspace_id, current_user)
    detail = await dr_service.get_session_detail(session_id, current_user.id)
    if not detail:
        raise HTTPException(404, "Session not found")
    return detail


@router.delete("/sessions/{session_id}", response_model=DeleteSessionOut)
async def delete_session(
    workspace_id: str,
    exploration_id: str,
    session_id: str,
    current_user: User = Depends(get_current_active_user),
):
    await _assert_member(workspace_id, current_user)
    ok = await dr_service.delete_session(session_id, current_user.id)
    if not ok:
        raise HTTPException(404, "Session not found")
    return DeleteSessionOut(status="success", message="Session archived")


@router.post("/sessions/{session_id}/message", response_model=SendMessageOut)
async def send_message(
    workspace_id: str,
    exploration_id: str,
    session_id: str,
    payload: SendMessageRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
):
    await _assert_member(workspace_id, current_user)
    if not payload.text.strip():
        raise HTTPException(400, "Message text cannot be empty")
    try:
        data = await dr_service.send_message(
            session_id=session_id,
            user_id=current_user.id,
            user_text=payload.text.strip(),
            background_tasks=background_tasks,
        )
    except Exception as exc:
        raise HTTPException(500, str(exc))
    if data is None:
        raise HTTPException(404, "Session not found or not active")
    return SendMessageOut(status="success", message="Message sent", data=data)


@router.post("/sessions/{session_id}/message/stream")
async def stream_message(
    workspace_id: str,
    exploration_id: str,
    session_id: str,
    payload: SendMessageRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
):
    await _assert_member(workspace_id, current_user)
    if not payload.text.strip():
        raise HTTPException(400, "Message text cannot be empty")
    response = await dr_service.stream_message(
        session_id=session_id,
        user_id=current_user.id,
        user_text=payload.text.strip(),
        background_tasks=background_tasks,
    )
    if response is None:
        raise HTTPException(404, "Session not found or not active")
    return response
