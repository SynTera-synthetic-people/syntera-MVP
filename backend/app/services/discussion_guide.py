"""Stage 3 of the artifact pipeline: turn the selected dimensions into a
curated discussion guide (qual) or questionnaire (quant), aware of whether
this is a single-asset "campaign set" or a multi-asset "comparison".
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from openai import AsyncOpenAI
from pydantic import ValidationError

from app.config import settings
from app.schemas.artifact_pipeline import ComparisonMode, DiscussionGuide, PipelineStageError
from app.services.llm_usage_tracker import extract_usage_openai_chat, record_llm_usage

logger = logging.getLogger(__name__)


_REQUEST_TIMEOUT_SECONDS = 60.0


class DiscussionGuideService:
    """Generates a curated discussion guide/questionnaire from selected dimensions."""

    def __init__(self, openai_api_key: Optional[str] = None, model: Optional[str] = None):
        openai_api_key = openai_api_key if openai_api_key is not None else settings.OPENAI_API_KEY
        model = model if model is not None else settings.ARTIFACT_REASONING_MODEL
        if not openai_api_key:
            raise ValueError("openai_api_key is required")
        self._client = AsyncOpenAI(api_key=openai_api_key, timeout=_REQUEST_TIMEOUT_SECONDS)
        self._model = model

    async def generate_guide(
        self,
        ro_description: str,
        instruction: str,
        selected_dimensions: list[str],
        dimension_details: dict[str, dict],
        comparison_mode: ComparisonMode,
        num_assets: int = 1,
        is_qual: bool = True,
        *,
        exploration_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        created_by: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> DiscussionGuide:
        """
        comparison_mode: ComparisonMode.CAMPAIGN_SET (1 asset) or ComparisonMode.COMPARISON (2+ assets)

        Returns a validated DiscussionGuide:
        {
          "title": "...", "introduction": "...",
          "comparison_mode": "...", "num_assets": N,
          "sections": [
            {"dimension": code, "theme": "...", "dimension_name": "...", "description": "...",
             "questions": [{"question": "...", "type": "open"|"rating"|"choice", "scale": "1-5"?, "intent": "..."}]}
          ]
        }

        exploration_id/workspace_id/created_by/session_id are optional
        LLM-usage-tracking context (see AssetDissectionService.dissect_assets);
        omitted entirely, no usage row is written.
        """
        comparison_mode = ComparisonMode(comparison_mode)
        dimension_block = json.dumps(dimension_details, indent=2)

        if comparison_mode == ComparisonMode.COMPARISON and num_assets > 1:
            mode_instruction = f"""
The user wants to COMPARE {num_assets} assets side-by-side. Each question should ask about:
- Asset 1 vs Asset 2 (etc.) comparison
- Which performs better on this dimension
- Key differences between assets
- Which is more effective
"""
        else:
            mode_instruction = """
The user wants to analyze a SINGLE ASSET as supporting context for the RO. Each
question should explore how well the asset works for this dimension, whether it
supports the RO objectives, and fit with audience and messaging.
"""

        guide_format = "discussion guide with open-ended questions" if is_qual else "survey questionnaire with rating scales"

        prompt = f"""
You are creating a {guide_format} for creative asset testing.

RESEARCH OBJECTIVE:
{ro_description}

ARTIFACT CONTEXT:
{instruction}

COMPARISON MODE:
{mode_instruction}

DIMENSIONS TO EXPLORE:
{dimension_block}

Your task:
1. Create one section per dimension ({len(selected_dimensions)} sections total)
2. Each section should have 2-3 carefully curated questions
3. Questions should be SPECIFIC to the artifact context + dimension. If the
   dimension already has example questions listed, use them as inspiration but
   tailor the wording to the actual artifact context rather than copying them verbatim.
4. For COMPARISON mode: questions should explicitly ask about comparisons
5. For CAMPAIGN_SET mode: questions should explore how well the artifact supports the RO
6. {"Use rating scales (1-5 or 1-10) for survey format" if not is_qual else "Use open-ended questions for discussion"}
7. Questions should be actionable, non-leading, and feel natural, not robotic

Respond with ONLY valid JSON (no markdown, no extra text):
{{
  "title": "Discussion Guide: [Artifact Type]",
  "introduction": "Brief intro that explains what respondent will do",
  "comparison_mode": "{comparison_mode.value}",
  "num_assets": {num_assets},
  "sections": [
    {{
      "dimension": "dimension_code",
      "theme": "Master theme",
      "dimension_name": "Full name",
      "description": "What this dimension measures",
      "questions": [
        {{
          "question": "The actual question",
          "type": "open",
          "scale": null,
          "intent": "What this question reveals"
        }}
      ]
    }}
  ]
}}
"""

        response = await self._client.chat.completions.create(
            model=self._model,
            response_format={"type": "json_object"},
            temperature=0.6,
            messages=[{"role": "user", "content": prompt}],
        )

        if exploration_id is not None:
            input_tokens, output_tokens, usage_raw = extract_usage_openai_chat(response)
            await record_llm_usage(
                exploration_id=exploration_id,
                stage="artifact_discussion_guide",
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
            data = json.loads(raw)
            # comparison_mode/num_assets are shown in the prompt's example JSON
            # as formatting cues, but the model isn't reliable about echoing
            # them back verbatim (observed: "campaign_set" in the example ->
            # "single_asset" in the response, which then fails the strict
            # ComparisonMode enum). The caller already knows both values
            # authoritatively — no need to trust the model's copy of them.
            data["comparison_mode"] = comparison_mode.value
            data["num_assets"] = num_assets
            guide = DiscussionGuide.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.error("Failed to parse discussion guide response: %s", (raw or "")[:2000])
            raise PipelineStageError(
                "discussion_guide", "Discussion guide response was not valid JSON/schema"
            ) from exc

        logger.info("Generated discussion guide with %d sections", len(guide.sections))
        return guide
