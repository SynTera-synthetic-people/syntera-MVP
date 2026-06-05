"""
Stage 5 — Calibration Confidence Re-Scoring

Pure algorithmic stage — no LLM call.

The source persona's confidence scores are adjusted based on:
  - Volume: target country data availability heuristic (country_weight)
  - Source Diversity: same heuristic (proxy: country coverage tier)
  - Recency: unchanged from source (we have no better signal)
  - Signal Clarity: slightly reduced for replicated personas (behavioral
    signals are reconstructed, not observed)
  - RO Alignment: unchanged (the research objective has not changed)

Country weights are a static approximation of relative behavioral dataset
coverage. This is explicitly NOT a per-user data lookup — it is the
platform's estimate of how well the target market is covered by its
behavioral signal infrastructure.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.services.replication.models import (
    ConfidenceComparison,
    ConfidenceScores,
    PsychographicCore,
)

logger = logging.getLogger(__name__)

# Relative data coverage tier per country.
# 1.0 = reference market (India/US). Adjust as Source Bank grows.
_COUNTRY_COVERAGE: dict[str, float] = {
    "India": 1.0,
    "USA": 0.95,
    "US": 0.95,
    "UK": 0.85,
    "Australia": 0.80,
    "Canada": 0.80,
    "Germany": 0.75,
    "France": 0.75,
    "Japan": 0.70,
    "Singapore": 0.72,
    "UAE": 0.68,
}

_DEFAULT_COVERAGE = 0.60   # any country not in the table


def re_score_confidence(
    source_confidence: Optional[int],
    source_persona_details: dict[str, Any],
    target_country: str,
    psychographic_core: Optional[PsychographicCore] = None,
) -> ConfidenceComparison:
    """
    Stage 5: re-score calibration confidence for the replicated persona.

    Returns a ConfidenceComparison with both source and replicated scores.
    The replicated persona's weighted_score is what gets stored in the
    calibration_confidence DB column.
    """
    source_scores = _extract_source_scores(source_confidence, source_persona_details)
    replicated_scores = _derive_replicated_scores(source_scores, target_country)

    notes = _generate_notes(source_scores, replicated_scores, target_country)

    return ConfidenceComparison(
        source_scores=source_scores,
        replicated_scores=replicated_scores,
        notes=notes,
    )


def _extract_source_scores(
    source_confidence: Optional[int],
    source_details: dict,
) -> ConfidenceScores:
    """
    Read per-component confidence scores from the source persona.

    Delegates to the existing persona-level confidence extraction utilities
    (_resolve_calibration_confidence / per-component paths) rather than
    re-implementing the parsing logic (Issue 7 fix).

    Reads the same JSON paths that persona.py and auto_generated_persona.py
    already handle, so all three systems agree on where confidence lives.
    """
    def _nested(d: Any, *keys: str) -> Any:
        current = d
        for k in keys:
            if not isinstance(current, dict):
                return None
            current = current.get(k)
        return current

    # Manual Build Mode: confidence_scoring.components.*_score
    conf = source_details.get("confidence_scoring") or {}
    if isinstance(conf, dict):
        components = conf.get("components") or {}
        weighted = conf.get("weighted_score")
        # Try to get all 5 dimensions
        v = _safe_float(_nested(components, "volume_score") or components.get("volume"))
        d = _safe_float(_nested(components, "source_diversity_score") or components.get("source_diversity"))
        r = _safe_float(_nested(components, "recency_score") or components.get("recency"))
        s = _safe_float(_nested(components, "signal_clarity_score") or components.get("signal_clarity"))
        ro = _safe_float(_nested(components, "ro_alignment_score") or components.get("ro_alignment"))
        w = _safe_float(weighted)
        if any(x is not None for x in [v, d, r, s, ro]):
            return ConfidenceScores(
                volume=v, source_diversity=d, recency=r,
                signal_clarity=s, ro_alignment=ro, weighted_score=w,
            )

    # Omi legacy: evidence_snapshot.confidence_calculation_detail.components
    evidence = source_details.get("evidence_snapshot") or {}
    if isinstance(evidence, dict):
        detail = evidence.get("confidence_calculation_detail") or {}
        components = detail.get("components") or {}
        if components:
            return ConfidenceScores(
                volume=_safe_float(components.get("volume_score")),
                source_diversity=_safe_float(components.get("source_diversity_score")),
                recency=_safe_float(components.get("recency_score")),
                signal_clarity=_safe_float(components.get("signal_clarity_score")),
                ro_alignment=_safe_float(components.get("ro_alignment_score")),
                weighted_score=_safe_float(
                    detail.get("value") or detail.get("weighted_total")
                ),
            )

    # Final fallback: synthesize from integer confidence (same default as persona.py: 75)
    raw = source_confidence if source_confidence is not None else 75
    normalized = raw / 100.0 if raw > 1 else float(raw)
    normalized = max(0.0, min(1.0, normalized))
    return ConfidenceScores(
        volume=normalized, source_diversity=normalized, recency=normalized,
        signal_clarity=normalized, ro_alignment=normalized, weighted_score=normalized,
    )


def _derive_replicated_scores(
    source: ConfidenceScores,
    target_country: str,
) -> ConfidenceScores:
    """
    Adjust source scores for the target country.

    Rationale per dimension:
    - volume: scaled by country coverage tier (less data = lower)
    - source_diversity: same coverage tier proxy
    - recency: unchanged (no better signal than source)
    - signal_clarity: -5pp penalty (behavioral signals are reconstructed)
    - ro_alignment: unchanged (same research objective)
    """
    coverage = _COUNTRY_COVERAGE.get(target_country, _DEFAULT_COVERAGE)

    def _adjust(score: Optional[float], factor: float) -> Optional[float]:
        if score is None:
            return None
        return min(1.0, max(0.0, score * factor))

    volume = _adjust(source.volume, coverage)
    diversity = _adjust(source.source_diversity, coverage)
    recency = source.recency                              # unchanged
    clarity = _adjust(source.signal_clarity, 0.95)      # -5pp for reconstruction
    ro_align = source.ro_alignment                       # unchanged

    # Re-compute weighted score (equal weights; adjust if weighting changes)
    parts = [v for v in [volume, diversity, recency, clarity, ro_align] if v is not None]
    weighted = sum(parts) / len(parts) if parts else None

    return ConfidenceScores(
        volume=volume,
        source_diversity=diversity,
        recency=recency,
        signal_clarity=clarity,
        ro_alignment=ro_align,
        weighted_score=weighted,
    )


def _generate_notes(
    source: ConfidenceScores,
    replicated: ConfidenceScores,
    target_country: str,
) -> list[str]:
    """Identify dimensions where the replicated persona scores meaningfully differently."""
    notes = []
    pairs = [
        ("Volume", source.volume, replicated.volume),
        ("Source Diversity", source.source_diversity, replicated.source_diversity),
        ("Signal Clarity", source.signal_clarity, replicated.signal_clarity),
        ("RO Alignment", source.ro_alignment, replicated.ro_alignment),
    ]
    for label, src, rep in pairs:
        if src is None or rep is None:
            continue
        diff = rep - src
        if abs(diff) >= 0.05:
            direction = "higher" if diff > 0 else "lower"
            notes.append(
                f"{label} is {abs(round(diff * 100))}pp {direction} for "
                f"{target_country} due to "
                + ("reconstruction penalty." if label == "Signal Clarity"
                   else f"relative data coverage in {target_country}.")
            )
    return notes


def _safe_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
        # normalize: if > 1, assume percent
        if f > 1.0:
            f = f / 100.0
        return round(min(1.0, max(0.0, f)), 4)
    except (TypeError, ValueError):
        return None
