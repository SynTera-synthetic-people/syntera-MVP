"""
Omi Integration Helpers

These helpers integrate Omi guidance into existing endpoints
without requiring major refactoring.
"""

from app.services import omi as omi_service
from app.models.omi import WorkflowStage, OmiState
from typing import Optional, Dict, Any


async def notify_omi_stage_change(
    workspace_id: str,
    user_id: str,
    new_stage: WorkflowStage,
    context: Optional[Dict[str, Any]] = None
):
    """Notify Omi of a stage change and get guidance"""
    try:
        session = await omi_service.get_or_create_session(workspace_id, user_id)
        
        # Update stage
        await omi_service.update_session_state(
            session.id,
            stage=new_stage,
            context_update=context or {}
        )
        
        # Get guidance for new stage
        guidance = await omi_service.get_ai_guidance(new_stage, context=context)
        
        # Add guidance message
        await omi_service.add_message(
            session.id,
            "omi",
            guidance.guidance,
            "stage_transition",
            new_stage,
            guidance.omi_state
        )
        
        return guidance
    except Exception as e:
        # Fail silently - Omi is helpful but not critical
        print(f"[OMI] Error in stage change notification: {e}")
        return None


async def notify_omi_action(
    workspace_id: str,
    user_id: str,
    action_type: str,
    description: str,
    result: Optional[Dict[str, Any]] = None
):
    """Notify Omi of a user action"""
    try:
        session = await omi_service.get_or_create_session(workspace_id, user_id)
        
        # Create workflow action
        action = await omi_service.create_workflow_action(
            session.id,
            action_type,
            description
        )
        
        # Complete action immediately with result
        if result:
            await omi_service.update_workflow_action(
                action.id,
                status="completed",
                progress=100,
                result=result
            )
        
        return action
    except Exception as e:
        print(f"[OMI] Error in action notification: {e}")
        return None


async def get_omi_encouragement(
    workspace_id: str,
    user_id: str,
    achievement: str
):
    """Get Omi's encouragement for an achievement"""
    try:
        session = await omi_service.get_or_create_session(workspace_id, user_id)
        
        encouragement_messages = [
            f"Nice work! {achievement}",
            f"Excellent! {achievement}",
            f"Great progress! {achievement}",
            f"Love it! {achievement}",
            f"That's sharp! {achievement}"
        ]
        
        import random
        message = random.choice(encouragement_messages)
        
        await omi_service.add_message(
            session.id,
            "omi",
            message,
            "encouragement",
            session.current_stage,
            OmiState.ENCOURAGING
        )
        
        return message
    except Exception as e:
        print(f"[OMI] Error in encouragement: {e}")
        return None


async def get_omi_concern(
    workspace_id: str,
    user_id: str,
    issue: str,
    suggestion: Optional[str] = None
):
    """Get Omi's concerned response for an issue"""
    try:
        session = await omi_service.get_or_create_session(workspace_id, user_id)
        
        message = f"Hmm, {issue}"
        if suggestion:
            message += f" {suggestion}"
        
        await omi_service.add_message(
            session.id,
            "omi",
            message,
            "concern",
            session.current_stage,
            OmiState.CONCERNED
        )
        
        return message
    except Exception as e:
        print(f"[OMI] Error in concern: {e}")
        return None
