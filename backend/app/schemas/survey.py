from pydantic import BaseModel
from typing import List, Dict, Optional

class OptionResult(BaseModel):
    option: str
    count: int
    pct: float

class QuestionResult(BaseModel):
    text: str
    options: List[OptionResult]
    total: int

class SurveySimulationRequest(BaseModel):
    exploration_id: str
    persona_id: Optional[List[str]] = None
    simulation_id: Optional[str] = None
    sample_size: Optional[int] = None
    questions: Optional[List[Dict]] = None

class SurveySimulationOut(BaseModel):
    id: str
    workspace_id: str
    exploration_id: str
    persona_id: str
    sample_size: int
    results: Dict[str, List[Dict]]
    narrative: Optional[Dict] = None
    created_at: str
