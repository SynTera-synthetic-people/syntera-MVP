from pydantic import BaseModel, ConfigDict, Field
from typing import Any, Literal, Optional, List, Dict
from datetime import datetime


# ── Structured input sub-models for manual persona flow ──────────────────────

class DemographicsInput(BaseModel):
    """Required section — all 8 fields are validated by the manual persona route."""
    age_range: Optional[str] = None               # e.g. "18-25", "26-34"
    gender: Optional[str] = None
    income_range: Optional[str] = None
    education_level: Optional[str] = None
    occupation: Optional[str] = None
    occupation_level: Optional[str] = None   # e.g. "Entry-Level", "Mid-Level", "Senior", "C-Suite"
    marital_status: Optional[str] = None
    family_size: Optional[str] = None
    family_structure: Optional[str] = None   # e.g. "Nuclear with children", "Single", "Joint family"
    location_country: Optional[str] = None
    location_state: Optional[str] = None
    geography: Optional[str] = None


class PsychologicalInput(BaseModel):
    lifestyle: Optional[List[str]] = None
    values: Optional[List[str]] = None
    personality: Optional[List[str]] = None
    interests: Optional[List[str]] = None
    motivations: Optional[List[str]] = None


class BehaviouralInput(BaseModel):
    decision_making_style: Optional[str] = None
    consumption_frequency: Optional[str] = None
    purchase_channel: Optional[List[str]] = None  # list e.g. ["Online", "In-store"]
    price_sensitivity: Optional[str] = None       # "Low" | "Medium" | "High"
    brand_sensitivity: Optional[str] = None       # "Low" | "Medium" | "High"
    switching_tendency: Optional[str] = None      # "Low" | "Medium" | "High"
    switching_behaviour: Optional[str] = None     # legacy alias kept for compatibility
    purchase_triggers: Optional[List[str]] = None
    purchase_barriers: Optional[List[str]] = None
    media_consumption_patterns: Optional[List[str]] = None
    digital_adoption: Optional[str] = None
    digital_behaviour: Optional[str] = None
    digital_behavior: Optional[str] = None


class AdditionalInfoInput(BaseModel):
    occupation: Optional[str] = None       # overrides demographics.occupation if set
    industry: Optional[str] = None
    category_awareness: Optional[str] = None  # e.g. "Aware", "Considering", "Lapsed User"
    job_level: Optional[str] = None
    occupation_level: Optional[str] = None
    years_of_experience: Optional[str] = None
    years_experience: Optional[str] = None
    company_level: Optional[str] = None
    company_size_tier: Optional[str] = None
    company_type: Optional[str] = None
    employee_size: Optional[str] = None
    company_size: Optional[str] = None
    department: Optional[str] = None
    function: Optional[str] = None
    primary_area_of_responsibility: Optional[str] = None
    area_of_responsibility: Optional[str] = None
    decision_making: Optional[str] = None
    decision_making_role: Optional[str] = None
    decision_making_style: Optional[str] = None
    sample_size: Optional[int] = None


class ManualPersonaCreate(BaseModel):
    """Structured input for the manual persona builder form."""
    name: Optional[str] = Field(None, max_length=100)
    # True when `name` is a name the user actually typed, rather than the
    # builder's "Persona 1" placeholder. Calibration only auto-names personas
    # where this is False (see calibrate_manual_persona_with_brains).
    name_is_custom: bool = False
    demographics: Optional[DemographicsInput] = None
    psychological: Optional[PsychologicalInput] = None
    behavioural: Optional[BehaviouralInput] = None
    additional_info: Optional[AdditionalInfoInput] = None
    formative_experience: Optional[str] = Field(None, max_length=1000)
    sample_size: Optional[int] = None

class PersonaBase(BaseModel):
    name: str = Field(..., min_length=3, max_length=50)
    age_range: str
    gender: str

    # Demographics
    location_country: str
    location_state: Optional[str] = None
    education_level: Optional[str] = None
    occupation: Optional[str] = None
    income_range: Optional[str] = None
    family_size: Optional[str] = None
    geography: Optional[str] = None

    # Psychographics
    lifestyle: Optional[str] = None
    values: Optional[List[str]] = None          
    personality: Optional[List[str]] = None     
    interests: Optional[str] = None
    motivations: Optional[str] = None

    # Behavioral traits
    brand_sensitivity: Optional[str] = None
    price_sensitivity: Optional[str] = None
    decision_making_style: Optional[str] = None  

    # Purchase behavior
    purchase_patterns: Optional[str] = None      
    purchase_channel: Optional[str] = None      

    # Lifestyle traits
    mobility: Optional[str] = None
    accommodation: Optional[str] = None
    marital_status: Optional[str] = None
    daily_rhythm: Optional[str] = None

    # Additional traits
    hobbies: Optional[str] = None
    professional_traits: Optional[str] = None

    # Digital activity
    digital_activity: Optional[str] = None

    # Preferences
    preferences: Optional[str] = None

    # System / metadata
    research_objective_id: Optional[str] = None 
    exploration_id: Optional[str] = None
    backstory: Optional[str] = None
    sample_size: Optional[int] = None           
    auto_generated_persona: Optional[bool] = False


class PersonaCreate(PersonaBase):
    pass


class PersonaUpdate(BaseModel):
    name: Optional[str] = None
    age_range: Optional[str] = None
    gender: Optional[str] = None

    location_country: Optional[str] = None
    location_state: Optional[str] = None
    education_level: Optional[str] = None
    occupation: Optional[str] = None
    income_range: Optional[str] = None
    family_size: Optional[str] = None
    geography: Optional[str] = None

    lifestyle: Optional[str] = None
    values: Optional[List[str]] = None
    personality: Optional[List[str]] = None

    interests: Optional[str] = None
    motivations: Optional[str] = None

    brand_sensitivity: Optional[str] = None
    price_sensitivity: Optional[str] = None

    mobility: Optional[str] = None
    accommodation: Optional[str] = None
    marital_status: Optional[str] = None
    daily_rhythm: Optional[str] = None

    hobbies: Optional[str] = None
    professional_traits: Optional[str] = None

    digital_activity: Optional[str] = None
    preferences: Optional[str] = None

    sample_size: Optional[int] = None
    auto_generated_persona: Optional[bool] = False



class PersonaOut(PersonaBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    created_by: str
    created_by_name: Optional[str] = None   # "Omi" or user's full name
    calibration_confidence: Optional[int] = None
    persona_source: Optional[str] = None    # "omi" | "manual" | "replicated"
    parent_persona_id: Optional[str] = None
    calibration_status: Optional[str] = None  # "draft" | "calibrated" | None (legacy)
    created_at: datetime
    # Replication Engine v5.0
    replication_mode: Optional[str] = None
    replication_artifacts: Optional[Dict] = None


class PersonaPreview(BaseModel):
    title: str
    # image_url: Optional[str] = None
    summary_line: str
    full_summary: str
    confidence: str
    traits: dict
    predominant_patterns: Optional[Any] = None


class PersonaTraitValidationRequest(BaseModel):
    exploration_id: str
    trait_group: str
    traits: Dict[str, str]


class PersonaTraitResult(BaseModel):
    trait: str
    status: str  # "valid" | "invalid"
    reason: Optional[str]


class PersonaValidationResponse(BaseModel):
    group: str
    results: List[PersonaTraitResult]
    group_valid: bool
    total_response: Optional[str] = None



class PersonaBackstoryIn(BaseModel):
    backstory: str


class PersonaReplicateRequest(BaseModel):
    target_country: str = Field(..., min_length=2, max_length=100)
    # "full_replication": docs v5 full 5-stage engine (default)
    # "anchor_preview": docs v5 Stage 1-2 preview only, no persona is created
    # legacy aliases kept for backwards compatibility
    mode: Literal[
        "full_replication",
        "anchor_preview",
        "fast_localization",
        "deep_psychographic",
    ] = "full_replication"
    # Optional client-provided knowledge about the target market (seeds Stage 2)
    seed_inputs: Optional[str] = Field(default=None, max_length=2000)


class PersonaBulkDownloadRequest(BaseModel):
    persona_ids: list[str] = Field(..., min_items=1, max_items=20)


class PersonaPurchaseRequest(BaseModel):
    count: int = Field(..., ge=1, le=20)


class PersonaBackstoryOut(BaseModel):
    persona_id: str
    backstory: str
