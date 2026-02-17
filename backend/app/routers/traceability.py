# app/routers/traceability.py
from fastapi import APIRouter, Depends, HTTPException
from app.schemas.traceability import TraceabilityGenerateRequest, TraceabilityOut, TraceabilityLayer
from app.services import traceability as svc
from app.services.exploration import get_exploration
from app.models.user import User
from app.routers.auth_dependencies import get_current_active_user
from app.services.traceability_report import get_traceability_reports, get_existing_traceability_report, get_exploration_method_flags, upsert_traceability_report
from app.schemas.response import SuccessResponse

router = APIRouter(
    prefix="/workspaces/{workspace_id}/explorations/{exploration_id}/traceability",
    tags=["Traceability"]
)

def is_missing(data: dict | None) -> bool:
    return data is None or data == {}

@router.get("/")
async def get_traceability(
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
):
    try:
        is_quantitative, is_qualitative = await get_exploration_method_flags(
            exploration_id
        )

        existing = await get_existing_traceability_report(exploration_id)

        # -------------------------
        # CASE 1: No record at all
        # -------------------------
        if not existing:
            data = await get_traceability_reports(
                exploration_id=exploration_id,
                is_quant=is_quantitative,
                is_qual=is_qualitative
            )

            await upsert_traceability_report(
                exploration_id=exploration_id,
                ro=data["ro_traceability"],
                persona=data["persona_traceability"],
                quant=data["quant_traceability"],
                qual=data["qual_traceability"],
            )

            return SuccessResponse(
                message="Traceability Reports",
                data={
                    "is_quantitative": is_quantitative,
                    "is_qualitative": is_qualitative,
                    **data,
                },
            )

        # -------------------------
        # CASE 2: Partial missing
        # -------------------------
        need_quant = is_missing(existing.quant_traceability)
        need_qual = is_missing(existing.qual_traceability)

        if need_quant or need_qual:
            data = await get_traceability_reports(
                exploration_id=exploration_id,
                is_quant=need_quant,
                is_qual=need_qual
            )

            await upsert_traceability_report(
                exploration_id=exploration_id,
                quant=data["quant_traceability"] if need_quant else None,
                qual=data["qual_traceability"] if need_qual else None,
            )

            return SuccessResponse(
                message="Traceability Reports",
                data={
                    "is_quantitative": is_quantitative,
                    "is_qualitative": is_qualitative,
                    "ro_traceability": existing.ro_traceability,
                    "persona_traceability": existing.persona_traceability,
                    "quant_traceability": (
                        data["quant_traceability"]
                        if need_quant
                        else existing.quant_traceability
                    ),
                    "qual_traceability": (
                        data["qual_traceability"]
                        if need_qual
                        else existing.qual_traceability
                    ),
                },
            )

        # -------------------------
        # CASE 3: Everything exists
        # -------------------------
        return SuccessResponse(
            message="Traceability Reports",
            data={
                "is_quantitative": is_quantitative,
                "is_qualitative": is_qualitative,
                "ro_traceability": existing.ro_traceability,
                "persona_traceability": existing.persona_traceability,
                "quant_traceability": existing.quant_traceability,
                "qual_traceability": existing.qual_traceability,
            },
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error",
                "message": str(e),
                "type": e.__class__.__name__,
            },
        )



@router.post("/create", response_model=TraceabilityOut)
async def create_traceability_record(
    workspace_id: str,
    exploration_id: str,
    payload: TraceabilityGenerateRequest,
    current_user: User = Depends(get_current_active_user)
):
    exp = await get_exploration(exploration_id)
    if not exp:
        raise HTTPException(404, "Research objective not found.")

    created_by = payload.created_by or current_user.id

    # service will fetch full context itself (personas, interviews, surveys, rebuttals)
    return await svc.create_traceability(
        workspace_id=workspace_id,
        exploration_id=exploration_id,
        created_by=created_by,
        custom_notes=payload.custom_notes or ""
    )


@router.post("/{record_id}/regenerate", response_model=TraceabilityOut)
async def regenerate_traceability(
    workspace_id: str,
    exploration_id: str,
    record_id: str,
    payload: TraceabilityGenerateRequest,
    current_user: User = Depends(get_current_active_user)
):
    exp = await get_exploration(exploration_id)
    if not exp:
        raise HTTPException(404, "Research objective not found.")

    updated = await svc.regenerate_traceability(
        record_id=record_id,
        custom_notes=payload.custom_notes or ""
    )

    if not updated:
        raise HTTPException(404, "Traceability record not found.")

    return updated


@router.get("/{record_id}", response_model=TraceabilityOut)
async def get_traceability_record(workspace_id: str, exploration_id: str, record_id: str):
    rec = await svc.get_traceability(record_id)
    if not rec:
        raise HTTPException(404, "Record not found")
    return rec
