from sqlmodel import select
from app.db import async_engine
from app.models.omi import OmiSession, OmiMessage, OmiWorkflowAction, OmiState, WorkflowStage
from app.schemas.omi import (
    OmiSessionOut, OmiMessageOut, OmiActionOut,
    OmiChatResponse, OmiGuidanceResponse, OmiValidationResponse
)
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Dict, Any, List
from datetime import datetime
from openai import AsyncOpenAI
from app.config import OPENAI_API_KEY
import json
from app.services import organization as org_service
from app.services.research_objectives import validate_description_with_llm
from app.services import research_objectives as exp_service
from app.services.research_objectives import generate_and_save_research_objective
from sqlalchemy.orm.attributes import flag_modified



client = AsyncOpenAI(api_key=OPENAI_API_KEY)


# ============================================================================
# SESSION MANAGEMENT
# ============================================================================

async def get_or_create_session(exploration_id: str, user_id: str) -> OmiSession:
    """Get existing Omi session or create a new one"""
    async with AsyncSession(async_engine) as session:
        # Try to get existing session
        query = select(OmiSession).where(
            OmiSession.exploration_id == exploration_id,
            OmiSession.user_id == user_id
        ).order_by(OmiSession.last_interaction.desc())
        
        result = await session.execute(query)
        omi_session = result.scalars().first()
        
        if omi_session:
            # Update last interaction
            omi_session.last_interaction = datetime.utcnow()
            omi_session.updated_at = datetime.utcnow()
            session.add(omi_session)
            await session.commit()
            await session.refresh(omi_session)
            return omi_session, False
        
        # Get workspace to fetch organization_id
        from app.models.exploration import Exploration
        exploration_query = select(Exploration).where(Exploration.id == exploration_id)
        exploration_result = await session.execute(exploration_query)
        exploration = exploration_result.scalars().first()
        
        if not exploration:
            raise ValueError(f"Workspace {exploration_id} not found")
        org = await org_service.get_organization_by_workspace_id(exploration.workspace_id)
        if not org:
            raise ValueError(f"Workspace {org} not found")
        # Create new session - Start from RESEARCH_OBJECTIVES stage
        omi_session = OmiSession(
            organization_id=org.id,
            workspace_id=exploration.workspace_id,
            exploration_id=exploration_id,
            user_id=user_id,
            current_stage=WorkflowStage.RESEARCH_OBJECTIVES,
            current_state=OmiState.GREETING,
            context={"exploration_id": exploration_id, "organization_id": org.id},
            conversation_history=[],
            completed_stages=[]
        )
        
        session.add(omi_session)
        await session.commit()
        await session.refresh(omi_session)
        
        # Add greeting message focused on research objectives
        await add_message(
            omi_session.id,
            "omi",
            "Hey, I'm Omi—your research co-pilot! 👋 Ready to define your research objectives? Let's start by understanding what you want to explore. What's the question or curiosity that brought you here today?",
            "greeting",
            WorkflowStage.RESEARCH_OBJECTIVES,
            OmiState.GREETING
        )
        
        return omi_session, True



async def get_or_create_session_org(organization_id: str, user_id: str) -> OmiSession:
    """Get existing Omi session or create a new one at organization level"""
    async with AsyncSession(async_engine) as session:
        # Try to get existing session
        query = select(OmiSession).where(
            OmiSession.organization_id == organization_id,
            OmiSession.user_id == user_id
        ).order_by(OmiSession.last_interaction.desc())
        
        result = await session.execute(query)
        omi_session = result.scalars().first()
        
        if omi_session:
            # Update last interaction
            omi_session.last_interaction = datetime.utcnow()
            omi_session.updated_at = datetime.utcnow()
            session.add(omi_session)
            await session.commit()
            await session.refresh(omi_session)
            return omi_session
        
        # Create new session - Start from ORGANIZATION stage
        omi_session = OmiSession(
            organization_id=organization_id,
            user_id=user_id,
            exploration_id=None,
            current_stage=WorkflowStage.ORGANIZATION_SETUP,
            current_state=OmiState.GREETING,
            context={"organization_id": organization_id},
            conversation_history=[],
            completed_stages=[]
        )
        
        session.add(omi_session)
        await session.commit()
        await session.refresh(omi_session)
        
        # Add greeting message focused on organization/workspace creation
        await add_message(
            omi_session.id,
            "omi",
            "Hey, I'm Omi—your research co-pilot! 👋 I'm here to guide you through creating amazing research. Ready to set up your first workspace? Let's make this fun and easy!",
            "greeting",
            WorkflowStage.ORGANIZATION_SETUP,
            OmiState.GREETING
        )
        
        return omi_session


async def update_session_state(
    session_id: str,
    state: Optional[OmiState] = None,
    stage: Optional[WorkflowStage] = None,
    context_update: Optional[Dict[str, Any]] = None
) -> OmiSession:
    """Update Omi session state"""
    async with AsyncSession(async_engine) as session:
        query = select(OmiSession).where(OmiSession.id == session_id)
        result = await session.execute(query)
        omi_session = result.scalars().first()
        
        if not omi_session:
            raise ValueError("Session not found")
        
        if state:
            omi_session.current_state = state
        
        if stage:
            # Mark previous stage as completed
            if omi_session.current_stage not in omi_session.completed_stages:
                omi_session.completed_stages.append(omi_session.current_stage)
            omi_session.current_stage = stage
        
        if context_update:
            omi_session.context.update(context_update)
        
        omi_session.updated_at = datetime.utcnow()
        omi_session.last_interaction = datetime.utcnow()
        
        session.add(omi_session)
        await session.commit()
        await session.refresh(omi_session)
        
        return omi_session


async def get_session(session_id: str) -> Optional[OmiSession]:
    """Get Omi session by ID"""
    async with AsyncSession(async_engine) as session:
        query = select(OmiSession).where(OmiSession.id == session_id)
        result = await session.execute(query)
        return result.scalars().first()


# ============================================================================
# MESSAGE MANAGEMENT
# ============================================================================

async def add_message(
    session_id: str,
    role: str,
    content: str,
    message_type: str = "guidance",
    workflow_stage: Optional[str] = None,
    omi_state: Optional[str] = None
) -> OmiMessage:
    """Add a message to the conversation"""
    async with AsyncSession(async_engine) as session:
        message = OmiMessage(
            session_id=session_id,
            role=role,
            content=content,
            message_type=message_type,
            workflow_stage=workflow_stage,
            omi_state=omi_state
        )
        
        session.add(message)
        await session.commit()
        await session.refresh(message)
        
        # Update session conversation history
        query = select(OmiSession).where(OmiSession.id == session_id)
        result = await session.execute(query)
        omi_session = result.scalars().first()
        
        if omi_session:
            omi_session.conversation_history.append({
                "role": role,
                "content": content,
                "timestamp": datetime.utcnow().isoformat(),
                "type": message_type
            })
            omi_session.last_interaction = datetime.utcnow()
            session.add(omi_session)
            await session.commit()
        
        return message


async def get_conversation_history(session_id: str, limit: int = 50) -> List[OmiMessage]:
    """Get conversation history for a session"""
    async with AsyncSession(async_engine) as session:
        query = select(OmiMessage).where(
            OmiMessage.session_id == session_id
        ).order_by(OmiMessage.created_at.desc()).limit(limit)
        
        result = await session.execute(query)
        messages = result.scalars().all()
        return list(reversed(messages))


# ============================================================================
# WORKFLOW ACTION TRACKING
# ============================================================================

async def create_workflow_action(
    session_id: str,
    action_type: str,
    description: str
) -> OmiWorkflowAction:
    """Create a new workflow action"""
    async with AsyncSession(async_engine) as session:
        action = OmiWorkflowAction(
            session_id=session_id,
            action_type=action_type,
            description=description,
            status="in_progress",
            progress_percentage=0
        )
        
        session.add(action)
        await session.commit()
        await session.refresh(action)
        return action


async def update_workflow_action(
    action_id: str,
    status: Optional[str] = None,
    progress: Optional[int] = None,
    result: Optional[Dict[str, Any]] = None
) -> OmiWorkflowAction:
    """Update workflow action status"""
    async with AsyncSession(async_engine) as session:
        query = select(OmiWorkflowAction).where(OmiWorkflowAction.id == action_id)
        result_query = await session.execute(query)
        action = result_query.scalars().first()
        
        if not action:
            raise ValueError("Action not found")
        
        if status:
            action.status = status
            if status == "completed":
                action.completed_at = datetime.utcnow()
        
        if progress is not None:
            action.progress_percentage = progress
        
        if result:
            action.result = result
        
        session.add(action)
        await session.commit()
        await session.refresh(action)
        return action


async def get_active_actions(session_id: str) -> List[OmiWorkflowAction]:
    """Get active workflow actions"""
    async with AsyncSession(async_engine) as session:
        query = select(OmiWorkflowAction).where(
            OmiWorkflowAction.session_id == session_id,
            OmiWorkflowAction.status == "in_progress"
        ).order_by(OmiWorkflowAction.started_at.desc())
        
        result = await session.execute(query)
        return result.scalars().all()


# ============================================================================
# AI-POWERED GUIDANCE
# ============================================================================

OMI_PERSONALITY = """You are Omi, a helpful research assistant for Synthetic-People platform.

Personality:
- Warmly Expert: Confident but never condescending; use plain language first
- Playfully Serious: Research is rigorous, but the process can be fun
- Collaborative & Curious: Frame everything as "we" and "together"
- Honest about limitations: Say "I need more information" when unclear

Tone:
- Use short, direct sentences like "Nice, that's a sharp hypothesis."
- Normalize uncertainty: "It's okay if this is fuzzy—we'll refine it together."
- Be specific about next actions
- Light touches of humor, but never at the expense of clarity

Your role is to guide users through:
1. Research Objectives (hypothesis, context, audience)
2. Persona Builder (demographics, psychographics, behaviors, backstories)
3. Survey Builder
4. Rebuttal Mode (what-if scenarios)
5. Insights & Analysis

Always be encouraging, specific, and action-oriented.
"""


async def get_ai_guidance(
    stage: WorkflowStage,
    user_input: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None
) -> OmiGuidanceResponse:
    """Get AI-powered guidance for current stage"""
    
    stage_prompts = {
        WorkflowStage.ORGANIZATION_SETUP: """The user is at the organization level and wants to create a workspace.
        Guide them through:
        1. Choosing a clear, descriptive workspace name
        2. Defining the workspace purpose/scope
        3. Understanding what makes a good workspace structure
        
        Be encouraging and help them see this as the foundation for great research!""",
        
        WorkflowStage.WORKSPACE_SETUP: """The user is in their workspace and ready to start research. 
        Welcome them warmly and ask about their research question or curiosity. 
        Guide them towards defining clear research objectives.
        Be inviting and make them feel this will be easy and fun.""",
        
        WorkflowStage.RESEARCH_OBJECTIVES: """Help them define clear research objectives. They need:
        1. Context (what's the situation?)
        2. Hypothesis (what do they believe?)
        3. Target Audience (who are they studying?)
        4. Research Question (what do they want to learn?)
        
        Guide them step by step. If anything is missing or unclear, ask specific questions.""",
        
        WorkflowStage.PERSONA_BUILDER: """Guide them through building synthetic personas. Explain the process:
        1. Demographics (age, location, education, income, etc.)
        2. Psychographics (lifestyle, values, personality, motivations)
        3. Behavioral traits (brand sensitivity, price sensitivity)
        4. Lifestyle traits (mobility, accommodation, daily rhythm)
        5. Backstories (formative experiences that explain worldviews)
        
        Validate that traits don't contradict each other. Be encouraging!""",
        
        WorkflowStage.SURVEY_BUILDER: """Help them create survey questions or discussion guides.
        Suggest question types based on their research objectives.""",
        
        WorkflowStage.REBUTTAL_MODE: """This is the 'what-if' playground. Help them explore alternative scenarios
        and challenge their assumptions.""",
        
        WorkflowStage.INSIGHTS: """Guide them through analyzing results and generating insights."""
    }
    
    prompt = f"""{OMI_PERSONALITY}

Current Stage: {stage}
Stage Context: {stage_prompts.get(stage, "General guidance")}

User Input: {user_input or "No input yet"}
Additional Context: {json.dumps(context or {}, indent=2)}

Provide guidance as Omi. Be specific, encouraging, and action-oriented.
Include:
1. A friendly message
2. Specific next steps
3. Any tips or warnings
4. Workflow actions Omi should show (e.g., "Analyzing your input", "Validating hypothesis")
"""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": OMI_PERSONALITY},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=500
        )
        
        guidance_text = response.choices[0].message.content
        
        # Determine Omi state based on stage
        state_mapping = {
            WorkflowStage.WORKSPACE_SETUP: OmiState.GREETING,
            WorkflowStage.RESEARCH_OBJECTIVES: OmiState.THINKING,
            WorkflowStage.PERSONA_BUILDER: OmiState.WORKING,
            WorkflowStage.SURVEY_BUILDER: OmiState.WORKING,
            WorkflowStage.REBUTTAL_MODE: OmiState.FACILITATING,
            WorkflowStage.INSIGHTS: OmiState.ANALYZING
        }
        
        return OmiGuidanceResponse(
            guidance=guidance_text,
            omi_state=state_mapping.get(stage, OmiState.IDLE),
            workflow_actions=["Preparing guidance", "Analyzing context"],
            tips=["Take your time", "It's okay to iterate"],
            warnings=None
        )
        
    except Exception as e:
        # Fallback guidance
        return OmiGuidanceResponse(
            guidance=f"Let's work on {stage.replace('_', ' ')} together. What would you like to do?",
            omi_state=OmiState.IDLE,
            workflow_actions=[],
            tips=None,
            warnings=None
        )


def calculate_confidence(analysis: dict) -> int:
    scores = analysis.get("component_scores", {})
    importance = analysis.get("importance", {})

    total = 0
    weight = 0

    for component, score in scores.items():
        level = importance.get(component, "low")

        if level == "critical":
            w = 3
        elif level == "medium":
            w = 2
        else:
            w = 1

        total += score * w
        weight += 100 * w

    if weight == 0:
        return 40  # safe low confidence default

    return int((total / weight) * 100)


async def chat_with_omi(
    db: AsyncSession,
    session_id: str,
    user_message: str,
    exploration,
    context: Optional[Dict[str, Any]] = None,
) -> OmiChatResponse:
    # --------------------------------------------------
    # LOAD OMI SESSION (SAME DB SESSION)
    # --------------------------------------------------
    result = await db.execute(
        select(OmiSession).where(OmiSession.id == session_id)
    )
    omi_session = result.scalars().first()
    if not omi_session:
        raise ValueError("Session not found")

    current_stage = omi_session.current_stage

    # --------------------------------------------------
    # SAVE USER MESSAGE
    # --------------------------------------------------
    await add_message(
        session_id=session_id,
        role="user",
        content=user_message,
        message_type="chat",
        workflow_stage=current_stage,
        omi_state=None
    )

    # --------------------------------------------------
    # INIT CONTEXT
    # --------------------------------------------------
    session_context = omi_session.context or {}
    ro_ctx = session_context.get("research_objectives")
    if not ro_ctx:
        ro_ctx = {
            "probe_round": 0,
            "asked_components": [],
            "raw_inputs": [],
            "current_draft": None,
            "final_analysis": {},
            "confidence_level": None,
            "ready_to_save": False
        }

    probe_round = ro_ctx["probe_round"]
    # ---- SAVE USER INPUT INTO RO CONTEXT ----
    ro_ctx.setdefault("raw_inputs", []).append(user_message)

    # First message becomes base draft
    if ro_ctx.get("current_draft") is None:
        ro_ctx["current_draft"] = user_message
    else:
        # append clarification answers (lightweight merge)
        ro_ctx["current_draft"] += "\n\n" + user_message

    # --------------------------------------------------
    # ONLY FOR RESEARCH OBJECTIVES STAGE
    # --------------------------------------------------
    if current_stage == WorkflowStage.RESEARCH_OBJECTIVES:

        # -------------------------------
        # LLM ANALYSIS
        # -------------------------------
        analysis = await validate_description_with_llm(
            description=user_message,
            conversation=ro_ctx.get("conversation", [])
        )

        questions = analysis.get("questions", "")

        missing = analysis.get("missing", [])

        confidence = calculate_confidence(analysis)

        ro_ctx.update({
            "final_analysis": analysis,
            "confidence_level": confidence,
            "ready_to_save": False,
        })

        ro_ctx["final_synthesized_text"] = ro_ctx["current_draft"]
        ro_ctx["conversation"] = analysis.get("conversation")
        ro_ctx["final_objective"] = analysis.get("final_objective")
        ro_ctx["information_gathered"] = analysis.get("information_gathered")
        session_context["research_objectives"] = ro_ctx
        omi_session.context = session_context

        # IMPORTANT: mark JSON as modified
        flag_modified(omi_session, "context")

        db.add(omi_session)
        await db.commit()
        await db.refresh(omi_session)
        # -------------------------------
        # HARD STOP AFTER 2 ROUNDS
        # -------------------------------
        if exploration.clarification_attempts >= 2 or not questions:
            confidence = calculate_confidence(analysis)

            ro_ctx.update({
                "final_analysis": analysis,
                "confidence_level": confidence,
                "ready_to_save": True,
                "probe_round": 2
            })

            ro_ctx["final_synthesized_text"] = ro_ctx["current_draft"]

            session_context["research_objectives"] = ro_ctx
            omi_session.context = session_context

            # IMPORTANT: mark JSON as modified
            flag_modified(omi_session, "context")

            db.add(omi_session)
            await db.commit()
            await db.refresh(omi_session)

            summary = await generate_and_save_research_objective(
                db=db,
                omi_session_id=omi_session.id,
                exploration_id=exploration.id,
                created_by=exploration.created_by,
                final_objective=ro_ctx["final_objective"],
                context_gathered = ro_ctx["information_gathered"],
                final_analysis=ro_ctx["final_analysis"],
                confidence=ro_ctx["confidence_level"],
            )

            msg = (
                "Thanks! I’ve put everything together and we’re good to proceed.\n\n"
                "📌 **Research Objective Summary:**\n"
                f"{summary}\n\n"
                "I’ll carry this forward into personas."
            )

            await add_message(
                session_id=session_id,
                role="omi",
                content=msg,
                message_type="chat",
                workflow_stage=current_stage,
                omi_state=OmiState.GREETING
            )

            return OmiChatResponse(
                message=msg,
                omi_state=OmiState.GREETING,
                suggestions=None,
                next_steps=["Create personas"],
                workflow_transition={
                    "stage": "persona_builder",
                    "event": "RESEARCH_OBJECTIVE_SUBMITTED"
                }
            )

        # -------------------------------
        # ASK QUESTIONS (ROUND 1 / 2)
        # -------------------------------
        ro_ctx["probe_round"] += 1
        ro_ctx["asked_components"].extend(missing)

        await exp_service.increment_clarification_attempts(
            exploration.id
        )

        session_context["research_objectives"] = ro_ctx
        omi_session.context = session_context

        flag_modified(omi_session, "context")

        db.add(omi_session)
        await db.commit()
        await db.refresh(omi_session)

        # questions is now a single string paragraph, not an array
        question_text = questions

        await add_message(
            session_id=session_id,
            role="omi",
            content=question_text,
            message_type="chat",
            workflow_stage=current_stage,
            omi_state=OmiState.THINKING
        )

        return OmiChatResponse(
            message=question_text,
            omi_state=OmiState.THINKING,
            suggestions=None,
            next_steps=None
        )

    # --------------------------------------------------
    # DEFAULT FALLBACK
    # --------------------------------------------------
    return OmiChatResponse(
        message="Got it 👍",
        omi_state=OmiState.LISTENING,
        suggestions=None,
        next_steps=None
    )


async def validate_with_omi(
    session_id: str,
    stage: WorkflowStage,
    data: Dict[str, Any]
) -> OmiValidationResponse:
    """Validate user input with Omi's help"""
    
    validation_prompts = {
        WorkflowStage.RESEARCH_OBJECTIVES: """Validate research objectives:
        - Is there clear context?
        - Is the hypothesis testable and realistic?
        - Is the target audience well-defined?
        - Is the research question clear?
        
        Check for feasibility and completeness.""",
        
        WorkflowStage.PERSONA_BUILDER: """Validate persona traits:
        - Do demographics make sense together?
        - Are there contradictions (e.g., "budget-conscious" AND "price-insensitive")?
        - Are psychographics aligned with demographics?
        - Do backstories support the persona's worldview?
        
        Be specific about any issues."""
    }
    
    prompt = f"""{OMI_PERSONALITY}

Stage: {stage}
Validation Task: {validation_prompts.get(stage, "Validate the input")}

Data to validate:
{json.dumps(data, indent=2)}

Respond with:
1. Whether it's valid (true/false)
2. A friendly message
3. Specific issues if any
4. Suggestions for improvement

Be encouraging even when pointing out issues!"""
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": OMI_PERSONALITY},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=400
        )
        
        validation_text = response.choices[0].message.content
        
        is_valid = not any(word in validation_text.lower() for word in ["issue", "missing", "contradiction", "problem", "clash"])
        
        omi_state = OmiState.ENCOURAGING if is_valid else OmiState.CONCERNED
        
        await add_message(
            session_id,
            "omi",
            validation_text,
            "validation",
            stage,
            omi_state
        )
        
        return OmiValidationResponse(
            valid=is_valid,
            message=validation_text,
            omi_state=omi_state,
            issues=None,
            suggestions=None
        )
        
    except Exception as e:
        return OmiValidationResponse(
            valid=True,  # Default to valid on error
            message="Looks good! Let's proceed.",
            omi_state=OmiState.IDLE,
            issues=None,
            suggestions=None
        )


# ============================================================================
# STAGE-SPECIFIC HELPERS
# ============================================================================

async def guide_research_objectives(
    session_id: str,
    description: str
) -> Dict[str, Any]:
    """Guide user through research objectives with Omi"""
    
    # Create workflow action
    action = await create_workflow_action(
        session_id,
        "validating",
        "Analyzing your research objectives"
    )
    
    # Update Omi state
    await update_session_state(session_id, state=OmiState.THINKING)
    
    # Validate with AI
    validation = await validate_with_omi(
        session_id,
        WorkflowStage.RESEARCH_OBJECTIVES,
        {"description": description}
    )
    
    # Update action
    await update_workflow_action(
        action.id,
        status="completed",
        progress=100,
        result={"valid": validation.valid}
    )
    
    return {
        "valid": validation.valid,
        "message": validation.message,
        "omi_state": validation.omi_state
    }


async def guide_persona_building(
    session_id: str,
    persona_data: Dict[str, Any]
) -> Dict[str, Any]:
    """Guide user through persona building with Omi"""
    
    action = await create_workflow_action(
        session_id,
        "validating",
        "Checking persona traits for consistency"
    )
    
    await update_session_state(session_id, state=OmiState.WORKING)
    
    validation = await validate_with_omi(
        session_id,
        WorkflowStage.PERSONA_BUILDER,
        persona_data
    )
    
    await update_workflow_action(
        action.id,
        status="completed",
        progress=100,
        result={"valid": validation.valid}
    )
    
    return {
        "valid": validation.valid,
        "message": validation.message,
        "omi_state": validation.omi_state
    }


PERSONA_VALIDATION_SYSTEM_PROMPT = """
You are Omi, a strict research auditor.

You validate persona traits ONLY against the approved research objective.

Rules:
- Do NOT invent traits
- Do NOT rewrite traits
- Do NOT be friendly or conversational
- Judge each trait independently
- Mark each trait as VALID or INVALID
- INVALID traits MUST include a short reason
- Use ONLY the research objective as grounding
- Return STRICT JSON only
"""


def build_persona_validation_prompt(
    research_objective: str,
    trait_group: str,
    traits: dict
) -> str:
    formatted_traits = "\n".join(
        [f"- {key.replace('_', ' ').title()}: {value}" for key, value in traits.items()]
    )
    return f"""
Research Objective:
\"\"\"
{research_objective}
\"\"\"

Trait Group:
{trait_group}

Traits to validate:
{formatted_traits}

Return JSON in this exact format:
{{
  "group": "{trait_group}",
  "results": [
    {{
      "trait": "<original trait>",
      "status": "valid | invalid",
      "reason": "<short reason if invalid, else null>"
    }}
  ],
  "group_valid": true | false
}}
"""


def load_persona_builder_prompt() -> str:
    return """
You are an expert personality psychologist and consumer research analyst.

Your task is to generate an OCEAN personality profile
(Big Five: Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism)
for a given consumer persona.

IMPORTANT CONTEXT:
- This is a DEMO / PROTOTYPE system.
- There are NO editing rounds.
- There is NO persona comparison.
- There are NO simulations.
- The output will be SAVED and reused.
- Consistency and clarity matter more than creativity.

You will receive structured persona data describing:
- demographics
- psychographics
- behavioral tendencies
- digital behavior
- motivations and values

You must infer the persona’s personality using professional judgment.

--------------------------------
OCEAN SCORING RULES
--------------------------------

1. Generate numeric OCEAN scores between 0.00 and 1.00.
2. Use realistic distributions (avoid extreme 0.00 or 1.00 unless clearly justified).
3. Assign labels using this rule ONLY:
   - 0.00 – 0.33 → Low
   - 0.34 – 0.66 → Medium
   - 0.67 – 1.00 → High

--------------------------------
SPIDER CHART RULES
--------------------------------

You must generate an SVG radar (spider) chart.

Visual rules:
- Exactly 5 axes (O, C, E, A, N)
- 0 at center, 1 at outer edge
- Smooth polygon
- Muted professional color palette
- SVG must be valid and renderable
- Do NOT include explanations inside SVG

--------------------------------
OUTPUT FORMAT (STRICT)
--------------------------------

You MUST return a single valid JSON object.
Do NOT include any text outside JSON.

The JSON structure MUST be exactly:

{
  "scores": {
    "openness": number,
    "conscientiousness": number,
    "extraversion": number,
    "agreeableness": number,
    "neuroticism": number
  },
  "labels": {
    "openness": "Low | Medium | High",
    "conscientiousness": "Low | Medium | High",
    "extraversion": "Low | Medium | High",
    "agreeableness": "Low | Medium | High",
    "neuroticism": "Low | Medium | High"
  },
  "spider_svg": "<svg>...</svg>"
}

--------------------------------
IMPORTANT CONSTRAINTS
--------------------------------

- Do NOT add extra keys.
- Do NOT include explanations, markdown, or commentary.
- Ensure numeric and label consistency.
- SVG must be compact and clean.
- If persona data is partial, make reasonable professional assumptions.

You are generating a research-grade personality snapshot,
not a creative character.

Return JSON only.
"""



import json
from typing import Optional
from openai import AsyncOpenAI

# Use the same client everywhere
client = AsyncOpenAI()


async def call_omi(
    system_prompt: str,
    user_prompt: str,
    response_format: str = "text",
    temperature: float = 0.2,
    max_tokens: int = 700,
) -> dict | str:
    """
    Unified Omi LLM caller

    response_format:
    - "json" → returns parsed dict
    - "text" → returns raw string
    """

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format=(
                {"type": "json_object"} if response_format == "json" else None
            )
        )

        content = response.choices[0].message.content

        if response_format == "json":
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                # Hard fallback → NEVER crash persona pipeline
                return {
                    "error": "Invalid JSON returned by Omi",
                    "raw_response": content
                }

        return content

    except Exception as e:
        # Absolute fallback — system must continue
        if response_format == "json":
            return {
                "error": "LLM call failed",
                "reason": str(e)
            }

        return "Omi had trouble responding, but we can continue."
