from sqlmodel import SQLModel, Field, Column
from typing import Optional, Dict, List
from sqlalchemy.dialects.postgresql import JSON
from datetime import datetime
from app.utils.id_generator import generate_id

class SurveySimulation(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)
    workspace_id: str = Field(foreign_key="workspace.id", index=True)
    exploration_id: str = Field(foreign_key="explorations.id", index=True)
    
    # Changed to support multiple personas
    persona_id: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))  # ["id1", "id2", "id3"]
    persona_sample_sizes: Optional[Dict[str, int]] = Field(default=None, sa_column=Column(JSON))  # {"id1": 100, "id2": 200}
    total_sample_size: int = Field(default=0)  # Sum of all persona sample sizes
    
    simulation_source_id: Optional[str] = Field(default=None)
    results: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    narrative: Optional[Dict] = Field(default=None, sa_column=Column(JSON))
    created_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_download: bool = Field(default=False, index=True)
    simulation_result: Optional[Dict] = Field(
        default=None,
        sa_column=Column(JSON)
    )