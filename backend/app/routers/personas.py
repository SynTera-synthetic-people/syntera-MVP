from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from app.schemas.persona import PersonaCreate, PersonaOut, PersonaUpdate, PersonaPreview, PersonaBackstoryIn
from app.schemas.response import SuccessResponse, ErrorResponse, DeleteResponse
from app.services import persona as persona_service
from app.services import auto_generated_persona, manual_generated_persona
from app.services import workspace as ws_service
from app.services import exploration as exploration_service
from app.routers.auth_dependencies import get_current_active_user
from app.models.user import User
from app.services import persona_templates as persona_template
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any
from sqlmodel import select
from app.db import get_session
from app.models.research_objectives import ResearchObjectives
from app.services.exploration import get_exploration
from app.schemas.persona import (
    PersonaTraitValidationRequest,
    PersonaValidationResponse, PersonaBackstoryOut
)
from app.services.persona import validate_persona_traits_with_omi
from app.services import research_objectives
# Omi integration
from app.utils.omi_helpers import (
    notify_omi_stage_change,
    get_omi_encouragement,
    get_omi_concern
)
from app.models.omi import WorkflowStage
from app.services import omi as omi_service
from app.services.exploration import get_exploration

router = APIRouter(
    prefix="/workspaces/{workspace_id}/explorations/{exploration_id}/personas",
    tags=["personas"],
)

def _to_dict(maybe_obj):
    if maybe_obj is None:
        return None
    if isinstance(maybe_obj, dict):
        return maybe_obj
    if hasattr(maybe_obj, "dict") and callable(getattr(maybe_obj, "dict")):
        try:
            return maybe_obj.dict()
        except Exception:
            pass
    try:
        return vars(maybe_obj)
    except Exception:
        return maybe_obj


@router.get("/auto-generate", response_model=SuccessResponse)
async def auto_generate_personas(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        members = await ws_service.list_workspace_members(workspace_id)
        if not any(m.user_id == current_user.id for m in members):
            raise HTTPException(
                status_code=403,
                detail="Not authorized"
            )

        exp = await exploration_service.get_exploration(session, exploration_id)
        if not exp:
            raise HTTPException(status_code=404, detail="Research objective not found")

        # personas = await persona_service.generate_auto_personas(exp, exploration_id)
        current_user_id = current_user.id
        personas = await auto_generated_persona.ai_generate_persona(exploration_id, workspace_id, current_user_id)

        return SuccessResponse(
            message="Auto generated personas",
            data=personas
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

# added dymmy
# @router.get("/templates", response_model=SuccessResponse)
# async def get_persona_templates():
#     templates = persona_template.list_templates()
#     return SuccessResponse(message="Persona templates fetched successfully", data=templates)
#
#
# @router.get("/templates/{template_id}", response_model=SuccessResponse)
# async def get_persona_template(template_id: int):
#     tpl = persona_template.get_template_by_id(template_id)
#     if not tpl:
#         raise HTTPException(
#             status_code=status.HTTP_404_NOT_FOUND,
#             detail=ErrorResponse(status="error", message="Persona template not found").dict()
#         )
#     return SuccessResponse(message="Persona template fetched successfully", data=tpl)


@router.post("/", response_model=SuccessResponse, status_code=status.HTTP_201_CREATED)
async def create_persona(
    workspace_id: str,
    exploration_id: str,
    payload: dict,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="Only workspace admins can create personas").dict()
        )
    
    # Notify Omi of stage change
    try:
        await notify_omi_stage_change(
            workspace_id,
            current_user.id,
            WorkflowStage.PERSONA_BUILDER
        )
    except Exception as e:
        print(f"Omi stage notification failed: {e}")

    exp = await get_exploration(session, exploration_id)
    if not exp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Exploration objective not found").dict()
        )

    exp_workspace_id = exp.workspace_id
    if str(exp_workspace_id) != str(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Exploration is not part of the provided workspace").dict()
        )


    # Validate persona traits with Omi AI
    try:
        session = await omi_service.get_or_create_session(exp.id, current_user.id)
        persona_data = {
            "name": payload.name,
            "age_range": payload.age_range,
            "gender": payload.gender,
            "values": payload.values,
            "lifestyle": payload.lifestyle,
            "price_sensitivity": payload.price_sensitivity,
            "brand_sensitivity": payload.brand_sensitivity
        }
        
        validation = await omi_service.validate_with_omi(
            session.id,
            WorkflowStage.PERSONA_BUILDER,
            persona_data
        )
        
        if not validation.valid:
            # Show Omi concern for trait contradictions
            await get_omi_concern(
                workspace_id,
                current_user.id,
                validation.message
            )
            # Don't block creation, just warn
            print(f"Omi validation warning: {validation.message}")
    except Exception as e:
        print(f"Omi validation failed: {e}")

    p = await manual_generated_persona.manual_persona(exp.id, workspace_id, current_user.id, payload)
    # p = await persona_service.create_persona(workspace_id, current_user.id, payload)
    
    # Encourage user with Omi
    try:
        await get_omi_encouragement(
            workspace_id,
            current_user.id,
            f"Great! {payload.name} is looking good. Want to add a backstory to make this persona even more realistic?"
        )
    except Exception as e:
        print(f"Omi encouragement failed: {e}")
    
    return SuccessResponse(message="Persona created successfully", data=p)


@router.get("/", response_model=SuccessResponse)
async def list_personas(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
):
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m.user_id == current_user.id for m in members):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="You are not a member of this workspace").dict()
        )

    personas = await persona_service.list_personas(workspace_id, exploration_id)
    return SuccessResponse(message="Personas fetched successfully", data=personas)


@router.get("/{persona_id}", response_model=SuccessResponse)
async def get_persona(
    workspace_id: str,
    exploration_id: str,
    persona_id: str,
    current_user: User = Depends(get_current_active_user),
):
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m.user_id == current_user.id for m in members):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="You are not a member of this workspace").dict()
        )

    p = await persona_service.get_persona(persona_id)
    if not p or str(p["exploration_id"]) != str(exploration_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Persona not found for this research objective").dict()
        )

    return SuccessResponse(message="Persona fetched successfully", data=p)


@router.put("/{persona_id}", response_model=SuccessResponse)
async def update_persona(
    workspace_id: str,
    exploration_id: str,
    persona_id: str,
    payload: dict,
    current_user: User = Depends(get_current_active_user),
):
    is_admin = await ws_service.is_workspace_admin(workspace_id, current_user.id)
    p = await persona_service.get_persona(persona_id)
    if not p or str(p["exploration_id"]) != str(exploration_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Persona not found for this research objective").dict()
        )
    if not is_admin and str(p["created_by"]) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="Not authorized to update this persona").dict()
        )

    updated = await persona_service.update_persona(persona_id, payload)
    return SuccessResponse(message="Persona updated successfully", data=updated)


@router.delete("/{persona_id}", response_model=DeleteResponse)
async def delete_persona(
    workspace_id: str,
    exploration_id: str,
    persona_id: str,
    current_user: User = Depends(get_current_active_user),
):
    is_admin = await ws_service.is_workspace_admin(workspace_id, current_user.id)
    p = await persona_service.get_persona(persona_id)
    if not p or str(p["exploration_id"]) != str(exploration_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Persona not found for this research objective").dict()
        )
    if not is_admin and str(p["created_by"]) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="Not authorized to delete this persona").dict()
        )

    await persona_service.delete_persona(persona_id)
    return DeleteResponse(message="Persona deleted successfully")


@router.get("/{persona_id}/preview", response_model=SuccessResponse)
async def preview_persona(
    workspace_id: str,
    exploration_id: str,
    persona_id: str,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m.user_id == current_user.id for m in members):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="You are not a member of this workspace").dict()
        )

    p = await persona_service.get_persona(persona_id)
    if not p or str(p["exploration_id"]) != str(exploration_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Persona not found for this research objective").dict()
        )

    full_persona_info = p.get("persona_details") or {}

    confidence = full_persona_info.get("confidence_scoring","")
    if not confidence:
        confidence = await persona_service.generate_persona_confidence(p)

    ocean_profile = p.get("ocean_profile")
    if not ocean_profile:
        try:
            # Fetch persona from database to update
            result = await session.execute(
                select(Persona).where(Persona.id == persona_id)
            )
            persona_obj = result.scalar_one_or_none()
            
            if persona_obj:
                # Generate OCEAN profile
                system_prompt = load_persona_builder_prompt()
                user_prompt = json.dumps({
                    "persona_data": {
                        "age_range": persona_obj.age_range,
                        "gender": persona_obj.gender,
                        "income_range": persona_obj.income_range,
                        "location": persona_obj.geography or persona_obj.location_country,
                        "occupation": persona_obj.occupation,
                        "lifestyle": persona_obj.lifestyle,
                        "values": persona_obj.values,
                        "motivations": persona_obj.motivations,
                        "brand_sensitivity": persona_obj.brand_sensitivity,
                        "price_sensitivity": persona_obj.price_sensitivity,
                        "digital_activity": persona_obj.digital_activity
                    }
                })

                ocean_profile = await call_omi(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    response_format="json"
                )

                # Save OCEAN profile to database
                persona_obj.ocean_profile = ocean_profile
                session.add(persona_obj)
                await session.commit()
                await session.refresh(persona_obj)
                
                # Update the persona dict with OCEAN profile
                p["ocean_profile"] = ocean_profile
        except Exception as e:
            print(f"Failed to generate OCEAN profile: {e}")
            ocean_profile = None

    preview = persona_service.persona_preview_from_dict(p, full_persona_info, confidence=confidence)

    return SuccessResponse(message="Persona preview generated successfully", data=preview)


@router.post("/traits_validation", response_model=PersonaValidationResponse)
async def validate_persona_traits(
    payload: PersonaTraitValidationRequest,
    session: AsyncSession = Depends(get_session)
):
    # -----------------------------------
    # Fetch latest research objective
    # -----------------------------------
    result = await session.execute(
        ResearchObjectives.__table__
        .select()
        .where(ResearchObjectives.exploration_id == payload.exploration_id)
        .order_by(ResearchObjectives.created_at.desc())
        .limit(1)
    )
    research_objective = result.first()

    if not research_objective:
        raise HTTPException(
            status_code=404,
            detail="Research objective not found"
        )

    # -----------------------------------
    # Validate traits with Omi
    # -----------------------------------
    validation = await validate_persona_traits_with_omi(
        research_objective=research_objective.description,
        trait_group=payload.trait_group,
        traits=payload.traits
    )

    return validation


@router.put("/{persona_id}/backstory", response_model=PersonaBackstoryOut)
async def save_persona_backstory(
    persona_id: str,
    payload: PersonaBackstoryIn,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    try:
        persona = await persona_service.update_persona_backstory(
            session=session,
            persona_id=persona_id,
            backstory=payload.backstory
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return PersonaBackstoryOut(
        persona_id=persona.id,
        backstory=persona.backstory
    )

from app.services.omi import load_persona_builder_prompt
from app.services.omi import call_omi
from  app.models.persona import Persona
from sqlmodel import Session, select
import json


@router.post("/persona/{persona_id}/ocean")
async def generate_ocean(
    persona_id: str,
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(
        select(Persona).where(Persona.id == persona_id)
    )
    persona = result.scalar_one_or_none()


    if not persona:
        return {"error": "Persona not found"}

    if persona.ocean_profile:
        return persona.ocean_profile

    system_prompt = load_persona_builder_prompt()

    user_prompt = json.dumps({
        "persona_data": {
            "age_range": persona.age_range,
            "gender": persona.gender,
            "income_range": persona.income_range,
            "location": persona.geography or persona.location_country,
            "occupation": persona.occupation,
            "lifestyle": persona.lifestyle,
            "values": persona.values,
            "motivations": persona.motivations,
            "brand_sensitivity": persona.brand_sensitivity,
            "price_sensitivity": persona.price_sensitivity,
            "digital_activity": persona.digital_activity
        }
    })

    ocean_profile = await call_omi(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        response_format="json"
    )

    persona.ocean_profile = ocean_profile
    session.add(persona)
    await session.commit()
    await session.refresh(persona)

    return ocean_profile


