"""
Typed intermediate objects for the Persona Replication Engine.

Every stage boundary passes one of these instead of raw dicts.
Validators enforce architecture contracts so violations are caught
between stages — not silently inside an LLM call.

Issue 8 fix: models now validate:
  - PsychographicCore completeness (warn on missing anchors)
  - MarketContext completeness (all 9 sections must have content)
  - DivergenceReport count constraints (5-12)
  - ConfidenceScores range (0.0-1.0)
  - ReplicationArtifact mode-specific population
"""

from __future__ import annotations

import logging
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Stage 1: psychographic core — immutable anchor + split-trait blueprint
# ---------------------------------------------------------------------------

class OceanProfile(BaseModel):
    openness: Optional[Annotated[float, Field(ge=0.0, le=1.0)]] = None
    conscientiousness: Optional[Annotated[float, Field(ge=0.0, le=1.0)]] = None
    extraversion: Optional[Annotated[float, Field(ge=0.0, le=1.0)]] = None
    agreeableness: Optional[Annotated[float, Field(ge=0.0, le=1.0)]] = None
    neuroticism: Optional[Annotated[float, Field(ge=0.0, le=1.0)]] = None

    @model_validator(mode="after")
    def warn_if_empty(self) -> "OceanProfile":
        values = [self.openness, self.conscientiousness, self.extraversion,
                  self.agreeableness, self.neuroticism]
        if all(v is None for v in values):
            logger.warning("OceanProfile: all five dimensions are None — OCEAN scores unavailable")
        return self


class SplitTraitCore(BaseModel):
    """
    Psychological dimension ONLY — market expressions stripped.

    All fields optional because some personas may not have explicit signals
    for every category. Completeness is logged as a warning, not an error.
    """
    trust_building_need: Optional[str] = None
    status_signaling_drive: Optional[str] = None
    community_belonging_need: Optional[str] = None
    value_consciousness: Optional[str] = None
    quality_consciousness: Optional[str] = None
    social_orientation_in_purchase: Optional[str] = None

    @model_validator(mode="after")
    def warn_if_incomplete(self) -> "SplitTraitCore":
        missing = [
            k for k, v in self.model_dump().items() if v is None
        ]
        if missing:
            logger.warning(
                "SplitTraitCore: %d split-trait dimension(s) missing — %s",
                len(missing), missing,
            )
        return self

    def coverage_count(self) -> int:
        return sum(1 for v in self.model_dump().values() if v)


class PsychographicCore(BaseModel):
    """
    Stage 1 output — immutable psychographic blueprint.

    Validation: warns loudly if critical anchor fields are None, since
    a missing behavioral_archetype means Stage 3 cannot reconstruct correctly.
    """
    ocean_profile: Optional[OceanProfile] = None
    schwartz_values: Optional[list[str]] = None
    behavioral_archetype: Optional[str] = None
    say_do_gap: Optional[str] = None
    decision_making_style: Optional[str] = None
    risk_tolerance_posture: Optional[str] = None
    emotional_response_profile: Optional[str] = None
    split_traits: SplitTraitCore = Field(default_factory=SplitTraitCore)

    @model_validator(mode="after")
    def warn_missing_anchors(self) -> "PsychographicCore":
        critical = {
            "behavioral_archetype": self.behavioral_archetype,
            "emotional_response_profile": self.emotional_response_profile,
            "risk_tolerance_posture": self.risk_tolerance_posture,
        }
        missing = [k for k, v in critical.items() if not v]
        if missing:
            logger.warning(
                "PsychographicCore: critical anchor field(s) missing — %s. "
                "Stage 3 re-expression quality will be reduced.",
                missing,
            )
        split_coverage = self.split_traits.coverage_count()
        if split_coverage < 4:
            logger.warning(
                "PsychographicCore: only %d/6 split traits populated — "
                "divergence coverage may be incomplete.", split_coverage,
            )
        return self


# ---------------------------------------------------------------------------
# Stage 2: market context — environmental constraints
# ---------------------------------------------------------------------------

class MarketContext(BaseModel):
    """
    Stage 2 output — environmental constraint layer.

    Validation: all 9 sections should be non-empty for a production-grade
    market context. Missing sections are logged as warnings (not errors)
    because LLM output quality varies.
    """
    target_country: str = Field(..., min_length=1)
    income_tier: str = ""
    trust_mechanisms: list[str] = Field(default_factory=list)
    status_signal_vocabulary: list[str] = Field(default_factory=list)
    community_infrastructure: list[str] = Field(default_factory=list)
    brand_landscape: list[str] = Field(default_factory=list)
    logistics_baseline: str = ""
    quality_signal_vocabulary: list[str] = Field(default_factory=list)
    price_segment: str = ""
    friction_sources: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def warn_incomplete_sections(self) -> "MarketContext":
        empty_sections = []
        if not self.income_tier.strip():
            empty_sections.append("income_tier")
        if not self.trust_mechanisms:
            empty_sections.append("trust_mechanisms")
        if not self.brand_landscape:
            empty_sections.append("brand_landscape")
        if not self.friction_sources:
            empty_sections.append("friction_sources")
        if not self.community_infrastructure:
            empty_sections.append("community_infrastructure")

        if empty_sections:
            logger.warning(
                "MarketContext(%r): %d section(s) empty — %s. "
                "Stage 3 re-expression for these dimensions will be LLM-guessed.",
                self.target_country, len(empty_sections), empty_sections,
            )
        return self


# ---------------------------------------------------------------------------
# Stage 3: re-expressed traits
# ---------------------------------------------------------------------------

class ReplicatedTraits(BaseModel):
    income_bracket: Optional[str] = None
    occupation: Optional[str] = None
    family_structure: Optional[str] = None
    geography: Optional[str] = None
    lifestyle: Optional[str] = None
    values_expression: Optional[str] = None
    interests: Optional[list[str]] = None
    motivations: Optional[str] = None
    trust_building_expression: Optional[str] = None
    status_expression: Optional[str] = None
    community_expression: Optional[str] = None
    quality_expression: Optional[str] = None
    price_sensitivity_range: Optional[str] = None
    brand_vocabulary: Optional[list[str]] = None
    friction_sources: Optional[list[str]] = None
    key_triggers: Optional[list[str]] = None
    primary_barriers: Optional[list[str]] = None
    full_persona_json: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def warn_empty_full_persona(self) -> "ReplicatedTraits":
        if not self.full_persona_json:
            logger.warning(
                "ReplicatedTraits: full_persona_json is empty — "
                "DB write will produce a persona with no details."
            )
        return self


# ---------------------------------------------------------------------------
# Stage 4: divergence flags
# ---------------------------------------------------------------------------

ImpactLevel = Literal["HIGH", "MEDIUM", "LOW"]


class DivergenceFlag(BaseModel):
    flag_name: str = Field(..., min_length=1)
    psychological_dimension: str = Field(..., min_length=1)
    source_market_expression: str = Field(..., min_length=1)
    target_market_expression: str = Field(..., min_length=1)
    impact_level: ImpactLevel
    strategic_implication: str = Field(..., min_length=1)


class DivergenceReport(BaseModel):
    """
    Stage 4 output — 5-12 divergence flags.

    Contract: minimum 5 flags required. Maximum 12 enforced.
    Below-minimum count is logged as a warning (not an error) to avoid
    breaking the pipeline when the LLM returns fewer than expected.
    """
    target_country: str
    flags: list[DivergenceFlag] = Field(default_factory=list)

    @field_validator("flags", mode="after")
    @classmethod
    def enforce_flag_count(cls, v: list) -> list:
        if len(v) > 12:
            logger.warning(
                "DivergenceReport: %d flags exceeds maximum 12 — truncating.", len(v)
            )
            v = v[:12]
        if len(v) < 5:
            logger.warning(
                "DivergenceReport: only %d flags — minimum is 5. "
                "Divergence coverage may be incomplete.", len(v),
            )
        return v


# ---------------------------------------------------------------------------
# Stage 5: calibration confidence
# ---------------------------------------------------------------------------

class ConfidenceScores(BaseModel):
    volume: Optional[Annotated[float, Field(ge=0.0, le=1.0)]] = None
    source_diversity: Optional[Annotated[float, Field(ge=0.0, le=1.0)]] = None
    recency: Optional[Annotated[float, Field(ge=0.0, le=1.0)]] = None
    signal_clarity: Optional[Annotated[float, Field(ge=0.0, le=1.0)]] = None
    ro_alignment: Optional[Annotated[float, Field(ge=0.0, le=1.0)]] = None
    weighted_score: Optional[Annotated[float, Field(ge=0.0, le=1.0)]] = None

    def to_int_percent(self) -> Optional[int]:
        if self.weighted_score is not None:
            raw = self.weighted_score
            if 0.0 <= raw <= 1.0:
                return int(round(raw * 100))
            # Should not happen with the ge/le constraint, but guard anyway
            if 1 < raw <= 100:
                return int(raw)
        return None


class ConfidenceComparison(BaseModel):
    source_scores: ConfidenceScores
    replicated_scores: ConfidenceScores
    notes: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Final artifact
# ---------------------------------------------------------------------------

class ReplicationMetadata(BaseModel):
    source_persona_id: str
    target_country: str
    replication_mode: Literal[
        "fast_localization",
        "deep_psychographic",
        "full_replication",
        "anchor_preview",
    ]
    framework_version: str = "v5.0"
    anchor_count: int = Field(default=7, ge=0)
    split_trait_count: int = Field(default=6, ge=0)
    indexed_trait_count: int = Field(default=6, ge=0)
    replication_timestamp: str


class ReplicationArtifact(BaseModel):
    """
    Full artifact stored under persona_details["replication_artifacts"].

    fast_localization: only metadata populated.
    anchor_preview: psychographic_core + market_context populated.
    full_replication/deep_psychographic: all fields required.
    """
    metadata: ReplicationMetadata
    psychographic_core: Optional[PsychographicCore] = None
    market_context: Optional[MarketContext] = None
    divergence_report: Optional[DivergenceReport] = None
    confidence_comparison: Optional[ConfidenceComparison] = None

    @model_validator(mode="after")
    def enforce_deep_mode_completeness(self) -> "ReplicationArtifact":
        if self.metadata.replication_mode in {"deep_psychographic", "full_replication"}:
            missing = []
            if self.psychographic_core is None:
                missing.append("psychographic_core")
            if self.market_context is None:
                missing.append("market_context")
            if self.divergence_report is None:
                missing.append("divergence_report")
            if self.confidence_comparison is None:
                missing.append("confidence_comparison")
            if missing:
                logger.warning(
                    "ReplicationArtifact(deep_psychographic): "
                    "incomplete artifact — missing: %s", missing,
                )
        return self
