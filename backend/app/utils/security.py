from passlib.context import CryptContext
from datetime import datetime, timedelta
import jwt
import hashlib
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_email(email: str) -> str:
    email = email.lower().strip()
    return hashlib.sha256(email.encode()).hexdigest()

def hash_password(password: str) -> str:
    password = password.strip()
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password

def create_access_token(subject: str, role: str):
    payload = {
        "sub": subject,
        "role": role,
        "exp": datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

