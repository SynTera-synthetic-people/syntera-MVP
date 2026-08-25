"""Deterministic text rendering of a state: identical state, granularity and
renderer version give byte-identical output. Bimodal states name both
positions; abstained states read as an explicit decline.
"""
from __future__ import annotations

from app.neuro.types import AffectiveState, BeliefComponent, PersonaAffectParams

RENDERER_VERSION = "tpl-0.1.0"

_VALENCE_TERMS = (
    (-1.0, -0.55, "strongly negative"),
    (-0.55, -0.2, "somewhat negative"),
    (-0.2, 0.2, "neutral"),
    (0.2, 0.55, "somewhat positive"),
    (0.55, 1.01, "strongly positive"),
)
_AROUSAL_TERMS = (
    (-1.0, -0.35, "calm and settled"),
    (-0.35, 0.35, "moderately activated"),
    (0.35, 1.01, "highly activated"),
)
_DIRECTION_TERMS = (
    (-1.0, -0.25, "pulling away from the topic"),
    (-0.25, 0.25, "neither drawn to nor avoiding the topic"),
    (0.25, 1.01, "drawn toward the topic"),
)


def _bucket(value: float, table) -> str:
    for lo, hi, term in table:
        if lo <= value < hi:
            return term
    return table[-1][2]


def _describe(component: BeliefComponent) -> str:
    mean = component.mean
    return (
        f"{_bucket(mean.valence, _VALENCE_TERMS)}, "
        f"{_bucket(mean.arousal, _AROUSAL_TERMS)}, "
        f"{_bucket(mean.direction, _DIRECTION_TERMS)}"
    )


def render(state: AffectiveState, persona: PersonaAffectParams) -> str:
    if state.abstain:
        return (
            "EMOTIONAL STATE: The persona does not have enough grounding to "
            "answer this question and declines rather than guessing."
        )

    if state.bimodal and len(state.components) == 2:
        first, second = state.components
        naming = (
            "and can name both feelings clearly"
            if persona.granularity >= 0.5
            else "though the two feelings blur together for them"
        )
        return (
            "EMOTIONAL STATE: The persona feels two things at once about this "
            f"question — one side is {_describe(first)}; the other side is "
            f"{_describe(second)} — {naming}. Answer holding both positions; "
            "do not average them into a single mild opinion."
        )

    primary = state.components[0]
    precision = (
        "They can articulate this feeling precisely."
        if persona.granularity >= 0.65
        else "They express this feeling in broad, simple terms."
        if persona.granularity < 0.35
        else ""
    )
    text = (
        f"EMOTIONAL STATE: Right now the persona feels {_describe(primary)}."
    )
    if precision:
        text = f"{text} {precision}"
    return text
