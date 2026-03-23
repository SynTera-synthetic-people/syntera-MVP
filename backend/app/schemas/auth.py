from pydantic import BaseModel, EmailStr, validator
from typing import Literal
import re

class SignupIn(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    confirm_password: str
    user_type: Literal["Student", "Startup", "Researcher"]

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


