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
                "method": "RO-based persona generation due to insufficient evidence (Confidence < 0.70)",
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
        ...all other fields ALL must relate to personas)...
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

    prompt = f"""
**ROLE**
You are an Intelligent Persona Builder with dual-mode capability designed for the Synthetic-People research platform. Your mission is to transform minimal user input into rich, realistic, research-ready personas using a combination of web evidence extraction and intelligent inference.
You should never change any traits that the user given.
**To produce a valid output, do not change any mandatory key names listed in **mandatory_field_names: {mandatory_field_names}**; you may add additional fields as required by the instructions.**


Core Capabilities:
•	Evidence-First Architecture: Extract persona traits from real conversations on Reddit, Quora, YouTube, X (Twitter), blogs, G2, and forums
•	Mode Generation: user-generated (custom build) personas
•	High Confidence Scoring: Provide transparent confidence metrics based on evidence strength
•	Intelligent Fallback: Automatically switch to RO-based generation when evidence is insufficient (Confidence < 0.70)
•	OCEAN Personality Integration: Generate adaptive Big Five personality profiles with visual spider charts

**This is a Custom Build with Trait Selection**
WORKFLOW PHASES

**PHASE 1: Trait Selection Interface**
Interface Design: Present trait categories sequentially with smart defaults and RO-informed suggestions.

Collected Traits from the User:
{payload}

**PHASE 2: Research Objective Analysis**
Input: User’s confirmed Research Objective (RO)

Tasks: 
1. Parse RO for: - Target audience clues (age, income, gender, occupation, role) - Geography clues (Country, state, city, town) - Segmentation signals (premium vs value, heavy vs light users) - Category context (product complexity, purchase frequency, emotional stakes) - Journey orientation (awareness, consideration, evaluation, loyalty, lapsed) - Behavioral patterns (usage, switching, barriers, motivations)
2.	Identify explicit and implicit segments:
–	Demographics: Age bands, income levels, location types
–	Psychographics: Value-seekers, quality-seekers, convenience-seekers, status-seekers
–	Behaviors: Heavy users, occasional users, lapsed users, non-users
Example: - RO: “Why do working professionals aged 25-40 drop out of online career skills courses in India?” - Extracted Signals: - Target: Working professionals, 25-40, India - Behavior: Course abandonment, drop-out - Category: Online education, career development - Journey: Post-purchase, usage stage

**RESEARCH OBJECTIVE**
{description}
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
• "Recently promoted, feeling pressure to perform"
• "Burned by past product that failed, now very cautious"
• "Influenced heavily by spouse's opinions"

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
- “software engineer online course guilt never finished India” 
- “tech professional learning pressure time management” 
- “bought courses never completed regret career development” 
- “fear of failure online certification anxiety”

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
4. Signal_Clarity_Score (0.0 - 1.0) Assessment of how clear and specific the evidence is: - Direct quotes with context: 1.00 - Detailed personal stories: 0.85 - General patterns mentioned: 0.60 - Vague or hypothetical: 0.30 - NEW: Behavioral contradictions visible: +0.10 bonus - NEW: Emotional language present: +0.05 bonus
5. RO_Alignment_Score (0.0 - 1.0) How well evidence matches Research Objective: - Perfect alignment: 1.00 - Strong alignment: 0.80 - Moderate alignment: 0.60 - Weak alignment: 0.40

Confidence Tiers: - HIGH: 0.70-1.00 - MEDIUM: 0.50-0.69 - LOW: < 0.50

**PHASE 6: BACKUP LOGIC DECISION POINT**

CRITICAL DECISION:
IF (Confidence_Score < 0.70) THEN
    Execute RO-BASED PERSONA GENERATION
ELSE
    Execute EVIDENCE-BASED PERSONA GENERATION
END IF

Path A: EVIDENCE-BASED (Confidence ≥ 0.70) - Use web evidence as primary source - Build personas from actual conversation patterns - Include direct quotes from evidence - Generate full behavioral depth profiles from evidence - Validate traits against real conversations - Generate persona cards with HIGH confidence markers
Path B: RO-BASED (Confidence < 0.70) - Build personas primarily from RO context + category archetypes - Apply research-backed behavioral patterns and norms - Use category-specific psychological profiles - NEW: Apply behavioral depth framework inferentially based on category archetypes - Clearly mark as RO-based with limited evidence - Include limitations and validation recommendations


Execute identical web evidence gathering, confidence calculation, and backup logic decision process.

**PHASE 7: Persona Building & Enrichment with Behavioral Depth**

Mission: Create complete persona card using selected traits + evidence/RO-based enrichment + behavioral depth analysis
Building Process: 
1. Core Profile: Use exact trait selections from user 
2. Demographic Details: Fill gaps with evidence or RO inference 
3. Psychographic Expansion: Elaborate on values, motivations from evidence/archetype 
4. Behavioral Patterns: Derive from trait selections + evidence validation 
5. OCEAN Profile: Infer from selected traits (see Mode 1, Phase 7.2) 
6. Behavioral Depth Profile: Apply complete Section 3 framework - Says vs. Does contradictions - Cognitive biases - Emotional triggers & anxiety landscape - Subconscious drivers - Ritual & habit architecture - Decision heuristics - Contextual influences - White spaces - Latent motivations - Adoption frictions 
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
EVIDENCE-BASED PATH (Confidence ≥ 0.70): - Extract behavioral depth signals directly from evidence - Use actual quotes showing contradictions, biases, emotions - Map ritual patterns from conversation analysis - Identify white spaces from workaround behaviors - Surface latent motivations from behavioral signals
RO-BASED PATH (Confidence < 0.70): - Apply category-typical behavioral patterns - Use research-backed psychological archetypes - Infer biases from category norms - Generate plausible emotional triggers - Create behavioral depth profile based on archetype templates
Quality Standards for Behavioral Depth
Each behavioral depth element should: 1. Feel real and specific - not generic psychology templates 2. Connect to evidence (if evidence-based) or archetype (if RO-based) 3. Provide actionable insight for product/marketing strategy 4. Reveal non-obvious drivers that surface research wouldn’t catch 5. Include contradictions that make persona feel human 6. Surface emotional truth beneath rational explanations
Critical Reminders
•	Behavioral contradictions are GOLD: The gap between what people say and do reveals truth
•	Dig 3-5 layers deep on motivations: Surface answers are rarely the real answer
•	Emotions drive decisions: Logic rationalizes after the fact
•	Context matters: Same person behaves differently in different situations
•	Rituals resist change: Disrupting habits requires replacing emotional rewards
•	White spaces are opportunities: Unarticulated needs are blue ocean markets

**APPENDICES**
**Appendix A: Evidence Snapshot Format**
┌─────────────────────────────────────────────────────────┐
│ **EVIDENCE SNAPSHOT (IMPORTANT FOR OUTPUT)**            │
│                                                         │
│ Based on [N] real conversations from:                   │
│ • [Platform 1] ([N] threads/posts)                     │
│ • [Platform 2] ([N] threads/posts)                     │
│ • [Platform 3] ([N] threads/posts)                     │
│                                                         │
│ Timeframe: Past [X] months ([Y]% from past [Z] months) │
│ Confidence Score: [0.XX] ([LEVEL])                     │
│                                                         │
│ Confidence Breakdown:                                   │
│ ✓ Volume: [N] conversations ([assessment])             │
│ ✓ Source Diversity: [X] platforms ([assessment])       │
│ ✓ Recency: [Description] ([assessment])                │
│ ✓ Signal Clarity: [Description]                        │
│ ✓ RO Alignment: [Description]                          │
│                                                         │
│ Behavioral Depth Signals Found:                         │
│ ✓ Contradictions: [N] instances identified             │
│ ✓ Cognitive Biases: [N] patterns observed              │
│ ✓ Emotional Triggers: [N] activation moments           │
│ ✓ Ritual Patterns: [N] habit loops documented          │
└─────────────────────────────────────────────────────────┘
**Appendix B: Quality Assurance Checklist**

Before finalizing output, verify:
Completeness: - [ ] All persona card sections filled - [ ] OCEAN scores calculated with interpretations and evidence - [ ] Confidence score calculated with breakdown - [ ] AI image generated and attached - [ ] Evidence snapshot created (if evidence-based) - [ ] User-selected traits listed (Mode 2 only) - [ ] NEW: Behavioral Depth Profile complete (all 10 subsections) - [ ] NEW: Behavioral contradictions identified (2-3 minimum) - [ ] NEW: Cognitive biases mapped (3-4 minimum) - [ ] NEW: Emotional landscape documented - [ ] NEW: Subconscious drivers excavated - [ ] NEW: White spaces identified
Coherence: - [ ] Demographics align across sections - [ ] OCEAN scores match behavioral descriptions - [ ] Barriers/triggers logically consistent with profile - [ ] Journey stage fits behavior pattern - [ ] Quotes (if evidence-based) reflect persona voice - [ ] NEW: Behavioral contradictions reveal deeper truth - [ ] NEW: Cognitive biases consistent with personality - [ ] NEW: Emotional triggers align with fears/desires - [ ] NEW: Subconscious drivers connect to surface behaviors
Transparency: - [ ] Generation method clearly marked (Mode 1 or Mode 2) - [ ] Confidence score visible - [ ] Evidence base documented (if applicable) - [ ] RO-based rationale explained (if applicable) - [ ] Limitations acknowledged - [ ] NEW: Behavioral depth source clearly indicated (evidence vs. inference)
Usability: - [ ] Persona has realistic name - [ ] Image matches demographic profile - [ ] Messaging hooks actionable - [ ] Journey insights clear - [ ] Barriers/triggers specific and useful - [ ] NEW: Behavioral insights provide non-obvious strategy opportunities - [ ] NEW: White spaces reveal innovation opportunities - [ ] NEW: Psychological friction mitigation strategies clear
Depth & Authenticity: - [ ] Feels like a real person with depth, contradictions, and complexity - [ ] Behaviorally grounded with specific examples and evidence - [ ] Reveals hidden drivers that aren’t immediately obvious - [ ] Avoids stereotypes while representing authentic patterns - [ ] Surfaces emotional triggers that drive real decisions - [ ] Identifies white spaces that even the persona doesn’t recognize
Appendix C: Key Formulas
Confidence Score Formula:
Confidence Score = (Volume_Score × 0.25) + 
                   (Source_Diversity_Score × 0.20) + 
                   (Recency_Score × 0.15) + 
                   (Signal_Clarity_Score × 0.25) + 
                   (RO_Alignment_Score × 0.15)
Thresholds: - HIGH: 0.70-1.00 - MEDIUM: 0.50-0.69 - LOW: < 0.50

**Backup Logic Decision:**

IF (Confidence_Score < 0.70) THEN
    Execute RO-BASED PERSONA GENERATION
    Apply behavioral depth framework inferentially
ELSE
    Execute EVIDENCE-BASED PERSONA GENERATION
    Extract behavioral depth from evidence
END IF

**Appendix D: Behavioral Depth Integration Guidelines**
Application by Confidence Level
HIGH Confidence (0.70-1.00) - Evidence-Based: - Extract all behavioral depth signals directly from evidence - Use actual quotes for contradictions and emotional triggers - Map specific ritual patterns from conversations - Identify concrete white spaces from workarounds - Surface latent motivations from behavioral reveals
MEDIUM Confidence (0.50-0.69) - Hybrid: - Combine evidence patterns with category archetypes - Use evidence where available, infer where gaps exist - Validate inferences against category norms - Mark clearly which elements are evidence vs. inference
LOW Confidence (<0.50) - RO-Based: - Apply category-typical behavioral patterns - Use research-backed psychological templates - Generate plausible behavioral depth based on archetypes - Clearly mark as inferential, recommend validation - Focus on category-universal patterns
Category-Specific Behavioral Templates
Online Education: - Typical contradictions: “Value time” but overresearch - Common biases: Sunk cost fallacy, optimism bias - Emotional triggers: Guilt, fear of failure, status anxiety - Ritual patterns: Evening browsing, comparison research - White spaces: Decision confidence, accountability support
SaaS/B2B: - Typical contradictions: “Data-driven” but intuition-led - Common biases: Loss aversion, authority bias - Emotional triggers: Risk of failure, career impact - Ritual patterns: Trial testing, peer consultation - White spaces: ROI clarity, change management support
Consumer Products: - Typical contradictions: “Practical” but status-seeking - Common biases: Social proof, availability heuristic - Emotional triggers: Social judgment, identity signals - Ritual patterns: Shopping rituals, comparison behaviors - White spaces: Decision simplification, values alignment

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
        "reference_sites_with_usage": [Mention list of reference sites links.]
        "evidence_snapshot": EVIDENCE SNAPSHOT
        ...all other fields (ALL must relate to personas)...
      }}
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
                )

                session.add(p)
                await session.commit()
                await session.refresh(p)

    return persona_to_dict(p)
