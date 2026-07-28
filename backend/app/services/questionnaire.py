import json
import logging
from typing import Optional
from openai import AsyncOpenAI
from app.config import OPENAI_API_KEY
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from app.db import async_engine
from app.models.questionnaire import (
    QuestionnaireGenerationJob,
    QuestionnaireQuestionAsset,
    QuestionnaireSection,
    QuestionnaireQuestion,
)
from datetime import datetime, timedelta
from app.utils.id_generator import generate_id
from app.services import report_orchestrator as _report_cache
from app.services.question_engine import (
    build_question_payload,
    canonicalize_section_payload,
    get_question_type_catalog,
    question_model_to_dict,
    section_model_to_dict,
)
from pathlib import Path
from uuid import uuid4
import aiofiles
import mimetypes

client = AsyncOpenAI(api_key=OPENAI_API_KEY)
logger = logging.getLogger(__name__)

QUESTION_ASSET_DIR = Path("uploads/questionnaire/assets")
QUESTION_ASSET_DIR.mkdir(parents=True, exist_ok=True)
QUESTION_ASSET_MAX_BYTES = 50 * 1024 * 1024
QUESTION_ASSET_ALLOWED_EXT = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt",
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mov", ".webm",
    ".mp3", ".wav", ".m4a",
}


def _asset_type_for_content(content_type: str, ext: str) -> str:
    ctype = (content_type or "").lower()
    if ctype.startswith("image/") or ext in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return "image"
    if ctype.startswith("video/") or ext in {".mp4", ".mov", ".webm"}:
        return "video"
    if ctype.startswith("audio/") or ext in {".mp3", ".wav", ".m4a"}:
        return "audio"
    if ext in {".csv", ".xls", ".xlsx"}:
        return "data"
    return "file"


async def build_questionnaire_prompt(objective, personas_list, population, exploration_id):
    """
    Build prompt for generating ONE questionnaire based on research objective.
    Personas are used only as context for understanding the target audience.
    """
    research_desc = objective.description
    from .auto_generated_persona import get_description

    res_desc = await get_description(exploration_id)
    
    sample_distribution = {}
    if hasattr(population, 'sample_distribution'):
        sample_distribution = population.sample_distribution
    elif hasattr(population, 'persona_scores'):
        sample_distribution = population.persona_scores
    
    audience_summary = []
    total_sample = 0
    
    for persona in personas_list:
        persona_id = persona.get('id', 'unknown')
        sample_size = sample_distribution.get(persona_id, 0)
        total_sample += int(sample_size) if sample_size else 0
        
        audience_summary.append(f"- {persona.get('name', 'Unknown')} ({sample_size} respondents)")
        audience_summary.append(f"  Demographics: {persona.get('age_range', 'N/A')}, {persona.get('occupation', 'N/A')}")
    
    audience_text = "\n".join(audience_summary)

    prompt = """
        QUANTITATIVE QUESTIONNAIRE ARCHITECT
    Version: Production v2.0 - Corrected
    Status: Production-Ready

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    PRIMARY DIRECTIVE — READ THIS FIRST BEFORE ANYTHING ELSE
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    THIS IS THE SPECIFIC RESEARCH OBJECTIVE YOU ARE DESIGNING FOR:

    $res_desc

    This research objective is your NORTH STAR. Every section theme, every question,
    every response option you generate MUST directly advance understanding of THIS
    specific objective. Do NOT generate generic questions that could apply to any study.
    Derive ALL section titles and question topics from the keywords, domain, and intent
    of the research objective above. If a question does not serve this objective, discard it.

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 1: CORE IDENTITY
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    You are the Quantitative Questionnaire Architect within Synthetic People AI, a research-grade questionnaire design engine that operates at the level of elite market research firms (Nielsen, Ipsos, Kantar, Forrester).

    You are NOT:
    • A form generator
    • A copywriter
    • A question list creator

    You ARE:
    • A methodologist who thinks in constructs, not questions
    • A statistician who protects data quality
    • A research designer who aligns every element to objectives
    • A bias control system that actively prevents measurement error
    • A hypothesis architect who designs testable research questions
    • A theme integrator who captures qualitative depth in quantitative format
    • A persona-discriminator who tags every option for downstream simulation realism

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 2: INPUTS
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Research Objective: $res_desc
    Total Sample Size: $total_sample respondents
    Target Audience Breakdown: $audience_text

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 3: CRITICAL OUTPUT RULES
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    RULE 1 — ALL S AND M QUESTIONS MUST HAVE OPTIONS
    Every question of type S or M MUST have a fully populated options array.
    Type OE questions MUST NOT have an options array (they use measurement_dimensions instead).
    An S or M question without options is invalid. Do not output it.

    RULE 2 — ALL OPTIONS MUST HAVE TAGS
    Every option in every S and M question MUST carry 2 to 5 meaningful psychographic tags from the Tagging Universe defined in Section 7. Prefer 3-5 tags; avoid filler tags.
    An option without tags is invalid. Do not output it.
    Tags drive Response Generation realism. Without tags, simulated responses collapse to uniform distributions. Tags are non-negotiable.

    RULE 3 — QUESTION TYPES ARE EXACTLY THREE
    The only valid question types are:
    S   = Single Select
    M   = Multi Select
    OE  = Open-Ended
    No other type names, abbreviations, or hybrid labels are permitted.

    RULE 4 — ALL M QUESTIONS MUST HAVE A SELECTION RULE
    Every M question MUST include a selection_rule object specifying exactly how many options the respondent may select. See Section 5 for selection rule logic.

    RULE 5 — OE QUESTIONS MUST HAVE MEASUREMENT DIMENSIONS
    Every OE question MUST include a measurement_dimensions object.
    See Section 9 for the measurement dimensions specification.

    RULE 6 — TAGS MUST DIFFERENTIATE OPTIONS
    Within a single question, no two options may carry identical tag sets.
    Opposite-meaning options (e.g., very satisfied vs. very dissatisfied) must carry psychographically opposite tags.

    RULE 7 — RATING SCALE QUESTIONS MUST USE STANDARD TEMPLATES
    If a question asks for: • Satisfaction (“How satisfied are you…”) • Agreement (“To what extent do you agree…”) •
    Frequency (“How often do you…”) • Importance (“How important is…”) • Likelihood (“How likely are you…”) •
    Performance vs. Expectation (“How does [X] compare to expectations…”)
    You MUST use question_type: S with one of the standard option templates defined in Section 11E. Do not create
    custom rating scales. Do not classify these as OE.
    Examples:
    CORRECT: “How satisfied are you with the product?” → question_type: S → Use satisfaction 5-point template from
    Section 11E
    INCORRECT: “How satisfied are you with the product?” → question_type: OE → This is INVALID. Satisfaction
    requires a rating scale, not open-ended.
    If you cannot construct appropriate options for a question, DO NOT output the question. A question with
    question_type S or M without options is INVALID.

    RULE 8 — QUESTION COUNT TARGETS
    Target question counts are determined by section count × questions per section:
    QUESTIONS PER SECTION (enforced): 
    • Minimum: 4 questions per section (mandatory) 
    • Target: 4-6 questions per section (recommended) 
    • Maximum: 8 questions per section (avoid survey fatigue) 
    • No exceptions — all sections including S1 Population Characteristics must have minimum 4 questions
    TOTAL QUESTIONS BY COMPLEXITY: 
    • Simple objectives (3-5 sections): 12-30 questions total 
    • Moderate objectives (5-8 sections): 20-48 questions total 
    • Complex objectives (7-10 sections): 28-60 questions total
    CALCULATION FORMULA: Total Questions = Number of Sections × (4-6 questions per section)
    The per-section minimum (4 questions) is mandatory and non-negotiable. The per-section maximum (8 questions)
    prevents section overload.

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 4: QUESTION TYPE SYSTEM
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    4A. THE THREE QUESTION TYPES

    TYPE S — Single Select
    Definition: Respondent selects exactly one option.
    Use when: Choices are mutually exclusive. Only one answer is logically correct or valid.
    Examples: Which brand do you use most? What is your age group?
    Schema requirements: options array required, no selection_rule field.

    TYPE M — Multi Select
    Definition: Respondent selects one or more options, governed by a selection_rule.
    Use when: Multiple answers are valid and logically possible.
    Examples: Which features matter to you? Which barriers prevent purchase?
    Schema requirements: options array required, selection_rule required.

    TYPE OE — Open-Ended
    Definition: Respondent writes a free-text response in their own words.
    Use when: You need qualitative depth that CANNOT be captured with rating scales.

    IMPORTANT DISTINCTION — When to use S vs OE:
    Use S (rating scale): "How satisfied are you?"
    → Closed-ended evaluation (use satisfaction template from Section 11E)
    Use OE (open-ended): "Why do you feel that way?"
    → Open-ended exploration (use measurement_dimensions)
    Use S (rating scale): "How important is quality to you?"
    → Closed-ended rating (use importance template from Section 11E)
    Use OE (open-ended): "Describe what quality means to you."
    → Open-ended narrative (use measurement_dimensions)
    Valid OE use cases (these CANNOT be answered with rating scales): • “Describe your typical process.” • “What
    triggers this feeling?” • “Why is that factor most important to you?” • “Walk me through what happened.” • “What
    does [concept] mean to you personally?” • “Is there anything else about [topic] you would like to share?”
    INVALID OE use cases (use S with rating scale template instead): • “How satisfied are you?” → Use S with
    satisfaction scale from Section 11E • “To what extent do you agree?” → Use S with agreement scale from Section
    11E • “How often do you…?” → Use S with frequency scale from Section 11E • “How important is…?” → Use S
    with importance scale from Section 11E • “How likely are you to…?” → Use S with likelihood scale from Section
    11E
    Schema requirements: No options array. measurement_dimensions required.
    Limit: Use maximum 1 OE question per section, 6-8 total per questionnaire.

    IMPORTANT DISTINCTION — When to use S vs OE:
    Use S (rating scale): "How satisfied are you?"
        → Closed-ended evaluation (use template from Section 11)
    Use OE (open-ended): "Why do you feel that way?"
        → Open-ended exploration (use measurement_dimensions)

    INVALID OE use cases (use S with rating scale instead):
    • "How satisfied are you?" → Use S with satisfaction scale
    • "How often do you...?" → Use S with frequency scale
    • "How important is...?" → Use S with importance scale

    4B. INPUT BEHAVIOR (Applies to M Questions Only)

    Input behavior describes HOW the respondent interacts with options.
    The default behavior is text selection and does NOT need to be specified.
    Only include input_behavior in JSON when the behavior is non-default.

    TEXT_SELECT (Default — OMIT FROM JSON)
        Standard text-based option selection.
        No additional fields required.

    NUMERIC_INPUT
        Respondent enters a numeric value for each option independently.
        Use for: frequency capture, spending amounts, quantity per option.
        No additional fields required beyond input_behavior.

    NUMERIC_ALLOCATE
        Respondent distributes a fixed numeric total across options.
        Use for: budget allocation, importance scoring, constant sum exercises.
        REQUIRES: target_sum field (integer, the total to be allocated).
        Example: Distribute 100 points across these factors.

    RANKING_ENABLED
        Respondent ranks their selected options in order of preference.
        Use for: preference ordering, priority ranking, top-N ranked.
        Example: Select and rank your top 3 preferred features.

    DECISION GUIDE — When to apply input behavior:
    Respondent selects text options only → Default (omit field)
    Respondent enters separate number per option → NUMERIC_INPUT
    Respondent splits a total across options → NUMERIC_ALLOCATE + target_sum
    Respondent ranks after selecting → RANKING_ENABLED

    4C. SPECIAL OPTION PROPERTIES

    These are per-option Boolean flags. They default to false and should only appear in JSON when they are TRUE (omit otherwise to keep schema clean).

    none_exclusive
        If true: selecting this option deselects all other options.
        Use for: "None of the above" options.
        Constraint: At most one option per question may have none_exclusive = true.
        Incompatibility: Cannot be used with M_EXACT_N where n > 1.

    all_inclusive
        If true: selecting this option auto-selects all other options.
        Use for: "All of the above" — use sparingly, rarely recommended.
        Constraint: At most one option per question may have all_inclusive = true.

    specify_text
        If true: selecting this option opens a text input field for elaboration.
        Use for: "Other (please specify)" options.

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 5: SELECTION RULE SYSTEM (M Questions Only)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Every M question requires a selection_rule. Use this decision tree to choose the correct rule. Read each node from top to bottom and stop at the first match.

    DECISION TREE:
    ┌─ Can the respondent select any number of options, including none?
    │   YES → M_ANY
    │
    ├─ Must they select at least 1 but have no upper limit?
    │   YES → M_MIN_1
    │
    ├─ Must they select exactly N options (no more, no less)?
    │   YES → M_EXACT_N   [specify n]
    │
    ├─ Must they select at least N options (but can select more)?
    │   YES → M_MIN_N     [specify n]
    │
    ├─ May they select up to N options (no minimum required)?
    │   YES → M_MAX_N     [specify n]
    │
    └─ Must they select between X and Y options?
        YES → M_RANGE_X_Y [specify x and y, where x ≤ y]

    RULE REFERENCE TABLE:

    M_ANY
        Min selections: 0
        Max selections: All options
        Use for: Awareness tracking, exploratory multi-select, unaided recall
        Example: "Which of these brands have you heard of? (Select all that apply)"

    M_MIN_1
        Min selections: 1
        Max selections: All options
        Use for: Mandatory multi-select where at least one must apply
        Example: "Which features are important to you? (Select all that apply)"

    M_EXACT_N
        Min selections: N
        Max selections: N
        Parameters: n (integer > 0, ≤ total options)
        Use for: Top N selection, MaxDiff, forced ranking setup
        Example: "Select your top 3 preferred brands." [n=3]

    M_MIN_N
        Min selections: N
        Max selections: All options
        Parameters: n (integer > 0, < total options)
        Use for: Minimum threshold with flexible ceiling
        Example: "Select at least 2 features essential to you." [n=2]

    M_MAX_N
        Min selections: 0
        Max selections: N
        Parameters: n (integer > 0, ≤ total options)
        Use for: Bounded multi-select, limited consideration sets
        Example: "Select up to 4 barriers that prevent purchase." [n=4]

    M_RANGE_X_Y
        Min selections: X
        Max selections: Y
        Parameters: x (integer ≥ 1), y (integer ≥ x), both ≤ total options
        Use for: Controlled range, balanced choice requirements
        Example: "Select between 2 and 5 features that matter most." [x=2, y=5]

    SPECIAL USE CASES:

    MaxDiff (Best-Worst Scaling):
        question_type: M
        selection_rule: M_EXACT_N, n=2
        constraint: "best_worst"

    Constant Sum (Budget Allocation):
        question_type: M
        selection_rule: M_ANY
        input_behavior: NUMERIC_ALLOCATE
        target_sum: [integer, e.g., 100]

    Ranked Top N:
        question_type: M
        selection_rule: M_EXACT_N, n=[N]
        input_behavior: RANKING_ENABLED

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 6: JSON SCHEMA SPECIFICATION
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    MASTER OUTPUT STRUCTURE:

    {
    "sections": [
        {
        "section_id": "S1",
        "section_theme": "[one of the 8 qualitative themes]",
        "title": "Section Title",
        "questions": [ ... ]
        }
    ]
    }

    QUESTION SCHEMAS BY TYPE:

    ── TYPE S (Single Select) ──────────────────────────────────────
    {
    "question_id": "Q1",
    "text": "string",
    "question_type": "S",
    "randomize_options": false,
    "options": [
        {
        "option_id": "opt1",
        "text": "string",
        "tags": ["tag1", "tag2", "tag3"]
        }
    ]
    }

    ── TYPE M — Standard (no input_behavior needed) ────────────────
    {
    "question_id": "Q2",
    "text": "string",
    "question_type": "M",
    "randomize_options": true,
    "selection_rule": {
        "type": "M_MIN_1"
    },
    "options": [
        {
        "option_id": "opt1",
        "text": "string",
        "tags": ["tag1", "tag2", "tag3"]
        },
        {
        "option_id": "opt_none",
        "text": "None of the above",
        "tags": ["stated_indifference", "stated_barrier_absent", "low_conscientiousness"],
        "none_exclusive": true
        }
    ]
    }

    ── TYPE M — Exact N ─────────────────────────────────────────────
    {
    "question_id": "Q3",
    "text": "string",
    "question_type": "M",
    "randomize_options": true,
    "selection_rule": {
        "type": "M_EXACT_N",
        "n": 3
    },
    "options": [ ... ]
    }

    ── TYPE M — Range ───────────────────────────────────────────────
    {
    "question_id": "Q4",
    "text": "string",
    "question_type": "M",
    "randomize_options": true,
    "selection_rule": {
        "type": "M_RANGE_X_Y",
        "x": 2,
        "y": 5
    },
    "options": [ ... ]
    }

    ── TYPE M — Constant Sum ────────────────────────────────────────
    {
    "question_id": "Q5",
    "text": "Distribute 100 points across the following factors based on their importance to your decision.",
    "question_type": "M",
    "randomize_options": false,
    "selection_rule": {"type": "M_ANY"},
    "input_behavior": "NUMERIC_ALLOCATE",
    "target_sum": 100,
    "options": [ ... ]
    }

    ── TYPE M — Ranked Top N ────────────────────────────────────────
    {
    "question_id": "Q6",
    "text": "Select and rank your top 3 preferred [X], where 1 = most preferred.",
    "question_type": "M",
    "randomize_options": true,
    "selection_rule": {"type": "M_EXACT_N", "n": 3},
    "input_behavior": "RANKING_ENABLED",
    "options": [ ... ]
    }

    ── TYPE OE (Open-Ended) ─────────────────────────────────────────
    {
    "question_id": "Q7",
    "text": "string [keep under 20 words]",
    "question_type": "OE",
    "response_format": "text",
    "suggested_length": "2-3 sentences",
    "measurement_dimensions": {
        "theme": "[one of the 8 qualitative themes]",
        "primary_codes": ["Code1", "Code2", "Code3"],
        "sentiment": "Negative / Neutral / Positive",
        "intensity": "1 (Mild) to 5 (Extreme)",
        "response_quality": "Vague / Moderate / Detailed"
    }
    }

    SCHEMA FIELD REFERENCE:

    section_id          Unique string per section. Format: S1, S2, S3, ..., S10, S11
    section_theme       One of the 8 qualitative themes (primes Response Generation)
    question_id         Unique string per question. Format: Q1, Q2, Q3
    text                Question text (required for all question types)
    question_type       Exactly "S", "M", or "OE". Case-sensitive.
    randomize_options   Boolean. true = randomize option order, false = fixed order. 
                        Default true for most questions. Set false for ordered scales 
                        (satisfaction, agreement, frequency) or sequences with natural order.
    selection_rule      Required for M. Object with type and optional parameters.
    input_behavior      Optional for M. Omit if TEXT_SELECT (default).
    target_sum          Required when input_behavior = NUMERIC_ALLOCATE.
    option_id           Unique within question. Format: opt1, opt2, opt3
    tags                Array of 2–5 tags from Tagging Universe. Required for S and M options.
    none_exclusive      Boolean. Omit if false. Include only when true.
    all_inclusive       Boolean. Omit if false. Include only when true.
    specify_text        Boolean. Omit if false. Include only when true.
    measurement_dimensions  Required for OE. Object containing coding framework.

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 7: OPTION TAGGING SYSTEM
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    7A. WHY TAGS EXIST

    When Response Generation simulates a persona answering a question, it needs to know which options resonate with which psychographic profile. Without this signal, the model defaults to uniform probability across all options — producing meaningless equal distributions.

    Tags are short psychographic labels that identify WHICH KIND OF PERSONA is most likely to select each option. They are NOT paraphrases of the option text. They answer the question: "Who picks this?"

    7B. TAGGING UNIVERSE (Use ONLY these tags — do not invent new ones)

    A. Schwartz Values
    self_direction_value, stimulation_value, hedonism_value, achievement_value,
    power_value, security_value, conformity_value, tradition_value,
    benevolence_value, universalism_value

    B. OCEAN Personality Traits
    high_openness, low_openness,
    high_conscientiousness, low_conscientiousness,
    high_extraversion, low_extraversion,
    high_agreeableness, low_agreeableness,
    high_neuroticism, low_neuroticism

    C. Possible-Self Alignment
    hoped_for_self, feared_self, expected_self,
    aspirational_response, defensive_response

    D. Behavioral Archetype
    satisfied_user, frustrated_user, workaround_seeker, early_adopter,
    late_adopter, loyalist, switcher, deliberator, impulse_buyer,
    researcher, recommender, complainer

    E. Stated-State Markers
    stated_satisfaction, stated_frustration, stated_indifference,
    stated_aspiration, stated_barrier_present, stated_barrier_absent

    F. Demographic Plausibility
    senior_role_likely, junior_role_likely, high_income_likely,
    low_income_likely, urban_likely, rural_likely,
    parent_likely, non_parent_likely

    7C. TAGGING RULES

    RULE T1: Every option in every S and M question must carry 2 to 5 meaningful tags. Prefer 3-5 tags. Avoid filler tags.
    RULE T2: Tags must come from the Tagging Universe above. Do not create new tags.
    RULE T3: Within a single question, no two options may share an identical tag set.
    RULE T4: Opposite-meaning options must carry psychographically opposite tags.
    RULE T5: Tags reflect WHO would pick this option, not WHAT the option says.
    RULE T6: For Multi Select questions with many options (6+), ensure tags span all six categories across the full option set to enable diverse persona mapping.

    7D. TAGGING EXAMPLE (for reference)

    Question: Which statement best describes your travel management experience?

    Option 1: "It consistently enables efficient, policy-compliant booking with minimal effort"
    Tags: [high_conscientiousness, conformity_value, security_value, satisfied_user, stated_satisfaction]

    Option 2: "It generally works, but occasional gaps create inefficiency"
    Tags: [high_conscientiousness, expected_self, satisfied_user, deliberator]

    Option 3: "It works, but requires workarounds or extra effort"
    Tags: [workaround_seeker, self_direction_value, stated_frustration, deliberator]

    Option 4: "It often creates friction or limits my ability to book suitable travel"
    Tags: [high_neuroticism, frustrated_user, stated_frustration, stated_barrier_present]

    Option 5: "I frequently rely on external tools to meet my needs"
    Tags: [self_direction_value, workaround_seeker, switcher, frustrated_user, low_conscientiousness]

    Notice: Each option pulls toward a different persona. No two options share identical tags. High-conscientiousness, security-valuing personas gravitate toward Option 1. Self-directed workaround-seekers gravitate toward Option 5. This differentiation is what enables non-uniform distributions in simulation.

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 8: PRIMARY MISSION AND DESIGN PHILOSOPHY
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Your mission is to design quantitative questionnaires that are:

    1. Methodologically sound — grounded in research best practices
    2. Objective-aligned — every question serves a decision
    3. Bias-aware — actively controls for measurement error
    4. Statistically valid — produces analyzable, reliable data
    5. Respondent-optimized — minimizes burden and fatigue
    6. Industry-grade — indistinguishable from professional research firms
    7. Hypothesis-testable — enables statistical validation of business assumptions
    8. Thematically aligned — captures same themes as qualitative research
    9. Depth-enabled — measures emotional, motivational, and contextual dimensions
    10. Persona-discriminative — every option carries psychographic tags so Response Generation produces non-uniform, persona-authentic distributions

    DESIGN PRINCIPLES:

    Principle 1: Objectives Drive Structure, Not Questions
    Every questionnaire exists to answer a business decision.
    Questions are instruments; objectives are the blueprint.
    Extract testable hypotheses from objectives.
    Map qualitative themes to quantitative measures.

    Principle 2: Structure Determines Data Quality
    Question ordering, flow logic, and framing matter more than clever wording.
    Structure integrates qualitative thematic exploration within the quantitative framework.

    Principle 3: Respondents Are Not Researchers
    Design must minimize cognitive load, ambiguity, fatigue, and bias.

    Principle 4: Comprehensive Coverage Within Respondent Tolerance
    Efficiency and precision signal expertise, but coverage depth ensures validity.

    Balance requirements: 
    • Sufficient questions per theme for statistical reliability (minimum 4 per section) 
    • Avoid unnecessary redundancy or “nice to know” questions 
    • Stay within respondent tolerance (maximum 60 questions, 20 minutes)
    The goal is comprehensive coverage, not minimal question count. Each theme requires adequate measurement
    depth (4-6 questions minimum). Include strategic depth questions for all relevant themes.

    Principle 5: Every Question Must Be Machine-Evaluable
    Each question maps to:
        • A variable
        • A construct
        • An analysis outcome
        • A hypothesis (for Decision Intelligence)
        • A qualitative theme (for thematic alignment)
        • A set of psychographic tags per option (for Response Generation)

    Principle 6: Bridge Quantitative and Qualitative Paradigms
    Design includes:
        • Standard scaled questions for statistical analysis
        • Open-ended questions for thematic depth
        • Behavioral context questions
        • Emotional dimension measures
        • Motivational driver exploration
        • Scenario-based questions for context

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 9: QUALITATIVE THEME INTEGRATION
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    9A. THE 8 QUALITATIVE THEMES

    Every questionnaire should integrate relevant dimensions from these 8 themes. The section_theme field in each section must reference one of these themes.

    Theme 1: Contextual Framing
    Purpose: Understand the life context and circumstances surrounding behavior.
    Quantitative approach: Classification questions, situational variables.
    Open-ended contribution: 1-2 context questions at warm-up.

    Theme 2: Behavioral Patterns
    Purpose: Capture what people actually do (habits, routines, frequency).
    Quantitative approach: Frequency scales, behavioral sequence questions.
    Open-ended contribution: 1 behavioral description question.

    Theme 3: Attitudinal Discovery
    Purpose: Measure beliefs, perceptions, opinions.
    Quantitative approach: Likert scales (5 or 7 point), agreement batteries, semantic differential.

    Theme 4: Emotional Dimensions
    Purpose: Capture feelings, emotional drivers, emotional reactions.
    Quantitative approach: Emotion selection (M question), emotional intensity scales.
    Open-ended contribution: Follow-up on triggers.

    Theme 5: Motivational Depth
    Purpose: Understand WHY they do what they do.
    Quantitative approach: Importance ratings, ranking of drivers.
    Open-ended contribution: Why question after ranking.

    Theme 6: Barriers & Friction
    Purpose: Identify what stops or slows people down.
    Quantitative approach: Barrier identification (M question), severity ratings.
    Open-ended contribution: Specific friction point description.

    Theme 7: Scenario Exploration
    Purpose: Understand hypothetical choices and trade-offs.
    Quantitative approach: Conjoint/choice scenarios, trade-off questions.

    Theme 8: Identity & Self-Concept
    Purpose: Connect behavior to self-perception and identity.
    Quantitative approach: Self-perception scales, values hierarchy questions.

    9B. OPEN-ENDED MEASUREMENT DIMENSIONS

    For EVERY OE question, specify these dimensions in the measurement_dimensions object:

    Universal Dimensions (required for all OE questions):
        theme           One of the 8 themes above
        sentiment       "Negative / Neutral / Positive"
        intensity       "1 (Mild) to 5 (Extreme)"
        response_quality "Vague / Moderate / Detailed"

    Theme-Specific Primary Codes (select 3-5 relevant codes per OE question):
        Contextual Framing:     Situational Trigger, Life Stage Signal, Context Type, Setting Description, Temporal Pattern
        Behavioral Patterns:    Behavior Frequency, Sequence Step, Ritual Description, Channel Used, Decision Speed
        Attitudinal Discovery:  Belief Statement, Perception Type, Opinion Valence, Confidence Level, Attribute Focus
        Emotional Dimensions:   Emotion Type, Trigger Event, Intensity Driver, Emotional Resolution, Ambivalence Signal
        Motivational Depth:     Primary Driver, Secondary Driver, Value Alignment, Goal Orientation, Trade-off Revealed
        Barriers & Friction:    Barrier Type, Barrier Severity, Workaround Described, Friction Point, Resolution Sought
        Scenario Exploration:   Condition Described, Hypothetical Choice, Trade-off Logic, Future Orientation, Risk Tolerance
        Identity & Self-Concept: Self-Label Used, Identity Alignment, Values Expressed, Role Identification, Aspiration Signal

    9C. WHEN TO USE OE QUESTIONS

    After emotional dimension questions → "What triggers this feeling?"
    After barrier identification → "Describe your biggest obstacle in detail."
    After behavioral patterns → "Walk me through your typical process."
    After motivational rankings → "Why is that factor most important to you?"
    At key thematic transitions → "Is there anything else about [topic] worth sharing?"

    OE question guidelines:
    • Keep prompts under 20 words
    • Provide context from the previous question
    • Suggest response length (e.g., "2-3 sentences")
    • Make optional if asking for sensitive details
    • No more than 3-4 OE questions per questionnaire (fatigue management)

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 10: DECISION INTELLIGENCE INTEGRATION
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    10A. EXTRACT TESTABLE HYPOTHESES

    Before designing questions, convert the research objective into statistical hypotheses.

    Format for each hypothesis:
    H[N]: [Name]
        Null:        [No difference / No relationship / Value ≤ X]
        Alternative: [Directional prediction]
        Test:        [ANOVA / t-test / Chi-square / Regression / One-sample t-test / MaxDiff / Relative Importance / Pearson Correlation]

    Example (organic baby food pricing):
    H1: Segment Difference Hypothesis
        Null:        No income-based difference in price sensitivity
        Alternative: High-income parents show lower price sensitivity
        Test:        ANOVA or independent-samples t-test

    H2: Driver Hypothesis
        Null:        Health benefit perception does not predict WTP
        Alternative: Positive correlation between health perception and WTP
        Test:        Pearson correlation or regression

    H3: WTP Hypothesis
        Null:        Mean WTP ≤ 200
        Alternative: Mean WTP > 200
        Test:        One-sample t-test

    H4: Barrier Hypothesis
        Null:        Price is the primary purchase barrier
        Alternative: Non-price barriers are stronger than price
        Test:        MaxDiff or relative importance analysis

    10B. HYPOTHESIS-DRIVEN QUESTION DESIGN

    For each hypothesis, design:
    1. Primary Test Question — directly measures the construct, appropriate scale for the test
    2. Validation Questions (2-3) — measure same construct via different method
    3. Moderating Variable Questions — enable subgroup analysis

    10C. RESEARCH OBJECTIVE CLASSIFICATION

    Before designing, classify the objective:

    Primary Objective Type:
        Brand Health/Tracking | Brand Perception & Image | Product-Market Fit | Concept/Idea Testing | Pricing & WTP | Usage & Attitude (U&A) | Segmentation | Communication/Ad Testing | CSAT/NPS | Path to Purchase | Feature Prioritization

    Decision Context:
        Exploratory | Diagnostic | Evaluative | Predictive | Tracking

    Hypothesis Complexity:
        Simple (1-2 hypotheses) | Moderate (3-5) | Complex (6+)

    Thematic Depth Required:
        Basic (scaled questions only) | Moderate (2-3 themes) | Deep (all 8 themes)

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 11: STANDARD OPTION CONSTRUCTION TEMPLATES
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    For rating scale questions (S type), use these pre-built option templates.
    Do NOT create custom scales unless methodologically necessary
    (e.g., NPS, semantic differential, conjoint, trade-off exercises).

    All standard rating scale questions:
    • Must use question_type: "S"
    • Must include fully populated options arrays
    • Must preserve option order exactly as written
    • Must set randomize_options: false

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    11A. SATISFACTION SCALE (5-point)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Question pattern:
    "How satisfied are you with [X]?"

    Question type: S
    randomize_options: false

    Options (always use these 5):

    1. "Very satisfied"
    tags: ["stated_satisfaction", "high_conscientiousness", "satisfied_user"]

    2. "Somewhat satisfied"
    tags: ["stated_satisfaction", "expected_self", "satisfied_user"]

    3. "Neither satisfied nor dissatisfied"
    tags: ["stated_indifference", "low_engagement"]

    4. "Somewhat dissatisfied"
    tags: ["stated_frustration", "deliberator", "workaround_seeker"]

    5. "Very dissatisfied"
    tags: ["stated_frustration", "frustrated_user", "high_neuroticism"]

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    11B. AGREEMENT SCALE (5-point)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Question pattern:
    "[Statement]. To what extent do you agree?"

    Question type: S
    randomize_options: false

    Options (always use these 5):

    1. "Strongly agree"
    tags: ["high_conscientiousness", "conformity_value", "stated_agreement"]

    2. "Somewhat agree"
    tags: ["expected_self", "deliberator", "stated_agreement"]

    3. "Neither agree nor disagree"
    tags: ["stated_indifference", "low_engagement"]

    4. "Somewhat disagree"
    tags: ["self_direction_value", "deliberator", "stated_disagreement"]

    5. "Strongly disagree"
    tags: ["high_openness", "stated_disagreement", "low_agreeableness"]

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    11C. AGREEMENT SCALE (7-point)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Question pattern:
    "[Statement]. To what extent do you agree?"

    Question type: S
    randomize_options: false

    Options (always use these 7):

    1. "Strongly agree"
    tags: ["high_conscientiousness", "conformity_value", "stated_agreement"]

    2. "Agree"
    tags: ["conformity_value", "stated_agreement", "satisfied_user"]

    3. "Somewhat agree"
    tags: ["expected_self", "deliberator", "stated_agreement"]

    4. "Neither agree nor disagree"
    tags: ["stated_indifference", "low_engagement"]

    5. "Somewhat disagree"
    tags: ["self_direction_value", "deliberator", "stated_disagreement"]

    6. "Disagree"
    tags: ["self_direction_value", "stated_disagreement", "low_agreeableness"]

    7. "Strongly disagree"
    tags: ["high_openness", "stated_disagreement", "low_agreeableness"]

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    11D. FREQUENCY SCALE (5-point)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Question pattern:
    "How often do you [behavior]?"

    Question type: S
    randomize_options: false

    Options (always use these 5):

    1. "Always / Every time"
    tags: ["high_conscientiousness", "habit_established", "satisfied_user"]

    2. "Often / Most of the time"
    tags: ["satisfied_user", "expected_self", "deliberator"]

    3. "Sometimes"
    tags: ["low_conscientiousness", "switcher", "workaround_seeker"]

    4. "Rarely"
    tags: ["low_engagement", "stated_barrier_present", "frustrated_user"]

    5. "Never"
    tags: ["stated_barrier_present", "frustrated_user"]

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    11E. IMPORTANCE SCALE (5-point)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Question pattern:
    "How important is [factor] to your decision?"

    Question type: S
    randomize_options: false

    Options (always use these 5):

    1. "Extremely important"
    tags: ["high_conscientiousness", "achievement_value", "deliberator"]

    2. "Very important"
    tags: ["deliberator", "achievement_value", "researcher"]

    3. "Moderately important"
    tags: ["expected_self", "satisfied_user"]

    4. "Slightly important"
    tags: ["low_conscientiousness", "low_engagement"]

    5. "Not at all important"
    tags: ["stated_indifference", "low_engagement"]

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    11F. LIKELIHOOD SCALE (5-point)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Question pattern:
    "How likely are you to [action]?"

    Question type: S
    randomize_options: false

    Options (always use these 5):

    1. "Extremely likely"
    tags: ["high_intent", "aspirational_response", "early_adopter"]

    2. "Very likely"
    tags: ["high_intent", "expected_self", "deliberator"]

    3. "Somewhat likely"
    tags: ["medium_intent", "satisfied_user"]

    4. "Not very likely"
    tags: ["low_intent", "stated_barrier_present", "deliberator"]

    5. "Not at all likely"
    tags: ["no_intent", "stated_barrier_present", "frustrated_user"]

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    11G. PERFORMANCE VS EXPECTATION SCALE (5-point)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Question pattern:
    "How does [attribute] compare to your expectations?"

    Question type: S
    randomize_options: false

    Options (always use these 5):

    1. "Much better than expected"
    tags: ["stated_satisfaction", "positive_surprise", "loyalist"]

    2. "Somewhat better than expected"
    tags: ["stated_satisfaction", "expected_self"]

    3. "About as expected"
    tags: ["expected_self", "satisfied_user"]

    4. "Somewhat worse than expected"
    tags: ["stated_frustration", "deliberator"]

    5. "Much worse than expected"
    tags: ["stated_frustration", "frustrated_user", "complainer"]

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    11H. NET PROMOTER SCORE (NPS)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Question pattern:
    "On a scale of 0 to 10, how likely are you to recommend [X] to a friend or colleague?"

    Question type: S
    randomize_options: false

    Options (use these 11 numeric options):

    0
    tags: ["stated_frustration", "frustrated_user", "high_neuroticism", "defensive_response"]

    1
    tags: ["stated_frustration", "frustrated_user", "high_neuroticism", "defensive_response"]

    2
    tags: ["stated_frustration", "frustrated_user", "high_neuroticism", "defensive_response"]

    3
    tags: ["stated_frustration", "frustrated_user", "high_neuroticism", "defensive_response"]

    4
    tags: ["stated_frustration", "frustrated_user", "high_neuroticism", "defensive_response"]

    5
    tags: ["stated_frustration", "frustrated_user", "high_neuroticism", "defensive_response"]

    6
    tags: ["stated_frustration", "frustrated_user", "high_neuroticism", "defensive_response"]

    7
    tags: ["stated_indifference", "expected_self", "deliberator"]

    8
    tags: ["stated_indifference", "expected_self", "deliberator"]

    9
    tags: ["stated_satisfaction", "satisfied_user", "recommender", "high_conscientiousness"]

    10
    tags: ["stated_satisfaction", "satisfied_user", "recommender", "high_conscientiousness"]

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    11I. MANDATORY OPTION CONSTRUCTION RULES
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    RULE OC1:
    If the question asks for agreement, satisfaction, frequency,
    importance, likelihood, or performance vs expectation,
    you MUST use one of the templates above.
    Do not create custom scales.

    RULE OC2:
    If you cannot determine which template fits,
    default to the Agreement Scale (5-point).

    RULE OC3:
    If the question truly requires qualitative depth and cannot
    be answered with a rating scale, use:
    question_type: "OE"
    with measurement_dimensions.

    RULE OC4:
    NEVER output a question with question_type "S" or "M"
    without a fully populated options array.
    A question without options is INVALID and must not appear.

    RULE OC5:
    If unsure whether to use a rating scale ("S")
    or open-ended ("OE"), prefer the rating scale ("S").
    Use OE sparingly:
    • Maximum 1 OE question per section
    • Maximum 6-8 OE questions per questionnaire

    RULE OC6:
    All tags used in templates must exist in the approved
    Tagging Universe. If additional template tags are introduced
    (e.g., high_intent, low_intent, medium_intent,
    positive_surprise, habit_established, low_engagement,
    stated_agreement, stated_disagreement, no_intent),
    they MUST also be added to the master Tagging Universe
    in Section 7 before use.

    RULE OC7:
    For all standard rating scales:
    • Preserve ordinal directionality
    • Maintain balanced positive/negative framing
    • Include a neutral midpoint where methodologically appropriate
    • Do not randomize ordered scale options

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 12: QUESTIONNAIRE STRUCTURE AND FLOW
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    12A. CANONICAL SECTION STRUCTURE

    Apply this gold-standard funnel (sections may be reordered based on flow logic, but generally follow safe-to-vulnerable, concrete-to-abstract progression):

    S1: Population Characteristics
        Qualify respondents. Confirm eligibility.
        Primarily S questions. Tagged for demographic and behavioral qualification.

    S2: Warm-Up & Contextual Framing
        Ease respondents in. Capture life context and situational framing.
        Mix of S and M. 1-2 OE for context description.

    S3: Core Measurement (Hypothesis Testing)
        Primary hypothesis constructs.
        S for single constructs. M for multi-attribute ratings. Likert-based.

    S4: Behavioral Patterns
        Frequency, habits, routines, channels.
        M for multi-step processes. S for frequency scales.

    S5: Attitudinal Discovery
        Beliefs, perceptions, brand/product attitudes.
        Likert grid questions. Agreement batteries.

    S6: Emotional Dimensions
        Feelings, emotional drivers, emotional reactions.
        M (emotion selection, M_MIN_1 or M_MAX_N).
        1 OE for trigger exploration.

    S7: Motivational Depth
        Underlying drivers and WHY factors.
        M_EXACT_N or RANKING_ENABLED for driver prioritization.
        1 OE after ranking.

    S8: Barriers & Friction
        What stops or slows the respondent.
        M (M_MAX_N or M_MIN_1) for barrier identification.
        Severity rating as separate S question.
        1 OE for specific friction description.

    S9: Scenario Exploration
        Hypothetical choices, trade-offs, future thinking.
        S or M_EXACT_N(2) for forced choice.
        Conjoint or MaxDiff where needed.

    S10: Identity & Self-Concept
        Self-perception, values, identity alignment.
        S for self-labeling questions. Likert for alignment.

    S11: Demographics & Classification
        Segmentation variables. Income, education, household, etc.
        All S unless multi-select demographic is required.

    12B. GOLDEN RULES FOR QUESTION ORDER

    1. Safe to Vulnerable — build trust before sensitive topics
    2. Concrete to Abstract — behaviors before beliefs/emotions
    3. General to Specific — broad context before narrow probes
    4. Unaided to Aided — spontaneous before prompted
    5. Rational to Emotional — facts before feelings
    6. Behavioral to Attitudinal to Emotional — natural depth progression
    7. Present to Past to Future — natural temporal flow

    12C. QUESTION FAMILY TAXONOMY

    Every question belongs to one family:
    1. Factual/Classification: Demographics, Ownership, Usage, Awareness
    2. Behavioral: Frequency, Recency, Occasion, Triggers, Patterns
    3. Attitudinal: Agreement, Preference, Satisfaction, Perception, Beliefs
    4. Evaluative: Attribute ratings, Feature importance, Performance vs. expectation
    5. Diagnostic: Reasons, Barriers, Drivers, Trade-offs
    6. Predictive: Intent, Likelihood, Consideration, Recommendation
    7. Hypothesis-Testing: Segment comparison, Driver-outcome pairs, Correlation validation
    8. Thematic Depth: Contextual, Emotional, Motivational, Identity questions
    9. Open-Ended Exploration: Qualitative depth, Follow-up why, Scenario narratives

    12D. SCALE INTELLIGENCE

    Binary:             Yes/No — use S
    Nominal:            Categories — use S (single) or M (multi)
    Ordinal:            Rankings — use M + RANKING_ENABLED
    Likert 5-point:     Agreement/Satisfaction — use S with 5 ordered options
    Likert 7-point:     Nuanced attitudes — use S with 7 ordered options
    Semantic Diff:      Bipolar attributes — use S
    Constant Sum:       Allocation — use M + NUMERIC_ALLOCATE + target_sum
    MaxDiff:            Best-Worst — use M + M_EXACT_N(2) + constraint: best_worst
    Emotion Selection:  Multi-select from preset list — use M + M_MIN_1 or M_MAX_N
    Forced-Choice:      Pairs — use S or M + M_EXACT_N(1 or 2)

    Scale Hygiene (Non-Negotiable):
    • Balanced scales — equal positive and negative options
    • Clear anchors — label endpoints explicitly
    • No double-barreled items — one concept per question
    • Neutral midpoint — include if appropriate for construct
    • Neutral phrasing — avoid leading language
    • Mix question types — prevent response set patterns

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 13: BIAS CONTROL LAYER
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Actively control for the following biases in every questionnaire:

    1. Leading Questions
    BAD:  "Don't you think organic food is better for babies?"
    GOOD: "How do you compare organic vs. conventional baby food?"

    2. Double-Barreled Questions
    BAD:  "How satisfied are you with the price and quality?"
    GOOD: Two separate questions — one for price, one for quality.

    3. Social Desirability Bias
    Minimize by: Neutral language, normalizing behaviors, offering "Prefer not to say" options.

    4. Acquiescence Bias
    Minimize by: Varying question types, forced-choice when appropriate.

    5. Recency & Primacy Effects
    Minimize by: Randomizing response options in M questions (set randomize_options: true), rotating grid items, breaking long lists.

    6. Survey Fatigue
    Minimize by: Under 15 minutes total length, progress indicators, varying question types, strategic placement of OE questions.

    7. Multi-Select Specific Biases:
    Order Bias in M Questions:
        Set randomize_options: true unless options have a natural sequence.
    Satisficing Behavior:
        Avoid overly long option lists (>10 options) in M questions.
        Long lists encourage selecting first few options rather than reading all.
    Selection Inflation:
        For M_ANY questions, be aware respondents may over-select.
        Use M_MAX_N when you need bounded consideration sets.
    None-of-Above Anchoring:
        Place none_exclusive options last in the option list.

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 14: STEP-BY-STEP DESIGN PROCESS
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Follow these steps in order for every questionnaire.

    STEP 1: Analyze Research Objective
    • Extract key decisions to be made
    • Identify target audience and segmentation needs
    • Classify objective type, decision context, stakeholder use
    • Determine hypothesis complexity and thematic depth required

    STEP 2: Extract Testable Hypotheses
    • Convert objective into 2–6 statistical hypotheses
    • Specify null and alternative hypotheses
    • Identify required statistical tests
    • Note sample size implications

    STEP 3: Map Qualitative Themes
    • Determine which of the 8 themes are relevant to this objective
    • Decide depth level per theme: Basic / Moderate / Deep
    • Plan balance of S, M, and OE questions per theme

    STEP 4: Design Section Structure and Question Blocks
    SECTION COUNT DETERMINATION:
    Based on the themes identified in Step 3, generate sections as follows:
    • Simple objectives (1-2 themes) → 3-5 sections 
    • Moderate objectives (3-5 themes) → 5-8 sections 
    • Complex objectives (6-8 themes) → 7-10 sections

    MANDATORY SECTIONS (always include):
    • S1: Population Characteristics (Theme: Contextual Framing)
    • S_DEMO: final section, Theme: Contextual Framing. Its "title" MUST be the exact
      literal string "Population Profile" — do not rename, paraphrase, or invent an
      alternative (e.g. "My Profile", "About You", "Demographics & Classification").
      This is the one section exempt from the "make titles objective-specific" rule below.

    THEMATIC SECTIONS (create one section per relevant theme from Step 3):
    • If Behavioral Patterns is relevant → create dedicated Behavioral Patterns section 
    • If Attitudinal Discovery is relevant → create dedicated Attitudinal Discovery section 
    • If Emotional Dimensions is relevant → create dedicated

    Emotional Dimensions section 
    • If Motivational Depth is relevant → create dedicated Motivational Depth section 
    • If Barriers &amp; Friction is relevant → create dedicated Barriers &amp; Friction section • If Scenario Exploration is relevant →
    create dedicated Scenario Exploration section 
    • If Identity &amp; Self-Concept is relevant → create dedicated Identity section

    QUESTION DISTRIBUTION PER SECTION:
    For each section you create: 
    • Generate MINIMUM 4 questions per section (mandatory) 
    • Generate MAXIMUM 8 questions per section (avoid overload) 
    • Target 4-6 questions per section for optimal coverage

    MANDATORY QUESTION ALLOCATION: 
    • S1 Population Characteristics: 4-6 questions (qualification + context setting)
    • S_DEMO

    Demographics: 4-6 questions (standard demographics) 
    • All thematic sections: 4-6 questions each (full coverage)

    QUESTION COMPOSITION PER SECTION: 
    • Primarily S and M questions (scaled, measurable) 
    • Maximum 1 OE question per section (qualitative depth) 
    • Minimum 3 S/M questions per section (statistical validity)

    SECTION CONSTRUCTION:
    For each section: 
    • Assign section_id (S1, S2, S3, …, S_DEMO) 
    • Assign section_theme from the 8 qualitative themes 
    • Design 4-6 questions per section (mandatory minimum) 
    • For each hypothesis, design primary + 2 validation questions 
    • Integrate thematic depth questions at appropriate points 
    • Select question type (S / M / OE) and appropriate scale per Section 11D

    VALIDATION CHECK (before moving to next section): 
    □ This section has at least 4 questions 
    □ At least 3 are S or M type (scaled coverage) 
    □ No more than 1 is OE type (prevent qualitative overload)

    STEP 5: For Each M Question, Determine Selection Rule
    Use the DECISION TREE in Section 5.
    Assign selection_rule before writing options.
    Assign input_behavior only if non-default behavior is needed.

    STEP 6: Apply Bias Controls
    • Review every question for leading language
    • Ensure neutral phrasing throughout
    • Plan option randomization for M questions (set randomize_options appropriately)

    STEP 7: Write Options and Apply Tags
    For every option in every S and M question:
    • Write clear, concise, mutually meaningful option text
    • Assign 2–5 meaningful tags from the Tagging Universe (prefer 3-5)
    • Verify no two options in the same question share identical tag sets
    • Verify opposite-meaning options carry psychographically opposite tags
    • Think: "WHO picks this option?" not "What does this option say?"

    STEP 8: Write OE Questions and Measurement Dimensions
    For every OE question:
    • Write prompt under 20 words
    • Specify suggested_length
    • Populate measurement_dimensions with theme, primary_codes, sentiment, intensity, response_quality

    STEP 9: Optimize Flow & Experience
    • Verify logical progression (safe → vulnerable, concrete → abstract)
    • Estimate completion time (target: under 15 minutes)
    • Verify section_theme alignment for each section
    • Mix question types to prevent response pattern monotony
    • Verify question count within target range (10-40 questions)

    STEP 10: Run Quality Checklist
    See Section 15.

    STEP 11: Output Final JSON
    Follow the schema specification in Section 6.
    Every S and M question must have options.
    Every option must have tags.
    Every M question must have selection_rule.
    Every OE question must have measurement_dimensions.
    Output must begin with { and end with }
    No text before or after JSON.

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 15: QUALITY ASSURANCE CHECKLIST
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Before finalizing output, verify all of the following:

    OBJECTIVE ALIGNMENT
    □ Every question maps to a research objective
    □ Every hypothesis has corresponding primary + validation questions
    □ No "nice to know" questions included

    THEMATIC COVERAGE
    □ Appropriate qualitative themes integrated per section_theme
    □ Balance between S, M, and OE questions
    □ Emotional, motivational, and contextual dimensions captured

    SECTION COUNT VALIDATION
    □ Section count matches research complexity: 
        - Simple objectives (1-2 themes): 3-5 sections generated 
        - Moderate objectives (3-5 themes): 5-8 sections generated 
        - Complex objectives (6-8 themes): 7-10 sections generated
    □ Each relevant theme from Step 3 has a dedicated section
    □ No more than 2 sections share the same section_theme value
    □ Minimum section count: at least 3 sections (Population Characteristics, Core, Demographics)
    
    QUESTION COUNT PER SECTION (MANDATORY)
    □ Every section has MINIMUM 4 questions — NO exceptions, including S1 Population Characteristics
    □ Every thematic section has at least 3 S/M questions 
        - Ensures statistical validity - Prevents OE-only sections
    □ No section exceeds 8 questions - Prevents respondent overload in single theme
    □ Total question count matches formula: 
        - Total = Number of Sections × (4-6 questions per section) 
        - Simple (3-5 sections): 12-30 questions 
        - Moderate (5-8 sections): 20-48 questions 
        - Complex (7-10 sections): 28-60 questions
    □ If any section has fewer than 4 questions: - DO NOT OUTPUT the questionnaire - Add questions to
    underpopulated sections - Ensure minimum coverage before finalizing

    METHODOLOGICAL RIGOR
    □ Appropriate scales selected for each construct
    □ No leading or double-barreled questions
    □ Response options are exhaustive and mutually exclusive (for S)
    □ Response options allow valid combinations (for M)

    QUESTION TYPE COMPLIANCE
    □ Every question uses exactly "S", "M", or "OE"
    □ Every M question has a selection_rule
    □ Every selection_rule type is from the approved list
    □ All parameters (n, x, y) are valid integers ≤ total options
    □ input_behavior is present only when non-default
    □ target_sum is present when and only when NUMERIC_ALLOCATE is used
    □ none_exclusive appears in at most one option per question
    □ all_inclusive appears in at most one option per question

    OPTION TAGGING COMPLIANCE (MANDATORY)
    □ Every S and M option has 2–5 meaningful tags (prefer 3-5)
    □ All tags come from the Tagging Universe — no invented tags
    □ No two options in the same question have identical tag sets
    □ Opposite-meaning options carry psychographically opposite tags
    □ Tags reflect persona-likelihood, not option-paraphrase
    □ Multi-select questions with 6+ options span all 6 tag categories

    OE QUESTION COMPLIANCE
    □ Every OE question has measurement_dimensions
    □ theme matches one of the 8 qualitative themes
    □ primary_codes has 3–5 entries
    □ sentiment, intensity, response_quality all specified

    RANDOMIZATION METADATA
    □ randomize_options field present for all S and M questions
    □ Set to true for most questions
    □ Set to false for ordered scales (satisfaction, agreement, frequency) or natural sequences

    FLOW & EXPERIENCE
    □ Logical section progression (safe → vulnerable)
    □ Survey estimated under 15 minutes
    □ Mix of question types prevents monotony
    □ Clear instructions included for complex questions (NUMERIC_ALLOCATE, RANKING_ENABLED)
    □ none_exclusive options appear last in their option list

    STATISTICAL READINESS
    □ Sample size adequate for planned analyses
    □ Sufficient variation in scales for statistical tests
    □ Demographic segmentation variables included in final section

    SECTION ID CONSISTENCY
    □ All section IDs use consistent numeric format: S1, S2, S3, ..., S10, S11
    □ No mixed semantic labels (e.g., S_DEMO) — use numeric sequence only

    JSON VALIDATION
    □ All JSON brackets balanced
    □ No trailing commas
    □ All keys use double quotes
    □ Output begins with { and ends with }
    □ No text before or after JSON block

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SECTION 16: OUTPUT FORMAT
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    CRITICAL JSON OUTPUT INSTRUCTIONS:

    1. Output must begin with { and end with }
    2. No text, explanation, or commentary before or after JSON
    3. Validate all JSON brackets are balanced
    4. Ensure no trailing commas
    5. Ensure all keys use double quotes
    6. Test that output would parse with json.loads()

    RETURN STRICT JSON ONLY.

    COMPLETE OUTPUT TEMPLATE:

    ⚠ CRITICAL BEFORE GENERATING: The section_theme and title values shown in the template
    below (e.g. "Behavioral Patterns", "Attitudinal Discovery") are STRUCTURAL PLACEHOLDERS ONLY.
    You MUST replace every section_theme and title with themes derived directly from the
    research objective stated at the top of this prompt:
    "$res_desc"
    Generate section names that are SPECIFIC to that research objective — not generic labels.
    EXCEPTION: the final S_DEMO section's title is NOT objective-specific — it MUST always be
    the exact literal string "Population Profile", verbatim, regardless of research objective.

    NOTE: This template shows the REQUIRED question density. ALL sections including S1 must have 4-6 questions.
    Replicate the S2 pattern for every section — no section may have fewer than 4 questions.

{
  "sections": [
    {
      "section_id": "S1",
      "section_theme": "Contextual Framing",
      "title": "Population Characteristics",
      "questions": [
        {
          "question_id": "Q1",
          "text": "string",
          "question_type": "S",
          "randomize_options": false,
          "options": [
            { "option_id": "opt1", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt2", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt3", "text": "string", "tags": ["tag1", "tag2", "tag3"] }
          ]
        },
        {
          "question_id": "Q2",
          "text": "string",
          "question_type": "S",
          "randomize_options": false,
          "options": [
            { "option_id": "opt1", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt2", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt3", "text": "string", "tags": ["tag1", "tag2", "tag3"] }
          ]
        },
        {
          "question_id": "Q3",
          "text": "string",
          "question_type": "S",
          "randomize_options": false,
          "options": [
            { "option_id": "opt1", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt2", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt3", "text": "string", "tags": ["tag1", "tag2", "tag3"] }
          ]
        },
        {
          "question_id": "Q4",
          "text": "string",
          "question_type": "S",
          "randomize_options": false,
          "options": [
            { "option_id": "opt1", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt2", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt3", "text": "string", "tags": ["tag1", "tag2", "tag3"] }
          ]
        }
      ]
    },
    {
      "section_id": "S2",
      "section_theme": "Behavioral Patterns",
      "title": "Usage & Behavior",
      "questions": [
        {
          "question_id": "Q4",
          "text": "string",
          "question_type": "S",
          "randomize_options": false,
          "options": [
            { "option_id": "opt1", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt2", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt3", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt4", "text": "string", "tags": ["tag1", "tag2", "tag3"] }
          ]
        },
        {
          "question_id": "Q5",
          "text": "string",
          "question_type": "M",
          "randomize_options": true,
          "selection_rule": { "type": "M_MAX_N", "n": 3 },
          "options": [
            { "option_id": "opt1", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt2", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt3", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt4", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt5", "text": "string", "tags": ["tag1", "tag2", "tag3"] }
          ]
        },
        {
          "question_id": "Q6",
          "text": "string",
          "question_type": "S",
          "randomize_options": false,
          "options": [
            { "option_id": "opt1", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt2", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt3", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt4", "text": "string", "tags": ["tag1", "tag2", "tag3"] },
            { "option_id": "opt5", "text": "string", "tags": ["tag1", "tag2", "tag3"] }
          ]
        },
        {
          "question_id": "Q7",
          "text": "string",
          "question_type": "OE",
          "measurement_dimensions": {
            "primary_construct": "string",
            "secondary_constructs": ["string"],
            "coding_frame": ["string"]
          }
        }
      ]
    },
    {
      "section_id": "S3",
      "section_theme": "Attitudinal Discovery",
      "title": "Perceptions & Beliefs",
      "questions": [ "*** GENERATE 4-6 QUESTIONS FOLLOWING THE S2 PATTERN ABOVE ***" ]
    },
    {
      "section_id": "S4",
      "section_theme": "Emotional Dimensions",
      "title": "Feelings & Reactions",
      "questions": [ "*** GENERATE 4-6 QUESTIONS FOLLOWING THE S2 PATTERN ABOVE ***" ]
    },
    {
      "section_id": "S5",
      "section_theme": "Motivational Depth",
      "title": "Drivers & Priorities",
      "questions": [ "*** GENERATE 4-6 QUESTIONS FOLLOWING THE S2 PATTERN ABOVE ***" ]
    },
    {
      "section_id": "S6",
      "section_theme": "Barriers & Friction",
      "title": "Obstacles & Challenges",
      "questions": [ "*** GENERATE 4-6 QUESTIONS FOLLOWING THE S2 PATTERN ABOVE ***" ]
    },
    {
      "section_id": "S_DEMO",
      "section_theme": "Contextual Framing",
      "title": "Population Profile",
      "questions": [ "*** GENERATE 4-6 QUESTIONS FOLLOWING THE S2 PATTERN ABOVE ***" ]
    }
  ]
}

    CRITICAL REMINDER: Replace every "*** GENERATE 4-6 QUESTIONS ***" placeholder with actual fully-populated
    question objects. The final JSON must NOT contain any placeholder strings — only real question objects.
    Every non-screener section must have a minimum of 4 complete question objects.

    Section count: determined by research complexity (3-5 simple, 5-8 moderate, 7-10 complex).
    All section IDs must use consistent numeric format: S1, S2, S3, etc.

    """
    from string import Template
    final_res_desc = res_desc or research_desc or "Not provided"
    built_prompt = Template(prompt).safe_substitute(
        res_desc=final_res_desc,
        total_sample=total_sample,
        audience_text=audience_text
    )
    return built_prompt, final_res_desc

async def generate_questionnaire(objective, personas_list, population, exploration_id):
    """
    Generate ONE questionnaire considering ALL personas.
    personas_list: list of persona dicts
    """
    prompt, res_desc = await build_questionnaire_prompt(objective, personas_list, population, exploration_id)

    try:
        res = await client.chat.completions.create(
            model="gpt-4o",
            response_format={"type": "json_object"},
            max_tokens=16384,
            messages=[
                {"role": "system", "content": f"You are a quantitative research questionnaire designer. Every question you generate MUST directly serve this specific research objective: {res_desc}. All section themes and question topics must be derived from this objective — do not generate generic questions. Output strict JSON only. Every non-screener section MUST contain exactly 4-6 fully populated question objects. Do not summarize or abbreviate any section."},
                {"role": "user", "content": prompt}
            ]
        )
    except Exception as e:
        return None, f"LLM Error: {str(e)}"

    raw = res.choices[0].message.content

    # DEBUG: log token usage and question counts per section
    usage = res.usage
    finish_reason = res.choices[0].finish_reason
    print(f"[DEBUG] finish_reason={finish_reason} | prompt_tokens={usage.prompt_tokens} | completion_tokens={usage.completion_tokens} | total_tokens={usage.total_tokens}")
    try:
        _debug_data = json.loads(raw)
        for _sec in _debug_data.get("sections", []):
            print(f"[DEBUG] Section '{_sec.get('title')}' → {len(_sec.get('questions', []))} questions")
    except Exception as _e:
        print(f"[DEBUG] JSON parse failed: {_e}")

    try:
        data = json.loads(raw)
        sections = data.get("sections", [])
        if sections:
            sections[0]["title"] = "Population Characteristics"
        return data, None
    except:
        return None, "Invalid JSON from LLM"


QUESTIONNAIRE_DESIGN_SOURCE_KEY = "exploration:questionnaire-design"
QUESTIONNAIRE_JOB_STALE_AFTER = timedelta(minutes=30)


def questionnaire_generation_source_key(simulation_id: Optional[str] = None) -> str:
    return f"simulation:{simulation_id}" if simulation_id else QUESTIONNAIRE_DESIGN_SOURCE_KEY


def questionnaire_generation_job_to_dict(job: QuestionnaireGenerationJob) -> dict:
    return {
        "job_id": job.id,
        "workspace_id": job.workspace_id,
        "exploration_id": job.exploration_id,
        "simulation_id": job.simulation_id,
        "status": job.status,
        "persona_ids": job.persona_ids or [],
        "error_message": job.error_message,
        "questionnaire_section_ids": job.questionnaire_section_ids or [],
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "started_at": job.started_at,
        "completed_at": job.completed_at,
    }


def _job_is_stale(job: QuestionnaireGenerationJob) -> bool:
    if job.status not in {"pending", "running"}:
        return False
    anchor = job.updated_at or job.started_at or job.created_at
    return bool(anchor and datetime.utcnow() - anchor > QUESTIONNAIRE_JOB_STALE_AFTER)


async def get_questionnaire_generation_job(
    job_id: str,
    workspace_id: str,
    exploration_id: str,
) -> Optional[QuestionnaireGenerationJob]:
    async with AsyncSession(async_engine) as session:
        result = await session.execute(
            select(QuestionnaireGenerationJob).where(
                QuestionnaireGenerationJob.id == job_id,
                QuestionnaireGenerationJob.workspace_id == workspace_id,
                QuestionnaireGenerationJob.exploration_id == exploration_id,
            )
        )
        return result.scalars().first()


async def enqueue_questionnaire_generation_job(
    workspace_id: str,
    exploration_id: str,
    persona_ids: list[str],
    user_id: str,
    simulation_id: Optional[str] = None,
) -> tuple[QuestionnaireGenerationJob, bool]:
    """Create or reuse the one durable generation job for this questionnaire scope."""
    source_key = questionnaire_generation_source_key(simulation_id)
    now = datetime.utcnow()

    async with AsyncSession(async_engine) as session:
        result = await session.execute(
            select(QuestionnaireGenerationJob).where(
                QuestionnaireGenerationJob.workspace_id == workspace_id,
                QuestionnaireGenerationJob.exploration_id == exploration_id,
                QuestionnaireGenerationJob.source_key == source_key,
            )
        )
        existing = result.scalars().first()
        if existing:
            should_start = existing.status == "pending"
            if existing.status in {"completed", "failed"} or _job_is_stale(existing):
                existing.status = "pending"
                existing.persona_ids = persona_ids
                existing.error_message = None
                existing.questionnaire_section_ids = []
                existing.updated_at = now
                existing.started_at = None
                existing.completed_at = None
                session.add(existing)
                await session.commit()
                await session.refresh(existing)
                should_start = True
            return existing, should_start

        job = QuestionnaireGenerationJob(
            id=generate_id(),
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            simulation_id=simulation_id,
            source_key=source_key,
            status="pending",
            persona_ids=persona_ids,
            created_by=user_id,
            created_at=now,
            updated_at=now,
        )
        session.add(job)
        try:
            await session.commit()
            await session.refresh(job)
            return job, True
        except IntegrityError:
            await session.rollback()
            result = await session.execute(
                select(QuestionnaireGenerationJob).where(
                    QuestionnaireGenerationJob.workspace_id == workspace_id,
                    QuestionnaireGenerationJob.exploration_id == exploration_id,
                    QuestionnaireGenerationJob.source_key == source_key,
                )
            )
            job = result.scalars().first()
            if not job:
                raise
            return job, False


async def _set_generation_job_status(
    job_id: str,
    status: str,
    *,
    error_message: Optional[str] = None,
    questionnaire_section_ids: Optional[list[str]] = None,
) -> None:
    async with AsyncSession(async_engine) as session:
        result = await session.execute(
            select(QuestionnaireGenerationJob).where(QuestionnaireGenerationJob.id == job_id)
        )
        job = result.scalars().first()
        if not job:
            return

        now = datetime.utcnow()
        job.status = status
        job.updated_at = now
        if status == "running" and not job.started_at:
            job.started_at = now
        if status in {"completed", "failed"}:
            job.completed_at = now
        if error_message is not None:
            job.error_message = error_message[:4000]
        if questionnaire_section_ids is not None:
            job.questionnaire_section_ids = questionnaire_section_ids
        session.add(job)
        await session.commit()


async def run_questionnaire_generation_job(job_id: str) -> None:
    """Run questionnaire generation outside the request/response lifecycle."""
    async with AsyncSession(async_engine) as session:
        async with session.begin():
            result = await session.execute(
                select(QuestionnaireGenerationJob)
                .where(QuestionnaireGenerationJob.id == job_id)
                .with_for_update()
            )
            job = result.scalars().first()
            if not job:
                logger.warning("Questionnaire generation job not found | job_id=%s", job_id)
                return
            if job.status == "completed":
                return
            if job.status == "running" and not _job_is_stale(job):
                return

            now = datetime.utcnow()
            job.status = "running"
            job.error_message = None
            job.updated_at = now
            job.started_at = job.started_at or now
            session.add(job)

            workspace_id = job.workspace_id
            exploration_id = job.exploration_id
            simulation_id = job.simulation_id
            persona_ids = list(job.persona_ids or [])
            user_id = job.created_by

    logger.info(
        "Questionnaire generation job started | job_id=%s workspace_id=%s exploration_id=%s simulation_id=%s persona_count=%s",
        job_id,
        workspace_id,
        exploration_id,
        simulation_id,
        len(persona_ids),
    )

    try:
        existing = (
            await get_questionnaire_by_simulation(workspace_id, exploration_id, simulation_id)
            if simulation_id
            else await get_full_questionnaire(workspace_id, exploration_id)
        )
        if existing:
            await _set_generation_job_status(
                job_id,
                "completed",
                questionnaire_section_ids=[s.get("id") for s in existing if s.get("id")],
            )
            return

        from app.services.exploration import get_exploration
        from app.services.persona import get_persona
        from app.services.population import get_simulation

        async with AsyncSession(async_engine) as session:
            objective = await get_exploration(session, exploration_id)
        if not objective:
            raise ValueError("Research objective not found")

        simulation = await get_simulation(simulation_id) if simulation_id else None
        if simulation_id and not simulation:
            raise ValueError("Population simulation not found")

        personas_list = []
        for persona_id in persona_ids:
            persona = await get_persona(persona_id)
            if persona:
                personas_list.append(persona)
        if not personas_list:
            raise ValueError("No valid personas found")

        output, error = await generate_questionnaire(
            objective,
            personas_list,
            simulation,
            exploration_id,
        )
        if error:
            raise RuntimeError(error)

        stored = await store_ai_generated_questionnaire(
            workspace_id,
            exploration_id,
            output,
            user_id,
            simulation_id,
        )
        section_ids = [s.get("id") for s in stored if s.get("id")]
        await _set_generation_job_status(
            job_id,
            "completed",
            questionnaire_section_ids=section_ids,
        )
        logger.info(
            "Questionnaire generation job completed | job_id=%s workspace_id=%s exploration_id=%s section_count=%s",
            job_id,
            workspace_id,
            exploration_id,
            len(section_ids),
        )
    except Exception as exc:
        logger.exception(
            "Questionnaire generation job failed | job_id=%s workspace_id=%s exploration_id=%s",
            job_id,
            workspace_id,
            exploration_id,
        )
        await _set_generation_job_status(job_id, "failed", error_message=str(exc))


async def store_ai_generated_questionnaire(workspace_id: str, objective_id: str, data: dict, user_id: str, simulation_id: str = None):
    """
    Stores LLM generated questionnaire JSON into DB (sections + questions)
    """
    sections_out = []

    async with AsyncSession(async_engine) as session:
        for sec_index, sec in enumerate(data.get("sections", [])):
            sec_payload = canonicalize_section_payload(sec, sec_index)
            sec_obj = QuestionnaireSection(
                id=generate_id(),
                workspace_id=workspace_id,
                exploration_id=objective_id,
                simulation_id=simulation_id,
                parent_section_id=sec_payload["parent_section_id"],
                title=sec_payload["title"],
                order_index=sec_payload["order_index"],
                section_metadata=sec_payload["metadata"],
                created_by=user_id,
                created_at=datetime.utcnow()
            )
            session.add(sec_obj)
            await session.flush()

            qlist = []
            for q_index, q in enumerate(sec.get("questions", [])):
                q_payload = build_question_payload(
                    text=q.get("text", ""),
                    options=q.get("options", []),
                    question_type=q.get("question_type") or q.get("type"),
                    question_key=q.get("question_key") or q.get("question_id"),
                    config={
                        k: v
                        for k, v in q.items()
                        if k not in {"text", "options", "question_type", "type", "question_key", "question_id"}
                    },
                    order_index=q.get("order_index", q_index),
                )
                q_obj = QuestionnaireQuestion(
                    id=generate_id(),
                    section_id=sec_obj.id,
                    question_key=q_payload["question_key"],
                    question_type=q_payload["question_type"],
                    text=q_payload["text"],
                    options=q_payload["options"],
                    config=q_payload["config"],
                    order_index=q_payload["order_index"],
                    created_by=user_id,
                    created_at=datetime.utcnow()
                )
                session.add(q_obj)
                qlist.append(q_obj)

            sections_out.append({"section": sec_obj, "questions": qlist})

        await session.commit()

        for sec in sections_out:
            await session.refresh(sec["section"])
            for q in sec["questions"]:
                await session.refresh(q)

    result = []
    for sec in sections_out:
        result.append({
            "id": sec["section"].id,
            "section_id": sec["section"].id,
            "title": sec["section"].title,
            "simulation_id": sec["section"].simulation_id,
            "parent_section_id": sec["section"].parent_section_id,
            "order_index": sec["section"].order_index,
            "metadata": sec["section"].section_metadata,
            "questions": [
                question_model_to_dict(q)
                for q in sec["questions"]
            ]
        })

    return result

async def create_section(
    workspace_id,
    exploration_id,
    title,
    user_id,
    simulation_id=None,
    parent_section_id=None,
    order_index=None,
    metadata=None,
):
    async with AsyncSession(async_engine) as session:
        if order_index is None:
            count_stmt = select(QuestionnaireSection).where(
                QuestionnaireSection.workspace_id == workspace_id,
                QuestionnaireSection.exploration_id == exploration_id
            )
            existing = (await session.execute(count_stmt)).scalars().all()
            order_index = len(existing)

        sec = QuestionnaireSection(
            id=generate_id(),
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            simulation_id=simulation_id,
            parent_section_id=parent_section_id,
            title=title,
            order_index=order_index,
            section_metadata=metadata or {},
            created_by=user_id
        )
        session.add(sec)
        await session.commit()
        await session.refresh(sec)
        return sec


async def update_section(
    section_id: str,
    workspace_id: str,
    exploration_id: str,
    title: str,
    parent_section_id=None,
    order_index=None,
    metadata=None,
):
    async with AsyncSession(async_engine) as session:
        questionnaire = select(QuestionnaireSection).where(
            QuestionnaireSection.id == section_id,
            QuestionnaireSection.workspace_id == workspace_id,
            QuestionnaireSection.exploration_id == exploration_id
        )
        res = await session.execute(questionnaire)
        sec = res.scalars().first()

        if not sec:
            return None

        sec.title = title
        if parent_section_id is not None:
            sec.parent_section_id = parent_section_id
        if order_index is not None:
            sec.order_index = order_index
        if metadata is not None:
            sec.section_metadata = metadata
        session.add(sec)
        await session.commit()
        await session.refresh(sec)

    await _report_cache.invalidate_cache(exploration_id)
    return sec


async def delete_section(section_id: str, workspace_id: str, exploration_id: str):
    async with AsyncSession(async_engine) as session:
        questionnaire = select(QuestionnaireSection).where(
            QuestionnaireSection.id == section_id,
            QuestionnaireSection.workspace_id == workspace_id,
            QuestionnaireSection.exploration_id == exploration_id
        )
        res = await session.execute(questionnaire)
        sec = res.scalars().first()

        if not sec:
            return False

        questionnaireSection = select(QuestionnaireQuestion).where(QuestionnaireQuestion.section_id == section_id)
        qrows = (await session.execute(questionnaireSection)).scalars().all()
        for q in qrows:
            await session.delete(q)

        await session.delete(sec)
        await session.commit()

    await _report_cache.invalidate_cache(exploration_id)
    return True


async def create_question(
    section_id: str,
    workspace_id: str,
    exploration_id: str,
    text: str,
    options: list,
    user_id: str,
    question_type: str = None,
    config: dict = None,
    question_key: str = None,
    order_index: int = None,
):
    async with AsyncSession(async_engine) as session:
        section_query = select(QuestionnaireSection).where(
            QuestionnaireSection.id == section_id,
            QuestionnaireSection.workspace_id == workspace_id,
            QuestionnaireSection.exploration_id == exploration_id
        )
        section = (await session.execute(section_query)).scalars().first()

        if not section:
            return None

        if order_index is None:
            count_stmt = select(QuestionnaireQuestion).where(
                QuestionnaireQuestion.section_id == section_id
            )
            existing_questions = (await session.execute(count_stmt)).scalars().all()
            order_index = len(existing_questions)

        q_payload = build_question_payload(
            text=text,
            options=options,
            question_type=question_type,
            config=config or {},
            question_key=question_key,
            order_index=order_index,
        )

        q = QuestionnaireQuestion(
            id=generate_id(),
            section_id=section_id,
            question_key=q_payload["question_key"],
            question_type=q_payload["question_type"],
            text=q_payload["text"],
            options=q_payload["options"],
            config=q_payload["config"],
            order_index=q_payload["order_index"],
            created_by=user_id
        )
        session.add(q)
        await session.commit()
        await session.refresh(q)
        return q


async def update_question(
    qid: str,
    workspace_id: str,
    exploration_id: str,
    text: str,
    options: list,
    question_type: str = None,
    config: dict = None,
    question_key: str = None,
    order_index: int = None,
):
    async with AsyncSession(async_engine) as session:
        questionnaire = (
            select(QuestionnaireQuestion)
            .join(QuestionnaireSection, QuestionnaireQuestion.section_id == QuestionnaireSection.id)
            .where(
                QuestionnaireQuestion.id == qid,
                QuestionnaireSection.workspace_id == workspace_id,
                QuestionnaireSection.exploration_id == exploration_id
            )
        )
        res = await session.execute(questionnaire)
        q = res.scalars().first()

        if not q:
            return None

        q_payload = build_question_payload(
            text=text,
            options=options,
            question_type=question_type or q.question_type,
            config=config if config is not None else (q.config or {}),
            question_key=question_key or q.question_key,
            order_index=order_index if order_index is not None else q.order_index,
        )

        q.question_key = q_payload["question_key"]
        q.question_type = q_payload["question_type"]
        q.text = q_payload["text"]
        q.options = q_payload["options"]
        q.config = q_payload["config"]
        q.order_index = q_payload["order_index"]
        session.add(q)
        await session.commit()
        await session.refresh(q)

    await _report_cache.invalidate_cache(exploration_id)
    return q


async def delete_question(qid: str, workspace_id: str, exploration_id: str):
    async with AsyncSession(async_engine) as session:
        questionnaire = (
            select(QuestionnaireQuestion)
            .join(QuestionnaireSection, QuestionnaireQuestion.section_id == QuestionnaireSection.id)
            .where(
                QuestionnaireQuestion.id == qid,
                QuestionnaireSection.workspace_id == workspace_id,
                QuestionnaireSection.exploration_id == exploration_id
            )
        )
        res = await session.execute(questionnaire)
        q = res.scalars().first()

        if not q:
            return False

        await session.delete(q)
        await session.commit()

    await _report_cache.invalidate_cache(exploration_id)
    return True


async def validate_question_payload(payload: dict):
    q_payload = build_question_payload(
        text=payload.get("text", ""),
        options=payload.get("options", []),
        question_type=payload.get("question_type"),
        config=payload.get("config") or {},
        question_key=payload.get("question_key"),
        order_index=payload.get("order_index"),
    )
    return {"valid": True, "question": q_payload, "question_types": get_question_type_catalog()}


async def reorder_sections(workspace_id: str, exploration_id: str, items: list[dict]):
    async with AsyncSession(async_engine) as session:
        updated = []
        for item in items:
            section_id = item.get("section_id")
            if not section_id:
                continue
            stmt = select(QuestionnaireSection).where(
                QuestionnaireSection.id == section_id,
                QuestionnaireSection.workspace_id == workspace_id,
                QuestionnaireSection.exploration_id == exploration_id,
            )
            sec = (await session.execute(stmt)).scalars().first()
            if not sec:
                continue
            sec.order_index = int(item.get("order_index") or 0)
            if "parent_section_id" in item:
                sec.parent_section_id = item.get("parent_section_id")
            session.add(sec)
            updated.append(sec)
        await session.commit()
        for sec in updated:
            await session.refresh(sec)

    await _report_cache.invalidate_cache(exploration_id)
    return [
        {
            "section_id": sec.id,
            "title": sec.title,
            "order_index": sec.order_index,
            "parent_section_id": sec.parent_section_id,
        }
        for sec in updated
    ]


async def reorder_questions(workspace_id: str, exploration_id: str, items: list[dict]):
    async with AsyncSession(async_engine) as session:
        updated = []
        for item in items:
            question_id = item.get("question_id")
            if not question_id:
                continue
            stmt = (
                select(QuestionnaireQuestion)
                .join(QuestionnaireSection, QuestionnaireQuestion.section_id == QuestionnaireSection.id)
                .where(
                    QuestionnaireQuestion.id == question_id,
                    QuestionnaireSection.workspace_id == workspace_id,
                    QuestionnaireSection.exploration_id == exploration_id,
                )
            )
            q = (await session.execute(stmt)).scalars().first()
            if not q:
                continue
            if item.get("section_id"):
                q.section_id = item["section_id"]
            q.order_index = int(item.get("order_index") or 0)
            session.add(q)
            updated.append(q)
        await session.commit()
        for q in updated:
            await session.refresh(q)

    await _report_cache.invalidate_cache(exploration_id)
    return [question_model_to_dict(q) for q in updated]


async def _get_question_for_workspace(question_id: str, workspace_id: str, exploration_id: str):
    async with AsyncSession(async_engine) as session:
        stmt = (
            select(QuestionnaireQuestion)
            .join(QuestionnaireSection, QuestionnaireQuestion.section_id == QuestionnaireSection.id)
            .where(
                QuestionnaireQuestion.id == question_id,
                QuestionnaireSection.workspace_id == workspace_id,
                QuestionnaireSection.exploration_id == exploration_id,
            )
        )
        return (await session.execute(stmt)).scalars().first()


async def save_question_asset(question_id: str, workspace_id: str, exploration_id: str, upload_file, user_id: str):
    q = await _get_question_for_workspace(question_id, workspace_id, exploration_id)
    if not q:
        return None

    original_name = upload_file.filename or "upload"
    ext = Path(original_name).suffix.lower()
    if ext not in QUESTION_ASSET_ALLOWED_EXT:
        raise ValueError(f"Unsupported file type: {ext}")

    content = await upload_file.read()
    size = len(content)
    if size > QUESTION_ASSET_MAX_BYTES:
        raise ValueError("File exceeds 50 MB size limit")

    content_type = upload_file.content_type or mimetypes.guess_type(original_name)[0] or "application/octet-stream"
    stored_name = f"{uuid4().hex}{ext}"
    saved_path = QUESTION_ASSET_DIR / stored_name
    async with aiofiles.open(saved_path, "wb") as f:
        await f.write(content)

    asset_type = _asset_type_for_content(content_type, ext)
    async with AsyncSession(async_engine) as session:
        asset = QuestionnaireQuestionAsset(
            id=generate_id(),
            question_id=question_id,
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            filename=str(saved_path),
            original_name=original_name,
            content_type=content_type,
            size=size,
            asset_type=asset_type,
            asset_metadata={},
            uploaded_by=user_id,
            uploaded_at=datetime.utcnow(),
        )
        session.add(asset)
        await session.commit()
        await session.refresh(asset)
        return asset_to_dict(asset)


def asset_to_dict(asset: QuestionnaireQuestionAsset):
    return {
        "id": asset.id,
        "question_id": asset.question_id,
        "workspace_id": asset.workspace_id,
        "exploration_id": asset.exploration_id,
        "filename": asset.filename,
        "original_name": asset.original_name,
        "content_type": asset.content_type,
        "size": asset.size,
        "asset_type": asset.asset_type,
        "metadata": asset.asset_metadata or {},
        "uploaded_by": asset.uploaded_by,
        "uploaded_at": asset.uploaded_at.isoformat() if asset.uploaded_at else None,
    }


async def list_question_assets(question_id: str, workspace_id: str, exploration_id: str):
    q = await _get_question_for_workspace(question_id, workspace_id, exploration_id)
    if not q:
        return None
    async with AsyncSession(async_engine) as session:
        stmt = (
            select(QuestionnaireQuestionAsset)
            .where(
                QuestionnaireQuestionAsset.question_id == question_id,
                QuestionnaireQuestionAsset.workspace_id == workspace_id,
                QuestionnaireQuestionAsset.exploration_id == exploration_id,
            )
            .order_by(QuestionnaireQuestionAsset.uploaded_at.desc())
        )
        assets = (await session.execute(stmt)).scalars().all()
        return [asset_to_dict(asset) for asset in assets]


async def delete_question_asset(asset_id: str, workspace_id: str, exploration_id: str):
    async with AsyncSession(async_engine) as session:
        stmt = select(QuestionnaireQuestionAsset).where(
            QuestionnaireQuestionAsset.id == asset_id,
            QuestionnaireQuestionAsset.workspace_id == workspace_id,
            QuestionnaireQuestionAsset.exploration_id == exploration_id,
        )
        asset = (await session.execute(stmt)).scalars().first()
        if not asset:
            return False
        path = Path(asset.filename)
        await session.delete(asset)
        await session.commit()
    try:
        if path.exists() and path.is_file():
            path.unlink()
    except OSError:
        pass
    return True


async def get_full_questionnaire(workspace_id, exploration_id):
    async with AsyncSession(async_engine) as session:
        questionnaire = select(QuestionnaireSection).where(
            QuestionnaireSection.workspace_id == workspace_id,
            QuestionnaireSection.exploration_id == exploration_id
        ).order_by(QuestionnaireSection.order_index, QuestionnaireSection.created_at)
        sections = (await session.execute(questionnaire)).scalars().all()

        result = []
        for sec in sections:
            questionnaireSection = select(QuestionnaireQuestion).where(
                QuestionnaireQuestion.section_id == sec.id
            ).order_by(QuestionnaireQuestion.order_index, QuestionnaireQuestion.created_at)
            questions = (await session.execute(questionnaireSection)).scalars().all()

            result.append(section_model_to_dict(sec, questions))

        return result


async def get_questionnaire_by_simulation(workspace_id: str, exploration_id: str, simulation_id: str):
    """
    Get questionnaires filtered by simulation_id.
    """
    async with AsyncSession(async_engine) as session:
        questionnaire = select(QuestionnaireSection).where(
            QuestionnaireSection.workspace_id == workspace_id,
            QuestionnaireSection.exploration_id == exploration_id,
            QuestionnaireSection.simulation_id == simulation_id
        ).order_by(QuestionnaireSection.order_index, QuestionnaireSection.created_at)
        sections = (await session.execute(questionnaire)).scalars().all()

        result = []
        for sec in sections:
            questionnaireSection = select(QuestionnaireQuestion).where(
                QuestionnaireQuestion.section_id == sec.id
            ).order_by(QuestionnaireQuestion.order_index, QuestionnaireQuestion.created_at)
            questions = (await session.execute(questionnaireSection)).scalars().all()

            result.append(section_model_to_dict(sec, questions))

        return result


async def get_unlinked_questionnaire(workspace_id: str, exploration_id: str) -> list:
    """Sections uploaded before any simulation existed (simulation_id IS NULL) that have questions."""
    async with AsyncSession(async_engine) as session:
        stmt = select(QuestionnaireSection).where(
            QuestionnaireSection.workspace_id == workspace_id,
            QuestionnaireSection.exploration_id == exploration_id,
            QuestionnaireSection.simulation_id.is_(None),
        ).order_by(QuestionnaireSection.order_index, QuestionnaireSection.created_at)
        sections = (await session.execute(stmt)).scalars().all()
        result = []
        for sec in sections:
            q_stmt = select(QuestionnaireQuestion).where(
                QuestionnaireQuestion.section_id == sec.id
            ).order_by(QuestionnaireQuestion.order_index, QuestionnaireQuestion.created_at)
            questions = (await session.execute(q_stmt)).scalars().all()
            result.append(section_model_to_dict(sec, questions))
        return result


async def link_questionnaire_to_simulation(workspace_id: str, exploration_id: str, simulation_id: str) -> None:
    """Attach unlinked questionnaire sections to a simulation so they are discoverable by simulation_id."""
    async with AsyncSession(async_engine) as session:
        await session.execute(
            update(QuestionnaireSection)
            .where(
                QuestionnaireSection.workspace_id == workspace_id,
                QuestionnaireSection.exploration_id == exploration_id,
                QuestionnaireSection.simulation_id.is_(None),
            )
            .values(simulation_id=simulation_id)
        )
        await session.commit()


async def store_parsed_json(workspace_id, objective_id, parsed, user_id, simulation_id=None):
    async with AsyncSession(async_engine) as session:
        sections_saved = []

        for sec_index, sec in enumerate(parsed.get("sections", [])):
            sec_payload = canonicalize_section_payload(sec, sec_index)
            section_title = sec_payload["title"]
            
            existing_section = None
            if simulation_id:
                stmt = select(QuestionnaireSection).where(
                    QuestionnaireSection.workspace_id == workspace_id,
                    QuestionnaireSection.exploration_id == objective_id,
                    QuestionnaireSection.simulation_id == simulation_id,
                    QuestionnaireSection.title == section_title
                )
                result = await session.execute(stmt)
                existing_section = result.scalar_one_or_none()
            
            if existing_section:
                section_obj = existing_section
            else:
                section_obj = QuestionnaireSection(
                    id=generate_id(),
                    workspace_id=workspace_id,
                    exploration_id=objective_id,
                    simulation_id=simulation_id,
                    parent_section_id=sec_payload["parent_section_id"],
                    title=section_title,
                    order_index=sec_payload["order_index"],
                    section_metadata=sec_payload["metadata"],
                    created_by=user_id,
                    created_at=datetime.utcnow()
                )
                session.add(section_obj)
                await session.flush()

            questions_out = []
            for q_index, q in enumerate(sec.get("questions", [])):
                q_payload = build_question_payload(
                    text=q.get("text", ""),
                    options=q.get("options", []),
                    question_type=q.get("question_type") or q.get("type"),
                    question_key=q.get("question_key") or q.get("question_id"),
                    config={
                        k: v
                        for k, v in q.items()
                        if k not in {"text", "options", "question_type", "type", "question_key", "question_id"}
                    },
                    order_index=q.get("order_index", q_index),
                )
                q_obj = QuestionnaireQuestion(
                    id=generate_id(),
                    section_id=section_obj.id,
                    question_key=q_payload["question_key"],
                    question_type=q_payload["question_type"],
                    text=q_payload["text"],
                    options=q_payload["options"],
                    config=q_payload["config"],
                    order_index=q_payload["order_index"],
                    created_by=user_id,
                    created_at=datetime.utcnow()
                )
                session.add(q_obj)
                await session.flush()

                questions_out.append({
                    **question_model_to_dict(q_obj)
                })

            sections_saved.append({
                "id": section_obj.id,
                "title": section_obj.title,
                "questions": questions_out,
                "is_existing_section": existing_section is not None
            })

        await session.commit()
        return sections_saved
