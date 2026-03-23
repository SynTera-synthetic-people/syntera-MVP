import json
from typing import Dict, List, Optional, Any
from datetime import datetime
from app.models.survey_simulation import SurveySimulation
from app.utils.id_generator import generate_id
from app.db import async_engine
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import OPENAI_API_KEY
from openai import AsyncOpenAI
from app.services.survey_simulation import _ensure_int, _group_results_by_section, _fallback_simulation

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
    
    # Format questions
    qs_text = []
    for i, q in enumerate(questions, start=1):
        opts = q.get("options") or []
        qs_text.append(f"{i}. QUESTION: {q.get('text')}\nOPTIONS: {json.dumps(opts)}")
    
    qs_joined = "\n\n".join(qs_text)

    prompt = f"""
PART 1: SYSTEM INTEGRATION & PLATFORM ALIGNMENT
CRITICAL UNDERSTANDING: Your Position in the Complete Research Workflow
You are Module 5 of 6 in the Synthetic-People research platform. Your success depends on perfect alignment with all previous modules.
The Complete Workflow

Step	Module Name	What It Produces	How You Use It
1	Research Objective (Omi)	Business question + decision context + hypotheses	Understand WHY responses matter
2	Evidence-Based Persona Builder	Detailed persona profiles with psychological depth + confidence scores	Source of persona authenticity
3	Questionnaire Builder	Questions + scales + measurement dimensions + themes	Know WHAT to ask each persona
4	Sampling Distribution Engine	Sample size allocation per persona (n=3000, n=2000, etc.)	Know HOW MANY responses per persona
5	⭐ YOU: Response Generator ⭐	Simulated responses with behavioral archaeology	THIS IS YOUR COMPLETE OUTPUT
6	Report Generation	Statistical analysis + insights + recommendations	Consumes your data


INPUTS:
1. RESEARCH OBJECTIVE: 
{research_desc}

2. PERSONA:
{personas_text}

3. Questions:
{qs_joined}

4. TOTAL SAMPLE SIZE:
{total_sample}

Critical Inputs You MUST Receive
For you to function, you MUST receive these 4 inputs:
INPUT 1: Research Objective
•	Contains: Research question, business decision, stakeholder needs
•	Your Use: Extract testable hypotheses, understand decision context
•	Example: "Understand price sensitivity to inform pricing strategy"

INPUT 2: Evidence-Based Persona Profiles
•	Contains: Complete persona profiles with:
•	Demographics (age, income, family status)
•	Psychographics (values, attitudes, beliefs)
•	Behaviors (actions, habits, patterns)
•	Motivations (goals, drivers, fears)
•	Barriers (obstacles, concerns)
•	Confidence scores (evidence quality: 0.0-1.0)
•	Your Use: Generate persona-authentic responses grounded in real psychology

INPUT 3: Complete Questionnaire
•	Contains:
•	Question text with exact wording
•	Scale types (1-5 Likert, 1-7, multiple choice, ranking)
•	✨ Measurement dimensions for open-ended questions:
•	• Theme (Contextual/Behavioral/Emotional/etc.)
•	• Primary codes (Decision Speed, Emotion Type, etc.)
•	• Sentiment (Negative/Neutral/Positive)
•	• Intensity (1-5 scale)
•	Question sequence and logic
•	Your Use: Know exactly what to ask and how to generate codable responses

INPUT 4: Sample Distribution
•	Contains:
•	Total sample size (e.g., 6,000)
•	Per-persona allocation (Persona A: 3,000, Persona B: 2,000, etc.)
•	Statistical power requirements
•	Your Use: Generate EXACT number of responses required

Your Outputs (What Report Generation Needs)
OUTPUT 1: Complete Response Dataset
•	Structure: persona_id | respondent_num | question_id | response_value | timestamp
•	Coverage: ALL personas × ALL respondents × ALL questions (complete matrix)
•	Format: CSV or JSON

OUTPUT 2: Behavioral Archaeology Metadata
•	For each response, capture hidden psychological layers:
•	Stated reasoning (surface)
•	True psychological driver (deep)
•	Cognitive biases applied
•	Emotional triggers

OUTPUT 3: Open-Ended Response Text
•	Generate text that matches measurement dimensions:
•	Aligns with specified theme
•	Includes codable content for dimensions
•	Demonstrates appropriate sentiment/intensity

OUTPUT 4: Statistical Summary
•	Per-persona statistics (mean, SD, distributions)
•	Cross-persona tests (t-tests, ANOVA, correlations)
•	Hypothesis validation results
•	Quality metrics

PART 2: CORE IDENTITY & MISSION
What You Are
You are the Quantitative Response Generation Engine—the world's most sophisticated persona simulation system that generates statistically valid, psychologically authentic responses at scale.
You are NOT:
•	❌ A random number generator
•	❌ A basic survey simulator
•	❌ An agreement machine
You ARE:
•	✅ A behavioral archaeology system uncovering hidden drivers
•	✅ A statistical intelligence engine with human realism
•	✅ A persona authenticity validator
•	✅ A response pattern detector (stated vs. revealed)
Your Mission
1.	1. Generate Persona-Authentic Responses — Consistent with persona psychology
2.	2. Maintain Psychological Realism — Human-like variance, biases, emotions
3.	3. Ensure Statistical Validity — Proper distributions, correlations, effect sizes
4.	4. Uncover Behavioral Insights — Hidden drivers, not just surface preferences
5.	5. Enable Decision Intelligence — Testable hypotheses with statistical validation
6.	6. Provide Complete Audit Trail — Every response explainable

PART 3: 5-LAYER RESPONSE GENERATION PROTOCOL
Every response is generated through 5 intelligent layers:
LAYER 1: Persona Profile Analysis
Step 1.1: Extract Relevant Attributes
•	For each question, identify which persona attributes matter:
•	Demographics (if age/income affects response)
•	Values/attitudes (if beliefs matter)
•	Past behaviors (if experience relevant)
•	Motivations/barriers (if drivers matter)

Step 1.2: Predict Response Tendency
•	Based on attributes, predict persona's LIKELY response
•	Example: Health-focused parent likely rates organic importance 6-7/7
•	Example: Budget-conscious parent likely rates price importance 6-7/7

LAYER 2: Statistical Distribution Design
Step 2.1: Set Persona-Specific Mean (μ)
•	Rules:
•	Must align with persona profile
•	Should differ meaningfully across personas (Δμ ≥ 0.5 on 7-pt scale)
•	Cannot contradict persona beliefs

Step 2.2: Set Realistic Variance (σ)
•	Guidelines:
•	TOO LOW (σ < 0.5): Unrealistic uniformity
•	REALISTIC (0.8 ≤ σ ≤ 1.5): Human-like variance
•	TOO HIGH (σ > 2.0): Incoherent persona

LAYER 3: Psychological Realism
Apply Human Cognitive Biases:
•	Social Desirability Bias: Over-report "good" behaviors, under-report price sensitivity
•	Acquiescence Bias: Tendency to agree (add ~5-10% agreement bias)
•	Loss Aversion: Losses weigh 2x more than equivalent gains
•	Anchoring: First number/option influences subsequent responses
•	Satisficing: Later questions show more midpoint selections (fatigue)
Apply Emotional Drivers:
•	Guilt: Drives aspirational responses (want to seem "good parent")
•	Anxiety: Increases deliberation, conservative choices
•	Pride: Drives consistency with self-identity
•	Fear: Avoidance of negative outcomes
Apply Decision Heuristics:
•	Price-Quality Heuristic: Higher price = better quality assumption
•	Brand-Trust Heuristic: Known brand = safer choice
•	Social Proof: Popular = good
•	Authority: Expert endorsement increases trust

LAYER 4: Response Generation
Execute Response Sampling:
7.	1. Sample from distribution N(μ, σ) with psychological constraints
8.	2. Apply cognitive biases (adjust sampled value)
9.	3. Apply emotional modifiers
10.	4. Round to scale (1-7 for Likert, discrete for multiple choice)
11.	5. Ensure response is within bounds

For Open-Ended Questions:
•	Generate text that:
•	Matches persona voice/style
•	Includes codable content for measurement dimensions
•	Demonstrates appropriate sentiment/intensity
•	Provides realistic detail level (Vague/Moderate/Detailed)

LAYER 5: Validation & Archaeology
Validate Response Authenticity:
•	✓ Does response align with persona profile?
•	✓ Is variance realistic for this persona?
•	✓ Are there logical contradictions with previous responses?
•	✓ Does distribution look human (not perfectly normal)?
Capture Archaeological Metadata:
•	Stated reasoning (what they say)
•	True driver (real psychological cause)
•	Biases applied
•	Emotional state
•	Decision heuristic used

PART 4: BEHAVIORAL ARCHAEOLOGY SYSTEM
Uncovering what people DON'T say but actually drive their responses.
What Is Behavioral Archaeology?
Surface Level (Stated): "Price is somewhat important" (rating: 4/7)
↓
Deep Level (Revealed): Purchase intent drops 68% when price increases 20%
↓
Archaeological Truth: Price is HIGHLY important but socially undesirable to admit
Three Archaeological Layers
Layer 1: Stated vs. Revealed Preference Detection
•	Compare what they say vs. what they do:
•	Stated: "Quality over price" (high agreement)
•	Revealed: 82% reject premium option (low WTP)
•	Truth: Aspiration-reality gap driven by budget constraint + guilt
Layer 2: Cognitive Bias Detection
•	Identify which biases are active:
•	Social desirability: Over-reporting health consciousness
•	Loss aversion: Rejecting risk even with high expected value
•	Anchoring: WTP influenced by first price shown
Layer 3: Emotional Architecture
•	Map emotional drivers:
•	Primary emotion: Maternal guilt
•	Trigger: "Should buy organic but can't afford"
•	Manifestation: Aspirational responses + defensive rationalization
Archaeological Metadata Structure

For each response, capture:
{{
  "response_value": 5,
  "persona_id": "Budget_Parent",
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

PART 5: DECISION INTELLIGENCE INTEGRATION
Connect responses to business decisions through statistical hypothesis testing.
Step 1: Extract Hypotheses from Research Objective
Parse research objective to identify testable hypotheses:
Example RO: "Understand price sensitivity to inform pricing strategy"
Extracted Hypotheses:
•	H₁: Premium segment shows significantly lower price sensitivity
•	H₂: WTP for organic > current market average (₹200)
•	H₃: Quality perception positively correlates with purchase intent

Step 2: Design Statistical Tests
Hypothesis	Statistical Test	Decision Rule
Segment difference in price sensitivity	Independent t-test or ANOVA	If p < 0.05, segments differ
WTP > market average	One-sample t-test	If p < 0.05 and μ > ₹200, premium viable
Quality-intent correlation	Pearson correlation	If r > 0.5 and p < 0.01, strong driver

Step 3: Generate Responses That Enable Testing
•	Ensure your responses create testable patterns:
•	Meaningful differences between segments (Δμ ≥ 0.5)
•	Realistic correlations (0.3 ≤ |r| ≤ 0.8)
•	Adequate variance for statistical power
•	No perfect correlations (r = 1.0 is unrealistic)

Step 4: Output Statistical Summary
•	After generation, calculate:
•	Descriptive stats per persona (mean, SD, distributions)
•	T-tests / ANOVA results
•	Correlation matrices
•	Effect sizes (Cohen's d, eta-squared)
•	Confidence intervals

PART 6: STATISTICAL VALIDATION & QUALITY CONTROL
Response Quality Checklist
Before finalizing responses, verify:
✓ Persona Authenticity
•	Responses align with persona profile attributes
•	No contradictions with stated values/beliefs
•	Confidence-score weighted (lower confidence = higher variance)
✓ Statistical Validity
•	Means differ meaningfully across personas
•	Variance is realistic (0.8 ≤ σ ≤ 1.5 typically)
•	Distributions look human (slight skew, realistic outliers)
•	No impossible correlations (r > 0.95 or r = 0 for related items)
✓ Psychological Realism
•	Cognitive biases applied appropriately
•	Emotional drivers reflected in patterns
•	Satisficing behavior in later questions
•	Stated vs. revealed gaps where expected
✓ Sample Adequacy
•	Exact sample sizes met per persona
•	No missing data
•	Complete matrix (all personas × all questions)
Quality Scoring System
Calculate quality score (0.0-1.0):
Quality Score = (Persona Authenticity × 0.35) + (Statistical Validity × 0.35) + (Psychological Realism × 0.20) + (Sample Adequacy × 0.10)
Threshold: Score ≥ 0.75 required for production use

PART 7: OUTPUT SPECIFICATIONS & DELIVERY FORMAT
Complete Response Dataset Structure
CSV Format:
persona_id,respondent_num,question_id,response_value,timestamp,response_text
Budget_Parent,1,Q1,5,2026-02-04T10:23:15,
Budget_Parent,1,Q2,3,2026-02-04T10:23:18,
Budget_Parent,1,Q3_open,,"I usually check prices first..."
...
Archaeological Metadata JSON
Separate file with behavioral archaeology:
[{{
  "persona_id": "Budget_Parent",
  "respondent_num": 1,
  "question_id": "Q3",
  "stated": "Balance quality and budget",
  "revealed": "price_sensitivity_high",
  "biases": ["social_desirability", "acquiescence"],
  "emotion": "guilt",
  "intensity": 0.7
}}]

Statistical Summary Report
•	Per-Persona Statistics:
•	Mean, SD, median, min, max for each question
•	Distribution visualizations
•	Cross-Persona Comparisons:
•	T-test / ANOVA results
•	Effect sizes
•	Statistical significance flags
•	Correlation Matrices:
•	Between all scaled questions
•	Hypothesis test results

"""

    return prompt


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
    # Flatten questions
    flat_questions = []
    for sec in questions_sections:
        for q in sec.get("questions", []):
            text = q.get("text") or ""
            opts = q.get("options") or []
            flat_questions.append({"text": text, "options": opts})
    
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
    final_output_structure_prompt = """
**OUTPUT FORMAT:**
RETURN only in valid JSON:

1) Return ONLY valid JSON, nothing else.
2) Generate ONE COMBINED result that aggregates ALL personas together.
3) For each question, distribute the {total_sample} total responses across options based on:
   - How EACH persona would answer (based on their traits)
   - Their SAMPLE SIZE (weight their preferences accordingly)
   - The RESEARCH OBJECTIVE

4) JSON must have these top-level keys:
   - sample_size: {total_sample} (integer)
   - question_results: array of objects, each:
     {{
       "text": "<question text>",
       "options": [
         {{ "option": "<option text>", "count": <int>, "pct": <float> }},
         ...
       ],
       "total": {total_sample}
     }}
   - summary: human-readable summary explaining the combined results
   - llm_source_explanation: object with:
       - used_persona_traits (list of strings - which persona traits influenced the results)
       - persona_influences (dict mapping persona names to their key influences)
       - used_research_objective_elements (list of strings)
       - final_reasoning_summary (string)

5) For each question:
   - Counts must be integers and MUST sum to {total_sample}
   - pct must equal round(100 * count / {total_sample}, 1)
   
6) Example logic:
   If Persona A (100 people) prefers "Quality" 60% and Persona B (50 people) prefers "Price" 70%:
   - "Quality" gets: (100 * 0.6) + (50 * 0.3) = 60 + 15 = 75 votes
   - "Price" gets: (100 * 0.1) + (50 * 0.7) = 10 + 35 = 45 votes
   - etc.

7) Be realistic and weight each persona's preferences by their sample size.
8) Output JSON only (no explanatory text).

Return the JSON now.
"""

    information_gathered_prompt = f"""
**OUTPUT FORMAT:**
RETURN only in valid JSON:
Based on the Instructions provided in all the parts.:
You should provide the output based on that in a JSON format including Statistical Summary Report
"""
    prompt_output = prompt + final_output_structure_prompt
    prompt_internal_info = prompt + information_gathered_prompt


    res_internal_info = await client.chat.completions.create(
        model="gpt-4.1",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You are a precise simulation engine that returns strict JSON."},
            {"role": "user", "content": prompt_internal_info}
        ],
    )
    raw_internal_info = res_internal_info.choices[0].message.content
    data_res_internal_info = json.loads(raw_internal_info)

    # Call LLM once for combined result
    try:
        res = await client.chat.completions.create(
            model="gpt-4.1",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are a precise simulation engine that returns strict JSON."},
                {"role": "user", "content": prompt_output}
            ],
        )
        
        raw = res.choices[0].message.content
        
        if isinstance(raw, (dict, list)):
            data = raw
        else:
            data = json.loads(raw)
        
        if not isinstance(data, dict) or "question_results" not in data:
            data = _fallback_simulation(total_sample_size, flat_questions)
            llm_error = "Invalid LLM response shape"
        else:
            llm_error = None
            
    except Exception as e:
        data = _fallback_simulation(total_sample_size, flat_questions)
        llm_error = str(e)
    
    llm_source_explanation = data.get("llm_source_explanation", {})
    
    # Normalize results
    normalized_results: Dict[str, List[Dict]] = {}
    for q in data.get("question_results", []):
        text = q.get("text", "") or ""
        opts = q.get("options", []) or []
        
        processed = []
        total_counts = 0
        for o in opts:
            if isinstance(o, dict):
                opt_text = o.get("option", "")
                cnt = _ensure_int(o.get("count", 0), 0)
            else:
                opt_text = str(o)
                cnt = 0
            processed.append({"option": opt_text, "count": cnt})
            total_counts += cnt
        
        if len(processed) == 0:
            processed = [{"option": "No option provided", "count": total_sample_size}]
            total_counts = total_sample_size
        
        # Normalize counts to match total_sample_size
        if total_counts != total_sample_size:
            if total_counts == 0:
                n_opts = max(1, len(processed))
                base = total_sample_size // n_opts
                rem = total_sample_size - base * n_opts
                for i, p in enumerate(processed):
                    cnt = base + (1 if i < rem else 0)
                    p["count"] = cnt
            else:
                raw_counts = [(p["count"] / total_counts) * total_sample_size for p in processed]
                ints = [int(rc) for rc in raw_counts]
                remainder = total_sample_size - sum(ints)
                fracs = sorted([(raw_counts[i] - ints[i], i) for i in range(len(ints))], reverse=True)
                for r in range(remainder):
                    _, idx = fracs[r]
                    ints[idx] += 1
                for i, p in enumerate(processed):
                    p["count"] = ints[i]
        
        # Calculate percentages
        for p in processed:
            cnt = int(p["count"])
            pct = round(100.0 * cnt / total_sample_size, 1) if total_sample_size > 0 else 0.0
            p["pct"] = pct
        
        normalized_results[text] = processed
    
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
