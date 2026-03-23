from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime
from app.utils.id_generator import generate_id

class Organization(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)
    name: str = Field(default="My Organization")
    owner_id: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Org-level tier: "standard" (personal orgs) | "enterprise"
    account_tier: str = Field(default="standard")
    # enterprise: max explorations allowed (0 = no limit for personal orgs)
    exploration_limit: int = Field(default=0)
    # enterprise: current org-level exploration count
    exploration_count: int = Field(default=0)

    owner: Optional["User"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Organization.owner_id]"}
    )
    workspaces: List["Workspace"] = Relationship(back_populates="organization")
