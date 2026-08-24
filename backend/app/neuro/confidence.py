"""Confidence and abstention.

Confidence multiplies three terms, each in (0, 1]: whether the felt state
sits in a humanly plausible region of the space, how certain the appraisal
was, and how much evidence stands behind the persona. Multiplication means
any single weak term is enough to withhold; an average would let two strong
terms mask one weak one. Below the abstention threshold the state is
flagged abstain — the call still succeeds and the state is still recorded.

Bimodality never enters this calculation: holding two positions is a
finding, not uncertainty, so a two-minded state and a one-minded state with
identical terms score identically.
"""
from __future__ import annotations

from typing import Optional

from app.neuro import parameters
from app.neuro.types import CoreAffect


def _clamp01(x: float, floor: float = 0.0) -> float:
    return max(floor, min(1.0, x))


def plausibility(felt: CoreAffect) -> float:
    """How occupied the felt region is. Arousal unsupported by any valence or
    behavioural direction (activated about nothing) is the empty region this
    penalises; it reads as fluent text downstream, which is what makes it
    worth catching here."""
    unsupported = max(
        0.0, abs(felt.arousal) - (abs(felt.valence) + abs(felt.direction))
    )
    return _clamp01(
        1.0 - parameters.PLAUSIBILITY_PENALTY * unsupported,
        floor=parameters.PLAUSIBILITY_FLOOR,
    )


def certainty_term(scores: dict[str, float]) -> float:
    return _clamp01(
        float(scores.get("certainty", 0.5)), floor=parameters.CERTAINTY_FLOOR
    )


def evidence_term(evidence_n: Optional[int]) -> float:
    if evidence_n is None:
        return parameters.EVIDENCE_UNKNOWN_TERM
    return _clamp01(
        parameters.EVIDENCE_BASE + parameters.EVIDENCE_PER_ITEM * evidence_n,
        floor=parameters.EVIDENCE_BASE,
    )


def assess(
    felt: CoreAffect,
    scores: dict[str, float],
    evidence_n: Optional[int],
) -> tuple[float, bool, dict[str, float]]:
    """(confidence, abstain, terms)."""
    terms = {
        "plausibility": round(plausibility(felt), 6),
        "certainty": round(certainty_term(scores), 6),
        "evidence": round(evidence_term(evidence_n), 6),
    }
    confidence = round(
        terms["plausibility"] * terms["certainty"] * terms["evidence"], 6
    )
    return confidence, confidence < parameters.ABSTENTION_THRESHOLD, terms
