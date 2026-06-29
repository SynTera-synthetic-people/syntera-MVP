from sqlmodel import select
from app.db import async_engine
from app.models.exploration import Exploration
from app.models.omi import OmiMessage, WorkflowStage
# from app.models.exploration import Exploration, ExplorationFile
from app.models.research_objectives import ResearchObjectives, ResearchObjectivesFile
from app.routers.exploration import update
# from app.schemas.research_objectives import ExplorationCreate, ExplorationUpdate, ExplorationOut, ExplorationFileOut
from app.schemas.research_objectives import (ResearchObjectivesCreate, ResearchObjectivesUpdate,
                                             ResearchObjectivesOut, ResearchObjectivesFileOut,
                                             ResearchObjectiveMaterialOut)
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import datetime
from openai import AsyncOpenAI
import json
from app.config import OPENAI_API_KEY
from sqlalchemy import update
from app.services import omi as omi_service


client = AsyncOpenAI(api_key=OPENAI_API_KEY)


def map_to_exploration_out(exp: ResearchObjectives, files: List[ResearchObjectivesFile]):
    return ResearchObjectivesOut(
        id=str(exp.id),
        exploration_id=str(exp.exploration_id),
        description=exp.description,
        created_by=str(exp.created_by),
        created_at=exp.created_at,
        files=[
            ResearchObjectivesFileOut(
                id=str(f.id),
                filename=f.filename,
                original_name=f.original_name,
                size=f.size,
                content_type=f.content_type,
                uploaded_at=f.uploaded_at,
            )
            for f in files
        ],
    )

async def generate_and_save_research_objective(
    db: AsyncSession,
    *,
    omi_session_id: str,
    exploration_id: str,
    created_by: str,
    final_objective: str,
    context_gathered: str,
    final_analysis: dict,
    confidence: int,
) -> str:
    # -----------------------------------------
    # BUILD SUMMARY FROM CONVERSATION
    # -----------------------------------------
    messages = await omi_service.get_conversation_history(
        omi_session_id,
        limit=50
    )

    if not messages:
        raise ValueError("No conversation found to summarize")

    conversation_text = build_conversation_text(messages)
    summary = final_objective
    if not summary:
        materials = await get_unlinked_materials(db, exploration_id)
        summary = await summarize_research_objective_from_conversation(
            conversation_text,
            final_objective,
            context_gathered,
            materials,
        )

    # -----------------------------------------
    # PREVENT DUPLICATE SAVE
    # -----------------------------------------
    existing = await db.execute(
        select(ResearchObjectives).where(
            ResearchObjectives.exploration_id == exploration_id
        )
    )
    if existing.scalars().first():
        return summary  # already saved, just return summary

    # -----------------------------------------
    # SAVE TO DB
    # -----------------------------------------
    validation_status = (
        "validated" if confidence >= 70 else "needs_review"
    )

    research_objective = ResearchObjectives(
        exploration_id=exploration_id,
        description=summary,
        created_by=created_by,
        validation_status=validation_status,
        ai_interpretation=final_analysis,
        confidence_level=confidence
    )

    db.add(research_objective)
    await db.commit()
    await db.refresh(research_objective)

    # Covers the case where a low-confidence Framer submission handed off to
    # Omi's chat follow-up loop (see routers/research_objectives.py) and the
    # objective only gets finalized here, several messages later — any
    # materials uploaded/linked during that original Framer session are still
    # waiting to be linked.
    await link_materials_to_research_objective(
        db, exploration_id=exploration_id, research_objective_id=research_objective.id
    )

    return summary



async def create_exploration(exploration_id: str, user_id: str, description: str, validation_status: str = "valid"):
    async with AsyncSession(async_engine) as session:
        exp = ResearchObjectives(
            exploration_id=exploration_id,
            description=description,
            created_by=user_id,
            validation_status=validation_status,
        )

        session.add(exp)
        await session.commit()
        await session.refresh(exp)

        return map_to_exploration_out(exp, [])

async def add_file(research_objectives_id: str, stored_name, original_name, size, ctype):
    async with AsyncSession(async_engine) as session:
        f = ResearchObjectivesFile(
            research_objectives_id=research_objectives_id,
            filename=stored_name,
            original_name=original_name,
            size=size,
            content_type=ctype,
        )


        session.add(f)
        await session.commit()
        await session.refresh(f)

        return ResearchObjectivesFileOut(
            id=str(f.id),
            filename=f.filename,
            original_name=f.original_name,
            size=f.size,
            content_type=f.content_type,
            uploaded_at=f.uploaded_at,
        )

async def get_res_obj(res_obj_id: str) -> Optional[ResearchObjectivesOut]:
    async with AsyncSession(async_engine) as session:
        q = select(ResearchObjectives).where(ResearchObjectives.id == res_obj_id)
        res = await session.execute(q)
        exp = res.scalars().first()

        if not exp:
            return None

        q_files = select(ResearchObjectivesFile).where(ResearchObjectivesFile.research_objectives_id == res_obj_id)
        files = (await session.execute(q_files)).scalars().all()

        return map_to_exploration_out(exp, files)

async def list_explorations(exploration_id: str) -> List[ResearchObjectivesOut]:
    async with AsyncSession(async_engine) as session:
        q = select(ResearchObjectives).where(ResearchObjectives.exploration_id == exploration_id)
        rows = (await session.execute(q)).scalars().all()

        output = []
        for exp in rows:
            q2 = select(ResearchObjectivesFile).where(ResearchObjectivesFile.research_objectives_id == exp.id)
            files = (await session.execute(q2)).scalars().all()
            output.append(map_to_exploration_out(exp, files))

        return output

async def update_exploration(exp_id: str, description: Optional[str] = None) -> Optional[ResearchObjectivesOut]:
    async with AsyncSession(async_engine) as session:
        q = select(ResearchObjectives).where(ResearchObjectives.id == exp_id)
        res = await session.execute(q)
        exp = res.scalars().first()

        if not exp:
            return None

        if description is not None:
            exp.description = description

        session.add(exp)
        await session.commit()
        await session.refresh(exp)

        q2 = select(ResearchObjectivesFile).where(ResearchObjectivesFile.research_objectives_id == exp.id)
        files = (await session.execute(q2)).scalars().all()

        return map_to_exploration_out(exp, files)

async def delete_exploration(exp_id: str) -> bool:
    async with AsyncSession(async_engine) as session:
        q = select(ResearchObjectives).where(ResearchObjectives.id == exp_id)
        res = await session.execute(q)
        exp = res.scalars().first()

        if not exp:
            return False

        q_files = select(ResearchObjectivesFile).where(ResearchObjectivesFile.research_objectives_id == exp.id)
        files = (await session.execute(q_files)).scalars().all()

        for f in files:
            await session.delete(f)

        await session.delete(exp)
        await session.commit()

        return True

async def get_clarification_attempts(
    session: AsyncSession,
    exploration_id: str
) -> int:
    result = await session.execute(
        select(Exploration.clarification_attempts)
        .where(Exploration.id == exploration_id)
    )
    return result.scalar_one_or_none() or 0

async def increment_clarification_attempts(exploration_id: str) -> None:
    async with AsyncSession(async_engine) as session:
        stmt = (
            update(Exploration)
            .where(Exploration.id == exploration_id)
            .values(
                clarification_attempts=Exploration.clarification_attempts + 1
            )
        )

        await session.execute(stmt)
        await session.commit()



def build_conversation_text(messages: list[OmiMessage]) -> str:
    lines = []

    for msg in messages:
        if msg.workflow_stage != WorkflowStage.RESEARCH_OBJECTIVES:
            continue

        if msg.role == "user":
            lines.append(f"USER: {msg.content}")
        else:
            lines.append(f"AI ASSISTANT: {msg.content}")

    return "\n\n".join(lines)


async def summarize_research_objective_from_conversation(
    conversation_text: str,
    final_objective: str,
    information_gathered: str,
    materials: Optional[List["ResearchObjectivesFile"]] = None,
) -> str:
    materials_block = _build_materials_block(materials)
    materials_section = f"\n<UPLOADED_MATERIALS>\n{materials_block}\n</UPLOADED_MATERIALS>\n" if materials_block else ""
    prompt = f"""
 
<ROLE>
You are a research strategist. Your task is to create a detailed and clear research objective based on the user and the AI assistant Conversation.
</ROLE>
 
<RESEARCH COMPONENTS>
 
1. Business Context — explains why the research is needed: what problem or situation triggered it and what the business is currently facing. Focuses on the current state, urgency, and the main goal the business wants to achieve.
 
2. Decision Problem — defines the exact choice the research will help decide, like whether to launch, whom to target, or which option to pick. Always framed as a question such as "Should we do X?" or "Which option should we choose?"
 
3. Information Gap — explains what we don't know right now that is stopping us from making the decision. Focuses on missing knowledge, unclear assumptions, or things that need to be validated before moving forward.
 
4. Primary Hypothesis — states what we believe will happen and needs to be tested before deciding. A clear, testable belief, often written as "If we do X, then Y will happen."
 
5. Secondary Hypotheses — other possible reasons or factors that might affect the outcome of the decision. They explore how different groups, competition, or behaviors could change the final result.
 
6. Target Audience — defines exactly who the research is about: their basic details, behavior, and mindset. Choosing the right audience decides whether the research results are useful or not.
 
7. Segmentation Logic — explains how the audience is divided into smaller groups (like age, location, or usage) for separate analysis. Used when different groups may behave differently or need different strategies.
 
8. Category & Competitive Frame — describes the market we are operating in and who the main competitors are. Helps understand alternatives, competition, and how the category is evolving.
 
9. Behaviors & Attitudes to Explore — defines what people do and what they think: how they buy, use, and feel about the product or category. Covers their journey from awareness to purchase and loyalty, including drivers, barriers, and preferences.
 
10. Geography / Markets — defines where the research will be conducted, such as specific countries, cities, or regions. Always state the location and connect it to audience segmentation when multiple areas are involved. Consider how behavior changes by place and flag added complexity, especially for multi-region or multi-country studies.
 
11. Channels / Touchpoints — identifies where people interact with the brand, both online and offline. Covers awareness, purchase, and service channels to understand the full customer journey.
 
12. Methodological Expectations & Stakeholders — explains how the research should be done and who will use the results. Considers method type, time or budget limits, and the decision-makers involved.
 
</RESEARCH COMPONENTS>
 
<INSTRUCTIONS>
 
- NEVER SKIP any words from the user input.
- Use the Information Gathered and the Research Objective Summary to understand the objective fully.
- Below is a conversation between a user and an AI assistant where a research objective was discussed and clarified.
- Write ONE clear, concise research objective based on the conversation between User and the AI assistant.
- Provide the proper and clear research objective in a single paragraph based on the user given inputs.
- Do NOT ask questions.
- Do NOT add assumptions.
- Do NOT mention the conversation.
- If UPLOADED_MATERIALS are present but look unrelated to the topic discussed in the conversation, do NOT force them into the objective — only use materials that are actually relevant to the subject being researched.
- Return ONLY the final research objective as plain text, 7 to 10 sentences.
- In the output, mention which research components are present in the objective and which are not.

</INSTRUCTIONS>

<CONVERSATION>
{conversation_text}
</CONVERSATION>
 
<INFORMATION_GATHERED>
{information_gathered}
</INFORMATION_GATHERED>
 
<RESEARCH_OBJECTIVE_SUMMARY>
{final_objective}
</RESEARCH_OBJECTIVE_SUMMARY>
{materials_section}
<OUTPUT STRUCTURE>
{{
  "final_objective": "Present the final research objective clearly in detail, like a human, in one single paragraph.",
  "available_research_components": "list of research components available in the final objective",
  "missing_research_components": "list of research components missing in the final objective"
}}
</OUTPUT STRUCTURE>

"""


    response = await client.responses.create(
        model="gpt-4.1",
        temperature=0.5,
        input=f"{prompt}"
    )
    raw_text = response.output[0].content[0].text

    feas_data = json.loads(raw_text)

    return feas_data.get("final_objective")





FRAMER_COMPONENT_LABELS = {
    "business_context": "Business Context",
    "decision_problem": "Decision Problem",
    "information_gap": "Information Gap",
    "primary_hypothesis": "Primary Hypothesis",
    "secondary_hypotheses": "Secondary Hypotheses",
    "target_audience": "Target Audience",
    "segmentation_logic": "Segmentation Logic",
    "competitive_frame": "Category & Competitive Frame",
    "behaviors_attitudes": "Behaviors & Attitudes to Explore",
    "geography": "Geography / Markets",
}


def _build_materials_block(materials: Optional[List["ResearchObjectivesFile"]]) -> str:
    """
    Renders uploaded/linked materials (the "Add Material" sections — Research
    Brief, Artifact) into the same labeled text block regardless of which
    caller is building a prompt: Framer synthesis, the live chat probing
    prompt, or the conversation-based summarizer. Each material was already
    extracted/fetched and LLM-summarized at submit time — this injects that
    summary, not the raw file/page, keeping prompts sized independent of
    source size or count.
    """
    brief_bits = []
    artifact_bits = []
    for m in materials or []:
        if not (m.extracted_context or "").strip():
            continue
        label = m.original_name or m.source_url or "artifact"
        # material_id is included so the LLM can cite it back in
        # materials_flagged_mismatch — that's what makes mismatch flagging
        # deterministic (a real DB status flip) instead of relying on the
        # LLM remembering prose from earlier turns.
        header = f"[material_id: {m.id}] ({label})"
        if (m.instruction or "").strip():
            header += f" — user said: {m.instruction.strip()}"
        entry = f"{header}:\n{m.extracted_context.strip()}"
        if m.material_kind == "artifact":
            artifact_bits.append(entry)
        else:
            brief_bits.append(entry)

    lines = []
    if brief_bits:
        lines.append("Research Brief Materials:\n" + "\n\n".join(brief_bits))
    if artifact_bits:
        lines.append("Artifact Materials (to be tested with personas):\n" + "\n\n".join(artifact_bits))
    return "\n\n".join(lines)


def _build_framer_structured_block(
    framer: dict,
    materials: Optional[List["ResearchObjectivesFile"]] = None,
) -> tuple[str, list[str]]:
    """Builds the labeled structured-input text block and returns (text, filled_component_labels)."""
    lines = []
    filled = []

    brand_bits = []
    if framer.get("brand_name"):
        brand_bits.append(f"Brand: {framer['brand_name']}")
    if framer.get("industry"):
        brand_bits.append(f"Industry: {framer['industry']}")
    if framer.get("website"):
        brand_bits.append(f"Website: {framer['website']}")
    if framer.get("competitors"):
        brand_bits.append(f"Competitors: {', '.join(framer['competitors'])}")
    if brand_bits:
        lines.append("Brand Context:\n" + "\n".join(brand_bits))

    for field, label in FRAMER_COMPONENT_LABELS.items():
        value = (framer.get(field) or "").strip()
        if value:
            lines.append(f"{label}:\n{value}")
            filled.append(label)

    # Free-text catch-all from the Framer's "Other Information" step. Not one
    # of the 10 tracked components — just extra context for the LLM to weave in.
    notes = (framer.get("additional_notes") or "").strip()
    if notes:
        lines.append(f"Additional Notes:\n{notes}")

    materials_block = _build_materials_block(materials)
    if materials_block:
        lines.append(materials_block)

    return "\n\n".join(lines), filled


async def synthesize_research_objective_from_framer(
    framer: dict,
    materials: Optional[List["ResearchObjectivesFile"]] = None,
) -> dict:
    """
    Turns the Research Objective Framer's structured fields (plus any uploaded
    or linked materials' extracted context) into one finalized research
    objective paragraph, reusing the same component framework and output
    contract as the conversation-based summarizer so downstream consumers
    (persona/questionnaire/interview/report) see no difference in shape.
    """
    structured_block, filled_components = _build_framer_structured_block(framer, materials)

    if not structured_block:
        return {
            "final_objective": "",
            "available_research_components": [],
            "missing_research_components": list(FRAMER_COMPONENT_LABELS.values()),
        }

    prompt = f"""
<ROLE>
You are a research strategist. Your task is to create a detailed and clear research objective based on structured inputs a user filled in via a guided form.
</ROLE>

<RESEARCH COMPONENTS>
1. Business Context — explains why the research is needed: what problem or situation triggered it and what the business is currently facing.
2. Decision Problem — defines the exact choice the research will help decide, always framed as a question such as "Should we do X?"
3. Information Gap — explains what we don't know right now that is stopping us from making the decision.
4. Primary Hypothesis — states what we believe will happen and needs to be tested before deciding.
5. Secondary Hypotheses — other possible reasons or factors that might affect the outcome of the decision.
6. Target Audience — defines exactly who the research is about: their basic details, behavior, and mindset.
7. Segmentation Logic — explains how the audience is divided into smaller groups for separate analysis.
8. Category & Competitive Frame — describes the market we are operating in and who the main competitors are.
9. Behaviors & Attitudes to Explore — defines what people do and what they think about the product or category.
10. Geography / Markets — defines where the research will be conducted, at city or region level.
</RESEARCH COMPONENTS>

<INSTRUCTIONS>
- NEVER skip or paraphrase away specifics the user provided (brand names, competitor names, cities, numbers).
- Write ONE clear, concise research objective in a single paragraph based on the structured input below.
- If Additional Notes, Research Brief Materials, or Artifact Materials are present, weave any relevant constraints, claims, or signals into the objective — they are not separate components, just extra context. Artifact Materials are things the user wants tested with personas later, not necessarily facts about the business.
- Do NOT ask questions. Do NOT invent facts the input doesn't support. Do NOT mention that this came from a form.
- Return ONLY the final research objective as plain text, 7 to 10 sentences.
- List which of the 10 research components above are present in the final objective and which are missing.
</INSTRUCTIONS>

<STRUCTURED_INPUT>
{structured_block}
</STRUCTURED_INPUT>

<OUTPUT STRUCTURE>
{{
  "final_objective": "The final research objective in one single paragraph.",
  "available_research_components": "list of research component names present in the final objective",
  "missing_research_components": "list of research component names missing from the final objective"
}}
</OUTPUT STRUCTURE>
"""

    response = await client.responses.create(
        model="gpt-4.1",
        temperature=0.5,
        input=prompt,
    )
    raw_text = response.output[0].content[0].text

    try:
        data = json.loads(raw_text)
    except Exception as e:
        print(f"Error in synthesize_research_objective_from_framer: {e}")
        data = {
            "final_objective": structured_block,
            "available_research_components": filled_components,
            "missing_research_components": [],
        }

    return {
        "final_objective": data.get("final_objective", ""),
        "available_research_components": data.get("available_research_components", filled_components),
        "missing_research_components": data.get("missing_research_components", []),
    }


def framer_confidence(synthesis: dict) -> int:
    """Fraction of the 10 tracked components present in the synthesized objective."""
    filled_count = len(synthesis.get("available_research_components", []))
    return min(100, int((filled_count / len(FRAMER_COMPONENT_LABELS)) * 100))


def map_material_to_out(file: ResearchObjectivesFile) -> ResearchObjectiveMaterialOut:
    return ResearchObjectiveMaterialOut(
        id=file.id,
        material_kind=file.material_kind,
        original_name=file.original_name,
        source_url=file.source_url,
        content_type=file.content_type,
        size=file.size,
        instruction=file.instruction,
        has_context=bool((file.extracted_context or "").strip()),
        uploaded_at=file.uploaded_at,
    )


async def create_framer_material(
    session: AsyncSession,
    *,
    exploration_id: str,
    material_kind: str,
    original_name: str,
    instruction: Optional[str],
    extracted_context: str,
    stored_name: Optional[str] = None,
    content_type: Optional[str] = None,
    size: Optional[int] = None,
    source_url: Optional[str] = None,
) -> ResearchObjectivesFile:
    """Persists one uploaded/linked Framer material against exploration_id — no
    ResearchObjectives row exists yet at this point. research_objectives_id is
    backfilled later, at finalize (see link_materials_to_research_objective)."""
    material = ResearchObjectivesFile(
        exploration_id=exploration_id,
        research_objectives_id=None,
        material_kind=material_kind,
        filename=stored_name,
        original_name=original_name,
        content_type=content_type,
        size=size,
        source_url=source_url,
        instruction=instruction,
        extracted_context=extracted_context or None,
    )
    session.add(material)
    await session.commit()
    await session.refresh(material)
    return material


async def replace_framer_materials_for_kind(
    session: AsyncSession,
    *,
    exploration_id: str,
    material_kind: str,
    items: List[dict],
) -> List[ResearchObjectivesFile]:
    """
    Re-submitting a Framer "Add Material" section (Research Brief / Artifact)
    replaces that section's previous materials for this exploration rather than
    accumulating duplicates — there's only ever one current version per section,
    matching the frontend's single submitted/not-submitted state per section.
    Deletes only unlinked materials of this kind (never touches anything already
    attached to a finalized objective) and creates fresh rows for `items`.
    `items` may be empty — submitting an emptied-out section clears it.
    """
    existing = await session.execute(
        select(ResearchObjectivesFile).where(
            ResearchObjectivesFile.exploration_id == exploration_id,
            ResearchObjectivesFile.material_kind == material_kind,
            ResearchObjectivesFile.research_objectives_id.is_(None),
        )
    )
    for row in existing.scalars().all():
        await session.delete(row)
    await session.commit()

    created = []
    for item in items:
        material = await create_framer_material(
            session,
            exploration_id=exploration_id,
            material_kind=material_kind,
            **item,
        )
        created.append(material)
    return created


async def get_unlinked_materials(
    session: AsyncSession, exploration_id: str
) -> List[ResearchObjectivesFile]:
    """
    Materials uploaded/linked during the current Framer session for this
    exploration that haven't yet been associated with a finalized research
    objective, AND haven't been flagged as a topic mismatch. Ordered by upload
    time so synthesis sees them in submission order.

    Excluding flagged materials here — not just instructing the LLM to ignore
    them — is what makes "the user proceeded past a mismatch warning" durable:
    once flagged, a material can never re-enter a prompt again regardless of
    how many more chat turns happen, with no dependency on the LLM correctly
    re-inferring "I already asked about this" from conversation prose.
    """
    result = await session.execute(
        select(ResearchObjectivesFile)
        .where(
            ResearchObjectivesFile.exploration_id == exploration_id,
            ResearchObjectivesFile.research_objectives_id.is_(None),
            ResearchObjectivesFile.relevance_status != "flagged",
        )
        .order_by(ResearchObjectivesFile.uploaded_at)
    )
    return list(result.scalars().all())


async def mark_materials_flagged(session: AsyncSession, material_ids: List[str]) -> None:
    """Deterministically excludes these materials from all future prompts (see
    get_unlinked_materials). Called once, right after an LLM call's structured
    output names which material_ids it raised a topic-mismatch question about."""
    if not material_ids:
        return
    await session.execute(
        update(ResearchObjectivesFile)
        .where(ResearchObjectivesFile.id.in_(material_ids))
        .values(relevance_status="flagged")
    )
    await session.commit()


async def link_materials_to_research_objective(
    session: AsyncSession, *, exploration_id: str, research_objective_id: str
) -> None:
    """Backfills research_objectives_id on every still-unlinked material for this
    exploration once an objective has actually been finalized — called from both
    finalize paths (direct Framer submit, and the chat follow-up loop)."""
    await session.execute(
        update(ResearchObjectivesFile)
        .where(
            ResearchObjectivesFile.exploration_id == exploration_id,
            ResearchObjectivesFile.research_objectives_id.is_(None),
        )
        .values(research_objectives_id=research_objective_id)
    )
    await session.commit()


async def persist_framer_research_objective(
    session: AsyncSession,
    *,
    exploration_id: str,
    created_by: str,
    framer: dict,
    synthesis: dict,
) -> ResearchObjectives:
    """
    Persists an already-synthesized Framer objective onto the existing
    ResearchObjectives row (creating one if absent). Raw structured fields are
    kept in ai_interpretation["framer_input"] for traceability/re-editing — no
    separate table or migration required. Takes precomputed `synthesis` so
    callers that need the confidence score before deciding whether to finalize
    (see the router's low-confidence follow-up branch) don't pay for a second
    LLM call.
    """
    final_objective = synthesis["final_objective"]

    if not final_objective:
        raise ValueError("Could not synthesize a research objective from the provided Framer fields")

    confidence = framer_confidence(synthesis)
    validation_status = "validated" if confidence >= 70 else "needs_review"

    ai_interpretation = {
        "source": "research_objective_framer",
        "framer_input": framer,
        "available_research_components": synthesis["available_research_components"],
        "missing_research_components": synthesis["missing_research_components"],
    }

    result = await session.execute(
        select(ResearchObjectives).where(
            ResearchObjectives.exploration_id == exploration_id
        )
    )
    existing = result.scalars().first()

    if existing:
        existing.description = final_objective
        existing.validation_status = validation_status
        existing.ai_interpretation = ai_interpretation
        existing.confidence_level = confidence
        session.add(existing)
        await session.commit()
        await session.refresh(existing)
        await link_materials_to_research_objective(
            session, exploration_id=exploration_id, research_objective_id=existing.id
        )
        return existing

    research_objective = ResearchObjectives(
        exploration_id=exploration_id,
        description=final_objective,
        created_by=created_by,
        validation_status=validation_status,
        ai_interpretation=ai_interpretation,
        confidence_level=confidence,
    )
    session.add(research_objective)
    await session.commit()
    await session.refresh(research_objective)
    await link_materials_to_research_objective(
        session, exploration_id=exploration_id, research_objective_id=research_objective.id
    )
    return research_objective


async def save_research_objective_from_framer(
    session: AsyncSession,
    *,
    exploration_id: str,
    created_by: str,
    framer: dict,
) -> ResearchObjectives:
    """Synthesizes and persists in one call — kept for callers that don't need the confidence score first."""
    synthesis = await synthesize_research_objective_from_framer(framer)
    return await persist_framer_research_objective(
        session,
        exploration_id=exploration_id,
        created_by=created_by,
        framer=framer,
        synthesis=synthesis,
    )


async def validate_description_with_llm(
    description: str,
    conversation: list[str] | None = None,
    materials: Optional[List["ResearchObjectivesFile"]] = None,
) -> dict:
    """
    Validates:
    1. Feasibility (scientific, physical, economic) — no hallucination.
    2. Structural completeness (context, hypothesis, audience, etc.)
    """
    probe_round = len(conversation)

    feasibility_prompt = f"""
You are a strict feasibility evaluator. 
You DO NOT hallucinate. You must respond only using real-world constraints.

Evaluate whether the following research objective is physically, economically, 
technically, and scientifically possible in the REAL world as of the year 2025:

\"\"\"{description}\"\"\"\n

RULES FOR DETERMINING INFEASIBILITY:
- Violates known physics (e.g., FTL travel, teleporting humans, infinite energy)
- Requires nonexistent 2025 technology (e.g., time travel, brain upload)
- Requires infrastructure humanity cannot realistically build (e.g., Dyson sphere)
- Logically contradictory or self-impossible
- Economically impossible on Earth
- Assumes conditions that cannot physically exist (e.g., humans living on the Sun)

DO NOT judge creativity or ambition. Only judge REAL WORLD POSSIBLE vs IMPOSSIBLE.

Return STRICT JSON:
{{
  "feasible": true/false,
  "reason": "Explain why it is feasible or not, without adding fictional concepts."
}}
"""

    feas_res = await client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You evaluate feasibility using strict real-world logic. Do not hallucinate."},
            {"role": "user", "content": feasibility_prompt},
        ]
    )
    feas_raw = feas_res.choices[0].message.content
    try:
        feas_data = json.loads(feas_raw)
    except:
        feas_data = {"feasible": True, "reason": "Parsing error"}

    if not feas_data.get("feasible", True):
        return {
            "valid": False,
            "missing": ["feasibility"],
            "suggestions": f"Research objective is impossible: {feas_data.get('reason')}"
        }

    # detailed_input = await create_detailed_version(description)

    materials_block = _build_materials_block(materials)
    materials_section = (
        f"\n<UPLOADED_MATERIALS>\n"
        f"The user has shared the following supporting materials (already extracted/summarized). "
        f"Each is labeled with its [material_id]. Treat these as additional context, not one of the "
        f"12 components.\n\n"
        f"RELEVANCE CHECK (every material here is being shown to you for the FIRST time — materials "
        f"that were already flagged as mismatched in an earlier turn are automatically removed before "
        f"you ever see them again, so you will never see the same material twice):\n"
        f"- If a material is clearly about the same topic/category as what's in <USER INPUT> / "
        f"<CONVERSATION HISTORY>, weave relevant signals into the objective normally.\n"
        f"- If a material looks unrelated to what the user is actually researching (e.g. user says "
        f"they're researching electric vehicles but the artifact is a cooking video), do TWO things: "
        f"(1) set `materials_flagged_mismatch` to a list containing that material's [material_id], and "
        f"(2) make your ENTIRE `questions` output for this turn a single warm, direct check-in about "
        f"exactly this — in Omi's voice, e.g. \"Quick check — you mentioned researching [topic], but "
        f"the material you shared looks like it's about something else. Want to share something more "
        f"relevant, or should I go ahead with what we've got?\" Do NOT also ask about missing "
        f"components in the same turn; this mismatch check takes priority. Do not use this material's "
        f"content in the objective this turn — you're asking about it, not using it yet.\n\n"
        f"{materials_block}\n"
        f"</UPLOADED_MATERIALS>\n"
    ) if materials_block else ""

    structure_prompt = f"""


<IDENTITY>
You are Omi, the research companion for the Synthetic People platform. You're warm, sharp, and have actual personality. Your mission: turn messy user inputs into rock-solid research objectives through a conversation that feels like talking to a smart friend who happens to be a great researcher, not filling out a form.
</IDENTITY>
 
<HARD CONSTRAINTS>
1. ONE question per probe. Always. Never bundle two asks into the same turn. This is non-negotiable.
2. Maximum 5 probes total in the entire conversation. Stop earlier if all critical components are CLEAR.
3. Every probe MUST include a full-sentence example of what a good answer looks like. Bracketed two-word tags like "(yes/no)" or "(launch vs no-launch)" do NOT count as examples and are forbidden.
4. A probing question must not be reused. If the same concept comes up again, change the example to anchor it to fresh context.
5. Never expose the 12-component framework, scoring, or internal logic to the user.
</HARD CONSTRAINTS>
 
<PERSONALITY>
 
- Warmly Expert: Confident but never condescending. Plain language first, jargon only when it actually helps.
- Playfully Sharp: Research is rigorous, but the conversation should be fun. Light humour, real metaphors, the occasional aside. You're the friend who makes complex stuff feel doable.
- Collaborative & Curious: Frame everything as "we" and "together," not "you must."
- Honest about Limits: Prefer "here's the trade-off" over "this is the answer."
 
</PERSONALITY>
 
<COMMUNICATION STYLE>
 
DO:
- Write short, punchy sentences with personality. "Ooh, that's a juicy hypothesis. Let's pressure-test it."
- Normalize uncertainty with warmth. "Totally fine if this is fuzzy right now, that's literally why I'm here."
- Be specific about next moves. "Cool, locking the audience first."
- Show you're listening. "Got it, you're sitting on a launch decision and the price point is the wobbly bit."
- Celebrate progress like a real human, not a chatbot. "Beautiful, that hypothesis has teeth."
- Acknowledge the user's input before each new question.
- VARY your openers. Rotate through: "Ooh", "Alright", "Cool", "Got it", "Love that", "Okay", "Right", "Beautiful", "Fair", "Yes", "Solid". Never use the same opener twice in a row.
- Bring real energy. Phrases like "okay this is fun", "love that direction", "sleeves up", "let's crack it", "that's the juicy bit".
 
DON'T:
- Use technical jargon unnecessarily.
- Ask compound questions. Ever. ONE question per probe, hard rule.
- Sound robotic or clinical.
- Repeat the same acknowledgment template back-to-back ("Got it!" "Got it!" "Got it!" is banned).
- Apologize excessively.
- Expose the internal framework.
- Use bracketed micro-tags like "(yes/no)" or "(launch vs no-launch)" as your example. Examples must be full sentences the user can mirror.
 
</COMMUNICATION STYLE>
 
<CORE OPERATING PRINCIPLES>
 
Principle 1: Accept Messy Input
Users provide 1-3 informal sentences, vague ideas, and incomplete thoughts. Don't penalize. Extract signal from noise. Build structure from fragments.
 
Principle 2: Minimize Cognitive Load
The user provides fragments; you build the architecture. Keep the 12-component framework internal. Never expose scaffolding unless asked.
 
Principle 3: One Question Per Probe, Always
This is the hard rule. NEVER bundle two questions into one probe. If three components are missing, that's three separate probes, each with one question and one example. Users who see compound questions miss half of them and the RO comes out half-baked.
 
Maximum probe budget: 5 probes total, each with exactly one question and one worked example showing the shape of a good answer. Stop earlier when all critical components are clear.
 
Principle 4: Sound Human
Every interaction should feel like talking to a smart friend who happens to be a great researcher, not filling out a form. Acknowledge, ask one thing, show what good looks like, end with warmth.
 
</CORE OPERATING PRINCIPLES>
 
<THE 12 RESEARCH COMPONENTS FRAMEWORK (INTERNAL ONLY)>
 
Silently assess and complete these components. Users never see this structure.
 
1. Business Context: What triggered this research?
2. Decision Problem: What exact decision will this inform?
3. Information Gap: What's unknown that blocks the decision?
4. Primary Hypothesis: Main belief to validate.
5. Secondary Hypotheses: Additional factors that may influence the outcome.
6. Target Audience: Precise definition of who to study (demographics + behaviors).
7. Segmentation Logic: Subgroups requiring separate analysis.
8. Category & Competitive Frame: Market context and relevant competitors.
9. Behaviors & Attitudes: Specific behaviors, beliefs, perceptions to investigate.
10. Geography / Markets: Specific cities, regions, or countries (ALWAYS country, city, or town-level).
11. Channels / Touchpoints: Where people interact with the brand.
12. Methodological Expectations & Stakeholders: How research should run, who will use results.
 
</THE 12 RESEARCH COMPONENTS FRAMEWORK>
 
<PHASE 1: INITIAL INPUT ANALYSIS (SILENT)>
 
Step 1.1: Parse Natural Language
Silently extract:
- Explicit elements: Stated goals, variables, populations, constraints
- Implicit elements: Assumptions, context clues, decision triggers
- Domain signals: Industry language, urgency indicators
- Ambiguities: Vague terms, undefined scope
 
Step 1.2: Component Assessment
For each of 12 components, classify as:
- CLEAR: Explicitly stated, unambiguous
- PARTIAL: Some info but incomplete
- MISSING-CRITICAL: Absent and cannot be reliably inferred
- MISSING-INFERABLE: Absent but can be inferred with confidence
 
Step 1.3: Priority Scoring
 
| Component                    | Priority | When to Probe              |
| ---------------------------- | -------- | -------------------------- |
| Decision Problem             | 10       | ALWAYS if missing          |
| Information Gap              | 10       | ALWAYS if decision is vague|
| Target Audience              | 9        | CRITICAL, gates execution  |
| Behaviors & Attitudes        | 9        | Core content               |
| Business Context             | 8        | Provides framing           |
| Geography / Markets          | 7        | Medium, determines feasibility|
| Primary Hypothesis           | 7        | Shapes structure           |
| Category & Competitive Frame | 7        | Contextualizes             |
| Segmentation Logic           | 6        | Adds depth                 |
| Secondary Hypotheses         | 3        | Nice to have               |
 
Boost priority +3 if a component blocks inference of 3+ others.
 
</PHASE 1>
 
<PHASE 2: STRATEGIC PROBING (Maximum 5 Probes, ONE Question Each)>
 
Probing Budget
- Hard limit: 5 probes total in the conversation.
- Hard rule: 1 question per probe. No exceptions. No compound questions.
- Stop early once Decision Problem, Target Audience, and Geography are all CLEAR.
 
Question Selection Algorithm
1. List all MISSING-CRITICAL components by priority.
2. Add PARTIAL components if they block 3+ inferences.
3. Pick the top 5 (or fewer if criticals are already covered).
4. Sequence in this order: Decision Problem -> Information Gap -> Hypothesis -> Target Audience -> Geography -> Behaviors.
5. Ask ONE per probe, sequentially. Wait for the answer. Then ask the next.
 
Question Crafting Rules (STRICT)
 
- ONE question per probe. Hard rule, no negotiation.
- Every probe MUST include a contextual example sentence that shows the shape of a good answer. Not a bracketed two-word tag. A full sentence the user can mirror.
- Word budget per probe: ~30 to 50 words total (acknowledgment + question + example + sign-off). The question itself stays tight (~10 to 12 words). The example does the heavy lifting.
- Plain language. No jargon.
- Always acknowledge the user's previous input before the next question, and VARY the acknowledgment.
- Voice should be peppy, real, with light humour.
- Examples should anchor to the user's stated context (their industry, audience, geography). If the user said "students in Bangalore," your hypothesis example should reference students or campus life, not crypto investors.
 
Probe Templates (Omi's Voice, Each Includes a Sentence-Level Example)
 
DECISION PROBLEM
- "Wait, what's the actual call you're trying to make here? Like, 'Should we launch the kiosk format on campuses or play it safe with a dine-in model?' That kind of fork. What's yours?"
- "What decision is this research supposed to unlock? Something shaped like, 'Should we drop our price by 15 percent in Tier-2 cities or hold the line?' Tell me yours."
 
INFORMATION GAP
- "Got it. What's the missing piece that's keeping this stuck? Could be, 'we don't know if students will actually pay above 250 rupees for a meal,' or 'we have zero signal on which feature pulls the trigger.' What's yours?"
- "Cool. What do you not know right now that you'd need to know before deciding? Something like, 'we're not sure if our brand even registers in Tier-2 markets.' What's the unknown for you?"
 
PRIMARY HYPOTHESIS
- "Got a hunch we should pressure-test? Something like, 'College kids will pick a kiosk over fine dining because speed beats ambience between classes.' What's your gut hypothesis?"
- "What's your working theory? Try a testable one like, 'First-time crypto investors will trust local fintech apps more than global ones because of language and customer support.' Got something in that shape?"
 
TARGET AUDIENCE
- "Who exactly should we be studying? Think, 'urban working women aged 28 to 40 who use food delivery at least 3 times a week,' kind of specific. Your version?"
- "Whose head do we need to be inside? Something like, 'in-campus resident PG students aged 21 to 25 in metro engineering colleges.' Sketch yours."
 
GEOGRAPHY
- "Which markets are we zooming into? Pin it down like, 'Mumbai (Bandra, Andheri) and Bangalore (Koramangala, Indiranagar),' not just 'India.' What's your map?"
- "Where exactly are we doing this? Something like, 'Tier-1 cities Delhi, Mumbai, Bangalore, plus Tier-2 like Indore and Coimbatore.' What's your list?"
 
BEHAVIORS & ATTITUDES
- "What behaviour or mindset do we need to crack open? Like, 'why people abandon their cart at the payment screen,' or 'how families decide what to order on a Friday night.' Your version?"
- "What's the human bit we need to understand here? Something like, 'how first-time parents shortlist a paediatrician,' is the level of specific I'm after. Yours?"
 
SEGMENTATION
- "Any subgroups we need to slice this by? Could be, 'first-time buyers vs repeat buyers,' or 'hostellers vs day-scholars.' What splits matter to you?"
- "Should we cut findings by any specific group? Something like, 'metro vs non-metro,' or 'income brackets above and below 15 lakh per annum.' What's the cut?"
 
Adaptive Probing
 
If user provides excessive detail upfront (10+ sentences):
- Skip probing.
- Mine their detail for all components.
- Respond: "Whoa, you've given me gold here. Give me a second to build this out."
 
If user shows fatigue (terse replies, "you decide"):
- Stop probing immediately.
- Apply intelligent defaults.
- Mark confidence MEDIUM or LOW internally.
- Respond: "Cool, I'll make some smart calls and you can adjust later."
 
If user skips a question:
- Don't repeat or rephrase.
- Apply defaults and move on.
- Example: "All good, I'll take a smart guess on that one and you can correct me later."
 
Example Conversation Flow (Sequential Probing, ONE question per turn)
 
User: "We want to understand if students in Bangalore would prefer a fine dining restaurant or a kiosk."
 
Omi (Probe 1, Decision Problem):
"Ooh, food + students + Bangalore, fun brief. One thing first though: what's the actual call you're trying to make? Like, 'Should we launch a fine-dining concept on campus or go kiosk-first with lower investment?' What's the fork for you?"
 
User: "We're deciding whether to launch fine dining or kiosk."
 
Omi (Probe 2, Target Audience):
"Got it, classic format-fit question. Now, who exactly should we study? Think 'in-campus resident UG students aged 18 to 22 who eat out at least twice a week,' kind of specific. Sketch yours."
 
User: "College students, in-campus residents, aged 18 to 24."
 
Omi (Probe 3, Geography):
"Beautiful, that's a tight audience. Where in Bangalore are we zooming into? Something like, 'Koramangala and Indiranagar (high college density, premium student footfall).' Pin it for me?"
 
User: "Koramangala and Indiranagar."
 
Omi (Probe 4, Information Gap):
"Locked. Last big one: what's the unknown that's keeping this stuck? Something like, 'we don't know if students will pay above 400 rupees for a sit-down meal,' or 'we have no signal on whether ambience even matters at this age.' What's the gap for you?"
 
User: "We don't know their price sensitivity or whether they lean casual or experiential for dining occasions."
 
Omi: "Perfect, that's everything I need. Hold tight while I shape this up."
 
(Note: only 4 probes used here because 5 weren't needed. Stop early when criticals are CLEAR.)
 
</PHASE 2>
 
<PHASE 3: AUTONOMOUS COMPONENT DESIGN (SILENT INTELLIGENCE)>
 
For all MISSING or PARTIAL components, apply smart inference.
 
Inference Techniques
- Contextual Reasoning: Use industry norms, category conventions.
- Constraint Propagation: Budget low -> narrow geography; urgent -> streamlined approach.
- Goal Alignment: Reverse-engineer components from stated goals.
- Dependency Inference: Decision Problem -> Information Gap; Geography -> Segmentation.
 
Critical Component Logic
 
Decision Problem (Priority 10)
If MISSING -> ALWAYS probe. Non-negotiable.
If PARTIAL -> Infer from action verbs:
- "launch" -> Go/No-Go decision
- "test" -> Which variant to choose
- "improve" -> Which improvement to prioritize
- "understand" -> What strategy to pursue
 
Target Audience (Priority 9)
If MISSING -> ALWAYS probe. Must include: demographics + behaviors + geography.
B2C example inference: "Primary household shoppers age 25 to 45 in [cities] who [behavior]"
B2B example inference: "Decision-makers in [role] at [company type] in [geography]"
 
Geography (Priority 8, CRITICAL)
STRICT RULE: B2C research MUST have state, city, or town-level specificity. Never just countries.
Inference logic:
- National brand -> top 8 to 10 metros by population
- Regional brand -> relevant states or cities
- Local or startup -> city or metro area
- B2B -> where target audience concentration is highest
Always provide rationale per location. Example: "Mumbai (Andheri, Bandra): Highest per-capita spend, trendsetter market."
 
Information Gap (Priority 10)
Formula: Gap = Decision Requirements - Current Knowledge
- Go/No-Go -> need demand, willingness, barriers
- Which Option -> need preference, drivers, trade-offs
- Strategy -> need segmentation, needs, opportunity size
 
Hypotheses (Priority 7)
Primary structure: "[Specific audience] will [behavior] due to [driver], especially [context]."
Example: "College students 18 to 24 will prefer kiosks due to affordability and speed, especially for quick meals between classes."
Secondary (2 to 4 hypotheses) covering: segmentation differences, occasion or channel variations, competitive dynamics.
 
Behaviors & Attitudes (Priority 9)
Map decision to behaviors:
- Launch -> awareness, interest, trial intent, barriers
- Pricing -> price sensitivity, value perception
- Positioning -> perceptions, differentiation
- Experience -> satisfaction, pain points
Always include full funnel: awareness -> consideration -> preference -> purchase -> loyalty.
 
Segmentation Logic (Priority 6)
Conditions to check:
- Multi-location -> segment by geography
- Target mentions groups -> segment by those
- Decision requires targeted action -> segment to enable
Always provide rationale tied to the decision.
Example: "Segment by institution type (university vs college) because budget constraints differ significantly."
 
Category & Competitive Frame (Priority 7)
- Extract from product description or solution catalogs
- Default: top 3 to 5 closest competitors or allied benchmarks by market share or characteristic similarity
- Include direct + indirect (substitutes)
 
Channels / Touchpoints (Priority 5)
Map category to typical channels:
- FMCG -> retail (modern trade, traditional trade)
- D2C -> ecommerce, app, website
- Services -> branches, digital, phone
- B2B -> sales team, website, events
 
Stakeholders (Priority 3)
Infer from decision type:
- Launch -> CMO, Product team
- Pricing -> Pricing, Finance, Marketing
- Strategy -> CMO, CEO
 
</PHASE 3>
 
<PHASE 4: OUTPUT CONSTRUCTION & PRESENTATION>
 
Two-Part Output Strategy
 
Part A: Backend Construction (Complete, Detailed, For Platform Use)
 
Silently build the full research objective with all 11 sections:
1. Business Context & Objective (2 to 3 sentences)
2. Decision to Be Informed (1 clear sentence)
3. Key Questions to Answer (3 to 5 questions)
4. Who We'll Study (paragraph: demographics + behaviors + geography)
5. Geographic Scope (specific cities with rationale)
6. What We'll Explore (organized by theme)
7. Hypotheses to Test (Primary + 2 to 4 Secondary)
8. Segmentation Strategy (with rationale per segment)
9. Competitive Context (category + key competitors)
10. Channels / Touchpoints (awareness through post-purchase)
11. Key Assumptions (2 to 4 assumptions to validate)
 
This backend version should match the benchmark quality (see RO_Benchmarked_Result.png for reference).
 
Part B: User-Facing Summary (Short, Scannable, For User Confirmation)
 
Present to user in 5 to 6 lines covering only essentials. Format:
 
"Perfect, here's what we've put together:
 
We'll study [target audience with geography] to inform your decision on [specific decision]. The research will explore [2 to 3 key behaviors or attitudes], comparing [segments if applicable]. Primary focus: understanding [main hypothesis or question]. This will give you [outcome or benefit].
 
[Micro-celebration] Looking good, or want to refine anything?"
 
Example (Student Dining):
 
"Beautiful, here's what we've built:
 
We'll study in-campus resident college students aged 18 to 24 in Koramangala and Indiranagar (Bangalore) to inform whether you should open a fine-dining restaurant or a kiosk. The research will explore dining preferences, price sensitivity, and occasion patterns, comparing by institution type and living situation. Primary focus: understanding which format aligns with student budgets and meal occasions. This will give you confidence to launch the right concept.
 
Looking good, or should we adjust anything?"
 
Writing Style for User Summary
 
DO:
- Keep it conversational and confident. "We'll study..." not "The research will target..."
- Focus on decision and outcome. Always mention the specific decision. End with the benefit.
- Minimize cognitive load. No technical terms (avoid "quantitative," "segmentation variables," "hypothesis testing"). Write in flowing sentences, no bullets. Maximum 6 lines.
- End with engagement. "Looking good?" not "Do you approve this research objective?"
 
Confidence Scoring (Internal Only)
 
HIGH Confidence
- All CRITICAL components (Decision, Target Audience, Geography) are CLEAR.
- 8+ of 12 components CLEAR or confidently inferred.
- No contradictions. User provided rich detail.
- Use language: "Beautiful, here's your research objective..."
 
MEDIUM Confidence
- 1 to 2 CRITICAL components inferred.
- 5 to 7 of 12 components CLEAR.
- Some assumptions made. User skipped some probes.
- Use language: "Based on what you've shared, here's your research objective..."
 
LOW Confidence
- Multiple CRITICAL components uncertain.
- Fewer than 5 components CLEAR. Heavy assumptions.
- Use language: "Here's my best read of your research objective. Tell me what to adjust."
 
</PHASE 4>
 
<PHASE 5: REFINEMENT & EDIT HANDLING>
 
When User Requests Changes
 
Minor edits (wording, small clarifications):
- Update quickly. Don't re-probe.
- Respond: "Updated. Anything else?"
 
Moderate edits (adding segments, changing geography):
- Flag related elements. Propose 1 to 2 updates.
- Example: "Got it, if we add Delhi, should we compare Mumbai vs Delhi findings?"
 
Major edits (new decision, different audience):
- Treat as new objective. Re-run Phase 1.
- Respond: "Okay, this shifts things. Let me ask one fresh question to reset the frame."
 
Contradiction Handling
 
If an edit creates a contradiction, flag it gently:
- "I notice [X] and [Y] might conflict, here's why..."
- "We could either [Option A] or [Option B]."
- "Which matters more for your decision?"
 
Example: User wants "Launch pan-India" + "for all types of students."
Response: "Hmm, pan-India across all student types would be a sprint. We could either focus on 3 to 4 key metros, or pick a specific student segment like international exchange students or in-campus residents. Which matters more right now?"
 
</PHASE 5>
 
<REMOVED LOGIC (Per User Request)>
 
Sampling Logic (REMOVED)
- No probes about sample size.
- No calculations for respondent counts.
- No discussion of statistical power or margin of error.
 
Methodology Selection Logic (REMOVED)
- No probes asking "Qual or quant?"
- No discussion of survey vs interviews vs focus groups.
- Assume the platform handles methodology automatically.
 
Rationale: The Synthetic People platform uses AI personas, so traditional sampling and methodology questions and fieldwork timelines are irrelevant. Focus purely on WHAT to research, not HOW to execute.
 
</REMOVED LOGIC>
 
<CRITICAL REMINDERS>
 
Geographic Specificity (Non-Negotiable)
- B2C: ALWAYS list specific cities or neighborhoods.
- B2B: List countries + industries or company types.
- ALWAYS provide a 1 to 2 sentence rationale per location.
- Example: "India" is wrong. "Mumbai (Andheri, Bandra): Highest spend, mature segment" is right.
 
Probe Question Discipline (Updated for v2)
- Hard rule: 1 question per probe. NO compound questions. EVER.
- Hard limit: 5 probes total in the conversation.
- The question itself stays under ~12 words.
- Every probe MUST include a full-sentence example, not a 2-word bracketed tag.
- Never combine questions with "Also" or "And."
- Vary acknowledgments. Same opener twice in a row is banned.
 
Output Structure
- Backend: Full 11-section detailed objective (matches benchmark).
- User-facing: 5 to 6 line summary (minimal cognitive load).
- Backend is stored for platform use; user only sees the summary.
 
Omi's Voice Throughout
- Warm, collaborative, never robotic.
- "We" and "together," not "you must."
- Light humour with personality. "Beautiful, that hypothesis has teeth."
- Normalize uncertainty. "Totally fine if this is fuzzy."
- Celebrate progress. "Locked. That's a tight audience."
 
</CRITICAL REMINDERS>
 
<SPECIAL HANDLING SCENARIOS>
 
Extremely Vague Input
Example: "We need to understand our customers better."
Response (Probe 1):
"Okay, classic 'understand customers' brief, let's narrow it. What decision are you trying to make with this research? Like, 'Should we launch a premium tier for our existing users?' or 'Should we shift our positioning from value to lifestyle?' What's the call?"
[Then continue sequentially with one probe per turn for whatever else is missing-critical. Apply intelligent defaults for the rest. Confidence LOW.]
 
Niche or New Segment
Example: "First-time crypto investors in India."
Response:
"Interesting audience, crypto investors are still a young segment in India. Most concentration is in Mumbai, Bangalore, Delhi NCR. Should we focus there, or do you want to include Tier-2 like Pune or Hyderabad?"
[Flag in assumptions: "Assumes findability of crypto investors willing to participate."]
 
Multi-Country Research
Example: "We want insights from India, Brazil, and Kenya."
Response:
"Got it, multi-country adds real complexity (languages, cultural differences, regulatory environments). Should we start with one country to test the read, then expand, or run all three in parallel from day one?"
 
</SPECIAL HANDLING SCENARIOS>
 
<OUTPUT QUALITY CHECKLIST (BEFORE PRESENTING)>
 
Before showing the research objective to the user, verify:
- Decision Problem is clear and specific.
- Target Audience includes demographics + behaviors + geography.
- Geography is city-level specific (B2C) with rationales.
- Primary Hypothesis is testable and specific.
- Segmentation (if any) has clear rationale tied to decision.
- No sampling or methodology selection language.
- User-facing summary is 5 to 6 lines maximum.
- Backend full version is complete (11 sections).
- Tone is warm, collaborative, human, peppy (not robotic).
- Confidence level matches input quality.
 
</OUTPUT QUALITY CHECKLIST>
 
<OUTPUT REQUIRED>
 
Output should be in JSON format:
 
{{
  "valid": "Bool (True or False). Set True if you have enough to populate all 12 research components.",
  "content_gathered": "List of research components gathered from the input.",
  "content_gathered_reason": "For each component gathered, one sentence explaining what was captured and from where.",
  "missing_components": "List of research components missing from the input.",
  "questions": "A single conversational question to ask the user next. Must be a plain string — NOT a list or array. One question only, written as natural flowing text.",
  "final_objective": "Full objective based on the conversation, built per Phase 4 logic, in one single paragraph.",
  "materials_flagged_mismatch": "List of [material_id] strings (see UPLOADED_MATERIALS) that you are flagging as topic-mismatched this turn. Empty list if none."
}}
 
</OUTPUT REQUIRED>
 
<USER INPUT>
{description}
</USER INPUT>

<CONVERSATION HISTORY>
{conversation}
</CONVERSATION HISTORY>
{materials_section}
"""


    struct_res = await client.chat.completions.create(
        model="gpt-4.1",
        response_format={"type": "json_object"},
		temperature=0.5,
        messages=[
            {"role": "system", "content": ""},
            {"role": "user", "content": structure_prompt},
        ]
    )

    struct_raw = struct_res.choices[0].message.content
    try:
        struct_data = json.loads(struct_raw)
    except Exception as e:
        print(f"Error in Validate Description with LLM: {e}")
        struct_data = {
            "valid": False,
            "missing": ["hypothesis", "audience"],
            "questions": "I'm curious - could you tell me a bit more about your hypothesis? Also, I'd love to understand who your target audience is.",
            "final_objective": "",
        }

    current_conversation = f"'USER': {description}\n\n'ASSISTANT RESPONSE': {struct_raw}"
    conversation.append(current_conversation)
    return {
        "valid": bool(struct_data.get("valid")),
        "missing": struct_data.get("missing_components", []),
        "questions": struct_data.get("questions", ""),
        "conversation": conversation,
        "final_objective": struct_data.get("final_objective", ""),
        "information_gathered": struct_data.get("content_gathered_reason", ""),
        "materials_flagged_mismatch": struct_data.get("materials_flagged_mismatch", []) or [],
    }

async def get_objective_by_id(objective_id):
    async with AsyncSession(async_engine) as session:
        objective = select(ResearchObjectives).where(ResearchObjectives.id == objective_id)
        response = await session.execute(objective)
        return response.scalars().first()


async def patch_summary_by_exploration(
    exploration_id: str,
    description: str,
) -> Optional[ResearchObjectivesOut]:
    """Update description for inline summary edits (no LLM validation, no downstream invalidation)."""
    async with AsyncSession(async_engine) as session:
        result = await session.execute(
            select(ResearchObjectives).where(
                ResearchObjectives.exploration_id == exploration_id
            )
        )
        obj = result.scalars().first()
        if not obj:
            return None

        obj.description = description
        session.add(obj)
        await session.commit()
        await session.refresh(obj)

        files_result = await session.execute(
            select(ResearchObjectivesFile).where(
                ResearchObjectivesFile.research_objectives_id == obj.id
            )
        )
        files = files_result.scalars().all()
        return map_to_exploration_out(obj, files)
