import os
import re
from collections import OrderedDict
from typing import List, Dict, Tuple, Any, Optional
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
    df = pd.read_csv(path, encoding="utf-8-sig")
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
        return convert_tabular_rows_to_sections(rows)

    if ext in (".xls", ".xlsx"):
        rows = extract_rows_from_excel(path)
        return convert_tabular_rows_to_sections(rows)

    raise ValueError(f"Unsupported file type: {ext}")


def _norm_header_key(name: str) -> str:
    s = str(name).strip().lstrip("\ufeff").strip()
    return re.sub(r"\s+", " ", s.lower())


def _row_by_normalized_keys(row: Dict) -> Dict[str, Any]:
    """Map normalized column name -> value."""
    out: Dict[str, Any] = {}
    for k, v in row.items():
        out[_norm_header_key(k)] = v
    return out


def _is_exploration_csv_format(rows: List[Dict]) -> bool:
    """
    questionnaire_exploration.csv layout: one row per option; columns like
    Q No., Question Description, Options, Count (Count ignored on upload).
    """
    if not rows or not isinstance(rows[0], dict):
        return False
    keys = {_norm_header_key(k) for k in rows[0].keys()}
    has_options = "options" in keys or "option" in keys
    if not has_options:
        return False
    has_q_desc = "question description" in keys
    has_q_no = any(
        (re.match(r"^q\.?\s*no\.?$", k) is not None)
        or k in ("qno", "no", "#", "q no", "q no.")
        for k in keys
    )
    if has_q_desc:
        return True
    if has_q_no:
        return True
    return False


def _parse_q_no(val: Any) -> Optional[int]:
    if val is None or val == "":
        return None
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none"):
        return None
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None


def convert_exploration_csv_to_sections(rows: List[Dict]) -> Dict:
    """
    Build sections from exploration CSV: group rows by Q No. (preferred) or question text.
    Count column is ignored (respondent counts come from survey simulation on export).
    """
    groups: "OrderedDict[Tuple, Dict[str, Any]]" = OrderedDict()
    order: List[Tuple] = []

    for row in rows:
        rd = _row_by_normalized_keys(row)

        q_no = None
        for cand in ("q no.", "q no", "qno", "no", "#"):
            if cand in rd:
                q_no = _parse_q_no(rd.get(cand))
                break

        qtext = ""
        for cand in ("question description", "question", "description"):
            if cand in rd and str(rd.get(cand) or "").strip():
                qtext = str(rd[cand]).strip()
                break

        opt = ""
        for cand in ("options", "option"):
            if cand in rd:
                opt = str(rd.get(cand) or "").strip()
                break

        if not qtext and not opt:
            continue
        if not qtext:
            continue

        if q_no is not None:
            key = ("q", q_no)
        else:
            key = ("t", qtext)

        if key not in groups:
            groups[key] = {"text": qtext, "options": []}
            order.append(key)
        elif qtext and groups[key]["text"] != qtext:
            # Same Q No. with conflicting wording — keep first title
            pass

        if opt:
            groups[key]["options"].append(opt)

    questions: List[Dict[str, Any]] = []
    for key in order:
        g = groups[key]
        text = g["text"]
        if not text:
            continue
        opts = g["options"]
        seen: List[str] = []
        for o in opts:
            if o not in seen:
                seen.append(o)
        questions.append({"text": text, "options": seen})

    if not questions:
        raise ValueError(
            "No questions found in CSV. Expected columns such as "
            "'Q No.', 'Question Description', 'Options' (and optional 'Count')."
        )

    return {
        "type": "exploration_csv",
        "sections": [{"title": "Questionnaire", "questions": questions}],
    }


def convert_table_to_sections(rows: List[Dict]):
    """
    Legacy table: columns section, question, options (options often comma-separated in one cell).
    """
    section_map: Dict[str, List[Dict]] = {}

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
            section_map[sec].append(
                {
                    "text": qtext.strip(),
                    "options": options,
                }
            )

    sections = [{"title": sec, "questions": qs} for sec, qs in section_map.items()]
    return {"type": "table", "sections": sections}


def convert_tabular_rows_to_sections(rows: List[Dict]) -> Dict:
    """Route CSV/XLSX to exploration layout or legacy section/question table."""
    if _is_exploration_csv_format(rows):
        return convert_exploration_csv_to_sections(rows)
    return convert_table_to_sections(rows)
