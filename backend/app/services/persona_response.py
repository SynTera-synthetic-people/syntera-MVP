"""Stage 4 of the artifact pipeline: an already-generated persona answers the
discussion guide, grounded in the asset dissection(s) from stage 1.

CRITICAL: personas are generated elsewhere (the standard manual/auto Digital
Brain pipelines) — this service only consumes an already-built persona dict.
It never generates or modifies personas.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from openai import AsyncOpenAI
from pydantic import ValidationError

from app.config import settings
from app.schemas.artifact_pipeline import (
    ComparisonMode,
    DiscussionGuide,
    PersonaResponseSet,
    PipelineStageError,
)
from app.services.anti_sycophancy_rules import ANTI_SYCOPHANCY_RULES
from app.services.llm_usage_tracker import extract_usage_openai_chat, record_llm_usage

logger = logging.getLogger(__name__)


# Longer than the other two OpenAI stages (60s): this call has to answer
# EVERY question in the discussion guide (can be 15-25+ questions across all
# sections) in one completion, 150-250 words each — a much larger generation
# than dimension_extraction's code list or discussion_guide's skeleton.
# Empirically hit openai.APITimeoutError at 60s against a real guide.
_REQUEST_TIMEOUT_SECONDS = 180.0


class PersonaResponseService:
    """Generates one persona's responses to an artifact-specific discussion guide."""

    def __init__(self, openai_api_key: Optional[str] = None, model: Optional[str] = None):
        openai_api_key = openai_api_key if openai_api_key is not None else settings.OPENAI_API_KEY
        model = model if model is not None else settings.ARTIFACT_REASONING_MODEL
        if not openai_api_key:
            raise ValueError("openai_api_key is required")
        self._client = AsyncOpenAI(api_key=openai_api_key, timeout=_REQUEST_TIMEOUT_SECONDS)
        self._model = model

    async def generate_persona_responses(
        self,
        persona: dict,
        asset_dissections: dict[str, dict],
        discussion_guide: DiscussionGuide,
        comparison_mode: ComparisonMode,
        *,
        exploration_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        created_by: Optional[str] = None,
        session_id: Optional[str] = None,
        persona_id: Optional[str] = None,
    ) -> PersonaResponseSet:
        """
        Returns a validated PersonaResponseSet:
        {
          "persona_name": "...",
          "responses": [
            {"dimension": code, "question": "...", "response": "...", "reasoning": "..."}
          ]
        }

        exploration_id/workspace_id/created_by/session_id/persona_id are
        optional LLM-usage-tracking context (see
        AssetDissectionService.dissect_assets); omitted entirely, no usage
        row is written.

        If the model answers fewer questions than the guide actually has
        (observed in practice: a valid, schema-conformant JSON response that
        silently drops most questions for one persona while others answer in
        full), retries once. If still short after the retry, raises
        PipelineStageError instead of persisting a misleadingly "complete"
        but gutted result — the orchestrator's per-persona isolation then
        records this persona as failed without affecting the others.
        """
        comparison_mode = ComparisonMode(comparison_mode)
        expected_count = sum(len(s.questions) for s in discussion_guide.sections)

        data = await self._generate_once(
            persona, asset_dissections, discussion_guide, comparison_mode,
            exploration_id=exploration_id, workspace_id=workspace_id,
            created_by=created_by, session_id=session_id, persona_id=persona_id,
        )

        if expected_count and len(data.responses) < expected_count:
            logger.warning(
                "%s answered only %d/%d guide questions; retrying once",
                data.persona_name, len(data.responses), expected_count,
            )
            data = await self._generate_once(
                persona, asset_dissections, discussion_guide, comparison_mode,
                exploration_id=exploration_id, workspace_id=workspace_id,
                created_by=created_by, session_id=session_id, persona_id=persona_id,
            )
            if len(data.responses) < expected_count:
                raise PipelineStageError(
                    "persona_response",
                    f"{data.persona_name} answered only {len(data.responses)}/{expected_count} "
                    "guide questions after retry",
                )

        logger.info("%s provided %d artifact responses", data.persona_name, len(data.responses))
        return data

    async def _generate_once(
        self,
        persona: dict,
        asset_dissections: dict[str, dict],
        discussion_guide: DiscussionGuide,
        comparison_mode: ComparisonMode,
        *,
        exploration_id: Optional[str],
        workspace_id: Optional[str],
        created_by: Optional[str],
        session_id: Optional[str],
        persona_id: Optional[str],
    ) -> PersonaResponseSet:
        persona_block = json.dumps(persona, indent=2, default=str)
        guide_block = discussion_guide.model_dump_json(indent=2)

        if comparison_mode == ComparisonMode.COMPARISON and len(asset_dissections) > 1:
            ordered_keys = sorted(
                asset_dissections.keys(),
                key=lambda k: int(k.rsplit("_", 1)[-1]) if k.rsplit("_", 1)[-1].isdigit() else k,
            )
            assets_text = "\n\n".join(
                f"Asset {i + 1}:\n{json.dumps(asset_dissections[key], indent=2)}"
                for i, key in enumerate(ordered_keys)
            )
            asset_block = f"""
You are comparing these {len(asset_dissections)} assets:

{assets_text}

COMPARE these assets in your answers. Which works better? Why? What are the key differences?
"""
        else:
            first_dissection = next(iter(asset_dissections.values()), {})
            asset_block = f"""
You are evaluating this asset:

{json.dumps(first_dissection, indent=2)}
"""

        prompt = f"""
You are roleplaying as a consumer persona answering questions about creative assets.

PERSONA PROFILE:
{persona_block}

ASSET(S) TO EVALUATE:
{asset_block}

DISCUSSION GUIDE / QUESTIONNAIRE:
{guide_block}

{ANTI_SYCOPHANCY_RULES}

Your task:
1. Answer EVERY question in the discussion guide, AS THIS PERSONA would
2. Be authentic to the persona's values, behaviors, preferences, and worldview
3. For comparison questions: explicitly compare the assets
4. For single-asset questions: evaluate fit with their needs and context
5. Provide reasoning (1-2 sentences) grounded in the persona's profile
6. Don't be generic - show personality and perspective
7. Be honest about what works and doesn't work for THIS persona

Respond with ONLY valid JSON (no markdown, no extra text):
{{
  "persona_name": "{persona.get('name', 'Unknown')}",
  "responses": [
    {{
      "dimension": "dimension_code",
      "question": "The question from the guide",
      "response": "Persona's answer (natural, specific, authentic)",
      "reasoning": "Why persona answered this way (grounded in their profile)"
    }}
  ]
}}
"""

        response = await self._client.chat.completions.create(
            model=self._model,
            response_format={"type": "json_object"},
            temperature=0.7,
            messages=[{"role": "user", "content": prompt}],
        )

        if exploration_id is not None:
            input_tokens, output_tokens, usage_raw = extract_usage_openai_chat(response)
            await record_llm_usage(
                exploration_id=exploration_id,
                stage="artifact_persona_response",
                provider="openai",
                model=self._model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                usage_raw=usage_raw,
                workspace_id=workspace_id,
                created_by=created_by,
                session_id=session_id,
                persona_id=persona_id,
            )

        raw = response.choices[0].message.content
        try:
            return PersonaResponseSet.model_validate(json.loads(raw))
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.error("Failed to parse persona response: %s", (raw or "")[:2000])
            raise PipelineStageError(
                "persona_response", "Persona response was not valid JSON/schema"
            ) from exc
