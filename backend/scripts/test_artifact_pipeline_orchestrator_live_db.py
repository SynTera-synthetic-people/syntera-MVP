"""Live-DB end-to-end validation of the artifact pipeline orchestrator
(app/services/artifact_pipeline_orchestrator.py) against the project's own
local Postgres (same DATABASE_URL the app uses). No pytest, no new
dependency — plain asyncio + assert, matching backend/scripts/'s existing
convention.

The four stage services are monkeypatched at the class level (their real
LLM-calling internals are exactly what scripts/test_artifact_pipeline*.py
and test_artifact_pipeline_stage_validation.py already exercise) so this
script is free to focus on what only a real database can prove: checkpoint
persistence, failure + resume (no re-billing of completed stages), and
per-persona failure isolation.

Creates its own minimal fixture chain (User -> Organization -> Workspace ->
Exploration -> ResearchObjectives -> ResearchObjectivesFile x2 -> Persona x2)
and deletes every row it created in a `finally` block, regardless of
pass/fail, so this never leaves test litter in a real dev database.

Usage (from backend/):
    .venv/Scripts/python.exe scripts/test_artifact_pipeline_orchestrator_live_db.py
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_engine
from app.migrations.startup import run_startup_migrations
from app.models.artifact_pipeline import ArtifactPipelineRun, PersonaArtifactResponse
from app.models.exploration import Exploration
from app.models.organization import Organization
from app.models.persona import Persona
from app.models.research_objectives import ResearchObjectives, ResearchObjectivesFile
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.routers.auth_dependencies import get_current_active_user
from app.schemas.artifact_pipeline import (
    ComparisonMode,
    DimensionDetail,
    DimensionSelection,
    DiscussionGuide,
    GuideQuestion,
    GuideSection,
    PersonaAnswer,
    PersonaResponseSet,
)
from app.services.artifact_dissection import AssetDissectionService
from app.services.artifact_pipeline_orchestrator import (
    ArtifactRunValidationError,
    create_run,
    get_run_results,
    get_run_status,
    list_artifact_files,
    run_artifact_pipeline,
)
from app.services.dimension_extraction import DimensionExtractionService
from app.services.discussion_guide import DiscussionGuideService
from app.services.persona_response import PersonaResponseService


# ── LLM service mocking (class-level, so orchestrator-constructed instances pick it up) ──

def _patch_service_classes(*, dissection_fail=False, dimension_fail_once=False, persona_fail_ids=None):
    persona_fail_ids = persona_fail_ids or set()
    state = {"dissection_calls": 0, "dimension_calls": 0}

    def _init_stub(self, *args, **kwargs):
        self._model = kwargs.get("model") or "test-model"

    AssetDissectionService.__init__ = _init_stub
    DimensionExtractionService.__init__ = _init_stub
    DiscussionGuideService.__init__ = _init_stub
    PersonaResponseService.__init__ = _init_stub

    async def _fake_dissect_assets(self, assets, instruction, artifact_type, **kwargs):
        state["dissection_calls"] += 1
        if dissection_fail:
            raise RuntimeError("simulated dissection stage failure")
        return {
            f"asset_{i}": {
                "moments": [], "overall_message": "ok", "overall_tone": "t",
                "visual_structure": "s", "cta": None,
            }
            for i in range(len(assets))
        }

    AssetDissectionService.dissect_assets = _fake_dissect_assets

    async def _fake_extract_dimensions(self, ro_description, instruction, artifact_type, **kwargs):
        state["dimension_calls"] += 1
        if dimension_fail_once and state["dimension_calls"] == 1:
            raise RuntimeError("simulated dimension stage failure (first attempt)")
        return DimensionSelection(
            selected_codes=["artifact_comprehension"],
            details={
                "artifact_comprehension": DimensionDetail(
                    name="Comprehension", description="d", questions=[], theme="t"
                )
            },
        )

    DimensionExtractionService.extract_dimensions = _fake_extract_dimensions

    async def _fake_generate_guide(
        self, ro_description, instruction, selected_dimensions, dimension_details,
        comparison_mode, num_assets=1, is_qual=True, **kwargs,
    ):
        return DiscussionGuide(
            title="Test Guide",
            comparison_mode=ComparisonMode(comparison_mode),
            num_assets=num_assets,
            sections=[
                GuideSection(
                    dimension="artifact_comprehension", theme="t", dimension_name="Comprehension",
                    description="d", questions=[GuideQuestion(question="Q1?", type="open")],
                )
            ],
        )

    DiscussionGuideService.generate_guide = _fake_generate_guide

    async def _fake_generate_persona_responses(self, persona, asset_dissections, discussion_guide, comparison_mode, **kwargs):
        persona_id = kwargs.get("persona_id")
        if persona_id in persona_fail_ids:
            raise RuntimeError(f"simulated persona failure for {persona_id}")
        return PersonaResponseSet(
            persona_name=persona.get("name", "Unknown"),
            responses=[PersonaAnswer(dimension="artifact_comprehension", question="Q1?", response="A1", reasoning="r")],
        )

    PersonaResponseService.generate_persona_responses = _fake_generate_persona_responses

    return state


# ── Fixtures ──

class Fixtures:
    def __init__(self):
        self.user_id = None
        self.org_id = None
        self.workspace_id = None
        self.exploration_id = None
        self.ro_id = None
        self.member_id = None
        self.file_ids: list[str] = []
        self.persona_ids: list[str] = []
        self.run_ids: list[str] = []


async def _create_fixtures() -> Fixtures:
    fx = Fixtures()
    tag = uuid.uuid4().hex[:8]
    async with AsyncSession(async_engine) as db:
        user = User(email=f"artifact-pipeline-e2e-{tag}@example.test", hashed_password="not-a-real-hash")
        db.add(user)
        await db.flush()
        fx.user_id = user.id

        org = Organization(name=f"E2E Test Org {tag}", owner_id=user.id)
        db.add(org)
        await db.flush()
        fx.org_id = org.id

        workspace = Workspace(name=f"E2E Test Workspace {tag}", organization_id=org.id)
        db.add(workspace)
        await db.flush()
        fx.workspace_id = workspace.id

        exploration = Exploration(
            workspace_id=workspace.id, title=f"E2E Test Exploration {tag}",
            description="Artifact pipeline orchestrator e2e test exploration", created_by=user.id,
        )
        db.add(exploration)
        await db.flush()
        fx.exploration_id = exploration.id

        ro = ResearchObjectives(
            exploration_id=exploration.id, description="Test RO description for artifact pipeline e2e",
            created_by=user.id, validation_status="validated", confidence_level=90,
        )
        db.add(ro)
        await db.flush()
        fx.ro_id = ro.id

        file1 = ResearchObjectivesFile(
            exploration_id=exploration.id, original_name="fake_ad.png",
            material_kind="artifact", source_url="https://example.test/fake_ad.png",
        )
        db.add(file1)
        await db.flush()
        fx.file_ids.append(file1.id)

        for i in range(2):
            persona = Persona(
                exploration_id=exploration.id, workspace_id=workspace.id, created_by=user.id,
                name=f"Test Persona {i}", age_range="25-34", gender="female",
                location_country="US", education_level="Bachelor's", occupation="Manager",
                income_range="$50k-75k",
            )
            db.add(persona)
            await db.flush()
            fx.persona_ids.append(persona.id)

        member = WorkspaceMember(
            # role="admin": /framer-materials requires workspace-admin, and
            # admin is a superset of the member-level access the other tests need.
            workspace_id=workspace.id, user_id=user.id, email=user.email, role="admin", accepted=True,
        )
        db.add(member)
        await db.flush()
        fx.member_id = member.id

        await db.commit()
    return fx


async def _cleanup_fixtures(fx: Fixtures) -> None:
    async with AsyncSession(async_engine) as db:
        for run_id in fx.run_ids:
            await db.execute(delete(PersonaArtifactResponse).where(PersonaArtifactResponse.run_id == run_id))
        if fx.run_ids:
            await db.execute(delete(ArtifactPipelineRun).where(ArtifactPipelineRun.id.in_(fx.run_ids)))
        if fx.member_id:
            await db.execute(delete(WorkspaceMember).where(WorkspaceMember.id == fx.member_id))
        if fx.persona_ids:
            await db.execute(delete(Persona).where(Persona.id.in_(fx.persona_ids)))
        if fx.file_ids:
            await db.execute(delete(ResearchObjectivesFile).where(ResearchObjectivesFile.id.in_(fx.file_ids)))
        if fx.ro_id:
            await db.execute(delete(ResearchObjectives).where(ResearchObjectives.id == fx.ro_id))
        if fx.exploration_id:
            await db.execute(delete(Exploration).where(Exploration.id == fx.exploration_id))
        if fx.workspace_id:
            await db.execute(delete(Workspace).where(Workspace.id == fx.workspace_id))
        if fx.org_id:
            await db.execute(delete(Organization).where(Organization.id == fx.org_id))
        if fx.user_id:
            await db.execute(delete(User).where(User.id == fx.user_id))
        await db.commit()
    print(f"[cleanup] deleted all fixture rows (user={fx.user_id}, runs={fx.run_ids})")


# ── Tests ──

async def test_happy_path(fx: Fixtures) -> None:
    print("\n#### TEST A: happy path (create_run -> run_artifact_pipeline -> completed) ####")
    _patch_service_classes()

    run_id = await create_run(
        workspace_id=fx.workspace_id, exploration_id=fx.exploration_id, created_by=fx.user_id,
        source_file_ids=[fx.file_ids[0]], persona_ids=fx.persona_ids,
        instruction="Test instruction", artifact_type="image", artifact_category="ad_creative",
        comparison_mode=ComparisonMode.CAMPAIGN_SET,
    )
    fx.run_ids.append(run_id)

    await run_artifact_pipeline(run_id)

    status = await get_run_status(run_id)
    assert status["status"] == "completed", f"expected completed, got {status}"
    assert all(status["stages_completed"].values()), f"expected all stages done, got {status['stages_completed']}"
    assert status["persona_progress"]["completed"] == 2
    assert status["persona_progress"]["failed"] == 0

    results = await get_run_results(run_id)
    assert results["discussion_guide"]["title"] == "Test Guide"
    assert len(results["persona_responses"]) == 2
    print(f"[PASS] run {run_id} completed end-to-end: {status['stages_completed']}, personas: {status['persona_progress']}")


async def test_derive_category_and_mode_from_files(fx: Fixtures) -> None:
    print("\n#### TEST A2: create_run derives artifact_category/comparison_mode from the selected files ####")
    _patch_service_classes()

    # Simulate what submit_framer_material_section now stores at upload time.
    async with AsyncSession(async_engine) as db:
        file_row = (await db.execute(
            select(ResearchObjectivesFile).where(ResearchObjectivesFile.id == fx.file_ids[0])
        )).scalars().first()
        file_row.artifact_category = "packaging"
        file_row.comparison_mode = "compare"  # frontend's own vocabulary, not "comparison"
        db.add(file_row)
        await db.commit()

    # A second artifact file so comparison_mode="compare" (2+ assets) is valid.
    async with AsyncSession(async_engine) as db:
        file2 = ResearchObjectivesFile(
            exploration_id=fx.exploration_id, original_name="fake_ad_2.png",
            material_kind="artifact", source_url="https://example.test/fake_ad_2.png",
            artifact_category="packaging", comparison_mode="compare",
        )
        db.add(file2)
        await db.commit()
        await db.refresh(file2)
        fx.file_ids.append(file2.id)

    run_id = await create_run(
        workspace_id=fx.workspace_id, exploration_id=fx.exploration_id, created_by=fx.user_id,
        source_file_ids=[fx.file_ids[0], fx.file_ids[1]], persona_ids=fx.persona_ids,
        instruction="Test instruction", artifact_type="image",
        # artifact_category/comparison_mode deliberately omitted — must be derived
    )
    fx.run_ids.append(run_id)

    async with AsyncSession(async_engine) as db:
        run = await db.get(ArtifactPipelineRun, run_id)
        assert run.artifact_category == "packaging", f"expected derived 'packaging', got {run.artifact_category}"
        assert run.comparison_mode == "comparison", f"expected 'compare' mapped to 'comparison', got {run.comparison_mode}"
    print(f"[PASS] run {run_id}: artifact_category='packaging' and comparison_mode='compare'->'comparison' both derived from the files, no explicit params passed")


async def test_failure_then_resume(fx: Fixtures) -> None:
    print("\n#### TEST B: stage failure marks run failed + resume skips completed stages (no re-billing) ####")
    state = _patch_service_classes(dimension_fail_once=True)

    run_id = await create_run(
        workspace_id=fx.workspace_id, exploration_id=fx.exploration_id, created_by=fx.user_id,
        source_file_ids=[fx.file_ids[0]], persona_ids=fx.persona_ids,
        instruction="Test instruction", artifact_type="image", artifact_category="ad_creative",
        comparison_mode=ComparisonMode.CAMPAIGN_SET,
    )
    fx.run_ids.append(run_id)

    await run_artifact_pipeline(run_id)
    status = await get_run_status(run_id)
    assert status["status"] == "failed", f"expected failed, got {status}"
    assert status["error_stage"] == "selecting_dimensions", f"expected error_stage=selecting_dimensions, got {status}"
    assert status["stages_completed"]["dissecting"] is True, "stage 1 output should survive the stage-2 failure"
    assert status["stages_completed"]["selecting_dimensions"] is False
    assert state["dissection_calls"] == 1
    print(f"[PASS] run failed at selecting_dimensions as expected, stage 1 output persisted: {status['stages_completed']}")

    # Resume: same run_id, dimension_fail_once no longer forces a failure this time.
    await run_artifact_pipeline(run_id)
    status = await get_run_status(run_id)
    assert status["status"] == "completed", f"expected completed after resume, got {status}"
    assert state["dissection_calls"] == 1, (
        f"expected dissection to NOT be re-called on resume (no re-billing), got {state['dissection_calls']} calls"
    )
    print(f"[PASS] resumed run completed; dissection was called exactly once total across both attempts (no re-billing)")


async def test_persona_isolation(fx: Fixtures) -> None:
    print("\n#### TEST C: per-persona failure isolation ####")
    failing_persona = fx.persona_ids[0]
    ok_persona = fx.persona_ids[1]
    _patch_service_classes(persona_fail_ids={failing_persona})

    run_id = await create_run(
        workspace_id=fx.workspace_id, exploration_id=fx.exploration_id, created_by=fx.user_id,
        source_file_ids=[fx.file_ids[0]], persona_ids=fx.persona_ids,
        instruction="Test instruction", artifact_type="image", artifact_category="ad_creative",
        comparison_mode=ComparisonMode.CAMPAIGN_SET,
    )
    fx.run_ids.append(run_id)

    await run_artifact_pipeline(run_id)

    status = await get_run_status(run_id)
    assert status["status"] == "completed", f"expected run to complete despite one persona failing, got {status}"
    assert status["persona_progress"]["completed"] == 1
    assert status["persona_progress"]["failed"] == 1

    results = await get_run_results(run_id)
    by_persona = {r["persona_id"]: r for r in results["persona_responses"]}
    assert by_persona[failing_persona]["status"] == "failed"
    assert "simulated persona failure" in by_persona[failing_persona]["error_message"]
    assert by_persona[ok_persona]["status"] == "completed"
    assert by_persona[ok_persona]["response"] is not None
    print(
        f"[PASS] run completed overall; {failing_persona} isolated as failed, "
        f"{ok_persona} completed normally — one persona's failure did not affect the other"
    )


async def test_create_run_validation_rejects_foreign_ids(fx: Fixtures) -> None:
    print("\n#### TEST D: create_run rejects file/persona ids that don't belong to this exploration ####")
    _patch_service_classes()
    try:
        await create_run(
            workspace_id=fx.workspace_id, exploration_id=fx.exploration_id, created_by=fx.user_id,
            source_file_ids=["not-a-real-file-id"], persona_ids=fx.persona_ids,
            instruction="x", artifact_type="image", artifact_category="ad_creative",
            comparison_mode=ComparisonMode.CAMPAIGN_SET,
        )
        print("[FAIL] expected ArtifactRunValidationError")
    except ArtifactRunValidationError as exc:
        print(f"[PASS] rejected foreign source_file_id: {exc}")


async def test_framer_materials_multi_file_append(fx: Fixtures) -> None:
    print("\n#### TEST F: /framer-materials — multi-file upload, required category, append-not-replace ####")
    import app.main as main_module

    fake_user = SimpleNamespace(id=fx.user_id)
    main_module.app.dependency_overrides[get_current_active_user] = lambda: fake_user
    transport = httpx.ASGITransport(app=main_module.app)

    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            base = f"/workspaces/{fx.workspace_id}/research/objectives/framer-materials"

            # F1: missing artifact_category on a kind="artifact" submission -> 400
            resp = await client.post(
                base, params={"exploration_id": fx.exploration_id},
                data={"kind": "artifact", "instruction": "x"},
                files=[("files", ("a.png", b"fake-bytes-a", "image/png"))],
            )
            assert resp.status_code == 400, f"expected 400 without artifact_category, got {resp.status_code}: {resp.text}"
            print("[PASS] submitting artifact files without artifact_category -> 400")

            # F2: first submission — 2 files + category + comparison_mode. The
            # response is the FULL current set of unlinked "artifact" materials
            # for this exploration (by design — see replace_framer_materials_for_kind),
            # which may already include earlier tests' fixture files, so assert
            # deltas/name-presence rather than an absolute count.
            before_count = len(await list_artifact_files(fx.exploration_id))

            resp = await client.post(
                base, params={"exploration_id": fx.exploration_id},
                data={"kind": "artifact", "instruction": "x", "artifact_category": "claim", "comparison_mode": "compare"},
                files=[
                    ("files", ("first_a.png", b"fake-bytes-1", "image/png")),
                    ("files", ("first_b.png", b"fake-bytes-2", "image/png")),
                ],
            )
            assert resp.status_code == 201, f"expected 201, got {resp.status_code}: {resp.text}"
            body1 = resp.json()["data"]
            names1 = {m["original_name"] for m in body1}
            assert {"first_a.png", "first_b.png"} <= names1, f"expected both new files present, got {names1}"
            assert len(body1) == before_count + 2, f"expected {before_count + 2} total materials, got {len(body1)}"
            new_items1 = [m for m in body1 if m["original_name"] in {"first_a.png", "first_b.png"}]
            assert all(m["artifact_category"] == "claim" for m in new_items1)
            assert all(m["comparison_mode"] == "compare" for m in new_items1)
            print(f"[PASS] first submission: {len(names1)} new files present ({before_count} pre-existing + 2 new = {len(body1)} total), category+mode stored")

            # F3: second submission — 1 more file — must APPEND, not replace F2's 2 files
            resp = await client.post(
                base, params={"exploration_id": fx.exploration_id},
                data={"kind": "artifact", "instruction": "x", "artifact_category": "claim"},
                files=[("files", ("second.png", b"fake-bytes-3", "image/png"))],
            )
            assert resp.status_code == 201, f"expected 201, got {resp.status_code}: {resp.text}"
            body2 = resp.json()["data"]
            assert len(body2) == before_count + 3, f"expected {before_count + 3} total materials after append, got {len(body2)}: {[m['original_name'] for m in body2]}"
            names2 = {m["original_name"] for m in body2}
            assert {"first_a.png", "first_b.png", "second.png"} <= names2, f"expected all 3 files to survive the append, got {names2}"
            print(f"[PASS] second submission appended instead of replacing: {len(body2)} total files ({before_count} pre-existing + 3 new), nothing lost")
    finally:
        main_module.app.dependency_overrides.pop(get_current_active_user, None)


async def test_router_http_layer(fx: Fixtures) -> None:
    print("\n#### TEST E: HTTP routes (POST /runs, GET /runs/{id}, GET /runs/{id}/results) via httpx+ASGITransport ####")
    import app.main as main_module

    _patch_service_classes()
    fake_user = SimpleNamespace(id=fx.user_id)
    main_module.app.dependency_overrides[get_current_active_user] = lambda: fake_user

    # httpx.AsyncClient + ASGITransport runs the app in-process on this same
    # event loop — unlike the sync TestClient (which spins up a separate
    # thread/loop via anyio's blocking portal), this avoids "attached to a
    # different loop" errors against the asyncpg connection pool this script
    # already opened on the current loop.
    transport = httpx.ASGITransport(app=main_module.app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            base = f"/workspaces/{fx.workspace_id}/explorations/{fx.exploration_id}/artifacts"
            resp = await client.post(f"{base}/runs", json={
                "source_file_ids": [fx.file_ids[0]],
                "persona_ids": fx.persona_ids,
                "instruction": "Test instruction via HTTP",
                "artifact_type": "image",
                "artifact_category": "ad_creative",
                "comparison_mode": "campaign_set",
            })
            assert resp.status_code == 202, f"expected 202, got {resp.status_code}: {resp.text}"
            run_id = resp.json()["data"]["run_id"]
            fx.run_ids.append(run_id)
            print(f"[PASS] POST {base}/runs -> 202, run_id={run_id}")

            # BackgroundTasks run (and are awaited) as part of the same ASGI
            # call before the response is returned, so the pipeline has
            # already finished by this point.
            resp = await client.get(f"{base}/runs/{run_id}")
            assert resp.status_code == 200, f"expected 200, got {resp.status_code}: {resp.text}"
            status = resp.json()
            assert status["status"] == "completed", f"expected completed, got {status}"
            print("[PASS] GET /runs/{run_id} -> 200, status=completed")

            resp = await client.get(f"{base}/runs/{run_id}/results")
            assert resp.status_code == 200, f"expected 200, got {resp.status_code}: {resp.text}"
            results = resp.json()
            assert len(results["persona_responses"]) == 2
            print(f"[PASS] GET /runs/{{run_id}}/results -> 200, {len(results['persona_responses'])} persona responses")

            resp = await client.get(f"{base}/runs/not-a-real-run-id")
            assert resp.status_code == 404, f"expected 404 for unknown run_id, got {resp.status_code}"
            print("[PASS] GET on an unknown run_id -> 404")
    finally:
        main_module.app.dependency_overrides.pop(get_current_active_user, None)


async def main() -> None:
    print("Running startup migrations against the live DB (idempotent, additive-only)...")
    await run_startup_migrations()
    print("Migrations complete.\n")

    fx = await _create_fixtures()
    print(f"Created fixtures: user={fx.user_id}, workspace={fx.workspace_id}, exploration={fx.exploration_id}")

    try:
        await test_happy_path(fx)
        await test_derive_category_and_mode_from_files(fx)
        await test_failure_then_resume(fx)
        await test_persona_isolation(fx)
        await test_create_run_validation_rejects_foreign_ids(fx)
        await test_framer_materials_multi_file_append(fx)
        await test_router_http_layer(fx)
        print("\n\n#### ALL LIVE-DB ORCHESTRATOR TESTS PASSED ####")
    finally:
        await _cleanup_fixtures(fx)


if __name__ == "__main__":
    asyncio.run(main())
