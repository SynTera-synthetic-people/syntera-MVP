"""Neuroscience layer tables.

  neuro_conversation_state  current affective state per conversation,
                            written under a row lock (see app/neuro/state_store.py)
  neuro_event               append-only record of every computation; shadow
                            rows included; also records layer failures. This
                            is the audit trail and the dataset validation
                            experiments run against, so it outlives studies.
  neuro_model_version       provenance registry
  neuro_question_feature    per-question affect metadata cache
  neuro_flag                runtime on/off switch; when no NEURO_MODE row
                            exists, settings.NEURO_MODE_DEFAULT applies

Schema truth is Alembic (revision 0003_neuro_layer). These models exist for
queries and so autogenerate sees the tables.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import Boolean, Column, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.utils.id_generator import generate_id


class NeuroConversationState(SQLModel, table=True):
    __tablename__ = "neuro_conversation_state"

    # The derived conversation key (app/neuro/conversation_key.py) is the
    # primary key: one affective thread per persona per exploration.
    conversation_key: str = Field(primary_key=True)
    workspace_id: str = Field(index=True)
    exploration_id: str = Field(index=True)
    persona_id: Optional[str] = Field(default=None, index=True)
    turn_index: int = Field(default=0, sa_column=Column(Integer, nullable=False))
    state_json: Dict[str, Any] = Field(
        sa_column=Column(JSONB, nullable=False), default_factory=dict
    )
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class NeuroEvent(SQLModel, table=True):
    __tablename__ = "neuro_event"

    id: str = Field(default_factory=generate_id, primary_key=True)
    conversation_key: str = Field(index=True)
    workspace_id: str = Field(index=True)
    exploration_id: str = Field(index=True)
    persona_id: Optional[str] = Field(default=None, index=True)
    question_id: Optional[str] = Field(default=None, index=True)
    question_text_hash: Optional[str] = Field(default=None)
    turn_index: int = Field(default=0, sa_column=Column(Integer, nullable=False))
    surface: str = Field(index=True)  # interview | rebuttal | survey_simulation | artifact_response
    shadow: bool = Field(default=True, sa_column=Column(Boolean, nullable=False))
    state_json: Dict[str, Any] = Field(
        sa_column=Column(JSONB, nullable=False), default_factory=dict
    )
    # Set when the layer failed for this turn; state_json stays empty then.
    error: Optional[str] = Field(default=None)
    neuro_version: str = Field(default="", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class NeuroModelVersion(SQLModel, table=True):
    __tablename__ = "neuro_model_version"

    id: str = Field(default_factory=generate_id, primary_key=True)
    model_version: str = Field(index=True)
    artifact_version: str
    renderer_version: str
    feature_schema_version: str
    notes: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class NeuroQuestionFeature(SQLModel, table=True):
    __tablename__ = "neuro_question_feature"

    id: str = Field(default_factory=generate_id, primary_key=True)
    # interviewquestion.id or questionnairequestion.id. Deliberately not a
    # foreign key: the cache serves two parent tables and must survive guide
    # regeneration deleting questions.
    question_id: str = Field(index=True, unique=True)
    question_source: str = Field(index=True)  # interview | questionnaire
    features: Dict[str, Any] = Field(
        sa_column=Column(JSONB, nullable=False), default_factory=dict
    )
    neuro_version: str = Field(default="")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class NeuroFlag(SQLModel, table=True):
    __tablename__ = "neuro_flag"

    key: str = Field(primary_key=True)
    value: str
    updated_at: datetime = Field(default_factory=datetime.utcnow)
