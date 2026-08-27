"""Carry-over, arbitration and turn chaining. No database needed.
"""
from __future__ import annotations

import asyncio

import pytest

from app.neuro import arbitration, engine, parameters
from app.neuro.question_features import tag_question
from app.neuro.types import (
    AffectiveState,
    CoreAffect,
    FEATURE_VECTOR_FIELDS,
    Framing,
    PersonaAffectParams,
    QuestionAffectFeatures,
)


def _persona(**overrides) -> PersonaAffectParams:
    defaults = dict(persona_id="p1")
    defaults.update(overrides)
    return PersonaAffectParams(**defaults)


def _question(**overrides) -> QuestionAffectFeatures:
    defaults = dict(text_hash="h")
    defaults.update(overrides)
    return QuestionAffectFeatures(**defaults)


def _turn(persona, question, previous=None, turn_index=0) -> AffectiveState:
    return engine.compute_turn(
        persona=persona, question=question, previous=previous, turn_index=turn_index
    )


def _strip_time(state: AffectiveState) -> dict:
    data = state.to_state_json()
    data.pop("computed_at")
    return data


NEGATIVE_PREVIOUS_BASE = dict(
    baseline=CoreAffect(valence=0.3, arousal=0.0, direction=0.2),
)


def _negative_previous(persona) -> AffectiveState:
    upset = tag_question("Do you feel guilty about the money you spend on debt?")
    return _turn(persona, upset, turn_index=0)


# ------------------------------------------------------------------ carry-over

def test_zero_persistence_ignores_previous():
    persona = _persona(**NEGATIVE_PREVIOUS_BASE, persistence=0.0)
    previous = _negative_previous(persona)
    question = _question()
    fresh = _turn(persona, question, previous=None, turn_index=1)
    carried = _turn(persona, question, previous=previous, turn_index=1)
    assert _strip_time(fresh) == _strip_time(carried)
    assert carried.carried_from_turn is None


def test_carry_over_pulls_state_toward_previous():
    question = _question()
    sticky = _persona(**NEGATIVE_PREVIOUS_BASE, persistence=0.8)
    previous = _negative_previous(sticky)
    fresh = _turn(sticky, question, previous=None, turn_index=1)
    carried = _turn(sticky, question, previous=previous, turn_index=1)
    assert carried.carried_from_turn == 0
    # The previous turn was more negative than rest; a sticky persona stays
    # closer to it than a fresh start does.
    assert carried.summary.valence < fresh.summary.valence


def test_higher_persistence_carries_more():
    question = _question()
    light = _persona(**NEGATIVE_PREVIOUS_BASE, persistence=0.2)
    heavy = _persona(**NEGATIVE_PREVIOUS_BASE, persistence=0.9)
    prev_light = _negative_previous(light)
    prev_heavy = _negative_previous(heavy)
    assert _strip_time(prev_light) == _strip_time(prev_heavy)
    carried_light = _turn(light, question, previous=prev_light, turn_index=1)
    carried_heavy = _turn(heavy, question, previous=prev_heavy, turn_index=1)
    assert carried_heavy.summary.valence < carried_light.summary.valence


def test_state_contracts_toward_the_repeated_stimulus_fixed_point():
    # Under a repeated identical question the update is a contraction: each
    # turn lands closer to that question's fixed point. Recovery toward rest
    # is this same property, since rest is where a no-stimulus prediction
    # points.
    persona = _persona(**NEGATIVE_PREVIOUS_BASE, persistence=0.6)
    neutral = _question(stakes=0.2, affect_relevance=0.2)

    fixed = _turn(persona, neutral, previous=None, turn_index=0)
    for i in range(1, 30):
        fixed = _turn(persona, neutral, previous=fixed, turn_index=i)

    state = _negative_previous(persona)
    distances = []
    for i in range(1, 6):
        state = _turn(persona, neutral, previous=state, turn_index=i)
        distances.append(abs(state.summary.valence - fixed.summary.valence))
    assert all(b < a for a, b in zip(distances, distances[1:]))


def test_carry_over_is_deterministic():
    persona = _persona(**NEGATIVE_PREVIOUS_BASE, persistence=0.7)
    previous = _negative_previous(persona)
    a = _turn(persona, _question(), previous=previous, turn_index=1)
    b = _turn(persona, _question(), previous=previous, turn_index=1)
    assert _strip_time(a) == _strip_time(b)


def test_previous_state_without_new_fields_still_parses():
    persona = _persona(persistence=0.5)
    old_style = _turn(persona, _question(), turn_index=0).to_state_json()
    for key in ("expressed", "say_do_gap", "carried_from_turn",
                "appraisal_scores", "rendered"):
        old_style.pop(key, None)
    restored = AffectiveState.from_state_json(old_style)
    carried = _turn(persona, _question(), previous=restored, turn_index=1)
    assert carried.carried_from_turn == 0


# ----------------------------------------------------------------- arbitration

def test_presentation_weights_order_by_framing():
    w = parameters.PRESENTATION_WEIGHTS
    assert w["direct"] > w["behavioral"] > w["indirect"] > w["projective"]


def test_gap_widens_with_directness_and_stakes():
    persona = _persona(baseline=CoreAffect(valence=-0.5, arousal=0.4, direction=-0.4))
    felt = persona.baseline
    _, gap_direct_high = arbitration.arbitrate(
        persona, _question(framing=Framing.DIRECT, stakes=0.9), felt
    )
    _, gap_indirect_low = arbitration.arbitrate(
        persona, _question(framing=Framing.INDIRECT, stakes=0.2), felt
    )
    assert gap_direct_high > gap_indirect_low


def test_gap_is_zero_with_nothing_to_conceal():
    anchor = CoreAffect(valence=0.4, arousal=0.1, direction=0.3)
    persona = _persona(presentation_anchor=anchor)
    expressed, gap = arbitration.arbitrate(
        persona, _question(framing=Framing.DIRECT, stakes=0.9), anchor
    )
    assert gap == 0.0
    assert expressed == anchor


def test_expressed_sits_between_felt_and_anchor():
    persona = _persona(baseline=CoreAffect(valence=-0.6, arousal=0.5, direction=-0.5))
    question = _question(framing=Framing.DIRECT, stakes=0.8)
    felt = persona.baseline
    anchor = arbitration.presentation_anchor(persona)
    expressed, gap = arbitration.arbitrate(persona, question, felt)
    assert gap > 0
    assert min(felt.valence, anchor.valence) <= expressed.valence <= max(felt.valence, anchor.valence)
    assert min(felt.arousal, anchor.arousal) <= expressed.arousal <= max(felt.arousal, anchor.arousal)


def test_engine_states_carry_expression_fields():
    state = _turn(
        _persona(baseline=CoreAffect(valence=-0.4, arousal=0.3, direction=-0.3)),
        tag_question("Do you feel guilty about the money you spend on debt?"),
    )
    assert state.expressed is not None
    assert state.say_do_gap is not None and state.say_do_gap > 0
    vector = state.to_feature_vector()
    assert len(vector) == len(FEATURE_VECTOR_FIELDS)
    assert vector[FEATURE_VECTOR_FIELDS.index("say_do_gap")] == state.say_do_gap


# -------------------------------------------------------------- turn chaining

def test_interview_adapter_chains_previous_states(monkeypatch):
    from app.neuro import service as neuro_service

    seen_previous = []

    async def _enabled():
        return True

    async def _fake_transact(*, compute, **kwargs):
        state = compute(None)  # stored state is irrelevant to explicit chaining
        return state

    real_compute = neuro_service.engine.compute_turn

    def _spy_compute(*, persona, question, previous, turn_index):
        seen_previous.append(previous.turn_index if previous else None)
        return real_compute(
            persona=persona, question=question, previous=previous, turn_index=turn_index
        )

    monkeypatch.setattr(neuro_service, "is_enabled", _enabled)
    monkeypatch.setattr(neuro_service.state_store, "transact_turn", _fake_transact)
    monkeypatch.setattr(neuro_service.engine, "compute_turn", _spy_compute)

    persona = {
        "id": "chain",
        "persona_details": {
            "layer_3_emotional_fingerprint": {"baseline_emotions": ["anxiety", "hope"]},
            "emotional_memory": "high",
        },
    }
    recorded = asyncio.run(
        neuro_service.record_interview_shadow_turns(
            workspace_id="ws1",
            exploration_id="ex1",
            persona_id="per1",
            question_texts=["q one", "q two", "q three"],
            persona=persona,
        )
    )
    assert recorded == 3
    assert seen_previous == [None, 0, 1]


def test_rebuttal_adapter_skips_group_sessions(monkeypatch):
    from app.neuro import service as neuro_service

    async def _enabled():
        return True

    async def _must_not_run(**kwargs):
        raise AssertionError("group sessions must not record state")

    monkeypatch.setattr(neuro_service, "is_enabled", _enabled)
    monkeypatch.setattr(neuro_service.state_store, "transact_turn", _must_not_run)

    result = asyncio.run(
        neuro_service.record_rebuttal_shadow_turn(
            workspace_id="ws1",
            exploration_id="ex1",
            persona_id='["a", "b"]',
            question_text="challenge",
        )
    )
    assert result is None


def test_rebuttal_adapter_resolves_single_persona_forms():
    single = "per1"
    wrapped = '["per1"]'
    listed = ["per1"]
    from app.neuro.service import _single_persona_id

    assert _single_persona_id(single) == "per1"
    assert _single_persona_id(wrapped) == "per1"
    assert _single_persona_id(listed) == "per1"
    assert _single_persona_id('["a", "b"]') is None
    assert _single_persona_id(None) is None


def test_artifact_adapter_records_on_its_own_thread(monkeypatch):
    from app.neuro import service as neuro_service

    seen_keys = []

    async def _enabled():
        return True

    async def _fake_transact(*, conversation_key, compute, **kwargs):
        seen_keys.append(conversation_key)
        return compute(None)

    monkeypatch.setattr(neuro_service, "is_enabled", _enabled)
    monkeypatch.setattr(neuro_service.state_store, "transact_turn", _fake_transact)

    recorded = asyncio.run(
        neuro_service.record_artifact_shadow_turns(
            workspace_id="ws1", exploration_id="ex1", persona_id="per1",
            question_texts=["q1", "q2"], session_id="sess9",
        )
    )
    assert recorded == 2
    assert all(k == "conv1:ws1:ex1:per1:artifact:sess9" for k in seen_keys)


def test_live_reply_continues_from_stored_state(monkeypatch):
    from app.neuro import service as neuro_service

    stored = _turn(_persona(persistence=0.5), _question(), turn_index=4)

    async def _enabled():
        return True

    async def _fake_transact(*, compute, **kwargs):
        return compute(stored)

    monkeypatch.setattr(neuro_service, "is_enabled", _enabled)
    monkeypatch.setattr(neuro_service.state_store, "transact_turn", _fake_transact)

    state = asyncio.run(
        neuro_service.record_live_reply_shadow_turn(
            workspace_id="ws1", exploration_id="ex1", persona_id="per1",
            question_text="and why is that?",
        )
    )
    assert state is not None and state.turn_index == 5


def test_live_reply_requires_a_persona(monkeypatch):
    from app.neuro import service as neuro_service

    async def _enabled():
        return True

    async def _must_not_run(**kwargs):
        raise AssertionError("must not record without a persona")

    monkeypatch.setattr(neuro_service, "is_enabled", _enabled)
    monkeypatch.setattr(neuro_service.state_store, "transact_turn", _must_not_run)

    state = asyncio.run(
        neuro_service.record_live_reply_shadow_turn(
            workspace_id="ws1", exploration_id="ex1", persona_id=None,
            question_text="hello",
        )
    )
    assert state is None
