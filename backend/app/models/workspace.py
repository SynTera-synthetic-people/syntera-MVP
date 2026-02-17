from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime
from app.utils.id_generator import generate_id

class Workspace(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)
    name: str
    description: Optional[str] = None
    organization_id: str = Field(foreign_key="organization.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    department_name: Optional[str] = None
    organization: "Organization" = Relationship(back_populates="workspaces")
    members: List["WorkspaceMember"] = Relationship(back_populates="workspace")


class WorkspaceMember(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)
    workspace_id: str = Field(foreign_key="workspace.id")
    user_id: Optional[str] = Field(foreign_key="user.id", default=None)
    email: str
    role: str = Field(default="user")
    token: Optional[str] = None
    token_expiry: Optional[datetime] = None
    accepted: bool = Field(default=False)

    workspace: "Workspace" = Relationship(back_populates="members")
