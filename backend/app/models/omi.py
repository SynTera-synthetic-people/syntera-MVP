from sqlmodel import SQLModel, Field, Column
from sqlalchemy.dialects.postgresql import JSON
from typing import Optional, Dict, Any
from datetime import datetime
from app.utils.id_generator import generate_id
from enum import Enum


class OmiState(str, Enum):
    """Omi's visual and behavioral states"""
    IDLE = "idle"  # Breathing, blinking, waiting
    GREETING = "greeting"  # Hand wave
    LISTENING = "listening"  # Enthusiastic listener
    THINKING = "thinking"  # Eyes narrow, finger on chin
    WORKING = "working"  # Typing on keyboard
    PROCESSING = "processing"  # Loading between sections
    ENCOURAGING = "encouraging"  # Jump in excitement
    CONCERNED = "concerned"  # Serious eyes
    ANALYZING = "analyzing"  # Reading a book
    FACILITATING = "facilitating"  # Coordinating, slightly stressed
    CREATING = "creating"  # Creating personas/population
    ACKNOWLEDGING = "Acknowledging"
    EXPLAINING = "explaining"
    CONFIRMING = "confirming"


class WorkflowStage(str, Enum):
    """User journey stages - starts from research_objectives"""
    # ORGANIZATION_SETUP = "organization_setup"
    WORKSPACE_SETUP = "workspace_setup"
    RESEARCH_OBJECTIVES = "research_objectives"
    PERSONA_BUILDER = "persona_builder"
    SURVEY_BUILDER = "survey_builder"
    REBUTTAL_MODE = "rebuttal_mode"
    INSIGHTS = "insights"
    COMPLETED = "completed"
    QUESTION_EDITED = "question_edited"
    DISCUSSION_GUIDE = "discussion_guide"
    INSIGHTS_REPORT = "insights_report"
    SURVEY_QUANT_REPORT = "survey_quant_report"


class OmiWorkflowEvent(str, Enum):
    WORKFLOW_LOADED = "WORKFLOW_LOADED"

    USER_TYPING = "USER_TYPING"
    USER_MESSAGE_SUBMITTED = "USER_MESSAGE_SUBMITTED"
    RESEARCH_OBJECTIVE_SUBMITTED = "RESEARCH_OBJECTIVE_SUBMITTED"
    RESEARCH_OBJECTIVE_CONFIRMED = "RESEARCH_OBJECTIVE_CONFIRMED"

    PERSONA_SELECTED = "PERSONA_SELECTED"
    PERSONA_WORKFLOW_LOADED = "PERSONA_WORKFLOW_LOADED"
    TRAIT_SELECTION_STARTED = "TRAIT_SELECTION_STARTED"
    TRAIT_VALIDATION_RESULT = "TRAIT_VALIDATION_RESULT"

    BACKSTORY_STARTED = "BACKSTORY_STARTED"
    BACKSTORY_VALIDATION_RESULT = "BACKSTORY_VALIDATION_RESULT"

    PERSONA_CREATION_STARTED = "PERSONA_CREATION_STARTED"
    PERSONA_CREATED = "PERSONA_CREATED"

    ADD_NEW_PERSONA = "ADD_NEW_PERSONA"
    BUILD_DISCUSSION_GUIDE = "BUILD_DISCUSSION_GUIDE"


    SAMPLE_SIZE_FOCUS = "SAMPLE_SIZE_FOCUS"
    SAMPLE_SIZE_ENTERED = "SAMPLE_SIZE_ENTERED"
    SAMPLE_SIZE_ACCEPTED = "SAMPLE_SIZE_ACCEPTED"
    CREATE_QUESTIONNAIRE_CLICKED = "CREATE_QUESTIONNAIRE_CLICKED"
    QUESTIONNAIRE_RENDERED = "QUESTIONNAIRE_RENDERED"
    ROLLOUT_CLICKED = "ROLLOUT_CLICKED"

    QUESTION_EDITED = "QUESTION_EDITED"
    QUESTION_REMOVED = "QUESTION_REMOVED"
    QUESTION_ADDED = "QUESTION_ADDED"

    INSIGHTS_PAGE_LOADED = "INSIGHTS_PAGE_LOADED"
    INSIGHTS_GENERATION_STARTED = "INSIGHTS_GENERATION_STARTED"
    INSIGHTS_READY = "INSIGHTS_READY"
    INSIGHTS_DOWNLOAD_CLICKED = "INSIGHTS_DOWNLOAD_CLICKED"

    SURVEY_REPORT_PAGE_LOADED = "SURVEY_REPORT_PAGE_LOADED"
    SURVEY_REPORT_READY = "SURVEY_REPORT_READY"
    SURVEY_REPORT_DOWNLOAD_PDF = "SURVEY_REPORT_DOWNLOAD_PDF"
    SURVEY_REPORT_DOWNLOAD_DATA = "SURVEY_REPORT_DOWNLOAD_DATA"
    REBUTTAL_MODE_SUGGESTED = "REBUTTAL_MODE_SUGGESTED"


    REBUTTAL_PAGE_LOADED = "REBUTTAL_PAGE_LOADED"
    REBUTTAL_GENERATION_STARTED = "REBUTTAL_GENERATION_STARTED"
    REBUTTAL_REPORT_READY = "REBUTTAL_REPORT_READY"
    REBUTTAL_DOWNLOAD_PDF = "REBUTTAL_DOWNLOAD_PDF"



class OmiSession(SQLModel, table=True):
    """Tracks Omi's interaction session with a user in an organization"""
    id: str = Field(default_factory=generate_id, primary_key=True)
    
    # Relations
    organization_id: str = Field(foreign_key="organization.id")
    user_id: str = Field(foreign_key="user.id")
    exploration_id: str = Field(foreign_key="explorations.id")
    workspace_id: Optional[str] = Field(default=None, foreign_key="workspace.id")
    
    # Current State
    current_stage: str = Field(default=WorkflowStage.RESEARCH_OBJECTIVES)
    current_state: str = Field(default=OmiState.IDLE)
    
    # Context tracking
    context: Dict[str, Any] = Field(default={}, sa_column=Column(JSON))
    
    # Conversation history
    conversation_history: list = Field(default=[], sa_column=Column(JSON))
    
    # Progress tracking
    completed_stages: list = Field(default=[], sa_column=Column(JSON))
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_interaction: datetime = Field(default_factory=datetime.utcnow)


class OmiMessage(SQLModel, table=True):
    """Individual messages in Omi's conversation"""
    id: str = Field(default_factory=generate_id, primary_key=True)
    
    session_id: str = Field(foreign_key="omisession.id")
    
    # Message details
    role: str  # "omi" or "user"
    content: str
    message_type: str  # "greeting", "guidance", "validation", "encouragement", "concern"
    
    # Associated workflow step
    workflow_stage: Optional[str] = None
    
    # Omi's state when this message was sent
    omi_state: Optional[str] = None
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)


class OmiWorkflowAction(SQLModel, table=True):
    """Tracks actions Omi is performing (shown in workflow bar)"""
    id: str = Field(default_factory=generate_id, primary_key=True)
    
    session_id: str = Field(foreign_key="omisession.id")
    
    # Action details
    action_type: str  # "validating", "processing", "generating", "analyzing"
    description: str  # What Omi is doing
    status: str = Field(default="in_progress")  # "in_progress", "completed", "failed"
    
    # Progress
    progress_percentage: Optional[int] = None
    
    # Timing
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    
    # Results
    result: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
