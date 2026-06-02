import asyncio
import json
import os
import uuid
from collections import Counter
from datetime import datetime
from dotenv import load_dotenv
from openai import AsyncOpenAI
from openai import OpenAI
from sqlalchemy import (
    MetaData,
    Table,
    Column,
    String,
    insert,
    Text,
    select,
    Boolean,
    JSON,
)
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import declarative_base
from sqlmodel import select
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse

from app.db import async_engine
from app.models.persona import Persona
from app.utils.id_generator import generate_id

from app.services.auto_generated_persona_prompts import (
    PERSONA_GENERATION_PROMPT,
    ADD_QUESTION_VALIDATOR_PROMPT,
    MODIFY_QUESTION_VALIDATOR_PROMPT,
    DELETE_QUESTION_VALIDATOR_PROMPT
)

load_dotenv()

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# ---------------------------------------------------------------------------
# Domain detection — keyword-based, no extra LLM call
# ---------------------------------------------------------------------------
_DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "ecom": [
        "ecommerce", "e-commerce", "online shopping", "shopping", "retail",
        "amazon", "flipkart", "ajio", "myntra", "nykaa", "bigbasket",
        "online store", "cart", "checkout", "marketplace", "buy online",
    ],
    "food": [
        "food delivery", "food", "restaurant", "meal", "dining", "swiggy",
        "zomato", "order food", "cuisine", "takeaway", "cloud kitchen",
    ],
    "mobility": [
        "ride", "cab", "taxi", "commute", "uber", "ola", "transport",
        "mobility", "ridesharing", "ride-sharing", "auto", "bike ride",
    ],
    "finance": [
        "payment", "banking", "finance", "financial", "transaction", "upi",
        "phonepe", "paytm", "hdfc", "icici", "credit", "debit", "loan",
        "insurance", "investment", "wallet", "fintech",
    ],
}

_DOMAIN_DISPLAY = {
    "ecom": "E-Commerce",
    "food": "Food Delivery",
    "mobility": "Mobility / Ride-Sharing",
    "finance": "Finance / Payments",
}

_ALL_DOMAINS = list(_DOMAIN_KEYWORDS.keys())


def _detect_domain_from_ro(description: str) -> str | None:
    """
    Score each domain by keyword hits in the RO text.
    Returns the best-matching domain or None if no hits found.
    """
    text = description.lower()
    scores: dict[str, int] = {}
    for domain, keywords in _DOMAIN_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text)
        if score:
            scores[domain] = score
    if not scores:
        return None
    return max(scores, key=lambda d: scores[d])


# ---------------------------------------------------------------------------
# ML context helpers
# ---------------------------------------------------------------------------

def _build_ml_context_string(domain: str, features: dict, prediction: dict) -> str:
    """Convert ML features + prediction into a natural-language context block for the LLM."""
    pred_val = prediction.get("prediction", 0.0)
    conf_pct = prediction.get("confidence", 0.0) * 100
    conf_label = prediction.get("confidence_label", "MODERATE")

    opw = features.get("orders_per_week", 0.0)
    aov = features.get("avg_order_value", 0.0)
    spending_trend = features.get("spending_trend", 0.0)
    price_sens = features.get("price_sensitivity", 0.0)
    discount_rate = features.get("discount_usage_rate", 0.0)
    weekend_ratio = features.get("weekend_ratio", 0.0)
    night_ratio = features.get("night_order_ratio", 0.0)
    peak_hour = int(features.get("peak_hour_preference", 12))
    inter_order = features.get("inter_order_time", 0.0)
    growth_rate = features.get("growth_rate", 0.0)

    time_label = (
        f"{peak_hour} AM" if peak_hour < 12 else
        "12 PM (noon)" if peak_hour == 12 else
        f"{peak_hour - 12} PM"
    )

    if pred_val >= 3:
        segment = "HIGH-VALUE / POWER USER"
    elif pred_val >= 1:
        segment = "REGULAR / FREQUENT"
    else:
        segment = "OCCASIONAL / LOW-FREQUENCY"

    trend_desc = "Increasing" if spending_trend > 0 else ("Decreasing" if spending_trend < 0 else "Stable")
    price_label = "High" if price_sens > 0.6 else ("Medium" if price_sens > 0.3 else "Low")
    weekend_label = "strong" if weekend_ratio > 0.5 else ("moderate" if weekend_ratio > 0.3 else "low")

    lines = [
        "=== REAL BEHAVIORAL DATA — Ground ALL personas in these signals ===",
        f"Domain        : {_DOMAIN_DISPLAY.get(domain, domain.upper())}",
        f"ML Confidence : {conf_pct:.0f}% ({conf_label})",
        "",
        "PURCHASE PATTERNS:",
        f"  • Observed purchase frequency  : {opw:.1f} orders/week",
        f"  • ML-predicted frequency       : {pred_val:.1f} orders/week",
        f"  • Average order value          : ₹{aov:,.0f}",
        f"  • Spending trend               : {trend_desc} (₹{abs(spending_trend):.0f}/month delta)",
        f"  • Price sensitivity            : {price_label} ({price_sens:.2f}/1.0)",
        f"  • Discount usage               : {discount_rate * 100:.0f}% of orders use discounts",
        "",
        "TIMING BEHAVIOUR:",
        f"  • Weekend orders               : {weekend_ratio * 100:.0f}% ({weekend_label} weekend preference)",
        f"  • Late-night orders (10 PM–6 AM): {night_ratio * 100:.0f}%",
        f"  • Peak purchase hour           : {time_label}",
        f"  • Avg time between orders      : {inter_order:.0f} hours",
        "",
        "GROWTH SIGNAL:",
        f"  • Purchase frequency growth    : {'▲ +' if growth_rate > 0 else '▼ '}{growth_rate * 100:.0f}%",
        "",
        f"ML CUSTOMER SEGMENT : {segment}",
        "",
        "INSTRUCTION: Use these behavioral signals to ground EVERY persona's spending",
        "habits, timing patterns, price sensitivity, motivations, and pain points.",
        "These are REAL data points — do not invent contradicting behaviors.",
        "=================================================================",
    ]
    return "\n".join(lines)


async def _resolve_domain_and_subject_key(
    description: str,
) -> tuple[str | None, str | None]:
    """
    Step 1: Try to match domain from the RO text (keyword scoring).
    Step 2: If no domain match, scan all 4 domains in parallel and pick the first with data.
    Returns (domain, subject_key) or (None, None) if no transaction data found anywhere.
    """
    from app.ml.feature_fetch import find_subject_key

    detected = _detect_domain_from_ro(description or "")
    if detected:
        sk = await find_subject_key(detected)
        if sk:
            print(f"[ML] RO-matched domain={detected!r} subject_key={sk!r}")
            return detected, sk
        print(f"[ML] RO matched domain={detected!r} but no data — scanning all domains")

    # RO didn't match any domain OR matched domain had no data → scan all in parallel
    results = await asyncio.gather(
        *(find_subject_key(d) for d in _ALL_DOMAINS),
        return_exceptions=True,
    )
    for domain, result in zip(_ALL_DOMAINS, results):
        if isinstance(result, str) and result:
            print(f"[ML] Fallback scan found data: domain={domain!r} subject_key={result!r}")
            return domain, result

    print(f"[ML] No transaction data found in any domain")
    return None, None


async def _fetch_ml_context(
    workspace_id: str,
    description: str,
) -> tuple[str | None, str | None, str | None]:
    """
    Resolve domain → fetch features → run ML prediction → build context string.
    Returns (domain, subject_key, ml_context_string).
    Returns (None, None, None) on any failure — generation always falls back gracefully.
    """
    try:
        from app.ml.feature_fetch import get_user_features
        from app.ml.predictor import predict_from_features

        domain, subject_key = await _resolve_domain_and_subject_key(workspace_id, description)
        if not domain or not subject_key:
            return None, None, None

        features = await get_user_features(subject_key, domain)
        prediction = await asyncio.to_thread(predict_from_features, domain, features)

        context = _build_ml_context_string(domain, features, prediction)
        print(
            f"[ML] Context ready — domain={domain!r} pred={prediction['prediction']:.2f} "
            f"conf={prediction['confidence_label']}"
        )
        return domain, subject_key, context

    except Exception as exc:
        print(f"[ML] Context fetch failed ({type(exc).__name__}: {exc}) — using LLM-only fallback")
        return None, None, None


TEXT_PERSONA_FIELDS = (
    "name",
    "age_range",
    "gender",
    "location_country",
    "location_state",
    "education_level",
    "occupation",
    "income_range",
    "family_size",
    "geography",
    "lifestyle",
    "values",
    "personality",
    "motivations",
    "brand_sensitivity",
    "price_sensitivity",
    "mobility",
    "accommodation",
    "marital_status",
    "daily_rhythm",
    "hobbies",
    "professional_traits",
    "digital_activity",
    "preferences",
    "backstory",
)


def _remove_control_chars(raw: str) -> str:
    return "".join(ch for ch in raw if ord(ch) >= 32)


def _clean_text(raw: str) -> str:
    text = "".join(" " if ord(ch) < 32 else ch for ch in raw)
    return " ".join(text.split())


def _stringify_for_column(value: Any) -> str:
    """Convert variable LLM output into a DB-safe VARCHAR value."""
    if value is None:
        return ""
    if isinstance(value, str):
        return _clean_text(value)
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return "; ".join(
            item for item in (_stringify_for_column(v) for v in value) if item
        )
    if isinstance(value, dict):
        parts = []
        for key, val in value.items():
            text = _stringify_for_column(val)
            if text:
                parts.append(f"{key}: {text}")
        if parts:
            return "; ".join(parts)
        return json.dumps(value, ensure_ascii=False, default=str)
    return _clean_text(str(value))


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (int, float, bool)):
        return value
    if isinstance(value, str):
        return _clean_text(value)
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_safe(val) for key, val in value.items()}
    return _clean_text(str(value))


def _list_for_jsonb(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [
            text for text in (_stringify_for_column(item) for item in value) if text
        ]
    if isinstance(value, dict):
        return [
            f"{key}: {text}"
            for key, val in value.items()
            for text in [_stringify_for_column(val)]
            if text
        ]
    if isinstance(value, str):
        text = _clean_text(value)
        if not text:
            return []
        if text[:1] in ("[", "{"):
            try:
                return _list_for_jsonb(json.loads(text))
            except json.JSONDecodeError:
                pass
        return [text]
    text = _stringify_for_column(value)
    return [text] if text else []


def _json_object_or_none(value: Any) -> Optional[dict]:
    if isinstance(value, dict):
        return _json_safe(value)
    if isinstance(value, str):
        text = value.strip()
        if not text or text.lower() == "null":
            return None
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, dict):
            return _json_safe(parsed)
    return None


def _normalise_generated_persona(persona: dict) -> dict:
    source = _json_safe(persona) if isinstance(persona, dict) else {}
    normalised = dict(source)

    for field in TEXT_PERSONA_FIELDS:
        normalised[field] = _stringify_for_column(source.get(field))

    normalised["name"] = normalised["name"] or "Generated Persona"
    normalised["interests"] = _list_for_jsonb(source.get("interests"))
    normalised["ocean_profile"] = _json_object_or_none(source.get("ocean_profile"))
    normalised["persona_details"] = source
    return normalised


def _parse_confidence(raw) -> int:
    """Normalise any LLM confidence value to 0-100 integer. Fallback: 75."""
    import re as _re
    if isinstance(raw, (int, float)):
        # 0-1 scale (e.g. 0.91 from evidence_snapshot.confidence_calculation_detail.value)
        if 0.0 <= raw <= 1.0:
            return int(round(raw * 100))
        # Already a percentage (e.g. 91.0)
        if 1 < raw <= 100:
            return int(raw)
    if isinstance(raw, str):
        m = _re.search(r'\b(\d{1,3})\b', raw)
        if m:
            v = int(m.group(1))
            if 0 <= v <= 100:
                return v
    return 75


def _extract_calibration_confidence(persona: dict) -> int:
    """
    Primary path: evidence_snapshot.confidence_calculation_detail.value (0-1).
    This is the field the generation prompt always produces.
    Fallback: top-level confidence_scoring (legacy / manual generation).
    """
    try:
        evidence = persona.get("evidence_snapshot") or {}
        detail = evidence.get("confidence_calculation_detail") or {}
        raw = detail.get("value") or detail.get("weighted_total")
        if raw is not None:
            return _parse_confidence(raw)
    except Exception:
        pass
    return _parse_confidence(persona.get("confidence_scoring"))


def _load_json_object(raw: str) -> dict:
    """Parse a JSON object, tolerating occasional wrapper text from the model."""
    if isinstance(raw, dict):
        return raw
    cleaned = _remove_control_chars(str(raw).strip())
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        data = json.loads(cleaned[start:end + 1])
    if not isinstance(data, dict):
        raise ValueError("Expected a JSON object from persona generation")
    return data


DATABASE_URL = os.getenv("DATABASE_URL")

async def get_interviews_by_exploration_id(
    exploration_id: str,
) -> List[Dict[str, Any]]:

    Base = declarative_base()

    class Interview(Base):
        __tablename__ = "interview"

        id = Column(String, primary_key=True)
        exploration_id = Column(String)
        persona_id = Column(String)
        messages = Column(JSON)

    engine = create_async_engine(DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionLocal() as session:
        result = await session.execute(
            select(
                Interview.id,
                Interview.persona_id,
                Interview.messages
            ).where(
                Interview.exploration_id == exploration_id
            ).order_by(Interview.id.asc())
        )

        rows = result.all()

    await engine.dispose()

    # Convert rows → list of dicts (LLM / pipeline friendly)
    return [
        {
            "interview_id": row.id,
            "persona_id": row.persona_id,
            "messages": row.messages
        }
        for row in rows
    ]

async def get_persona_details(persona_id: str) -> Optional[Dict[str, Any]]:

    engine = create_async_engine(DATABASE_URL, echo=False)
    metadata = MetaData()

    async with engine.connect() as conn:
        persona_table = await conn.run_sync(
            lambda sync_conn: Table(
                "persona",
                metadata,
                autoload_with=sync_conn
            )
        )

    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionLocal() as session:
        result = await session.execute(
            select(persona_table).where(persona_table.c.id == persona_id)
        )
        row = result.mappings().first()

    await engine.dispose()

    if not row:
        return None

    return row.get("persona_details")


async def get_description(exploration_id: str) -> str | None:

    Base = declarative_base()

    class Exploration(Base):
        __tablename__ = "research_objectives"
        exploration_id = Column(String, primary_key=True)
        description = Column(Text)

    engine = create_async_engine(DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionLocal() as session:
        result = await session.execute(
            select(Exploration.description).where(
                Exploration.exploration_id == exploration_id
            )
        )

    await engine.dispose()
    return result.scalar_one_or_none()

async def get_all_questions_by_section_id(section_id: str):
    Base = declarative_base()
    engine = create_async_engine(DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    class Question(Base):
        __tablename__ = "interviewquestion"

        id = Column(String, primary_key=True)
        section_id = Column(String)
        text = Column(Text)  # ✅ FIX

    class Section(Base):
        __tablename__ = "interviewsection"

        id = Column(String, primary_key=True)
        description = Column(Text)

    async with SessionLocal() as session:
        # Get all questions
        result = await session.execute(
            select(Question.text)
            .where(Question.section_id == section_id)
            .order_by(Question.id)
        )
        questions = result.scalars().all()

        # Get theme description
        result = await session.execute(
            select(Section.description)
            .where(Section.id == section_id)
        )
        section_description = result.scalar_one_or_none()

    await engine.dispose()
    return questions, section_description


async def get_section_description_by_question_id(question_id: str):
    Base = declarative_base()

    class Question(Base):
        __tablename__ = "interviewquestion"

        id = Column(String, primary_key=True)
        section_id = Column(String)
        text = Column(Text)  # ✅ FIX

    class Section(Base):
        __tablename__ = "interviewsection"

        id = Column(String, primary_key=True)
        description = Column(Text)

    engine = create_async_engine(DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionLocal() as session:
        # 1️⃣ Get section_id + question text
        result = await session.execute(
            select(Question.section_id, Question.text)
            .where(Question.id == question_id)
        )

        row = result.one_or_none()
        if not row:
            await engine.dispose()
            return None, None, None, []

        section_id, question_text = row

        # 2️⃣ Get section description
        result = await session.execute(
            select(Section.description)
            .where(Section.id == section_id)
        )
        section_description = result.scalar_one_or_none()

        # 3️⃣ Get all questions in section
        result = await session.execute(
            select(Question.text)
            .where(Question.section_id == section_id)
            .order_by(Question.id)
        )
        all_question_texts = result.scalars().all()

    await engine.dispose()
    return section_description, section_id, question_text, all_question_texts


async def ai_generate_persona(
    exploration_id,
    workspace_id,
    current_user_id,
    target_count: int = 2,
    total_persona_goal: Optional[int] = None,
    starting_persona_number: int = 1,
    _attempt: int = 1,
):
    """
    Generate the requested number of Omi personas in parallel.
    Each persona is generated in a separate API call concurrently.
    """
    target_count = max(0, int(target_count or 0))
    total_persona_goal = int(total_persona_goal or target_count or 0)
    if target_count <= 0:
        return {"personas": [], "consumer_personas": []}

    description = await get_description(exploration_id)

    # Import the split prompts
    from app.services.auto_generated_persona_prompts import (
        PERSONA_GENERATION_BASE_INSTRUCTIONS,
        RESEARCH_OBJECTIVE_PROMPT
    )

    # ============================================================================
    # ML CONTEXT — fetch once, reuse across all parallel persona calls
    # ============================================================================
    ml_domain, ml_subject_key, ml_context = await _fetch_ml_context(workspace_id, description or "")

    # ============================================================================
    # PARALLEL PERSONA GENERATION
    # ============================================================================

    async def generate_single_persona(persona_number: int):
        """
        Generate a single persona via API call.
        """
        ml_section = f"\n\n{ml_context}\n" if ml_context else ""

        # Format dynamic prompt - specify this persona's position in the full plan limit
        dynamic_prompt = f"""
{RESEARCH_OBJECTIVE_PROMPT.format(research_objective=description)}
{ml_section}
Generate exactly 1 high-quality persona (Persona #{persona_number} of {total_persona_goal} total).
Return exactly one item inside consumer_personas.
Ensure this persona represents a distinct behavioral segment from other personas.
"""

        # API call with caching
        response = await client.responses.create(
            model="gpt-5",
            reasoning={"effort": "low"},
            tools=[
                {
                    "type": "web_search",
                    "filters": {
                        "allowed_domains": [
                            "www.quora.com",
                            "www.reddit.com",
                            "www.youtube.com",
                            "x.com",
                            "www.capterra.in",
                            "www.linkedin.com",
                            "medium.com",
                        ]
                    },
                }
            ],
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            # OpenAI Responses API: type must be "input_text"
                            # Prompt caching is automatic in OpenAI — no cache_control needed
                            "type": "input_text",
                            "text": PERSONA_GENERATION_BASE_INSTRUCTIONS,
                        }
                    ]
                },
                {
                    "role": "user",
                    "content": dynamic_prompt
                }
            ],
        )
        
        return response.output_text

    # ============================================================================
    # EXECUTE BOTH CALLS IN PARALLEL
    # ============================================================================
    
    print(f"\n🚀 Starting parallel persona generation ({target_count} concurrent API calls)...")
    persona_numbers = list(range(starting_persona_number, starting_persona_number + target_count))
    start_time = asyncio.get_event_loop().time()
    
    # Launch both API calls simultaneously
    results = await asyncio.gather(
        *(generate_single_persona(persona_number) for persona_number in persona_numbers),
        return_exceptions=True  # Don't fail if one call errors
    )
    
    elapsed = asyncio.get_event_loop().time() - start_time
    print(f"✓ Parallel generation completed in {elapsed:.1f}s\n")

    # ============================================================================
    # PROCESS RESULTS AND SAVE TO DATABASE
    # ============================================================================
    
    response = {"personas": [], "consumer_personas": []}
    
    for idx, result in enumerate(results, 1):
        # Handle errors gracefully
        if isinstance(result, Exception):
            print(f"Retrying persona slot {idx}; generation response was not usable.")
            continue
            
        try:
            data = _load_json_object(result)
            customer_personas = data.get("consumer_personas", [])
            
            if not customer_personas:
                print(f"Retrying persona slot {idx}; response did not include a persona.")
                continue
            
            # Process each persona (usually just 1 per call)
            for persona in customer_personas:
                if len(response["personas"]) >= target_count:
                    break

                persona["auto_generated_persona"] = True
                reference_sites = persona.get("reference_sites_with_usage", [])
                site_counter = dict(
                    Counter(urlparse(url).netloc for url in reference_sites)
                )
                persona["researched_sites"] = site_counter

                persona_id = generate_id()
                persona["id"] = persona_id
                db_persona = _normalise_generated_persona(persona)

                # Save to database
                async with AsyncSession(async_engine) as session:
                    p = Persona(
                        id=persona_id,
                        exploration_id=exploration_id,
                        workspace_id=workspace_id,
                        name=db_persona["name"],
                        age_range=db_persona["age_range"],
                        gender=db_persona["gender"],
                        location_country=db_persona["location_country"],
                        location_state=db_persona["location_state"],
                        education_level=db_persona["education_level"],
                        occupation=db_persona["occupation"],
                        income_range=db_persona["income_range"],
                        family_size=db_persona["family_size"],
                        geography=db_persona["geography"],
                        lifestyle=db_persona["lifestyle"],
                        values=db_persona["values"],
                        personality=db_persona["personality"],
                        interests=db_persona["interests"],
                        motivations=db_persona["motivations"],
                        brand_sensitivity=db_persona["brand_sensitivity"],
                        price_sensitivity=db_persona["price_sensitivity"],
                        mobility=db_persona["mobility"],
                        accommodation=db_persona["accommodation"],
                        marital_status=db_persona["marital_status"],
                        daily_rhythm=db_persona["daily_rhythm"],
                        hobbies=db_persona["hobbies"],
                        professional_traits=db_persona["professional_traits"],
                        digital_activity=db_persona["digital_activity"],
                        preferences=db_persona["preferences"],
                        backstory=db_persona["backstory"],
                        created_by=current_user_id,
                        ocean_profile=db_persona["ocean_profile"],
                        persona_details=db_persona["persona_details"],
                        auto_generated_persona=True,
                        calibration_confidence=_extract_calibration_confidence(persona),
                        subject_key=ml_subject_key,
                        ml_domain=ml_domain,
                    )

                    session.add(p)
                    await session.commit()

                response["personas"].append({
                    "id": persona_id,
                    "workspace_id": workspace_id,
                    "exploration_id": exploration_id,
                    "name": db_persona["name"],
                    "auto_generated_persona": True,
                    "persona_details": db_persona["persona_details"],
                })
                response["consumer_personas"].append(db_persona["persona_details"])
                
                print(f"Saved persona: {db_persona['name']}")
                
        except json.JSONDecodeError as e:
            print(f"Retrying persona slot {idx}; model JSON needed regeneration.")
            continue
        except Exception as e:
            print(f"Retrying persona slot {idx}; save attempt needed regeneration ({type(e).__name__}).")
            continue
    
    missing_count = target_count - len(response["personas"])
    if missing_count > 0 and _attempt < 3:
        retry_response = await ai_generate_persona(
            exploration_id,
            workspace_id,
            current_user_id,
            target_count=missing_count,
            total_persona_goal=total_persona_goal,
            starting_persona_number=starting_persona_number + len(response["personas"]),
            _attempt=_attempt + 1,
        )
        response["personas"].extend(retry_response.get("personas", []))
        response["consumer_personas"].extend(retry_response.get("consumer_personas", []))

    print(f"\n✅ Total personas generated: {len(response['personas'])}")
    return response

async def _run_validator(prompt: str):
    res = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "You are a qualitative research design validator."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    )
    response_text = res.choices[0].message.content.strip()
    response_json = json.loads(response_text)
    result = response_json.get("result", {})
    return result.get("valid_or_not"), result.get("validation_reason")

async def validate_new_question_against_theme(section_id, payload):
    existing_questions, theme_description = await get_all_questions_by_section_id(section_id)
    research_objective_description = await get_description(payload.exploration_id)
    user_question = payload.text

    prompt = ADD_QUESTION_VALIDATOR_PROMPT.format(
        research_objective_description=research_objective_description,
        theme_description=theme_description,
        existing_questions=existing_questions,
        user_question=user_question
    )
    return await _run_validator(prompt)


async def validate_existing_question(question_id, payload):
    theme_description, section_id, question_text, existing_questions = \
        await get_section_description_by_question_id(question_id)
    research_objective_description = await get_description(payload.exploration_id)
    modified_question = payload.text

    prompt = MODIFY_QUESTION_VALIDATOR_PROMPT.format(
        research_objective_description=research_objective_description,
        theme_description=theme_description,
        question_text=question_text,
        modified_question=modified_question
    )
    return await _run_validator(prompt)


async def validate_deleted_question(question_id, payload):
    theme_description, section_id, question_text, existing_questions = \
        await get_section_description_by_question_id(question_id)
    research_objective_description = await get_description(payload.exploration_id)

    prompt = DELETE_QUESTION_VALIDATOR_PROMPT.format(
        research_objective_description=research_objective_description,
        theme_description=theme_description,
        existing_questions=existing_questions,
        question_text=question_text
    )
    return await _run_validator(prompt)
