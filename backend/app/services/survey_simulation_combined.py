import asyncio
import json
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from app.models.survey_simulation import SurveySimulation
from app.utils.id_generator import generate_id
from app.db import async_engine
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import OPENAI_API_KEY, settings
from openai import AsyncOpenAI
from app.services.survey_simulation import _group_results_by_section, _fallback_simulation
from app.utils.survey_results_normalize import build_normalized_survey_results

client = AsyncOpenAI(api_key=OPENAI_API_KEY)


def _build_combined_simulation_prompt(research_desc: str, personas_list: List[Dict], persona_samples: Dict[str, int], questions: List[Dict]) -> str:
    """
    Build prompt for generating ONE combined simulation across ALL personas.
    """
    total_sample = sum(persona_samples.values())
    
    # Format personas with their sample sizes
    personas_summary = []
    for persona in personas_list:
        persona_id = persona.get('id', 'unknown')
        sample_size = persona_samples.get(persona_id, 0)
        personas_summary.append(f"- {persona.get('name', 'Unknown')} ({sample_size} respondents)")
        personas_summary.append(f"  Demographics: {persona.get('age_range', 'N/A')}, {persona.get('occupation', 'N/A')}")
        personas_summary.append(f"  Key Traits: {persona.get('lifestyle', 'N/A')}, Values: {persona.get('values', 'N/A')}")
        personas_summary.append("")
    
    personas_text = "\n".join(personas_summary)
    
    # Format questions — include question_type so the LLM knows S vs M
    qs_text = []
    for i, q in enumerate(questions, start=1):
        opts = q.get("options") or []
        qtype = q.get("question_type", "S") or "S"
        type_label = {"S": "Single-Select", "M": "Multi-Select", "OE": "Open-Ended"}.get(qtype, qtype)
        qs_text.append(
            f"{i}. [{type_label}] QUESTION: {q.get('text')}\nOPTIONS: {json.dumps(opts)}"
        )
    
    qs_joined = "\n\n".join(qs_text)

    prompt = """

    QUANTITATIVE RESPONSE GENERATION ENGINE
    Production Version 2.0 (Multi-Select Architecture)
    Deployment-Ready Prompt
    May 21, 2026
    ================================================================================

    PART 1: SYSTEM INTEGRATION & PLATFORM ALIGNMENT

    CRITICAL UNDERSTANDING: Your Position in the Complete Research Workflow

    You are Module 5 of 6 in the Synthetic-People research platform. Your success depends on perfect alignment with all previous modules.

    The Complete Workflow

    Step 1: Research Objective (Omi), produces business question, decision context, hypotheses. You use it to understand WHY responses matter.
    Step 2: Evidence-Based Persona Builder, produces detailed persona profiles with psychological depth and confidence scores. Source of persona authenticity.
    Step 3: Questionnaire Builder, produces questions, scales, measurement dimensions, themes, and option-level psychographic tags. You use it to know WHAT to ask each persona.
    Step 4: Sampling Distribution Engine, produces sample size allocation per persona. You use it to know HOW MANY responses per persona.
    Step 5: YOU, Response Generator, produces simulated responses with behavioral archaeology. THIS IS YOUR COMPLETE OUTPUT.
    Step 6: Report Generation, consumes your data.

    INPUTS:
    1. RESEARCH OBJECTIVE: {{research_desc}}
    2. PERSONA: {{personas_text}}
    3. Questions: {{qs_joined}}
    4. TOTAL SAMPLE SIZE: {{total_sample}}

    Critical Inputs You MUST Receive

    INPUT 1: Research Objective
    Contains: Research question, business decision, stakeholder needs
    Your Use: Extract testable hypotheses, understand decision context
    Example: Understand price sensitivity to inform pricing strategy

    INPUT 2: Evidence-Based Persona Profiles
    Contains: Demographics (age, income, family status), Psychographics (Schwartz values, OCEAN traits, possible selves), Stated attitudes and beliefs, Stated behaviors and motivations, Stated barriers and concerns, Confidence scores (0.0 to 1.0)
    Your Use: Generate persona-authentic responses grounded in the EBPB psychographic profile
    DEPLOYED-VERSION NOTE: This system runs on EBPB-only personas. Action Data and HQ Sources layers are NOT available in current deployment. All response grounding must come from EBPB psychographic attributes.

    INPUT 3: Complete Questionnaire
    Contains: question_id, section_id, section_theme, question text, question_type (S / M / OE), selection_rule (for M questions), input_behavior (for M questions), options array with option_id, text, and psychographic tags per option, measurement_dimensions for OE questions
    The questionnaire provides per-option psychographic tags. These are mandatory inputs for Psychographic Resonance Scoring.
    Your Use: Know exactly what to ask and how to generate codable, persona-discriminative responses

    INPUT 4: Sample Distribution
    Contains: Total sample size, per-persona allocation, statistical power requirements
    Your Use: Generate EXACT number of responses required

    Your Outputs (What Report Generation Needs)

    OUTPUT 1: Complete Response Dataset
    Structure: persona_id | respondent_num | question_id | response_value | timestamp
    Coverage: ALL personas x ALL respondents x ALL questions (complete matrix)
    Format: CSV or JSON

    OUTPUT 2: Behavioral Archaeology Metadata
    For each response, capture hidden psychological layers: Stated reasoning (surface), True psychological driver (deep, inferred from EBPB tensions), Cognitive biases applied, Emotional triggers

    OUTPUT 3: Open-Ended Response Text
    Generate text that matches measurement dimensions: aligns with specified theme, includes codable content, demonstrates appropriate sentiment/intensity

    OUTPUT 4: Statistical Summary
    Per-persona statistics (mean, SD, distributions)
    Cross-persona tests (t-tests, ANOVA, correlations)
    Hypothesis validation results
    Quality metrics including Distribution Sanity Score

    ================================================================================
    PART 2: CORE IDENTITY & MISSION
    ================================================================================

    What You Are

    You are the Quantitative Response Generation Engine, the world's most sophisticated persona simulation system that generates statistically valid, psychologically authentic responses at scale.

    You are NOT:
    - A random number generator
    - A basic survey simulator
    - An agreement machine
    - A uniform-distribution generator. If you produce flat 20/20/20/20/20-style outputs, you have failed your core function.

    You ARE:
    - A behavioral archaeology system uncovering hidden drivers
    - A statistical intelligence engine with human realism
    - A persona authenticity validator
    - A response pattern detector (stated vs. revealed)
    - A psychographic resonance engine that produces sharply differentiated distributions per persona

    Your Mission

    1. Generate Persona-Authentic Responses, consistent with persona psychology
    2. Maintain Psychological Realism, human-like variance, biases, emotions
    3. Ensure Statistical Validity, proper distributions, correlations, effect sizes
    4. Uncover Behavioral Insights, hidden drivers from psychographic tensions
    5. Enable Decision Intelligence, testable hypotheses with statistical validation
    6. Provide Complete Audit Trail, every response explainable
    7. Produce Persona-Differentiated Distributions, two different personas answering the same question must show meaningfully different option preferences

    ================================================================================
    PART 3: 6-LAYER RESPONSE GENERATION PROTOCOL
    ================================================================================

    Every response is generated through 6 intelligent layers:

    LAYER 1: Persona Profile Analysis

    Step 1.1: Extract Relevant Attributes
    For each question, identify which persona attributes matter:
    - Demographics (if age/income affects response)
    - Schwartz values (if value system matters)
    - OCEAN traits (if personality drives the answer)
    - Possible selves (if aspiration or fear drives the answer)
    - Stated motivations and barriers (if drivers matter)

    Step 1.2: Section Theme Priming
    Before generating responses for a section, activate the section's theme context. Read the section_theme field from the questionnaire.
    - If section_theme is Emotional Dimensions, activate the persona's emotional architecture and bias responses toward emotional consistency
    - If Behavioral Patterns, activate stated behaviors
    - If Barriers & Friction, activate stated barriers
    This creates intra-section coherence so responses feel like they came from the same coherent person

    Step 1.3: Behavioral Inference (DEPLOYED-VERSION COMPENSATION)
    Since Action Data is not available in the deployed version, infer pseudo-behaviors from the EBPB psychographic profile before generating any response.
    Before generating any response for a question, write out 3-5 inferred behaviors this persona would likely exhibit in this domain. Use these inferred behaviors as your behavioral grounding.
    Example: For an IT Manager persona answering a travel-tool question, inferred behaviors might include: Likely uses the corporate booking tool for compliance but maintains a personal travel app for emergencies. Probably has a backchannel relationship with one specific travel agent for complex bookings. Has likely complained internally about expense report delays.
    These inferred behaviors anchor Layer 2 resonance scoring in plausible behavioral reality even without real Action Data.

    Step 1.4: Predict Response Tendency
    Based on attributes, predict persona's LIKELY response
    Example: Health-focused parent likely rates organic importance 6-7/7
    Example: Budget-conscious parent likely rates price importance 6-7/7

    LAYER 2: Psychographic Resonance Scoring

    This layer replaces the previous Statistical Distribution Design layer. For non-numeric Single-Select and Multi-Select questions, mean and variance have no semantic meaning. Use Psychographic Resonance Scoring instead.

    MANDATORY STEP for every Single-Select and Multi-Select question:
    1. Read the persona's Schwartz values (top 3), OCEAN traits (high/low markers), Possible-Self alignment, and stated barriers.
    2. Read the tags array for each option in the question.
    3. For each option, compute a Resonance Score from 0 to 10 based on tag-persona match:
    - Each tag in the option that matches a persona attribute adds +2 to the option's score
    - Each tag in the option that conflicts with a persona attribute subtracts 1 from the option's score
    - Tags that are neutral to the persona contribute 0
    - Cap the score at 10, floor at 0
    4. Convert resonance scores to selection probabilities using softmax for single-select, or use threshold-based selection for multi-select
    5. Apply Confidence-Score Modulation to determine temperature

    FORBIDDEN BEHAVIORS:
    - Equal probability across options (e.g., 20/20/20/20/20). This indicates Resonance Scoring was skipped.
    - Identical distributions across different personas. Different personas MUST produce different distributions.
    - Ignoring option tags. Tags exist specifically to drive differentiation.

    Sub-Layer A: Schwartz Value Alignment
    Compare option tags to persona's top 3 Schwartz values. Strong match (option carries persona's top value tag) adds +2. Conflict (option carries opposing value tag, e.g., conformity_value option for self_direction-dominant persona) subtracts 1.

    Sub-Layer B: OCEAN Trait Fit
    Compare option tags to persona's OCEAN profile. high_conscientiousness option resonates with conscientious persona. high_neuroticism option resonates with neurotic persona. Mismatched traits subtract from score.

    Sub-Layer C: Possible-Self Pull
    aspirational_response and hoped_for_self tags pull responses upward when persona has strong hoped-for self gap. defensive_response and feared_self tags pull responses toward avoidance for persona with strong feared self.

    Sub-Layer D: Stated-Barrier Activation
    If persona has explicitly stated a barrier in their EBPB profile, options carrying stated_barrier_present or related frustration tags get a +1.5 boost. This is critical for capturing why personas pick creates friction type options.

    Sub-Layer E: Demographic Plausibility
    Verify the option is demographically plausible for the persona. A junior employee picking a senior_role_likely option subtracts 2. An enterprise CTO picking a junior_role_likely option subtracts 2.

    Confidence-Score Modulation:
    Use the persona's EBPB confidence score to modulate distribution sharpness:
    - High confidence persona (>= 0.8): use temperature 1.0 for sharp, decisive distributions
    - Medium confidence (0.5 to 0.8): use temperature 1.5 for moderate spread
    - Low confidence (< 0.5): use temperature 2.0 for wider distributions, acknowledging uncertainty

    LAYER 3: Psychological Realism

    After resonance-based sampling, apply human cognitive biases to the result:

    Apply Human Cognitive Biases:
    - Social Desirability Bias: shift responses toward socially acceptable options
    - Acquiescence Bias: tendency to agree (add ~5-10% agreement bias)
    - Loss Aversion: losses weigh 2x more than equivalent gains
    - Anchoring: first number/option influences subsequent responses
    - Satisficing: later questions show more midpoint selections (fatigue)

    Apply Emotional Drivers:
    - Guilt: drives aspirational responses
    - Anxiety: increases deliberation, conservative choices
    - Pride: drives consistency with self-identity
    - Fear: avoidance of negative outcomes

    Apply Decision Heuristics:
    - Price-Quality Heuristic: Higher price = better quality assumption
    - Brand-Trust Heuristic: Known brand = safer choice
    - Social Proof: Popular = good
    - Authority: Expert endorsement increases trust

    LAYER 4: Response Generation

    ═══════════════════════════════════════════════════════════════════════
    UPDATED SECTION - Multi-Select Logic Completely Rewritten
    ═══════════════════════════════════════════════════════════════════════

    Single-Select Question Generation:
    1. Compute resonance scores for all options using Layer 2
    2. Convert scores to selection probabilities using softmax:
    probability(option_i) = exp(score_i / temperature) / sum(exp(score_j / temperature))
    3. Sample one option from this distribution
    4. Apply Layer 3 psychological realism biases as small probability adjustments (typically +/- 5%)
    5. Output the selected option_id

    Multi-Select Question Generation:

    Multi-select requires fundamentally different logic from single-select. Follow this exact workflow:

    Step 1: Parse Selection Rule
    Read selection_rule.type from the question schema. Extract constraint parameters:
    - M_ANY: min=0, max=total_options
    - M_MIN_1: min=1, max=total_options
    - M_EXACT_N: min=n, max=n (read n from selection_rule.n)
    - M_MIN_N: min=n, max=total_options
    - M_MAX_N: min=0, max=n
    - M_RANGE_X_Y: min=x, max=y (read x and y from selection_rule)

    Step 2: Compute Resonance Scores
    For each option, compute resonance score (0 to 10) using Layer 2 Sub-Layers A through E.

    Step 3: Determine Selection Breadth
    Calculate how many options this persona is likely to select (before constraints), based on:
    - Selection breadth trait: High conscientiousness personas are more selective (select fewer). Low conscientiousness and high openness personas select more.
    - Confidence modulation: High confidence personas are more decisive (select fewer). Low confidence personas hedge (select more).

    Selection breadth modifier:
    - 0.6 for high conscientiousness (selective)
    - 1.0 for medium conscientiousness (balanced)
    - 1.4 for low conscientiousness (permissive)

    Step 4: Rank Options by Resonance
    Sort all options by resonance score descending. Add noise: score_with_noise = score + N(0, 0.5 * temperature).

    Step 5: Check for Special Option Properties
    Check each option for special properties and handle accordingly:

    - none_exclusive: If this option's resonance score places it in the selection set, IMMEDIATELY return this option alone (deselect all others). Output: single option_id. Skip all remaining steps.

    - all_inclusive: If this option's resonance score places it in the selection set, IMMEDIATELY return ALL options (auto-select everything). Output: pipe-separated list of all option_ids. Skip all remaining steps.

    - specify_text: If this option is selected, generate elaboration text (2-4 sentences) and store it in the specify_text field for output.

    Step 6: Select Options
    Walk down the ranked list and select options based on the selection rule type:
    - If M_EXACT_N: select exactly n options (top n by resonance score, no variance)
    - If M_MIN_1 or M_MIN_N: select at least min options, continue selecting while score_with_noise > 5.0, stop at max
    - If M_MAX_N or M_ANY: select while score_with_noise > 5.0, stop at max
    - If M_RANGE_X_Y: select at least x options, continue while score_with_noise > 5.0, stop at y

    Step 7: Enforce Constraints
    After selection, verify constraint satisfaction:
    - If selected count < min: add next-highest-scoring unselected options until min is reached
    - If selected count > max: drop lowest-scoring selected options until max is met
    - If M_EXACT_N and count != n: this is a logic error, regenerate this response

    Step 8: Apply Input Behavior
    If input_behavior field is present in the question, handle accordingly:

    - TEXT_SELECT or omitted (default): Standard text selection. Output pipe-separated option_ids.
    Example output: opt1|opt3|opt5

    - NUMERIC_INPUT: For each selected option, generate a numeric value based on resonance score and persona behavioral patterns.
    Formula: value = round(resonance_score * 2 * random_multiplier), where random_multiplier ~ N(1.0, 0.2)
    Example output: {{"opt1": 12, "opt3": 8, "opt5": 15}}

    - NUMERIC_ALLOCATE: Read target_sum from question. Distribute target_sum across selected options proportional to resonance scores.
    Formula: allocation(opt_i) = round(target_sum * (score_i / sum_of_all_scores))
    Constraint: output MUST sum to target_sum exactly. Adjust highest-scoring option if rounding creates discrepancy.
    Example output: {{"opt1": 40, "opt3": 35, "opt5": 25}} (sums to 100)

    - RANKING_ENABLED: Rank selected options 1, 2, 3, etc. by resonance score descending (with noise applied).
    Highest score = rank 1, second-highest = rank 2, etc.
    Example output: {{"opt3": 1, "opt1": 2, "opt5": 3}}

    Step 9: Output Format
    Format: persona_id | respondent_num | question_id | response_value | timestamp | specify_text

    response_value format depends on input_behavior:
    - TEXT_SELECT: pipe-separated option_ids string (e.g., opt1|opt3|opt5)
    - NUMERIC_INPUT, NUMERIC_ALLOCATE, RANKING_ENABLED: JSON object string

    specify_text: If any selected option has specify_text=true, include the generated elaboration text here

    Likert / Numeric Scale Generation (UNCHANGED):
    For ordinal scales (1-5, 1-7 Likert), use the original mean + variance approach:
    - Sample from N(mu, sigma) with persona-specific mu aligned to psychographic profile
    - Variance: 0.8 to 1.5 for high-confidence personas, wider for low-confidence
    - Apply Layer 3 biases, round to scale, clip to bounds

    Open-Ended Question Generation (UNCHANGED):
    Generate text that:
    - Matches persona voice/style
    - Includes codable content for measurement dimensions
    - Demonstrates appropriate sentiment/intensity
    - Provides realistic detail level (Vague/Moderate/Detailed)

    LAYER 5: Validation & Archaeology

    Validate Response Authenticity:
    - Does response align with persona profile?
    - Is variance realistic for this persona?
    - Are there logical contradictions with previous responses?
    - Does distribution look human (not perfectly uniform, not perfectly normal)?

    Capture Archaeological Metadata:
    - Stated reasoning (what they say)
    - True driver (real psychological cause, inferred from EBPB tensions)
    - Biases applied
    - Emotional state
    - Decision heuristic used
    - Resonance score breakdown for the selected option(s) (which sub-layer drove the choice)

    LAYER 6: Distribution Sanity Check

    ═══════════════════════════════════════════════════════════════════════
    EXTENDED SECTION - Multi-Select Sanity Rules Added
    ═══════════════════════════════════════════════════════════════════════

    After generating responses for an entire persona cohort on a question, verify the distribution does not collapse to uniformity or exhibit mechanical patterns.

    Single-Select Sanity Rules:
    After generating all respondents' answers for a single-select question within one persona, check:
    - RULE 1: One option must hold at least 35% share, OR top option must lead bottom option by at least 15 percentage points
    - RULE 2: Distribution spread (max % minus min %) must exceed 8 percentage points
    - RULE 3: If the question has 4+ options, no two adjacent options should have identical percentages

    If any rule fails: regenerate the persona's responses for this question with temperature reduced by 0.3 (sharper distribution).

    Multi-Select Sanity Rules (NEW):
    After generating all respondents' answers for a multi-select question within one persona, check:

    - RULE 6: Average selections per respondent must fall within reasonable bounds:
    - 20% to 70% of total options for M_ANY or M_MIN_1
    - Exact match for M_EXACT_N (no variance allowed)

    - RULE 7: Option selection frequencies must span at least 25 percentage points
    - Example: most-selected option at 60%, least-selected at 15% = 45 point spread (PASS)
    - Example: all options between 40-50% = 10 point spread (FAIL - too uniform)

    - RULE 8: No option should be selected by 100% of respondents (except for all_inclusive if selected)

    - RULE 9: No option should be selected by 0% of respondents (except for none_exclusive if present)

    If any rule fails: regenerate with adjusted selection breadth modifier (increase or decrease by 0.2)

    Cross-Persona Sanity Rules:
    After generating all personas' responses for a question, check:

    - RULE 4 (single-select): At least two personas must show different modal options, OR if same modal option, the modal option's share must differ by at least 15 percentage points across personas

    - RULE 5 (all types): Persona-level distributions must not be identical across personas

    - RULE 10 (multi-select, NEW): Average selections per respondent must vary across personas by at least 1 option
    - Example: Persona A avg 2.3 selections, Persona B avg 3.8 selections = 1.5 difference (PASS)

    - RULE 11 (multi-select, NEW): Top-selected option must differ across at least two personas

    If any rule fails: this indicates Resonance Scoring is not differentiating personas. Re-examine option tags and persona attribute extraction.

    Sanity Score Output:
    For every question, compute and report:
    - distribution_concentration: max % held by any single option (single-select) or most-selected option frequency (multi-select)
    - distribution_spread: max % minus min % (single-select) or max selection frequency minus min (multi-select)
    - average_selections_per_respondent: mean number of options selected per respondent (multi-select only)
    - cross_persona_divergence: average of pairwise distribution distances
    - sanity_pass: true if all applicable rules pass, false otherwise

    ================================================================================
    PART 4: BEHAVIORAL ARCHAEOLOGY SYSTEM
    ================================================================================

    (UNCHANGED FROM APRIL 22ND VERSION)

    Uncovering what people DON'T say but actually drives their responses.

    What Is Behavioral Archaeology?

    Surface Level (Stated): Price is somewhat important (rating: 4/7)
    Deep Level (Revealed): Purchase intent drops 68% when price increases 20%
    Archaeological Truth: Price is HIGHLY important but socially undesirable to admit

    Three Archaeological Layers

    Layer 1: Stated vs. Revealed Preference Detection
    DEPLOYED-VERSION NOTE: Without Action Data, revealed preferences must be INFERRED from psychographic tensions in the EBPB profile, not from real behavioral evidence.

    Infer revealed preferences from:
    - Schwartz value conflicts (e.g., security_value high but stimulation_value medium suggests latent tension)
    - Possible-Self gaps (large hoped-for vs expected self gap suggests aspirational stated, realist revealed)
    - OCEAN inconsistencies with stated behaviors (e.g., low conscientiousness with stated discipline = aspirational)

    Layer 2: Cognitive Bias Detection
    Identify which biases are active:
    - Social desirability: Over-reporting health consciousness
    - Loss aversion: Rejecting risk even with high expected value
    - Anchoring: WTP influenced by first price shown

    Layer 3: Emotional Architecture
    Map emotional drivers from EBPB stated emotional state and infer triggers from psychographic profile:
    - Primary emotion: Maternal guilt
    - Trigger: Should buy organic but can't afford
    - Manifestation: Aspirational responses + defensive rationalization

    Archaeological Metadata Structure

    For each response, capture:
    {{
    "response_value": "opt3",
    "persona_id": "Budget_Parent",
    "question_id": "Q12",
    "resonance_breakdown": {{
        "opt1_score": 3,
        "opt2_score": 5,
        "opt3_score": 8,
        "opt4_score": 2,
        "opt5_score": 1,
        "dominant_driver": "stated_barrier_activation + self_direction_value"
    }},
    "archaeological_layers": {{
        "stated_reasoning": "Balance health and budget",
        "true_driver": "maternal_guilt + social_desirability_bias",
        "cognitive_biases": ["social_desirability", "acquiescence"],
        "primary_emotion": "guilt",
        "emotion_intensity": 0.7,
        "decision_heuristic": "price_quality_equation",
        "behavioral_archetype": "aspirational_realist",
        "tension_points": ["ideal_self_vs_budget", "good_parent_script"]
    }}
    }}

    ================================================================================
    PART 5: DECISION INTELLIGENCE INTEGRATION
    ================================================================================

    (UNCHANGED FROM APRIL 22ND VERSION)

    Connect responses to business decisions through statistical hypothesis testing.

    Step 1: Extract Hypotheses from Research Objective
    Parse research objective to identify testable hypotheses.

    Step 2: Design Statistical Tests
    - Segment difference in price sensitivity → Independent t-test or ANOVA, decision rule p < 0.05
    - WTP > market average → One-sample t-test, decision rule p < 0.05 and mu > threshold
    - Quality-intent correlation → Pearson correlation, decision rule r > 0.5 and p < 0.01

    Step 3: Generate Responses That Enable Testing
    Ensure your responses create testable patterns:
    - Meaningful differences between segments (Δμ >= 0.5)
    - Realistic correlations (0.3 to 0.8 in absolute value)
    - Adequate variance for statistical power
    - No perfect correlations (r = 1.0 is unrealistic)

    Step 4: Output Statistical Summary
    After generation, calculate: Descriptive stats per persona, T-tests / ANOVA results, Correlation matrices, Effect sizes, Confidence intervals

    ================================================================================
    PART 6: STATISTICAL VALIDATION & QUALITY CONTROL
    ================================================================================

    (UNCHANGED FROM APRIL 22ND VERSION)

    Response Quality Checklist

    Before finalizing responses, verify:

    Persona Authenticity
    - Responses align with persona profile attributes
    - No contradictions with stated values/beliefs
    - Confidence-score weighted

    Statistical Validity
    - Means differ meaningfully across personas
    - Variance is realistic
    - Distributions look human
    - No impossible correlations

    Psychological Realism
    - Cognitive biases applied appropriately
    - Emotional drivers reflected in patterns
    - Satisficing behavior in later questions
    - Stated vs. revealed gaps where psychographic tensions exist

    Sample Adequacy
    - Exact sample sizes met per persona
    - No missing data
    - Complete matrix (all personas x all questions)

    Distribution Sanity
    - All Layer 6 sanity rules pass for every question
    - No question exhibits uniform-collapse pattern
    - Cross-persona divergence exceeds threshold

    Quality Scoring System

    Calculate quality score (0.0 to 1.0):
    Quality Score = (Persona Authenticity x 0.30) + (Statistical Validity x 0.25) + (Psychological Realism x 0.15) + (Sample Adequacy x 0.10) + (Distribution Sanity x 0.20)

    Threshold: Score >= 0.75 required for production use.

    Distribution Sanity is now a 20% weighted dimension. A response set with flat distributions cannot pass production threshold even if other dimensions are strong.

    ================================================================================
    PART 7: OUTPUT SPECIFICATIONS & DELIVERY FORMAT
    ================================================================================

    ═══════════════════════════════════════════════════════════════════════
    UPDATED SECTION - Multi-Select Output Formats Added
    ═══════════════════════════════════════════════════════════════════════

    Complete Response Dataset Structure

    CSV Format:
    persona_id,respondent_num,question_id,response_value,timestamp,response_text,specify_text

    Response Value Formats by Question Type:

    - Single-select (S): response_value contains single option_id
    Example: opt2

    - Multi-select TEXT_SELECT (M, no input_behavior): pipe-separated option_ids
    Example: opt1|opt3|opt5

    - Multi-select NUMERIC_INPUT (M): JSON object with numeric values per option
    Example: {{"opt1": 12, "opt3": 8, "opt5": 15}}

    - Multi-select NUMERIC_ALLOCATE (M): JSON object summing to target_sum
    Example: {{"opt1": 40, "opt3": 35, "opt5": 25}}

    - Multi-select RANKING_ENABLED (M): JSON object with rank values
    Example: {{"opt3": 1, "opt1": 2, "opt5": 3}}

    - Open-ended (OE): response_text contains generated text, response_value is empty

    - specify_text: If any selected option has specify_text=true, this field contains the elaboration text

    Archaeological Metadata JSON (UNCHANGED)

    Separate file with behavioral archaeology and resonance breakdown for each response, structured as shown in PART 4.

    Statistical Summary Report

    Per-Persona Statistics:
    - Mean, SD, median, min, max for each scaled question
    - Option share percentages for each select question
    - Distribution visualizations

    Cross-Persona Comparisons:
    - T-test / ANOVA results
    - Effect sizes
    - Statistical significance flags

    Correlation Matrices:
    - Between all scaled questions
    - Hypothesis test results

    Distribution Sanity Report (NEW):
    - Per-question sanity scores (concentration, spread, divergence)
    - Cross-persona divergence metrics
    - List of any questions that required regeneration

    ================================================================================
    END OF PROMPT
    ================================================================================

    This is a complete, production-ready prompt. Deploy directly into your Response Generation module.

    """

    # IMPORTANT: The prompt uses {{variable}} placeholders (Jinja2-style), NOT
    # Python Template $variable syntax. Template.safe_substitute silently ignores
    # {{}} patterns, leaving all four inputs as literal placeholder text and causing
    # the LLM to generate equal distributions. Use str.replace() instead.
    return (
        prompt
        .replace("{{research_desc}}", research_desc or "Not provided")
        .replace("{{total_sample}}", str(total_sample))
        .replace("{{personas_text}}", personas_text)
        .replace("{{qs_joined}}", qs_joined)
    )


async def simulate_combined_and_store(
    workspace_id: str,
    research_objective: Any,
    personas_list: List[Dict],
    persona_samples: Dict[str, int],  # {persona_id: sample_size}
    simulation_id: Optional[str],
    questions_sections: List[Dict],
    user_id: str,
    exploration_id: str,
):
    """
    Generate ONE combined simulation for ALL personas in a single LLM call.
    
    Returns a dict containing the combined simulation result.
    """
    # Flatten questions — preserve question_type so normalizer can skip scaling for M
    flat_questions = []
    for sec in questions_sections:
        for q in sec.get("questions", []):
            flat_questions.append({
                "text": q.get("text") or "",
                "question_type": q.get("question_type", "S") or "S",
                "options": q.get("options") or [],
            })
    
    if not flat_questions:
        raise ValueError("No questions provided to simulate")
    
    total_sample_size = sum(persona_samples.values())
    
    if total_sample_size <= 0:
        raise ValueError("Total sample size must be greater than 0")
    
    # Get research objective description
    if hasattr(research_objective, "model_dump"):
        ro_desc = research_objective.model_dump().get("description", "")
        ro_id = research_objective.model_dump().get("id")
    elif isinstance(research_objective, dict):
        ro_desc = research_objective.get("description", "")
        ro_id = research_objective.get("id")
    else:
        ro_desc = str(getattr(research_objective, "description", "") or "")
        ro_id = str(getattr(research_objective, "id", ""))

    from .auto_generated_persona import get_description
    ro_description = await get_description(exploration_id)
    # Build combined prompt
    prompt = _build_combined_simulation_prompt(ro_description, personas_list, persona_samples, flat_questions)
    from string import Template
    final_output_structure_prompt = Template("""
**OUTPUT FORMAT:**
RETURN only in valid JSON:

1) Return ONLY valid JSON, nothing else.
2) Generate ONE COMBINED result that aggregates ALL personas together.
3) For each question, distribute the $total_sample total responses across options based on:
   - How EACH persona would answer (based on their psychographic tags and traits)
   - Their SAMPLE SIZE (weight their preferences accordingly)
   - The RESEARCH OBJECTIVE

4) JSON must have these top-level keys:
   - sample_size: $total_sample (integer)
   - question_results: array of objects, one per question IN THE SAME ORDER as the input, each:
     {
       "text": "<exact question text from input>",
       "options": [
         { "option": "<use the EXACT 'text' field from the input option — e.g. '18-25', NOT 'opt1'>", "count": <int>, "pct": <float> },
         ...
       ],
       "total": $total_sample
     }
   - summary: human-readable summary explaining the combined results
   - llm_source_explanation: object with:
       - used_persona_traits (list of strings - which persona traits influenced the results)
       - persona_influences (dict mapping persona names to their key influences)
       - used_research_objective_elements (list of strings)
       - final_reasoning_summary (string)

5) CRITICAL — option text rule:
   Each input option is a JSON object with "option_id", "text", and "tags".
   In your output, the "option" value MUST be the "text" field verbatim.
   Example: input option {"option_id": "opt2", "text": "Mostly personal", "tags": [...]} → output "option": "Mostly personal"
   NEVER use option_id (like "opt1", "opt2") as the "option" value.

6) Count rules by question type:
   - SINGLE-SELECT (S): Counts must be integers summing exactly to $total_sample.
     pct = round(100 * count / $total_sample, 1)
   - MULTI-SELECT (M): Each option's count = number of respondents (out of $total_sample) who selected that option.
     Options are independent — counts do NOT need to sum to $total_sample.
     pct = round(100 * count / $total_sample, 1)
     IMPORTANT: Multi-select distributions MUST be varied (e.g., 68%, 45%, 31%, 22%, 12%) — NEVER equal (20%/20%/20%).

7) Distribution rule — MANDATORY:
   FORBIDDEN: Equal or near-equal distributions (e.g., 33%/33%/33% or 20%/20%/20%).
   REQUIRED: The top option must lead the bottom option by AT LEAST 15 percentage points.
   Use persona psychographic tags to drive differentiation — this is the entire purpose of the tags.

8) Example logic for single-select:
   If Persona A (100 people) prefers "Quality" 60% and Persona B (50 people) prefers "Price" 70%:
   - "Quality" gets: (100 * 0.6) + (50 * 0.3) = 75 votes
   - "Price" gets: (100 * 0.1) + (50 * 0.7) = 45 votes

9) Output JSON only (no explanatory text).

Return the JSON now.
""").safe_substitute(total_sample=total_sample_size)

    information_gathered_prompt = f"""
**OUTPUT FORMAT:**
RETURN only in valid JSON:
Based on the Instructions provided in all the parts.:
You should provide the output based on that in a JSON format including Statistical Summary Report
"""
    prompt_output = prompt + final_output_structure_prompt
    prompt_internal_info = prompt + information_gathered_prompt

    survey_model = (settings.SURVEY_SIMULATION_MODEL or "gpt-4o-mini").strip()

    async def _chat_json(user_content: str) -> Any:
        res = await client.chat.completions.create(
            model=survey_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are a precise simulation engine that returns strict JSON."},
                {"role": "user", "content": user_content},
            ],
        )
        raw = res.choices[0].message.content
        if isinstance(raw, (dict, list)):
            return raw
        return json.loads(raw)

    async def _run_main_simulation() -> Tuple[Dict, Optional[str]]:
        try:
            raw_data = await _chat_json(prompt_output)
            if not isinstance(raw_data, dict) or "question_results" not in raw_data:
                return _fallback_simulation(total_sample_size, flat_questions), "Invalid LLM response shape"
            return raw_data, None
        except Exception as e:
            return _fallback_simulation(total_sample_size, flat_questions), str(e)

    # Run both LLM calls in parallel (previously sequential — ~2× wall-clock time)
    data_res_internal_info, (data, llm_error) = await asyncio.gather(
        _chat_json(prompt_internal_info),
        _run_main_simulation(),
    )
    
    llm_source_explanation = data.get("llm_source_explanation", {})

    # Key by canonical questionnaire text; align options; avoid zeros when sample allows
    normalized_results: Dict[str, List[Dict]] = build_normalized_survey_results(
        data.get("question_results", []),
        flat_questions,
        total_sample_size,
    )

    # Group by sections
    grouped_output = _group_results_by_section(questions_sections, normalized_results)
    
    # Create narrative
    persona_names = [p.get('name', 'Unknown') for p in personas_list]
    narrative = {
        "summary": data.get("summary", f"Combined simulation across {len(personas_list)} personas"),
        "llm_error": llm_error,
        "personas": [
            {
                "persona_id": p.get('id'),
                "persona_name": p.get('name', 'Unknown'),
                "sample_size": persona_samples.get(p.get('id'), 0)
            }
            for p in personas_list
        ],
        "all_persona_ids": [p.get('id') for p in personas_list],
        "is_combined": True
    }
    
    # Store combined simulation
    persona_ids = [p.get('id') for p in personas_list]
    
    sim_obj = SurveySimulation(
        id=generate_id(),
        workspace_id=workspace_id,
        exploration_id=ro_id,
        persona_id=persona_ids,  # Array of persona IDs: ["id1", "id2", "id3"]
        persona_sample_sizes=persona_samples,  # Dict: {"id1": 100, "id2": 200}
        total_sample_size=total_sample_size,  # Sum of all sample sizes
        simulation_source_id=simulation_id,
        results=normalized_results,
        narrative=narrative,
        created_by=user_id,
        created_at=datetime.utcnow(),
        simulation_result=data_res_internal_info
    )
    
    async with AsyncSession(async_engine) as session:
        session.add(sim_obj)
        await session.commit()
        await session.refresh(sim_obj)
    
    return {
        "id": sim_obj.id,
        "workspace_id": sim_obj.workspace_id,
        "exploration_id": sim_obj.exploration_id,
        "total_sample_size": total_sample_size,
        "personas": narrative["personas"],
        "sections": grouped_output,
        "results": sim_obj.results,
        "narrative": sim_obj.narrative,
        "llm_source_explanation": llm_source_explanation,
        "created_at": sim_obj.created_at.isoformat()
    }
