"""Stage 2 of the artifact pipeline: pick the 5-8 most relevant dimensions
(from the 26-dimension library) for this specific RO + artifact combination.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from openai import AsyncOpenAI
from pydantic import BaseModel, Field, ValidationError

from app.config import settings
from app.ml.artifact_dimensions_library import ArtifactDimensionLibrary, artifact_dimension_library
from app.schemas.artifact_pipeline import DimensionDetail, DimensionSelection, PipelineStageError
from app.services.llm_usage_tracker import extract_usage_openai_chat, record_llm_usage

logger = logging.getLogger(__name__)

# Minimum number of valid dimension codes the LLM must select before we
# retry-then-fall-back (see extract_dimensions). Not part of the public
# schema contract, just an internal guard on the raw LLM response shape.
_MIN_SELECTED_DIMENSIONS = 3


class _RawDimensionSelectionResponse(BaseModel):
    """Shape of the raw LLM JSON before filtering against valid candidate codes."""

    selected_dimensions: list[str] = Field(default_factory=list)
    reasoning: str = ""


_REQUEST_TIMEOUT_SECONDS = 60.0


class DimensionExtractionService:
    """Selects relevant dimensions from the library using an LLM."""

    def __init__(
        self,
        openai_api_key: Optional[str] = None,
        model: Optional[str] = None,
        library: ArtifactDimensionLibrary = artifact_dimension_library,
    ):
        openai_api_key = openai_api_key if openai_api_key is not None else settings.OPENAI_API_KEY
        model = model if model is not None else settings.ARTIFACT_REASONING_MODEL
        if not openai_api_key:
            raise ValueError("openai_api_key is required")
        self._client = AsyncOpenAI(api_key=openai_api_key, timeout=_REQUEST_TIMEOUT_SECONDS)
        self._model = model
        self._library = library

    async def extract_dimensions(
        self,
        ro_description: str,
        instruction: str,
        artifact_type: str,
        *,
        exploration_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        created_by: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> DimensionSelection:
        """Selects and validates 5-8 relevant dimensions for this RO + artifact combination.

        If the LLM returns fewer than _MIN_SELECTED_DIMENSIONS valid codes, retries
        the selection call once; if still short, falls back to the library's full
        core dimension set (get_core_dimensions()) rather than an empty/thin result.

        exploration_id/workspace_id/created_by/session_id are optional
        LLM-usage-tracking context (see AssetDissectionService.dissect_assets);
        omitted entirely, no usage row is written for either the initial call
        or the retry.
        """
        candidates = self._library.get_dimensions_for_type(artifact_type)
        if not candidates:
            logger.warning("No dimensions found for type %s, falling back to ad_creative", artifact_type)
            candidates = self._library.get_dimensions_for_type("ad_creative")

        selected_codes = await self._select_relevant_dimensions(
            ro_description=ro_description,
            instruction=instruction,
            artifact_type=artifact_type,
            candidates=candidates,
            exploration_id=exploration_id, workspace_id=workspace_id,
            created_by=created_by, session_id=session_id,
        )

        if len(selected_codes) < _MIN_SELECTED_DIMENSIONS:
            logger.warning(
                "Only %d valid dimensions selected for artifact type %s; retrying once",
                len(selected_codes), artifact_type,
            )
            selected_codes = await self._select_relevant_dimensions(
                ro_description=ro_description,
                instruction=instruction,
                artifact_type=artifact_type,
                candidates=candidates,
                exploration_id=exploration_id, workspace_id=workspace_id,
                created_by=created_by, session_id=session_id,
            )

        if len(selected_codes) < _MIN_SELECTED_DIMENSIONS:
            logger.warning(
                "Still only %d valid dimensions after retry for artifact type %s; "
                "falling back to the core dimension set",
                len(selected_codes), artifact_type,
            )
            selected_codes = [d["code"] for d in self._library.get_core_dimensions()]

        by_code = {d["code"]: d for d in candidates}
        dimension_details: dict[str, DimensionDetail] = {}
        for code in selected_codes:
            dim = by_code.get(code)
            if not dim:
                continue
            dimension_details[code] = DimensionDetail(
                name=dim["name"],
                description=dim.get("purpose", ""),
                questions=dim.get("discussion_questions", []),
                theme=dim.get("theme", "General"),
            )

        logger.info("Extracted %d dimensions for artifact type %s: %s", len(dimension_details), artifact_type, list(dimension_details))
        return DimensionSelection(selected_codes=list(dimension_details.keys()), details=dimension_details)

    async def _select_relevant_dimensions(
        self,
        ro_description: str,
        instruction: str,
        artifact_type: str,
        candidates: list[dict],
        *,
        exploration_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        created_by: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> list[str]:
        candidate_summary = [
            {"code": d["code"], "name": d["name"], "purpose": d.get("purpose", "")}
            for d in candidates
        ]

        prompt = f"""
Based on this Research Objective and artifact context, select the MOST RELEVANT
5-8 dimensions to explore.

RESEARCH OBJECTIVE:
{ro_description}

ARTIFACT CONTEXT (user instruction):
{instruction}

ARTIFACT TYPE:
{artifact_type}

AVAILABLE DIMENSIONS:
{json.dumps(candidate_summary, indent=2)}

Select the 5-8 most relevant dimension codes from the list above. Prioritize
dimensions that will uncover insights most relevant to the RO and artifact
context. Only use codes that appear in the list above.

Respond with ONLY valid JSON (no markdown, no extra text):
{{
  "selected_dimensions": ["dimension_code_1", "dimension_code_2", ...],
  "reasoning": "Brief explanation of why these dimensions were selected"
}}
"""

        response = await self._client.chat.completions.create(
            model=self._model,
            response_format={"type": "json_object"},
            temperature=0.5,
            messages=[{"role": "user", "content": prompt}],
        )

        if exploration_id is not None:
            input_tokens, output_tokens, usage_raw = extract_usage_openai_chat(response)
            await record_llm_usage(
                exploration_id=exploration_id,
                stage="artifact_dimension_extraction",
                provider="openai",
                model=self._model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                usage_raw=usage_raw,
                workspace_id=workspace_id,
                created_by=created_by,
                session_id=session_id,
            )

        raw = response.choices[0].message.content
        try:
            parsed = _RawDimensionSelectionResponse.model_validate(json.loads(raw))
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.error("Failed to parse dimension selection response: %s", (raw or "")[:2000])
            raise PipelineStageError(
                "dimension_extraction", "Dimension selection response was not valid JSON"
            ) from exc

        valid_codes = {d["code"] for d in candidates}
        selected = [c for c in parsed.selected_dimensions if c in valid_codes]

        logger.info("LLM selected dimensions: %s", selected)
        return selected
