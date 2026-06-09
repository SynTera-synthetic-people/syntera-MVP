"""Context assembly for Decision Room sessions.

Assembles research context once at session creation — same pattern as build_llm_payload()
in report_generation_qual_claude.py but for advisory conversation use.
"""

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.db import async_engine
from app.services.auto_generated_persona import (
    get_description,
    get_interviews_by_exploration_id,
    get_persona_details,
)
from app.services.persona import get_persona
from app.services.report_orchestrator import get_cached_report

MAX_PERSONAS = 10
MAX_REPORT_CHARS = 32_000


async def _load_personas_for_exploration(exploration_id: str) -> List[Dict[str, Any]]:
    """Load all interviews for an exploration and extract unique personas."""
    interviews = await get_interviews_by_exploration_id(exploration_id)

    seen: dict[str, dict] = {}
    for iv in interviews:
        pid = iv.get("persona_id")
        if not pid or pid in seen:
            continue
        try:
            persona_full = await get_persona(pid) or {}
            persona_details = await get_persona_details(pid) or {}
            seen[pid] = {
                "id": pid,
                "name": persona_full.get("name") or persona_details.get("name", "Unknown"),
                "calibration_confidence": persona_full.get("calibration_confidence", 0),
                "details": persona_details,
            }
        except Exception:
            seen[pid] = {"id": pid, "name": "Unknown", "calibration_confidence": 0, "details": {}}

    # Sort by calibration confidence, take top N
    personas = sorted(seen.values(), key=lambda p: p.get("calibration_confidence", 0), reverse=True)
    return personas[:MAX_PERSONAS]


def _format_research_objective(description: Optional[str]) -> str:
    if not description:
        return "[RESEARCH_OBJECTIVE]\nNot available.\n"
    return f"[RESEARCH_OBJECTIVE]\n{description.strip()}\n"


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


async def assemble_context(
    exploration_id: str,
    workspace_id: str,
    flow: str,
) -> Dict[str, Any]:
    """
    Assemble research context once at session creation.
    Returns dict with 'rendered' (str for Claude) and 'metadata' (dict for storage).
    """
    sections: List[str] = []
    metadata: Dict[str, Any] = {
        "assembled_at": datetime.utcnow().isoformat(),
        "flow": flow,
        "exploration_id": exploration_id,
        "sources": {},
    }

    # 1. Research Objective
    try:
        ro_desc = await get_description(exploration_id)
        sections.append(_format_research_objective(ro_desc))
        metadata["sources"]["research_objective"] = {
            "included": True,
            "chars": len(ro_desc) if ro_desc else 0,
        }
    except Exception as e:
        sections.append("[RESEARCH_OBJECTIVE]\nNot available.\n")
        metadata["sources"]["research_objective"] = {"included": False, "error": str(e)}

    # 2. Personas
    try:
        personas = await _load_personas_for_exploration(exploration_id)
        if personas:
            persona_section = "[PERSONAS]\n"
            persona_section += "\n\n".join(_format_persona(p) for p in personas)
            sections.append(persona_section)
        metadata["sources"]["personas"] = {
            "included": bool(personas),
            "count": len(personas),
            "names": [p.get("name") for p in personas],
        }
    except Exception as e:
        metadata["sources"]["personas"] = {"included": False, "error": str(e)}
        personas = []

    # 3. Flow-specific research context
    report_source: Optional[str] = None
    if flow == "qual":
        report_source = await _load_qual_context(sections, metadata, exploration_id)
    else:
        await _load_quant_context(sections, metadata, exploration_id, workspace_id)

    rendered = "\n\n".join(s.strip() for s in sections if s.strip())
    token_estimate = max(1, len(rendered) // 4)

    metadata["token_estimate"] = token_estimate
    metadata["report_source"] = report_source

    return {
        "rendered": rendered,
        "metadata": metadata,
        "personas_loaded": len(personas),
        "report_source": report_source,
        "token_estimate": token_estimate,
    }


async def _load_qual_context(
    sections: List[str],
    metadata: Dict[str, Any],
    exploration_id: str,
) -> Optional[str]:
    """Try DI report → BA report → raw interviews. Returns the source name used."""
    for cta in ("DECISION_INTELLIGENCE", "BEHAVIORAL_ARCHAEOLOGY"):
        try:
            cached = await get_cached_report(exploration_id, cta)
            if cached and cached.report_markdown:
                content = cached.report_markdown[:MAX_REPORT_CHARS]
                sections.append(f"[RESEARCH_CONTEXT — {cta}]\n{content}")
                metadata["sources"]["qual_context"] = {
                    "included": True,
                    "source": "report_cache",
                    "cta": cta,
                    "chars": len(content),
                    "truncated": len(cached.report_markdown) > MAX_REPORT_CHARS,
                }
                return cta
        except Exception:
            continue

    # Fallback: raw interview messages
    try:
        interviews = await get_interviews_by_exploration_id(exploration_id)
        if interviews:
            interview_texts = []
            for iv in interviews[:8]:
                messages = iv.get("messages") or []
                if messages:
                    pid = iv.get("persona_id", "unknown")
                    interview_texts.append(f"Interview (persona: {pid}):\n{_format_interview_messages(messages[:20])}")
            if interview_texts:
                combined = "\n\n---\n\n".join(interview_texts)[:MAX_REPORT_CHARS]
                sections.append(f"[RESEARCH_CONTEXT — INTERVIEWS]\n{combined}")
                metadata["sources"]["qual_context"] = {
                    "included": True,
                    "source": "raw_interviews",
                    "interview_count": len(interviews),
                }
                return "INTERVIEWS"
    except Exception as e:
        metadata["sources"]["qual_context"] = {"included": False, "error": str(e)}

    return None


async def _load_quant_context(
    sections: List[str],
    metadata: Dict[str, Any],
    exploration_id: str,
    workspace_id: str,
) -> None:
    """Load quantitative survey simulation results or DI quant report."""
    # Try cached quant report first
    for cta in ("DECISION_INTELLIGENCE", "BEHAVIORAL_ARCHAEOLOGY"):
        try:
            cached = await get_cached_report(exploration_id, cta)
            if cached and cached.report_markdown:
                content = cached.report_markdown[:MAX_REPORT_CHARS]
                sections.append(f"[RESEARCH_CONTEXT — QUANTITATIVE {cta}]\n{content}")
                metadata["sources"]["quant_context"] = {
                    "included": True,
                    "source": "report_cache",
                    "cta": cta,
                    "chars": len(content),
                }
                return
        except Exception:
            continue

    # Fallback: raw survey simulation results
    try:
        from app.services.survey_simulation import get_latest_survey_simulation

        sim = await get_latest_survey_simulation(exploration_id, workspace_id)
        if sim and hasattr(sim, "results") and sim.results:
            results_text = json.dumps(sim.results, ensure_ascii=False, indent=2)[:MAX_REPORT_CHARS]
            sections.append(f"[RESEARCH_CONTEXT — SURVEY RESULTS]\n{results_text}")
            metadata["sources"]["quant_context"] = {
                "included": True,
                "source": "survey_simulation",
                "sim_id": sim.id if hasattr(sim, "id") else None,
            }
            return
    except Exception as e:
        metadata["sources"]["quant_context"] = {"included": False, "error": str(e)}
