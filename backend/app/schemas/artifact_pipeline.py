"""Pydantic contracts for the artifact stimulus pipeline (Stages 1-4).

These types give the four artifact_pipeline services (artifact_dissection,
dimension_extraction, discussion_guide, persona_response) a stable, typed
shape for their inputs/outputs instead of passing raw LLM-shaped dicts
around untyped. Stages 2-4 validate their LLM JSON output directly into
these models; Stage 1 (artifact_dissection.py) keeps its existing dict
return + RuntimeError handling untouched, and AssetDissection is used at
the orchestrator/persistence boundary instead (see artifact_pipeline_orchestrator.py).
"""
from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class ComparisonMode(str, Enum):
    """The two comparison_mode string literals used across discussion_guide.py
    and persona_response.py, now as a single shared enum instead of bare strings."""

    CAMPAIGN_SET = "campaign_set"
    COMPARISON = "comparison"


class PipelineStageError(Exception):
    """Raised when an LLM stage's JSON output fails schema validation."""

    def __init__(self, stage: str, message: str):
        self.stage = stage
        self.message = message
        super().__init__(f"[{stage}] {message}")


# ---- Stage 1: Asset Dissection (artifact_dissection.py) ----

class DissectionMoment(BaseModel):
    timestamp: str
    description: str
    message: str
    tone: str
    visual_elements: List[str] = Field(default_factory=list)


class AssetDissection(BaseModel):
    moments: List[DissectionMoment] = Field(default_factory=list)
    overall_message: str
    overall_tone: str
    visual_structure: str
    cta: Optional[str] = None


# ---- Stage 2: Dimension Extraction (dimension_extraction.py) ----

class DimensionDetail(BaseModel):
    name: str
    description: str = ""
    questions: List[str] = Field(default_factory=list)
    theme: str = "General"


class DimensionSelection(BaseModel):
    """Replaces the (selected_codes, dimension_details) tuple that
    DimensionExtractionService.extract_dimensions used to return."""

    selected_codes: List[str] = Field(default_factory=list)
    details: Dict[str, DimensionDetail] = Field(default_factory=dict)


# ---- Stage 3: Discussion Guide (discussion_guide.py) ----

class GuideQuestion(BaseModel):
    question: str
    type: str = "open"
    scale: Optional[str] = None
    intent: Optional[str] = None


class GuideSection(BaseModel):
    dimension: str
    theme: str
    dimension_name: str
    description: str = ""
    questions: List[GuideQuestion] = Field(default_factory=list)


class DiscussionGuide(BaseModel):
    title: str
    introduction: str = ""
    comparison_mode: ComparisonMode
    num_assets: int = 1
    sections: List[GuideSection] = Field(default_factory=list)


# ---- Stage 4: Persona Responses (persona_response.py) ----

class PersonaAnswer(BaseModel):
    dimension: str
    question: str
    response: str
    reasoning: str = ""


class PersonaResponseSet(BaseModel):
    persona_name: str
    responses: List[PersonaAnswer] = Field(default_factory=list)
