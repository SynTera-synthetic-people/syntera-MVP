from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime
from app.utils.id_generator import generate_id

class Organization(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)
    name: str = Field(default="My Organization")
    owner_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    owner: Optional["User"] = Relationship(back_populates="organization")
    workspaces: List["Workspace"] = Relationship(back_populates="organization")
