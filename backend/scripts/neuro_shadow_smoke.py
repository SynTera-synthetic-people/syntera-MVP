"""End-to-end check of shadow recording against the database in .env; writes
and deletes only smoke-* rows. Run: python -m scripts.neuro_shadow_smoke
"""
from __future__ import annotations

import asyncio
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_engine
from app.neuro import effective_n
from app.neuro import engine as neuro_engine
from app.neuro import persona_params, question_features, service, state_store
from app.neuro.conversation_key import (
    interview_conversation_key,
    rebuttal_conversation_key,
)
from app.neuro.types import QuestionAffectFeatures, Surface

WS, EX, PER = "smoke-ws", "smoke-ex", "smoke-persona"
QUESTIONS = [
    "How do you feel about ordering takeaway on a weeknight?",
    "What would make you feel guilty about that choice?",
    "Walk me through the last time you ordered in.",
]
SMOKE_QUESTION_ID = "smoke-question-feature"


def check(name: str, ok: bool, detail: str = "") -> bool:
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    return ok


async def _cleanup() -> None:
    async with AsyncSession(async_engine) as session:
        async with session.begin():
            prefix = f"conv1:{WS}:{EX}:%"
            await session.execute(
                text("DELETE FROM neuro_event WHERE conversation_key LIKE :p"), {"p": prefix}
            )
            await session.execute(
                text("DELETE FROM neuro_conversation_state WHERE conversation_key LIKE :p"),
                {"p": prefix},
            )
            await session.execute(
                text("DELETE FROM neuro_flag WHERE key = 'NEURO_MODE'")
            )
            await session.execute(
                text("DELETE FROM neuro_question_feature WHERE question_id = :q"),
                {"q": SMOKE_QUESTION_ID},
            )


async def main() -> int:
    ok = True
    key = interview_conversation_key(WS, EX, PER)
    await _cleanup()
    service._flag_cache.clear()

    print("1) Flag defaults off")
    ok &= check("is_enabled() is False with no flag row", not await service.is_enabled())
    n = await service.record_interview_shadow_turns(
        workspace_id=WS, exploration_id=EX, persona_id=PER, question_texts=QUESTIONS
    )
    ok &= check("adapter records nothing while off", n == 0)
    ok &= check("no state row exists", await state_store.read_state(key) is None)

    print("2) Flip on at runtime (no restart)")
    await service.set_enabled(True)
    ok &= check("is_enabled() is True after flip", await service.is_enabled())
    n = await service.record_interview_shadow_turns(
        workspace_id=WS, exploration_id=EX, persona_id=PER, question_texts=QUESTIONS
    )
    ok &= check(f"adapter recorded {len(QUESTIONS)} turns", n == len(QUESTIONS), f"got {n}")
    row = await state_store.read_state(key)
    ok &= check("state row exists", row is not None)
    if row:
        ok &= check(
            "state is at final turn_index", row.turn_index == len(QUESTIONS) - 1,
            f"turn_index={row.turn_index}",
        )
        ok &= check(
            "state carries current engine provenance",
            row.state_json.get("provenance", {}).get("model_version")
            == neuro_engine.ENGINE_VERSION,
        )
        ok &= check(
            "state carries a rendered block",
            str(row.state_json.get("rendered") or "").startswith("EMOTIONAL STATE:"),
        )
        ok &= check(
            "state carries appraisal scores",
            isinstance(row.state_json.get("appraisal_scores"), dict),
        )
        ok &= check(
            "state carries expression fields",
            row.state_json.get("say_do_gap") is not None
            and row.state_json.get("expressed") is not None,
        )
    events = await state_store.read_events(key)
    ok &= check(
        f"{len(QUESTIONS)} shadow event rows", len(events) == len(QUESTIONS),
        f"got {len(events)}",
    )
    ok &= check("every event is shadow=True", all(e.shadow for e in events))
    ok &= check("no event carries an error", all(e.error is None for e in events))
    first_states = sorted(
        ( {k2: v for k2, v in e.state_json.items() if k2 != "computed_at"}
          for e in events ),
        key=lambda s: s["turn_index"],
    )

    print("3) Determinism on re-run")
    n = await service.record_interview_shadow_turns(
        workspace_id=WS, exploration_id=EX, persona_id=PER, question_texts=QUESTIONS
    )
    events2 = await state_store.read_events(key, limit=100)
    latest = sorted(
        ( {k2: v for k2, v in e.state_json.items() if k2 != "computed_at"}
          for e in events2[: len(QUESTIONS)] ),
        key=lambda s: s["turn_index"],
    )
    ok &= check("re-run states identical to first run", latest == first_states)

    print("4) Computed states respond to inputs")
    guilt = await service.record_shadow_turn(
        conversation_key=key, workspace_id=WS, exploration_id=EX, persona_id=PER,
        question_text="Do you feel guilty about the money you spend on debt?",
        question_id=None, surface=Surface.INTERVIEW, turn_index=90,
    )
    colour = await service.record_shadow_turn(
        conversation_key=key, workspace_id=WS, exploration_id=EX, persona_id=PER,
        question_text="Which colour do you prefer for a water bottle?",
        question_id=None, surface=Surface.INTERVIEW, turn_index=91,
    )
    ok &= check(
        "different questions produce different states",
        guilt is not None and colour is not None and guilt.summary != colour.summary,
    )
    upbeat = {
        "id": "smoke-upbeat",
        "persona_details": {
            "layer_3_emotional_fingerprint": {"baseline_emotions": ["joy", "hope", "trust"]}
        },
    }
    anxious = {
        "id": "smoke-anxious",
        "persona_details": {
            "layer_3_emotional_fingerprint": {"baseline_emotions": ["anxiety", "stress", "frustration"]}
        },
    }
    s_up = await service.record_shadow_turn(
        conversation_key=key, workspace_id=WS, exploration_id=EX, persona_id=PER,
        question_text=QUESTIONS[0], question_id=None,
        surface=Surface.INTERVIEW, turn_index=92, persona=upbeat,
    )
    s_ax = await service.record_shadow_turn(
        conversation_key=key, workspace_id=WS, exploration_id=EX, persona_id=PER,
        question_text=QUESTIONS[0], question_id=None,
        surface=Surface.INTERVIEW, turn_index=93, persona=anxious,
    )
    ok &= check(
        "different personas produce different states on the same question",
        s_up is not None and s_ax is not None and s_up.summary != s_ax.summary,
    )
    ok &= check(
        "persona fingerprints separate on valence",
        s_up is not None and s_ax is not None
        and s_up.summary.valence > s_ax.summary.valence,
    )

    print("5) Question feature caching")
    f1 = await question_features.get_or_compute(
        SMOKE_QUESTION_ID, "interview", QUESTIONS[1]
    )
    f2 = await question_features.get_or_compute(
        SMOKE_QUESTION_ID, "interview", QUESTIONS[1]
    )
    ok &= check("cached features round-trip identically", f1 == f2)
    ok &= check("features carry a framing and stakes", f1.framing is not None and 0 <= f1.stakes <= 1)

    print("6) Carry-over and rebuttal continuity")
    sticky = {
        "id": "smoke-sticky",
        "persona_details": {
            "layer_3_emotional_fingerprint": {
                "baseline_emotions": ["anxiety", "stress", "hope"]
            },
            "emotional_memory": "high emotional memory",
        },
    }
    n = await service.record_interview_shadow_turns(
        workspace_id=WS, exploration_id=EX, persona_id=PER,
        question_texts=QUESTIONS, persona=sticky,
    )
    ok &= check("sticky persona interview recorded", n == len(QUESTIONS), f"got {n}")
    events_c = await state_store.read_events(key, limit=len(QUESTIONS))
    by_turn = {e.turn_index: e.state_json for e in events_c}
    ok &= check(
        "first turn starts fresh",
        by_turn.get(0, {}).get("carried_from_turn") is None,
    )
    ok &= check(
        "later turns carry the previous one",
        by_turn.get(1, {}).get("carried_from_turn") == 0
        and by_turn.get(2, {}).get("carried_from_turn") == 1,
    )
    reb = await service.record_rebuttal_shadow_turn(
        workspace_id=WS, exploration_id=EX, persona_id=PER,
        question_text="But yesterday you said the opposite; why?",
        persona=sticky,
    )
    ok &= check(
        "rebuttal continues from the interview's stored state",
        reb is not None and reb.turn_index == len(QUESTIONS)
        and reb.carried_from_turn == len(QUESTIONS) - 1,
    )
    direct_state = await service.record_shadow_turn(
        conversation_key=key, workspace_id=WS, exploration_id=EX, persona_id=PER,
        question_text="Do you feel guilty about the money you spend on debt?",
        question_id=None, surface=Surface.INTERVIEW, turn_index=95, persona=sticky,
    )
    projective_state = await service.record_shadow_turn(
        conversation_key=key, workspace_id=WS, exploration_id=EX, persona_id=PER,
        question_text="Imagine a friend in your situation; how might they see it?",
        question_id=None, surface=Surface.INTERVIEW, turn_index=96, persona=sticky,
    )
    ok &= check(
        "say-do gap widens on direct high-stakes questions",
        direct_state is not None and projective_state is not None
        and (direct_state.say_do_gap or 0) > (projective_state.say_do_gap or 0),
    )

    print("7) Additional surfaces")
    before_row = await state_store.read_state(key)
    live = await service.record_live_reply_shadow_turn(
        workspace_id=WS, exploration_id=EX, persona_id=PER,
        question_text="And why do you feel that way?", persona=sticky,
    )
    ok &= check(
        "live reply continues the stored interview thread",
        live is not None and before_row is not None
        and live.turn_index == before_row.turn_index + 1,
    )
    n_art = await service.record_artifact_shadow_turns(
        workspace_id=WS, exploration_id=EX, persona_id=PER,
        question_texts=["What stands out in this ad?", "Would you trust this brand?"],
        persona=sticky, session_id="smoke-art",
    )
    ok &= check("artifact adapter recorded both turns", n_art == 2, f"got {n_art}")
    art_key = f"conv1:{WS}:{EX}:{PER}:artifact:smoke-art"
    art_row = await state_store.read_state(art_key)
    main_row = await state_store.read_state(key)
    ok &= check("artifact thread has its own state row", art_row is not None and art_row.turn_index == 1)
    ok &= check(
        "interview thread untouched by the artifact run",
        main_row is not None and live is not None and main_row.turn_index == live.turn_index,
    )
    art_events = await state_store.read_events(art_key, limit=5)
    ok &= check(
        "artifact events carry the artifact surface",
        len(art_events) == 2 and all(e.surface == "artifact_response" for e in art_events),
    )
    n_svy = await service.record_survey_shadow_turns(
        workspace_id=WS, exploration_id=EX, persona_id="smoke-survey-persona",
        question_texts=["Pick a colour", "Rate the price"], simulation_id="smoke-sim",
    )
    ok &= check("survey adapter recorded both turns", n_svy == 2, f"got {n_svy}")
    svy_events = await state_store.read_events(
        f"conv1:{WS}:{EX}:smoke-survey-persona:survey:smoke-sim", limit=5
    )
    amb_record = {
        "id": "smoke-amb",
        "persona_details": {
            "layer_3_emotional_fingerprint": {
                "baseline_emotions": ["content", "hopeful"],
                "emotional_memory": "long",
            },
            "layer_7_aspiration_fear": {
                "hoped_for_self": "disciplined saver",
                "feared_self": "reckless spender",
            },
        },
    }
    amb_params = persona_params.from_persona(amb_record)
    amb_state = neuro_engine.compute_turn(
        persona=amb_params,
        question=QuestionAffectFeatures(
            text_hash="smoke-amb-q", framing="direct",
            stakes=0.9, affect_relevance=0.9,
        ),
        previous=None,
        turn_index=0,
    )
    ok &= check("persona record yields value tensions", len(amb_params.tensions) > 0)
    ok &= check("activated tension produces a bimodal state", amb_state.bimodal)
    ok &= check(
        "bimodal rendering names both sides",
        "two things at once" in (amb_state.rendered or ""),
    )
    ok &= check(
        "survey events carry the survey surface",
        len(svy_events) == 2 and all(e.surface == "survey_simulation" for e in svy_events),
    )

    print("8) Confidence, abstention and effective counts")
    no_evidence = {
        "id": "smoke-no-evidence",
        "persona_details": {
            "layer_3_emotional_fingerprint": {"baseline_emotions": ["joy", "trust"]},
            "evidence": {},
        },
    }
    rich_evidence = {
        "id": "smoke-rich-evidence",
        "persona_details": {
            "layer_3_emotional_fingerprint": {"baseline_emotions": ["joy", "trust"]},
            "evidence": {"e1": 1, "e2": 1, "e3": 1, "e4": 1},
        },
    }
    s_thin = await service.record_shadow_turn(
        conversation_key=key, workspace_id=WS, exploration_id=EX, persona_id="smoke-no-evidence",
        question_text=QUESTIONS[0], question_id=None,
        surface=Surface.INTERVIEW, turn_index=0, persona=no_evidence,
    )
    s_rich = await service.record_shadow_turn(
        conversation_key=key, workspace_id=WS, exploration_id=EX, persona_id="smoke-rich-evidence",
        question_text=QUESTIONS[0], question_id=None,
        surface=Surface.INTERVIEW, turn_index=0, persona=rich_evidence,
    )
    ok &= check(
        "persona with empty evidence abstains",
        s_thin is not None and s_thin.abstain is True,
    )
    ok &= check(
        "abstaining state renders a visible decline",
        s_thin is not None and "declines" in (s_thin.rendered or ""),
    )
    ok &= check(
        "well-evidenced persona answers",
        s_rich is not None and s_rich.abstain is False,
    )
    ok &= check(
        "confidence terms recorded on the state",
        s_rich is not None and isinstance(s_rich.confidence_terms, dict),
    )
    all_events = await state_store.read_events_for_exploration(WS, EX)
    agg = effective_n.aggregate(all_events)
    q_hash = neuro_engine.question_text_hash(QUESTIONS[0])
    counts = agg["questions"].get(q_hash, {})
    ok &= check(
        "effective count reconciles: answered + abstained == total",
        counts and counts["answered"] + counts["abstained"] == counts["total"],
        f"counts={counts}",
    )
    ok &= check(
        "abstainer reduces the effective count below total",
        counts and counts["answered"] < counts["total"],
    )

    print("9) Conversation-key convention")
    ok &= check(
        "interview and rebuttal resolve to the same key",
        interview_conversation_key(WS, EX, PER) == rebuttal_conversation_key(WS, EX, PER),
    )

    print("10) Failure recording on forced engine crash")
    real_compute = neuro_engine.compute_turn

    def _boom(**kwargs):
        raise RuntimeError("forced crash for smoke test")

    service.engine.compute_turn = _boom  # type: ignore[assignment]
    try:
        n = await service.record_interview_shadow_turns(
            workspace_id=WS, exploration_id=EX, persona_id=PER, question_texts=["crash q"]
        )
    finally:
        service.engine.compute_turn = real_compute  # type: ignore[assignment]
    ok &= check("adapter returned 0 and raised nothing", n == 0)
    events3 = await state_store.read_events(key, limit=5)
    ok &= check(
        "failure recorded as an error event",
        bool(events3) and events3[0].error is not None
        and "forced crash" in events3[0].error,
    )

    print("11) Flip off again")
    await service.set_enabled(False)
    ok &= check("is_enabled() is False", not await service.is_enabled())
    before = len(await state_store.read_events(key, limit=200))
    await service.record_interview_shadow_turns(
        workspace_id=WS, exploration_id=EX, persona_id=PER, question_texts=QUESTIONS
    )
    after = len(await state_store.read_events(key, limit=200))
    ok &= check("no new events while off", before == after)

    await _cleanup()
    print()
    if ok:
        print("ALL SMOKE CHECKS PASSED")
        return 0
    print("SMOKE CHECKS FAILED")
    return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
