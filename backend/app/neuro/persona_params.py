"""Derives per-persona affect parameters from stored persona records by
deterministic code, never from an LLM at computation time. Missing fields
degrade to defaults.
"""
from __future__ import annotations

from typing import Any, Optional

from app.neuro import parameters
from app.neuro.types import CoreAffect, PersonaAffectParams

_CLAMP = 1.0

# Dimension-16 style emotional-memory labels -> carry-over persistence.
_PERSISTENCE_BY_MEMORY = {
    "none": 0.0,
    "no emotional memory": 0.0,
    "low": 0.25,
    "light": 0.25,
    "moderate": 0.5,
    "medium": 0.5,
    "high": 0.75,
    "strong": 0.75,
    "very high": 0.9,
}


def _clamp(x: float) -> float:
    return max(-_CLAMP, min(_CLAMP, x))


def _details(persona: dict) -> dict:
    d = persona.get("persona_details")
    return d if isinstance(d, dict) else {}


def _baseline_emotions(persona: dict) -> list[str]:
    d = _details(persona)
    layer3 = d.get("layer_3_emotional_fingerprint")
    if isinstance(layer3, dict):
        base = layer3.get("baseline_emotions")
        if isinstance(base, list):
            return [str(e) for e in base if isinstance(e, str)]
    return []


def _ocean(persona: dict) -> dict[str, float]:
    """OCEAN scores from persona_details.layer_1_framework.ocean, falling back
    to the top-level ocean_profile column. Non-numeric values are ignored."""
    out: dict[str, float] = {}
    d = _details(persona)
    layer1 = d.get("layer_1_framework")
    source: Any = None
    if isinstance(layer1, dict) and isinstance(layer1.get("ocean"), dict):
        source = layer1["ocean"]
    elif isinstance(persona.get("ocean_profile"), dict):
        source = persona["ocean_profile"]
    if isinstance(source, dict):
        for key, value in source.items():
            try:
                out[str(key).strip().lower()[:1]] = float(value)
            except (TypeError, ValueError):
                continue
    return out


def _baseline_from_ocean(ocean: dict[str, float]) -> CoreAffect:
    """Fallback resting position when no usable emotion labels exist.
    Agreeableness and low neuroticism pull valence up; extraversion raises
    arousal and approach. Missing traits read as mid-scale."""
    a = ocean.get("a", 0.5)
    n = ocean.get("n", 0.5)
    e = ocean.get("e", 0.5)
    return CoreAffect(
        valence=_clamp((a - n) * 0.6),
        arousal=_clamp((e - 0.5) * 0.6),
        direction=_clamp((e - n) * 0.5),
    )


def _persistence(persona: dict) -> float:
    d = _details(persona)
    for key in ("emotional_memory", "emotional_persistence"):
        raw = d.get(key)
        if isinstance(raw, (int, float)):
            return max(0.0, min(1.0, float(raw)))
        if isinstance(raw, str):
            label = raw.strip().lower()
            for token, value in _PERSISTENCE_BY_MEMORY.items():
                if token in label:
                    return value
    return 0.0


def _evidence_n(persona: dict):
    """Count of recorded evidence items, or None when the record carries no
    evidence container at all."""
    d = _details(persona)
    evidence = d.get("evidence")
    if isinstance(evidence, (dict, list)):
        return len(evidence)
    trace = d.get("evidence_traceability")
    if isinstance(trace, dict):
        return len(trace)
    return None


def from_persona(persona: Optional[dict]) -> PersonaAffectParams:
    """Build affect parameters for one persona record (the dict shape returned
    by persona services, including persona_details). None yields neutral
    population-level defaults."""
    if not isinstance(persona, dict):
        return PersonaAffectParams(persona_id="population")

    persona_id = str(persona.get("id") or "unknown")
    labels = _baseline_emotions(persona)
    positions = [p for p in (parameters.emotion_position(l) for l in labels) if p]

    if positions:
        baseline = CoreAffect(
            valence=_clamp(sum(p.valence for p in positions) / len(positions)),
            arousal=_clamp(sum(p.arousal for p in positions) / len(positions)),
            direction=_clamp(sum(p.direction for p in positions) / len(positions)),
        )
        # A broader recognised vocabulary implies finer emotional granularity.
        granularity = max(0.2, min(1.0, 0.3 + 0.1 * len(positions)))
        # Spread widens with how far apart the fingerprint emotions sit.
        if len(positions) > 1:
            mean_v = baseline.valence
            var = sum((p.valence - mean_v) ** 2 for p in positions) / len(positions)
            spread = max(0.15, min(0.6, 0.2 + var))
        else:
            spread = 0.25
    else:
        baseline = _baseline_from_ocean(_ocean(persona))
        granularity = 0.5
        spread = 0.3

    return PersonaAffectParams(
        persona_id=persona_id,
        baseline=baseline,
        spread=spread,
        persistence=_persistence(persona),
        granularity=granularity,
        evidence_n=_evidence_n(persona),
    )
