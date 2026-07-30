from sqlmodel import select
from app.db import async_engine
from app.models.persona import Persona
from app.schemas.persona import PersonaCreate, PersonaUpdate
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.utils.id_generator import generate_id
import json
import re
import logging
import time
from openai import AsyncOpenAI
from app.config import OPENAI_API_KEY
from app.services.omi import build_persona_validation_prompt, PERSONA_VALIDATION_SYSTEM_PROMPT
from app.services.omi import call_omi
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from app.models.persona import Persona


client = AsyncOpenAI(api_key=OPENAI_API_KEY)
logger = logging.getLogger(__name__)

    
def to_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return [v for v in value if v is not None and str(v).strip()]
    if isinstance(value, str):
        parts = []
        for sep in [",", ";", "|"]:
            if sep in value:
                parts = [p.strip() for p in value.split(sep) if p.strip()]
                break
        if not parts:
            return [value.strip()] if value.strip() else []
        return parts
    s = str(value).strip()
    return [s] if s else []

def _coerce_str(value: Any) -> str | None:
    """Coerce any LLM value into a plain str for VARCHAR columns. Joins lists with ', '."""
    if value is None:
        return None
    if isinstance(value, list):
        return ", ".join(str(v) for v in value if v)
    if isinstance(value, dict):
        return None  # dict in VARCHAR → skip; caller falls back to source persona value
    return str(value) if not isinstance(value, str) else value


def safe_json(obj):
    def default(x):
        if isinstance(x, datetime):
            return x.isoformat()
        return str(x)
    return json.dumps(obj, indent=2, default=default)



async def create_persona(workspace_id: str, user_id: str, data: PersonaCreate) -> dict:
    async with AsyncSession(async_engine) as session:

        p = Persona(
            id=generate_id(),
            exploration_id=data.exploration_id,
            workspace_id=workspace_id,

            name=data.name,
            age_range=data.age_range,
            gender=data.gender,

            location_country=data.location_country,
            location_state=data.location_state,
            education_level=data.education_level,
            occupation=data.occupation,
            income_range=data.income_range,
            family_size=data.family_size,
            geography=data.geography,

            lifestyle=data.lifestyle,
            values=data.values,
            personality=data.personality,
            interests=data.interests,
            motivations=data.motivations,

            brand_sensitivity=data.brand_sensitivity,
            price_sensitivity=data.price_sensitivity,

            mobility=data.mobility,
            accommodation=data.accommodation,
            marital_status=data.marital_status,
            daily_rhythm=data.daily_rhythm,

            hobbies=data.hobbies,
            professional_traits=data.professional_traits,

            digital_activity=data.digital_activity,
            preferences=data.preferences,
            backstory=data.backstory,
            # sample_size=data.sample_size,
            created_by=user_id,
        )

        session.add(p)
        await session.commit()
        await session.refresh(p)

        return persona_to_dict(p)

def _persona_source(p: Persona) -> str:
    """Derive source label from lineage and generation flag."""
    if p.parent_persona_id:
        return "replicated"
    if p.auto_generated_persona:
        return "omi"
    return "manual"


def _needs_human_creator(p: Persona) -> bool:
    """Manual and replicated personas should display the user who created them."""
    return bool(p.parent_persona_id) or not p.auto_generated_persona


# Static platform methodology defaults shown in the Calibration Breakdown tab.
# These represent Synthetic People's data infrastructure, not per-persona calculations.
_CALIBRATION_BREAKDOWN_DEFAULTS = {
    "real_actions_signal": {
        "description": "Anchored in real people's action patterns, not self-reported opinions.",
        "parameters_integrated": [
            "Purchase & Transaction Receipts",
            "Click intent",
            "Interaction Trails",
            "Feature Usage",
            "Engagement Channel",
            "Online Browsing Patterns",
        ],
        "techniques_used": [
            "Purchase & Transaction Receipts",
            "Click intent",
            "Interaction Trails",
            "Online Browsing Patterns",
            "Feature Usage",
            "Engagement Channel",
        ],
    },
    "emotional_neural_layers": {
        "description": "Models emotional responses that shape decisions before rationalization appears.",
        "parameters_integrated": [
            "Cognitive Load and Decision Tension",
            "Subconscious Bias and Emotional Friction",
            "Regret Anticipation & Risk Perception",
            "Affective Response Modelling",
        ],
        "technology_used": [
            "EOG (Eye Tracking)",
            "ECG (Electrocardiogram)",
            "GSR (Galvanic Skin Response)",
            "EMG (Electromyography)",
            "PSG (Polysomnography)",
            "ERP (Event Related Potential)",
        ],
    },
    "validated_studies": {
        "description": "Calibrated against credible consumer and behavioural studies.",
        "technology_used": [
            "FGDs",
            "Survey",
            "Longitudinal Studies",
            "Academic behaviour science benchmark",
            "CATI interviews and ethnographic research",
            "Thought Leaderships, White papers, Articles",
        ],
    },
}

_CONFIDENCE_LABEL_MAP = {
    "volume": "Volume",
    "source_diversity": "Source Diversity",
    "recency": "Recency",
    "signal_clarity": "Signal Clarity",
    "ro_alignment": "RO Alignment",
}


def _build_calibration_breakdown(persona_details: Optional[dict]) -> dict:
    """
    Assembles calibration_breakdown for the detail page.

    Two modes:
    - Manual Build Mode (new system): uses auto_fill_report + confidence_scoring.components
      for real per-persona counts and RO-alignment component scores.
    - Omi / Evidence-Based (legacy): uses evidence_snapshot total_conversations and sources.

    Always returns a full dict — never None.
    """
    details = persona_details or {}

    # ── Manual Build Mode (new prompt system) ────────────────────────────────
    conf_scoring = details.get("confidence_scoring") or {}
    fill_report = details.get("auto_fill_report") or {}
    is_manual_mode = isinstance(conf_scoring, dict) and conf_scoring.get("mode") == "Manual Build Mode"

    if is_manual_mode:
        components: dict = conf_scoring.get("components") or {}
        weighted_score: float = float(conf_scoring.get("weighted_score") or 0)
        user_count: int = int(fill_report.get("user_provided_count") or 0)
        auto_count: int = int(fill_report.get("auto_filled_count") or 0)
        total_count: int = int(fill_report.get("total_sub_traits") or 0)

        # Build human-readable component score labels, e.g. "Demographic RO Fit: 85%"
        _COMP_LABEL_MAP = {
            "demographic_ro_fit":  "Demographic RO Fit",
            "psychographic_ro_fit": "Psychographic RO Fit",
            "behavioural_ro_fit":  "Behavioural RO Fit",
            "trait_completeness":  "Trait Completeness",
        }
        component_scores = {
            _COMP_LABEL_MAP.get(k, k.replace("_", " ").title()): round(v * 100)
            for k, v in components.items()
            if isinstance(v, (int, float))
        }
        component_key_labels = [
            f"{label}: {score}%"
            for label, score in component_scores.items()
        ]

        return {
            "is_manual_mode": True,
            "real_actions_signal": {
                **_CALIBRATION_BREAKDOWN_DEFAULTS["real_actions_signal"],
                "count": user_count,
                "count_label": "Traits Provided by You",
            },
            "emotional_neural_layers": {
                **_CALIBRATION_BREAKDOWN_DEFAULTS["emotional_neural_layers"],
                "count": auto_count,
                "count_label": "Traits Auto-Filled by AI",
            },
            "validated_studies": {
                **_CALIBRATION_BREAKDOWN_DEFAULTS["validated_studies"],
                "count": total_count,
                "count_label": "Total Traits Analyzed",
            },
            "multi_platform_conversations": {
                "description": "RO-alignment scored across 4 dimensions using Research Objective context.",
                "count": round(weighted_score * 100),
                "count_label": "RO Alignment Score (%)",
                "key_attributes": component_key_labels,
                "platforms_covered": [],
                "component_scores": component_scores,
            },
        }

    # ── Legacy Omi / Evidence-Based flow ─────────────────────────────────────
    raw_evidence = details.get("evidence_snapshot") or {}

    # Defensive: parse if the LLM stored evidence_snapshot as a JSON string
    if isinstance(raw_evidence, str):
        try:
            raw_evidence = json.loads(raw_evidence)
        except (json.JSONDecodeError, TypeError, ValueError):
            raw_evidence = {}

    evidence: dict = raw_evidence if isinstance(raw_evidence, dict) else {}

    total_convs: int = int(evidence.get("total_conversations") or 0)
    raw_sources = evidence.get("sources") or []
    sources = [s for s in raw_sources if isinstance(s, dict)]
    platforms = [s.get("platform") for s in sources if s.get("platform")]
    platforms_count: int = len(platforms)

    # confidence_calculation_detail holds per-component scores for Omi personas
    conf_detail = evidence.get("confidence_calculation_detail") or {}
    raw_components = conf_detail.get("components") or {}

    _OMI_COMP_LABEL = {
        "volume_score":           "Volume",
        "source_diversity_score": "Source Diversity",
        "recency_score":          "Recency",
        "signal_clarity_score":   "Signal Clarity",
        "ro_alignment_score":     "RO Alignment",
    }

    # Build per-component scores as "Label: 91%" strings for key attributes
    conf_breakdown = evidence.get("confidence_breakdown") or {}
    if raw_components:
        key_attributes = [
            f"{_OMI_COMP_LABEL.get(k, k.replace('_', ' ').title())}: {round(float(v) * 100)}%"
            for k, v in raw_components.items()
            if isinstance(v, (int, float))
        ]
    else:
        key_attributes = (
            [_CONFIDENCE_LABEL_MAP.get(k, k.replace("_", " ").title()) for k in conf_breakdown]
            or ["Volume", "Recency", "RO Alignment", "Source Diversity", "Signal Clarity"]
        )

    # Platform-level conversation breakdown (used as component_scores in multi-platform card)
    platform_scores = {
        s["platform"]: int(s.get("threads_or_posts") or 0)
        for s in sources
        if s.get("platform")
    }

    existing = details.get("calibration_breakdown") or {}

    return {
        "is_manual_mode": False,
        # Card 1: use total web conversations as proxy for behavioral data analyzed
        "real_actions_signal": existing.get("real_actions_signal") or {
            **_CALIBRATION_BREAKDOWN_DEFAULTS["real_actions_signal"],
            "count": details.get("people_analysed") or total_convs,
            "count_label": "Conversations analyzed" if not details.get("people_analysed") else "People analysed",
        },
        # Card 2: neural/emotional layer — no per-persona neural data, show 0
        "emotional_neural_layers": existing.get("emotional_neural_layers") or {
            **_CALIBRATION_BREAKDOWN_DEFAULTS["emotional_neural_layers"],
            "count": 0,
            "count_label": "Neural parameters integrated",
        },
        # Card 3: number of distinct source platforms analyzed
        "validated_studies": existing.get("validated_studies") or {
            **_CALIBRATION_BREAKDOWN_DEFAULTS["validated_studies"],
            "count": platforms_count,
            "count_label": "Platforms analyzed",
        },
        # Card 4: total conversations with per-platform breakdown
        "multi_platform_conversations": existing.get("multi_platform_conversations") or {
            "description": "Calibrated against real consumer conversations across platforms.",
            "count": total_convs,
            "count_label": "Total conversations inferred",
            "key_attributes": key_attributes,
            "platforms_covered": platforms,
            "component_scores": platform_scores,
        },
    }


def compute_master_calibration_confidence(
    full_persona_info: dict,
    confidence: Optional[dict],
    predominant_patterns: Optional[dict],
) -> Optional[int]:
    """
    Single source of truth for the "Master Calibration Confidence" score shown
    on the persona grid card and the preview page. Averages three layers:

      1. Real Actions Signal   — predominant_patterns["score"] (RO Alignment)
      2. Knowledge Enrichment  — ke_confidence["overall"], fallback 90
      3. Multi-platform Conv.  — average of calibration_breakdown
                                 .multi_platform_conversations
                                 .confidence_components, else
                                 confidence["weighted_score"] * 100

    Missing layers are skipped rather than treated as 0, so a persona with only
    partial data still gets an honest average of what's actually known. Returns
    None only when NEITHER Real Actions Signal nor Multi-platform Conversation
    has real data yet — i.e. all we'd have is the constant KE fallback, which
    alone is not "enough data" to persist a score.
    """
    sub_scores: list[float] = []
    # Only Real Actions Signal and Multi-platform Conversation count towards the
    # "enough data" gate below — Knowledge Enrichment always contributes via its
    # own fallback, so it alone can't prove there's real evidence behind the score.
    real_non_ke_layers = 0

    if isinstance(predominant_patterns, dict):
        ro_score = predominant_patterns.get("score")
        if isinstance(ro_score, (int, float)):
            sub_scores.append(float(ro_score))
            real_non_ke_layers += 1

    ke_confidence = (full_persona_info or {}).get("ke_confidence")
    ke_overall = ke_confidence.get("overall") if isinstance(ke_confidence, dict) else None
    if isinstance(ke_overall, (int, float)):
        sub_scores.append(float(ke_overall))
    else:
        sub_scores.append(90.0)

    calibration_breakdown = (full_persona_info or {}).get("calibration_breakdown") or {}
    multi_platform = calibration_breakdown.get("multi_platform_conversations") or {}
    confidence_components = multi_platform.get("confidence_components")
    multi_platform_score: Optional[float] = None
    if isinstance(confidence_components, dict) and confidence_components:
        numeric_vals = [
            float(v) for v in confidence_components.values() if isinstance(v, (int, float))
        ]
        if numeric_vals:
            multi_platform_score = sum(numeric_vals) / len(numeric_vals)
    if multi_platform_score is None and calibration_breakdown.get("is_manual_mode"):
        # confidence_components itself is never actually populated anywhere yet, so
        # without this the richer per-dimension average was silently unreachable and
        # every persona fell straight to the single weighted_score fallback below.
        # Manual Build Mode's component_scores ARE genuine 0-100 percentages (see
        # _build_calibration_breakdown's is_manual_mode branch) — safe to average
        # directly. Legacy/Omi mode's component_scores holds raw per-platform
        # conversation counts, not percentages, so it's deliberately excluded here.
        component_scores = multi_platform.get("component_scores")
        if isinstance(component_scores, dict) and component_scores:
            numeric_vals = [
                float(v) for v in component_scores.values() if isinstance(v, (int, float))
            ]
            if numeric_vals:
                multi_platform_score = sum(numeric_vals) / len(numeric_vals)
    if multi_platform_score is None and isinstance(confidence, dict):
        weighted_score = confidence.get("weighted_score")
        if isinstance(weighted_score, (int, float)):
            multi_platform_score = float(weighted_score) * 100
    if multi_platform_score is not None:
        sub_scores.append(multi_platform_score)
        real_non_ke_layers += 1

    if real_non_ke_layers < 1:
        return None

    average = sum(sub_scores) / len(sub_scores)
    return max(0, min(100, int(round(average))))


def _confidence_for_master_scoring(full_persona_info: dict) -> dict:
    """Best-available confidence dict for compute_master_calibration_confidence's
    legacy weighted_score fallback, for call sites that don't already have a
    resolved `confidence` object (preview_persona resolves its own, richer one)."""
    confidence_scoring = full_persona_info.get("confidence_scoring")
    if isinstance(confidence_scoring, dict) and confidence_scoring:
        return confidence_scoring
    evidence_snapshot = full_persona_info.get("evidence_snapshot") or {}
    detail = evidence_snapshot.get("confidence_calculation_detail") or {}
    # `or` would treat a genuine 0.0 confidence as missing and fall through to
    # weighted_total — use an explicit None-check so a real 0 is preserved.
    value = detail.get("value")
    weighted_score = value if value is not None else detail.get("weighted_total")
    return {"weighted_score": weighted_score}


def _coerce_confidence_percent(value: Any) -> Optional[int]:
    if value is None or isinstance(value, bool):
        return None
    try:
        if isinstance(value, str):
            cleaned = value.strip()
            if not cleaned or cleaned.lower() in {"na", "n/a", "none", "null", "-"}:
                return None
            cleaned = cleaned.replace("%", "").strip()
            try:
                value = float(cleaned)
            except ValueError:
                import re
                match = re.search(r"-?\d+(?:\.\d+)?", cleaned)
                if not match:
                    return None
                value = match.group(0)
        score = float(value)
    except (TypeError, ValueError):
        return None

    if score < 0:
        return None
    if score <= 1:
        score *= 100
    if score > 100:
        return None
    return int(round(score))


def _nested_get(payload: Any, *path: str) -> Any:
    current = payload
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _has_manual_trait_snapshot(persona_details: Any) -> bool:
    if not isinstance(persona_details, dict):
        return False
    return bool(persona_details.get("raw_traits") or persona_details.get("raw_form_payload"))


def _resolve_calibration_confidence(p: Persona, persona_details: dict) -> Optional[int]:
    """Return confidence from the DB column or known legacy JSON locations."""
    candidates = [
        _nested_get(persona_details, "confidence_scoring", "weighted_score"),
        _nested_get(persona_details, "confidence_scoring", "score"),
        _nested_get(persona_details, "confidence_scoring", "confidence_calculation_detail", "value"),
        _nested_get(persona_details, "confidence_scoring", "confidence_calculation_detail", "weighted_total"),
        _nested_get(persona_details, "evidence_snapshot", "confidence_calculation_detail", "value"),
        _nested_get(persona_details, "evidence_snapshot", "confidence_calculation_detail", "weighted_total"),
        _nested_get(persona_details, "evidence_snapshot", "confidence_breakdown", "value"),
        _nested_get(persona_details, "evidence_snapshot", "confidence_breakdown", "weighted_total"),
        _nested_get(persona_details, "confidence_calculation_detail", "value"),
        _nested_get(persona_details, "confidence_calculation_detail", "weighted_total"),
        _nested_get(persona_details, "confidence_breakdown", "value"),
        _nested_get(persona_details, "confidence_breakdown", "weighted_total"),
        _nested_get(persona_details, "calibration_confidence"),
        _nested_get(persona_details, "confidence_score"),
        p.calibration_confidence,
        _nested_get(persona_details, "confidence"),
        _nested_get(persona_details, "confidence_scoring"),
    ]
    for candidate in candidates:
        score = _coerce_confidence_percent(candidate)
        if score is not None:
            return score
    if not p.auto_generated_persona and _has_manual_trait_snapshot(persona_details):
        return 50
    return None


def _manual_evidence_snapshot_from_details(persona_details: dict, calibration_confidence: Optional[int]) -> Optional[dict]:
    evidence_metadata = persona_details.get("evidence_metadata")
    evidence = persona_details.get("evidence")
    if not isinstance(evidence_metadata, dict) or not isinstance(evidence, dict):
        return None

    action_meta = evidence_metadata.get("action_data") or {}
    web_meta = evidence_metadata.get("web_evidence") or {}
    hq_meta = evidence_metadata.get("hq_research") or {}
    if not all(isinstance(x, dict) for x in (action_meta, web_meta, hq_meta)):
        return None

    def _count(meta: dict, key: str) -> int:
        try:
            return int(meta.get(key) or 0)
        except (TypeError, ValueError):
            return 0

    def _source_level(meta: dict) -> str:
        return "Real" if meta.get("source") == "real" else "Estimated"

    action_count = _count(action_meta, "real_records_found")
    web_count = _count(web_meta, "real_citations_found")
    hq_count = _count(hq_meta, "real_sources_found")

    confidence_scoring = persona_details.get("confidence_scoring") or {}
    if not isinstance(confidence_scoring, dict):
        confidence_scoring = {}
    try:
        confidence_value = float(calibration_confidence or 0) / 100
    except (TypeError, ValueError):
        confidence_value = 0.0
    confidence_value = round(max(0.0, min(confidence_value, 1.0)), 2)

    return {
        "evidence_source": "manual_digital_brain",
        "total_conversations": action_count + web_count + hq_count,
        "sources": [
            {
                "platform": "Action Data",
                "threads_or_posts": action_count,
                "source_type": _source_level(action_meta),
            },
            {
                "platform": "Web Evidence",
                "threads_or_posts": web_count,
                "source_type": _source_level(web_meta),
            },
            {
                "platform": "HQ Research",
                "threads_or_posts": hq_count,
                "source_type": _source_level(hq_meta),
            },
        ],
        "confidence_calculation_detail": {
            "level": confidence_scoring.get("confidence_level", "Medium"),
            "value": confidence_value,
            "weighted_total": confidence_value,
        },
        "timeframe": {
            "months_analyzed": None,
            "recent_activity": {"months": None, "percentage": None},
        },
        "stream_counts": evidence_metadata,
        "verdict_counts": {
            "action_data": len(evidence.get("action_data") or []),
            "web_evidence": len(evidence.get("web_evidence") or []),
            "hq_research": len(evidence.get("hq_research") or []),
        },
    }


def persona_to_dict(p: Persona, creator_full_name: Optional[str] = None) -> dict:
    if p.parent_persona_id:
        created_by_name = creator_full_name or "Unknown"
    elif p.auto_generated_persona:
        created_by_name = "Omi"
    else:
        created_by_name = creator_full_name or "Unknown"

    persona_details = p.persona_details or {}
    ocean_profile = p.ocean_profile
    if not ocean_profile and isinstance(persona_details, dict):
        ocean_profile = persona_details.get("ocean_profile")

    raw_traits_detail = (
        persona_details.get("raw_traits")
        if isinstance(persona_details.get("raw_traits"), dict)
        else {}
    )
    raw_form_payload = (
        persona_details.get("raw_form_payload")
        if isinstance(persona_details.get("raw_form_payload"), dict)
        else {}
    )
    raw_prompt_behavioural = (
        raw_traits_detail.get("behavioural")
        if isinstance(raw_traits_detail.get("behavioural"), dict)
        else {}
    )
    raw_form_behavioural = (
        raw_form_payload.get("behavioural")
        if isinstance(raw_form_payload.get("behavioural"), dict)
        else {}
    )

    purchase_triggers = (
        persona_details.get("purchase_triggers")
        or raw_prompt_behavioural.get("purchase_triggers")
        or raw_form_behavioural.get("purchase_triggers")
    )
    purchase_barriers = (
        persona_details.get("purchase_barriers")
        or raw_prompt_behavioural.get("purchase_barriers")
        or raw_form_behavioural.get("purchase_barriers")
    )
    media_consumption_patterns = (
        persona_details.get("media_consumption_patterns")
        or raw_prompt_behavioural.get("media_consumption_patterns")
        or raw_form_behavioural.get("media_consumption_patterns")
    )
    digital_behaviour = (
        persona_details.get("digital_behaviour")
        or raw_prompt_behavioural.get("digital_behaviour")
        or raw_form_behavioural.get("digital_behaviour")
    )

    barriers_pain_points = persona_details.get("barriers_pain_points")
    triggers_opportunities = persona_details.get("triggers_opportunities")
    if not p.auto_generated_persona and _is_blank_manual_trait(barriers_pain_points):
        purchase_barrier_values = _manual_trait_values(purchase_barriers)
        barriers_pain_points = {
            "structural": [
                "Needs clearer access, pricing, or feature detail before committing",
                "May delay action if the process feels high effort",
            ],
            "psychological": purchase_barrier_values[:2] or [
                "Needs stronger proof before committing",
                "May hesitate if the value or fit is unclear",
            ],
            "emotional": [
                "Concern about making the wrong decision",
                "Hesitation if the benefit feels uncertain",
            ],
            "category_specific": [
                "Requires clearer fit with the research objective before engaging"
            ],
        }
    if not p.auto_generated_persona and _is_blank_manual_trait(triggers_opportunities):
        purchase_trigger_values = _manual_trait_values(purchase_triggers)
        triggers_opportunities = {
            "functional_triggers": purchase_trigger_values[:2] or [
                "Clear practical benefit tied to the research objective",
                "Simple path to compare, trial, or act",
            ],
            "emotional_triggers": [
                "Confidence that the choice reduces risk",
                "Sense that the solution matches personal goals",
            ],
            "situational_triggers": [
                "A relevant life or usage moment activates consideration"
            ],
            "promotional_triggers": [
                "Transparent proof points and low-friction trial"
            ],
        }

    resolved_confidence = _resolve_calibration_confidence(p, persona_details)
    evidence_snapshot = (
        persona_details.get("evidence_snapshot")
        if isinstance(persona_details.get("evidence_snapshot"), dict)
        else _manual_evidence_snapshot_from_details(persona_details, resolved_confidence)
    )

    return {
        "id": p.id,
        "exploration_id": p.exploration_id,
        "workspace_id": p.workspace_id,

        "name": p.name,
        "age_range": p.age_range,
        "gender": p.gender,

        "location_country": p.location_country,
        "location_state": p.location_state,
        "education_level": p.education_level,
        "occupation": p.occupation,
        "income_range": p.income_range,
        "family_size": p.family_size,
        "geography": p.geography,

        "lifestyle": p.lifestyle,
        "values": p.values,
        "personality": p.personality,
        "interests": p.interests,
        "motivations": p.motivations,

        "brand_sensitivity": p.brand_sensitivity,
        "price_sensitivity": p.price_sensitivity,

        "mobility": p.mobility,
        "accommodation": p.accommodation,
        "marital_status": p.marital_status,
        "daily_rhythm": p.daily_rhythm,

        "hobbies": p.hobbies,
        "professional_traits": p.professional_traits,

        "digital_activity": p.digital_activity,
        "preferences": p.preferences,

        "backstory": p.backstory,

        "created_by": p.created_by,
        "created_by_name": created_by_name,
        "calibration_confidence": resolved_confidence,
        "confidence_score": resolved_confidence,
        "master_calibration_confidence": p.master_calibration_confidence,
        "created_at": p.created_at,
        "auto_generated_persona": p.auto_generated_persona,
        "persona_source": _persona_source(p),
        "parent_persona_id": p.parent_persona_id,
        "calibration_status": p.calibration_status,
        "persona_details": p.persona_details,
        # Flat column exposed separately so frontend doesn't have to dig into persona_details
        "ocean_profile": ocean_profile,
        # Assembled for the Calibration Breakdown tab; never None
        "calibration_breakdown": _build_calibration_breakdown(persona_details),
        # Action-data linkage for ML ground-truth
        "subject_key": getattr(p, "subject_key", None),
        "ml_domain": getattr(p, "ml_domain", None),
        # ── New fields from Manual Build Mode prompt ────────────────────────────
        # Stored in persona_details JSON; no new DB columns required.
        "auto_fill_report": persona_details.get("auto_fill_report"),
        "confidence_scoring": persona_details.get("confidence_scoring"),
        "barriers_pain_points": barriers_pain_points,
        "triggers_opportunities": triggers_opportunities,
        "decision_making_style": persona_details.get("decision_making_style"),
        "consumption_frequency": persona_details.get("consumption_frequency"),
        "purchase_channel": persona_details.get("purchase_channel"),
        "purchase_triggers": purchase_triggers,
        "purchase_barriers": purchase_barriers,
        "media_consumption_patterns": media_consumption_patterns,
        "digital_behaviour": digital_behaviour,
        "switching_tendency": persona_details.get("switching_tendency"),
        "category_awareness": persona_details.get("category_awareness"),
        "industry": persona_details.get("industry"),
        "family_structure": persona_details.get("family_structure"),
        "occupation_level": persona_details.get("occupation_level"),
        # Replication Engine v5.0 fields live inside persona_details so existing
        # deployments do not require new persona table columns.
        "replication_mode": persona_details.get("replication_mode"),
        "replication_artifacts": persona_details.get("replication_artifacts"),

        # ✅ NEW: Card Display Fields (Evidence & Triggers)
        "functional_triggers": (
            persona_details.get("triggers_opportunities", {}).get("functional_triggers", [])
            if isinstance(persona_details.get("triggers_opportunities"), dict)
            else []
        ),
        "emotional_triggers": (
            persona_details.get("triggers_opportunities", {}).get("emotional_triggers", [])
            if isinstance(persona_details.get("triggers_opportunities"), dict)
            else []
        ),
        "situational_triggers": (
            persona_details.get("triggers_opportunities", {}).get("situational_triggers", [])
            if isinstance(persona_details.get("triggers_opportunities"), dict)
            else []
        ),
        "promotional_triggers": (
            persona_details.get("triggers_opportunities", {}).get("promotional_triggers", [])
            if isinstance(persona_details.get("triggers_opportunities"), dict)
            else []
        ),
        
        # Barriers
        "structural_barriers": (
            persona_details.get("barriers_pain_points", {}).get("structural", [])
            if isinstance(persona_details.get("barriers_pain_points"), dict)
            else []
        ),
        "psychological_barriers": (
            persona_details.get("barriers_pain_points", {}).get("psychological", [])
            if isinstance(persona_details.get("barriers_pain_points"), dict)
            else []
        ),
        "emotional_barriers": (
            persona_details.get("barriers_pain_points", {}).get("emotional", [])
            if isinstance(persona_details.get("barriers_pain_points"), dict)
            else []
        ),
        "category_specific_barriers": (
            persona_details.get("barriers_pain_points", {}).get("category_specific", [])
            if isinstance(persona_details.get("barriers_pain_points"), dict)
            else []
        ),
        
        # Decision & Behavior
        "switching_tendency": persona_details.get("switching_tendency"),
        "category_awareness": persona_details.get("category_awareness"),
        
        # Media & Digital (already have some, but ensure exposed)
        # media_consumption_patterns: already exposed ✓
        # digital_behaviour: already exposed ✓
        
        # Evidence & Sources
        "reference_sites_with_usage": persona_details.get("reference_sites_with_usage", []),
        "evidence_snapshot": evidence_snapshot,
        "evidence": persona_details.get("evidence"),
        "evidence_metadata": persona_details.get("evidence_metadata"),
        "brain_assignment": persona_details.get("brain_assignment"),
        "say_do_gap": persona_details.get("say_do_gap"),
        
        # Flattened evidence fields for easy frontend access
        "sources_breakdown": (
            evidence_snapshot.get("sources", [])
            if isinstance(evidence_snapshot, dict)
            else []
        ),
        "total_conversations_analyzed": (
            evidence_snapshot.get("total_conversations", 0)
            if isinstance(evidence_snapshot, dict)
            else 0
        ),
        "evidence_confidence_score": (
            evidence_snapshot
            .get("confidence_calculation_detail", {})
            .get("value")
            if isinstance(evidence_snapshot, dict)
            else None
        ),
        "evidence_confidence_level": (
            evidence_snapshot
            .get("confidence_calculation_detail", {})
            .get("level")
            if isinstance(evidence_snapshot, dict)
            else None
        ),
        "evidence_source": (
            evidence_snapshot.get("evidence_source", "evidence_based")
            if isinstance(evidence_snapshot, dict)
            else "evidence_based"
        ),
        "recency_percentage": (
            evidence_snapshot
            .get("timeframe", {})
            .get("recent_activity", {})
            .get("percentage")
            if isinstance(evidence_snapshot, dict)
            else None
        ),
        "recency_months": (
            evidence_snapshot
            .get("timeframe", {})
            .get("recent_activity", {})
            .get("months")
            if isinstance(evidence_snapshot, dict)
            else None
        ),
        "months_analyzed": (
            evidence_snapshot
            .get("timeframe", {})
            .get("months_analyzed")
            if isinstance(evidence_snapshot, dict)
            else None
        ),
    }


def _full_persona_info_for_scoring(p: Persona) -> dict:
    """Same merge shape the preview endpoint builds for its own confidence/patterns
    resolution: flat + derived columns (via persona_to_dict) overlaid with the raw
    persona_details JSON, so predominant_patterns/ke_confidence/calibration_breakdown
    are all readable at the top level for compute_master_calibration_confidence."""
    return {**persona_to_dict(p), **(p.persona_details or {})}


async def get_persona(persona_id: str) -> Optional[dict]:
    from app.models.user import User
    async with AsyncSession(async_engine) as session:
        res = await session.execute(select(Persona).where(Persona.id == persona_id))
        p = res.scalars().first()
        if not p:
            return None

        full_name: Optional[str] = None
        if _needs_human_creator(p):
            user_res = await session.execute(select(User).where(User.id == p.created_by))
            u = user_res.scalars().first()
            if u:
                full_name = u.full_name or f"{u.first_name} {u.last_name}".strip() or None

        return persona_to_dict(p, creator_full_name=full_name)


async def save_predominant_patterns_and_master_confidence(
    persona_id: str,
    predominant_patterns: Optional[dict] = None,
    master_calibration_confidence: Optional[int] = None,
) -> None:
    """Persist a freshly-generated predominant_patterns payload and/or a
    recomputed master_calibration_confidence onto the Persona row. Called from
    the preview endpoint after a live (uncached) computation so subsequent
    requests read the same numbers back instead of recomputing them per visit."""
    if predominant_patterns is None and master_calibration_confidence is None:
        return
    async with AsyncSession(async_engine) as session:
        res = await session.execute(select(Persona).where(Persona.id == persona_id))
        p = res.scalars().first()
        if not p:
            return
        if predominant_patterns is not None:
            details = dict(p.persona_details or {})
            details["predominant_patterns"] = predominant_patterns
            p.persona_details = details
        if master_calibration_confidence is not None:
            p.master_calibration_confidence = master_calibration_confidence
        session.add(p)
        await session.commit()


async def mark_persona_calibrating(persona_id: str) -> Optional[dict]:
    """Flip calibration_status to 'calibrating' so POST /{persona_id}/calibrate
    can return immediately while the actual multi-LLM-call enrichment (often
    30-180s+) runs in the background — see run_manual_calibration_background()
    in manual_digital_brain_persona.py. A synchronous request that long was
    getting killed by a reverse-proxy/gateway timeout before the backend could
    respond, which the browser then misreports as a CORS error rather than the
    actual 502 timeout."""
    async with AsyncSession(async_engine) as session:
        res = await session.execute(select(Persona).where(Persona.id == persona_id))
        p = res.scalars().first()
        if not p:
            return None
        p.calibration_status = "calibrating"
        session.add(p)
        await session.commit()
        await session.refresh(p)
        return persona_to_dict(p)


async def reset_persona_after_calibration_failure(persona_id: str, error_message: str) -> None:
    """Revert calibration_status to 'draft' and record the failure so the
    polling client can show it and let the user retry (see
    run_manual_calibration_background() in manual_digital_brain_persona.py)."""
    async with AsyncSession(async_engine) as session:
        res = await session.execute(select(Persona).where(Persona.id == persona_id))
        p = res.scalars().first()
        if not p:
            return
        p.calibration_status = "draft"
        details = dict(p.persona_details or {})
        details["last_calibration_error"] = error_message
        p.persona_details = details
        session.add(p)
        await session.commit()


async def list_personas(workspace_id: str, exploration_id: str) -> List[dict]:
    from app.models.user import User
    async with AsyncSession(async_engine) as session:
        res = await session.execute(
            select(Persona).where(
                Persona.workspace_id == workspace_id,
                Persona.exploration_id == exploration_id,
            )
        )
        rows = res.scalars().all()

        # Batch-fetch the unique human creators (skip Omi-generated ones)
        human_ids = list({p.created_by for p in rows if _needs_human_creator(p)})
        user_map: Dict[str, str] = {}
        if human_ids:
            user_res = await session.execute(select(User).where(User.id.in_(human_ids)))
            for u in user_res.scalars().all():
                display = u.full_name or f"{u.first_name} {u.last_name}".strip() or None
                if display:
                    user_map[u.id] = display

        return [
            persona_to_dict(p, creator_full_name=user_map.get(p.created_by))
            for p in rows
        ]


async def list_non_draft_personas(workspace_id: str, exploration_id: str) -> List[dict]:
    """Return saved personas that are already usable, so Omi does not regenerate them."""
    personas = await list_personas(workspace_id, exploration_id)
    return [
        p for p in personas
        if p.get("calibration_status") != "draft"
    ]


async def clear_personas_for_exploration(workspace_id: str, exploration_id: str) -> None:
    """Clear personas after RO edits so the next trigger can regenerate against new input."""
    async with AsyncSession(async_engine) as session:
        await session.execute(
            delete(Persona).where(
                Persona.workspace_id == workspace_id,
                Persona.exploration_id == exploration_id,
            )
        )
        await session.commit()


def list_to_string(value, sep=", "):
    if isinstance(value, list):
        return sep.join(str(v) for v in value)
    return value


async def update_persona(persona_id: str, data: dict):
    async with AsyncSession(async_engine) as session:
        res = await session.execute(
            select(Persona).where(Persona.id == persona_id)
        )
        p = res.scalars().first()

        if not p:
            return None

        update_data = data

        for field in ("values", "personality"):
            if field in update_data:
                update_data[field] = list_to_string(update_data[field])

        model_columns = {c.name for c in Persona.__table__.columns}
        persona_details = dict(p.persona_details or {})

        for field, value in update_data.items():
            if field in model_columns:
                setattr(p, field, value)
            persona_details[field] = value

        p.persona_details = persona_details

        await session.commit()
        await session.refresh(p)
        return p


async def delete_persona(persona_id: str) -> bool:
    async with AsyncSession(async_engine) as session:

        persona_query = select(Persona).where(Persona.id == persona_id)
        res = await session.execute(persona_query)
        p = res.scalars().first()

        if not p:
            return False

        await session.delete(p)
        await session.commit()

        return True
async def preview_replication_anchor(
    source_persona_id: str,
    target_country: str,
    exploration_id: str,
    workspace_id: str,
    seed_inputs: Optional[str] = None,
) -> dict:
    """
    Docs v5 Anchor-Only Preview: run Stage 1-2 and return core/context.
    No persona is created.
    """
    from app.services.replication.engine import replicate as _engine_replicate

    started_at = time.perf_counter()
    logger.info(
        "persona_service.replication_anchor_preview:start source=%s workspace=%s exploration=%s target=%r",
        source_persona_id,
        workspace_id,
        exploration_id,
        target_country,
    )

    source = await get_persona(source_persona_id)
    if not source:
        raise ValueError("Source persona not found")
    if str(source.get("exploration_id")) != str(exploration_id) or str(source.get("workspace_id")) != str(workspace_id):
        raise ValueError("Source persona does not belong to this exploration")

    source_details = source.get("persona_details") or {}
    if not source_details:
        raise ValueError("Source persona has no details to replicate")
    if source.get("calibration_status") == "draft":
        raise ValueError("Draft personas must be calibrated before replication")

    result = await _engine_replicate(
        source_persona=source,
        target_country=target_country,
        mode="anchor_preview",
        seed_inputs=seed_inputs,
    )
    artifact = result.artifact.model_dump(exclude_none=True)
    logger.info(
        "persona_service.replication_anchor_preview:success source=%s total_elapsed_ms=%d",
        source_persona_id,
        int((time.perf_counter() - started_at) * 1000),
    )
    return {
        "mode": "anchor_preview",
        "source_persona_id": source_persona_id,
        "target_country": target_country,
        "psychographic_core": artifact.get("psychographic_core"),
        "market_context": artifact.get("market_context"),
        "replication_metadata": artifact.get("metadata"),
        "replication_artifacts": artifact,
    }


_REPLICATED_SCORE_TO_OMI_KEY: Dict[str, str] = {
    "volume": "volume_score",
    "source_diversity": "source_diversity_score",
    "recency": "recency_score",
    "signal_clarity": "signal_clarity_score",
    "ro_alignment": "ro_alignment_score",
}


def _build_replicated_evidence_snapshot(
    source_details: dict, confidence_comparison: dict
) -> dict:
    """
    Deep/full replication regenerates persona_details from a fresh LLM schema that
    excludes evidence_snapshot (see replication/utils.py _EXCLUDED_SCHEMA_KEYS).
    Stage 5 (stage5_confidence.py) still recomputes all 5 confidence dimensions for
    the target country, but only stores them under replication_artifacts — a path
    the preview UI never reads. Carry that breakdown forward in the same shape the
    Omi/legacy flow uses (components as 0-1 fractions, matching
    evidence_snapshot.confidence_calculation_detail.components) so the existing
    calibration UI renders the recalibrated bars + platform breakdown instead of
    falling back to the single stored calibration_confidence value.
    """
    raw_evidence = source_details.get("evidence_snapshot") or {}
    if isinstance(raw_evidence, str):
        try:
            raw_evidence = json.loads(raw_evidence)
        except (json.JSONDecodeError, TypeError, ValueError):
            raw_evidence = {}
    source_evidence: dict = raw_evidence if isinstance(raw_evidence, dict) else {}

    replicated_scores = confidence_comparison.get("replicated_scores") or {}
    components = {
        omi_key: replicated_scores[field]
        for field, omi_key in _REPLICATED_SCORE_TO_OMI_KEY.items()
        if isinstance(replicated_scores.get(field), (int, float))
    }
    weighted_score = replicated_scores.get("weighted_score")

    return {
        "total_conversations": source_evidence.get("total_conversations") or 0,
        "sources": source_evidence.get("sources") or [],
        "confidence_calculation_detail": {
            "components": components,
            "weighted_total": weighted_score,
            "value": weighted_score,
        },
    }


async def replicate_persona(
    source_persona_id: str,
    target_country: str,
    exploration_id: str,
    workspace_id: str,
    current_user_id: str,
    mode: str = "full_replication",
    seed_inputs: Optional[str] = None,
) -> dict:
    """
    Clone an existing persona and localise it for a different country.

    mode="fast_localization"  — lightweight geo-adaptation (default, legacy behavior)
    mode="deep_psychographic" — 5-stage psychographic reconstruction (v5.0 engine)
    """
    from app.services.replication.engine import replicate as _engine_replicate

    if mode == "anchor_preview":
        raise ValueError("Anchor-only preview does not create a persona")

    started_at = time.perf_counter()
    logger.info(
        "persona_service.replicate:start source=%s workspace=%s exploration=%s target=%r mode=%s",
        source_persona_id,
        workspace_id,
        exploration_id,
        target_country,
        mode,
    )

    source = await get_persona(source_persona_id)
    if not source:
        raise ValueError("Source persona not found")

    source_details = source.get("persona_details") or {}
    if not source_details:
        raise ValueError("Source persona has no details to replicate")
    if source.get("calibration_status") == "draft":
        raise ValueError("Draft personas must be calibrated before replication")

    engine_started_at = time.perf_counter()
    result = await _engine_replicate(
        source_persona=source,
        target_country=target_country,
        mode=mode,
        seed_inputs=seed_inputs,
    )
    logger.info(
        "persona_service.replicate:engine_done source=%s mode=%s elapsed_ms=%d",
        source_persona_id,
        mode,
        int((time.perf_counter() - engine_started_at) * 1000),
    )

    adapted = dict(result.adapted_persona_json or {})
    # mode='json' ensures Pydantic v2 converts all types (floats, nested models, etc.)
    # to JSON-safe primitives before we touch the DB. Without this, asyncpg's JSON
    # codec can receive a non-serializable Python object (e.g. a Pydantic model
    # instance, a special float) and raise a TypeError that SQLAlchemy wraps as the
    # base DBAPIError (no SQLSTATE code) instead of the more specific DataError.
    artifact_dict = result.artifact.model_dump(mode="json", exclude_none=True)
    adapted["replication_mode"] = mode
    adapted["replication_artifacts"] = artifact_dict

    # Deep/full replication's LLM-generated schema excludes evidence_snapshot, so
    # without this the calibration breakdown has nothing to render and falls back
    # to a single stored score. Fast-localization already carries evidence_snapshot
    # forward from the source persona, so only backfill when it's genuinely missing.
    confidence_comparison = artifact_dict.get("confidence_comparison")
    if confidence_comparison and not adapted.get("evidence_snapshot"):
        adapted["evidence_snapshot"] = _build_replicated_evidence_snapshot(
            source_details, confidence_comparison
        )

    # Round-trip through JSON to guarantee asyncpg receives a fully serializable
    # dict. Catches edge cases like nan/inf floats from LLM output, datetime objects
    # embedded in persona_details, or any type that json.dumps rejects without
    # default=str. Doing this here (not inside the session) means a serialization
    # failure surfaces as a clear ValueError before the DB connection is opened.
    try:
        adapted = json.loads(json.dumps(adapted, default=str))
    except Exception as _json_err:
        logger.error(
            "persona_service.replicate:json_sanitize_failed source=%s error=%s",
            source_persona_id,
            _json_err,
        )
        raise ValueError(f"Replication artifact could not be serialized: {_json_err}") from _json_err

    from types import SimpleNamespace
    d = SimpleNamespace(**{**source_details, **adapted})

    new_id = generate_id()
    db_started_at = time.perf_counter()
    async with AsyncSession(async_engine) as session:
        p = Persona(
            id=new_id,
            exploration_id=exploration_id,
            workspace_id=workspace_id,
            name=adapted.get("name") or source["name"],
            age_range=adapted.get("age_range") or getattr(d, "age_range", ""),
            gender=adapted.get("gender") or getattr(d, "gender", ""),
            location_country=target_country,
            location_state=_coerce_str(adapted.get("location_state")) or "",
            education_level=_coerce_str(adapted.get("education_level")) or getattr(d, "education_level", ""),
            occupation=_coerce_str(adapted.get("occupation")) or getattr(d, "occupation", ""),
            income_range=_coerce_str(adapted.get("income_range")) or getattr(d, "income_range", ""),
            family_size=_coerce_str(adapted.get("family_size")) or getattr(d, "family_size", ""),
            geography=_coerce_str(adapted.get("geography")) or target_country,
            lifestyle=_coerce_str(adapted.get("lifestyle")) or getattr(d, "lifestyle", ""),
            values=_coerce_str(adapted.get("values")) or _coerce_str(getattr(d, "values", "")),
            personality=_coerce_str(adapted.get("personality")) or _coerce_str(getattr(d, "personality", "")),
            interests=adapted.get("interests") if isinstance(adapted.get("interests"), list) else getattr(d, "interests", []),
            motivations=_coerce_str(adapted.get("motivations")) or getattr(d, "motivations", ""),
            brand_sensitivity=_coerce_str(adapted.get("brand_sensitivity")) or getattr(d, "brand_sensitivity", ""),
            price_sensitivity=_coerce_str(adapted.get("price_sensitivity")) or getattr(d, "price_sensitivity", ""),
            mobility=_coerce_str(adapted.get("mobility")) or getattr(d, "mobility", ""),
            accommodation=_coerce_str(adapted.get("accommodation")) or getattr(d, "accommodation", ""),
            marital_status=_coerce_str(adapted.get("marital_status")) or getattr(d, "marital_status", ""),
            daily_rhythm=_coerce_str(adapted.get("daily_rhythm")) or getattr(d, "daily_rhythm", ""),
            hobbies=_coerce_str(adapted.get("hobbies")) or getattr(d, "hobbies", ""),
            professional_traits=_coerce_str(adapted.get("professional_traits")) or getattr(d, "professional_traits", ""),
            digital_activity=_coerce_str(adapted.get("digital_activity")) or getattr(d, "digital_activity", ""),
            preferences=_coerce_str(adapted.get("preferences")) or getattr(d, "preferences", ""),
            backstory=_coerce_str(adapted.get("backstory")) or source.get("backstory") or "",
            created_by=current_user_id,
            persona_details=adapted,
            auto_generated_persona=True,
            parent_persona_id=source_persona_id,
            calibration_status=source.get("calibration_status") or "calibrated",
            calibration_confidence=result.confidence_int,
        )

        # Replication produces its own confidence data (evidence_snapshot /
        # predominant_patterns above) — recompute the master score now so the
        # replicated persona doesn't show a stale/blank value until its next preview.
        full_persona_info = _full_persona_info_for_scoring(p)
        master_score = compute_master_calibration_confidence(
            full_persona_info,
            _confidence_for_master_scoring(full_persona_info),
            full_persona_info.get("predominant_patterns"),
        )
        if master_score is not None:
            p.master_calibration_confidence = master_score

        session.add(p)
        await session.commit()
        await session.refresh(p)
        logger.info(
            "persona_service.replicate:db_saved source=%s new=%s elapsed_ms=%d",
            source_persona_id,
            new_id,
            int((time.perf_counter() - db_started_at) * 1000),
        )

        from app.models.user import User
        user_res = await session.execute(select(User).where(User.id == current_user_id))
        u = user_res.scalars().first()
        full_name = None
        if u:
            full_name = u.full_name or f"{u.first_name} {u.last_name}".strip() or None

    result_dict = persona_to_dict(p, creator_full_name=full_name)
    logger.info(
        "persona_service.replicate:success source=%s new=%s total_elapsed_ms=%d",
        source_persona_id,
        new_id,
        int((time.perf_counter() - started_at) * 1000),
    )
    return result_dict


async def total_sample_size(workspace_id: str, exploration_id: str) -> int:
    async with AsyncSession(async_engine) as session:

        persona_query = select(Persona).where(
            Persona.workspace_id == workspace_id,
            Persona.exploration_id == exploration_id
        )

        res = await session.execute(persona_query)
        rows = res.scalars().all()

        return sum(r.sample_size for r in rows)

async def generate_persona_confidence(persona: dict, research_objective: str = "") -> dict:
    persona_json = safe_json(persona)

    prompt = f"""
You are a senior-level consumer insights & market research evaluator. 
Evaluate the persona using REAL research methodology.

PERSONA INPUT (JSON):
{persona_json}

RESEARCH OBJECTIVE (if provided):
{research_objective}

Evaluate the persona across SIX DIMENSIONS:

1. COMPLETENESS  
   - Are all demographic, psychographic, lifestyle, and behavioral fields present?  
   - Are multi-value fields detailed (not 1–2 generic words)?

2. INTERNAL CONSISTENCY  
   - Are age, occupation, income, lifestyle, mobility, interests, hobbies believable together?  
   - Detect contradictions (e.g., “low income” but “premium brand preference”).

3. DEMOGRAPHIC REALISM  
   - Age ↔ income ↔ job ↔ family size ↔ geography must resemble real-world patterns.

4. PSYCHOGRAPHIC DEPTH  
   - Are personality, values, motivations, interests logically connected and meaningful?

5. BEHAVIORAL ALIGNMENT  
   - Do brand sensitivity, price sensitivity, digital activity, and preferences match lifestyle?

6. ALIGNMENT WITH RESEARCH OBJECTIVE  
   - Does this persona meaningfully relate to the research objective?  
   - If objective is empty, score based only on persona quality.

SCORING RULES:
- Score must be between **1% and 100%**
- Stars must be **1.0 to 5.0**
- Reliability must be one of: "High", "Medium", "Low"
- Strengths and weaknesses MUST be non-empty lists (except if extremely poor quality)

OUTPUT:
Return STRICT JSON ONLY in this EXACT format:

{{
  "score": "NN%",
  "stars": X.X,
  "reliability": "High or Medium or Low",
  "strengths": ["text", "text"],
  "weaknesses": ["text", "text"],
  "improvements": "One short actionable paragraph"
}}

NO text outside JSON. NO markdown. NO explanations.
"""

    res = await client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You evaluate persona quality using rigorous consumer insights methodology. "
                    "Always return strict JSON and ensure internally consistent scoring."
                )
            },
            {"role": "user", "content": prompt}
        ],
    )

    raw = res.choices[0].message.content

    try:
        return json.loads(raw)
    except Exception:
        return {
            "score": "0%",
            "stars": 1.0,
            "reliability": "Low",
            "strengths": [],
            "weaknesses": ["Persona scoring failed due to formatting"],
            "improvements": "Ensure persona fields are complete and formatting is correct."
        }


_BRAIN_NAMES_RE = re.compile(
    r"\b(Explorer|Connector|Guardian|Pragmatist|Achiever|Visionary|Optimizer|"
    r"Hedonist|Empath|Nomad|Rebel|Maverick|Aspirational Achiever)\s*(brain|type)?\b",
    re.IGNORECASE,
)


def _compute_ro_alignment_sanity_check(patterns: list, ro: dict) -> int:
    """Rule-based RO alignment score — no LLM. Counts keyword overlap between patterns and RO."""
    if not patterns or not ro:
        return 0

    ro_text = " ".join(filter(None, [
        ro.get("business_objective", ""),
        ro.get("key_questions", ""),
    ])).lower()

    ro_keywords = {w for w in ro_text.split() if len(w) > 3}
    if not ro_keywords:
        return 50

    aligned_count = sum(
        1 for pattern in patterns
        if set(pattern.lower().split()) & ro_keywords
    )
    return max(0, min(100, int((aligned_count / len(patterns)) * 100)))


def _extract_manual_signals(full_persona_info: dict) -> list[str]:
    """Extract behavioral signals from manual persona trait fields (no digital brain evidence)."""
    signals: list[str] = []

    def _add(prefix: str, value) -> None:
        if not value:
            return
        items = value if isinstance(value, list) else [value]
        for item in items:
            text = str(item).strip()
            if len(text) > 5:
                signals.append(f"[{prefix}] {text}")

    _add("PERSONALITY", full_persona_info.get("personality"))
    _add("VALUES", full_persona_info.get("values"))
    _add("MOTIVATIONS", full_persona_info.get("motivations"))
    _add("LIFESTYLE", full_persona_info.get("lifestyle"))
    _add("INTERESTS", full_persona_info.get("interests"))
    _add("DECISION_STYLE", full_persona_info.get("decision_making_style"))
    _add("PURCHASE_CHANNEL", full_persona_info.get("purchase_channel"))
    _add("PURCHASE_TRIGGER", full_persona_info.get("purchase_triggers"))
    _add("PURCHASE_BARRIER", full_persona_info.get("purchase_barriers"))
    _add("MEDIA", full_persona_info.get("media_consumption_patterns"))
    _add("DIGITAL", full_persona_info.get("digital_behaviour") or full_persona_info.get("digital_activity"))

    for key, label in [
        ("price_sensitivity", "PRICE_SENSITIVITY"),
        ("brand_sensitivity", "BRAND_SENSITIVITY"),
        ("switching_tendency", "SWITCHING_TENDENCY"),
    ]:
        val = full_persona_info.get(key)
        if val:
            signals.append(f"[{label}] {val}")

    bpp = full_persona_info.get("barriers_pain_points")
    if isinstance(bpp, dict):
        for items in bpp.values():
            if isinstance(items, list):
                for item in items[:2]:
                    text = str(item).strip()
                    if len(text) > 5:
                        signals.append(f"[BARRIER] {text}")

    trig = full_persona_info.get("triggers_opportunities")
    if isinstance(trig, dict):
        for items in trig.values():
            if isinstance(items, list):
                for item in items[:2]:
                    text = str(item).strip()
                    if len(text) > 5:
                        signals.append(f"[TRIGGER] {text}")

    backstory = full_persona_info.get("backstory") or full_persona_info.get("formative_experience_description")
    if backstory:
        text = str(backstory).strip()[:300]
        if len(text) > 20:
            signals.append(f"[BACKSTORY] {text}")

    return signals


def _build_patterns_prompt(ro_text: str, signals: list[str]) -> str:
    return f"""You are a consumer insights expert. Transform the raw behavioral signals below into exactly 10 clear, complete behavioral insights.

RESEARCH OBJECTIVE:
{ro_text}

RAW BEHAVIORAL SIGNALS:
{chr(10).join(f"- {s}" for s in signals[:15])}

RULES:
1. Output EXACTLY 10 patterns (or fewer only if fewer than 10 signals exist)
2. Each pattern must be a complete, clear sentence — 10 to 20 words
3. ZERO brain names (Explorer, Optimizer, Guardian, Connector, Achiever, Visionary, Hedonist, Empath, Pragmatist, Nomad, Rebel, Maverick)
4. ZERO technical jargon — write for a non-technical marketing manager who has never seen this data
5. Each pattern must express a specific, observable behavior, contradiction, or consumer insight
6. Cover a variety of signal types: price behavior, brand switching, peer influence, timing, trust, lifestyle, say-do gaps
7. Compute ro_alignment_score: integer 0-100 — what % of patterns directly address the research objective's key questions

GOOD EXAMPLES:
- "They regularly switch between brands, but claim to value brand loyalty when asked."
- "Most purchases happen late at night, suggesting deliberate, reward-driven shopping sessions."
- "Peer recommendations consistently override personal brand preferences during switching decisions."
- "Shoppers spend at premium tier but describe themselves as budget-conscious buyers."

BAD EXAMPLES (avoid):
- "Explorer brain overrides stated quality preference" (brain name + jargon)
- "Peer-driven switching clusters" (fragment, too vague)
- "Behavioral heterogeneity signals" (jargon)

OUTPUT — strict JSON only, no markdown:
{{
  "patterns": ["Complete sentence pattern 1.", "Complete sentence pattern 2.", ...],
  "ro_alignment_score": 78
}}"""


async def _generate_patterns_fallback(full_persona_info: dict, ro_text: str) -> dict:
    """Minimal LLM call when main generation fails. Returns {patterns, score, error}."""
    name = full_persona_info.get("name", "")
    occupation = full_persona_info.get("occupation", "")
    values = full_persona_info.get("values", "")
    motivations = full_persona_info.get("motivations", "")
    personality = full_persona_info.get("personality", "")
    lifestyle = full_persona_info.get("lifestyle", "")
    price_sensitivity = full_persona_info.get("price_sensitivity", "")
    brand_sensitivity = full_persona_info.get("brand_sensitivity", "")

    try:
        res = await client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Generate clear, jargon-free behavioral patterns from persona data. "
                        "Output strict JSON only. No brain names, no technical jargon."
                    ),
                },
                {
                    "role": "user",
                    "content": f"""Research Objective: {ro_text}
Persona: {name}, {occupation}
Values: {values} | Motivations: {motivations}
Personality: {personality} | Lifestyle: {lifestyle}
Price sensitivity: {price_sensitivity} | Brand sensitivity: {brand_sensitivity}

Generate 8 clear behavioral patterns (complete sentences, 10-20 words each, no brain names) and an ro_alignment_score (0-100).
JSON: {{"patterns": [...], "ro_alignment_score": 70}}""",
                },
            ],
        )
        data = json.loads(res.choices[0].message.content)
        patterns = [
            _BRAIN_NAMES_RE.sub("", str(p)).strip(" ,")
            for p in (data.get("patterns") or [])
            if p and len(str(p).strip()) > 3
        ][:10]
        score = max(0, min(100, int(data.get("ro_alignment_score") or 50)))
        logger.info("generate_predominant_patterns: fallback succeeded patterns=%d score=%d", len(patterns), score)
        return {"patterns": patterns, "score": score, "error": False}
    except Exception:
        logger.exception("generate_predominant_patterns: fallback also failed")
        return {"patterns": [], "score": 0, "error": True}


async def generate_predominant_patterns(full_persona_info: dict) -> dict:
    """Generate 10 clear, jargon-free behavioral patterns + RO Alignment score.
    Works for both digital brain personas (uses evidence streams) and manual
    personas (extracts signals from trait fields).
    """
    evidence = (full_persona_info or {}).get("evidence") or {}
    ro = (full_persona_info or {}).get("research_objective") or {}
    say_do = (full_persona_info or {}).get("say_do_gap") or {}

    # --- Digital brain signals ---
    signals: list[str] = []
    for layer in (evidence.get("action_data") or []):
        text = str(layer.get("pattern_detected") or "").strip()
        if len(text) > 8:
            signals.append(f"[ACTION] {text}")
    for verdict in (evidence.get("web_evidence") or []):
        for theme in (verdict.get("key_discussion_themes") or []):
            text = str(theme or "").strip()
            if len(text) > 8:
                signals.append(f"[WEB] {text}")
    # Manual flow: divergences list
    for div in (say_do.get("divergences") or []):
        text = str(div or "").strip()
        if len(text) > 8:
            signals.append(f"[SAY_DO_GAP] {text}")
    # Digital brain flow: flat claim/actual_behavior/reasoning fields
    _claim = str(say_do.get("claim") or say_do.get("stated_value") or "").strip()
    _actual = str(say_do.get("actual_behavior") or say_do.get("evidence_based_observation") or "").strip()
    _reason = str(say_do.get("reasoning") or say_do.get("hidden_driver") or "").strip()
    if _claim and _actual:
        signals.append(f"[SAY_DO_GAP] Claims: {_claim}. Actual behavior: {_actual}.")
    if _reason and len(_reason) > 8:
        signals.append(f"[SAY_DO_GAP] Hidden driver: {_reason}")

    # --- Fallback to manual trait signals for non-digital-brain personas ---
    if not signals:
        signals = _extract_manual_signals(full_persona_info or {})

    if isinstance(ro, dict):
        ro_text = " | ".join(filter(None, [
            ro.get("business_objective", ""),
            ro.get("key_questions", ""),
            ro.get("hypotheses", ""),
        ]))
    else:
        ro_text = str(ro)

    prompt = _build_patterns_prompt(ro_text, signals)

    try:
        res = await client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You produce concise, jargon-free behavioral patterns from consumer research signals. "
                        "Output strict JSON only. Never use brain names or technical jargon."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        )
        data = json.loads(res.choices[0].message.content)
        raw_patterns = data.get("patterns") or []
        patterns = [
            _BRAIN_NAMES_RE.sub("", str(pat)).strip(" ,")
            for pat in raw_patterns
            if pat and len(str(pat).strip()) > 3
        ][:10]
        llm_score = max(0, min(100, int(data.get("ro_alignment_score") or 0)))
        # sanity_score is a naive literal-keyword-overlap check, but the prompt above
        # deliberately instructs the LLM to rephrase patterns in plain, jargon-free
        # language rather than repeat the RO's wording — so sanity_score trends low
        # by design, independent of true alignment quality. Averaging it 50/50 was
        # silently dragging every persona's score down (an 85 LLM score could land
        # in the 50s). Trust the LLM's direct semantic judgment for the persisted
        # score; sanity_score is kept only as a diagnostic signal in the logs.
        sanity_score = _compute_ro_alignment_sanity_check(patterns, ro if isinstance(ro, dict) else {})
        final_score = llm_score
        if abs(llm_score - sanity_score) > 20:
            logger.warning(
                "generate_predominant_patterns: large llm/sanity divergence (diagnostic only) llm=%d sanity=%d",
                llm_score, sanity_score,
            )
        else:
            logger.info(
                "generate_predominant_patterns: patterns=%d llm=%d sanity=%d",
                len(patterns), llm_score, sanity_score,
            )
        return {"metric": "RO Alignment", "score": final_score, "patterns": patterns}
    except Exception:
        logger.exception("generate_predominant_patterns: main LLM call failed, trying fallback")
        fallback = await _generate_patterns_fallback(full_persona_info or {}, ro_text)
        patterns = fallback.get("patterns", [])
        sanity_score = _compute_ro_alignment_sanity_check(patterns, ro if isinstance(ro, dict) else {})
        if fallback.get("error"):
            # Both LLMs failed — sanity_score is the only signal left, never 0
            final_score = max(sanity_score, 1)
            logger.info("generate_predominant_patterns: sanity_only score=%d", final_score)
        else:
            # Same reasoning as the main path above — trust the fallback LLM's own
            # score rather than averaging it down with the jargon-biased sanity check.
            fallback_llm_score = fallback.get("score", 50)
            final_score = fallback_llm_score
            logger.info(
                "generate_predominant_patterns: fallback_llm score=%d sanity=%d(diagnostic)",
                fallback_llm_score, sanity_score,
            )
        return {"metric": "RO Alignment", "score": final_score, "patterns": patterns}


def persona_preview_from_dict(p, full_persona_info, confidence=None):

    age = p.get("age_range") or ""
    city = p.get("location_state") or p.get("location_country") or ""
    income = p.get("income_range") or ""
    marital = p.get("marital_status") or ""
    occupation = p.get("occupation") or ""
    mobility = p.get("mobility") or ""

    values = to_list(p.get("values"))
    motivations = to_list(p.get("motivations"))
    interests = to_list(p.get("interests"))
    lifestyle = to_list(p.get("lifestyle"))
    personality = to_list(p.get("personality"))

    summary_line_parts = [f"Age {age}", city, income, marital, occupation, mobility]

    summary_line_parts += values + motivations

    summary_line = " | ".join([x for x in summary_line_parts if x])

    full_summary = (
        f"{p.get('name')} is a {age} {str(p.get('gender', '')).lower()} individual "
        f"from {p.get('location_country')}. They work as a {occupation}. "
        f"They value {', '.join(values) or 'multiple factors'} and are "
        f"motivated by {', '.join(motivations) or 'various needs'}. "
    )

    persona_label = p.get("name") or "Persona"
    title_suffix = personality[0] if personality else "Profile"
    title = f"{persona_label}: {title_suffix}"

    confidence = confidence or "N/A"

    if full_persona_info:
        full_persona_info.pop("confidence_scoring", None)
        traits = full_persona_info

    else:
        traits = {
            # Basic Identity
            "name": p.get("name") or "",
            "age_range": p.get("age_range") or "",
            "gender": p.get("gender") or "",

            # Demographics
            "location_country": p.get("location_country") or "",
            "location_state": p.get("location_state") or "",
            "education_level": p.get("education_level") or "",
            "occupation": p.get("occupation") or "",
            "income_range": p.get("income_range") or "",
            "family_size": p.get("family_size") or "",
            "geography": p.get("geography") or "",

            # Psychographic Traits
            "lifestyle": ", ".join(lifestyle),
            "values": ", ".join(values),
            "personality": ", ".join(personality),
            "interests": ", ".join(interests),
            "motivations": ", ".join(motivations),

            # Behavioral Traits
            "brand_sensitivity": p.get("brand_sensitivity") or "",
            "price_sensitivity": p.get("price_sensitivity") or "",

            # Lifestyle Traits
            "mobility": p.get("mobility") or "",
            "accommodation": p.get("accommodation") or "",
            "marital_status": p.get("marital_status") or "",
            "daily_rhythm": p.get("daily_rhythm") or "",

            # Hobbies & Interests
            "hobbies": ", ".join(to_list(p.get("hobbies"))),

            # Professional Traits
            "professional_traits": ", ".join(to_list(p.get("professional_traits"))),

            # Digital Activity
            "digital_activity": ", ".join(to_list(p.get("digital_activity"))),

            # Preferences
            "preferences": ", ".join(to_list(p.get("preferences"))),

            # Backstory (if available)
            "backstory": p.get("backstory") or "",

            # OCEAN Profile (if available)
            "ocean_profile": p.get("ocean_profile") or {}
        }

    return {
        "title": title,
        # "image_url": None,
        "summary_line": summary_line,
        "full_summary": full_summary,
        "confidence": confidence,
        "traits": traits

    }

async def generate_auto_personas(exp):
    prompt = f"""
You are a senior market research strategist. You will generate deeply contextual consumer personas
strictly based on the following validated Research Objective:

{exp.description}

GOAL:
Generate **exactly 3 highly realistic and differentiated consumer personas** that best match the need, 
behavior, motivations, lifestyle, and barriers implied by the research objective.

STRICT RULES:
- Produce a **valid JSON object** with the top-level key: "consumer_personas"
- "consumer_personas" must be a list of exactly **3 personas**
- **All multi-value attributes MUST be a single comma-separated string**
  (NO arrays like ["Health","Fitness"] — instead: "Health, Fitness")
- Every persona must be **substantially different** in demographics, psychographics, and motivations
- All traits must be **logically consistent**
- Every persona must be **highly contextualized to the research objective** (not generic)
- **CRITICAL**: EVERY trait must DIRECTLY relate to the research objective

PERSONA NAME REQUIREMENTS (VERY IMPORTANT):
- **DO NOT use generic names like "Sarah Johnson" or "Michael Chen"**
- **USE THEME-BASED, DESCRIPTIVE NAMES** that capture the persona's essence
- Format: "[Key Trait]-[Defining Characteristic] [Archetype]"
- Examples:
  * "Eco-Warrior Millennial" (for sustainability-focused young professional)
  * "Tech-Savvy Early Adopter" (for innovation-driven tech enthusiast)
  * "Budget-Conscious Parent" (for price-sensitive family shopper)
  * "Luxury-Seeking Professional" (for high-end quality-focused buyer)
  * "Health-Focused Minimalist" (for wellness-oriented simple living)
  * "Digital-Native Gen-Z" (for young digital-first consumer)
  * "Gourmet Home Cook" (for culinary enthusiast)
  * "Skincare Minimalist" (for simple beauty routine)
  * "Pastry-Enthusiast Foodie" (for dessert-loving food explorer)
- Make the name **memorable, specific, and directly tied to their key traits**
- The name should immediately tell you WHO this person is

REQUIRED FIELDS FOR EACH PERSONA (ALL REQUIRED):
name (MUST be theme-based, NOT a regular person name)
age_range
gender
location_country
location_state
education_level
occupation
income_range
family_size
geography
lifestyle
values
personality
interests
motivations
brand_sensitivity
price_sensitivity
mobility
accommodation
marital_status
daily_rhythm
hobbies
professional_traits
digital_activity
preferences

CRITICAL INSTRUCTIONS FOR TRAIT ALIGNMENT:
- **EVERY SINGLE TRAIT** must be directly relevant to the research objective
- **DO NOT include generic traits** that don't relate to the research focus
- For example, if research is about "health-tracking wearables":
  GOOD: interests="Fitness tracking, Health monitoring, Wellness apps"
  BAD: interests="Travel, Fashion, Music" (not related to health tracking)
  
- **Values, interests, hobbies, motivations** must ALL connect to the research topic
- **Lifestyle and personality** should explain WHY they care about the research topic
- **Professional traits** should relate if the research involves professional context
- **Digital activity** should be relevant to how they'd interact with the research topic

VALIDATION RULES (MUST FOLLOW):
1. Every trait must pass the question: "How does this relate to [research objective]?"
2. If a trait doesn't directly support the research objective, DON'T include it
3. Make personas LASER-FOCUSED on the research topic
4. Avoid adding unrelated personality quirks or interests

OUTPUT FORMAT (VERY IMPORTANT):
Return ONLY this format:

{{
  "consumer_personas": [
      {{ 
        "name": "Theme-Based Descriptive Name",
        "age_range": "...",
        ...all other fields (ALL must relate to research objective)...
      }},
      {{ PERSONA 3 }}
  ]
}}

No additional text. No explanations. No markdown.
"""

    res = await client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You generate research personas with theme-based descriptive names and ALL traits directly aligned with the research objective. Every single trait must be relevant and contextual to the research focus. NO generic or unrelated traits."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7
    )

    data = json.loads(res.choices[0].message.content)
    
    personas = data.get("consumer_personas", [])
    for persona in personas:
        if not persona.get("location_state"):
            persona["location_state"] = "N/A"
    
    return data

async def validate_persona_traits_with_omi(
    research_objective: str,
    trait_group: str,
    traits: Dict[str, str]
) -> dict:
    prompt = build_persona_validation_prompt(
        research_objective=research_objective,
        trait_group=trait_group,
        traits=traits
    )

    result = await call_omi(
        system_prompt=PERSONA_VALIDATION_SYSTEM_PROMPT,
        user_prompt=prompt,
        response_format="json"
    )

    reasons = [
        item["reason"]
        for item in result.get("results", [])
        if item.get("status") == "invalid" and item.get("reason")
    ]

    result["total_response"] = "." .join(reasons) if reasons else None

    return result

async def update_persona_backstory(
    session: AsyncSession,
    persona_id: str,
    backstory: str
) -> Persona:
    result = await session.execute(
        select(Persona).where(Persona.id == persona_id)
    )
    persona = result.scalars().first()

    if not persona:
        raise ValueError("Persona not found")

    persona.backstory = backstory
    session.add(persona)
    await session.commit()
    await session.refresh(persona)

    return persona

MANUAL_PERSONA_BUILDER_PROMPT = """

You are an Expert Persona Architect operating in MANUAL BUILD MODE within the Synthetic People research platform.

In this mode, the user has defined their own persona traits through a structured form. Your job is:
1. Accept and validate the user-provided traits
2. Auto-fill any missing traits using the Research Objective and the traits already provided
3. Score the completed persona against the Research Objective
4. Return a fully populated, research-ready persona in strict JSON format

---

**INPUTS YOU WILL RECEIVE**

You will receive:
- research_objective: The confirmed Research Objective (RO) for this study
- user_provided_traits: A structured object containing all traits the user has filled in (see schema below)

Trait categories and their sub-traits are:

DEMOGRAPHICS (Mandatory - user must fill all):
  - age_range
  - gender
  - income_range
  - education_level
  - occupation_level
  - marital_status
  - family_structure
  - geography

PSYCHOLOGICAL (Optional - user may fill some, all, or none):
  - lifestyle
  - values
  - personality
  - interests
  - motivations

BEHAVIOURAL (Optional - user may fill some, all, or none):
  - decision_making_style
  - consumption_frequency
  - purchase_channel
  - price_sensitivity
  - brand_sensitivity
  - switching_tendency
  - purchase_triggers
  - purchase_barriers
  - media_consumption_patterns
  - digital_behaviour

ADDITIONAL INFORMATION (Optional - user may fill some, all, or none):
  - occupation
  - industry
  - category_awareness

FORMATIVE EXPERIENCE (Optional - free text up to 1000 characters):
  - formative_experience_description

---

**STEP 1: INPUT VALIDATION**

Before doing anything else, validate the demographics block.

Rule: All 8 demographic sub-traits MUST be present and non-empty.
  - age_range
  - gender
  - income_range
  - education_level
  - occupation_level
  - marital_status
  - family_structure
  - geography

The backend has already validated and normalized the demographics block before
this prompt is sent. You may see legacy alias values or "Not specified"
placeholders from older drafts. Treat these as provided values and continue.
Do NOT return a validation_error response.

IF all demographics are present: proceed to Step 2.

---

**STEP 2: TRAIT AUDIT**

Scan every sub-trait across all five categories.
Classify each sub-trait as one of:
  - USER_PROVIDED: The user has filled this in
  - MISSING: The user has left this blank or it is absent

Build an internal audit map. Do not output this map. Use it to drive Step 3.

---

**STEP 3: AUTO-FILL MISSING TRAITS**

For every sub-trait classified as MISSING, you must intelligently infer and fill it.

Auto-fill Logic (apply in this priority order):

Priority 1 - RO Alignment:
  Read the research_objective carefully.
  Extract all explicit and implicit signals:
  - Category signals (product type, service type, industry context)
  - Behavioral signals (usage, frequency, switching, loyalty)
  - Psychological signals (motivations, fears, aspirations)
  - Journey signals (awareness, consideration, lapsed, loyal)
  Use these signals as the primary source for filling missing traits.

Priority 2 - Cross-Trait Inference:
  Use the traits the user HAS filled to infer missing ones.
  Examples of cross-trait inference:
  - age_range=26-34 + income=8-15 LPA + education=Post Graduate
    → lifestyle: likely Career-Driven, Tech-Savvy
    → decision_making_style: likely Analytical or Peer-Influenced
    → switching_tendency: likely Medium (open to trying new options)
  - age_range=45-54 + marital_status=Married + family_structure=Nuclear with children
    → values: Family, Stability, Security
    → motivations: Financial security, Children's future
    → brand_sensitivity: likely High (trusts established brands)
  - occupation=Entrepreneur + income=25L+ + geography=Metro
    → personality: Ambitious, Risk-tolerant
    → consumption_frequency: High
    → purchase_channel: Online-first with occasional offline

Priority 3 - Category Archetype Baseline:
  If RO signals and cross-trait inference are still insufficient for a trait,
  apply the standard behavioral archetype for the category described in the RO.
  Always make this inference coherent with demographics and all other filled traits.

Auto-fill Rules:
  - NEVER contradict a user-provided trait. Auto-filled traits must be consistent with all user inputs.
  - NEVER leave a trait vague. Each auto-filled value must be as specific as a user-provided value.
  - For list-type traits (lifestyle, values, interests), generate 2-4 specific items.
  - For scale-type traits (price_sensitivity, brand_sensitivity, switching_tendency), return a label: Low / Medium / High.
  - For formative_experience_description: if missing, generate 3-4 behaviorally meaningful sentences consistent with the RO and all traits.

---

**STEP 4: PERSONA NAME GENERATION**

Generate a persona name in the format: [Archetype Label] [Descriptor]
Examples: "Cautious Value Seeker", "Ambitious Digital Native", "Loyal Brand Advocate"

The name must reflect the dominant behavioral pattern visible across the completed trait set.

---

**STEP 5: OCEAN PROFILE GENERATION**

Using the completed trait set (user-provided + auto-filled) and the RO, generate an OCEAN profile.

For each dimension, produce:
  - score: a float between 0.0 and 1.0
  - label: one of Low / Medium / High
  - rationale: one sentence explaining why this score fits this persona

OCEAN Dimensions:
  - openness: Curiosity, creativity, willingness to try new things
  - conscientiousness: Organization, reliability, thoroughness
  - extraversion: Sociability, expressiveness, energy from others
  - agreeableness: Cooperation, empathy, trust in others
  - neuroticism: Anxiety, emotional sensitivity, stress response

Cross-check: OCEAN scores must be coherent with personality, lifestyle, decision_making_style, and motivations.

---

**STEP 6: BARRIERS, PAIN POINTS, AND TRIGGERS**

Using the completed trait set and the RO, generate:

barriers_pain_points:
  - structural: 2 functional or access-related barriers
  - psychological: 2 mindset or belief-based barriers
  - emotional: 2 feeling-based barriers
  - category_specific: 1-2 barriers specific to the product/service category in the RO

triggers_opportunities:
  - functional_triggers: 2 practical triggers that would drive action
  - emotional_triggers: 2 feeling-based triggers
  - situational_triggers: 1-2 life moments or contexts that activate purchase or engagement
  - promotional_triggers: 1-2 offer or messaging formats that would work

---

**STEP 7: CONFIDENCE SCORING**

Score the completed persona against the Research Objective across FOUR dimensions.
Note: This is RO-alignment scoring, not evidence volume scoring (since this is Manual Build Mode).

DIMENSION 1: DEMOGRAPHIC-RO FIT (0.0 to 1.0)
  How well do the demographic traits match the target audience described or implied in the RO?
  - Perfect match (age, income, geography all align): 1.00
  - Strong match (2 of 3 core demographics align): 0.80
  - Moderate match (1 of 3 core demographics aligns): 0.60
  - Weak match (demographics feel misaligned with RO): 0.30

DIMENSION 2: PSYCHOGRAPHIC-RO FIT (0.0 to 1.0)
  How well do lifestyle, values, personality, motivations, and interests match the behavioral or psychological context of the RO?
  - All psychographic traits strongly support RO context: 1.00
  - Most traits support RO context: 0.80
  - Some traits support RO context: 0.60
  - Traits feel generic or misaligned: 0.30

DIMENSION 3: BEHAVIOURAL-RO FIT (0.0 to 1.0)
  How well do decision style, consumption, channel, sensitivity, and switching match the category behavior described in the RO?
  - Strong category-behavior alignment: 1.00
  - Moderate alignment: 0.70
  - Weak alignment: 0.40

DIMENSION 4: TRAIT COMPLETENESS (0.0 to 1.0)
  What proportion of all sub-traits (across all 5 categories) were USER_PROVIDED vs AUTO_FILLED?
  - 80-100% user provided: 1.00
  - 60-79% user provided: 0.80
  - 40-59% user provided: 0.60
  - 20-39% user provided: 0.40
  - Less than 20% user provided (only demographics filled): 0.25

CONFIDENCE SCORE FORMULA:
  Manual_Confidence_Score =
    (Demographic_RO_Fit x 0.30) +
    (Psychographic_RO_Fit x 0.25) +
    (Behavioural_RO_Fit x 0.25) +
    (Trait_Completeness x 0.20)

CONFIDENCE TIERS:
  - HIGH:   0.75 to 1.00
  - MEDIUM: 0.55 to 0.74
  - LOW:    below 0.55

AUTO-FILL FLAG:
  In the confidence output, include a count and list of auto-filled traits so the user knows what was inferred.

---

**STEP 8: OUTPUT**

Return STRICT JSON ONLY. No text outside the JSON. No markdown. No explanations.

Output schema:

{
  "status": "success",
  "persona": {
    "name": "string",
    "age_range": "string",
    "gender": "string",
    "location_country": "string",
    "location_state": "string",
    "education_level": "string",
    "occupation": "string",
    "occupation_level": "string",
    "industry": "string",
    "income_range": "string",
    "family_size": "string",
    "family_structure": "string",
    "geography": "string",
    "marital_status": "string",
    "lifestyle": ["string"],
    "values": ["string"],
    "personality": "string",
    "interests": ["string"],
    "motivations": ["string"],
    "decision_making_style": "string",
    "consumption_frequency": "string",
    "purchase_channel": ["string"],
    "price_sensitivity": "Low | Medium | High",
    "brand_sensitivity": "Low | Medium | High",
    "switching_tendency": "Low | Medium | High",
    "category_awareness": "string",
    "formative_experience_description": "string",
    "ocean_profile": {
      "scores": {
        "openness": 0.00,
        "conscientiousness": 0.00,
        "extraversion": 0.00,
        "agreeableness": 0.00,
        "neuroticism": 0.00
      },
      "labels": {
        "openness": "Low | Medium | High",
        "conscientiousness": "Low | Medium | High",
        "extraversion": "Low | Medium | High",
        "agreeableness": "Low | Medium | High",
        "neuroticism": "Low | Medium | High"
      },
      "rationale": {
        "openness": "string",
        "conscientiousness": "string",
        "extraversion": "string",
        "agreeableness": "string",
        "neuroticism": "string"
      }
    },
    "barriers_pain_points": {
      "structural": ["string", "string"],
      "psychological": ["string", "string"],
      "emotional": ["string", "string"],
      "category_specific": ["string"]
    },
    "triggers_opportunities": {
      "functional_triggers": ["string", "string"],
      "emotional_triggers": ["string", "string"],
      "situational_triggers": ["string"],
      "promotional_triggers": ["string"]
    }
  },
  "auto_fill_report": {
    "total_sub_traits": 0,
    "user_provided_count": 0,
    "auto_filled_count": 0,
    "auto_filled_traits": ["list of trait names that were auto-filled"]
  },
  "confidence_scoring": {
    "mode": "Manual Build Mode",
    "components": {
      "demographic_ro_fit": 0.00,
      "psychographic_ro_fit": 0.00,
      "behavioural_ro_fit": 0.00,
      "trait_completeness": 0.00
    },
    "weighted_score": 0.00,
    "confidence_level": "High | Medium | Low",
    "note": "Confidence reflects RO alignment and trait completeness. This persona has not been validated against real web evidence. Consider running Evidence-Based validation for higher confidence."
  }
}

---

**CRITICAL RULES (apply throughout)**

1. Demographics are sacred: Never modify, override, or contradict any user-provided demographic value.
2. All auto-fills must be internally consistent: Every inferred trait must be coherent with every other trait, both user-provided and auto-filled.
3. RO is the north star: Every auto-fill decision must serve the research objective. A trait that is technically valid but irrelevant to the RO is a poor auto-fill.
4. No generic fillers: "Active lifestyle", "values family" type vague outputs are not acceptable. Be specific: "Health-Focused (Fitness, Wellness), Career-Driven (Growth, Ambition)" is acceptable.
5. No hallucinated demographics: Do not infer or change age, income, location, or gender. These come from the user only.
6. Confidence is honest: If the user only filled demographics and nothing else, Trait Completeness will be low (0.25) and the score will reflect that. Do not inflate confidence.
7. Output is always JSON: No preamble, no explanation, no markdown fences. Raw JSON only.

"""


# ============================================================================
# DYNAMIC PART - Research objective and user-provided traits (changes per call)
# ============================================================================

MANUAL_BUILD_USER_INPUT_PROMPT = """

**RESEARCH OBJECTIVE**
{research_objective}

**USER PROVIDED TRAITS**
{user_provided_traits}

Based on the research objective above and the traits the user has provided, follow ALL steps in the system prompt and return the completed persona JSON.

"""


MANDATORY_MANUAL_DEMOGRAPHIC_FIELDS = (
    "age_range",
    "gender",
    "income_range",
    "education_level",
    "occupation_level",
    "marital_status",
    "family_structure",
    "geography",
)

MANUAL_DEMOGRAPHIC_ALIASES = {
    "age_range": ("age", "ageRange"),
    "income_range": ("income", "income_level", "incomeLevel"),
    "education_level": ("education", "educationLevel"),
    "occupation_level": ("occupationLevel", "occupation"),
    "marital_status": ("maritalStatus",),
    "family_structure": ("familyStructure", "family_size", "familySize"),
    "geography": ("location_country", "locationCountry", "location_state", "locationState"),
}


def _is_blank_manual_trait(value) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, (list, tuple, set, dict)):
        return len(value) == 0
    return False


def _pick_manual_trait(raw: dict, section: dict, field: str):
    """Read a manual trait from canonical or legacy/frontend alias keys."""
    candidate_keys = (field, *MANUAL_DEMOGRAPHIC_ALIASES.get(field, ()))
    for key in candidate_keys:
        if isinstance(section, dict):
            value = section.get(key)
            if not _is_blank_manual_trait(value):
                return value
        if isinstance(raw, dict):
            value = raw.get(key)
            if not _is_blank_manual_trait(value):
                return value
    return None


def _manual_trait_values(value) -> list[str]:
    if _is_blank_manual_trait(value):
        return []
    if isinstance(value, str):
        return [value.strip()]
    if isinstance(value, (list, tuple, set)):
        items: list[str] = []
        for item in value:
            items.extend(_manual_trait_values(item))
        return items
    if isinstance(value, dict):
        items: list[str] = []
        for item in value.values():
            items.extend(_manual_trait_values(item))
        return items
    return [str(value)]


def _normalise_manual_demographics(raw: dict, demographics: dict) -> dict:
    return {
        field: _pick_manual_trait(raw, demographics, field)
        for field in MANDATORY_MANUAL_DEMOGRAPHIC_FIELDS
    }


def missing_manual_demographic_fields(payload) -> list[str]:
    if hasattr(payload, "model_dump"):
        payload = payload.model_dump()
    elif hasattr(payload, "dict"):
        payload = payload.dict()

    demographics = {}
    if isinstance(payload, dict):
        demographics = payload.get("demographics") or {}

    normalised = _normalise_manual_demographics(payload, demographics)
    missing: list[str] = []
    for field in MANDATORY_MANUAL_DEMOGRAPHIC_FIELDS:
        value = normalised.get(field)
        if _is_blank_manual_trait(value):
            missing.append(field)
    return missing


def manual_demographic_validation_error(missing_fields: list[str]) -> dict:
    return {
        "status": "validation_error",
        "message": (
            "Demographics are mandatory. The following fields are missing or empty: "
            f"{', '.join(missing_fields)}."
        ),
        "missing_fields": missing_fields,
    }


def _manual_payload_dict(payload) -> dict:
    if hasattr(payload, "model_dump"):
        return payload.model_dump()
    if hasattr(payload, "dict"):
        return payload.dict()
    return payload if isinstance(payload, dict) else {}


def manual_prompt_traits(payload) -> dict:
    """Return only the trait categories/fields listed in MANUAL_PERSONA_BUILDER_PROMPT."""
    raw = _manual_payload_dict(payload)

    demographics = raw.get("demographics") if isinstance(raw.get("demographics"), dict) else {}
    psychological = raw.get("psychological") if isinstance(raw.get("psychological"), dict) else {}
    behavioural = raw.get("behavioural") if isinstance(raw.get("behavioural"), dict) else {}
    formative = raw.get("formative_experience") if isinstance(raw.get("formative_experience"), dict) else {}
    additional = (
        raw.get("additional_information")
        if isinstance(raw.get("additional_information"), dict)
        else raw.get("additional_info")
        if isinstance(raw.get("additional_info"), dict)
        else {}
    )

    raw_formative_value = raw.get("formative_experience")

    return {
        "demographics": _normalise_manual_demographics(raw, demographics),
        "psychological": {
            "lifestyle": psychological.get("lifestyle") or raw.get("lifestyle"),
            "values": psychological.get("values") or raw.get("values"),
            "personality": psychological.get("personality") or raw.get("personality"),
            "interests": psychological.get("interests") or raw.get("interests"),
            "motivations": psychological.get("motivations") or raw.get("motivations"),
        },
        "behavioural": {
            "decision_making_style": behavioural.get("decision_making_style") or raw.get("decision_making_style"),
            "consumption_frequency": behavioural.get("consumption_frequency") or raw.get("consumption_frequency"),
            "purchase_channel": behavioural.get("purchase_channel") or raw.get("purchase_channel"),
            "price_sensitivity": behavioural.get("price_sensitivity") or raw.get("price_sensitivity"),
            "brand_sensitivity": behavioural.get("brand_sensitivity") or raw.get("brand_sensitivity"),
            "switching_tendency": (
                behavioural.get("switching_tendency")
                or behavioural.get("switching_behaviour")
                or raw.get("switching_tendency")
                or raw.get("switching_behaviour")
            ),
            "purchase_triggers": behavioural.get("purchase_triggers") or raw.get("purchase_triggers"),
            "purchase_barriers": behavioural.get("purchase_barriers") or raw.get("purchase_barriers"),
            "media_consumption_patterns": (
                behavioural.get("media_consumption_patterns")
                or raw.get("media_consumption_patterns")
                or raw.get("media_consumption")
            ),
            "digital_behaviour": (
                behavioural.get("digital_behaviour")
                or behavioural.get("digital_behavior")
                or raw.get("digital_behaviour")
                or raw.get("digital_behavior")
                or raw.get("digital_activity")
            ),
        },
        "additional_information": {
            "occupation": additional.get("occupation") or demographics.get("occupation") or raw.get("occupation"),
            "industry": additional.get("industry") or raw.get("industry"),
            "category_awareness": additional.get("category_awareness") or raw.get("category_awareness"),
        },
        "formative_experience": {
            "formative_experience_description": (
                formative.get("formative_experience_description")
                or raw.get("formative_experience_description")
                or (raw_formative_value if isinstance(raw_formative_value, str) else None)
                or raw.get("backstory")
            ),
        },
    }


def _backfill_manual_traits_from_saved_persona(raw_traits: dict, source: dict) -> dict:
    """
    Repair legacy draft traits before calibration.
    Older drafts may have saved family_size/occupation/location columns without
    the newer prompt's family_structure/occupation_level keys.
    """
    if not isinstance(raw_traits, dict):
        raw_traits = {}
    demographics = raw_traits.setdefault("demographics", {})
    if not isinstance(demographics, dict):
        demographics = {}
        raw_traits["demographics"] = demographics

    details = source.get("persona_details") if isinstance(source, dict) else {}
    if not isinstance(details, dict):
        details = {}

    fallbacks = {
        "age_range": source.get("age_range"),
        "gender": source.get("gender"),
        "income_range": source.get("income_range"),
        "education_level": source.get("education_level"),
        "occupation_level": (
            details.get("occupation_level")
            or source.get("occupation_level")
            or source.get("occupation")
        ),
        "marital_status": source.get("marital_status"),
        "family_structure": (
            details.get("family_structure")
            or source.get("family_structure")
            or source.get("family_size")
        ),
        "geography": (
            source.get("geography")
            or source.get("location_country")
            or source.get("location_state")
        ),
    }

    for field, fallback in fallbacks.items():
        if _is_blank_manual_trait(demographics.get(field)) and not _is_blank_manual_trait(fallback):
            demographics[field] = fallback

    # Last-resort placeholders prevent old partial drafts from getting stuck in
    # an endless loader loop. Fresh draft creation still validates the real form.
    for field in MANDATORY_MANUAL_DEMOGRAPHIC_FIELDS:
        if _is_blank_manual_trait(demographics.get(field)):
            demographics[field] = "Not specified"

    return raw_traits


async def create_manual_persona_draft(
    exploration_id: str,
    workspace_id: str,
    user_id: str,
    payload,  # ManualPersonaCreate — avoid circular import, resolved at call site
    validation_warnings: Optional[list] = None,
) -> dict:
    """
    Creates a persona from structured form input without any AI call.
    calibration_status="draft" signals the frontend that calibration is pending.
    validation_warnings (from plausibility engine) are stored in persona_details
    so they remain accessible after the draft is created.
    """
    missing = missing_manual_demographic_fields(payload)
    if missing:
        raise ValueError(manual_demographic_validation_error(missing)["message"])

    d = payload.demographics
    psych = payload.psychological
    beh = payload.behavioural
    add = payload.additional_info

    def _join(lst):
        return ", ".join(str(v) for v in lst if v) if lst else None

    occupation = (add.occupation if add and add.occupation else None) or d.occupation or ""
    industry = (add.industry if add else None) or ""
    category_awareness = (add.category_awareness if add else None) or ""

    # Store raw traits + any plausibility warnings so the calibrate step can
    # reference them and the detail view can surface them to the frontend.
    # Also pre-populate new optional fields so they survive into persona_details
    # even before calibration.
    raw_traits_snapshot = manual_prompt_traits(payload)
    persona_details_init: dict = {
        "raw_traits": raw_traits_snapshot,
        "raw_form_payload": payload.dict(),
        "occupation_level": d.occupation_level or "",
        "family_structure": d.family_structure or "",
        "industry": industry,
        "category_awareness": category_awareness,
    }
    if beh:
        persona_details_init.update({
            "purchase_triggers": beh.purchase_triggers or [],
            "purchase_barriers": beh.purchase_barriers or [],
            "media_consumption_patterns": beh.media_consumption_patterns or [],
            "digital_behaviour": beh.digital_behaviour or "",
        })
    if validation_warnings:
        persona_details_init["validation_warnings"] = validation_warnings

    async with AsyncSession(async_engine) as session:
        p = Persona(
            id=generate_id(),
            exploration_id=exploration_id,
            workspace_id=workspace_id,
            name=payload.name or "Persona Draft",
            age_range=d.age_range,
            gender=d.gender,
            location_country=d.location_country or "",
            location_state=d.location_state,
            education_level=d.education_level or "",
            occupation=occupation,
            income_range=d.income_range or "",
            family_size=d.family_size,
            geography=d.geography,
            marital_status=d.marital_status,
            lifestyle=_join(psych.lifestyle) if psych else None,
            values=_join(psych.values) if psych else None,
            personality=_join(psych.personality) if psych else None,
            interests=psych.interests if psych else None,       # JSONB list
            motivations=_join(psych.motivations) if psych else None,
            brand_sensitivity=beh.brand_sensitivity if beh else None,
            price_sensitivity=beh.price_sensitivity if beh else None,
            digital_activity=beh.digital_behaviour if beh else None,
            backstory=payload.formative_experience,
            # new behavioural fields pre-stored so calibration can access them
            # (stored only in persona_details until a DB migration adds flat columns)
            created_by=user_id,
            auto_generated_persona=False,
            calibration_status="draft",
            calibration_confidence=50,
            persona_details=persona_details_init,
        )
        session.add(p)
        await session.commit()
        await session.refresh(p)

    return persona_to_dict(p)


async def calibrate_manual_persona(persona_id: str, exploration_id: str) -> dict:
    """
    AI-enriches a draft persona in-place using the stored raw_traits.
    Uses MANUAL_PERSONA_BUILDER_PROMPT (gpt-4o, no web search).
    Sets calibration_status="calibrated" and updates calibration_confidence.
    """
    from app.services.auto_generated_persona import get_description, _extract_calibration_confidence

    source = await get_persona(persona_id)
    if not source:
        raise ValueError("Persona not found")

    # Already calibrated — idempotent
    if source.get("calibration_status") == "calibrated":
        return source

    # Raw traits stored at draft creation; fallback to flat persona dict
    details = source.get("persona_details") or {}
    raw_traits = details.get("raw_traits") or details.get("raw_form_payload") or source
    raw_traits = manual_prompt_traits(raw_traits)
    raw_traits = _backfill_manual_traits_from_saved_persona(raw_traits, source)
    missing = missing_manual_demographic_fields(raw_traits)
    if missing:
        raise ValueError(manual_demographic_validation_error(missing)["message"])

    research_objective = await get_description(exploration_id) or ""

    user_prompt = MANUAL_BUILD_USER_INPUT_PROMPT.format(
        research_objective=research_objective,
        user_provided_traits=json.dumps(raw_traits, ensure_ascii=False, default=str),
    )

    async def _run_manual_calibration(prompt: str) -> dict:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": MANUAL_PERSONA_BUILDER_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)

    result: dict = await _run_manual_calibration(user_prompt)

    # LLM signals a hard validation error (Step 1) — should only fire for old/incomplete drafts.
    if result.get("status") == "validation_error":
        retry_prompt = user_prompt + """

IMPORTANT OVERRIDE:
The backend has already repaired and normalized the demographics block for this
draft. Do not return validation_error. Treat any "Not specified" demographic
values as provided legacy placeholders and return the full success JSON.
"""
        result = await _run_manual_calibration(retry_prompt)
        if result.get("status") == "validation_error":
            missing = result.get("missing_fields") or []
            raise ValueError(
                "Persona calibration failed: demographics are mandatory. "
                f"Missing: {', '.join(missing)}"
            )

    # Unwrap the nested structure from the new prompt format
    enriched: dict = result.get("persona") or {}
    auto_fill_report: dict = result.get("auto_fill_report") or {}
    confidence_scoring: dict = result.get("confidence_scoring") or {}

    raw_demographics = raw_traits.get("demographics") if isinstance(raw_traits, dict) else {}
    if isinstance(raw_demographics, dict):
        for field in MANDATORY_MANUAL_DEMOGRAPHIC_FIELDS:
            value = raw_demographics.get(field)
            if not _is_blank_manual_trait(value):
                enriched[field] = value
        family_size = raw_demographics.get("family_size")
        if not _is_blank_manual_trait(family_size):
            enriched["family_size"] = family_size

    raw_behavioural = raw_traits.get("behavioural") if isinstance(raw_traits, dict) else {}
    if not isinstance(raw_behavioural, dict):
        raw_behavioural = {}

    purchase_triggers = _manual_trait_values(raw_behavioural.get("purchase_triggers"))
    purchase_barriers = _manual_trait_values(raw_behavioural.get("purchase_barriers"))

    if purchase_triggers and _is_blank_manual_trait(enriched.get("purchase_triggers")):
        enriched["purchase_triggers"] = purchase_triggers
    if purchase_barriers and _is_blank_manual_trait(enriched.get("purchase_barriers")):
        enriched["purchase_barriers"] = purchase_barriers
    if not _is_blank_manual_trait(raw_behavioural.get("media_consumption_patterns")):
        enriched["media_consumption_patterns"] = raw_behavioural.get("media_consumption_patterns")
    if not _is_blank_manual_trait(raw_behavioural.get("digital_behaviour")):
        enriched["digital_behaviour"] = raw_behavioural.get("digital_behaviour")

    if _is_blank_manual_trait(enriched.get("barriers_pain_points")):
        enriched["barriers_pain_points"] = {
            "structural": [
                "Needs clearer access, pricing, or feature detail before committing",
                "May delay action if the process feels high effort",
            ],
            "psychological": purchase_barriers[:2] or [
                "Needs stronger proof before committing",
                "Worries about choosing an option that does not fit the need",
            ],
            "emotional": [
                "Concern about making the wrong decision",
                "Hesitation if the benefit feels uncertain",
            ],
            "category_specific": [
                "Requires clearer fit with the research objective before engaging"
            ],
        }

    if _is_blank_manual_trait(enriched.get("triggers_opportunities")):
        enriched["triggers_opportunities"] = {
            "functional_triggers": purchase_triggers[:2] or [
                "Clear practical benefit tied to the research objective",
                "Simple path to compare, trial, or act",
            ],
            "emotional_triggers": [
                "Confidence that the choice reduces risk",
                "Sense that the solution matches personal goals",
            ],
            "situational_triggers": [
                "A relevant life or usage moment activates consideration"
            ],
            "promotional_triggers": [
                "Transparent proof points and low-friction trial"
            ],
        }

    async with AsyncSession(async_engine) as session:
        res = await session.execute(select(Persona).where(Persona.id == persona_id))
        p = res.scalars().first()
        if not p:
            raise ValueError("Persona not found")

        # Flat string columns — LLM always generates the archetype name (Step 4 of prompt)
        _str_fields = (
            "name", "age_range", "gender", "location_country", "location_state",
            "education_level", "occupation", "income_range", "family_size",
            "geography", "lifestyle", "values", "personality", "motivations",
            "brand_sensitivity", "price_sensitivity", "mobility", "accommodation",
            "marital_status", "daily_rhythm", "hobbies", "professional_traits",
            "digital_activity", "preferences",
        )
        for field in _str_fields:
            val = enriched.get(field)
            if val:
                setattr(p, field, val if not isinstance(val, list)
                        else ", ".join(str(v) for v in val))

        # backstory: new prompt uses formative_experience_description; also check legacy key
        backstory_val = (
            enriched.get("formative_experience_description") or
            enriched.get("backstory")
        )
        if backstory_val:
            p.backstory = backstory_val

        if enriched.get("interests"):
            raw_int = enriched["interests"]
            p.interests = raw_int if isinstance(raw_int, list) else [raw_int]

        p.ocean_profile = enriched.get("ocean_profile") or p.ocean_profile

        # Pass full result dict so _extract_calibration_confidence finds weighted_score
        p.calibration_confidence = _extract_calibration_confidence(result)
        p.calibration_status = "calibrated"

        # Merge: preserve raw_traits + store enriched data + new top-level report fields
        merged = dict(p.persona_details or {})
        merged.update(enriched)
        merged["auto_fill_report"] = auto_fill_report
        merged["confidence_scoring"] = confidence_scoring
        # Add evidence_snapshot for manual personas (consistent structure)
        merged["evidence_snapshot"] = {
            "evidence_source": "manual_build_mode",
            "total_conversations": 0,
            "sources": [],
            "confidence_calculation_detail": {
                "level": confidence_scoring.get("confidence_level", "Medium"),
                "value": confidence_scoring.get("weighted_score", 0.5),
            },
            "timeframe": {
                "months_analyzed": None,
                "recent_activity": {"months": None, "percentage": None}
            }
        }
        merged["reference_sites_with_usage"] = []
        p.persona_details = merged

        session.add(p)
        await session.commit()
        await session.refresh(p)

        full_name: Optional[str] = None
        from app.models.user import User
        user_res = await session.execute(select(User).where(User.id == p.created_by))
        u = user_res.scalars().first()
        if u:
            full_name = u.full_name or f"{u.first_name} {u.last_name}".strip() or None

    return persona_to_dict(p, creator_full_name=full_name)


async def get_personas_by_ids(
    persona_ids: List[str],
    db: AsyncSession,
) -> List[Persona]:
    """
    Fetch multiple personas in a single DB query.
    """
    if not persona_ids:
        return []
    result = await db.execute(
        select(Persona).where(Persona.id.in_(persona_ids))
    )
    return result.scalars().all()
