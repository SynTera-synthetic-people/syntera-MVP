"""Unit tests for the Persona Library.

The library is a live view over the organisation's personas — no publish step,
no library table. These cover the copy mapping and the reuse branching; the
import path runs against a fake AsyncSession so no database is needed.

Run: pytest tests/test_persona_library.py -v
"""
from __future__ import annotations

import asyncio
from datetime import datetime

import pytest

from app.models.persona import Persona
from app.schemas.persona_library import PersonaLibraryImportRequest
from app.services import persona_library as svc


# ── Fixtures / helpers ───────────────────────────────────────────────────────

def _source(**overrides) -> Persona:
    defaults = dict(
        id="per_source",
        exploration_id="exp_origin",
        workspace_id="ws_origin",
        name="Silver Spender",
        age_range="55-64",
        gender="Male",
        location_country="Germany",
        location_state="Bavaria",
        education_level="Masters",
        occupation="Retired executive",
        income_range="120k-180k",
        geography="Germany",
        interests=["golf", "wine"],
        lifestyle="affluent urban",
        ocean_profile={"openness": 0.6},
        persona_details={"foo": "bar"},
        calibration_status="calibrated",
        calibration_confidence=88,
        master_calibration_confidence=90,
        auto_generated_persona=True,
        created_by="user_1",
        created_at=datetime(2026, 1, 1),
    )
    defaults.update(overrides)
    return Persona(**defaults)


def _kwargs(source=None, **kw):
    return svc._persona_kwargs_from_source(
        source if source is not None else _source(),
        exploration_id=kw.get("exploration_id", "exp_target"),
        workspace_id=kw.get("workspace_id", "ws_target"),
        created_by=kw.get("created_by", "user_9"),
    )


# ── The quota-critical invariant ─────────────────────────────────────────────

def test_reuse_never_sets_parent_persona_id():
    """The single most important invariant in this feature.

    _count_primary_personas filters `parent_persona_id IS NULL`. If a reuse set
    that column the persona would be invisible to the quota counter, and
    selecting 4 from the library would still generate 4 more.
    """
    kwargs = _kwargs()
    assert "parent_persona_id" not in kwargs or kwargs["parent_persona_id"] is None


def test_reuse_records_the_source_persona():
    kwargs = _kwargs()
    assert kwargs["library_source_persona_id"] == "per_source"
    assert isinstance(kwargs["library_imported_at"], datetime)


def test_reuse_targets_the_new_exploration_not_the_origin():
    kwargs = _kwargs(exploration_id="exp_new", workspace_id="ws_new")
    assert kwargs["exploration_id"] == "exp_new"
    assert kwargs["workspace_id"] == "ws_new"
    origin = kwargs["persona_details"]["library_origin"]
    assert origin["origin_exploration_id"] == "exp_origin"
    assert origin["source_persona_id"] == "per_source"


def test_reuse_generates_a_fresh_id():
    a, b = _kwargs()["id"], _kwargs()["id"]
    assert a != b and a != "per_source"


# ── Field mapping ────────────────────────────────────────────────────────────

def test_required_not_null_columns_always_get_a_string():
    bare = _source(name=None, age_range=None, gender=None, location_country=None,
                   education_level=None, occupation=None, income_range=None)
    kwargs = _kwargs(bare)
    for field in svc._REQUIRED_STR_FIELDS:
        assert kwargs[field] == "", f"{field} must default to '' not None"


def test_list_valued_traits_are_joined_for_varchar_columns():
    assert _kwargs(_source(lifestyle=["urban", "active"]))["lifestyle"] == "urban, active"


def test_interests_stays_a_list_and_non_lists_become_none():
    assert _kwargs()["interests"] == ["golf", "wine"]
    assert _kwargs(_source(interests="golf, wine"))["interests"] is None


def test_ocean_profile_only_survives_as_a_dict():
    assert _kwargs()["ocean_profile"] == {"openness": 0.6}
    assert _kwargs(_source(ocean_profile="nope"))["ocean_profile"] is None


def test_draft_source_is_copied_as_calibrated():
    """Drafts are filtered out of the listing, but if one reaches the copy path
    it must not land as a draft — that would drop it into the not-yet-calibrated
    branches downstream."""
    assert _kwargs(_source(calibration_status="draft"))["calibration_status"] == "calibrated"
    assert _kwargs(_source(calibration_status=None))["calibration_status"] == "calibrated"


def test_confidence_carries_over():
    kwargs = _kwargs()
    assert kwargs["master_calibration_confidence"] == 90
    assert kwargs["calibration_confidence"] == 88


def test_original_authorship_is_preserved():
    assert _kwargs()["auto_generated_persona"] is True
    assert _kwargs(_source(auto_generated_persona=False))["auto_generated_persona"] is False


def test_persona_details_is_json_safe_even_with_datetimes():
    kwargs = _kwargs(_source(persona_details={"when": datetime(2026, 5, 1)}))
    assert kwargs["persona_details"]["when"] == "2026-05-01 00:00:00"


def test_missing_persona_details_still_yields_a_dict_with_breadcrumb():
    kwargs = _kwargs(_source(persona_details=None))
    assert isinstance(kwargs["persona_details"], dict)
    assert "library_origin" in kwargs["persona_details"]


def test_copying_does_not_mutate_the_source_details():
    source = _source(persona_details={"foo": "bar"})
    _kwargs(source)
    assert "library_origin" not in source.persona_details


# ── Request validation ───────────────────────────────────────────────────────

def test_duplicate_ids_are_deduped_preserving_order():
    req = PersonaLibraryImportRequest(source_persona_ids=["b", "a", "b", "c", "a"])
    assert req.source_persona_ids == ["b", "a", "c"]


def test_blank_ids_are_stripped_and_all_blank_is_rejected():
    assert PersonaLibraryImportRequest(
        source_persona_ids=[" a ", "", "a"]
    ).source_persona_ids == ["a"]
    with pytest.raises(Exception):
        PersonaLibraryImportRequest(source_persona_ids=["", "   "])


def test_empty_selection_is_rejected():
    with pytest.raises(Exception):
        PersonaLibraryImportRequest(source_persona_ids=[])


# ── Library filters ──────────────────────────────────────────────────────────

def test_library_excludes_drafts_copies_and_the_current_exploration():
    """The filter set is what makes the library 'automatic' but not noisy."""
    rendered = " ".join(str(f) for f in svc._library_filters("org_1", "exp_here"))
    assert "organization_id" in rendered          # tenant isolation
    assert "is_deleted" in rendered               # dead explorations excluded
    assert "library_source_persona_id" in rendered  # copies excluded
    assert "calibration_status" in rendered       # drafts excluded
    assert "exploration_id" in rendered           # current exploration excluded


def test_library_filter_without_an_exploration_keeps_everything_else():
    filters = svc._library_filters("org_1", None)
    assert len(filters) == len(svc._library_filters("org_1", "exp_here")) - 1


# ── Summary projection ───────────────────────────────────────────────────────

def _summary(persona=None, **kw):
    return svc._summary(
        persona if persona is not None else _source(),
        exploration_title=kw.get("exploration_title", "EV Research"),
        workspace_name=kw.get("workspace_name", "Workspace A"),
        workspace_id=kw.get("workspace_id", "ws_origin"),
        creator_name=kw.get("creator_name"),
        times_reused=kw.get("times_reused", 0),
        already_imported=kw.get("already_imported", False),
    )


def test_summary_id_is_the_source_persona_id():
    """The client sends this straight back to reuse the persona."""
    assert _summary()["id"] == "per_source"


def test_summary_prefers_master_confidence_then_falls_back():
    assert _summary()["master_calibration_confidence"] == 90
    fallback = _summary(_source(master_calibration_confidence=None, calibration_confidence=71))
    assert fallback["master_calibration_confidence"] == 71


def test_summary_falls_back_to_country_when_geography_missing():
    assert _summary(_source(geography=None))["geography"] == "Germany"


def test_summary_labels_the_persona_source():
    assert _summary()["persona_source"] == "omi"
    assert _summary(_source(auto_generated_persona=False))["persona_source"] == "manual"
    assert _summary(_source(parent_persona_id="per_other"))["persona_source"] == "replicated"


def test_summary_shows_omi_as_creator_for_generated_personas():
    assert _summary(creator_name="Lena")["created_by_name"] == "Omi"
    manual = _summary(_source(auto_generated_persona=False), creator_name="Lena")
    assert manual["created_by_name"] == "Lena"


def test_summary_carries_origin_and_reuse_metadata():
    s = _summary(times_reused=3, already_imported=True)
    assert s["origin_exploration_title"] == "EV Research"
    assert s["origin_workspace_name"] == "Workspace A"
    assert s["times_reused"] == 3 and s["already_imported"] is True


def test_summary_does_not_ship_the_whole_persona():
    """The picker lists many at once; persona_details is large."""
    assert "persona_details" not in _summary()


# ── Fake session for the import path ─────────────────────────────────────────

class _Scalars:
    def __init__(self, rows): self._rows = rows
    def all(self): return list(self._rows)


class _Result:
    def __init__(self, rows): self._rows = rows
    def scalars(self): return _Scalars([r[0] if isinstance(r, tuple) else r for r in self._rows])
    def all(self): return list(self._rows)


class FakeSession:
    """Just enough AsyncSession for import_personas.

    `execute` is answered from a queue in call order: first the source-persona
    lookup (rows of (Persona, org_id)), then the already-imported lookup.
    """

    def __init__(self, results):
        self._results = list(results)
        self.added = []
        self.committed = False
        self.rolled_back = False

    async def execute(self, _stmt):
        return _Result(self._results.pop(0))

    def add(self, obj): self.added.append(obj)
    async def commit(self): self.committed = True
    async def rollback(self): self.rolled_back = True
    async def refresh(self, _obj): return None


def _run_import(sources, already, ids, *, limit=4, used=0, org="org_1"):
    session = FakeSession([sources, already])
    created, skipped = asyncio.run(
        svc.import_personas(
            session,
            org_id=org,
            workspace_id="ws_target",
            exploration_id="exp_target",
            source_persona_ids=ids,
            user_id="user_9",
            persona_limit=limit,
            current_persona_count=used,
        )
    )
    return session, created, skipped


def _row(pid, org="org_1", **kw):
    return (_source(id=pid, **kw), org)


# ── Import behaviour ─────────────────────────────────────────────────────────

def test_full_library_selection_imports_everything():
    rows = [_row(f"p{i}") for i in range(1, 5)]
    session, created, skipped = _run_import(rows, [], [f"p{i}" for i in range(1, 5)])
    assert len(created) == 4 and skipped == []
    assert session.committed


def test_partial_selection_leaves_room_for_generation():
    rows = [_row("p1"), _row("p2")]
    _, created, skipped = _run_import(rows, [], ["p1", "p2"], limit=4)
    assert len(created) == 2 and skipped == []


def test_selection_order_is_preserved():
    rows = [_row("p1"), _row("p2"), _row("p3")]
    _, created, _ = _run_import(rows, [], ["p3", "p1", "p2"])
    assert [c.library_source_persona_id for c in created] == ["p3", "p1", "p2"]


def test_persona_from_another_organization_is_skipped():
    _, created, skipped = _run_import([_row("p1", org="org_other")], [], ["p1"], org="org_1")
    assert created == [] and skipped[0]["reason"] == "not_in_organization"


def test_missing_persona_is_skipped_not_fatal():
    _, created, skipped = _run_import([], [], ["gone"])
    assert created == [] and skipped[0]["reason"] == "not_found"


def test_persona_already_copied_into_this_exploration_is_skipped():
    rows = [_row("p1"), _row("p2")]
    _, created, skipped = _run_import(rows, ["p1"], ["p1", "p2"])
    assert len(created) == 1 and created[0].library_source_persona_id == "p2"
    assert skipped[0]["reason"] == "already_imported"


def test_persona_that_already_lives_in_this_exploration_is_skipped():
    """Guards the case where the client sends an id the listing would have
    excluded — e.g. a stale page."""
    rows = [_row("p1", exploration_id="exp_target")]
    _, created, skipped = _run_import(rows, [], ["p1"])
    assert created == [] and skipped[0]["reason"] == "already_imported"


def test_draft_source_is_skipped():
    rows = [_row("p1", calibration_status="draft")]
    _, created, skipped = _run_import(rows, [], ["p1"])
    assert created == [] and skipped[0]["reason"] == "draft"


def test_selection_beyond_the_limit_is_capped():
    rows = [_row(f"p{i}") for i in range(1, 6)]
    _, created, skipped = _run_import(rows, [], [f"p{i}" for i in range(1, 6)], limit=4)
    assert len(created) == 4
    assert len(skipped) == 1 and skipped[0]["reason"] == "limit_reached"


def test_existing_personas_reduce_the_remaining_capacity():
    rows = [_row("p1"), _row("p2")]
    _, created, skipped = _run_import(rows, [], ["p1", "p2"], limit=4, used=3)
    assert len(created) == 1 and skipped[0]["reason"] == "limit_reached"


def test_nothing_importable_does_not_commit_or_disturb_the_session():
    """An all-skipped import must not commit — and must not rollback either.

    Nothing is ever pending on this path, and a defensive rollback would expire
    every object already loaded in the caller's session, including rows the
    router still needs to serialise.
    """
    session, created, skipped = _run_import([_row("p1", calibration_status="draft")], [], ["p1"])
    assert created == [] and skipped[0]["reason"] == "draft"
    assert session.committed is False
    assert session.rolled_back is False
    assert session.added == []


def test_imported_personas_carry_the_target_exploration():
    _, created, _ = _run_import([_row("p1")], [], ["p1"])
    assert created[0].exploration_id == "exp_target"
    assert created[0].workspace_id == "ws_target"
    assert created[0].parent_persona_id is None
