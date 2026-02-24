## Synthetic People Backend

**Synthetic People Backend** is a FastAPI-based service that powers the Synthetic People research platform. It provides APIs for managing organizations, workspaces, research explorations, AI-generated personas, interviews, survey simulations, traceability reports, and user authentication/authorization.

The service is built on **FastAPI**, **SQLModel**, and **PostgreSQL**, with async I/O throughout and GitHub Actions–based CI/CD.

---

### Table of Contents

- **Overview**
- **Core Features**
- **Architecture & Tech Stack**
- **Local Development Setup**
- **Configuration (`.env`)**
- **Running the Application**
- **Database & Migrations**
- **Testing**
- **Deployment**
- **API Surface (High-Level)**
- **Troubleshooting**

---

### Overview

This repository contains the backend for the Synthetic People platform, exposed as a FastAPI application in `app.main:app`.

Key responsibilities:

- **User & auth management** (signup, login, JWT-based sessions, password reset)
- **Organization & workspace management**
- **Research explorations & objectives**
- **AI-assisted persona generation, validation, and backstory creation**
- **Interview flows, survey simulations (quant & qual)**
- **Traceability reports** linking objectives, personas, and research outputs
- **OMI workflow integration** for guidance, validation, and encouragement

CORS is configured in `app.main` to allow requests from the Synthetic People UI (e.g. `https://dev-ui.synthetic-people.ai`).

---

### Core Features

- **Authentication & Authorization**
  - Email/password signup & login
  - JWT-based access tokens
  - Email verification and password reset flows
  - `is_active` and `is_verified` flags for user lifecycle

- **Organizations & Workspaces**
  - Manage organizations and workspace membership
  - Workspace admin vs member permissions

- **Research Explorations & Objectives**
  - Define research explorations and objectives
  - Connect explorations to personas, interviews, surveys, and reports

- **Personas**
  - Auto-generate personas from explorations using AI (`/auto-generate`)
  - Manually-create & update personas
  - Persona previews and OCEAN personality profiles via AI
  - Trait validation using the OMI service
  - Persona backstories and confidence scoring

- **Interviews & Surveys**
  - Interview sections and downloadable content flags
  - Survey simulations (quantitative and qualitative)
  - Simulation result storage and download flags

- **Traceability & Reporting**
  - `traceability_report` table with JSONB fields:
    - Research objective traceability
    - Persona traceability
    - Quant & qual traceability
  - Report generation utilities (PDF, DOCX, Markdown, etc.)

- **OMI Integration**
  - Notify OMI about workflow stage changes
  - Ask OMI for concerns/encouragement during persona building
  - Validate persona traits in the context of research objectives

- **Admin Utilities**
  - Automatic superadmin bootstrap on startup via `ensure_superadmin_exists`
  - Admin router for managing privileged operations

---

### Architecture & Tech Stack

- **Language**: Python 3.11
- **Framework**: FastAPI
- **ORM / Models**: SQLModel + SQLAlchemy (async)
- **Database**: PostgreSQL (async driver: `asyncpg`)
- **Auth**:
  - JWT (`PyJWT`)
  - Password hashing with `passlib[bcrypt]`
- **Config Management**: `pydantic-settings` + `.env` via `python-dotenv`
- **Email**: `fastapi-mail` + SMTP config
- **Background / async IO**: FastAPI's async handlers and `BackgroundTasks`
- **AI / LLM Integrations**:
  - OpenAI (`openai`)
  - OMI-specific helper functions in `app.utils.omi_helpers`
- **Reporting / Documents**:
  - PDF generation: `reportlab`, `pdfkit`, `PyPDF2`, `pdf2image`
  - DOCX: `python-docx` (`docx`)
  - Text/Markdown: `Markdown`
- **CI/CD**: GitHub Actions workflow in `.github/workflows/deploy.yml`

The FastAPI app is instantiated in `app.main:app` and routers are registered by domain (auth, orgs, workspace, research_objectives, personas, interview, population, questionnaire, rebuttal, traceability, omi, exploration, omi_workflow, admin).

---

### Local Development Setup

- **Prerequisites**
  - Python **3.11**
  - PostgreSQL 13+ running locally or accessible via network
  - `git`

- **Clone the repository**

```bash
git clone <YOUR_REPO_URL> synthetic_people_backend
cd synthetic_people_backend
```

- **Create and activate a virtual environment**

```bash
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\Activate.ps1

# Windows (cmd.exe)
.venv\Scripts\activate.bat

# Linux / macOS
source .venv/bin/activate
```

- **Install dependencies**

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

---

### Configuration (`.env`)

Configuration is managed via `pydantic-settings` in `app.config.Settings`. Most settings are loaded from `.env` (see `app/config.py`).

Create a `.env` file in the project root based on the following example:

```env
# Database
DATABASE_URL=postgresql+asyncpg://synth_user:synth_pass@localhost:5432/synthdb

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=120

# Session / idle timeout (minutes)
IDLE_TIMEOUT=15

# Mail settings
MAIL_USERNAME=your_smtp_username
MAIL_PASSWORD=your_smtp_password
MAIL_FROM=no-reply@your-domain.com
MAIL_PORT=587
MAIL_SERVER=smtp.your-domain.com
MAIL_STARTTLS=true
MAIL_SSL_TLS=false

# Superadmin bootstrap (created on startup)
SUPERADMIN_NAME=Super Admin
SUPERADMIN_EMAIL=admin@your-domain.com
SUPERADMIN_PASSWORD=super-secure-password

# OpenAI
OPENAI_API_KEY=your_openai_api_key
```

> **Note**: Do **not** commit `.env` to source control. The file is intentionally excluded via `.gitignore`.

---

### Running the Application

Ensure PostgreSQL is running and the `DATABASE_URL` in `.env` is correct.

- **Initial database creation**

Tables are created on startup by `init_db()` in `app.db`, and additional migrations/columns are applied in `add_is_active_column()`. The first application startup will create the required tables.

- **Run FastAPI with Uvicorn (development)**

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:

- Base URL: `http://localhost:8000`
- Interactive docs:
  - Swagger UI: `http://localhost:8000/docs`

On startup, the app will:

- Initialize the database and tables
- Apply additional schema updates (e.g., `is_active` and traceability fields)
- Ensure a superadmin user exists based on `SUPERADMIN_*` environment variables

---

### Database & Migrations

The project uses:

- **SQLModel** for ORM models
- **Async SQLAlchemy engine** (`create_async_engine`) against PostgreSQL
- **Alembic** is included in `requirements.txt`, but the core schema is created/updated at runtime via:
  - `init_db()` – creates tables from `SQLModel.metadata`
  - `add_is_active_column()` – applies additional DDL changes using raw SQL

If you introduce structural changes, you can either:

- Extend `add_is_active_column()` with new DDL statements, or
- Configure and maintain a proper Alembic migration directory and run migrations as part of your deployment process.

---

### Testing

The GitHub Actions workflow (`.github/workflows/deploy.yml`) runs tests (if a `tests/` directory exists) on each push to the `test-environment` branch.

- **Run tests locally**

```bash
pytest
```

If no tests exist yet, `pytest` will simply report “no tests collected”.

---

### Deployment

CI/CD is configured with GitHub Actions:

- **Workflow**: `.github/workflows/deploy.yml`
- **Trigger**: Push to the `test-environment` branch or manual `workflow_dispatch`
- **Jobs**:
  - `test`:
    - Runs on a `self-hosted` runner
    - Sets up Python 3.11
    - Creates a venv and installs `requirements.txt`
    - Runs pytest if a `tests/` directory exists
  - `deploy` (needs `test`):
    - Syncs code to `/var/www/synthetic_people_backend/` via `rsync`
    - Activates an existing `venv` on the server and runs `pip install -r requirements.txt`
    - Restarts the `synthetic-backend` systemd service

To adapt this for other environments:

- Update the target directory (`/var/www/synthetic_people_backend/`)
- Ensure a `venv` exists and `synthetic-backend` systemd service is configured
- Provide necessary environment variables on the target server (e.g., via systemd unit or environment files)

---

### API Surface (High-Level)

Routers are defined under `app.routers` and mounted in `app.main`. At a high level:

- `auth` (`/auth`): signup, login, email verification, password reset, current user profile
- `orgs` (`/orgs`): organization CRUD and membership (implementation in `app/routers/orgs.py`)
- `workspace` (`/workspaces`): workspace management and membership
- `research_objectives` (`/workspaces/{workspace_id}/research-objectives/...`): manage research objectives per workspace
- `personas` (`/workspaces/{workspace_id}/explorations/{exploration_id}/personas/...`):
  - Auto-generate personas via AI
  - Create, update, delete, list personas
  - Generate previews, backstories, and OCEAN profiles
  - Validate persona traits with OMI
- `interview`, `population`, `questionnaire`, `rebuttal`, `traceability`, `exploration`:
  - Manage interviews, populations, questionnaires, rebuttal workflows, traceability reports, and explorations
- `omi`, `omi_workflow`:
  - OMI session and workflow integration
- `admin`:
  - Admin-only operations (e.g., managing users, elevated actions)

For up-to-date, detailed endpoints, always refer to the interactive `/docs` UI.

---

### Troubleshooting

- **Cannot connect to database**
  - Verify `DATABASE_URL` in `.env`
  - Check that PostgreSQL is running and accessible
  - Confirm that the user, password, and database exist

- **401 / 403 errors**
  - Ensure you include the `Authorization: Bearer <token>` header after login
  - Check that the user is verified and active (`is_verified`, `is_active`)

- **Email not sent**
  - Confirm SMTP settings (`MAIL_*` variables)
  - Check server logs for connection/authentication errors

- **AI/LLM errors**
  - Verify `OPENAI_API_KEY`
  - Check rate limits and network connectivity from the server

---
