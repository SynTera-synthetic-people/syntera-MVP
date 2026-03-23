import asyncio
import json
import os
import uuid
from collections import Counter
from datetime import datetime
from dotenv import load_dotenv
from openai import AsyncOpenAI
from openai import OpenAI
from sqlalchemy import (
    MetaData,
    Table,
    Column,
    String,
    insert,
    Text,
    select,
    Boolean,
    JSON,
)
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import declarative_base
from sqlmodel import select
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse

from app.db import async_engine
from app.models.persona import Persona
from app.utils.id_generator import generate_id
from types import SimpleNamespace

from app.services.auto_generated_persona_prompts import (
    PERSONA_GENERATION_PROMPT,
    ADD_QUESTION_VALIDATOR_PROMPT,
    MODIFY_QUESTION_VALIDATOR_PROMPT,
    DELETE_QUESTION_VALIDATOR_PROMPT
)

load_dotenv()

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
DATABASE_URL = os.getenv("DATABASE_URL")

async def get_interviews_by_exploration_id(
    exploration_id: str,
) -> List[Dict[str, Any]]:

    Base = declarative_base()

    class Interview(Base):
        __tablename__ = "interview"

        id = Column(String, primary_key=True)
        exploration_id = Column(String)
        persona_id = Column(String)
        messages = Column(JSON)

    engine = create_async_engine(DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionLocal() as session:
        result = await session.execute(
            select(
                Interview.id,
                Interview.persona_id,
                Interview.messages
            ).where(
                Interview.exploration_id == exploration_id
            ).order_by(Interview.id.asc())
        )

        rows = result.all()

    await engine.dispose()

    # Convert rows → list of dicts (LLM / pipeline friendly)
    return [
        {
            "interview_id": row.id,
            "persona_id": row.persona_id,
            "messages": row.messages
        }
        for row in rows
    ]

async def get_persona_details(persona_id: str) -> Optional[Dict[str, Any]]:

    engine = create_async_engine(DATABASE_URL, echo=False)
    metadata = MetaData()

    async with engine.connect() as conn:
        persona_table = await conn.run_sync(
            lambda sync_conn: Table(
                "persona",
                metadata,
                autoload_with=sync_conn
            )
        )

    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionLocal() as session:
        result = await session.execute(
            select(persona_table).where(persona_table.c.id == persona_id)
        )
        row = result.mappings().first()

    await engine.dispose()

    if not row:
        return None

    return row.get("persona_details")


async def get_description(exploration_id: str) -> str | None:

    Base = declarative_base()

    class Exploration(Base):
        __tablename__ = "research_objectives"
        exploration_id = Column(String, primary_key=True)
        description = Column(Text)

    engine = create_async_engine(DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionLocal() as session:
        result = await session.execute(
            select(Exploration.description).where(
                Exploration.exploration_id == exploration_id
            )
        )

    await engine.dispose()
    return result.scalar_one_or_none()

async def get_all_questions_by_section_id(section_id: str):
    Base = declarative_base()
    engine = create_async_engine(DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    class Question(Base):
        __tablename__ = "interviewquestion"

        id = Column(String, primary_key=True)
        section_id = Column(String)
        text = Column(Text)  # ✅ FIX

    class Section(Base):
        __tablename__ = "interviewsection"

        id = Column(String, primary_key=True)
        description = Column(Text)

    async with SessionLocal() as session:
        # Get all questions
        result = await session.execute(
            select(Question.text)
            .where(Question.section_id == section_id)
            .order_by(Question.id)
        )
        questions = result.scalars().all()

        # Get theme description
        result = await session.execute(
            select(Section.description)
            .where(Section.id == section_id)
        )
        section_description = result.scalar_one_or_none()

    await engine.dispose()
    return questions, section_description


async def get_section_description_by_question_id(question_id: str):
    Base = declarative_base()

    class Question(Base):
        __tablename__ = "interviewquestion"

        id = Column(String, primary_key=True)
        section_id = Column(String)
        text = Column(Text)  # ✅ FIX

    class Section(Base):
        __tablename__ = "interviewsection"

        id = Column(String, primary_key=True)
        description = Column(Text)

    engine = create_async_engine(DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with SessionLocal() as session:
        # 1️⃣ Get section_id + question text
        result = await session.execute(
            select(Question.section_id, Question.text)
            .where(Question.id == question_id)
        )

        row = result.one_or_none()
        if not row:
            await engine.dispose()
            return None, None, None, []

        section_id, question_text = row

        # 2️⃣ Get section description
        result = await session.execute(
            select(Section.description)
            .where(Section.id == section_id)
        )
        section_description = result.scalar_one_or_none()

        # 3️⃣ Get all questions in section
        result = await session.execute(
            select(Question.text)
            .where(Question.section_id == section_id)
            .order_by(Question.id)
        )
        all_question_texts = result.scalars().all()

    await engine.dispose()
    return section_description, section_id, question_text, all_question_texts


async def ai_generate_persona(exploration_id, workspace_id, current_user_id):
    description = await get_description(exploration_id)

    prompt = PERSONA_GENERATION_PROMPT.format(
    research_objective=description
)

    response = await client.responses.create(
        model="gpt-5",
        reasoning={"effort": "low"},
        tools=[
            {
                "type": "web_search",
                "filters": {
                    "allowed_domains": [
                        "www.quora.com",
                        "www.reddit.com",
                        "www.youtube.com",
                        "x.com",
                        "www.capterra.in",
                        "www.linkedin.com",
                        "medium.com",
                    ]
                },
            }
        ],
        input=[{"role": "user", "content": f"{prompt}"}],
    )
    response_text = response.output_text

    data = json.loads(response_text)
    customer_personas = data.get("consumer_personas", "")
    response = {"personas": []}
    if customer_personas:
        for persona in customer_personas:
            persona["auto_generated_persona"] = True
            reference_sites = persona["reference_sites_with_usage"]
            site_counter = dict(
                Counter(urlparse(url).netloc for url in reference_sites)
            )
            persona["researched_sites"] = site_counter

            data = SimpleNamespace(**persona)
            persona_id = generate_id()
            persona["id"] = persona_id

            async with AsyncSession(async_engine) as session:
                p = Persona(
                    id=persona_id,
                    exploration_id=exploration_id,
                    workspace_id=workspace_id,
                    name=getattr(data, "name", ""),
                    age_range=getattr(data, "age_range", ""),
                    gender=getattr(data, "gender", ""),
                    location_country=getattr(data, "location_country", ""),
                    location_state=getattr(data, "location_state", ""),
                    education_level=getattr(data, "education_level", ""),
                    occupation=getattr(data, "occupation", ""),
                    income_range=getattr(data, "income_range", ""),
                    family_size=getattr(data, "family_size", ""),
                    geography=getattr(data, "geography", ""),
                    lifestyle=getattr(data, "lifestyle", ""),
                    values=getattr(data, "values", ""),
                    personality=getattr(data, "personality", ""),
                    interests=getattr(data, "interests", ""),
                    motivations=getattr(data, "motivations", ""),
                    brand_sensitivity=getattr(data, "brand_sensitivity", ""),
                    price_sensitivity=getattr(data, "price_sensitivity", ""),
                    mobility=getattr(data, "mobility", ""),
                    accommodation=getattr(data, "accommodation", ""),
                    marital_status=getattr(data, "marital_status", ""),
                    daily_rhythm=getattr(data, "daily_rhythm", ""),
                    hobbies=getattr(data, "hobbies", ""),
                    professional_traits=getattr(data, "professional_traits", ""),
                    digital_activity=getattr(data, "digital_activity", ""),
                    preferences=getattr(data, "preferences", ""),
                    backstory=getattr(data, "backstory", ""),
                    created_by=current_user_id,
                    persona_details=persona,
                    auto_generated_persona=True,
                )

                session.add(p)
                await session.commit()
                await session.refresh(p)

            response["personas"].append(
                {
                    "id": persona["id"],
                    "workspace_id": workspace_id,
                    "exploration_id": exploration_id,
                    "name": persona["name"],
                    "auto_generated_persona": True,
                    "persona_details": persona,
                }
            )
    return response

async def _run_validator(prompt: str):
    res = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "You are a qualitative research design validator."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    )
    response_text = res.choices[0].message.content.strip()
    response_json = json.loads(response_text)
    result = response_json.get("result", {})
    return result.get("valid_or_not"), result.get("validation_reason")

async def validate_new_question_against_theme(section_id, payload):
    existing_questions, theme_description = await get_all_questions_by_section_id(section_id)
    research_objective_description = await get_description(payload.exploration_id)
    user_question = payload.text

    prompt = ADD_QUESTION_VALIDATOR_PROMPT.format(
        research_objective_description=research_objective_description,
        theme_description=theme_description,
        existing_questions=existing_questions,
        user_question=user_question
    )
    return await _run_validator(prompt)


async def validate_existing_question(question_id, payload):
    theme_description, section_id, question_text, existing_questions = \
        await get_section_description_by_question_id(question_id)
    research_objective_description = await get_description(payload.exploration_id)
    modified_question = payload.text

    prompt = MODIFY_QUESTION_VALIDATOR_PROMPT.format(
        research_objective_description=research_objective_description,
        theme_description=theme_description,
        question_text=question_text,
        modified_question=modified_question
    )
    return await _run_validator(prompt)


async def validate_deleted_question(question_id, payload):
    theme_description, section_id, question_text, existing_questions = \
        await get_section_description_by_question_id(question_id)
    research_objective_description = await get_description(payload.exploration_id)

    prompt = DELETE_QUESTION_VALIDATOR_PROMPT.format(
        research_objective_description=research_objective_description,
        theme_description=theme_description,
        existing_questions=existing_questions,
        question_text=question_text
    )
    return await _run_validator(prompt)
