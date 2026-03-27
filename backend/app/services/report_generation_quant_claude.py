import asyncio
import html
import io
import json
import markdown
import os
import pathlib
import re
import uuid
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import async_engine
from app.models.survey_simulation import SurveySimulation
from app.services.auto_generated_persona import get_description
from app.services.quant_report_cta_prompt import CTA_ROUTED_QUANT_REPORT_PROMPT_V1
from app.services.report_generation_qual_claude import html_to_pdf
from app.services.survey_simulation import parse_survey_results_field
from app.utils.anthropic_client import get_async_anthropic_client

load_dotenv()

_REPORT_CSS_PATH = (
    pathlib.Path(__file__).resolve().parent.parent / "css" / "report_generation.css"
)
_QUANT_REPORT_CSS_PATH = (
    pathlib.Path(__file__).resolve().parent.parent / "css" / "report_generation_quant.css"
)

upload_dir = "./reports"


def generate_pdf_path(prefix: str = "report") -> str:
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{prefix}_{uuid.uuid4().hex}.pdf"
    return os.path.join(upload_dir, filename)


async def call_anthropic(
    user_message_content: str,
    model: str = "claude-sonnet-4-5",
    max_tokens: int = 20000,
    temperature: float = 0.9,
):
    client = get_async_anthropic_client()
    async with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        messages=[
            {
                "role": "user",
                "content": user_message_content,
            }
        ],
    ) as stream:
        return await stream.get_final_message()


async def get_simulation_results(
    session: AsyncSession,
    simulation_id: str,
) -> Optional[Dict[str, Any]]:
    """Fetch fields needed to ground the PDF report in stored simulation data."""
    stmt = (
        select(
            SurveySimulation.results,
            SurveySimulation.simulation_result,
            SurveySimulation.narrative,
            SurveySimulation.total_sample_size,
            SurveySimulation.persona_sample_sizes,
            SurveySimulation.persona_id,
        ).where(SurveySimulation.id == simulation_id)
    )

    result = await session.execute(stmt)
    row = result.one_or_none()

    if row is None:
        return None

    return {
        "results": row.results,
        "simulation_result": row.simulation_result,
        "narrative": row.narrative,
        "total_sample_size": row.total_sample_size,
        "persona_sample_sizes": row.persona_sample_sizes,
        "persona_id": row.persona_id,
    }


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
    return safe.replace("\n", "<br/>")


def _render_compact_table(headers: List[str], rows: List[List[str]]) -> str:
    width = max([len(headers)] + [len(row) for row in rows] + [0])
    normalized_headers = _pad_row(headers, width)
    head_html = "".join(f"<th>{_escape_text(header)}</th>" for header in normalized_headers)

    body_rows = []
    for row in rows:
        normalized_row = _pad_row(row, width)
        row_html = "".join(f"<td>{_escape_text(cell)}</td>" for cell in normalized_row)
        body_rows.append(f"<tr>{row_html}</tr>")

    return (
        '<div class="quant-table-wrap">'
        f"<table><thead><tr>{head_html}</tr></thead><tbody>{''.join(body_rows)}</tbody></table>"
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


def _normalize_quant_tables(html_body: str) -> str:
    table_pattern = re.compile(r"<table>.*?</table>", re.IGNORECASE | re.DOTALL)

    def _replace(match: re.Match[str]) -> str:
        table_html = match.group(0)
        headers, rows = _table_to_matrix(table_html)
        if not headers and not rows:
            return table_html
        if _is_wide_table(headers, rows):
            return _render_record_table(headers, rows)
        return _render_compact_table(headers, rows)

    normalized = table_pattern.sub(_replace, html_body)
    return f'<div class="quant-report-root">{normalized}</div>'


def _quant_md_to_pdf(md_content: str, output_pdf_path: str, css_path: str) -> str:
    html_body = markdown.markdown(
        md_content, extensions=["tables", "fenced_code", "toc", "attr_list"]
    )
    html_body = _normalize_quant_tables(html_body)
    return html_to_pdf(html_body, output_pdf_path, css_path)


async def generate_md_report(exploration_id: str, sim_id: str, persona_details: Any, cta: str = "DECISION_INTELLIGENCE") -> bytes:
    async with AsyncSession(async_engine) as session:
        data = await get_simulation_results(session, sim_id)

        if data is None:
            raise ValueError("Simulation not found")

    raw_results = data.get("results")
    survey_results = parse_survey_results_field(raw_results)
    if survey_results is None and isinstance(raw_results, dict):
        survey_results = raw_results

    research_objective = await get_description(exploration_id)

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
    }

    # Verbatim CTA prompt (unchanged) + actual simulation payload only (fixes empty-input hallucinations).
    user_message_content = CTA_ROUTED_QUANT_REPORT_PROMPT_V1 + "\n\n" + json.dumps(
        payload, ensure_ascii=False, default=str
    )

    response = await call_anthropic(user_message_content)

    md = response.content[0].text.strip()

    if not md:
        raise ValueError("Empty response from Claude")

    output_pdf_path = generate_pdf_path(prefix="quant_survey")
    css_path = (
        str(_QUANT_REPORT_CSS_PATH)
        if _QUANT_REPORT_CSS_PATH.is_file()
        else str(_REPORT_CSS_PATH)
        if _REPORT_CSS_PATH.is_file()
        else "app/css/report_generation_quant.css"
    )
    pdf_path = await asyncio.to_thread(_quant_md_to_pdf, md, output_pdf_path, css_path)
    pdf_buffer = pdf_file_to_buffer(pdf_path)
    return pdf_buffer.getvalue()


