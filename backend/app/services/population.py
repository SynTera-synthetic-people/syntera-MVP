import json
from typing import Dict, List, Optional, Callable
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import async_engine
from app.models.population import PopulationSimulation
from app.models.research_objectives import ResearchObjectives
from app.services.persona import get_persona
from app.utils.id_generator import generate_id
from app.config import OPENAI_API_KEY
from openai import AsyncOpenAI
from datetime import datetime

client = AsyncOpenAI(api_key=OPENAI_API_KEY)


def _normalize_score(v):
    try:
        v = float(v)
        return max(0, min(100, v))
    except:
        return 0.0


def _build_insight_prompt(persona, research_objective, sample_n):
    clean_persona = {
        k: v for k, v in persona.items()
        if k not in ["created_at", "updated_at"]
    }
    persona_str = json.dumps(clean_persona, indent=2, default=str)

    if hasattr(research_objective, "model_dump"):
        ro_dict = research_objective.model_dump()
    else:
        ro_dict = dict(research_objective)

    ro_desc = ro_dict.get("description", "")

    return f"""
**1. SYSTEM ROLE & OBJECTIVE**
You are an advanced Sampling Distribution Engine integrated into a synthetic research platform. Your purpose is to intelligently allocate sample sizes across AI-generated personas for quantitative studies while maintaining rigorous statistical standards comparable to Nielsen, Ipsos, Gallup, and Harris Interactive methodologies—adapted for synthetic participant environments.
Core Responsibility
Given a Research Objective (from Omi) and a set of generated personas (from Evidence-Based Persona Builder), you must:
•	AUTOMATICALLY RECOMMEND optimal total sample size based on study requirements
•	Intelligently distribute samples across personas to ensure:
•	Statistical validity and reliability
•	Representative demographic coverage
•	Minimized bias and variance
•	Maximum research objectives alignment
•	Robust confidence intervals

**2. INPUT PARAMETERS & INTELLIGENT ANALYSIS**

PERSONA:
{persona_str}

RESEARCH OBJECTIVE:
{ro_desc}

SAMPLE SIZE REQUESTED: {sample_n}

**2.1 Research Objective Analysis**
When you receive the Research Objective from Omi, extract and analyze:

A. Study Type Detection
Classify the study into one of these types (impacts sample size calculation):
| Study Type | Detection Keywords | Base Sample Multiplier |
|-----------|-------------------|------------------------|
| Brand Awareness | brand awareness, top of mind, aided awareness, unaided awareness | 1.3x |
| Brand Consideration | consideration set, brand preference, shortlist | 1.3x |
| Brand Health | brand health, brand equity, brand vitality | 1.4x |
| Brand Tracking | tracking, wave study, trend tracking | 1.3x |
| Product-Market Fit | PMF, solution fit, market need | 1.5x |
| Concept Testing | concept evaluation, new product test | 1.2x |
| Feature Prioritization | feature importance, ranking | 1.4x |
| Category Fit | market category, category assessment | 1.2x |
| Demand Estimation | demand forecast, purchase intent | 1.6x |
| Market Potential | TAM, market opportunity | 1.5x |
| CSAT | customer satisfaction | 1.0x |
| NPS | net promoter score, loyalty | 1.0x |
| Journey Evaluation | customer journey, touchpoints | 1.3x |
| Attitudes Study | beliefs, perceptions | 1.1x |
| Aspirations Study | aspirations, goals | 1.1x |
| Motivations Study | motivations, drivers | 1.2x |
| Demographic Segmentation | age, income, gender segmentation | 1.8x |
| Behavioral Segmentation | usage behavior, clusters | 1.9x |
| Needs-based Segmentation | needs, jobs-to-be-done | 2.0x |
| Message Testing | tagline, claim testing | 1.3x |
| Ad Effectiveness | campaign impact, ad recall | 1.4x |
| Pricing Study | price sensitivity, elasticity | 1.7x |
| Channel Preference | distribution preference | 1.3x |
| Launch Readiness | go-to-market decision | 1.6x |
| Conjoint Analysis | trade-offs, conjoint | 2.0x |
| Exploratory Research | explore, discover | 1.0x |

B. Decision Stakes Assessment
Evaluate the importance of the decision (impacts required precision):
| Decision Stakes | Detection Signals | Target MoE | Sample Impact |
|----------------|------------------|-----------|---------------|
| LOW | explore, understand, directional | ±7% | Base × 0.5 |
| MEDIUM | inform, guide, tactical | ±5% | Base × 1.0 |
| HIGH | launch, investment, strategic | ±3% | Base × 2.0 |
| CRITICAL | regulatory, irreversible | ±2% | Base × 3.5 |

C. Subgroup Analysis Requirements
Detect if RO requires subgroup comparisons (multiplies sample needs):
•	Geography comparisons: 'across cities', 'regional differences', 'urban vs rural'
•	Demographic comparisons: 'by age group', 'gender differences', 'income segments'
•	Behavioral comparisons: 'heavy vs light users', 'loyal vs switchers'
•	Temporal comparisons: 'before vs after', 'change over time', 'trend analysis'

Subgroup Sample Calculation:
IF subgroup analysis detected:
•	Each subgroup needs minimum n=196 (for ±7% MoE) or n=384 (for ±5% MoE)
•	Total sample = number_of_subgroups × subgroup_minimum
•	Example: Comparing 4 age groups requires 4 × 384 = 1,536 total

### D. Statistical Approach Detection

| Approach | Detection Keywords | Sample Requirement |
|---------|-------------------|--------------------|
| Descriptive | how many, what percent, describe | n = 384 (±5% MoE) |
| Comparative | compare, difference between, A vs B | n = 196 per group (minimum) |
| Predictive / Driver | predict, driver, influence, impact on | n ≥ 800 (for regression) |
| Segmentation | segment, cluster, types of | n = 600–1,200+ |

2.2 Persona Analysis
When you receive generated Personas from Evidence-Based Persona Builder, analyze:

A. Persona Count & Diversity
Number of Personas Generated:
•	2-3 personas: Lower complexity → can use smaller total sample
•	4-5 personas: Medium complexity → require moderate sample
•	6+ personas: High complexity → require larger sample for stability

Diversity Assessment:
Evaluate how different the personas are from each other:

| Diversity Level | Indicators | Sample Impact |
|---------------|-----------|---------------|
| LOW Diversity | Similar age ranges (±5 years), same income tier, same location type, similar behaviors | Base × 0.8 |
| MEDIUM Diversity | Different age groups (2–3 bands), varied income, mix of urban/suburban, some behavioral differences | Base × 1.0 |
| HIGH Diversity | Wide age span (20+ years), all income tiers, urban/rural/suburban, highly distinct behaviors | Base × 1.3 |

B. Population Representation Weights
Extract from each Persona Profile:
•	Population weight (% of target population this persona represents)
•	If not explicitly stated, infer from demographics, behavioral prevalence, and evidence volume

C. Expected Variance Assessment
For each persona, estimate internal homogeneity:
### C. Expected Variance Assessment (Within-Persona Homogeneity)

For each persona, estimate internal homogeneity to determine variance-driven
sample adjustments.

| Persona Variance | Indicators | σ² Estimate | Sample Adjustment |
|------------------|------------|-------------|-------------------|
| LOW (Homogeneous) | Narrow age band (≈5 years), single income tier, consistent behaviors | 0.10–0.15 | −15% |
| MEDIUM | Moderate age span (≈10 years), two income tiers, some behavioral variety | 0.20–0.25 | Base |
| HIGH (Heterogeneous) | Wide age range (15+ years), all income levels, diverse behaviors | 0.30–0.40 | +20% |

D. Confidence Score Integration
The Evidence-Based Persona Builder provides Confidence Score (0.0-1.0):
•	HIGH Confidence (0.70-1.00): Evidence-based → Use standard allocation
•	MEDIUM Confidence (0.50-0.69): Partial evidence → Increase sample by 20%
•	LOW Confidence (<0.50): RO-based archetypes → Increase sample by 35%
Confidence Score Impact:
Sample_Adjustment = 1 + (0.70 - Average_Persona_Confidence) × 0.5

**3. INTELLIGENT SAMPLE SIZE RECOMMENDATION ENGINE**

3.1 Master Sample Size Formula

This is the formula that automatically determines optimal total sample size:
MASTER SAMPLE SIZE FORMULA
n_recommended = Base_n × Study_Type_Multiplier × Decision_Stakes_Multiplier ×
Persona_Diversity_Factor × Confidence_Adjustment × Subgroup_Factor × DEFF_synthetic

Component Breakdown:
1. Base_n (Foundation Sample Size):

| Target MoE | Base_n | Typical Use Case |
|-----------|--------|------------------|
| ±7% | 196 | Exploratory, directional insights |
| ±5% | 384 | Standard research, moderate decisions |
| ±3% | 1,067 | High-stakes decisions, precise estimates |
| ±2% | 2,401 | Critical decisions, regulatory |

2. Study_Type_Multiplier:
•	From Section 2.1.A Study Type Detection table
•	Range: 1.0x to 2.0x

3. Decision_Stakes_Multiplier:
•	From Section 2.1.B Decision Stakes table
•	Range: 0.5x (Low) to 3.5x (Critical)

4. Persona_Diversity_Factor:
Persona_Diversity_Factor = √(number_of_personas / 3) × Diversity_Multiplier
•	Diversity_Multiplier from Section 2.2.A (0.8x to 1.3x)

5. Confidence_Adjustment:
Confidence_Adjustment = 1 + (0.70 - Average_Persona_Confidence) × 0.5

6. Subgroup_Factor:
IF no subgroups: 1.0
IF subgroups: max(1.0, number_of_subgroups × 0.5)

7. DEFF_synthetic:
•	Design Effect = 1.3 to 1.8 (typically 1.5)

3.2 Calculation Steps
STEP 1: Parse Research Objective
•	Extract study type, stakes, subgroups, statistical approach
STEP 2: Analyze Personas
•	Count personas, assess diversity, calculate avg confidence
STEP 3: Select Base_n from MoE target
STEP 4: Apply Master Formula
Calculate n_recommended using all multipliers
STEP 5: Round & Validate
•	Round to nearest 50
•	Check minimum: n ≥ (personas × 196)
•	Check maximum: n ≤ 10,000
STEP 6: Present Recommendation
Show user the recommended sample with justification

4. SAMPLING DISTRIBUTION ALGORITHM
Once total sample size is determined (either recommended by system or adjusted by user), distribute it across personas using this 10-step algorithm:
STEP 1: Persona Population Weight Assessment
For each persona (i), calculate Population Representation Weight (w_i):
w_i = (Demographic Match Score × Market Size Estimation) / Σ(all personas)
Where:
•	Demographic Match Score = How closely persona matches target population (0-1 scale)
•	Market Size Estimation = % of total addressable population

STEP 2: Proportionate Allocation (Base Distribution)
Calculate Base Sample Allocation for each persona:
n_base_i = n_total × w_i
Example (n_total = 1,200):
•	Persona A (w=0.22): 1,200 × 0.22 = 264 responses
•	Persona B (w=0.43): 1,200 × 0.43 = 516 responses
•	Persona C (w=0.35): 1,200 × 0.35 = 420 responses

STEP 3: Statistical Precision Adjustment
Calculate Minimum Required Sample per Persona:
n_min_i = (Z² × p × (1-p)) / (MoE²)
Where Z=1.96 (95% CI), p=0.5 (max variance), MoE=0.07 or 0.05
•	Minimum thresholds:
•	n_min = 196 for ±7% MoE
•	n_min = 385 for ±5% MoE
Adjustment Rule:
•	IF n_base_i < n_min_i THEN increase to n_min_i
•	Redistribute excess from over-represented personas

STEP 4: Variance-Weighted Optimization
Adjust allocation based on Expected Response Variance:
n_adjusted_i = n_base_i × √(σ²_i / σ²_avg)
Rationale: Higher internal variance requires larger samples for stable estimates

STEP 5: Neyman Allocation (Optimal Efficiency)
For maximum statistical efficiency:
n_optimal_i = n_total × (w_i × σ_i) / Σ(w_j × σ_j)
This minimizes total sampling variance while respecting population weights

STEP 6: Bias Detection & Correction Mechanism
1. Coverage Bias Check:
•	Ensure no demographic segment underrepresented by >15%
2. Response Quality Bias:
•	Flag personas with:
•	Excessive agreement bias (>70% positive responses)
•	Straight-lining tendency (>60% same-scale responses)
•	Correction: Increase sample by 20-30% to dilute bias
3. Selection Bias:
•	Verify full demographic spectrum covered
•	Flag if critical segment missing

STEP 7: Confidence Score Calculation
For each persona, calculate Synthetic Confidence Score (SCS):
SCS_i = (Persona Validity Score) × (Sample Size Adequacy) × (Bias Adjustment Factor)
Components:
1.	1. Persona Validity Score (0-1): Based on data source quality, training data representativeness
2.	2. Sample Size Adequacy (0-1): min(1, n_actual_i / n_optimal_i)
3.	3. Bias Adjustment Factor (0-1): Deductions for detected biases
Overall Study Confidence Score:
SCS_total = Σ(SCS_i × w_i)
Interpretation:
•	SCS ≥ 0.85: High confidence, comparable to traditional research
•	0.70 ≤ SCS < 0.85: Moderate confidence, suitable for exploratory
•	SCS < 0.70: Low confidence, recommend refinement

STEP 8: Simulated Margin of Error Calculation
Calculate Effective MoE accounting for synthetic data:
MoE_effective = √[(Z² × p × (1-p)) / n_eff] × DEFF_synthetic
Where n_eff = n_total / DEFF_synthetic
DEFF_synthetic typically 1.3-1.8 based on persona diversity and response quality

STEP 9: Probability Distribution Modeling
Instead of point estimates, generate probability distributions for each metric:
•	For each question, calculate:
•	Mean (μ): Central tendency
•	Standard Error (SE): μ ± (σ / √n_eff)
•	95% Confidence Interval: [μ - 1.96×SE, μ + 1.96×SE]
•	Interquartile Range (IQR)
•	Credible Intervals: Bayesian posterior distributions

STEP 10: Sensitivity & Robustness Checks
Perform automated sensitivity analyses:
1. Sample Size Sensitivity:
•	Re-calculate at 80%, 100%, 120% of allocated sample
2. Persona Weight Sensitivity:
•	Adjust each weight by ±10%, report max deviation
3. Outlier Robustness:
•	Identify responses >3 SD from mean, re-calculate with 5% trimming
4. Persona Exclusion Test:
•	Calculate metrics excluding each persona one at a time
Robustness Score (0-100):
Robustness = 100 - [20×(sample_sensitivity) + 30×(weight_sensitivity) + 30×(outlier_impact) + 20×(persona_dependence)]
•	Score ≥ 80: Highly robust
•	50-79: Moderately robust
•	< 50: Low robustness, findings unreliable

**5. ADVANCED VALIDATION RULES & BIAS DETECTION**
5.1 Statistical Validation Framework
The following validation rules execute automatically before finalizing sample distribution:
Rule Set A: Sample Size Validation

A1. Minimum Subgroup Threshold Check
IF n_allocated_i < 196 THEN:
•	Flag: 'Statistical Caution Required'
•	Action: Increase allocation to 196
•	Alert user about minimum threshold requirement

A2. Maximum Concentration Check
IF any persona_allocation > 0.60 × n_total THEN:
•	Flag: 'Over-Reliance Risk Detected'
•	Action: Cap persona at 60%
•	Redistribute excess proportionally

A3. Effective Sample Size Validation
Calculate n_eff = n_total / DEFF_synthetic
•	IF n_eff < 384 THEN flag insufficient effective sample
Rule Set B: Demographic Representation Validation

B1. Census Alignment Check
FOR each demographic variable (age, gender, income, education, geography):
Calculate deviation = |persona_distribution - census_distribution|
•	IF deviation > 0.15 (15%) THEN flag demographic misalignment

B2. Intersectional Representation Check
•	Validate joint distributions for:
•	Age × Gender
•	Age × Income
•	Education × Geography
•	IF any cross-tab cell < 30 responses THEN flag sparse cell warning

Rule Set C: Response Quality & Bias Detection
C1. Agreement Bias Detection
Calculate agreement_rate = positive_responses / total_responses
•	IF agreement_rate > 0.70 THEN flag excessive agreement bias
•	Severity: High if >0.80, Moderate if 0.70-0.80

C2. Straight-Lining Detection
Calculate straightline_rate = consecutive_identical_responses ≥ 5 / total_scale_questions
•	IF straightline_rate > 0.30 THEN flag straight-lining

C3. Extreme Response Bias
Calculate extreme_rate = responses_at_endpoints / total_scale_responses
•	IF extreme_rate > 0.40 THEN flag extreme response style
Rule Set D: Variance & Consistency Validation

D1. Within-Persona Variance Check
•	IF σ_persona > 1.5 × σ_avg THEN increase sample by 30%
•	IF σ_persona < 0.50 × σ_avg THEN flag suspiciously low variance

D2. Between-Persona Divergence Check
Calculate Bhattacharyya Distance between persona pairs
•	IF D_B < 0.30 THEN flag persona overlap, recommend consolidation

Rule Set E: Advanced Statistical Diagnostics
E1. Chi-Square Goodness-of-Fit Test
Test if observed distribution matches expected: χ² = Σ[(O_i - E_i)² / E_i]
•	IF p-value < 0.05 THEN apply post-stratification weights

E2. Intraclass Correlation Coefficient (ICC)
ICC = σ²_between / (σ²_between + σ²_within)
•	IF ICC < 0.10 THEN flag low persona discrimination
•	IF ICC > 0.70 THEN flag high persona homogeneity, consider consolidation

**6. STUDY-SPECIFIC FORMULAS & METHODOLOGIES**
6.1 Brand Tracking Studies
Sample Size Determination:
n = (Z² × p × (1-p)) / (MoE² × DEFF) × [1 + (waves - 1) × ρ]
Where waves = number of measurement waves, ρ = correlation between waves (0.60-0.80)

Key Metrics Formulas:
4.	1. Brand Momentum Score:
Momentum = (Aided_Awareness_t - Aided_Awareness_t-1) × 0.3 + (Consideration_t - Consideration_t-1) × 0.4 + (Preference_t - Preference_t-1) × 0.3

5.	2. Net Promoter Score (NPS):
NPS = %Promoters(9-10) - %Detractors(0-6)
SE_NPS = √[(p₁(1-p₁)/n₁) + (p₂(1-p₂)/n₂)]

6.2 Concept Testing & Product Development
Sample Size Per Concept:
Monadic testing: n_per_concept = 384 minimum
Sequential monadic: n_total = n_per_concept × concepts × 0.75

Key Metrics:
6.	1. Purchase Intent Index:
PI_Index = (5 × %Top_Box) + (4 × %Second_Box) + ... + (1 × %Bottom_Box)
7.	2. Adjusted Purchase Intent:
Adjusted_PI = (0.70 × %Top_Box) + (0.30 × %Second_Box)

6.3 Market Segmentation Studies
Sample Requirements:
n_total = k × m × f
Where k = expected segments (4-7), m = minimum per segment (100-150), f = inflation factor (1.5-2.0)
Segmentation Algorithms:
8.	1. K-Means Clustering: Distance = √[Σ(x_i - y_i)²]
9.	2. Latent Class Analysis: AIC = -2LL + 2p, BIC = -2LL + p×ln(n)
10.	3. Silhouette Score: s = (b-a)/max(a,b), Target >0.50

6.4 Conjoint Analysis Studies
Sample Size:
n = 500 × L / (T × A)
Where L = largest # of levels, T = choice tasks, A = alternatives per task
Key Formulas:
11.	1. Attribute Importance: Importance_i = (Range_i / Σ Range_all) × 100
12.	2. Willingness-to-Pay: WTP = -(β_feature / β_price)
13.	3. Price Elasticity: Elasticity = (% change in share) / (% change in price)

6.5 Customer Satisfaction & NPS Studies
Sample Requirements:
Overall: n = 384 (±5% MoE)
Per subgroup: n = 196 minimum (±7% MoE)
Key Metrics:
14.	1. CSAT = (satisfied customers / total responses) × 100
15.	2. Customer Effort Score (CES): Average on 7-point scale
16.	3. Relative Weight Analysis: RWA_i = (β_i × r_i) / Σ(β_j × r_j)

7. CRITICAL DECISION RULES
Rule 1: Minimum Sample Enforcement
IF n_allocated_i < 196 THEN increase to 196 AND flag 'statistical caution'
Rule 2: Disproportionate Allocation Trigger
IF any persona >60% of total THEN flag over-reliance risk AND recommend diversification
Rule 3: Confidence Score Threshold
IF SCS_total < 0.70 THEN recommend:
•	Increase sample by 50% OR refine personas OR hybrid approach (50% synthetic + 50% live)
Rule 4: Robustness Failure
IF Robustness_Score < 50 THEN block study launch AND require methodological review
Rule 5: Design Effect Ceiling
IF DEFF > 2.0 THEN flag excessive complexity AND recommend simplification
Rule 6: Demographic Quota Enforcement
IF |actual_% - target_%| > 15% THEN apply post-stratification weights

8. FINAL OUTPUT: SAMPLING DISTRIBUTION REPORT
The system generates a comprehensive report with these sections:
Section 1: Recommended Sample Allocation
Table showing: Persona | Population Weight | Base | Adjusted | % of Total | MoE

Section 2: Statistical Quality Metrics
•	Overall Margin of Error (95% CI)
•	Effective Sample Size
•	Synthetic Confidence Score (SCS)
•	Design Effect (DEFF)
•	Minimum Subgroup Sample

Section 3: Bias Assessment
Table showing: Bias Type | Status | Severity | Correction Applied
Section 4: Sensitivity Analysis
•	Sample Size Sensitivity: Results stable ±20%?
•	Weight Sensitivity: Max deviation when weights vary ±10%
•	Outlier Robustness: % stability after 5% trimming
•	Overall Robustness Score: X/100

Section 5: Confidence Intervals & Distributions
For each metric: Point Estimate | 95% CI | Distribution | Probability scores

Section 6: Recommendations & Caveats
•	✅ Proceed with Confidence (if thresholds met)
•	⚠️ Interpretive Cautions (synthetic data notes)
•	🔧 Optimization Opportunities (improvement suggestions)

9. INTEGRATION INSTRUCTIONS
Workflow Position:
17.	1. Research Objective (from Omi) ✅
18.	2. Building Personas (Evidence-Based Builder) ✅
19.	3. Study Selection (Quantitative) ✅
20.	4. >>> INTELLIGENT SAMPLE SIZE RECOMMENDATION <<< [SECTION 3]
21.	5. >>> SAMPLING DISTRIBUTION ENGINE <<< [SECTION 4]
22.	6. Questionnaire Builder
23.	7. Run Simulation
24.	8. Rebuttal Mode

Implementation Steps
Step 1: Data Collection Phase
Receive: Research Objective + Generated Personas
Validate: All required inputs present
Step 2: Intelligent Recommendation Phase (Section 3)
Execute: Sample size recommendation algorithm
Present: Recommendation screen to user
Allow: User to accept or adjust
Step 3: Distribution Calculation Phase (Section 4)
Execute: 10-step distribution algorithm
Run: All validation rules (Section 5)
Apply: Study-specific adjustments (Section 6)
Step 4: Decision Phase (Section 7)
Apply: Critical decision rules
IF blocking condition: Halt and alert user
IF all pass: Proceed to report
Step 5: Output Phase (Section 8)
Generate: Complete Sampling Distribution Report
Present: Allocation table + metrics to user
Await: User confirmation
Step 6: Execution Phase
Pass: Allocation parameters to questionnaire module
Monitor: Response collection
Apply: Adaptive adjustments if enabled

**10. GLOSSARY OF TERMS**
Design Effect (DEFF): Ratio of variance from complex sample to simple random sample. Values >1.0 indicate increased variance.
Effective Sample Size (n_eff): Adjusted sample size: n_total / DEFF
Margin of Error (MoE): Range of uncertainty around point estimate at specified confidence level
Neyman Allocation: Optimal allocation minimizing variance by distributing sample proportional to strata size and variability
Persona Validity Score: 0-1 metric assessing AI persona quality based on training data and validation
Post-Stratification Weighting: Statistical adjustment applied after data collection to align sample with population
Robustness Score: 0-100 metric measuring stability of findings across sensitivity tests
Synthetic Confidence Score (SCS): 0-1 metric assessing overall reliability of synthetic research study

**11. APPENDIX: REFERENCE TABLES**

A. Z-Scores for Common Confidence Levels
| Confidence Level | Z-Score |
|------------------|---------|
| 90% | 1.645 |
| 95% | 1.960 |
| 99% | 2.576 |
| 99.9% | 3.291 |

B. Sample Size Requirements by Margin of Error
| Margin of Error (MoE) | 95% CI | 90% CI | 99% CI |
|----------------------|--------|--------|--------|
| ±1% | 9,604 | 6,765 | 16,590 |
| ±2% | 2,401 | 1,691 | 4,148 |
| ±3% | 1,067 | 752 | 1,843 |
| ±5% | 384 | 271 | 663 |
| ±7% | 196 | 138 | 339 |
| ±10% | 96 | 68 | 166 |

C. Typical Design Effects by Study Type
| Study Type | Typical DEFF Range |
|-----------|--------------------|
| Simple Random Sample | 1.0 |
| Stratified Sample (proportionate) | 0.8 – 1.2 |
| Cluster Sample | 1.5 – 3.0 |
| Synthetic Data (AI Personas) | 1.3 – 1.8 |
| Online Panel (non-probability) | 1.4 – 2.2 |

Output Format:
RETURN STRICT JSON:

{{
  "analysis": "Provide the detailed analysis in a paragraph.",
  "sources_used": [
    ...
  ],
  "final_estimate_range": "10,000 – 15,000",
  "confidence_score": 0 - 100,
  ...other fields
}}
"""


async def _call_llm(persona, research_obj, sample_n):
    prompt = _build_insight_prompt(persona, research_obj, sample_n)

    try:
        res = await client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "Return only valid JSON."},
                {"role": "user", "content": prompt},
            ],
        )
    except Exception as e:
        return {
            "analysis": f"LLM error: {e}",
            "sources_used": [],
            "final_estimate_range": "0 – 0",
            "confidence_score": 0.0
        }

    raw = res.choices[0].message.content

    try:
        data = json.loads(raw)
    except:
        return {
            "analysis": "Invalid LLM JSON.",
            "sources_used": [],
            "final_estimate_range": "0 – 0",
            "confidence_score": 0.0
        }

    return {
        "analysis": data.get("analysis", ""),
        "sources_used": data.get("sources_used", []),
        "final_estimate_range": data.get("final_estimate_range", ""),
        "confidence_score": _normalize_score(data.get("confidence_score", 0)),
    }

async def get_research_objective(
    session: AsyncSession,
    exploration_id: str
) -> ResearchObjectives | None:
    stmt = select(ResearchObjectives).where(
        ResearchObjectives.exploration_id == exploration_id
    )

    result = await session.execute(stmt)
    return result.scalars().first()


async def create_population_simulation(workspace_id, exploration_id, persona_ids,
                                       sample_distribution, user_id, session: AsyncSession):
    research_obj = await get_research_objective(session, exploration_id)

    persona_scores = {}
    global_insights = {}

    for pid in persona_ids:
        persona = await get_persona(pid)
        sample_n = sample_distribution.get(pid, 50)

        llm_result = await _call_llm(persona, research_obj, sample_n)

        persona_scores[pid] = llm_result["confidence_score"]

        global_insights[pid] = {
            "analysis": llm_result["analysis"],
            "sources_used": llm_result["sources_used"],
            "final_estimate_range": llm_result["final_estimate_range"],
            "confidence_score": llm_result["confidence_score"]
        }

    total_samples = sum(sample_distribution.values())
    weighted_score = round(
        sum(persona_scores[p] * (sample_distribution[p] / total_samples) for p in persona_ids),
        2
    )

    async with AsyncSession(async_engine) as session:
        sim = PopulationSimulation(
            id=generate_id(),
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            research_objective_id=research_obj.id,
            persona_ids=persona_ids,
            sample_distribution=sample_distribution,
            persona_scores=persona_scores,
            weighted_score=weighted_score,
            global_insights=global_insights,
            created_by=user_id,
            created_at=datetime.utcnow()
        )
        session.add(sim)
        await session.commit()
        await session.refresh(sim)
        return sim


async def get_simulation(sim_id: str):
    async with AsyncSession(async_engine) as session:
        simulation = select(PopulationSimulation).where(PopulationSimulation.id == sim_id)
        r = await session.execute(simulation)
        return r.scalars().first()

def simulation_to_dict(sim: PopulationSimulation) -> dict:
    """JSON-serializable population simulation (persisted run: personas + sample sizes + questionnaire link)."""
    return {
        "id": sim.id,
        "workspace_id": sim.workspace_id,
        "exploration_id": sim.exploration_id,
        "research_objective_id": sim.research_objective_id,
        "persona_ids": sim.persona_ids or [],
        "sample_distribution": sim.sample_distribution or {},
        "persona_scores": sim.persona_scores,
        "weighted_score": sim.weighted_score,
        "global_insights": sim.global_insights,
        "created_by": sim.created_by,
        "created_at": sim.created_at.isoformat() if sim.created_at else None,
    }


async def list_simulations_for_objective(workspace_id: str, objective_id: str):
    async with AsyncSession(async_engine) as session:
        simulation = select(PopulationSimulation).where(
            PopulationSimulation.workspace_id == workspace_id,
            PopulationSimulation.exploration_id == objective_id
        )
        res = await session.execute(simulation)
        rows = res.scalars().all()
        return [simulation_to_dict(s) for s in rows]
