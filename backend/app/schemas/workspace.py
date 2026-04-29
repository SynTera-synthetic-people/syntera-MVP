from pydantic import BaseModel, ConfigDict, EmailStr
from typing import Optional, List

class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    department_name: Optional[str] = None


class WorkspaceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: Optional[str]
    department_name: Optional[str]

class InviteMemberIn(BaseModel):
    email: EmailStr
    role: str = "user"

class InviteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    email: EmailStr
    role: str
    token: str

class RoleUpdate(BaseModel):
    new_role: str

