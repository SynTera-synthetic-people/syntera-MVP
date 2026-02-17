from app.schemas.omi_workflow import OmiWorkflowResponse
from app.models.omi import OmiState, WorkflowStage


def omi_explain_workflow() -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message=(
            "This section helps you choose the right personas and sample size. "
            "Together, they define who we hear from and how confident the results will be."
        ),
        omi_state=OmiState.IDLE,
        visual_state="notepad",
        next_expected_event="PERSONA_SELECTED"
    )

def omi_persona_create()-> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message=(
            "Excellent work! Your persona is now alive with all the traits you've carefully crafted. Ready to see how they'd answer your questions? Let's move to the Questionnaire Builder"
        ),
        omi_state=OmiState.IDLE,
        visual_state="notepad",
        next_expected_event="DISCUSS_GUIDE_BUILDER"
    )


def omi_persona_create_omi()-> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message=(
            "Persona recommendations ready! I've focused on perspectives that will give you the richest, most actionable insights"
        ),
        omi_state=OmiState.IDLE,
        visual_state="notepad",
        next_expected_event="DISCUSS_GUIDE_BUILDER"
    )

def omi_guide_persona_selection(payload: dict) -> OmiWorkflowResponse:
    count = len(payload.get("selected_personas", []))

    msg = (
        "Choose the personas you want responses from. "
        "Each persona represents a distinct type of consumer."
    )

    if count > 1:
        msg += " Comparing personas will help surface meaningful differences."

    return OmiWorkflowResponse(
        message=msg,
        omi_state=OmiState.IDLE,
        visual_state="notepad",
        next_expected_event="SAMPLE_SIZE_FOCUS"
    )


def omi_suggest_sample_size(payload: dict) -> OmiWorkflowResponse:
    recommended = payload.get("recommended_sample_size")

    return OmiWorkflowResponse(
        message=(
            f"For this objective, I recommend {recommended} responses. "
            "This balances speed and confidence."
        ),
        omi_state=OmiState.IDLE,
        visual_state="notepad",
        next_expected_event="SAMPLE_SIZE_ENTERED"
    )


def omi_validate_sample_size(payload: dict) -> OmiWorkflowResponse:
    is_valid = payload.get("is_valid")
    recommended = payload.get("recommended_sample_size")

    if is_valid:
        return OmiWorkflowResponse(
            message="Great — this sample size is well aligned with your objective.",
            omi_state=OmiState.ENCOURAGING,
            visual_state="typing",
            next_expected_event="SAMPLE_SIZE_ACCEPTED"
        )

    return OmiWorkflowResponse(
        message=(
            "This sample size may limit reliability. "
            f"I suggest increasing it to {recommended}."
        ),
        omi_state=OmiState.CONCERNED,
        visual_state="typing",
        warnings=["Low statistical confidence"],
        next_expected_event="SAMPLE_SIZE_ENTERED"
    )


def omi_ready_for_questionnaire(payload: dict) -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message="Everything looks set. Are you ready to create the questionnaire?",
        omi_state=OmiState.IDLE,
        visual_state="idle",
        cta="Create Questionnaire",
        next_expected_event="CREATE_QUESTIONNAIRE_CLICKED"
    )


def omi_building_questionnaire() -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message="I’m building the questionnaire aligned to your objective.",
        omi_state=OmiState.WORKING,
        visual_state="typing"
    )


def omi_explain_questionnaire_format(payload: dict) -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message=(
            "The questionnaire is structured by themes, with close-ended questions under each. "
            "You can add, remove, or edit any question."
        ),
        omi_state=OmiState.IDLE,
        visual_state="notepad"
    )


def omi_rollout_acknowledgement(payload: dict) -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message="Great. I’m creating the population and preparing the survey rollout.",
        omi_state=OmiState.WORKING,
        visual_state="typing"
    )


def omi_ack_question_edited(payload: dict) -> OmiWorkflowResponse:
    qid = payload.get("question_id")
    return OmiWorkflowResponse(
        message=f"Noted, edited question number {qid}.",
        omi_state=OmiState.ACKNOWLEDGING,
        visual_state="typing"
    )


def omi_ack_question_removed(payload: dict) -> OmiWorkflowResponse:
    qid = payload.get("question_id")
    return OmiWorkflowResponse(
        message=f"Noted, removed question number {qid}.",
        omi_state=OmiState.ACKNOWLEDGING,
        visual_state="typing"
    )


def omi_ack_question_added(payload: dict) -> OmiWorkflowResponse:
    qid = payload.get("question_id")
    return OmiWorkflowResponse(
        message=f"Added question {qid}. You can edit it anytime.",
        omi_state=OmiState.ACKNOWLEDGING,
        visual_state="typing"
    )


def omi_explain_insights_report() -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message=(
            "We’ve compiled insights from persona responses and the conversations that followed. "
            "The report is organized by themes, with collective insights and standout verbatims."
        ),
        omi_state=OmiState.EXPLAINING,
        visual_state="notepad",
        next_expected_event="INSIGHTS_GENERATION_STARTED"
    )


def omi_insights_generation_started() -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message="I’m putting the insights report together now.",
        omi_state=OmiState.WORKING,
        visual_state="typing"
    )


def omi_insights_ready(payload: dict) -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message=(
            "Your insights report is ready. "
            "You can download it as a PDF to share or review offline."
        ),
        omi_state=OmiState.ENCOURAGING,
        visual_state="idle",
        cta="Download PDF",
        next_expected_event="INSIGHTS_DOWNLOAD_CLICKED"
    )



def omi_insights_downloaded() -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message="Downloading your insights report. Let me know if you want to explore it further.",
        omi_state=OmiState.IDLE,
        visual_state="typing"
    )

# Page loaded

def omi_explain_survey_quant_report(payload: dict) -> OmiWorkflowResponse:
    personas = payload.get("persona_count")
    sample_size = payload.get("sample_size")

    return OmiWorkflowResponse(
        message=(
            f"A total of {sample_size} respondents matching your selected traits "
            "have answered the questionnaire. The insights report has been generated."
        ),
        omi_state=OmiState.EXPLAINING,
        visual_state="notepad",
        next_expected_event="SURVEY_REPORT_READY"
    )

#Report ready

def omi_survey_report_ready(payload: dict) -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message=(
            "You can download the insights report as a PDF, or export the raw data "
            "as Excel or CSV for deeper analysis."
        ),
        omi_state=OmiState.IDLE,
        visual_state="idle",
        cta="Download options"
    )


# User downloads PDF
def omi_ack_pdf_download(payload: dict) -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message="Downloading the PDF insights report.",
        omi_state=OmiState.ACKNOWLEDGING,
        visual_state="typing"
    )

# User downloads Excel / CSV
def omi_ack_data_download(payload: dict) -> OmiWorkflowResponse:
    format_ = payload.get("format", "data file")

    return OmiWorkflowResponse(
        message=f"Downloading the {format_} data file.",
        omi_state=OmiState.ACKNOWLEDGING,
        visual_state="typing"
    )


# Suggest rebuttal mode
def omi_suggest_rebuttal_mode() -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message=(
            "If you have more questions or want to challenge these findings, "
            "we can explore them further using Rebuttal Mode."
        ),
        omi_state=OmiState.FACILITATING,
        visual_state="notepad",
        cta="Enter Rebuttal Mode"
    )



def omi_explain_rebuttal_generation(payload: dict) -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message=(
            "We have compiled insights from the population responses and the "
            "conversations that followed to address your rebuttal questions."
        ),
        omi_state=OmiState.EXPLAINING,
        visual_state="notepad",
        next_expected_event="REBUTTAL_GENERATION_STARTED"
    )



def omi_rebuttal_generation_started() -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message=(
            "The rebuttal report is structured by themes, with collective insights "
            "represented through charts and graphs."
        ),
        omi_state=OmiState.WORKING,
        visual_state="typing"
    )


def omi_rebuttal_report_ready(payload: dict) -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message=(
            "Your rebuttal insights report is ready. "
            "You can download the full report in PDF format."
        ),
        omi_state=OmiState.IDLE,
        visual_state="idle",
        cta="Download Rebuttal Report (PDF)"
    )


def omi_ack_rebuttal_pdf_download() -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message="Downloading the rebuttal insights report.",
        omi_state=OmiState.ACKNOWLEDGING,
        visual_state="typing"
    )


# When user is typing
def omi_user_typing() -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message="listening",
        omi_state=OmiState.LISTENING,
        visual_state="listening"
    )

# When user hits Enter
def omi_user_message_submitted() -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message="Let me work through that.",
        omi_state=OmiState.THINKING,
        visual_state="typing"
    )


# Research objective finalized
def omi_confirm_research_objective(payload: dict) -> OmiWorkflowResponse:
    return OmiWorkflowResponse(
        message=(
            "Your research objective is finalized. Great. Let’s start building the personas."
        ),
        omi_state=OmiState.CONFIRMING,
        visual_state="idle",
        cta="Proceed to Persona Building",
        next_expected_event="RESEARCH_OBJECTIVE_CONFIRMED"
    )




async def handle_omi_workflow_event(
    event: str,
    payload: dict
) -> OmiWorkflowResponse:

    if event == "WORKFLOW_LOADED":
        return omi_explain_workflow()

    # ------------------------------------

    if event == "USER_TYPING":
        return omi_user_typing()

    if event == "USER_MESSAGE_SUBMITTED":
        return omi_user_message_submitted()

    # ------------------------------------------------
    if event == "CREATE_PERSONA":
        return omi_persona_create()

    if event == "CREATE_PERSONA_OMI":
        return omi_persona_create_omi()

    if event == "PERSONA_SELECTED":
        return omi_guide_persona_selection(payload)

    if event == "SAMPLE_SIZE_FOCUS":
        return omi_suggest_sample_size(payload)

    if event == "SAMPLE_SIZE_ENTERED":
        return omi_validate_sample_size(payload)

    if event == "SAMPLE_SIZE_ACCEPTED":
        return omi_ready_for_questionnaire(payload)

    if event == "CREATE_QUESTIONNAIRE_CLICKED":
        return omi_building_questionnaire()

    if event == "QUESTIONNAIRE_RENDERED":
        return omi_explain_questionnaire_format(payload)

    if event == "QUESTION_EDITED":
        return omi_ack_question_edited(payload)

    if event == "QUESTION_REMOVED":
        return omi_ack_question_removed(payload)

    if event == "QUESTION_ADDED":
        return omi_ack_question_added(payload)
    if event == "ROLLOUT_CLICKED":
        return omi_rollout_acknowledgement(payload)



    if event == "INSIGHTS_PAGE_LOADED":
        return omi_explain_insights_report()

    if event == "INSIGHTS_GENERATION_STARTED":
        return omi_insights_generation_started()

    if event == "INSIGHTS_READY":
        return omi_insights_ready(payload)

    if event == "INSIGHTS_DOWNLOAD_CLICKED":
        return omi_insights_downloaded()

    if event == "SURVEY_REPORT_PAGE_LOADED":
        return omi_explain_survey_quant_report(payload)

    if event == "SURVEY_REPORT_READY":
        return omi_survey_report_ready(payload)

    if event == "SURVEY_REPORT_DOWNLOAD_PDF":
        return omi_ack_pdf_download(payload)

    if event == "SURVEY_REPORT_DOWNLOAD_DATA":
        return omi_ack_data_download(payload)

    if event == "REBUTTAL_MODE_SUGGESTED":
        return omi_suggest_rebuttal_mode()

    # ---------------------------------
    if event == "REBUTTAL_PAGE_LOADED":
        return omi_explain_rebuttal_generation(payload)

    if event == "REBUTTAL_GENERATION_STARTED":
        return omi_rebuttal_generation_started()

    if event == "REBUTTAL_REPORT_READY":
        return omi_rebuttal_report_ready(payload)

    if event == "REBUTTAL_DOWNLOAD_PDF":
        return omi_ack_rebuttal_pdf_download()


    if event == "PERSONA_WORKFLOW_LOADED":
        return OmiWorkflowResponse(
            message=(
                "Great, now that I understand your research objectives, "
                "let’s start shaping your target personas—pixel by pixel.\n\n"
                "We’ll walk through traits step by step to give each persona real depth."
            ),
            omi_state=OmiState.IDLE,
            visual_state="idle",
            next_expected_event="TRAIT_SELECTION_STARTED"
        )

    if event == "TRAIT_SELECTION_STARTED":
        return OmiWorkflowResponse(
            message="Take a moment to paint the portrait of your persona with precise traits.",
            omi_state=OmiState.LISTENING,
            visual_state="notepad"
        )

    if event == "TRAIT_VALIDATION_RESULT":
        if not payload.get("valid"):
            return OmiWorkflowResponse(
                message=(
                    "I noticed a clash in the traits you selected.\n"
                    f"{payload.get('issues', ['Some traits may conflict'])[0]}\n\n"
                ),
                omi_state=OmiState.CONCERNED,
                visual_state="idle",
                warnings=payload.get("issues")
            )

        return OmiWorkflowResponse(
            message=(
                "I like where this persona is going. "
                "Let’s add more emotional rigor with the next set of traits."
            ),
            omi_state=OmiState.ENCOURAGING,
            visual_state="idle",
            next_expected_event="TRAIT_SELECTION_STARTED"
        )

    if event == "BACKSTORY_STARTED":
        return OmiWorkflowResponse(
            message=(
                "We’re almost there — one final but most important step.Can you think of formative experiences that explain this persona’s worldview?"
            ),
            omi_state=OmiState.IDLE,
            visual_state="idle"
        )

    if event == "BACKSTORY_VALIDATION_RESULT":
        if not payload.get("valid"):
            return OmiWorkflowResponse(
                message=(
                    "Something feels off in the backstory.\n"
                    f"{payload.get('issues', ['There may be a mismatch'])[0]}"
                ),
                omi_state=OmiState.CONCERNED,
                visual_state="idle",
                warnings=payload.get("issues")
            )

        return OmiWorkflowResponse(
            message="Excellent. Just sit back and let me bring this persona to life.",
            omi_state=OmiState.WORKING,
            visual_state="typing",
            next_expected_event="PERSONA_CREATION_STARTED"
        )

    if event == "PERSONA_CREATION_STARTED":
        return OmiWorkflowResponse(
            message="Creating your persona…",
            omi_state=OmiState.WORKING,
            visual_state="typing"
        )

    if event == "PERSONA_CREATED":
        return OmiWorkflowResponse(
            message="Your persona is ready.",
            omi_state=OmiState.IDLE,
            visual_state="idle",
            cta=["Add new persona", "Build discussion guide"]
        )

    if event == "ADD_NEW_PERSONA":
        return OmiWorkflowResponse(
            message="Let’s create another persona.",
            omi_state=OmiState.IDLE,
            visual_state="idle",
            next_expected_event="TRAIT_SELECTION_STARTED"
        )

    if event == "BUILD_DISCUSSION_GUIDE":
        return OmiWorkflowResponse(
            message="Great! Now let's build your discussion guide. I've started with some open-ended questions based on your research objective.",
            omi_state=OmiState.WORKING,
            visual_state="loading"
        )

    if event == "BUILD_DISCUSSION_GUIDE_LOAD":
        return OmiWorkflowResponse(
            message="Building your discussion guide now—this is where your research comes to life! I'm crafting open-ended questions that will spark genuine conversations with your personas. Just a moment..",
            omi_state=OmiState.WORKING,
            visual_state="loading"
        )

    if event == "BUILD_DISCUSSION_GUIDE_CREATED":
        return OmiWorkflowResponse(
            message="You can edit these, add new ones, or organize them into sections think of it as structuring the conversation flow with your persona",
            omi_state=OmiState.WORKING,
            visual_state="loading"
        )

    if event == "BUILD_DISCUSSION_GUIDE_C_QUES":
        return OmiWorkflowResponse(
            message="Nice! Question added. Your persona now has something thoughtful to respond to in this section.",
            omi_state=OmiState.WORKING,
            visual_state="loading"
        )

    if event == "BUILD_DISCUSSION_GUIDE_D_QUES":
        return OmiWorkflowResponse(
            message="Got it—question removed. Sharpening the focus like this helps your persona share more meaningful responses. Quality over quantity",
            omi_state=OmiState.WORKING,
            visual_state="loading"
        )

    if event == "BUILD_DISCUSSION_GUIDE_C_SECTION":
        return OmiWorkflowResponse(
            message="Perfect! New section created. This helps organize the conversation into clear themes—your persona will appreciate the structure.",
            omi_state=OmiState.WORKING,
            visual_state="loading"
        )

    if event == "BUILD_DISCUSSION_GUIDE_D_SECTION":
        return OmiWorkflowResponse(
            message="Noted—section removed. Sometimes fewer, sharper questions lead to richer insights. The conversation just got more focused.",
            omi_state=OmiState.WORKING,
            visual_state="loading"
        )

    if event == "ENTER_POPULATION":
        return OmiWorkflowResponse(
            message="Time to scale up! I'll create a diverse population based on your selected persona. Think of this as assembling a whole room of people who share your persona's core traits—each with their own unique perspectives.",
            omi_state=OmiState.WORKING,
            visual_state="loading"
        )

    if event == "BUILD_POPULATION":
        return OmiWorkflowResponse(
            message="Time to scale up! I'm creating a simulated population based on your personas—imagine a focus group that perfectly matches your target audience, ready to share their insights.",
            omi_state=OmiState.WORKING,
            visual_state="loading"
        )

    if event == "QUESTIONAIRE_BUILD":
        return OmiWorkflowResponse(
            message="Now for the quantitative side! I'm generating close-ended questions that directly test your research objective. Your persona—and the entire simulated population—will answer these, giving us measurable, actionable data.",
            omi_state=OmiState.WORKING,
            visual_state="loading"
        )

    if event == "SURVEY_SUCCESS":
        return OmiWorkflowResponse(
            message="Your insights are ready! Here's the complete survey report from your selected persona group. I've highlighted key patterns, notable responses, and actionable takeaways—everything you need to move forward with confidence.",
            omi_state=OmiState.WORKING,
            visual_state="loading"
        )

    if event == "SURVEY_LAUNCH":
        return OmiWorkflowResponse(
            message="Excellent! Your questionnaire is polished and ready to go. Think of this as your research rocket—all fueled up and waiting for your launch command. Ready to send it out to your simulated population?",
            omi_state=OmiState.WORKING,
            visual_state="loading"
        )


    if event == "RESEARCH_OBJECTIVE_INIT":
        return OmiWorkflowResponse(
            message="Share what’s on your mind. Big problem or fuzzy hunch. I’ll help turn it into a clear, ready-to-run research objective",
            omi_state=OmiState.WORKING,
            visual_state="Omi idle state motion"
        )

    if event == "USER_TYPING":
        return OmiWorkflowResponse(
            message="I’m listening closely…understanding what matters here, who this is for, and what we may need to sharpen",
            omi_state=OmiState.WORKING,
            visual_state="Omi’s pencil motion"
        )

    if event == "RESEARCH_OBJECTIVE_SUBMITTED":
        return OmiWorkflowResponse(
            message="Nice! That's a solid starting point. I’m breaking this down into research components and spotting what we may still want to clarify.",
            omi_state=OmiState.WORKING,
            visual_state="Omi’s keyboard motion"
        )

    if event == "RESEARCH_OBJECTIVE_FIRST_PROBE_AWAIT_RESPONSE":
        return OmiWorkflowResponse(
            message="This makes sense so far. I just want to clarify one piece to be sure I’m reading the underlying goal right",
            omi_state=OmiState.WORKING,
            visual_state="Omi’s pencil motion"
        )

    if event == "RESEARCH_OBJECTIVE_FIRST_PROBE_AFTER_RESPONSE":
        return OmiWorkflowResponse(
            message="Alright, this really helps! I’m piecing your inputs together now",
            omi_state=OmiState.WORKING,
            visual_state="Omi’s keyboard motion"
        )

    if event == "RESEARCH_OBJECTIVE_SECOND_PROBE_AWAIT_RESPONSE":
        return OmiWorkflowResponse(
            message="We’re almost there! Just a few quick clarifications and we’ll lock this in.",
            omi_state=OmiState.WORKING,
            visual_state="Omi’s pencil motion"
        )

    if event == "RESEARCH_OBJECTIVE_SECOND_PROBE_AFTER_RESPONSE":
        return OmiWorkflowResponse(
            message="Nice! I’ve got what I need. Pulling together a quick summary so we’re aligned.",
            omi_state=OmiState.WORKING,
            visual_state="Omi’s keyboard motion"
        )


    if event == "RESEARCH_OBJECTIVE_REFINING":
        return OmiWorkflowResponse(
            message="Good research starts with clarity. Help me understand key elements...",
            omi_state=OmiState.WORKING,
            visual_state="loading"
        )

    if event == "RESEARCH_OBJECTIVE_SUMMARY_SHOWCASE":
        return OmiWorkflowResponse(
            message="This is the summary of what we’ve shaped together.Next up: building personas that truly fit your research objective.",
            omi_state=OmiState.WORKING,
            visual_state="Micro celebration motion"
        )

    if event == "RESEARCH_OBJECTIVE_USER_CLICKS_ON_NEXT/PERSONA_BUILDER":
        return OmiWorkflowResponse(
            message="",
            omi_state=OmiState.WORKING,
            visual_state="OMI PAGE LOADING MOTION"
        )


    return OmiWorkflowResponse(
        message="Hi! I'm Omi. Let's go ahead and structure your research. What's your main question or idea?",
        omi_state=OmiState.IDLE,
        visual_state="idle"
    )
