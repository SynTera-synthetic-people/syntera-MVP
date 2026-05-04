from pydantic import BaseModel, EmailStr, validator
from typing import Optional
import re

class SignupIn(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    confirm_password: str

    @validator("full_name")
    def name_length(cls, v):
        if not (3 <= len(v) <= 50):
            raise ValueError("Full name must be between 3 and 50 characters.")
        return v

    @validator("password")
    def password_strength(cls, v):
        if (len(v) < 8 or
            not re.search(r"[A-Z]", v) or
            not re.search(r"[a-z]", v) or
            not re.search(r"\d", v)):
            raise ValueError("Password must contain at least 8 chars, one uppercase, one lowercase, and one number.")
        return v

    @validator("confirm_password")
    def passwords_match(cls, v, values):
        if "password" in values and v != values["password"]:
            raise ValueError("Passwords do not match.")
        return v
    
class LoginIn(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class ForgotPasswordIn(BaseModel):
    email: EmailStr

class ResetPasswordIn(BaseModel):
    new_password: str


class ChangePasswordIn(BaseModel):
    """DTO for authenticated users changing their own password."""
    current_password: str
    new_password: str
    confirm_password: str

    @validator("new_password")
    def new_password_strength(cls, v):
        if (len(v) < 8 or
                not re.search(r"[A-Z]", v) or
                not re.search(r"[a-z]", v) or
                not re.search(r"\d", v)):
            raise ValueError(
                "Password must contain at least 8 chars, one uppercase, one lowercase, and one number."
            )
        return v

    @validator("confirm_password")
    def passwords_match(cls, v, values):
        if "new_password" in values and v != values["new_password"]:
            raise ValueError("Passwords do not match.")
        return v


class UpdateProfileIn(BaseModel):
    """DTO for authenticated users updating their own profile."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None

    @validator("first_name", "last_name", pre=True, each_item=False)
    def strip_names(cls, v):
        if v is not None:
            v = v.strip()
            if v and len(v) > 50:
                raise ValueError("Name must be 50 characters or fewer.")
        return v

    @validator("phone", pre=True)
    def validate_phone(cls, v):
        if v is not None:
            v = v.strip()
            if v and len(v) > 20:
                raise ValueError("Phone must be 20 characters or fewer.")
        return v


