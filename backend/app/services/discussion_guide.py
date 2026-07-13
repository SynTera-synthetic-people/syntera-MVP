"""Stage 3 of the artifact pipeline: turn the selected dimensions into a
curated discussion guide (qual) or questionnaire (quant), aware of whether
this is a single-asset "campaign set" or a multi-asset "comparison".
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class DiscussionGuideService:
    """Generates a curated discussion guide/questionnaire from selected dimensions."""

    def __init__(self, openai_api_key: Optional[str] = None, model: str = "gpt-4o-mini"):
        if not openai_api_key:
            raise ValueError("openai_api_key is required")
        self._client = AsyncOpenAI(api_key=openai_api_key)
        self._model = model

    async def generate_guide(
        self,
        ro_description: str,
        instruction: str,
        selected_dimensions: list[str],
        dimension_details: dict[str, dict],
        comparison_mode: str,
        num_assets: int = 1,
        is_qual: bool = True,
    ) -> dict:
        """
        comparison_mode: "campaign_set" (1 asset) or "comparison" (2+ assets)

        Returns:
        {
          "title": "...", "introduction": "...",
          "comparison_mode": "...", "num_assets": N,
          "sections": [
            {"dimension": code, "theme": "...", "dimension_name": "...", "description": "...",
             "questions": [{"question": "...", "type": "open"|"rating"|"choice", "scale": "1-5"?, "intent": "..."}]}
          ]
        }
        """
        dimension_block = json.dumps(dimension_details, indent=2)

        if comparison_mode == "comparison" and num_assets > 1:
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
  "comparison_mode": "{comparison_mode}",
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

        guide = json.loads(response.choices[0].message.content)
        logger.info("Generated discussion guide with %d sections", len(guide.get("sections", [])))
        return guide
