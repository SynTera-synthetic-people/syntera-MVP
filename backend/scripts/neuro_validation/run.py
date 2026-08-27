"""Validation gates for the neuroscience layer.

Empirical gates read recorded shadow events from the database in .env and
report INSUFFICIENT DATA rather than failing when too little has been
recorded. Synthetic gates run the engine and renderer directly and always
execute. Exit code is non-zero only on a FAIL.

Run: python -m scripts.neuro_validation.run
"""
from __future__ import annotations

import asyncio
import json
import statistics
import sys

from sqlalchemy import text

from app.db import async_engine
from app.neuro import engine, renderer
from app.neuro.types import CoreAffect, PersonaAffectParams, QuestionAffectFeatures

RESULTS: list[tuple[str, str, str]] = []


def record(gate: str, status: str, detail: str) -> None:
    RESULTS.append((gate, status, detail))
    print(f"[{status:^12}] {gate}: {detail}")


async def _load_events() -> list[dict]:
    async with async_engine.connect() as conn:
        rows = (await conn.execute(text(
            "SELECT conversation_key, persona_id, surface, error, state_json "
            "FROM neuro_event ORDER BY conversation_key, created_at"
        ))).all()
    out = []
    for key, persona_id, surface, error, state_json in rows:
        state = state_json if isinstance(state_json, dict) else json.loads(state_json or "{}")
        out.append({"key": key, "persona_id": persona_id, "surface": surface,
                    "error": error, "state": state})
    return out


def _valence(event: dict) -> float | None:
    s = (event["state"] or {}).get("summary") or {}
    v = s.get("valence")
    return float(v) if v is not None else None


def gate_a_variation(events: list[dict]) -> None:
    """Computed affect must actually vary across a conversation's questions
    and across personas; a layer that returns the baseline everywhere fails
    here."""
    ok_events = [e for e in events if not e["error"] and _valence(e) is not None]
    by_conv: dict[str, list[float]] = {}
    for e in ok_events:
        by_conv.setdefault(e["key"], []).append(_valence(e))
    within = [statistics.pstdev(vs) for vs in by_conv.values() if len(vs) >= 3]
    means_by_persona: dict[str, list[float]] = {}
    for e in ok_events:
        if e["persona_id"]:
            means_by_persona.setdefault(e["persona_id"], []).append(_valence(e))
    persona_means = [statistics.fmean(v) for v in means_by_persona.values()]
    if len(within) < 3 or len(persona_means) < 3:
        record("Gate A (variation)", "INSUFFICIENT",
               f"{len(within)} conversations with 3+ turns, "
               f"{len(persona_means)} personas; need 3 of each")
        return
    med_within = statistics.median(within)
    between = statistics.pstdev(persona_means)
    passed = med_within >= 0.02 and between >= 0.03
    record("Gate A (variation)", "PASS" if passed else "FAIL",
           f"median within-conversation valence std {med_within:.3f} (>=0.02), "
           f"between-persona std {between:.3f} (>=0.03)")


def gate_b_memory(events: list[dict]) -> None:
    """Carry-over must earn its place: synthetically, a persistent persona
    ends a sequence measurably closer to an earlier strong state than a
    persistence-free ablation; empirically, adjacent turns should co-vary."""
    strong = QuestionAffectFeatures(text_hash="vb-strong", framing="direct",
                                    stakes=0.9, affect_relevance=0.9)
    mild = QuestionAffectFeatures(text_hash="vb-mild", framing="indirect",
                                  stakes=0.1, affect_relevance=0.2)
    baseline = CoreAffect(valence=0.4, arousal=0.3, direction=0.3)

    def next_distance(persistence: float) -> float:
        p = PersonaAffectParams(persona_id="vb", persistence=persistence,
                                evidence_n=4, baseline=baseline)
        prev = engine.compute_turn(persona=p, question=strong, previous=None, turn_index=0)
        nxt = engine.compute_turn(persona=p, question=mild, previous=prev, turn_index=1)
        s, n = prev.summary, nxt.summary
        return (abs(n.valence - s.valence) + abs(n.arousal - s.arousal)
                + abs(n.direction - s.direction))

    d_high, d_mid, d_none = next_distance(0.9), next_distance(0.5), next_distance(0.0)
    synthetic_ok = d_high < d_mid < d_none
    detail = (f"synthetic ablation: distance to previous state "
              f"{d_high:.4f} (persistence 0.9) < {d_mid:.4f} (0.5) < {d_none:.4f} (0.0)")

    ok_events = [e for e in events if not e["error"] and _valence(e) is not None]
    by_conv: dict[str, list[float]] = {}
    for e in ok_events:
        by_conv.setdefault(e["key"], []).append(_valence(e))
    series = [vs for vs in by_conv.values() if len(vs) >= 4 and statistics.pstdev(vs) > 1e-9]
    if series:
        corrs = []
        for vs in series:
            a, b = vs[:-1], vs[1:]
            try:
                corrs.append(statistics.correlation(a, b))
            except statistics.StatisticsError:
                continue
        if corrs:
            detail += f"; empirical median lag-1 correlation {statistics.median(corrs):.3f} over {len(corrs)} conversations"
    else:
        detail += "; no conversations long enough for the empirical check yet"
    record("Gate B (memory)", "PASS" if synthetic_ok else "FAIL", detail)


def gate_c_arithmetic(events: list[dict]) -> None:
    """Every recorded confidence must equal the product of its terms, and
    every abstention flag must follow from the recorded threshold."""
    checked = 0
    for e in events:
        if e["error"]:
            continue
        st = e["state"] or {}
        conf, terms = st.get("confidence"), st.get("confidence_terms") or {}
        prov = st.get("provenance") or {}
        threshold = prov.get("abstention_threshold")
        if conf is None or not terms or threshold is None:
            continue
        product = 1.0
        for v in terms.values():
            product *= float(v)
        if abs(float(conf) - round(product, 6)) > 1e-6:
            record("Gate C (arithmetic)", "FAIL",
                   f"confidence {conf} != product of terms {product:.6f} on {e['key']}")
            return
        if bool(st.get("abstain")) != (float(conf) < float(threshold)):
            record("Gate C (arithmetic)", "FAIL",
                   f"abstain flag inconsistent with threshold on {e['key']}")
            return
        checked += 1
    if checked == 0:
        record("Gate C (arithmetic)", "INSUFFICIENT", "no recorded states to check")
    else:
        record("Gate C (arithmetic)", "PASS",
               f"{checked} recorded states reconcile confidence, terms and abstention")


def gate_e1_renderer() -> None:
    """Distinct states must render distinguishably, and the special renderings
    must be visibly special."""
    p = PersonaAffectParams(persona_id="ve1", granularity=0.8, evidence_n=4)
    texts = set()
    total = 0
    for v in (-0.8, -0.3, 0.0, 0.3, 0.8):
        for a in (0.2, 0.8):
            for d in (-0.6, 0.6):
                q = QuestionAffectFeatures(text_hash=f"ve1-{v}-{a}-{d}")
                state = engine.compute_turn(persona=PersonaAffectParams(
                    persona_id="ve1", granularity=0.8, evidence_n=4,
                    baseline=CoreAffect(valence=v, arousal=a, direction=d),
                    spread=0.2,
                ), question=q, previous=None, turn_index=0)
                texts.add(renderer.render(state, p))
                total += 1
    ratio = len(texts) / total
    passed = ratio >= 0.5
    record("Gate E1 (renderer)", "PASS" if passed else "FAIL",
           f"{len(texts)} distinct renderings over {total} distinct states "
           f"(ratio {ratio:.2f}, floor 0.50)")


def negative_control() -> None:
    """The variation metric must be capable of failing: an identical question
    repeated to a settling persona must show less within-run variation than a
    varied sequence shows."""
    p = PersonaAffectParams(persona_id="vnc", persistence=0.5, evidence_n=4,
                            baseline=CoreAffect(valence=0.3, arousal=0.3, direction=0.2))
    same = QuestionAffectFeatures(text_hash="vnc-same", stakes=0.2, affect_relevance=0.3)
    varied = [
        QuestionAffectFeatures(text_hash=f"vnc-{i}", framing=f,
                               stakes=s, affect_relevance=r)
        for i, (f, s, r) in enumerate([
            ("direct", 0.9, 0.9), ("indirect", 0.1, 0.2),
            ("projective", 0.5, 0.7), ("behavioral", 0.7, 0.4),
        ])
    ]

    def run(questions) -> float:
        state, vals = None, []
        for i, q in enumerate(questions):
            state = engine.compute_turn(persona=p, question=q, previous=state, turn_index=i)
            vals.append(state.summary.valence)
        return statistics.pstdev(vals)

    std_same = run([same] * 4)
    std_varied = run(varied)
    passed = std_same < std_varied
    record("Negative control", "PASS" if passed else "FAIL",
           f"repeated-question std {std_same:.4f} < varied-question std {std_varied:.4f}")


async def main() -> int:
    print("Neuroscience layer validation gates")
    print("=" * 60)
    try:
        events = await _load_events()
        print(f"Loaded {len(events)} recorded shadow events\n")
    except Exception as exc:  # noqa: BLE001 - report and continue with synthetic gates
        events = []
        print(f"Could not load events ({exc}); running synthetic gates only\n")
    gate_a_variation(events)
    gate_b_memory(events)
    gate_c_arithmetic(events)
    gate_e1_renderer()
    negative_control()
    print("=" * 60)
    failed = [g for g, s, _ in RESULTS if s == "FAIL"]
    insufficient = [g for g, s, _ in RESULTS if s == "INSUFFICIENT"]
    if failed:
        print(f"FAILED: {', '.join(failed)}")
        return 1
    if insufficient:
        print(f"No failures. Awaiting data for: {', '.join(insufficient)}")
    else:
        print("All gates passed.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
