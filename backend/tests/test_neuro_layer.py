"""Unit tests for the neuroscience layer scaffolding: type invariants, the
conversation-key convention, engine reproducibility, and the fail-open
contract at the service boundary. No database or network needed;
database-backed behaviour is covered by scripts/neuro_shadow_smoke.py.

Run: pytest tests/test_neuro_layer.py -v
"""
from __future__ import annotations

import asyncio

import pytest

from app.neuro import engine
from app.neuro.conversation_key import (
    conversation_key,
    interview_conversation_key,
    rebuttal_conversation_key,
)
from app.neuro.types import (
    AffectiveState,
    BeliefComponent,
    CoreAffect,
    MAX_COMPONENTS,
    PersonaAffectParams,
    Provenance,
    QuestionAffectFeatures,
)


def _default_state(turn_index: int = 0) -> AffectiveState:
    return engine.compute_turn(
        persona=PersonaAffectParams(persona_id="p1"),
        question=QuestionAffectFeatures(text_hash="x"),
        previous=None,
        turn_index=turn_index,
    )


def test_types_are_frozen():
    state = _default_state()
    with pytest.raises(Exception):
        state.confidence = 0.1  # type: ignore[misc]
    with pytest.raises(Exception):
        state.summary.valence = 0.5  # type: ignore[misc]


def test_component_cap_is_two():
    assert MAX_COMPONENTS == 2
    comp = BeliefComponent(weight=0.34, mean=CoreAffect.neutral(), spread=0.1)
    prov = Provenance(
        model_version="t", artifact_version="t", renderer_version="t"
    )
    with pytest.raises(Exception):
        AffectiveState(
            components=(comp, comp, comp),
            summary=CoreAffect.neutral(),
            confidence=1.0,
            turn_index=0,
            provenance=prov,
        )
    with pytest.raises(Exception):
        AffectiveState(
            components=(),
            summary=CoreAffect.neutral(),
            confidence=1.0,
            turn_index=0,
            provenance=prov,
        )


def test_bimodal_requires_two_components():
    comp = BeliefComponent(weight=1.0, mean=CoreAffect.neutral(), spread=0.1)
    prov = Provenance(model_version="t", artifact_version="t", renderer_version="t")
    with pytest.raises(Exception):
        AffectiveState(
            components=(comp,),
            summary=CoreAffect.neutral(),
            bimodal=True,
            confidence=1.0,
            turn_index=0,
            provenance=prov,
        )


def test_bimodal_state_round_trips():
    prov = Provenance(model_version="t", artifact_version="t", renderer_version="t")
    two = AffectiveState(
        components=(
            BeliefComponent(
                weight=0.5,
                mean=CoreAffect(valence=-0.4, arousal=0.5, direction=-0.6),
                spread=0.2,
            ),
            BeliefComponent(
                weight=0.5,
                mean=CoreAffect(valence=0.5, arousal=0.4, direction=0.7),
                spread=0.2,
            ),
        ),
        summary=CoreAffect.neutral(),
        bimodal=True,
        confidence=0.9,
        turn_index=3,
        provenance=prov,
    )
    restored = AffectiveState.from_state_json(two.to_state_json())
    assert restored == two
    assert restored.bimodal and len(restored.components) == 2


def test_state_json_round_trip_is_exact():
    state = _default_state(turn_index=7)
    assert AffectiveState.from_state_json(state.to_state_json()) == state


def test_affect_coordinates_are_bounded():
    with pytest.raises(Exception):
        CoreAffect(valence=1.5, arousal=0.0, direction=0.0)
    with pytest.raises(Exception):
        PersonaAffectParams(persona_id="p", category_familiarity={"food": 1.4})


def test_interview_and_rebuttal_resolve_to_same_key():
    a = interview_conversation_key("ws1", "ex1", "per1")
    b = rebuttal_conversation_key("ws1", "ex1", "per1")
    assert a == b == "conv1:ws1:ex1:per1"


def test_conversation_keys_separate_conversations():
    base = conversation_key("ws1", "ex1", "per1")
    assert conversation_key("ws1", "ex1", "per2") != base
    assert conversation_key("ws1", "ex2", "per1") != base
    assert conversation_key("ws2", "ex1", "per1") != base
    assert conversation_key("ws1", "ex1", None) == "conv1:ws1:ex1:population"
    with pytest.raises(ValueError):
        conversation_key("", "ex1", "per1")


def test_engine_returns_valid_state():
    state = _default_state()
    assert 1 <= len(state.components) <= MAX_COMPONENTS
    assert state.bimodal is False
    assert state.abstain is False
    assert 0.0 <= state.confidence <= 1.0
    assert state.provenance.model_version == engine.ENGINE_VERSION


def test_engine_is_deterministic():
    # Identical inputs and version must give an identical state; only the
    # wall-clock timestamp may differ.
    a = _default_state(turn_index=2)
    b = _default_state(turn_index=2)
    da, db = a.to_state_json(), b.to_state_json()
    da.pop("computed_at"), db.pop("computed_at")
    assert da == db


def test_question_text_hash_is_stable_and_normalised():
    h1 = engine.question_text_hash("  How do you FEEL about this? ")
    h2 = engine.question_text_hash("how do you feel about this?")
    assert h1 == h2 and len(h1) == 32


def test_service_adapter_fails_open(monkeypatch):
    # An engine crash plus a broken failure recorder must still surface as a
    # zero count, never as an exception in the interview flow.
    from app.neuro import service as neuro_service

    async def _enabled():
        return True

    def _boom(**kwargs):
        raise RuntimeError("engine exploded")

    async def _record_failure_boom(**kwargs):
        raise RuntimeError("db down too")

    monkeypatch.setattr(neuro_service, "is_enabled", _enabled)
    monkeypatch.setattr(neuro_service.engine, "compute_turn", _boom)
    monkeypatch.setattr(
        neuro_service.state_store, "record_failure", _record_failure_boom
    )

    recorded = asyncio.run(
        neuro_service.record_interview_shadow_turns(
            workspace_id="ws1",
            exploration_id="ex1",
            persona_id="per1",
            question_texts=["q1", "q2"],
        )
    )
    assert recorded == 0


def test_service_skips_entirely_when_flag_off(monkeypatch):
    from app.neuro import service as neuro_service

    async def _disabled():
        return False

    def _must_not_run(**kwargs):
        raise AssertionError("engine must not be called when the flag is off")

    monkeypatch.setattr(neuro_service, "is_enabled", _disabled)
    monkeypatch.setattr(neuro_service.engine, "compute_turn", _must_not_run)

    recorded = asyncio.run(
        neuro_service.record_interview_shadow_turns(
            workspace_id="ws1",
            exploration_id="ex1",
            persona_id="per1",
            question_texts=["q1"],
        )
    )
    assert recorded == 0
