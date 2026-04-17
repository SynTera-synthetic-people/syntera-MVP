import json
import re
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlmodel import select
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