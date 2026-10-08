"""Quant Decision Intelligence and Excel output reach the Decision Room.

Regression suite for the production failure where the analyst denied a finding
that existed in the research: a quant exploration's Decision Intelligence report
and its survey-output Excel are both stored only as packed files (a base64 PDF /
ZIP in report_cache.content_md), and the context reader skipped packed files
entirely. So for every quant Decision Room the DI findings - the named insights
the user had actually been shown, like "Delivery anxiety overshadows delivery
reality" - never reached the model, which then answered from the raw survey JSON
alone and concluded the finding did not exist.

The fix extracts the text out of those packed files at the report_orchestrator
layer, so get_report_text returns the DI findings and the Excel tables. A
readable markdown row still wins over a packed file; only text that genuinely
cannot be read is reported as unavailable.

Everything here runs against fakes and in-memory files; no database or API.

Run: pytest tests/test_decision_room_quant_reports.py -v
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import zipfile

from app.services import decision_room_context as drc
from app.services import report_orchestrator as report_cache


def run(coro):
    return asyncio.run(coro)


class _Row:
    def __init__(self, content_md=None):
        self.content_md = content_md


def _packed(content: bytes, filename: str, media_type: str) -> str:
    return json.dumps(
        {
            "kind": report_cache.FILE_CACHE_KIND,
            "media_type": media_type,
            "filename": filename,
            "content_b64": base64.b64encode(content).decode("ascii"),
        }
    )


def _packed_di_pdf(*lines: str) -> str:
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    pdf = canvas.Canvas(buf)
    y = 720
    for line in lines:
        pdf.drawString(72, y, line)
        y -= 20
    pdf.save()
    return _packed(buf.getvalue(), "decision_intelligence_sim-a.pdf", "application/pdf")


def _packed_quant_output_zip(csv_text: str) -> str:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        archive.writestr("survey_results.csv", csv_text)
    return _packed(buf.getvalue(), "survey_transcripts_sim-a.zip", "application/zip")


# ── Packed-file extraction ───────────────────────────────────────────────────

def test_di_pdf_findings_are_extracted_not_dropped():
    packed = _packed_di_pdf(
        "Finding 2: Delivery anxiety overshadows delivery reality.",
        "Supported by Q7: 47.5 percent expressed concern.",
    )

    text = report_cache.extract_report_file_text(packed)

    assert text is not None
    assert "Delivery anxiety overshadows delivery reality" in text
    # And no base64 leaks through as if it were the findings.
    assert "content_b64" not in text


def test_quant_output_zip_rows_are_extracted():
    packed = _packed_quant_output_zip(
        "finding,question,option,count,pct\n"
        "Finding 2,Q7 Delivery reliability,Concerned,190,47.5\n"
    )

    text = report_cache.extract_report_file_text(packed)

    assert text is not None
    assert "survey_results.csv" in text
    assert "Finding 2" in text
    assert "47.5" in text


def test_markdown_reader_still_refuses_packed_files():
    """extract_report_text keeps its contract: a packed file has no text keys,
    so it returns None rather than base64. The new extractor is the only path
    that opens the file."""
    packed = _packed_di_pdf("Finding 1: Price is not the real barrier.")
    assert report_cache.extract_report_text(packed) is None


# ── get_report_text: the two-pass wiring ─────────────────────────────────────

def _fake_cache(monkeypatch, rows: dict):
    async def fake_get_cached_report(exploration_id, cta_type, simulation_id=None):
        return rows.get((cta_type, simulation_id))

    monkeypatch.setattr(report_cache, "get_cached_report", fake_get_cached_report)


def test_quant_di_pdf_only_row_is_now_read(monkeypatch):
    """The real production shape: the one quant DI row is a packed PDF, with no
    markdown copy anywhere. It used to yield nothing; now it yields its text."""
    packed = _packed_di_pdf("Finding 2: Delivery anxiety overshadows delivery reality.")
    _fake_cache(monkeypatch, {("DECISION_INTELLIGENCE_V2", "sim_a"): _Row(packed)})

    found = run(report_cache.get_report_text("exp1", "quant", "DECISION_INTELLIGENCE", "sim_a"))

    assert found is not None
    text, cache_key = found
    assert cache_key == "DECISION_INTELLIGENCE_V2"
    assert "Delivery anxiety overshadows delivery reality" in text


def test_a_readable_markdown_row_still_wins_over_a_packed_file(monkeypatch):
    """The packed-file pass is a fallback: if any key holds real markdown it is
    preferred, so adding the fallback cannot regress a report that was readable
    before."""
    packed = _packed_di_pdf("from the pdf")
    _fake_cache(monkeypatch, {
        ("DECISION_INTELLIGENCE_V8", None): _Row(packed),
        ("QUAL_DECISION_INTELLIGENCE_V1", None): _Row("# from the markdown"),
    })

    found = run(report_cache.get_report_text("exp1", "qual", "DECISION_INTELLIGENCE"))

    assert found == ("# from the markdown", "QUAL_DECISION_INTELLIGENCE_V1")


# ── Context assembly: the quant Decision Room now has the findings ───────────

def _stub_quant_context(monkeypatch, *, reports, survey):
    async def fake_description(exploration_id):
        return "Why do shoppers abandon the cart?"

    async def fake_personas(workspace_id, exploration_id):
        return [{"id": "p1", "name": "Value Seeker", "persona_details": {}}]

    async def fake_interviews(exploration_id):
        return []

    async def fake_report_text(exploration_id, report_type, cta, sim=None):
        return reports.get(cta)

    async def fake_latest_sim(exploration_id):
        return "sim_a"

    monkeypatch.setattr(drc, "get_description", fake_description)
    monkeypatch.setattr(drc, "list_non_draft_personas", fake_personas)
    monkeypatch.setattr(drc, "get_interviews_by_exploration_id", fake_interviews)
    monkeypatch.setattr(drc.report_cache, "get_report_text", fake_report_text)
    monkeypatch.setattr(drc.report_cache, "latest_simulation_id_with_report", fake_latest_sim)

    import app.services.survey_simulation as ss

    async def fake_sim_by_id(sid):
        return survey

    async def fake_latest_for_exploration(exploration_id, workspace_id=None):
        return survey

    monkeypatch.setattr(ss, "get_survey_simulation_by_id", fake_sim_by_id)
    monkeypatch.setattr(ss, "get_latest_survey_simulation_for_exploration", fake_latest_for_exploration)


class _Sim:
    def __init__(self):
        self.id = "sim_a"
        self.exploration_id = "exp1"
        self.workspace_id = "ws1"
        self.normalized_results = {"Q7 Delivery reliability": {"Concerned": "47.5%"}}
        self.results = None
        self.simulation_result = None
        self.total_sample_size = 400


def test_quant_decision_room_context_now_carries_di_findings_and_excel_output(monkeypatch):
    _stub_quant_context(
        monkeypatch,
        reports={
            "DECISION_INTELLIGENCE": (
                "Finding 1: Price is not the real barrier.\n"
                "Finding 2: Delivery anxiety overshadows delivery reality.",
                "DECISION_INTELLIGENCE_V2",
            ),
            "CSV_DATA": (
                "survey_results.csv\nFinding 2, Q7 Delivery reliability, Concerned, 190, 47.5%",
                "TRANSCRIPTS_V4",
            ),
        },
        survey=_Sim(),
    )

    ctx = run(drc.assemble_context("exp1", "ws1", "quant"))
    rendered = ctx["rendered"]

    # The named DI finding the user asked about is present - so "the second
    # finding" can be resolved and its denial ("that finding does not exist")
    # can no longer happen for a finding that is actually in the research.
    assert "Finding 2: Delivery anxiety overshadows delivery reality." in rendered
    assert "[RESEARCH_CONTEXT — DECISION_INTELLIGENCE]" in rendered
    # The Excel/quant output is there to back the finding with numbers.
    assert "[RESEARCH_CONTEXT — QUANT OUTPUT]" in rendered
    assert "47.5%" in rendered
    # And the survey's own answers remain.
    assert "SURVEY RESULTS" in rendered

    assert "DECISION_INTELLIGENCE" in ctx["metadata"]["reports_loaded"]
    assert ctx["metadata"]["sources"]["quant_output"]["included"] is True


def test_quant_context_marks_output_absent_when_there_is_none(monkeypatch):
    _stub_quant_context(
        monkeypatch,
        reports={},  # no DI, no CSV output readable
        survey=_Sim(),
    )

    ctx = run(drc.assemble_context("exp1", "ws1", "quant"))

    assert ctx["metadata"]["sources"]["quant_output"]["included"] is False
    assert "Quant output (Excel/CSV): NONE AVAILABLE" in ctx["rendered"]


# ── Snapshot completeness: a quant room created while broken self-heals ──────

def test_quant_snapshot_with_only_survey_results_is_not_complete():
    """A quant session frozen during the broken window - personas and survey
    JSON, but no report and no Excel output - must read as incomplete so it is
    rebuilt on next use rather than denying the findings forever."""
    stale = {
        "flow": "quant",
        "sources": {"personas": {"included": True}, "survey_results": {"included": True}},
        "evidence_source": "SURVEY_RESULTS",
    }
    assert drc.context_is_complete(stale) is False


def test_quant_snapshot_with_the_excel_output_is_complete():
    good = {
        "flow": "quant",
        "sources": {"personas": {"included": True}, "quant_output": {"included": True}},
        "evidence_source": "SURVEY_RESULTS",
    }
    assert drc.context_is_complete(good) is True


def test_qual_completeness_is_unchanged_by_the_quant_rule():
    """Qual rooms still count interview verbatim as complete evidence."""
    qual = {
        "flow": "qual",
        "sources": {"personas": {"included": True}},
        "evidence_source": "INTERVIEWS",
    }
    assert drc.context_is_complete(qual) is True
