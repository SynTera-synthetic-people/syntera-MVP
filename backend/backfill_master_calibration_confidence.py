"""
One-off backfill for Persona.master_calibration_confidence.

Loops through every existing persona and runs the same
compute_master_calibration_confidence() the live save points now use
(preview, calibrate, KE enrichment, replicate), so old personas show a real
number immediately instead of blank/0 until someone happens to reopen their
preview page.

Only touches rows where master_calibration_confidence IS NULL — safe to
re-run, and never overwrites a value a live save point already computed.

Run from backend/:  .venv/Scripts/python.exe backfill_master_calibration_confidence.py
"""
import asyncio
import sys

sys.path.insert(0, ".")
sys.stdout.reconfigure(encoding="utf-8")

from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_engine
from app.models import register_all_models
from app.models.persona import Persona
from app.services.persona import (
    compute_master_calibration_confidence,
    _confidence_for_master_scoring,
    _full_persona_info_for_scoring,
)

# Persona has foreign keys to explorations/workspace — SQLAlchemy needs those
# model modules imported too so it can resolve the FK targets during flush,
# which a standalone script (unlike the FastAPI app) doesn't do automatically.
register_all_models()

BATCH_SIZE = 200


async def backfill() -> None:
    updated = 0
    skipped_no_data = 0
    total = 0

    async with AsyncSession(async_engine) as session:
        result = await session.execute(
            select(Persona).where(Persona.master_calibration_confidence.is_(None))
        )
        personas = result.scalars().all()
        total = len(personas)
        print(f"Found {total} personas with no master_calibration_confidence yet.")

        for i, p in enumerate(personas, start=1):
            full_persona_info = _full_persona_info_for_scoring(p)
            score = compute_master_calibration_confidence(
                full_persona_info,
                _confidence_for_master_scoring(full_persona_info),
                full_persona_info.get("predominant_patterns"),
            )
            if score is None:
                skipped_no_data += 1
            else:
                p.master_calibration_confidence = score
                session.add(p)
                updated += 1

            if i % BATCH_SIZE == 0:
                await session.commit()
                print(f"  ...committed {i}/{total}")

        await session.commit()

    print(
        f"Backfill complete: {updated} updated, "
        f"{skipped_no_data} skipped (not enough data yet), out of {total} total."
    )


if __name__ == "__main__":
    asyncio.run(backfill())
