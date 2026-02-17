from pydantic import BaseModel
from typing import Dict, List

class PopulationSimCreate(BaseModel):
    exploration_id: str
    persona_ids: List[str]
    sample_distribution: Dict[str, int]

class PersonaInsight(BaseModel):
    analysis: str
    sources_used: List[str]
    final_estimate_range: str
    confidence_score: float

class PopulationSimOut(BaseModel):
    id: str
    workspace_id: str
    exploration_id: str
    persona_ids: List[str]
    sample_distribution: Dict[str, int]
    persona_scores: Dict[str, float]
    weighted_score: float
    global_insights: Dict[str, PersonaInsight]
