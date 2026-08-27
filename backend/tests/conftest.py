"""Shared test setup.

Two independent concerns live here, both required:

1. A no-op boto3 stub. app.parameters calls load_ssm_parameters() at import
   time, which reaches AWS SSM and raises NoCredentialsError in any
   environment without AWS credentials. Tests must not depend on cloud
   access, so the stub is installed before any application module is
   imported — including the ones Alembic's env.py pulls in for the migration
   tests below. Installing it here (rather than changing app.parameters)
   keeps runtime behaviour untouched.

2. Fixtures for the migration tests. Those need a real PostgreSQL server.
   They create and drop scratch databases, so they never touch a database
   that holds data.

   Point them at a server with:

       MIGRATION_TEST_ADMIN_URL=postgresql://user:pw@localhost:5432/postgres

   If unset, the default matches backend/docker-compose.yml.
"""

from __future__ import annotations

import os
import sys
import types
import uuid

import psycopg2
import pytest


# ── 1. boto3 stub ───────────────────────────────────────────────────────────

def _install_boto3_stub() -> None:
    if "boto3" in sys.modules:
        return

    class _Paginator:
        def paginate(self, *args, **kwargs):
            return []

    class _Client:
        def get_paginator(self, *args, **kwargs):
            return _Paginator()

    stub = types.ModuleType("boto3")
    stub.client = lambda *args, **kwargs: _Client()
    sys.modules["boto3"] = stub


# Runs at conftest import, which pytest does before importing any test module,
# so no application import can beat it to app.parameters.
_install_boto3_stub()


# ── 2. Migration-test fixtures ──────────────────────────────────────────────

ADMIN_URL = os.environ.get(
    "MIGRATION_TEST_ADMIN_URL",
    "postgresql://synth_user:synth_pass@localhost:5432/postgres",
)

# Alembic's env.py imports app.config, which requires these to be present.
# Values are irrelevant — migrations never use them.
_REQUIRED_SETTINGS = {
    "JWT_SECRET": "test-only",
    "MAIL_USERNAME": "test",
    "MAIL_PASSWORD": "test",
    "MAIL_FROM": "test@example.com",
    "MAIL_SERVER": "localhost",
    "SUPERADMIN_NAME": "test",
    "SUPERADMIN_EMAIL": "test@example.com",
    "SUPERADMIN_PASSWORD": "test",
}


def _server_available() -> bool:
    try:
        psycopg2.connect(ADMIN_URL, connect_timeout=3).close()
        return True
    except Exception:
        return False


requires_postgres = pytest.mark.skipif(
    not _server_available(),
    reason=f"no PostgreSQL server reachable at {ADMIN_URL.split('@')[-1]}",
)


@pytest.fixture(autouse=True, scope="session")
def _settings_env():
    for key, value in _REQUIRED_SETTINGS.items():
        os.environ.setdefault(key, value)


@pytest.fixture
def scratch_db() -> str:
    """An empty database, dropped when the test finishes.

    Yields a psycopg2-style URL. Each test gets its own database so tests are
    order-independent and can run in parallel.
    """
    name = f"migtest_{uuid.uuid4().hex[:12]}"
    conn = psycopg2.connect(ADMIN_URL)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(f'CREATE DATABASE "{name}"')
    conn.close()

    base, _, _ = ADMIN_URL.rpartition("/")
    try:
        yield f"{base}/{name}"
    finally:
        conn = psycopg2.connect(ADMIN_URL)
        conn.autocommit = True
        with conn.cursor() as cur:
            # Terminate stragglers so DROP cannot block the suite.
            cur.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = %s AND pid <> pg_backend_pid()",
                (name,),
            )
            cur.execute(f'DROP DATABASE IF EXISTS "{name}"')
        conn.close()
