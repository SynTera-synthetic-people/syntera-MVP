import asyncio
import json
import logging
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from typing import List, Optional
from app.schemas.persona import (
    PersonaCreate, PersonaOut, PersonaUpdate, PersonaPreview,
    PersonaBackstoryIn, PersonaReplicateRequest, PersonaBulkDownloadRequest,
    ManualPersonaCreate, PersonaPurchaseRequest,
)
from app.schemas.response import SuccessResponse, ErrorResponse, DeleteResponse
from app.services import persona as persona_service
from app.services import auto_generated_persona
# manual_generated_persona import removed — the old one-shot GPT-5 + web-search flow
# (manual_generated_persona.manual_persona) has been replaced by a two-phase system:
#   Phase 1 → POST /personas/manual     → create_manual_persona_draft_with_brains()
#   Phase 2 → POST /personas/{id}/calibrate → calibrate_manual_persona_with_brains()
# Both now live in app/services/manual_digital_brain_persona.py — GPT-4o enrichment
# plus a Digital Brain (primary/secondary archetype) assignment step, with
# per-tier persona limits (free=2, tier1=8, enterprise=8) enforced inside
# create_manual_persona_draft_with_brains() itself.
from app.services import persona_loader_context
from app.services import interview as interview_service
from app.services import report_orchestrator as report_cache
from app.services import workspace as ws_service
from app.services import exploration as exploration_service
from app.services.exploration import require_ro_exists, WorkflowError
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
from app.services.persona_plausibility import evaluate_from_schema
from app.core.rate_limit import limiter
from app.models.persona import Persona
from app.services.digital_brain_pipeline import digital_brain_pipeline
from app.services.ro_extractor import extract_ro_components_for_pipeline
from app.services.manual_digital_brain_persona import (
    create_manual_persona_draft as create_manual_persona_draft_with_brains,
    calibrate_manual_persona_with_brains,
)
from app.services.ke_sourcebank_enrichment import enrich_persona_ke_sources

router = APIRouter(
    prefix="/workspaces/{workspace_id}/explorations/{exploration_id}/personas",
    tags=["personas"],
)

logger = logging.getLogger(__name__)

def _preview_confidence_from_stored_score(persona: dict) -> dict | None:
    raw_score = persona.get("calibration_confidence")
    if raw_score is None:
        raw_score = persona.get("confidence_score")
    if raw_score is None:
        return None

    try:
        if isinstance(raw_score, str):
            score_value = float(raw_score.strip().rstrip("%"))
        else:
            score_value = float(raw_score)
    except (TypeError, ValueError):
        return None

    if score_value <= 1:
        score_value *= 100
    score = max(0, min(100, int(round(score_value))))
    if score <= 0:
        return None

    if score >= 80:
        confidence_level = "High"
    elif score >= 60:
        confidence_level = "Medium"
    else:
        confidence_level = "Low"

    mode = "replication_confidence" if persona.get("parent_persona_id") else "stored_calibration_confidence"
    return {
        "score": f"{score}%",
        "weighted_score": score / 100,
        "confidence_level": confidence_level,
        "mode": mode,
        "note": "Using stored calibration confidence; preview did not run a separate LLM re-score.",
        "components": {
            "stored_calibration_score": score,
        },
    }

def _preview_confidence_from_evidence_snapshot(persona: dict) -> dict | None:
    """
    Omi/legacy personas store their per-dimension confidence breakdown under
    evidence_snapshot.confidence_calculation_detail.components (volume_score,
    recency_score, ro_alignment_score, signal_clarity_score, source_diversity_score)
    rather than under confidence_scoring (the Manual Build Mode field). Without this,
    the preview's confidence check only looks for confidence_scoring, finds nothing,
    and falls through to _preview_confidence_from_stored_score — which synthesizes a
    single generic "stored_calibration_score" component and discards the real
    breakdown that's sitting right there in persona_details.
    """
    evidence = persona.get("evidence_snapshot") or {}
    if isinstance(evidence, str):
        try:
            evidence = json.loads(evidence)
        except (json.JSONDecodeError, TypeError, ValueError):
            evidence = {}
    if not isinstance(evidence, dict):
        return None

    detail = evidence.get("confidence_calculation_detail") or {}
    if not isinstance(detail, dict):
        return None
    components = detail.get("components")
    if not isinstance(components, dict) or not components:
        return None

    weighted_score = detail.get("value") or detail.get("weighted_total")
    try:
        weighted_score = float(weighted_score) if weighted_score is not None else None
    except (TypeError, ValueError):
        weighted_score = None

    score_pct = round(weighted_score * 100) if weighted_score is not None else None
    confidence_level = detail.get("level") or (
        "High" if (score_pct or 0) >= 80 else "Medium" if (score_pct or 0) >= 60 else "Low"
    )

    return {
        "score": f"{score_pct}%" if score_pct is not None else None,
        "weighted_score": weighted_score,
        "confidence_level": confidence_level,
        "mode": "evidence_based_confidence",
        "note": detail.get("method") or "",
        "components": components,
    }


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


NON_ENTERPRISE_OMI_PERSONA_LIMIT = 2
ENTERPRISE_PERSONA_LIMIT = 4


def _normalised_account_tier(user: User) -> str:
    return (getattr(user, "account_tier", None) or "free").lower().strip()


def _is_enterprise_user(user: User) -> bool:
    return _normalised_account_tier(user) == "enterprise"


def _base_persona_limit_for(user: User) -> int:
    return ENTERPRISE_PERSONA_LIMIT if _is_enterprise_user(user) else NON_ENTERPRISE_OMI_PERSONA_LIMIT


def _persona_limit_for(user: User, exp: Any) -> int:
    additional_limit = int(getattr(exp, "additional_persona_limit", 0) or 0)
    return _base_persona_limit_for(user) + additional_limit


def _additional_personas_supported(user: User) -> bool:
    tier = _normalised_account_tier(user)
    return tier in {"tier1", "explorer", "enterprise"}


async def _count_primary_personas(
    session: AsyncSession,
    workspace_id: str,
    exploration_id: str,
) -> tuple[int, int]:
    """Return total and Omi-generated primary persona counts for an exploration."""
    from app.models.persona import Persona as _Persona
    from sqlalchemy import func as _func

    base_filters = (
        _Persona.workspace_id == workspace_id,
        _Persona.exploration_id == exploration_id,
        _Persona.parent_persona_id.is_(None),
    )

    total_result = await session.execute(
        select(_func.count()).select_from(_Persona).where(*base_filters)
    )
    omi_result = await session.execute(
        select(_func.count()).select_from(_Persona).where(
            *base_filters,
            _Persona.auto_generated_persona.is_(True),
        )
    )
    return int(total_result.scalar() or 0), int(omi_result.scalar() or 0)


def _manual_personas_not_allowed_response() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=ErrorResponse(
            status="error",
            message=(
                "Manual persona creation is available only on Enterprise. "
                "Free and Explorer plans can create up to 2 Omi-generated personas."
            ),
        ).dict(),
    )


def _persona_limit_response(limit: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=ErrorResponse(
            status="error",
            message=f"Maximum of {limit} personas already reached for this exploration",
        ).dict(),
    )


async def _build_persona_quota(
    session: AsyncSession,
    user: User,
    workspace_id: str,
    exploration_id: str,
    exp: Any,
) -> dict[str, Any]:
    total_count, omi_count = await _count_primary_personas(session, workspace_id, exploration_id)
    base_limit = _base_persona_limit_for(user)
    purchased_additional = int(getattr(exp, "additional_persona_limit", 0) or 0)
    limit = base_limit + purchased_additional
    return {
        "account_tier": _normalised_account_tier(user),
        "base_limit": base_limit,
        "purchased_additional": purchased_additional,
        "limit": limit,
        "used": total_count,
        "omi_used": omi_count,
        "remaining": max(limit - total_count, 0),
        "can_purchase_additional": _additional_personas_supported(user),
    }


@router.get("/loader-context", response_model=SuccessResponse)
async def get_persona_loader_context(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    exp = await exploration_service.get_exploration(session, exploration_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Exploration not found")

    try:
        await require_ro_exists(session, exploration_id)
    except WorkflowError as e:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(status="error", message=e.message).dict()
        )

    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m["user_id"] == current_user.id for m in members):
        raise HTTPException(status_code=403, detail="Not authorized")

    context = await persona_loader_context.build_persona_loader_context(
        session,
        workspace_id=workspace_id,
        exploration_id=exploration_id,
    )
    return SuccessResponse(message="Persona loader context fetched", data=context)


@router.get("/auto-generate", response_model=SuccessResponse)
@limiter.limit("10/hour")
async def auto_generate_personas(
    request: Request,
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    # Guard outside try/except so HTTPException isn't swallowed by the broad catch below
    exp = await exploration_service.get_exploration(session, exploration_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Exploration not found")
    try:
        await require_ro_exists(session, exploration_id)
    except WorkflowError as e:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(status="error", message=e.message).dict()
        )

    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m["user_id"] == current_user.id for m in members):
        raise HTTPException(status_code=403, detail="Not authorized")

    persona_limit = _persona_limit_for(current_user, exp)
    total_count, omi_count = await _count_primary_personas(session, workspace_id, exploration_id)

    # Free/Explorer: 2 Omi personas only. Enterprise: 4 total personas,
    # created either through Omi or the manual flow.
    remaining_slots = max(persona_limit - total_count, 0)
    remaining_omi_slots = max(persona_limit - omi_count, 0)
    personas_to_generate = min(remaining_slots, remaining_omi_slots)

    if personas_to_generate <= 0:
        existing_personas = await persona_service.list_non_draft_personas(workspace_id, exploration_id)
        return SuccessResponse(
            message="Persona limit already reached",
            data={
                "personas": existing_personas,
                "consumer_personas": [
                    p.get("persona_details") or p for p in existing_personas
                ],
                "limit": persona_limit,
                "generated_count": 0,
            },
        )

    try:
        # exploration already fetched above

        # personas = await persona_service.generate_auto_personas(exp, exploration_id)
        current_user_id = current_user.id
        personas = await auto_generated_persona.ai_generate_persona(
            exploration_id,
            workspace_id,
            current_user_id,
            target_count=personas_to_generate,
            total_persona_goal=persona_limit,
            starting_persona_number=total_count + 1,
        )

        return SuccessResponse(
            message="Auto generated personas",
            data={
                **personas,
                "limit": persona_limit,
                "generated_count": len(personas.get("personas", [])),
            },
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


def _digital_brain_evidence_snapshot(pipeline_result: dict, overall_confidence: Any = None) -> dict:
    depth_layers = pipeline_result.get("stage_3a_depth_layers") or []
    eb_verdicts = pipeline_result.get("stage_3b_eb_verdicts") or []
    hq_verdicts = pipeline_result.get("stage_3c_hq_verdicts") or []

    action_real_count = sum(1 for v in depth_layers if v.get("query_reference"))
    web_real_count = sum(
        len(v.get("all_citations") or [])
        for v in eb_verdicts
        if v.get("source_note") == "real_citation_backed"
    )
    hq_real_count = sum(
        1 for v in hq_verdicts
        if (v.get("provenance_detail") or {}).get("type") == "real_hq_source"
    )
    real_stream_count = sum(1 for count in (action_real_count, web_real_count, hq_real_count) if count > 0)
    real_ratio = real_stream_count / 3

    try:
        raw_confidence = float(overall_confidence)
    except (TypeError, ValueError):
        raw_confidence = 0.0
    confidence_value = raw_confidence * (0.6 + 0.4 * real_ratio)
    confidence_value = round(max(0.0, min(confidence_value, 1.0)), 2)

    return {
        "evidence_source": "digital_brain_pipeline",
        "total_conversations": action_real_count + web_real_count + hq_real_count,
        "sources": [
            {
                "platform": "Action Data",
                "threads_or_posts": action_real_count,
                "source_type": "Real" if action_real_count else "Estimated",
            },
            {
                "platform": "Web Evidence",
                "threads_or_posts": web_real_count,
                "source_type": "Real" if web_real_count else "Estimated",
            },
            {
                "platform": "HQ Research",
                "threads_or_posts": hq_real_count,
                "source_type": "Real" if hq_real_count else "Estimated",
            },
        ],
        "confidence_calculation_detail": {
            "level": "High" if confidence_value >= 0.75 else "Medium" if confidence_value >= 0.55 else "Low",
            "value": confidence_value,
            "weighted_total": confidence_value,
        },
        "timeframe": {
            "months_analyzed": None,
            "recent_activity": {"months": None, "percentage": None},
        },
        "verdict_counts": {
            "action_data": len(depth_layers),
            "web_evidence": len(eb_verdicts),
            "hq_research": len(hq_verdicts),
        },
        "real_stream_count": real_stream_count,
    }


def _digital_brain_reference_sites(pipeline_result: dict) -> list[dict]:
    refs: list[dict] = []
    seen: set[str] = set()
    for verdict in pipeline_result.get("stage_3b_eb_verdicts") or []:
        platform = verdict.get("source_platform") or "Web Evidence"
        for url in verdict.get("source_urls") or []:
            if not url or url in seen:
                continue
            seen.add(url)
            refs.append({
                "site": platform,
                "url": url,
                "usage_context": "Evidence-based web citation used by the Digital Brain pipeline.",
            })
    for verdict in pipeline_result.get("stage_3c_hq_verdicts") or []:
        provenance = verdict.get("provenance_detail") or {}
        url = provenance.get("source_url")
        if not url or url in seen:
            continue
        seen.add(url)
        refs.append({
            "site": verdict.get("study_reference") or "HQ Research",
            "url": url,
            "usage_context": "HQ source used by the Digital Brain pipeline.",
        })
    return refs


def _build_web_evidence_by_platform(pipeline_result: dict) -> list[dict]:
    """Build a grouped evidence structure for the UI's 'All Sources Used' view.

    Groups web scrape citations by platform (with quote previews) and appends
    HQ research sources as a dedicated group.  Stored in persona_details so
    the frontend can render per-article accordion rows without re-parsing the
    raw stage_3b/3c verdict arrays.

    Each platform group shape:
        {
          "platform": str,
          "total_posts": int,
          "themes": [str, ...],
          "sentiment": {"positive": float, "neutral": float, "negative": float},
          "source_note": str,        # "real_citation_backed" | "estimated"
          "is_hq": false,
          "citations": [
            {"url": str, "quote": str, "confidence": float},
            ...                      # capped at 15 per platform
          ]
        }

    HQ research group shape:
        {
          "platform": "HQ Research Sources",
          "total_posts": int,        # real HQ verdicts count
          "is_hq": true,
          "citations": [
            {
              "url": str,
              "title": str,          # study_reference text
              "quote": str,          # finding_summary excerpt
              "confidence": float,
              "authority_tier": str,
              "domain": str
            },
            ...
          ]
        }
    """
    _MAX_CITATIONS_PER_PLATFORM = 15

    groups: list[dict] = []

    for verdict in pipeline_result.get("stage_3b_eb_verdicts") or []:
        platform = verdict.get("source_platform") or "Web Evidence"
        raw_citations = verdict.get("all_citations") or []
        deduplicated: list[dict] = []
        seen_urls: set[str] = set()
        for c in raw_citations:
            url = c.get("url") or ""
            if url and url not in seen_urls:
                seen_urls.add(url)
                deduplicated.append({
                    "url": url,
                    "quote": (c.get("quote") or "")[:300],
                    "confidence": round(float(c.get("confidence") or 0), 3),
                })
        groups.append({
            "platform": platform,
            "total_posts": verdict.get("threads_analyzed") or len(deduplicated),
            "themes": verdict.get("key_discussion_themes") or [],
            "sentiment": verdict.get("sentiment_distribution") or {},
            "source_note": verdict.get("source_note") or "estimated",
            "is_hq": False,
            "citations": deduplicated[:_MAX_CITATIONS_PER_PLATFORM],
        })

    hq_citations: list[dict] = []
    for verdict in pipeline_result.get("stage_3c_hq_verdicts") or []:
        provenance = verdict.get("provenance_detail") or {}
        if provenance.get("type") not in ("real_hq_source",):
            continue
        hq_citations.append({
            "url": provenance.get("source_url") or "",
            "title": verdict.get("study_reference") or "Research Source",
            "quote": (verdict.get("finding_summary") or "")[:300],
            "confidence": round(float(verdict.get("confidence_score") or 0), 3),
            "authority_tier": provenance.get("authority_tier") or "",
            "domain": provenance.get("domain") or "",
        })

    if hq_citations:
        groups.append({
            "platform": "HQ Research Sources",
            "total_posts": len(hq_citations),
            "themes": [],
            "sentiment": {},
            "source_note": "real_citation_backed",
            "is_hq": True,
            "citations": hq_citations,
        })

    return groups


def _persona_kwargs_from_digital_brain(
    persona: dict,
    workspace_id: str,
    exploration_id: str,
    created_by: str,
    geography: str | None = None,
    pipeline_result: dict | None = None,
    validated_ro: dict | None = None,
) -> dict:
    """Map one stage_5_personas entry onto Persona's required columns.
    age_range/gender/education_level/occupation/income_range are inferred
    from action data by generate_persona() (digital_brain_pipeline.py's
    _flatten_demographics_inference) and always non-null; "Not specified"
    is only a defensive fallback if a field is somehow missing."""
    layer1 = persona.get("layer_1_framework") or {}
    layer2 = persona.get("layer_2_behavioral_dna") or {}
    evidence = persona.get("evidence_traceability") or {}

    overall_confidence = evidence.get("overall_confidence")
    evidence_snapshot = (
        _digital_brain_evidence_snapshot(pipeline_result, overall_confidence)
        if pipeline_result else None
    )
    snapshot_confidence = (
        evidence_snapshot.get("confidence_calculation_detail", {}).get("value")
        if isinstance(evidence_snapshot, dict)
        else None
    )
    calibration_confidence = (
        int(round(snapshot_confidence * 100))
        if isinstance(snapshot_confidence, (int, float))
        else int(round(overall_confidence * 100))
        if isinstance(overall_confidence, (int, float))
        else None
    )

    name = persona.get("persona_title") or persona.get("persona_archetype") or "Untitled Persona"
    contradiction = persona.get("layer_6_contradiction") or {}
    backstory = contradiction.get("example")

    # Frontend reads consumer_personas[i].name / .backstory / .geography directly
    # from persona_details (not the saved DB columns), so mirror them in here too.
    persona_details = {
        **persona,
        "name": name,
        "backstory": backstory,
        "geography": geography,
    }
    if pipeline_result and evidence_snapshot:
        persona_details["evidence_snapshot"] = evidence_snapshot
        persona_details["reference_sites_with_usage"] = _digital_brain_reference_sites(pipeline_result)
        persona_details["web_evidence_by_platform"] = _build_web_evidence_by_platform(pipeline_result)
    if validated_ro:
        # The structured 12-component RO from Stage 1, persisted so interview.py
        # can ground qualitative responses in the full RO, not just the
        # free-text description.
        persona_details["research_objective"] = validated_ro
    if pipeline_result:
        # Stage 3A/B/C verdicts are gathered once and shared across the whole
        # batch of personas (unlike the manual-persona flow, where evidence is
        # collected per persona) — interview.py reads this same "evidence" key
        # regardless of flow, so attach the shared pool here too.
        persona_details["evidence"] = {
            "action_data": pipeline_result.get("stage_3a_depth_layers") or [],
            "web_evidence": pipeline_result.get("stage_3b_eb_verdicts") or [],
            "hq_research": pipeline_result.get("stage_3c_hq_verdicts") or [],
        }
    if contradiction:
        # Normalized to the same "say_do_gap" shape used by the manual-persona
        # flow so interview.py reads one consistent key regardless of which flow
        # generated the persona. layer_6_contradiction uses says/does/why/example
        # rather than the canonical names. Field aliases (stated_value,
        # actual_behavior, hidden_driver) are included so the simulation engine
        # can reference either naming convention without branching.
        _says = contradiction.get("says")
        _does = contradiction.get("does")
        _why = contradiction.get("why")
        persona_details["say_do_gap"] = {
            "claim": _says,
            "stated_value": _says,
            "evidence_based_observation": _does,
            "actual_behavior": _does,
            "reasoning": _why,
            "hidden_driver": _why,
        }

    return dict(
        exploration_id=exploration_id,
        workspace_id=workspace_id,
        name=name,
        age_range=persona.get("age_range") or "Not specified",
        gender=persona.get("gender") or "Not specified",
        location_country="Not specified",
        education_level=persona.get("education_level") or "Not specified",
        occupation=persona.get("occupation") or "Not specified",
        income_range=persona.get("income_range") or "Not specified",
        geography=geography,
        personality=layer2.get("decision_making_style"),
        values=(persona.get("layer_7_aspiration_fear") or {}).get("identity_driver"),
        motivations=(persona.get("layer_7_aspiration_fear") or {}).get("hoped_for_self"),
        brand_sensitivity=layer2.get("brand_relationship"),
        price_sensitivity=layer2.get("risk_tolerance"),
        backstory=backstory,
        ocean_profile=layer1.get("ocean"),
        persona_details=persona_details,
        created_by=created_by,
        auto_generated_persona=True,
        calibration_confidence=calibration_confidence,
        calibration_status="calibrated",
    )


@router.post("/generate/digital-brain", response_model=SuccessResponse)
@limiter.limit("10/hour")
async def generate_personas_digital_brain(
    request: Request,
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """Run the 5-stage Digital Brain Pipeline for this exploration's research
    objective and persist the resulting personas."""
    exp = await exploration_service.get_exploration(session, exploration_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Exploration not found")

    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m["user_id"] == current_user.id for m in members):
        raise HTTPException(status_code=403, detail="Not authorized")

    ro_result = await session.execute(
        select(ResearchObjectives).where(ResearchObjectives.exploration_id == exploration_id)
    )
    ro = ro_result.scalars().first()
    if not ro:
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(status="error", message="Research objective not found for this exploration").dict(),
        )

    account_tier = _normalised_account_tier(current_user)

    try:
        ro_dict = await extract_ro_components_for_pipeline(ro.description, ro.ai_interpretation or {})
    except Exception as e:
        logger.error("Digital Brain RO extraction failed for exploration=%s: %s", exploration_id, e)
        raise HTTPException(
            status_code=502,
            detail=ErrorResponse(status="error", message=f"Failed to interpret research objective: {e}").dict(),
        )

    # action_data_df left as None on purpose — digital_brain_pipeline() now
    # fetches it internally via fetch_action_data_all() (real payload-flattened
    # rows from the whole sync_action.record table). The old get_action_data_df()
    # path here never unwrapped the JSONB envelope's "payload" key, so
    # scan_action_data() silently found nothing; passing a DataFrame here would
    # also short-circuit fetch_action_data_all() entirely (it only runs when
    # action_data_df is None).
    try:
        result = await run_in_threadpool(digital_brain_pipeline, ro_dict, None, account_tier)
    except Exception as e:
        logger.error("Digital Brain Pipeline failed for exploration=%s: %s", exploration_id, e)
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(status="error", message=f"Digital Brain Pipeline failed: {e}").dict(),
        )

    stage_5_personas = result.get("stage_5_personas", [])
    saved_personas = []
    for persona_data in stage_5_personas:
        kwargs = _persona_kwargs_from_digital_brain(
            persona_data, workspace_id, exploration_id, current_user.id,
            geography=ro_dict.get("geography"),
            pipeline_result=result,
            validated_ro=ro_dict,
        )
        saved_personas.append(Persona(**kwargs))

    for p in saved_personas:
        session.add(p)
    await session.commit()
    for p in saved_personas:
        await session.refresh(p)

    # Enrich KE sources in background — runs after response is sent.
    # ro.description is the verbatim research objective text, which gives
    # better semantic search recall than joining ro_dict structured components.
    for p in saved_personas:
        asyncio.create_task(
            enrich_persona_ke_sources(
                persona_id=p.id,
                research_objective=ro.description or "",
                persona_name=p.name or "",
                exploration_id=exploration_id,
            )
        )

    return SuccessResponse(
        message="Digital Brain personas generated",
        data={
            "persona_ids": [p.id for p in saved_personas],
            "personas": [
                {"id": p.id, "name": p.name, "persona_details": p.persona_details}
                for p in saved_personas
            ],
            "pipeline_metadata": result.get("pipeline_metadata"),
        },
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


# Legacy one-shot GPT-5 + web-search endpoint — disabled in favour of the
# two-phase draft/calibrate flow (POST /manual + POST /{id}/calibrate).
# Kept for reference; do not delete until confirmed unreachable in all envs.
@router.post("/", response_model=SuccessResponse, status_code=status.HTTP_410_GONE, include_in_schema=False)
async def create_persona(
    workspace_id: str,
    exploration_id: str,
    payload: dict,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=ErrorResponse(
            status="error",
            message="This endpoint has been replaced. Use POST /manual to create a draft, then POST /{persona_id}/calibrate to enrich it.",
        ).dict(),
    )
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

    # Guard: manual persona creation also requires an RO
    try:
        await require_ro_exists(session, exploration_id)
    except WorkflowError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(status="error", message=e.message).dict()
        )

    exp_workspace_id = exp.workspace_id
    if str(exp_workspace_id) != str(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Exploration is not part of the provided workspace").dict()
        )

    if not _is_enterprise_user(current_user):
        raise _manual_personas_not_allowed_response()

    persona_limit = _persona_limit_for(current_user, exp)
    total_count, _ = await _count_primary_personas(session, workspace_id, exploration_id)
    if total_count >= persona_limit:
        raise _persona_limit_response(persona_limit)

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
    # New persona inputs make any existing qualitative outputs stale.
    await interview_service.clear_qualitative_outputs(workspace_id, exploration_id)
    await report_cache.invalidate_cache(exploration_id)
    
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
    if not any(m["user_id"] == current_user.id for m in members):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="You are not a member of this workspace").dict()
        )

    personas = await persona_service.list_personas(workspace_id, exploration_id)
    return SuccessResponse(message="Personas fetched successfully", data=personas)


@router.get("/quota", response_model=SuccessResponse)
async def get_persona_quota(
    workspace_id: str,
    exploration_id: str,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    exp = await exploration_service.get_exploration(session, exploration_id)
    if not exp or str(exp.workspace_id) != str(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Exploration not found").dict(),
        )

    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m["user_id"] == current_user.id for m in members):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="You are not a member of this workspace").dict(),
        )

    quota = await _build_persona_quota(session, current_user, workspace_id, exploration_id, exp)
    return SuccessResponse(message="Persona quota fetched successfully", data=quota)


@router.post("/purchase", response_model=SuccessResponse)
async def purchase_additional_personas(
    workspace_id: str,
    exploration_id: str,
    payload: PersonaPurchaseRequest,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    if not _additional_personas_supported(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(
                status="error",
                message="Additional personas are available on Explorer and Enterprise plans.",
            ).dict(),
        )

    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="Only workspace admins can add personas").dict(),
        )

    exp = await exploration_service.get_exploration(session, exploration_id)
    if not exp or str(exp.workspace_id) != str(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Exploration not found").dict(),
        )

    exp.additional_persona_limit = int(getattr(exp, "additional_persona_limit", 0) or 0) + payload.count
    session.add(exp)
    await session.commit()
    await session.refresh(exp)

    quota = await _build_persona_quota(session, current_user, workspace_id, exploration_id, exp)
    tier = _normalised_account_tier(current_user)
    unit_amount_cents = 19900 if tier == "enterprise" else 4900
    return SuccessResponse(
        message="Additional persona credits added successfully",
        data={
            **quota,
            "purchased_count": payload.count,
            "unit_amount_cents": unit_amount_cents,
            "total_amount_cents": unit_amount_cents * payload.count,
            "currency": "USD",
            "payment_provider_connected": False,
            "checkout_available": False,
        },
    )


@router.post("/validate", response_model=SuccessResponse)
async def validate_persona_plausibility(
    workspace_id: str,
    exploration_id: str,
    payload: ManualPersonaCreate,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Soft plausibility check for manual persona traits.
    Returns a list of warnings — never blocks creation.
    Call this before or after POST /manual to show a warning modal.
    """
    exp = await exploration_service.get_exploration(session, exploration_id)
    if not exp or str(exp.workspace_id) != str(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Exploration not found").dict(),
        )

    if not _is_enterprise_user(current_user):
        raise _manual_personas_not_allowed_response()

    persona_limit = _persona_limit_for(current_user, exp)
    total_count, _ = await _count_primary_personas(session, workspace_id, exploration_id)
    if total_count >= persona_limit:
        raise _persona_limit_response(persona_limit)

    warnings = evaluate_from_schema(payload)
    return SuccessResponse(
        message="Plausibility check complete",
        data={
            "warnings": warnings,
            "has_warnings": bool(warnings),
            # Always True — warnings are advisory, not blocking
            "can_proceed": True,
        },
    )


@router.post("/manual", response_model=SuccessResponse, status_code=status.HTTP_201_CREATED)
async def create_manual_persona_draft(
    workspace_id: str,
    exploration_id: str,
    payload: ManualPersonaCreate,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Phase 1 of manual persona flow: store structured trait input as a draft.
    No AI is called here. The frontend should follow up with POST /{id}/calibrate.
    Plausibility warnings are computed and stored with the draft — they never
    block creation and are surfaced in the response so the frontend can show
    a review modal before the user proceeds to calibration.
    """
    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="Only workspace admins can create personas").dict()
        )

    exp = await get_exploration(session, exploration_id)
    if not exp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Exploration not found").dict()
        )

    if str(exp.workspace_id) != str(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Exploration is not part of the provided workspace").dict()
        )

    try:
        await require_ro_exists(session, exploration_id)
    except WorkflowError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(status="error", message=e.message).dict()
        )

    missing_demographics = persona_service.missing_manual_demographic_fields(payload)
    if missing_demographics:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=persona_service.manual_demographic_validation_error(missing_demographics),
        )

    # Run plausibility checks before saving — zero DB cost, never blocks
    warnings = evaluate_from_schema(payload)

    # Manual persona creation is now open to every tier — the Digital Brain
    # service enforces tier-specific limits itself (free=2, tier1=8, enterprise=8).
    result = await create_manual_persona_draft_with_brains(
        exploration_id, workspace_id, current_user.id,
        account_tier=current_user.account_tier or "free",
        payload=payload,
    )
    if result.get("status") == "error":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(status="error", message=result.get("error_message", "Failed to create persona draft")).dict(),
        )
    draft = result["persona"]

    # Draft traits are persona inputs; clear downstream generated qualitative data.
    await interview_service.clear_qualitative_outputs(workspace_id, exploration_id)
    await report_cache.invalidate_cache(exploration_id)
    return SuccessResponse(
        message="Persona draft created",
        data={
            **draft,
            # Surface warnings inline so the frontend can show a review nudge
            # without a second API call. Empty list = no issues found.
            "validation_warnings": warnings,
            "has_plausibility_warnings": bool(warnings),
        },
    )


@router.get("/export-json")
async def export_personas_json(
    workspace_id: str,
    exploration_id: str,
    persona_ids: Optional[List[str]] = Query(default=None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    """Export personas in this exploration as a downloadable JSON file, keyed by
    research_objective_id. Personas are already fully persisted
    (persona.persona_details) by the generation flows, so this only reads and
    reshapes existing data — nothing is regenerated.

    Pass ?persona_ids=id1&persona_ids=id2 to export only selected personas;
    omit it to export every persona in the exploration (bulk export)."""
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m["user_id"] == current_user.id for m in members):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="Not a member of this workspace").dict()
        )

    ro_result = await session.execute(
        select(ResearchObjectives).where(ResearchObjectives.exploration_id == exploration_id)
    )
    ro = ro_result.scalars().first()
    if not ro:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Research objective not found for this exploration").dict()
        )

    personas = await persona_service.list_personas(workspace_id, exploration_id)

    if persona_ids:
        wanted = set(persona_ids)
        personas = [p for p in personas if p["id"] in wanted]
        if not personas:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse(status="error", message="No matching personas found").dict()
            )

    import json as _json
    from datetime import datetime as _dt

    def _serialise(obj):
        if isinstance(obj, _dt):
            return obj.isoformat()
        raise TypeError(f"Not serialisable: {type(obj)}")

    payload = {
        "research_objective_id": ro.id,
        "personas": personas,
    }
    content = _json.dumps(payload, default=_serialise, ensure_ascii=False, indent=2)

    suffix = "selected" if persona_ids else "all"
    filename = f"research_objective_{ro.id[:8]}_personas_{suffix}.json"

    return JSONResponse(
        content=_json.loads(content),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{persona_id}", response_model=SuccessResponse)
async def get_persona(
    workspace_id: str,
    exploration_id: str,
    persona_id: str,
    current_user: User = Depends(get_current_active_user),
):
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m["user_id"] == current_user.id for m in members):
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
    # Persona edits change qualitative inputs; clear generated guide/interviews/reports.
    await interview_service.clear_qualitative_outputs(workspace_id, exploration_id)
    await report_cache.invalidate_cache(exploration_id)
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

    # Removing a persona changes qualitative inputs. Clear dependent qualitative
    # rows first so persona deletion does not fail on interview.persona_id FKs.
    await interview_service.clear_qualitative_outputs(workspace_id, exploration_id)
    await persona_service.delete_persona(persona_id)
    await report_cache.invalidate_cache(exploration_id)
    return DeleteResponse(message="Persona deleted successfully")


@router.post("/bulk-download")
async def bulk_download_personas(
    workspace_id: str,
    exploration_id: str,
    payload: PersonaBulkDownloadRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Return a ZIP archive containing one JSON file per selected persona."""
    import zipfile, io
    from datetime import datetime as _dt
    from fastapi.responses import StreamingResponse

    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m["user_id"] == current_user.id for m in members):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="Not a member of this workspace").dict()
        )

    buf = io.BytesIO()
    found = 0
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for pid in payload.persona_ids:
            p = await persona_service.get_persona(pid)
            # silently skip personas that don't belong to this exploration
            if not p or str(p["exploration_id"]) != str(exploration_id):
                continue
            safe_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in (p.get("name") or pid))
            import json as _json
            def _serial(obj):
                if isinstance(obj, _dt):
                    return obj.isoformat()
                raise TypeError
            zf.writestr(f"{safe_name}.json", _json.dumps(p, default=_serial, ensure_ascii=False, indent=2))
            found += 1

    if found == 0:
        raise HTTPException(status_code=404, detail=ErrorResponse(status="error", message="No matching personas found").dict())

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="personas_{exploration_id[:8]}.zip"'},
    )


@router.post("/{persona_id}/replicate", response_model=SuccessResponse)
async def replicate_persona(
    workspace_id: str,
    exploration_id: str,
    persona_id: str,
    payload: PersonaReplicateRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Generate a country-localised copy of an existing persona."""
    started_at = time.perf_counter()
    logger.info(
        "replicate_persona:start workspace=%s exploration=%s persona=%s user=%s target=%r mode=%s seed=%s",
        workspace_id,
        exploration_id,
        persona_id,
        current_user.id,
        payload.target_country,
        payload.mode,
        bool(payload.seed_inputs),
    )
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m["user_id"] == current_user.id for m in members):
        logger.warning(
            "replicate_persona:forbidden workspace=%s user=%s elapsed_ms=%d",
            workspace_id,
            current_user.id,
            int((time.perf_counter() - started_at) * 1000),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="Not a member of this workspace").dict()
        )

    source = await persona_service.get_persona(persona_id)
    if not source or str(source["exploration_id"]) != str(exploration_id):
        logger.warning(
            "replicate_persona:not_found workspace=%s exploration=%s persona=%s elapsed_ms=%d",
            workspace_id,
            exploration_id,
            persona_id,
            int((time.perf_counter() - started_at) * 1000),
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Persona not found").dict()
        )

    if payload.mode == "anchor_preview":
        try:
            preview = await persona_service.preview_replication_anchor(
                source_persona_id=persona_id,
                target_country=payload.target_country,
                exploration_id=exploration_id,
                workspace_id=workspace_id,
                seed_inputs=payload.seed_inputs,
            )
        except ValueError as e:
            logger.warning(
                "replicate_persona:anchor_preview_bad_request persona=%s target=%r elapsed_ms=%d error=%s",
                persona_id,
                payload.target_country,
                int((time.perf_counter() - started_at) * 1000),
                e,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse(status="error", message=str(e)).dict()
            )

        logger.info(
            "replicate_persona:anchor_preview_success source=%s target=%r elapsed_ms=%d",
            persona_id,
            payload.target_country,
            int((time.perf_counter() - started_at) * 1000),
        )
        return SuccessResponse(
            message="Anchor-only preview generated successfully",
            data=preview,
        )

    try:
        new_persona = await persona_service.replicate_persona(
            source_persona_id=persona_id,
            target_country=payload.target_country,
            exploration_id=exploration_id,
            workspace_id=workspace_id,
            current_user_id=current_user.id,
            mode=payload.mode,
            seed_inputs=payload.seed_inputs,
        )
    except ValueError as e:
        logger.warning(
            "replicate_persona:bad_request persona=%s target=%r mode=%s elapsed_ms=%d error=%s",
            persona_id,
            payload.target_country,
            payload.mode,
            int((time.perf_counter() - started_at) * 1000),
            e,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(status="error", message=str(e)).dict()
        )
    except Exception as e:
        error_id = str(uuid.uuid4())
        logger.exception(
            "replicate_persona:failed error_id=%s persona=%s target=%r mode=%s elapsed_ms=%d error_type=%s error=%s",
            error_id,
            persona_id,
            payload.target_country,
            payload.mode,
            int((time.perf_counter() - started_at) * 1000),
            type(e).__name__,
            str(e)[:500],
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                status="error",
                message=f"Replication failed. Error ID: {error_id}",
            ).dict(),
        ) from e

    mode_label = (
        "full replication"
        if payload.mode == "full_replication"
        else "deep psychographic"
        if payload.mode == "deep_psychographic"
        else "fast"
    )
    logger.info(
        "replicate_persona:success source=%s new=%s target=%r mode=%s elapsed_ms=%d",
        persona_id,
        new_persona.get("id"),
        payload.target_country,
        payload.mode,
        int((time.perf_counter() - started_at) * 1000),
    )
    return SuccessResponse(
        message=f"Persona replicated successfully ({mode_label})",
        data=new_persona,
    )


@router.post("/{persona_id}/calibrate", response_model=SuccessResponse)
async def calibrate_persona(
    workspace_id: str,
    exploration_id: str,
    persona_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """
    Phase 2 of manual persona flow: enrich draft with AI behavioral depth.
    Uses stored raw_traits from the draft; updates the persona in-place.
    Idempotent — calling on an already-calibrated persona returns it unchanged.
    """
    if not await ws_service.is_workspace_admin(workspace_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="Only workspace admins can calibrate personas").dict()
        )

    existing = await persona_service.get_persona(persona_id)
    if not existing or str(existing["exploration_id"]) != str(exploration_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Persona not found").dict()
        )

    try:
        result = await calibrate_manual_persona_with_brains(persona_id, exploration_id)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"status": "error", "message": str(e), "type": e.__class__.__name__}
        )

    if result.get("status") == "error":
        error_message = result.get("error_message", "Failed to calibrate persona")
        not_found = "not found" in error_message.lower()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND if not_found else status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(status="error", message=error_message).dict()
        )

    calibrated = result["persona"]

    if existing.get("calibration_status") != "calibrated":
        # Calibration changes persona content; generated qualitative outputs must be rebuilt.
        await interview_service.clear_qualitative_outputs(workspace_id, exploration_id)
        await report_cache.invalidate_cache(exploration_id)

    return SuccessResponse(message="Persona calibrated successfully", data=calibrated)


@router.get("/{persona_id}/preview", response_model=SuccessResponse)
async def preview_persona(
    workspace_id: str,
    exploration_id: str,
    persona_id: str,
    current_user: User = Depends(get_current_active_user),
    session: AsyncSession = Depends(get_session),
):
    started_at = time.perf_counter()
    logger.info(
        "preview_persona:start workspace=%s exploration=%s persona=%s user=%s",
        workspace_id,
        exploration_id,
        persona_id,
        current_user.id,
    )
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m["user_id"] == current_user.id for m in members):
        logger.warning(
            "preview_persona:forbidden workspace=%s user=%s elapsed_ms=%d",
            workspace_id,
            current_user.id,
            int((time.perf_counter() - started_at) * 1000),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="You are not a member of this workspace").dict()
        )

    p = await persona_service.get_persona(persona_id)
    if not p or str(p["exploration_id"]) != str(exploration_id):
        logger.warning(
            "preview_persona:not_found workspace=%s exploration=%s persona=%s elapsed_ms=%d",
            workspace_id,
            exploration_id,
            persona_id,
            int((time.perf_counter() - started_at) * 1000),
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Persona not found for this research objective").dict()
        )

    # Build full_persona_info:
    # - flat columns from persona_to_dict (p) provide base demographic/psychographic data
    # - persona_details (enriched LLM output) overlay on top so calibrated fields win
    # This ensures BOTH draft personas (flat columns only) AND calibrated personas
    # (persona_details enriched) display correctly in the preview.
    persona_details = p.get("persona_details") or {}
    flat_fields = {
        k: v for k, v in p.items()
        if k != "persona_details"
        and v is not None and v != "" and v != [] and v != {}
    }
    # calibration_breakdown is always freshly computed by persona_to_dict (never
    # persisted on persona_details), so it must come from flat_fields; persona_details
    # still wins if it ever does carry its own copy, via normal dict-merge precedence.
    full_persona_info = {**flat_fields, **persona_details}

    confidence = full_persona_info.get("confidence_scoring", "") or p.get("confidence_scoring", "")
    confidence_source = "embedded" if confidence else ""
    if not confidence:
        confidence = _preview_confidence_from_evidence_snapshot(full_persona_info)
        if confidence:
            confidence_source = "evidence_snapshot"
    if not confidence:
        confidence = _preview_confidence_from_stored_score(p)
        if confidence:
            confidence_source = "stored"

    if not confidence:
        confidence_started_at = time.perf_counter()
        logger.info("preview_persona:confidence_llm_start persona=%s", persona_id)
        confidence = await persona_service.generate_persona_confidence(p)
        confidence_source = "llm"
        logger.info(
            "preview_persona:confidence_llm_done persona=%s elapsed_ms=%d",
            persona_id,
            int((time.perf_counter() - confidence_started_at) * 1000),
        )
    logger.info(
        "preview_persona:confidence_resolved persona=%s source=%s score=%s elapsed_ms=%d",
        persona_id,
        confidence_source,
        confidence.get("score") if isinstance(confidence, dict) else None,
        int((time.perf_counter() - started_at) * 1000),
    )

    ocean_profile = p.get("ocean_profile")
    if not ocean_profile:
        try:
            ocean_started_at = time.perf_counter()
            logger.info("preview_persona:ocean_llm_start persona=%s", persona_id)
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
                logger.info(
                    "preview_persona:ocean_llm_done persona=%s elapsed_ms=%d",
                    persona_id,
                    int((time.perf_counter() - ocean_started_at) * 1000),
                )
        except Exception as e:
            logger.exception(
                "preview_persona:ocean_failed persona=%s elapsed_ms=%d",
                persona_id,
                int((time.perf_counter() - started_at) * 1000),
            )
            ocean_profile = None

    preview = persona_service.persona_preview_from_dict(p, full_persona_info, confidence=confidence)

    cached_patterns = full_persona_info.get("predominant_patterns")
    if cached_patterns and cached_patterns.get("patterns"):
        preview["predominant_patterns"] = cached_patterns
        logger.info(
            "preview_persona:patterns_cached persona=%s score=%d count=%d",
            persona_id,
            cached_patterns.get("score", 0),
            len(cached_patterns.get("patterns", [])),
        )
    else:
        try:
            patterns_started_at = time.perf_counter()
            patterns_result = await persona_service.generate_predominant_patterns(full_persona_info)
            preview["predominant_patterns"] = patterns_result
            logger.info(
                "preview_persona:patterns_done persona=%s score=%d count=%d elapsed_ms=%d",
                persona_id,
                patterns_result.get("score", 0),
                len(patterns_result.get("patterns", [])),
                int((time.perf_counter() - patterns_started_at) * 1000),
            )
        except Exception:
            logger.exception("preview_persona:patterns_failed persona=%s", persona_id)
            preview["predominant_patterns"] = {"metric": "RO Alignment", "score": 0, "patterns": []}

    logger.info(
        "preview_persona:success persona=%s total_elapsed_ms=%d",
        persona_id,
        int((time.perf_counter() - started_at) * 1000),
    )
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


@router.get("/{persona_id}/download")
async def download_persona(
    workspace_id: str,
    exploration_id: str,
    persona_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Return full persona data as a downloadable JSON file."""
    members = await ws_service.list_workspace_members(workspace_id)
    if not any(m["user_id"] == current_user.id for m in members):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(status="error", message="You are not a member of this workspace").dict()
        )

    p = await persona_service.get_persona(persona_id)
    if not p or str(p["exploration_id"]) != str(exploration_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(status="error", message="Persona not found").dict()
        )

    safe_name = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in (p.get("name") or "persona"))
    filename = f"persona_{safe_name}.json"

    import json as _json
    from datetime import datetime

    def _serialise(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        raise TypeError(f"Not serialisable: {type(obj)}")

    content = _json.dumps(p, default=_serialise, ensure_ascii=False, indent=2)

    return JSONResponse(
        content=_json.loads(content),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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

    # Backstory is persona input; clear generated qualitative outputs tied to it.
    await interview_service.clear_qualitative_outputs(persona.workspace_id, persona.exploration_id)
    await report_cache.invalidate_cache(persona.exploration_id)

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


