from pydantic import BaseModel
from datetime import datetime


class UserListOut(BaseModel):
    id: str
    full_name: str
    email: str
    user_type: str
    created_at: datetime
    status: str


class UserStatsOut(BaseModel):
    user_id: str
    total_workspaces: int
    total_explorations: int
