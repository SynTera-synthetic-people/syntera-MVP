import os
import re
from typing import List, Dict
from PyPDF2 import PdfReader

try:
    from docx import Document as DocxDocument
except Exception:
    DocxDocument = None

try:
    import pandas as pd
except Exception:
    pd = None



def clean_pdf_text(text: str) -> str:
    text = text.replace("\r", " ")
    text = text.replace("\n", " ")
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()



def extract_text_from_pdf(path: str) -> str:
    try:
        reader = PdfReader(path)
        text = ""
        for page in reader.pages:
            extracted = page.extract_text() or ""
            text += extracted + "\n"
        return clean_pdf_text(text)
    except Exception as e:
        raise ValueError(f"Failed to read PDF: {str(e)}")


def extract_text_from_docx(path: str) -> str:
    if DocxDocument is None:
        raise RuntimeError("python-docx is required to parse DOCX files")
    doc = DocxDocument(path)
    lines = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return clean_pdf_text("\n".join(lines))


def extract_text_from_txt(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return clean_pdf_text(f.read())


def extract_rows_from_excel(path: str) -> List[Dict]:
    if pd is None:
        raise RuntimeError("pandas + openpyxl required for Excel parse")
    df = pd.read_excel(path)
    df = df.fillna("")
    return df.to_dict(orient="records")


def extract_rows_from_csv(path: str) -> List[Dict]:
    if pd is None:
        raise RuntimeError("pandas required for CSV parse")
    df = pd.read_csv(path)
    df = df.fillna("")
    return df.to_dict(orient="records")



SECTION_RE = re.compile(
    r"(Attitudes\s*&\s*Preferences|Perceptions\s*&\s*Acceptance|Pricing\s*&\s*Purchase\s*Intent)",
    re.I
)

QUESTION_RE = re.compile(r"\d+\.\s*(.*?\?)")
OPTIONS_RE = re.compile(r"Options?\s*:\s*", re.I)
NEXT_Q_RE = re.compile(r"\d+\.\s*")


def extract_options(block: str):
    """Extract clean options ONLY inside a question block."""
    opt_match = OPTIONS_RE.search(block)
    if not opt_match:
        return []

    after_opt = block[opt_match.end():].strip()

    next_q = NEXT_Q_RE.search(after_opt)
    if next_q:
        after_opt = after_opt[:next_q.start()].strip()

    raw_opts = re.split(r",| - | -| -", after_opt)

    options = []
    for opt in raw_opts:
        cleaned = opt.strip()

        if NEXT_Q_RE.match(cleaned):
            continue

        if cleaned:
            options.append(cleaned)

    return options


def parse_questionnaire_text(text: str):
    text = clean_pdf_text(text)

    parts = SECTION_RE.split(text)
    sections = []

    for i in range(1, len(parts), 2):
        title = parts[i].strip()
        content = parts[i + 1].strip()

        q_matches = list(QUESTION_RE.finditer(content))
        questions = []

        for qi, qmatch in enumerate(q_matches):
            q_text = qmatch.group(1).strip()

            start = qmatch.end()
            end = q_matches[qi + 1].start() if qi + 1 < len(q_matches) else len(content)
            q_block = content[start:end]

            options = extract_options(q_block)

            questions.append({
                "text": q_text,
                "options": options
            })

        sections.append({
            "title": title,
            "questions": questions
        })

    return sections


def parse_file(path: str, original_filename: str):
    ext = os.path.splitext(original_filename.lower())[1]

    if ext == ".pdf":
        text = extract_text_from_pdf(path)
        sections = parse_questionnaire_text(text)
        return {"type": "pdf", "sections": sections}

    if ext == ".docx":
        text = extract_text_from_docx(path)
        sections = parse_questionnaire_text(text)
        return {"type": "docx", "sections": sections}

    if ext == ".txt":
        text = extract_text_from_txt(path)
        sections = parse_questionnaire_text(text)
        return {"type": "txt", "sections": sections}

    if ext == ".csv":
        rows = extract_rows_from_csv(path)
        return convert_table_to_sections(rows)

    if ext in (".xls", ".xlsx"):
        rows = extract_rows_from_excel(path)
        return convert_table_to_sections(rows)

    raise ValueError(f"Unsupported file type: {ext}")


def convert_table_to_sections(rows: List[Dict]):
    """
    Expected columns: section, question, options
    """
    section_map = {}

    for row in rows:
        sec = row.get("section") or row.get("Section") or "Default"

        qtext = row.get("question") or row.get("Question") or ""
        opts = row.get("options") or row.get("Options") or ""

        if isinstance(opts, str):
            options = [o.strip() for o in re.split(r",|;|\|", opts) if o.strip()]
        else:
            options = opts if isinstance(opts, list) else []

        if sec not in section_map:
            section_map[sec] = []

        if qtext:
            section_map[sec].append({
                "text": qtext.strip(),
                "options": options
            })

    sections = [{"title": sec, "questions": qs} for sec, qs in section_map.items()]
    return {"type": "table", "sections": sections}
