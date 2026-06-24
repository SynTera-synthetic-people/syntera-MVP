"""
Tier system validation — no LLM calls needed.
Run from backend/:  .venv/Scripts/python.exe validate_tiers.py
"""
import sys
import unittest.mock as mock
import inspect

sys.path.insert(0, ".")
from app.services.digital_brain_pipeline import (
    TIER_CONFIG,
    generate_personas_batch,
    generate_additional_personas,
    digital_brain_pipeline,
)

PASS = "PASS"
FAIL = "FAIL"
results = []


def check(name, ok, detail=""):
    results.append((name, ok))
    tag = PASS if ok else FAIL
    suffix = f"  -> {detail}" if detail else ""
    print(f"  [{tag}] {name}{suffix}")


MOCK_SLOTS = [
    {"primary_brain": "Optimizer",  "primary_confidence": 0.92, "secondary_brain": None, "secondary_confidence": None, "key_insight": "", "slot_number": 1},
    {"primary_brain": "Achiever",   "primary_confidence": 0.88, "secondary_brain": None, "secondary_confidence": None, "key_insight": "", "slot_number": 2},
    {"primary_brain": "Connector",  "primary_confidence": 0.85, "secondary_brain": None, "secondary_confidence": None, "key_insight": "", "slot_number": 3},
    {"primary_brain": "Pragmatist", "primary_confidence": 0.80, "secondary_brain": None, "secondary_confidence": None, "key_insight": "", "slot_number": 4},
    {"primary_brain": "Explorer",   "primary_confidence": 0.75, "secondary_brain": None, "secondary_confidence": None, "key_insight": "", "slot_number": 5},
    {"primary_brain": "Guardian",   "primary_confidence": 0.70, "secondary_brain": None, "secondary_confidence": None, "key_insight": "", "slot_number": 6},
]
MOCK_MATRIX = {"persona_slots": MOCK_SLOTS}


def fake_generate(slot, *args, **kwargs):
    return {
        "persona_title": f"The {slot['primary_brain']} Type",
        "brain_assignment": {
            "primary_brain": slot["primary_brain"],
            "secondary_brain": slot.get("secondary_brain"),
        },
    }


print("=" * 55)
print("TIER SYSTEM VALIDATION")
print("=" * 55)

# ── T1: TIER_CONFIG ───────────────────────────────────────────
print("\n[T1] TIER_CONFIG structure")
check("3 tiers defined (no explorer)", set(TIER_CONFIG) == {"free", "tier1", "enterprise"}, str(set(TIER_CONFIG)))
check("free:  initial=2, max=2",  TIER_CONFIG["free"]       == {"initial": 2, "max": 2})
check("tier1: initial=2, max=8",  TIER_CONFIG["tier1"]      == {"initial": 2, "max": 8})
check("enterprise: initial=4, max=8", TIER_CONFIG["enterprise"] == {"initial": 4, "max": 8})

# ── T2: SIGNATURES ────────────────────────────────────────────
print("\n[T2] Function signatures")
sig_pipe = inspect.signature(digital_brain_pipeline)
check("digital_brain_pipeline has account_tier", "account_tier" in sig_pipe.parameters)
check("account_tier defaults to 'tier1'", sig_pipe.parameters["account_tier"].default == "tier1")

sig_batch = inspect.signature(generate_personas_batch)
check("generate_personas_batch has account_tier", "account_tier" in sig_batch.parameters)

sig_add = inspect.signature(generate_additional_personas)
for p in ["brain_assignment_matrix", "existing_personas", "validated_ro",
          "activated_dimensions", "all_verdicts", "account_tier", "count_to_add"]:
    check(f"generate_additional_personas has '{p}'", p in sig_add.parameters)

# ── T3: INITIAL COUNT PER TIER ────────────────────────────────
print("\n[T3] Initial persona count per tier")

with mock.patch("app.services.digital_brain_pipeline.generate_persona", side_effect=fake_generate):
    with mock.patch("app.services.digital_brain_pipeline._llm", return_value='"The Unique Type"'):

        free_p = generate_personas_batch(MOCK_MATRIX, {}, [], [], account_tier="free")
        check("free: exactly 2 personas", len(free_p) == 2, f"got {len(free_p)}")
        check("free: top-2 by confidence (Optimizer first)",
              free_p[0]["brain_assignment"]["primary_brain"] == "Optimizer",
              free_p[0]["brain_assignment"]["primary_brain"])

        tier1_p = generate_personas_batch(MOCK_MATRIX, {}, [], [], account_tier="tier1")
        check("tier1: exactly 2 personas", len(tier1_p) == 2, f"got {len(tier1_p)}")

        ent_p = generate_personas_batch(MOCK_MATRIX, {}, [], [], account_tier="enterprise")
        check("enterprise: exactly 4 personas", len(ent_p) == 4, f"got {len(ent_p)}")

# ── T4: EXPANSION LOGIC ───────────────────────────────────────
print("\n[T4] Expansion (generate_additional_personas)")

existing_2 = [
    {"brain_assignment": {"primary_brain": "Optimizer", "secondary_brain": None}},
    {"brain_assignment": {"primary_brain": "Achiever",  "secondary_brain": None}},
]

with mock.patch("app.services.digital_brain_pipeline.generate_persona", side_effect=fake_generate):
    with mock.patch("app.services.digital_brain_pipeline._llm", return_value='"The New Type"'):

        # Free blocked
        free_exp = generate_additional_personas(MOCK_MATRIX, existing_2, {}, [], [], "free", 2)
        check("free: expansion returns []", free_exp == [])

        # tier1 expands, no duplicates
        tier1_exp = generate_additional_personas(MOCK_MATRIX, existing_2, {}, [], [], "tier1", 2)
        check("tier1: expansion returns 2", len(tier1_exp) == 2, f"got {len(tier1_exp)}")
        added = {p["brain_assignment"]["primary_brain"] for p in tier1_exp}
        check("tier1: Optimizer/Achiever NOT duplicated", not added & {"Optimizer", "Achiever"}, str(added))

        # At max — blocked
        existing_8 = [{"brain_assignment": {"primary_brain": f"B{i}", "secondary_brain": None}} for i in range(8)]
        at_max = generate_additional_personas(MOCK_MATRIX, existing_8, {}, [], [], "tier1", 2)
        check("tier1 at max (8): returns []", at_max == [])

        # Enterprise expands
        existing_4 = existing_2 + [
            {"brain_assignment": {"primary_brain": "Connector",  "secondary_brain": None}},
            {"brain_assignment": {"primary_brain": "Pragmatist", "secondary_brain": None}},
        ]
        ent_exp = generate_additional_personas(MOCK_MATRIX, existing_4, {}, [], [], "enterprise", 2)
        check("enterprise: expansion returns 2", len(ent_exp) == 2, f"got {len(ent_exp)}")
        ent_added = {p["brain_assignment"]["primary_brain"] for p in ent_exp}
        check("enterprise: no duplicates of existing 4", not ent_added & {"Optimizer", "Achiever", "Connector", "Pragmatist"}, str(ent_added))

        # count_to_add capped at available slots (5 used, 1 left)
        existing_5 = [{"brain_assignment": {"primary_brain": s["primary_brain"], "secondary_brain": None}} for s in MOCK_SLOTS[:5]]
        capped = generate_additional_personas(MOCK_MATRIX, existing_5, {}, [], [], "tier1", 99)
        check("count_to_add capped to remaining slots (1)", len(capped) == 1, f"got {len(capped)}")

# ── T5: METADATA IN RESULT ────────────────────────────────────
print("\n[T5] Pipeline result metadata fields")
src = open("app/services/digital_brain_pipeline.py", encoding="utf-8").read()
check("account_tier in result",                  '"account_tier": account_tier' in src)
check("tier_config in result",                   '"tier_config": tier_config' in src)
check("personas_generated in result",            '"personas_generated": len(personas)' in src)
check("personas_available_for_expansion in result", '"personas_available_for_expansion"' in src)
check("expansion_allowed in result",             '"expansion_allowed"' in src)

# ── SUMMARY ───────────────────────────────────────────────────
print()
print("=" * 55)
passed = sum(1 for _, ok in results if ok)
failed = sum(1 for _, ok in results if not ok)
print(f"RESULT: {passed}/{len(results)} checks passed  |  {failed} failed")
if failed:
    print("Failed checks:")
    for name, ok in results:
        if not ok:
            print(f"  - {name}")
else:
    print("Tier system fully operational.")
print("=" * 55)
