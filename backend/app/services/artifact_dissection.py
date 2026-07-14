"""Stage 1 of the artifact pipeline: objective dissection of a creative asset.

Uses Gemini multimodal to describe WHAT is in the asset (visuals, message, tone,
structure, moments, CTA) — no personas involved here. Persona-specific reactions
happen later, in persona_response.py, using this dissection as input.
"""
from __future__ import annotations

import asyncio
import json
import logging
import mimetypes
from pathlib import Path
from typing import Optional

import aiofiles
from google import genai
from google.genai import types

from app.config import settings
from app.services.llm_usage_tracker import extract_usage_gemini, record_llm_usage

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


_REQUEST_TIMEOUT_MS = 120_000  # 120s — video dissection can take a while
_MAX_CONCURRENT_ASSETS = 5


class AssetDissectionService:
    """Dissects creative assets (videos, images, URLs) using Gemini."""

    def __init__(self, gemini_api_key: Optional[str] = None, model: Optional[str] = None):
        gemini_api_key = gemini_api_key if gemini_api_key is not None else settings.GEMINI_API_KEY
        model = model if model is not None else settings.ARTIFACT_DISSECTION_MODEL
        if not gemini_api_key:
            raise ValueError("gemini_api_key is required")
        self._client = genai.Client(
            api_key=gemini_api_key,
            http_options=types.HttpOptions(timeout=_REQUEST_TIMEOUT_MS),
        )
        self._model = model

    async def dissect_assets(
        self,
        assets: list[str],
        instruction: str,
        artifact_type: str,
        *,
        isolate_failures: bool = False,
        exploration_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        created_by: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> dict[str, dict]:
        """Dissect one or more assets concurrently (bounded).

        Returns {"asset_0": {...}, "asset_1": {...}, ...}.

        isolate_failures=True (comparison mode, 2+ assets): one bad asset
        doesn't fail the whole call — its entry becomes {"error": "<message>"}
        so the caller still gets partial, useful results for the rest.
        isolate_failures=False (default; single-asset campaign_set runs):
        any failure propagates immediately, matching the previous behavior.

        exploration_id/workspace_id/created_by/session_id are optional
        LLM-usage-tracking context (session_id is the caller's own run/session
        id, used only to correlate usage rows). Omitted entirely — as the
        standalone scripts under scripts/ do — no usage row is written.
        """
        semaphore = asyncio.Semaphore(_MAX_CONCURRENT_ASSETS)

        async def _one(idx: int, asset: str) -> tuple[str, dict]:
            key = f"asset_{idx}"
            async with semaphore:
                if isolate_failures:
                    try:
                        result = await self._dissect_single_asset(
                            asset=asset, instruction=instruction, artifact_type=artifact_type,
                            operation=key, exploration_id=exploration_id, workspace_id=workspace_id,
                            created_by=created_by, session_id=session_id,
                        )
                    except Exception as exc:
                        logger.error("Dissection failed for %s (isolated, comparison mode): %s", key, exc)
                        result = {"error": str(exc)}
                else:
                    result = await self._dissect_single_asset(
                        asset=asset, instruction=instruction, artifact_type=artifact_type,
                        operation=key, exploration_id=exploration_id, workspace_id=workspace_id,
                        created_by=created_by, session_id=session_id,
                    )
            return key, result

        results = await asyncio.gather(*(_one(idx, asset) for idx, asset in enumerate(assets)))
        return dict(results)

    async def _dissect_single_asset(
        self,
        asset: str,
        instruction: str,
        artifact_type: str,
        *,
        operation: Optional[str] = None,
        exploration_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        created_by: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> dict:
        content_part = await self._build_content_part(asset, artifact_type)
        prompt = self._build_prompt(instruction, artifact_type)

        response = await self._client.aio.models.generate_content(
            model=self._model,
            contents=[content_part, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3,
            ),
        )

        if exploration_id is not None:
            input_tokens, output_tokens, usage_raw = extract_usage_gemini(response)
            await record_llm_usage(
                exploration_id=exploration_id,
                stage="artifact_dissection",
                operation=operation,
                provider="gemini",
                model=self._model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                usage_raw=usage_raw,
                workspace_id=workspace_id,
                created_by=created_by,
                session_id=session_id,
            )

        text = response.text
        if not text:
            raise RuntimeError("Gemini returned an empty dissection response")
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse Gemini dissection response: %s", text[:2000])
            raise RuntimeError("Gemini dissection response was not valid JSON") from exc

    async def _build_content_part(self, asset: str, artifact_type: str) -> types.Part:
        if artifact_type == "url":
            return types.Part.from_uri(file_uri=asset, mime_type="video/*")

        path = Path(asset)
        if not path.is_file():
            raise FileNotFoundError(f"Asset not found: {asset}")

        mime_type = _MIME_OVERRIDES.get(path.suffix.lower()) or mimetypes.guess_type(str(path))[0]
        if not mime_type:
            mime_type = "video/mp4" if artifact_type == "video" else "image/jpeg"

        async with aiofiles.open(path, "rb") as f:
            data = await f.read()
        return types.Part.from_bytes(data=data, mime_type=mime_type)

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
