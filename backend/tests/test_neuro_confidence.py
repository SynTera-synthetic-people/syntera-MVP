"""Confidence, abstention and effective-count aggregation. No database needed.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from app.neuro import confidence, effective_n, engine, parameters
from app.neuro.types import (
    AffectiveState,
    BeliefComponent,
    CoreAffect,
    FEATURE_VECTOR_FIELDS,
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


def _turn(persona, question=None, turn_index=0) -> AffectiveState:
    return engine.compute_turn(
        persona=persona,
        question=question or _question(),
        previous=None,
        turn_index=turn_index,
    )


# ----------------------------------------------------------------- confidence

def test_confidence_terms_are_bounded_and_multiplied():
    conf, abstain, terms = confidence.assess(
        CoreAffect.neutral(), {"certainty": 0.8}, evidence_n=4
    )
    assert set(terms) == {"plausibility", "certainty", "evidence"}
    assert all(0.0 < t <= 1.0 for t in terms.values())
    product = terms["plausibility"] * terms["certainty"] * terms["evidence"]
    assert abs(conf - product) < 1e-6


def test_any_single_weak_term_withholds():
    strong = {"certainty": 0.9}
    plausible = CoreAffect.neutral()
    implausible = CoreAffect(valence=0.0, arousal=0.95, direction=0.0)

    conf, abstain, _ = confidence.assess(plausible, strong, evidence_n=5)
    assert not abstain and conf >= parameters.ABSTENTION_THRESHOLD

    _, abstain_plaus, _ = confidence.assess(implausible, strong, evidence_n=5)
    assert abstain_plaus

    _, abstain_cert, _ = confidence.assess(plausible, {"certainty": 0.1}, evidence_n=5)
    assert abstain_cert

    _, abstain_ev, _ = confidence.assess(plausible, strong, evidence_n=0)
    assert abstain_ev


def test_plausibility_penalises_unsupported_arousal():
    grounded = CoreAffect(valence=-0.6, arousal=0.7, direction=-0.5)
    empty = CoreAffect(valence=0.0, arousal=0.7, direction=0.0)
    assert confidence.plausibility(grounded) > confidence.plausibility(empty)


def test_evidence_semantics_unknown_vs_empty_vs_rich():
    unknown = confidence.evidence_term(None)
    empty = confidence.evidence_term(0)
    rich = confidence.evidence_term(5)
    assert empty < unknown < rich
    assert rich == 1.0


def test_ambivalence_does_not_reduce_confidence():
    felt = CoreAffect(valence=0.2, arousal=0.1, direction=0.2)
    scores = {"certainty": 0.7}
    conf_a, abstain_a, _ = confidence.assess(felt, scores, evidence_n=3)
    conf_b, abstain_b, _ = confidence.assess(felt, scores, evidence_n=3)
    prov = Provenance(model_version="t", artifact_version="t", renderer_version="t")
    comp = BeliefComponent(weight=0.5, mean=felt, spread=0.2)
    unimodal = AffectiveState(
        components=(BeliefComponent(weight=1.0, mean=felt, spread=0.2),),
        summary=felt, confidence=conf_a, abstain=abstain_a,
        turn_index=0, provenance=prov,
    )
    bimodal = AffectiveState(
        components=(comp, comp), summary=felt, bimodal=True,
        confidence=conf_b, abstain=abstain_b, turn_index=0, provenance=prov,
    )
    assert unimodal.confidence == bimodal.confidence
    assert unimodal.abstain == bimodal.abstain


# --------------------------------------------------------------------- engine

def test_engine_records_confidence_terms_and_threshold():
    state = _turn(_persona(evidence_n=4))
    assert state.confidence_terms is not None
    assert state.provenance.abstention_threshold == parameters.ABSTENTION_THRESHOLD
    assert 0.0 <= state.confidence <= 1.0


def test_persona_with_explicitly_empty_evidence_abstains():
    state = _turn(_persona(evidence_n=0))
    assert state.abstain is True
    assert state.rendered is not None and "declines" in state.rendered


def test_well_evidenced_persona_answers():
    state = _turn(_persona(evidence_n=5, granularity=0.8))
    assert state.abstain is False


def test_unknown_evidence_defaults_to_answering():
    state = _turn(_persona())
    assert state.abstain is False


def test_feature_vector_carries_every_confidence_term():
    # Each exported confidence_* feature must carry the value of the matching
    # term, not a default: a name mismatch between the exporter and
    # confidence.assess() silently exports a constant.
    state = _turn(_persona(evidence_n=4))
    vector = state.to_feature_vector()
    assert len(vector) == len(FEATURE_VECTOR_FIELDS)
    for term, value in state.confidence_terms.items():
        idx = FEATURE_VECTOR_FIELDS.index(f"confidence_{term}")
        assert vector[idx] == value, f"confidence_{term} not exported"


def test_exported_confidence_fields_match_assess_keys():
    _, _, terms = confidence.assess(
        CoreAffect.neutral(), {"certainty": 0.5}, evidence_n=1
    )
    exported = {f[len("confidence_"):] for f in FEATURE_VECTOR_FIELDS
                if f.startswith("confidence_")}
    assert exported == set(terms)


def test_abstention_threshold_is_defined_once():
    # A second assignment silently shadows the first and changes every
    # abstention decision.
    import inspect

    source = inspect.getsource(parameters)
    assert source.count("\nABSTENTION_THRESHOLD = ") == 1


def test_abstaining_state_round_trips():
    state = _turn(_persona(evidence_n=0), turn_index=2)
    restored = AffectiveState.from_state_json(state.to_state_json())
    assert restored == state
    assert restored.abstain is True


# ---------------------------------------------------------------- effective-N

def _event(persona, q_hash, abstain, error=None, at=0):
    return {
        "persona_id": persona,
        "question_text_hash": q_hash,
        "error": error,
        "created_at": datetime(2026, 1, 1) + timedelta(minutes=at),
        "state_json": {"abstain": abstain},
    }


def test_effective_n_counts_answered_and_abstained_per_question():
    events = [
        _event("p1", "q1", abstain=False),
        _event("p2", "q1", abstain=True),
        _event("p3", "q1", abstain=False),
        _event("p1", "q2", abstain=False),
    ]
    result = effective_n.aggregate(events)
    assert result["questions"]["q1"] == {"total": 3, "answered": 2, "abstained": 1}
    assert result["questions"]["q2"] == {"total": 1, "answered": 1, "abstained": 0}
    assert result["totals"] == {
        "questions": 2, "responses": 4, "answered": 3, "abstained": 1,
    }


def test_effective_n_uses_latest_event_per_persona():
    events = [
        _event("p1", "q1", abstain=True, at=0),
        _event("p1", "q1", abstain=False, at=5),
    ]
    result = effective_n.aggregate(events)
    assert result["questions"]["q1"] == {"total": 1, "answered": 1, "abstained": 0}


def test_effective_n_ignores_failures_and_hashless_events():
    events = [
        _event("p1", "q1", abstain=False),
        _event("p2", "q1", abstain=False, error="boom"),
        _event("p3", None, abstain=False),
    ]
    result = effective_n.aggregate(events)
    assert result["questions"]["q1"]["total"] == 1
    assert result["totals"]["responses"] == 1


def test_effective_n_accepts_model_like_rows():
    class Row:
        def __init__(self, **kw):
            self.__dict__.update(kw)

    rows = [Row(**_event("p1", "q1", abstain=True))]
    result = effective_n.aggregate(rows)
    assert result["questions"]["q1"]["abstained"] == 1
