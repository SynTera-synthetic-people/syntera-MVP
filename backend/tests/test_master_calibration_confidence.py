"""Master Calibration Confidence: the grid and the preview show one number.

Regression suite for a bug where an Omi persona showed 88% on the grid and
dropped to 59% the moment its preview was opened, with nothing about the
persona having changed. Two faults combined:

  1. RO Alignment was scored against an empty research objective. Only Digital
     Brain personas carry persona_details["research_objective"]; Omi personas
     never have, so the scoring prompt asked "what % of these patterns address
     the research objective's key questions" with no objective in it. The
     answer came back 0.
  2. The score was averaged over a different set of layers before and after
     the first preview — two layers when the KE background task wrote it,
     three once the preview generated the missing one — so the displayed
     number changed on first open even when every layer was healthy.

Tests here are synchronous and drive the one async helper through
asyncio.run(), so the suite needs no pytest-asyncio (see requirements-dev.txt).
"""

from __future__ import annotations

import asyncio
import types

from app.services import persona as persona_service
from app.services.persona import (
    _research_objective_text_for_alignment,
    compute_master_calibration_confidence,
)


def persona_info(ke_overall=None, **extra) -> dict:
    info: dict = {"calibration_breakdown": {}}
    if ke_overall is not None:
        info["ke_confidence"] = {"overall": ke_overall}
    info.update(extra)
    return info


def score(multi_platform: float, ro_alignment) -> int | None:
    """The master score for a persona whose multi-platform layer is
    `multi_platform` (0-1 weighted) and whose RO Alignment layer is
    `ro_alignment` (a number, or None for "not generated yet")."""
    patterns = None if ro_alignment is None else {"metric": "RO Alignment", "score": ro_alignment}
    return compute_master_calibration_confidence(
        persona_info(), {"weighted_score": multi_platform}, patterns
    )


def resolve_objective(info: dict) -> str:
    return asyncio.run(_research_objective_text_for_alignment(info))


def stub_stored_objective(monkeypatch, description):
    """Stand in for the ResearchObjectives lookup, so the fallback path is
    exercised without a database."""
    row = None if description is None else types.SimpleNamespace(description=description)

    class _Result:
        def scalars(self):
            return types.SimpleNamespace(first=lambda: row)

    class _Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def execute(self, *_args, **_kwargs):
            return _Result()

    monkeypatch.setattr(persona_service, "AsyncSession", lambda *_a, **_k: _Session())


# ── The reported drop ────────────────────────────────────────────────────────

def test_the_reported_grid_to_preview_drop_is_caused_by_a_zero_alignment_layer():
    """The exact numbers from the report: 88% on the grid, 59% after preview.
    Reproduced here so the cause is pinned to the alignment layer being 0 and
    not to anything about the persona."""
    assert score(0.86, None) == 88     # KE task writes a two-layer average
    assert score(0.86, 0) == 59        # preview adds RO Alignment = 0


def test_the_other_reported_pair_drops_the_same_way():
    """The 43% card, from the same screenshot — a lower multi-platform layer,
    identical mechanism."""
    assert score(0.40, None) == 65
    assert score(0.40, 0) == 43


def test_a_real_alignment_score_removes_the_drop():
    """With the objective actually present in the scoring prompt, the third
    layer lands in the same range as the other two and the number barely moves
    when the preview opens."""
    assert score(0.86, None) == 88
    for realistic_alignment in (80, 85, 90):
        assert abs(score(0.86, realistic_alignment) - 88) <= 5


# ── Fault 1: the objective must reach the scoring prompt ─────────────────────

def test_digital_brain_persona_uses_its_structured_objective():
    text = resolve_objective(persona_info(research_objective={
        "business_objective": "Understand premium adoption",
        "key_questions": "Why do buyers switch?",
        "hypotheses": "Quality drives switching",
    }))

    assert "Understand premium adoption" in text
    assert "Why do buyers switch?" in text


def test_omi_persona_falls_back_to_the_explorations_objective(monkeypatch):
    """An Omi persona's details carry no research_objective at all — this is
    the case that scored 0. It must resolve from the exploration instead."""
    objective = "Understand RTD coffee adoption among urban Indonesian millennials."
    stub_stored_objective(monkeypatch, objective)

    # No research_objective key, exactly as Omi persists it.
    assert resolve_objective(persona_info(exploration_id="exp-1")) == objective


def test_a_stored_objective_is_not_consulted_when_the_persona_carries_one(monkeypatch):
    """The persona's own structured RO stays authoritative — the fallback is a
    fallback, not an override."""
    stub_stored_objective(monkeypatch, "SHOULD NOT BE USED")

    text = resolve_objective(persona_info(
        exploration_id="exp-1",
        research_objective={"business_objective": "Understand premium adoption"},
    ))

    assert text == "Understand premium adoption"


def test_a_persona_with_neither_source_resolves_to_empty(monkeypatch):
    stub_stored_objective(monkeypatch, None)

    assert resolve_objective(persona_info(exploration_id="exp-1")) == ""
    assert resolve_objective(persona_info()) == ""


def test_a_lookup_failure_degrades_to_empty_rather_than_raising(monkeypatch):
    """Scoring is a read-time enhancement; a database problem must not take the
    preview down with it."""
    def boom(*_args, **_kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(persona_service, "AsyncSession", boom)

    assert resolve_objective(persona_info(exploration_id="exp-1")) == ""


# ── Fault 2: an unavailable layer is skipped, never counted as zero ──────────

def test_an_unavailable_alignment_layer_is_skipped_not_scored_zero():
    """score=None means "could not be computed". Averaging a 0 in its place is
    what turned an 88 into a 59."""
    assert score(0.86, None) == 88
    assert score(0.86, 0) == 59, "a genuine 0 still counts — only None is skipped"


def test_every_layer_is_averaged_when_all_three_are_present():
    assert compute_master_calibration_confidence(
        persona_info(ke_overall=75),
        {"weighted_score": 0.90},
        {"metric": "RO Alignment", "score": 60},
    ) == 75  # (60 + 75 + 90) / 3


def test_no_score_is_persisted_when_only_the_fallback_layer_exists():
    """KE alone is a constant fallback, not evidence — it must not produce a
    score on its own."""
    assert compute_master_calibration_confidence(persona_info(), {}, None) is None
