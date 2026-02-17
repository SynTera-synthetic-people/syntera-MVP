from sqlmodel import SQLModel, Field, Column
from sqlalchemy import Column, Boolean
from sqlalchemy.dialects.postgresql import JSON
from typing import Optional, List, Dict
from datetime import datetime
from app.utils.id_generator import generate_id
from sqlalchemy.dialects.postgresql import JSONB


class Persona(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)

    exploration_id: str = Field(foreign_key="explorations.id")
    workspace_id: str = Field(foreign_key="workspace.id")
    
    # Basic Identity
    name: str
    age_range: str
    gender: str

    # Demographics
    location_country: str
    location_state: Optional[str] = None
    education_level: str
    occupation: str
    income_range: str
    family_size: Optional[str] = None
    geography: Optional[str] = None

    # Psychographic Traits
    lifestyle: Optional[str] = None
    values: Optional[str] = None
    personality: Optional[str] = None
    # interests: Optional[str] = None
    interests: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSONB)
    )
    motivations: Optional[str] = None

    # Behavioral Traits
    brand_sensitivity: Optional[str] = None
    price_sensitivity: Optional[str] = None

    # Lifestyle Traits
    mobility: Optional[str] = None
    accommodation: Optional[str] = None
    marital_status: Optional[str] = None
    daily_rhythm: Optional[str] = None

    # Hobbies & Interests
    hobbies: Optional[str] = None

    # Professional Traits
    professional_traits: Optional[str] = None

    # Digital Activity
    digital_activity: Optional[str] = None

    # Preferences
    preferences: Optional[str] = None

    # System Fields
    # sample_size: int
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    backstory: Optional[str] = Field(default=None)

    ocean_profile: Optional[dict] = Field(
        sa_column=Column(JSON),
        default=None
    )
    persona_details: dict = Field(
        default=None,
        sa_column=Column(JSON)
    )

    auto_generated_persona: bool = Field(
        default=False,
        sa_column=Column(Boolean)
    )