"""Question affect features: framing, stakes, and affect relevance.

Tagging is rule-based and deterministic so a question always produces the
same features for a given TAGGER_VERSION. Features are computed once per
question and cached in neuro_question_feature keyed by question id; call
sites that only hold question text use tag_question directly, which is cheap
enough to run inline.
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

TAGGER_VERSION = "lex-0.1.0"

_WORD = re.compile(r"[a-z']+")

_PROJECTIVE_MARKERS = (
    "imagine", "suppose", "picture yourself", "if you could", "pretend",
    "what would someone", "a friend of yours", "people like you",
)
_BEHAVIORAL_MARKERS = (
    "last time", "walk me through", "describe a time", "tell me about a time",
    "how often", "when did you last", "what did you do", "recently",
    "typically do", "usually do",
)
_INDIRECT_MARKERS = (
    "some people", "others say", "many people", "in general",
    "would you say people", "how do people",
)
_DIRECT_MARKERS = (
    "do you", "would you", "how do you feel", "what do you think",
    "why do you", "are you", "have you", "rate", "how likely are you",
)

_HIGH_STAKES_TERMS = (
    "money", "afford", "debt", "salary", "income", "spend", "cost", "price",
    "health", "family", "children", "marriage", "partner", "guilt", "guilty",
    "ashamed", "shame", "embarrass", "fail", "failure", "risk", "afraid",
    "fear", "worry", "secret", "honest", "trust", "judge",
)
_AFFECT_TERMS = (
    "feel", "feeling", "felt", "emotion", "love", "hate", "enjoy", "worry",
    "excite", "frustrat", "anger", "angry", "happy", "sad", "anxious",
    "comfort", "uncomfort", "stress", "proud", "guilt", "regret", "wish",
    "hope", "fear", "annoyed", "satisf", "disappoint",
)


def _contains_any(text: str, markers: tuple[str, ...]) -> bool:
    return any(m in text for m in markers)


def _term_ratio(text: str, terms: tuple[str, ...]) -> float:
    words = _WORD.findall(text)
    if not words:
        return 0.0
    hits = sum(1 for w in words for t in terms if w.startswith(t))
    return min(1.0, hits / max(4, len(words)) * 4)


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

    stakes = 0.3 + 0.7 * _term_ratio(lowered, _HIGH_STAKES_TERMS)
    affect_relevance = 0.3 + 0.7 * _term_ratio(lowered, _AFFECT_TERMS)
    # Second-person direct questions carry more personal stake than
    # generalised ones.
    if framing == Framing.DIRECT and " you" in f" {lowered}":
        stakes = min(1.0, stakes + 0.1)
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
