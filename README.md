# Synthetic People (SynTera)

Synthetic People is an AI market-research platform. A team defines a research
objective, the platform builds evidence-grounded synthetic personas, and those
personas take part in qualitative depth interviews and quantitative surveys.
The output is a set of reports that can be traced back to the evidence behind
every answer.

This repository is a monorepo with a **FastAPI backend** and a **React (Vite)
frontend**, deployed to AWS EKS.

---

## Contents

- [What the platform does](#what-the-platform-does)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database migrations](#database-migrations)
- [Tests and linting](#tests-and-linting)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Further documentation](#further-documentation)

---

## What the platform does

A study is called an **exploration** and lives inside a **workspace** that
belongs to an **organization**. The flow through an exploration:

| Step | What happens |
|---|---|
| **Research objective** | The user frames the business question. The Knowledge Engine pulls supporting evidence from the sourcebank (Qdrant) and the web. |
| **Personas** | Personas are auto-generated or built manually and scored for alignment with the objective. The **Persona Library** makes them reusable across the organization. |
| **Qualitative** | A discussion guide drives AI depth interviews with each persona. |
| **Quantitative** | The Population Builder sizes a synthetic sample, the questionnaire is designed, and a survey simulation runs across the population. |
| **Insights** | Interview Verbatim, Decision Intelligence, Behaviour Archaeology, Raw Data Shell, and the Data Playground for exploring uploaded datasets. |
| **Traceability & Decision Room** | Links every finding back to the objective, the personas and the evidence behind them. |

Supporting capabilities:

- **Rebuttal mode**: push back on a persona's answers and continue the conversation.
- **Artifact testing**: upload a creative or collateral and get persona reactions (Gemini dissection plus OpenAI reasoning).
- **Neuroscience layer** (`backend/app/neuro`): an affect and appraisal model that runs in shadow mode behind a runtime flag.
- **SyncDB**: ingests action data, survey data and scraped sources, which feed the ML models and the RAG index.
- **Accounts and plans**: free trial, Tier 1 and Enterprise, each with exploration limits. Includes an admin console, enterprise org management, role-based access and an audit log.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, SQLModel / SQLAlchemy 2 (async), asyncpg |
| Database | PostgreSQL, schema managed by Alembic |
| Vector search | Qdrant, OpenAI embeddings |
| LLMs | OpenAI (core), Anthropic Claude (reports), Google Gemini (artifacts) |
| Reports | xhtml2pdf / ReportLab, Playwright (HTML → PDF), python-docx, openpyxl, matplotlib |
| ML | scikit-learn, XGBoost, LightGBM, CatBoost |
| Auth | JWT (PyJWT), bcrypt via passlib, slowapi rate limiting |
| Frontend | React 19, Vite 7, React Router 7, Redux Toolkit + Redux Saga, TanStack Query 5, Tailwind CSS, Framer Motion, Recharts |
| Infra | Docker, AWS ECR + EKS, AWS SSM Parameter Store, GitHub Actions |

---

## Repository layout

```
syntera-MVP/
├── backend/
│   ├── app/
│   │   ├── main.py            FastAPI app, routers, startup hooks
│   │   ├── config.py          Settings (every env var the API reads)
│   │   ├── parameters.py      Loads AWS SSM parameters when SSM_PATH is set
│   │   ├── db.py              Async engine and session
│   │   ├── core/              Permissions (RBAC), rate limiting
│   │   ├── models/            SQLModel tables
│   │   ├── schemas/           Request/response models
│   │   ├── routers/           API endpoints, one file per domain
│   │   ├── services/          Business logic, LLM pipelines, report generation
│   │   ├── rag/               Qdrant ingestion and retrieval
│   │   ├── ml/                Behaviour prediction models
│   │   ├── neuro/             Neuroscience layer
│   │   └── utils/             Email, security, helpers
│   ├── alembic/               Migrations (schema source of truth)
│   ├── scripts/               Operational and one-off scripts
│   ├── tests/                 pytest suite
│   ├── example.env            Backend env template
│   ├── requirements.txt       Runtime dependencies
│   ├── requirements-dev.txt   Runtime + test dependencies
│   ├── docker-compose.yml     Local PostgreSQL
│   └── dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/pages/  Screens, grouped by feature
│   │   ├── hooks/             TanStack Query hooks
│   │   ├── services/          API clients
│   │   ├── redux/             Store, slices, sagas
│   │   ├── routes/            Route definitions and guards
│   │   └── config/apiConfig.js
│   ├── example.env            Frontend env template
│   └── dockerfile
├── k8sdeployment/             Kubernetes manifests (staging/, production/)
├── .github/workflows/         CI/CD
└── docs/                      Design proposals
```

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.11 | Same version as the Docker image and CI |
| Node.js | 20+ | npm is bundled |
| PostgreSQL | 15+ | Easiest via Docker; the migration CI runs on 18 |
| Docker | any recent | Only needed for the local database |
| Git | any | |

You also need an **OpenAI API key**. Anthropic, Gemini and Qdrant credentials
unlock reports, artifact testing and evidence search, but the app starts
without them.

---

## Local setup

Commands run from the repository root unless a step says otherwise. Where bash
and PowerShell differ, both are shown.

### 1. Clone

```bash
git clone <repository-url> syntera-MVP
cd syntera-MVP
```

### 2. Start PostgreSQL

```bash
docker compose -f backend/docker-compose.yml up -d
```

This creates the database `synthdb` with user `synth_user` and password
`synth_pass` on `localhost:5432`, which matches the default `DATABASE_URL` in
`backend/example.env`. To use a PostgreSQL you already run, create an empty
database and point `DATABASE_URL` at it instead.

### 3. Backend

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

```bash
source .venv/bin/activate        # macOS / Linux
```
```powershell
.venv\Scripts\Activate.ps1       # Windows PowerShell
```

Install dependencies, plus the Chromium build Playwright uses to render PDFs:

```bash
pip install --upgrade pip
pip install -r requirements-dev.txt
python -m playwright install chromium
```

Create your env file and fill it in. At minimum, set `JWT_SECRET`,
`OPENAI_API_KEY`, the `SUPERADMIN_*` values and the `MAIL_*` values:

```bash
cp example.env .env
```
```powershell
Copy-Item example.env .env
```

Build the schema, then start the API:

```bash
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API: http://localhost:8000
- Swagger docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

On startup the API creates the superadmin from `SUPERADMIN_*`, seeds the
subscription plans and starts the background RAG ingestion worker.

> **Existing database?** If a database already has tables but no
> `alembic_version` row (it was built by the old startup migrations), **do not**
> run `upgrade head`. Stamp it first, following
> [backend/alembic/README.md](backend/alembic/README.md#bringing-an-existing-database-under-alembic).

### 4. Frontend

In a second terminal:

```bash
cd frontend
npm install
cp example.env .env.local        # PowerShell: Copy-Item example.env .env.local
npm run dev
```

Open http://localhost:5173 and sign in with `SUPERADMIN_EMAIL` /
`SUPERADMIN_PASSWORD`.

> Use **`.env.local`**, not `.env`. `frontend/.env` is committed and baked into
> the Docker image, so it must keep pointing at the deployed API. Committing a
> `localhost` URL there breaks the deployed UI.

---

## Environment variables

The full, commented lists are in the templates:

- [backend/example.env](backend/example.env): every setting in `app/config.py`, plus the optional tuning variables
- [frontend/example.env](frontend/example.env)

### Backend: required

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@host:5432/db` |
| `JWT_SECRET` | Signs access tokens |
| `OPENAI_API_KEY` | Core LLM and embeddings. The API will not start without it. |
| `SUPERADMIN_NAME`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` | Bootstrap admin. The password is re-applied on every startup. |
| `MAIL_SERVER`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM` | SMTP for account and share emails |

### Backend: feature-dependent

| Variable | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` | Decision Intelligence and Behaviour Archaeology reports |
| `GEMINI_API_KEY` | Artifact (stimulus) analysis |
| `QDRANT_URL`, `QDRANT_API_KEY` | Knowledge Engine evidence, sourcebank, RAG |
| `FRONTEND_URL` | Links in emails. Defaults to the dev UI, so set it locally. |

### Frontend

| Variable | Purpose |
|---|---|
| `VITE_BACKEND_URL` | API origin, e.g. `http://localhost:8000`. Without it the app falls back to port 8080. |
| `VITE_API_TIMEOUT` | Default request timeout (ms) |
| `VITE_REPORT_TIMEOUT` | Report download timeout (ms) |

In deployed environments the backend does not read a `.env` file. Kubernetes
sets `SSM_PATH` (`/app/staging/` or `/app/platform/`), and
`app/parameters.py` loads every parameter under that path from AWS SSM
Parameter Store.

---

## Database migrations

**Alembic is the only source of schema truth.** Never create tables with
`SQLModel.metadata.create_all`, and never set `RUN_STARTUP_MIGRATIONS=true`
outside an emergency.

```bash
cd backend
alembic current                                  # revision this DB is on
alembic upgrade head                             # apply outstanding revisions
alembic revision --autogenerate -m "describe change"
```

Always read an autogenerated revision before committing it. Autogenerate gets
partial, expression and GIN indexes wrong, as well as anything in the `sync_*`
tables. The full procedure, including large-table indexes and stamping existing
databases, is in [backend/alembic/README.md](backend/alembic/README.md).

---

## Tests and linting

Backend:

```bash
cd backend
pytest tests/ -v
```

`tests/test_migrations.py` needs a reachable PostgreSQL server. It creates and
drops its own scratch databases, and by default it uses the server from
`docker-compose.yml`. Override it with `MIGRATION_TEST_ADMIN_URL`. The tests
skip if no server is reachable. The `scripts/test_*.py` files are manual
pipeline checks and are not part of the suite.

Frontend:

```bash
cd frontend
npm run lint
npm run test:questionnaire
npm run build        # production bundle
```

---

## Deployment

Deploys run from GitHub Actions on push:

| Branch | Workflow | Namespace | Manifests | SSM path |
|---|---|---|---|---|
| `staging` | [staging.yml](.github/workflows/staging.yml) | `syntera-mvp` | `k8sdeployment/*.yml` | `/app/staging/` |
| `production` | [production.yml](.github/workflows/production.yml) | `syntera-prod` | `k8sdeployment/production/` | `/app/platform/` |

Each run:

1. Builds the frontend and backend Docker images and pushes them to ECR.
2. Runs `alembic upgrade head` as a Kubernetes Job (`migrate-job.yaml`). **If the migration fails, the rollout does not start** and the previous version keeps serving.
3. Rolls out the new images to EKS, and rolls back automatically if a rollout fails.

Pull requests that touch models, migrations or tests also run
[migrations.yml](.github/workflows/migrations.yml). It builds the whole schema
on a fresh PostgreSQL and publishes the rendered SQL for review. Opening a PR
never deploys anything.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ValidationError: ... field required` on startup | A required backend variable is missing from `backend/.env`. Compare with `example.env`. |
| `OpenAIError: api_key client option must be set` | Set `OPENAI_API_KEY`. |
| API can't reach the database | Check `docker ps` shows `syntera_postgres` and that `DATABASE_URL` uses `+asyncpg`. |
| `relation "..." does not exist` | Schema not built. Run `alembic upgrade head` from `backend/`. |
| `DuplicateTable` during `alembic upgrade head` | The database predates Alembic. Stamp it instead (see [Database migrations](#database-migrations)). |
| Frontend calls hit `localhost:8080` or staging | `VITE_BACKEND_URL` is missing from `frontend/.env.local`. Restart `npm run dev` after changing it. |
| PDF report generation fails with a browser error | Run `python -m playwright install chromium` inside the backend venv. |
| Emails not delivered | Check the `MAIL_*` values. The TLS flags are `MAIL_STARTTLS` / `MAIL_SSL_TLS`. |
| Evidence sources empty | `QDRANT_URL` / `QDRANT_API_KEY` are unset or unreachable. Check the logs for `ingest_worker`. |

---

## Further documentation

- [backend/alembic/README.md](backend/alembic/README.md): migrations in depth
- [backend/app/neuro/README.md](backend/app/neuro/README.md): neuroscience layer requirement register
- [backend/app/ml/README.md](backend/app/ml/README.md): ML pipeline
- [docs/](docs/): design proposals
