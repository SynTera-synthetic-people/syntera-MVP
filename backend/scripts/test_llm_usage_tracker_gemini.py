"""Manual, standalone validation of the Gemini adapter added to
llm_usage_tracker.py (extract_usage_gemini + the gemini-2.5-flash pricing entry).

No live API calls, no live DB — exercises extract_usage_gemini() and the
cost math directly against fake Gemini response objects (SimpleNamespace,
matching the real google.genai response shape: .usage_metadata.prompt_token_count
/.candidates_token_count, confirmed against the installed google-genai SDK).

Usage (from backend/):
    .venv/Scripts/python.exe scripts/test_llm_usage_tracker_gemini.py
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.llm_usage_tracker import _compute_cost, extract_usage_gemini


class _CapturingHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def test_normal_response_with_usage_metadata() -> None:
    print("\n#### TEST 1: normal response with usage_metadata ####")
    usage_metadata = SimpleNamespace(
        prompt_token_count=1200,
        candidates_token_count=340,
        model_dump=lambda mode="json": {"prompt_token_count": 1200, "candidates_token_count": 340},
    )
    response = SimpleNamespace(usage_metadata=usage_metadata)

    input_tokens, output_tokens, usage_raw = extract_usage_gemini(response)
    assert input_tokens == 1200, f"expected 1200 input tokens, got {input_tokens}"
    assert output_tokens == 340, f"expected 340 output tokens, got {output_tokens}"
    assert usage_raw == {"prompt_token_count": 1200, "candidates_token_count": 340}
    print(f"[PASS] input_tokens={input_tokens}, output_tokens={output_tokens}, usage_raw={usage_raw}")


def test_none_usage_metadata_records_zeros_and_warns() -> None:
    print("\n#### TEST 2: usage_metadata=None (blocked/empty response) ####")
    response = SimpleNamespace(usage_metadata=None)

    handler = _CapturingHandler()
    tracker_logger = logging.getLogger("app.services.llm_usage_tracker")
    tracker_logger.addHandler(handler)
    try:
        input_tokens, output_tokens, usage_raw = extract_usage_gemini(response)
    finally:
        tracker_logger.removeHandler(handler)

    assert (input_tokens, output_tokens, usage_raw) == (0, 0, None), (
        f"expected (0, 0, None), got {(input_tokens, output_tokens, usage_raw)}"
    )
    warnings = [r for r in handler.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1, f"expected exactly 1 warning logged, got {len(warnings)}"
    assert "usage_metadata" in warnings[0].getMessage()
    print(f"[PASS] recorded zeros with no exception; warning logged: {warnings[0].getMessage()!r}")


def test_cost_math_matches_pricing_entry() -> None:
    print("\n#### TEST 3: cost math for gemini-2.5-flash ####")
    # 1M input + 1M output tokens should cost exactly (input_rate + output_rate)
    # dollars per the _MODEL_RATES entry ($0.30 in, $2.50 out per 1M tokens).
    cost = _compute_cost("gemini-2.5-flash", 1_000_000, 1_000_000)
    expected = round(0.30 + 2.50, 8)
    assert cost == expected, f"expected {expected}, got {cost}"
    print(f"[PASS] cost for 1M in + 1M out tokens = ${cost} (matches $0.30 in + $2.50 out pricing entry)")

    cost_small = _compute_cost("gemini-2.5-flash", 1200, 340)
    expected_small = round(1200 * 0.30 / 1_000_000 + 340 * 2.50 / 1_000_000, 8)
    assert cost_small == expected_small
    print(f"[PASS] cost for 1200 in + 340 out tokens = ${cost_small}")


def main() -> None:
    test_normal_response_with_usage_metadata()
    test_none_usage_metadata_records_zeros_and_warns()
    test_cost_math_matches_pricing_entry()
    print("\n\n#### ALL GEMINI USAGE-TRACKER ADAPTER TESTS PASSED ####")


if __name__ == "__main__":
    main()
