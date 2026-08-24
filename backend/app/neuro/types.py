"""Shared value types for the neuroscience layer.

Every model here is frozen: a computed state is a value, and a new turn
produces a new state rather than mutating an old one. State rows are stored
as JSON (to_state_json / from_state_json round-trip exactly), so within a
schema version fields may be appended but never renamed, removed or
reordered.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Belief distributions carry at most two components (unimodal, or bimodal for
# a persona genuinely of two minds). Consumers are written against this bound,
# so changing it is a schema-version change, not an edit.
MAX_COMPONENTS: int = 2

NEURO_SCHEMA_VERSION: str = "1.3.0"

# Fixed order of the numeric feature vector exported per state. Append-only
# within a schema version.
FEATURE_VECTOR_FIELDS: tuple[str, ...] = (
    "valence",
    "arousal",
    "direction",
    "primary_spread",
    "confidence",
    "abstain",
    "bimodal",
    "turn_index",
    "goal_relevance",
    "goal_congruence",
    "certainty",
    "coping_potential",
    "norm_compatibility",
    "say_do_gap",
    "confidence_density",
    "confidence_certainty",
    "confidence_evidence",
)


class Framing(str, Enum):
    """How a question is posed. Drives the presentation weight once
    arbitration lands; UNKNOWN until question tagging fills it."""
    DIRECT = "direct"
    INDIRECT = "indirect"
    PROJECTIVE = "projective"
    BEHAVIORAL = "behavioral"
    UNKNOWN = "unknown"


class Surface(str, Enum):
    """Which product surface produced a computation."""
    INTERVIEW = "interview"
    REBUTTAL = "rebuttal"
    SURVEY_SIMULATION = "survey_simulation"
    ARTIFACT_RESPONSE = "artifact_response"


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class CoreAffect(_Frozen):
    """A position in the three-dimensional affect space.

    valence:   negative..positive
    arousal:   calm..activated
    direction: avoidance..approach — the axis that separates, e.g., anger
               from fear, which share valence and arousal but predict
               opposite behaviour.
    """
    valence: float = Field(ge=-1.0, le=1.0)
    arousal: float = Field(ge=-1.0, le=1.0)
    direction: float = Field(ge=-1.0, le=1.0)

    @classmethod
    def neutral(cls) -> "CoreAffect":
        return cls(valence=0.0, arousal=0.0, direction=0.0)


class BeliefComponent(_Frozen):
    """One component of the belief distribution over response modes.

    spread is an isotropic std-dev summary; the full covariance is carried in
    state JSON once the substrate produces one (appending is allowed within a
    schema version).
    """
    weight: float = Field(ge=0.0, le=1.0)
    mean: CoreAffect
    spread: float = Field(ge=0.0)


class Provenance(_Frozen):
    """Versions that produced a state; recorded on every row so any result
    can be traced to the exact code and artifacts behind it."""
    model_version: str
    artifact_version: str
    renderer_version: str
    feature_schema_version: str = NEURO_SCHEMA_VERSION
    abstention_threshold: Optional[float] = None


class AffectiveState(_Frozen):
    """The layer's output for one persona, one question, one turn.

    `components` is the authoritative representation. `summary` is a single
    position kept for charts and reporting; it cannot express bimodality and
    is never what response text should be generated from. `bimodal` is set
    only when two distinct components exist — never inferred from the summary.
    `rendered` is the renderer's text block for this state; it is stored for
    traceability and must not be used as a model feature. `expressed` and
    `say_do_gap` come from arbitration: what the persona would show, and how
    far that sits from what it feels.
    """
    components: tuple[BeliefComponent, ...]
    summary: CoreAffect
    bimodal: bool = False
    confidence: float = Field(ge=0.0, le=1.0)
    abstain: bool = False
    turn_index: int = Field(ge=0)
    computed_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    provenance: Provenance
    appraisal_scores: Optional[dict[str, float]] = None
    rendered: Optional[str] = None
    expressed: Optional[CoreAffect] = None
    say_do_gap: Optional[float] = None
    # The three multiplicative terms behind `confidence`.
    confidence_terms: Optional[dict[str, float]] = None
    confidence_terms: Optional[dict[str, float]] = None
    # Turn index of the state this one carried over from; None when the turn
    # started fresh (no previous state, or zero persistence).
    carried_from_turn: Optional[int] = None

    @field_validator("components")
    @classmethod
    def _cap_components(cls, v: tuple[BeliefComponent, ...]):
        if not (1 <= len(v) <= MAX_COMPONENTS):
            raise ValueError(
                f"AffectiveState carries 1..{MAX_COMPONENTS} components, got {len(v)}"
            )
        return v

    @model_validator(mode="after")
    def _bimodal_consistency(self):
        if self.bimodal and len(self.components) < 2:
            raise ValueError("bimodal=True requires two components")
        return self

    def to_state_json(self) -> dict:
        return self.model_dump(mode="json")

    @classmethod
    def from_state_json(cls, data: dict) -> "AffectiveState":
        return cls.model_validate(data)

    def to_feature_vector(self) -> list[float]:
        """Numeric features in the fixed FEATURE_VECTOR_FIELDS order. Missing
        appraisal scores read as 0.5 (mid-scale) so the vector length never
        varies within a schema version."""
        scores = self.appraisal_scores or {}
        terms = self.confidence_terms or {}
        return [
            self.summary.valence,
            self.summary.arousal,
            self.summary.direction,
            self.components[0].spread,
            self.confidence,
            1.0 if self.abstain else 0.0,
            1.0 if self.bimodal else 0.0,
            float(self.turn_index),
            scores.get("goal_relevance", 0.5),
            scores.get("goal_congruence", 0.5),
            scores.get("certainty", 0.5),
            scores.get("coping_potential", 0.5),
            scores.get("norm_compatibility", 0.5),
            self.say_do_gap if self.say_do_gap is not None else 0.0,
            terms.get("density", 1.0),
            terms.get("certainty", 1.0),
            terms.get("evidence", 1.0),
        ]


class PersonaAffectParams(_Frozen):
    """Per-persona affect parameters.

    Derived from persona records by app.neuro.persona_params; never produced
    free-form by an LLM, so presence and ranges are guaranteed here rather
    than at read time.
    """
    persona_id: str
    baseline: CoreAffect = Field(default_factory=CoreAffect.neutral)
    spread: float = Field(default=0.3, ge=0.0)
    persistence: float = Field(default=0.0, ge=0.0, le=1.0)
    granularity: float = Field(default=0.5, ge=0.0, le=1.0)
    presentation_anchor: Optional[CoreAffect] = None
    # None means no evidence information on the record; 0 means the record
    # explicitly carries an empty evidence set. Confidence treats these
    # differently.
    evidence_n: Optional[int] = Field(default=None, ge=0)
    category_familiarity: dict[str, float] = Field(default_factory=dict)
    category_priority: tuple[str, ...] = ()

    @field_validator("category_familiarity")
    @classmethod
    def _familiarity_range(cls, v: dict[str, float]):
        for k, f in v.items():
            if not (0.0 <= f <= 1.0):
                raise ValueError(f"category_familiarity[{k!r}]={f} outside [0,1]")
        return v


class QuestionAffectFeatures(_Frozen):
    """Per-question affect metadata, produced by app.neuro.question_features
    and cached in neuro_question_feature when the question id is known."""
    question_id: Optional[str] = None
    text_hash: str = ""
    framing: Framing = Framing.UNKNOWN
    stakes: float = Field(default=0.5, ge=0.0, le=1.0)
    affect_relevance: float = Field(default=0.5, ge=0.0, le=1.0)
    target_dimensions: tuple[str, ...] = ()
    categories: tuple[str, ...] = ()
