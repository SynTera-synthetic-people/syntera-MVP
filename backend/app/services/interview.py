import json
import re
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlmodel import select
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import async_engine
from app.models.interview import Interview, InterviewFile, InterviewSection, InterviewQuestion
from app.schemas.interview import InterviewOut
from app.utils.id_generator import generate_id
from app.config import OPENAI_API_KEY
from openai import AsyncOpenAI
from app.services.persona import get_persona, list_personas
from app.services.exploration import get_exploration
from app.utils.interview import generate_interview_pdf, generate_combined_interviews_pdf
from typing import Iterable
from app.services import persona as persona_service

from app.services.interview_prompts import (
    DISCUSSION_GUIDE_PROMPT,
    BATCH_INTERVIEW_PROMPT,
    LIVE_REPLY_PROMPT
)


from app.services.auto_generated_persona import get_description


client = AsyncOpenAI(api_key=OPENAI_API_KEY)


def _map_interview_row_to_out(i: Interview) -> InterviewOut:
    return InterviewOut(
        id=str(i.id),
        workspace_id=str(i.workspace_id),
        exploration_id=str(i.exploration_id),
        persona_id=str(i.persona_id) if i.persona_id else None,
        messages=i.messages or [],
        generated_answers=i.generated_answers or {},
        created_by=str(i.created_by),
        created_at=i.created_at
    )

def _safe_json(obj: Any) -> str:
    def _default(o):
        if isinstance(o, datetime):
            return o.isoformat()
        return str(o)
    return json.dumps(obj, indent=2, default=_default)


async def create_interview_section(
    workspace_id: str,
    exploration_id: str,
    title: str,
    user_id: str,
    description: str
) -> Dict:
    """Create a new interview section with its own ID"""
    async with AsyncSession(async_engine) as session:
        section = InterviewSection(
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            title=title,
            created_by=user_id,
            description=description
        )
        session.add(section)
        await session.commit()
        await session.refresh(section)
        
        return {
            "id": section.id,
            "workspace_id": section.workspace_id,
            "exploration_id": section.exploration_id,
            "title": section.title,
            "created_by": section.created_by,
            "created_at": section.created_at
        }


async def create_interview_question(
    section_id: str,
    text: str,
    user_id: str
) -> Dict:
    """Create a new interview question with its own ID"""
    async with AsyncSession(async_engine) as session:
        question = InterviewQuestion(
            section_id=section_id,
            text=text,
            created_by=user_id
        )
        session.add(question)
        await session.commit()
        await session.refresh(question)
        
        return {
            "id": question.id,
            "section_id": question.section_id,
            "text": question.text,
            "created_by": question.created_by,
            "created_at": question.created_at
        }

async def list_interview_sections(workspace_id: str, exploration_id: str) -> List[Dict]:
    """List all interview sections for an exploration"""
    async with AsyncSession(async_engine) as session:
        query = select(InterviewSection).where(
            InterviewSection.workspace_id == workspace_id,
            InterviewSection.exploration_id == exploration_id
        ).order_by(InterviewSection.created_at)
        
        result = await session.execute(query)
        sections = result.scalars().all()
        
        return [
            {
                "id": s.id,
                "workspace_id": s.workspace_id,
                "exploration_id": s.exploration_id,
                "title": s.title,
                "created_by": s.created_by,
                "created_at": s.created_at
            }
            for s in sections
        ]

async def list_interview_questions(section_id: str) -> List[Dict]:
    """List all questions for a specific interview section"""
    async with AsyncSession(async_engine) as session:
        query = select(InterviewQuestion).where(
            InterviewQuestion.section_id == section_id
        ).order_by(InterviewQuestion.created_at)
        
        result = await session.execute(query)
        questions = result.scalars().all()
        
        return [
            {
                "id": q.id,
                "section_id": q.section_id,
                "text": q.text,
                "created_by": q.created_by,
                "created_at": q.created_at
            }
            for q in questions
        ]

async def get_full_interview_guide(workspace_id: str, exploration_id: str) -> List[Dict]:
    """Get complete interview guide with sections and questions"""
    sections = await list_interview_sections(workspace_id, exploration_id)
    
    result = []
    for section in sections:
        questions = await list_interview_questions(section["id"])
        result.append({
            "section_id": section["id"],
            "title": section["title"],
            "questions": questions
        })
    
    return result


async def clear_qualitative_outputs(workspace_id: str, exploration_id: str) -> None:
    """Clear generated qualitative data when upstream inputs change, making regeneration explicit."""
    async with AsyncSession(async_engine) as session:
        interview_res = await session.execute(
            select(Interview.id).where(
                Interview.workspace_id == workspace_id,
                Interview.exploration_id == exploration_id,
            )
        )
        interview_ids = list(interview_res.scalars().all())
        if interview_ids:
            await session.execute(delete(InterviewFile).where(InterviewFile.interview_id.in_(interview_ids)))
            await session.execute(delete(Interview).where(Interview.id.in_(interview_ids)))

        section_res = await session.execute(
            select(InterviewSection.id).where(
                InterviewSection.workspace_id == workspace_id,
                InterviewSection.exploration_id == exploration_id,
            )
        )
        section_ids = list(section_res.scalars().all())
        if section_ids:
            await session.execute(delete(InterviewQuestion).where(InterviewQuestion.section_id.in_(section_ids)))
            await session.execute(delete(InterviewSection).where(InterviewSection.id.in_(section_ids)))

        await session.commit()

async def delete_interview_section(section_id: str) -> bool:
    """Delete an interview section and all its questions"""
    async with AsyncSession(async_engine) as session:
        questions_query = select(InterviewQuestion).where(
            InterviewQuestion.section_id == section_id
        )
        questions_result = await session.execute(questions_query)
        questions = questions_result.scalars().all()
        
        for question in questions:
            await session.delete(question)
        
        section_query = select(InterviewSection).where(InterviewSection.id == section_id)
        section_result = await session.execute(section_query)
        section = section_result.scalars().first()
        
        if not section:
            return False
        
        await session.delete(section)
        await session.commit()
        return True

async def delete_interview_question(question_id: str) -> bool:
    """Delete a specific interview question"""
    async with AsyncSession(async_engine) as session:
        query = select(InterviewQuestion).where(InterviewQuestion.id == question_id)
        result = await session.execute(query)
        question = result.scalars().first()
        
        if not question:
            return False
        
        await session.delete(question)
        await session.commit()
        return True

async def update_interview_section(section_id: str, title: str) -> Optional[Dict]:
    """Update an interview section title"""
    async with AsyncSession(async_engine) as session:
        query = select(InterviewSection).where(InterviewSection.id == section_id)
        result = await session.execute(query)
        section = result.scalars().first()
        
        if not section:
            return None
        
        section.title = title
        session.add(section)
        await session.commit()
        await session.refresh(section)
        
        return {
            "id": section.id,
            "workspace_id": section.workspace_id,
            "exploration_id": section.exploration_id,
            "title": section.title,
            "created_by": section.created_by,
            "created_at": section.created_at
        }

async def update_interview_question(question_id: str, text: str) -> Optional[Dict]:
    """Update an interview question text"""
    async with AsyncSession(async_engine) as session:
        query = select(InterviewQuestion).where(InterviewQuestion.id == question_id)
        result = await session.execute(query)
        question = result.scalars().first()
        
        if not question:
            return None
        
        question.text = text
        session.add(question)
        await session.commit()
        await session.refresh(question)
        
        return {
            "id": question.id,
            "section_id": question.section_id,
            "text": question.text,
            "created_by": question.created_by,
            "created_at": question.created_at
        }

async def generate_discussion_guide_with_llm(workspace_id: str, exploration_id: str, user_id: str, session: AsyncSession):
    """Generate interview guide with AI and store as InterviewSection + InterviewQuestion"""
    exp = await get_exploration(session, exploration_id)
    if not exp:
        raise ValueError("Research objective not found")
    personas = await list_personas(workspace_id, exploration_id)
    research_objective = await get_description(exploration_id)

    persona_summary = "\n".join([f"{p['name']}: {p.get('occupation','')}" for p in personas]) if personas else ""
#     prompt = f"""
# You are a senior qualitative researcher. Produce JSON:
# {{ "sections": [ {{ "title": "...", "questions": ["q1", "q2", "q3", ...] }} ] }}
#
# RESEARCH OBJECTIVE:
# {exp.description}
#
# PERSONAS:
# {persona_summary}
#
# Return strict JSON with 3-6 sections and at least 3 questions per section.
# """
    prompt = DISCUSSION_GUIDE_PROMPT.format(
        research_objective=research_objective
    )    

    res = await client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {"role":"system","content":"You generate discussion guides."},
            {"role":"user","content":prompt}
        ]
    )
    raw = res.choices[0].message.content

    data = raw if isinstance(raw, (dict, list)) else json.loads(raw)
    sections_data = data.get("sections", [])

    created_sections = []
    for section_data in sections_data:
        section = await create_interview_section(
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            title=section_data.get("title", "Untitled Section"),
            user_id=user_id,
            description=section_data.get("theme_description", "")
        )
        
        created_questions = []
        for question_text in section_data.get("questions", []):
            question = await create_interview_question(
                section_id=section["id"],
                text=question_text,
                user_id=user_id
            )
            created_questions.append(question)
        
        section["questions"] = created_questions
        created_sections.append(section)
    
    return {
        "sections": created_sections,
        "message": "Interview guide generated successfully with section and question IDs"
    }

async def start_interview(
    workspace_id: str,
    exploration_id: str,
    persona_id: Optional[str],
    user_id: str,
    guide_sections: List[Dict],
) -> InterviewOut:
    questions_grouped = []
    for s in guide_sections:
        title = s.get("title")
        qs = list(s.get("questions", []) or [])
        questions_grouped.append({"title": title, "questions": qs})

    flat_questions = []
    for sec in questions_grouped:
        for q in sec["questions"]:
            flat_questions.append({"section": sec["title"], "question": q})

    persona_obj = await get_persona(persona_id) if persona_id else None
    persona_json = _safe_json(persona_obj) if persona_obj else "{}"


#     prompt = f"""
# You are role-playing as a research persona. Answer the following questions in FIRST PERSON (2-4 sentences each).
# Also provide 1-2 short implications (insights) per question that a researcher can act on.
#
# PERSONA:
# {persona_json}
#
# QUESTIONS:
# {json.dumps(flat_questions, indent=2)}
#
# Return strict JSON:
# {{
#  "answers": [
#    {{
#      "question": "<q>",
#      "persona_answer": "<answer>",
#      "implications": ["implication 1", "implication 2"]
#    }}
#  ]
# }}
# """

    prompt = BATCH_INTERVIEW_PROMPT.format(
        persona_json=persona_json,
        flat_questions=json.dumps(flat_questions, indent=2),
        question_count=len(flat_questions)
    )

    res = await client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": "You are a qualitative research simulation engine."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    data = json.loads(res.choices[0].message.content)
    answers = data.get("answers", [])


    gen_map = {}
    for a in answers:
        qtext = a.get("question", "")
        gen_map[qtext] = {
            "persona_answer": a.get("revised_persona_answer", ""),
            "implications": a.get("implications", []),
            "persona_id": persona_id,
            "quality_score": a.get("quality_score"),
            "independence_score": a.get("independence_score"),
            "stance_indicators": a.get("stance_indicators", []),
            "behavioral_signals": a.get("behavioral_signals", {})
        }

    messages = []
    messages.append({"role": "system", "text": "Interview started", "ts": datetime.utcnow().isoformat()})
    for q in flat_questions:
        qtext = q["question"]
        messages.append({"role": "user", "text": qtext, "meta": {"section": q["section"]}, "ts": datetime.utcnow().isoformat()})
        pa = gen_map.get(qtext, {}).get("persona_answer", "")
        all_info = gen_map.get(qtext, {}).get("all_info", "")
        all_info_raw = gen_map.get(qtext, {}).get("all_info_raw", "")
        messages.append({"role": "persona", "text": pa, "meta": {"question": qtext, "section": q["section"]}, "ts": datetime.utcnow().isoformat(), "all_info": all_info, "all_info_raw": all_info_raw})

    async with AsyncSession(async_engine) as session:
        iv = Interview(
            id=generate_id(),
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            persona_id=persona_id,
            messages=messages,
            generated_answers=gen_map,
            created_by=user_id
        )
        session.add(iv)
        await session.commit()
        await session.refresh(iv)
        return _map_interview_row_to_out(iv)


async def add_interview_message(
    interview_id: str, 
    role: str, 
    text: str, 
    meta: Optional[dict] = None
) -> Optional[InterviewOut]:
    """Add a single message to interview (for non-user messages or when no persona)"""
    async with AsyncSession(async_engine) as session:
        query = select(Interview).where(Interview.id == interview_id)
        res = await session.execute(query)
        iv = res.scalars().first()
        if not iv:
            return None
        iv.messages.append({
            "role": role, 
            "text": text, 
            "meta": meta or {}, 
            "ts": datetime.utcnow().isoformat()
        })
        session.add(iv)
        await session.commit()
        await session.refresh(iv)
        return _map_interview_row_to_out(iv)


async def add_user_message_and_get_persona_reply(
    interview_id: str, 
    user_text: str, 
    meta: Optional[dict] = None
) -> Optional[InterviewOut]:
    """
    Add user message and generate persona reply in a single transaction.
    This ensures both messages are saved together atomically.
    """
    from sqlalchemy.orm.attributes import flag_modified
    
    async with AsyncSession(async_engine) as session:
        query = select(Interview).where(Interview.id == interview_id)
        res = await session.execute(query)
        iv = res.scalars().first()
        
        if not iv:
            return None
        
        user_msg = {
            "role": "user", 
            "text": user_text, 
            "meta": meta or {}, 
            "ts": datetime.utcnow().isoformat()
        }
        iv.messages.append(user_msg)
        
        if iv.persona_id:
            persona_obj = await get_persona(iv.persona_id)
            persona_json = _safe_json(persona_obj) if persona_obj else "{}"
            
            conversation_history = ""
            if len(iv.messages) > 1:
                recent_messages = iv.messages[-6:]
                history_lines = []
                for msg in recent_messages:
                    role = msg.get("role", "")
                    text = msg.get("text", "")
                    if role == "user":
                        history_lines.append(f"Interviewer: {text}")
                    elif role == "persona":
                        history_lines.append(f"You: {text}")
                conversation_history = "\n".join(history_lines)
            
            from app.services.exploration import get_exploration
            research_context = ""
            try:
                async with AsyncSession(async_engine) as exp_session:
                    exploration = await get_exploration(exp_session, iv.exploration_id)
                    if exploration and exploration.description:
                        research_context = exploration.description
            except Exception:
                pass
            
#             prompt = f"""
# You are role-playing as this persona in FIRST-PERSON for an in-depth interview.
#
# PERSONA DETAILS (this is YOU):
# {persona_json}
#
# RESEARCH OBJECTIVE:
# {research_context or "Understanding user perspectives and experiences"}
#
# CONVERSATION SO FAR:
# {conversation_history or "This is the start of the interview."}
#
# CURRENT QUESTION:
# {user_text}
#
# INSTRUCTIONS:
# - Answer in FIRST-PERSON using "I", "my", "me"
# - Give SPECIFIC, DETAILED answers based on YOUR persona traits, not generic responses
# - Reference your actual characteristics: age, occupation, lifestyle, values, experiences
# - If asked about preferences, explain WHY based on your personality and background
# - If asked about experiences, create realistic examples that fit your persona
# - Keep responses conversational and natural (2-4 sentences)
# - Stay consistent with what you've said earlier in the conversation
# - Be authentic to your persona's demographics, psychographics, and backstory
#
# EXAMPLES OF GOOD ANSWERS:
# Generic: "I like quality products."
# Specific: "As a 32-year-old environmental consultant, I prioritize sustainable products. I recently switched to a reusable water bottle brand that uses recycled materials - it costs more, but aligns with my values."
#
# Generic: "I use social media sometimes."
# Specific: "I'm on Instagram daily, mainly following eco-friendly brands and sustainability influencers. LinkedIn is where I network professionally, but I avoid Facebook - too much noise for my taste."
#
# Reply briefly (2-4 sentences) in first-person as this persona:
# """

    prompt = LIVE_REPLY_PROMPT.format(
        persona_json=persona_json,
        conversation_history=conversation_history,
        user_text=user_text
    )

    res_ai = await client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": "You are a qualitative research simulation engine."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.8
    )

    data = json.loads(res_ai.choices[0].message.content)
    persona_reply = data.get("response", "")
                
    persona_msg = {
        "role": "persona", 
        "text": persona_reply,
        "meta": {"reply_to": user_text}, 
        "ts": datetime.utcnow().isoformat()
    }
    iv.messages.append(persona_msg)
                
    flag_modified(iv, "messages")
                
    session.add(iv)
    await session.commit()
    await session.refresh(iv)
    return _map_interview_row_to_out(iv)

async def generate_persona_reply_and_store(interview_id: str, user_text: str):
    """
    DEPRECATED: Use add_user_message_and_get_persona_reply instead.
    This function only adds the persona reply, not the user message.
    """
    iv = await get_interview(interview_id)
    if not iv or not iv.persona_id:
        return None
    persona_obj = await get_persona(iv.persona_id)
    persona_json = _safe_json(persona_obj)

    prompt = f"""
You are role-playing this persona in first-person.

Persona:
{persona_json}

User asked:
{user_text}

Reply briefly (1-2 sentences) in first-person as that persona.
"""
    try:
        res = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role":"system","content":"You are a persona responder."},{"role":"user","content":prompt}]
        )
        reply = res.choices[0].message.content.strip()
    except Exception:
        reply = ""

    await add_interview_message(interview_id, "persona", reply, meta={"reply_to": user_text})
    return reply

async def get_interview(interview_id: str) -> Optional[InterviewOut]:
    async with AsyncSession(async_engine) as session:
        query = select(Interview).where(Interview.id == interview_id)
        res = await session.execute(query)
        iv = res.scalars().first()
        if not iv:
            return None
        return _map_interview_row_to_out(iv)

async def get_interview_by_persona(workspace_id: str, exploration_id: str, persona_id: str) -> Optional[InterviewOut]:
    """Return the most recent interview for a persona within an exploration (None if not found)."""
    async with AsyncSession(async_engine) as session:
        query = (
            select(Interview)
            .where(
                Interview.workspace_id == workspace_id,
                Interview.exploration_id == exploration_id,
                Interview.persona_id == persona_id,
            )
            .order_by(Interview.created_at.desc())
        )
        res = await session.execute(query)
        iv = res.scalars().first()
        if not iv:
            return None
        return _map_interview_row_to_out(iv)


async def list_interviews_for_objective(workspace_id: str, exploration_id: str) -> List[InterviewOut]:
    async with AsyncSession(async_engine) as session:
        query = select(Interview).where(
            Interview.workspace_id == workspace_id,
            Interview.exploration_id == exploration_id
        )
        res = await session.execute(query)
        rows = res.scalars().all()
        return [_map_interview_row_to_out(r) for r in rows]

async def save_interview_file(interview_id: str, stored_name: str, original_name: str, size: int, ctype: str):
    async with AsyncSession(async_engine) as session:
        f = InterviewFile(
            interview_id=interview_id,
            filename=stored_name,
            original_name=original_name,
            size=size,
            content_type=ctype
        )
        session.add(f)
        await session.commit()
        await session.refresh(f)
        return {
            "id": f.id, 
            "filename": f.filename, 
            "original_name": f.original_name, 
            "size": f.size, 
            "content_type": f.content_type, 
            "uploaded_at": f.uploaded_at
        }

# ── Upload-guide: file text extraction ───────────────────────────────────────

def _extract_text_from_upload(content: bytes, content_type: str, filename: str) -> str:
    """Extract plain text from an uploaded PDF / DOCX / XLSX guide file."""
    import io
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "pdf" or "pdf" in (content_type or ""):
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(io.BytesIO(content))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as exc:
            raise ValueError(f"Could not read PDF: {exc}") from exc

    if ext in ("docx", "doc") or "word" in (content_type or ""):
        try:
            from docx import Document as DocxDocument
            doc = DocxDocument(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        except Exception as exc:
            raise ValueError(f"Could not read Word document: {exc}") from exc

    if ext in ("xlsx", "xls") or "spreadsheet" in (content_type or "") or "excel" in (content_type or ""):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(content))
            lines = []
            for sheet in wb.worksheets:
                for row in sheet.iter_rows(values_only=True):
                    row_text = " | ".join(str(c) for c in row if c is not None)
                    if row_text.strip():
                        lines.append(row_text)
            return "\n".join(lines)
        except Exception as exc:
            raise ValueError(f"Could not read Excel file: {exc}") from exc

    raise ValueError("Unsupported file format. Please upload PDF, Word (.docx), or Excel (.xlsx).")


async def create_guide_from_text(
    workspace_id: str,
    exploration_id: str,
    user_id: str,
    raw_text: str,
) -> dict:
    """AI-parse extracted file text into guide sections/questions and store them."""
    prompt = (
        "The following is content from a discussion guide document.\n"
        "Extract the sections and questions from it and structure them as JSON.\n\n"
        f"CONTENT:\n{raw_text[:8000]}\n\n"
        "Return ONLY strict JSON:\n"
        '{ "sections": [ { "title": "Section name", "questions": ["Q1", "Q2"] } ] }\n\n'
        "Rules: use existing sections if present; group logically otherwise; "
        "2–6 questions per section; remove duplicates; ensure open-ended phrasing."
    )
    res = await client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You extract and structure discussion guide content."},
            {"role": "user", "content": prompt},
        ],
    )
    data = json.loads(res.choices[0].message.content)
    sections_data = data.get("sections", [])

    created_sections = []
    for sd in sections_data:
        section = await create_interview_section(
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            title=sd.get("title", "Untitled Section"),
            user_id=user_id,
            description="",
        )
        created_questions = []
        for qtext in sd.get("questions", []):
            q = await create_interview_question(section["id"], qtext, user_id)
            created_questions.append(q)
        section["questions"] = created_questions
        created_sections.append(section)

    return {"sections": created_sections, "message": "Guide created from uploaded file"}


# ── Run all interviews ────────────────────────────────────────────────────────

async def run_interviews_for_all_personas(
    workspace_id: str,
    exploration_id: str,
    user_id: str,
) -> dict:
    """
    Run interviews for every calibrated persona that doesn't have one yet.
    Idempotent: personas with existing interviews are skipped.
    """
    from sqlmodel import or_
    from app.models.persona import Persona

    guide_sections = await get_full_interview_guide(workspace_id, exploration_id)
    if not guide_sections:
        raise ValueError("No discussion guide found. Generate or upload a guide first.")

    sections_for_interview = [
        {"title": s["title"], "questions": [q["text"] for q in s.get("questions", [])]}
        for s in guide_sections
    ]

    async with AsyncSession(async_engine) as session:
        persona_r = await session.execute(
            select(Persona).where(
                Persona.exploration_id == exploration_id,
                or_(
                    Persona.calibration_status.is_(None),
                    Persona.calibration_status != "draft",
                ),
            )
        )
        personas = persona_r.scalars().all()

    ran, skipped = [], []
    for persona in personas:
        existing = await get_interview_by_persona(workspace_id, exploration_id, persona.id)
        if existing:
            skipped.append(persona.id)
            continue
        await start_interview(workspace_id, exploration_id, persona.id, user_id, sections_for_interview)
        ran.append(persona.id)

    return {"ran": ran, "skipped": skipped, "total": len(ran) + len(skipped)}


# ── Insight generation ────────────────────────────────────────────────────────

async def generate_verbatim_content(exploration_id: str) -> dict:
    """
    Format all interview answers as structured verbatim — no AI call.
    Groups responses by section → question → persona answers.
    """
    from app.services.auto_generated_persona import get_interviews_by_exploration_id

    interviews = await get_interviews_by_exploration_id(exploration_id)
    sections: dict = {}

    for iv in interviews:
        persona_id = iv.get("persona_id")
        msgs = iv.get("messages", [])
        for i, msg in enumerate(msgs):
            if msg.get("role") != "user":
                continue
            question = msg.get("text", "")
            section_name = (msg.get("meta") or {}).get("section", "General")
            answer = ""
            if i + 1 < len(msgs) and msgs[i + 1].get("role") == "persona":
                answer = msgs[i + 1].get("text", "")
            if not answer:
                continue
            sections.setdefault(section_name, {}).setdefault(question, []).append(
                {"persona_id": persona_id, "answer": answer}
            )

    return {
        "exploration_id": exploration_id,
        "type": "verbatim",
        "sections": [
            {
                "section": sname,
                "questions": [
                    {"question": q, "responses": responses}
                    for q, responses in qs.items()
                ],
            }
            for sname, qs in sections.items()
        ],
    }


async def generate_decision_intelligence_content(exploration_id: str) -> str:
    """
    AI-generate a Decision Intelligence report from interview data using Anthropic.
    Returns markdown string stored in ReportCache.content_md.
    """
    from app.utils.anthropic_client import get_async_anthropic_client
    from app.services.auto_generated_persona import get_interviews_by_exploration_id, get_description

    interviews = await get_interviews_by_exploration_id(exploration_id)
    ro = await get_description(exploration_id) or "Not specified"

    persona_summaries = []
    for iv in interviews:
        msgs = iv.get("messages", [])
        qa = []
        for i, msg in enumerate(msgs):
            if msg.get("role") == "user" and i + 1 < len(msgs):
                nxt = msgs[i + 1]
                if nxt.get("role") == "persona":
                    qa.append(f"Q: {msg.get('text', '')}\nA: {nxt.get('text', '')}")
        if qa:
            persona_summaries.append(
                f"Persona {iv.get('persona_id', 'Unknown')}:\n" + "\n".join(qa[:6])
            )

    prompt = (
        f"Research Objective:\n{ro}\n\n"
        f"Interview Excerpts:\n{chr(10).join(persona_summaries[:6])}\n\n"
        "Generate a Decision Intelligence report with these sections:\n"
        "## Key Decision Drivers\n"
        "## Decision Making Patterns\n"
        "## Priority Hierarchy\n"
        "## Trigger Points\n"
        "## Strategic Recommendations\n\n"
        "Be concise, direct, and decision-focused (600–900 words)."
    )

    anthropic_client = get_async_anthropic_client()
    response = await anthropic_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


async def export_insights_pdf(interview_id: str, out_path: Optional[str] = None) -> Optional[str]:
    iv = await get_interview(interview_id)
    if not iv:
        return None
    if not out_path:
        out_path = f"uploads/research/interview_{interview_id}.pdf"
    return generate_interview_pdf(iv, out_path)

async def export_all_interviews_pdf(workspace_id: str, objective_id: str, db:AsyncSession, out_path: Optional[str] = None) -> Optional[str]:
    interviews = await list_interviews_for_objective(workspace_id, objective_id)
    if not interviews:
        return None
    if not out_path:
        out_path = f"uploads/research/all_interviews_{objective_id}.pdf"

    persona_ids = {
        info.get("persona_id")
        for iv in interviews
        for info in iv.generated_answers.values()
        if  info.get("persona_id")

    }

    personas = await persona_service.get_personas_by_ids(list(persona_ids), db)

    persona_map = {p.id: p.name for p in personas}

    return await generate_combined_interviews_pdf(
        interviews,
        persona_map,
        objective_id,
        out_path
    )
