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

MANUAL_PERSONA_BUILDER_WITH_BRAINS_PROMPT = """

You are an Expert Persona Architect operating in MANUAL BUILD MODE within the Synthetic People research platform.

In this mode, the user has defined their own persona traits through a structured form. Your job is:
1. Accept and validate the user-provided traits
2. Auto-fill any missing traits using the Research Objective and the traits already provided
3. Score the completed persona against the Research Objective
4. Assign the persona to the most fitting Digital Brain archetypes
5. Return a fully populated, research-ready persona in strict JSON format

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

**STEP 8: BRAIN ASSIGNMENT**

Using the completed persona profile, assign which of the 12 Digital Brains best describes this person.

THE 12 DIGITAL BRAINS:
1. Optimizer - Achievement-driven, efficiency-focused, systematic
2. Nurturer - Care-focused, family-oriented, relationships matter
3. Explorer - Curious, novelty-seeking, adventure-oriented
4. Achiever - Goal-oriented, competitive, success-driven
5. Rebel - Non-conformist, breaks rules, questions status quo
6. Connector - Social, builds relationships, influence-seeking
7. Guardian - Security-focused, risk-averse, tradition-valuing
8. Traditionalist - Heritage-focused, history-respecting, conservative
9. Visionary - Future-oriented, innovation-seeking, big-picture thinker
10. Harmonizer - Balance-seeking, conflict-avoiding, peace-oriented
11. Hedonist - Pleasure-seeking, experience-focused, present-oriented
12. Pragmatist - Practical, results-oriented, no-nonsense approach

ASSIGNMENT LOGIC:
- Read the completed persona: personality, values, decision_making_style, motivations
- Read the Research Objective context: What is the research focus?
- Identify PRIMARY BRAIN: Best single brain that matches this persona
- Identify SECONDARY BRAIN: Second best brain that adds dimension
- Both must be coherent with ALL persona traits

ASSIGNMENT RULES:
- primary_confidence: Must be between 0.70 and 1.00
- secondary_confidence: Must be between 0.40 and 0.80
- primary_reasoning: 1-2 sentences explaining why this is the primary brain
- secondary_reasoning: 1-2 sentences explaining why this is secondary
- Never contradict persona traits with brain assignments
- Ensure both brains together create coherent personality

---

**STEP 9: OUTPUT**

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
  },
  "brain_assignment": {
    "primary_brain": "Brain Name",
    "primary_confidence": 0.85,
    "primary_reasoning": "1-2 sentences why this is primary",
    "secondary_brain": "Brain Name",
    "secondary_confidence": 0.62,
    "secondary_reasoning": "1-2 sentences why this is secondary"
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
7. Brain assignment must follow from the completed persona, never contradict it.
8. Output is always JSON: No preamble, no explanation, no markdown fences. Raw JSON only.

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
    Phase 2: enrich a draft persona with auto-fill, OCEAN, barriers/triggers,
    confidence scoring, AND digital brain assignment — in one GPT-4o call.

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

            user_prompt = _MANUAL_USER_INPUT_TEMPLATE.format(
                research_objective=research_objective,
                user_provided_traits=json.dumps(raw_traits, ensure_ascii=False, default=str),
            )

            logger.info("manual_persona.calibrate:llm_call persona_id=%s", persona_id)
            try:
                response = await client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": MANUAL_PERSONA_BUILDER_WITH_BRAINS_PROMPT},
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
            brain_assignment: Dict[str, Any] = result.get("brain_assignment") or {}

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
            p.calibration_confidence = _extract_manual_confidence_score(result) or p.calibration_confidence
            p.calibration_status = "calibrated"

            merged = dict(p.persona_details or {})
            merged.update(enriched)
            merged["auto_fill_report"] = auto_fill_report
            merged["confidence_scoring"] = confidence_scoring
            merged["brain_assignment"] = brain_assignment
            p.persona_details = merged

            session.add(p)
            await session.commit()
            await session.refresh(p)

            logger.info(
                "manual_persona.calibrate:success persona_id=%s confidence=%s brain=%s",
                persona_id, p.calibration_confidence, brain_assignment.get("primary_brain"),
            )
            return {"status": "success", "persona": persona_to_dict(p)}

    except Exception as e:
        logger.error(
            "manual_persona.calibrate:error persona_id=%s error=%s",
            persona_id, str(e), exc_info=True,
        )
        return {"status": "error", "error_message": str(e)}
