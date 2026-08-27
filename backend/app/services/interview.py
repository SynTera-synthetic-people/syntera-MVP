import json
import asyncio
import io
import logging
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
from app.config import OPENAI_API_KEY, settings
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
from app.neuro import service as neuro_service
from app.services.llm_usage_tracker import (
    record_llm_usage,
    extract_usage_openai_chat,
    extract_usage_anthropic_message,
)
from app.services.report_generation_qual_claude import generate_pdf_path, html_to_pdf, sanitize_report_text
from app.services.llm_json import (
    OPENAI_MAX_OUTPUT_TOKENS,
    LLMRequestTooLargeError,
    LLMResponseError,
    LLMTruncatedResponseError,
    call_json_object,
)
from html import escape as _html_escape


logger = logging.getLogger(__name__)

client = AsyncOpenAI(api_key=OPENAI_API_KEY)


class InterviewGenerationError(Exception):
    """Raised when persona answer generation fails in a way we cannot recover from.

    Carries `.message` so the router can map it onto `ErrorResponse`, matching
    how `WorkflowError` is already handled in routers/interview.py.
    """

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


# Questions per LLM call. BATCH_INTERVIEW_PROMPT mandates a 150-250 word
# `revised_persona_answer` plus a `response_structure` restating it, two score
# fields, `implications`, `stance_indicators`, `behavioral_signals` and
# `ebpb_anchors_used` for EVERY question — roughly 700 output tokens each.
# Against the model's 16,384-token output ceiling that allows ~23 answers, so
# sending a whole discussion guide in one call (the guide prompt asks for "at
# least 4 questions" per theme and caps neither themes nor questions) overflows
# the window on larger guides: the API returns HTTP 200 with
# finish_reason="length" and a truncated, unparseable payload.
#
# 8 keeps a batch near ~5,600 output tokens — ~2.9x headroom — so overflow
# cannot occur regardless of how large the guide grows.
INTERVIEW_BATCH_SIZE = 8

# Batches are independent LLM calls; run a few at once so splitting the work
# does not multiply wall-clock latency. Bounded to stay clear of rate limits.
_MAX_CONCURRENT_BATCHES = 3

# If a batch truncates anyway (an unusually verbose persona), halve it and
# retry the halves. Bounded so a pathological persona cannot fan out endlessly:
# depth 2 takes a batch of 8 down to 2.
_MAX_BATCH_SPLIT_DEPTH = 2


def _map_interview_row_to_out(i: Interview) -> InterviewOut:
    return InterviewOut(
        id=str(i.id),
        workspace_id=str(i.workspace_id),
        exploration_id=str(i.exploration_id),
        persona_id=str(i.persona_id) if i.persona_id else None,
        session_group_id=i.session_group_id,
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


async def _build_persona_json_with_digital_brain(persona_obj: dict, exploration_id: str) -> str:
    """
    Merge a persona's Digital Brain data (research_objective, brain_assignment,
    evidence, say_do_gap) as top-level keys into the persona JSON sent to the
    interview LLM, in addition to the existing EBPB fields already on
    persona_obj. brain_assignment/evidence/say_do_gap live inside the
    persona's persona_details JSONB blob (see manual_digital_brain_persona.py /
    digital_brain_pipeline.py) — older personas calibrated before Digital Brain
    existed simply won't have them, so every lookup defaults to {}/None rather
    than raising.
    """
    persona_data = dict(persona_obj or {})
    persona_details = persona_data.get("persona_details") or {}

    # Prefer the structured 12-component RO persisted at calibration/generation
    # time (digital_brain_pipeline.py / manual_digital_brain_persona.py). Fall
    # back to the free-text description for personas calibrated before that
    # was persisted.
    research_objective = persona_details.get("research_objective")
    if not research_objective:
        try:
            research_objective = await get_description(exploration_id) or ""
        except Exception:
            research_objective = ""

    persona_data["research_objective"] = research_objective
    persona_data["brain_assignment"] = persona_details.get("brain_assignment") or {}
    persona_data["evidence"] = persona_details.get("evidence") or {}
    persona_data["say_do_gap"] = persona_details.get("say_do_gap")

    return _safe_json(persona_data)


def _coerce_score(value: Any) -> Optional[float]:
    """Normalize model-provided score values to a 0-1 float."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text or text.lower() in {"na", "n/a", "none", "null"}:
            return None
        is_percent = text.endswith("%")
        text = text.rstrip("%").strip()
    else:
        text = value
        is_percent = False

    try:
        score = float(text)
    except (TypeError, ValueError):
        return None

    if score != score:
        return None
    if is_percent or score > 10:
        score = score / 100
    return max(0.0, min(1.0, score))


def _score_meta(source: Dict[str, Any]) -> Dict[str, float]:
    meta: Dict[str, float] = {}
    quality_score = _coerce_score(source.get("quality_score"))
    independence_score = _coerce_score(source.get("independence_score"))
    if quality_score is not None:
        meta["quality_score"] = quality_score
    if independence_score is not None:
        meta["independence_score"] = independence_score
    return meta


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
        await neuro_service.cache_interview_question_features(question.id, text)
        
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


def _build_discussion_guide_html(
    *,
    research_objective: str,
    sections: List[Dict],
) -> str:
    """Build the discussion guide body HTML — styled via app/css/report_generation.css
    (the same house style used by every other qual/quant PDF report) so this
    matches the rest of the Report Log instead of carrying its own look."""
    parts: List[str] = ['<h1>Discussion Guide</h1>']

    if research_objective:
        parts.append('<h3>Research Exploration</h3>')
        objective = _html_escape(sanitize_report_text(str(research_objective).strip()))
        parts.append(f'<p class="body-text">{objective}</p>')

    for section_index, section in enumerate(sections, start=1):
        title = _html_escape(sanitize_report_text(str(section.get("title") or "Untitled Section")))
        parts.append(f'<h2>{section_index}. {title}</h2>')

        questions = section.get("questions") or []
        if not questions:
            parts.append('<p class="body-text">No questions in this section.</p>')
            continue

        for question_index, question in enumerate(questions, start=1):
            text = _html_escape(sanitize_report_text(str(question.get("text") or "").strip()))
            parts.append(f'<p class="body-text"><strong>Q{question_index}.</strong> {text}</p>')

    return "\n".join(parts)


async def generate_discussion_guide_pdf(workspace_id: str, exploration_id: str) -> str:
    """Export the current discussion guide as a branded PDF. Returns the output file path."""
    sections = await get_full_interview_guide(workspace_id, exploration_id)
    if not sections:
        raise ValueError("No discussion guide found. Generate or upload a guide first.")

    research_objective = await get_description(exploration_id) or ""
    html_body = _build_discussion_guide_html(
        research_objective=research_objective,
        sections=sections,
    )
    out_path = generate_pdf_path(prefix="discussion_guide")
    return await asyncio.to_thread(
        html_to_pdf, html_body, out_path, "app/css/report_generation.css",
    )


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

async def _strip_questions_from_existing_interviews(
    workspace_id: str, exploration_id: str, question_texts: List[str]
) -> None:
    """
    Remove Q&A entries for now-deleted discussion-guide question(s) from every
    already-generated Interview snapshot for this exploration.

    Interview.messages/generated_answers are frozen at generation time and keyed
    by question TEXT (no question_id is stored on the message), so deleting the
    InterviewQuestion row alone leaves stale Q&A behind in any interview that
    already ran — this is what previously let deleted questions resurface in
    transcript exports. Called from delete_interview_question/_section so the
    scrub happens atomically with the guide edit.
    """
    if not question_texts:
        return

    from sqlalchemy.orm.attributes import flag_modified

    texts = set(question_texts)
    async with AsyncSession(async_engine) as session:
        result = await session.execute(
            select(Interview).where(
                Interview.workspace_id == workspace_id,
                Interview.exploration_id == exploration_id,
            )
        )
        interviews = result.scalars().all()

        for iv in interviews:
            changed = False

            if iv.generated_answers:
                for t in texts:
                    if t in iv.generated_answers:
                        del iv.generated_answers[t]
                        changed = True
                if changed:
                    flag_modified(iv, "generated_answers")

            if iv.messages:
                kept = [
                    msg for msg in iv.messages
                    if not (
                        (msg.get("role") == "user" and msg.get("text") in texts)
                        or (msg.get("role") == "persona" and (msg.get("meta") or {}).get("question") in texts)
                    )
                ]
                if len(kept) != len(iv.messages):
                    iv.messages = kept
                    flag_modified(iv, "messages")
                    changed = True

            if changed:
                session.add(iv)

        await session.commit()


async def delete_interview_section(section_id: str) -> bool:
    """Delete an interview section and all its questions, scrubbing their Q&A from existing interview transcripts"""
    async with AsyncSession(async_engine) as session:
        questions_query = select(InterviewQuestion).where(
            InterviewQuestion.section_id == section_id
        )
        questions_result = await session.execute(questions_query)
        questions = questions_result.scalars().all()
        question_texts = [q.text for q in questions]

        for question in questions:
            await session.delete(question)

        section_query = select(InterviewSection).where(InterviewSection.id == section_id)
        section_result = await session.execute(section_query)
        section = section_result.scalars().first()

        if not section:
            return False

        workspace_id = section.workspace_id
        exploration_id = section.exploration_id

        await session.delete(section)
        await session.commit()

    await _strip_questions_from_existing_interviews(workspace_id, exploration_id, question_texts)

    from app.services import report_orchestrator as report_cache
    await report_cache.invalidate_cache(exploration_id)

    return True

async def delete_interview_question(question_id: str) -> bool:
    """Delete a specific interview question, scrubbing its Q&A from existing interview transcripts"""
    async with AsyncSession(async_engine) as session:
        query = select(InterviewQuestion).where(InterviewQuestion.id == question_id)
        result = await session.execute(query)
        question = result.scalars().first()

        if not question:
            return False

        section_query = select(InterviewSection).where(InterviewSection.id == question.section_id)
        section = (await session.execute(section_query)).scalars().first()

        question_text = question.text
        workspace_id = section.workspace_id if section else None
        exploration_id = section.exploration_id if section else None

        await session.delete(question)
        await session.commit()

    if workspace_id and exploration_id:
        await _strip_questions_from_existing_interviews(workspace_id, exploration_id, [question_text])

        from app.services import report_orchestrator as report_cache
        await report_cache.invalidate_cache(exploration_id)

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
        await neuro_service.cache_interview_question_features(question.id, text)
        
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
        research_objective=research_objective,
        questions_per_section=settings.DG_DEFAULT_QUESTIONS_PER_SECTION,
        max_sections=settings.DG_MAX_SECTIONS_PER_GUIDE,
    )

    res = await client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={"type": "json_object"},
        messages=[
            {"role":"system","content":"You generate discussion guides."},
            {"role":"user","content":prompt}
        ]
    )
    input_tokens, output_tokens, usage_raw = extract_usage_openai_chat(res)
    await record_llm_usage(
        exploration_id=exploration_id,
        stage="interview_guide",
        provider="openai",
        model="gpt-4o-mini",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        usage_raw=usage_raw,
        workspace_id=workspace_id,
        created_by=user_id,
    )
    raw = res.choices[0].message.content

    data = raw if isinstance(raw, (dict, list)) else json.loads(raw)
    sections_data = data.get("sections", [])

    # The prompt asks for a fixed shape, but the model is not a contract — trim
    # to the configured limits here so guide size (and therefore interview cost,
    # which scales with ceil(questions / INTERVIEW_BATCH_SIZE) per persona) is
    # bounded no matter what comes back. Trimming is deliberate: a section that
    # arrives with 7 questions keeps its first 4, leaving room for the 2 a user
    # may add without ever exceeding DG_MAX_QUESTIONS_PER_SECTION.
    if len(sections_data) > settings.DG_MAX_SECTIONS_PER_GUIDE:
        logger.info(
            "Discussion guide generation returned %d sections; trimming to %d "
            "[exploration_id=%s]",
            len(sections_data), settings.DG_MAX_SECTIONS_PER_GUIDE, exploration_id,
        )
        sections_data = sections_data[: settings.DG_MAX_SECTIONS_PER_GUIDE]

    created_sections = []
    for section_data in sections_data:
        section = await create_interview_section(
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            title=section_data.get("title", "Untitled Section"),
            user_id=user_id,
            description=section_data.get("theme_description", "")
        )

        question_texts = list(section_data.get("questions", []) or [])
        if len(question_texts) > settings.DG_DEFAULT_QUESTIONS_PER_SECTION:
            logger.info(
                "Discussion guide section returned %d questions; trimming to %d "
                "[exploration_id=%s section=%r]",
                len(question_texts), settings.DG_DEFAULT_QUESTIONS_PER_SECTION,
                exploration_id, section_data.get("title"),
            )
            question_texts = question_texts[: settings.DG_DEFAULT_QUESTIONS_PER_SECTION]

        created_questions = []
        for question_text in question_texts:
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

async def create_conversation_session(
    workspace_id: str,
    exploration_id: str,
    persona_id: Optional[str],
    user_id: str,
    session_group_id: Optional[str] = None,
) -> InterviewOut:
    """
    Create a lightweight interview record for Conversation Studio.
    No LLM batch generation — the session is empty and ready for
    free-form user messages handled by add_user_message_and_get_persona_reply.

    session_group_id ties several per-persona interviews (one per persona)
    into a single "All Personas" session for history grouping.
    """
    async with AsyncSession(async_engine) as session:
        iv = Interview(
            id=generate_id(),
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            persona_id=persona_id,
            session_group_id=session_group_id,
            messages=[{"role": "system", "text": "Conversation Studio session", "ts": datetime.utcnow().isoformat()}],
            generated_answers={},
            created_by=user_id,
        )
        session.add(iv)
        await session.commit()
        await session.refresh(iv)
        return _map_interview_row_to_out(iv)


_QUESTION_KEY_RE = re.compile(r"[^a-z0-9]+")


def _normalize_question(text: Any) -> str:
    """Collapse a question to a comparison key.

    The model routinely echoes a question back reworded or repunctuated (see the
    "Model reworded N/63 questions" log line), so answers are matched on a
    case- and punctuation-insensitive key rather than on exact equality.
    """
    return _QUESTION_KEY_RE.sub(" ", str(text or "").lower()).strip()


def _has_answer(entry: Any) -> bool:
    """True only when the model actually produced answer text for this entry.

    An answer object present but carrying an empty `revised_persona_answer` is
    treated as missing — that is precisely the case recovery exists to fix.
    """
    return bool(
        isinstance(entry, dict)
        and str(entry.get("revised_persona_answer") or "").strip()
    )


def _align_answers(
    questions: List[Dict],
    answers: List[Any],
) -> tuple[List[Optional[dict]], List[int]]:
    """Map returned answers onto the questions that were actually asked.

    Returns `(aligned, missing_indices)` — `aligned` has exactly one slot per
    question holding the matching answer or None.

    Two deterministic passes:
      1. Match on the normalized question the model echoed back. This survives
         answers arriving out of order, and gives each occurrence of a
         duplicated question text its own slot.
      2. Assign whatever is left over to the still-empty slots, in order. This
         catches answers whose echoed question was reworded past recognition.

    An answer whose question matches a slot that is already filled is DISCARDED,
    not reused elsewhere: attaching one question's answer to a different
    question is a worse outcome than leaving a blank.
    """
    aligned: List[Optional[dict]] = [None] * len(questions)

    slots_by_key: Dict[str, List[int]] = {}
    for idx, q in enumerate(questions):
        slots_by_key.setdefault(_normalize_question(q.get("question")), []).append(idx)

    unmatched: List[dict] = []
    for entry in answers:
        if not _has_answer(entry):
            continue
        key = _normalize_question(entry.get("question"))
        if key in slots_by_key:
            slots = slots_by_key[key]
            if slots:
                aligned[slots.pop(0)] = entry
            # else: the model answered this same question more than once and
            # every slot for it is taken. Discard the surplus — letting it fall
            # through to the positional pass would staple one question's answer
            # onto a different, unrelated question.
            continue
        # Echoed a question we don't recognise — reworded past matching. Hold it
        # for the positional pass rather than dropping a real answer.
        unmatched.append(entry)

    free_slots = [i for i, v in enumerate(aligned) if v is None]
    for slot, entry in zip(free_slots, unmatched):
        aligned[slot] = entry

    return aligned, [i for i, v in enumerate(aligned) if v is None]


async def _request_answers(
    questions: List[Dict],
    persona_json: str,
    *,
    workspace_id: str,
    exploration_id: str,
    persona_id: Optional[str],
    user_id: str,
    operation: str,
    max_attempts: int = 2,
) -> List[Any]:
    """Issue one generation request and return its raw `answers` array.

    Shared by the primary batch request and the recovery follow-up so both are
    guaranteed to carry byte-identical persona and interview context — the
    recovery differs only in which questions it asks.
    """
    prompt = BATCH_INTERVIEW_PROMPT.format(
        persona_json=persona_json,
        flat_questions=json.dumps(questions, indent=2),
        question_count=len(questions),
    )

    data = await call_json_object(
        client,
        model="gpt-4o-mini",
        stage="interview_run",
        operation=operation,
        max_tokens=OPENAI_MAX_OUTPUT_TOKENS,
        max_attempts=max_attempts,
        messages=[
            {
                "role": "system",
                "content": "You are a qualitative research simulation engine.",
            },
            {"role": "user", "content": prompt},
        ],
        usage={
            "exploration_id": exploration_id,
            "workspace_id": workspace_id,
            "persona_id": persona_id,
            "created_by": user_id,
        },
    )

    answers = data.get("answers")
    if not isinstance(answers, list):
        logger.error(
            "Interview batch response missing 'answers' array [exploration_id=%s "
            "persona_id=%s operation=%s keys=%s]",
            exploration_id, persona_id, operation, sorted(data.keys())[:10],
        )
        raise InterviewGenerationError(
            "The AI service returned an unexpected response format while generating "
            "interview answers. Please try again."
        )
    return answers


async def _recover_missing_answers(
    batch: List[Dict],
    aligned: List[Optional[dict]],
    missing: List[int],
    persona_json: str,
    *,
    workspace_id: str,
    exploration_id: str,
    persona_id: Optional[str],
    user_id: str,
) -> int:
    """Re-ask ONLY the unanswered questions, once. Returns how many were filled.

    Bounded by construction: exactly one request, `max_attempts=1` so the helper
    cannot retry underneath us either, and no recursion. Any failure is
    swallowed — recovery is best-effort, and a failed follow-up must never cost
    the caller the answers it already has.

    `aligned` is mutated in place at the missing slots only; questions that
    already have answers are never regenerated.
    """
    retry_questions = [batch[i] for i in missing]

    try:
        raw = await _request_answers(
            retry_questions,
            persona_json,
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            persona_id=persona_id,
            user_id=user_id,
            operation="interview_batch_recovery",
            max_attempts=1,
        )
    except (InterviewGenerationError, LLMResponseError) as exc:
        logger.warning(
            "Interview answer recovery request failed; leaving %d question(s) blank "
            "[exploration_id=%s persona_id=%s error=%s]",
            len(missing), exploration_id, persona_id, type(exc).__name__,
        )
        return 0

    recovered_aligned, _ = _align_answers(retry_questions, raw)
    recovered = 0
    for slot, entry in zip(missing, recovered_aligned):
        if entry is not None:
            aligned[slot] = entry
            recovered += 1
    return recovered


async def _generate_answer_batch(
    batch: List[Dict],
    persona_json: str,
    *,
    workspace_id: str,
    exploration_id: str,
    persona_id: Optional[str],
    user_id: str,
    depth: int = 0,
) -> List[Dict]:
    """Generate persona answers for one batch of questions.

    Returns exactly `len(batch)` entries, positionally aligned with `batch`, so
    callers can concatenate batches and keep global question order.

    Answers are matched back to their questions by content (see
    `_align_answers`). Any question the model skipped gets exactly ONE follow-up
    request asking for those questions alone; whatever is still missing after
    that stays blank and the interview continues.

    On truncation the batch is halved and the halves retried (bounded by
    `_MAX_BATCH_SPLIT_DEPTH`); any other unusable response raises
    `InterviewGenerationError`.
    """
    try:
        answers = await _request_answers(
            batch,
            persona_json,
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            persona_id=persona_id,
            user_id=user_id,
            operation="interview_batch",
        )
    except LLMTruncatedResponseError:
        # The persona wrote far longer answers than the batch size budgeted for.
        # Splitting is the only recovery that changes the outcome — retrying the
        # same request would overflow the output window identically.
        if len(batch) > 1 and depth < _MAX_BATCH_SPLIT_DEPTH:
            mid = len(batch) // 2
            logger.warning(
                "Interview batch truncated; splitting %d questions into %d+%d "
                "[exploration_id=%s persona_id=%s depth=%d]",
                len(batch), mid, len(batch) - mid, exploration_id, persona_id, depth,
            )
            halves = await asyncio.gather(
                _generate_answer_batch(
                    batch[:mid], persona_json,
                    workspace_id=workspace_id, exploration_id=exploration_id,
                    persona_id=persona_id, user_id=user_id, depth=depth + 1,
                ),
                _generate_answer_batch(
                    batch[mid:], persona_json,
                    workspace_id=workspace_id, exploration_id=exploration_id,
                    persona_id=persona_id, user_id=user_id, depth=depth + 1,
                ),
            )
            return [*halves[0], *halves[1]]
        raise InterviewGenerationError(
            "The AI could not fit its answers within the response limit, even for a "
            "single question. Try shortening the questions in your discussion guide."
        )
    except LLMRequestTooLargeError as exc:
        # Input-side overflow: the persona's context is too big for the model,
        # so splitting the batch cannot help — the questions are a rounding
        # error next to the persona payload. Fail with a message that points at
        # the actual cause instead of inviting a pointless retry.
        logger.error(
            "Interview prompt exceeded the model context window [exploration_id=%s "
            "persona_id=%s questions=%d] %s",
            exploration_id, persona_id, len(batch), exc.raw_excerpt,
        )
        raise InterviewGenerationError(
            "This persona carries too much calibration evidence to fit in one AI "
            "request. Re-calibrating the persona or reducing its evidence will resolve it."
        ) from exc
    except LLMResponseError as exc:
        logger.error(
            "Interview batch generation failed [exploration_id=%s persona_id=%s "
            "questions=%d error=%s]",
            exploration_id, persona_id, len(batch), type(exc).__name__,
        )
        raise InterviewGenerationError(
            "The AI service returned an unusable response while generating interview "
            "answers. Please try again."
        ) from exc

    aligned, missing = _align_answers(batch, answers)
    returned = sum(1 for a in aligned if a is not None)

    recovered = 0
    if missing:
        # Exactly one follow-up per batch, asking only for what is missing.
        recovered = await _recover_missing_answers(
            batch,
            aligned,
            missing,
            persona_json,
            workspace_id=workspace_id,
            exploration_id=exploration_id,
            persona_id=persona_id,
            user_id=user_id,
        )

    unanswered = sum(1 for a in aligned if a is None)
    if missing:
        log = logger.warning if unanswered else logger.info
        log(
            "Interview batch answers [exploration_id=%s persona_id=%s requested=%d "
            "returned=%d recovered=%d unanswered=%d]",
            exploration_id, persona_id, len(batch), returned, recovered, unanswered,
        )

    return [a if isinstance(a, dict) else {} for a in aligned]


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
    persona_json = (
        await _build_persona_json_with_digital_brain(persona_obj, exploration_id)
        if persona_obj else "{}"
    )


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

    if not flat_questions:
        raise InterviewGenerationError(
            "The discussion guide has no questions to ask. Add questions to the guide "
            "before starting an interview."
        )

    # Generate in bounded batches rather than one call per interview — see
    # INTERVIEW_BATCH_SIZE for why a whole guide cannot fit in one completion.
    batches = [
        flat_questions[i : i + INTERVIEW_BATCH_SIZE]
        for i in range(0, len(flat_questions), INTERVIEW_BATCH_SIZE)
    ]
    logger.info(
        "Generating interview answers [exploration_id=%s persona_id=%s questions=%d "
        "batches=%d]",
        exploration_id, persona_id, len(flat_questions), len(batches),
    )

    semaphore = asyncio.Semaphore(_MAX_CONCURRENT_BATCHES)

    async def _run(batch: List[Dict]) -> List[Dict]:
        async with semaphore:
            return await _generate_answer_batch(
                batch,
                persona_json,
                workspace_id=workspace_id,
                exploration_id=exploration_id,
                persona_id=persona_id,
                user_id=user_id,
            )

    # gather preserves input order, so concatenating the results keeps answers
    # aligned with flat_questions even though the calls run concurrently.
    batch_results = await asyncio.gather(*(_run(b) for b in batches))
    answers = [answer for result in batch_results for answer in result]

    # Record one shadow affect computation per question.
    # record_interview_shadow_turns never raises and is a no-op when the
    # neuro flag is off, so the interview flow is unaffected either way.
    await neuro_service.record_interview_shadow_turns(
        workspace_id=workspace_id,
        exploration_id=exploration_id,
        persona_id=persona_id,
        question_texts=[q["question"] for q in flat_questions],
        persona=persona_obj,
    )


    # `generated_answers` is the ONLY source every transcript view enumerates —
    # the preview endpoint (routers/interview.py), the combined PDF
    # (utils/interview.py) and the traceability report all iterate its keys. A
    # guide question that is not a key here is simply invisible in the
    # transcript, with no error anywhere.
    #
    # So the map is built by walking flat_questions — the guide's own list — and
    # keyed by the guide's canonical question text. Keying off the model's
    # echoed "question" field (as this previously did) dropped questions three
    # ways: a short answers array left later questions with no key at all; a
    # paraphrased echo created a key no consumer could match back to the guide;
    # and two identical echoes silently overwrote each other.
    gen_map: Dict[str, dict] = {}
    answer_infos: List[dict] = []
    paraphrased = 0

    for idx, q in enumerate(flat_questions):
        qtext = q["question"]
        a = answers[idx] if idx < len(answers) else {}

        echoed = (a.get("question") or "").strip()
        if echoed and echoed != qtext:
            paraphrased += 1

        answer_info = {
            "persona_answer": a.get("revised_persona_answer", ""),
            "implications": a.get("implications", []),
            "persona_id": persona_id,
            "quality_score": _coerce_score(a.get("quality_score")),
            "independence_score": _coerce_score(a.get("independence_score")),
            "stance_indicators": a.get("stance_indicators", []),
            "behavioral_signals": a.get("behavioral_signals", {}),
            # Both transcript builders read meta_section to group answers, and
            # otherwise fall back to scanning `messages` for a matching question
            # — bucketing under "General" when that scan misses. The section is
            # known right here, so record it and make the fallback unnecessary.
            "meta_section": q["section"],
        }

        # generated_answers is Dict[question_text, answer] by schema, so a guide
        # that asks the exact same question in two sections can only keep one of
        # them. Log it rather than let the transcript quietly come up short.
        if qtext in gen_map:
            logger.warning(
                "Duplicate question text in discussion guide; transcript will show it "
                "once [exploration_id=%s persona_id=%s section=%r question=%.80r]",
                exploration_id, persona_id, q["section"], qtext,
            )

        gen_map[qtext] = answer_info
        answer_infos.append(answer_info)

    unanswered = sum(1 for info in answer_infos if not info["persona_answer"])
    if unanswered:
        logger.warning(
            "Interview transcript has %d/%d questions with no answer "
            "[exploration_id=%s persona_id=%s]",
            unanswered, len(flat_questions), exploration_id, persona_id,
        )
    if paraphrased:
        logger.info(
            "Model reworded %d/%d questions; transcript uses the guide's wording "
            "[exploration_id=%s persona_id=%s]",
            paraphrased, len(flat_questions), exploration_id, persona_id,
        )

    messages = []
    messages.append({"role": "system", "text": "Interview started", "ts": datetime.utcnow().isoformat()})
    for idx, q in enumerate(flat_questions):
        qtext = q["question"]
        messages.append({"role": "user", "text": qtext, "meta": {"section": q["section"]}, "ts": datetime.utcnow().isoformat()})
        # Positional, not gen_map.get(qtext): answer_infos is built one entry per
        # flat_questions entry, so it stays exact even when the guide repeats a
        # question text (which collapses to a single gen_map key).
        answer_info = answer_infos[idx]
        pa = answer_info.get("persona_answer", "")
        all_info = answer_info.get("all_info", "")
        all_info_raw = answer_info.get("all_info_raw", "")
        answer_meta = {
            "question": qtext,
            "section": q["section"],
            **_score_meta(answer_info),
        }
        messages.append({"role": "persona", "text": pa, "meta": answer_meta, "ts": datetime.utcnow().isoformat(), "all_info": all_info, "all_info_raw": all_info_raw})

    async with AsyncSession(async_engine) as session:
        # Replace any prior batch-guide interview for this persona so re-running
        # (e.g. after editing the discussion guide) never leaves a stale row
        # behind — otherwise its old Q&A (possibly for since-deleted questions)
        # can resurface in transcripts. Conversation Studio sessions are left
        # alone: they carry a different first system message and aren't guide-driven.
        if persona_id:
            existing_result = await session.execute(
                select(Interview).where(
                    Interview.workspace_id == workspace_id,
                    Interview.exploration_id == exploration_id,
                    Interview.persona_id == persona_id,
                )
            )
            for old in existing_result.scalars().all():
                first_msg = old.messages[0] if old.messages else {}
                if first_msg.get("text") == "Interview started":
                    await session.execute(delete(InterviewFile).where(InterviewFile.interview_id == old.id))
                    await session.delete(old)

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
            persona_json = (
                await _build_persona_json_with_digital_brain(persona_obj, iv.exploration_id)
                if persona_obj else "{}"
            )

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

            prompt = LIVE_REPLY_PROMPT.format(
                persona_json=persona_json,
                research_context=research_context or "Not specified",
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
            # Recorded after the final (non-streaming) response is obtained —
            # this call has no streaming loop, so there is no added latency
            # on any token stream.
            input_tokens, output_tokens, usage_raw = extract_usage_openai_chat(res_ai)
            await record_llm_usage(
                exploration_id=iv.exploration_id,
                stage="interview_conversation_studio",
                provider="openai",
                model="gpt-4o-mini",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                usage_raw=usage_raw,
                workspace_id=iv.workspace_id,
                persona_id=iv.persona_id,
            )

            if iv.persona_id:
                await neuro_service.record_live_reply_shadow_turn(
                    workspace_id=iv.workspace_id,
                    exploration_id=iv.exploration_id,
                    persona_id=iv.persona_id,
                    question_text=user_text,
                    persona=persona_obj,
                )

            data = json.loads(res_ai.choices[0].message.content)
            persona_reply = data.get("response", "")
            reply_meta = {
                "reply_to": user_text,
                **_score_meta(data),
            }

            persona_msg = {
                "role": "persona",
                "text": persona_reply,
                "meta": reply_meta,
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


async def delete_interview(workspace_id: str, exploration_id: str, interview_id: str) -> bool:
    async with AsyncSession(async_engine) as session:
        result = await session.execute(
            select(Interview).where(
                Interview.id == interview_id,
                Interview.workspace_id == workspace_id,
                Interview.exploration_id == exploration_id,
            )
        )
        iv = result.scalars().first()
        if not iv:
            return False
        await session.delete(iv)
        await session.commit()
        return True


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
    try:
        data = await call_json_object(
            client,
            model="gpt-4o-mini",
            stage="interview_guide_upload_parse",
            messages=[
                {"role": "system", "content": "You extract and structure discussion guide content."},
                {"role": "user", "content": prompt},
            ],
            usage={
                "exploration_id": exploration_id,
                "workspace_id": workspace_id,
                "created_by": user_id,
            },
        )
    except LLMResponseError as exc:
        logger.error(
            "Guide upload parse failed [exploration_id=%s error=%s]",
            exploration_id, type(exc).__name__,
        )
        raise InterviewGenerationError(
            "Could not read a discussion guide out of that file. Please check the "
            "document and try again."
        ) from exc

    sections_data = data.get("sections") or []

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
    input_tokens, output_tokens, usage_raw = extract_usage_anthropic_message(response)
    await record_llm_usage(
        exploration_id=exploration_id,
        stage="interview_insights_di",
        provider="anthropic",
        model="claude-sonnet-4-6",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        usage_raw=usage_raw,
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
