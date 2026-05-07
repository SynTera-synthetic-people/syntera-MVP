import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from typing import Optional, List
from fastapi.responses import FileResponse
from app.schemas.response import SuccessResponse, ErrorResponse, DeleteResponse
from app.schemas.interview import (
    InterviewCreate, MessageIn,
    InterviewSectionCreate, InterviewSectionUpdate,
    InterviewQuestionCreate, InterviewQuestionUpdate, InterviewQuestionDelete
)
from app.services import interview as interview_service
from app.services import workspace as ws_service
from app.services import report_orchestrator as report_cache
from app.services.exploration import require_persona_exists, WorkflowError
from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.utils.file_utils import save_upload_file
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_session
from app.services.auto_generated_persona import validate_deleted_question, validate_existing_question, validate_new_question_against_theme
from app.services.report_generation_qual_claude import generate_pdf_path, generate_combined_interviews_pdf
import json as _json


router = APIRouter(prefix="/workspaces/{workspace_id}/explorations/{exploration_id}/in-depth", tags=["InDepth Interviews"])


@router.post("/guides/generate", response_model=SuccessResponse)
async def generate_guide(workspace_id: str, exploration_id: str, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_active_user), session: AsyncSession = Depends(get_session),):
    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(status_code=403, detail=ErrorResponse(status="error", message="Only admins can generate guides").dict())

    # Guard: interview guide requires at least one persona
    try:
        await require_persona_exists(session, exploration_id)
    except WorkflowError as e:
        raise HTTPException(status_code=400, detail=ErrorResponse(status="error", message=e.message).dict())

    existing_guide = await interview_service.get_full_interview_guide(workspace_id, exploration_id)
    if existing_guide:
        # The guide is generated output; return it instead of repeating the LLM call.
        return SuccessResponse(message="Guide already exists", data={"sections": existing_guide})

    guide = await interview_service.generate_discussion_guide_with_llm(workspace_id, exploration_id, current_user.id, session)
    return SuccessResponse(message="Guide generated", data=guide)


@router.post("/sections", response_model=SuccessResponse)
async def create_section(
    workspace_id: str,
    exploration_id: str,
    payload: InterviewSectionCreate,
    current_user: User = Depends(get_current_active_user)
):
    """Create a new interview section"""
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m.get("user_id") == current_user.id for m in members):
        raise HTTPException(status_code=403, detail="Not a workspace member")
    
    section = await interview_service.create_interview_section(
        workspace_id, exploration_id, payload.title, current_user.id, ""
    )
    return SuccessResponse(message="Section created", data=section)


@router.put("/sections/{section_id}", response_model=SuccessResponse)
async def update_section(
    section_id: str,
    payload: InterviewSectionUpdate,
    current_user: User = Depends(get_current_active_user)
):
    """Update an interview section title"""
    section = await interview_service.update_interview_section(section_id, payload.title)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    return SuccessResponse(message="Section updated", data=section)


@router.delete("/sections/{section_id}", response_model=SuccessResponse)
async def delete_section(
    section_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Delete an interview section and all its questions"""
    ok = await interview_service.delete_interview_section(section_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Section not found")
    return SuccessResponse(message="Section deleted", data=True)


@router.post("/sections/{section_id}/questions", response_model=SuccessResponse)
async def create_question(
    section_id: str,
    payload: InterviewQuestionCreate,
    current_user: User = Depends(get_current_active_user)
):
    """Create a new interview question in a section"""
    if not payload.is_force_insert:
        valid_or_not, reason = await validate_new_question_against_theme(section_id, payload)

        if not valid_or_not:
            data = {
                "validation_status":"failed",
                "reason":f"{reason}"
            }
            return SuccessResponse(message="validation failed", data=data)

    question = await interview_service.create_interview_question(
        section_id, payload.text, current_user.id
    )
    return SuccessResponse(message="Question created", data=question)


@router.put("/questions/{question_id}", response_model=SuccessResponse)
async def update_question(
    question_id: str,
    payload: InterviewQuestionUpdate,
    current_user: User = Depends(get_current_active_user)
):
    """Update an interview question text"""
    if not payload.is_force_insert:
        valid_or_not, reason = await validate_existing_question(question_id, payload)
        if not valid_or_not:
            data = {
                "validation_status":"failed",
                "reason":f"{reason}"
            }
            return SuccessResponse(message="validation failed", data=data)

    question = await interview_service.update_interview_question(question_id, payload.text)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return SuccessResponse(message="Question updated", data=question)


@router.delete("/questions/{question_id}", response_model=SuccessResponse)
async def delete_question(
    question_id: str,
    payload: InterviewQuestionDelete,
    current_user: User = Depends(get_current_active_user)
):
    """Delete an interview question"""
    if not payload.is_force_insert:
        valid_or_not, reason = await validate_deleted_question(question_id, payload)
        if not valid_or_not:
            data = {
                "validation_status":"failed",
                "reason":f"{reason}"
            }
            return SuccessResponse(message="validation failed", data=data)

    ok = await interview_service.delete_interview_question(question_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Question not found")
    return SuccessResponse(message="Question deleted", data=True)


@router.get("/all", response_model=SuccessResponse)
async def get_all(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """Get complete interview guide with all sections and questions"""
    data = await interview_service.get_full_interview_guide(workspace_id, exploration_id)
    return SuccessResponse(message="Interview guide fetched", data=data)



@router.get("/interviews/by-persona/{persona_id}", response_model=SuccessResponse)
async def get_interview_by_persona(
    workspace_id: str,
    exploration_id: str,
    persona_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """
    Return the most recent interview for a specific persona in this exploration.
    Returns 404 when none exists so the frontend can branch cleanly.
    """
    iv = await interview_service.get_interview_by_persona(workspace_id, exploration_id, persona_id)
    if not iv:
        raise HTTPException(status_code=404, detail="No interview found for this persona")
    return SuccessResponse(message="Interview fetched", data=iv)


@router.post("/interviews", response_model=SuccessResponse, status_code=201)
async def start_interview(workspace_id: str, exploration_id: str, payload: InterviewCreate, current_user: User = Depends(get_current_active_user)):
    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(status_code=403, detail=ErrorResponse(status="error", message="Only workspace admins can start interviews").dict())

    # Conversation Studio lightweight path: skip LLM batch generation entirely.
    # Creates an empty session instantly; individual messages use the live reply endpoint.
    if payload.force_new and payload.lightweight:
        iv = await interview_service.create_conversation_session(
            workspace_id, exploration_id, payload.persona_id, current_user.id
        )
        await report_cache.invalidate_cache(exploration_id)
        return SuccessResponse(message="Conversation session started", data=iv)

    # Idempotency guard: skip when force_new=True, otherwise return the existing
    # interview to avoid re-running the expensive LLM generation step.
    if payload.persona_id and not payload.force_new:
        existing = await interview_service.get_interview_by_persona(workspace_id, exploration_id, payload.persona_id)
        if existing:
            return SuccessResponse(message="Interview already exists for this persona", data=existing)

    guide_data = await interview_service.get_full_interview_guide(workspace_id, exploration_id)

    if not guide_data:
        raise HTTPException(status_code=400, detail=ErrorResponse(status="error", message="No interview guide found for this objective").dict())

    sections = []
    for section in guide_data:
        questions = [q["text"] for q in section.get("questions", [])]
        sections.append({
            "title": section["title"],
            "questions": questions
        })

    iv = await interview_service.start_interview(workspace_id, exploration_id, payload.persona_id, current_user.id, sections)
    await report_cache.invalidate_cache(exploration_id)
    return SuccessResponse(message="Interview started", data=iv)


@router.get("/interviews", response_model=SuccessResponse)
async def list_interviews(workspace_id: str, exploration_id: str, current_user: User = Depends(get_current_active_user)):
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m.get("user_id") == current_user.id for m in members):
        raise HTTPException(status_code=403, detail=ErrorResponse(status="error", message="Not a member").dict())

    data = await interview_service.list_interviews_for_objective(workspace_id, exploration_id)
    return SuccessResponse(message="Interviews fetched", data=data)


@router.get("/interviews/preview", response_model=SuccessResponse)
async def preview_all_interviews(workspace_id: str, exploration_id: str, current_user: User = Depends(get_current_active_user)):
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m.get("user_id") == current_user.id for m in members):
        raise HTTPException(status_code=403, detail=ErrorResponse(status="error", message="Not a member").dict())

    interviews = await interview_service.list_interviews_for_objective(workspace_id, exploration_id)
    
    if not interviews:
        raise HTTPException(status_code=404, detail=ErrorResponse(status="error", message="No interviews found").dict())
    
    from app.services.persona import get_persona
    
    # Build the same structure as the PDF export
    # grouped: section -> question -> list of (persona_id, answer, implications)
    grouped = {}
    persona_cache = {}
    
    for iv in interviews:
        # Get interview data
        data = iv.model_dump() if hasattr(iv, "model_dump") else (iv if isinstance(iv, dict) else iv.__dict__)
        gen = data.get("generated_answers", {}) or {}
        
        # Get persona info (cache it)
        persona_id = data.get("persona_id")
        if persona_id and persona_id not in persona_cache:
            persona = await get_persona(persona_id)
            persona_cache[persona_id] = persona
        
        # Process generated answers
        for qtext, info in gen.items():
            section = info.get("meta_section") or "General"
            
            # Try to extract section from messages if not in generated_answers
            if section == "General":
                for m in data.get("messages", []):
                    meta = m.get("meta") or {}
                    if meta.get("question") == qtext:
                        section = meta.get("section") or section
                        break
            
            # Get persona info for this answer
            answer_persona_id = info.get("persona_id") or persona_id
            persona_info = persona_cache.get(answer_persona_id)
            
            if section not in grouped:
                grouped[section] = {}
            if qtext not in grouped[section]:
                grouped[section][qtext] = []
            
            grouped[section][qtext].append({
                "persona_id": answer_persona_id,
                "persona_name": persona_info.get("name") if persona_info else "Unknown",
                "persona_age": persona_info.get("age_range") if persona_info else None,
                "persona_occupation": persona_info.get("occupation") if persona_info else None,
                "answer": info.get("persona_answer"),
                "implications": info.get("implications", [])
            })
    
    # Format the preview data to match PDF structure
    sections_preview = []
    for section_title, questions in grouped.items():
        questions_preview = []
        for qtext, answers in questions.items():
            questions_preview.append({
                "question": qtext,
                "response_count": len(answers),
                "summary": f"Collected {len(answers)} persona response(s).",
                "answers": answers
            })
        sections_preview.append({
            "section": section_title,
            "questions": questions_preview
        })
    
    preview_data = {
        "workspace_id": workspace_id,
        "exploration_id": exploration_id,
        "total_interviews": len(interviews),
        "sections": sections_preview
    }
    
    return SuccessResponse(message="All interviews preview", data=preview_data)


@router.get("/interviews/export")
async def export_all_interviews_pdf(workspace_id: str, exploration_id: str, current_user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_session)):
    try:
        members = await ws_service.list_workspace_members(workspace_id)
        if not any(m.get("user_id") == current_user.id for m in members):
            raise HTTPException(status_code=403, detail=ErrorResponse(status="error", message="Not a member").dict())

        cached = await report_cache.get_cached_report(exploration_id, "IN_DEPTH_ALL_INTERVIEWS_BA_V1")
        if cached and cached.pdf_path and os.path.exists(cached.pdf_path):
            # Insights already exist; serve the stored PDF instead of regenerating.
            pdf_path = cached.pdf_path
        else:
            # pdf_path = await interview_service.export_all_interviews_pdf(workspace_id, exploration_id, db)
            bulk_path = generate_pdf_path(prefix="all_interviews")
            pdf_path  = await generate_combined_interviews_pdf(objective_id=exploration_id, out_path=bulk_path, cta="BEHAVIORAL_ARCHAEOLOGY")
            await report_cache.store_report_cache(exploration_id, "IN_DEPTH_ALL_INTERVIEWS_BA_V1", pdf_path, "qual")
        print(pdf_path)
        if not pdf_path:
            raise HTTPException(status_code=404, detail=ErrorResponse(status="error", message="No interviews found").dict())

        return FileResponse(
            path=pdf_path,
            media_type="application/pdf",
            filename=f"all_interviews_{exploration_id}.pdf",
            headers={"Content-Disposition": f"attachment; filename=all_interviews_{exploration_id}.pdf"}
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


@router.post("/interviews/{interview_id}/messages", response_model=SuccessResponse)
async def post_message(
    interview_id: str, 
    role: str = Form(...), 
    text: str = Form(...), 
    current_user: User = Depends(get_current_active_user)
):
    """
    Post a message to an interview.
    If role is 'user' and interview has a persona, automatically generates persona reply.
    Returns only the persona's reply message.
    """
    iv = await interview_service.get_interview(interview_id)
    if not iv:
        raise HTTPException(
            status_code=404, 
            detail=ErrorResponse(
                status="error", 
                message="Interview not found"
            ).dict()
        )

    if role == "user" and iv.persona_id:
        updated = await interview_service.add_user_message_and_get_persona_reply(
            interview_id, 
            text
        )
        if updated and updated.messages:
            # Conversation changed; cached insights are now stale.
            await report_cache.invalidate_cache(iv.exploration_id)
            persona_reply = updated.messages[-1]
            return SuccessResponse(message="Message saved", data=persona_reply)
    else:
        updated = await interview_service.add_interview_message(
            interview_id, 
            role, 
            text
        )

    if updated:
        # Conversation changed; cached insights are now stale.
        await report_cache.invalidate_cache(updated.exploration_id)

    return SuccessResponse(message="Message saved", data=updated)


@router.get("/interviews/{interview_id}", response_model=SuccessResponse)
async def get_interview_details(workspace_id: str, interview_id: str, current_user: User = Depends(get_current_active_user)):
    iv = await interview_service.get_interview(interview_id)
    if not iv:
        raise HTTPException(status_code=404, detail=ErrorResponse(status="error", message="Interview not found").dict())
    return SuccessResponse(message="Interview fetched", data=iv)


@router.post("/interviews/{interview_id}/upload", response_model=SuccessResponse)
async def upload_interview_file(workspace_id: str, interview_id: str, file: UploadFile = File(...), current_user: User = Depends(get_current_active_user)):
    saved_name, size, ctype = await save_upload_file(file)
    record = await interview_service.save_interview_file(interview_id, saved_name, file.filename, size, ctype)
    return SuccessResponse(message="File uploaded", data=record)


@router.get("/interviews/{interview_id}/preview", response_model=SuccessResponse)
async def preview_interview_report(workspace_id: str, interview_id: str, current_user: User = Depends(get_current_active_user)):
    iv = await interview_service.get_interview(interview_id)
    if not iv:
        raise HTTPException(status_code=404, detail=ErrorResponse(status="error", message="Interview not found").dict())
    
    persona = None
    if iv.persona_id:
        from app.services.persona import get_persona
        persona = await get_persona(iv.persona_id)
    
    preview_data = {
        "interview_id": iv.id,
        "workspace_id": iv.workspace_id,
        "exploration_id": iv.exploration_id,
        "created_at": iv.created_at.isoformat() if iv.created_at else None,
        "persona": {
            "name": persona.get("name") if persona else "Unknown",
            "age_range": persona.get("age_range") if persona else None,
            "occupation": persona.get("occupation") if persona else None,
        } if persona else None,
        "messages": iv.messages or [],
        "message_count": len(iv.messages) if iv.messages else 0,
        "conversation_summary": {
            "total_exchanges": len([m for m in (iv.messages or []) if m.get("role") == "user"]),
            "persona_responses": len([m for m in (iv.messages or []) if m.get("role") == "persona"])
        }
    }
    
    return SuccessResponse(message="Interview report preview", data=preview_data)


@router.get("/interviews/{interview_id}/export")
async def export_interview_report(workspace_id: str, exploration_id: str, interview_id: str, current_user: User = Depends(get_current_active_user)):
    # path = await interview_service.export_insights_pdf(interview_id)
    try:
        cache_key = f"IN_DEPTH_SINGLE_INTERVIEW_BA_V1_{interview_id}"
        cached = await report_cache.get_cached_report(exploration_id, cache_key)
        if cached and cached.pdf_path and os.path.exists(cached.pdf_path):
            # Single-interview insight already exists; reuse stored output.
            path = cached.pdf_path
        else:
            single_path = generate_pdf_path(prefix="single_interview")
            path = await generate_combined_interviews_pdf(objective_id=exploration_id, interview_id=interview_id, out_path=single_path, cta="BEHAVIORAL_ARCHAEOLOGY")
            await report_cache.store_report_cache(exploration_id, cache_key, path, "qual")
        print(path)

        if not path:
            raise HTTPException(status_code=404, detail=ErrorResponse(status="error", message="Interview not found").dict())

        return FileResponse(
            path=path,
            media_type="application/pdf",
            filename=f"interview_report_{interview_id}.pdf",
            headers={"Content-Disposition": f"attachment; filename=interview_report_{interview_id}.pdf"}
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


# ── New qualitative flow endpoints ────────────────────────────────────────────

_INSIGHT_CTA_KEYS: dict[str, str] = {
    "verbatim": "QUAL_VERBATIM_V1",
    "behaviour-archaeology": "QUAL_BEHAVIOUR_ARCHAEOLOGY_V1",
    "decision-intelligence": "QUAL_DECISION_INTELLIGENCE_V1",
}
_LEGACY_BA_CTA = "IN_DEPTH_ALL_INTERVIEWS_BA_V1"


@router.post("/guides/upload", response_model=SuccessResponse)
async def upload_guide(
    workspace_id: str,
    exploration_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(status_code=403, detail=ErrorResponse(status="error", message="Only admins can upload guides").dict())

    try:
        await require_persona_exists(session, exploration_id)
    except WorkflowError as e:
        raise HTTPException(status_code=400, detail=ErrorResponse(status="error", message=e.message).dict())

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail=ErrorResponse(status="error", message="File too large. Max 2 MB.").dict())

    try:
        raw_text = interview_service._extract_text_from_upload(content, file.content_type or "", file.filename or "")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=ErrorResponse(status="error", message=str(exc)).dict())

    guide = await interview_service.create_guide_from_text(workspace_id, exploration_id, current_user.id, raw_text)
    return SuccessResponse(message="Guide created from uploaded file", data=guide)


@router.post("/interviews/run-all", response_model=SuccessResponse)
async def run_all_interviews(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(status_code=403, detail=ErrorResponse(status="error", message="Only admins can run interviews").dict())

    existing_guide = await interview_service.get_full_interview_guide(workspace_id, exploration_id)
    if not existing_guide:
        raise HTTPException(status_code=400, detail=ErrorResponse(status="error", message="Generate or upload a discussion guide first.").dict())

    try:
        result = await interview_service.run_interviews_for_all_personas(workspace_id, exploration_id, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=ErrorResponse(status="error", message=str(exc)).dict())

    if result["ran"]:
        await report_cache.invalidate_cache(exploration_id)

    return SuccessResponse(message="Interviews complete", data=result)


@router.get("/insights/status", response_model=SuccessResponse)
async def get_insights_status(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
):
    from app.models.interview import Interview as _InterviewModel
    from sqlmodel import select as _sel
    from sqlalchemy.ext.asyncio import AsyncSession as _ASession
    from app.db import async_engine as _eng

    guide_sections = await interview_service.get_full_interview_guide(workspace_id, exploration_id)
    guide_exists = len(guide_sections) > 0

    async with _ASession(_eng) as _s:
        iv_r = await _s.execute(
            _sel(_InterviewModel).where(
                _InterviewModel.workspace_id == workspace_id,
                _InterviewModel.exploration_id == exploration_id,
            )
        )
        interviews_count = len(iv_r.scalars().all())

    insights: dict = {}
    for itype, cta in _INSIGHT_CTA_KEYS.items():
        cached = await report_cache.get_cached_report(exploration_id, cta)
        if itype == "behaviour-archaeology" and not cached:
            cached = await report_cache.get_cached_report(exploration_id, _LEGACY_BA_CTA)
        if cached:
            insights[itype] = cached.status
        else:
            latest = await report_cache.get_latest_report(exploration_id, cta)
            insights[itype] = latest.status if latest else "not_started"

    return SuccessResponse(
        message="Insights status",
        data={"guide_exists": guide_exists, "interviews_count": interviews_count, "insights": insights},
    )


@router.post("/insights/{insight_type}/generate", response_model=SuccessResponse)
async def generate_insight(
    workspace_id: str,
    exploration_id: str,
    insight_type: str,
    current_user: User = Depends(get_current_active_user),
):
    if insight_type not in _INSIGHT_CTA_KEYS:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(status="error", message=f"Unknown insight type '{insight_type}'. Valid: {', '.join(_INSIGHT_CTA_KEYS)}").dict(),
        )

    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(status_code=403, detail=ErrorResponse(status="error", message="Only admins can generate insights").dict())

    interviews = await interview_service.list_interviews_for_objective(workspace_id, exploration_id)
    if not interviews:
        raise HTTPException(status_code=400, detail=ErrorResponse(status="error", message="Run interviews before generating insights.").dict())

    cta = _INSIGHT_CTA_KEYS[insight_type]

    existing = await report_cache.get_cached_report(exploration_id, cta)
    if insight_type == "behaviour-archaeology" and not existing:
        existing = await report_cache.get_cached_report(exploration_id, _LEGACY_BA_CTA)
    if existing:
        return SuccessResponse(message="Insight already generated", data={"cta_type": cta, "status": "done"})

    in_progress = await report_cache.get_latest_report(exploration_id, cta)
    if in_progress and in_progress.status == "generating":
        return SuccessResponse(message="Insight generation in progress", data={"cta_type": cta, "status": "generating"})

    await report_cache.set_report_status(exploration_id, cta, "qual", "generating")

    try:
        if insight_type == "verbatim":
            content = await interview_service.generate_verbatim_content(exploration_id)
            await report_cache.store_report_cache(exploration_id, cta, None, "qual", content_md=_json.dumps(content))

        elif insight_type == "behaviour-archaeology":
            ba_path = generate_pdf_path(prefix="ba_all")
            path = await generate_combined_interviews_pdf(objective_id=exploration_id, out_path=ba_path, cta="BEHAVIORAL_ARCHAEOLOGY")
            await report_cache.store_report_cache(exploration_id, cta, path, "qual")

        elif insight_type == "decision-intelligence":
            md = await interview_service.generate_decision_intelligence_content(exploration_id)
            await report_cache.store_report_cache(exploration_id, cta, None, "qual", content_md=md)

    except Exception as exc:
        await report_cache.set_report_status(exploration_id, cta, "qual", "failed", error_message=str(exc))
        raise HTTPException(status_code=500, detail=ErrorResponse(status="error", message=str(exc)).dict())

    return SuccessResponse(message="Insight generated", data={"cta_type": cta, "status": "done"})


@router.get("/insights/{insight_type}", response_model=SuccessResponse)
async def view_insight(
    workspace_id: str,
    exploration_id: str,
    insight_type: str,
    current_user: User = Depends(get_current_active_user),
):
    if insight_type not in _INSIGHT_CTA_KEYS:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(status="error", message=f"Unknown insight type '{insight_type}'. Valid: {', '.join(_INSIGHT_CTA_KEYS)}").dict(),
        )

    cta = _INSIGHT_CTA_KEYS[insight_type]
    cached = await report_cache.get_cached_report(exploration_id, cta)
    if insight_type == "behaviour-archaeology" and not cached:
        cached = await report_cache.get_cached_report(exploration_id, _LEGACY_BA_CTA)

    if not cached:
        latest = await report_cache.get_latest_report(exploration_id, cta)
        status = latest.status if latest else "not_started"
        return SuccessResponse(
            message="Insight not ready",
            data={"type": insight_type, "status": status, "pdf_path": None, "content": None, "generated_at": None},
        )

    content = None
    if cached.content_md:
        try:
            content = _json.loads(cached.content_md)
        except Exception:
            content = cached.content_md

    return SuccessResponse(
        message="Insight ready",
        data={
            "type": insight_type,
            "status": cached.status,
            "pdf_path": cached.pdf_path,
            "content": content,
            "generated_at": cached.created_at.isoformat() if cached.created_at else None,
        },
    )
