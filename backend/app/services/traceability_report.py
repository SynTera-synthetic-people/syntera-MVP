import json
import os
from datetime import datetime
from typing import Tuple, Optional, List, Any, Dict, Set

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.config import OPENAI_API_KEY
from app.models.exploration import Exploration
from app.models.interview import Interview
from app.models.omi import OmiSession
from app.models.persona import Persona
from app.models.survey_simulation import SurveySimulation
from app.models.traceability import TraceabilityReport
from app.services.auto_generated_persona import get_description
from app.services.omi import get_conversation_history
from app.services.research_objectives import build_conversation_text

# -------------------------------------------------------------------
# OpenAI Client (async-safe, single instance per process)
# -------------------------------------------------------------------
client = AsyncOpenAI(api_key=OPENAI_API_KEY)

# -------------------------------------------------------------------
# Database Engine & Session (DEFINED ONCE)
# -------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

async def get_exploration_method_flags(
    exploration_id: str
) -> Tuple[Optional[bool], Optional[bool]]:
    """
    Returns:
        (is_quantitative, is_qualitative)
    """

    async with AsyncSessionLocal() as session:
        stmt = (
            select(
                Exploration.is_quantitative,
                Exploration.is_qualitative
            )
            .where(Exploration.id == exploration_id)
        )

        result = await session.execute(stmt)
        row = result.first()

        if not row:
            return None, None

        return row.is_quantitative, row.is_qualitative


async def get_existing_traceability_report(exploration_id: str):
    async with AsyncSessionLocal() as session:
        stmt = (
            select(TraceabilityReport)
            .where(TraceabilityReport.exploration_id == exploration_id)
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------
async def get_session_id_and_info(
    exploration_id: str
) -> Tuple[Optional[str], Optional[str]]:
    """
    Returns:
      omi_session_id, information_gathered
    """
    async with AsyncSessionLocal() as session:
        stmt = (
            select(OmiSession.id, OmiSession.context)
            .where(OmiSession.context["exploration_id"].astext == exploration_id)
            .limit(1)
        )

        result = await session.execute(stmt)
        row = result.first()

        if not row:
            return None, None

        omi_session_id, context = row
        return omi_session_id, context.get("information_gathered")

async def upsert_traceability_report(
    exploration_id: str,
    ro: dict | None = None,
    persona: dict | None = None,
    quant: dict | None = None,
    qual: dict | None = None
):
    async with AsyncSessionLocal() as session:
        stmt = select(TraceabilityReport).where(
            TraceabilityReport.exploration_id == exploration_id
        )
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            if ro is not None:
                existing.ro_traceability = ro
            if persona is not None:
                existing.persona_traceability = persona
            if quant is not None:
                existing.quant_traceability = quant
            if qual is not None:
                existing.qual_traceability = qual

            existing.updated_at = datetime.utcnow()

        else:
            session.add(
                TraceabilityReport(
                    exploration_id=exploration_id,
                    ro_traceability=ro or {},
                    persona_traceability=persona or {},
                    quant_traceability=quant or {},
                    qual_traceability=qual or {},
                )
            )

        await session.commit()


async def get_results_and_simulation_results(
    exploration_id: str
) -> Tuple[List[Any], List[Any]]:
    """
    Returns:
      - results: all values from `result` column
      - response_result: all values from `simulation_result` column
    """

    async with AsyncSessionLocal() as session:
        stmt = (
            select(
                SurveySimulation.results,
                SurveySimulation.simulation_result
            )
            .where(SurveySimulation.exploration_id == exploration_id)
        )

        rows = (await session.execute(stmt)).all()

        results = [row.results for row in rows if row.results is not None]
        response_result = [
            row.simulation_result
            for row in rows
            if row.simulation_result is not None
        ]

    return results, response_result

def count_unique_reference_sites(persona_groups: Dict[str, List[Any]]) -> int:
    """
    Counts unique reference_sites_with_usage links across all personas
    """

    unique_links: Set[str] = set()

    for personas in persona_groups.values():
        for persona in personas:
            if not isinstance(persona, dict):
                continue

            links = persona.get("reference_sites_with_usage")

            if not isinstance(links, list):
                continue

            for link in links:
                if isinstance(link, str) and link.strip():
                    unique_links.add(link.strip())

    return len(unique_links)


async def get_personas_grouped_by_generation(
    exploration_id: str
) -> Dict[str, List[Any]]:
    """
    Returns personas grouped as:
    - omi_generated (auto_generated_persona = True)
    - manual_generated (auto_generated_persona = False)
    """

    result = {
        "omi_generated": [],
        "manual_generated": []
    }

    async with AsyncSessionLocal() as session:
        stmt = (
            select(
                Persona.persona_details,
                Persona.auto_generated_persona
            )
            .where(Persona.exploration_id == exploration_id)
        )

        rows = (await session.execute(stmt)).all()

        for persona_details, auto_generated in rows:
            if auto_generated:
                result["omi_generated"].append(persona_details)
            else:
                result["manual_generated"].append(persona_details)

    return result

from typing import List, Any, Tuple


def prepare_quant_inputs(
    results: List[Any],
    response_result: List[Any],
    max_items: int = 2
) -> Tuple[List[Any], List[Any]]:
    """
    - Keeps result & response_result aligned by index
    - Removes empty / invalid entries
    - Limits to max_items (default = 2)
    """

    aligned_pairs = []

    # Zip ensures index alignment
    for res, resp in zip(results, response_result):
        # Skip empty or invalid entries
        if not res or not resp:
            continue

        # Skip empty dicts explicitly
        if res == {} or resp == {}:
            continue

        aligned_pairs.append((res, resp))

        if len(aligned_pairs) == max_items:
            break

    # Unzip back into two lists
    filtered_results = [pair[0] for pair in aligned_pairs]
    filtered_response_result = [pair[1] for pair in aligned_pairs]

    return filtered_results, filtered_response_result

def prepare_omi_personas_quant(
    personas_grouped: dict,
    max_items: int = 3
) -> List[Any]:
    """
    - Uses ONLY omi_generated personas
    - Removes empty / invalid entries
    - Limits to max_items (default = 3)
    """

    omi_personas = personas_grouped.get("omi_generated", [])

    filtered_personas = []

    for persona in omi_personas:
        # Skip None or non-dict personas
        if not isinstance(persona, dict):
            continue

        # Skip empty persona objects
        if not persona:
            continue

        filtered_personas.append(persona)

        if len(filtered_personas) == max_items:
            break

    return filtered_personas

async def fetch_interviews_by_exploration(
    exploration_id: str,
    limit: int = 2
) -> list[Interview]:
    async with AsyncSessionLocal() as session:
        stmt = (
            select(Interview)
            .where(Interview.exploration_id == exploration_id)
            .order_by(Interview.created_at.asc())
            .limit(limit)
        )

        return (await session.execute(stmt)).scalars().all()

def extract_discussion_guide_from_messages(messages: list) -> dict:
    sections = {}
    probe_examples = []

    for msg in messages:
        if msg.get("role") != "user":
            continue

        text = msg.get("text", "")
        meta = msg.get("meta", {})
        section = meta.get("section", "Uncategorized")

        sections.setdefault(section, []).append(text)

        # Simple probe detection
        if any(
            kw in text.lower()
            for kw in ["why", "tell me more", "how did", "can you explain"]
        ):
            probe_examples.append(text)

    return {
        "sections": [
            {
                "section_name": sec,
                "questions": qs
            }
            for sec, qs in sections.items()
        ],
        "probe_examples": probe_examples[:5]  # limit for prompt safety
    }

def map_generated_answers_by_persona(generated_answer: dict) -> dict:
    persona_map = {}

    for question, payload in generated_answer.items():
        persona_id = payload.get("persona_id")
        if not persona_id:
            continue

        persona_map.setdefault(persona_id, []).append({
            "question": question,
            "answer": payload.get("persona_answer"),
            "implications": payload.get("implications", [])
        })

    return persona_map

async def build_qualitative_prompt_inputs(exploration_id: str) -> dict:
    interviews = await fetch_interviews_by_exploration(
        exploration_id=exploration_id,
        limit=2
    )

    qualitative_input = {
        "interviews_analyzed": len(interviews),
        "discussion_guide_evidence": [],
        "persona_response_evidence": {}
    }

    for interview in interviews:
        # 1. Guide evidence from messages
        guide = extract_discussion_guide_from_messages(interview.messages)
        qualitative_input["discussion_guide_evidence"].append(guide)

        # 2. Persona-mapped responses
        persona_map = map_generated_answers_by_persona(
            interview.generated_answers or {}
        )

        for persona_id, responses in persona_map.items():
            qualitative_input["persona_response_evidence"].setdefault(
                persona_id, []
            ).extend(responses)

    return qualitative_input


# -------------------------------------------------------------------
# MAIN SERVICE FUNCTION
# -------------------------------------------------------------------
async def get_traceability_reports(
    exploration_id: str,
    is_quant: bool,
    is_qual: bool
) -> dict:
    """
    Generates Research Objective traceability + RO score.
    """

    # 1. Research Objective Traceability
    research_objective_summary = await get_description(exploration_id)

    omi_session_id, information_gathered = await get_session_id_and_info(exploration_id)
    if not omi_session_id:
        raise ValueError("No OMI session found for exploration_id")

    messages = await get_conversation_history(omi_session_id)
    conversation_text = build_conversation_text(messages)

    # ---RO Report Prompt ---
    ro_prompt = f"""
<ROLE>
You are a senior research strategist and research quality auditor.
Your task is to extract, evaluate, and validate research components based strictly on the provided inputs.
</ROLE>

<RESEARCH COMPONENT DEFINITIONS>
Each research objective may contain up to the following 10 components:

1. Business Context – Why the research exists and what business situation triggered it.
2. Decision Problem – The specific decision the research will inform, framed as a clear question.
3. Information Gap – What is unknown or unclear and prevents decision-making.
4. Primary Hypothesis – The main testable belief that the research will validate.
5. Secondary Hypotheses – Additional hypotheses that may influence the outcome.
6. Target Audience – Who the research focuses on, including demographics or mindset.
7. Segmentation Logic – How the audience is divided into sub-groups for analysis.
8. Category Competitive Frame – The category scope and key competitors.
9. Behaviors Attitudes – What people do, think, feel, and how they behave in the category.
10. Geography – Where the research applies (cities, regions, countries).

</RESEARCH COMPONENT DEFINITIONS>

<RESEARCH OBJECTIVE SCORING FRAMEWORK>

Evaluate the overall quality of the research objective using the following weighted criteria and it should be greater then 75:

• Completeness (60% weight)
  - Based on how many of the 10 research components are present and usable
  - "clear" components contribute most
  - "partial" and "inferred" components contribute less
  - "missing" components contribute nothing

• Specificity (25% weight)
  - Based on how precise, concrete, and decision-ready the component values are
  - Penalize vague, generic, or broad wording

• Evidence (15% weight)
  - Based on how well the component values are grounded in the provided inputs
  - Penalize assumptions or unsupported claims

</RESEARCH OBJECTIVE SCORING FRAMEWORK>


<STATUS RULES>
For EACH component, assign EXACTLY ONE status:

- "clear" → explicitly stated and well-defined
- "partial" → mentioned but incomplete or vague
- "inferred" → not directly stated but reasonably inferred from context
- "missing" → not present or cannot be inferred

DO NOT over-infer. Be strict and conservative.
</STATUS RULES>

<VALUE RULES>
For each research component value:

- The value MUST be clear, concise, and UI-ready
- Maximum length: 1–2 short sentences (preferably 1)
- NO explanations, reasoning, or background context
- NO references to conversations, users, or AI
- NO hedging language (e.g., "likely", "possibly", "seems")
- NO bullet points or lists
- Use plain, direct business language
- If the component is missing, set value EXACTLY to: "Not specified"
- Do NOT restate component definitions in the value
- Write values as definitive statements, not commentary

Think of each value as something that can be directly shown in a table cell without further editing.
</VALUE RULES>

<SCORING RULES>
- The score should be > 75
- Assign a score from 0–100 for each criterion
- Apply the specified weights internally
- Output ONLY the final Research Objective Score as a whole number
- Do NOT show calculations
- Do NOT explain how the score was derived
- Be strict and conservative when scoring

</SCORING RULES>

<INPUTS>
Conversation:
{conversation_text}

Information Gathered:
{information_gathered}

Research Objective Summary:
{research_objective_summary}
</INPUTS>

<INSTRUCTIONS>
- NEVER invent new information
- NEVER add assumptions
- Use only the provided inputs
- Extract a concise value for each component if present
- If missing, set value to "Not specified"
- Output MUST be valid JSON
- Output MUST include ALL 10 components
</INSTRUCTIONS>

<OUTPUT FORMAT IN JSON>
Never skip any component and ro_score should be greater then 75
{{
  "components": [
    {{
      "component": "Business Context",
      "value": "",
      "status": ""
    }},
    {{
      "component": "Decision Problem",
      "value": "",
      "status": ""
    }},
    {{
      "component": "Information Gap",
      "value": "",
      "status": ""
    }},
    {{
      "component": "Primary Hypothesis",
      "value": "",
      "status": ""
    }},
    {{
      "component": "Secondary Hypotheses",
      "value": "",
      "status": ""
    }},
    {{
      "component": "Target Audience",
      "value": "",
      "status": ""
    }},
    {{
      "component": "Segmentation Logic",
      "value": "",
      "status": ""
    }},
    {{
      "component": "Category Competitive Frame",
      "value": "",
      "status": ""
    }},
    {{
      "component": "Behaviors Attitudes",
      "value": "",
      "status": ""
    }},
    {{
      "component": "Geography",
      "value": "",
      "status": ""
    }}
  ],
  "ro_score": 0 - 100
}}
</OUTPUT FORMAT>
    """
    ro_response = await client.responses.create(
        model="gpt-4.1",
        input=[{"role": "user", "content": ro_prompt}],
    )

    ro_result =  json.loads(ro_response.output_text)
    ro_result["summary"] = research_objective_summary

    # 2. Persona Traceability

    personas_grouped = await get_personas_grouped_by_generation(exploration_id)
    unique_count = count_unique_reference_sites(personas_grouped)
    persona_result = {
        "data":{
            "persona_details": personas_grouped,
            "number_of_sites_researched":unique_count,
        }
    }

    # 4. Quantitative Traceability
    results, response_result = await get_results_and_simulation_results(
        exploration_id
    )
    results, response_result = prepare_quant_inputs(
        results=results,
        response_result=response_result,
        max_items=1
    )
    omi_personas = prepare_omi_personas_quant(
        personas_grouped=personas_grouped,
        max_items=1
    )

    quant_prompt = f"""
<ROLE>
You are a senior quantitative research methodologist and quality auditor.
Your task is to evaluate the methodological quality of a quantitative research study
based strictly on the provided inputs.
</ROLE>

<EVALUATION FRAMEWORK>
Assess the study across the following six quality dimensions:

1. Hypothesis–Question Mapping
2. Thematic Coverage
3. Scale Validity
4. Bias Control
5. Flow & Respondent Experience
6. Analysis-Readiness
</EVALUATION FRAMEWORK>

<SCORING RULES>
- Assign a score from 0–100 for EACH quality dimension
- Scores must reflect methodological rigor, not outcomes
- Be strict and conservative
- Do NOT assume best practices unless explicitly evident
</SCORING RULES>

<JUSTIFICATION RULES>
- Provide 1 concise justification sentence per dimension
- Reference only the provided inputs
- Do NOT add assumptions or recommendations
</JUSTIFICATION RULES>

<INPUTS>

<RESEARCH OBJECTIVE>
{research_objective_summary}
</RESEARCH OBJECTIVE>

<PERSONA DETAILS>
{omi_personas}
</PERSONA DETAILS>

<SURVEY ANSWERS>
{results}
</SURVEY ANSWERS>

<DATASET SUMMARY & STATISTICAL METHODS & OUTPUTS>
{response_result}
</DATASET SUMMARY & STATISTICAL METHODS & OUTPUTS>

</INPUTS>

<OVERALL SCORE FORMULA>
(Objective × 0.25) + (Themes × 0.20) + (Rigor × 0.25) + (Hypotheses × 0.20) + (Respondent × 0.10)
</OVERALL SCORE FORMULA>

<OUTPUT FORMAT>
Return STRICT JSON only and score can be 0 to 100.

{{
  "quality_scores": [
    {{
      "dimension": "Hypothesis–Question Mapping",
      "score": 0,
      "justification": ""
    }},
    {{
      "dimension": "Thematic Coverage",
      "score": 0,
      "justification": ""
    }},
    {{
      "dimension": "Scale Validity",
      "score": 0,
      "justification": ""
    }},
    {{
      "dimension": "Bias Control",
      "score": 0,
      "justification": ""
    }},
    {{
      "dimension": "Flow & Respondent Experience",
      "score": 0,
      "justification": ""
    }},
    {{
      "dimension": "Analysis-Readiness",
      "score": 0,
      "justification": ""
    }}
  ],
  "overall_score": "Provide the overall score using the overall score formula"
}}
</OUTPUT FORMAT>
"""
    if is_quant:
        quant_response = await client.responses.create(
                model="gpt-4.1",
                input=[{"role": "user", "content": quant_prompt}],
            )

        quant_result =  json.loads(quant_response.output_text)
    else:
        quant_result = None

    # 3. Qualitative
    qualitative_input = await build_qualitative_prompt_inputs(exploration_id)
    qual_prompt = f"""
<ROLE>
You are a senior qualitative research methodologist and discussion-guide quality auditor.
Your task is to evaluate the methodological quality of a qualitative discussion guide
based strictly on the provided inputs.
</ROLE>

<EVALUATION FRAMEWORK>
Assess the discussion guide across the following six quality dimensions:

1. Thematic Coverage
2. Conversational Flow
3. Probe Depth
4. Psychological Safety
5. Bias Mitigation
6. Moderator Support
</EVALUATION FRAMEWORK>

<SCORING RULES>
- Assign a score from 0–100 for EACH quality dimension
- Scores must reflect guide design quality, not moderator performance
- Be strict and conservative
- Do NOT assume best practices unless explicitly visible
</SCORING RULES>

<JUSTIFICATION RULES>
- Provide exactly 1 concise justification sentence per dimension
- Reference only the provided inputs
- Do NOT add assumptions, advice, or recommendations
</JUSTIFICATION RULES>

<INPUTS>

<RESEARCH OBJECTIVE>
{research_objective_summary}
</RESEARCH OBJECTIVE>

<PERSONA CONTEXT>
{omi_personas}
</PERSONA CONTEXT>

<DISCUSSION GUIDE EVIDENCE>
{qualitative_input["discussion_guide_evidence"]}
</DISCUSSION GUIDE EVIDENCE>

<PERSONA RESPONSE EVIDENCE>
{qualitative_input["persona_response_evidence"]}
</PERSONA RESPONSE EVIDENCE>

</INPUTS>

<OVERALL SCORE FORMULA>
(Thematic Depth × 0.30) + (Flow × 0.20) + (Question Quality × 0.25) + (Probes × 0.15) + (Bias Control × 0.10)
</OVERALL SCORE FORMULA>

<OUTPUT FORMAT>
Return STRICT JSON only. **Never miss any dimension**

{{
"quality_scores": [
    {{
    "dimension": "Thematic Coverage",
      "score": 0,
      "justification": ""
    }},
    {{
    "dimension": "Conversational Flow",
      "score": 0,
      "justification": ""
    }},
    {{
    "dimension": "Probe Depth",
      "score": 0,
      "justification": ""
    }},
    {{
    "dimension": "Psychological Safety",
      "score": 0,
      "justification": ""
    }},
    {{
    "dimension": "Bias Mitigation",
      "score": 0,
      "justification": ""
    }},
    {{
    "dimension": "Moderator Support",
      "score": 0,
      "justification": ""
    }}
  ],
  "overall_score": "Provide the overall score using the overall score formula"
}}
</OUTPUT FORMAT>
"""
    if is_qual:
        qual_response = await client.responses.create(
                model="gpt-4.1",
                input=[{"role": "user", "content": qual_prompt}],
            )

        qual_result =  json.loads(qual_response.output_text)
    else:
        qual_result = None

    final_result_traceability = {
        "ro_traceability": ro_result,
        "persona_traceability": persona_result,
        "qual_traceability": qual_result,
        "quant_traceability": quant_result,
    }

    return final_result_traceability