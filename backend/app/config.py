from typing import Optional

from app import parameters
from pydantic_settings import BaseSettings
import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://synth_user:synth_pass@localhost:5432/synthdb"
    # Set SQLALCHEMY_ECHO=true in .env only when debugging SQL (echo=True is very slow)
    SQLALCHEMY_ECHO: bool = False
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
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
    FRONTEND_URL: str = "https://dev-ui.synthetic-people.ai"

    # Claude / Anthropic (survey PDF report, qualitative reports)
    ANTHROPIC_API_KEY: Optional[str] = None

    # OpenAI model for combined survey simulation (gpt-4o-mini is fast; gpt-4.1 is slower, often richer)
    SURVEY_SIMULATION_MODEL: str = "gpt-4o-mini"

    # Exploration limits per pricing tier (overridable via environment)
    TIER1_EXPLORATION_LIMIT: int = 3
    ENTERPRISE_EXPLORATION_LIMIT: int = 10

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

settings = Settings()
