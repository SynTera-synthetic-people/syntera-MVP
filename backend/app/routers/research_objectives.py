from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    status,
    BackgroundTasks
)
from typing import Optional
from app.db import get_session
from app.models.exploration import Exploration
from app.schemas.response import SuccessResponse, DeleteResponse, ErrorResponse
from app.schemas.research_objectives import ResearchObjectivesCreate, ResearchObjectivesUpdate, ResearchObjectivesOut, ResearchObjectivesSummaryPatch, ResearchObjectiveFramerInput
from app.services import research_objectives as exp_service
from app.services import persona as persona_service
from app.services import interview as interview_service
from app.services import report_orchestrator as report_cache
from app.services.exploration import get_exploration_by_id
from app.services import workspace as ws_service
from app.services import templates as template_service
from app.services.research_objectives import build_conversation_text, summarize_research_objective_from_conversation
from app.utils.file_utils import save_upload_file
from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from sqlalchemy.ext.asyncio import AsyncSession
# Omi integration
from app.utils.omi_helpers import (
    notify_omi_stage_change,
    get_omi_encouragement,
    get_omi_concern
)
from app.models.omi import WorkflowStage, OmiState
from app.services import omi as omi_service
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import select
from app.models.research_objectives import ResearchObjectives, ResearchObjectivesFile
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.exploration import get_exploration


router = APIRouter(
    prefix="/workspaces/{workspace_id}/research/objectives",
    tags=["Research Objectives"]
)

@router.post("/", response_model=SuccessResponse, status_code=201)
async def create_objective(
    exploration_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    # --------------------------------------------------
    # FETCH EXPLORATION
    # --------------------------------------------------
    exploration = await get_exploration_by_id(session, exploration_id)
    if not exploration:
        raise HTTPException(status_code=404, detail="Exploration not found")

    if not await ws_service.is_workspace_admin(
        exploration.workspace_id, current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Only workspace admins can create research objectives"
        )

    # --------------------------------------------------
    # PREVENT DUPLICATE SAVE
    # --------------------------------------------------
    existing = await session.execute(
        select(ResearchObjectives).where(
            ResearchObjectives.exploration_id == exploration.id
        )
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=409,
            detail="Research objective already exists for this exploration"
        )

    # --------------------------------------------------
    # GET OMI SESSION
    # --------------------------------------------------
    omi_result = await omi_service.get_or_create_session(
        exploration_id,
        current_user.id
    )
    omi_session = (
        omi_result[0] if isinstance(omi_result, tuple) else omi_result
    )

    session_context = omi_session.context or {}
    ro_ctx = session_context.get("research_objectives")

    if not ro_ctx:
        raise HTTPException(
            status_code=400,
            detail="No finalized research objective found. Please complete Omi chat first."
        )

    # --------------------------------------------------
    # EXTRACT AI OUTPUT
    # --------------------------------------------------
    final_analysis = ro_ctx.get("final_analysis", {})
    raw_confidence = ro_ctx.get("confidence_level")
    confidence = raw_confidence if isinstance(raw_confidence, int) else 40

    validation_status = (
        "validated" if confidence >= 70 else "needs_review"
    )

    # --------------------------------------------------
    # RESOLVE FINAL DESCRIPTION (IMPORTANT)
    limit = 50
    messages = await omi_service.get_conversation_history(
        omi_session.id,
        limit
    )

    if not messages:
        raise HTTPException(
            status_code=400,
            detail="No conversation found to summarize"
        )
    conversation_text = build_conversation_text(messages)

    final_description = await summarize_research_objective_from_conversation(
        conversation_text
    )

    # --------------------------------------------------
    # CREATE RESEARCH OBJECTIVE
    # --------------------------------------------------
    research_objective = ResearchObjectives(
        exploration_id=exploration.id,
        description=final_description,
        created_by=current_user.id,
        validation_status=validation_status,
        ai_interpretation=final_analysis,
        confidence_level=confidence
    )

    session.add(research_objective)
    await session.commit()
    await session.refresh(research_objective)

    # --------------------------------------------------
    # CLEAN UP OMI CONTEXT
    # --------------------------------------------------
    session_context.pop("research_objectives", None)
    omi_session.context = session_context

    if WorkflowStage.RESEARCH_OBJECTIVES not in omi_session.completed_stages:
        omi_session.completed_stages.append(
            WorkflowStage.RESEARCH_OBJECTIVES
        )

    session.add(omi_session)
    await session.commit()

    # --------------------------------------------------
    # ENCOURAGEMENT
    # --------------------------------------------------
    await get_omi_encouragement(
        exploration.workspace_id,
        current_user.id,
        "Research objective saved! 🎉 Ready to build personas."
    )

    return SuccessResponse(
        message="Research objective saved successfully",
        data={
            "exploration": research_objective,
            "validation_status": validation_status,
            "confidence_level": confidence
        }
    )



@router.post("/from-framer", response_model=SuccessResponse, status_code=201)
async def create_objective_from_framer(
    exploration_id: str,
    body: ResearchObjectiveFramerInput,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """
    Synthesizes the Research Objective Framer's structured fields into a research
    objective. If the Framer was filled in thinly (confidence < 70), this does NOT
    finalize — it hands off to the same follow-up-question logic the chat flow uses
    (validate_description_with_llm), so Omi keeps refining instead of silently
    accepting a weak objective. Only a confident synthesis gets persisted via the
    existing ResearchObjectives pipeline — no new table, no schema migration.
    """
    exploration = await get_exploration_by_id(session, exploration_id)
    if not exploration:
        raise HTTPException(status_code=404, detail="Exploration not found")

    if not await ws_service.is_workspace_admin(
        exploration.workspace_id, current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Only workspace admins can create research objectives"
        )

    framer = body.model_dump()
    synthesis = await exp_service.synthesize_research_objective_from_framer(framer)
    if not synthesis.get("final_objective"):
        raise HTTPException(
            status_code=400,
            detail="Fill in at least one section before submitting"
        )

    confidence = exp_service.framer_confidence(synthesis)

    omi_result = await omi_service.get_or_create_session(exploration_id, current_user.id)
    omi_session = omi_result[0] if isinstance(omi_result, tuple) else omi_result

    # --------------------------------------------------
    # LOW CONFIDENCE — let Omi ask a follow-up before finalizing, same as the
    # chat-driven flow, instead of declaring an underfilled objective "done".
    # --------------------------------------------------
    if confidence < 70:
        analysis = await exp_service.validate_description_with_llm(
            description=synthesis["final_objective"],
            conversation=[],
        )
        questions = analysis.get("questions", "")
        if isinstance(questions, list):
            questions = " ".join(questions)

        if questions:
            session_context = omi_session.context or {}
            session_context["research_objectives"] = {
                "probe_round": 1,
                "asked_components": analysis.get("missing", []),
                "raw_inputs": [synthesis["final_objective"]],
                "current_draft": synthesis["final_objective"],
                "final_analysis": analysis,
                "confidence_level": confidence,
                "ready_to_save": False,
                "final_synthesized_text": synthesis["final_objective"],
                "conversation": analysis.get("conversation"),
                "final_objective": analysis.get("final_objective"),
                "information_gathered": analysis.get("information_gathered"),
            }
            omi_session.context = session_context
            flag_modified(omi_session, "context")
            session.add(omi_session)
            await session.commit()

            await exp_service.increment_clarification_attempts(exploration_id)

            await omi_service.add_message(
                session_id=omi_session.id,
                role="omi",
                content=questions,
                message_type="chat",
                workflow_stage=WorkflowStage.RESEARCH_OBJECTIVES,
                omi_state=OmiState.THINKING,
            )

            return SuccessResponse(
                message="A few things are still fuzzy — Omi has a quick follow-up for you.",
                data={"needs_followup": True, "confidence_level": confidence},
            )
        # No follow-up question came back despite low confidence — nothing more
        # to ask, so fall through and finalize with what we have.

    # --------------------------------------------------
    # FINALIZE — confident enough (or no further question to ask).
    # --------------------------------------------------
    existing_check = await session.execute(
        select(ResearchObjectives).where(
            ResearchObjectives.exploration_id == exploration.id
        )
    )
    is_update = existing_check.scalars().first() is not None

    try:
        research_objective = await exp_service.persist_framer_research_objective(
            session,
            exploration_id=exploration.id,
            created_by=current_user.id,
            framer=framer,
            synthesis=synthesis,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if is_update:
        # Same invalidation as a manual description edit — downstream artifacts must regenerate.
        await interview_service.clear_qualitative_outputs(exploration.workspace_id, exploration_id)
        await persona_service.clear_personas_for_exploration(exploration.workspace_id, exploration_id)
        await report_cache.invalidate_cache(exploration_id)

    # --------------------------------------------------
    # MIRROR THE OMI CONFIRMATION MESSAGE
    # The frontend gates the "Create with Omi" / "Build Manually" CTAs on the
    # last chat message containing this exact phrase — write it here so the
    # Framer path surfaces those CTAs without any frontend special-casing.
    # --------------------------------------------------
    confirmation_message = (
        "Thanks! I’ve put everything together and we’re good to proceed.\n\n"
        "📌 **Research Objective Summary:**\n"
        f"{research_objective.description}\n\n"
        "I’ll carry this forward into personas."
    )
    await omi_service.add_message(
        session_id=omi_session.id,
        role="omi",
        content=confirmation_message,
        message_type="chat",
        workflow_stage=WorkflowStage.RESEARCH_OBJECTIVES,
    )

    if WorkflowStage.RESEARCH_OBJECTIVES not in omi_session.completed_stages:
        omi_session.completed_stages.append(WorkflowStage.RESEARCH_OBJECTIVES)
        session.add(omi_session)
        await session.commit()

    await get_omi_encouragement(
        exploration.workspace_id,
        current_user.id,
        "Research objective saved! 🎉 Ready to build personas."
    )

    return SuccessResponse(
        message="Research objective saved successfully",
        data={
            "exploration": research_objective,
            "validation_status": research_objective.validation_status,
            "confidence_level": research_objective.confidence_level,
        }
    )


@router.put("/{objective_id}", response_model=SuccessResponse)
async def update_objective(
    exploration_id: str,
    objective_id: str,
    description: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    exploration = await get_exploration_by_id(session, exploration_id)

    if not exploration:
        raise HTTPException(
            status_code=404,
            detail="Exploration not found"
        )

    if not await ws_service.is_workspace_admin(exploration.workspace_id, current_user.id):
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="Only workspace admins can update research objectives"
            ).dict()
        )

    exp = await exp_service.get_res_obj(objective_id)
    if not exp or str(exp.exploration_id) != str(exploration_id):
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(status="error", message="Research objective not found").dict()
        )

    if description is not None:
        validation = await exp_service.validate_description_with_llm(description)

        if not validation.get("valid", False):
            missing = validation.get("missing", [])
            missing_str = ", ".join(missing)

            raise HTTPException(
                status_code=400,
                detail=ErrorResponse(
                    status="error",
                    message=f"{missing_str} " + (
                        "is missing in the description" if len(missing) == 1
                        else "are missing in the description"
                    )
                ).dict()
            )

    if file:
        stored_name, size, ctype = await save_upload_file(file)

    updated = await exp_service.update_exploration(
        objective_id,
        description=description
    )

    if file and updated:
        await exp_service.add_file(updated.id, stored_name, file.filename, size, ctype)
        updated = await exp_service.get_res_obj(updated.id)

    if description is not None or file:
        # RO changes invalidate every downstream AI artifact; clear them so the next click regenerates.
        await interview_service.clear_qualitative_outputs(exploration.workspace_id, exploration_id)
        await persona_service.clear_personas_for_exploration(exploration.workspace_id, exploration_id)
        await report_cache.invalidate_cache(exploration_id)

    return SuccessResponse(
        message="The description is validated. Research objective updated successfully.",
        data=updated
    )

@router.get("/", response_model=SuccessResponse)
async def list_objectives(exploration_id: str, current_user: User = Depends(get_current_active_user), session: AsyncSession = Depends(get_session)):

    exp = await get_exploration(session, exploration_id)
    if not exp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Exploration objective not found").dict()
        )

    exp_workspace_id = exp.workspace_id
    members = await ws_service.list_workspace_members(exp_workspace_id)
    if not any(m.get("user_id") == current_user.id for m in members):
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="You do not have access to this workspace"
            ).dict()
        )

    data = await exp_service.list_explorations(exp_workspace_id)
    return SuccessResponse(
        message="Research objectives fetched successfully",
        data=data
    )

@router.get("/{objective_id}", response_model=SuccessResponse)
async def get_objective(workspace_id: str, objective_id: str, current_user: User = Depends(get_current_active_user)):
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m.get("user_id") == current_user.id for m in members):
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error", message="Not authorized to view this workspace"
            ).dict()
        )

    exp = await exp_service.get_res_obj(objective_id)
    if not exp:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                status="error", message="Research objective not found"
            ).dict()
        )

    return SuccessResponse(
        message="Research objective fetched successfully",
        data=exp
    )

@router.patch("/summary", response_model=SuccessResponse)
async def patch_objective_summary(
    workspace_id: str,
    exploration_id: str,
    body: ResearchObjectivesSummaryPatch,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Persist an inline summary edit. Skips LLM validation — caller has already refined via Omi."""
    exploration = await get_exploration(session, exploration_id)
    if not exploration:
        raise HTTPException(status_code=404, detail="Exploration not found")

    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m.get("user_id") == current_user.id for m in members):
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="You do not have access to this workspace"
            ).dict()
        )

    updated = await exp_service.patch_summary_by_exploration(exploration_id, body.description)
    if not updated:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                status="error",
                message="Research objective not found for this exploration"
            ).dict()
        )

    return SuccessResponse(
        message="Summary updated successfully",
        data=updated
    )


@router.delete("/{objective_id}", response_model=DeleteResponse)
async def delete_objective(workspace_id: str, objective_id: str, current_user: User = Depends(get_current_active_user)):
    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(
            status_code=403,
            detail=ErrorResponse(
                status="error",
                message="Only workspace admins can delete research objectives"
            ).dict()
        )

    success = await exp_service.delete_exploration(objective_id)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                status="error",
                message="Research objective not found"
            ).dict()
        )

    return DeleteResponse(message="Research objective deleted successfully")
