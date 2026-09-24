"""Decision Room context: what the analyst is actually given.

Regression suite for a Decision Room that answered from the research question
alone. Four independent faults produced that, each enough on its own:

  * reports were looked up by their public CTA ("DECISION_INTELLIGENCE") while
    every writer stores a versioned cache key ("DECISION_INTELLIGENCE_V8"),
  * the row's text was read from `report_markdown`, a field ReportCache does
    not have,
  * personas were reached through interviews, which a quant exploration has
    none of,
  * and the context was injected into the first user message only, so from the
    second question on nothing was sent at all.

Everything here runs against fakes; no database or API is used.

Run: pytest tests/test_decision_room_context.py -v
"""

from __future__ import annotations

import asyncio
import json

import pytest

from app.services import decision_room as dr
from app.services import decision_room_context as drc
from app.services import report_orchestrator as report_cache


def run(coro):
    return asyncio.run(coro)


class _Row:
    """A report_cache row, as far as the readers under test care."""

    def __init__(self, content_md=None):
        self.content_md = content_md


PACKED_PDF = json.dumps(
    {"kind": "report_file_b64_v1", "media_type": "application/pdf",
     "filename": "di.pdf", "content_b64": "QUJD"}
)


# ── Report identity: public CTA vs storage cache key ─────────────────────────

@pytest.mark.parametrize(
    "report_type, public_cta",
    [
        ("qual", "DECISION_INTELLIGENCE"),
        ("qual", "BEHAVIORAL_ARCHAEOLOGY"),
        ("quant", "DECISION_INTELLIGENCE"),
        ("quant", "BEHAVIORAL_ARCHAEOLOGY"),
    ],
)
def test_a_public_cta_is_never_itself_a_storage_key(report_type, public_cta):
    """The whole bug in one assertion: nothing stores the bare CTA name, so a
    lookup using it matches nothing and says nothing."""
    keys = report_cache.cache_keys_for(report_type, public_cta)

    assert keys, f"no cache keys registered for {report_type}/{public_cta}"
    assert public_cta not in keys


def test_qual_and_quant_are_versioned_independently():
    """They are different pipelines at different versions; one mapping that
    ignored report_type would hand quant a qual key."""
    qual = report_cache.cache_keys_for("qual", "DECISION_INTELLIGENCE")
    quant = report_cache.cache_keys_for("quant", "DECISION_INTELLIGENCE")

    assert qual[0] == "DECISION_INTELLIGENCE_V8"
    assert quant[0] == "DECISION_INTELLIGENCE_V2"


def test_legacy_keys_are_still_offered_after_the_current_one():
    keys = report_cache.cache_keys_for("qual", "DECISION_INTELLIGENCE")

    assert keys[0] == "DECISION_INTELLIGENCE_V8"
    assert "QUAL_DECISION_INTELLIGENCE_V1" in keys[1:]


def test_router_and_cache_agree_on_every_key():
    """reports.py writes these rows and the Decision Room reads them. If the
    two ever hold separate copies, the reader silently finds nothing again."""
    from app.routers import reports

    assert reports.QUAL_DI_CACHE_KEY == report_cache.QUAL_DI_CACHE_KEY
    assert reports.QUANT_DI_CACHE_KEY == report_cache.QUANT_DI_CACHE_KEY
    assert reports.QUAL_BA_LEGACY_CACHE_KEYS == report_cache.QUAL_BA_LEGACY_CACHE_KEYS


# ── Reading a cached row ─────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "content_md, expected",
    [
        ("# Findings\n\nBenefit X ranked first.", "# Findings\n\nBenefit X ranked first."),
        (json.dumps({"markdown": "## From a JSON envelope"}), "## From a JSON envelope"),
        (json.dumps({"content": "## Under the content key"}), "## Under the content key"),
        (json.dumps("a bare json string"), "a bare json string"),
        (PACKED_PDF, None),      # a PDF has no text to brief anyone with
        (None, None),
        ("", None),
        ("   ", None),
    ],
)
def test_report_text_is_read_only_when_there_is_text(content_md, expected):
    assert report_cache.extract_report_text(content_md) == expected


def test_a_packed_pdf_never_leaks_base64_into_the_context():
    """The failure mode this guards is worse than finding nothing: a wall of
    base64 presented to the analyst as if it were the findings."""
    assert "QUJD" not in (report_cache.extract_report_text(PACKED_PDF) or "")


# ── get_report_text: key resolution + reading, together ──────────────────────

def _fake_cache(monkeypatch, rows: dict):
    """rows maps (cache_key, simulation_id) -> _Row or None."""
    seen = []

    async def fake_get_cached_report(exploration_id, cta_type, simulation_id=None):
        seen.append((cta_type, simulation_id))
        return rows.get((cta_type, simulation_id))

    monkeypatch.setattr(report_cache, "get_cached_report", fake_get_cached_report)
    return seen


def test_report_is_found_under_the_current_versioned_key(monkeypatch):
    _fake_cache(monkeypatch, {("DECISION_INTELLIGENCE_V8", None): _Row("# DI")})

    found = run(report_cache.get_report_text("exp1", "qual", "DECISION_INTELLIGENCE"))

    assert found == ("# DI", "DECISION_INTELLIGENCE_V8")


def test_report_falls_back_to_a_legacy_key(monkeypatch):
    _fake_cache(monkeypatch, {("QUAL_DECISION_INTELLIGENCE_V1", None): _Row("# legacy DI")})

    found = run(report_cache.get_report_text("exp1", "qual", "DECISION_INTELLIGENCE"))

    assert found == ("# legacy DI", "QUAL_DECISION_INTELLIGENCE_V1")


def test_a_pdf_only_row_gives_way_to_an_older_row_that_still_has_text(monkeypatch):
    """A newer row the analyst cannot read is worth less than an older one it
    can, so the PDF is skipped rather than ending the search."""
    _fake_cache(monkeypatch, {
        ("DECISION_INTELLIGENCE_V8", None): _Row(PACKED_PDF),
        ("QUAL_DECISION_INTELLIGENCE_V1", None): _Row("# still readable"),
    })

    found = run(report_cache.get_report_text("exp1", "qual", "DECISION_INTELLIGENCE"))

    assert found == ("# still readable", "QUAL_DECISION_INTELLIGENCE_V1")


def test_quant_lookups_carry_the_simulation_id(monkeypatch):
    """Quant rows are keyed by simulation. Asking without one matches only
    rows whose simulation_id is NULL, which a quant report never is."""
    seen = _fake_cache(monkeypatch, {("DECISION_INTELLIGENCE_V2", "sim_9"): _Row("# quant DI")})

    found = run(report_cache.get_report_text("exp1", "quant", "DECISION_INTELLIGENCE", "sim_9"))

    assert found == ("# quant DI", "DECISION_INTELLIGENCE_V2")
    assert seen == [("DECISION_INTELLIGENCE_V2", "sim_9")]


def test_no_report_returns_nothing_rather_than_raising(monkeypatch):
    _fake_cache(monkeypatch, {})

    assert run(report_cache.get_report_text("exp1", "qual", "DECISION_INTELLIGENCE")) is None


# ── Context assembly ─────────────────────────────────────────────────────────

def _stub_context(
    monkeypatch,
    *,
    description="Which benefits drive purchase?",
    personas=None,
    reports=None,
    interviews=None,
    simulation_id=None,
    survey=None,
):
    async def fake_description(exploration_id):
        return description

    async def fake_personas(workspace_id, exploration_id):
        return personas if personas is not None else []

    async def fake_interviews(exploration_id):
        return interviews if interviews is not None else []

    async def fake_report_text(exploration_id, report_type, cta, sim=None):
        return (reports or {}).get(cta)

    async def fake_latest_sim(exploration_id):
        return simulation_id

    monkeypatch.setattr(drc, "get_description", fake_description)
    monkeypatch.setattr(drc, "list_non_draft_personas", fake_personas)
    monkeypatch.setattr(drc, "get_interviews_by_exploration_id", fake_interviews)
    monkeypatch.setattr(drc.report_cache, "get_report_text", fake_report_text)
    monkeypatch.setattr(drc.report_cache, "latest_simulation_id_with_report", fake_latest_sim)

    import app.services.survey_simulation as ss

    async def fake_sim_by_id(sid):
        return survey

    async def fake_latest_sim_for_exploration(exploration_id, workspace_id=None):
        return survey

    monkeypatch.setattr(ss, "get_survey_simulation_by_id", fake_sim_by_id)
    monkeypatch.setattr(ss, "get_latest_survey_simulation_for_exploration", fake_latest_sim_for_exploration)


def _persona(name, confidence=50):
    return {
        "id": f"per_{name}",
        "name": name,
        "calibration_confidence": confidence,
        "persona_details": {"demographic_profile": {"age": "30-40"}},
    }


class _Sim:
    def __init__(self, sid="sim_1", results=None, total=120,
                 exploration_id="exp1", workspace_id="ws1"):
        self.id = sid
        self.exploration_id = exploration_id
        self.workspace_id = workspace_id
        self.normalized_results = results or {"Q1": {"Daily energy": "62%"}}
        self.results = None
        self.simulation_result = None
        self.total_sample_size = total


def test_qual_context_carries_objective_personas_report_and_verbatim(monkeypatch):
    _stub_context(
        monkeypatch,
        personas=[_persona("Health-first Mum", 90)],
        reports={"DECISION_INTELLIGENCE": ("# DI findings", "DECISION_INTELLIGENCE_V8")},
        interviews=[{"persona_id": "per_1", "messages": [{"role": "user", "text": "why that brand?"}]}],
    )

    ctx = run(drc.assemble_context("exp1", "ws1", "qual"))
    rendered = ctx["rendered"]

    assert "[RESEARCH_OBJECTIVE]" in rendered
    assert "Health-first Mum" in rendered
    assert "# DI findings" in rendered
    assert "why that brand?" in rendered
    assert ctx["personas_loaded"] == 1


def test_quant_context_has_personas_even_though_it_has_no_interviews(monkeypatch):
    """The persona source moved off interviews for exactly this case: a quant
    exploration has personas and no interviews, and used to load neither."""
    _stub_context(
        monkeypatch,
        personas=[_persona("Value Seeker", 80), _persona("Premium Buyer", 70)],
        interviews=[],
        simulation_id="sim_1",
        survey=_Sim(),
    )

    ctx = run(drc.assemble_context("exp1", "ws1", "quant"))

    assert ctx["personas_loaded"] == 2
    assert "Value Seeker" in ctx["rendered"]
    assert ctx["metadata"]["sources"]["personas"]["included"] is True


def test_quant_context_carries_the_survey_results(monkeypatch):
    """Quant DI/BA are only ever stored as PDFs, so the survey's own answers
    are the only quantitative evidence there is to read."""
    _stub_context(monkeypatch, personas=[_persona("A")], simulation_id="sim_7", survey=_Sim("sim_7"))

    ctx = run(drc.assemble_context("exp1", "ws1", "quant"))

    assert "SURVEY RESULTS" in ctx["rendered"]
    assert "Daily energy" in ctx["rendered"]
    assert ctx["metadata"]["simulation_id"] == "sim_7"
    assert ctx["metadata"]["sources"]["survey_results"]["included"] is True


def test_quant_uses_the_simulation_the_newest_report_was_built_from(monkeypatch):
    _stub_context(monkeypatch, personas=[_persona("A")], simulation_id="sim_reported", survey=_Sim("sim_reported"))

    ctx = run(drc.assemble_context("exp1", "ws1", "quant"))

    assert ctx["metadata"]["sources"]["simulation"]["resolved_from"] == "report_cache"
    assert ctx["metadata"]["simulation_id"] == "sim_reported"


def test_quant_falls_back_to_the_latest_run_when_no_report_exists(monkeypatch):
    _stub_context(monkeypatch, personas=[_persona("A")], simulation_id=None, survey=_Sim("sim_latest"))

    ctx = run(drc.assemble_context("exp1", "ws1", "quant"))

    assert ctx["metadata"]["sources"]["simulation"]["resolved_from"] == "latest_simulation"
    assert ctx["metadata"]["simulation_id"] == "sim_latest"


def test_quant_with_no_simulation_at_all_still_assembles(monkeypatch):
    _stub_context(monkeypatch, personas=[_persona("A")], simulation_id=None, survey=None)

    ctx = run(drc.assemble_context("exp1", "ws1", "quant"))

    assert "[RESEARCH_OBJECTIVE]" in ctx["rendered"]
    assert ctx["metadata"]["simulation_id"] is None
    assert ctx["metadata"]["sources"]["survey_results"]["included"] is False


def test_both_reports_are_included_when_both_are_readable(monkeypatch):
    _stub_context(
        monkeypatch,
        personas=[_persona("A")],
        reports={
            "DECISION_INTELLIGENCE": ("# DI", "DECISION_INTELLIGENCE_V8"),
            "BEHAVIORAL_ARCHAEOLOGY": ("# BA", "BEHAVIORAL_ARCHAEOLOGY_V8"),
        },
    )

    ctx = run(drc.assemble_context("exp1", "ws1", "qual"))

    assert "# DI" in ctx["rendered"] and "# BA" in ctx["rendered"]
    assert ctx["metadata"]["reports_loaded"] == ["DECISION_INTELLIGENCE", "BEHAVIORAL_ARCHAEOLOGY"]


def test_no_personas_is_recorded_and_does_not_break_assembly(monkeypatch):
    _stub_context(monkeypatch, personas=[])

    ctx = run(drc.assemble_context("exp1", "ws1", "qual"))

    assert ctx["personas_loaded"] == 0
    assert ctx["metadata"]["sources"]["personas"]["included"] is False
    assert "[RESEARCH_OBJECTIVE]" in ctx["rendered"]


# ── Which simulation a quant room is about ───────────────────────────────────
#
# There is no pre-existing rule for this: the reports router is always handed a
# simulation id in the URL, and the Decision Room is never given one. The rule
# below — the simulation the newest finished report was built from, falling
# back to the newest run — is the agreed behaviour, so these pin it exactly.

def test_one_simulation_with_a_report_is_used(monkeypatch):
    _stub_context(monkeypatch, personas=[_persona("A")], simulation_id="sim_only",
                  survey=_Sim("sim_only"))

    meta = run(drc.assemble_context("exp1", "ws1", "quant"))["metadata"]

    assert meta["simulation_id"] == "sim_only"


def test_with_several_simulations_the_reported_one_wins_over_the_newest(monkeypatch):
    """An exploration can hold several runs. The one the user has actually been
    shown a report for is the one the room should be discussing — even when a
    newer run exists that nobody has reported on yet."""
    _stub_context(monkeypatch, personas=[_persona("A")],
                  simulation_id="sim_older_but_reported",
                  survey=_Sim("sim_older_but_reported"))

    meta = run(drc.assemble_context("exp1", "ws1", "quant"))["metadata"]

    assert meta["simulation_id"] == "sim_older_but_reported"
    assert meta["sources"]["simulation"]["resolved_from"] == "report_cache"


def test_the_newest_simulation_is_used_when_nothing_has_been_reported_yet(monkeypatch):
    _stub_context(monkeypatch, personas=[_persona("A")], simulation_id=None,
                  survey=_Sim("sim_newest_unreported"))

    meta = run(drc.assemble_context("exp1", "ws1", "quant"))["metadata"]

    assert meta["simulation_id"] == "sim_newest_unreported"
    assert meta["sources"]["simulation"]["resolved_from"] == "latest_simulation"


def test_no_simulation_at_all_is_recorded_and_harmless(monkeypatch):
    _stub_context(monkeypatch, personas=[_persona("A")], simulation_id=None, survey=None)

    meta = run(drc.assemble_context("exp1", "ws1", "quant"))["metadata"]

    assert meta["simulation_id"] is None
    assert meta["sources"]["survey_results"]["included"] is False


def test_a_simulation_from_another_exploration_is_refused(monkeypatch):
    """A report row outliving its simulation, or pointing at one that has been
    re-parented, must not pull a different study's answers into this room."""
    _stub_context(monkeypatch, personas=[_persona("A")], simulation_id="sim_x",
                  survey=_Sim("sim_x", exploration_id="SOMEONE_ELSE"))

    meta = run(drc.assemble_context("exp1", "ws1", "quant"))["metadata"]

    assert meta["sources"]["survey_results"]["included"] is False
    assert meta["sources"]["survey_results"]["reason"] == "out_of_scope"


# ── Size ─────────────────────────────────────────────────────────────────────

def test_the_research_objective_is_capped(monkeypatch):
    """The objective is free text with no natural ceiling. Uncapped, a long
    enough brief pushes the request past the model's window and the room stops
    answering at all — every other component is already bounded."""
    _stub_context(monkeypatch, description="o" * 200_000, personas=[])

    ctx = run(drc.assemble_context("exp1", "ws1", "qual"))

    assert len(ctx["rendered"]) < drc.MAX_RO_CHARS + 2_000
    assert ctx["metadata"]["sources"]["research_objective"]["truncated"] is True


def test_a_normal_objective_is_not_truncated(monkeypatch):
    _stub_context(monkeypatch, description="Which benefits drive purchase?", personas=[])

    meta = run(drc.assemble_context("exp1", "ws1", "qual"))["metadata"]

    assert meta["sources"]["research_objective"]["truncated"] is False


# ── Telling the analyst what it does and does not have ───────────────────────

def test_the_inventory_names_what_is_missing(monkeypatch):
    """A room can legitimately be opened before any insight exists, so the
    analyst has to be able to tell absent evidence from evidence it holds."""
    _stub_context(monkeypatch, personas=[], reports={}, interviews=[])

    rendered = run(drc.assemble_context("exp1", "ws1", "qual"))["rendered"]

    assert "[CONTEXT_INVENTORY]" in rendered
    assert "Personas: NONE AVAILABLE" in rendered
    assert "Reports: NONE AVAILABLE" in rendered


def test_the_inventory_names_what_is_present(monkeypatch):
    _stub_context(
        monkeypatch,
        personas=[_persona("A"), _persona("B")],
        reports={"DECISION_INTELLIGENCE": ("# DI", "DECISION_INTELLIGENCE_V8")},
        interviews=[{"persona_id": "p", "messages": [{"role": "user", "text": "hi"}]}],
    )

    rendered = run(drc.assemble_context("exp1", "ws1", "qual"))["rendered"]

    assert "Personas: 2" in rendered
    assert "Reports: DECISION_INTELLIGENCE" in rendered
    assert "Supporting evidence: INTERVIEWS" in rendered


# ── Failure isolation ────────────────────────────────────────────────────────

def test_a_failing_report_lookup_does_not_take_the_rest_with_it(monkeypatch):
    _stub_context(monkeypatch, personas=[_persona("A")])

    async def boom(*args, **kwargs):
        raise RuntimeError("cache exploded")

    monkeypatch.setattr(drc.report_cache, "get_report_text", boom)

    ctx = run(drc.assemble_context("exp1", "ws1", "qual"))

    assert "A" in ctx["rendered"]
    assert ctx["metadata"]["sources"]["report_decision_intelligence"]["included"] is False
    assert "cache exploded" in ctx["metadata"]["sources"]["report_decision_intelligence"]["error"]


def test_a_failing_persona_lookup_is_recorded_not_hidden(monkeypatch):
    _stub_context(monkeypatch)

    async def boom(*args, **kwargs):
        raise RuntimeError("persona table down")

    monkeypatch.setattr(drc, "list_non_draft_personas", boom)

    ctx = run(drc.assemble_context("exp1", "ws1", "qual"))

    assert ctx["personas_loaded"] == 0
    assert ctx["metadata"]["sources"]["personas"]["included"] is False
    assert "[RESEARCH_OBJECTIVE]" in ctx["rendered"]


def test_a_missing_component_is_never_reported_as_included(monkeypatch):
    """The reason this went unseen for so long: everything failed quietly and
    the metadata still looked healthy."""
    _stub_context(monkeypatch, personas=[], reports={}, interviews=[])

    sources = run(drc.assemble_context("exp1", "ws1", "qual"))["metadata"]["sources"]

    assert sources["personas"]["included"] is False
    assert sources["report_decision_intelligence"]["included"] is False
    assert sources["interviews"]["included"] is False


def test_context_summary_contract_is_preserved(monkeypatch):
    """get_session_detail reads these exact paths; changing them would blank
    the panel the frontend already renders."""
    _stub_context(
        monkeypatch,
        personas=[_persona("A")],
        reports={"DECISION_INTELLIGENCE": ("# DI", "DECISION_INTELLIGENCE_V8")},
    )

    meta = run(drc.assemble_context("exp1", "ws1", "qual"))["metadata"]

    assert meta["sources"]["personas"]["count"] == 1
    assert meta["report_source"] == "DECISION_INTELLIGENCE"
    assert meta["token_estimate"] > 0
    assert meta["ro_description"]          # the title generator reads this


# ── Snapshot completeness ────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "metadata, complete",
    [
        (None, False),
        ({}, False),
        ({"sources": {}}, False),
        # The shape every broken session currently holds: objective only.
        ({"sources": {"research_objective": {"included": True}}}, False),
        # Personas but nothing to reason from.
        ({"sources": {"personas": {"included": True}}, "reports_loaded": [], "evidence_source": None}, False),
        ({"sources": {"personas": {"included": True}}, "reports_loaded": ["DECISION_INTELLIGENCE"]}, True),
        ({"sources": {"personas": {"included": True}}, "evidence_source": "SURVEY_RESULTS"}, True),
    ],
)
def test_context_is_complete(metadata, complete):
    assert drc.context_is_complete(metadata) is complete
