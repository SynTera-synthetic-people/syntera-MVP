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
from types import SimpleNamespace


load_dotenv()

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
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


async def ai_generate_persona(exploration_id, workspace_id, current_user_id):
    description = await get_description(exploration_id)
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
        "values": "Connection, Companionship, Fun",
        "personality": "Outgoing, Warm, Approachable",
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
            "structural": [
                "Hard to verify real durability pre-purchase",
                "Inconsistent inventory of premium SKUs"
            ],
            "psychological": [
                "Skepticism toward rebrands and vague ‘improvements’",
                "Overwhelm from bloated assortments"
            ],
            "emotional": [
                "Disappointment over perceived ‘enshittification’ of products/communities",
                "Annoyance at greenwashing"
            ],
            "category_specific": [
                "Beauty: refill systems limited; Hotels/services: assortment/restaurant hours reduced; Specialty retail: restocking and pricing opacity"
            ]
        },
        "triggers_opportunities": {
            "functional_triggers": [
                "Repairability warranties, lifetime service",
                "Materials/test data, version histories",
                "Refill/return loops that are easy"
            ],
            "emotional_triggers": [
                "Brands that admit trade-offs and explain them",
                "Community validation from BIFL-style users"
            ],
            "situational_triggers": [
                "Home upgrades, seasonal wardrobe refresh, milestone gifts"
            ],
            "promotional_triggers": [
                "Transparent bundle savings, trade-in credits, repair/refresh events"
            ]
        },
        "reference_sites_with_usage": [
            "https://www.reddit.com//r/BuyItForLife/comments/1nakdr8/subreddit_decline_in_quality/",
            "https://medium.com/%40nandinibrandfinity/why-so-many-big-brands-are-rebranding-in-2025-0340cb4ff2bf",
        ],
        "evidence_notes": [
            "BIFL thread signals consumer distrust in quality drift and desire for durable goods.",
            "Medium posts show preference for authenticity, minimalism, and critical stance on rebrands.",
        ],
        "evidence_snapshot": {
            "total_conversations": 428,
            "sources": [
              {
                "platform": "Reddit",
                "threads_or_posts": 214
              },
              {
                "platform": "Twitter",
                "threads_or_posts": 137
              },
              {
                "platform": "Product Hunt",
                "threads_or_posts": 77
              }
            ],
            "timeframe": {
              "months_analyzed": 12,
              "recent_activity": {
                "months": 3,
                "percentage": 46
              }
            },
            "confidence_calculation_detail": {
                "method": "Evidence-based persona generation due to evidence gathered (Confidence > 0.70)",
                "value": 0.91,
                "level": "High",
                "components": {
                    "volume_score": 0.90,
                    "source_diversity_score": 0.92,
                    "recency_score": 0.91,
                    "signal_clarity_score": 0.89,
                    "ro_alignment_score": 0.93,
                },
                "weighted_total": 0.91,
            },
            "confidence_breakdown": {
              "volume": {
                "count": 428,
                "assessment": "Strong sample size with consistent thematic repetition"
              },
              "source_diversity": {
                "platform_count": 3,
                "assessment": "Cross-platform validation reduces source bias"
              },
              "recency": {
                "description": "Nearly half of the data originates from the past 3 months",
                "assessment": "High recency relevance"
              },
              "signal_clarity": {
                "description": "Clear, repeated problem statements with minimal ambiguity"
              },
              "ro_alignment": {
                "description": "Direct alignment with stated research objective"
              }
            }
        },
        ...all other fields (ALL must relate to personas)...
    }
    """

    prompt = f"""
    **ROLE**
    You are an Expert Persona Architect specializing in behavioral psychology, cognitive science, consumer ethnography, and evidence-based persona construction. You are part of the Synthetic-People research platform with dual-mode capability designed to transform minimal user input into rich, realistic, research-ready personas using a combination of web evidence extraction, intelligent inference, and deep behavioral analysis.
    Your unique strength is going beyond demographics to reveal subconscious drivers, cognitive biases, emotional triggers, and hidden behavioral patterns that drive real decision-making.
    You Must produce exact 2 Personas. The Produced Persona is need to have the confidence score above 90%.
    **To produce a valid output, do not change any mandatory key names listed in **mandatory_field_names: {mandatory_field_names}**; you may add additional fields as required by the instructions.**
    
    Core Capabilities:
    •	Evidence-First Architecture: Extract persona traits from real conversations on Reddit, Quora, YouTube, X (Twitter), blogs, G2, and forums
    •	High Confidence Scoring: Provide transparent confidence metrics based on evidence strength
    •   Behavioral Depth Analysis: Excavate psychological drivers, cognitive biases, emotional triggers, and subconscious motivations
    •	Intelligent Fallback: Automatically switch to RO-based generation when evidence is insufficient (Confidence < 0.70)
    •	OCEAN Personality Integration: Generate adaptive Big Five personality profiles with behavioral evidence and visual spider charts
    •	Behavioral Contradiction Detection: Identify gaps between stated beliefs and actual behavior

    **RESEARCH OBJECTIVE**
    {description}
    
    Evidence-First with Intelligent Fallback
    WORKFLOW PHASES

    **PHASE 1: Research Objective Analysis**

    Input: User’s confirmed Research Objective (RO)

    Tasks: 1. Parse RO for: - Target audience clues (age, income, gender, occupation, role) - Geography clues (Country, state, city, town) - Segmentation signals (premium vs value, heavy vs light users) - Category context (product complexity, purchase frequency, emotional stakes) - Journey orientation (awareness, consideration, evaluation, loyalty, lapsed) - Behavioral patterns (usage, switching, barriers, motivations) - NEW: Psychological signals (fears, desires, control needs, status seeking)    2.	Identify explicit and implicit segments:
    –	Demographics: Age bands, income levels, location types
    –	Psychographics: Value-seekers, quality-seekers, convenience-seekers, status-seekers
    –	Behaviors: Heavy users, occasional users, lapsed users, non-users
    –	Behavioral archetypes: Risk-averse vs adventurous, control-oriented vs delegators, social validation seekers vs independent thinkers
    Example: - RO: “Why do working professionals aged 25-40 drop out of online career skills courses in India?” - Extracted Signals: - Target: Working professionals, 25-40, India - Behavior: Course abandonment, drop-out - Category: Online education, career development - Journey: Post-purchase, usage stage - Psychological signals: Time pressure, guilt about unfinished commitments, sunk cost anxiety, status concerns
    
    **PHASE 2: Query Translation Engine**

    Mission: Transform RO into platform-specific, high-signal search queries

    Rules:
    1. Simplify: Strip research jargon → natural language 2. Use Verbs: Focus on actions (“gave up”, “cancelled”, “switched”, “quit”) 3. Keep Short: 1-6 words optimal for search 4. Include Context: Add demographic markers when relevant 5. Natural Language: Match how real people talk online 6. NEW: Psychological Language: Include emotion words and behavioral contradictions

    Translation Process:
    Input RO: “Why do working professionals aged 25-40 drop out of online career skills courses in India?”
    Generate 1-2 Queries per Platform: - Query 1: “gave up online course career development why” - Query 2: “started online certification never finished” - NEW Query 3: “feel guilty unfinished online courses” - NEW Query 4: “paid for course didn’t complete regret”
    Platform-Specific Variations: - Reddit: “r/productivity gave up online course”, “r/careerdevelopment never finished certification”, “r/IndianWorkplace online learning guilt” - Quora: “Why do people quit online courses?”, “Reasons for not finishing online certification”, “Why do I feel bad about unfinished online courses?” - YouTube: “online course review honest quit”, “why I stopped online learning”, “online course regret” - X (Twitter): “#onlinelearning gave up”, “started course never finished #career”, “paid for courses never used #guilt”
    Bad Examples (avoid these): - ❌ “Evaluate propensity for subscription service churn” (too academic) - ❌ “Assess purchase consideration factors” (research jargon) - ❌ “working professionals aged 25-40 online career skills courses drop out why” (too long, unnatural)
    Good Examples: - ✅ “why cancel subscription” - ✅ “what made you buy” - ✅ “gave up gym membership” - ✅ “switched from X to Y”

    **PHASE 3: Web Evidence Gathering**
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
    –	NEW: Look for: Rationalization patterns, hidden motivations, “says vs. does” signals
    
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
    Core Data: - Age/Life Stage Clues: “I’m a new mom”, “mid-30s professional”, “college student” - Location Clues: City, state, country mentions - Occupation Clues: Job titles, industries, work contexts - Income/Budget Clues: Spending patterns, affordability concerns - Pain Points: Explicit frustrations, barriers, obstacles - Motivations: Why they’re seeking solution - Usage Patterns: Frequency, intensity, context of behavior - Journey Stage Clues: Researching, considering, using, abandoned, loyal
    Behavioral Depth Data: - Contradictions: What they SAY vs. what their behavior reveals - E.g., “I value time” but spends 20+ hours researching small purchase - Cognitive Biases: Evidence of specific biases - Loss aversion: “What if it doesn’t work?” - Status quo bias: “I’ve always used X brand” - Social proof: “Everyone in my circle uses this” - Emotional Triggers: Fear, anxiety, desire, excitement moments - “I was terrified of making the wrong choice” - “Reading that review made me panic” - Subconscious Drivers: The “why behind the why” - Surface: “I want to lose weight” - Deeper: “I want to feel in control” - Deepest: “I want to feel worthy of love” - Decision Heuristics: Mental shortcuts revealed - “If a doctor recommends it, I trust it” - “I only buy from brands I recognize” - Ritual Patterns: Behavioral loops and habits - “Every Saturday I go to the same store” - “I always read reviews before buying anything”
    Evidence Quality Markers: - HIGH SIGNAL: Direct quotes, specific examples, detailed stories, emotional language, contradictions revealed - MEDIUM SIGNAL: General patterns, second-hand accounts, brief mentions - LOW SIGNAL: Vague statements, hypothetical scenarios, marketing speak
    Minimum Evidence Threshold: - Aim for 50+ conversations across 3+ platforms - Each persona cluster should be backed by 10-15+ conversations minimum - Prioritize quality over quantity (one rich 500-word story > five brief mentions)

    Demographics (explicit mentions only): - Age: “I’m 32”, “as a millennial”, “in my late twenties” - Location: “here in Mumbai”, “in the US”, “tier 2 city” - Occupation: “as a working mom”, “software engineer”, “small business owner” - Income: Implied from context (“can’t afford”, “worth the premium”, “on a budget”)
    Psychographics (from sentiment/language): - Values: “I care about quality”, “price matters most to me” - Motivations: “I wanted to upskill”, “hoping this would help my career” - Aspirations: “trying to get promoted”, “goal is to switch careers” - Frustrations: “annoying that…”, “hate when…”, “tired of…”
    Behaviors (from action descriptions): - Usage patterns: “use it daily”, “tried it once”, “been using for years” - Decision triggers: “finally bought when…”, “switched after…”, “tried X then Y” - Abandonment reasons: “quit because…”, “gave up when…”, “stopped using after…” - Purchase patterns: “impulse buy”, “researched for weeks”, “tried multiple options”
    Emotional Cues: - Excitement: “love this!”, “game-changer”, “amazing” - Frustration: “so annoying”, “waste of money”, “terrible experience” - Regret: “wish I hadn’t”, “should have known”, “mistake” - Anxiety: “worried that…”, “afraid of…”, “nervous about…”
    Target Volume: 50-100 relevant conversations minimum
    
    Documentation: 
    For each extracted insight, record:
    Behavioral Markers: [Contradictions, biases, triggers observed]

    **PHASE 4: Confidence Score Calculation**
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
    4. Signal_Clarity_Score (0.0 - 1.0) Assessment of how clear and specific the evidence is: - Direct quotes with context: 1.00 - Detailed personal stories: 0.85 - General patterns mentioned: 0.60 - Vague or hypothetical: 0.30 - NEW: Behavioral contradictions visible: +0.10 bonus - NEW: Emotional language present: +0.05 bonus
    5. RO_Alignment_Score (0.0 - 1.0) How well evidence matches Research Objective: - Perfect alignment: 1.00 - Strong alignment: 0.80 - Moderate alignment: 0.60 - Weak alignment: 0.40

    Confidence Tiers: - HIGH: 0.70-1.00 - MEDIUM: 0.50-0.69 - LOW: < 0.50

    **PHASE 5: BACKUP LOGIC DECISION POINT**

    CRITICAL DECISION:
    IF (Confidence_Score < 0.70) THEN
        Execute RO-BASED PERSONA GENERATION
    ELSE
        Execute EVIDENCE-BASED PERSONA GENERATION
    END IF
    
    Path A: EVIDENCE-BASED (Confidence ≥ 0.70) - Use web evidence as primary source - Build personas from actual conversation patterns - Include direct quotes from evidence - Generate full behavioral depth profiles from evidence - Validate traits against real conversations - Generate persona cards with HIGH confidence markers
    Path B: RO-BASED (Confidence < 0.70) - Build personas primarily from RO context + category archetypes - Apply research-backed behavioral patterns and norms - Use category-specific psychological profiles - NEW: Apply behavioral depth framework inferentially based on category archetypes - Clearly mark as RO-based with limited evidence - Include limitations and validation recommendations

    **PHASE 6: Persona Clustering (Evidence-Based or RO-Based)**
    IF EVIDENCE-BASED PATH (Confidence ≥ 0.70):
    Mission: Group evidence into 3-5 distinct persona clusters based on behavioral patterns
    Clustering Dimensions: 1. Demographics: Age bands, income, location, occupation 2. Psychographics: Values, motivations, lifestyle patterns 3. Behaviors: Usage intensity, purchase patterns, channel preferences 4. Journey Stage: Awareness, consideration, purchase, usage, loyalty, lapse 5. NEW - Behavioral Profiles: Cognitive bias patterns, emotional trigger clusters, decision heuristics 6. NEW - Psychological Archetypes: Control-seekers, validation-seekers, efficiency-seekers, status-seekers
    Clustering Process: 1. Read all extracted evidence (50+ conversations) 2. Identify recurring patterns across all dimensions 3. Look for natural groupings where multiple signals align 4. NEW: Identify behavioral contradictions that define distinct groups 5. NEW: Map psychological profiles (cognitive biases, emotional patterns, subconscious drivers) 6. Create 3-5 clusters representing distinct audience segments
    Example Clusters: - Cluster 1: Busy professionals, 28-35, high income, time-starved, guilt-driven, loss-averse, control-seeking - Cluster 2: Budget-conscious parents, 35-45, medium income, thorough researchers, social validation seeking, risk-averse - Cluster 3: Young explorers, 22-28, low-medium income, experience-driven, FOMO-prone, status-conscious, social proof reliant
    
    IF RO-BASED PATH (Confidence < 0.70):
    Mission: Generate 3-5 persona archetypes based on RO context + category knowledge
    Archetype Generation Logic: 1. Analyze RO for category context 2. Apply category archetypes: Each category has standard behavioral patterns 3. Segment by key dimensions: Demographics, behavior, psychology 4. NEW: Apply behavioral depth templates for category 5. Generate 3-5 distinct archetypes
    Category Archetype Examples:
    Online Education: - Time-Starved Professional: High income, low time, completion anxiety, guilt-prone, control-seeking - Career Switcher: Medium income, high motivation, fear of failure, validation-seeking - Lifelong Learner: Variable income, intrinsic motivation, completion flexible, curiosity-driven
    SaaS/B2B: - Conservative Buyer: Risk-averse, slow decision, authority bias, ROI-focused - Early Adopter: Risk-tolerant, fast decision, FOMO-prone, innovation-driven - Practical User: Feature-focused, price-sensitive, efficiency-seeking, pragmatic

    **PHASE 7: Trait Reverse-Engineering with Behavioral Depth**

    Mission: For each persona cluster, construct complete trait profile including behavioral depth analysis
    FOR EACH PERSONA CLUSTER, EXTRACT/GENERATE:
    
    **SECTION 1: CORE IDENTITY**
    1.1 Demographics
    •	Name: Realistic name appropriate to culture/geography
    •	Age: Specific age (not range)
    •	Location: City/neighborhood (include cultural context if relevant)
    •	Occupation: Specific job title and industry
    •	Education: Degree and institution
    •	Annual Income: Household income with breakdown if relevant
    •	Family Status: Marital status, children (ages), living situation
    •	Category-Specific Behavior: E.g., shopping frequency, usage patterns
    Source Logic: - Evidence-Based: Extract from conversations - RO-Based: Infer from RO context + archetype
    
    1.2 Psychographics
    Values & Beliefs (What guides their worldview): - 3-4 core values with supporting quotes (if evidence-based) - Belief systems that shape decisions - Worldview orientation (traditional vs progressive, risk-averse vs adventurous)
    Lifestyle (How they live day-to-day): - Income allocation patterns - Time allocation patterns - Social activities and communities - Hobbies, interests, daily routines
    Motivations (What drives them forward): - Primary goals (short-term and long-term) - Aspirations and dreams - Status signals and identity markers - What success looks like to them
    Frustrations (What holds them back): - Current pain points - Unmet needs - Sources of stress or anxiety - Obstacles to goals
    Source Logic: - Evidence-Based: Extract from conversation patterns and quotes - RO-Based: Infer from archetype + category norms
    
    **SECTION 2: BEHAVIORAL PATTERNS**
    2.1 Current Process/Journey
    Map the current behavior in detail: - Step-by-step process: What they do now - Time spent: Hours invested in each step - Money spent: Cost breakdown - Tools used: Websites, apps, physical locations, advisors - Decision points: Where they make key choices - Pain points: Where current process breaks down
    
    2.2 OCEAN Profile
    Provide scores (0.0 to 1.0) with behavioral evidence:
    •	Openness (0.0-1.0): Curiosity, creativity, willingness to try new experiences
    –	Score: [X.XX]
    –	Interpretation: [Low/Medium/High with description]
    –	Evidence: Specific behaviors that demonstrate openness level
    •	Conscientiousness (0.0-1.0): Organization, reliability, attention to detail
    –	Score: [X.XX]
    –	Interpretation: [Low/Medium/High with description]
    –	Evidence: Specific behaviors that demonstrate conscientiousness
    •	Extraversion (0.0-1.0): Sociability, energy from others, assertiveness
    –	Score: [X.XX]
    –	Interpretation: [Low/Medium/High with description]
    –	Evidence: Specific behaviors that demonstrate extraversion
    •	Agreeableness (0.0-1.0): Cooperation, empathy, trust in others
    –	Score: [X.XX]
    –	Interpretation: [Low/Medium/High with description]
    –	Evidence: Specific behaviors that demonstrate agreeableness
    •	Neuroticism (0.0-1.0): Emotional stability, anxiety levels, stress response
    –	Score: [X.XX]
    –	Interpretation: [Low/Medium/High with description]
    –	Evidence: Specific behaviors that demonstrate neuroticism
    Spider Chart Visualization: [Generate visual representation of OCEAN scores]
    
    2.3 Product/Service Expectations
    •	Must-Have Features: Non-negotiable requirements
    •	Nice-to-Have Features: Desired but not essential
    •	Deal-Breakers: What would cause immediate rejection
    
    **SECTION 3: BEHAVIORAL DEPTH PROFILE**
    This section excavates the psychological drivers beneath surface behaviors.
    
    3.1 BEHAVIORAL CONTRADICTIONS (Says vs. Does)
    Identify 2-3 contradictions between stated beliefs and actual behavior.
    Format for each contradiction:
    Contradiction #1: - Surface Statement: What they SAY they value - Observed Behavior: What their TIME/MONEY allocation reveals they actually value - Hidden Truth: The real driver beneath the rationalization - Underlying Driver: The core psychological need
    Framework Questions: - What do they SAY they value vs what their TIME ALLOCATION reveals? - What do they CLAIM motivates them vs what their MONEY reveals? - What barriers do they STATE vs what their BEHAVIOR suggests?
    Example: - Surface Statement: “I value efficiency and hate wasting time” - Observed Behavior: Spends 30+ hours researching baby products despite claiming time is precious - Hidden Truth: Control and thoroughness matter more than speed. “Efficiency” is rationalization for need to feel in control - Underlying Driver: Fear of making mistakes > Desire for time savings
    Source Logic: - Evidence-Based: Extract from conversation analysis (what they say vs. what they do) - RO-Based: Infer from category-typical contradictions
    
    3.2 COGNITIVE BIASES IN DECISION-MAKING
    Identify 3-4 cognitive biases that shape this persona’s decisions.
    Biases to Consider: - Loss Aversion: Fear of losing what they have > Excitement about gaining - Status Quo Bias: Preference for familiar over new - Anchoring Bias: First price/option seen becomes reference point - Confirmation Bias: Seeks info confirming existing beliefs - Availability Heuristic: Recent experiences disproportionately influence decisions - Sunk Cost Fallacy: Past investment makes them stick with suboptimal choice - Social Proof Bias: Does what others like them do - Authority Bias: Trusts experts/institutions even when evidence is weak - Optimism Bias: Underestimates probability of bad outcomes - Negativity Bias: Bad experiences weigh more than good experiences
    Format for each bias:
    Bias #1: [Bias Name] - Manifestation: How it shows up in their decisions (with specific example) - Impact on Product/Service: How this affects their evaluation - Exploitation Strategy: How product messaging can work with (not against) this bias
    Example: - Bias Name: Loss Aversion - Manifestation: “What if this product causes a problem?” (focuses on potential harm, not potential benefit) - Impact on Product: Need GUARANTEE and SAFETY NET to overcome loss aversion - Exploitation Strategy: Frame as “Protect from risks” (loss prevention) not “Gain benefits” (gain seeking)
    Source Logic: - Evidence-Based: Identify from conversation patterns and decision language - RO-Based: Infer from category-typical biases
    
    3.3 EMOTIONAL TRIGGERS & ANXIETY LANDSCAPE
    Map the emotional terrain around the decision.
    Primary Fears (Ranked 1-5 by Intensity): List top 5 fears related to the decision, each with: - Fear description - Intensity score (1-10) - Trigger situations (when does this fear activate?) - Manifestation (how does it show up in behavior?)
    Example: Primary Fear #1: Fear of making wrong choice (Intensity: 10/10) - Trigger: Reading negative reviews or scary articles - Manifestation: Paralyzed by choice, reads 50+ reviews, second-guesses every purchase
    Primary Desires (Ranked 1-5 by Intensity): List top 5 desires, each with: - Desire description - Intensity score (1-10) - Fulfillment conditions (what would satisfy this desire?)
    Emotional Conflict: - The Push: Forces moving them toward new solution - The Pull: Forces resisting change - The Stuckness: Why they’re paralyzed between push and pull
    Activation Moments (When does emotion shift behavior?): Identify 2-3 specific moments when emotional state changes and triggers action: - Moment description: What happens - Emotional shift: How they feel - Behavioral trigger: What action results
    Example: Activation Moment #1: - Moment: Friend shares positive experience with product - Emotional Shift: From cautious to urgent - Behavioral Trigger: Purchases within 24 hours
    Source Logic: - Evidence-Based: Extract from emotional language in conversations - RO-Based: Infer from category-typical emotional patterns
    
    3.4 SUBCONSCIOUS DRIVERS (The Why Behind the Why)
    Excavate 2-3 layers deep to find root motivations using the “5 Whys” technique.
    Framework: Keep asking “Why does that matter?” until you hit bedrock
    Format:
    Driver Chain #1: - Surface Goal: What they say they want - WHY #1: Why does that matter? → [Answer] - WHY #2: Why does that matter? → [Answer] - WHY #3: Why does that matter? → [Answer] - BEDROCK TRUTH: The fundamental need
    Example: - Surface Goal: “I want to find the best baby formula” - WHY #1: Why does that matter? → “Because I want my baby to be healthy” - WHY #2: Why does that matter? → “Because I want to be a good parent” - WHY #3: Why does that matter? → “Because I want to feel worthy and competent” - BEDROCK TRUTH: Core need is self-worth validation through parenting identity
    Identify 2-3 Driver Chains for the persona
    Source Logic: - Evidence-Based: Derive from conversation analysis - RO-Based: Infer from category psychology and archetype patterns
    
    3.5 RITUAL & HABIT ARCHITECTURE
    Map behavioral loops that resist disruption.
    Habit Loop Analysis:
    Ritual #1: - Trigger: What initiates the behavior - Routine: Step-by-step process they follow - Reward: What they get from completing ritual (functional + emotional) - Disruption Cost: What they’d lose by changing behavior
    Insight Questions: - What does this ritual provide beyond functional outcome? - Social connection? Sense of control? Status signal? Bonding experience?
    Example: - Ritual: Weekly shopping trip every Saturday morning - Trigger: Running low on supplies OR just routine - Routine: Drive to same store → Walk same aisles → Read labels carefully → Compare options → Choose - Reward: - Thoroughness feeling (“I compared everything”) - Social connection (interaction with others) - Control (“I personally selected each item”) - “Good parent” identity reinforcement - Disruption Cost: Switching to online subscription loses social validation + thoroughness feeling + control
    Product Implication: - Must REPLACE ritual rewards, not just functional outcome - Add features that provide: social connection, thoroughness signals, control, identity reinforcement
    Source Logic: - Evidence-Based: Extract ritual patterns from conversations - RO-Based: Infer from category-typical rituals
    
    3.6 DECISION HEURISTICS (Mental Shortcuts)
    Identify 2-3 rules-of-thumb this persona uses to make decisions quickly.
    Format for each heuristic:
    Heuristic #1: - Heuristic Rule: The mental shortcut they use - Origin: Where did they learn this rule? - Application: How does it apply to this product/service? - Exploitation Strategy: How can product work with this heuristic?
    Example: - Heuristic: “If doctor recommends, it’s safe” - Origin: Deference to medical authority + past positive experiences - Application: Will choose doctor-recommended option over own research - Exploitation Strategy: Get medical professional endorsement, feature prominently
    Source Logic: - Evidence-Based: Identify from decision patterns in conversations - RO-Based: Infer from category-typical heuristics
    
    3.7 CONTEXTUAL INFLUENCES (Situational Behavior Shifts)
    Map how behavior changes across different contexts.
    Format (Table):
    Context	Behavior Shift	Why?	Product Implication
    At home alone	More willing to research new products	No social pressure, can take time	Target with online ads during private time
    With family/friends	Seeks approval, conservative choices	Social pressure	“Recommended by peers” messaging
    At store	Quick decisions, grabs familiar brands	Time pressure, overwhelm	In-store demos won’t work well
    After expert consultation	Willing to spend more	Authority validation	Partner with professionals
    Insight: WHEN and WHERE you reach persona matters as much as WHAT you say
    Source Logic: - Evidence-Based: Extract contextual patterns from conversations - RO-Based: Infer from category-typical context shifts
    
    3.8 WHITE SPACES (Unarticulated Needs)
    Identify needs the persona doesn’t consciously recognize but behavior reveals.
    Discovery Method: - Jobs-to-be-Done Analysis: What “job” is current behavior hiring the solution to do? - Workarounds: What clunky workarounds suggest unmet needs? - Moments of Friction: When does current solution fail them?
    Format for each white space:
    White Space #1: - Observable Behavior: What they do that seems inefficient/clunky - Surface Need: What they think they need - Unarticulated Need: What they actually need (deeper) - White Space Opportunity: The unmet need - Product Implication: How to serve this need
    Example: - Observable Behavior: Creates spreadsheets to compare products manually - Surface Need: “I need to compare options” - Unarticulated Need: “I need CONFIDENCE I’m making the right choice without becoming an expert” - White Space: Decision Confidence as a Service - Simplify decision-making, provide clear signals - Product Implication: Add “Decision Score” feature (Green/Yellow/Red) + “Optimal for you ✓” badge
    Source Logic: - Evidence-Based: Identify from behavioral patterns and workarounds in conversations - RO-Based: Infer from category-typical unmet needs
    
    3.9 LATENT MOTIVATIONS (Unexpressed Desires)
    What do they secretly want but would never admit openly?
    Framework:
    Latent Motivation #1: - Socially Acceptable Motivation: What they’ll say in public - Socially Unacceptable but True Motivation: What they actually feel - Evidence: Behavioral signals that reveal true motivation - Product Implication: How to tap into this without making them feel judged
    Example: - Socially Acceptable: “I want organic products because they’re healthier” - Latent (True): “I want others to SEE me using organic products so they think I’m a responsible parent” - Evidence: Posts photos of organic products on social media, mentions brands in conversations - Product Implication: Make packaging Instagram-worthy, add social share feature
    Source Logic: - Evidence-Based: Infer from behavior patterns (what they do vs. what they say) - RO-Based: Infer from category-typical latent motivations
    
    3.10 ADOPTION FRICTIONS AT PSYCHOLOGICAL LEVEL
    Beyond functional barriers (price, features), what psychological friction exists?
    Format (Table):
    Friction Type	Description	Manifestation	Mitigation Strategy
    Identity Friction	“Users are [type], I’m not one”	Doesn’t see self as “that type of person”	Reframe target identity
    Agency Friction	“Using product = admitting I can’t do it myself”	Feels like admitting incompetence	Reframe: “Even experts use tools”
    Trust Friction	“Companies just want my money”	Skepticism of profit motive	Transparency in pricing and operations
    Social Friction	“What will others think?”	Fear of judgment from important others	Normalize usage, show social proof
    Source Logic: - Evidence-Based: Extract from resistance patterns in conversations - RO-Based: Infer from category-typical adoption barriers
    
    **SECTION 4: SYNTHESIS & PRODUCT FIT**
    4.1 Willingness to Pay
    •	Maximum acceptable price: Range and rationale
    •	Price sensitivity drivers: What makes them willing to pay premium?
    •	Price anchoring: What are they comparing price to?
    
    4.2 Trust Threshold
    •	Level (Very Low / Low / Medium / High / Very High): How much proof needed before trying?
    •	Trust builders: What would increase trust?
    •	Trust destroyers: What would eliminate trust instantly?
    
    4.3 Key Quote
    One powerful quote (150-250 words) that captures this persona’s authentic voice, including: - Their core frustration - Their hesitation or concern - Their potential willingness to try (or resistance) - Their emotional state - NEW: Behavioral contradictions revealed
    Make it conversational, realistic, with natural speech patterns.
    Example: > “Look, I know I should just pick a course and stick with it, but every time I start one, life gets in the way. I tell myself I’ll find time, but honestly, I think I’m just scared of failing. I’ve invested so much money in these certifications—over ₹50,000 last year alone—and I haven’t finished a single one. My wife keeps asking why I keep buying courses I never complete, and I don’t have a good answer. I guess I like the idea of learning more than the actual work. But if something could actually hold me accountable, make it less overwhelming… maybe I’d finally finish one.”
    
    4.4 Product Fit Assessment
    •	Color Code: 🟢 Ideal User / 🟡 Requires Tailoring / 🔴 Low Priority
    •	Rationale: 1-2 sentences explaining fit level
    •	Acquisition Strategy: How to reach and convert this persona specifically
    
    **BEHAVIORAL DEPTH PROFILE**
    
    🔄 BEHAVIORAL CONTRADICTIONS (Says vs. Does)
    
    Contradiction #1:
    • Surface Statement: "[What they say]"
    • Observed Behavior: "[What time/money reveals]"
    • Hidden Truth: "[Real driver]"
    • Underlying Driver: "[Core psychological need]"
    
    Contradiction #2:
    • Surface Statement: "[What they say]"
    • Observed Behavior: "[What time/money reveals]"
    • Hidden Truth: "[Real driver]"
    • Underlying Driver: "[Core psychological need]"
    
    🧠 COGNITIVE BIASES IN DECISION-MAKING
    
    Bias #1: [Bias Name]
    • Manifestation: "[How it shows up]"
    • Impact: "[Effect on evaluation]"
    • Strategy: "[How to work with it]"
    
    Bias #2: [Bias Name]
    • Manifestation: "[How it shows up]"
    • Impact: "[Effect on evaluation]"
    • Strategy: "[How to work with it]"
    
    Bias #3: [Bias Name]
    • Manifestation: "[How it shows up]"
    • Impact: "[Effect on evaluation]"
    • Strategy: "[How to work with it]"
    
    😰 EMOTIONAL TRIGGERS & ANXIETY LANDSCAPE
    
    Primary Fears (Ranked by Intensity):
    1. [Fear]: Intensity [X/10]
       - Trigger: [When it activates]
       - Manifestation: [How it shows up]
    
    2. [Fear]: Intensity [X/10]
       - Trigger: [When it activates]
       - Manifestation: [How it shows up]
    
    3. [Fear]: Intensity [X/10]
       - Trigger: [When it activates]
       - Manifestation: [How it shows up]
    
    Primary Desires (Ranked by Intensity):
    1. [Desire]: Intensity [X/10]
       - Fulfillment: [What would satisfy]
    
    2. [Desire]: Intensity [X/10]
       - Fulfillment: [What would satisfy]
    
    Emotional Conflict:
    • The Push: [Forces moving toward solution]
    • The Pull: [Forces resisting change]
    • The Stuckness: [Why paralyzed]
    
    Activation Moments:
    • Moment: [What happens]
      - Emotional Shift: [How they feel]
      - Behavioral Trigger: [Action results]
    
    🎯 SUBCONSCIOUS DRIVERS (The Why Behind the Why)
    
    Driver Chain #1:
    • Surface Goal: "[What they say they want]"
    • WHY #1: [Answer] → WHY #2: [Answer] → WHY #3: [Answer]
    • BEDROCK TRUTH: "[Fundamental need]"
    
    Driver Chain #2:
    • Surface Goal: "[What they say they want]"
    • WHY #1: [Answer] → WHY #2: [Answer] → WHY #3: [Answer]
    • BEDROCK TRUTH: "[Fundamental need]"
    
    🔄 RITUAL & HABIT ARCHITECTURE
    
    Ritual #1: [Name]
    • Trigger: [What initiates]
    • Routine: [Step-by-step process]
    • Reward: [What they get - functional + emotional]
    • Disruption Cost: [What they'd lose]
    • Product Implication: [How to replace rewards]
    
    Ritual #2: [Name]
    • Trigger: [What initiates]
    • Routine: [Step-by-step process]
    • Reward: [What they get - functional + emotional]
    • Disruption Cost: [What they'd lose]
    • Product Implication: [How to replace rewards]
    
    ⚡ DECISION HEURISTICS (Mental Shortcuts)
    
    Heuristic #1: "[Rule of thumb]"
    • Origin: [Where learned]
    • Application: [How applies]
    • Strategy: [How to work with it]
    
    Heuristic #2: "[Rule of thumb]"
    • Origin: [Where learned]
    • Application: [How applies]
    • Strategy: [How to work with it]
    
    🎭 CONTEXTUAL INFLUENCES
    
    | Context | Behavior Shift | Why? | Product Implication |
    |---------|----------------|------|---------------------|
    | [Context 1] | [Shift] | [Reason] | [Strategy] |
    | [Context 2] | [Shift] | [Reason] | [Strategy] |
    | [Context 3] | [Shift] | [Reason] | [Strategy] |
    
    💡 WHITE SPACES (Unarticulated Needs)
    
    White Space #1:
    • Observable: [Inefficient behavior]
    • Surface Need: "[What they think they need]"
    • Unarticulated Need: "[Deeper need]"
    • Opportunity: [Unmet need]
    • Implication: [How to serve]
    
    White Space #2:
    • Observable: [Inefficient behavior]
    • Surface Need: "[What they think they need]"
    • Unarticulated Need: "[Deeper need]"
    • Opportunity: [Unmet need]
    • Implication: [How to serve]
    
    🤫 LATENT MOTIVATIONS (Unexpressed Desires)
    
    Latent Motivation #1:
    • Socially Acceptable: "[Public statement]"
    • True Motivation: "[What they actually feel]"
    • Evidence: [Behavioral signals]
    • Implication: [How to tap into it]
    
    🚧 ADOPTION FRICTIONS (Psychological Level)
    
    | Friction Type | Description | Manifestation | Mitigation |
    |---------------|-------------|---------------|------------|
    | Identity | [Description] | [How shows up] | [Strategy] |
    | Agency | [Description] | [How shows up] | [Strategy] |
    | Trust | [Description] | [How shows up] | [Strategy] |
    | Social | [Description] | [How shows up] | [Strategy] |
    
    **PERSONA IN THEIR OWN WORDS**
    
    "[150-250 word quote in authentic voice capturing frustration, 
    hesitation, emotional state, and behavioral contradictions]"
    
    **WHAT THEY DO**
    
    📍 Current Journey Stage: [Awareness/Consideration/Purchase/Usage/Loyalty/Lapse]
    
    Current Process:
    • Step 1: [What they do now]
      - Time: [Hours spent]
      - Cost: [Money spent]
      - Pain Point: [Where it breaks down]
    
    • Step 2: [What they do now]
      - Time: [Hours spent]
      - Cost: [Money spent]
      - Pain Point: [Where it breaks down]
    
    • Step 3: [What they do now]
      - Time: [Hours spent]
      - Cost: [Money spent]
      - Pain Point: [Where it breaks down]
    
    **WHERE THEY SHOP & ENGAGE**
    
    Primary Channels:
    • [Channel 1]: [Usage pattern]
    • [Channel 2]: [Usage pattern]
    • [Channel 3]: [Usage pattern]
    
    Information Sources:
    • [Source 1]: [Trust level, usage]
    • [Source 2]: [Trust level, usage]
    • [Source 3]: [Trust level, usage]
    
    **BARRIERS & PAIN POINTS**
    
    🚫 Current Barriers:
    • [Functional barrier 1]
    • [Functional barrier 2]
    • [Psychological barrier 1]
    • [Psychological barrier 2]
    
    😤 Key Pain Points:
    • [Pain point 1]: "[Quote or description]"
    • [Pain point 2]: "[Quote or description]"
    • [Pain point 3]: "[Quote or description]"
    
    **TRIGGERS & OPPORTUNITIES**
    
    ✅ What Would Make Them Try:
    • [Trigger 1]: "[Description]"
    • [Trigger 2]: "[Description]"
    • [Trigger 3]: "[Description]"
    
    🎯 Messaging Hooks:
    • [Hook 1]: "[Specific message angle]"
    • [Hook 2]: "[Specific message angle]"
    • [Hook 3]: "[Specific message angle]"
    
    💰 Willingness to Pay:
    • Maximum Price: [Range]
    • Rationale: [Why]
    • Anchoring: [Comparison point]
    
    🤝 Trust Threshold: [Very Low/Low/Medium/High/Very High]
    • Trust Builders: [What increases trust]
    • Trust Destroyers: [What eliminates trust]
    
    **PRODUCT FIT ASSESSMENT**
    
    Color Code: [🟢 Ideal User / 🟡 Requires Tailoring / 🔴 Low Priority]
    
    Rationale: [1-2 sentences explaining fit]
    
    Acquisition Strategy:
    • Channel: [Where to reach them]
    • Message: [What to say]
    • Timing: [When to reach them]
    • Proof: [What evidence they need]
    
    **EVIDENCE SNAPSHOT (IMPORTANT FOR OUTPUT)**
    
    Based on [N] real conversations from:
    • [Platform 1] ([N] threads/posts)
    • [Platform 2] ([N] threads/posts)
    • [Platform 3] ([N] threads/posts)
    
    Timeframe: Past [X] months ([Y]% from past [Z] months)
    Confidence Score: [0.XX] ([LEVEL])
    
    Confidence Breakdown:
    ✓ Volume: [N] conversations ([assessment])
    ✓ Source Diversity: [X] platforms ([assessment])
    ✓ Recency: [Description] ([assessment])
    ✓ Signal Clarity: [Description]
    ✓ RO Alignment: [Description]

    **Sample Persona** : {sample_pesona_example}
    **confidence_scoring_output_instructions**
    Important: You Should create the confidence for each personas you are generating.

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
    - **Score must be based on the Phase 4**
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

    **FINAL OUTPUT FORMAT (VERY IMPORTANT):**
    Return ONLY this format:

    {{
      "consumer_personas": [
          {{
            "name": "Theme-Based Descriptive Name",
            "age_range": "eg: 18-24",
            "gender": "Male/Female",
            "confidence_scoring": as per the confidence_scoring_output_instructions,
            "reference_sites_with_usage": [Mention list of reference sites links.],
            "evidence_snapshot": EVIDENCE SNAPSHOT,
            ...all other fields (ALL must relate to personas)...
          }},
          {{ PERSONA 2 }}
      ]
    }}

    No additional text. No explanations. No markdown.
    """

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
        input=[{"role": "user", "content": f"{prompt}"}],
    )
    response_text = response.output_text

    data = json.loads(response_text)
    customer_personas = data.get("consumer_personas", "")
    response = {"personas": []}
    if customer_personas:
        for persona in customer_personas:
            persona["auto_generated_persona"] = True
            reference_sites = persona["reference_sites_with_usage"]
            site_counter = dict(
                Counter(urlparse(url).netloc for url in reference_sites)
            )
            persona["researched_sites"] = site_counter

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
                    values=getattr(data, "values", ""),
                    personality=getattr(data, "personality", ""),
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
                    auto_generated_persona=True,
                )

                session.add(p)
                await session.commit()
                await session.refresh(p)

            response["personas"].append(
                {
                    "id": persona["id"],
                    "workspace_id": workspace_id,
                    "exploration_id": exploration_id,
                    "name": persona["name"],
                    "auto_generated_persona": True,
                    "persona_details": persona,
                }
            )
    return response


async def validate_new_question_against_theme(section_id, payload):
    exploration_id = payload.exploration_id
    user_question = payload.text

    existing_questions, theme_description = (
        await get_all_questions_by_section_id(section_id)
    )
    research_objective_description = await get_description(exploration_id)

    adding_question_validator_prompt = f"""
You are a qualitative research question validator.

Your task is to validate whether a NEW user-proposed question can be added to the specified theme without harming research integrity.

You must evaluate the question strictly against the research objective and theme description. Do NOT rewrite or improve the question.

---

**RESEARCH OBJECTIVE**
{research_objective_description}

**THEME DESCRIPTION**
{theme_description}

**EXISTING QUESTIONS IN THIS THEME**
{existing_questions}

**USER-PROPOSED NEW QUESTION**
{user_question}

---

### VALIDATION CRITERIA

A. Thematic Alignment
- Does the new question clearly align with the theme description?
- Does it contribute to answering the research objective?

B. Redundancy Check
- Does the question meaningfully add new insight?
- Is it non-duplicative of existing questions?

C. Question Quality
- Is it open-ended and neutral?
- Is it single-focused (not double-barreled)?
- Does it encourage narrative depth?

D. Cognitive Load & Scope
- Would adding this question create unnecessary burden?
- Does it stay within the theme’s defined scope?

---

### DECISION RULE
Mark as **invalid** if the question:
- Is off-theme
- Is redundant
- Is leading, closed, or low-value
- Adds unnecessary cognitive load without new insight

---

### OUTPUT FORMAT (STRICT JSON ONLY)

{{
  "result": {{
    "valid_or_not": true | false,
    "validation_reason": "Explain why the new question should or should not be added, referencing the theme and research objective in a single line for showing a warning."
  }}
}}
"""

    res = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a qualitative research design validator."},
            {"role": "user", "content": adding_question_validator_prompt}]
    )
    response_text = res.choices[0].message.content.strip()
    response_json = json.loads(response_text)
    result = response_json.get("result", {})

    valid_or_not = result.get("valid_or_not")
    validation_reason = result.get("validation_reason")

    return valid_or_not, validation_reason

async def validate_existing_question(question_id, payload):
    exploration_id = payload.exploration_id
    modified_question = payload.text

    theme_description, section_id, question_text, existing_questions = (
        await get_section_description_by_question_id(question_id)
    )
    research_objective_description = await get_description(exploration_id)

    modify_existing_question_in_prompt = f"""
You are a qualitative research question validator.

Your task is to evaluate whether a proposed MODIFICATION to an existing question improves or harms alignment with the research objective and theme.

Do NOT generate alternative wording. Only validate the proposed change.

---

**RESEARCH OBJECTIVE**
{research_objective_description}

**THEME DESCRIPTION**
{theme_description}

**ORIGINAL QUESTION**
{question_text}

**PROPOSED MODIFIED QUESTION**
{modified_question}

---

### VALIDATION CRITERIA

A. Thematic Integrity
- Does the modified question still address the same theme?
- Does it continue to support the research objective?

B. Quality Improvement Check
- Does the modification reduce bias, ambiguity, or leading language?
- Does it improve clarity or depth?

C. Risk Introduction
- Does the modification introduce assumptions?
- Does it narrow the question in a way that reduces insight?

---

### DECISION RULE
Mark as **invalid** if the modification:
- Weakens thematic alignment
- Introduces bias or assumptions
- Reduces openness or depth
- Changes the intent in a way that harms the objective

---

### OUTPUT FORMAT (STRICT JSON ONLY)

{{
  "result": {{
    "valid_or_not": true | false,
    "validation_reason": "Explain whether the modification strengthens or weakens the question in relation to the theme and research objective in a single line for showing a warning."
  }}
}}
"""

    res = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a qualitative research design validator."},
            {"role": "user", "content": modify_existing_question_in_prompt}]
    )
    response_text = res.choices[0].message.content.strip()

    response_json = json.loads(response_text)
    result = response_json.get("result", {})

    valid_or_not = result.get("valid_or_not")
    validation_reason = result.get("validation_reason")

    return valid_or_not, validation_reason



async def validate_deleted_question(question_id, payload):
    exploration_id = payload.exploration_id

    theme_description, section_id, question_text, existing_questions = (
        await get_section_description_by_question_id(question_id)
    )
    research_objective_description = await get_description(exploration_id)


    delete_the_existing_question_in_prompt = f"""
You are a qualitative research design validator.

Your task is to determine whether removing an existing question from a theme is methodologically safe.

Do NOT suggest replacement questions. Only assess the impact of deletion.

---

**RESEARCH OBJECTIVE**
{research_objective_description}

**THEME DESCRIPTION**
{theme_description}

**EXISTING QUESTIONS IN THIS THEME**
{existing_questions}

**QUESTION PROPOSED FOR DELETION**
{question_text}

---

### VALIDATION CRITERIA

A. Thematic Coverage Impact
- Does this question address a unique aspect of the theme?
- Would removing it leave a gap in understanding?

B. Research Objective Risk
- Would the research objective become partially or fully unaddressed?

C. Redundancy & Saturation
- Is the question redundant with others?
- Is sufficient depth still achievable without it?

---

### DECISION RULE
Mark as **invalid** if deleting the question:
- Removes a unique insight area
- Reduces thematic depth below acceptable levels
- Weakens the ability to answer the research objective

---

### OUTPUT FORMAT (STRICT JSON ONLY)

{{
  "result": {{
    "valid_or_not": true | false,
    "validation_reason": "Explain whether deleting this question is safe or harmful, referencing theme coverage and research objective in a single line for showing a warning."
  }}
}}
"""

    res = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a qualitative research design validator."},
            {"role": "user", "content": delete_the_existing_question_in_prompt}]
    )
    response_text = res.choices[0].message.content.strip()
    response_json = json.loads(response_text)
    result = response_json.get("result", {})

    valid_or_not = result.get("valid_or_not")
    validation_reason = result.get("validation_reason")

    return valid_or_not, validation_reason
