"""Tagger behaviour on real questionnaire text.

Fixtures are verbatim questions from a fielded wellness-app abandonment
study (quantitative guide and interview guide). The tagger is only useful if
it discriminates on questions of this shape, so these assert relative
ordering and coverage rather than exact scores, which are free to move with
the tagger version.
"""
from app.neuro.question_features import tag_question
from app.neuro.types import Framing

QUANT = {
    1: "What is your age group?",
    4: "Have you used any wellness apps before Sattva?",
    5: "How frequently did you use Sattva during the first week?",
    9: "To what extent do you agree: 'Sattva helps manage stress effectively.'",
    13: "How do streak notifications from Sattva make you feel?",
    14: "To what extent do you agree: 'I feel judged by the app when I miss a streak.'",
    15: "What emotions do you associate with using Sattva?",
    22: "How frustrating is it to receive reminders when you are unable to engage?",
    23: "Describe a specific obstacle you've encountered while using Sattva.",
    26: "What is your approximate annual income level?",
    28: "Do you have any children?",
}

QUAL = [
    "What feelings or thoughts did you experience when you realized you weren't using the app as planned?",
    "Can you describe the moment when you decided to sign up for Sattva?",
    "How did your personal beliefs about wellness and mental health influence your choice to use Sattva?",
]


def _tag(text):
    return tag_question(text)


def test_self_judgement_outranks_demographics_on_stakes():
    # A question inviting an admission of being judged must outrank routine
    # classification questions, however short those are.
    judged = _tag(QUANT[14]).stakes
    for q in (QUANT[1], QUANT[26], QUANT[28]):
        assert _tag(q).stakes < judged


def test_demographic_questions_stay_below_the_evaluative_band():
    for q in (QUANT[1], QUANT[26], QUANT[28]):
        assert _tag(q).stakes <= 0.6


def test_emotion_questions_are_affect_relevant():
    for q in (QUANT[13], QUANT[15], QUANT[22], QUAL[0]):
        assert _tag(q).affect_relevance >= 0.75


def test_factual_questions_are_not_affect_relevant():
    for q in (QUANT[1], QUANT[5], QUANT[28]):
        assert _tag(q).affect_relevance <= 0.4


def test_usage_history_reads_as_behavioral():
    for q in (QUANT[4], QUANT[5]):
        assert _tag(q).framing is Framing.BEHAVIORAL


def test_most_real_questions_get_a_framing():
    tagged = [_tag(q).framing for q in list(QUANT.values()) + QUAL]
    unknown = sum(1 for f in tagged if f is Framing.UNKNOWN)
    assert unknown <= len(tagged) * 0.2


def test_the_guide_spans_a_usable_stakes_range():
    # Arbitration and confidence only discriminate if the guide actually
    # varies; a flat guide makes the say-do gap untestable.
    stakes = [_tag(q).stakes for q in QUANT.values()]
    assert max(stakes) - min(stakes) >= 0.5


def test_scores_are_stable_across_calls():
    for q in list(QUANT.values()) + QUAL:
        assert _tag(q) == _tag(q)
