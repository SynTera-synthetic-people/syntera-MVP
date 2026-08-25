"""Expressed state vs felt state: expression is pulled toward a presentation
anchor by framing directness and stakes; the say-do gap is the distance
between the two, zero when there is nothing to conceal.
"""
from __future__ import annotations

from app.neuro import parameters
from app.neuro.types import CoreAffect, PersonaAffectParams, QuestionAffectFeatures


def _clamp(x: float) -> float:
    return max(-1.0, min(1.0, x))


def presentation_anchor(persona: PersonaAffectParams) -> CoreAffect:
    """Where the persona moves when it believes it is being observed. An
    explicit per-persona anchor wins; otherwise a mildly positive, composed,
    slightly approach-leaning position shaped by the persona's own baseline."""
    if persona.presentation_anchor is not None:
        return persona.presentation_anchor
    b = persona.baseline
    return CoreAffect(
        valence=_clamp(0.4 + 0.3 * b.valence),
        arousal=_clamp(0.5 * b.arousal),
        direction=_clamp(0.3 + 0.3 * b.direction),
    )


def presentation_weight(question: QuestionAffectFeatures) -> float:
    """How far expression shifts toward the anchor, in [0, 0.9]. Framing sets
    the base pull; stakes scale it."""
    base = parameters.PRESENTATION_WEIGHTS.get(question.framing.value, 0.4)
    return min(0.9, base * (0.4 + 0.6 * question.stakes))


def arbitrate(
    persona: PersonaAffectParams,
    question: QuestionAffectFeatures,
    felt: CoreAffect,
) -> tuple[CoreAffect, float]:
    """(expressed state, say-do gap). The gap is the mean absolute per-axis
    distance between felt and expressed."""
    anchor = presentation_anchor(persona)
    weight = presentation_weight(question)
    expressed = CoreAffect(
        valence=_clamp(felt.valence + weight * (anchor.valence - felt.valence)),
        arousal=_clamp(felt.arousal + weight * (anchor.arousal - felt.arousal)),
        direction=_clamp(felt.direction + weight * (anchor.direction - felt.direction)),
    )
    gap = (
        abs(expressed.valence - felt.valence)
        + abs(expressed.arousal - felt.arousal)
        + abs(expressed.direction - felt.direction)
    ) / 3.0
    return expressed, round(gap, 6)
