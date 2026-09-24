"""Decision Room context lookups, against a real PostgreSQL database.

The unit tests around these fake the database away, which is the right trade
for logic but leaves the part that actually broke untested: the SQL. A cache
key that matches nothing, a simulation filter that never fires and a NULL
comparison that silently excludes every quant row all look correct in Python
and only fail against a server.

Each test gets its own scratch database, created and dropped here, so nothing
touches a database holding real data. Skipped automatically when no server is
reachable — see tests/conftest.py.

Run: pytest tests/test_decision_room_db_integration.py -v
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta

import psycopg2
import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from tests.conftest import ADMIN_URL, requires_postgres

pytestmark = requires_postgres

EXPLORATION = "exp_dr"
WORKSPACE = "ws_dr"


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def db(monkeypatch):
    """A scratch database with the full schema, wired into the services.

    Foreign keys are dropped after creation: these tests insert the handful of
    rows the lookups read and are not exercising referential integrity, and
    building a valid organisation/user/workspace/exploration chain for every
    case would be most of the fixture.
    """
    name = f"drtest_{uuid.uuid4().hex[:12]}"
    admin = psycopg2.connect(ADMIN_URL)
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute(f'CREATE DATABASE "{name}"')
    admin.close()

    base, _, _ = ADMIN_URL.rpartition("/")
    async_url = f"{base}/{name}".replace("postgresql://", "postgresql+asyncpg://")

    from app.models import register_all_models

    register_all_models()
    # NullPool because each asyncio.run() below is a separate event loop, and a
    # pooled asyncpg connection belongs to the loop that opened it — reusing one
    # across loops fails with "Event loop is closed".
    engine = create_async_engine(async_url, poolclass=NullPool)

    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)
            await conn.exec_driver_sql(
                "DO $$ DECLARE r record; BEGIN "
                "FOR r IN (SELECT conrelid::regclass AS t, conname FROM pg_constraint "
                "WHERE contype = 'f') LOOP "
                "EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.t, r.conname); "
                "END LOOP; END $$;"
            )

    run(setup())

    # The services bind the engine at import time, so each one is redirected.
    from app.services import persona as persona_svc
    from app.services import report_orchestrator as report_cache
    from app.services import survey_simulation as survey_svc

    for module in (report_cache, survey_svc, persona_svc):
        monkeypatch.setattr(module, "async_engine", engine, raising=False)

    try:
        yield engine
    finally:
        run(engine.dispose())
        admin = psycopg2.connect(ADMIN_URL)
        admin.autocommit = True
        with admin.cursor() as cur:
            cur.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = %s AND pid <> pg_backend_pid()",
                (name,),
            )
            cur.execute(f'DROP DATABASE IF EXISTS "{name}"')
        admin.close()


async def _insert(engine, sql: str, params: dict) -> None:
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.execute(text(sql), params)


async def _add_report(engine, *, cta_type, report_type="qual", content_md=None,
                      simulation_id=None, created_at=None, status="done",
                      exploration_id=EXPLORATION):
    await _insert(
        engine,
        "INSERT INTO report_cache (id, exploration_id, simulation_id, report_type, "
        "cta_type, status, content_md, created_at) VALUES (:id, :e, :s, :rt, :c, :st, :md, :ts)",
        {"id": uuid.uuid4().hex, "e": exploration_id, "s": simulation_id,
         "rt": report_type, "c": cta_type, "st": status, "md": content_md,
         "ts": created_at or datetime.utcnow()},
    )


async def _add_simulation(engine, *, sim_id, created_at, exploration_id=EXPLORATION,
                          workspace_id=WORKSPACE):
    await _insert(
        engine,
        "INSERT INTO surveysimulation (id, workspace_id, exploration_id, created_by, "
        "total_sample_size, is_download, created_at) "
        "VALUES (:id, :w, :e, :u, 100, false, :ts)",
        {"id": sim_id, "w": workspace_id, "e": exploration_id, "u": "user_1", "ts": created_at},
    )


async def _add_persona(engine, *, pid, name, calibration_status,
                       exploration_id=EXPLORATION, workspace_id=WORKSPACE):
    await _insert(
        engine,
        "INSERT INTO persona (id, workspace_id, exploration_id, created_by, name, "
        "age_range, gender, education_level, income_range, location_country, occupation, "
        "calibration_status, created_at) "
        "VALUES (:id, :w, :e, :u, :n, '30-40', 'F', 'Graduate', '10-20L', 'Indonesia', "
        "'Analyst', :cs, :ts)",
        {"id": pid, "w": workspace_id, "e": exploration_id, "u": "user_1", "n": name,
         "cs": calibration_status, "ts": datetime.utcnow()},
    )


# ── ReportCache lookup ───────────────────────────────────────────────────────

def test_a_versioned_qual_report_is_found_by_its_public_cta(db):
    from app.services import report_orchestrator as report_cache

    run(_add_report(db, cta_type="DECISION_INTELLIGENCE_V8", content_md="# Real DI findings"))

    found = run(report_cache.get_report_text(EXPLORATION, "qual", "DECISION_INTELLIGENCE"))

    assert found == ("# Real DI findings", "DECISION_INTELLIGENCE_V8")


def test_the_public_cta_is_not_a_row_that_exists(db):
    """The original bug, against a real table: a report is present and a lookup
    by the public name still returns nothing, without error."""
    from app.services import report_orchestrator as report_cache

    run(_add_report(db, cta_type="DECISION_INTELLIGENCE_V8", content_md="# Real DI findings"))

    assert run(report_cache.get_cached_report(EXPLORATION, "DECISION_INTELLIGENCE")) is None


def test_a_legacy_key_is_still_reachable(db):
    from app.services import report_orchestrator as report_cache

    run(_add_report(db, cta_type="QUAL_DECISION_INTELLIGENCE_V1", content_md="# Older DI"))

    found = run(report_cache.get_report_text(EXPLORATION, "qual", "DECISION_INTELLIGENCE"))

    assert found == ("# Older DI", "QUAL_DECISION_INTELLIGENCE_V1")


def test_a_quant_report_is_only_found_with_its_simulation_id(db):
    """Quant rows carry a simulation. Asking without one compares against NULL
    and matches nothing, which is why quant context was always empty."""
    from app.services import report_orchestrator as report_cache

    run(_add_report(db, cta_type="DECISION_INTELLIGENCE_V2", report_type="quant",
                    content_md="# Quant DI", simulation_id="sim_a"))

    assert run(report_cache.get_report_text(EXPLORATION, "quant", "DECISION_INTELLIGENCE")) is None
    assert run(report_cache.get_report_text(
        EXPLORATION, "quant", "DECISION_INTELLIGENCE", "sim_a"
    )) == ("# Quant DI", "DECISION_INTELLIGENCE_V2")


def test_an_unfinished_report_is_not_served(db):
    from app.services import report_orchestrator as report_cache

    run(_add_report(db, cta_type="DECISION_INTELLIGENCE_V8", content_md="# partial",
                    status="pending"))

    assert run(report_cache.get_report_text(EXPLORATION, "qual", "DECISION_INTELLIGENCE")) is None


# ── Simulation selection ─────────────────────────────────────────────────────

def test_the_simulation_of_the_newest_quant_report_is_selected(db):
    from app.services import report_orchestrator as report_cache

    now = datetime.utcnow()
    run(_add_report(db, cta_type="DECISION_INTELLIGENCE_V2", report_type="quant",
                    content_md="old", simulation_id="sim_old", created_at=now - timedelta(days=2)))
    run(_add_report(db, cta_type="DECISION_INTELLIGENCE_V2", report_type="quant",
                    content_md="new", simulation_id="sim_new", created_at=now))

    assert run(report_cache.latest_simulation_id_with_report(EXPLORATION)) == "sim_new"


def test_qual_rows_never_supply_a_simulation(db):
    """Qual rows have a NULL simulation_id; they must not be picked up as the
    quant simulation just because they are the newest row."""
    from app.services import report_orchestrator as report_cache

    now = datetime.utcnow()
    run(_add_report(db, cta_type="DECISION_INTELLIGENCE_V2", report_type="quant",
                    content_md="q", simulation_id="sim_a", created_at=now - timedelta(days=1)))
    run(_add_report(db, cta_type="DECISION_INTELLIGENCE_V8", content_md="qual", created_at=now))

    assert run(report_cache.latest_simulation_id_with_report(EXPLORATION)) == "sim_a"


def test_no_quant_report_means_no_simulation_from_the_cache(db):
    from app.services import report_orchestrator as report_cache

    run(_add_report(db, cta_type="DECISION_INTELLIGENCE_V8", content_md="qual only"))

    assert run(report_cache.latest_simulation_id_with_report(EXPLORATION)) is None


def test_another_explorations_report_is_not_borrowed(db):
    from app.services import report_orchestrator as report_cache

    run(_add_report(db, cta_type="DECISION_INTELLIGENCE_V2", report_type="quant",
                    content_md="x", simulation_id="sim_other", exploration_id="exp_other"))

    assert run(report_cache.latest_simulation_id_with_report(EXPLORATION)) is None


# ── Survey simulation lookup ─────────────────────────────────────────────────

def test_the_latest_survey_run_is_returned(db):
    from app.services.survey_simulation import get_latest_survey_simulation_for_exploration

    now = datetime.utcnow()
    run(_add_simulation(db, sim_id="sim_old", created_at=now - timedelta(days=3)))
    run(_add_simulation(db, sim_id="sim_new", created_at=now))

    sim = run(get_latest_survey_simulation_for_exploration(EXPLORATION, WORKSPACE))

    assert sim.id == "sim_new"


def test_a_survey_run_from_another_workspace_is_not_returned(db):
    from app.services.survey_simulation import get_latest_survey_simulation_for_exploration

    run(_add_simulation(db, sim_id="sim_elsewhere", created_at=datetime.utcnow(),
                        workspace_id="ws_other"))

    assert run(get_latest_survey_simulation_for_exploration(EXPLORATION, WORKSPACE)) is None


def test_an_exploration_with_no_survey_run_returns_nothing(db):
    from app.services.survey_simulation import get_latest_survey_simulation_for_exploration

    assert run(get_latest_survey_simulation_for_exploration(EXPLORATION, WORKSPACE)) is None


# ── Persona lookup ───────────────────────────────────────────────────────────

def test_personas_are_read_from_the_exploration_not_from_interviews(db):
    """The quant case: personas exist, no interview does, and the old source
    returned none of them."""
    from app.services.persona import list_non_draft_personas

    run(_add_persona(db, pid="p1", name="Value Seeker", calibration_status="calibrated"))
    run(_add_persona(db, pid="p2", name="Premium Buyer", calibration_status=None))

    personas = run(list_non_draft_personas(WORKSPACE, EXPLORATION))

    assert {p["name"] for p in personas} == {"Value Seeker", "Premium Buyer"}


def test_draft_personas_are_excluded(db):
    """Matches the interview filter (interview.py), so nothing an interview
    could have contributed is lost by reading the persona table instead."""
    from app.services.persona import list_non_draft_personas

    run(_add_persona(db, pid="p1", name="Ready", calibration_status="calibrated"))
    run(_add_persona(db, pid="p2", name="Half-built", calibration_status="draft"))

    personas = run(list_non_draft_personas(WORKSPACE, EXPLORATION))

    assert [p["name"] for p in personas] == ["Ready"]


def test_personas_from_another_exploration_are_not_returned(db):
    from app.services.persona import list_non_draft_personas

    run(_add_persona(db, pid="p9", name="Elsewhere", calibration_status="calibrated",
                     exploration_id="exp_other"))

    assert run(list_non_draft_personas(WORKSPACE, EXPLORATION)) == []
