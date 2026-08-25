"""Scores five judgment dimensions for a persona/question pair and produces an
observation with noise; noise grows as certainty and category familiarity
fall, so unfamiliar questions move the persona less.
"""
from __future__ import annotations

from app.neuro import parameters
from app.neuro.types import CoreAffect, PersonaAffectParams, QuestionAffectFeatures


def _clamp(x: float) -> float:
    return max(-1.0, min(1.0, x))


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _familiarity(persona: PersonaAffectParams, question: QuestionAffectFeatures) -> float:
    if not question.categories or not persona.category_familiarity:
        return 1.0
    values = [
        persona.category_familiarity.get(c, 0.5) for c in question.categories
    ]
    return _clamp01(sum(values) / len(values))


def score(
    persona: PersonaAffectParams, question: QuestionAffectFeatures
) -> dict[str, float]:
    """The five appraisal scores for this persona and question."""
    familiarity = _familiarity(persona, question)
    certainty = _clamp01(0.5 * persona.granularity + 0.5 * familiarity)
    return {
        "goal_relevance": _clamp01(question.affect_relevance),
        # High-stakes questions run against comfort; a positive resting
        # disposition offsets some of that.
        "goal_congruence": _clamp01(
            0.5 + 0.5 * persona.baseline.valence - 0.4 * question.stakes
        ),
        "certainty": certainty,
        "coping_potential": _clamp01(
            1.0 - question.stakes * (1.0 - persona.granularity)
        ),
        "norm_compatibility": parameters.FRAMING_NORM_COMPATIBILITY.get(
            question.framing.value, 0.5
        ),
    }


def observe(
    persona: PersonaAffectParams, question: QuestionAffectFeatures
) -> tuple[CoreAffect, float, dict[str, float]]:
    """(observation, noise R, scores). Deterministic."""
    scores = score(persona, question)

    v, a, d = persona.baseline.valence, persona.baseline.arousal, persona.baseline.direction
    for name in parameters.APPRAISAL_ORDER:
        weight, direction = parameters.APPRAISAL_DIRECTIONS[name]
        delta = (scores[name] - 0.5) * weight
        v += delta * direction.valence
        a += delta * direction.arousal
        d += delta * direction.direction

    observation = CoreAffect(valence=_clamp(v), arousal=_clamp(a), direction=_clamp(d))

    familiarity = _familiarity(persona, question)
    noise = (
        parameters.R0
        * (1.0 + parameters.LAMBDA_CERTAINTY * (1.0 - scores["certainty"]))
        * (1.0 + parameters.LAMBDA_FAMILIARITY * (1.0 - familiarity))
    )
    return observation, noise, scores
