from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime

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
    id: str
    workspace_id: str
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class PersonaPreview(BaseModel):
    title: str
    # image_url: Optional[str] = None
    summary_line: str
    full_summary: str
    confidence: str
    traits: dict


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


class PersonaBackstoryOut(BaseModel):
    persona_id: str
    backstory: str