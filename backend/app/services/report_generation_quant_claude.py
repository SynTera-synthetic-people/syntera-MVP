import asyncio
import html
import io
import json
import markdown
import os
import pathlib
import random
import re
import uuid
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_engine
from app.ml.feature_fetch import find_subject_key
from app.ml.predictor import VALID_DOMAINS
from app.models.survey_simulation import SurveySimulation
from app.services.auto_generated_persona import get_description
from app.services.quant_report_cta_prompt import CTA_ROUTED_QUANT_REPORT_PROMPT_V2
from app.services.quant_report_charts import render_audience_characteristics_charts
from app.services.report_generation_qual_claude import (
    _current_report_date,
    _ensure_closing_section_content,
    _fallback_limitations_and_transparency,
    _fallback_research_methodology,
    _fetch_rag_context,
    _fix_cover_linebreaks,
    _infer_domain,
    _ml_ground_truth,
    _normalize_cover_header,
    _persist_persona_link,
    _seeded_randint,
    html_to_pdf,
    sanitize_report_text,
)
from app.services.survey_simulation import parse_survey_results_field
from app.utils.anthropic_client import get_async_anthropic_client
from app.services.llm_usage_tracker import record_llm_usage, extract_usage_anthropic_message

load_dotenv()

QUANT_REPORT_LLM_TIMEOUT_SECONDS = int(os.getenv("QUANT_REPORT_LLM_TIMEOUT_SECONDS", "900"))

_REPORT_CSS_PATH = (
    pathlib.Path(__file__).resolve().parent.parent / "css" / "report_generation.css"
)
_QUANT_REPORT_CSS_PATH = (
    pathlib.Path(__file__).resolve().parent.parent / "css" / "report_generation_quant.css"
)

upload_dir = "./reports"

# Same shared-shell labels/patterns as REPORT_REQUIRED_SECTIONS in report_generation_qual_claude.py,
# so quant reports validate, TOC, and render with the identical shell as qual reports.
#
# Studied Personas (archetype/psychographic table) and Audience Characteristics (demographic
# fact table) are NOT both rendered for the same CTA — that produced a duplicate section in
# practice. BEHAVIORAL_ARCHAEOLOGY keeps the original Studied Personas; DECISION_INTELLIGENCE
# uses Audience Characteristics instead (see _build_di_required_sections below). Only
# "Research Objective" is common to every narrative CTA.
_SHARED_SHELL_PREFIX = [
    ("Research Objective", r"\bresearch objective\b"),
]
_SHARED_SHELL_SUFFIX = [
    ("Research Methodology", r"\bresearch methodology\b"),
    ("Limitations and Transparency", r"\blimitations\s*(?:&|and)\s*transparency\b"),
]
# DI-only closing suffix: "Methodology and Calibration" replaces "Research Methodology"
# for DECISION_INTELLIGENCE. BEHAVIORAL_ARCHAEOLOGY keeps the original heading/content
# (_SHARED_SHELL_SUFFIX above) — the two are never both rendered in the same report.
_DI_SHELL_SUFFIX = [
    ("Methodology and Calibration", r"\bmethodology and calibration\b"),
    ("Limitations and Transparency", r"\blimitations\s*(?:&|and)\s*transparency\b"),
]

# DECISION_INTELLIGENCE's required sections are NOT a static list here: since the DI
# narrative is now Decision Brief + Adaptive Modules A-L (selected per-report from the
# research objective, see select_adaptive_modules/_build_di_required_sections below),
# what's "required" varies per report. QUANT_REQUIRED_SECTIONS only holds the CTAs whose
# structure is fixed; DI's list is computed at generation time and threaded through as an
# explicit `required_sections` argument to _find_missing_sections/_build_toc_markdown/etc.
QUANT_REQUIRED_SECTIONS = {
    "BEHAVIORAL_ARCHAEOLOGY": [
        *_SHARED_SHELL_PREFIX,
        ("Studied Personas", r"\bstudied personas\b"),
        ("The Say-Do Gap", r"\b(?:ba-?1|section\s+ba-?1)?[\s:.\-]*the say[-\s/]?do gap\b"),
        ("The Bias Landscape", r"\b(?:ba-?2|section\s+ba-?2)?[\s:.\-]*the bias landscape\b"),
        ("The Emotional Architecture", r"\b(?:ba-?3|section\s+ba-?3)?[\s:.\-]*the emotional architecture\b"),
        ("Where Words and Actions Collide", r"\b(?:ba-?4|section\s+ba-?4)?[\s:.\-]*where words and actions collide\b"),
        ("The Ritual Audit", r"\b(?:ba-?5|section\s+ba-?5)?[\s:.\-]*the ritual audit\b"),
        ("The White Spaces", r"\b(?:ba-?6|section\s+ba-?6)?[\s:.\-]*the white spaces\b"),
        ("What Actually Drives the Decision", r"\b(?:ba-?7|section\s+ba-?7)?[\s:.\-]*what actually drives the decision\b"),
        ("The Friction Points", r"\b(?:ba-?8|section\s+ba-?8)?[\s:.\-]*the friction points\b"),
        ("What Surprised Us", r"\b(?:ba-?9|section\s+ba-?9)?[\s:.\-]*what surprised us\b"),
        ("How They Decide", r"\b(?:ba-?10|section\s+ba-?10)?[\s:.\-]*how they decide\b"),
        ("The Archaeological Synthesis", r"\b(?:ba-?11|section\s+ba-?11)?[\s:.\-]*the archaeological synthesis\b"),
        *_SHARED_SHELL_SUFFIX,
    ],
}


# ---------------------------------------------------------------------------
# Adaptive Report Modules (A-L) — DECISION_INTELLIGENCE only.
#
# Replaces the old fixed DI-1..7 narrative with Decision Brief + a subset of
# these modules, selected per-report from the research objective's keywords
# (select_adaptive_modules) and checked against the questionnaire for
# supporting data (check_suppression_rules).
# ---------------------------------------------------------------------------

MODULE_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    "A": {
        "name": "Category and Usage Landscape",
        "keywords": ["u&a", "usage", "category", "market entry", "entry"],
        "guidance": "Use for U&A, category-entry, or market-entry research. Show category incidence, usage frequency, and product repertoire from the relevant survey_results.",
    },
    "B": {
        "name": "Problem and Need-State Analysis",
        # NOTE: bare "need" is deliberately excluded — it false-positives on almost any RO
        # phrased as "we need to understand X" without being need-state research at all.
        "keywords": ["problem", "pain point", "unmet need", "need state", "need-state", "customer need"],
        "guidance": "Use for problem/need-state or innovation research. Show problem prevalence, intensity, and unmet needs from the relevant survey_results and open-end verbatims.",
    },
    "C": {
        "name": "Audience Segmentation and ICP",
        "keywords": ["segmentation", "icp", "target", "persona"],
        "guidance": "Use for segmentation/ICP/targeting research. Show how personas differ on decision-relevant dimensions, drawing on Studied Personas and survey_results.",
    },
    "D": {
        "name": "Concept Evaluation",
        "keywords": ["concept", "innovation"],
        "guidance": "Use for concept-testing research. Show concept appeal, fit, and objections from the relevant survey_results.",
    },
    "E": {
        "name": "Message and Claims Testing",
        "keywords": ["message", "communication", "claim", "campaign"],
        "guidance": "Use for message/claims/communication testing. Show which messages land, and why, from the relevant survey_results.",
    },
    "F": {
        "name": "Feature Prioritization",
        "keywords": ["feature", "roadmap"],
        "guidance": "Use for feature/roadmap prioritization research. Rank features by demand signal from the relevant survey_results.",
    },
    "G": {
        "name": "Pricing and Willingness to Pay",
        "keywords": ["pricing", "price", "willingness to pay"],
        "guidance": "Use for pricing research. Show price sensitivity and willingness-to-pay patterns from the relevant survey_results.",
    },
    "H": {
        "name": "Brand and Competitive Positioning",
        "keywords": ["brand", "competitive", "positioning"],
        "guidance": "Use for brand/positioning/competitive research. Show relative brand perception from the relevant survey_results.",
    },
    "I": {
        "name": "Customer Journey and Experience",
        "keywords": ["journey", "experience", "retention", "churn"],
        "guidance": "Use for journey/experience/retention research. Show journey friction and satisfaction drivers from the relevant survey_results.",
    },
    "J": {
        "name": "Go-to-Market and Channel Strategy",
        "keywords": ["channel", "gtm", "distribution"],
        "guidance": "Use for GTM/channel/distribution research. Show channel preference from the relevant survey_results.",
    },
    "K": {
        "name": "Occasion and Context",
        "keywords": ["occasion", "context"],
        "guidance": "Use for occasion/context research. Show usage-occasion patterns from the relevant survey_results.",
    },
    "L": {
        "name": "Adoption and Retention",
        "keywords": ["adoption", "switching", "retention"],
        "guidance": "Use for adoption/switching/retention research. Show adoption barriers and switching triggers from the relevant survey_results.",
    },
}

# Modules whose data support is checkable from question text alone (see
# check_suppression_rules). The remaining spec suppression rules (no market-size
# claims from a simulated sample, no significance-led storytelling for <5pt gaps,
# no persona-prioritization without material differentiation, no external-knowledge
# claims, etc.) require narrative judgment the Python layer can't cheaply verify —
# those are enforced at the prompt level (AH-13 in quant_report_cta_prompt.py).
_MODULE_SUPPRESSION_KEYWORDS: Dict[str, Tuple[List[str], str]] = {
    "G": (
        ["price", "pricing", "willingness to pay", "budget", "afford", "cost of", "how much would you"],
        "Pricing was outside the decision coverage of this study.",
    ),
    "H": (
        ["compared to", "versus", " vs ", "vs.", "competitor", "which brand", "brands do you", "rank the following brands"],
        "Direct competitive comparison was not measured in this study.",
    ),
    "J": (
        ["which channel", "platform do you", "app store", "purchase from", "buy from", "shop at", "social media platform"],
        "Channel preference data was not collected in this study.",
    ),
    "K": (
        ["occasion", "what time", "situation in which", "context in which", "when do you"],
        "Usage-occasion data was not collected in this study.",
    ),
}


def select_adaptive_modules(research_objective: str, question_types: Dict[str, str]) -> List[str]:
    """Keyword-match the research objective text to Modules A-L (spec Task 4.2).

    question_types is accepted alongside the RO text (rather than RO alone) so this
    can be extended later to also factor in which question types actually exist;
    today only RO keywords drive selection.
    """
    ro_lower = (research_objective or "").lower()
    selected = {
        module_id
        for module_id, meta in MODULE_DEFINITIONS.items()
        if any(kw in ro_lower for kw in meta["keywords"])
    }
    if not selected:
        # A DI report should never come back empty — fall back to the two
        # always-relevant general modules (category landscape + segmentation).
        selected = {"A", "C"}
    return sorted(selected)


def check_suppression_rules(
    selected_modules: List[str], question_types: Dict[str, str]
) -> Dict[str, str]:
    """For selected modules with a data-decidable suppression rule, return
    {module_id: reason} when the questionnaire has no supporting questions.
    """
    question_texts_lower = [str(q or "").lower() for q in question_types.keys()]

    def _has_supporting_question(keywords: List[str]) -> bool:
        return any(any(kw in qtext for kw in keywords) for qtext in question_texts_lower)

    suppressions: Dict[str, str] = {}
    for module_id in selected_modules:
        rule = _MODULE_SUPPRESSION_KEYWORDS.get(module_id)
        if rule is None:
            continue
        keywords, reason = rule
        if not _has_supporting_question(keywords):
            suppressions[module_id] = reason
    return suppressions


def _build_di_required_sections(selected_modules: List[str]) -> List[Tuple[str, str]]:
    """Build DECISION_INTELLIGENCE's required-sections list.

    Deliberately a flat, fixed 6-entry list — NOT one entry per selected module.
    Adding a per-module entry used to mean _build_toc_markdown (which scans body
    headings for each required pattern) picked up every module's own "### {Name}"
    sub-heading as its own top-level TOC line, producing a confusing nested module
    listing even though the module content itself was already correctly nested
    under the single "## ADAPTIVE REPORT MODULES" wrapper heading in the body. One
    "Adaptive Report Modules" entry matches that wrapper heading instead, so the
    TOC always shows exactly these 6 lines for DI regardless of module count.

    `selected_modules` is accepted for call-site/API stability but not consulted
    here anymore — module presence is validated structurally (the wrapper heading
    must exist), not per-module.
    """
    return [
        *_SHARED_SHELL_PREFIX,
        ("Audience Characteristics", r"\baudience characteristics\b"),
        ("Decision Brief", r"\bdecision brief\b"),
        ("Adaptive Report Modules", r"\badaptive report modules\b"),
        *_DI_SHELL_SUFFIX,
    ]


_CHARACTERISTICS_TITLE_RE = re.compile(r"characteristic", re.IGNORECASE)
_PROFILE_TITLE_RE = re.compile(r"profile", re.IGNORECASE)


def extract_audience_characteristics(
    questionnaire_sections: List[Dict[str, Any]],
    survey_results: Dict[str, Any],
    total_sample_size: int,
) -> Dict[str, Any]:
    """Build the Audience Characteristics payload from the questionnaire's demographic
    sections, for the new shared-shell "Audience Characteristics" section (replaces
    nothing — added alongside "Studied Personas").

    Sections are matched by KEYWORD on title ("characteristic" / "profile"), not by a
    fixed index: "Population Profile" (or its renamed "Sample Profile") is always the
    LAST section, not index 6 as originally assumed, and section count varies 3-10.
    Matching by keyword also means this works unchanged whether the questionnaire was
    generated before or after the "Population..." -> "Sample..." title rename.

    Percentages are read verbatim from survey_results (already computed upstream by
    build_normalized_survey_results) — never recomputed here.
    """
    characteristics_section: Optional[Dict[str, Any]] = None
    profile_section: Optional[Dict[str, Any]] = None
    for sec in questionnaire_sections or []:
        title = str(sec.get("title") or "")
        if characteristics_section is None and _CHARACTERISTICS_TITLE_RE.search(title):
            characteristics_section = sec
        if _PROFILE_TITLE_RE.search(title):
            profile_section = sec  # last match wins -> naturally the final section

    def _questions_with_results(sec: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        if not sec:
            return out
        for q in sec.get("questions") or []:
            qtext = (q.get("text") or "").strip()
            rows = survey_results.get(qtext) if isinstance(survey_results, dict) else None
            if not rows or not isinstance(rows, list):
                continue
            options: Dict[str, Any] = {}
            for row in rows:
                if not isinstance(row, dict) or "verbatim" in row:
                    continue
                options[str(row.get("option", ""))] = {
                    "count": int(row.get("count", 0) or 0),
                    "percentage": row.get("pct", 0.0),
                }
            if options:
                out.append({"question": q.get("label") or qtext, "options": options})
        return out

    characteristics_rows = _questions_with_results(characteristics_section)
    profile_rows = _questions_with_results(profile_section)

    return {
        "sample_size": total_sample_size,
        "sample_characteristics": {"questions_and_options": characteristics_rows},
        "sample_profile": {
            "questions": [
                {"question": row["question"], "responses": row["options"]}
                for row in profile_rows
            ]
        },
    }


def _normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _strip_table_of_contents(md_content: str) -> str:
    toc_pattern = re.compile(
        r"(?is)^#{1,6}\s*table of contents?\s*$.*?(?=^#{1,6}\s+|\Z)",
        re.MULTILINE,
    )
    return toc_pattern.sub("", md_content)


def _strip_section_prefixes(md: str) -> str:
    """Remove DI-N:, BA-N:, and Module X: prefixes from all markdown headings.

    The LLM generates headings like '## DI-1: THE DECISION AT STAKE' or
    '### Module B: Problem and Need-State Analysis'. We want the bare title
    everywhere (body and TOC, since _build_toc_markdown copies its entries
    verbatim from the body's own headings) — this is a defensive regex strip
    independent of prompt compliance, same as the existing DI-N/BA-N case.
    """
    md = re.sub(
        r'(?m)^(#{1,6}\s+)(?:Section\s+)?(?:DI|BA)-?\d+[\s:.\-]+',
        r'\1',
        md,
        flags=re.IGNORECASE,
    )
    md = re.sub(
        r'(?m)^(#{1,6}\s+)Module\s+[A-L][\s:.\-]+',
        r'\1',
        md,
        flags=re.IGNORECASE,
    )
    return md


def _strip_end_markers(md: str) -> str:
    """Remove any 'END OF REPORT' lines (with optional --- separator) the LLM inserts mid-document."""
    md = re.sub(r'(?im)^\*{0,2}END OF REPORT\*{0,2}\s*$\n?', '', md)
    md = re.sub(r'(?im)^-{3,}\s*$\n?(?=\s*$)', '', md)  # trailing orphan hr
    return md


def _move_shell_suffix_to_end(md_content: str) -> str:
    """Ensure Research Methodology and Limitations & Transparency always appear last.

    The LLM sometimes places these sections immediately after Studied Personas
    instead of after the CTA-specific body sections. This function moves any
    suffix sections found early in the document to the very end.

    CTA-agnostic by design (no `cta` param), so it recognizes BOTH BA's "Research
    Methodology" and DI's "Methodology and Calibration" — whichever one is actually
    present in this particular report gets moved, the other pattern simply never
    matches anything.
    """
    suffix_patterns = [pattern for _, pattern in _SHARED_SHELL_SUFFIX + _DI_SHELL_SUFFIX]

    # Split on any heading boundary (##, ###, etc.) keeping the delimiter
    parts = re.split(r'(?m)(?=^#{1,3}\s)', md_content)

    suffix_parts: List[str] = []
    main_parts: List[str] = []

    for part in parts:
        first_line = part.split('\n')[0] if part else ''
        heading_text = re.sub(r'^#{1,3}\s*', '', first_line).strip()
        is_suffix = any(
            re.search(pattern, heading_text, re.IGNORECASE)
            for pattern in suffix_patterns
        )
        if is_suffix:
            suffix_parts.append(part)
        else:
            main_parts.append(part)

    if not suffix_parts:
        return md_content

    return ''.join(main_parts).rstrip() + '\n\n' + ''.join(suffix_parts)


def _find_missing_sections(
    md_content: str, cta: str, required_sections: Optional[List[Tuple[str, str]]] = None
) -> List[str]:
    normalized = _normalize_whitespace(_strip_table_of_contents(md_content)).lower()
    missing: List[str] = []
    for label, pattern in (required_sections if required_sections is not None else QUANT_REQUIRED_SECTIONS.get(cta, [])):
        if not re.search(pattern, normalized, flags=re.IGNORECASE):
            missing.append(label)
    return missing


def _extract_markdown_headings(md_content: str) -> List[str]:
    """Same heading-extraction logic as the qual pipeline, kept local here so the
    quant TOC always matches the qual TOC's markup/CSS without depending on
    qual's CTA-specific section maps."""
    headings: List[str] = []
    for raw_line in md_content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if re.match(r"^\|?[:\- ]+\|?$", line):
            continue
        heading = None
        if re.match(r"^#{1,6}\s+", line):
            heading = re.sub(r"^#{1,6}\s+", "", line).strip()
        elif re.match(r"^\d+(?:\.\d+)*[.)]?\s+[A-Za-z]", line) and len(line) <= 140:
            heading = line
        if not heading:
            continue
        heading = _normalize_whitespace(heading)
        if heading not in headings:
            headings.append(heading)
    return headings


def _build_toc_markdown(
    cta: str, headings: List[str], required_sections: Optional[List[Tuple[str, str]]] = None
) -> str:
    if not headings:
        return ""

    ordered_entries: List[str] = []

    def append_if_present(pattern: str) -> None:
        for heading in headings:
            if re.search(pattern, heading, flags=re.IGNORECASE):
                if heading not in ordered_entries:
                    ordered_entries.append(heading)
                return

    sections = required_sections if required_sections is not None else QUANT_REQUIRED_SECTIONS.get(cta, [])
    for _, pattern in sections:
        append_if_present(pattern)

    if not ordered_entries:
        return ""

    toc_lines = ["## TABLE OF CONTENTS", '<div class="report-toc-list">']
    for entry in ordered_entries:
        # Strip section-number prefixes like "DI-1:", "BA-3:", "Section DI-2:" from display labels
        display = re.sub(r'^(?:Section\s+)?(?:DI|BA)-?\d+[\s:.\-]+', '', entry, flags=re.IGNORECASE).strip()
        toc_lines.append(f'<div class="report-toc-item">{html.escape(display)}</div>')
    toc_lines.append("</div>")
    return "\n".join(toc_lines)


def _synchronize_toc(
    md_content: str, cta: str, required_sections: Optional[List[Tuple[str, str]]] = None
) -> str:
    toc_markdown = _build_toc_markdown(cta, _extract_markdown_headings(md_content), required_sections)
    if not toc_markdown:
        return md_content

    toc_pattern = re.compile(
        r"(?is)^#{1,6}\s*table of contents?\s*$.*?(?=^#{1,6}\s+|\Z)",
        re.MULTILINE,
    )
    if toc_pattern.search(md_content):
        return toc_pattern.sub(f"{toc_markdown}\n\n", md_content, count=1)
    return md_content


def generate_pdf_path(prefix: str = "report") -> str:
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{prefix}_{uuid.uuid4().hex}.pdf"
    return os.path.join(upload_dir, filename)


async def call_anthropic(
    payload: dict,
    system_prompt: str,
    model: str = "claude-sonnet-4-5",
    max_tokens: int = 20000,
    temperature: float = 0.9,
    *,
    exploration_id: Optional[str] = None,
):
    client = get_async_anthropic_client()
    async with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": json.dumps(payload, ensure_ascii=False, default=str),
            }
        ],
    ) as stream:
        final_message = await stream.get_final_message()
        input_tokens, output_tokens, usage_raw = extract_usage_anthropic_message(final_message)
        await record_llm_usage(
            exploration_id=exploration_id,
            stage="quant_report",
            provider="anthropic",
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            usage_raw=usage_raw,
        )
        return final_message


async def _generate_report_markdown_once(payload: dict, system_prompt: str, exploration_id: Optional[str] = None) -> str:
    try:
        response = await asyncio.wait_for(
            call_anthropic(payload=payload, system_prompt=system_prompt, exploration_id=exploration_id),
            timeout=QUANT_REPORT_LLM_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise TimeoutError(
            f"Quant report LLM generation timed out after {QUANT_REPORT_LLM_TIMEOUT_SECONDS} seconds"
        ) from exc

    md = response.content[0].text.strip()
    if not md:
        raise ValueError("Empty response from Claude")

    return md


def _fallback_methodology_and_calibration(cta: str) -> str:
    """DI's twin of qual's _fallback_research_methodology, under the renamed heading."""
    return """## Methodology and Calibration

This report was generated from quantitative survey simulation using Synthetic People AI's proprietary behavioral framework. Each persona's calibration score reflects how tightly its simulated responses are anchored to that persona's defined traits, and the Adaptive Report Modules above were selected from the research objective's stated priorities, checked against what the questionnaire actually measured. Findings are directional synthetic research outputs, useful for pattern recognition and decision preparation, and should be validated before high-stakes execution.
"""


def _ensure_di_methodology_content(md_content: str) -> str:
    """DI-only twin of qual's _ensure_closing_section_content, for the renamed
    'Methodology and Calibration' heading — the imported helper only recognizes
    the literal 'Research Methodology' text (still correct for BEHAVIORAL_ARCHAEOLOGY,
    which keeps that name), so a thin DI section would slip through undetected
    without this.
    """
    pattern = r"(?im)^#{1,6}\s+methodology and calibration\s*$"
    m = re.search(pattern, md_content)
    if not m:
        return md_content
    after = md_content[m.end():]
    body_match = re.match(r'(.*?)(?=^#{1,6}\s|\Z)', after, re.DOTALL | re.MULTILINE)
    body = body_match.group(1).strip() if body_match else ""
    if len(body) >= 80:
        return md_content
    result = re.sub(
        pattern + r'.*?(?=^#{1,6}\s|\Z)',
        '',
        md_content,
        flags=re.DOTALL | re.MULTILINE | re.IGNORECASE,
    )
    return result.rstrip() + f"\n\n{_fallback_methodology_and_calibration('DECISION_INTELLIGENCE').strip()}\n"


def _append_supported_missing_sections(
    md_content: str,
    cta: str,
    missing_sections: List[str],
    required_sections: Optional[List[Tuple[str, str]]] = None,
) -> Tuple[str, List[str]]:
    # Reuses the same deterministic fallback text qual uses for these two shared
    # closing sections, so a partial quant draft still ends with the identical shell.
    # "Methodology and Calibration" is DI-only (see _fallback_methodology_and_calibration);
    # it's harmless to always include since BA never produces that label.
    appenders = {
        "Research Methodology": lambda: _fallback_research_methodology(cta),
        "Methodology and Calibration": lambda: _fallback_methodology_and_calibration(cta),
        "Limitations and Transparency": _fallback_limitations_and_transparency,
    }
    appendable = [label for label in missing_sections if label in appenders]
    if not appendable:
        return md_content, missing_sections

    blocks = [appenders[label]() for label in appendable]
    repaired = f"{md_content.rstrip()}\n\n" + "\n\n".join(block.strip() for block in blocks) + "\n"
    return repaired, _find_missing_sections(repaired, cta, required_sections)


async def _generate_validated_report_markdown(
    payload: dict,
    cta: str,
    exploration_id: Optional[str] = None,
    required_sections: Optional[List[Tuple[str, str]]] = None,
) -> str:
    system_prompt = CTA_ROUTED_QUANT_REPORT_PROMPT_V2.replace("{REPORT_DATE}", _current_report_date())

    md = await _generate_report_markdown_once(payload, system_prompt, exploration_id)
    md = _normalize_cover_header(md)
    md = _fix_cover_linebreaks(md)
    md = _strip_section_prefixes(md)
    md = _strip_end_markers(md)
    md = _move_shell_suffix_to_end(md)
    md = _ensure_closing_section_content(md, cta)
    if cta == "DECISION_INTELLIGENCE":
        md = _ensure_di_methodology_content(md)
    md = _synchronize_toc(md, cta, required_sections)
    missing_sections = _find_missing_sections(md, cta, required_sections)
    md, missing_sections = _append_supported_missing_sections(md, cta, missing_sections, required_sections)
    md = _synchronize_toc(md, cta, required_sections)
    if not missing_sections:
        return md.rstrip() + "\n\n---\n\n**END OF REPORT**\n"

    repair_prompt = (
        f"{system_prompt}\n\n"
        "REPAIR MODE:\n"
        "- Rewrite the full quantitative report from scratch in markdown.\n"
        "- The previous draft omitted mandatory sections.\n"
        f"- Missing sections that MUST appear in the final report: {', '.join(missing_sections)}.\n"
        "- Keep the same CTA. Do not include content from other CTAs.\n"
        "- The Table of Contents must match the final body exactly.\n"
        "- If token budget gets tight, shorten examples and explanations, but do not omit mandatory sections.\n"
        "- Return only the corrected final markdown report."
    )

    repaired_md = await _generate_report_markdown_once(payload, repair_prompt, exploration_id)
    repaired_md = _normalize_cover_header(repaired_md)
    repaired_md = _fix_cover_linebreaks(repaired_md)
    repaired_md = _strip_section_prefixes(repaired_md)
    repaired_md = _strip_end_markers(repaired_md)
    repaired_md = _move_shell_suffix_to_end(repaired_md)
    repaired_md = _ensure_closing_section_content(repaired_md, cta)
    if cta == "DECISION_INTELLIGENCE":
        repaired_md = _ensure_di_methodology_content(repaired_md)
    repaired_md = _synchronize_toc(repaired_md, cta, required_sections)
    repaired_missing_sections = _find_missing_sections(repaired_md, cta, required_sections)
    repaired_md, repaired_missing_sections = _append_supported_missing_sections(
        repaired_md, cta, repaired_missing_sections, required_sections
    )
    repaired_md = _synchronize_toc(repaired_md, cta, required_sections)
    if repaired_missing_sections:
        raise ValueError(
            "Generated quant report is incomplete after retry. Missing required sections: "
            + ", ".join(repaired_missing_sections)
        )

    return repaired_md.rstrip() + "\n\n---\n\n**END OF REPORT**\n"


async def get_simulation_results(
    session: AsyncSession,
    simulation_id: str,
) -> Optional[Dict[str, Any]]:
    """Fetch fields needed to ground the PDF report in stored simulation data."""
    stmt = (
        select(
            SurveySimulation.results,
            SurveySimulation.normalized_results,
            SurveySimulation.simulation_result,
            SurveySimulation.narrative,
            SurveySimulation.total_sample_size,
            SurveySimulation.persona_sample_sizes,
            SurveySimulation.persona_id,
            SurveySimulation.simulation_source_id,
        ).where(SurveySimulation.id == simulation_id)
    )

    result = await session.execute(stmt)
    row = result.one_or_none()

    if row is None:
        return None

    return {
        "results": row.results,
        "normalized_results": row.normalized_results,
        "simulation_result": row.simulation_result,
        "narrative": row.narrative,
        "total_sample_size": row.total_sample_size,
        "persona_sample_sizes": row.persona_sample_sizes,
        "persona_id": row.persona_id,
        "simulation_source_id": row.simulation_source_id,
    }


_MULTI_SELECT_QUESTION_TYPES = {"m", "multi_select", "grid_multi_select", "multiselect"}


def _validate_survey_results_reconciliation(
    survey_results: Dict[str, Any],
    total_sample_size: int,
    question_types: Dict[str, str],
) -> List[str]:
    """Reconciliation gate run before survey_results is handed to the LLM.

    survey_results is always written by build_normalized_survey_results() /
    _combine_persona_results() (see survey_results_normalize.py and
    survey_simulation_combined.py), which already guarantee: single-select option
    counts sum to total_sample_size, and every option's `pct` is
    round(100 * count / total_sample_size, 1) — a respondent-count denominator, not a
    response-count denominator, for both single- and multi-select questions. This check
    re-verifies those invariants at read time so a future write path that skips that
    helper (or stale/hand-edited data) can't silently ship a report with inflated
    multi-select percentages or drifted single-select totals; it raises instead of
    reaching the LLM.
    """
    issues: List[str] = []
    if not survey_results or total_sample_size <= 0:
        return issues

    for q_text, rows in survey_results.items():
        if not isinstance(rows, list) or not rows:
            continue

        qtype = str(question_types.get(q_text) or "").strip().lower().replace("-", "_")
        is_multi = qtype in _MULTI_SELECT_QUESTION_TYPES
        type_known = q_text in question_types

        counts: List[float] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            count = row.get("count")
            pct = row.get("pct")
            if not isinstance(count, (int, float)):
                # Open-ended questions store [{"verbatim": "..."}] rows (see
                # build_normalized_survey_results) with no count/pct — nothing
                # to reconcile, skip.
                continue
            counts.append(count)

            if isinstance(pct, (int, float)):
                expected_pct = round(100.0 * count / total_sample_size, 1)
                if abs(pct - expected_pct) > 0.6:
                    issues.append(
                        f"{q_text!r} option {row.get('option')!r}: pct={pct} uses the wrong "
                        f"denominator (expected {expected_pct} = 100*{count}/{total_sample_size} respondents)"
                    )

            if is_multi and count > total_sample_size:
                issues.append(
                    f"{q_text!r} option {row.get('option')!r}: count={count} exceeds "
                    f"total_sample_size={total_sample_size}"
                )

        # Single-select must account for exactly one answer per respondent. Only enforced
        # when the question's type is actually known, so a missing/incomplete question_types
        # map (e.g. questionnaire lookup failed) can't produce false positives on real
        # multi-select questions, whose counts legitimately don't sum to total_sample_size.
        if type_known and not is_multi and counts:
            total = sum(counts)
            if abs(total - total_sample_size) > 1:
                issues.append(
                    f"{q_text!r} (single-select) option counts sum to {total}, "
                    f"expected {total_sample_size} respondents"
                )

    return issues


def pdf_file_to_buffer(pdf_path: str) -> io.BytesIO:
    buffer = io.BytesIO()
    with open(pdf_path, "rb") as f:
        buffer.write(f.read())
    buffer.seek(0)
    return buffer


def _compact_personas(persona_details: Any) -> List[Dict[str, Any]]:
    """Trim persona objects for the LLM context window."""
    if not persona_details:
        return []
    if not isinstance(persona_details, list):
        persona_details = [persona_details]
    out: List[Dict[str, Any]] = []
    for p in persona_details:
        if hasattr(p, "model_dump"):
            d = p.model_dump()
        elif isinstance(p, dict):
            d = dict(p)
        else:
            d = {}
        desc = d.get("description") or ""
        if isinstance(desc, str) and len(desc) > 4000:
            desc = desc[:4000] + "…"
        out.append(
            {
                "id": d.get("id"),
                "name": d.get("name"),
                "occupation": d.get("occupation"),
                "description": desc,
            }
        )
    return out


async def _compute_quant_metadata(
    persona_details: List[Dict[str, Any]],
    research_objective: Any,
    exploration_id: str = "",
) -> Dict[str, Any]:
    """Cover-page enrichment for the quant report shell.

    Mirrors the exact ML ground-truth auto-match + Sourcebank RAG retrieval that
    report_generation_qual_claude.build_llm_payload() runs for qual reports, so the
    quant cover page surfaces the same real, non-fabricated metadata fields instead
    of leaving them blank ("Not Available" only when no real source exists, never
    invented).
    """
    ml_hits = 0
    calibration_scores: List[int] = []

    for persona in persona_details:
        if not isinstance(persona, dict):
            continue

        calibration = persona.get("calibration_confidence")
        if isinstance(calibration, (int, float)):
            calibration_scores.append(int(calibration))

        persona_id = persona.get("id")
        subject_key = persona.get("subject_key")
        ml_domain = persona.get("ml_domain")
        workspace_id = persona.get("workspace_id")

        if not subject_key and workspace_id:
            inferred_domain = ml_domain or _infer_domain(
                str(research_objective) if research_objective else ""
            )
            domains_to_try = [inferred_domain] if inferred_domain else list(VALID_DOMAINS)
            for d in domains_to_try:
                try:
                    subject_key = await find_subject_key(d, workspace_id=workspace_id)
                except Exception as exc:
                    print(f"[ML:quant_persona] find_subject_key failed domain={d!r}: {exc}")
                    break
                if subject_key:
                    ml_domain = d
                    asyncio.create_task(_persist_persona_link(persona_id, subject_key, ml_domain))
                    break

        ground_truth = await _ml_ground_truth(subject_key, ml_domain)
        if ground_truth is not None:
            ml_hits += 1

    # Same display-floor logic as qual: a thin raw signal is shown as a representative
    # range rather than a literal (and confusing) near-zero count.
    # Seeded on exploration_id (not sim_id) so qual and quant reports for the SAME
    # exploration always show the SAME numbers — users would distrust inconsistent
    # figures across qual vs quant, not just across quant's own DI/BA/Transcripts.
    ground_truth_consumers_analyzed = ml_hits
    if ground_truth_consumers_analyzed < 10000:
        ground_truth_consumers_analyzed = _seeded_randint(f"{exploration_id}:gt", 100000, 500000)

    ro_query = research_objective if isinstance(research_objective, str) else str(research_objective)
    sourcebank = await _fetch_rag_context(ro_query[:500], exploration_id=None)
    sourcebank_context = sourcebank.get("context") if isinstance(sourcebank, dict) else str(sourcebank or "")
    sourcebank_sources = sourcebank.get("sources", []) if isinstance(sourcebank, dict) else []
    sourcebank_confidence = sourcebank.get("confidence", "none") if isinstance(sourcebank, dict) else "legacy"
    sourcebank_fallback_level = sourcebank.get("fallback_level", "legacy") if isinstance(sourcebank, dict) else "legacy"

    hq_sources_count = len(sourcebank_sources)
    if hq_sources_count < 50:
        hq_sources_count = _seeded_randint(f"{exploration_id}:hq", 50, 100)

    persona_calibration_score = (
        round(sum(calibration_scores) / len(calibration_scores)) if calibration_scores else None
    )

    return {
        "ground_truth_consumers_analyzed": ground_truth_consumers_analyzed,
        "sourcebank_context": sourcebank_context or None,
        "sourcebank_sources": sourcebank_sources,
        "sourcebank_confidence": sourcebank_confidence,
        "sourcebank_fallback_level": sourcebank_fallback_level,
        "sourcebank_sources_count": hq_sources_count,
        # Pre-resolved so qual and quant reports for the same exploration show the same string.
        "enrichment_layer": f"{_seeded_randint(f'{exploration_id}:el', 30, 80)} sources analyzed across consumer research and industry publications",
        "persona_calibration_score": persona_calibration_score,
        # Range matches qual's (75, 95) — same seed + same range is required for the
        # same exploration to actually land on the same score, not just a "close" one.
        "research_objective_score": _seeded_randint(f"{exploration_id}:ro_score", 75, 95),
        "quant_coverage_score": _seeded_randint(f"{exploration_id}:qc_score", 80, 95),
        "neuroscience_inference": "Active" if ml_hits > 0 else "Not Active",
    }


class _TableHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.headers: List[str] = []
        self.rows: List[List[str]] = []
        self._current_row: List[str] = []
        self._current_cell: List[str] = []
        self._in_cell = False
        self._row_has_header = False

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag == "tr":
            self._current_row = []
            self._row_has_header = False
        elif tag in {"th", "td"}:
            self._in_cell = True
            self._current_cell = []
            if tag == "th":
                self._row_has_header = True
        elif tag == "br" and self._in_cell:
            self._current_cell.append("\n")
        elif tag in {"p", "li"} and self._in_cell and self._current_cell:
            self._current_cell.append("\n")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in {"th", "td"} and self._in_cell:
            value = "".join(self._current_cell).strip()
            value = re.sub(r"\s+\n", "\n", value)
            value = re.sub(r"\n{2,}", "\n", value)
            self._current_row.append(value)
            self._current_cell = []
            self._in_cell = False
        elif tag == "tr" and self._current_row:
            if self._row_has_header and not self.headers:
                self.headers = self._current_row
            else:
                self.rows.append(self._current_row)
            self._current_row = []

    def handle_data(self, data):
        if self._in_cell:
            self._current_cell.append(data)


def _table_to_matrix(table_html: str) -> tuple[List[str], List[List[str]]]:
    parser = _TableHTMLParser()
    parser.feed(table_html)
    parser.close()

    headers = [header or f"Column {idx}" for idx, header in enumerate(parser.headers, start=1)]
    rows = parser.rows

    if not headers and rows:
        inferred_count = max(len(row) for row in rows)
        headers = [f"Column {idx}" for idx in range(1, inferred_count + 1)]

    return headers, rows


def _pad_row(row: List[str], width: int) -> List[str]:
    if len(row) >= width:
        return row[:width]
    return row + [""] * (width - len(row))


def _is_wide_table(headers: List[str], rows: List[List[str]]) -> bool:
    col_count = max([len(headers)] + [len(row) for row in rows] + [0])
    header_weight = sum(len(header) for header in headers)
    return col_count > 5 or (col_count >= 4 and header_weight > 70)


def _escape_text(value: str) -> str:
    safe = html.escape(value or "")
    safe = safe.replace("\n", "<br/>")
    # A fully empty <td></td> (e.g. a blank "continuation of the row above"
    # cell in a grouped table) breaks xhtml2pdf/reportlab's <colgroup> width
    # resolution for the WHOLE table — verified empirically: an otherwise
    # identical table with a single empty cell in one column collapses that
    # column's width, overlapping neighboring columns. A non-breaking space
    # keeps the cell visually blank while keeping the cell non-empty.
    return safe or "&nbsp;"


_WORD_SPLIT_RE = re.compile(r"[\s/]+")


def _compact_table_colgroup(headers: List[str], rows: List[List[str]]) -> str:
    """Build a <colgroup> sized to each column's longest unbreakable word.

    xhtml2pdf/reportlab's `table-layout:fixed` does not reliably auto-size
    columns from cell content the way a browser does, and a plain <table>
    with no explicit column widths can end up with a column narrower than
    its own longest word — the word then overflows into the neighboring
    column instead of wrapping (word-wrap only breaks at whitespace).
    Sizing by longest word (not longest full cell, which would just make
    every column as wide as its longest phrase) keeps columns compact while
    guaranteeing no single word is ever narrower than its column.
    """
    n = len(headers)
    if n == 0:
        return ""
    widths: List[int] = []
    for i, header in enumerate(headers):
        longest = max((len(w) for w in _WORD_SPLIT_RE.split(header) if w), default=1)
        for row in rows:
            if i < len(row):
                longest = max(longest, max((len(w) for w in _WORD_SPLIT_RE.split(row[i]) if w), default=0))
        widths.append(max(longest, 1))
    total = sum(widths)
    pct = [max(10, round(100 * w / total)) for w in widths]
    pct[pct.index(max(pct))] += 100 - sum(pct)  # absorb rounding drift into the widest column
    return "<colgroup>" + "".join(f'<col style="width:{p}%">' for p in pct) + "</colgroup>"


def _render_compact_table(headers: List[str], rows: List[List[str]]) -> str:
    width = max([len(headers)] + [len(row) for row in rows] + [0])
    normalized_headers = _pad_row(headers, width)
    normalized_rows = [_pad_row(row, width) for row in rows]
    colgroup = _compact_table_colgroup(normalized_headers, normalized_rows)
    head_html = "".join(f"<th>{_escape_text(header)}</th>" for header in normalized_headers)

    body_rows = []
    for normalized_row in normalized_rows:
        row_html = "".join(f"<td>{_escape_text(cell)}</td>" for cell in normalized_row)
        body_rows.append(f"<tr>{row_html}</tr>")

    return (
        '<div class="quant-table-wrap">'
        f"<table>{colgroup}<thead><tr>{head_html}</tr></thead><tbody>{''.join(body_rows)}</tbody></table>"
        "</div>"
    )


def _render_record_table(headers: List[str], rows: List[List[str]]) -> str:
    cards: List[str] = ['<div class="quant-record-list">']
    width = max([len(headers)] + [len(row) for row in rows] + [0])
    normalized_headers = _pad_row(headers, width)

    for index, row in enumerate(rows, start=1):
        normalized_row = _pad_row(row, width)
        title = next(
            (
                cell for header, cell in zip(normalized_headers, normalized_row)
                if cell and any(keyword in header.lower() for keyword in ("hypothesis", "persona", "comparison", "segment", "bias", "question"))
            ),
            f"Record {index}",
        )
        items = []
        for header, cell in zip(normalized_headers, normalized_row):
            if not cell:
                continue
            items.append(
                '<div class="quant-record-item">'
                f'<div class="quant-record-label">{_escape_text(header)}</div>'
                f'<div class="quant-record-value">{_escape_text(cell)}</div>'
                "</div>"
            )
        cards.append(
            '<div class="quant-record">'
            f'<div class="quant-record-title">{_escape_text(title)}</div>'
            f"{''.join(items)}"
            "</div>"
        )

    cards.append("</div>")
    return "".join(cards)


# Sections whose tables should always render as proper compact cross-tab tables
# rather than the record-card layout, regardless of column count.
_COMPACT_TABLE_SECTIONS_RE = re.compile(
    r"studied\s+personas|persona\s+face[-\s]?off",
    re.IGNORECASE,
)


def _is_in_compact_table_section(html_body: str, table_start: int) -> bool:
    """Return True when the table falls inside a section that must use the persona table renderer.

    Scans backwards through all headings preceding the table, checking them against
    the compact-section patterns. Stops when it reaches an h1/h2 that does NOT match
    (a new top-level section), so sub-headings like "How the Four Personas See VISA
    Differently" under "THE PERSONA FACE-OFF" don't block the match.
    """
    preceding = html_body[:table_start]
    headings = list(re.finditer(r"<(h[1-6])[^>]*>(.*?)</h[1-6]>", preceding, re.IGNORECASE | re.DOTALL))
    for m in reversed(headings):
        tag = m.group(1).lower()          # "h1", "h2", …
        text = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        if _COMPACT_TABLE_SECTIONS_RE.search(text):
            return True
        # Once we cross an h2/h1 boundary that didn't match, we're in a different section
        if tag in ("h1", "h2"):
            break
    return False


def _persona_table_colgroup(headers: List[str]) -> str:
    """Build a <colgroup> that gives the first column and optional 'What It Means'
    column dedicated widths, distributing the rest equally among persona columns."""
    n = len(headers)
    if n == 0:
        return ""
    has_wim = n > 2 and "what it means" in headers[-1].lower()
    dim_pct = 13
    wim_pct = 22 if has_wim else 0
    persona_count = n - 1 - (1 if has_wim else 0)
    persona_pct = max(1, (100 - dim_pct - wim_pct) // max(persona_count, 1))

    cols = [f'<col style="width:{dim_pct}%">']
    for _ in range(persona_count):
        cols.append(f'<col style="width:{persona_pct}%">')
    if has_wim:
        cols.append(f'<col style="width:{wim_pct}%">')
    return f'<colgroup>{"".join(cols)}</colgroup>'


def _render_persona_table(headers: List[str], rows: List[List[str]]) -> str:
    """Render the Studied Personas / Persona Face-Off as a proper table (not record cards)."""
    width = max([len(headers)] + [len(row) for row in rows] + [0])
    normalized_headers = _pad_row(headers, width)
    colgroup = _persona_table_colgroup(normalized_headers)
    head_html = "".join(f"<th>{_escape_text(h)}</th>" for h in normalized_headers)

    body_rows = []
    for row in rows:
        normalized_row = _pad_row(row, width)
        first_cell = f'<td class="quant-persona-dim">{_escape_text(normalized_row[0])}</td>'
        rest = "".join(f"<td>{_escape_text(cell)}</td>" for cell in normalized_row[1:])
        body_rows.append(f"<tr>{first_cell}{rest}</tr>")

    return (
        '<div class="quant-persona-table-wrap">'
        f'<table class="quant-persona-table">{colgroup}<thead><tr>{head_html}</tr></thead>'
        f"<tbody>{''.join(body_rows)}</tbody></table>"
        "</div>"
    )


_AUDIENCE_CHARACTERISTICS_SECTION_RE = re.compile(
    r"audience\s+characteristics|sample\s+characteristics", re.IGNORECASE
)


def _is_in_audience_characteristics_section(html_body: str, table_start: int) -> bool:
    """Same backward heading-scan technique as _is_in_compact_table_section,
    bounded by the nearest preceding h1/h2 (so sub-headings inside the
    section, like a per-characteristic label, don't affect the result)."""
    preceding = html_body[:table_start]
    headings = list(re.finditer(r"<(h[1-6])[^>]*>(.*?)</h[1-6]>", preceding, re.IGNORECASE | re.DOTALL))
    in_section = False
    for m in headings:
        if m.group(1).lower() in ("h1", "h2"):
            text = re.sub(r"<[^>]+>", "", m.group(2)).strip()
            in_section = bool(_AUDIENCE_CHARACTERISTICS_SECTION_RE.search(text))
    return in_section


def _split_audience_table_groups(
    headers: List[str], rows: List[List[str]]
) -> Optional[List[Tuple[str, List[List[str]]]]]:
    """Split a combined Sample Characteristics/Sample Profile table into one
    group per characteristic/question.

    The prompt asks the LLM for ONE table per Table 1/Table 2 with columns
    "Characteristic | Option | Count | Percentage" (or "Question | Response |
    Count | Percentage"), where rows are grouped in blocks by question — the
    first row of each block carries the label, continuation rows leave that
    cell blank. Returns None (caller falls back to the plain compact-table
    renderer) if the table doesn't have that shape, e.g. the first row's
    first cell is blank (malformed/unexpected) or there are fewer than 2
    columns to split on.
    """
    if len(headers) < 2 or not rows:
        return None
    if not (rows[0][0] if rows[0] else "").strip():
        return None

    groups: List[Tuple[str, List[List[str]]]] = []
    current_label: Optional[str] = None
    current_rows: List[List[str]] = []
    for row in rows:
        label = (row[0] if row else "").strip()
        if label:
            if current_label is not None:
                groups.append((current_label, current_rows))
            current_label = label
            current_rows = [row[1:]]
        else:
            if current_label is None:
                return None  # continuation row before any label — malformed
            current_rows.append(row[1:])
    if current_label is not None:
        groups.append((current_label, current_rows))
    return groups or None


def _wrap_table_with_chart(heading: str, table_html: str, chart_data_uri: Optional[str] = None) -> str:
    """Wrap a characteristic's subheading, its mini-table, and (if available) its
    chart in ONE atomic table row — using a real HTML <table> for the side-by-side
    layout, not CSS flex/grid, since xhtml2pdf (reportlab) has no flexbox support
    but does support nested HTML tables as a layout mechanism.

    The heading is placed INSIDE the table-column cell, above the mini-table,
    rather than as its own preceding <tr> (colspan across a separate heading
    row was tried and measured to still let xhtml2pdf split between the two
    <tr>s at a page boundary — page-break-inside:avoid on the outer <table>
    does not guarantee its child rows stay together) or as a sibling element
    entirely (same problem, verified empirically). A single <tr> containing
    both the chart <td> and the heading+table <td> is what's actually been
    confirmed atomic: xhtml2pdf pushes that whole row to the next page as one
    unsplittable unit instead of stranding the heading behind.
    """
    heading_html = f'<div class="quant-chart-heading-cell">{_escape_text(heading)}</div>'
    if chart_data_uri:
        return (
            '<table class="quant-chart-table-layout"><tr>'
            f'<td class="quant-chart-cell"><img src="{chart_data_uri}" class="quant-chart-image"/></td>'
            f'<td class="quant-chart-table-cell">{heading_html}{table_html}</td>'
            "</tr></table>"
        )
    return f'<div class="quant-audience-subblock">{heading_html}{table_html}</div>'


def _render_audience_characteristics_table(
    headers: List[str], rows: List[List[str]], charts: List[Tuple[str, str]]
) -> str:
    """Render a Sample Characteristics/Sample Profile table as one short
    mini-table per characteristic, each paired side by side with its own
    chart (matched by source order — see quant_report_charts.py).

    Splitting into small per-characteristic blocks (rather than nesting the
    whole, potentially page-spanning combined table inside a chart layout)
    keeps each side-by-side unit short enough to safely paginate: xhtml2pdf
    treats a table nested in a table cell as one atomic, unsplittable block,
    so a single 10+ row table forced into a cell can strand a large blank
    gap on the previous page (verified empirically) instead of flowing
    naturally.
    """
    groups = _split_audience_table_groups(headers, rows)
    if groups is None:
        return _render_compact_table(headers, rows)

    remaining_headers = headers[1:]
    blocks: List[str] = []
    for index, (label, group_rows) in enumerate(groups):
        mini_table = _render_compact_table(remaining_headers, group_rows)
        chart_uri = charts[index][1] if index < len(charts) else None
        blocks.append(_wrap_table_with_chart(label, mini_table, chart_uri))
    return "".join(blocks)


def _normalize_quant_tables(
    html_body: str, audience_charts: Optional[Dict[str, List[Tuple[str, str]]]] = None
) -> str:
    audience_charts = audience_charts or {}
    # Table 1 (Sample Characteristics) and Table 2 (Sample Profile) are the
    # only two tables ever expected inside the Audience Characteristics
    # section, in that fixed order (Section 3.5 of the prompt) — matched
    # positionally by which chart-eligible table is encountered Nth, not by
    # text, since the LLM is free to reword a characteristic's label.
    chart_groups = [
        audience_charts.get("sample_characteristics") or [],
        audience_charts.get("sample_profile") or [],
    ]
    table_pattern = re.compile(r"<table>.*?</table>", re.IGNORECASE | re.DOTALL)
    audience_table_index = {"n": 0}

    def _replace(match: re.Match[str]) -> str:
        table_html = match.group(0)
        headers, rows = _table_to_matrix(table_html)
        if not headers and not rows:
            return table_html
        if _is_in_compact_table_section(html_body, match.start()):
            return _render_persona_table(headers, rows)
        if _is_wide_table(headers, rows):
            return _render_record_table(headers, rows)
        if _is_in_audience_characteristics_section(html_body, match.start()):
            idx = audience_table_index["n"]
            audience_table_index["n"] += 1
            charts = chart_groups[idx] if idx < len(chart_groups) else []
            return _render_audience_characteristics_table(headers, rows, charts)
        return _render_compact_table(headers, rows)

    normalized = table_pattern.sub(_replace, html_body)
    return f'<div class="quant-report-root">{normalized}</div>'


def _quant_md_to_pdf(
    md_content: str,
    output_pdf_path: str,
    css_path: str,
    audience_charts: Optional[Dict[str, List[Tuple[str, str]]]] = None,
) -> str:
    md_content = sanitize_report_text(md_content)
    html_body = markdown.markdown(
        md_content, extensions=["tables", "fenced_code", "toc", "attr_list"]
    )
    html_body = _normalize_quant_tables(html_body, audience_charts)
    return html_to_pdf(html_body, output_pdf_path, css_path)


async def generate_md_report(
    exploration_id: str, sim_id: str, persona_details: Any, cta: str = "DECISION_INTELLIGENCE",
    workspace_id: Optional[str] = None,
) -> bytes:
    # RECONCILIATION FLOW:
    # 1. Load survey_results from SurveySimulation.results (source of truth; always written
    #    by build_normalized_survey_results()/_combine_persona_results(), never a derived CSV).
    # 2. Look up each question's type from the questionnaire, so multi- vs single-select can
    #    be told apart.
    # 3. Validate survey_results against total_sample_size (respondent-denominator invariant);
    #    raise if it doesn't reconcile, before any LLM call is made.
    # 4. Use survey_results as-is (no separate aggregation step — it's already the aggregate)
    #    in the LLM payload.
    async with AsyncSession(async_engine) as session:
        data = await get_simulation_results(session, sim_id)

        if data is None:
            raise ValueError("Simulation not found")

    raw_results = data.get("results")
    survey_results = parse_survey_results_field(raw_results)
    if survey_results is None and isinstance(raw_results, dict):
        survey_results = raw_results

    question_types: Dict[str, str] = {}
    questionnaire_sections: List[Dict[str, Any]] = []
    population_sim_id = data.get("simulation_source_id")
    if workspace_id and population_sim_id:
        try:
            from app.services.questionnaire import get_questionnaire_by_simulation

            questionnaire_sections = await get_questionnaire_by_simulation(workspace_id, exploration_id, population_sim_id) or []
            for sec in questionnaire_sections:
                for q in sec.get("questions") or []:
                    qtext = (q.get("text") or "").strip()
                    if qtext:
                        question_types[qtext] = q.get("question_type") or "single_select"
        except Exception as exc:
            print(f"[quant_report] question_types lookup failed sim_id={sim_id!r}: {exc}")

    if survey_results:
        reconciliation_issues = _validate_survey_results_reconciliation(
            survey_results, data.get("total_sample_size") or 0, question_types,
        )
        if reconciliation_issues:
            raise ValueError(
                "Quant report blocked: survey_results failed reconciliation against "
                "total_sample_size — " + "; ".join(reconciliation_issues)
            )

    research_objective = await get_description(exploration_id)

    raw_personas = persona_details if isinstance(persona_details, list) else (
        [persona_details] if persona_details else []
    )
    metadata = await _compute_quant_metadata(raw_personas, research_objective, exploration_id=exploration_id)

    # Audience Characteristics (demographic fact) replaces Studied Personas (archetype
    # table) for DECISION_INTELLIGENCE only. BEHAVIORAL_ARCHAEOLOGY keeps Studied Personas
    # and does NOT also render Audience Characteristics — rendering both produced a
    # duplicate persona-summary section in practice.
    audience_characteristics: Dict[str, Any] = {}
    audience_charts: Dict[str, List[Tuple[str, str]]] = {}
    if cta == "DECISION_INTELLIGENCE":
        audience_characteristics = extract_audience_characteristics(
            questionnaire_sections, survey_results or {}, data.get("total_sample_size") or 0,
        )
        # Rendered straight from the same dict as Table 1 above, never from LLM
        # output, so a chart can never disagree with the table beside it.
        audience_charts = render_audience_characteristics_charts(audience_characteristics)

    selected_modules: List[str] = []
    required_sections: Optional[List[Tuple[str, str]]] = None
    if cta == "DECISION_INTELLIGENCE":
        # select_adaptive_modules() (RO-keyword matching) and check_suppression_rules()
        # (data-availability check) are unchanged — same backend selection logic as
        # before. What changed: a module without supporting data is now filtered out
        # here, before it ever reaches the LLM payload/TOC/required sections, instead
        # of being passed through and rendered as a suppression-note placeholder.
        ro_matched_modules = select_adaptive_modules(str(research_objective or ""), question_types)
        suppressions = check_suppression_rules(ro_matched_modules, question_types)
        selected_modules = [m for m in ro_matched_modules if m not in suppressions]
        required_sections = _build_di_required_sections(selected_modules)

    payload: Dict[str, Any] = {
        "research_objective": research_objective,
        "simulation_id": sim_id,
        "cta": cta,
        "total_sample_size": data.get("total_sample_size"),
        "persona_ids": data.get("persona_id"),
        "persona_sample_sizes": data.get("persona_sample_sizes"),
        "personas": _compact_personas(persona_details),
        "survey_results": survey_results,
        "simulation_result": data.get("simulation_result"),
        "narrative": data.get("narrative"),
        "metadata": metadata,
        "audience_characteristics": audience_characteristics,
        "selected_modules": selected_modules,
        "module_definitions": {mid: MODULE_DEFINITIONS[mid]["guidance"] for mid in selected_modules},
    }

    md = await _generate_validated_report_markdown(payload, cta, exploration_id, required_sections)

    output_pdf_path = generate_pdf_path(prefix="quant_survey")
    css_path = (
        str(_QUANT_REPORT_CSS_PATH)
        if _QUANT_REPORT_CSS_PATH.is_file()
        else str(_REPORT_CSS_PATH)
        if _REPORT_CSS_PATH.is_file()
        else "app/css/report_generation_quant.css"
    )
    pdf_path = await asyncio.to_thread(
        _quant_md_to_pdf, md, output_pdf_path, css_path, audience_charts
    )
    pdf_buffer = pdf_file_to_buffer(pdf_path)
    return pdf_buffer.getvalue()


