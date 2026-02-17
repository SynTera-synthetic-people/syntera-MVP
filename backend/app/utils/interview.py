# app/utils/pdf_generator_interview.py
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import textwrap
import os
from typing import List, Dict, Any

LINE_WIDTH = 95

def _wrap_lines(text: str, width: int = 100):
    return textwrap.wrap(text or "", width)

def generate_interview_pdf(interview: Dict[str, Any], out_path: str) -> str:
    """
    Single interview — grouped by SECTION → QUESTION → Answer → Implications.
    Same structure as combined interviews.
    """
    if hasattr(interview, "model_dump"):
        data = interview.model_dump()
    else:
        data = interview if isinstance(interview, dict) else interview.__dict__

    c = canvas.Canvas(out_path, pagesize=A4)
    width, height = A4
    y = height - 40

    # === HEADER ===
    c.setFont("Helvetica-Bold", 16)
    c.drawString(40, y, "Interview Report")
    y -= 24
    # c.setFont("Helvetica", 10)
    # c.drawString(40, y, f"Interview ID: {data.get('id')}")
    # y -= 14
    # c.drawString(40, y, f"Exploration: {data.get('exploration_id')}")
    # y -= 14
    # c.drawString(40, y, f"Persona: {data.get('persona_id') or 'N/A'}")
    # y -= 30

    # === GROUP QUESTIONS BY SECTION ===
    messages = data.get("messages", [])
    generated = data.get("generated_answers", {})

    # Map: section → question → info
    sections = {}

    for question, info in generated.items():
        # resolve section via message metadata
        section = "General"
        for m in messages:
            meta = m.get("meta", {})
            if meta.get("question") == question:
                section = meta.get("section") or "General"
                break
        if section not in sections:
            sections[section] = {}
        sections[section][question] = info

    # === PRINT SECTIONS ===
    for section_title, questions in sections.items():

        if y < 140:
            c.showPage()
            y = height - 40

        # SECTION HEADER
        c.setFont("Helvetica-Bold", 14)
        c.drawString(40, y, f"Section: {section_title}")
        y -= 20

        for qtext, info in questions.items():
            if y < 140:
                c.showPage()
                y = height - 40

            # QUESTION
            c.setFont("Helvetica-Bold", 11)
            c.drawString(45, y, f"Question: {qtext}")
            y -= 14

            # ANSWER
            ans = info.get("persona_answer", "")
            c.setFont("Helvetica", 10)
            for ln in _wrap_lines("Answer: " + ans, LINE_WIDTH):
                c.drawString(55, y, ln)
                y -= 12

            # IMPLICATIONS
            imps = info.get("implications", []) or []
            if imps:
                c.setFont("Helvetica-Oblique", 9)
                for imp in imps:
                    for ln in _wrap_lines(f"- Insight: {imp}", LINE_WIDTH):
                        c.drawString(60, y, ln)
                        y -= 10

            y -= 10

    # === OTHER CHAT MESSAGES (Follow-ups) ===
    followups = [m for m in messages if m["role"] in ("user", "persona") 
                 and m.get("meta", {}).get("question") is None]

    if followups:
        if y < 140:
            c.showPage()
            y = height - 40

        c.setFont("Helvetica-Bold", 14)
        c.drawString(40, y, "OTHERS (Follow-up Questions)")
        y -= 18

        for m in followups:
            role = m.get("role").upper()
            text = m.get("text", "")
            ts = m.get("ts", "")

            c.setFont("Helvetica-Bold", 10)
            c.drawString(40, y, f"{role} ({ts}):")
            y -= 14

            c.setFont("Helvetica", 9)
            for ln in _wrap_lines(text, LINE_WIDTH):
                c.drawString(50, y, ln)
                y -= 10

            y -= 10

    c.save()
    return out_path


async def generate_combined_interviews_pdf(interviews: List[Dict[str, Any]], persona_map, objective_id: str, out_path: str) -> str:
    """
    Combine multiple InterviewOut into one PDF.
    Structure: Section -> Question -> Summarize -> Persona 1 answer ... -> Insights
    interviews: list of InterviewOut-like dicts
    """
    # Build map: section -> question -> list of (persona_id, answer, implications)
    grouped: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    for iv in interviews:
        # iv may be pydantic model or dict
        data = iv.model_dump() if hasattr(iv, "model_dump") else (iv if isinstance(iv, dict) else iv.__dict__)
        gen = data.get("generated_answers", {}) or {}
        # messages could have meta.section and meta.question
        # We rely on generated_answers keys (question text) plus meta from messages if needed
        for qtext, info in gen.items():
            section = info.get("meta_section") or "General"
            # try extract section from messages
            # (if 'meta_section' not provided, we'll try to find any message that had meta.question==qtext)
            if section == "General":
                for m in data.get("messages", []):
                    meta = m.get("meta") or {}
                    if meta.get("question") == qtext:
                        section = meta.get("section") or section
                        break
            grouped.setdefault(section, {}).setdefault(qtext, []).append({
                "persona_id": info.get("persona_id"),
                "answer": info.get("persona_answer"),
                "implications": info.get("implications", [])
            })

    # Generate PDF
    c = canvas.Canvas(out_path, pagesize=A4)
    width, height = A4
    y = height - 40
    c.setFont("Helvetica-Bold", 16)
    c.drawString(40, y, "Combined Interviews Report")
    y -= 24
    # c.setFont("Helvetica", 10)
    # c.drawString(40, y, f"Research Objective: {objective_id}")
    # y -= 24

    # Iterate grouped
    for sec_title, questions in grouped.items():
        if y < 140:
            c.showPage()
            y = height - 40
        c.setFont("Helvetica-Bold", 14)
        c.drawString(40, y, f"Section: {sec_title}")
        y -= 18
        for qtext, answers in questions.items():
            if y < 140:
                c.showPage()
                y = height - 40
            c.setFont("Helvetica-Bold", 11)
            c.drawString(45, y, f"Question: {qtext}")
            y -= 14
            # Summarize (simple heuristic: show count and unique themes)
            # For now write a short summary using first answers or simple aggregation
            summary_text = f"Collected {len(answers)} persona responses."
            c.setFont("Helvetica-Oblique", 9)
            for ln in _wrap_lines("Summary: " + summary_text, LINE_WIDTH):
                c.drawString(50, y, ln)
                y -= 10
            # Persona answers
            c.setFont("Helvetica", 10)
            for a in answers:
                pid = a.get("persona_id", "N/A")
                persona_name = persona_map.get(pid, "Persona")
                ans = a.get("answer") or ""
                # Persona header
                c.setFont("Helvetica-Bold", 9)
                c.drawString(55, y, f"{persona_name}:")
                y -= 12
                c.setFont("Helvetica", 9)
                for ln in _wrap_lines(ans, LINE_WIDTH):
                    c.drawString(65, y, ln)
                    y -= 10
                    if y < 120:
                        c.showPage()
                        y = height - 40
                # Implications
                imps = a.get("implications", []) or []
                if imps:
                    c.setFont("Helvetica-Oblique", 9)
                    for imp in imps:
                        for ln in _wrap_lines(f"- Insight: {imp}", LINE_WIDTH):
                            c.drawString(70, y, ln)
                            y -= 10
                            if y < 120:
                                c.showPage()
                                y = height - 40
                y -= 8
            y -= 6
        y -= 12

    c.save()
    return out_path
