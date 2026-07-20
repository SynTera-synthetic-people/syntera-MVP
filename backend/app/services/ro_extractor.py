"""Extracts the 12-component RO dict that digital_brain_pipeline() requires
(category, sub_category, target_audience, geography, business_objective,
research_type, key_questions, hypotheses, competitive_context, time_frame,
constraints, probes) from the free-text description + narrative
ai_interpretation already stored on ResearchObjectives.
"""
import json
import logging
import re
from typing import Optional

from app.config import settings
from app.services.digital_brain_pipeline import RO_COMPONENTS
from app.utils.anthropic_client import get_async_anthropic_client
from app.services.llm_usage_tracker import record_llm_usage, extract_usage_anthropic_message

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


def _extract_explicit_geography(ai_interpretation: dict) -> list[str]:
    """
    Pull the Research Objective Framer's structured, discrete geography tags
    (Audience & Segments tab's Geography picker — e.g. ["California",
    "Mumbai"], added one at a time via the FE's "Add" control) out of
    ai_interpretation, when the RO came from that path.

    persist_framer_research_objective() (research_objectives.py) stores the
    raw Framer payload verbatim at ai_interpretation["framer_input"], so this
    is a straight pass-through — never inferred or rewritten by this
    extractor, unlike the other RO_COMPONENTS fields above which ARE
    LLM-derived. Consumed downstream as validated_ro["explicit_geography"] by
    digital_brain_pipeline._extract_geography_meta(), which resolves each tag
    via exact city/country lookup (STRICT mode: only ever assigns cities the
    user actually named) instead of regex-parsing the free-text `geography`
    component — see that function's docstring for why structured tags take
    priority. RO's created via the conversational chat flow (whose
    ai_interpretation has a different shape, no "framer_input" key) simply
    have no explicit_geography — this returns [] for them, not an error.

    Returns [] (never None) so callers can do a plain truthiness check.
    """
    framer_input = (ai_interpretation or {}).get("framer_input")
    if not isinstance(framer_input, dict):
        return []
    geography = framer_input.get("geography")
    if not isinstance(geography, list):
        return []
    return [str(g).strip() for g in geography if str(g or "").strip()]


async def extract_ro_components_for_pipeline(
    description: str,
    ai_interpretation: dict,
    *,
    exploration_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    created_by: Optional[str] = None,
) -> dict:
    """Returns a dict with all RO_COMPONENTS keys populated as strings.

    Raises ValueError if Claude's output can't be parsed or is missing components.

    Shared by both the auto-generate (Digital Brain) and manual persona
    calibration flows — instrumenting here covers both.
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
    input_tokens, output_tokens, usage_raw = extract_usage_anthropic_message(response)
    await record_llm_usage(
        exploration_id=exploration_id,
        stage="research_objective_extraction",
        provider="anthropic",
        model=MODEL,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        usage_raw=usage_raw,
        workspace_id=workspace_id,
        created_by=created_by,
    )
    raw_text = "".join(block.text for block in response.content if getattr(block, "type", None) == "text")

    try:
        ro_dict = json.loads(_strip_json_fences(raw_text))
    except json.JSONDecodeError as exc:
        raise ValueError(f"RO extraction returned non-JSON output: {exc}") from exc

    missing = [c for c in RO_COMPONENTS if not str(ro_dict.get(c, "")).strip()]
    if missing:
        raise ValueError(f"RO extraction missing components: {missing}")

    result = {c: str(ro_dict[c]) for c in RO_COMPONENTS}

    # Pass through the Framer's structured geography tags (if this RO came
    # from that path) as an extra key beyond the 12 RO_COMPONENTS.
    # validate_research_objective() only checks RO_COMPONENTS, so this extra
    # key is untouched by it; digital_brain_pipeline._extract_geography_meta()
    # reads it as validated_ro["explicit_geography"] with priority over the
    # free-text `geography` component above (see _extract_explicit_geography
    # docstring).
    explicit_geography = _extract_explicit_geography(ai_interpretation)
    if explicit_geography:
        result["explicit_geography"] = explicit_geography

    return result


# ── KE structured query generation ───────────────────────────────────────────
#
# WHY this exists: the Knowledge Enrichment Layer used to build Sourcebank /
# web-search queries out of raw RO free text (sometimes truncated to the
# first 100 characters). Once the RO text ran long, that truncation regularly
# dropped the RO's own category/geography signal entirely, so KEL could
# retrieve topically unrelated Sourcebank documents — e.g. an RO about
# "regenerative medicine in California" could surface unrelated India power
# or UK market reports once the query no longer contained "regenerative
# medicine" or "California" at all. Building queries from the ALREADY
# EXTRACTED structured RO (extract_ro_components_for_pipeline() above, the
# same extractor Digital Brain and manual calibration already use) instead
# guarantees every generated query keeps its topic + geography anchor
# regardless of how long or unstructured the original RO text was.
#
# This module does not call an LLM to build queries — it is pure,
# deterministic string construction over the already-LLM-extracted RO
# components, so it adds no extra latency/cost beyond the one RO-extraction
# call each caller already needs (and, for Digital Brain / manual
# calibration, already had before this change).

_INTENT_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokenize_for_intent_match(text_value: str) -> set[str]:
    return set(_INTENT_TOKEN_RE.findall((text_value or "").lower()))


def _select_insight_intents(ro_components: dict, *, count: int) -> list[str]:
    """
    Pick up to `count` configured insight intents (awareness, trust,
    adoption, ...) that are actually relevant to THIS research objective,
    instead of blindly appending every configured term to every query.

    HOW dynamic expansion works: selection is content-driven, not
    category-driven — an intent is used if its own word already appears in
    the RO's business_objective / key_questions / hypotheses / probes text
    (e.g. an RO about "building first-time patient trust" pulls in "trust").
    This adapts automatically to any category (healthcare, finance, FMCG,
    agriculture, SaaS, mobility, travel, ...) because the selection logic
    never branches on what the category IS — only on which configured
    intent words are present in the RO's own text. Falls back to the first
    `count` configured intents (still config-driven, never hardcoded) when
    nothing in the RO text matches any configured intent.
    """
    signal_text = " ".join(
        str(ro_components.get(key, "") or "")
        for key in ("business_objective", "key_questions", "hypotheses", "probes")
    )
    signal_tokens = _tokenize_for_intent_match(signal_text)

    matched = [
        intent for intent in settings.KE_INSIGHT_INTENTS
        if intent.lower() in signal_tokens
    ]
    selected = matched[:count] if matched else list(settings.KE_INSIGHT_INTENTS[:count])
    return selected or ["behavior"]


def _select_research_intents(count: int) -> list[str]:
    """
    Pick `count` mandatory research-format intents (survey, study, report,
    market research, ...) from the configured list. Deterministic (not
    randomized) so the same RO always produces the same queries — the
    web-search gap-fill path hashes its query list for caching
    (see web_evidence_search._query_hash), and a non-deterministic pick here
    would defeat that cache on every call.
    """
    intents = settings.KE_MANDATORY_RESEARCH_INTENTS or ["research"]
    if count <= len(intents):
        return intents[:count]
    return [intents[i % len(intents)] for i in range(count)]


def build_ke_search_queries(
    ro_components: Optional[dict],
    *,
    persona_name: str = "",
    gap_topics: Optional[list[str]] = None,
    max_queries: int = 6,
    fallback_text: str = "",
) -> list[str]:
    """
    Turn a structured RO (as produced by extract_ro_components_for_pipeline()
    above) into a bounded list of Knowledge Enrichment retrieval queries.
    Shared by both the Sourcebank query step (ke_sourcebank_enrichment.py)
    and the web-search gap-fill step (web_evidence_search.py), so both
    stages search on the same structured signal instead of two independently
    drifting raw-text builders.

    HOW geography is preserved: `ro_components["geography"]` is read
    VERBATIM and appended, unmodified, to every query built here — never
    dropped, replaced, or broadened. "California USA" stays "California
    USA"; it is never widened to "USA", "North America", or "Global". If the
    RO's geography is blank, queries are built without a geography suffix —
    no default is invented here. If the RO names multiple geographies, the
    extractor's own string (which may already contain more than one) is used
    as-is; this function does not split or reinterpret it.

    HOW dynamic expansion works: mandatory research-format intents
    (survey/study/report/...) and insight intents (awareness/trust/
    adoption/...) come from configurable settings
    (KE_MANDATORY_RESEARCH_INTENTS / KE_INSIGHT_INTENTS) rather than being
    hardcoded per category. Insight intents are additionally content-matched
    against the RO's own text (_select_insight_intents) so the combination
    adapts to what this specific RO is about. Terms are combined with the
    RO's category/target_audience/business_objective/geography — never
    appended in bulk ("Do NOT blindly append every term").

    Only the fields that carry topical signal are used: category,
    sub_category, target_audience, business_objective, key_questions,
    hypotheses, probes, competitive_context, geography. research_type,
    time_frame, and constraints are deliberately excluded — they describe
    HOW/WHEN the research runs, not WHAT it's about, and would only dilute
    the query.

    Falls back to a single `fallback_text` query when `ro_components` is
    falsy (extraction wasn't available) or when every content field inside
    it turns out blank — callers must still get something to search on
    rather than an empty query list.
    """
    if not ro_components:
        text = (fallback_text or "").strip()
        return [text] if text else []

    def field(key: str) -> str:
        return str(ro_components.get(key, "") or "").strip()

    category = field("category")
    sub_category = field("sub_category")
    target_audience = field("target_audience")

    # Prefer the Framer's structured geography tags (explicit_geography —
    # e.g. ["California", "Mumbai"], exactly what the user picked) over the
    # free-text `geography` component (an LLM paraphrase of the RO
    # paragraph) when both are available — the tags are the more precise,
    # never-broadened source of truth. Falls back to the free-text field
    # exactly as before when explicit_geography wasn't supplied (RO created
    # via the chat flow, or the picker was left empty).
    explicit_geography = ro_components.get("explicit_geography")
    if isinstance(explicit_geography, list) and explicit_geography:
        geography = ", ".join(str(g).strip() for g in explicit_geography if str(g or "").strip())
    else:
        geography = field("geography")

    business_objective = field("business_objective")
    key_questions = field("key_questions")
    hypotheses = field("hypotheses")
    probes = field("probes")
    competitive_context = field("competitive_context")

    # Topic anchor — what the research is ABOUT, used in every query below.
    topic = " ".join(p for p in (category, sub_category, target_audience) if p)

    def with_geo(text_value: str) -> str:
        """Append geography verbatim. Never drops/replaces/broadens it."""
        text_value = text_value.strip()
        return f"{text_value} {geography}".strip() if geography else text_value

    research_intents = _select_research_intents(2)
    insight_intents = _select_insight_intents(
        ro_components, count=settings.KE_INSIGHT_INTENT_COUNT
    )

    candidates: list[str] = []

    # 1) Primary topic query: category + sub-category + audience + geography
    #    + a mandatory research-format intent.
    if topic:
        candidates.append(with_geo(f"{topic} {research_intents[0]}"))

    # 2) Persona-bias query: keeps the original intent of biasing retrieval
    #    towards this persona's own segment, now anchored to the structured
    #    topic + geography instead of raw RO text.
    if persona_name and topic:
        candidates.append(with_geo(f"{persona_name} {topic}"))

    # 3) Business-objective query: what the research is FOR, plus a
    #    content-matched insight intent (e.g. "adoption", "trust").
    if business_objective and insight_intents:
        candidates.append(with_geo(f"{business_objective} {insight_intents[0]}"))

    # 4) Key questions / hypotheses query, plus a second mandatory
    #    research-format intent for format diversity.
    questions_text = key_questions or hypotheses
    if questions_text and len(research_intents) > 1:
        candidates.append(with_geo(f"{questions_text} {research_intents[1]}"))

    # 5) Competitive-context / probes broadener + second insight intent.
    secondary_signal = competitive_context or probes
    if secondary_signal and len(insight_intents) > 1:
        candidates.append(with_geo(f"{topic} {secondary_signal} {insight_intents[1]}"))

    # 6) Gap-topic queries (web-fallback caller only) — one per KE category
    #    not yet covered by Sourcebank, still anchored to topic + geography.
    for gap_topic in (gap_topics or []):
        if gap_topic and topic:
            candidates.append(with_geo(f"{topic} {gap_topic}"))

    if not candidates:
        # Every structured field came back blank — degrade to raw text
        # rather than returning nothing.
        text = (fallback_text or "").strip()
        return [text] if text else []

    seen: set[str] = set()
    queries: list[str] = []
    for q in candidates:
        q = q.strip()
        if q and q not in seen:
            seen.add(q)
            queries.append(q)
        if len(queries) >= max_queries:
            break
    return queries
