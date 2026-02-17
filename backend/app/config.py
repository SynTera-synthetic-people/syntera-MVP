from pydantic_settings import BaseSettings
import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://synth_user:synth_pass@localhost:5432/synthdb"
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    BCRYPT_ROUNDS: int = 12
    IDLE_TIMEOUT: int = 15
    MAIL_USERNAME: str
    MAIL_PASSWORD: str
    SUPERADMIN_NAME: str
    SUPERADMIN_EMAIL: str
    SUPERADMIN_PASSWORD: str
    MAIL_FROM: str
    MAIL_PORT: int = 587
    MAIL_SERVER: str
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False 

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

settings = Settings()
