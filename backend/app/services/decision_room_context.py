"""Context assembly for Decision Room sessions.

Gathers everything the analyst is expected to reason from — the research
objective, the personas, the Decision Intelligence / Behavioural Archaeology
reports, and the flow's own evidence (interview verbatim for qual, survey
results for quant) — and renders it into one block.

Two rules this module exists to hold:

  * Reports are addressed by their PUBLIC CTA and resolved through
    report_orchestrator, never by a cache key spelled out here. The cache keys
    are versioned per pipeline ("DECISION_INTELLIGENCE_V8" for qual,
    "_V2" for quant) and a reader that guesses them matches nothing, silently.

  * A component that cannot be loaded is recorded as missing in the metadata
    and logged. It never fails the session — a Decision Room with partial
    evidence is still useful — but it must never look like it loaded either.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.services import report_orchestrator as report_cache
from app.services.auto_generated_persona import (
    get_description,
    get_interviews_by_exploration_id,
)
from app.services.persona import list_non_draft_personas

logger = logging.getLogger(__name__)

MAX_PERSONAS = 10
MAX_REPORT_CHARS = 32_000
# The objective is the one component with no natural ceiling — it is whatever
# the exploration's description happens to hold, and a long pasted brief can
# run to tens of thousands of characters. Every other component is capped, so
# without this one the context is unbounded and a big enough objective would
# push the request past the model's window and fail the room outright. Set to
# match MAX_REPORT_CHARS: the objective is never worth less room than a report.
MAX_RO_CHARS = 32_000
MAX_INTERVIEWS = 8
MAX_INTERVIEW_MESSAGES = 20
MAX_SURVEY_CHARS = 32_000

# Reports the analyst is briefed with, most decision-relevant first. These are
# public CTA names; report_orchestrator maps them onto the cache keys each
# pipeline actually writes.
REPORT_CTAS = ("DECISION_INTELLIGENCE", "BEHAVIORAL_ARCHAEOLOGY")

# flow -> the report_type its reports are filed under in report_cache.
_REPORT_TYPE_BY_FLOW = {"qual": "qual", "quant": "quant"}


# ── Formatting ────────────────────────────────────────────────────────────────

def _format_research_objective(description: Optional[str]) -> str:
    if not description:
        return "[RESEARCH_OBJECTIVE]\nNot available.\n"
    return f"[RESEARCH_OBJECTIVE]\n{description.strip()[:MAX_RO_CHARS]}\n"


def _format_persona(p: Dict[str, Any]) -> str:
    details = p.get("details") or {}
    lines = [f"[PERSONA: {p.get('name', 'Unknown')}]"]
    if isinstance(details, dict):
        for key in ("demographic_profile", "psychographic_profile", "ocean_scores",
                    "schwartz_values", "behavioral_signatures", "awareness_ceiling"):
            val = details.get(key)
            if val:
                if isinstance(val, (dict, list)):
                    lines.append(f"{key}: {json.dumps(val, ensure_ascii=False)[:500]}")
                else:
                    lines.append(f"{key}: {str(val)[:500]}")
    elif isinstance(details, str) and details.strip():
        lines.append(details[:1000])
    return "\n".join(lines)


def _format_interview_messages(messages: List[Dict]) -> str:
    lines = []
    for m in messages:
        role = m.get("role", "unknown")
        text = m.get("text") or m.get("content") or ""
        if text:
            lines.append(f"{role.upper()}: {text[:600]}")
    return "\n".join(lines)


# ── Component loaders ─────────────────────────────────────────────────────────
#
# Each returns its section text (or None) and records what happened in
# `metadata["sources"]`. None of them raise: a missing component is reported,
# not fatal.

async def _load_research_objective(
    metadata: Dict[str, Any], exploration_id: str,
) -> Tuple[str, Optional[str]]:
    try:
        description = await get_description(exploration_id)
    except Exception as exc:
        logger.warning(
            "decision_room context: research objective failed | exploration=%s error=%s",
            exploration_id, exc,
        )
        metadata["sources"]["research_objective"] = {"included": False, "error": str(exc)}
        return _format_research_objective(None), None

    metadata["sources"]["research_objective"] = {
        "included": bool(description),
        "chars": len(description) if description else 0,
        "truncated": bool(description) and len(description) > MAX_RO_CHARS,
    }
    return _format_research_objective(description), description


async def _load_personas(
    metadata: Dict[str, Any], workspace_id: str, exploration_id: str,
) -> Tuple[Optional[str], int]:
    """Personas as the exploration itself defines them.

    Read from the persona table rather than from interviews: a quant
    exploration has personas but no interviews, and reaching them through
    interviews left those sessions with no personas at all.
    """
    try:
        rows = await list_non_draft_personas(workspace_id, exploration_id)
    except Exception as exc:
        logger.warning(
            "decision_room context: personas failed | workspace=%s exploration=%s error=%s",
            workspace_id, exploration_id, exc,
        )
        metadata["sources"]["personas"] = {"included": False, "error": str(exc)}
        return None, 0

    ordered = sorted(
        rows, key=lambda p: p.get("calibration_confidence") or 0, reverse=True
    )[:MAX_PERSONAS]
    personas = [
        {
            "id": p.get("id"),
            "name": p.get("name") or "Unknown",
            "details": p.get("persona_details") or {},
        }
        for p in ordered
    ]

    metadata["sources"]["personas"] = {
        "included": bool(personas),
        "count": len(personas),
        "available": len(rows),
        "names": [p["name"] for p in personas],
    }
    if not personas:
        logger.info(
            "decision_room context: no personas | workspace=%s exploration=%s",
            workspace_id, exploration_id,
        )
        return None, 0

    section = "[PERSONAS]\n" + "\n\n".join(_format_persona(p) for p in personas)
    return section, len(personas)


async def _load_reports(
    metadata: Dict[str, Any],
    exploration_id: str,
    report_type: str,
    simulation_id: Optional[str],
) -> Tuple[List[str], List[str]]:
    """DI and BA report text, whichever of them has readable content.

    Which of these can actually be read is a property of how each report is
    stored, not of this function:

      qual DI   readable. The insights path (routers/interview.py) saves the
                markdown it generates, under a key the current DI also lists
                as legacy, so it resolves.
      qual BA   NOT readable anywhere. generate_combined_interviews_pdf()
                renders markdown and then keeps only the PDF, so no BA text is
                persisted by any path. The interviews it analyses are in this
                context in full, so the evidence behind it is still present.
      quant     NOT readable. Both are stored as PDFs only. The quantitative
                source of truth is SurveySimulation.results (see
                generate_md_report), which _load_survey_results supplies.

    A CTA that exists only as a packed file is reported as unavailable rather
    than passed through as base64.
    """
    sections: List[str] = []
    loaded: List[str] = []
    for cta in REPORT_CTAS:
        try:
            found = await report_cache.get_report_text(
                exploration_id, report_type, cta, simulation_id
            )
        except Exception as exc:
            logger.warning(
                "decision_room context: report lookup failed | exploration=%s cta=%s "
                "report_type=%s simulation=%s error=%s",
                exploration_id, cta, report_type, simulation_id, exc,
            )
            metadata["sources"][f"report_{cta.lower()}"] = {"included": False, "error": str(exc)}
            continue

        if not found:
            logger.info(
                "decision_room context: no readable report | exploration=%s cta=%s "
                "report_type=%s simulation=%s keys_tried=%s",
                exploration_id, cta, report_type, simulation_id,
                report_cache.cache_keys_for(report_type, cta),
            )
            metadata["sources"][f"report_{cta.lower()}"] = {"included": False}
            continue

        text, cache_key = found
        content = text[:MAX_REPORT_CHARS]
        sections.append(f"[RESEARCH_CONTEXT — {cta}]\n{content}")
        loaded.append(cta)
        metadata["sources"][f"report_{cta.lower()}"] = {
            "included": True,
            "cache_key": cache_key,
            "chars": len(content),
            "truncated": len(text) > MAX_REPORT_CHARS,
        }
    return sections, loaded


async def _load_interview_evidence(
    metadata: Dict[str, Any], exploration_id: str,
) -> Optional[str]:
    """Interview verbatim — the qual flow's primary evidence.

    Kept alongside the reports rather than only as a fallback for them: the
    reports are an analysis of these transcripts, and questions about what a
    participant actually said can only be answered from the transcripts.
    """
    try:
        interviews = await get_interviews_by_exploration_id(exploration_id)
    except Exception as exc:
        logger.warning(
            "decision_room context: interviews failed | exploration=%s error=%s",
            exploration_id, exc,
        )
        metadata["sources"]["interviews"] = {"included": False, "error": str(exc)}
        return None

    texts = []
    for iv in (interviews or [])[:MAX_INTERVIEWS]:
        messages = iv.get("messages") or []
        if messages:
            pid = iv.get("persona_id", "unknown")
            texts.append(
                f"Interview (persona: {pid}):\n"
                f"{_format_interview_messages(messages[:MAX_INTERVIEW_MESSAGES])}"
            )

    metadata["sources"]["interviews"] = {
        "included": bool(texts),
        "interview_count": len(interviews or []),
        "included_count": len(texts),
    }
    if not texts:
        return None

    combined = "\n\n---\n\n".join(texts)[:MAX_REPORT_CHARS]
    return f"[RESEARCH_CONTEXT — INTERVIEWS]\n{combined}"


async def _resolve_simulation_id(
    metadata: Dict[str, Any], exploration_id: str, workspace_id: str,
) -> Optional[str]:
    """Which survey run this quant session is about.

    The one the newest finished quant report was built from, because that is
    the run the user has actually been shown. An exploration with simulations
    but no report yet falls back to its most recent run.
    """
    from app.services.survey_simulation import get_latest_survey_simulation_for_exploration

    try:
        simulation_id = await report_cache.latest_simulation_id_with_report(exploration_id)
        if simulation_id:
            metadata["sources"]["simulation"] = {"id": simulation_id, "resolved_from": "report_cache"}
            return simulation_id

        sim = await get_latest_survey_simulation_for_exploration(exploration_id, workspace_id)
        if sim:
            metadata["sources"]["simulation"] = {"id": sim.id, "resolved_from": "latest_simulation"}
            return sim.id
    except Exception as exc:
        logger.warning(
            "decision_room context: simulation lookup failed | exploration=%s error=%s",
            exploration_id, exc,
        )
        metadata["sources"]["simulation"] = {"id": None, "error": str(exc)}
        return None

    logger.info(
        "decision_room context: no survey simulation | exploration=%s", exploration_id
    )
    metadata["sources"]["simulation"] = {"id": None}
    return None


async def _load_survey_results(
    metadata: Dict[str, Any],
    exploration_id: str,
    workspace_id: str,
    simulation_id: Optional[str],
) -> Optional[str]:
    """The survey's own answers — the quant flow's primary evidence.

    The quant DI/BA reports are only ever stored as PDFs, so this is the only
    quantitative material the analyst can actually read.
    """
    if not simulation_id:
        metadata["sources"]["survey_results"] = {"included": False}
        return None

    from app.services.survey_simulation import get_survey_simulation_by_id

    try:
        sim = await get_survey_simulation_by_id(simulation_id)
    except Exception as exc:
        logger.warning(
            "decision_room context: survey results failed | exploration=%s simulation=%s error=%s",
            exploration_id, simulation_id, exc,
        )
        metadata["sources"]["survey_results"] = {"included": False, "error": str(exc)}
        return None

    # Same scope check the reports router applies before serving a simulation,
    # so a stale id on an old report row can never pull another exploration's
    # answers into this room.
    if sim and not (
        getattr(sim, "exploration_id", None) == exploration_id
        and getattr(sim, "workspace_id", None) == workspace_id
    ):
        logger.warning(
            "decision_room context: simulation out of scope, ignored | "
            "exploration=%s workspace=%s simulation=%s",
            exploration_id, workspace_id, simulation_id,
        )
        metadata["sources"]["survey_results"] = {
            "included": False, "simulation_id": simulation_id, "reason": "out_of_scope",
        }
        return None

    payload = None
    used = None
    for field in ("normalized_results", "results", "simulation_result"):
        value = getattr(sim, field, None) if sim else None
        if value:
            payload, used = value, field
            break

    if payload is None:
        metadata["sources"]["survey_results"] = {"included": False, "simulation_id": simulation_id}
        return None

    text = json.dumps(payload, ensure_ascii=False, indent=2)[:MAX_SURVEY_CHARS]
    metadata["sources"]["survey_results"] = {
        "included": True,
        "simulation_id": simulation_id,
        "field": used,
        "chars": len(text),
        "total_sample_size": getattr(sim, "total_sample_size", None),
    }
    return f"[RESEARCH_CONTEXT — SURVEY RESULTS]\n{text}"


# ── Assembly ──────────────────────────────────────────────────────────────────

async def assemble_context(
    exploration_id: str,
    workspace_id: str,
    flow: str,
) -> Dict[str, Any]:
    """Assemble the research context for a Decision Room session.

    Returns 'rendered' (the block handed to Claude) and 'metadata' (what was
    and was not found, for the session row and for debugging).
    """
    sections: List[str] = []
    metadata: Dict[str, Any] = {
        "assembled_at": datetime.utcnow().isoformat(),
        "flow": flow,
        "exploration_id": exploration_id,
        "sources": {},
    }

    ro_section, ro_description = await _load_research_objective(metadata, exploration_id)
    sections.append(ro_section)

    persona_section, personas_loaded = await _load_personas(
        metadata, workspace_id, exploration_id
    )
    if persona_section:
        sections.append(persona_section)

    report_type = _REPORT_TYPE_BY_FLOW.get(flow, flow)
    simulation_id = None
    if report_type == "quant":
        simulation_id = await _resolve_simulation_id(metadata, exploration_id, workspace_id)

    report_sections, reports_loaded = await _load_reports(
        metadata, exploration_id, report_type, simulation_id
    )
    sections.extend(report_sections)

    evidence_source: Optional[str] = None
    if report_type == "quant":
        survey_section = await _load_survey_results(
            metadata, exploration_id, workspace_id, simulation_id
        )
        if survey_section:
            sections.append(survey_section)
            evidence_source = "SURVEY_RESULTS"
    else:
        interview_section = await _load_interview_evidence(metadata, exploration_id)
        if interview_section:
            sections.append(interview_section)
            evidence_source = "INTERVIEWS"

    # State what is and is not here, ahead of the evidence itself.
    #
    # The room can be opened before any insight has been generated — nothing in
    # the product stops that — so "no findings" is a legitimate state, not only
    # a fault. Either way the analyst must be able to tell the difference
    # between evidence it has and evidence that was never loaded, rather than
    # answering confidently from whatever happens to be present. Optional
    # components degrade quietly; the objective and the findings do not.
    inventory = [
        f"- Research objective: {'present' if ro_description else 'NOT AVAILABLE'}",
        f"- Personas: {personas_loaded if personas_loaded else 'NONE AVAILABLE'}",
        f"- Reports: {', '.join(reports_loaded) if reports_loaded else 'NONE AVAILABLE'}",
        f"- Supporting evidence: {evidence_source or 'NONE AVAILABLE'}",
    ]
    sections.insert(0, "[CONTEXT_INVENTORY]\n" + "\n".join(inventory))

    rendered = "\n\n".join(s.strip() for s in sections if s.strip())
    token_estimate = max(1, len(rendered) // 4)

    # Kept a single string for the existing context_summary contract: the
    # primary report if one was readable, otherwise the evidence that stood in
    # for it.
    report_source = reports_loaded[0] if reports_loaded else evidence_source

    metadata["token_estimate"] = token_estimate
    metadata["report_source"] = report_source
    metadata["reports_loaded"] = reports_loaded
    metadata["evidence_source"] = evidence_source
    metadata["simulation_id"] = simulation_id
    # Read back by the session-title generator.
    metadata["ro_description"] = (ro_description or "")[:2000]

    logger.info(
        "decision_room context assembled | exploration=%s workspace=%s flow=%s "
        "personas=%d reports=%s evidence=%s simulation=%s chars=%d ~tokens=%d",
        exploration_id, workspace_id, flow, personas_loaded, reports_loaded or "none",
        evidence_source or "none", simulation_id, len(rendered), token_estimate,
    )

    return {
        "rendered": rendered,
        "metadata": metadata,
        "personas_loaded": personas_loaded,
        "report_source": report_source,
        "token_estimate": token_estimate,
    }


def context_is_complete(metadata: Optional[Dict[str, Any]]) -> bool:
    """Whether a stored snapshot actually holds the evidence it was meant to.

    Used to decide whether a session's frozen context is worth reusing. A
    session opened before its reports finished generating — or created while
    the lookups below were broken — holds a snapshot with nothing in it but the
    objective, and reusing that forever is how a Decision Room ends up
    answering from the research question alone.
    """
    sources = (metadata or {}).get("sources") or {}
    if not sources:
        return False
    if not (sources.get("personas") or {}).get("included"):
        return False
    return bool(
        (metadata or {}).get("reports_loaded") or (metadata or {}).get("evidence_source")
    )
