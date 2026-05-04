from pydantic import BaseModel, ConfigDict, EmailStr
from pydantic import BaseModel, EmailStr, validator
from typing import Optional, List


class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    # Accept both "department" (frontend LandingPage modal) and
    # "department_name" (frontend Settings WorkspacePopup) for backwards compatibility.
    department_name: Optional[str] = None
    department: Optional[str] = None

    @validator("name")
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Workspace name cannot be empty.")
        if len(v) > 100:
            raise ValueError("Workspace name must be 100 characters or fewer.")
        return v

    @property
    def resolved_department(self) -> Optional[str]:
        """Return whichever department field the caller provided, preferring department_name."""
        return self.department_name or self.department or None


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


class UpdateMemberIn(BaseModel):
    """DTO for updating a workspace member's display name."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None

    @validator("first_name", "last_name", pre=True, each_item=False)
    def strip_and_limit(cls, v):
        if v is not None:
            v = v.strip()
            if len(v) > 50:
                raise ValueError("Name field must be 50 characters or fewer.")
        return v

