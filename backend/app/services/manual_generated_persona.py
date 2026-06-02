# ============================================================================
# LEGACY FILE — NO LONGER CALLED IN PRODUCTION
# ============================================================================
#
# WHAT THIS WAS (Old System):
#   A single-shot persona generator using GPT-5 + web search tools.
#   Called by POST /personas/ endpoint.
#   Flow: User fills form → payload sent directly to GPT-5 → LLM searched
#         Reddit/Quora/LinkedIn/Medium → returned a fully enriched persona in one API call.
#   Confidence scoring was evidence-volume based (conversations counted).
#   Output: flat consumer_personas[0] dict, saved directly to DB.
#
# WHY IT WAS REPLACED:
#   - GPT-5 + web search = high latency (30-90s) and high cost per persona
#   - Evidence snapshot was often fabricated (no real evidence crawled)
#   - No user control over which traits were inferred vs provided
#   - Single phase meant no ability to review before committing AI output
#
# WHAT REPLACED IT (New System):
#   Two-phase flow, both in app/services/persona.py:
#
#   Phase 1 → POST /personas/manual
#     persona_service.create_manual_persona_draft()
#     Saves user-provided traits as a "draft" — NO AI call, instant, zero cost.
#
#   Phase 2 → POST /personas/{id}/calibrate
#     persona_service.calibrate_manual_persona()
#     Calls gpt-4o with MANUAL_PERSONA_BUILDER_PROMPT (8-step Expert Persona Architect).
#     - Auto-fills missing traits via RO-alignment + cross-trait inference
#     - Generates OCEAN profile with per-dimension rationale
#     - Produces auto_fill_report (which traits were user vs AI)
#     - RO-alignment confidence scoring (4 components, honest, no fake evidence)
#     - No web search — faster, cheaper, more transparent
#
# The endpoint that called this file (POST /personas/) now returns 410 GONE.
# This file is kept for historical reference. Safe to delete in a future cleanup.
# ============================================================================

from app.services.auto_generated_persona import get_description

import json
import os
from collections import Counter
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
from app.services.persona import persona_to_dict
from app.utils.id_generator import generate_id
from types import SimpleNamespace

load_dotenv()

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ============================================================================
# MANUAL PERSONA GENERATION - CACHED PROMPT PARTS
# ============================================================================

# Static part - Framework and instructions (will be cached)
MANUAL_PERSONA_BASE_INSTRUCTIONS = """
    **ROLE**
    You are an Intelligent Persona Builder with dual-mode capability designed for the Synthetic-People research platform. Your mission is to transform minimal user input into rich, realistic, research-ready personas using a combination of web evidence extraction and intelligent inference.
    You should never change any traits that the user given.

    Core Capabilities:
    - Evidence-First Architecture: Extract persona traits from real conversations on Reddit, Quora, YouTube, X (Twitter), blogs, G2, and forums
    - Mode Generation: user-generated (custom build) personas
    - High Confidence Scoring: Provide transparent confidence metrics based on evidence strength
    - Intelligent Fallback: Automatically switch to RO-based generation when evidence is insufficient (Confidence < 0.70)
    - OCEAN Personality Integration: Generate adaptive Big Five personality profiles with visual spider charts

    **This is a Custom Build with Trait Selection**
    WORKFLOW PHASES

    **PHASE 1: Trait Selection Interface**
    Interface Design: Present trait categories sequentially with smart defaults and RO-informed suggestions.

    **PHASE 2: Research Objective Analysis**
    Input: User's confirmed Research Objective (RO)

    Tasks: 
    1. Parse RO for: - Target audience clues (age, income, gender, occupation, role) - Geography clues (Country, state, city, town) - Segmentation signals (premium vs value, heavy vs light users) - Category context (product complexity, purchase frequency, emotional stakes) - Journey orientation (awareness, consideration, evaluation, loyalty, lapsed) - Behavioral patterns (usage, switching, barriers, motivations)
    2.	Identify explicit and implicit segments:
    –	Demographics: Age bands, income levels, location types
    –	Psychographics: Value-seekers, quality-seekers, convenience-seekers, status-seekers
    –	Behaviors: Heavy users, occasional users, lapsed users, non-users
    Example: - RO: "Why do working professionals aged 25-40 drop out of online career skills courses in India?" - Extracted Signals: - Target: Working professionals, 25-40, India - Behavior: Course abandonment, drop-out - Category: Online education, career development - Journey: Post-purchase, usage stage

    PHASE 2: Persona Backstory Input (Optional)
    Mission: Allow user to provide additional context narrative
    Interface:
    ════════════════════════════════════════════════════════════
    ADD CONTEXT (OPTIONAL)
    ════════════════════════════════════════════════════════════

    Share any additional context about this persona that would help 
    create a richer profile:

    [Text area - 500 characters max]

    Examples:
    - "Recently promoted, feeling pressure to perform"
    - "Burned by past product that failed, now very cautious"
    - "Influenced heavily by spouse's opinions"

    [Continue] [Skip]

    **PHASE 3: Trait Synthesis & Query Generation**

    Mission: Convert selected traits into web search queries
    Process: 
    1. Analyze Selected Traits: Understand the persona skeleton 
    2. Generate Search Queries: Create 1-2 queries per platform targeting this profile 
    3. Add Psychological Depth Queries: Include queries to find behavioral contradictions, biases, emotional patterns

    Example: 
    Selected Traits: 
    - Age: 30-35 
    - Occupation: Software Engineer 
    - Income: ₹12-18L - Frustration: Time pressure, guilt about unfinished courses 
    - Journey Stage: Post-purchase, abandoned

    Generated Queries: 
    - "software engineer online course guilt never finished India" 
    - "tech professional learning pressure time management" 
    - "bought courses never completed regret career development" 
    - "fear of failure online certification anxiety"

    **PHASE 4-6: Evidence Gathering, Confidence Scoring, Backup Logic**
    **PHASE 4: Web Evidence Gathering**
    Important: Use references only from the sources listed below. NEVER use any other websites.

    Target Platforms (Priority Order):

    Tier 1 - High-Signal Platforms:

    1.	Reddit - Rich, authentic, long-form discussions
    –	Search subreddits matching category (e.g., r/productivity, r/careerdevelopment)
    –	Sort by relevance + comment count (high engagement = rich insights)
    –	Time filter: Past 12 months (prioritize recent)
    –	NEW: Look for: Behavioral contradictions, emotional language, cognitive biases revealed in text

    2.	Quora - Structured Q&A with personal context
    –	Search question format
    –	Focus on answers with 500+ words (depth)
    –	Prioritize answers with upvotes and detailed personal stories
    –	NEW: Look for: Rationalization patterns, hidden motivations, "says vs. does" signals

    3.	YouTube - Video reviews and personal experiences
    –	Comments sections are gold mines
    –	Look for honest reviews, experience videos
    –	NEW: Look for: Emotional reactions, body language in videos, comment patterns revealing psychology

    4.	X (Twitter) - Real-time sentiment and quick takes
    –	Search hashtags and phrases
    –	Look for threads, not just single tweets
    –	NEW: Look for: Emotional outbursts, impulsive sharing, peer influence patterns

    Tier 2 - Context-Specific Platforms:

    5. G2/Capterra - B2B software reviews (for B2B research only)

    6. Blogs/Medium - In-depth personal narratives

    7. Niche Forums – Relevant and trust worthy category-specific communities

    Extraction Targets:
    For each conversation, extract:
    Core Data: - Age/Life Stage Clues: "I'm a new mom", "mid-30s professional", "college student" - Location Clues: City, state, country mentions - Occupation Clues: Job titles, industries, work contexts - Income/Budget Clues: Spending patterns, affordability concerns - Pain Points: Explicit frustrations, barriers, obstacles - Motivations: Why they're seeking solution - Usage Patterns: Frequency, intensity, context of behavior - Journey Stage Clues: Researching, considering, using, abandoned, loyal
    Behavioral Depth Data: - Contradictions: What they SAY vs. what their behavior reveals - E.g., "I value time" but spends 20+ hours researching small purchase - Cognitive Biases: Evidence of specific biases - Loss aversion: "What if it doesn't work?" - Status quo bias: "I've always used X brand" - Social proof: "Everyone in my circle uses this" - Emotional Triggers: Fear, anxiety, desire, excitement moments - "I was terrified of making the wrong choice" - "Reading that review made me panic" - Subconscious Drivers: The "why behind the why" - Surface: "I want to lose weight" - Deeper: "I want to feel in control" - Deepest: "I want to feel worthy of love" - Decision Heuristics: Mental shortcuts revealed - "If a doctor recommends it, I trust it" - "I only buy from brands I recognize" - Ritual Patterns: Behavioral loops and habits - "Every Saturday I go to the same store" - "I always read reviews before buying anything"
    Evidence Quality Markers: - HIGH SIGNAL: Direct quotes, specific examples, detailed stories, emotional language, contradictions revealed - MEDIUM SIGNAL: General patterns, second-hand accounts, brief mentions - LOW SIGNAL: Vague statements, hypothetical scenarios, marketing speak
    Minimum Evidence Threshold: - Aim for 25-35 high-quality conversations across 3+ platforms - Each persona cluster should be backed by 6-8+ conversations minimum - Prioritize quality over quantity (one rich 500-word story > five brief mentions)

    Demographics (explicit mentions only): - Age, Location, Occupation, Income
    Psychographics (from sentiment/language): - Values, Motivations, Aspirations, Frustrations
    Behaviors (from action descriptions): - Usage patterns, Decision triggers, Abandonment reasons, Purchase patterns
    Emotional Cues: - Excitement, Frustration, Regret, Anxiety
    Target Volume: 25-40 high-signal conversations minimum

    Documentation: 
    For each extracted insight, record ONLY:
    - Platform & source
    - Key behavioral pattern
    - Direct quote (if highly relevant)

    Skip low-signal content immediately - brief mentions, hypothetical scenarios, and marketing speak.

    **PHASE 5: Confidence Score Calculation**
    CRITICAL: Calculate confidence score BEFORE proceeding to persona building.
    Confidence Score Formula (0.00-1.00):
    Confidence Score = (Volume_Score × 0.25) +
                    (Source_Diversity_Score × 0.20) +
                    (Recency_Score × 0.15) +
                    (Signal_Clarity_Score × 0.25) +
                    (RO_Alignment_Score × 0.15)

    Component Scoring:
    1. Volume_Score (0.0 - 1.0) - 0-10 conversations: 0.20 - 11-25 conversations: 0.50 - 26-50 conversations: 0.75 - 51+ conversations: 1.00
    2. Source_Diversity_Score (0.0 - 1.0) - 1 platform: 0.30 - 2 platforms: 0.60 - 3 platforms: 0.85 - 4+ platforms: 1.00
    3. Recency_Score (0.0 - 1.0) - 70%+ from past 6 months: 1.00 - 50-69% from past 6 months: 0.75 - 30-49% from past 6 months: 0.50 - <30% from past 6 months: 0.25
    4. Signal_Clarity_Score (0.0 - 1.0) Assessment of how clear and specific the evidence is
    5. RO_Alignment_Score (0.0 - 1.0) How well evidence matches Research Objective

    Confidence Tiers: - HIGH: 0.70-1.00 - MEDIUM: 0.50-0.69 - LOW: < 0.50

    **PHASE 6: BACKUP LOGIC DECISION POINT**

    CRITICAL DECISION:
    IF (Confidence_Score < 0.70) THEN
        Execute RO-BASED PERSONA GENERATION
    ELSE
        Execute EVIDENCE-BASED PERSONA GENERATION
    END IF

    Path A: EVIDENCE-BASED (Confidence ≥ 0.70) - Use web evidence as primary source - Build personas from actual conversation patterns
    Path B: RO-BASED (Confidence < 0.70) - Build personas primarily from RO context + category archetypes

    Execute identical web evidence gathering, confidence calculation, and backup logic decision process.

    **PHASE 7: Persona Building & Enrichment with Behavioral Depth**

    Mission: Create complete persona card using selected traits + evidence/RO-based enrichment + behavioral depth analysis
    Building Process: 
    1. Core Profile: Use exact trait selections from user 
    2. Demographic Details: Fill gaps with evidence or RO inference 
    3. Psychographic Expansion: Elaborate on values, motivations from evidence/archetype 
    4. Behavioral Patterns: Derive from trait selections + evidence validation 
    5. OCEAN Profile: Infer from selected traits
    6. Behavioral Depth Profile: Apply complete framework
    7. Barriers & Triggers: Extract from evidence or infer from RO + traits 
    8. Journey Positioning: Use selected journey stage 
    9. Realistic Details: Generate name, lifestyle narrative, quotes (if evidence-based)

    Enrichment Priority: 
    1. Use evidence from web search (if Confidence ≥ 0.70) 
    2. Infer from category archetypes (RO-based) 
    3. Apply research best practices and behavioral psychology norms

    Specific Additions: 
    User-Selected Traits: List all traits explicitly chosen by user 
    - Trait Validation Status: Mark each trait as [VALIDATED] or [INFERRED] 
    - Evidence Coverage: Percentage of traits supported by evidence

    **BEHAVIORAL DEPTH PROFILE FRAMEWORK**
    **Integration Guidelines**

    When to Apply Behavioral Depth
    EVIDENCE-BASED PATH (Confidence ≥ 0.70): - Extract behavioral depth signals directly from evidence
    RO-BASED PATH (Confidence < 0.70): - Apply category-typical behavioral patterns

    Quality Standards for Behavioral Depth
    Each behavioral depth element should: 1. Feel real and specific 2. Connect to evidence or archetype 3. Provide actionable insight

    Critical Reminders
    - Behavioral contradictions are GOLD
    - Dig 3-5 layers deep on motivations
    - Emotions drive decisions
    - Context matters
    - Rituals resist change
    - White spaces are opportunities

    **APPENDICES**
    **Appendix A: Evidence Snapshot Format**
    Based on [N] real conversations from platforms
    Confidence Score: [0.XX] ([LEVEL])
    Confidence Breakdown: Volume, Source Diversity, Recency, Signal Clarity, RO Alignment

    **Appendix B: Quality Assurance Checklist**
    Verify completeness, coherence, transparency, usability, depth & authenticity

    **Appendix C: Key Formulas**
    Confidence Score Formula with thresholds

    **Appendix D: Behavioral Depth Integration Guidelines**
    Application by Confidence Level: HIGH, MEDIUM, LOW
    Category-Specific Behavioral Templates

    **confidence_scoring_output_instructions**
    Important: You Should create the confidence for each personas you are generating.

    Evaluate the persona across SIX DIMENSIONS:
    1. COMPLETENESS
    2. INTERNAL CONSISTENCY
    3. DEMOGRAPHIC REALISM
    4. PSYCHOGRAPHIC DEPTH
    5. BEHAVIORAL ALIGNMENT
    6. ALIGNMENT WITH RESEARCH OBJECTIVE

    SCORING RULES:
    - Score must be based on the Phase 4
    - Stars must be 1.0 to 5.0
    - Reliability must be one of: "High", "Medium", "Low"

    OUTPUT:
    Return STRICT JSON ONLY in this EXACT format:
    {
    "score": "NN%",
    "stars": X.X,
    "reliability": "High or Medium or Low",
    "strengths": ["text", "text"],
    "weaknesses": ["text", "text"],
    "improvements": "One short actionable paragraph"
    }

    **FINAL OUTPUT FORMAT (VERY IMPORTANT):**
    Return ONLY this format:
    {
    "consumer_personas": [
        {
            "name": "Theme-Based Descriptive Name",
            "age_range": "eg: 18-24",
            "gender": "Male/Female",
            "confidence_scoring": as per the confidence_scoring_output_instructions,
            "reference_sites_with_usage": [Mention list of reference sites links.]
            "evidence_snapshot": EVIDENCE SNAPSHOT
            ...all other fields (ALL must relate to personas)...
        }
    ]
    }

    No additional text. No explanations. No markdown.
    """

    # Dynamic part - User inputs and research objective (changes per call)
MANUAL_PERSONA_DYNAMIC_TEMPLATE = """
    **To produce a valid output, do not change any mandatory key names listed below:**

    {mandatory_field_names}

    **Collected Traits from the User:**
    {payload}

    **RESEARCH OBJECTIVE**
    {research_objective}

    **Sample Persona Example:**
    {sample_persona_example}

    Based on the user-provided traits, research objective, and sample format above, generate exactly 1 high-quality persona following ALL instructions in the system prompt.
    """

def merge_payload_into_persona(llm_persona: dict, payload: dict) -> dict:
    """
    Payload always wins.
    If LLM misses a field or returns empty, inject from payload.
    """
    for key, value in payload.items():
        if value is None:
            continue

        # LLM missing the field
        if key not in llm_persona:
            llm_persona[key] = value
            continue

        # LLM returned empty
        if llm_persona[key] in ("", [], {}, None):
            llm_persona[key] = value

    return llm_persona


async def manual_persona(exploration_id, workspace_id, current_user_id, payload):
    print("------------------ /////////////// -----------------------")
    print(payload)
    print("------------------ /////////////// -----------------------")

    description = await get_description(exploration_id)

    # ============================================================================
    # PREPARE DYNAMIC PROMPT DATA
    # ============================================================================
    
    sample_pesona_example = """
    {
        "name": "Social Butterfly Connector",
        "age_range": "65-75",
        "gender": "Female",
        "location_country": "Urban",
        "location_state": "",
        "education_level": "Bachelor's Degree",
        "occupation": "Retired Teacher",
        "income_range": "50,000-70,000",
        "family_size": "2",
        "geography": "Urban",
        "lifestyle": "Active, Engaged in community events",
        "values": "Achievement / Success, Security / Stability, Independence / Freedom, Altruism / Helping others",
        "personality": "Conscientiousness (Organized, Responsible), Extraversion (Outgoing, Sociable), Agreeableness (Cooperative, Compassionate), Neuroticism (Emotional, Anxious, Resilient), Openness (Creative, Curious)",
        "interests": "Social gatherings, Volunteering, Travel",
        "motivations": "Desire for companionship, Seeking new friendships, Enjoying social activities",
        "brand_sensitivity": "",
        "price_sensitivity": "",
        "mobility": "Good, drives independently",
        "accommodation": "Lives in a senior-friendly apartment complex",
        "marital_status": "",
        "daily_rhythm": "Socially active during the day, prefers evenings with friends",
        "hobbies": "",
        "professional_traits": "Strong communicator, Facilitator of group activities",
        "digital_activity": "Active on social media, Uses dating apps designed for seniors",
        "preferences": "Prefers group dating experiences, Enjoys interactive events",
        "ocean_profile":{
        "scores": {
            "openness": 0.75,
            "conscientiousness": 0.6,
            "extraversion": 0.8,
            "agreeableness": 0.7,
            "neuroticism": 0.4
        },
        "labels": {
            "openness": "High",
            "conscientiousness": "Medium",
            "extraversion": "High",
            "agreeableness": "High",
            "neuroticism": "Medium"
        },
        }
        "barriers_pain_points": {
            "structural": ["Hard to verify real durability pre-purchase"],
            "psychological": ["Skepticism toward rebrands"],
            "emotional": ["Disappointment over perceived 'enshittification'"],
            "category_specific": ["Beauty: refill systems limited"]
        },
        "triggers_opportunities": {
            "functional_triggers": ["Repairability warranties, lifetime service"],
            "emotional_triggers": ["Brands that admit trade-offs"],
            "situational_triggers": ["Home upgrades, seasonal wardrobe refresh"],
            "promotional_triggers": ["Transparent bundle savings"]
        },
        "reference_sites_with_usage": [
            "https://www.reddit.com//r/BuyItForLife/comments/1nakdr8/",
            "https://medium.com/%40nandinibrandfinity/why-so-many-big-brands/"
        ],
        "evidence_snapshot": {
            "total_conversations": 428,
            "sources": [{"platform": "Reddit", "threads_or_posts": 214}],
            "timeframe": {"months_analyzed": 12},
            "confidence_calculation_detail": {
                "value": 0.91,
                "level": "High",
                "weighted_total": 0.91
            }
        }
    }
    """
    
    mandatory_field_names = """
1. name
2. age_range
3. gender
4. location_country
5. location_state
6. education_level
7. occupation
8. income_range
9. family_size
10. geography
11. lifestyle
12. values
13. personality
14. interests
15. motivations
16. brand_sensitivity
17. price_sensitivity
18. mobility
19. accommodation
20. marital_status
21. daily_rhythm
22. hobbies
23. professional_traits
24. digital_activity
25. preferences
26. ocean_profile
27. barriers_pain_points
28. triggers_opportunities
29. reference_sites_with_usage
30. evidence_snapshot
    """

    # Format the dynamic prompt with user-specific data
    dynamic_prompt = MANUAL_PERSONA_DYNAMIC_TEMPLATE.format(
        mandatory_field_names=mandatory_field_names,
        payload=json.dumps(payload, indent=2),
        research_objective=description,
        sample_persona_example=sample_pesona_example
    )

    # ============================================================================
    # API CALL WITH PROMPT CACHING
    # ============================================================================
    
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
                        "text": MANUAL_PERSONA_BASE_INSTRUCTIONS,
                    }
                ]
            },
            {
                "role": "user",
                "content": dynamic_prompt
            }
        ],
    )
    
    # ============================================================================
    # CACHE MONITORING (OPTIONAL - FOR DEBUGGING)
    # ============================================================================
    print("\n" + "=" * 60)
    print("MANUAL PERSONA API USAGE STATS")
    print("=" * 60)
    if hasattr(response, 'usage'):
        usage = response.usage
        prompt_tokens = getattr(usage, 'prompt_tokens', 0)
        cached_tokens = getattr(usage, 'cached_tokens', 0)
        output_tokens = getattr(usage, 'completion_tokens', 0)
        
        print(f"Prompt tokens:  {prompt_tokens}")
        print(f"Cached tokens:  {cached_tokens}")
        print(f"Output tokens:  {output_tokens}")
        
        if cached_tokens > 0:
            print(f"\n✓ CACHE HIT! Saved {cached_tokens} tokens from processing")
        else:
            print(f"\n✗ Cache miss (first call or cache expired)")
    else:
        print("Usage stats not available")
    print("=" * 60 + "\n")

    response_text = response.output_text

    data = json.loads(response_text)
    customer_personas = data.get("consumer_personas", "")
    if customer_personas:
        for persona in customer_personas:
            persona["auto_generated_persona"] = False
            reference_sites = persona.get("reference_sites_with_usage", [])
            site_counter = dict(
                Counter(urlparse(url).netloc for url in reference_sites)
            )
            persona["researched_sites"] = site_counter
            persona = merge_payload_into_persona(persona, payload)
            data = SimpleNamespace(**persona)
            persona_id = generate_id()
            persona["id"] = persona_id

            async with AsyncSession(async_engine) as session:
                p = Persona(
                    id=persona_id,
                    exploration_id=exploration_id,
                    workspace_id=workspace_id,
                    name=getattr(data, "name", ""),
                    age_range=getattr(data, "age_range", ""),
                    gender=getattr(data, "gender", ""),
                    location_country=getattr(data, "location_country", ""),
                    location_state=getattr(data, "location_state", ""),
                    education_level=getattr(data, "education_level", ""),
                    occupation=getattr(data, "occupation", ""),
                    income_range=getattr(data, "income_range", ""),
                    family_size=getattr(data, "family_size", ""),
                    geography=getattr(data, "geography", ""),
                    lifestyle=getattr(data, "lifestyle", ""),
                    values=(
                        data.values[0]
                        if isinstance(getattr(data, "values", None), list) and data.values
                        else getattr(data, "values", "")
                    ),
                    personality=(
                        data.personality[0]
                        if isinstance(getattr(data, "personality", None), list) and data.personality
                        else getattr(data, "personality", "")
                    ),
                    interests=getattr(data, "interests", ""),
                    motivations=getattr(data, "motivations", ""),
                    brand_sensitivity=getattr(data, "brand_sensitivity", ""),
                    price_sensitivity=getattr(data, "price_sensitivity", ""),
                    mobility=getattr(data, "mobility", ""),
                    accommodation=getattr(data, "accommodation", ""),
                    marital_status=getattr(data, "marital_status", ""),
                    daily_rhythm=getattr(data, "daily_rhythm", ""),
                    hobbies=getattr(data, "hobbies", ""),
                    professional_traits=getattr(data, "professional_traits", ""),
                    digital_activity=getattr(data, "digital_activity", ""),
                    preferences=getattr(data, "preferences", ""),
                    backstory=getattr(data, "backstory", ""),
                    created_by=current_user_id,
                    persona_details=persona,
                    auto_generated_persona=False,
                    calibration_confidence=50,
                )

                session.add(p)
                await session.commit()
                await session.refresh(p)

    return persona_to_dict(p)
