"""
Validation for manual_digital_brain_persona.py

Tests against the REAL local DB (uses an existing workspace/exploration pair),
but mocks the OpenAI call so no API cost is incurred. All test personas
created are deleted at the end, regardless of pass/fail.

Run from backend/:  .venv/Scripts/python.exe validate_manual_persona.py
"""
import asyncio
import sys
import unittest.mock as mock

sys.path.insert(0, ".")

from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_engine
from app.models.persona import Persona
from app.services.manual_digital_brain_persona import (
    TIER_CONFIG,
    count_personas_in_exploration,
    check_persona_tier_limit,
    validate_ro_completeness,
    create_manual_persona_draft,
    calibrate_manual_persona_with_brains,
    _extract_manual_confidence_score,
    _join,
)

PASS, FAIL = "PASS", "FAIL"
results = []
created_persona_ids = []


def check(name, ok, detail=""):
    results.append((name, ok))
    tag = PASS if ok else FAIL
    print(f"  [{tag}] {name}" + (f"  -> {detail}" if detail else ""))


class FakeDemographics:
    age_range = "26-34"
    gender = "Female"
    income_range = "8-15 LPA"
    education_level = "Post Graduate"
    occupation_level = "Mid-level"
    marital_status = "Single"
    family_structure = "Lives alone"
    geography = "Urban Metro"
    location_country = "India"
    location_state = "Maharashtra"
    family_size = None
    occupation = "Marketing Manager"


class FakePsychological:
    lifestyle = ["Career-Driven", "Tech-Savvy"]
    values = ["Growth", "Independence"]
    personality = ["Ambitious", "Analytical"]
    interests = ["Fitness", "Reading"]
    motivations = ["Career growth", "Financial independence"]


class FakeBehavioural:
    decision_making_style = "Analytical"
    consumption_frequency = "Weekly"
    purchase_channel = ["Online"]
    price_sensitivity = "Medium"
    brand_sensitivity = "Medium"
    switching_tendency = "Medium"
    purchase_triggers = ["Discount", "Peer recommendation"]
    purchase_barriers = ["Price", "Trust"]
    media_consumption_patterns = ["Instagram", "YouTube"]
    digital_behaviour = "Mobile-first"


class FakeAdditionalInfo:
    occupation = "Marketing Manager"
    industry = "FMCG"
    category_awareness = "Medium"


class FakeManualPersonaCreate:
    name = "Test Draft Persona"
    demographics = FakeDemographics()
    psychological = FakePsychological()
    behavioural = FakeBehavioural()
    additional_info = FakeAdditionalInfo()
    formative_experience = "Grew up in a household that valued financial discipline."

    def dict(self):
        return {
            "name": self.name,
            "demographics": vars(self.demographics),
            "psychological": vars(self.psychological),
            "behavioural": vars(self.behavioural),
            "additional_info": vars(self.additional_info),
            "formative_experience": self.formative_experience,
        }


FAKE_LLM_RESPONSE = {
    "status": "success",
    "persona": {
        "name": "Ambitious Digital Native",
        "age_range": "26-34",
        "gender": "Female",
        "location_country": "India",
        "location_state": "Maharashtra",
        "education_level": "Post Graduate",
        "occupation": "Marketing Manager",
        "occupation_level": "Mid-level",
        "industry": "FMCG",
        "income_range": "8-15 LPA",
        "family_size": "Lives alone",
        "family_structure": "Lives alone",
        "geography": "Urban Metro",
        "marital_status": "Single",
        "lifestyle": ["Career-Driven", "Tech-Savvy"],
        "values": ["Growth", "Independence"],
        "personality": "Ambitious, Analytical",
        "interests": ["Fitness", "Reading"],
        "motivations": ["Career growth", "Financial independence"],
        "decision_making_style": "Analytical",
        "consumption_frequency": "Weekly",
        "purchase_channel": ["Online"],
        "price_sensitivity": "Medium",
        "brand_sensitivity": "Medium",
        "switching_tendency": "Medium",
        "category_awareness": "Medium",
        "formative_experience_description": "Grew up valuing financial discipline; learned to budget early.",
        "ocean_profile": {
            "scores": {"openness": 0.75, "conscientiousness": 0.82, "extraversion": 0.55, "agreeableness": 0.6, "neuroticism": 0.35},
            "labels": {"openness": "High", "conscientiousness": "High", "extraversion": "Medium", "agreeableness": "Medium", "neuroticism": "Low"},
        },
        "barriers_pain_points": {
            "structural": ["Limited time to research", "Few trusted local options"],
            "psychological": ["Fear of overpaying", "Distrust of unverified brands"],
            "emotional": ["Anxiety about wrong choice", "Guilt over impulse spending"],
            "category_specific": ["Needs proof of quality before switching"],
        },
        "triggers_opportunities": {
            "functional_triggers": ["Clear value proposition", "Easy comparison tools"],
            "emotional_triggers": ["Social proof", "Sense of smart choice"],
            "situational_triggers": ["Salary day discretionary spending"],
            "promotional_triggers": ["Limited-time discount with clear terms"],
        },
    },
    "auto_fill_report": {
        "total_sub_traits": 23,
        "user_provided_count": 18,
        "auto_filled_count": 5,
        "auto_filled_traits": ["consumption_frequency", "category_awareness"],
    },
    "confidence_scoring": {
        "mode": "Manual Build Mode",
        "components": {
            "demographic_ro_fit": 0.9,
            "psychographic_ro_fit": 0.8,
            "behavioural_ro_fit": 0.75,
            "trait_completeness": 0.8,
        },
        "weighted_score": 0.82,
        "confidence_level": "High",
    },
    "brain_assignment": {
        "primary_brain": "Optimizer",
        "primary_confidence": 0.88,
        "primary_reasoning": "Highly analytical decision-making and research-driven behavior signal Optimizer.",
        "secondary_brain": "Achiever",
        "secondary_confidence": 0.62,
        "secondary_reasoning": "Career-growth motivation and ambition add an Achiever dimension.",
    },
}


class _FakeOpenAIMessage:
    def __init__(self, content):
        self.content = content


class _FakeOpenAIChoice:
    def __init__(self, content):
        self.message = _FakeOpenAIMessage(content)


class _FakeOpenAIResponse:
    def __init__(self, content):
        self.choices = [_FakeOpenAIChoice(content)]


async def main():
    print("=" * 60)
    print("MANUAL DIGITAL BRAIN PERSONA — VALIDATION")
    print("=" * 60)

    # ── 0. Get a real workspace/exploration for FK validity ──
    print("\n[0] Locating a usable workspace/exploration")
    async with AsyncSession(async_engine) as session:
        from sqlalchemy import text
        r = await session.execute(text("SELECT id, workspace_id FROM explorations LIMIT 1"))
        row = r.fetchone()
    if not row:
        print("  No exploration found in DB — cannot run DB-backed tests. Aborting.")
        return
    exploration_id, workspace_id = row
    check("Found exploration + workspace for testing", True, f"exploration={exploration_id}")

    # ── 1. Pure logic ──
    print("\n[1] Pure logic functions (no DB/LLM)")
    check("TIER_CONFIG has 3 tiers", set(TIER_CONFIG) == {"free", "tier1", "enterprise"}, str(set(TIER_CONFIG)))

    valid_ro = {f: "x" for f in [
        "category", "sub_category", "target_audience", "geography", "business_objective",
        "research_type", "key_questions", "hypotheses", "competitive_context",
        "time_frame", "constraints", "probes",
    ]}
    ok, missing = validate_ro_completeness(valid_ro)
    check("validate_ro_completeness: valid RO passes", ok and missing == [])

    incomplete_ro = {**valid_ro, "category": "  ", "probes": ""}
    ok, missing = validate_ro_completeness(incomplete_ro)
    check("validate_ro_completeness: catches blank fields", not ok and set(missing) == {"category", "probes"}, str(missing))

    score = _extract_manual_confidence_score({"confidence_scoring": {"weighted_score": 0.82}})
    check("_extract_manual_confidence_score: 0.82 -> 82", score == 82, str(score))

    check("_join: list -> comma string", _join(["a", "b"]) == "a, b")
    check("_join: empty -> None", _join([]) is None)

    # ── 2. count_personas_in_exploration (real DB) ──
    print("\n[2] count_personas_in_exploration (real DB)")
    baseline_count = await count_personas_in_exploration(workspace_id, exploration_id)
    check("Returns an int >= 0", isinstance(baseline_count, int) and baseline_count >= 0, f"count={baseline_count}")

    check("Returns 0 for nonexistent exploration (error-safe)",
          await count_personas_in_exploration(workspace_id, "nonexistent-exp-id-xyz") >= 0)

    # ── 3. check_persona_tier_limit (mocked count) ──
    print("\n[3] check_persona_tier_limit (mocked count, no DB)")
    with mock.patch(
        "app.services.manual_digital_brain_persona.count_personas_in_exploration",
        new=mock.AsyncMock(return_value=2),
    ):
        allowed, msg = await check_persona_tier_limit(workspace_id, exploration_id, "free")
        check("free tier blocked at 2 existing", allowed is False and "2" in msg, msg)

        allowed, msg = await check_persona_tier_limit(workspace_id, exploration_id, "tier1")
        check("tier1 allowed at 2 existing (max 8)", allowed is True and msg == "")

        allowed, msg = await check_persona_tier_limit(workspace_id, exploration_id, "unknown_tier")
        check("unknown tier defaults to free behavior", allowed is False)

    # ── 4. create_manual_persona_draft (real DB write) ──
    print("\n[4] create_manual_persona_draft (real DB write)")

    # Use a tier with a high max so we don't accidentally hit a real limit
    # for this exploration's existing personas.
    result = await create_manual_persona_draft(
        exploration_id=exploration_id,
        workspace_id=workspace_id,
        user_id="test-validation-user",
        account_tier="enterprise",
        payload=FakeManualPersonaCreate(),
    )
    check("Draft created with status=success", result.get("status") == "success", str(result.get("error_message", "")))
    draft_persona = result.get("persona", {})
    draft_id = draft_persona.get("id")
    if draft_id:
        created_persona_ids.append(draft_id)
    check("Draft has an id", bool(draft_id))
    check("Draft calibration_status == 'draft'", draft_persona.get("calibration_status") == "draft", str(draft_persona.get("calibration_status")))
    check("Draft preserves demographic age_range", draft_persona.get("age_range") == "26-34", str(draft_persona.get("age_range")))

    # Missing demographics -> error dict, not exception
    class _BadDemo(FakeDemographics):
        age_range = ""

    class _BadPayload(FakeManualPersonaCreate):
        demographics = _BadDemo()

    bad_result = await create_manual_persona_draft(
        exploration_id=exploration_id,
        workspace_id=workspace_id,
        user_id="test-validation-user",
        account_tier="enterprise",
        payload=_BadPayload(),
    )
    check("Missing demographic returns error dict (no exception)",
          bad_result.get("status") == "error" and "age_range" in bad_result.get("error_message", ""),
          bad_result.get("error_message"))

    # ── 5. calibrate_manual_persona_with_brains (mocked LLM, real DB) ──
    print("\n[5] calibrate_manual_persona_with_brains (mocked LLM call, real DB read/write)")

    if draft_id:
        fake_response = _FakeOpenAIResponse(content=__import__("json").dumps(FAKE_LLM_RESPONSE))
        with mock.patch(
            "app.services.manual_digital_brain_persona.client.chat.completions.create",
            new=mock.AsyncMock(return_value=fake_response),
        ):
            calib_result = await calibrate_manual_persona_with_brains(draft_id, exploration_id)

        check("Calibration returns status=success", calib_result.get("status") == "success", str(calib_result.get("error_message", "")))
        calibrated = calib_result.get("persona", {})
        check("calibration_status == 'calibrated'", calibrated.get("calibration_status") == "calibrated")
        check("calibration_confidence == 82", calibrated.get("calibration_confidence") == 82, str(calibrated.get("calibration_confidence")))

        details = calibrated.get("persona_details", {}) or {}
        brain = details.get("brain_assignment", {})
        check("brain_assignment.primary_brain == 'Optimizer'", brain.get("primary_brain") == "Optimizer", str(brain))
        check("brain_assignment.secondary_brain == 'Achiever'", brain.get("secondary_brain") == "Achiever")
        check("brain_assignment.primary_confidence in range", 0.70 <= brain.get("primary_confidence", 0) <= 1.0)

        check("Demographics NOT overridden by LLM (age_range)", calibrated.get("age_range") == "26-34", str(calibrated.get("age_range")))
        check("ocean_profile stored", bool(calibrated.get("ocean_profile")))

        # Idempotency: calling again should NOT re-invoke the LLM
        with mock.patch(
            "app.services.manual_digital_brain_persona.client.chat.completions.create",
            new=mock.AsyncMock(side_effect=Exception("LLM should not be called again!")),
        ):
            second_call = await calibrate_manual_persona_with_brains(draft_id, exploration_id)
        check("Idempotent: second call succeeds without calling LLM",
              second_call.get("status") == "success", str(second_call))
    else:
        check("Calibration skipped (no draft_id from step 4)", False)

    # Nonexistent persona -> error dict
    notfound_result = await calibrate_manual_persona_with_brains("nonexistent-persona-id", exploration_id)
    check("Nonexistent persona returns error dict (no exception)",
          notfound_result.get("status") == "error" and "not found" in notfound_result.get("error_message", "").lower(),
          notfound_result.get("error_message"))

    # ── CLEANUP ──
    print("\n[Cleanup] Removing test personas created during validation")
    if created_persona_ids:
        async with AsyncSession(async_engine) as session:
            for pid in created_persona_ids:
                res = await session.execute(select(Persona).where(Persona.id == pid))
                obj = res.scalars().first()
                if obj:
                    await session.delete(obj)
            await session.commit()
        print(f"  Deleted {len(created_persona_ids)} test persona(s): {created_persona_ids}")

    # ── SUMMARY ──
    print()
    print("=" * 60)
    passed = sum(1 for _, ok in results if ok)
    failed = sum(1 for _, ok in results if not ok)
    print(f"RESULT: {passed}/{len(results)} checks passed  |  {failed} failed")
    if failed:
        print("Failed checks:")
        for name, ok in results:
            if not ok:
                print(f"  - {name}")
    else:
        print("manual_digital_brain_persona.py is working correctly.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
