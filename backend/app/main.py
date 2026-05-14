import json
import logging
import os
from app.routers import insights
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.db import async_session
from app.migrations.startup import run_startup_migrations
from app.routers import (auth, orgs, workspace, research_objectives, personas, interview,
                         population, questionnaire, rebuttal, traceability, omi, exploration,
                         omi_workflow, admin, enterprise, syncdb, billing, product_state)
from app.routers import settings as settings_router
from app.routers import reports as reports_router_module
from app.schemas.response import ErrorResponse
from app.services.billing_service import seed_subscription_plans
from app.utils.create_superadmin import ensure_superadmin_exists


def _configure_logging() -> None:
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    root_logger = logging.getLogger()
    if not root_logger.handlers:
        logging.basicConfig(
            level=level,
            format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        )

    logging.getLogger("app").setLevel(level)


_configure_logging()

app = FastAPI(title="Synthetic People")


@app.get("/health")
def health():
    return {"status": "ok"}


def normalize_detail(detail):
    if detail is None:
        return ""

    if isinstance(detail, str):
        return detail

    if isinstance(detail, dict):
        if "message" in detail:
            msg = detail["message"]
            if isinstance(msg, (dict, list)):
                return json.dumps(msg, ensure_ascii=False)
            return str(msg)
        return json.dumps(detail, ensure_ascii=False)

    if isinstance(detail, (list, tuple)):
        try:
            return ", ".join(str(x) for x in detail)
        except Exception:
            return str(detail)

    return str(detail)


@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    message = normalize_detail(exc.detail)
    payload = ErrorResponse(
        status="error",
        message=message
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=payload.dict()
    )


@app.on_event("startup")
async def startup():
    await run_startup_migrations()
    await ensure_superadmin_exists()
    # Seed plan catalog after billing tables and indexes are guaranteed.
    async with async_session() as _seed_session:
        await seed_subscription_plans(_seed_session)


app.include_router(auth.router)
app.include_router(orgs.router)
app.include_router(omi.router)
app.include_router(workspace.router)
app.include_router(research_objectives.router)
app.include_router(personas.router)
app.include_router(interview.router)
app.include_router(population.router)
app.include_router(questionnaire.router)
app.include_router(rebuttal.router)
app.include_router(traceability.router)
app.include_router(exploration.router)
app.include_router(omi_workflow.router)
app.include_router(admin.router)
app.include_router(enterprise.router)
app.include_router(reports_router_module.router)
app.include_router(syncdb.router)
app.include_router(billing.router)
app.include_router(settings_router.router)
app.include_router(product_state.router)
app.include_router(insights.router)

# default_cors_origins = [
#     "http://localhost:5173",
#     "http://localhost:5174",
#     "https://dev-ui.synthetic-people.ai",
#     "https://synthetic-people.ai",
#     "https://www.synthetic-people.ai",
# ]

cors = os.getenv("CORS_ORIGINS", "https://staging-ui.synthetic-people.ai")
allow_origins = [x.strip() for x in cors.split(",") if x.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    #allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
