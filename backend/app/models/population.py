from sqlmodel import SQLModel, Field, Column
from typing import List, Dict, Optional
from sqlalchemy.dialects.postgresql import JSON
from datetime import datetime
from app.utils.id_generator import generate_id

class PopulationSimulation(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)
    workspace_id: str = Field(foreign_key="workspace.id", index=True)
    exploration_id: str = Field(foreign_key="explorations.id", index=True)
    research_objective_id: str = Field(foreign_key="research_objectives.id", index=True)

    persona_ids: List[str] = Field(default_factory=list, sa_column=Column(JSON))
    sample_distribution: Dict[str, int] = Field(default_factory=dict, sa_column=Column(JSON))

    persona_scores: Optional[Dict[str, float]] = Field(default=None, sa_column=Column(JSON))
    weighted_score: Optional[float] = Field(default=None)

    global_insights: Optional[Dict] = Field(default=None, sa_column=Column(JSON))

    created_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
