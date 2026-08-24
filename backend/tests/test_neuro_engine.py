"""Unit tests for the neuro computation path: parameters, persona parameter
derivation, question tagging, appraisal, engine and renderer. No database or
network needed.

Run: pytest tests/test_neuro_engine.py -v
"""
from __future__ import annotations

import pytest

from app.neuro import appraisal, engine, parameters, persona_params, renderer
from app.neuro.question_features import TAGGER_VERSION, tag_question
from app.neuro.types import (
    AffectiveState,
    BeliefComponent,
    CoreAffect,
    FEATURE_VECTOR_FIELDS,
    Framing,
    PersonaAffectParams,
    Provenance,
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


def _strip_time(state: AffectiveState) -> dict:
    data = state.to_state_json()
    data.pop("computed_at")
    return data


# ------------------------------------------------------------------ parameters

def test_coordinate_table_is_complete_and_bounded():
    assert len(parameters.EMOTION_COORDINATES) >= 28
    for name, (v, a, d, tier) in parameters.EMOTION_COORDINATES.items():
        assert -1.0 <= v <= 1.0 and -1.0 <= a <= 1.0 and -1.0 <= d <= 1.0, name
        assert tier in ("baseline", "contextual", "rare"), name


def test_emotion_lookup_handles_aliases_and_unknowns():
    direct = parameters.emotion_position("anxiety")
    aliased = parameters.emotion_position("  Worried ")
    assert direct is not None and aliased == direct
    assert parameters.emotion_position("flibbertigibbet") is None


def test_anger_and_fear_separate_on_direction():
    anger = parameters.emotion_position("anger")
    fear = parameters.emotion_position("fear")
    assert anger.valence < 0 and fear.valence < 0
    assert anger.arousal > 0 and fear.arousal > 0
    assert anger.direction > 0 > fear.direction


# ------------------------------------------------------------- persona params

def test_persona_params_from_fingerprint():
    persona = {
        "id": "per1",
        "persona_details": {
            "layer_3_emotional_fingerprint": {
                "baseline_emotions": ["Anxiety", "frustration", "hope", "unknownism"],
            },
            "emotional_memory": "moderate emotional memory",
            "evidence": {"e1": 1, "e2": 2, "e3": 3},
        },
    }
    params = persona_params.from_persona(persona)
    assert params.persona_id == "per1"
    assert params.baseline.valence < 0  # two negative labels vs one positive
    assert params.persistence == 0.5
    assert params.evidence_n == 3
    assert 0.0 < params.spread <= 0.6


def test_persona_params_falls_back_to_ocean():
    persona = {
        "id": "per2",
        "ocean_profile": {
            "openness": 0.5, "conscientiousness": 0.5, "extraversion": 0.9,
            "agreeableness": 0.9, "neuroticism": 0.1,
        },
        "persona_details": {},
    }
    params = persona_params.from_persona(persona)
    assert params.baseline.valence > 0
    assert params.baseline.arousal > 0


def test_persona_params_survives_junk_records():
    for junk in (None, {}, {"persona_details": "not a dict"},
                 {"persona_details": {"layer_3_emotional_fingerprint": 7}}):
        params = persona_params.from_persona(junk)
        assert isinstance(params, PersonaAffectParams)


def test_persona_params_is_deterministic():
    persona = {"id": "p", "persona_details": {
        "layer_3_emotional_fingerprint": {"baseline_emotions": ["joy", "stress"]}}}
    assert persona_params.from_persona(persona) == persona_params.from_persona(persona)


# ------------------------------------------------------------ question tagging

def test_tagger_framing_classes():
    assert tag_question("How do you feel about your monthly budget?").framing == Framing.DIRECT
    assert tag_question("Walk me through the last time you ordered in.").framing == Framing.BEHAVIORAL
    assert tag_question("Imagine you had double the income; what changes?").framing == Framing.PROJECTIVE
    assert tag_question("Some people say saving is impossible today. Thoughts?").framing == Framing.INDIRECT


def test_tagger_stakes_and_relevance_respond_to_content():
    high = tag_question("Do you feel guilty about the money you spend on debt?")
    low = tag_question("Which colour do you prefer for a water bottle?")
    assert high.stakes > low.stakes
    assert high.affect_relevance > low.affect_relevance


def test_tagger_is_deterministic_and_versioned():
    a = tag_question("How do you feel about ordering takeaway on a weeknight?")
    b = tag_question("How do you feel about ordering takeaway on a weeknight?")
    assert a == b
    assert isinstance(TAGGER_VERSION, str) and TAGGER_VERSION


# ----------------------------------------------------------------- appraisal

def test_appraisal_scores_in_range():
    scores = appraisal.score(_persona(), _question())
    assert set(scores) == set(parameters.APPRAISAL_ORDER)
    assert all(0.0 <= s <= 1.0 for s in scores.values())


def test_low_familiarity_inflates_noise():
    q = _question(categories=("finance",))
    familiar = _persona(category_familiarity={"finance": 1.0})
    unfamiliar = _persona(category_familiarity={"finance": 0.1})
    _, noise_f, _ = appraisal.observe(familiar, q)
    _, noise_u, _ = appraisal.observe(unfamiliar, q)
    assert noise_u > noise_f


# -------------------------------------------------------------------- engine

def test_engine_returns_valid_state_with_provenance():
    state = engine.compute_turn(
        persona=_persona(), question=_question(), previous=None, turn_index=0
    )
    assert 1 <= len(state.components) <= 2
    assert state.provenance.model_version == engine.ENGINE_VERSION
    assert state.provenance.artifact_version == parameters.ARTIFACT_VERSION
    assert state.provenance.renderer_version == renderer.RENDERER_VERSION
    assert state.rendered and state.rendered.startswith("EMOTIONAL STATE:")
    assert state.appraisal_scores is not None


def test_engine_is_reproducible():
    a = engine.compute_turn(persona=_persona(), question=_question(), previous=None, turn_index=3)
    b = engine.compute_turn(persona=_persona(), question=_question(), previous=None, turn_index=3)
    assert _strip_time(a) == _strip_time(b)


def test_same_persona_differs_across_framings():
    persona = _persona()
    direct = tag_question("Do you feel guilty about the money you spend eating out?")
    projective = tag_question("Imagine a friend orders takeaway nightly; how might they feel?")
    s1 = engine.compute_turn(persona=persona, question=direct, previous=None, turn_index=0)
    s2 = engine.compute_turn(persona=persona, question=projective, previous=None, turn_index=0)
    assert s1.summary != s2.summary


def test_different_personas_differ_on_same_question():
    question = tag_question("How do you feel about your monthly spending?")
    upbeat = _persona(baseline=CoreAffect(valence=0.6, arousal=0.2, direction=0.4))
    anxious = _persona(baseline=CoreAffect(valence=-0.5, arousal=0.5, direction=-0.4))
    s1 = engine.compute_turn(persona=upbeat, question=question, previous=None, turn_index=0)
    s2 = engine.compute_turn(persona=anxious, question=question, previous=None, turn_index=0)
    assert s1.summary != s2.summary


def test_unfamiliar_category_moves_persona_less():
    baseline = CoreAffect(valence=0.3, arousal=0.0, direction=0.2)
    q = _question(categories=("finance",), stakes=0.9, affect_relevance=0.9)
    familiar = _persona(baseline=baseline, category_familiarity={"finance": 1.0})
    unfamiliar = _persona(baseline=baseline, category_familiarity={"finance": 0.05})
    s_f = engine.compute_turn(persona=familiar, question=q, previous=None, turn_index=0)
    s_u = engine.compute_turn(persona=unfamiliar, question=q, previous=None, turn_index=0)

    def dist(s):
        return abs(s.summary.valence - baseline.valence) + \
               abs(s.summary.arousal - baseline.arousal) + \
               abs(s.summary.direction - baseline.direction)

    assert dist(s_u) < dist(s_f)


def test_feature_vector_fixed_order_and_length():
    state = engine.compute_turn(
        persona=_persona(), question=_question(), previous=None, turn_index=2
    )
    vector = state.to_feature_vector()
    assert len(vector) == len(FEATURE_VECTOR_FIELDS)
    assert vector[FEATURE_VECTOR_FIELDS.index("turn_index")] == 2.0
    assert all(isinstance(x, float) for x in vector)


def test_state_with_new_fields_round_trips():
    state = engine.compute_turn(
        persona=_persona(), question=_question(), previous=None, turn_index=1
    )
    restored = AffectiveState.from_state_json(state.to_state_json())
    assert restored == state
    assert restored.rendered == state.rendered


# ------------------------------------------------------------------- renderer

def test_renderer_is_deterministic_and_state_sensitive():
    persona = _persona()
    calm = engine.compute_turn(
        persona=_persona(baseline=CoreAffect(valence=0.7, arousal=-0.5, direction=0.3)),
        question=_question(), previous=None, turn_index=0,
    )
    tense = engine.compute_turn(
        persona=_persona(baseline=CoreAffect(valence=-0.7, arousal=0.7, direction=-0.6)),
        question=_question(), previous=None, turn_index=0,
    )
    assert renderer.render(calm, persona) == renderer.render(calm, persona)
    assert renderer.render(calm, persona) != renderer.render(tense, persona)


def test_renderer_names_both_sides_of_a_bimodal_state():
    prov = Provenance(
        model_version="t", artifact_version="t", renderer_version="t"
    )
    state = AffectiveState(
        components=(
            BeliefComponent(weight=0.5, mean=CoreAffect(valence=-0.5, arousal=0.4, direction=-0.4), spread=0.2),
            BeliefComponent(weight=0.5, mean=CoreAffect(valence=0.5, arousal=0.3, direction=0.5), spread=0.2),
        ),
        summary=CoreAffect.neutral(),
        bimodal=True,
        confidence=0.9,
        turn_index=0,
        provenance=prov,
    )
    text = renderer.render(state, _persona(granularity=0.8))
    assert "two things at once" in text
    assert "do not average" in text
