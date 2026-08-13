from typing import Optional

from app import parameters
from pydantic_settings import BaseSettings
import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://synth_user:synth_pass@localhost:5432/synthdb"
    # Legacy startup migrations (app/migrations/startup.py). Alembic is the
    # source of schema truth; this exists only as an emergency fallback during
    # the cutover and is removed once app/migrations/startup.py is deleted.
    # Never enable it in production — production's schema must come entirely
    # from the Alembic revision chain.
    RUN_STARTUP_MIGRATIONS: bool = False
    # Set SQLALCHEMY_ECHO=true in .env only when debugging SQL (echo=True is very slow)
    SQLALCHEMY_ECHO: bool = False
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    IDLE_TIMEOUT: int = 60
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

    # Artifact stimulus pipeline (asset dissection via Gemini, dimension
    # extraction/discussion guide/persona response via OpenAI). Model strings
    # here must exactly match the _MODEL_RATES keys in
    # app/services/llm_usage_tracker.py, or cost tracking for this pipeline
    # silently records cost_usd=NULL for every call.
    GEMINI_API_KEY: Optional[str] = None
    ARTIFACT_DISSECTION_MODEL: str = "gemini-2.5-flash"
    ARTIFACT_REASONING_MODEL: str = "gpt-4o-mini"
    # Bound on concurrent Stage-4 (persona response) LLM calls per pipeline run
    ARTIFACT_PERSONA_CONCURRENCY: int = 5

    # Exploration limits per pricing tier (overridable via environment)
    TIER1_EXPLORATION_LIMIT: int = 3
    ENTERPRISE_EXPLORATION_LIMIT: int = 10

    # ── Discussion Guide size limits (overridable via environment) ────────────
    # Guide size drives interview cost directly: every persona answers every
    # question, and generation batches at INTERVIEW_BATCH_SIZE, so cost scales
    # with ceil(questions / batch_size) PER PERSONA. An unbounded guide made
    # cost, latency and prompt size unbounded with it.
    #
    # Ceiling = DG_MAX_SECTIONS_PER_GUIDE * DG_MAX_QUESTIONS_PER_SECTION.
    # These are the only place these numbers are defined; the API surfaces them
    # to the UI so the frontend never hardcodes its own copy.
    DG_DEFAULT_QUESTIONS_PER_SECTION: int = 4
    DG_MAX_EXTRA_QUESTIONS_PER_SECTION: int = 2
    DG_MAX_SECTIONS_PER_GUIDE: int = 8

    # ============================================================
    # RAG SETTINGS (ADD THESE)
    # ============================================================
    
    # OpenAI Embeddings
    OPENAI_API_KEY: str = ""
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSIONS: int = 1536
    
    # Qdrant Cloud
    QDRANT_URL: str = ""
    QDRANT_API_KEY: str = ""
    QDRANT_COLLECTION_NAME: str = "syntera-behavioral-summaries"
    
    # RAG Processing Settings
    EMBED_BATCH_SIZE: int = 100
    UPSERT_BATCH_SIZE: int = 50
    TOP_K_RESULTS: int = 5

    # Background ingestion worker: how often to check for pending chunks (seconds)
    INGEST_POLL_INTERVAL_SECONDS: int = 60

    # ============================================================
    # KE Evidence Sources — quality filter + web-search topup
    # ============================================================
    KE_MIN_EVIDENCE_SOURCES: int = 10
    # Rule 1 (universal): hide any source whose indexed content is under this
    # many characters — nothing citable fits in less than this, regardless of
    # authority_tier.
    KE_HARD_FLOOR_CHARS: int = 50
    # Rule 2 (user_uploaded only, conjunctive with a generic-category title
    # match): hide only if content is ALSO under this stricter bar.
    KE_SOFT_THRESHOLD_CHARS: int = 300
    # Max web-search-origin sources allowed per domain in the topup selection.
    KE_MAX_PER_DOMAIN: int = 2
    KE_WEB_SOURCE_CACHE_TTL_HOURS: int = 48

    # ============================================================
    # KE Query Generation — structured RO-driven query construction
    # (see app/services/ro_extractor.py: build_ke_search_queries())
    # ============================================================
    # Configurable "mandatory" research-format intents mixed into generated
    # queries (e.g. "... market research report"). Kept as data, not code, so
    # new intents can be added/removed without touching query-generation
    # logic, and so they apply uniformly to any RO category.
    KE_MANDATORY_RESEARCH_INTENTS: list[str] = [
        "survey", "study", "research", "report",
        "market research", "consumer research", "public opinion",
    ]
    # Configurable "insight" intents — attitudinal/behavioural angles. Which
    # ones get used per RO is content-matched against the RO's own
    # business_objective/key_questions/hypotheses text (see
    # _select_insight_intents), not hardcoded per category.
    KE_INSIGHT_INTENTS: list[str] = [
        "awareness", "perception", "attitude", "behavior", "preference",
        "motivation", "barrier", "adoption", "trust", "acceptance",
    ]
    # How many insight intents to weave into a single RO's query set.
    KE_INSIGHT_INTENT_COUNT: int = 2
    # Raw Qdrant cosine-similarity floor applied ONLY to KE Sourcebank queries
    # (fetch_ke_sources -> controlled_sourcebank_search). Filters the
    # near-zero/noise tail before the authority/quality/domain/keyword
    # reweighting in _score_result() runs, without touching
    # search_qdrant()'s own default (0.0), which stays unchanged for every
    # other caller (report generation, etc.) outside KEL. Deliberately
    # conservative — see the threshold-change reasoning in the KEL P0 fix
    # notes: this embedding model's cosine scores are not zero-centered
    # (~0.5 already reads as "strong match" per
    # _compute_ke_confidence_from_sources), so a low floor removes clearly
    # unrelated noise without risking real coverage loss.
    KE_SOURCEBANK_SCORE_THRESHOLD: float = 0.15

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"

    @property
    def DG_MAX_QUESTIONS_PER_SECTION(self) -> int:
        """Hard cap per section: the generated defaults plus what a user may add."""
        return self.DG_DEFAULT_QUESTIONS_PER_SECTION + self.DG_MAX_EXTRA_QUESTIONS_PER_SECTION

    @property
    def DG_MAX_QUESTIONS_PER_GUIDE(self) -> int:
        """Absolute ceiling on guide size, derived from the two caps above."""
        return self.DG_MAX_SECTIONS_PER_GUIDE * self.DG_MAX_QUESTIONS_PER_SECTION

settings = Settings()
