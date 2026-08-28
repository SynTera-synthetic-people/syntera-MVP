"""Rule-based question tagging (framing, stakes, affect relevance),
deterministic and versioned; cached per question id.
"""
from __future__ import annotations

import logging
import re
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.db import async_engine
from app.models.neuro import NeuroQuestionFeature
from app.neuro.engine_version import ENGINE_VERSION
from app.neuro.types import Framing, QuestionAffectFeatures

logger = logging.getLogger(__name__)

TAGGER_VERSION = "lex-0.2.0"

_WORD = re.compile(r"[a-z']+")

_PROJECTIVE_MARKERS = (
    "imagine", "suppose", "picture yourself", "if you could", "pretend",
    "what would someone", "a friend of yours", "people like you",
    "someone like you", "hypothetically",
)
_BEHAVIORAL_MARKERS = (
    "last time", "walk me through", "describe a time", "tell me about a time",
    "how often", "how frequently", "when did you last", "what did you do",
    "typically do", "usually do", "have you used", "have you ever",
    "did you", "describe a specific", "what prevents you",
)
_INDIRECT_MARKERS = (
    "some people", "others say", "many people", "in general",
    "would you say people", "how do people", "most users", "other users",
)
_DIRECT_MARKERS = (
    "do you", "would you", "how do you feel", "what do you think",
    "why do you", "are you", "have you", "rate", "how likely are you",
    "make you feel", "to what extent do you", "what emotions do you",
    "how important is", "how frustrating", "which aspect", "your ",
)

# Questions that classify the respondent rather than probe them. Routine in a
# survey and low emotional stake even when the nominal topic is sensitive, so
# they are capped below the evaluative band unless they also carry a
# self-judgement term.
_DEMOGRAPHIC_MARKERS = (
    "what is your age", "which city", "what is your current occupation",
    "highest level of education", "annual income", "marital status",
    "do you have any children", "what is your gender", "household size",
)
_DEMOGRAPHIC_STAKES_CAP = 0.5

# Severity tiers. Stakes take the strongest tier present rather than a
# density: a long question naming one self-judgement term is high-stakes, and
# a short factual one is not made high-stakes by brevity.
_STAKES_TIERS = (
    (0.95, (
        "shame", "ashamed", "guilt", "guilty", "judged", "judge", "judging",
        "embarrass", "humiliat", "failure", "failed", "inadequate",
        "secret", "lied", "lying", "hide", "hiding",
    )),
    (0.75, (
        "afraid", "fear", "anxious", "anxiety", "worry", "worried", "stress",
        "stressed", "regret", "avoid", "avoiding", "quit", "quitting",
        "abandon", "give up", "let myself down", "disappoint",
    )),
    (0.55, (
        "money", "afford", "debt", "salary", "income", "spend", "cost",
        "price", "health", "family", "children", "marriage", "partner",
        "religion", "weight", "body", "trust", "honest",
    )),
)

_AFFECT_STRONG = (
    "make you feel", "makes you feel", "how do you feel", "what emotions",
    "feelings", "emotionally", "how frustrating", "what feelings",
)
_AFFECT_TERMS = (
    "feel", "feeling", "felt", "emotion", "love", "hate", "enjoy", "worry",
    "excite", "frustrat", "anger", "angry", "happy", "sad", "anxious",
    "comfort", "uncomfort", "stress", "proud", "guilt", "regret", "wish",
    "hope", "fear", "annoyed", "satisf", "disappoint", "judged", "shame",
    "motivat", "confident", "overwhelm",
)


def _contains_any(text: str, markers: tuple[str, ...]) -> bool:
    return any(m in text for m in markers)


def _tier_score(text: str) -> float:
    """Strongest severity tier present, nudged up when several terms from
    that tier appear."""
    words = _WORD.findall(text)
    for weight, terms in _STAKES_TIERS:
        hits = sum(1 for w in words for t in terms if w.startswith(t))
        hits += sum(1 for t in terms if " " in t and t in text)
        if hits:
            return min(1.0, weight + 0.05 * (hits - 1))
    return 0.0


def _affect_score(text: str) -> float:
    if _contains_any(text, _AFFECT_STRONG):
        return 0.9
    words = _WORD.findall(text)
    hits = sum(1 for w in words for t in _AFFECT_TERMS if w.startswith(t))
    if hits >= 2:
        return 0.75
    if hits == 1:
        return 0.6
    return 0.3


def tag_question(text: str, question_id: Optional[str] = None) -> QuestionAffectFeatures:
    """Deterministic features for one question text."""
    from app.neuro.engine import question_text_hash

    lowered = (text or "").strip().lower()

    if _contains_any(lowered, _PROJECTIVE_MARKERS):
        framing = Framing.PROJECTIVE
    elif _contains_any(lowered, _BEHAVIORAL_MARKERS):
        framing = Framing.BEHAVIORAL
    elif _contains_any(lowered, _INDIRECT_MARKERS):
        framing = Framing.INDIRECT
    elif _contains_any(lowered, _DIRECT_MARKERS):
        framing = Framing.DIRECT
    else:
        framing = Framing.UNKNOWN

    tier = _tier_score(lowered)
    stakes = 0.3 + 0.7 * tier
    affect_relevance = _affect_score(lowered)

    if _contains_any(lowered, _DEMOGRAPHIC_MARKERS) and tier < 0.9:
        stakes = min(stakes, _DEMOGRAPHIC_STAKES_CAP)
    if framing == Framing.DIRECT and " you" in f" {lowered}":
        stakes = min(1.0, stakes + 0.05)
    if framing == Framing.INDIRECT:
        stakes = max(0.0, stakes - 0.1)

    return QuestionAffectFeatures(
        question_id=question_id,
        text_hash=question_text_hash(text),
        framing=framing,
        stakes=round(stakes, 4),
        affect_relevance=round(affect_relevance, 4),
    )


async def get_or_compute(
    question_id: str, question_source: str, text: str
) -> QuestionAffectFeatures:
    """Cached features for a question with a known id. The cache row stores
    the serialised features plus the tagger version; a version change makes
    the row stale and it is recomputed."""
    async with AsyncSession(async_engine) as session:
        row = (
            await session.execute(
                select(NeuroQuestionFeature).where(
                    NeuroQuestionFeature.question_id == question_id
                )
            )
        ).scalars().first()
        if row is not None and row.neuro_version == TAGGER_VERSION:
            try:
                return QuestionAffectFeatures.model_validate(row.features)
            except Exception:
                logger.warning(
                    "Unreadable cached question features; recomputing "
                    "[question_id=%s]", question_id
                )

    features = tag_question(text, question_id=question_id)
    async with AsyncSession(async_engine) as session:
        async with session.begin():
            row = (
                await session.execute(
                    select(NeuroQuestionFeature).where(
                        NeuroQuestionFeature.question_id == question_id
                    )
                )
            ).scalars().first()
            payload = features.model_dump(mode="json")
            if row is None:
                session.add(
                    NeuroQuestionFeature(
                        question_id=question_id,
                        question_source=question_source,
                        features=payload,
                        neuro_version=TAGGER_VERSION,
                    )
                )
            else:
                row.features = payload
                row.neuro_version = TAGGER_VERSION
                session.add(row)
    return features
