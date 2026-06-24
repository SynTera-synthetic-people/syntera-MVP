"""
Digital Brain Pipeline — Stage 1 through Stage 5.

Flow: RO Input → Dimension Detection → [Action Data | Web Search | HQ DB] → Master Brain → Personas

Run standalone:
    python -m app.services.digital_brain_pipeline
"""

import asyncio
import hashlib
import json
import logging
import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from app.utils.anthropic_client import get_anthropic_client

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-6"

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RO_COMPONENTS = [
    "category", "sub_category", "target_audience", "geography",
    "business_objective", "research_type", "key_questions", "hypotheses",
    "competitive_context", "time_frame", "constraints", "probes",
]

DIMENSION_NAMES = {
    1: "Frequency / Usage",
    2: "Category / Brand Switching",
    3: "Price / Value Sensitivity",
    4: "Temporal Patterns",
    5: "Geographic Patterns",
    6: "Adoption / Trial",
    7: "Churn / Abandonment",
    8: "Loyalty / Retention",
    9: "Decision Journey",
    10: "Social / Peer Influence",
    11: "Lifestyle / Cross-Category",
    12: "Need Gap / Innovation",
    13: "Trust Building",
    14: "Risk Tolerance",
    15: "Information Processing",
    16: "Emotional Engagement",
}

DIMENSION_KEYWORDS: dict[int, list[str]] = {
    1: ["frequency", "how often", "usage", "regularly", "replenishment", "repeat"],
    2: ["switch", "switching", "migrate", "change brand", "from.*to", "abandon brand"],
    3: ["price", "premium", "expensive", "budget", "afford", "cost", "value for money", "willingness to pay"],
    4: ["time", "season", "occasion", "festival", "weekend", "morning", "evening", "when"],
    5: ["city", "region", "urban", "rural", "tier", "geography", "location", "where"],
    6: ["new", "first time", "trial", "try", "adopt", "start using", "onboard"],
    7: ["stop", "churn", "abandon", "drop", "quit", "discontinue", "why leave"],
    8: ["loyal", "loyalty", "retain", "stay", "repeat", "trusted", "sticking with"],
    9: ["decide", "decision", "journey", "evaluate", "compare", "research", "how buy"],
    10: ["influencer", "friend", "recommend", "peer", "word of mouth", "social proof", "refer"],
    11: ["lifestyle", "cross category", "other purchases", "holistic", "connected behavior"],
    12: ["unmet need", "gap", "innovation", "wish", "missing", "job to be done"],
    13: ["trust", "credibility", "reliable", "believe", "authentic"],
    14: ["risk", "hesitant", "uncertain", "try new", "experiment"],
    15: ["research", "information", "read", "watch review", "process", "evaluate"],
    16: ["emotion", "passion", "feeling", "attachment", "love", "hate", "relationship"],
}

CATEGORY_DEFAULTS: dict[str, list[int]] = {
    "apparel": [2, 3, 4, 10, 11],
    "fashion": [2, 3, 4, 10, 11],
    "clothing": [2, 3, 4, 10, 11],
    "skincare": [3, 6, 10, 13, 16],
    "beauty": [3, 6, 10, 13, 16],
    "electronics": [3, 9, 14, 15, 8],
    "food": [1, 4, 11, 5, 12],
    "grocery": [1, 4, 11, 5, 12],
    "finance": [13, 14, 15, 3, 8],
    "home": [11, 8, 10, 3, 1],
    "default": [2, 3, 10, 6, 16],
}

BRAIN_DEFINITIONS = {
    "Optimizer": {
        "schwartz": "Achievement",
        "one_liner": "Researches, compares, spreadsheets.",
        "contradiction": "Claims rationality, but optimization itself is emotional.",
        "feared_self": "The Sucker",
        "ocean": {"O": 0.70, "C": 0.90, "E": 0.55, "A": 0.60, "N": 0.30},
        "mbti": "ISTJ",
        "enneagram": 5,
    },
    "Nurturer": {
        "schwartz": "Benevolence + Security",
        "one_liner": "My child's health is not worth saving Rs 52.",
        "contradiction": "Frames all spending as 'for family' but derives personal identity from it.",
        "feared_self": "Negligent Parent",
        "ocean": {"O": 0.60, "C": 0.80, "E": 0.65, "A": 0.90, "N": 0.45},
        "mbti": "ESFJ",
        "enneagram": 2,
    },
    "Explorer": {
        "schwartz": "Stimulation + Self-Direction",
        "one_liner": "Downloaded 14 apps in 3 months.",
        "contradiction": "Claims independence but curates experiences for social validation.",
        "feared_self": "The Boring Person",
        "ocean": {"O": 0.90, "C": 0.45, "E": 0.75, "A": 0.60, "N": 0.40},
        "mbti": "ENFP",
        "enneagram": 7,
    },
    "Achiever": {
        "schwartz": "Achievement + Power",
        "one_liner": "Uber Premier for clients, Ola Auto for self.",
        "contradiction": "Projects effortless success, works obsessively hard behind scenes.",
        "feared_self": "The Failure",
        "ocean": {"O": 0.65, "C": 0.85, "E": 0.80, "A": 0.55, "N": 0.35},
        "mbti": "ENTJ",
        "enneagram": 3,
    },
    "Rebel": {
        "schwartz": "Self-Direction (counter-cultural)",
        "one_liner": "If everyone uses it, I don't want it.",
        "contradiction": "Rebellion is itself a conformity to counter-culture rules.",
        "feared_self": "The Sellout",
        "ocean": {"O": 0.85, "C": 0.40, "E": 0.70, "A": 0.35, "N": 0.50},
        "mbti": "ENTP",
        "enneagram": 8,
    },
    "Connector": {
        "schwartz": "Benevolence + Universalism",
        "one_liner": "My friend Priya recommended this.",
        "contradiction": "Positions as selfless connector, but connecting IS the power.",
        "feared_self": "The Isolated One",
        "ocean": {"O": 0.70, "C": 0.65, "E": 0.90, "A": 0.85, "N": 0.35},
        "mbti": "ENFJ",
        "enneagram": 2,
    },
    "Guardian": {
        "schwartz": "Security + Conformity",
        "one_liner": "Same toothpaste for 20 years.",
        "contradiction": "Safety-seeking is often less safe than they think.",
        "feared_self": "The Disrupted One",
        "ocean": {"O": 0.35, "C": 0.85, "E": 0.50, "A": 0.75, "N": 0.45},
        "mbti": "ISTJ",
        "enneagram": 6,
    },
    "Traditionalist": {
        "schwartz": "Tradition + Conformity",
        "one_liner": "Same mustard oil her mother used.",
        "contradiction": "Traditions they follow have already been selectively modernized.",
        "feared_self": "Last of the Line",
        "ocean": {"O": 0.25, "C": 0.80, "E": 0.45, "A": 0.80, "N": 0.40},
        "mbti": "ISFJ",
        "enneagram": 1,
    },
    "Visionary": {
        "schwartz": "Universalism + Self-Direction",
        "one_liner": "Every purchase is a vote.",
        "contradiction": "Advocates systemic change but operates within the same system.",
        "feared_self": "The Hypocrite",
        "ocean": {"O": 0.95, "C": 0.65, "E": 0.70, "A": 0.75, "N": 0.35},
        "mbti": "INFJ",
        "enneagram": 1,
    },
    "Harmonizer": {
        "schwartz": "Universalism + Benevolence",
        "one_liner": "The middle option is usually safest.",
        "contradiction": "Extreme moderation is itself an extreme position.",
        "feared_self": "The Doormat",
        "ocean": {"O": 0.55, "C": 0.65, "E": 0.55, "A": 0.90, "N": 0.50},
        "mbti": "INFP",
        "enneagram": 9,
    },
    "Hedonist": {
        "schwartz": "Hedonism",
        "one_liner": "Orders chocolate lava cake at 11pm.",
        "contradiction": "Frames pleasure as freedom, but pleasure-seeking is often reactive.",
        "feared_self": "The Deprived One",
        "ocean": {"O": 0.75, "C": 0.30, "E": 0.85, "A": 0.65, "N": 0.50},
        "mbti": "ESFP",
        "enneagram": 7,
    },
    "Pragmatist": {
        "schwartz": "Achievement (functional)",
        "one_liner": "Same paneer butter masala, every day.",
        "contradiction": "Frames indifference as efficiency, but refusal to engage is its own bias.",
        "feared_self": "The Sucker (mild)",
        "ocean": {"O": 0.30, "C": 0.70, "E": 0.45, "A": 0.65, "N": 0.25},
        "mbti": "ISTP",
        "enneagram": 5,
    },
}

TIER1_CITIES = {
    "mumbai", "delhi", "bangalore", "bengaluru", "hyderabad",
    "chennai", "kolkata", "pune", "ahmedabad", "surat",
}

# Account tier limits — controls how many personas are generated and expandable
TIER_CONFIG = {
    "free":       {"initial": 2, "max": 2},   # Trial: locked, no expansion
    "tier1":      {"initial": 2, "max": 8},   # Can expand up to 8
    "enterprise": {"initial": 4, "max": 8},   # Starts with 4, can expand to 8
}

# Change 3: Dimension relevance scores per category (0–1, only dims > 0.55 are kept)
DIMENSION_RELEVANCE_BY_CATEGORY: dict[str, dict[int, float]] = {
    "apparel":     {1: 0.7, 2: 0.95, 3: 0.95, 4: 0.65, 5: 0.6, 6: 0.8, 7: 0.4, 8: 0.85, 9: 0.75, 10: 0.90, 11: 0.7, 12: 0.4, 13: 0.5, 14: 0.4, 15: 0.8, 16: 0.75},
    "fashion":     {1: 0.7, 2: 0.95, 3: 0.95, 4: 0.65, 5: 0.6, 6: 0.8, 7: 0.4, 8: 0.85, 9: 0.75, 10: 0.90, 11: 0.7, 12: 0.4, 13: 0.5, 14: 0.4, 15: 0.8, 16: 0.75},
    "skincare":    {1: 0.6, 2: 0.8, 3: 0.85, 4: 0.6, 5: 0.5, 6: 0.95, 7: 0.6, 8: 0.75, 9: 0.7, 10: 0.85, 11: 0.7, 12: 0.8, 13: 0.95, 14: 0.6, 15: 0.75, 16: 0.95},
    "electronics": {1: 0.6, 2: 0.85, 3: 0.95, 4: 0.5, 5: 0.6, 6: 0.9, 7: 0.7, 8: 0.6, 9: 0.95, 10: 0.7, 11: 0.65, 12: 0.85, 13: 0.7, 14: 0.95, 15: 0.95, 16: 0.5},
    "food":        {1: 0.95, 2: 0.6, 3: 0.7, 4: 0.9, 5: 0.8, 6: 0.65, 7: 0.75, 8: 0.85, 9: 0.5, 10: 0.85, 11: 0.95, 12: 0.65, 13: 0.6, 14: 0.5, 15: 0.5, 16: 0.7},
    "default":     {i: 0.65 for i in range(1, 17)},
}


# ---------------------------------------------------------------------------
# LLM Cache
# ---------------------------------------------------------------------------

CACHE_DIR = Path(__file__).parent / ".llm_cache"
CACHE_DIR.mkdir(exist_ok=True)
CACHE_ENABLED = False  # Real ROs are always unique — caching gives no benefit in production


def _cache_key(prompt: str, system: str = "") -> str:
    content = f"{system}||{prompt}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def _get_cached(key: str) -> str | None:
    if not CACHE_ENABLED:
        return None
    cache_file = CACHE_DIR / f"{key}.cache"
    try:
        if cache_file.exists():
            with open(cache_file, "rb") as f:
                return pickle.load(f)
    except Exception:
        pass
    return None


def _set_cache(key: str, response: str) -> None:
    if not CACHE_ENABLED:
        return
    cache_file = CACHE_DIR / f"{key}.cache"
    try:
        with open(cache_file, "wb") as f:
            pickle.dump(response, f)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _llm(prompt: str, system: str = "") -> str:
    """Call Claude synchronously with disk caching. Returns text response."""
    key = _cache_key(prompt, system)
    cached = _get_cached(key)
    if cached:
        logger.info("Cache hit  [%s]", key)
        return cached
    client = get_anthropic_client()
    messages = [{"role": "user", "content": prompt}]
    kwargs: dict[str, Any] = {"model": MODEL, "max_tokens": 4096, "messages": messages}
    if system:
        kwargs["system"] = system
    response = client.messages.create(**kwargs)
    text = response.content[0].text
    _set_cache(key, text)
    logger.info("Cache miss [%s] — stored", key)
    return text


def _parse_json_from_llm(raw: str) -> Any:
    """Extract and parse the first JSON block from LLM output."""
    raw = raw.strip()
    if "```" in raw:
        start = raw.find("```")
        end = raw.rfind("```")
        block = raw[start:end].strip()
        block = block.lstrip("`").strip()
        if block.startswith("json"):
            block = block[4:].strip()
        raw = block
    return json.loads(raw)


def _ro_text(validated_ro: dict) -> str:
    """Flatten all RO components into a single searchable string."""
    parts = []
    for key in RO_COMPONENTS:
        val = validated_ro.get(key, "")
        if isinstance(val, list):
            parts.append(" ".join(str(v) for v in val))
        else:
            parts.append(str(val))
    return " ".join(parts).lower()


def _detect_category_group(category: str) -> str:
    cat = category.lower()
    for key in CATEGORY_DEFAULTS:
        if key in cat:
            return key
    return "default"


def _city_tier(city: str) -> str:
    return "Tier 1" if city.lower() in TIER1_CITIES else "Tier 2/3"


def _decode_epoch(ts: Any) -> dict:
    """Decode epoch ms/s to hour, day-of-week, month."""
    try:
        ts_val = int(ts)
        if ts_val > 1e12:
            ts_val //= 1000
        dt = datetime.fromtimestamp(ts_val, tz=timezone.utc)
        return {"hour": dt.hour, "weekday": dt.strftime("%A"), "month": dt.strftime("%B"), "dt": dt}
    except Exception:
        return {"hour": -1, "weekday": "Unknown", "month": "Unknown", "dt": None}


# ---------------------------------------------------------------------------
# Stage 1 — Research Objective Validation
# ---------------------------------------------------------------------------

def validate_research_objective(ro_dict: dict) -> dict:
    """
    Validate that the research objective contains all 12 required components.

    Returns the validated RO on success, raises ValueError on failure.
    """
    errors = []
    for i, component in enumerate(RO_COMPONENTS, start=1):
        val = ro_dict.get(component)
        if val is None:
            errors.append(f"Component {i} ({component}) is missing.")
        elif isinstance(val, (list, tuple)):
            if len(val) == 0:
                errors.append(f"Component {i} ({component}) is an empty list.")
        elif not isinstance(val, str):
            errors.append(f"Component {i} ({component}) must be a string, got {type(val).__name__}.")
        elif not val.strip():
            errors.append(f"Component {i} ({component}) is empty or blank.")

    if errors:
        raise ValueError("RO validation failed:\n" + "\n".join(errors))

    logger.info("Stage 1: RO validated — category=%s", ro_dict.get("category"))
    return ro_dict


# ---------------------------------------------------------------------------
# Stage 2 — Dimension Detection
# ---------------------------------------------------------------------------

def detect_relevant_dimensions(validated_ro: dict) -> dict:
    """
    Identify which of the 16 behavioral dimensions are relevant to this RO.

    Applies three rules in order:
      1. Keyword matching across all RO text
      2. Category-default dimensions
      3. Probe expansion
    Minimum 5 dimensions guaranteed.
    """
    text = _ro_text(validated_ro)
    activated: dict[int, str] = {}

    # Rule 1 — keyword matching
    for dim, keywords in DIMENSION_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                activated[dim] = activated.get(dim, f"keyword_match ({kw!r})")
                break

    # Rule 2 — category defaults
    cat_group = _detect_category_group(validated_ro.get("category", ""))
    for dim in CATEGORY_DEFAULTS.get(cat_group, CATEGORY_DEFAULTS["default"]):
        if dim not in activated:
            activated[dim] = "category_default"

    # Rule 3 — probe expansion
    probes = validated_ro.get("probes", "")
    if isinstance(probes, list):
        probe_text = " ".join(probes).lower()
    else:
        probe_text = str(probes).lower()

    probe_triggers = {
        "brand loyalty": 8, "loyalty": 8,
        "social influence": 10, "influencer": 10,
        "price sensitivity": 3, "premium": 3,
        "fit": 16, "comfort": 16,
        "decision": 9, "journey": 9,
        "churn": 7, "drop": 7,
        "frequency": 1, "how often": 1,
        "trust": 13, "credibility": 13,
        "information": 15, "research process": 15,
        "trial": 6, "adoption": 6,
        "lifestyle": 11, "cross": 11,
        "geography": 5, "region": 5,
    }
    for phrase, dim in probe_triggers.items():
        if phrase in probe_text and dim not in activated:
            activated[dim] = f"probe_expansion ({phrase!r})"

    # Change 3: filter by category relevance (drop dims with relevance ≤ 0.55)
    relevance_scores = DIMENSION_RELEVANCE_BY_CATEGORY.get(cat_group, DIMENSION_RELEVANCE_BY_CATEGORY["default"])
    activated = {d: v for d, v in activated.items() if relevance_scores.get(d, 0.65) > 0.55}

    # Minimum 5 rule
    if len(activated) < 5:
        fallbacks = CATEGORY_DEFAULTS.get(cat_group, CATEGORY_DEFAULTS["default"])
        extras = [d for d in fallbacks if d not in activated]
        # then general productive dimensions
        for d in [3, 10, 2, 6, 16, 9, 15, 8, 11, 1]:
            if len(activated) >= 5:
                break
            if d not in activated:
                activated[d] = "minimum_rule_fallback"
        for d in extras:
            if len(activated) >= 5:
                break
            if d not in activated:
                activated[d] = "minimum_rule_fallback"

    result = {
        "activated_dimensions": sorted(activated.keys()),
        "dimension_rationale": {str(k): v for k, v in activated.items()},
        "dimension_names": {str(k): DIMENSION_NAMES[k] for k in activated},
        "category_group": cat_group,
        "minimum_rule_applied": any(v == "minimum_rule_fallback" for v in activated.values()),
        "total_activated": len(activated),
    }
    logger.info("Stage 2: %d dimensions activated: %s", len(activated), sorted(activated.keys()))
    return result


# ---------------------------------------------------------------------------
# Stage 3A — Action Data Scan
# ---------------------------------------------------------------------------

def scan_action_data(
    action_data_df: pd.DataFrame,
    activated_dimensions: list[int],
    validated_ro: dict,
) -> list[dict]:
    """
    Analyse transaction data to produce Depth Layer verdicts.

    Each verdict maps a detected behavioral pattern to a Digital Brain signal.
    """
    if action_data_df is None or action_data_df.empty:
        logger.warning("Stage 3A: No action data provided; skipping.")
        return []

    df = action_data_df.copy()
    category = validated_ro.get("category", "").lower()
    depth_layers: list[dict] = []
    verdict_counter = 0

    def _next_id() -> str:
        nonlocal verdict_counter
        verdict_counter += 1
        return f"DL_{verdict_counter:03d}"

    # --- Filter to relevant products via NLP on priceName ---
    relevant_keywords = _extract_category_keywords(category)

    def _parse_product_items(val: Any) -> list[dict]:
        if isinstance(val, list):
            return val
        if isinstance(val, str):
            try:
                return json.loads(val)
            except Exception:
                return []
        return []

    def _row_matches_category(row: pd.Series) -> bool:
        items = _parse_product_items(row.get("productItems", []))
        for item in items:
            name = (item.get("priceName") or "").lower()
            if any(kw in name for kw in relevant_keywords):
                return True
        return False

    mask = df.apply(_row_matches_category, axis=1)
    df_rel = df[mask].copy()

    if df_rel.empty:
        # Fall back to full dataset if no category match
        df_rel = df.copy()
        logger.info("Stage 3A: No category filter match — using full dataset.")
    else:
        logger.info("Stage 3A: %d/%d rows matched category filter.", len(df_rel), len(df))

    # Temporal decoding
    if "orderTime" in df_rel.columns:
        decoded = df_rel["orderTime"].apply(_decode_epoch)
        df_rel["_hour"] = decoded.apply(lambda x: x["hour"])
        df_rel["_weekday"] = decoded.apply(lambda x: x["weekday"])
        df_rel["_month"] = decoded.apply(lambda x: x["month"])

    # Per-user brand sequences for switching analysis
    user_brand_sequences: dict[str, list[str]] = {}
    user_price_sequences: dict[str, list[float]] = {}
    if "accountEmailId" in df_rel.columns:
        grp = df_rel.sort_values("receivedDate") if "receivedDate" in df_rel.columns else df_rel
        for uid, sub in grp.groupby("accountEmailId"):
            brands = []
            prices = []
            for _, row in sub.iterrows():
                items = _parse_product_items(row.get("productItems", []))
                for item in items:
                    name = item.get("priceName", "")
                    brand = _extract_brand_from_name(name)
                    if brand:
                        brands.append(brand)
                    try:
                        prices.append(float(item.get("price", 0)))
                    except Exception:
                        pass
            user_brand_sequences[str(uid)] = brands
            user_price_sequences[str(uid)] = prices

    # --- Scan per activated dimension ---
    for dim in activated_dimensions:

        # Dim 2: Brand switching
        if dim == 2:
            switchers = {
                uid: seq for uid, seq in user_brand_sequences.items()
                if len(set(seq)) > 1
            }
            if switchers:
                sample_uid = next(iter(switchers))
                sample_seq = switchers[sample_uid]
                row_sample = df_rel[df_rel["accountEmailId"].astype(str) == sample_uid].iloc[0] if len(df_rel) > 0 else pd.Series()
                depth_layers.append({
                    "verdict_id": _next_id(),
                    "pattern_detected": f"{len(switchers)} users switch between brands in this category",
                    "dimension_mapped_to": 2,
                    "dimension_name": DIMENSION_NAMES[2],
                    "behavioral_signal": "Explorer or Connector brain — values variety, peer-driven switching",
                    "evidence": {
                        "switcher_count": len(switchers),
                        "example_user": sample_uid,
                        "brand_sequence_example": sample_seq[:6],
                        "unique_brands": len(set(sample_seq)),
                    },
                    "situational_context": _build_situational_context(row_sample, df_rel),
                    "digital_brain_signal": "Explorer (novelty drive) or Connector (peer influence)",
                    "confidence_score": min(0.55 + len(switchers) / 100, 0.95),
                })

        # Dim 1 & 8: Frequency / Loyalty
        if dim in (1, 8) and "accountEmailId" in df_rel.columns:
            loyal_users = {
                uid: seq for uid, seq in user_brand_sequences.items()
                if len(seq) >= 2 and len(set(seq)) == 1
            }
            switcher_count = sum(1 for seq in user_brand_sequences.values() if len(set(seq)) > 1)
            loyal_count = len(loyal_users)
            if dim == 8 and loyal_count:
                depth_layers.append({
                    "verdict_id": _next_id(),
                    "pattern_detected": f"{loyal_count} users show repeat-brand loyalty",
                    "dimension_mapped_to": 8,
                    "dimension_name": DIMENSION_NAMES[8],
                    "behavioral_signal": "Guardian or Pragmatist brain — sticks with what works",
                    "evidence": {
                        "loyal_user_count": loyal_count,
                        "switcher_count": switcher_count,
                        "loyalty_rate": round(loyal_count / max(len(user_brand_sequences), 1), 2),
                    },
                    "situational_context": {},
                    "digital_brain_signal": "Guardian (trust-based) or Pragmatist (habitual)",
                    "confidence_score": 0.80,
                })

        # Dim 3: Price sensitivity
        if dim == 3:
            all_prices = [p for prices in user_price_sequences.values() for p in prices if p > 0]
            if all_prices:
                avg_price = sum(all_prices) / len(all_prices)
                max_price = max(all_prices)
                min_price = min(all_prices)
                tier = "premium" if avg_price > 1000 else ("mid-range" if avg_price > 400 else "budget")
                depth_layers.append({
                    "verdict_id": _next_id(),
                    "pattern_detected": f"Average spend Rs {avg_price:.0f} — {tier} tier",
                    "dimension_mapped_to": 3,
                    "dimension_name": DIMENSION_NAMES[3],
                    "behavioral_signal": f"Spend profile: {tier}. Range Rs {min_price:.0f}–{max_price:.0f}",
                    "evidence": {
                        "avg_price": round(avg_price, 2),
                        "min_price": round(min_price, 2),
                        "max_price": round(max_price, 2),
                        "price_tier": tier,
                        "sample_size": len(all_prices),
                    },
                    "situational_context": {"financial": f"Typical spend Rs {avg_price:.0f}"},
                    "digital_brain_signal": "Optimizer (compares value) or Pragmatist (buys cheapest reliable)",
                    "confidence_score": 0.85,
                })

        # Dim 4: Temporal patterns
        if dim == 4 and "_hour" in df_rel.columns:
            hours = df_rel["_hour"].dropna().tolist()
            if hours:
                from collections import Counter
                hour_counts = Counter(int(h) for h in hours if h >= 0)
                peak_hour = hour_counts.most_common(1)[0][0] if hour_counts else -1
                time_slot = (
                    "Morning (6–12)" if 6 <= peak_hour < 12
                    else "Afternoon (12–18)" if 12 <= peak_hour < 18
                    else "Evening (18–24)" if 18 <= peak_hour < 24
                    else "Late Night (0–6)" if peak_hour >= 0
                    else "Unknown"
                )
                weekday_counts = Counter(df_rel["_weekday"].dropna().tolist())
                top_weekday = weekday_counts.most_common(1)[0][0] if weekday_counts else "Unknown"
                depth_layers.append({
                    "verdict_id": _next_id(),
                    "pattern_detected": f"Peak purchases at {peak_hour}:00 — {time_slot}, mostly {top_weekday}",
                    "dimension_mapped_to": 4,
                    "dimension_name": DIMENSION_NAMES[4],
                    "behavioral_signal": f"{time_slot} shopping suggests deliberate vs impulse purchase mode",
                    "evidence": {
                        "peak_hour": peak_hour,
                        "time_slot": time_slot,
                        "top_weekday": top_weekday,
                        "hour_distribution": dict(hour_counts.most_common(5)),
                    },
                    "situational_context": {"temporal": f"{time_slot}, peak {top_weekday}"},
                    "digital_brain_signal": "Hedonist (late-night impulse) or Optimizer (deliberate morning/evening)",
                    "confidence_score": 0.78,
                })

        # Dim 5: Geographic patterns
        if dim == 5 and "city" in df_rel.columns:
            cities = df_rel["city"].dropna().unique().tolist()
            tier1 = [c for c in cities if c.lower() in TIER1_CITIES]
            tier2 = [c for c in cities if c.lower() not in TIER1_CITIES]
            depth_layers.append({
                "verdict_id": _next_id(),
                "pattern_detected": f"Data from {len(cities)} cities: {len(tier1)} Tier-1, {len(tier2)} Tier-2/3",
                "dimension_mapped_to": 5,
                "dimension_name": DIMENSION_NAMES[5],
                "behavioral_signal": "Geographic spread signals online-first purchasing across tiers",
                "evidence": {
                    "cities": cities[:10],
                    "tier1_cities": tier1,
                    "tier2_cities": tier2[:5],
                },
                "situational_context": {"geographic": f"Cities: {', '.join(cities[:4])}"},
                "digital_brain_signal": "Achiever/Explorer (Tier-1 premium) vs Pragmatist (Tier-2 value)",
                "confidence_score": 0.72,
            })

        # Dim 10: Social/peer (inferred from cluster)
        if dim == 10 and "city" in df_rel.columns:
            from collections import defaultdict, Counter
            city_brand_map: dict[str, list[str]] = defaultdict(list)
            for _, row in df_rel.iterrows():
                city = str(row.get("city", "")).lower()
                items = _parse_product_items(row.get("productItems", []))
                for item in items:
                    brand = _extract_brand_from_name(item.get("priceName", ""))
                    if brand:
                        city_brand_map[city].append(brand)
            peer_clusters = []
            for city, brands in city_brand_map.items():
                counts = Counter(brands)
                popular = [b for b, c in counts.items() if c >= 2]
                if popular:
                    peer_clusters.append({"city": city, "popular_brands": popular})
            if peer_clusters:
                depth_layers.append({
                    "verdict_id": _next_id(),
                    "pattern_detected": f"Peer clustering detected in {len(peer_clusters)} cities",
                    "dimension_mapped_to": 10,
                    "dimension_name": DIMENSION_NAMES[10],
                    "behavioral_signal": "Multiple users in same city buying same brands — social influence signal",
                    "evidence": {"peer_clusters": peer_clusters[:3]},
                    "situational_context": {"social": "Co-purchase clusters suggest social spread"},
                    "digital_brain_signal": "Connector (peer-driven) or Explorer (trend-following)",
                    "confidence_score": 0.70,
                })

        # Dim 11: Lifestyle / cross-category
        if dim == 11 and "accountEmailId" in df_rel.columns:
            multi_cat_users = 0
            for _, sub in df_rel.groupby("accountEmailId"):
                cat_set: set[str] = set()
                for _, row in sub.iterrows():
                    items = _parse_product_items(row.get("productItems", []))
                    for item in items:
                        cat_set.add(_rough_category(item.get("priceName", "")))
                if len(cat_set) > 1:
                    multi_cat_users += 1
            depth_layers.append({
                "verdict_id": _next_id(),
                "pattern_detected": f"{multi_cat_users} users show cross-category purchasing",
                "dimension_mapped_to": 11,
                "dimension_name": DIMENSION_NAMES[11],
                "behavioral_signal": "Cross-category coherence indicates lifestyle persona signals",
                "evidence": {"multi_category_users": multi_cat_users},
                "situational_context": {"lifestyle": "Cross-category purchasing detected"},
                "digital_brain_signal": "Visionary (values-aligned) or Achiever (premium across categories)",
                "confidence_score": 0.68,
            })

    # Final LLM enrichment: generate a synthesised depth layer from patterns
    if depth_layers:
        summary_prompt = f"""
You are the Master Brain for a consumer research system.

Research Objective:
Category: {validated_ro.get('category')}
Audience: {validated_ro.get('target_audience')}
Key Questions: {validated_ro.get('key_questions')}

I have detected the following raw behavioral patterns from transaction data:
{json.dumps([{"pattern": dl["pattern_detected"], "dimension": dl["dimension_name"], "brain_signal": dl["digital_brain_signal"]} for dl in depth_layers], indent=2)}

Generate ONE additional synthesized Depth Layer verdict that captures the OVERALL behavioral archetype
emerging from these patterns. Focus on what this data reveals at a psychological level — not just what
was purchased, but who this consumer IS and how they decide.

Return ONLY a JSON object with these fields:
- verdict_id: "DL_SYNTH"
- pattern_detected: string
- dimension_mapped_to: 0
- dimension_name: "Synthesized Cross-Dimension"
- behavioral_signal: string (2-3 sentences, psychological insight)
- evidence: dict with key "pattern_count" and "primary_signals" list
- situational_context: dict
- digital_brain_signal: string
- confidence_score: float (0.7–0.9)
"""
        try:
            raw = _llm(summary_prompt, system="You are a consumer psychologist. Return only valid JSON.")
            synth = _parse_json_from_llm(raw)
            depth_layers.append(synth)
        except Exception as e:
            logger.warning("Stage 3A: LLM synthesis failed — %s", e)

    logger.info("Stage 3A: %d depth layers produced.", len(depth_layers))
    return depth_layers


def _extract_category_keywords(category: str) -> list[str]:
    cat = category.lower()
    if any(w in cat for w in ["apparel", "fashion", "clothing", "shirt", "tshirt", "t-shirt", "jeans", "wear"]):
        return ["shirt", "tshirt", "t-shirt", "jeans", "pant", "trouser", "jacket", "kurta", "top",
                "dress", "suit", "hoodie", "sweatshirt", "polo", "crew neck", "round neck",
                "h&m", "puma", "raymond", "john players", "eyebogler", "teamspirit", "spykar"]
    if any(w in cat for w in ["skincare", "beauty", "face", "skin"]):
        return ["face wash", "serum", "moisturiser", "sunscreen", "cleanser", "toner", "vitamin c"]
    if any(w in cat for w in ["food", "grocery", "snack"]):
        return ["food", "snack", "biscuit", "chip", "coffee", "tea", "masala", "spice"]
    if any(w in cat for w in ["electronics", "mobile", "phone", "laptop"]):
        return ["phone", "mobile", "laptop", "earphone", "headphone", "charger", "cable", "tablet"]
    # Generic — use first two words of category
    words = cat.split()[:2]
    return words if words else ["product"]


def _extract_brand_from_name(name: str) -> str:
    """Heuristic: first 1-2 words of product name as brand proxy."""
    if not name:
        return ""
    parts = name.strip().split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1]}".lower()
    return parts[0].lower() if parts else ""


def _rough_category(name: str) -> str:
    name_l = name.lower()
    if any(w in name_l for w in ["shirt", "tshirt", "t-shirt", "jeans", "pant", "jacket", "dress"]):
        return "apparel"
    if any(w in name_l for w in ["face", "serum", "moisturiser", "sunscreen", "cleanser"]):
        return "skincare"
    if any(w in name_l for w in ["food", "snack", "biscuit", "chip", "coffee", "tea"]):
        return "food"
    if any(w in name_l for w in ["phone", "laptop", "earphone", "headphone", "charger"]):
        return "electronics"
    return "other"


def _build_situational_context(row: pd.Series, df_rel: pd.DataFrame) -> dict:
    ctx: dict = {}
    if row.empty:
        return ctx
    city = str(row.get("city", "Unknown"))
    ctx["geographic"] = f"{city} ({_city_tier(city)})"
    hour = row.get("_hour", -1)
    if hour >= 0:
        slot = (
            "Morning" if 6 <= int(hour) < 12
            else "Afternoon" if 12 <= int(hour) < 18
            else "Evening" if 18 <= int(hour) < 24
            else "Late Night"
        )
        ctx["temporal"] = f"{slot} (hour {hour})"
    charged = row.get("totalCharged", 0)
    try:
        charged = float(charged)
        ctx["financial"] = f"Order value Rs {charged:.0f}"
    except Exception:
        pass
    pm = row.get("paymentMethod", "")
    if pm:
        ctx["payment"] = str(pm)
    return ctx


# ---------------------------------------------------------------------------
# Stage 3B — Evidence-Based Web Search
# ---------------------------------------------------------------------------

def search_evidence_based_web(validated_ro: dict, activated_dimensions: list[int]) -> list[dict]:
    """
    Search public platforms (simulated via LLM knowledge) for consumer conversations
    relevant to the RO and activated dimensions.
    """
    dim_names = [DIMENSION_NAMES[d] for d in activated_dimensions if d in DIMENSION_NAMES]
    probes = validated_ro.get("probes", [])
    if isinstance(probes, list):
        probes_text = ", ".join(probes)
    else:
        probes_text = str(probes)

    prompt = f"""
You are a consumer intelligence researcher. Using your knowledge of online consumer conversations
(Reddit, Twitter/X, LinkedIn, YouTube, Quora, Medium), synthesize realistic evidence-based verdicts
for the following research study.

RESEARCH OBJECTIVE:
- Category: {validated_ro.get('category')}
- Sub-category: {validated_ro.get('sub_category')}
- Target Audience: {validated_ro.get('target_audience')}
- Geography: {validated_ro.get('geography')}
- Key Questions: {validated_ro.get('key_questions')}
- Competitive Context: {validated_ro.get('competitive_context')}
- Probes: {probes_text}

ACTIVE DIMENSIONS TO COVER: {', '.join(dim_names)}

Generate exactly 4 Evidence-Based Verdicts — one per key dimension cluster.
Each verdict must reflect real consumer psychology and conversation patterns.

Return a JSON array of 4 objects, each with:
- verdict_id: "EB_001" etc.
- source_platform: one of ["Reddit", "Twitter/X", "LinkedIn", "YouTube", "Quora"]
- threads_analyzed: integer (realistic, 10-60)
- sentiment_distribution: dict with keys "positive", "neutral", "negative" (floats summing to 1.0)
- key_discussion_themes: list of 3 strings (what people actually say)
- dimension_alignment: list of ints from {activated_dimensions}
- dimension_insights: dict (dimension number as key, 1-line insight as value)
- digital_brain_signal: string (which brain archetype this conversation pattern signals)
- confidence_score: float 0.65–0.88
- representative_quote: string (realistic quote from this audience on this topic)

Reflect real nuance: conflicting opinions, platform-specific voice, Indian consumer context.
Return ONLY the JSON array.
"""
    try:
        raw = _llm(prompt, system="You are a consumer research specialist. Return only valid JSON.")
        verdicts = _parse_json_from_llm(raw)
        if not isinstance(verdicts, list):
            verdicts = [verdicts]
        logger.info("Stage 3B: %d EB verdicts produced.", len(verdicts))
        return verdicts
    except Exception as e:
        logger.error("Stage 3B failed: %s", e)
        return [{
            "verdict_id": "EB_001",
            "source_platform": "Reddit",
            "threads_analyzed": 0,
            "sentiment_distribution": {"positive": 0.5, "neutral": 0.3, "negative": 0.2},
            "key_discussion_themes": ["Web search unavailable — using fallback"],
            "dimension_alignment": activated_dimensions[:3],
            "dimension_insights": {},
            "digital_brain_signal": "Optimizer",
            "confidence_score": 0.40,
            "representative_quote": "N/A",
        }]


# ---------------------------------------------------------------------------
# Stage 3C — HQ Database Search
# ---------------------------------------------------------------------------

def search_hq_database(validated_ro: dict, activated_dimensions: list[int]) -> list[dict]:
    """
    Query internal validated research patterns (simulated via LLM knowledge of
    academic research and industry benchmarks).
    """
    dim_names = [DIMENSION_NAMES[d] for d in activated_dimensions if d in DIMENSION_NAMES]

    prompt = f"""
You are an internal research database for Synthetic People AI, containing:
- Prior consumer studies (India, 2020-2025)
- Academic research: Schwartz Value Theory, OCEAN personality, Self-Determination Theory
- Industry benchmarks for category-specific consumer behavior
- Digital Brain behavioral baselines per category

QUERY:
- Category: {validated_ro.get('category')}
- Sub-category: {validated_ro.get('sub_category')}
- Audience: {validated_ro.get('target_audience')}
- Geography: {validated_ro.get('geography')}
- Business Objective: {validated_ro.get('business_objective')}
- Dimensions of interest: {', '.join(dim_names)}

Return exactly 3 HQ Verdicts from validated research.
Each must have solid academic or empirical grounding.

Return a JSON array of 3 objects, each with:
- verdict_id: "HQ_001" etc.
- source_type: one of ["academic_research", "industry_benchmark", "prior_study", "brain_baseline"]
- study_reference: string (realistic reference like "Schwartz 1992", "Nielsen India 2024", etc.)
- finding_summary: string (the validated finding in plain language, 1-2 sentences)
- dimension_alignment: integer (ONE dimension number from {activated_dimensions})
- dimension_insight: string (how this finding maps to the dimension)
- digital_brain_signal: string (which Digital Brain this validates)
- confidence_score: float 0.80–0.96
- provenance_detail: dict with "type", "geography_tested", "sample_size", "study_date"

Be specific and grounded. Reference real research frameworks where applicable.
Return ONLY the JSON array.
"""
    try:
        raw = _llm(prompt, system="You are a consumer research database. Return only valid JSON.")
        verdicts = _parse_json_from_llm(raw)
        if not isinstance(verdicts, list):
            verdicts = [verdicts]
        logger.info("Stage 3C: %d HQ verdicts produced.", len(verdicts))
        return verdicts
    except Exception as e:
        logger.error("Stage 3C failed: %s", e)
        return [{
            "verdict_id": "HQ_001",
            "source_type": "brain_baseline",
            "study_reference": "Synthetic People AI Internal Baseline",
            "finding_summary": "HQ database unavailable — using default baseline.",
            "dimension_alignment": activated_dimensions[0] if activated_dimensions else 3,
            "dimension_insight": "Default baseline applied.",
            "digital_brain_signal": "Optimizer",
            "confidence_score": 0.50,
            "provenance_detail": {"type": "brain_baseline"},
        }]


# ---------------------------------------------------------------------------
# Stage 4 — Master Brain Synthesis
# ---------------------------------------------------------------------------

def master_brain_synthesis(
    depth_layers: list[dict],
    eb_verdicts: list[dict],
    hq_verdicts: list[dict],
    activated_dimensions: list[int],
) -> dict:
    """
    Cross-reference all three evidence streams and produce a Brain Assignment Matrix.

    Identifies convergences (strong signals) and divergences (Say-Do Gaps).
    """
    brain_list = list(BRAIN_DEFINITIONS.keys())
    dim_names = {str(k): v for k, v in DIMENSION_NAMES.items()}

    prompt = f"""
You are the Master Brain of the Synthetic People AI platform.

You have received outputs from three parallel evidence streams for a consumer research study.

=== STREAM A: ACTION DATA (DEPTH LAYERS) ===
{json.dumps([{"pattern": dl.get("pattern_detected"), "dimension": dl.get("dimension_name"), "brain_signal": dl.get("digital_brain_signal"), "confidence": dl.get("confidence_score")} for dl in depth_layers], indent=2)}

=== STREAM B: EVIDENCE-BASED WEB SEARCH ===
{json.dumps([{"themes": v.get("key_discussion_themes"), "brain_signal": v.get("digital_brain_signal"), "sentiment": v.get("sentiment_distribution"), "confidence": v.get("confidence_score")} for v in eb_verdicts], indent=2)}

=== STREAM C: HQ VALIDATED RESEARCH ===
{json.dumps([{"finding": v.get("finding_summary"), "brain_signal": v.get("digital_brain_signal"), "dimension": v.get("dimension_alignment"), "confidence": v.get("confidence_score")} for v in hq_verdicts], indent=2)}

ACTIVATED DIMENSIONS: {activated_dimensions}
AVAILABLE BRAINS: {brain_list}

Your task:
1. Cross-reference all three streams by dimension
2. Identify CONVERGENCES (2-3 streams agree) — these are strong signals
3. Identify DIVERGENCES — these are Say-Do Gaps (most commercially valuable insight)
4. Assign Primary Brain (60-70% influence) and Secondary Brain (20-30% influence) for EACH persona slot
5. Determine persona count (minimum 4, maximum 6)

Return a JSON object with:
- persona_slots: array of objects, each with:
  - slot_number: int
  - primary_brain: string (from the 12 brains list)
  - primary_confidence: float 0.7–0.95
  - secondary_brain: string or null
  - secondary_confidence: float or null
  - reasoning: dict with keys matching brain names, each listing supporting evidence (list of strings)
  - say_do_gap: string or null (the contradiction if streams diverge)
  - key_insight: string (1-sentence persona hypothesis)
- convergences: list of strings (what all/most streams agree on)
- divergences: list of strings (where streams contradict, flagged as Say-Do Gaps)
- evidence_weights: dict with "action_data", "web_evidence", "hq_database" as float weights summing to 1.0
- persona_count: int (4–6)

Be deliberate. Each persona slot must have a DISTINCT primary brain.
No two slots can share the same primary brain unless secondary brains differ substantially.
Return ONLY the JSON object.
"""
    try:
        raw = _llm(prompt, system="You are a master consumer psychologist. Return only valid JSON.")
        result = _parse_json_from_llm(raw)
        logger.info("Stage 4: %d persona slots assigned.", len(result.get("persona_slots", [])))
        return result
    except Exception as e:
        logger.error("Stage 4 failed: %s", e)
        # Fallback: assign four default brains
        return {
            "persona_slots": [
                {"slot_number": 1, "primary_brain": "Optimizer", "primary_confidence": 0.80,
                 "secondary_brain": None, "secondary_confidence": None,
                 "reasoning": {}, "say_do_gap": None, "key_insight": "Research-driven buyer"},
                {"slot_number": 2, "primary_brain": "Connector", "primary_confidence": 0.75,
                 "secondary_brain": None, "secondary_confidence": None,
                 "reasoning": {}, "say_do_gap": None, "key_insight": "Peer-influenced buyer"},
                {"slot_number": 3, "primary_brain": "Pragmatist", "primary_confidence": 0.72,
                 "secondary_brain": None, "secondary_confidence": None,
                 "reasoning": {}, "say_do_gap": None, "key_insight": "Habitual buyer"},
                {"slot_number": 4, "primary_brain": "Explorer", "primary_confidence": 0.70,
                 "secondary_brain": "Hedonist", "secondary_confidence": 0.25,
                 "reasoning": {}, "say_do_gap": None, "key_insight": "Novelty-seeking buyer"},
            ],
            "convergences": [],
            "divergences": [],
            "evidence_weights": {"action_data": 0.45, "web_evidence": 0.35, "hq_database": 0.20},
            "persona_count": 4,
        }


# ---------------------------------------------------------------------------
# Stage 5 — Persona Generation
# ---------------------------------------------------------------------------

def generate_persona(
    slot: dict,
    validated_ro: dict,
    activated_dimensions: list[int],
    all_verdicts: list[dict],
    persona_index: int,
) -> dict:
    """
    Build a complete 10-layer synthetic persona from a brain assignment slot.
    """
    primary = slot.get("primary_brain", "Optimizer")
    secondary = slot.get("secondary_brain")
    brain_def = BRAIN_DEFINITIONS.get(primary, {})
    sec_brain_def = BRAIN_DEFINITIONS.get(secondary, {}) if secondary else {}

    # OCEAN defaults from brain definitions
    ocean = brain_def.get("ocean", {"O": 0.6, "C": 0.7, "E": 0.6, "A": 0.7, "N": 0.35})
    if sec_brain_def:
        sec_ocean = sec_brain_def.get("ocean", {})
        # Blend: 70/30
        ocean = {k: round(ocean.get(k, 0.5) * 0.70 + sec_ocean.get(k, 0.5) * 0.30, 2) for k in ocean}

    dim_names = [DIMENSION_NAMES[d] for d in activated_dimensions if d in DIMENSION_NAMES]
    verdict_summary = [
        v.get("pattern_detected") or v.get("finding_summary") or v.get("key_discussion_themes", [""])[0]
        for v in all_verdicts[:6]
    ]

    prompt = f"""
You are the Persona Generation engine for Synthetic People AI.

RESEARCH CONTEXT:
- Category: {validated_ro.get('category')}
- Sub-category: {validated_ro.get('sub_category')}
- Target Audience: {validated_ro.get('target_audience')}
- Geography: {validated_ro.get('geography')}
- Business Objective: {validated_ro.get('business_objective')}

BRAIN ASSIGNMENT:
- Primary Brain: {primary} ({brain_def.get('schwartz', '')})
  One-liner: "{brain_def.get('one_liner', '')}"
  Core contradiction: "{brain_def.get('contradiction', '')}"
  Feared self: "{brain_def.get('feared_self', '')}"
- Secondary Brain: {secondary or "None"} ({sec_brain_def.get('schwartz', '') if secondary else 'N/A'})
- Primary Confidence: {slot.get('primary_confidence', 0.80)}
- Key Insight: {slot.get('key_insight', '')}
- Say-Do Gap: {slot.get('say_do_gap', 'None identified')}

EVIDENCE SIGNALS:
{json.dumps(verdict_summary, indent=2)}

ACTIVATED DIMENSIONS: {', '.join(dim_names)}

Generate a complete 10-layer persona. Give this persona:
- A vivid archetype title only (e.g., "The Ingredient Decoder", "The Auto-Pilot Buyer") — NO personal name
- All 10 layers populated with category-specific detail

**DEMOGRAPHIC INFERENCE FROM ACTION DATA**

The evidence signals above (Depth Layers) are derived from real action data: purchase
frequency, spend levels, temporal patterns, geographic tier, brand switching, and loyalty
behavior. Using ONLY these behavioral signals (not the RO, not assumptions), infer the
five demographic fields below. These were NOT user-provided — they must be inferred from
the behavioral patterns in the evidence signals.

Inference guidance:
- age_range: High-frequency premium purchases + career-coded signals → 26-40. Trial/novelty-seeking
  + peer-influence signals → 20-35. Family/bulk co-purchase signals → 30-50. Default "26-34" if unclear.
- gender: Only infer if a strong, specific category signal exists (e.g. clearly gendered product
  categories). If signals are balanced or ambiguous, you MUST return "Not specified" with confidence < 0.60.
  Never infer gender from occupation, income, or brain assignment alone.
- education_level: Research-heavy, comparison-driven behavior (Optimizer-style signals) → "Post Graduate"
  or "Graduate". Low information-processing signal → "High School". Default "Graduate" if unclear.
- occupation: Use the generic label "Professional" unless evidence strongly implies a specific role.
  Default "Professional".
- income_range: Derive from spend level/price tier signals in the evidence (e.g. "premium tier",
  "budget tier", average order value). Use buckets appropriate to {validated_ro.get('geography', 'India')}'s
  currency (e.g. LPA for India, USD/year for US). Default to the mid-range bucket if signals are weak.

Confidence calibration (be honest, do not inflate):
- 0.90-1.00: multiple reinforcing signals point the same way
- 0.75-0.89: one clear behavioral pattern supports this value
- 0.60-0.74: plausible but not definitive
- 0.45-0.59: weak/educated guess — for gender this means you must use "Not specified"

Every inferred field needs: value (never null — use the stated default if signal is weak),
confidence (float 0.0-1.0), reasoning (exactly 1 sentence citing the evidence signal used),
source (always the literal string "inferred_from_action_data").

Return a JSON object with:
- demographics_inference: dict with keys age_range, gender, education_level, occupation, income_range,
  each an object {{"value": str, "confidence": float, "reasoning": str, "source": "inferred_from_action_data"}}
- persona_id: "P_{{today_date}}_{{slot_number:03d}}" (use {datetime.now().strftime('%Y%m%d')} and {persona_index:03d})
- persona_title: "The Archetype Name" (e.g., "The Bold Switcher", "The Quiet Loyalist") — title only, no person name
- persona_archetype: same as persona_title
- brain_assignment: dict with primary_brain, primary_confidence, secondary_brain (or null), secondary_confidence (or null)
- layer_1_framework: dict with ocean (O/C/E/A/N floats), schwartz_anchor, mbti_tendency, enneagram (int)
- layer_2_behavioral_dna: dict with decision_making_style, information_source, risk_tolerance, purchase_trigger, brand_relationship, constraint_response
- layer_3_emotional_fingerprint: dict with baseline_emotions (list of 6-8 strings), context_activated (dict of situation→emotion)
- layer_4_dimension_defaults: dict of dimension number (as string) to 0-1 float showing intensity on that dimension
- layer_5_language_voice: dict with vocabulary (string), sentence_structure (string), emotional_expressiveness (string), sample_phrases (list of 4 strings)
- layer_6_contradiction: dict with says (string), does (string), why (string), example (string)
- layer_7_aspiration_fear: dict with hoped_for_self, feared_self, identity_driver
- layer_8_category_modifiers: dict with in_category (string), secondary_brain_activation (string or null)
- layer_9_digital_behavior: dict with platform_preference (list), content_consumption, typical_order_time, device, purchase_trigger_signal
- layer_10_sensory_aesthetic: dict with visual_triggers, auditory_triggers, design_preference, brand_aesthetic
- evidence_traceability: dict with:
  - brain_assignment_sources: list of strings like "DL_001: User switches brands every 6 weeks → Explorer signal"
  - layer_behavioral_sources: string citing which depth layer(s) ground the behavioral DNA (e.g. "DL_003: avg spend Rs 1200, weekday evening pattern")
  - layer_emotional_sources: string citing EB verdicts (e.g. "EB_002: risk-averse language in 60% of threads")
  - layer_voice_sources: string citing representative quotes from EB verdicts
  - layer_digital_sources: string citing action data signals (e.g. "DL_004: peak order time 21:00, COD in Tier-2 cities")
  - overall_confidence: float 0.70–0.95

Use {validated_ro.get('geography', 'India')} context. Be specific, vivid, and psychologically grounded.
Use the brain's core contradiction to build Layer 6.
Return ONLY the JSON object.
"""
    try:
        raw = _llm(prompt, system="You are a consumer psychologist. Return only valid JSON.")
        persona = _parse_json_from_llm(raw)

        # Ensure OCEAN blended values are set correctly
        if "layer_1_framework" in persona and "ocean" in persona["layer_1_framework"]:
            persona["layer_1_framework"]["ocean"] = {
                "openness": ocean.get("O", 0.6),
                "conscientiousness": ocean.get("C", 0.7),
                "extraversion": ocean.get("E", 0.6),
                "agreeableness": ocean.get("A", 0.7),
                "neuroticism": ocean.get("N", 0.35),
            }

        persona = _flatten_demographics_inference(persona)

        logger.info("Stage 5: Persona %d generated — %s", persona_index, persona.get("persona_title", ""))
        return persona
    except Exception as e:
        logger.error("Stage 5 persona %d failed: %s", persona_index, e)
        fallback = {
            "persona_id": f"P_{datetime.now().strftime('%Y%m%d')}_{persona_index:03d}",
            "persona_title": f"The {primary} Archetype",
            "persona_archetype": primary,
            "brain_assignment": {
                "primary_brain": primary,
                "primary_confidence": slot.get("primary_confidence", 0.75),
                "secondary_brain": secondary,
                "secondary_confidence": slot.get("secondary_confidence"),
            },
            "error": str(e),
        }
        return _flatten_demographics_inference(fallback)


_DEMOGRAPHIC_FIELDS = ("age_range", "gender", "education_level", "occupation", "income_range")
_DEMOGRAPHIC_DEFAULTS = {
    "age_range": "26-34",
    "gender": "Not specified",
    "education_level": "Graduate",
    "occupation": "Professional",
    "income_range": "5-10 LPA",
}


def _flatten_demographics_inference(persona: dict) -> dict:
    """
    Normalise persona["demographics_inference"] (per-field {value, confidence,
    reasoning, source} objects) into both:
      - flat top-level values (persona["age_range"] = "26-34", ...) for DB
        storage / backward compatibility with the existing Omi persona shape
      - the full inference objects preserved under demographics_inference for
        API/UI transparency

    Never mutates brain_assignment, OCEAN, or any of the 10 layers.
    Always leaves age_range/occupation/income_range non-null. Forces gender
    to "Not specified" whenever confidence is below 0.60.
    """
    inference = persona.get("demographics_inference")
    if not isinstance(inference, dict):
        inference = {}

    normalised_inference: dict = {}
    for field in _DEMOGRAPHIC_FIELDS:
        entry = inference.get(field)
        if not isinstance(entry, dict):
            entry = {}

        value = entry.get("value") or _DEMOGRAPHIC_DEFAULTS[field]
        try:
            confidence = float(entry.get("confidence", 0.5))
        except (TypeError, ValueError):
            confidence = 0.5
        confidence = max(0.0, min(1.0, confidence))

        if field == "gender" and confidence < 0.60:
            value = "Not specified"

        normalised_inference[field] = {
            "value": value,
            "confidence": round(confidence, 2),
            "reasoning": entry.get("reasoning") or "Insufficient signal — default applied.",
            "source": "inferred_from_action_data",
        }

    persona["demographics_inference"] = normalised_inference
    for field in _DEMOGRAPHIC_FIELDS:
        persona[field] = normalised_inference[field]["value"]

    return persona


def generate_personas_batch(
    brain_assignment_matrix: dict,
    validated_ro: dict,
    activated_dimensions: list[int],
    all_verdicts: list[dict],
    account_tier: str = "tier1",
) -> list[dict]:
    """
    Generate the initial set of personas based on account tier.

    Args:
        account_tier: "free" (2, locked) | "tier1" (2 initial) | "enterprise" (4 initial)
    """
    import concurrent.futures as cf

    slots = brain_assignment_matrix.get("persona_slots", [])
    if not slots:
        slots = [
            {"slot_number": i, "primary_brain": b, "primary_confidence": 0.75,
             "secondary_brain": None, "secondary_confidence": None, "key_insight": ""}
            for i, b in enumerate(["Optimizer", "Connector", "Pragmatist", "Explorer"], start=1)
        ]

    tier_config = TIER_CONFIG.get(account_tier, TIER_CONFIG["tier1"])
    initial_count = tier_config["initial"]

    # Pick the highest-confidence slots up to the tier's initial count
    sorted_slots = sorted(slots, key=lambda s: s.get("primary_confidence", 0), reverse=True)
    selected_slots = sorted_slots[:initial_count]

    logger.info("Tier '%s': generating %d initial persona(s) (max %d).",
                account_tier, len(selected_slots), tier_config["max"])

    personas_map: dict[int, dict] = {}
    with cf.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(generate_persona, slot, validated_ro, activated_dimensions, all_verdicts, i): i
            for i, slot in enumerate(selected_slots, start=1)
        }
        for future in cf.as_completed(futures):
            idx = futures[future]
            try:
                persona = future.result()
                persona["slot_number"] = idx
                personas_map[idx] = persona
            except Exception as e:
                logger.error("Persona %d generation failed: %s", idx, e)

    personas = [personas_map[i] for i in sorted(personas_map.keys())]
    personas = _ensure_unique_titles(personas)
    return personas


def _ensure_unique_titles(personas: list[dict]) -> list[dict]:
    """Ensure every persona has a distinct persona_title."""
    used_titles: set[str] = set()
    for p in personas:
        title = p.get("persona_title", "").strip()
        attempts = 0
        while title in used_titles and attempts < 2:
            brain = p.get("brain_assignment", {}).get("primary_brain", "Unknown")
            prompt = (
                f"Generate ONE new persona archetype title for a {brain} consumer brain. "
                f"It must NOT be any of: {', '.join(list(used_titles)[:5])}. "
                f'Format: "The [Adjective] [Noun]" (e.g., "The Bold Switcher", "The Quiet Loyalist"). '
                f"Return ONLY the title string."
            )
            try:
                title = _llm(prompt).strip().strip('"').strip("'")
            except Exception:
                title = f"The {brain} Archetype {len(used_titles) + 1}"
            p["persona_title"] = title
            attempts += 1
        if not title:
            brain = p.get("brain_assignment", {}).get("primary_brain", "Unknown")
            title = f"The {brain} Type"
            p["persona_title"] = title
        used_titles.add(title)
    return personas


def generate_additional_personas(
    brain_assignment_matrix: dict,
    existing_personas: list[dict],
    validated_ro: dict,
    activated_dimensions: list[int],
    all_verdicts: list[dict],
    account_tier: str,
    count_to_add: int = 2,
) -> list[dict]:
    """
    Generate NEW personas that don't duplicate existing brain combinations.

    Free tier returns [] immediately (expansion not allowed).

    Args:
        brain_assignment_matrix: Full Stage 4 output (stored in pipeline result).
        existing_personas: Already-generated personas to avoid duplicating.
        count_to_add: How many additional personas to generate.
        account_tier: Enforces tier max limit.

    Returns:
        List of new personas only (not including existing ones).
    """
    import concurrent.futures as cf

    tier_config = TIER_CONFIG.get(account_tier, TIER_CONFIG["tier1"])
    max_total = tier_config["max"]
    current_count = len(existing_personas)

    if account_tier == "free":
        logger.info("Free tier: expansion not allowed.")
        return []

    if current_count >= max_total:
        logger.info("Tier '%s': already at max (%d). No expansion possible.", account_tier, max_total)
        return []

    all_slots = brain_assignment_matrix.get("persona_slots", [])

    # Brain combinations already used
    used_combinations: set[tuple] = {
        (
            p.get("brain_assignment", {}).get("primary_brain"),
            p.get("brain_assignment", {}).get("secondary_brain"),
        )
        for p in existing_personas
    }

    # Filter to unused slots, sorted by confidence
    available_slots = sorted(
        [s for s in all_slots
         if (s.get("primary_brain"), s.get("secondary_brain")) not in used_combinations],
        key=lambda s: s.get("primary_confidence", 0),
        reverse=True,
    )

    can_add = min(count_to_add, max_total - current_count, len(available_slots))
    if can_add <= 0:
        logger.info("No available unused brain slots for expansion.")
        return []

    selected_slots = available_slots[:can_add]
    logger.info("Generating %d additional persona(s) for tier '%s' (%d/%d used).",
                can_add, account_tier, current_count, max_total)

    new_personas_map: dict[int, dict] = {}
    with cf.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(
                generate_persona, slot, validated_ro, activated_dimensions,
                all_verdicts, current_count + i
            ): i
            for i, slot in enumerate(selected_slots, start=1)
        }
        for future in cf.as_completed(futures):
            idx = futures[future]
            try:
                persona = future.result()
                persona["slot_number"] = current_count + idx
                new_personas_map[idx] = persona
            except Exception as e:
                logger.error("Additional persona %d generation failed: %s", idx, e)

    new_personas = [new_personas_map[i] for i in sorted(new_personas_map.keys())]
    new_personas = _ensure_unique_titles(new_personas)
    return new_personas


# ---------------------------------------------------------------------------
# Main Pipeline Orchestrator
# ---------------------------------------------------------------------------

def digital_brain_pipeline(
    research_objective_dict: dict,
    action_data_df: pd.DataFrame | None = None,
    account_tier: str = "tier1",  # "free" | "tier1" | "enterprise"
) -> dict:
    """
    Full 5-stage pipeline: RO → Dimensions → [3A|3B|3C] → Synthesis → Personas.

    Stages 3A, 3B, 3C run concurrently via ThreadPoolExecutor.

    Args:
        research_objective_dict: Dict with all 12 RO components.
        action_data_df: Optional pandas DataFrame with transaction records.
        account_tier: Controls persona count. "free" (2, locked) | "tier1" (2, expandable to 8) | "enterprise" (4, expandable to 8).

    Returns:
        Dict with pipeline metadata and list of personas for the given tier.
    """
    started_at = datetime.now(tz=timezone.utc)
    logger.info("=== Digital Brain Pipeline started ===")

    # --- Stage 1 ---
    logger.info("Stage 1: Validating Research Objective…")
    validated_ro = validate_research_objective(research_objective_dict)

    # --- Stage 2 ---
    logger.info("Stage 2: Detecting relevant dimensions…")
    dim_result = detect_relevant_dimensions(validated_ro)
    activated = dim_result["activated_dimensions"]

    # --- Stages 3A, 3B, 3C in parallel ---
    logger.info("Stages 3A/3B/3C: Running three evidence streams in parallel…")

    async def _run_parallel():
        loop = asyncio.get_event_loop()

        fut_3a = loop.run_in_executor(None, scan_action_data, action_data_df if action_data_df is not None else pd.DataFrame(), activated, validated_ro)
        fut_3b = loop.run_in_executor(None, search_evidence_based_web, validated_ro, activated)
        fut_3c = loop.run_in_executor(None, search_hq_database, validated_ro, activated)

        depth_layers, eb_verdicts, hq_verdicts = await asyncio.gather(fut_3a, fut_3b, fut_3c)
        return depth_layers, eb_verdicts, hq_verdicts

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures as cf
            with cf.ThreadPoolExecutor(max_workers=3) as executor:
                fut_3a = executor.submit(scan_action_data, action_data_df if action_data_df is not None else pd.DataFrame(), activated, validated_ro)
                fut_3b = executor.submit(search_evidence_based_web, validated_ro, activated)
                fut_3c = executor.submit(search_hq_database, validated_ro, activated)
                depth_layers = fut_3a.result()
                eb_verdicts = fut_3b.result()
                hq_verdicts = fut_3c.result()
        else:
            depth_layers, eb_verdicts, hq_verdicts = loop.run_until_complete(_run_parallel())
    except RuntimeError:
        import concurrent.futures as cf
        with cf.ThreadPoolExecutor(max_workers=3) as executor:
            fut_3a = executor.submit(scan_action_data, action_data_df if action_data_df is not None else pd.DataFrame(), activated, validated_ro)
            fut_3b = executor.submit(search_evidence_based_web, validated_ro, activated)
            fut_3c = executor.submit(search_hq_database, validated_ro, activated)
            depth_layers = fut_3a.result()
            eb_verdicts = fut_3b.result()
            hq_verdicts = fut_3c.result()

    logger.info("All 3 streams complete: %d DL | %d EB | %d HQ verdicts",
                len(depth_layers), len(eb_verdicts), len(hq_verdicts))

    # --- Stage 4 ---
    logger.info("Stage 4: Master Brain synthesis…")
    brain_matrix = master_brain_synthesis(depth_layers, eb_verdicts, hq_verdicts, activated)

    # --- Stage 5 ---
    logger.info("Stage 5: Generating personas…")
    all_verdicts = depth_layers + eb_verdicts + hq_verdicts
    personas = generate_personas_batch(brain_matrix, validated_ro, activated, all_verdicts, account_tier)

    finished_at = datetime.now(tz=timezone.utc)
    duration_s = (finished_at - started_at).total_seconds()

    tier_config = TIER_CONFIG.get(account_tier, TIER_CONFIG["tier1"])
    total_slots = len(brain_matrix.get("persona_slots", []))

    result = {
        "pipeline_metadata": {
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "duration_seconds": round(duration_s, 1),
            "model_used": MODEL,
            "ro_category": validated_ro.get("category"),
            "dimensions_activated": activated,
            "evidence_counts": {
                "depth_layers": len(depth_layers),
                "eb_verdicts": len(eb_verdicts),
                "hq_verdicts": len(hq_verdicts),
            },
            "account_tier": account_tier,
            "tier_config": tier_config,
            "personas_generated": len(personas),
            "personas_available_for_expansion": max(0, min(tier_config["max"], total_slots) - len(personas)),
            "expansion_allowed": account_tier != "free",
        },
        "stage_1_validated_ro": validated_ro,
        "stage_2_dimensions": dim_result,
        "stage_3a_depth_layers": depth_layers,
        "stage_3b_eb_verdicts": eb_verdicts,
        "stage_3c_hq_verdicts": hq_verdicts,
        "stage_4_brain_matrix": brain_matrix,
        "stage_5_personas": personas,
    }

    logger.info("=== Pipeline complete in %.1fs — %d personas generated ===",
                duration_s, len(personas))
    return result


# ---------------------------------------------------------------------------
# Standalone entrypoint for testing
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import os
    import sys

    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

    # Sample AJIO-style transaction data (20 rows, apparel category)
    SAMPLE_ROWS = [
        {"accountEmailId": "3861848756", "orderTime": 1728044580000, "totalCharged": 543.0, "city": "Mumbai", "state": "Maharashtra", "productItems": '[{"priceName": "H&M Slim Fit Crew Neck T-Shirt", "price": 543}]', "paymentMethod": "UPI", "receivedDate": "2025-10-04", "account_created_at": "2022-01-15"},
        {"accountEmailId": "3861848756", "orderTime": 1730719380000, "totalCharged": 899.0, "city": "Mumbai", "state": "Maharashtra", "productItems": '[{"priceName": "Teamspirit Round Neck T-Shirt Pack of 3", "price": 899}]', "paymentMethod": "UPI", "receivedDate": "2025-11-04", "account_created_at": "2022-01-15"},
        {"accountEmailId": "3861848756", "orderTime": 1733397780000, "totalCharged": 1299.0, "city": "Pune", "state": "Maharashtra", "productItems": '[{"priceName": "John Players Regular Fit Casual Shirt", "price": 1299}]', "paymentMethod": "Credit Card", "receivedDate": "2025-12-05", "account_created_at": "2022-01-15"},
        {"accountEmailId": "9847362510", "orderTime": 1729545780000, "totalCharged": 2499.0, "city": "Bangalore", "state": "Karnataka", "productItems": '[{"priceName": "PUMA Essential Logo T-Shirt", "price": 2499}]', "paymentMethod": "Debit Card", "receivedDate": "2025-10-21", "account_created_at": "2020-06-10"},
        {"accountEmailId": "9847362510", "orderTime": 1732137780000, "totalCharged": 2799.0, "city": "Bangalore", "state": "Karnataka", "productItems": '[{"priceName": "PUMA Graphic Tee", "price": 2799}]', "paymentMethod": "Debit Card", "receivedDate": "2025-11-20", "account_created_at": "2020-06-10"},
        {"accountEmailId": "5512934867", "orderTime": 1728126180000, "totalCharged": 399.0, "city": "Dimapur", "state": "Nagaland", "productItems": '[{"priceName": "Eyebogler Regular Fit T-shirt", "price": 399}]', "paymentMethod": "COD", "receivedDate": "2025-10-05", "account_created_at": "2023-03-22"},
        {"accountEmailId": "5512934867", "orderTime": 1730887380000, "totalCharged": 399.0, "city": "Dimapur", "state": "Nagaland", "productItems": '[{"priceName": "Eyebogler Regular Fit T-shirt", "price": 399}]', "paymentMethod": "COD", "receivedDate": "2025-11-06", "account_created_at": "2023-03-22"},
        {"accountEmailId": "5512934867", "orderTime": 1733479380000, "totalCharged": 399.0, "city": "Dimapur", "state": "Nagaland", "productItems": '[{"priceName": "Eyebogler Regular Fit T-shirt", "price": 399}]', "paymentMethod": "COD", "receivedDate": "2025-12-06", "account_created_at": "2023-03-22"},
        {"accountEmailId": "7723841059", "orderTime": 1729459380000, "totalCharged": 1799.0, "city": "Delhi", "state": "Delhi", "productItems": '[{"priceName": "RAYMOND Slim Fit Shirt", "price": 1799}]', "paymentMethod": "Net Banking", "receivedDate": "2025-10-20", "account_created_at": "2019-11-05"},
        {"accountEmailId": "7723841059", "orderTime": 1731273780000, "totalCharged": 599.0, "city": "Delhi", "state": "Delhi", "productItems": '[{"priceName": "Spykar Slim Fit Jeans", "price": 599}]', "paymentMethod": "UPI", "receivedDate": "2025-11-11", "account_created_at": "2019-11-05"},
        {"accountEmailId": "2293746182", "orderTime": 1728557580000, "totalCharged": 1149.0, "city": "Hyderabad", "state": "Telangana", "productItems": '[{"priceName": "H&M Wide Leg Trousers", "price": 1149}]', "paymentMethod": "UPI", "receivedDate": "2025-10-10", "account_created_at": "2021-08-14"},
        {"accountEmailId": "2293746182", "orderTime": 1731618780000, "totalCharged": 1499.0, "city": "Hyderabad", "state": "Telangana", "productItems": '[{"priceName": "H&M Oversized T-shirt", "price": 1499}]', "paymentMethod": "UPI", "receivedDate": "2025-11-15", "account_created_at": "2021-08-14"},
        {"accountEmailId": "8834910273", "orderTime": 1729127580000, "totalCharged": 3499.0, "city": "Pune", "state": "Maharashtra", "productItems": '[{"priceName": "PUMA Training Jacket", "price": 3499}]', "paymentMethod": "Credit Card", "receivedDate": "2025-10-17", "account_created_at": "2020-02-28"},
        {"accountEmailId": "8834910273", "orderTime": 1731805980000, "totalCharged": 499.0, "city": "Pune", "state": "Maharashtra", "productItems": '[{"priceName": "Teamspirit Polo T-Shirt", "price": 499}]', "paymentMethod": "UPI", "receivedDate": "2025-11-17", "account_created_at": "2020-02-28"},
        {"accountEmailId": "4456782930", "orderTime": 1729804380000, "totalCharged": 849.0, "city": "Vadodara", "state": "Gujarat", "productItems": '[{"priceName": "John Players Slim Fit Jeans", "price": 849}]', "paymentMethod": "COD", "receivedDate": "2025-10-25", "account_created_at": "2022-07-19"},
        {"accountEmailId": "4456782930", "orderTime": 1732482780000, "totalCharged": 1099.0, "city": "Vadodara", "state": "Gujarat", "productItems": '[{"priceName": "RAYMOND Slim Fit Casual Pant", "price": 1099}]', "paymentMethod": "UPI", "receivedDate": "2025-11-25", "account_created_at": "2022-07-19"},
        {"accountEmailId": "6612847390", "orderTime": 1728816780000, "totalCharged": 699.0, "city": "Chennai", "state": "Tamil Nadu", "productItems": '[{"priceName": "Spykar Slim Fit T-shirt", "price": 699}]', "paymentMethod": "UPI", "receivedDate": "2025-10-13", "account_created_at": "2023-01-09"},
        {"accountEmailId": "6612847390", "orderTime": 1731495180000, "totalCharged": 599.0, "city": "Chennai", "state": "Tamil Nadu", "productItems": '[{"priceName": "Eyebogler Printed T-shirt", "price": 599}]', "paymentMethod": "COD", "receivedDate": "2025-11-13", "account_created_at": "2023-01-09"},
        {"accountEmailId": "1190283746", "orderTime": 1730028780000, "totalCharged": 1899.0, "city": "Kolkata", "state": "West Bengal", "productItems": '[{"priceName": "H&M Relaxed Fit Shirt", "price": 1899}]', "paymentMethod": "Net Banking", "receivedDate": "2025-10-27", "account_created_at": "2018-05-30"},
        {"accountEmailId": "3374910856", "orderTime": 1730460780000, "totalCharged": 2199.0, "city": "Ahmedabad", "state": "Gujarat", "productItems": '[{"priceName": "PUMA Sport Lifestyle T-Shirt", "price": 2199}]', "paymentMethod": "UPI", "receivedDate": "2025-11-01", "account_created_at": "2021-04-16"},
    ]

    sample_df = pd.DataFrame(SAMPLE_ROWS)

    sample_ro = {
        "category": "Apparel - Men's T-shirts & Casual Wear",
        "sub_category": "Premium cotton t-shirts and casual shirts",
        "target_audience": "Men 25-45, urban, middle-to-upper income, fashion-conscious",
        "geography": "India, Tier 1 cities (Mumbai, Bangalore, Pune, Delhi)",
        "business_objective": "Understand what drives premium brand adoption in casual wear category",
        "research_type": "Qualitative",
        "key_questions": "Why do men switch from budget brands to premium? What role do brand reputation and quality play? How much do peer recommendations influence the decision?",
        "hypotheses": "Quality and durability are primary drivers, not just brand aspiration. Peer recommendations have stronger impact than advertising.",
        "competitive_context": "H&M, Teamspirit, PUMA, RAYMOND, John Players, Blissclub, Eyebogler, Spykar",
        "time_frame": "Last 6 months of purchase behavior (Oct 2025 onwards)",
        "constraints": "Minimum 4 personas, maximum 6, deliver in 1 day",
        "probes": "Brand switching triggers and frequency, Price tolerance when buying premium vs budget, Influence of friends vs advertising in decision-making, How fit and comfort factor into the purchase",
    }

    result = digital_brain_pipeline(sample_ro, sample_df)

    # Print summary
    print("\n" + "="*70)
    print("DIGITAL BRAIN PIPELINE — COMPLETE")
    print("="*70)
    meta = result["pipeline_metadata"]
    print(f"Duration: {meta['duration_seconds']}s")
    print(f"Dimensions activated: {meta['dimensions_activated']}")
    print(f"Evidence: {meta['evidence_counts']}")
    print(f"Personas generated: {len(result['stage_5_personas'])}")
    print()
    for p in result["stage_5_personas"]:
        ba = p.get("brain_assignment", {})
        print(f"  [{p.get('slot_number', '?')}] {p.get('persona_title', 'Unknown')} "
              f"| {ba.get('primary_brain')} ({ba.get('primary_confidence', 0):.0%})"
              + (f" + {ba.get('secondary_brain')}" if ba.get("secondary_brain") else ""))

    # Write output to file
    out_path = os.path.join(os.path.dirname(__file__), "digital_brain_output.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False, default=str)
    print(f"\nFull output written to: {out_path}")
