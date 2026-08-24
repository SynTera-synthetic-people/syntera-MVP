"""Effective respondent counts from recorded shadow events.

For each question (identified by text hash), the latest state per persona
decides whether that persona answered or abstained. The effective count is
answered personas, which is the denominator percentages should reconcile
against once abstention is live; while the layer is shadow-only these
numbers are informational.
"""
from __future__ import annotations

from typing import Any, Iterable


def aggregate(events: Iterable[Any]) -> dict:
    """Summarise events (NeuroEvent rows or equivalent dicts) into
    per-question effective counts plus totals. Failed computations (error
    set) and events without a question hash are ignored."""
    latest: dict[tuple[str, str], Any] = {}
    for e in events:
        get = e.get if isinstance(e, dict) else lambda k, _e=e: getattr(_e, k, None)
        if get("error"):
            continue
        q_hash = get("question_text_hash")
        if not q_hash:
            continue
        persona = get("persona_id") or "population"
        key = (q_hash, persona)
        current = latest.get(key)
        created = get("created_at")
        if current is None or (created is not None and created >= current["created_at"]):
            state = get("state_json") or {}
            latest[key] = {
                "created_at": created,
                "abstain": bool(state.get("abstain")),
                "question_text_hash": q_hash,
            }

    questions: dict[str, dict[str, int]] = {}
    for entry in latest.values():
        q = questions.setdefault(
            entry["question_text_hash"],
            {"total": 0, "answered": 0, "abstained": 0},
        )
        q["total"] += 1
        if entry["abstain"]:
            q["abstained"] += 1
        else:
            q["answered"] += 1

    totals = {
        "questions": len(questions),
        "responses": sum(q["total"] for q in questions.values()),
        "answered": sum(q["answered"] for q in questions.values()),
        "abstained": sum(q["abstained"] for q in questions.values()),
    }
    return {"questions": questions, "totals": totals}
