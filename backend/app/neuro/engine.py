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

    component = BeliefComponent(weight=1.0, mean=felt, spread=round(posterior_spread, 6))
    state = AffectiveState(
        components=(component,),
        summary=felt,
        bimodal=False,
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
