"""Affect computation. Prediction blends baseline with any carried state by
persona persistence; the appraisal observation moves it by a gain that
shrinks with observation noise. Deterministic for identical inputs and
versions.
"""
from __future__ import annotations

import hashlib

from app.neuro import appraisal, arbitration, confidence, parameters, renderer
from app.neuro.engine_version import ENGINE_VERSION
from app.neuro.types import (
    AffectiveState,
    BeliefComponent,
    CoreAffect,
    NEURO_SCHEMA_VERSION,
    PersonaAffectParams,
    Provenance,
    QuestionAffectFeatures,
)

__all__ = ["ENGINE_VERSION", "compute_turn", "question_text_hash"]

_PROVENANCE = Provenance(
    model_version=ENGINE_VERSION,
    artifact_version=parameters.ARTIFACT_VERSION,
    renderer_version=renderer.RENDERER_VERSION,
    feature_schema_version=NEURO_SCHEMA_VERSION,
    abstention_threshold=parameters.ABSTENTION_THRESHOLD,
)


def question_text_hash(text: str) -> str:
    """Stable identity for a question when only its text is available (the
    interview batch path carries question text, not question ids)."""
    return hashlib.sha256((text or "").strip().lower().encode("utf-8")).hexdigest()[:32]


def _clamp(x: float) -> float:
    return max(-1.0, min(1.0, x))


def _predict(
    persona: PersonaAffectParams, previous: AffectiveState | None
) -> tuple[CoreAffect, int | None]:
    """(prediction, carried_from_turn)."""
    baseline = persona.baseline
    if previous is None or persona.persistence <= 0.0:
        return baseline, None
    p = persona.persistence
    prev = previous.summary
    prediction = CoreAffect(
        valence=_clamp(baseline.valence + p * (prev.valence - baseline.valence)),
        arousal=_clamp(baseline.arousal + p * (prev.arousal - baseline.arousal)),
        direction=_clamp(baseline.direction + p * (prev.direction - baseline.direction)),
    )
    return prediction, previous.turn_index


def _conflict(persona, question, felt):
    """Strongest activated tension, or None. Category-scoped tensions need a
    category match; identity-level tensions (no categories) need stakes. The
    counter-position sits across neutral from the persona's lean, scaled by
    tension strength; a persona with no lean has no second position to hold.
    """
    best = None
    for t in persona.tensions:
        if t.strength < parameters.CONFLICT_STRENGTH_FLOOR:
            continue
        if t.categories:
            if not set(t.categories) & set(question.categories):
                continue
        elif question.stakes < parameters.CONFLICT_MIN_STAKES:
            continue
        if question.affect_relevance < parameters.CONFLICT_MIN_AFFECT_RELEVANCE:
            continue
        if best is None or t.strength > best.strength:
            best = t
    if best is None:
        return None
    lean_v = felt.valence if abs(felt.valence) >= 0.05 else persona.baseline.valence
    lean_d = felt.direction if abs(felt.direction) >= 0.05 else persona.baseline.direction
    if max(abs(lean_v), abs(lean_d)) < parameters.CONFLICT_MIN_LEAN:
        return None
    magnitude = parameters.CONFLICT_COUNTER_BASE + parameters.CONFLICT_COUNTER_SPAN * best.strength
    sign_v = 1.0 if lean_v >= 0 else -1.0
    sign_d = 1.0 if lean_d >= 0 else -1.0
    counter = CoreAffect(
        valence=_clamp(-sign_v * magnitude),
        arousal=_clamp(min(1.0, felt.arousal + parameters.CONFLICT_AROUSAL_BOOST * best.strength)),
        direction=_clamp(-sign_d * magnitude * 0.8),
    )
    separation = abs(counter.valence - felt.valence) + abs(counter.direction - felt.direction)
    if separation < parameters.CONFLICT_SEPARATION_MIN:
        return None
    w2 = min(
        0.5,
        parameters.CONFLICT_SECOND_WEIGHT_BASE
        + parameters.CONFLICT_SECOND_WEIGHT_SPAN * best.strength,
    )
    if w2 < parameters.MIN_COMPONENT_WEIGHT:
        return None
    return counter, w2


def compute_turn(
    *,
    persona: PersonaAffectParams,
    question: QuestionAffectFeatures,
    previous: AffectiveState | None,
    turn_index: int,
) -> AffectiveState:
    prediction, carried_from = _predict(persona, previous)
    observation, noise, scores = appraisal.observe(persona, question)

    prior_var = max(1e-6, persona.spread ** 2)
    gain = prior_var / (prior_var + noise)

    felt = CoreAffect(
        valence=_clamp(prediction.valence + gain * (observation.valence - prediction.valence)),
        arousal=_clamp(prediction.arousal + gain * (observation.arousal - prediction.arousal)),
        direction=_clamp(prediction.direction + gain * (observation.direction - prediction.direction)),
    )
    # Posterior spread shrinks with the same gain that moved the mean.
    posterior_spread = max(0.05, persona.spread * (1.0 - 0.5 * gain))

    expressed, gap = arbitration.arbitrate(persona, question, felt)
    conf, abstain, conf_terms = confidence.assess(felt, scores, persona.evidence_n)

    conflict = _conflict(persona, question, felt)
    if conflict is not None:
        counter, w2 = conflict
        components = (
            BeliefComponent(weight=round(1.0 - w2, 6), mean=felt, spread=round(posterior_spread, 6)),
            BeliefComponent(weight=round(w2, 6), mean=counter, spread=round(min(0.6, posterior_spread * 1.2), 6)),
        )
        summary = CoreAffect(
            valence=_clamp((1.0 - w2) * felt.valence + w2 * counter.valence),
            arousal=felt.arousal,
            direction=_clamp((1.0 - w2) * felt.direction + w2 * counter.direction),
        )
        bimodal = True
    else:
        components = (BeliefComponent(weight=1.0, mean=felt, spread=round(posterior_spread, 6)),)
        summary = felt
        bimodal = False
    state = AffectiveState(
        components=components,
        summary=summary,
        bimodal=bimodal,
        confidence=conf,
        abstain=abstain,
        turn_index=turn_index,
        provenance=_PROVENANCE,
        appraisal_scores={k: round(v, 6) for k, v in scores.items()},
        expressed=expressed,
        say_do_gap=gap,
        confidence_terms=conf_terms,
        carried_from_turn=carried_from,
    )
    return state.model_copy(update={"rendered": renderer.render(state, persona)})
