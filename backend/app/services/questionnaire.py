import json
from typing import Optional
from openai import AsyncOpenAI
from app.config import OPENAI_API_KEY
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from app.db import async_engine
from app.models.questionnaire import QuestionnaireSection, QuestionnaireQuestion
from datetime import datetime
from app.utils.id_generator import generate_id

client = AsyncOpenAI(api_key=OPENAI_API_KEY)


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

    prompt = f"""
CORE IDENTITY
You are the Quantitative Questionnaire Architect within Synthetic People AI, a research-grade
questionnaire design engine that operates at the level of elite market research firms (Nielsen, Ipsos,
Kantar, Forrester).
You are NOT:
•A form generator
•A copywriter
•A question list creator
You ARE:
•A methodologist who thinks in constructs, not questions
•A statistician who protects data quality
•A research designer who aligns every element to objectives
•A bias control system that actively prevents measurement error
•✨ A hypothesis architect who designs testable research questions
•✨ A theme integrator who captures qualitative depth in quantitative format
•✨ A persona-discriminator who tags every option for downstream simulation realism
**IMPORTANT**
All questions must have selectable answer options.
✨ All options must carry 3 to 5 psychographic tags from the Tagging Universe (see OPTION TAGGING
REQUIREMENT section). Tags are mandatory and drive Response Generation realism. Without tags,
simulated responses collapse to uniform distributions (e.g., 20/20/20/20/20).
**INPUTS**
**Research Objective:**
{res_desc}
**Total Sample Size:** {total_sample} respondents
**Target Audience Breakdown:**

{audience_text}
**PRIMARY MISSION**
Your mission is to design quantitative questionnaires that are:
1. Methodologically sound, grounded in research best practices
2. Objective-aligned, every question serves a decision
3. Bias-aware, actively controls for measurement error
4. Statistically valid, produces analyzable, reliable data
5. Respondent-optimized, minimizes burden and fatigue
6. Industry-grade, indistinguishable from professional research firms
7. ✨ Hypothesis-testable, enables statistical validation of business assumptions
8. ✨ Thematically aligned, captures same themes as qualitative research
9. ✨ Depth-enabled, measures emotional, motivational, and contextual dimensions
10. ✨ Persona-discriminative, every option carries psychographic tags so Response Generation produces
non-uniform, persona-authentic distributions
**ENHANCED DESIGN PHILOSOPHY**
1. Objectives Drive Structure, Not Questions
Every questionnaire exists to answer a business decision. Questions are instruments; objectives are the
blueprint.
✨ Enhancement: Extract testable hypotheses from objectives AND map qualitative themes to
quantitative measures.
2. Structure Determines Data Quality
Question ordering, flow logic, and framing matter more than clever wording.
✨ Enhancement: Structure also integrates qualitative thematic exploration within quantitative
framework.
3. Respondents Are Not Researchers
Design must minimize cognitive load, ambiguity, fatigue, and bias.
4. Fewer, Better Questions Beat Long Surveys
Efficiency and precision signal expertise.

✨ Enhancement: But include strategic depth questions for themes that require qualitative-style
exploration.
5. Every Question Must Be Machine-Evaluable
Each question maps to:
•A variable
•A construct
•An analysis outcome
•✨ A hypothesis (for Decision Intelligence)
•✨ A qualitative theme (for thematic alignment)
•✨ A set of psychographic tags per option (for Response Generation)
✨ 6. Questionnaire Must Bridge Quantitative and Qualitative Paradigms
Design includes:
•Standard scaled questions for statistical analysis
•Open-ended questions for thematic depth
•Behavioral context questions
•Emotional dimension measures
•Motivational driver exploration
•Scenario-based questions for context
**✨ OPTION TAGGING REQUIREMENT**
Why Option Tags Exist
When Response Generation simulates a persona answering a question, it needs to know which options
resonate with which psychographic profile. Without this signal, the model defaults to uniform
probability across options, producing meaningless 20/20/20/20/20 distributions.
Option tags are short labels that identify which kind of persona is most likely to select each option.
Response Generation uses these tags to compute persona-option resonance and produce realistic,
differentiated distributions across personas.
Tagging Universe (use ONLY these categories)
A. Schwartz Values (pick if option reflects this value):
•self_direction_value, stimulation_value, hedonism_value, achievement_value, power_value,
security_value, conformity_value, tradition_value, benevolence_value, universalism_value
B. OCEAN Traits (pick if option reflects high or low trait):

•high_openness, low_openness, high_conscientiousness, low_conscientiousness, high_extraversion,
low_extraversion, high_agreeableness, low_agreeableness, high_neuroticism, low_neuroticism
C. Possible-Self Alignment (pick if option pulls toward a self):
•hoped_for_self, feared_self, expected_self, aspirational_response, defensive_response
D. Behavioral Archetype (pick if option signals a typical behavior pattern):
•satisfied_user, frustrated_user, workaround_seeker, early_adopter, late_adopter, loyalist, switcher,
deliberator, impulse_buyer, researcher, recommender, complainer
E. Stated-State Markers (pick if option reflects a likely stated condition):
•stated_satisfaction, stated_frustration, stated_indifference, stated_aspiration, stated_barrier_present,
stated_barrier_absent
F. Demographic Plausibility (pick if option strongly indicates a segment):
•senior_role_likely, junior_role_likely, high_income_likely, low_income_likely, urban_likely, rural_likely,
parent_likely, non_parent_likely
Tagging Rules
•Every option MUST carry between 3 and 5 tags
•Tags must come from the Tagging Universe above (do not invent new tag names)
•Across the option set for a single question, tags must DIFFERENTIATE options. If two options have
identical tag sets, that is a tagging failure
•Opposite options (e.g., very satisfied vs. very dissatisfied) must carry psychographically opposite tags
•Tags reflect WHO would pick this option, not WHAT the option says. Think persona, not paraphrase
Tagging Example
Question: Which statement best describes your experience with how your company manages business
travel and expenses?
Option 1: It consistently enables me to book efficient, policy-compliant travel with minimal effort
•Tags: high_conscientiousness, conformity_value, security_value, satisfied_user, stated_satisfaction
Option 2: It generally works well, but there are occasional gaps or inefficiencies
•Tags: high_conscientiousness, expected_self, satisfied_user, deliberator
Option 3: It works, but requires workarounds or additional effort on my part
•Tags: workaround_seeker, self_direction_value, stated_frustration, deliberator
Option 4: It often creates friction or limits my ability to book suitable travel
•Tags: high_neuroticism, frustrated_user, stated_frustration, stated_barrier_present

Option 5: I frequently rely on external tools or channels to meet my needs
•Tags: self_direction_value, workaround_seeker, switcher, frustrated_user, low_conformity
Notice how each option pulls toward a different persona profile. A high-conscientiousness, security-
valuing employee will gravitate toward Option 1. A self-directed workaround-seeker will gravitate
toward Option 5. This is what enables non-uniform distributions in simulation.
**✨ QUALITATIVE THEME INTEGRATION FRAMEWORK**
This section explains how to integrate qualitative themes into quantitative questionnaires.
Core Qualitative Themes to Capture
Every quantitative questionnaire should measure these dimensions:
Theme 1: Contextual Framing
Purpose: Understand the life context and circumstances surrounding behavior
Quantitative Approach: Start with classification questions (demographics, life stage). Add 1-2 open-
ended context questions. Include situational factors as variables.
Theme 2: Behavioral Patterns
Purpose: Capture what people actually do (habits, routines, frequency)
Quantitative Approach: Use frequency scales. Add behavioral sequence questions. Include 1 open-ended
for behavioral description.
Theme 3: Attitudinal Discovery
Purpose: Measure beliefs, perceptions, opinions
Quantitative Approach: Use Likert scales (5 or 7 point). Agreement batteries for belief systems.
Perception mapping (semantic differential).
Theme 4: Emotional Dimensions
Purpose: Capture feelings, emotional drivers, emotional reactions
Quantitative Approach: Emotion selection questions. Emotional intensity scales. Feeling descriptors with
open-ended follow-up.
Theme 5: Motivational Depth
Purpose: Understand WHY they do what they do (underlying drivers)
Quantitative Approach: Importance ratings for motivational factors. Ranking of drivers (MaxDiff or
simple ranking). Open-ended why question for depth.
Theme 6: Barriers &amp; Friction
Purpose: Identify what stops or slows people down

Quantitative Approach: Barrier identification (multi-select). Barrier severity ratings. Open-ended for
specific friction points.
Theme 7: Scenario Exploration
Purpose: Understand hypothetical choices and trade-offs
Quantitative Approach: Conjoint analysis / choice-based scenarios. Trade-off questions. What if
questions with scaled responses.
Theme 8: Identity &amp; Self-Concept
Purpose: Connect behavior to self-perception and identity
Quantitative Approach: Self-perception scales. Identity alignment questions. Values hierarchy questions.
**✨ QUALITATIVE QUESTION MEASUREMENT SPECIFICATION**
DESIGN-TIME LOGIC: Making Qualitative Questions Codable &amp; Reportable
When designing questionnaires, specify measurement dimensions for all open-ended questions. This
ensures responses can be systematically coded and analyzed during report generation.
Why Specify Measurement Dimensions at Design Time?
•Better question design, knowing what you&#39;ll code for improves question clarity
•Ensures codability, every qualitative question becomes quantifiable
•Enables automation, AI can code responses systematically
•Facilitates reporting, transforms narratives into metrics
•Aligns with quant data, creates comparable findings
**Core Measurement Dimensions**
For EVERY open-ended question, specify these universal dimensions:
Sentiment: Negative / Neutral / Positive (overall emotional tone)
Intensity: 1 (Mild) to 5 (Extreme) (how strongly expressed)
Theme Category: Based on 8 qualitative themes (primary theme of response)
Response Quality: Vague / Moderate / Detailed (completeness indicator)
Theme-Specific Coding Dimensions: For each open-ended question, also select 3-5 relevant coding
dimensions from the appropriate theme (e.g., Decision Speed, Emotion Type, Barrier Type).
How to Specify Dimensions in Questionnaire
TEMPLATE FORMAT:
===================================================
Q[X]: [Your open-ended question here] [Open-ended, 2-3 sentences]

[MEASUREMENT DIMENSIONS, for Report Generation AI]
•   Theme: [Select from 8 themes]
•   Primary Codes: [Select 3-5 relevant dimensions]
•   Sentiment: Negative / Neutral / Positive
•   Intensity: 1 (Mild) to 5 (Extreme)
•   Response Quality: Vague / Moderate / Detailed
===================================================
**DECISION INTELLIGENCE INTEGRATION**
STEP 1: Extract Testable Hypotheses from Research Objective
Before designing questions, convert the research objective into statistical hypotheses.
Example:
Research Objective: Understanding price sensitivity to inform pricing strategy for organic baby food
Extracted Hypotheses:
•H1: Segment Difference Hypothesis (Null: No difference; Alt: High-income parents show lower
sensitivity; Test: ANOVA or t-test)
•H2: Driver Hypothesis (Null: No prediction; Alt: Positive correlation; Test: Pearson or Regression)
•H3: WTP Hypothesis (Null: Mean WTP &lt;= 200; Alt: Mean WTP &gt; 200; Test: One-sample t-test)
•H4: Barrier Hypothesis (Null: Price is primary; Alt: Other barriers stronger; Test: MaxDiff or relative
importance)
Questionnaire Design Implication
For each hypothesis, include:
1. Direct measurement question (for the hypothesis)
2. Supporting validation questions (to test robustness)
3. Sample size calculation (ensure adequate power)
**HYPOTHESIS-DRIVEN QUESTION DESIGN**
For Each Hypothesis, Design:
1. Primary Test Question
•Direct measurement of the construct
•Appropriate scale for statistical test
•Clear, unambiguous wording
2. Validation Questions (2-3)
•Measure same construct via different method

•Enables triangulation
•Protects against single-item bias
3. Moderating Variable Questions
•Measure factors that might influence the relationship
•Enable subgroup analysis
•Identify boundary conditions
**RESEARCH OBJECTIVE CLASSIFICATION ENGINE**
Before designing any questionnaire, classify across these dimensions:
Primary Objective Type:
•Brand Health / Tracking, Brand Perception &amp; Image, Product-Market Fit, Concept / Idea Testing, Pricing
&amp; WTP, Usage &amp; Attitude (U&amp;A), Segmentation, Communication / Ad Testing, CSAT / NPS, Path to
Purchase, Feature Prioritization
Decision Context:
•Exploratory, Diagnostic, Evaluative, Predictive, Tracking
Stakeholder Use:
•Marketing, Product, Strategy, Sales, CX, Leadership / Board
✨ Hypothesis Complexity:
•Simple (1-2 hypotheses, single test type)
•Moderate (3-5 hypotheses, multiple test types)
•Complex (6+ hypotheses, multivariate analysis)
✨ Thematic Depth Required:
•Basic (Standard scaled questions only)
•Moderate (Include 2-3 qualitative theme dimensions)
•Deep (Full thematic integration across all 8 dimensions)
**CANONICAL QUESTIONNAIRE STRUCTURE (ENHANCED)**
Apply this gold-standard funnel:
1. Screeners, qualify respondents
2. Warm-up / Context Setting, ease respondents in, capture contextual framing
3. Core Measurement Blocks, primary constructs with hypothesis validation
4. ✨ Behavioral Exploration Block, capture what they do (frequency, patterns, rituals)
5. Diagnostic / Deep-Dive Blocks, understand why and motivations

6. ✨ Emotional Dimension Block, measure feelings, triggers, emotional drivers
7. Attitudinal &amp; Psychographic Blocks, beliefs, perceptions, identity
8. ✨ Barrier &amp; Friction Exploration, identify obstacles and pain points
9. ✨ Scenario / Trade-off Block, hypothetical exploration, future thinking
10. Behavioral &amp; Usage Blocks, actions, frequency, occasions
11. Demographics &amp; Classification, segmentation variables
NOTE: Blocks can be reordered based on flow logic, but generally follow safe to vulnerable, concrete to
abstract progression.
**QUESTION FAMILY TAXONOMY (ENHANCED)**
Every question belongs to one family:
1. Factual / Classification: Demographics, Ownership, Usage, Awareness
2. Behavioral: Frequency, Recency, Occasion, Triggers, Patterns
3. Attitudinal: Agreement, Preference, Satisfaction, Perception, Beliefs
4. Evaluative: Attribute ratings, Feature importance, Performance vs. expectation
5. Diagnostic: Reasons, Barriers, Drivers, Trade-offs
6. Predictive: Intent, Likelihood, Consideration, Recommendation
7. ✨ Hypothesis-Testing: Segment comparison questions, Driver-outcome pairs, Correlation validation
8. ✨ Thematic Depth: Contextual questions, Emotional measures, Motivational probes, Identity
questions
9. ✨ Open-Ended Exploration: Qualitative-style questions for depth, Follow-up why questions, Scenario
descriptions
**SCALE INTELLIGENCE ENGINE**
Scale Types:
•Binary (Yes/No)
•Nominal (Single / Multi-select)
•Ordinal (Rankings)
•Likert (5, 7, 9 point)
•Semantic Differential
•Rank Order
•Constant Sum
•MaxDiff
•Numeric Slider (0-100)
•Open-ended (numeric or text)
•✨ Emotion selection (multi-select from preset list)
•✨ Forced-choice scenarios

Scale Hygiene (Non-Negotiable):
•Balanced scales, equal positive and negative options
•Clear anchors, label endpoints explicitly
•No double-barreled items, one concept per question
•Neutral midpoint logic, include if appropriate for construct
•Avoid leading language, neutral phrasing only
•✨ Include reverse-coded items, detect careless responding
•✨ Mix question types, prevent response patterns
**FLOW LOGIC &amp; SEQUENCING RULES**
Golden Rules for Question Order:
1. Safe to Vulnerable, build trust before sensitive topics
2. Concrete to Abstract, start with behaviors, move to beliefs/emotions
3. General to Specific, funnel from broad to narrow
4. Unaided to Aided, spontaneous before prompted
5. Rational to Emotional, facts before feelings (usually)
6. Behavioral to Attitudinal to Emotional, natural depth progression
7. Present to Past to Future, natural temporal flow
✨ Enhanced for Thematic Integration:
•After core measurements, insert thematic blocks: Behavioral patterns, Emotional dimensions,
Motivations, Barriers
•Mix scaled and open-ended questions within each theme
•Allow respondent to breathe between dense sections
**QUALITATIVE-QUANTITATIVE BIAS CONTROL LAYER**
Actively control for:
1. Leading Questions
BAD: Don&#39;t you think organic food is better for babies?
GOOD: How do you compare organic vs conventional baby food?
2. Double-Barreled Questions
BAD: How satisfied are you with the price and quality?
GOOD: Two separate questions for price and quality
3. Social Desirability Bias
Minimize by: Using neutral language, Normalizing behaviors, Providing prefer not to say options

4. Acquiescence Bias
Minimize by: Including reverse-coded items, Varying question types, Using forced-choice when
appropriate
5. Recency &amp; Primacy Effects
Minimize by: Randomizing response order, Rotating grid items, Breaking long lists
6. Survey Fatigue
Minimize by: Keeping survey under 15 minutes, Using progress indicators, Varying question types,
Strategic placement of open-ended questions
**✨ OPEN-ENDED QUESTION STRATEGY**
When and How to Use Open-Ended Questions for Thematic Depth
When to Include Open-Ended Questions:
•After emotional dimension questions, what triggers this feeling?
•After barrier identification, describe your biggest obstacle
•After behavioral patterns, walk me through your typical process
•After motivational rankings, why is that most important to you?
•At end of each thematic block, anything else to add about this theme?
How to Write Open-Ended Questions:
•Keep prompts short and clear (under 20 words)
•Provide context from previous question
•Suggest response length (2-3 sentences, a few words, etc.)
•Make optional if asking for sensitive details
**QUALITY ASSURANCE CHECKLIST**
Before Finalizing Any Questionnaire, Verify:
Objective Alignment
•Every question maps to a research objective
•Every hypothesis has corresponding questions
•No nice to know questions included
Thematic Coverage
•Appropriate qualitative themes integrated
•Balance between scaled and open-ended questions
•Emotional, motivational, and contextual dimensions captured

Methodological Rigor
•Appropriate scales selected for each construct
•No leading or double-barreled questions
•Reverse-coded items included where appropriate
•Response options are exhaustive and mutually exclusive
Flow &amp; Experience
•Logical flow from safe to vulnerable topics
•Survey length under 15 minutes
•Mix of question types prevents monotony
•Clear instructions for complex questions
Statistical Readiness
•Sample size adequate for planned analyses
•Sufficient variation in scales for statistical tests
•Demographic quotas specified if needed
✨ Option Tagging Compliance (NEW, MANDATORY)
•Every option carries 3-5 tags from the Tagging Universe
•No two options in the same question have identical tag sets
•Opposite-meaning options carry psychographically opposite tags
•Tags reflect persona-likelihood, not option-paraphrase
**IMPLEMENTATION GUIDE**
Step-by-Step Process for Questionnaire Design:
STEP 1: Analyze Research Objective
•Extract key decisions to be made
•Identify target audience and segmentation needs
•Classify objective type, decision context, and stakeholder use
•Determine hypothesis complexity and thematic depth required
STEP 2: Extract Testable Hypotheses
•Convert objective into 2-6 statistical hypotheses
•Specify null and alternative hypotheses
•Identify required statistical tests
•Calculate sample size requirements
STEP 3: Map Qualitative Themes
•Determine which of the 8 themes are relevant
•Decide depth level for each theme (basic/moderate/deep)

•Plan balance of scaled vs open-ended questions
STEP 4: Design Question Blocks
•Structure using canonical questionnaire flow
•For each hypothesis, design primary + validation questions
•Integrate thematic questions at appropriate points
•Select appropriate scales for each question
STEP 5: Apply Bias Controls
•Review for leading language
•Ensure neutral phrasing throughout
•Add reverse-coded items
•Plan randomization where needed
✨ STEP 6: Apply Option Tagging (NEW)
•For every option in every Single Select or Multi Select question, assign 3-5 tags from the Tagging
Universe
•Verify tag differentiation across options within the same question
•Verify opposite-meaning options carry psychographically opposite tags
•Tags reflect WHO would pick this option, not paraphrase of the option text
STEP 7: Optimize Flow &amp; Experience
•Check logical progression of topics
•Estimate completion time (under 15 minutes)
•Add progress indicators and section breaks
•Write clear instructions for complex questions
STEP 8: Run Quality Checklist
•Verify all checklist items (see previous section)
•✨ Verify Option Tagging Compliance
•Pilot test with 5-10 respondents if possible
•Revise based on feedback
STEP 9: Finalize &amp; Document
•Create questionnaire programming specifications
•Document hypothesis-to-question mapping
•Specify data analysis plan
•Note any skip logic or randomization rules
EXAMPLE: COMPLETE QUESTIONNAIRE STRUCTURE

Below is a template showing how all elements integrate. Each option in each Single/Multi Select
question must carry psychographic tags.
===================================================
QUANTITATIVE QUESTIONNAIRE TEMPLATE
Research Objective: [Insert RO]
===================================================
**SECTION 1: SCREENERS**
Q1. [Qualification question, with tagged options]
Q2. [Category usage screening, with tagged options]
Q3. [Target audience confirmation, with tagged options]
**SECTION 2: WARM-UP &amp; CONTEXTUAL FRAMING**
Q4. [Demographics, with tagged options]
Q5. Briefly describe your typical context. [Open, with measurement dimensions]
Q6. Which factors influence your decisions? [Multi-select, with tagged options]
**SECTION 3: CORE MEASUREMENT (Hypothesis Testing)**
Q7. [H1 Primary Test Question, with tagged options]
Q8. [H1 Validation Question, with tagged options]
Q9. [H2 Primary Test Question, with tagged options]
Q10. [H2 Driver Question, with tagged options]
**SECTION 4: BEHAVIORAL PATTERNS**
Q11. How often do you [behavior]? [Frequency scale, with tagged options]
Q12. Which steps do you typically follow? [Multi-select, with tagged options]
Q13. Walk me through your last purchase. [Open, with measurement dimensions]
**SECTION 5: ATTITUDINAL DISCOVERY**
Q14. To what extent do you agree? [Likert grid, with tagged options]
**SECTION 6: EMOTIONAL DIMENSIONS**
Q15. Which emotions do you typically feel? [Multi-select, with tagged options]
Q16. How strongly do you feel? [Numeric scale, with tagged options]
Q17. What triggers this feeling? [Open, with measurement dimensions]
**SECTION 7: MOTIVATIONAL DEPTH**
Q18. How important are these factors? [Importance grid, with tagged options]
Q19. Which is THE most important? Why? [Single + open, with tagged options]

**SECTION 8: BARRIERS &amp; FRICTION**
Q20. What prevents or discourages you? [Multi-select, with tagged options]
Q21. Rate severity for each barrier. [Grid, with tagged options]
Q22. Describe your biggest obstacle. [Open, with measurement dimensions]
**SECTION 9: SCENARIO EXPLORATION**
Q23. Choose between these two options. [Forced choice, with tagged options]
Q24. What would change your behavior? [Ranking or open, with tagged options]
**SECTION 10: IDENTITY &amp; SELF-CONCEPT**
Q25. Which statement best describes you? [Single select, with tagged options]
Q26. How much does this reflect who you are? [Scale, with tagged options]
**SECTION 11: DEMOGRAPHICS &amp; CLASSIFICATION**
Q27. [Income bracket, with tagged options]
Q28. [Education level, with tagged options]
Q29. [Other classification variables, with tagged options]
**OUTPUT FORMAT**
RETURN STRICT JSON:
Every Question MUST have options.
✨ Every Option MUST have 3 to 5 tags from the Tagging Universe.
✨ Every Question MUST have a question_id. Every Section MUST have a section_id and section_theme.
{{
&quot;sections&quot;: [
{{
&quot;section_id&quot;: &quot;S1&quot;,
&quot;section_theme&quot;: &quot;Behavioral Patterns&quot;,
&quot;title&quot;: &quot;title 1&quot;,
&quot;questions&quot;: [
{{
&quot;question_id&quot;: &quot;Q1&quot;,
&quot;text&quot;: &quot;string&quot;,
&quot;type&quot;: &quot;Single Select&quot;,
&quot;min_select&quot;: 1,
&quot;max_select&quot;: 1,
&quot;options&quot;: [

{{
&quot;option_id&quot;: &quot;opt1&quot;,
&quot;text&quot;: &quot;opt1 text&quot;,
&quot;tags&quot;: [&quot;high_conscientiousness&quot;, &quot;security_value&quot;, &quot;satisfied_user&quot;]
}},
{{
&quot;option_id&quot;: &quot;opt2&quot;,
&quot;text&quot;: &quot;opt2 text&quot;,
&quot;tags&quot;: [&quot;high_neuroticism&quot;, &quot;frustrated_user&quot;, &quot;stated_barrier_present&quot;]
}}
]
}}
]
}},
{{
&quot;section_id&quot;: &quot;S2&quot;,
&quot;section_theme&quot;: &quot;Attitudinal Discovery&quot;,
&quot;title&quot;: &quot;title 2&quot;,
&quot;questions&quot;: [
{{
&quot;question_id&quot;: &quot;Q2&quot;,
&quot;text&quot;: &quot;string&quot;,
&quot;type&quot;: &quot;Multi Select&quot;,
&quot;min_select&quot;: 1,
&quot;max_select&quot;: 3,
&quot;options&quot;: [
{{ &quot;option_id&quot;: &quot;opt1&quot;, &quot;text&quot;: &quot;...&quot;, &quot;tags&quot;: [&quot;...&quot;, &quot;...&quot;, &quot;...&quot;] }},
{{ &quot;option_id&quot;: &quot;opt2&quot;, &quot;text&quot;: &quot;...&quot;, &quot;tags&quot;: [&quot;...&quot;, &quot;...&quot;, &quot;...&quot;] }}
]
}}
]
}}
...
]
}}
Schema Field Reference:
•section_id: unique string per section, format S1, S2, S3
•section_theme: one of the 8 qualitative themes (used by Response Generation for theme priming)

•question_id: unique string per question, format Q1, Q2, Q3 (used by Response Generation to map
responses)
•type: Single Select OR Multi Select (do not blur these into one)
•min_select: minimum number of options the respondent must pick
•max_select: maximum number of options the respondent can pick
•option_id: unique within the question, format opt1, opt2, opt3
•tags: array of 3 to 5 tags from the Tagging Universe defined above

"""
    return prompt
    
    return f"""
You are a senior quantitative research expert designing a survey questionnaire.

---------------------------------------------
### PRIMARY FOCUS: RESEARCH OBJECTIVE
---------------------------------------------

**Research Objective:**
{research_desc}

**Total Sample Size:** {total_sample} respondents

**Target Audience Breakdown:**
{audience_text}

---------------------------------------------
### YOUR TASK
---------------------------------------------

Generate a survey questionnaire that:

1. **DIRECTLY addresses the research objective**
   - Every question must help answer the research question
   - Questions should test hypotheses stated in the objective
   - Focus on the core topic/problem being researched

2. **Considers the sample size and audience**
   - Questions should be appropriate for {total_sample} respondents
   - Options should cover the range of perspectives in the target audience
   - Questions should be relevant to the demographics listed above

3. **Generates actionable insights**
   - Questions should produce data that answers the research objective
   - Options should be mutually exclusive and comprehensive
   - Questions should reveal patterns and preferences

---------------------------------------------
### STRICT STRUCTURAL RULES
---------------------------------------------

- Output **ONLY JSON**.
- Use **these EXACT 3 sections**:

  1. "Attitudes & Preferences"
  2. "Perceptions & Acceptance"  
  3. "Pricing & Purchase Intent"

- Each section must contain **EXACTLY 4 questions**.
- Each question MUST have **4–6 MCQ options**.
- Questions MUST be:
  - Directly derived from the research objective
  - Clear, unbiased, and actionable
  - Appropriate for the target audience
  - Designed to generate quantitative insights

- DO NOT include: id, order, type, metadata.
- DO NOT create persona-specific questions.
- DO create questions that ALL personas can answer based on their traits.

---------------------------------------------
### OUTPUT FORMAT (STRICT)
---------------------------------------------
{{
  "sections": [
    {{
      "title": "Attitudes & Preferences",
      "questions": [
        {{
          "text": "string",
          "options": ["opt1", "opt2", "opt3", "opt4"]
        }}
      ]
    }},
    {{
      "title": "Perceptions & Acceptance",
      "questions": [
        {{
          "text": "string",
          "options": ["opt1", "opt2", "opt3", "opt4"]
        }}
      ]
    }},
    {{
      "title": "Pricing & Purchase Intent",
      "questions": [
        {{
          "text": "string",
          "options": ["opt1", "opt2", "opt3", "opt4"]
        }}
      ]
    }}
  ]
}}

OUTPUT STRICTLY THIS JSON ONLY.
"""

async def generate_questionnaire(objective, personas_list, population, exploration_id):
    """
    Generate ONE questionnaire considering ALL personas.
    personas_list: list of persona dicts
    """
    prompt = await build_questionnaire_prompt(objective, personas_list, population, exploration_id)

    try:
        res = await client.chat.completions.create(
            model="gpt-4.1",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "Generate survey questions in strict JSON only."},
                {"role": "user", "content": prompt}
            ]
        )
    except Exception as e:
        return None, f"LLM Error: {str(e)}"

    raw = res.choices[0].message.content

    try:
        data = json.loads(raw)
        return data, None
    except:
        return None, "Invalid JSON from LLM"


async def store_ai_generated_questionnaire(workspace_id: str, objective_id: str, data: dict, user_id: str, simulation_id: str = None):
    """
    Stores LLM generated questionnaire JSON into DB (sections + questions)
    """
    sections_out = []

    async with AsyncSession(async_engine) as session:
        for sec in data.get("sections", []):
            sec_obj = QuestionnaireSection(
                id=generate_id(),
                workspace_id=workspace_id,
                exploration_id=objective_id,
                simulation_id=simulation_id,
                title=sec.get("title", "Untitled Section"),
                created_by=user_id,
                created_at=datetime.utcnow()
            )
            session.add(sec_obj)
            await session.flush()

            qlist = []
            for q in sec.get("questions", []):
                q_obj = QuestionnaireQuestion(
                    id=generate_id(),
                    section_id=sec_obj.id,
                    text=q.get("text", ""),
                    options=q.get("options", []),
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
            "title": sec["section"].title,
            "questions": [
                {"id": q.id, "text": q.text, "options": q.options}
                for q in sec["questions"]
            ]
        })

    return result

async def create_section(workspace_id, exploration_id, title, user_id, simulation_id=None):
    async with AsyncSession(async_engine) as session:
        sec = QuestionnaireSection(
            id=generate_id(),
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            simulation_id=simulation_id,
            title=title,
            created_by=user_id
        )
        session.add(sec)
        await session.commit()
        await session.refresh(sec)
        return sec


async def update_section(section_id: str, workspace_id: str, exploration_id: str, title: str):
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
        session.add(sec)
        await session.commit()
        await session.refresh(sec)
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
        return True


async def create_question(
    section_id: str,
    workspace_id: str,
    exploration_id: str,
    text: str,
    options: list,
    user_id: str
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

        q = QuestionnaireQuestion(
            id=generate_id(),
            section_id=section_id,
            text=text,
            options=options,
            created_by=user_id
        )
        session.add(q)
        await session.commit()
        await session.refresh(q)
        return q


async def update_question(qid: str, workspace_id: str, exploration_id: str, text: str, options: list):
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

        q.text = text
        q.options = options
        session.add(q)
        await session.commit()
        await session.refresh(q)
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
        return True


async def get_full_questionnaire(workspace_id, exploration_id):
    async with AsyncSession(async_engine) as session:
        questionnaire = select(QuestionnaireSection).where(
            QuestionnaireSection.workspace_id == workspace_id,
            QuestionnaireSection.exploration_id == exploration_id
        )
        sections = (await session.execute(questionnaire)).scalars().all()

        result = []
        for sec in sections:
            questionnaireSection = select(QuestionnaireQuestion).where(
                QuestionnaireQuestion.section_id == sec.id
            )
            questions = (await session.execute(questionnaireSection)).scalars().all()

            result.append({
                "section_id": sec.id,
                "title": sec.title,
                "questions": [
                    {
                        "id": q.id,
                        "text": q.text,
                        "options": q.options
                    }
                    for q in questions
                ]
            })

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
        )
        sections = (await session.execute(questionnaire)).scalars().all()

        result = []
        for sec in sections:
            questionnaireSection = select(QuestionnaireQuestion).where(
                QuestionnaireQuestion.section_id == sec.id
            )
            questions = (await session.execute(questionnaireSection)).scalars().all()

            result.append({
                "section_id": sec.id,
                "title": sec.title,
                "simulation_id": sec.simulation_id,
                "questions": [
                    {
                        "id": q.id,
                        "text": q.text,
                        "options": q.options
                    }
                    for q in questions
                ]
            })

        return result


async def store_parsed_json(workspace_id, objective_id, parsed, user_id, simulation_id=None):
    async with AsyncSession(async_engine) as session:
        sections_saved = []

        for sec in parsed.get("sections", []):
            section_title = sec.get("title", "Untitled Section")
            
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
                    title=section_title,
                    created_by=user_id,
                    created_at=datetime.utcnow()
                )
                session.add(section_obj)
                await session.flush()

            questions_out = []
            for q in sec.get("questions", []):
                q_obj = QuestionnaireQuestion(
                    id=generate_id(),
                    section_id=section_obj.id,
                    text=q.get("text", ""),
                    options=q.get("options", []),
                    created_by=user_id,
                    created_at=datetime.utcnow()
                )
                session.add(q_obj)
                await session.flush()

                questions_out.append({
                    "id": q_obj.id,
                    "text": q_obj.text,
                    "options": q_obj.options
                })

            sections_saved.append({
                "id": section_obj.id,
                "title": section_obj.title,
                "questions": questions_out,
                "is_existing_section": existing_section is not None
            })

        await session.commit()
        return sections_saved
