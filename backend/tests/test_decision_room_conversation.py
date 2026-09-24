"""Decision Room conversation: the context has to survive the whole session.

The Anthropic API is stateless — only what a request carries is available to
it. The context used to be injected into the first user turn, and the message
persisted alongside it was the user's own text, so the evidence existed for
exactly one request. From the second question on the analyst was answering
about research it could no longer see, which is why it described having "the
research question" but not the findings.

These pin the two halves of the fix: the conversation is replayed intact, and
the evidence rides the system blocks on every single turn.

Run: pytest tests/test_decision_room_conversation.py -v
"""

from __future__ import annotations

import asyncio

import pytest

from app.services import decision_room as dr

CONTEXT = "[RESEARCH_OBJECTIVE]\nWhich benefits drive purchase?\n\n[PERSONAS]\nValue Seeker"


def run(coro):
    return asyncio.run(coro)


def _system_text(system) -> str:
    """Everything the model is given as system content, however it is shaped."""
    if isinstance(system, str):
        return system
    return "\n".join(block["text"] for block in system)


# ── The conversation itself ──────────────────────────────────────────────────

def test_history_is_replayed_and_the_opening_greeting_is_not():
    history = [
        {"role": "analyst", "content": "greeting", "sequence_num": 1},
        {"role": "user", "content": "q1", "sequence_num": 2},
        {"role": "analyst", "content": "a1", "sequence_num": 3},
    ]

    messages = dr._build_messages_for_claude(history, "q2")

    assert [(m["role"], m["content"]) for m in messages] == [
        ("user", "q1"), ("assistant", "a1"), ("user", "q2"),
    ]


def test_the_user_message_is_sent_as_the_user_wrote_it():
    """Context is no longer glued onto the front of the question, so what is
    sent matches what is stored and shown in the transcript."""
    messages = dr._build_messages_for_claude([], "what should we launch?")

    assert messages[-1]["content"] == "what should we launch?"


def test_long_conversations_are_trimmed_but_keep_the_newest_turns():
    history = [{"role": "analyst", "content": "greeting", "sequence_num": 1}]
    for i in range(2, 2 + dr.MAX_HISTORY_TURNS * 2 + 10):
        role = "user" if i % 2 == 0 else "analyst"
        history.append({"role": role, "content": f"m{i}", "sequence_num": i})

    messages = dr._build_messages_for_claude(history, "latest")

    assert len(messages) <= dr.MAX_HISTORY_TURNS * 2 + 1
    assert messages[-1]["content"] == "latest"


# ── The evidence, on every turn ──────────────────────────────────────────────

@pytest.mark.parametrize("turn", [1, 2, 3, 8])
def test_the_research_context_is_present_on_every_turn(turn):
    """The regression. Previously only turn 1 carried the context."""
    history = [{"role": "analyst", "content": "greeting", "sequence_num": 1}]
    seq = 2
    for _ in range(turn - 1):
        history.append({"role": "user", "content": "q", "sequence_num": seq})
        history.append({"role": "analyst", "content": "a", "sequence_num": seq + 1})
        seq += 2

    system = dr._build_system_blocks(CONTEXT)
    messages = dr._build_messages_for_claude(history, "next question")

    assert "Which benefits drive purchase?" in _system_text(system)
    assert "Value Seeker" in _system_text(system)
    # And it is not duplicated into the conversation on top of that.
    assert all(CONTEXT not in m["content"] for m in messages)


def test_the_system_prompt_still_leads():
    system = dr._build_system_blocks(CONTEXT)

    assert system[0]["text"] == dr.DECISION_ROOM_SYSTEM_PROMPT
    assert "RESEARCH CONTEXT" in system[1]["text"]


def test_the_context_block_is_marked_cacheable():
    """Resending the evidence every turn is only affordable because the block
    is cached; without this the cost scales with conversation length."""
    system = dr._build_system_blocks(CONTEXT)

    assert system[1]["cache_control"] == {"type": "ephemeral"}


def test_no_context_falls_back_to_the_plain_system_prompt():
    """An empty cacheable block would be sent on every turn for nothing."""
    assert dr._build_system_blocks("") == dr.DECISION_ROOM_SYSTEM_PROMPT


# ── Snapshot repair ──────────────────────────────────────────────────────────

class _Session:
    def __init__(self, rendered="", metadata=None):
        self.id = "sess_1"
        self.exploration_id = "exp_1"
        self.workspace_id = "ws_1"
        self.flow = "qual"
        self.context_rendered = rendered
        self.context_metadata = metadata or {}


class _Db:
    """The repair writes through the session object, not a separate statement."""

    async def execute(self, *args, **kwargs):  # pragma: no cover - must stay unused
        raise AssertionError("context repair should not issue its own statement")


COMPLETE_META = {
    "sources": {"personas": {"included": True}},
    "reports_loaded": ["DECISION_INTELLIGENCE"],
}


def test_a_complete_snapshot_is_reused_untouched(monkeypatch):
    """A Decision Room is a conversation about the research as it stood when
    the room was opened; a healthy snapshot is not silently replaced."""
    called = []

    async def fake_assemble(*args, **kwargs):
        called.append(args)
        return {"rendered": "REBUILT", "metadata": {}}

    monkeypatch.setattr(dr, "assemble_context", fake_assemble)
    session, db = _Session("STORED CONTEXT", COMPLETE_META), _Db()

    rendered = run(dr._ensure_context(session, db))

    assert rendered == "STORED CONTEXT"
    assert called == []
    assert session.context_rendered == "STORED CONTEXT"


def test_an_empty_snapshot_is_rebuilt_and_saved(monkeypatch):
    """Every session created while the lookups were broken holds one of these;
    without repair they would stay empty for their whole life."""
    async def fake_assemble(exploration_id, workspace_id, flow):
        return {"rendered": "FULL RESEARCH CONTEXT", "metadata": COMPLETE_META}

    monkeypatch.setattr(dr, "assemble_context", fake_assemble)
    session, db = _Session("", {}), _Db()

    rendered = run(dr._ensure_context(session, db))

    assert rendered == "FULL RESEARCH CONTEXT"
    assert session.context_rendered == "FULL RESEARCH CONTEXT"
    assert session.context_metadata == COMPLETE_META


def test_a_report_generated_after_the_room_opened_is_picked_up(monkeypatch):
    """Opening the room while reports are still generating is ordinary; the
    session should not be stuck with what existed at that moment."""
    thin = {"sources": {"personas": {"included": True}}, "reports_loaded": [], "evidence_source": None}

    async def fake_assemble(exploration_id, workspace_id, flow):
        return {"rendered": "OBJECTIVE + PERSONAS + THE NEW DI REPORT", "metadata": COMPLETE_META}

    monkeypatch.setattr(dr, "assemble_context", fake_assemble)
    session, db = _Session("OBJECTIVE + PERSONAS", thin), _Db()

    rendered = run(dr._ensure_context(session, db))

    assert "THE NEW DI REPORT" in rendered
    assert session.context_rendered == rendered


def test_a_rebuild_that_finds_no_more_than_before_keeps_the_stored_copy(monkeypatch):
    """Nothing has been generated yet, so there is nothing to gain from
    overwriting — and a shorter rebuild must never shrink the context."""
    async def fake_assemble(exploration_id, workspace_id, flow):
        return {"rendered": "SHORT", "metadata": {}}

    monkeypatch.setattr(dr, "assemble_context", fake_assemble)
    session, db = _Session("A MUCH LONGER STORED CONTEXT", {}), _Db()

    rendered = run(dr._ensure_context(session, db))

    assert rendered == "A MUCH LONGER STORED CONTEXT"
    assert session.context_rendered == "A MUCH LONGER STORED CONTEXT"


def test_a_failing_rebuild_leaves_the_session_usable(monkeypatch):
    """Context assembly is best-effort; it must not be able to break sending
    a message."""
    async def boom(*args, **kwargs):
        raise RuntimeError("database down")

    monkeypatch.setattr(dr, "assemble_context", boom)
    session, db = _Session("STORED", {}), _Db()

    assert run(dr._ensure_context(session, db)) == "STORED"
