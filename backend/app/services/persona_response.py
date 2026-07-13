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

logger = logging.getLogger(__name__)


class PersonaResponseService:
    """Generates one persona's responses to an artifact-specific discussion guide."""

    def __init__(self, openai_api_key: Optional[str] = None, model: str = "gpt-4o-mini"):
        if not openai_api_key:
            raise ValueError("openai_api_key is required")
        self._client = AsyncOpenAI(api_key=openai_api_key)
        self._model = model

    async def generate_persona_responses(
        self,
        persona: dict,
        asset_dissections: dict[str, dict],
        discussion_guide: dict,
        comparison_mode: str,
    ) -> dict:
        """
        Returns:
        {
          "persona_name": "...",
          "responses": [
            {"dimension": code, "question": "...", "response": "...", "reasoning": "..."}
          ]
        }
        """
        persona_block = json.dumps(persona, indent=2, default=str)
        guide_block = json.dumps(discussion_guide, indent=2)

        if comparison_mode == "comparison" and len(asset_dissections) > 1:
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

        data = json.loads(response.choices[0].message.content)
        logger.info(
            "%s provided %d artifact responses",
            data.get("persona_name", persona.get("name", "Unknown")),
            len(data.get("responses", [])),
        )
        return data
