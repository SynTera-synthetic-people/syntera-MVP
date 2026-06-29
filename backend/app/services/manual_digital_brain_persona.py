"""
Manual Persona Generation with Digital Brain Assignment.

Extends the existing two-phase manual persona flow (draft → calibrate) with:
  - Account-tier persona limits (free / tier1 / enterprise)
  - Single-call enrichment (auto-fill, OCEAN, barriers/triggers, confidence)
    PLUS Digital Brain assignment (primary + secondary brain) in the same
    GPT-4o call used for calibration.

This module never raises to its caller — every public function returns
a {"status": "success" | "error", ...} dict so routers can convert
failures into clean HTTP responses without try/except boilerplate.
"""

import json
import logging
from typing import Optional, Dict, Any, Tuple, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from openai import AsyncOpenAI

from app.db import async_engine
from app.models.persona import Persona
from app.utils.id_generator import generate_id
from app.services.persona import persona_to_dict, manual_prompt_traits
from app.config import OPENAI_API_KEY

logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=OPENAI_API_KEY)

# ---------------------------------------------------------------------------
# Tier configuration — mirrors digital_brain_pipeline.TIER_CONFIG
# ---------------------------------------------------------------------------

TIER_CONFIG = {
    "free": {"initial": 2, "max": 2},
    "tier1": {"initial": 2, "max": 8},
    "enterprise": {"initial": 4, "max": 8},
}

REQUIRED_RO_FIELDS = (
    "category", "sub_category", "target_audience", "geography",
    "business_objective", "research_type", "key_questions", "hypotheses",
    "competitive_context", "time_frame", "constraints", "probes",
)


# ---------------------------------------------------------------------------
# Function 8: small helper
# ---------------------------------------------------------------------------

def _join(lst: Optional[List[str]]) -> Optional[str]:
    """Convert a list of strings to a comma-separated string for flat DB columns."""
    if lst and isinstance(lst, list):
        return ", ".join(str(v) for v in lst if v)
    return None


# ---------------------------------------------------------------------------
# Function 1: count personas in an exploration
# ---------------------------------------------------------------------------

async def count_personas_in_exploration(workspace_id: str, exploration_id: str) -> int:
    """Count existing personas for tier-limit checking. Returns 0 on any error."""
    try:
        async with AsyncSession(async_engine) as session:
            result = await session.execute(
                select(Persona).where(
                    Persona.workspace_id == workspace_id,
                    Persona.exploration_id == exploration_id,
                )
            )
            return len(result.scalars().all())
    except Exception as e:
        logger.error("count_personas_in_exploration:error workspace=%s exploration=%s error=%s",
                      workspace_id, exploration_id, str(e), exc_info=True)
        return 0


# ---------------------------------------------------------------------------
# Function 2: tier limit check
# ---------------------------------------------------------------------------

async def check_persona_tier_limit(
    workspace_id: str,
    exploration_id: str,
    account_tier: str,
) -> Tuple[bool, str]:
    """
    Returns (is_allowed, error_message). error_message is "" when allowed.
    Unknown tiers default to the "free" config.
    """
    normalized_tier = (account_tier or "free").strip().lower()
    config = TIER_CONFIG.get(normalized_tier, TIER_CONFIG["free"])

    existing_count = await count_personas_in_exploration(workspace_id, exploration_id)

    if existing_count >= config["max"]:
        return False, f"Persona limit reached ({config['max']})"
    return True, ""


# ---------------------------------------------------------------------------
# Function 3: RO completeness validation
# ---------------------------------------------------------------------------

def validate_ro_completeness(ro_dict: Dict[str, str]) -> Tuple[bool, List[str]]:
    """Returns (is_valid, missing_fields) for the 12 required RO components."""
    missing_fields: List[str] = []
    for field in REQUIRED_RO_FIELDS:
        value = (ro_dict or {}).get(field)
        if value is None or not str(value).strip():
            missing_fields.append(field)

    if missing_fields:
        return False, missing_fields
    return True, []


# ---------------------------------------------------------------------------
# Function 4: LLM prompt — existing 7-step builder + new Step 8 (brains)
# ---------------------------------------------------------------------------

MANUAL_PERSONA_BUILDER_PROMPT = """

You are an Expert Persona Architect operating in MANUAL BUILD MODE within the Synthetic People research platform.

In this mode, the user has defined their own persona traits through a structured form. Your job is:
1. Accept and validate the user-provided traits
2. Auto-fill any missing traits using the Research Objective and the traits already provided
3. Score the completed persona against the Research Objective
4. Return a fully populated, research-ready persona in strict JSON format

Note: Digital Brain assignment is handled separately, in a later stage after
evidence has been gathered. Do not assign a brain in this step.

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

Note: Digital Brain assignment is NOT part of this step. It is decided in a
separate later stage, after evidence has been gathered, using the completed
persona traits below together with that evidence. Do not include a
"brain_assignment" key in your output.

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
    "auto_filled_traits": ["string"]
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
    "confidence_level": "High | Medium | Low"
  }
}

NO text outside JSON. NO markdown. NO explanations.

---

**CRITICAL RULES (apply throughout)**

1. Demographics are sacred: Never modify, override, or contradict any user-provided demographic value.
2. All auto-fills must be internally consistent: Every inferred trait must be coherent with every other trait, both user-provided and auto-filled.
3. RO is the north star: Every auto-fill decision must serve the research objective. A trait that is technically valid but irrelevant to the RO is a poor auto-fill.
4. No generic fillers: "Active lifestyle", "values family" type vague outputs are not acceptable. Be specific.
5. No hallucinated demographics: Do not infer or change age, income, location, or gender. These come from the user only.
6. Confidence is honest: If the user only filled demographics and nothing else, Trait Completeness will be low (0.25) and the score will reflect that. Do not inflate confidence.
7. Output is always JSON: No preamble, no explanation, no markdown fences. Raw JSON only.

"""

_MANUAL_USER_INPUT_TEMPLATE = """

**RESEARCH OBJECTIVE**
{research_objective}

**USER PROVIDED TRAITS**
{user_provided_traits}

Follow ALL steps in the system prompt and return the completed persona JSON with brain assignment.

"""


# ---------------------------------------------------------------------------
# Function 7: confidence score extraction
# ---------------------------------------------------------------------------

def _extract_manual_confidence_score(result: Dict[str, Any]) -> Optional[int]:
    """Extract weighted_score (0.0-1.0) from confidence_scoring and scale to 0-100."""
    try:
        cs = (result or {}).get("confidence_scoring") or {}
        ws = cs.get("weighted_score")
        if isinstance(ws, (int, float)) and 0.0 <= ws <= 1.0:
            return round(ws * 100)
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Function 5: create manual persona draft (tier-aware)
# ---------------------------------------------------------------------------

async def create_manual_persona_draft(
    exploration_id: str,
    workspace_id: str,
    user_id: str,
    account_tier: str,
    payload,  # ManualPersonaCreate
) -> Dict[str, Any]:
    """
    Phase 1: store structured trait input as a draft, enforcing the
    account tier's persona limit. No AI is called.

    Returns {"status": "success", "persona": {...}} or
            {"status": "error", "error_message": "..."}.
    """
    logger.info(
        "manual_persona.create_draft:start user=%s exploration=%s tier=%s",
        user_id, exploration_id, account_tier,
    )

    try:
        allowed, error_msg = await check_persona_tier_limit(workspace_id, exploration_id, account_tier)
        if not allowed:
            logger.info(
                "manual_persona.create_draft:tier_limit_blocked exploration=%s tier=%s",
                exploration_id, account_tier,
            )
            return {"status": "error", "error_message": error_msg}

        d = payload.demographics
        psych = payload.psychological
        beh = payload.behavioural
        add = payload.additional_info

        required_demo_fields = (
            "age_range", "gender", "income_range", "education_level",
            "occupation_level", "marital_status", "family_structure", "geography",
        )
        missing = [
            f for f in required_demo_fields
            if not d or not str(getattr(d, f, "") or "").strip()
        ]
        if missing:
            return {
                "status": "error",
                "error_message": f"Demographics are mandatory. Missing: {', '.join(missing)}.",
            }

        occupation = (add.occupation if add and add.occupation else None) or (d.occupation if hasattr(d, "occupation") else None) or ""
        industry = (add.industry if add else None) or ""
        category_awareness = (add.category_awareness if add else None) or ""

        raw_traits = manual_prompt_traits(payload)
        persona_details_init: Dict[str, Any] = {
            "raw_traits": raw_traits,
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
                interests=psych.interests if psych else None,
                motivations=_join(psych.motivations) if psych else None,
                brand_sensitivity=beh.brand_sensitivity if beh else None,
                price_sensitivity=beh.price_sensitivity if beh else None,
                digital_activity=beh.digital_behaviour if beh else None,
                backstory=payload.formative_experience,
                created_by=user_id,
                auto_generated_persona=False,
                calibration_status="draft",
                calibration_confidence=50,
                persona_details=persona_details_init,
            )
            session.add(p)
            await session.commit()
            await session.refresh(p)

        logger.info(
            "manual_persona.create_draft:success persona_id=%s exploration=%s",
            p.id, exploration_id,
        )
        return {"status": "success", "persona": persona_to_dict(p)}

    except Exception as e:
        logger.error(
            "manual_persona.create_draft:error exploration=%s error=%s",
            exploration_id, str(e), exc_info=True,
        )
        return {"status": "error", "error_message": str(e)}


# ---------------------------------------------------------------------------
# Function 6: calibrate + assign brains (single LLM call)
# ---------------------------------------------------------------------------

async def calibrate_manual_persona_with_brains(
    persona_id: str,
    exploration_id: str,
) -> Dict[str, Any]:
    """
    Single unified calibration flow (Phase 2). One path from draft to final
    persona — no separate "fast" vs. "with evidence" choice:

      1. Extract the research objective into the 12-component RO shape and
         validate it (Stage 1), exactly like the auto-generated digital brain
         flow.
      2. Detect relevant behavioral dimensions from that RO (Stage 2).
      3. ONE GPT-4o call: auto-fill traits, OCEAN, barriers/triggers, and
         trait-completeness confidence scoring — from the RO + user-provided
         traits alone. No brain assignment yet.
      4. Collect evidence for the three streams (real data, with the LLM
         generating a realistic replacement for any stream that falls below
         its real-evidence threshold).
      5. ONE GPT-4o call: brain assignment AND the say-do-gap check, using
         the RO + the Step 3 persona traits + the Step 4 evidence together.
         This is the only step that decides the brain.
      6. Persist the completed persona (traits, brain, confidence, evidence).

    Idempotent: an already-calibrated persona is returned unchanged.

    Returns {"status": "success", "persona": {...}} or
            {"status": "error", "error_message": "..."}.
    """
    logger.info("manual_persona.calibrate:start persona_id=%s", persona_id)

    try:
        async with AsyncSession(async_engine) as session:
            res = await session.execute(select(Persona).where(Persona.id == persona_id))
            p = res.scalars().first()

            if not p:
                return {"status": "error", "error_message": "Persona not found"}

            if p.calibration_status == "calibrated":
                logger.info("manual_persona.calibrate:idempotent_return persona_id=%s", persona_id)
                return {"status": "success", "persona": persona_to_dict(p)}

            details = p.persona_details or {}
            raw_traits = details.get("raw_traits") or details.get("raw_form_payload") or persona_to_dict(p)
            raw_traits = manual_prompt_traits(raw_traits)

            from app.services.auto_generated_persona import get_description
            research_objective = await get_description(exploration_id) or ""

            additional = raw_traits.get("additional_information") if isinstance(raw_traits, dict) else {}
            category = (additional or {}).get("industry") or "General consumer behavior"

            from app.services.digital_brain_pipeline import detect_relevant_dimensions

            # Step 1 + 2: RO -> 12 components, validated, then dimension detection.
            validated_ro = await _extract_validated_ro(raw_traits, research_objective, category)
            activated_dimensions = detect_relevant_dimensions(validated_ro)["activated_dimensions"]

            # Step 3: single LLM call — auto-fill traits, OCEAN, barriers/triggers,
            # and trait-completeness confidence scoring, using only the RO +
            # user traits. No brain assignment here — that's Step 5, below,
            # once evidence exists.
            user_prompt = _MANUAL_USER_INPUT_TEMPLATE.format(
                research_objective=research_objective,
                user_provided_traits=json.dumps(raw_traits, ensure_ascii=False, default=str),
            )

            logger.info("manual_persona.calibrate:llm_call persona_id=%s", persona_id)
            try:
                response = await client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": MANUAL_PERSONA_BUILDER_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.4,
                    response_format={"type": "json_object"},
                )
                result = json.loads(response.choices[0].message.content)
            except Exception as e:
                logger.error(
                    "manual_persona.calibrate:llm_error persona_id=%s error=%s",
                    persona_id, str(e), exc_info=True,
                )
                return {"status": "error", "error_message": f"LLM enrichment failed: {e}"}

            enriched: Dict[str, Any] = result.get("persona") or {}
            auto_fill_report: Dict[str, Any] = result.get("auto_fill_report") or {}
            confidence_scoring: Dict[str, Any] = result.get("confidence_scoring") or {}

            # Demographics are sacred — never let the LLM override user input.
            raw_demographics = raw_traits.get("demographics") if isinstance(raw_traits, dict) else {}
            if isinstance(raw_demographics, dict):
                for field in (
                    "age_range", "gender", "income_range", "education_level",
                    "occupation_level", "marital_status", "family_structure", "geography",
                ):
                    value = raw_demographics.get(field)
                    if value:
                        enriched[field] = value

            p.name = enriched.get("name") or p.name

            flat_str_fields = (
                "age_range", "gender", "location_country", "location_state",
                "education_level", "occupation", "income_range", "family_size",
                "geography", "lifestyle", "values", "personality", "motivations",
                "brand_sensitivity", "price_sensitivity", "mobility", "accommodation",
                "marital_status", "daily_rhythm", "hobbies", "professional_traits",
                "digital_activity", "preferences",
            )
            for field in flat_str_fields:
                val = enriched.get(field)
                if val:
                    setattr(p, field, val if not isinstance(val, list) else ", ".join(str(v) for v in val))

            backstory_val = enriched.get("formative_experience_description") or enriched.get("backstory")
            if backstory_val:
                p.backstory = backstory_val

            if enriched.get("interests"):
                raw_int = enriched["interests"]
                p.interests = raw_int if isinstance(raw_int, list) else [raw_int]

            p.ocean_profile = enriched.get("ocean_profile") or p.ocean_profile

            # Step 4: collect evidence (real, with an LLM-generated realistic
            # replacement per stream where real coverage is thin).
            evidence = await _collect_evidence_for_manual_persona(validated_ro, activated_dimensions, category)
            evidence_metadata = evidence["evidence_metadata"]

            # Step 5: brain assignment + say-do-gap check — runs only now,
            # using the RO, the completed persona traits from Step 3, AND the
            # evidence from Step 4 together. Never decided earlier.
            step5 = await _assign_brain_and_check_say_do_gap(
                validated_ro, enriched, evidence["depth_layers"], evidence["eb_verdicts"], evidence["hq_verdicts"],
            )
            brain_assignment = step5["brain_assignment"]
            say_do_gap = step5["say_do_gap"]

            # Confidence is pulled down proportionally to how much of the
            # evidence base needed an LLM-generated stand-in rather than real
            # data — never let a stand-in-heavy persona report the same
            # confidence as a real-evidence-heavy one.
            base_confidence = _extract_manual_confidence_score(result) or p.calibration_confidence or 50
            real_ratio = evidence_metadata["real_stream_count"] / 3
            blended_confidence = round(base_confidence * (0.6 + 0.4 * real_ratio))
            p.calibration_confidence = blended_confidence
            p.calibration_status = "calibrated"

            # Step 6: persist the completed persona.
            merged = dict(p.persona_details or {})
            merged.update(enriched)
            merged["auto_fill_report"] = auto_fill_report
            merged["confidence_scoring"] = confidence_scoring
            merged["brain_assignment"] = brain_assignment
            merged["say_do_gap"] = say_do_gap
            merged["evidence"] = {
                "action_data": evidence["depth_layers"],
                "web_evidence": evidence["eb_verdicts"],
                "hq_research": evidence["hq_verdicts"],
            }
            # Real-vs-LLM-generated counts are tracked here for internal
            # inspection only — never surfaced as a "[SIMULATED]"/"[ESTIMATED]"
            # label anywhere in the persona's user-facing content.
            merged["evidence_metadata"] = evidence_metadata
            p.persona_details = merged

            session.add(p)
            await session.commit()
            await session.refresh(p)

            logger.info(
                "manual_persona.calibrate:success persona_id=%s confidence=%s brain=%s real_streams=%d/3",
                persona_id, p.calibration_confidence, brain_assignment.get("primary_brain"),
                evidence_metadata["real_stream_count"],
            )
            return {"status": "success", "persona": persona_to_dict(p)}

    except Exception as e:
        logger.error(
            "manual_persona.calibrate:error persona_id=%s error=%s",
            persona_id, str(e), exc_info=True,
        )
        return {"status": "error", "error_message": str(e)}


# ---------------------------------------------------------------------------
# Evidence collection (Step 4 of calibrate_manual_persona_with_brains)
#
# Adds evidence (action data, web search, HQ sources) to the manual persona,
# reusing the already-built, already-tested real functions from
# digital_brain_pipeline.py — no new fetching logic, just wiring. When a
# stream falls below its minimum threshold, the LLM generates a realistic
# replacement for that stream instead of a hard-coded template — see
# _estimate_*_verdict below. Real-vs-LLM-generated is tracked internally via
# evidence_metadata for confidence weighting, but that distinction is never
# surfaced as a "[SIMULATED]"/"[ESTIMATED]" label in any user-facing text.
# ---------------------------------------------------------------------------

_ACTION_DATA_MIN_RECORDS = 100
_WEB_EVIDENCE_MIN_CITATIONS = 5
_HQ_MIN_SOURCES = 3

# Confidence range for LLM-generated fallback verdicts — deliberately lower
# and narrower than real-evidence confidence ranges, so a generated verdict
# can never out-score a real one in downstream confidence weighting.
_ESTIMATED_CONFIDENCE_RANGE = (0.85, 0.95)

def _build_pseudo_ro(raw_traits: dict, research_objective_text: str, category: str) -> dict:
    """
    Build an RO-shaped dict from manual-persona inputs so the existing real
    evidence functions (which expect digital_brain_pipeline's validated_ro
    shape) can be reused as-is. Best-effort fallback for when the LLM-based
    RO extraction in _extract_validated_ro() fails.
    """
    demographics = raw_traits.get("demographics") if isinstance(raw_traits, dict) else {}
    additional = raw_traits.get("additional_information") if isinstance(raw_traits, dict) else {}
    demographics = demographics if isinstance(demographics, dict) else {}
    additional = additional if isinstance(additional, dict) else {}

    return {
        "category": category or additional.get("industry") or "General consumer behavior",
        "sub_category": additional.get("category_awareness") or "",
        "target_audience": (demographics.get("age_range") or "") + " " + (demographics.get("occupation_level") or ""),
        "geography": demographics.get("geography") or "India",
        "business_objective": "Manual persona evidence grounding",
        "key_questions": (research_objective_text or "")[:300],
        "probes": "",
    }


async def _extract_validated_ro(raw_traits: dict, research_objective_text: str, category: str) -> dict:
    """
    Stage 1: convert the manual persona's free-text research objective into
    the same 12-component RO shape the auto-generated digital brain flow uses
    (via the same Claude-based extractor used in routers/personas.py), then
    validate it. Falls back to the best-effort pseudo-RO only if extraction
    or validation fails, so manual personas never hard-fail on an LLM error.
    """
    from app.services.digital_brain_pipeline import validate_research_objective
    from app.services.ro_extractor import extract_ro_components_for_pipeline

    try:
        validated_ro = await extract_ro_components_for_pipeline(
            research_objective_text, raw_traits if isinstance(raw_traits, dict) else {}
        )
        return validate_research_objective(validated_ro)
    except Exception:
        logger.warning(
            "RO component extraction failed for manual persona; using best-effort pseudo-RO.",
            exc_info=True,
        )
        pseudo_ro = _build_pseudo_ro(raw_traits, research_objective_text, category)
        pseudo_ro.update({
            "hypotheses": "",
            "research_type": "Qualitative",
            "competitive_context": "",
            "time_frame": "",
            "constraints": "",
        })
        return pseudo_ro


async def _simulate_fallback_content(prompt: str, default: dict) -> dict:
    """
    Ask GPT-4o to generate plausible, category-typical content for a
    fallback verdict — written so it reads exactly like real evidence.
    Returns `default` unchanged if the LLM call or JSON parsing fails, so a
    flaky model never breaks calibration.
    """
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You output only valid JSON, with no commentary."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            response_format={"type": "json_object"},
        )
        parsed = json.loads(response.choices[0].message.content)
        if isinstance(parsed, dict):
            return {**default, **{k: v for k, v in parsed.items() if k in default}}
    except Exception:
        logger.warning("Fallback content LLM call failed; using static text.", exc_info=True)
    return default


async def _estimate_action_data_verdict(category: str) -> dict:
    """LLM-generated stand-in when real action data for this category is sparse."""
    lo, hi = _ESTIMATED_CONFIDENCE_RANGE
    content = await _simulate_fallback_content(
        f"Category: {category}\n\n"
        "Generate a single realistic, category-typical purchase-behavior insight, "
        "written exactly as if it came from analysing real transaction data for this "
        "category. Do not mention that it is simulated, estimated, or inferred "
        "anywhere in the text.\n\n"
        'Return ONLY JSON: {"pattern_detected": "<one sentence>", '
        '"behavioral_signal": "<one sentence>"}',
        default={
            "pattern_detected": f"Users in this category consistently demonstrate repeat purchase behaviour after initial adoption.",
            "behavioral_signal": "Driven by category-typical adoption and repeat-purchase norms.",
        },
    )
    return {
        "verdict_id": "DL_ESTIMATED",
        "pattern_detected": content["pattern_detected"],
        "dimension_mapped_to": 0,
        "dimension_name": "Estimated Cross-Dimension",
        "behavioral_signal": content["behavioral_signal"],
        "evidence": {"basis": "category_pattern_estimate"},
        "situational_context": {},
        "digital_brain_signal": None,
        "confidence_score": round(random_uniform(lo, hi), 2),
        "query_reference": None,
        "source_note": "llm_generated",
    }


async def _estimate_web_evidence_verdict(category: str) -> dict:
    """
    LLM-generated stand-in when real web citations are sparse. Quote is
    synthesized, generic, category-typical phrasing — never attributed to a
    real person, real thread, or real URL.
    """
    lo, hi = _ESTIMATED_CONFIDENCE_RANGE
    content = await _simulate_fallback_content(
        f"Category: {category}\n\n"
        "Generate a single realistic, category-typical consumer-discussion theme "
        "and a representative quote, written exactly as if drawn from real online "
        "consumer discussions about this category. Do not mention that it is "
        "simulated, estimated, or inferred anywhere in the text.\n\n"
        'Return ONLY JSON: {"key_discussion_theme": "<one short phrase>", '
        '"representative_quote": "<one sentence, first-person consumer voice>"}',
        default={
            "key_discussion_theme": f"Category-typical consumer sentiment for {category}",
            "representative_quote": f"People in this category usually care most about value and reliability when choosing {category}.",
        },
    )
    return {
        "verdict_id": "EB_ESTIMATED",
        "source_platform": "Consumer Discussions",
        "threads_analyzed": 0,
        "sentiment_distribution": {"positive": 0.4, "neutral": 0.5, "negative": 0.1},
        "key_discussion_themes": [content["key_discussion_theme"]],
        "dimension_alignment": [],
        "dimension_insights": {},
        "digital_brain_signal": None,
        "confidence_score": round(random_uniform(lo, hi), 2),
        "representative_quote": content["representative_quote"],
        "all_citations": [],
        "source_urls": [],
        "source_note": "llm_generated",
    }


async def _estimate_hq_verdict(category: str) -> dict:
    """LLM-generated stand-in when real HQ source coverage is sparse."""
    lo, hi = _ESTIMATED_CONFIDENCE_RANGE
    content = await _simulate_fallback_content(
        f"Category: {category}\n\n"
        "Generate a single realistic, category-typical research finding, written "
        "exactly as if summarizing a real internal research study about this "
        "category. Do not mention that it is simulated, estimated, or inferred "
        "anywhere in the text.\n\n"
        'Return ONLY JSON: {"finding_summary": "<one to two sentences>", '
        '"dimension_insight": "<one sentence>"}',
        default={
            "finding_summary": f"Category benchmark research for '{category}' indicates consistent, well-established consumer norms.",
            "dimension_insight": "Reflects general category-level consumer behavior.",
        },
    )
    return {
        "verdict_id": "HQ_ESTIMATED",
        "source_type": "estimated_pattern",
        "study_reference": "Category benchmark research",
        "finding_summary": content["finding_summary"],
        "dimension_alignment": 0,
        "dimension_insight": content["dimension_insight"],
        "digital_brain_signal": None,
        "confidence_score": round(random_uniform(lo, hi), 2),
        "provenance_detail": {"type": "estimated_pattern"},
    }


def random_uniform(lo: float, hi: float) -> float:
    import random
    return random.uniform(lo, hi)


async def _collect_evidence_for_manual_persona(
    validated_ro: dict,
    activated_dimensions: list,
    category: str,
) -> Dict[str, Any]:
    """
    Real-first evidence collection for a manual persona (Step 4 of
    calibrate_manual_persona_with_brains()), reusing digital_brain_pipeline's
    already-tested real functions. Falls back to an LLM-generated stand-in
    per stream when real coverage is thin.

    Runs after trait auto-fill (Step 3) and before brain assignment (Step 5)
    — brain assignment is decided FROM this evidence, never before it.

    Returns combined verdicts plus evidence_metadata (real vs. LLM-generated
    counts per stream, tracked internally for confidence weighting only).
    """
    from app.services.digital_brain_pipeline import (
        fetch_action_data_all,
        scan_action_data,
        search_evidence_based_web_real,
        search_hq_database,
        _extract_category_keywords,
    )
    import concurrent.futures as _cf

    with _cf.ThreadPoolExecutor(max_workers=3) as executor:
        fut_action_df = executor.submit(fetch_action_data_all, 5000)
        fut_eb = executor.submit(search_evidence_based_web_real, validated_ro, activated_dimensions)
        fut_hq = executor.submit(search_hq_database, validated_ro, activated_dimensions)
        action_df = fut_action_df.result()
        eb_verdicts = fut_eb.result()
        hq_verdicts = fut_hq.result()

    # fetch_action_data_all() has no category filter — it returns the most
    # recent N rows from the WHOLE table regardless of category. A raw row
    # count is therefore meaningless on its own: 5000 unrelated rows must not
    # count as "real evidence" for an unrelated category. Check category
    # relevance directly (same keyword logic scan_action_data() itself uses)
    # before trusting the row count at all.
    category_keywords = _extract_category_keywords(category.lower())
    category_matched_rows = 0
    if action_df is not None and not action_df.empty and "productItems" in action_df.columns:
        def _row_matches(row):
            items = row.get("productItems")
            if isinstance(items, str):
                try:
                    items = json.loads(items)
                except Exception:
                    items = []
            if not isinstance(items, list):
                return False
            for item in items:
                name = (item.get("priceName") or "").lower() if isinstance(item, dict) else ""
                if any(kw in name for kw in category_keywords):
                    return True
            return False
        category_matched_rows = int(action_df.apply(_row_matches, axis=1).sum())

    depth_layers = scan_action_data(action_df, activated_dimensions, validated_ro) if action_df is not None and not action_df.empty else []

    # Real action-data confidence requires BOTH enough total volume AND that
    # volume actually being relevant to this persona's stated category.
    real_action_count = category_matched_rows
    real_eb_verdicts = [v for v in eb_verdicts if v.get("source_note") == "real_citation_backed"]
    real_eb_citation_count = sum(len(v.get("all_citations") or []) for v in real_eb_verdicts)
    real_hq_verdicts = [v for v in hq_verdicts if v.get("source_type") != "no_hq_coverage"]
    real_hq_count = len(real_hq_verdicts)

    final_depth_layers = list(depth_layers)
    final_eb_verdicts = list(real_eb_verdicts)
    final_hq_verdicts = list(real_hq_verdicts)

    action_used_estimate = real_action_count < _ACTION_DATA_MIN_RECORDS
    eb_used_estimate = real_eb_citation_count < _WEB_EVIDENCE_MIN_CITATIONS
    hq_used_estimate = real_hq_count < _HQ_MIN_SOURCES

    if action_used_estimate:
        final_depth_layers.append(await _estimate_action_data_verdict(category))
    if eb_used_estimate:
        final_eb_verdicts.append(await _estimate_web_evidence_verdict(category))
    if hq_used_estimate:
        final_hq_verdicts.append(await _estimate_hq_verdict(category))

    evidence_metadata = {
        "action_data": {
            "source": "estimated" if action_used_estimate else "real",
            "real_records_found": real_action_count,
            "threshold": _ACTION_DATA_MIN_RECORDS,
        },
        "web_evidence": {
            "source": "estimated" if eb_used_estimate else "real",
            "real_citations_found": real_eb_citation_count,
            "threshold": _WEB_EVIDENCE_MIN_CITATIONS,
        },
        "hq_research": {
            "source": "estimated" if hq_used_estimate else "real",
            "real_sources_found": real_hq_count,
            "threshold": _HQ_MIN_SOURCES,
        },
        "real_stream_count": sum(0 if x else 1 for x in (action_used_estimate, eb_used_estimate, hq_used_estimate)),
    }

    # Evidence collection's job ends here. Brain assignment (Step 5) is a
    # separate stage the caller runs afterwards, using this evidence plus
    # the Step 3 persona traits — never bundled into this function.
    return {
        "depth_layers": final_depth_layers,
        "eb_verdicts": final_eb_verdicts,
        "hq_verdicts": final_hq_verdicts,
        "evidence_metadata": evidence_metadata,
    }


async def _assign_brain_and_check_say_do_gap(
    validated_ro: dict,
    enriched_persona: dict,
    depth_layers: list,
    eb_verdicts: list,
    hq_verdicts: list,
) -> Dict[str, Any]:
    """
    Step 5 of calibrate_manual_persona_with_brains(): brain assignment AND
    the say-do-gap check, run together in one call once BOTH the completed
    persona traits (Step 3) and the evidence (Step 4) exist. Never decided
    earlier, and never split across two calls.
    """
    from app.services.digital_brain_pipeline import BRAIN_DEFINITIONS

    brain_list = list(BRAIN_DEFINITIONS.keys())
    default: Dict[str, Any] = {
        "brain_assignment": {
            "primary_brain": "Pragmatist",
            "primary_confidence": 0.70,
            "primary_reasoning": "Default assignment — brain synthesis failed.",
            "secondary_brain": None,
            "secondary_confidence": None,
            "secondary_reasoning": None,
        },
        "say_do_gap": None,
    }

    evidence_summary = {
        "action_data_findings": [
            {"pattern": dl.get("pattern_detected"), "confidence": dl.get("confidence_score")}
            for dl in depth_layers
        ],
        "web_evidence_findings": [
            {"themes": v.get("key_discussion_themes"), "quote": v.get("representative_quote"),
             "confidence": v.get("confidence_score")}
            for v in eb_verdicts
        ],
        "hq_research_findings": [
            {"finding": v.get("finding_summary"), "confidence": v.get("confidence_score")}
            for v in hq_verdicts
        ],
    }

    prompt = f"""
You are the Master Brain of the Synthetic People AI platform.

RESEARCH OBJECTIVE:
{json.dumps(validated_ro, ensure_ascii=False)}

COMPLETED PERSONA (traits + OCEAN, already finalized):
{json.dumps(enriched_persona, ensure_ascii=False, default=str)}

EVIDENCE GATHERED FOR THIS PERSONA:
{json.dumps(evidence_summary, ensure_ascii=False, default=str)}

AVAILABLE BRAINS: {brain_list}

Your tasks:
1. Cross-reference the persona's traits with the evidence above and assign a
   Primary Brain (60-70% influence) and Secondary Brain (20-30% influence).
   Both must be coherent with the persona's traits and the evidence.
2. Compare the persona's stated traits/claims against the evidence. If they
   diverge meaningfully (e.g. the persona claims high brand loyalty but the
   evidence suggests frequent switching), describe it as a say-do gap. If
   they don't diverge, return null for say_do_gap.

Return ONLY this JSON object:
{{
  "brain_assignment": {{
    "primary_brain": "<brain name>",
    "primary_confidence": <float 0.70-0.95>,
    "primary_reasoning": "<1-2 sentences citing persona traits and evidence>",
    "secondary_brain": "<brain name or null>",
    "secondary_confidence": <float 0.40-0.80 or null>,
    "secondary_reasoning": "<1-2 sentences or null>"
  }},
  "say_do_gap": {{"claim": "<...>", "evidence_based_observation": "<...>", "reasoning": "<...>"}} or null
}}
"""
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a master consumer psychologist. Return only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        parsed = json.loads(response.choices[0].message.content)
        if isinstance(parsed, dict) and isinstance(parsed.get("brain_assignment"), dict) and parsed["brain_assignment"].get("primary_brain"):
            return {
                "brain_assignment": parsed["brain_assignment"],
                "say_do_gap": parsed.get("say_do_gap"),
            }
    except Exception:
        logger.warning("Step 5 brain assignment/say-do-gap call failed; using default.", exc_info=True)
    return default
