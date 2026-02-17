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

def persona_to_dict(p: Persona) -> dict:

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
        # "ocean_profile": p.ocean_profile,

        # "sample_size": p.sample_size,
        "created_by": p.created_by,
        "created_at": p.created_at,
        "auto_generated_persona": p.auto_generated_persona,
        "persona_details":p.persona_details,
    }

async def get_persona(persona_id: str) -> Optional[dict]:
    async with AsyncSession(async_engine) as session:
        persona_query = select(Persona).where(Persona.id == persona_id)
        res = await session.execute(persona_query)
        p = res.scalars().first()

        if not p:
            return None

        return persona_to_dict(p)

async def list_personas(workspace_id: str, exploration_id: str) -> List[dict]:
    async with AsyncSession(async_engine) as session:
        persona_query = select(Persona).where(
            Persona.workspace_id == workspace_id,
            Persona.exploration_id == exploration_id
        )
        res = await session.execute(persona_query)
        rows = res.scalars().all()

        return [persona_to_dict(p) for p in rows]


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
        full_persona_info.pop("confidence_scoring")
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