"""
One-off remediation for personas scored under the old, over-penalized
RO Alignment formula (generate_predominant_patterns() used to average the
LLM's score 50/50 with a naive keyword-overlap "sanity check" that trends low
by design, since patterns are deliberately rephrased jargon-free — see the fix
in app/services/persona.py). That formula is now fixed for new computations,
but personas that already have a cached predominant_patterns won't recompute
on their own, since the preview endpoint intentionally skips regeneration once
patterns are cached.

This script does NOT call any LLM itself (zero API cost). It only clears the
two stale fields — persona_details.predominant_patterns and
master_calibration_confidence — for personas whose master score was actually
built from a predominant_patterns score. The next time that persona's preview
is opened, generate_predominant_patterns() reruns with the fixed formula and
both fields are repersisted automatically (see preview_persona() in
app/routers/personas.py).

Run from backend/:  .venv/Scripts/python.exe refresh_predominant_patterns_scores.py
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

# Persona has foreign keys to explorations/workspace — SQLAlchemy needs those
# model modules imported too so it can resolve the FK targets during flush,
# which a standalone script (unlike the FastAPI app) doesn't do automatically.
register_all_models()

BATCH_SIZE = 200


async def refresh() -> None:
    cleared = 0
    total = 0

    async with AsyncSession(async_engine) as session:
        result = await session.execute(select(Persona))
        personas = result.scalars().all()
        total = len(personas)
        print(f"Scanning {total} personas for a cached predominant_patterns score.")

        for i, p in enumerate(personas, start=1):
            details = p.persona_details or {}
            patterns = details.get("predominant_patterns")
            if isinstance(patterns, dict) and isinstance(patterns.get("score"), (int, float)):
                new_details = dict(details)
                new_details.pop("predominant_patterns", None)
                p.persona_details = new_details
                p.master_calibration_confidence = None
                session.add(p)
                cleared += 1

            if i % BATCH_SIZE == 0:
                await session.commit()
                print(f"  ...scanned {i}/{total}")

        await session.commit()

    print(
        f"Done: {cleared} personas cleared out of {total} scanned. "
        "They'll recompute with the fixed formula next time their preview is opened."
    )


if __name__ == "__main__":
    asyncio.run(refresh())
