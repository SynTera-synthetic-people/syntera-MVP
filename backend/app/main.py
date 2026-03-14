import json

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.db import (
    init_db,
    add_is_active_column,
    add_trial_columns,
    add_enterprise_columns,
    add_workspace_visibility_columns,
    add_exploration_audience_type_column,
)
from app.routers import (auth, orgs, workspace, research_objectives, personas, interview,
                         population, questionnaire, rebuttal, traceability, omi, exploration,
                         omi_workflow, admin, enterprise)
from app.schemas.response import ErrorResponse
import json
import os
from app.utils.create_superadmin import ensure_superadmin_exists


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
    await init_db()
    await add_is_active_column()
    await add_trial_columns()
    await add_enterprise_columns()
    await add_workspace_visibility_columns()
    await add_exploration_audience_type_column()
    await ensure_superadmin_exists()


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

default_cors_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://dev-ui.synthetic-people.ai",
    "https://synthetic-people.ai",
    "https://www.synthetic-people.ai",
]

cors = os.getenv("CORS_ORIGINS", "")
allow_origins = [x.strip() for x in cors.split(",") if x.strip()] or default_cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
