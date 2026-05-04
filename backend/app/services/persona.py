from sqlmodel import select
from app.db import async_engine
from app.models.persona import Persona
from app.schemas.persona import PersonaCreate, PersonaUpdate
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List, Dict
from datetime import datetime
from app.utils.id_generator import generate_id
import json
from openai import AsyncOpenAI
from app.config import OPENAI_API_KEY
from app.services.omi import build_persona_validation_prompt, PERSONA_VALIDATION_SYSTEM_PROMPT
from app.services.omi import call_omi
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete
from app.models.persona import Persona


client = AsyncOpenAI(api_key=OPENAI_API_KEY)

    
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
    multi_platform_conversations is populated from evidence_snapshot (per-persona).
    The other 3 sections are platform methodology constants with optional AI overrides.
    Always returns a full dict — never None.
    """
    details = persona_details or {}
    evidence = details.get("evidence_snapshot") or {}

    # multi_platform_conversations — derive from web research evidence_snapshot
    total_convs = evidence.get("total_conversations", 0)
    sources = evidence.get("sources") or []
    platforms = [s.get("platform") for s in sources if s.get("platform")]

    conf_breakdown = evidence.get("confidence_breakdown") or {}
    key_attributes = (
        [_CONFIDENCE_LABEL_MAP.get(k, k.replace("_", " ").title()) for k in conf_breakdown]
        or ["Volume", "Recency", "RO Alignment", "Source Diversity", "Signal Clarity", "Platforms Covered"]
    )

    # If the AI already produced a calibration_breakdown (future-proof), respect it
    existing = details.get("calibration_breakdown") or {}

    return {
        "real_actions_signal": existing.get("real_actions_signal") or {
            **_CALIBRATION_BREAKDOWN_DEFAULTS["real_actions_signal"],
            # people_analysed is an optional AI-generated field; 0 means unavailable
            "count": details.get("people_analysed") or 0,
        },
        "emotional_neural_layers": existing.get("emotional_neural_layers") or {
            **_CALIBRATION_BREAKDOWN_DEFAULTS["emotional_neural_layers"],
            "count": 0,
        },
        "validated_studies": existing.get("validated_studies") or {
            **_CALIBRATION_BREAKDOWN_DEFAULTS["validated_studies"],
            "count": 0,
        },
        "multi_platform_conversations": existing.get("multi_platform_conversations") or {
            "description": "Calibrated against credible consumer and behavioural studies.",
            "count": total_convs,
            "key_attributes": key_attributes,
            "platforms_covered": platforms,
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
        "calibration_confidence": p.calibration_confidence,
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
    }

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
_REPLICATE_PROMPT = """
You are adapting an existing consumer persona for a new geographic market.

SOURCE PERSONA (JSON):
{source_json}

TARGET COUNTRY: {target_country}

Rules:
1. Keep the core archetype, behavioral patterns, and psychographic profile intact.
2. Update ONLY: location fields, income ranges (local currency/norms), education system references, platform/brand names relevant to {target_country}, cultural values where they differ.
3. Return a valid JSON object containing ALL fields from the source, adapted for {target_country}.
4. Return ONLY the JSON object — no explanation, no markdown fences.
""".strip()


async def replicate_persona(
    source_persona_id: str,
    target_country: str,
    exploration_id: str,
    workspace_id: str,
    current_user_id: str,
) -> dict:
    """
    Clone an existing persona and localise it for a different country.
    Uses a cheap, targeted LLM call (no web search) since we already have
    the source behavioural data — we only need geographic adaptation.
    """
    source = await get_persona(source_persona_id)
    if not source:
        raise ValueError("Source persona not found")

    source_details = source.get("persona_details") or {}
    if not source_details:
        raise ValueError("Source persona has no details to replicate")
    if source.get("calibration_status") == "draft":
        raise ValueError("Draft personas must be calibrated before replication")

    prompt = _REPLICATE_PROMPT.format(
        source_json=json.dumps(source_details, ensure_ascii=False, default=str),
        target_country=target_country,
    )

    response = await client.chat.completions.create(
        model="gpt-4o-mini",   # cheap model — no web search needed for geo-adaptation
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
        response_format={"type": "json_object"},
    )
    raw = response.choices[0].message.content
    adapted: dict = json.loads(raw)

    from app.services.auto_generated_persona import _extract_calibration_confidence
    from types import SimpleNamespace
    d = SimpleNamespace(**{**source_details, **adapted})

    new_id = generate_id()
    async with AsyncSession(async_engine) as session:
        p = Persona(
            id=new_id,
            exploration_id=exploration_id,
            workspace_id=workspace_id,
            name=adapted.get("name") or source["name"],
            age_range=adapted.get("age_range") or getattr(d, "age_range", ""),
            gender=adapted.get("gender") or getattr(d, "gender", ""),
            location_country=target_country,
            location_state=adapted.get("location_state") or "",
            education_level=adapted.get("education_level") or getattr(d, "education_level", ""),
            occupation=adapted.get("occupation") or getattr(d, "occupation", ""),
            income_range=adapted.get("income_range") or getattr(d, "income_range", ""),
            family_size=adapted.get("family_size") or getattr(d, "family_size", ""),
            geography=adapted.get("geography") or target_country,
            lifestyle=adapted.get("lifestyle") or getattr(d, "lifestyle", ""),
            values=adapted.get("values") or getattr(d, "values", ""),
            personality=adapted.get("personality") or getattr(d, "personality", ""),
            interests=adapted.get("interests") or getattr(d, "interests", ""),
            motivations=adapted.get("motivations") or getattr(d, "motivations", ""),
            brand_sensitivity=adapted.get("brand_sensitivity") or getattr(d, "brand_sensitivity", ""),
            price_sensitivity=adapted.get("price_sensitivity") or getattr(d, "price_sensitivity", ""),
            mobility=adapted.get("mobility") or getattr(d, "mobility", ""),
            accommodation=adapted.get("accommodation") or getattr(d, "accommodation", ""),
            marital_status=adapted.get("marital_status") or getattr(d, "marital_status", ""),
            daily_rhythm=adapted.get("daily_rhythm") or getattr(d, "daily_rhythm", ""),
            hobbies=adapted.get("hobbies") or getattr(d, "hobbies", ""),
            professional_traits=adapted.get("professional_traits") or getattr(d, "professional_traits", ""),
            digital_activity=adapted.get("digital_activity") or getattr(d, "digital_activity", ""),
            preferences=adapted.get("preferences") or getattr(d, "preferences", ""),
            backstory=adapted.get("backstory") or source.get("backstory") or "",
            created_by=current_user_id,
            persona_details=adapted,
            auto_generated_persona=True,
            parent_persona_id=source_persona_id,
            calibration_status=source.get("calibration_status") or "calibrated",
            calibration_confidence=_extract_calibration_confidence(adapted)
                or source.get("calibration_confidence")
                or 75,
        )
        session.add(p)
        await session.commit()
        await session.refresh(p)

        from app.models.user import User
        user_res = await session.execute(select(User).where(User.id == current_user_id))
        u = user_res.scalars().first()
        full_name = None
        if u:
            full_name = u.full_name or f"{u.first_name} {u.last_name}".strip() or None

    return persona_to_dict(p, creator_full_name=full_name)


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

_CALIBRATION_PROMPT = """
You are a consumer insights expert enriching a persona from structured researcher-provided traits.

RESEARCH OBJECTIVE:
{research_objective}

PERSONA TRAITS (structured input from researcher):
{raw_traits_json}

YOUR TASK:
1. Preserve ALL provided traits — never change or remove them.
2. Infer and fill any missing demographic/psychographic fields using the traits as context.
3. Add behavioral depth: barriers_pain_points, triggers_opportunities.
4. Generate an ocean_profile (openness, conscientiousness, extraversion, agreeableness, neuroticism, each 0.0-1.0).
5. Generate an evidence_snapshot with confidence_calculation_detail.value (float 0.0-1.0) and weighted_total.
6. Write a backstory (2-3 sentences) if not already provided.

Return a single valid JSON object with these exact keys:
name, age_range, gender, location_country, location_state, education_level,
occupation, income_range, family_size, geography, lifestyle, values, personality,
interests, motivations, brand_sensitivity, price_sensitivity, mobility,
accommodation, marital_status, daily_rhythm, hobbies, professional_traits,
digital_activity, preferences, backstory, ocean_profile,
barriers_pain_points, triggers_opportunities, evidence_snapshot

Return ONLY the JSON — no markdown, no explanation.
""".strip()


async def create_manual_persona_draft(
    exploration_id: str,
    workspace_id: str,
    user_id: str,
    payload,  # ManualPersonaCreate — avoid circular import, resolved at call site
) -> dict:
    """
    Creates a persona from structured form input without any AI call.
    calibration_status="draft" signals the frontend that calibration is pending.
    """
    d = payload.demographics
    psych = payload.psychological
    beh = payload.behavioural
    add = payload.additional_info

    def _join(lst):
        return ", ".join(str(v) for v in lst if v) if lst else None

    occupation = (add.occupation if add and add.occupation else None) or d.occupation or ""

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
            created_by=user_id,
            auto_generated_persona=False,
            calibration_status="draft",
            calibration_confidence=None,
            # Store full structured input so the calibrate endpoint can use it
            persona_details={"raw_traits": payload.dict()},
        )
        session.add(p)
        await session.commit()
        await session.refresh(p)

    return persona_to_dict(p)


async def calibrate_manual_persona(persona_id: str, exploration_id: str) -> dict:
    """
    AI-enriches a draft persona in-place using the stored raw_traits.
    Uses gpt-4o (no web search) — traits are already provided, just needs depth.
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
    raw_traits = details.get("raw_traits") or source

    research_objective = await get_description(exploration_id) or ""

    prompt = _CALIBRATION_PROMPT.format(
        research_objective=research_objective,
        raw_traits_json=json.dumps(raw_traits, ensure_ascii=False, default=str),
    )

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
        response_format={"type": "json_object"},
    )
    enriched: dict = json.loads(response.choices[0].message.content)

    async with AsyncSession(async_engine) as session:
        res = await session.execute(select(Persona).where(Persona.id == persona_id))
        p = res.scalars().first()
        if not p:
            raise ValueError("Persona not found")

        # Update flat model columns — only overwrite if AI returned a non-empty value
        _str_fields = (
            "name", "age_range", "gender", "location_country", "location_state",
            "education_level", "occupation", "income_range", "family_size",
            "geography", "lifestyle", "values", "personality", "motivations",
            "brand_sensitivity", "price_sensitivity", "mobility", "accommodation",
            "marital_status", "daily_rhythm", "hobbies", "professional_traits",
            "digital_activity", "preferences", "backstory",
        )
        for field in _str_fields:
            val = enriched.get(field)
            if val:
                setattr(p, field, val if not isinstance(val, list)
                        else ", ".join(str(v) for v in val))

        if enriched.get("interests"):
            raw_int = enriched["interests"]
            p.interests = raw_int if isinstance(raw_int, list) else [raw_int]

        p.ocean_profile = enriched.get("ocean_profile") or p.ocean_profile
        p.calibration_confidence = _extract_calibration_confidence(enriched)
        p.calibration_status = "calibrated"

        # Merge enriched fields into persona_details (preserves raw_traits)
        merged = dict(p.persona_details or {})
        merged.update(enriched)
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
