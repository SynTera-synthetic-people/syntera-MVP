"""Validation pass for the artifact pipeline's "url" artifact_type path
(video/URL, e.g. YouTube), which was previously code-reviewed but never
actually executed - only static images had been run through the pipeline.

Runs the full 4-stage pipeline against a real public YouTube ad URL:
  1. AssetDissectionService (Gemini)     - reads the YouTube URL directly via file_uri
  2. DimensionExtractionService (OpenAI)
  3. DiscussionGuideService (OpenAI)
  4. PersonaResponseService (OpenAI)

Usage (from backend/):
    .venv/Scripts/python.exe scripts/test_artifact_pipeline_url.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv

from app.schemas.artifact_pipeline import ComparisonMode
from app.services.artifact_dissection import AssetDissectionService
from app.services.dimension_extraction import DimensionExtractionService
from app.services.discussion_guide import DiscussionGuideService
from app.services.persona_response import PersonaResponseService

from artifact_test_fixtures import MOCK_PERSONAS

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Real, public, verified-to-exist ad (found via web search, not guessed):
# "30 Second Nike Commercial" - https://www.youtube.com/watch?v=b8PUpLsGSN8
YOUTUBE_URL = "https://www.youtube.com/watch?v=b8PUpLsGSN8"

RO_DESCRIPTION = (
    "Understand whether this Nike commercial drives emotional engagement and "
    "brand affinity across different consumer segments, and whether the "
    "creative motivates any purchase consideration."
)
INSTRUCTION = "Evaluate this 30-second Nike ad for brand impact and persuasion strength."
ARTIFACT_CATEGORY = "ad_creative"
COMPARISON_MODE = ComparisonMode.CAMPAIGN_SET


def _print_stage(title: str, payload: object) -> None:
    print(f"\n{'=' * 10} {title} {'=' * 10}")
    print(json.dumps(payload, indent=2))


async def main() -> None:
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not gemini_key or not openai_key:
        print("GEMINI_API_KEY and/or OPENAI_API_KEY not set in backend/.env.")
        return

    print(f"Testing URL artifact_type with: {YOUTUBE_URL}")

    # ---- Stage 1: Asset Dissection (url path) ----
    dissection_service = AssetDissectionService(gemini_api_key=gemini_key, model="gemini-2.5-flash")
    asset_dissections = await dissection_service.dissect_assets(
        assets=[YOUTUBE_URL],
        instruction=INSTRUCTION,
        artifact_type="url",
    )
    _print_stage("STAGE 1: ASSET DISSECTION (url)", asset_dissections)

    moments = asset_dissections["asset_0"].get("moments", [])
    print(f"\n[CHECK] Number of timestamped moments extracted from video: {len(moments)} (expect 4-8 for a real video, not 1 like a static image)")

    # ---- Stage 2: Dimension Extraction ----
    dimension_service = DimensionExtractionService(openai_api_key=openai_key, model="gpt-4o-mini")
    dim_selection = await dimension_service.extract_dimensions(
        ro_description=RO_DESCRIPTION,
        instruction=INSTRUCTION,
        artifact_type=ARTIFACT_CATEGORY,
    )
    _print_stage("STAGE 2: DIMENSION EXTRACTION", dim_selection.selected_codes)

    # ---- Stage 3: Discussion Guide Generation ----
    guide_service = DiscussionGuideService(openai_api_key=openai_key, model="gpt-4o-mini")
    discussion_guide = await guide_service.generate_guide(
        ro_description=RO_DESCRIPTION,
        instruction=INSTRUCTION,
        selected_dimensions=dim_selection.selected_codes,
        dimension_details={k: v.model_dump() for k, v in dim_selection.details.items()},
        comparison_mode=COMPARISON_MODE,
        num_assets=1,
        is_qual=True,
    )
    _print_stage("STAGE 3: DISCUSSION GUIDE (sections only)", [s.dimension for s in discussion_guide.sections])

    # ---- Stage 4: Persona Responses (just one persona, to keep this quick) ----
    response_service = PersonaResponseService(openai_api_key=openai_key, model="gpt-4o-mini")
    persona = MOCK_PERSONAS[0]
    result = await response_service.generate_persona_responses(
        persona=persona,
        asset_dissections=asset_dissections,
        discussion_guide=discussion_guide,
        comparison_mode=COMPARISON_MODE,
    )
    _print_stage("STAGE 4: PERSONA RESPONSE (1 persona)", result.model_dump())

    print("\n\n[RESULT] Full pipeline succeeded end-to-end using a real YouTube URL as the artifact source.")


if __name__ == "__main__":
    asyncio.run(main())
