from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from reportlab.lib import colors
import io
from datetime import datetime


def _safe_str(value):
    """Convert value to string safely, handling lists and other types."""
    if isinstance(value, str):
        return value
    elif isinstance(value, list):
        return " ".join(str(item) for item in value)
    elif value is None:
        return ""
    else:
        return str(value)


def generate_survey_pdf(simulation, sections, personas, research_objective):
    """
    simulation: SurveySimulation ORM object
    sections: grouped_output from simulate_and_store()
    personas: persona dict OR list of persona dicts (for multi-persona support)
    research_objective: exploration dict/object
    """

    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=40,
        bottomMargin=40,
    )

    styles = getSampleStyleSheet()
    story = []

    # ---- TITLE ----
    title = f"<b>Survey Insights Report</b>"
    story.append(Paragraph(title, styles["Title"]))
    story.append(Spacer(1, 12))

    # Handle both single persona (old format) and personas list (new format)
    if isinstance(personas, list):
        personas_list = personas
    else:
        personas_list = [personas] if personas else []

    # Build personas display text
    if personas_list:
        if len(personas_list) == 1:
            personas_text = f"{personas_list[0].get('name', 'Persona')}"
        else:
            personas_text = ", ".join([p.get('name', 'Unknown') for p in personas_list])
    else:
        personas_text = "N/A"

    # Get total sample size
    total_sample_size = simulation.total_sample_size if hasattr(simulation, 'total_sample_size') else simulation.sample_size if hasattr(simulation, 'sample_size') else 0

    # ---- META ----
    meta = f"""
    <b>Research Objective:</b> {research_objective.description if hasattr(research_objective,'description') else research_objective.get('description','')}<br/>
    <b>Personas:</b> {personas_text}<br/>
    <b>Total Sample Size:</b> {total_sample_size}<br/>
    <b>Generated At:</b> {simulation.created_at.strftime("%Y-%m-%d %H:%M:%S")}
    """
    story.append(Paragraph(meta, styles["Normal"]))
    story.append(Spacer(1, 15))

    # ---- PERSONA BREAKDOWN (if multiple personas) ----
    if len(personas_list) > 1 and hasattr(simulation, 'persona_sample_sizes') and simulation.persona_sample_sizes:
        story.append(Paragraph("<b>Persona Breakdown</b>", styles["Heading2"]))
        for persona in personas_list:
            persona_id = persona.get('id')
            sample_size = simulation.persona_sample_sizes.get(persona_id, 0)
            persona_line = f"- {persona.get('name', 'Unknown')}: {sample_size} respondents"
            story.append(Paragraph(persona_line, styles["Normal"]))
        story.append(Spacer(1, 15))

    # ---- NARRATIVE SUMMARY ----
    story.append(Paragraph("<b>Overall Summary</b>", styles["Heading2"]))
    summary = _safe_str(simulation.narrative.get("summary", ""))
    story.append(Paragraph(summary, styles["Normal"]))
    story.append(Spacer(1, 15))

    # ---- LLM Source Explanation ----
    if "llm_source_explanation" in simulation.narrative:
        story.append(Paragraph("<b>LLM Source Explanation</b>", styles["Heading2"]))
        llm_explanation = _safe_str(simulation.narrative["llm_source_explanation"])
        story.append(Paragraph(llm_explanation, styles["Normal"]))
        story.append(Spacer(1, 15))

    # ---- SECTION-WISE RESULTS ----
    for sec in sections:
        story.append(Paragraph(f"<b>{sec['title']}</b>", styles["Heading2"]))
        story.append(Spacer(1, 10))

        for q in sec["questions"]:
            story.append(Paragraph(f"<b>Q:</b> {q['question']}", styles["Normal"]))
            story.append(Spacer(1, 5))

            for opt in q["results"]:
                line = f"- {opt['option']}: {opt['percentage']} ({opt['count']} respondents)"
                story.append(Paragraph(line, styles["Normal"]))

            story.append(Spacer(1, 8))

        story.append(Spacer(1, 20))

    doc.build(story)

    buffer.seek(0)
    return buffer

