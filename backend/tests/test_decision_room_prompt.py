"""Decision Room system prompt: tone guardrails.

The analyst previously answered missing-context situations by telling the user
they were wrong - "I have not written, presented, or referenced...", "I need to
correct the record". The system prompt now carries an explicit polite
verification protocol. These checks pin that guidance in place so a future edit
cannot quietly drop it.

Everything here reads the prompt constant; no database or API is used.

Run: pytest tests/test_decision_room_prompt.py -v
"""

from __future__ import annotations

from app.services.decision_room_prompt import DECISION_ROOM_SYSTEM_PROMPT


def test_prompt_requires_checking_research_context_before_denying_a_finding():
    prompt = DECISION_ROOM_SYSTEM_PROMPT
    assert "Polite Research Verification Protocol" in prompt
    assert "Before denying a finding" in prompt
    assert "Quant output and Decision Intelligence report" in prompt


def test_prompt_separates_cannot_find_from_does_not_exist():
    prompt = DECISION_ROOM_SYSTEM_PROMPT
    assert "could not find it in the currently available outputs" in prompt
    assert "do not claim it does not exist absolutely" in prompt


def test_prompt_bans_the_confrontational_phrases_seen_in_production():
    prompt = DECISION_ROOM_SYSTEM_PROMPT
    for banned in (
        "you are fundamentally misunderstanding",
        "I need to correct the record",
        "I have not written",
        "that finding does not exist",
    ):
        assert banned in prompt, f"prompt should name the banned phrase: {banned!r}"
    assert "Do not say or imply that the user is wrong" in prompt
