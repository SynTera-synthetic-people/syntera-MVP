"""Data Playground: the dataset's rows have to be readable on any replica.

Regression suite for "Failed to compute frequency" / "Failed to compute
crosstab" (HTTP 422) in the Data Playground.

Dataset files are written to a pod-local directory while the API runs several
replicas with no shared volume, so the pod that ingests a dataset is usually
not the pod that answers the next analysis request. The dp_dataset and
dp_variable rows live in Postgres and resolve on every pod — which is why the
variables panel filled in normally — while the file behind them existed on one
disk only. The reader raised FileNotFoundError, a blanket `except Exception`
turned it into 422, and the user saw a message with nothing actionable in it.

A survey-results dataset can be rebuilt: its provenance is in meta and the
simulation it came from is in Postgres. An uploaded file cannot be, and says
so plainly instead.

The integration tests run against a real PostgreSQL scratch database and skip
when no server is reachable — see tests/conftest.py.

Run: pytest tests/test_data_playground_dataset_file.py -v
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime

import psycopg2
import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from app.models.data_playground import DataPlaygroundDataset
from app.services import data_playground as dp
from app.utils.file_utils import dataset_file_path
from tests.conftest import ADMIN_URL, requires_postgres

WORKSPACE = "ws_dp"
EXPLORATION = "exp_dp"
SIMULATION = "sim_dp"

# Aggregates the simulation stores; the rebuilt per-respondent file must add
# back up to exactly these.
SURVEY_RESULTS = (
    '{"Which sector do you work in?": '
    '[{"option": "Tech", "count": 6}, {"option": "Retail", "count": 4}]}'
)
SAMPLE_SIZE = 10


def run(coro):
    return asyncio.run(coro)


def _dataset(**overrides) -> DataPlaygroundDataset:
    defaults = dict(
        workspace_id=WORKSPACE,
        exploration_id=EXPLORATION,
        name="ds",
        original_filename="x.csv",
        stored_filename=f"{uuid.uuid4().hex}.csv",
        file_type="csv",
        status="ready",
        meta={"source": "survey_results", "simulation_id": SIMULATION,
              "sheet_name": None, "header_row": 0},
    )
    defaults.update(overrides)
    return DataPlaygroundDataset(**defaults)


# ── Which datasets can be restored at all ───────────────────────────────────

def test_a_present_file_is_left_alone(tmp_path, monkeypatch):
    """The common path: nothing is rebuilt when the file is already here."""
    rebuilt = []

    async def fake_rebuild(**kwargs):
        rebuilt.append(kwargs)
        raise AssertionError("should not rebuild when the file exists")

    monkeypatch.setattr(dp, "_survey_results_dataframe", fake_rebuild)
    dataset = _dataset(stored_filename="present.csv")
    monkeypatch.setattr(dp, "dataset_file_path", lambda name: tmp_path / name)
    (tmp_path / "present.csv").write_text("a,b\n1,2\n", encoding="utf-8")

    run(dp.ensure_dataset_file(dataset))

    assert rebuilt == []


def test_an_uploaded_dataset_cannot_be_rebuilt(tmp_path, monkeypatch):
    """Nothing on the server can bring a user's own file back, so this is
    reported as the user's to fix rather than retried."""
    monkeypatch.setattr(dp, "dataset_file_path", lambda name: tmp_path / name)
    dataset = _dataset(meta={"source": "upload", "sheet_name": None, "header_row": 0})

    with pytest.raises(dp.DatasetFileUnavailable):
        run(dp.ensure_dataset_file(dataset))


def test_a_survey_dataset_without_a_simulation_id_cannot_be_rebuilt(tmp_path, monkeypatch):
    monkeypatch.setattr(dp, "dataset_file_path", lambda name: tmp_path / name)
    dataset = _dataset(meta={"source": "survey_results", "sheet_name": None, "header_row": 0})

    with pytest.raises(dp.DatasetFileUnavailable):
        run(dp.ensure_dataset_file(dataset))


def test_unavailable_is_a_file_not_found(tmp_path, monkeypatch):
    """Callers that only catch FileNotFoundError keep working."""
    assert issubclass(dp.DatasetFileUnavailable, FileNotFoundError)


def test_the_router_has_something_to_tell_the_user():
    """The 422 the user saw said only "Failed to compute frequency"."""
    from app.routers import data_playground as router

    assert "no longer available" in router.DATASET_FILE_GONE
    assert "upload" in router.DATASET_FILE_GONE.lower()


# ── Against a real database ─────────────────────────────────────────────────

@pytest.fixture
def db_engine(monkeypatch):
    """Scratch database with the schema, wired into the services under test."""
    name = f"dptest_{uuid.uuid4().hex[:12]}"
    admin = psycopg2.connect(ADMIN_URL)
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute(f'CREATE DATABASE "{name}"')
    admin.close()

    base, _, _ = ADMIN_URL.rpartition("/")
    url = f"{base}/{name}".replace("postgresql://", "postgresql+asyncpg://")

    from app.models import register_all_models

    register_all_models()
    engine = create_async_engine(url, poolclass=NullPool)

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
            await conn.exec_driver_sql(
                "INSERT INTO surveysimulation (id, workspace_id, exploration_id, persona_id, "
                "persona_sample_sizes, total_sample_size, results, created_by, is_download, created_at) "
                f"VALUES ('{SIMULATION}', '{WORKSPACE}', '{EXPLORATION}', '[\"p1\"]', "
                f"'{{\"p1\": {SAMPLE_SIZE}}}', {SAMPLE_SIZE}, '{SURVEY_RESULTS}', 'u1', false, NOW())"
            )

    run(setup())

    from app.services import persona as persona_svc
    from app.services import survey_simulation as survey_svc

    for module in (dp, survey_svc, persona_svc):
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


async def _import(engine) -> tuple[str, str, list[str]]:
    async with AsyncSession(engine) as db:
        dataset, _ = await dp.ingest_dataset_from_survey_results(
            db, simulation_id=SIMULATION, workspace_id=WORKSPACE,
            exploration_id=EXPLORATION, user_id="u1",
        )
        names = [v.variable_name for v in await dp.list_variables(db, dataset_id=dataset.id)]
        return dataset.id, dataset.stored_filename, names


@requires_postgres
def test_an_analysis_survives_the_file_being_absent(db_engine):
    """The reported bug end to end: replica B has the row and not the file."""
    from app.services import data_playground_analysis as dpa

    dataset_id, stored, names = run(_import(db_engine))
    question = names[-1]
    path = dataset_file_path(stored)
    original = path.read_bytes()

    path.unlink()
    dp._cached_dataframe.cache_clear()
    assert not path.exists()

    async def compute():
        async with AsyncSession(db_engine) as db:
            dataset = await dp.get_dataset(
                db, dataset_id=dataset_id, workspace_id=WORKSPACE, exploration_id=EXPLORATION
            )
            return await dpa.compute_frequency(db, dataset, [question], "u1")

    result = run(compute())
    counts = {row["label"]: row["frequency"] for row in result["results"][0]["rows"]}

    assert counts == {"Tech": 6, "Retail": 4}
    assert path.exists()
    assert path.read_bytes() == original, "rebuild must reproduce the original file"


@requires_postgres
def test_the_rebuilt_file_reconciles_with_the_simulation(db_engine):
    """A rebuild that produced a different random sample would still look
    healthy while disagreeing with every other view of the same survey."""
    from app.services import data_playground_analysis as dpa

    dataset_id, stored, names = run(_import(db_engine))
    dataset_file_path(stored).unlink()
    dp._cached_dataframe.cache_clear()

    async def compute():
        async with AsyncSession(db_engine) as db:
            dataset = await dp.get_dataset(
                db, dataset_id=dataset_id, workspace_id=WORKSPACE, exploration_id=EXPLORATION
            )
            return await dpa.compute_frequency(db, dataset, [names[-1]], "u1")

    rows = run(compute())["results"][0]["rows"]

    assert sum(row["frequency"] for row in rows) == SAMPLE_SIZE


@requires_postgres
def test_a_crosstab_survives_it_too(db_engine):
    """Both tabs in the report went through the same reader."""
    from app.services import data_playground_analysis as dpa

    dataset_id, stored, names = run(_import(db_engine))
    dataset_file_path(stored).unlink()
    dp._cached_dataframe.cache_clear()

    async def compute():
        async with AsyncSession(db_engine) as db:
            dataset = await dp.get_dataset(
                db, dataset_id=dataset_id, workspace_id=WORKSPACE, exploration_id=EXPLORATION
            )
            return await dpa.compute_crosstab(db, dataset, ["Persona_Type"], [names[-1]], "u1")

    tables = run(compute())["tables"]

    assert tables and tables[0]["base"]["total"] == SAMPLE_SIZE


@requires_postgres
def test_the_dataset_records_the_survey_run_not_the_id_it_was_asked_with(db_engine):
    """Callers may pass the population simulation id. Everything downstream —
    including the rebuild — is keyed on the survey run that resolved to, so
    recording the argument instead would leave the dataset unrebuildable."""
    async def setup_and_import():
        async with AsyncSession(db_engine) as db:
            await db.execute(
                __import__("sqlalchemy").text(
                    "UPDATE surveysimulation SET simulation_source_id = 'pop_sim_1' "
                    f"WHERE id = '{SIMULATION}'"
                )
            )
            await db.commit()
        async with AsyncSession(db_engine) as db:
            dataset, _ = await dp.ingest_dataset_from_survey_results(
                db, simulation_id="pop_sim_1", workspace_id=WORKSPACE,
                exploration_id=EXPLORATION, user_id="u1",
            )
            return dict(dataset.meta or {}), dataset.name

    meta, name = run(setup_and_import())

    assert meta["simulation_id"] == SIMULATION
    assert SIMULATION in name


@requires_postgres
def test_an_uploaded_dataset_with_no_file_says_so(db_engine):
    """No source to rebuild from — the user is told, not retried at."""
    async def attempt():
        async with AsyncSession(db_engine) as db:
            dataset = _dataset(
                id="uploaded_1",
                stored_filename="never_written.csv",
                meta={"source": "upload", "sheet_name": None, "header_row": 0},
            )
            db.add(dataset)
            await db.commit()
            fresh = await dp.get_dataset(
                db, dataset_id="uploaded_1", workspace_id=WORKSPACE, exploration_id=EXPLORATION
            )
            return await dp.load_dataframe(fresh)

    with pytest.raises(dp.DatasetFileUnavailable):
        run(attempt())
