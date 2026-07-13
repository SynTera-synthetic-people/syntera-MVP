"""Stage 2 of the artifact pipeline: pick the 5-8 most relevant dimensions
(from the 26-dimension library) for this specific RO + artifact combination.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from openai import AsyncOpenAI

from app.ml.artifact_dimensions_library import ArtifactDimensionLibrary, artifact_dimension_library

logger = logging.getLogger(__name__)


class DimensionExtractionService:
    """Selects relevant dimensions from the library using an LLM."""

    def __init__(
        self,
        openai_api_key: Optional[str] = None,
        model: str = "gpt-4o-mini",
        library: ArtifactDimensionLibrary = artifact_dimension_library,
    ):
        if not openai_api_key:
            raise ValueError("openai_api_key is required")
        self._client = AsyncOpenAI(api_key=openai_api_key)
        self._model = model
        self._library = library

    async def extract_dimensions(
        self,
        ro_description: str,
        instruction: str,
        artifact_type: str,
    ) -> tuple[list[str], dict[str, dict]]:
        """
        Returns:
            (selected_dimension_codes, dimension_details) where dimension_details
            maps code -> {name, description, questions, theme}
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
        )

        by_code = {d["code"]: d for d in candidates}
        dimension_details = {}
        for code in selected_codes:
            dim = by_code.get(code)
            if not dim:
                continue
            dimension_details[code] = {
                "name": dim["name"],
                "description": dim.get("purpose", ""),
                "questions": dim.get("discussion_questions", []),
                "theme": dim.get("theme", "General"),
            }

        logger.info("Extracted %d dimensions for artifact type %s: %s", len(dimension_details), artifact_type, list(dimension_details))
        return list(dimension_details.keys()), dimension_details

    async def _select_relevant_dimensions(
        self,
        ro_description: str,
        instruction: str,
        artifact_type: str,
        candidates: list[dict],
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

        data = json.loads(response.choices[0].message.content)
        valid_codes = {d["code"] for d in candidates}
        selected = [c for c in data.get("selected_dimensions", []) if c in valid_codes]

        logger.info("LLM selected dimensions: %s", selected)
        return selected
