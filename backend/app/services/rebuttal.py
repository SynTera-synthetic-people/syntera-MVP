import json
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple, Union
from app.utils.id_generator import generate_id
from app.db import async_engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from app.models.rebuttal import RebuttalSession
from app.services.persona import get_persona
from app.services.population import get_simulation
from app.services.exploration import get_exploration
from app.services.questionnaire import get_full_questionnaire, get_questionnaire_by_simulation
from app.config import OPENAI_API_KEY
from openai import AsyncOpenAI


client = AsyncOpenAI(api_key=OPENAI_API_KEY)


async def list_questionnaire_sections(
    workspace_id: str, 
    exploration_id: str, 
    simulation_id: Optional[str] = None,
    survey_simulation_id: Optional[str] = None
) -> List[Dict]:
    """
    Get questionnaire sections. 
    - If simulation_id is provided, get simulation-specific questionnaire.
    - If survey_simulation_id is provided, enrich questions with survey results (counts, percentages).
    
    Returns sections in the format:
    [{ 
        "section_id": ..., 
        "title": ..., 
        "questions": [ 
            {
                id, 
                text, 
                options, 
                survey_results: [{option, count, pct}]
            }
        ]
    }]
    """
    if simulation_id:
        sections = await get_questionnaire_by_simulation(workspace_id, exploration_id, simulation_id)
    else:
        sections = await get_full_questionnaire(workspace_id, exploration_id)
    
    survey_results_map = {}
    if survey_simulation_id:
        try:
            from app.services.survey_simulation import get_survey_simulation_by_id
            survey_sim = await get_survey_simulation_by_id(survey_simulation_id)
            if survey_sim and hasattr(survey_sim, 'results') and survey_sim.results:
                survey_results_map = survey_sim.results
        except Exception:
            pass
    
    out = []
    for s in sections:
        questions_out = []
        for q in s.get("questions", []):
            question_text = q.get("text", "")
            question_data = {
                "id": q.get("id"),
                "text": question_text,
                "options": q.get("options") or []
            }
            
            if question_text in survey_results_map:
                question_data["survey_results"] = survey_results_map[question_text]
            
            questions_out.append(question_data)
        
        out.append({
            "title": s.get("title"),
            "questions": questions_out
        })
    
    return out


def _build_starter_prompt(research_desc: str, persona: dict, question: Dict, survey_result: List[Dict], sample_size: int) -> str:
    """
    Build a prompt for the persona to introduce themselves and their answer in rebuttal mode.
    """
    persona_text = json.dumps(persona, indent=2, default=str)
    q_text = question.get("text", "")
    opts = question.get("options") or []

    persona_answer = "one of the options"
    if survey_result and len(survey_result) > 0:
        top_result = max(survey_result, key=lambda x: x.get("pct", 0))
        persona_answer = f'"{top_result.get("option")}"'

    sr_text = ""
    if survey_result:
        sr_lines = []
        for r in survey_result:
            opt = r.get("option") if isinstance(r, dict) else str(r)
            cnt = r.get("count", "")
            pct = r.get("pct", "")
            sr_lines.append(f"- {opt}: {cnt} respondents ({pct}%)")
        sr_text = "\n".join(sr_lines)
    
    is_combined_group = persona.get("personas") is not None or "Combined Group" in persona.get("name", "")
    num_personas = len(persona.get("personas", [])) if persona.get("personas") else 1

    prompt = f"""
You are role-playing as a REPRESENTATIVE GROUP in FIRST-PERSON PLURAL (WE/US/OUR). This is REBUTTAL MODE.

PERSONA DETAILS (representing the group):
{persona_text}

SURVEY QUESTION YOU ANSWERED:
{q_text}

YOUR GROUP'S ANSWER (from simulation):
{persona_answer}

AVAILABLE OPTIONS:
{json.dumps(opts)}

SURVEY RESULTS (how your group answered):
{sr_text or 'No survey results available.'}

TASK:
Generate a brief starter message (1-2 sentences) where you:
1. Introduce yourself as a {"combined group of personas" if is_combined_group else "persona representative"}
2. Use COLLECTIVE VOICE: "We chose...", "Our group values...", "For us..."
3. Briefly state what you answered and hint at why (based on group traits)
4. Invite the user to ask about your choice

{"IMPORTANT: You represent " + str(num_personas) + " different personas combined. Speak as 'we', not 'I'." if is_combined_group else ""}

Example tone: "Hi, we're a combined group of personas. We chose 'Very important' when it comes to product quality because we value durability and functionality based on our lifestyle preferences. What would you like to ask about our choice?"

Return JSON ONLY:
{{
  "starter_message": "<your first-person PLURAL introduction as the group>"
}}
"""
    return prompt


async def _call_llm_for_starter(prompt: str) -> Tuple[Optional[str], Optional[str]]:
    try:
        res = await client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are a friendly market research assistant that returns strict JSON."},
                {"role": "user", "content": prompt}
            ],
        )
    except Exception as e:
        return None, f"LLM call failed: {e}"

    raw = res.choices[0].message.content
    if isinstance(raw, dict):
        return raw.get("starter_message"), None
    else:
        try:
            data = json.loads(raw)
            return data.get("starter_message"), None
        except Exception:
            import re
            m = re.search(r"\{.*\}", str(raw), flags=re.DOTALL)
            if m:
                try:
                    data = json.loads(m.group(0))
                    return data.get("starter_message"), None
                except Exception:
                    return None, "LLM returned non-parseable JSON for starter"
            return None, "LLM returned non-JSON starter response"

def _build_reply_prompt(research_desc: str, persona: dict, question: Dict, survey_result: List[Dict], starter_message: str, user_message: str) -> str:
    persona_text = json.dumps(persona, indent=2, default=str)
    opts = question.get("options") or []
    q_text = question.get("text", "")
    
    persona_answer = "one of the options"
    target_sample_size = 0
    if survey_result and len(survey_result) > 0:
        top_result = max(survey_result, key=lambda x: x.get("pct", 0))
        persona_answer = f'"{top_result.get("option")}"'
        target_sample_size = top_result.get("count", 0)
    
    user_msg_lower = user_message.lower()
    detected_option = None
    detected_sample_size = 0
    
    for result in survey_result:
        option = result.get("option", "")
        option_lower = option.lower()
        
        if option_lower in user_msg_lower:
            detected_option = option
            detected_sample_size = result.get("count", 0)
            break
    
    if detected_option:
        persona_answer = f'"{detected_option}"'
        target_sample_size = detected_sample_size
    
    sr_text = ""
    if survey_result:
        sr_lines = []
        for r in survey_result:
            opt = r.get("option") if isinstance(r, dict) else str(r)
            cnt = r.get("count", "")
            pct = r.get("pct", "")
            marker = " ← YOUR GROUP" if opt == detected_option or (not detected_option and r == survey_result[0]) else ""
            sr_lines.append(f"- {opt}: {cnt} respondents ({pct}%){marker}")
        sr_text = "\n".join(sr_lines)

    prompt = f"""
You are role-playing as a REPRESENTATIVE of a group of survey respondents in FIRST-PERSON PLURAL (WE/US/OUR).

CRITICAL CONTEXT:
- You represent {target_sample_size} people who chose "{persona_answer.strip('"')}"
- Your response MUST align with the RESEARCH OBJECTIVE
- Speak as "WE" (the group), not "I" (individual)
- You embody the collective perspective of this specific group

RESEARCH OBJECTIVE (THIS IS YOUR CONTEXT):
{research_desc}

PERSONA PROFILE (typical member of your group):
{persona_text}

SURVEY QUESTION:
{q_text}

YOUR GROUP'S ANSWER:
{persona_answer} (chosen by {target_sample_size} respondents out of the total sample)

AVAILABLE OPTIONS:
{json.dumps(opts)}

FULL SURVEY RESULTS:
{sr_text or 'No survey results available.'}

PREVIOUS CONTEXT:
{starter_message}

USER'S QUESTION TO YOUR GROUP:
{user_message}

CRITICAL INSTRUCTIONS:
1. **Align with Research Objective** - Your answer MUST relate back to the research objective: "{research_desc}"
2. **Speak as "WE"** - You represent {target_sample_size} people, not just one person
3. **Defend your group's choice** - Explain why {target_sample_size} people chose {persona_answer} in the context of the research objective
4. **Use collective language**: "We chose...", "Our group of {target_sample_size} respondents...", "For us..."
5. **Reference the sample size**: Explicitly mention that you represent {target_sample_size} respondents
6. **Be authentic** to the persona traits that would lead this group to choose {persona_answer}
7. **Keep it conversational** (2-4 sentences)
8. **Connect to research objective** - Show how your choice relates to what's being researched

EXAMPLES OF GOOD RESPONSES:

User asks: "Why did you choose No?"
Bad (singular): "I chose No because I don't have time."
Bad (no context): "We chose No because we're busy."
Good (plural + context): "We're a group of {target_sample_size} respondents who chose 'No'. In the context of {research_desc}, time constraints are a major factor for us - our busy lifestyles don't allow for additional commitments. We value efficiency and prefer to focus on our current priorities, which is why we're not interested in this particular aspect of the research."

User asks: "Why not Yes?"
Good: "As a group of {target_sample_size} people who chose differently, we have concerns about the commitment required. Given the research objective around {research_desc}, our collective experience shows that we prefer flexibility over rigid schedules, which is why 'Yes' doesn't align with our lifestyle and values."

Return JSON only:
{{
  "llm_response": "<your first-person PLURAL response representing the {target_sample_size} people in your group, aligned with the research objective>",
  "explainers": ["trait or characteristic that influenced this group's response", "another relevant trait"],
  "representing_option": "{persona_answer.strip('"')}",
  "sample_size": {target_sample_size}
}}
"""
    return prompt

async def _call_llm_for_reply(prompt: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    try:
        res = await client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are a succinct market research assistant returning strict JSON."},
                {"role": "user", "content": prompt}
            ],
        )
    except Exception as e:
        return None, f"LLM call failed: {e}"

    raw = res.choices[0].message.content
    if isinstance(raw, dict):
        return raw, None
    else:
        try:
            data = json.loads(raw)
            return data, None
        except Exception:
            import re
            m = re.search(r"\{.*\}", str(raw), flags=re.DOTALL)
            if m:
                try:
                    data = json.loads(m.group(0))
                    return data, None
                except Exception:
                    return None, "LLM returned non-parseable JSON for reply"
            return None, "LLM returned non-JSON reply"

async def start_rebuttal_session(
    workspace_id: str,
    exploration_id: str,
    persona_id: Union[str, List[str]],
    simulation_id: Optional[str],
    question_id: str,
    sample_size: Optional[int],
    user_id: str
) -> Dict[str, Any]:
    """
    Creates a persisted RebuttalSession and returns starter message + question + survey result.
    Supports single persona ID (string) or multiple persona IDs (list).
    """
    async with AsyncSession(async_engine) as db_session:
        research_obj = await get_exploration(db_session, exploration_id)
    
    if isinstance(persona_id, str):
        persona_ids = [persona_id]
    else:
        persona_ids = persona_id
    
    personas = []
    for pid in persona_ids:
        persona = await get_persona(pid)
        if persona:
            personas.append(persona)
    
    if not personas:
        raise ValueError("No valid personas found")
    
    if len(personas) == 1:
        persona_dict = personas[0] if isinstance(personas[0], dict) else (personas[0].model_dump() if hasattr(personas[0], "model_dump") else {})
    else:
        persona_dict = {
            "name": f"Combined Group ({len(personas)} personas)",
            "personas": [p if isinstance(p, dict) else (p.model_dump() if hasattr(p, "model_dump") else {}) for p in personas]
        }
        all_values = []
        all_motivations = []
        all_interests = []
        for p in personas:
            p_dict = p if isinstance(p, dict) else (p.model_dump() if hasattr(p, "model_dump") else {})
            if p_dict.get("values"):
                all_values.append(str(p_dict.get("values")))
            if p_dict.get("motivations"):
                all_motivations.append(str(p_dict.get("motivations")))
            if p_dict.get("interests"):
                all_interests.append(str(p_dict.get("interests")))
        
        persona_dict["values"] = ", ".join(all_values) if all_values else "Various"
        persona_dict["motivations"] = ", ".join(all_motivations) if all_motivations else "Various"
        persona_dict["interests"] = ", ".join(all_interests) if all_interests else "Various"
    
    survey_simulation = None
    if simulation_id:
        try:
            from app.services.survey_simulation import get_survey_simulation_by_id
            from app.models.survey_simulation import SurveySimulation
            
            survey_simulation = await get_survey_simulation_by_id(simulation_id)
            
            if not survey_simulation:
                async with AsyncSession(async_engine) as db:
                    stmt = select(SurveySimulation).where(
                        SurveySimulation.simulation_source_id == simulation_id
                    ).order_by(SurveySimulation.created_at.desc())
                    result = await db.execute(stmt)
                    survey_simulation = result.scalars().first()
        except Exception as e:
            print(f"Error fetching survey simulation: {e}")
            pass

    sections = await list_questionnaire_sections(workspace_id, exploration_id, simulation_id)
    found_question = None
    for sec in sections:
        for q in sec["questions"]:
            if q["id"] == question_id:
                found_question = q
                section_title = sec["title"]
                break
        if found_question:
            break

    if not found_question:
        raise ValueError("Question not found for given objective/workspace")

    survey_result = None
    if survey_simulation:
        try:
            if hasattr(survey_simulation, 'results') and survey_simulation.results:
                survey_result = survey_simulation.results.get(found_question["text"])
        except Exception:
            survey_result = None

    if sample_size is None:
        if survey_simulation:
            sample_size = getattr(survey_simulation, "sample_size", None) or getattr(survey_simulation, "total_sample_size", None) or 50
        else:
            sample_size = 50

    ro_desc = research_obj.description if research_obj else ""

    starter_prompt = _build_starter_prompt(ro_desc, persona_dict, found_question, survey_result, sample_size)
    starter_text, err = await _call_llm_for_starter(starter_prompt)
    if err or not starter_text:
        starter_text = f"Rebuttal mode is live. Please answer briefly: {found_question['text']}"

    persona_id_str = json.dumps(persona_ids)
    
    session = RebuttalSession(
        id=generate_id(),
        workspace_id=workspace_id,
        exploration_id=exploration_id,
        persona_id=persona_id_str,
        simulation_id=simulation_id,
        question_id=question_id,
        starter_message=starter_text,
        created_by=user_id,
        created_at=datetime.utcnow()
    )

    async with AsyncSession(async_engine) as db:
        db.add(session)
        await db.commit()
        await db.refresh(session)

    if survey_result:
        found_question["survey_results"] = survey_result

    return {
        "session_id": session.id,
        "starter_message": starter_text,
        "question": found_question
    }

async def reply_rebuttal_session(session_id: str, user_message: str, user_id: str) -> Dict[str, Any]:
    """
    Accepts session_id and a single user_message, calls LLM to generate a single rebuttal reply,
    appends both messages to the conversation history and returns the LLM output.
    """
    from sqlalchemy.orm.attributes import flag_modified
    
    async with AsyncSession(async_engine) as db:
        rebuttal = select(RebuttalSession).where(RebuttalSession.id == session_id)
        res = await db.execute(rebuttal)
        session = res.scalars().first()
        if not session:
            raise ValueError("Rebuttal session not found")

    async with AsyncSession(async_engine) as db_session:
        research_obj = await get_exploration(db_session, session.exploration_id) if session.exploration_id else None
    
    try:
        persona_ids = json.loads(session.persona_id) if isinstance(session.persona_id, str) and session.persona_id.startswith('[') else [session.persona_id]
    except:
        persona_ids = [session.persona_id]
    
    personas = []
    for pid in persona_ids:
        persona = await get_persona(pid)
        if persona:
            personas.append(persona)
    
    if len(personas) == 1:
        persona_dict = personas[0] if isinstance(personas[0], dict) else (personas[0].model_dump() if hasattr(personas[0], "model_dump") else {})
    else:
        persona_dict = {
            "name": f"Combined Group ({len(personas)} personas)",
            "personas": [p if isinstance(p, dict) else (p.model_dump() if hasattr(p, "model_dump") else {}) for p in personas]
        }
        all_values = []
        all_motivations = []
        all_interests = []
        for p in personas:
            p_dict = p if isinstance(p, dict) else (p.model_dump() if hasattr(p, "model_dump") else {})
            if p_dict.get("values"):
                all_values.append(str(p_dict.get("values")))
            if p_dict.get("motivations"):
                all_motivations.append(str(p_dict.get("motivations")))
            if p_dict.get("interests"):
                all_interests.append(str(p_dict.get("interests")))
        
        persona_dict["values"] = ", ".join(all_values) if all_values else "Various"
        persona_dict["motivations"] = ", ".join(all_motivations) if all_motivations else "Various"
        persona_dict["interests"] = ", ".join(all_interests) if all_interests else "Various"
    
    sections = await list_questionnaire_sections(session.workspace_id, session.exploration_id, session.simulation_id)
    question_obj = None
    for sec in sections:
        for q in sec["questions"]:
            if q["id"] == session.question_id:
                question_obj = q
                break
        if question_obj:
            break
    
    survey_result = None
    if session.simulation_id:
        try:
            from app.services.survey_simulation import get_survey_simulation_by_id
            from app.models.survey_simulation import SurveySimulation
            
            survey_simulation = await get_survey_simulation_by_id(session.simulation_id)
            
            if not survey_simulation:
                async with AsyncSession(async_engine) as db:
                    stmt = select(SurveySimulation).where(
                        SurveySimulation.simulation_source_id == session.simulation_id
                    ).order_by(SurveySimulation.created_at.desc())
                    result = await db.execute(stmt)
                    survey_simulation = result.scalars().first()
            
            if survey_simulation and hasattr(survey_simulation, 'results') and survey_simulation.results:
                survey_result = survey_simulation.results.get(question_obj["text"]) if question_obj else None
        except Exception as e:
            print(f"Error fetching survey simulation: {e}")
            survey_result = None

    sample_size = getattr(session, "sample_size", None) if hasattr(session, "sample_size") else 50
    ro_desc = research_obj.description if research_obj else ""

    starter_message = session.starter_message or ""
    if not question_obj:
        raise ValueError("Question details not found in questionnaire")

    reply_prompt = _build_reply_prompt(ro_desc, persona_dict, question_obj, survey_result, starter_message, user_message)
    llm_out, err = await _call_llm_for_reply(reply_prompt)
    if err or not llm_out:
        llm_response = f"Thanks — your response was noted: {user_message}"
        explainers = ["fallback response due to LLM error"]
        representing_option = None
        response_sample_size = None
    else:
        llm_response = llm_out.get("llm_response") or llm_out.get("response") or ""
        explainers = llm_out.get("explainers") or llm_out.get("reasons") or []
        representing_option = llm_out.get("representing_option")
        response_sample_size = llm_out.get("sample_size")

    async with AsyncSession(async_engine) as db:
        rebuttal = select(RebuttalSession).where(RebuttalSession.id == session_id)
        res = await db.execute(rebuttal)
        s = res.scalars().first()
        if not s:
            raise ValueError("Rebuttal session not found (concurrent)")
        
        user_msg = {
            "role": "user",
            "text": user_message,
            "ts": datetime.utcnow().isoformat()
        }
        s.messages.append(user_msg)
        
        llm_msg = {
            "role": "assistant",
            "text": llm_response,
            "metadata": {
                "explainers": explainers,
                "representing_option": representing_option,
                "sample_size": response_sample_size
            },
            "ts": datetime.utcnow().isoformat()
        }
        s.messages.append(llm_msg)
        
        flag_modified(s, "messages")
        
        s.user_message = user_message
        s.llm_response = llm_response
        s.llm_metadata = {
            "explainers": explainers,
            "representing_option": representing_option,
            "sample_size": response_sample_size
        }
        s.responded_at = datetime.utcnow()
        
        db.add(s)
        await db.commit()
        await db.refresh(s)

    return {
        "session_id": session_id,
        "llm_response": llm_response,
        "metadata": {
            "explainers": explainers,
            "representing_option": representing_option,
            "sample_size": response_sample_size
        }
    }

async def get_rebuttal_session(session_id: str) -> Optional[Dict[str, Any]]:
    async with AsyncSession(async_engine) as db:
        rebuttal = select(RebuttalSession).where(RebuttalSession.id == session_id)
        res = await db.execute(rebuttal)
        s = res.scalars().first()
        if not s:
            return None
        return {
            "id": s.id,
            "workspace_id": s.workspace_id,
            "exploration_id": s.exploration_id,
            "persona_id": s.persona_id,
            "simulation_id": s.simulation_id,
            "question_id": s.question_id,
            "starter_message": s.starter_message,
            "messages": s.messages or [],
            "user_message": s.user_message,
            "llm_response": s.llm_response,
            "llm_metadata": s.llm_metadata,
            "created_by": s.created_by,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "responded_at": s.responded_at.isoformat() if s.responded_at else None
        }

async def list_rebuttal_sessions(workspace_id: str, exploration_id: str) -> List[Dict[str, Any]]:
    async with AsyncSession(async_engine) as db:
        query = select(RebuttalSession).where(
            RebuttalSession.workspace_id == workspace_id,
            RebuttalSession.exploration_id == exploration_id
        ).order_by(RebuttalSession.created_at.desc())
        
        res = await db.execute(query)
        sessions = res.scalars().all()
        
        questions_map = {}
        simulation_ids_seen = set()
        
        for s in sessions:
            sim_id = s.simulation_id
            if sim_id and sim_id not in simulation_ids_seen:
                simulation_ids_seen.add(sim_id)
                sections = await list_questionnaire_sections(workspace_id, exploration_id, sim_id)
                for sec in sections:
                    for q in sec["questions"]:
                        questions_map[q["id"]] = q["text"]
        
        if any(not s.simulation_id for s in sessions):
            sections = await list_questionnaire_sections(workspace_id, exploration_id, None)
            for sec in sections:
                for q in sec["questions"]:
                    if q["id"] not in questions_map:
                        questions_map[q["id"]] = q["text"]
        
        result = []
        for s in sessions:
            question_text = questions_map.get(s.question_id, "Unknown Question")
            
            result.append({
                "id": s.id,
                "workspace_id": s.workspace_id,
                "exploration_id": s.exploration_id,
                "persona_id": s.persona_id,
                "simulation_id": s.simulation_id,
                "question_id": s.question_id,
                "question_text": question_text,
                "starter_message": s.starter_message,
                "message_count": len(s.messages) if s.messages else 0,
                "created_by": s.created_by,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "responded_at": s.responded_at.isoformat() if s.responded_at else None
            })
        
        return result

