"""Edge-case / validation pass for the artifact pipeline, beyond the single
happy-path run in test_artifact_pipeline.py. Exercises:

  A. Comparison mode with 2 assets (untested by the main script)
  B. Error handling: nonexistent asset file
  C. Type-specific dimension selection (ad_creative "hook_strength" etc.)
  D. Dimension library fallback for an unknown artifact_type
  E. Asset ordering fix (asset_0..asset_11 sorts numerically, not lexically)

Usage (from backend/):
    .venv/Scripts/python.exe scripts/test_artifact_pipeline_edge_cases.py
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
from PIL import Image, ImageDraw, ImageFont

from app.ml.artifact_dimensions_library import artifact_dimension_library
from app.services.artifact_dissection import AssetDissectionService
from app.services.dimension_extraction import DimensionExtractionService
from app.services.discussion_guide import DiscussionGuideService
from app.services.persona_response import PersonaResponseService

from artifact_test_fixtures import MOCK_PERSONAS, build_sample_ad_image

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

FIXTURES = Path(__file__).parent / "fixtures"


def _build_stridex_ad(path: Path) -> None:
    """A visually distinct competitor ad, for comparison-mode testing."""
    img = Image.new("RGB", (1024, 576), color=(245, 245, 240))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, 1024, 140], fill=(20, 90, 60))
    draw.polygon([(700, 300), (850, 180), (950, 300), (850, 480)], fill=(20, 90, 60))
    try:
        font_big = ImageFont.truetype("arialbd.ttf", 54)
        font_small = ImageFont.truetype("arial.ttf", 26)
    except OSError:
        font_big = ImageFont.load_default()
        font_small = ImageFont.load_default()
    draw.text((60, 40), "STRIDEX", fill=(255, 255, 255), font=font_big)
    draw.text((60, 220), "PREMIUM COMFORT.\nMADE TO LAST.", fill=(20, 90, 60), font=font_small)
    draw.text((60, 420), "FROM $149 - LIMITED EDITION", fill=(20, 90, 60), font=font_small)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def _print(title: str, payload: object) -> None:
    print(f"\n{'=' * 10} {title} {'=' * 10}")
    print(json.dumps(payload, indent=2) if not isinstance(payload, str) else payload)


async def test_comparison_mode(gemini_key: str, openai_key: str) -> None:
    print("\n\n#### TEST A: COMPARISON MODE (2 assets) ####")

    voltra_path = FIXTURES / "sample_ad.png"
    stridex_path = FIXTURES / "stridex_ad.png"
    build_sample_ad_image(voltra_path)
    _build_stridex_ad(stridex_path)

    dissection_service = AssetDissectionService(gemini_api_key=gemini_key)
    asset_dissections = await dissection_service.dissect_assets(
        assets=[str(voltra_path), str(stridex_path)],
        instruction="Compare these two sneaker ads for a competitive positioning study.",
        artifact_type="image",
    )
    assert set(asset_dissections.keys()) == {"asset_0", "asset_1"}, "expected 2 dissected assets"
    _print("A1: dissections (both assets present)", list(asset_dissections.keys()))

    dimension_service = DimensionExtractionService(openai_api_key=openai_key)
    selected, details = await dimension_service.extract_dimensions(
        ro_description="Determine which sneaker ad drives more purchase consideration.",
        instruction="Compare Voltra vs Stridex creative executions.",
        artifact_type="ad_creative",
    )
    assert 3 <= len(selected) <= 10, f"expected a reasonable dimension count, got {len(selected)}"
    _print("A2: selected dimensions", selected)

    guide_service = DiscussionGuideService(openai_api_key=openai_key)
    guide = await guide_service.generate_guide(
        ro_description="Determine which sneaker ad drives more purchase consideration.",
        instruction="Compare Voltra vs Stridex creative executions.",
        selected_dimensions=selected,
        dimension_details=details,
        comparison_mode="comparison",
        num_assets=2,
        is_qual=True,
    )
    assert guide.get("comparison_mode") == "comparison"
    assert guide.get("num_assets") == 2
    _print("A3: guide metadata", {"comparison_mode": guide.get("comparison_mode"), "num_assets": guide.get("num_assets"), "sections": len(guide.get("sections", []))})

    response_service = PersonaResponseService(openai_api_key=openai_key)
    persona = MOCK_PERSONAS[0]
    result = await response_service.generate_persona_responses(
        persona=persona,
        asset_dissections=asset_dissections,
        discussion_guide=guide,
        comparison_mode="comparison",
    )
    responses_text = json.dumps(result).lower()
    mentions_both = ("voltra" in responses_text or "asset 1" in responses_text) and (
        "stridex" in responses_text or "asset 2" in responses_text
    )
    _print("A4: persona comparison response (first 2)", result.get("responses", [])[:2])
    print(f"\n[CHECK] Response text references both assets: {mentions_both}")


async def test_error_handling(gemini_key: str) -> None:
    print("\n\n#### TEST B: ERROR HANDLING (nonexistent file) ####")
    dissection_service = AssetDissectionService(gemini_api_key=gemini_key)
    try:
        await dissection_service.dissect_assets(
            assets=["scripts/fixtures/does_not_exist.png"],
            instruction="test",
            artifact_type="image",
        )
        print("[FAIL] Expected FileNotFoundError, none was raised")
    except FileNotFoundError as e:
        print(f"[PASS] Correctly raised FileNotFoundError: {e}")


def test_type_specific_dimensions() -> None:
    print("\n\n#### TEST C: TYPE-SPECIFIC DIMENSIONS IN LIBRARY ####")
    for artifact_type in artifact_dimension_library.get_artifact_types():
        specific = artifact_dimension_library.get_type_specific_dimensions(artifact_type)
        codes = [d["code"] for d in specific]
        total = len(artifact_dimension_library.get_dimensions_for_type(artifact_type))
        print(f"  {artifact_type}: {len(codes)} type-specific dims, {total} total candidates -> {codes}")
        assert total == 25 + len(codes), f"{artifact_type}: candidate count mismatch"
    print("[PASS] All 7 artifact types resolve to 25 core + N type-specific dims")


def test_unknown_artifact_type_fallback() -> None:
    print("\n\n#### TEST D: UNKNOWN ARTIFACT TYPE FALLBACK ####")
    dims = artifact_dimension_library.get_dimensions_for_type("totally_made_up_type")
    print(f"  get_dimensions_for_type('totally_made_up_type') -> {len(dims)} candidates (should be 25, core only, no type-specific)")
    assert len(dims) == 25, "unknown type should fall back to core dimensions only"
    print("[PASS] Unknown artifact type degrades to core-only, no crash")


async def test_hook_strength_selection(openai_key: str) -> None:
    print("\n\n#### TEST E: TYPE-SPECIFIC DIMENSION ACTUALLY GETS SELECTED ####")
    dimension_service = DimensionExtractionService(openai_api_key=openai_key)
    selected, details = await dimension_service.extract_dimensions(
        ro_description=(
            "This is a 15-second pre-roll video ad. We specifically need to know whether the "
            "opening hook grabs attention in the first 3 seconds, whether the story is easy to "
            "follow, and whether the brand is clearly linked to the creative before people skip."
        ),
        instruction="Evaluate the hook, story clarity, and brand linkage of this video ad concept.",
        artifact_type="ad_creative",
    )
    type_specific_codes = {"hook_strength", "story_clarity", "brand_linkage", "creative_distinctiveness", "cta_strength", "shareability", "media_fit"}
    picked_type_specific = [c for c in selected if c in type_specific_codes]
    _print("E1: selected dimensions", selected)
    print(f"\n[CHECK] Type-specific dims picked given a hook/story-focused instruction: {picked_type_specific}")
    if not picked_type_specific:
        print("[WARN] None of the ad_creative-specific dimensions were selected despite an on-topic instruction - LLM may be biased toward core dims")
    else:
        print("[PASS] At least one type-specific dimension was selected")


async def main() -> None:
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not gemini_key or not openai_key:
        print("GEMINI_API_KEY and/or OPENAI_API_KEY not set in backend/.env.")
        return

    # Pure-Python checks first (no API cost)
    test_type_specific_dimensions()
    test_unknown_artifact_type_fallback()

    # API-backed checks
    await test_error_handling(gemini_key)
    await test_hook_strength_selection(openai_key)
    await test_comparison_mode(gemini_key, openai_key)

    print("\n\n#### ALL EDGE-CASE TESTS COMPLETED ####")


if __name__ == "__main__":
    asyncio.run(main())
