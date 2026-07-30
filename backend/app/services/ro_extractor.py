"""Extracts the 12-component RO dict that digital_brain_pipeline() requires
(category, sub_category, target_audience, geography, business_objective,
research_type, key_questions, hypotheses, competitive_context, time_frame,
constraints, probes) from the free-text description + narrative
ai_interpretation already stored on ResearchObjectives.
"""
import json
import logging
import re

from app.services.digital_brain_pipeline import RO_COMPONENTS
from app.utils.anthropic_client import get_async_anthropic_client

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-6"

_PROMPT_TEMPLATE = """You convert a research objective into a structured JSON object for a persona-generation pipeline.

Research objective description:
{description}

Research objective AI interpretation (narrative, may include sections like business context, decision, key questions, target audience, geography, hypotheses, competitive context, etc.):
{ai_interpretation}

Produce a JSON object with EXACTLY these {n} keys, all string values (lists/questions joined into one string where needed):
{components}

Rules:
- Infer missing fields from context using reasonable defaults (e.g. research_type defaults to "Qualitative" if not stated).
- Keep every value concise (1-3 sentences).
- Return ONLY the JSON object, no markdown fences, no commentary.
"""


def _strip_json_fences(raw: str) -> str:
    raw = raw.strip()
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    return match.group(0) if match else raw


async def extract_ro_components_for_pipeline(description: str, ai_interpretation: dict) -> dict:
    """Returns a dict with all RO_COMPONENTS keys populated as strings.

    Raises ValueError if Claude's output can't be parsed or is missing components.
    """
    client = get_async_anthropic_client()
    prompt = _PROMPT_TEMPLATE.format(
        description=description or "(none provided)",
        ai_interpretation=json.dumps(ai_interpretation or {}, ensure_ascii=False, indent=2),
        n=len(RO_COMPONENTS),
        components="\n".join(f"- {c}" for c in RO_COMPONENTS),
    )

    response = await client.messages.create(
        model=MODEL,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_text = "".join(block.text for block in response.content if getattr(block, "type", None) == "text")

    try:
        ro_dict = json.loads(_strip_json_fences(raw_text))
    except json.JSONDecodeError as exc:
        raise ValueError(f"RO extraction returned non-JSON output: {exc}") from exc

    missing = [c for c in RO_COMPONENTS if not str(ro_dict.get(c, "")).strip()]
    if missing:
        raise ValueError(f"RO extraction missing components: {missing}")

    return {c: str(ro_dict[c]) for c in RO_COMPONENTS}
