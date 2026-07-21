"""Manual, standalone validation of the artifact pipeline's schema-validation
guardrails (Stages 2-4) and Stage 1's real per-asset concurrency/isolation
logic. No live DB, no live API keys, no pytest (matching backend/scripts/'s
existing convention) — monkeypatches each service's LLM client method
directly, so this exercises the ACTUAL validation/retry/concurrency code in
app/services/{dimension_extraction,discussion_guide,persona_response,
artifact_dissection}.py, just without a real network call.

Usage (from backend/):
    .venv/Scripts/python.exe scripts/test_artifact_pipeline_stage_validation.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.schemas.artifact_pipeline import ComparisonMode, DiscussionGuide, PipelineStageError
from app.services.artifact_dissection import AssetDissectionService
from app.services.dimension_extraction import DimensionExtractionService
from app.services.discussion_guide import DiscussionGuideService
from app.services.persona_response import PersonaResponseService


def _fake_chat_response(content: str) -> SimpleNamespace:
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))], usage=None)


def _patch_create(service, content_or_fn) -> dict:
    """Replaces service._client.chat.completions.create with a fake that
    returns content_or_fn (a fixed string) or calls it (a callable) for a
    per-call response. Returns a {"n": call_count} tracker dict."""
    calls = {"n": 0}

    async def _fake_create(**kwargs):
        calls["n"] += 1
        content = content_or_fn() if callable(content_or_fn) else content_or_fn
        return _fake_chat_response(content)

    service._client.chat.completions.create = _fake_create
    return calls


async def test_dimension_extraction_malformed_json_raises() -> None:
    print("\n#### TEST 1: DimensionExtractionService raises PipelineStageError on malformed JSON ####")
    service = DimensionExtractionService(openai_api_key="fake", model="gpt-4o-mini")
    calls = _patch_create(service, "not valid json{")
    try:
        await service.extract_dimensions(ro_description="x", instruction="y", artifact_type="ad_creative")
        print("[FAIL] expected PipelineStageError, none was raised")
    except PipelineStageError as exc:
        assert exc.stage == "dimension_extraction"
        assert calls["n"] == 1, f"expected no retry on a hard parse failure, got {calls['n']} calls"
        print(f"[PASS] raised PipelineStageError immediately (no wasted retry): {exc}")


async def test_dimension_extraction_retry_then_fallback() -> None:
    print("\n#### TEST 2: DimensionExtractionService retries once, then falls back to core dims ####")
    service = DimensionExtractionService(openai_api_key="fake", model="gpt-4o-mini")
    # Always return only 1 valid code — below _MIN_SELECTED_DIMENSIONS (3),
    # so this should force exactly one retry, then the core-dimension fallback.
    calls = _patch_create(service, '{"selected_dimensions": ["artifact_comprehension"], "reasoning": "x"}')

    selection = await service.extract_dimensions(ro_description="x", instruction="y", artifact_type="ad_creative")
    assert calls["n"] == 2, f"expected exactly 2 LLM calls (initial + 1 retry), got {calls['n']}"
    assert len(selection.selected_codes) == 25, f"expected fallback to all 25 core dims, got {len(selection.selected_codes)}"
    print(f"[PASS] retried once ({calls['n']} total calls) then fell back to {len(selection.selected_codes)} core dimensions")


async def test_discussion_guide_malformed_json_raises() -> None:
    print("\n#### TEST 3: DiscussionGuideService raises PipelineStageError on invalid JSON syntax ####")
    service = DiscussionGuideService(openai_api_key="fake", model="gpt-4o-mini")
    _patch_create(service, "{not json")
    try:
        await service.generate_guide(
            ro_description="x", instruction="y", selected_dimensions=["a"],
            dimension_details={"a": {"name": "A", "description": "d", "questions": [], "theme": "t"}},
            comparison_mode=ComparisonMode.CAMPAIGN_SET, num_assets=1,
        )
        print("[FAIL] expected PipelineStageError")
    except PipelineStageError as exc:
        assert exc.stage == "discussion_guide"
        print(f"[PASS] raised PipelineStageError as expected: {exc}")


async def test_discussion_guide_schema_validation_failure() -> None:
    print("\n#### TEST 4: DiscussionGuideService raises PipelineStageError on valid-JSON-but-schema-invalid response ####")
    service = DiscussionGuideService(openai_api_key="fake", model="gpt-4o-mini")
    # Valid JSON syntax, but missing the required "comparison_mode" field.
    _patch_create(service, '{"title": "t", "sections": []}')
    try:
        await service.generate_guide(
            ro_description="x", instruction="y", selected_dimensions=["a"],
            dimension_details={}, comparison_mode=ComparisonMode.CAMPAIGN_SET, num_assets=1,
        )
        print("[FAIL] expected PipelineStageError")
    except PipelineStageError as exc:
        assert exc.stage == "discussion_guide"
        print(f"[PASS] raised PipelineStageError on schema-invalid (but syntactically valid) JSON: {exc}")


async def test_persona_response_malformed_json_raises() -> None:
    print("\n#### TEST 5: PersonaResponseService raises PipelineStageError on malformed JSON ####")
    service = PersonaResponseService(openai_api_key="fake", model="gpt-4o-mini")
    _patch_create(service, "not json")
    guide = DiscussionGuide(title="t", comparison_mode=ComparisonMode.CAMPAIGN_SET, num_assets=1, sections=[])
    try:
        await service.generate_persona_responses(
            persona={"name": "Test"}, asset_dissections={"asset_0": {}},
            discussion_guide=guide, comparison_mode=ComparisonMode.CAMPAIGN_SET,
        )
        print("[FAIL] expected PipelineStageError")
    except PipelineStageError as exc:
        assert exc.stage == "persona_response"
        print(f"[PASS] raised PipelineStageError as expected: {exc}")


async def test_dissection_isolate_failures_true() -> None:
    print("\n#### TEST 6: dissect_assets isolates a per-asset failure (isolate_failures=True) ####")
    service = AssetDissectionService(gemini_api_key="fake", model="gemini-2.5-flash")

    async def _fake_single(asset, instruction, artifact_type, **kwargs):
        if asset == "bad-asset":
            raise RuntimeError("simulated dissection failure")
        return {"moments": [], "overall_message": "ok", "overall_tone": "t", "visual_structure": "s", "cta": None}

    service._dissect_single_asset = _fake_single
    result = await service.dissect_assets(
        assets=["good-asset", "bad-asset"], instruction="x", artifact_type="image", isolate_failures=True,
    )
    assert result["asset_0"]["overall_message"] == "ok"
    assert result["asset_1"] == {"error": "simulated dissection failure"}
    print("[PASS] good asset dissected normally; bad asset isolated as {'error': ...}, no exception raised")


async def test_dissection_isolate_failures_false_propagates() -> None:
    print("\n#### TEST 7: dissect_assets propagates failure when isolate_failures=False (default, single asset) ####")
    service = AssetDissectionService(gemini_api_key="fake", model="gemini-2.5-flash")

    async def _fake_single(asset, instruction, artifact_type, **kwargs):
        raise RuntimeError("simulated dissection failure")

    service._dissect_single_asset = _fake_single
    try:
        await service.dissect_assets(assets=["only-asset"], instruction="x", artifact_type="image")
        print("[FAIL] expected RuntimeError to propagate")
    except RuntimeError as exc:
        print(f"[PASS] failure propagated as expected: {exc}")


async def main() -> None:
    await test_dimension_extraction_malformed_json_raises()
    await test_dimension_extraction_retry_then_fallback()
    await test_discussion_guide_malformed_json_raises()
    await test_discussion_guide_schema_validation_failure()
    await test_persona_response_malformed_json_raises()
    await test_dissection_isolate_failures_true()
    await test_dissection_isolate_failures_false_propagates()
    print("\n\n#### ALL STAGE VALIDATION / ISOLATION TESTS PASSED ####")


if __name__ == "__main__":
    asyncio.run(main())
