"""Apply the startup schema migrations to the database configured in .env,
without booting the API. Runs the same code path app startup runs, so a
database prepared here is exactly what the application expects.

Run:   python -m scripts.run_migrations
"""
from __future__ import annotations

import asyncio

from app.migrations.startup import run_startup_migrations

if __name__ == "__main__":
    asyncio.run(run_startup_migrations())
    print("startup migrations complete")
