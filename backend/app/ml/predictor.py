"""
ML prediction bridge — loads trained joblib models and exposes
predict_user_behavior() for use in the insights router.

Models live in:  syntera-ml-pipeline/models/saved/*.joblib
Feature fetch from DB is wired via get_user_features() below.
"""

import os
import sys
import numpy as np
import joblib

# Absolute path to the ml-pipeline's models/saved/ dir
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ML_PIPELINE_DIR = os.path.abspath(os.path.join(_BACKEND_DIR, "..", "syntera-ml-pipeline"))
MODELS_SAVED_DIR = os.path.join(ML_PIPELINE_DIR, "models", "saved")

VALID_DOMAINS = {"ecom", "food", "mobility", "finance"}
_MODEL_NAMES = ["xgboost", "lightgbm", "catboost", "random_forest", "neural_net"]

# In-process model cache — loaded once per domain per process lifetime
_cache: dict[str, dict] = {}


def _load_domain_models(domain: str) -> dict:
    """Load base models + meta-model + feature list for a domain (cached)."""
    if domain in _cache:
        return _cache[domain]

    entry: dict = {"base": {}, "meta": None, "features": None}

    for name in _MODEL_NAMES:
        path = os.path.join(MODELS_SAVED_DIR, f"{domain}_{name}.joblib")
        if os.path.exists(path):
            entry["base"][name] = joblib.load(path)

    meta_path = os.path.join(MODELS_SAVED_DIR, f"{domain}_meta_model.joblib")
    if os.path.exists(meta_path):
        entry["meta"] = joblib.load(meta_path)

    feat_path = os.path.join(MODELS_SAVED_DIR, f"{domain}_features.joblib")
    if os.path.exists(feat_path):
        entry["features"] = joblib.load(feat_path)

    if not entry["base"]:
        raise FileNotFoundError(
            f"No trained models found for domain '{domain}' in {MODELS_SAVED_DIR}"
        )

    _cache[domain] = entry
    return entry


def predict_from_features(domain: str, features_dict: dict) -> dict:
    """
    Run prediction given pre-computed feature dict.

    Args:
        domain:        'ecom' | 'food' | 'mobility' | 'finance'
        features_dict: {feature_name: value} — keys must match training features

    Returns:
        {prediction, confidence, confidence_label, explanation, base_predictions}
    """
    if domain not in VALID_DOMAINS:
        raise ValueError(f"Unknown domain '{domain}'. Valid: {VALID_DOMAINS}")

    models = _load_domain_models(domain)
    feature_cols = models["features"]

    if feature_cols is None:
        raise RuntimeError(f"Feature column list missing for domain '{domain}'")

    X = np.array([[features_dict[col] for col in feature_cols]])

    base_preds: dict[str, float] = {}
    for name, model in models["base"].items():
        base_preds[name] = float(model.predict(X)[0])

    if models["meta"] is not None:
        meta_X = np.array([[base_preds[n] for n in _MODEL_NAMES if n in base_preds]])
        final = float(models["meta"].predict(meta_X)[0])
    else:
        final = float(np.mean(list(base_preds.values())))

    confidence = _calc_confidence(base_preds)
    label = _confidence_label(confidence)

    explanation = (
        f"{final:.2f} orders/week predicted with {confidence*100:.1f}% confidence ({label}). "
        f"Based on 15 behavioral features across 5 ML models."
    )

    return {
        "prediction": final,
        "confidence": confidence,
        "confidence_label": label,
        "explanation": explanation,
        "base_predictions": base_preds,
    }


async def predict_user_behavior(user_id: str, domain: str | None) -> dict:
    """
    High-level entry point for the insights router.

    Currently raises NotImplementedError for the DB feature-fetch step —
    that will be wired in once feature extraction from sync_action.record
    is integrated (requires DB access + feature_engineering.py).

    Args:
        user_id: user identifier
        domain:  one of VALID_DOMAINS, or None to auto-detect

    Returns:
        Same dict as predict_from_features()
    """
    resolved_domain = (domain or "").lower() or None
    if resolved_domain not in VALID_DOMAINS:
        resolved_domain = None

    if resolved_domain is None:
        raise ValueError(
            f"A valid domain is required for ML predictions. "
            f"Pass one of: {', '.join(sorted(VALID_DOMAINS))}"
        )

    from app.ml.feature_fetch import get_user_features
    features = await get_user_features(user_id, resolved_domain)
    return predict_from_features(resolved_domain, features)


# ── helpers ──────────────────────────────────────────────────────────────────

def _calc_confidence(base_preds: dict) -> float:
    vals = list(base_preds.values())
    mean = np.mean(vals)
    if mean == 0:
        return 0.5
    cv = np.std(vals) / mean
    if cv < 0.10:
        base = 0.95
    elif cv < 0.20:
        base = 0.85
    elif cv < 0.30:
        base = 0.75
    else:
        base = 0.60
    return min(base + 0.05, 0.98)


def _confidence_label(c: float) -> str:
    if c >= 0.90:
        return "VERY HIGH"
    if c >= 0.75:
        return "HIGH"
    if c >= 0.50:
        return "MODERATE"
    return "LOW"
