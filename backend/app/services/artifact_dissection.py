"""Stage 1 of the artifact pipeline: objective dissection of a creative asset.

Uses Gemini multimodal to describe WHAT is in the asset (visuals, message, tone,
structure, moments, CTA) — no personas involved here. Persona-specific reactions
happen later, in persona_response.py, using this dissection as input.
"""
from __future__ import annotations

import json
import logging
import mimetypes
from pathlib import Path
from typing import Optional

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

_MIME_OVERRIDES = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


class AssetDissectionService:
    """Dissects creative assets (videos, images, URLs) using Gemini."""

    def __init__(self, gemini_api_key: Optional[str] = None, model: str = "gemini-2.5-flash"):
        if not gemini_api_key:
            raise ValueError("gemini_api_key is required")
        self._client = genai.Client(api_key=gemini_api_key)
        self._model = model

    async def dissect_assets(
        self,
        assets: list[str],
        instruction: str,
        artifact_type: str,
    ) -> dict[str, dict]:
        """Dissect one or more assets. Returns {"asset_0": {...}, "asset_1": {...}, ...}."""
        dissections: dict[str, dict] = {}
        for idx, asset in enumerate(assets):
            dissections[f"asset_{idx}"] = await self._dissect_single_asset(
                asset=asset, instruction=instruction, artifact_type=artifact_type
            )
        return dissections

    async def _dissect_single_asset(
        self,
        asset: str,
        instruction: str,
        artifact_type: str,
    ) -> dict:
        content_part = self._build_content_part(asset, artifact_type)
        prompt = self._build_prompt(instruction, artifact_type)

        response = await self._client.aio.models.generate_content(
            model=self._model,
            contents=[content_part, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3,
            ),
        )

        text = response.text
        if not text:
            raise RuntimeError("Gemini returned an empty dissection response")
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse Gemini dissection response: %s", text[:2000])
            raise RuntimeError("Gemini dissection response was not valid JSON") from exc

    def _build_content_part(self, asset: str, artifact_type: str) -> types.Part:
        if artifact_type == "url":
            return types.Part.from_uri(file_uri=asset, mime_type="video/*")

        path = Path(asset)
        if not path.is_file():
            raise FileNotFoundError(f"Asset not found: {asset}")

        mime_type = _MIME_OVERRIDES.get(path.suffix.lower()) or mimetypes.guess_type(str(path))[0]
        if not mime_type:
            mime_type = "video/mp4" if artifact_type == "video" else "image/jpeg"

        return types.Part.from_bytes(data=path.read_bytes(), mime_type=mime_type)

    def _build_prompt(self, instruction: str, artifact_type: str) -> str:
        moment_instruction = (
            "Break the video into 4-8 key moments across its duration. For each moment, "
            "provide an approximate timestamp (e.g. 0:00, 0:15, 0:30)."
            if artifact_type in ("video", "url")
            else "Treat the image as a single moment. Set timestamp to 0:00."
        )

        return f"""
You are dissecting a creative asset for research purposes. This is an OBJECTIVE
description task — do not simulate any audience reaction, just describe what is
actually present in the asset.

USER CONTEXT:
{instruction}

TASK:
{moment_instruction}

For each moment, describe:
- What's happening visually
- What message is being conveyed
- What tone is being used (e.g. warm, energetic, serious, playful)
- Key visual/audio elements

Then provide overall:
- overall_message: 1-2 sentences summarizing the entire asset
- overall_tone: dominant emotional tone
- visual_structure: layout, color palette, pacing, design approach
- cta: call-to-action if present, or null

Respond ONLY with valid JSON (no markdown, no extra text):
{{
  "moments": [
    {{
      "timestamp": "0:00",
      "description": "What's happening visually",
      "message": "What's being communicated",
      "tone": "Tone of this moment",
      "visual_elements": ["element1", "element2", "element3"]
    }}
  ],
  "overall_message": "...",
  "overall_tone": "...",
  "visual_structure": "...",
  "cta": null
}}
"""
