from sqlmodel import SQLModel, Field, Relationship
from typing import Optional
from datetime import datetime
from app.utils.id_generator import generate_id

class User(SQLModel, table=True):
    id: str = Field(default_factory=generate_id, primary_key=True)
    full_name: str
    email: str = Field(unique=True, index=True)
    hashed_password: str
    user_type: str = Field(default="Student")
    role: str = Field(default="user")
    is_verified: bool = Field(default=False)

    verification_token: Optional[str] = None
    verification_expiry: Optional[datetime] = None
    reset_token: Optional[str] = None
    reset_token_expiry: Optional[datetime] = None

    is_active: bool = Field(default=True)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_activity_at: Optional[datetime] = None

    organization: Optional["Organization"] = Relationship(back_populates="owner")
