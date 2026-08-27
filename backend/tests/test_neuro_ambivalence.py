"""Goal-conflict ambivalence: tension derivation, bimodal state assembly,
confidence neutrality and rendering. No database needed.
"""
from app.neuro import engine, persona_params, renderer
from app.neuro.confidence import assess
from app.neuro.types import (
    CoreAffect,
    PersonaAffectParams,
    QuestionAffectFeatures,
    ValueTension,
)


def _persona(tensions=(), **kw):
    kw.setdefault("baseline", CoreAffect(valence=0.5, arousal=0.4, direction=0.4))
    kw.setdefault("spread", 0.3)
    kw.setdefault("evidence_n", 4)
    return PersonaAffectParams(persona_id="amb", tensions=tensions, **kw)


def _question(**kw):
    kw.setdefault("framing", "direct")
    kw.setdefault("stakes", 0.8)
    kw.setdefault("affect_relevance", 0.8)
    return QuestionAffectFeatures(text_hash="amb-q", **kw)


TENSION = ValueTension(label="aspiration-fear", strength=0.8)


def _turn(persona, question=None, previous=None, turn_index=0):
    return engine.compute_turn(
        persona=persona, question=question or _question(),
        previous=previous, turn_index=turn_index,
    )


def test_no_tensions_means_unimodal():
    state = _turn(_persona())
    assert not state.bimodal and len(state.components) == 1


def test_activated_tension_splits_the_state():
    state = _turn(_persona(tensions=(TENSION,)))
    assert state.bimodal and len(state.components) == 2
    w = [c.weight for c in state.components]
    assert abs(sum(w) - 1.0) < 1e-6 and w[0] >= w[1] >= 0.2


def test_weak_tension_stays_unimodal():
    weak = ValueTension(label="mild", strength=0.2)
    assert not _turn(_persona(tensions=(weak,))).bimodal


def test_low_stakes_question_does_not_activate_identity_tension():
    q = _question(stakes=0.2)
    assert not _turn(_persona(tensions=(TENSION,)), q).bimodal


def test_category_tension_needs_a_category_match():
    scoped = ValueTension(label="health-indulgence", strength=0.8,
                          categories=("food",))
    hit = _question(categories=("food",))
    miss = _question(categories=("finance",))
    assert _turn(_persona(tensions=(scoped,)), hit).bimodal
    assert not _turn(_persona(tensions=(scoped,)), miss).bimodal


def test_leanless_persona_cannot_split():
    # A persona with no lean anywhere has no position for a second mind to
    # oppose.
    p = _persona(tensions=(TENSION,), baseline=CoreAffect.neutral())
    assert engine._conflict(p, _question(), CoreAffect.neutral()) is None


def test_bimodal_is_deterministic():
    a = _turn(_persona(tensions=(TENSION,)))
    b = _turn(_persona(tensions=(TENSION,)))
    assert a.model_dump(exclude={"computed_at"}) == b.model_dump(exclude={"computed_at"})


def test_summary_sits_between_the_components():
    state = _turn(_persona(tensions=(TENSION,)))
    v = sorted(c.mean.valence for c in state.components)
    assert v[0] - 1e-9 <= state.summary.valence <= v[1] + 1e-9


def test_ambivalence_does_not_change_confidence():
    with_t = _turn(_persona(tensions=(TENSION,)))
    without = _turn(_persona())
    assert with_t.bimodal and not without.bimodal
    assert with_t.confidence == without.confidence
    assert with_t.confidence_terms == without.confidence_terms


def test_renderer_names_both_sides():
    state = _turn(_persona(tensions=(TENSION,), granularity=0.8))
    text = renderer.render(state, _persona(granularity=0.8))
    assert "two things at once" in text


def test_tension_derivation_from_persona_record():
    record = {
        "id": "p1",
        "persona_details": {
            "layer_6_contradiction": {"says": "saves", "does": "splurges",
                                      "why": "status anxiety"},
            "layer_7_aspiration_fear": {"hoped_for_self": "fit",
                                        "feared_self": "unhealthy"},
            "value_tensions": [
                {"label": "health vs indulgence", "strength": 0.9,
                 "categories": ["Food"]},
            ],
        },
    }
    params = persona_params.from_persona(record)
    labels = [t.label for t in params.tensions]
    assert labels[0] == "health vs indulgence"
    assert params.tensions[0].categories == ("food",)
    assert len(params.tensions) == 3
