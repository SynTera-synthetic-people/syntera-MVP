"""Manual, standalone test of the full 4-stage artifact pipeline:

  1. AssetDissectionService (Gemini)     - objective description of the asset
  2. DimensionExtractionService (OpenAI) - pick 5-8 relevant dimensions from the library
  3. DiscussionGuideService (OpenAI)     - turn those dimensions into curated questions
  4. PersonaResponseService (OpenAI)     - each persona answers the guide

No database, no API routes, no persona-generation code is touched. Personas
here are hardcoded mocks standing in for already-generated personas.

Usage (from backend/):
    .venv/Scripts/python.exe scripts/test_artifact_pipeline.py
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

# Imported directly (not through app.config) to avoid the AWS-SSM-at-import
# crash: app.config imports app.parameters, which calls out to AWS SSM at
# import time and requires AWS credentials that aren't available locally.
from app.schemas.artifact_pipeline import ComparisonMode
from app.services.artifact_dissection import AssetDissectionService
from app.services.dimension_extraction import DimensionExtractionService
from app.services.discussion_guide import DiscussionGuideService
from app.services.persona_response import PersonaResponseService

from artifact_test_fixtures import MOCK_PERSONAS, build_sample_ad_image

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

RO_DESCRIPTION = (
    "Understand whether the 'Built for your everyday hustle' campaign drives "
    "awareness and purchase consideration for Voltra sneakers across age groups, "
    "and whether the creative communicates value clearly enough to justify the $89 price point."
)

INSTRUCTION = "Test this ad creative for a 30-second social campaign awareness push."
ARTIFACT_CATEGORY = "ad_creative"   # key into the dimension library
MEDIA_TYPE = "image"                # what Gemini needs to know how to read the file
COMPARISON_MODE = ComparisonMode.CAMPAIGN_SET  # single asset


def _print_stage(title: str, payload: object) -> None:
    print(f"\n{'=' * 10} {title} {'=' * 10}")
    print(json.dumps(payload, indent=2))


async def main() -> None:
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not gemini_key or not openai_key:
        print("GEMINI_API_KEY and/or OPENAI_API_KEY not set in backend/.env.")
        return

    sample_image_path = Path(__file__).parent / "fixtures" / "sample_ad.png"
    build_sample_ad_image(sample_image_path)
    print(f"Generated sample artifact: {sample_image_path}")

    # ---- Stage 1: Asset Dissection ----
    dissection_service = AssetDissectionService(gemini_api_key=gemini_key, model="gemini-2.5-flash")
    asset_dissections = await dissection_service.dissect_assets(
        assets=[str(sample_image_path)],
        instruction=INSTRUCTION,
        artifact_type=MEDIA_TYPE,
    )
    _print_stage("STAGE 1: ASSET DISSECTION", asset_dissections)

    # ---- Stage 2: Dimension Extraction ----
    dimension_service = DimensionExtractionService(openai_api_key=openai_key, model="gpt-4o-mini")
    dim_selection = await dimension_service.extract_dimensions(
        ro_description=RO_DESCRIPTION,
        instruction=INSTRUCTION,
        artifact_type=ARTIFACT_CATEGORY,
    )
    _print_stage("STAGE 2: DIMENSION EXTRACTION", dim_selection.model_dump())

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
    _print_stage("STAGE 3: DISCUSSION GUIDE", discussion_guide.model_dump())

    # ---- Stage 4: Persona Responses ----
    response_service = PersonaResponseService(openai_api_key=openai_key, model="gpt-4o-mini")
    persona_responses = {}
    for persona in MOCK_PERSONAS:
        result = await response_service.generate_persona_responses(
            persona=persona,
            asset_dissections=asset_dissections,
            discussion_guide=discussion_guide,
            comparison_mode=COMPARISON_MODE,
        )
        persona_responses[persona["name"]] = result.model_dump()

    _print_stage("STAGE 4: PERSONA RESPONSES", persona_responses)


if __name__ == "__main__":
    asyncio.run(main())
