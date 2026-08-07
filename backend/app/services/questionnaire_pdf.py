"""
Questionnaire PDF export.

Replaces the plain CSV that used to back the "Download Questionnaire" action
with a branded PDF styled via app/css/report_generation_quant.css — the same
house style (Calibri/Arial, brand blue #1F4788) used by every other quant
report, so this matches the rest of the Report Log instead of standing out.

Reuses the existing xhtml2pdf toolchain (generate_pdf_path/html_to_pdf) from
report_generation_qual_claude.py, which report_generation_quant_claude.py
already imports from for the same reason — that module is the de facto
shared PDF utility for both qual and quant despite its name.
"""

from __future__ import annotations

import asyncio
from html import escape as _html_escape
from typing import Any, Dict, List, Optional, Tuple

from app.services.question_engine import question_scale_labels, question_type_label
from app.services.report_generation_qual_claude import generate_pdf_path, html_to_pdf, sanitize_report_text
from app.utils.questionnaire_csv import _align_blocks_to_questions, _ensure_option_list


# Questionnaire-only styling. Passed as extra_css rather than added to
# report_generation_quant.css, which every other quant report shares.
_QUESTIONNAIRE_CSS = """
.qn-type {
    font-size: 8.5px;
    color: #5A6B85;
    font-style: italic;
}
.qn-scale {
    margin: -4px 0 10px 16px;
    font-size: 9.5px;
    color: #33445E;
}
.qn-scale-label {
    color: #1F4788;
    font-weight: 700;
}
"""


def _esc(value: Any) -> str:
    return _html_escape(sanitize_report_text(str(value)))


def _normalized(items: List[str]) -> List[str]:
    return [" ".join(str(item).split()).lower() for item in items]


def _same_labels(left: List[str], right: List[str]) -> bool:
    """Case/whitespace-insensitive list equality."""
    return _normalized(left) == _normalized(right)


def _build_questionnaire_html(
    sections: List[Dict[str, Any]],
    counts_map: Optional[Dict[str, Any]] = None,
) -> str:
    parts: List[str] = ['<h1>Questionnaire</h1>']

    flat: List[Tuple[str, List[str]]] = []
    questions: List[Dict[str, Any]] = []
    for sec in sections:
        for q in sec.get("questions") or []:
            questions.append(q)
            flat.append(((q.get("text") or "").strip(), _ensure_option_list(q.get("options"))))
    aligned = _align_blocks_to_questions(counts_map, flat)

    question_no = 0
    for sec in sections:
        section_title = sec.get("title")
        if section_title:
            parts.append(f'<h2>{_esc(section_title)}</h2>')

        for _ in sec.get("questions") or []:
            q_text, opts = flat[question_no]
            block = aligned[question_no]
            question = questions[question_no]
            question_no += 1

            # The response format is otherwise unrecoverable from the export —
            # a grid and a plain multi-select both render as a flat option list.
            type_label = question_type_label(question)
            type_html = f' <span class="qn-type">[{_esc(type_label)}]</span>' if type_label else ""
            parts.append(f'<p><strong>Q{question_no}.</strong> {_esc(q_text)}{type_html}</p>')

            # Same fallback as questionnaire_sections_to_csv_bytes(): explicit
            # options first, else option labels from the matched survey block.
            if not opts and block and isinstance(block, list):
                opts = [str(item.get("option", "")) for item in block if isinstance(item, dict)]

            if opts:
                items = "".join(f"<li>{_esc(opt)}</li>" for opt in opts)
                parts.append(f'<ol type="a">{items}</ol>')

            # On grids and rating scales `options` holds the rows (statements,
            # attributes) — the scale a respondent answers on lives on the other
            # axis and would otherwise be dropped entirely.
            heading, scale_labels = question_scale_labels(question)
            if scale_labels and _same_labels(scale_labels, opts):
                # A grid saved without its own columns falls back to the option
                # list in _default_config(), so printing it again says nothing.
                scale_labels = []
            if scale_labels:
                joined = " &nbsp;|&nbsp; ".join(_esc(label) for label in scale_labels)
                parts.append(
                    f'<p class="qn-scale"><span class="qn-scale-label">{_esc(heading)}:</span> {joined}</p>'
                )

    return "\n".join(parts)


async def generate_questionnaire_pdf(
    sections: List[Dict[str, Any]],
    counts_map: Optional[Dict[str, Any]] = None,
) -> str:
    """Build the questionnaire PDF from section/question data. Returns the output file path."""
    html_body = _build_questionnaire_html(sections, counts_map)
    out_path = generate_pdf_path(prefix="questionnaire")
    return await asyncio.to_thread(
        html_to_pdf,
        html_body,
        out_path,
        "app/css/report_generation_quant.css",
        _QUESTIONNAIRE_CSS,
    )
