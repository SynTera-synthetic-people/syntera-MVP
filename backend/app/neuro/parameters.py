"""Versioned numeric parameters. Values change only via a new ARTIFACT_VERSION
so identical inputs plus versions reproduce identical states. Coordinates
are (valence, arousal, direction), direction approach-positive.
"""
from __future__ import annotations

from app.neuro.types import CoreAffect

ARTIFACT_VERSION = "prior-0.1.0"

# name -> (valence, arousal, direction, tier)
EMOTION_COORDINATES: dict[str, tuple[float, float, float, str]] = {
    "joy":            (0.80,  0.50,  0.60, "baseline"),
    "contentment":    (0.70, -0.30,  0.30, "baseline"),
    "serenity":       (0.60, -0.50,  0.20, "baseline"),
    "excitement":     (0.70,  0.80,  0.70, "contextual"),
    "enthusiasm":     (0.70,  0.70,  0.70, "baseline"),
    "pride":          (0.60,  0.40,  0.50, "contextual"),
    "love":           (0.80,  0.40,  0.70, "contextual"),
    "trust":          (0.60,  0.10,  0.50, "baseline"),
    "interest":       (0.50,  0.40,  0.60, "baseline"),
    "anticipation":   (0.40,  0.50,  0.50, "baseline"),
    "surprise":       (0.20,  0.70,  0.10, "rare"),
    "hope":           (0.60,  0.30,  0.50, "baseline"),
    "relief":         (0.50, -0.20,  0.20, "contextual"),
    "amusement":      (0.70,  0.50,  0.50, "contextual"),
    "gratitude":      (0.70,  0.20,  0.40, "contextual"),
    "anger":          (-0.60, 0.70,  0.50, "contextual"),
    "frustration":    (-0.50, 0.60,  0.40, "baseline"),
    "annoyance":      (-0.40, 0.40,  0.30, "baseline"),
    "contempt":       (-0.50, 0.30,  0.20, "rare"),
    "disgust":        (-0.70, 0.40, -0.40, "rare"),
    "fear":           (-0.70, 0.70, -0.70, "contextual"),
    "anxiety":        (-0.50, 0.60, -0.50, "baseline"),
    "nervousness":    (-0.40, 0.50, -0.40, "contextual"),
    "stress":         (-0.50, 0.70, -0.30, "baseline"),
    "sadness":        (-0.70, -0.40, -0.40, "contextual"),
    "disappointment": (-0.50, -0.30, -0.30, "contextual"),
    "guilt":          (-0.50, 0.30, -0.30, "contextual"),
    "shame":          (-0.60, 0.40, -0.60, "rare"),
    "boredom":        (-0.30, -0.60, -0.30, "contextual"),
    "loneliness":     (-0.60, -0.20, -0.20, "contextual"),
}

# Common variants folded onto canonical names before lookup.
EMOTION_ALIASES: dict[str, str] = {
    "calm": "serenity",
    "calmness": "serenity",
    "peace": "serenity",
    "peaceful": "serenity",
    "happy": "joy",
    "happiness": "joy",
    "content": "contentment",
    "satisfied": "contentment",
    "satisfaction": "contentment",
    "excited": "excitement",
    "curious": "interest",
    "curiosity": "interest",
    "optimism": "hope",
    "optimistic": "hope",
    "hopeful": "hope",
    "worry": "anxiety",
    "worried": "anxiety",
    "anxious": "anxiety",
    "afraid": "fear",
    "scared": "fear",
    "irritation": "annoyance",
    "irritated": "annoyance",
    "annoyed": "annoyance",
    "frustrated": "frustration",
    "angry": "anger",
    "stressed": "stress",
    "overwhelm": "stress",
    "overwhelmed": "stress",
    "sad": "sadness",
    "grief": "sadness",
    "disappointed": "disappointment",
    "ashamed": "shame",
    "guilty": "guilt",
    "bored": "boredom",
    "lonely": "loneliness",
    "affection": "love",
    "grateful": "gratitude",
    "proud": "pride",
    "confident": "pride",
    "confidence": "pride",
    "eager": "enthusiasm",
    "eagerness": "enthusiasm",
    "nervous": "nervousness",
    "relieved": "relief",
}


def emotion_position(name: str) -> CoreAffect | None:
    """Coordinates for an emotion label, tolerant of case, whitespace and
    common variants. None for labels outside the vocabulary."""
    key = (name or "").strip().lower()
    key = EMOTION_ALIASES.get(key, key)
    entry = EMOTION_COORDINATES.get(key)
    if entry is None:
        return None
    v, a, d, _tier = entry
    return CoreAffect(valence=v, arousal=a, direction=d)


# Appraisal: each judgement scores in [0, 1]; (score - 0.5) moves the
# observation along its direction in affect space, scaled by its weight.
# name -> (weight, direction)
APPRAISAL_DIRECTIONS: dict[str, tuple[float, CoreAffect]] = {
    "goal_relevance":     (0.60, CoreAffect(valence=0.00, arousal=0.90, direction=0.20)),
    "goal_congruence":    (0.90, CoreAffect(valence=0.95, arousal=0.10, direction=0.60)),
    "certainty":          (0.40, CoreAffect(valence=0.30, arousal=-0.40, direction=0.30)),
    "coping_potential":   (0.50, CoreAffect(valence=0.40, arousal=-0.20, direction=0.70)),
    "norm_compatibility": (0.45, CoreAffect(valence=0.35, arousal=-0.30, direction=0.20)),
}

APPRAISAL_ORDER: tuple[str, ...] = (
    "goal_relevance",
    "goal_congruence",
    "certainty",
    "coping_potential",
    "norm_compatibility",
)

# Observation-noise model: R = R0 * (1 + LAMBDA_CERTAINTY * (1 - certainty))
#                                 * (1 + LAMBDA_FAMILIARITY * (1 - familiarity))
# The gain then follows spread^2 / (spread^2 + R): an uncertain or unfamiliar
# observation moves the persona less and the resting position dominates.
R0 = 0.08
LAMBDA_CERTAINTY = 2.0
LAMBDA_FAMILIARITY = 3.0

# How strongly framing suppresses norm compatibility (direct questions invite
# a considered self-presentation; projective ones relax it).
FRAMING_NORM_COMPATIBILITY: dict[str, float] = {
    "direct": 0.30,
    "behavioral": 0.60,
    "indirect": 0.70,
    "projective": 0.80,
    "unknown": 0.50,
}

# Base pull of expression toward the presentation anchor, per framing;
# scaled by question stakes in arbitration.
PRESENTATION_WEIGHTS: dict[str, float] = {
    "direct": 0.70,
    "behavioral": 0.40,
    "indirect": 0.25,
    "projective": 0.15,
    "unknown": 0.40,
}

# Confidence: three multiplicative terms in (0, 1], so any single weak term
# is enough to withhold. Below ABSTENTION_THRESHOLD the state is flagged
# abstain. Bimodality never enters the calculation.
ABSTENTION_THRESHOLD = 0.35
PLAUSIBILITY_PENALTY = 1.5   # applied to arousal unsupported by valence/direction
PLAUSIBILITY_FLOOR = 0.05
CERTAINTY_FLOOR = 0.05
# Evidence term: unknown evidence reads as moderate; explicitly empty
# evidence reads as disqualifying; each recorded item raises the term.
EVIDENCE_UNKNOWN_TERM = 0.60
EVIDENCE_BASE = 0.20
EVIDENCE_PER_ITEM = 0.20
