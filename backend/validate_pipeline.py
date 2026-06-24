"""
Pipeline Validation Script
Run from the backend/ directory:
    .venv/Scripts/python.exe validate_pipeline.py
"""

import json
import sys
import time
import unittest.mock as mock

import pandas as pd

sys.path.insert(0, ".")

SAMPLE_ROWS = [
    {"accountEmailId": "u1", "orderTime": 1728044580000, "totalCharged": 543.0,
     "city": "Mumbai", "state": "Maharashtra",
     "productItems": '[{"priceName": "H&M Slim Fit T-Shirt", "price": 543}]',
     "paymentMethod": "UPI", "receivedDate": "2025-10-04", "account_created_at": "2022-01-15"},
    {"accountEmailId": "u1", "orderTime": 1730719380000, "totalCharged": 2499.0,
     "city": "Mumbai", "state": "Maharashtra",
     "productItems": '[{"priceName": "PUMA Essential Tee", "price": 2499}]',
     "paymentMethod": "Credit Card", "receivedDate": "2025-11-04", "account_created_at": "2022-01-15"},
    {"accountEmailId": "u2", "orderTime": 1729545780000, "totalCharged": 399.0,
     "city": "Dimapur", "state": "Nagaland",
     "productItems": '[{"priceName": "Eyebogler Regular Fit T-shirt", "price": 399}]',
     "paymentMethod": "COD", "receivedDate": "2025-10-21", "account_created_at": "2023-03-22"},
    {"accountEmailId": "u2", "orderTime": 1732137780000, "totalCharged": 399.0,
     "city": "Dimapur", "state": "Nagaland",
     "productItems": '[{"priceName": "Eyebogler Regular Fit T-shirt", "price": 399}]',
     "paymentMethod": "COD", "receivedDate": "2025-11-20", "account_created_at": "2023-03-22"},
    {"accountEmailId": "u3", "orderTime": 1729459380000, "totalCharged": 1799.0,
     "city": "Delhi", "state": "Delhi",
     "productItems": '[{"priceName": "RAYMOND Slim Fit Shirt", "price": 1799}]',
     "paymentMethod": "Net Banking", "receivedDate": "2025-10-20", "account_created_at": "2019-11-05"},
]

SAMPLE_RO = {
    "category": "Apparel - Men's T-shirts & Casual Wear",
    "sub_category": "Premium cotton t-shirts and casual shirts",
    "target_audience": "Men 25-45, urban, middle-to-upper income",
    "geography": "India, Tier 1 cities",
    "business_objective": "Understand what drives premium brand adoption",
    "research_type": "Qualitative",
    "key_questions": "Why do men switch from budget brands to premium?",
    "hypotheses": "Quality and durability are primary drivers",
    "competitive_context": "H&M, PUMA, RAYMOND, John Players, Eyebogler",
    "time_frame": "Last 6 months",
    "constraints": "Minimum 4 personas, maximum 6",
    "probes": "Brand switching triggers, price sensitivity, social influence, fit and comfort",
}

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
SKIP = "\033[93mSKIP\033[0m"

results = []

def check(name, condition, detail=""):
    status = PASS if condition else FAIL
    results.append((name, condition, detail))
    detail_str = f"  -> {detail}" if detail else ""
    print(f"  [{status}] {name}{detail_str}")
    return condition


print("=" * 60)
print("DIGITAL BRAIN PIPELINE — VALIDATION")
print("=" * 60)

# ── IMPORT ────────────────────────────────────────────────────
print("\n[0] Import check")
try:
    from app.services.digital_brain_pipeline import (
        validate_research_objective,
        detect_relevant_dimensions,
        scan_action_data,
        search_evidence_based_web,
        search_hq_database,
        master_brain_synthesis,
        generate_persona,
        generate_personas_batch,
        digital_brain_pipeline,
        CACHE_DIR,
        CACHE_ENABLED,
        BRAIN_DEFINITIONS,
        DIMENSION_NAMES,
    )
    check("All functions imported", True)
    check("12 Digital Brains loaded", len(BRAIN_DEFINITIONS) == 12,
          f"found {len(BRAIN_DEFINITIONS)}")
    check("16 Dimensions loaded", len(DIMENSION_NAMES) == 16,
          f"found {len(DIMENSION_NAMES)}")
    check(f"Cache dir exists", CACHE_DIR.exists(), str(CACHE_DIR))
except Exception as e:
    check("Import", False, str(e))
    print("\nCannot continue — fix the import error first.")
    sys.exit(1)

# ── STAGE 1 ───────────────────────────────────────────────────
print("\n[1] Stage 1 — RO Validation")
try:
    validated = validate_research_objective(SAMPLE_RO)
    check("Valid RO accepted", True)
except Exception as e:
    check("Valid RO accepted", False, str(e))

try:
    validate_research_objective({**SAMPLE_RO, "category": ""})
    check("Empty field rejected", False, "should have raised ValueError")
except ValueError:
    check("Empty field rejected", True)

try:
    validate_research_objective({k: v for k, v in SAMPLE_RO.items() if k != "probes"})
    check("Missing field rejected", False, "should have raised ValueError")
except ValueError:
    check("Missing field rejected", True)

# ── STAGE 2 ───────────────────────────────────────────────────
print("\n[2] Stage 2 — Dimension Detection")
try:
    dims = detect_relevant_dimensions(SAMPLE_RO)
    activated = dims["activated_dimensions"]
    check("Returns activated_dimensions list", isinstance(activated, list))
    check("Minimum 5 dimensions activated", len(activated) >= 5,
          f"got {len(activated)}: {activated}")
    check("Low-relevance dims excluded (7, 12)", 7 not in activated and 12 not in activated,
          f"activated: {activated}")
    check("Apparel key dims present (2, 3, 10)", all(d in activated for d in [2, 3, 10]),
          f"activated: {activated}")
    check("Rationale provided for each dim",
          len(dims["dimension_rationale"]) == len(activated))
except Exception as e:
    check("Stage 2", False, str(e))

# ── STAGE 3A ──────────────────────────────────────────────────
print("\n[3A] Stage 3A — Action Data Scan (no LLM)")
try:
    df = pd.DataFrame(SAMPLE_ROWS)
    synth = '{"verdict_id":"DL_SYNTH","pattern_detected":"Mock","dimension_mapped_to":0,"dimension_name":"Synth","behavioral_signal":"test","evidence":{},"situational_context":{},"digital_brain_signal":"Optimizer","confidence_score":0.80}'
    with mock.patch("app.services.digital_brain_pipeline._llm", return_value=synth):
        layers = scan_action_data(df, activated, SAMPLE_RO)

    check("Returns list", isinstance(layers, list))
    check("At least 3 depth layers", len(layers) >= 3, f"got {len(layers)}")
    check("DL_SYNTH included", any(dl.get("verdict_id") == "DL_SYNTH" for dl in layers))

    # Check required fields in each layer
    required = {"verdict_id", "pattern_detected", "dimension_mapped_to",
                "behavioral_signal", "confidence_score"}
    all_have_fields = all(required.issubset(dl.keys()) for dl in layers)
    check("All layers have required fields", all_have_fields)

    # Check confidence scores are valid
    valid_conf = all(0 < dl.get("confidence_score", 0) <= 1.0 for dl in layers)
    check("Confidence scores in 0–1 range", valid_conf)

    print(f"     Layers produced: {[dl['verdict_id'] for dl in layers]}")
except Exception as e:
    check("Stage 3A", False, str(e))
    layers = []

# ── STAGE 3B ──────────────────────────────────────────────────
print("\n[3B] Stage 3B — Web Search (LLM call)")
print("     Calling Claude API...")
t0 = time.time()
try:
    eb_verdicts = search_evidence_based_web(SAMPLE_RO, activated)
    elapsed = time.time() - t0
    check("Returns list", isinstance(eb_verdicts, list))
    check("4 EB verdicts returned", len(eb_verdicts) == 4, f"got {len(eb_verdicts)}")
    check("Each has verdict_id", all("verdict_id" in v for v in eb_verdicts))
    check("Each has representative_quote",
          all(v.get("representative_quote", "N/A") != "N/A" for v in eb_verdicts),
          "all quotes populated")
    check("Confidence scores valid",
          all(0.5 < v.get("confidence_score", 0) <= 1.0 for v in eb_verdicts))
    print(f"     Time: {elapsed:.1f}s | Platforms: {[v.get('source_platform') for v in eb_verdicts]}")
except Exception as e:
    check("Stage 3B", False, str(e))
    eb_verdicts = []

# ── STAGE 3C ──────────────────────────────────────────────────
# Real DB-backed full-text search against sync_source.content_chunk — no LLM,
# no fabrication. Coverage depends entirely on what's actually stored, so an
# RO with no matching content correctly returns a single "no_hq_coverage"
# verdict (confidence 0.0) rather than invented citations.
print("\n[3C] Stage 3C — HQ Database (real Postgres full-text search, no LLM)")
t0 = time.time()
try:
    hq_verdicts = search_hq_database(SAMPLE_RO, activated)
    elapsed = time.time() - t0
    check("Returns list", isinstance(hq_verdicts, list))
    check("At least 1 verdict returned", len(hq_verdicts) >= 1, f"got {len(hq_verdicts)}")

    no_coverage = len(hq_verdicts) == 1 and hq_verdicts[0].get("source_type") == "no_hq_coverage"
    if no_coverage:
        check("No-coverage verdict is honest (confidence 0.0, no fake citation)",
              hq_verdicts[0].get("confidence_score") == 0.0 and not hq_verdicts[0].get("study_reference"))
    else:
        check("Each real verdict has a study_reference", all(v.get("study_reference") for v in hq_verdicts))
        check("Each verdict traces to a real document_id/chunk_id",
              all(v.get("provenance_detail", {}).get("document_id") for v in hq_verdicts))
        check("Confidence scores in valid range (0.0-0.96)",
              all(0.0 <= v.get("confidence_score", -1) <= 0.96 for v in hq_verdicts),
              f"scores: {[v.get('confidence_score') for v in hq_verdicts]}")

    check("No fabricated 'unavailable' fallback text",
          not any("unavailable" in (v.get("finding_summary") or "") for v in hq_verdicts))
    print(f"     Time: {elapsed:.1f}s | Coverage: {'NONE (honest)' if no_coverage else len(hq_verdicts)} | Sources: {[v.get('source_type') for v in hq_verdicts]}")
except Exception as e:
    check("Stage 3C", False, str(e))
    hq_verdicts = []

# ── STAGE 4 ───────────────────────────────────────────────────
print("\n[4] Stage 4 — Master Brain Synthesis (LLM call)")
print("    Calling Claude API...")
t0 = time.time()
try:
    matrix = master_brain_synthesis(layers, eb_verdicts, hq_verdicts, activated)
    elapsed = time.time() - t0
    slots = matrix.get("persona_slots", [])
    check("Returns persona_slots", isinstance(slots, list))
    check("4–6 slots", 4 <= len(slots) <= 6, f"got {len(slots)}")

    primary_brains = [s.get("primary_brain") for s in slots]
    check("All primary brains are valid",
          all(b in BRAIN_DEFINITIONS for b in primary_brains),
          f"brains: {primary_brains}")
    check("No duplicate primary brains",
          len(set(primary_brains)) == len(primary_brains),
          f"brains: {primary_brains}")
    check("Convergences field present", "convergences" in matrix)
    check("Evidence weights sum to 1.0",
          abs(sum(matrix.get("evidence_weights", {}).values()) - 1.0) < 0.01)
    print(f"    Time: {elapsed:.1f}s | Brains assigned: {primary_brains}")
except Exception as e:
    check("Stage 4", False, str(e))
    matrix = {"persona_slots": [
        {"slot_number": 1, "primary_brain": "Optimizer", "primary_confidence": 0.80,
         "secondary_brain": None, "secondary_confidence": None, "key_insight": "Test slot"}
    ]}

# ── STAGE 5 ───────────────────────────────────────────────────
print("\n[5] Stage 5 — Persona Generation (LLM call, 1 persona)")
print("    Calling Claude API...")
t0 = time.time()
try:
    test_slot = matrix["persona_slots"][0]
    all_verdicts = layers + eb_verdicts + hq_verdicts
    persona = generate_persona(test_slot, SAMPLE_RO, activated, all_verdicts, 1)
    elapsed = time.time() - t0

    check("persona_title present (no person name)",
          "persona_title" in persona and "persona_name" not in persona,
          persona.get("persona_title", "MISSING"))
    check("persona_title starts with 'The'",
          persona.get("persona_title", "").startswith("The"),
          persona.get("persona_title"))

    layers_present = all(f"layer_{i}_" in " ".join(persona.keys()) for i in range(1, 11))
    check("All 10 layers present", layers_present,
          f"keys: {[k for k in persona if k.startswith('layer_')]}")

    et = persona.get("evidence_traceability", {})
    check("evidence_traceability has 5 source fields",
          all(k in et for k in ["brain_assignment_sources", "layer_behavioral_sources",
                                  "layer_emotional_sources", "layer_voice_sources",
                                  "layer_digital_sources"]))
    check("overall_confidence in valid range",
          0.5 <= et.get("overall_confidence", 0) <= 1.0,
          f"confidence: {et.get('overall_confidence')}")
    check("No error key in persona", "error" not in persona)
    print(f"    Time: {elapsed:.1f}s | Title: {persona.get('persona_title')}")
except Exception as e:
    check("Stage 5", False, str(e))

# ── CACHE ─────────────────────────────────────────────────────
# CACHE_ENABLED is False by default (real ROs are always unique in
# production, so caching gives no benefit there). This check just
# confirms the no-op behavior is consistent with that flag.
print("\n[C] Cache check")
try:
    cache_files = list(CACHE_DIR.glob("*.cache"))
    if CACHE_ENABLED:
        check("Cache files written", len(cache_files) > 0,
              f"{len(cache_files)} files in {CACHE_DIR.name}/")
    else:
        check("Cache correctly disabled (no files written)", len(cache_files) == 0,
              f"CACHE_ENABLED=False, {len(cache_files)} files in {CACHE_DIR.name}/")
except Exception as e:
    check("Cache check", False, str(e))

# ── SUMMARY ───────────────────────────────────────────────────
print("\n" + "=" * 60)
passed = sum(1 for _, ok, _ in results if ok)
failed = sum(1 for _, ok, _ in results if not ok)
total = len(results)
print(f"RESULT: {passed}/{total} checks passed  |  {failed} failed")
if failed == 0:
    print("Pipeline is working correctly. Safe to run full end-to-end.")
else:
    print("Failed checks:")
    for name, ok, detail in results:
        if not ok:
            print(f"  - {name}: {detail}")
print("=" * 60)
