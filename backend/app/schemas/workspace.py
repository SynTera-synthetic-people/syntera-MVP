from pydantic import BaseModel, EmailStr
from typing import Optional, List

class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    department_name: Optional[str] = None


class WorkspaceOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    department_name: Optional[str]

    class Config:
        orm_mode = True

class InviteMemberIn(BaseModel):
    email: EmailStr
    role: str = "user"

class InviteRead(BaseModel):
    email: EmailStr
    role: str
    token: str
    class Config:
        orm_mode = True

class RoleUpdate(BaseModel):
    new_role: str

