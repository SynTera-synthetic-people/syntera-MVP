"""
Persona Plausibility Engine — pure Python, no DB, no AI calls.

Evaluates ManualPersonaCreate (or any dict with the same shape) for
logical and behavioural inconsistencies across demographics, psychographics,
professional traits, and cross-section combinations.

ALL checks are SOFT: they return warnings, never raise errors.
Missing or unexpected fields are silently skipped.
"""

from __future__ import annotations

import re
from typing import Optional


# ── Warning factory ────────────────────────────────────────────────────────────

def _warn(rule: str, severity: str, message: str, fields: list[str]) -> dict:
    return {"rule": rule, "severity": severity, "message": message, "fields": fields}


# ── Text helpers ───────────────────────────────────────────────────────────────

def _lower_set(values) -> set[str]:
    if not values:
        return set()
    if isinstance(values, str):
        values = [values]
    result: set[str] = set()
    for v in values:
        if not v:
            continue
        phrase = str(v).lower().strip()
        result.add(phrase)
        result.update(phrase.split())
    return result


def _parse_age_lower(age_range: Optional[str]) -> Optional[int]:
    if not age_range:
        return None
    nums = re.findall(r"\d+", age_range)
    return int(nums[0]) if nums else None


def _parse_income_value(income_range: Optional[str]) -> Optional[int]:
    if not income_range:
        return None
    first_part = income_range.split("-")[0] if "-" in income_range else income_range
    cleaned = first_part.strip().upper()
    multiplier = 1
    if cleaned.endswith("L"):
        multiplier = 100_000
        cleaned = cleaned[:-1]
    elif cleaned.endswith("K"):
        multiplier = 1_000
        cleaned = cleaned[:-1]
    digits = re.sub(r"[^\d]", "", cleaned)
    try:
        return int(digits) * multiplier if digits else None
    except ValueError:
        return None


def _parse_number(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    nums = re.findall(r"\d+", str(value).replace(",", ""))
    return int(nums[0]) if nums else None


def _contains_any(text: Optional[str], keywords: set[str]) -> bool:
    if not text:
        return False
    t = text.lower()
    return any(kw in t for kw in keywords)


def _words_overlap(words: set[str], keywords: set[str]) -> bool:
    return bool(words & keywords)


def _list_contains_any(items: list, keywords: set[str]) -> bool:
    combined = " ".join(str(i).lower() for i in items if i)
    return any(kw in combined for kw in keywords)


# ── Keyword sets ───────────────────────────────────────────────────────────────

_LUXURY = {"luxury", "premium", "high-end", "lavish", "affluent", "exclusive", "extravagant", "upscale"}
_INTROVERT = {"introvert", "introverted", "reserved", "solitary", "private", "reclusive", "shy"}
_HIGHLY_SOCIAL = {"highly social", "socialite", "party", "social butterfly", "outgoing lifestyle", "clubbing", "networking events"}
_STUDENT = {"student", "undergraduate", "college student", "grad student", "apprentice", "trainee"}
_EXECUTIVE = {"ceo", "cto", "cfo", "coo", "vp", "vice president", "director", "c-suite", "c-level", "chief", "managing director", "partner", "president", "head of", "svp", "evp"}
_ENTRY_LEVEL = {"intern", "junior", "entry-level", "entry level", "associate", "assistant", "coordinator", "clerk", "trainee"}
_SENIOR = {"senior", "lead", "manager", "principal", "staff engineer", "head", "director", "vp", "vice president", "chief", "ceo", "president"}
_HIGH_EDUCATION = {"phd", "doctorate", "post-doctoral", "postdoctoral", "master's", "masters", "mba", "md ", "jd", "llm", "graduate degree"}
_LOW_EDUCATION = {"no formal education", "primary school", "elementary", "no schooling", "no degree", "high school dropout", "secondary only"}
_RURAL = {"rural", "village", "small town", "remote area", "countryside", "tier 3", "tier-3", "tier3"}
_SMALL_TOWN_GEO = {"rural", "village", "small town", "remote", "countryside", "tier 3", "tier-3", "tier3", "suburban town"}
_URBAN_GEO = {"urban", "city", "metro", "metropolitan", "tier 1", "tier-1", "tier1", "downtown", "city centre", "city center"}
_NICHE_GLOBAL = {"diplomat", "un advisor", "venture capitalist", "hedge fund manager", "astronaut", "international consultant"}
_SECURITY_VALUES = {"security", "stability", "safety", "routine", "certainty", "predictability"}
_RISK_MOTIVATIONS = {"risk-taking", "adventure", "thrill-seeking", "extreme", "reckless", "high risk"}
_EXPERT_AWARENESS = {"expert", "advanced", "specialist", "deep knowledge", "highly aware", "professional-level"}
_UNAWARE = {"unaware", "no awareness", "not aware", "unfamiliar", "low awareness", "never heard"}

# Marital / family
_MARRIED = {"married", "partnered", "civil union", "domestic partner"}
_COUPLE_WITH_CHILDREN = {"couple with children", "family with children", "married with children", "married with kids", "nuclear family", "two-parent", "two parent"}
_LIVING_ALONE = {"living alone", "solo household", "single occupant", "independent household", "lives alone"}
_LIVING_WITH_PARENTS = {"living with parents", "with parents", "parental home", "family home"}
_JOINT_FAMILY = {"joint family", "extended family", "multigenerational", "multi-generational", "large family", "joint household"}
_WIDOWED_DIVORCED = {"widowed", "divorced", "separated"}

# Professional / B2B
_DIRECTOR_VP_LEVEL = {"director", "vp", "vice president", "c-suite", "ceo", "cto", "cfo", "coo", "president", "chief", "managing director", "svp", "evp", "partner", "head of"}
_BELOW_DIRECTOR = {"manager", "senior manager", "team lead", "lead", "associate", "coordinator", "analyst", "specialist", "individual contributor", "junior", "entry"}
_FINAL_DECISION_MAKER = {"final decision maker", "sole decision maker", "final authority", "key decision maker"}
_ENTERPRISE_COMPANY = {"fortune 500", "large enterprise", "enterprise", "mnc", "multinational", "global corporation"}
_IT_RESPONSIBILITIES = {
    "enterprise it strategy", "it strategy", "enterprise applications", "digital workplace",
    "ai / automation", "ai/automation", "it infrastructure", "security and risk", "data platforms",
    "analytics infrastructure", "cloud architecture", "cybersecurity", "it operations", "enterprise technology",
}
_NON_IT_DEPARTMENTS = {"hr", "human resources", "marketing", "advertising", "finance", "accounting", "sales", "procurement", "sourcing"}
_IT_DEPARTMENTS = {"it", "technology", "engineering", "software", "data", "product", "devops", "infrastructure"}
_NON_IT_RESPONSIBILITIES = {"hr strategy", "talent management", "marketing strategy", "financial planning", "sales strategy", "procurement strategy"}

# Psychographic
_RESERVED_PERSONALITY = {"reserved", "introverted", "shy", "quiet", "restrained", "reclusive"}
_ATTENTION_SEEKING = {"attention-seeking", "attention seeking", "recognition", "fame", "visibility", "spotlight", "status-driven", "wants recognition"}
_SUSTAINABILITY_VALUES = {"sustainability", "eco-friendly", "environment", "green", "ethical consumption", "conscious consumption", "eco", "sustainable"}
_RISK_AVERSE_TRAITS = {"risk-averse", "risk averse", "cautious", "conservative", "safe", "low risk"}
_THRILL_SEEKING_TRAITS = {"thrill-seeking", "thrill seeking", "extreme sports", "adrenaline", "daring", "thrill", "adventure seeker"}
_ANALYTICAL_TRAITS = {"analytical", "data-driven", "data driven", "logical", "methodical", "systematic", "rational"}
_IMPULSIVE_TRAITS = {"impulsive", "spontaneous", "impulsive buyer", "emotional decision", "gut feeling", "instinct-driven"}

# Behavioral
_LUXURY_INTERESTS = {"luxury travel", "fine dining", "yacht", "private jet", "designer brands", "luxury goods", "high fashion", "premium experiences", "luxury shopping"}
_ESPORTS = {"esports", "competitive gaming", "competitive esports", "twitch", "gaming tournament", "pro gaming", "e-sports"}
_EARLY_ADOPTER = {"early adopter", "tech-forward", "cutting edge", "bleeding edge", "first to try", "tech enthusiast", "early tech", "innovative tech"}
_HIGH_TRAVEL = {"high-travel", "high travel", "frequent travel", "travel-heavy", "nomadic", "frequent flyer", "always traveling"}
_RIGID_JOB = {"full-time office", "9-to-5", "9 to 5", "rigid schedule", "fixed hours", "traditional office", "onsite", "in-office"}
_URBAN_NIGHTLIFE = {"nightlife", "clubbing", "bars", "urban social", "city nightlife", "party scene", "nightclub"}

# Occupation / industry
_MEDICAL_PROFESSIONS = {"doctor", "physician", "surgeon", "dentist", "pharmacist", "nurse", "radiologist", "psychiatrist"}
_LEGAL_PROFESSIONS = {"lawyer", "attorney", "solicitor", "barrister", "judge"}
_REQUIRES_FORMAL_EDU = _MEDICAL_PROFESSIONS | _LEGAL_PROFESSIONS
_TECHNOLOGY_INDUSTRY = {"technology", "tech", "software", "saas", "information technology", "fintech", "edtech"}
_HEALTHCARE_INDUSTRY = {"healthcare", "medical", "pharma", "pharmaceutical", "hospital", "clinical", "life sciences"}

# Income bands (USD-normalised)
_INCOME_LOW = 25_000
_INCOME_HIGH = 100_000
_INCOME_VERY_HIGH = 200_000
_INCOME_YOUNG_HIGH = 150_000


# ── Rule functions ─────────────────────────────────────────────────────────────

# ---- DEMOGRAPHICS ----

def _rule_age_income(age_lower: Optional[int], income_val: Optional[int]) -> Optional[dict]:
    """Rule 1: Age ↔ Income — young (18-24) or elderly (65+) + very high income."""
    if age_lower is None or income_val is None:
        return None
    if (age_lower <= 24 or age_lower >= 65) and income_val >= _INCOME_YOUNG_HIGH:
        return _warn(
            "age_income",
            "medium",
            "High income selected for this age group. Please check",
            ["age_range", "income_range"],
        )
    return None


def _rule_age_education(age_lower: Optional[int], education: Optional[str]) -> Optional[dict]:
    """Rule 2: Age ↔ Education — young + advanced degree."""
    if age_lower is None or not education:
        return None
    edu_l = education.lower()
    if age_lower < 20 and any(k in edu_l for k in {"bachelor", "undergraduate degree"}):
        return _warn("age_education", "soft", "Education level seems advanced for this age group. Please check", ["age_range", "education_level"])
    if age_lower < 22 and _contains_any(education, _HIGH_EDUCATION):
        return _warn("age_education", "soft", "Education level seems advanced for this age group. Please check", ["age_range", "education_level"])
    return None


def _rule_age_occupation(age_lower: Optional[int], occ_words: set[str]) -> Optional[dict]:
    """Rule 3: Age ↔ Occupation — young + senior leadership; elderly + entry-level."""
    if age_lower is None:
        return None
    if age_lower < 22 and _words_overlap(occ_words, _SENIOR | _EXECUTIVE):
        return _warn("age_occupation", "medium", "Selected occupation may not align with this age group. Please review", ["age_range", "occupation"])
    if age_lower > 70 and _words_overlap(occ_words, _ENTRY_LEVEL):
        return _warn("age_occupation", "soft", "Selected occupation may not align with this age group. Please review", ["age_range", "occupation"])
    return None


def _rule_age_marital_status(age_lower: Optional[int], marital_status: Optional[str]) -> Optional[dict]:
    """Rule 4: Age ↔ Marital Status — age <18 + married; age <22 + widowed/divorced."""
    if age_lower is None or not marital_status:
        return None
    ms = marital_status.lower()
    if age_lower < 18 and _contains_any(ms, {"married", "widowed", "divorced", "separated"}):
        return _warn("age_marital_status", "medium", "This marital status is less common for this age group. Please check", ["age_range", "marital_status"])
    if age_lower < 22 and _contains_any(ms, {"widowed", "divorced", "separated"}):
        return _warn("age_marital_status", "soft", "This marital status is less common for this age group. Please check", ["age_range", "marital_status"])
    return None


def _rule_age_family_structure(age_lower: Optional[int], family_structure: Optional[str]) -> Optional[dict]:
    """Rule 5: Age ↔ Family Structure — young + couple with children; elderly + living with parents."""
    if age_lower is None or not family_structure:
        return None
    fs = family_structure.lower()
    if age_lower < 22 and _contains_any(fs, _COUPLE_WITH_CHILDREN):
        return _warn("age_family_structure", "medium", "Family structure may not align with selected age. Please review", ["age_range", "family_structure"])
    if age_lower > 70 and _contains_any(fs, _LIVING_WITH_PARENTS):
        return _warn("age_family_structure", "soft", "Family structure may not align with selected age. Please review", ["age_range", "family_structure"])
    return None


def _rule_age_dependents(age_lower: Optional[int], family_size: Optional[str]) -> Optional[dict]:
    """Rule 6: Age ↔ Dependents — very young + large family size."""
    if age_lower is None or not family_size:
        return None
    nums = re.findall(r"\d+", family_size)
    if nums and age_lower <= 22 and int(nums[0]) >= 5:
        return _warn("age_dependents", "soft", "Dependent profile may not align with selected age. Please check", ["age_range", "family_size"])
    return None


def _rule_marital_family_structure(marital_status: Optional[str], family_structure: Optional[str]) -> Optional[dict]:
    """Rule 7: Marital Status ↔ Family Structure — logical consistency."""
    if not marital_status or not family_structure:
        return None
    ms = marital_status.lower()
    fs = family_structure.lower()
    is_single = any(k in ms for k in {"single", "unmarried", "bachelor", "bachelorette"})
    is_married = any(k in ms for k in {"married", "partnered", "civil union"})
    has_couple_children = _contains_any(fs, _COUPLE_WITH_CHILDREN)
    lives_alone = _contains_any(fs, _LIVING_ALONE)
    if is_single and has_couple_children:
        return _warn("marital_family_structure", "medium", "Family structure may not align with marital status. Please check", ["marital_status", "family_structure"])
    if is_married and lives_alone:
        return _warn("marital_family_structure", "soft", "Family structure may not align with marital status. Please check", ["marital_status", "family_structure"])
    return None


def _rule_gender_family_structure(marital_status: Optional[str], family_structure: Optional[str]) -> Optional[dict]:
    """Rule 8: Gender ↔ Family Structure — single + spouse & children household."""
    if not marital_status or not family_structure:
        return None
    ms = marital_status.lower()
    fs = family_structure.lower()
    is_single = any(k in ms for k in {"single", "unmarried", "bachelor", "bachelorette"})
    has_spouse = any(k in fs for k in {"spouse", "with spouse", "spouse & children", "spouse and children"})
    if is_single and has_spouse:
        return _warn("gender_family_structure", "medium", "Family structure appears inconsistent. Please review", ["marital_status", "family_structure"])
    return None


def _rule_income_occupation(occ_words: set[str], income_val: Optional[int]) -> Optional[dict]:
    """Rule 9: Income ↔ Occupation — student/unemployed + high income; entry-level + top income."""
    if income_val is None:
        return None
    is_student = _words_overlap(occ_words, _STUDENT)
    is_unemployed = _words_overlap(occ_words, {"unemployed", "jobless", "not working", "homemaker", "housewife", "househusband"})
    is_entry = _words_overlap(occ_words, _ENTRY_LEVEL)
    if (is_student or is_unemployed) and income_val >= _INCOME_HIGH:
        return _warn("income_occupation_mismatch", "medium", "Income level appears high for the selected occupation. Please check", ["occupation", "income_range"])
    if is_entry and income_val >= _INCOME_HIGH:
        return _warn("income_occupation_mismatch", "medium", "Income level appears high for the selected occupation. Please check", ["occupation", "income_range"])
    return None


def _rule_income_education(income_val: Optional[int], education: Optional[str]) -> Optional[dict]:
    """Rule 10: Income ↔ Education — low education + ultra-high income."""
    if income_val is None or not education:
        return None
    if _contains_any(education, _LOW_EDUCATION) and income_val >= _INCOME_VERY_HIGH:
        return _warn("income_education_mismatch", "soft", "This income level is less typical for the selected education level. Please check", ["income_range", "education_level"])
    return None


def _rule_geography_income(geography: Optional[str], income_val: Optional[int]) -> Optional[dict]:
    """Rule 11: Geography ↔ Income — small town + top global income."""
    if not geography or income_val is None:
        return None
    if _contains_any(geography, _SMALL_TOWN_GEO) and income_val >= _INCOME_VERY_HIGH:
        return _warn("geography_income_mismatch", "soft", "Selected income is uncommon for this geography. Please review", ["geography", "income_range"])
    return None


def _rule_geography_occupation(geography: Optional[str], occ_words: set[str]) -> Optional[dict]:
    """Rule 12: Geography ↔ Occupation — rural + niche global profession."""
    if _contains_any(geography, _RURAL) and _words_overlap(occ_words, _NICHE_GLOBAL):
        return _warn("rural_niche_global_profession", "soft", "Selected occupation may not align with this geography. Please check", ["geography", "occupation"])
    return None


def _rule_geography_family_structure(geography: Optional[str], family_structure: Optional[str]) -> Optional[dict]:
    """Rule 13: Geography ↔ Family Structure — urban + large joint family."""
    if not geography or not family_structure:
        return None
    if _contains_any(geography, _URBAN_GEO) and _contains_any(family_structure, _JOINT_FAMILY):
        return _warn("geography_family_structure", "soft", "Family structure is less common for this geography. Please check", ["geography", "family_structure"])
    return None


# ---- PSYCHOGRAPHICS ----

def _rule_values_motivation(values_words: set[str], motivations_words: set[str]) -> Optional[dict]:
    """Rule 14: Values ↔ Motivation — stability-focused + high risk-seeking."""
    if _words_overlap(values_words, _SECURITY_VALUES) and _words_overlap(motivations_words, _RISK_MOTIVATIONS):
        return _warn("security_values_risk_motivation", "soft", "Some selected values and motivations may conflict. Please review", ["values", "motivations"])
    return None


def _rule_personality_lifestyle(personality_words: set[str], lifestyle_words: set[str]) -> Optional[dict]:
    """Rule 15: Personality ↔ Lifestyle — introverted + socially intensive lifestyle."""
    if _words_overlap(personality_words, _INTROVERT) and _words_overlap(lifestyle_words, _HIGHLY_SOCIAL):
        return _warn("introvert_social_lifestyle", "medium", "Personality and lifestyle selections seem misaligned. Please check", ["personality", "lifestyle"])
    return None


def _rule_personality_motivation(personality_words: set[str], motivations_words: set[str]) -> Optional[dict]:
    """Rule 16: Personality ↔ Motivation — reserved + attention-seeking."""
    if _words_overlap(personality_words, _RESERVED_PERSONALITY) and _words_overlap(motivations_words, _ATTENTION_SEEKING):
        return _warn("personality_motivation_mismatch", "soft", "Personality and motivations may not fully align. Please review", ["personality", "motivations"])
    return None


def _rule_values_interests(values_words: set[str], interests: list) -> Optional[dict]:
    """Rule 17: Values ↔ Interests — sustainability-focused + luxury interests."""
    if not interests:
        return None
    if _words_overlap(values_words, _SUSTAINABILITY_VALUES) and _list_contains_any(interests, _LUXURY_INTERESTS | _LUXURY):
        return _warn("values_interests_mismatch", "soft", "Selected interests may not align with stated values. Please check", ["values", "interests"])
    return None


def _rule_internal_trait_contradictions(personality_words: set[str], values_words: set[str]) -> Optional[dict]:
    """Rule 18: Internal Trait Contradictions — risk-averse + thrill-seeking; analytical + impulsive."""
    combined = personality_words | values_words
    if _words_overlap(combined, _RISK_AVERSE_TRAITS) and _words_overlap(combined, _THRILL_SEEKING_TRAITS):
        return _warn("trait_contradiction_risk", "medium", "Some selected traits appear contradictory. Please refine your selection", ["personality", "values"])
    if _words_overlap(personality_words, _ANALYTICAL_TRAITS) and _words_overlap(personality_words, _IMPULSIVE_TRAITS):
        return _warn("trait_contradiction_decision", "soft", "Some selected traits appear contradictory. Please refine your selection", ["personality"])
    return None


def _rule_job_level_decision_making(job_level: Optional[str], decision_making: Optional[str]) -> Optional[dict]:
    """Rule 19: Job Level ↔ Decision Making — below Director/VP + Final Decision Maker."""
    if not job_level or not decision_making:
        return None
    is_below_director = _contains_any(job_level, _BELOW_DIRECTOR) and not _contains_any(job_level, _DIRECTOR_VP_LEVEL)
    if is_below_director and _contains_any(decision_making, _FINAL_DECISION_MAKER):
        return _warn("job_level_decision_making", "medium", "Selected Job Level does not align with decision making capability. Please check", ["job_level", "decision_making"])
    return None


def _rule_job_level_experience(job_level: Optional[str], years_experience: Optional[str], company_level: Optional[str]) -> Optional[dict]:
    """Rule 20: Job Level ↔ Years of Experience — Director/VP in medium/large + <12 years."""
    if not job_level or not years_experience:
        return None
    is_director_vp = _contains_any(job_level, _DIRECTOR_VP_LEVEL)
    years = _parse_number(years_experience)
    is_large = _contains_any(company_level, {"large", "enterprise", "fortune", "medium", "mid-size", "mid size"}) if company_level else True
    if is_director_vp and years is not None and years < 12 and is_large:
        return _warn("job_level_experience_mismatch", "medium", "Selected Job Level does not align with total years of experience. Please check", ["job_level", "years_of_experience"])
    return None


def _rule_enterprise_employee_size(company_level: Optional[str], employee_size: Optional[str]) -> Optional[dict]:
    """Rule 21: Enterprise Level ↔ Employee Size — Fortune 500 + <5000 employees."""
    if not company_level or not employee_size:
        return None
    is_enterprise = _contains_any(company_level, {"fortune 500", "large enterprise", "enterprise", "mnc", "multinational"})
    emp_count = _parse_number(employee_size)
    if is_enterprise and emp_count is not None and emp_count < 5000:
        return _warn("enterprise_employee_size_mismatch", "medium", "Selected Company Level does not align with employee size. Please check", ["company_level", "employee_size"])
    return None


def _rule_department_responsibility(department: Optional[str], primary_responsibility: Optional[str]) -> Optional[dict]:
    """Rule 22: Department ↔ Primary Area of Responsibility."""
    if not department or not primary_responsibility:
        return None
    dept_l = department.lower()
    resp_l = primary_responsibility.lower()
    is_non_it_dept = any(k in dept_l for k in _NON_IT_DEPARTMENTS)
    is_it_responsibility = any(k in resp_l for k in _IT_RESPONSIBILITIES)
    is_it_dept = any(k in dept_l for k in _IT_DEPARTMENTS)
    is_non_it_resp = any(k in resp_l for k in _NON_IT_RESPONSIBILITIES)
    if is_non_it_dept and is_it_responsibility:
        return _warn("department_responsibility_mismatch", "medium", "Selected Job function does not align with Roles and Responsibility. Please check", ["department", "primary_area_of_responsibility"])
    if is_it_dept and is_non_it_resp:
        return _warn("department_responsibility_mismatch", "medium", "Selected Job function does not align with Roles and Responsibility. Please check", ["department", "primary_area_of_responsibility"])
    return None


# ---- BEHAVIORAL ----

def _rule_interests_income(interests: list, income_val: Optional[int]) -> Optional[dict]:
    """Rule 23: Interests ↔ Income — luxury travel + low income."""
    if not interests or income_val is None:
        return None
    if _list_contains_any(interests, _LUXURY_INTERESTS | _LUXURY) and income_val < _INCOME_LOW:
        return _warn("interests_income_mismatch", "medium", "These interests may require higher disposable income. Please check", ["interests", "income_range"])
    return None


def _rule_interests_age(interests: list, age_lower: Optional[int]) -> Optional[dict]:
    """Rule 24: Interests ↔ Age — age 70+ + competitive esports."""
    if not interests or age_lower is None:
        return None
    if age_lower >= 70 and _list_contains_any(interests, _ESPORTS):
        return _warn("interests_age_mismatch", "soft", "These interests are less common for this age group. Please check", ["interests", "age_range"])
    return None


def _rule_digital_adoption_age(digital_adoption: Optional[str], age_lower: Optional[int]) -> Optional[dict]:
    """Rule 25: Digital Adoption ↔ Age — age 75+ + early adopter/tech-forward."""
    if not digital_adoption or age_lower is None:
        return None
    if age_lower >= 75 and _contains_any(digital_adoption, _EARLY_ADOPTER):
        return _warn("digital_adoption_age_mismatch", "soft", "This level of tech adoption is less typical for this age group. Please check", ["digital_adoption", "age_range"])
    return None


def _rule_lifestyle_occupation(lifestyle_words: set[str], occ_words: set[str]) -> Optional[dict]:
    """Rule 26: Lifestyle ↔ Occupation — high-travel lifestyle + rigid full-time job."""
    if _words_overlap(lifestyle_words, _HIGH_TRAVEL) and _words_overlap(lifestyle_words | occ_words, _RIGID_JOB):
        return _warn("lifestyle_occupation_mismatch", "soft", "Lifestyle may not fully align with selected occupation. Please check", ["lifestyle", "occupation"])
    return None


def _rule_lifestyle_income(lifestyle_words: set[str], income_val: Optional[int]) -> Optional[dict]:
    """Rule 27: Lifestyle ↔ Income — luxury lifestyle + low income."""
    if income_val is None:
        return None
    if _words_overlap(lifestyle_words, _LUXURY) and income_val < _INCOME_LOW:
        return _warn("luxury_lifestyle_low_income", "high", "Selected lifestyle may not align with income level. Please check", ["lifestyle", "income_range"])
    return None


def _rule_lifestyle_geography(lifestyle_words: set[str], geography: Optional[str]) -> Optional[dict]:
    """Rule 28: Lifestyle ↔ Geography — remote area + urban nightlife-heavy lifestyle."""
    if not geography:
        return None
    if _contains_any(geography, _RURAL) and _words_overlap(lifestyle_words, _URBAN_NIGHTLIFE):
        return _warn("lifestyle_geography_mismatch", "soft", "Lifestyle may not align with selected geography. Please check", ["lifestyle", "geography"])
    return None


# ---- ADDITIONAL INFO ----

def _rule_occupation_industry(occ_words: set[str], industry: Optional[str]) -> Optional[dict]:
    """Rule 29: Occupation ↔ Industry — e.g., doctor + technology industry."""
    if not industry:
        return None
    is_medical = _words_overlap(occ_words, _MEDICAL_PROFESSIONS)
    in_tech = _contains_any(industry, _TECHNOLOGY_INDUSTRY)
    is_tech_engineer = _words_overlap(occ_words, {"software", "developer", "engineer", "programmer", "devops", "sysadmin"})
    in_healthcare = _contains_any(industry, _HEALTHCARE_INDUSTRY)
    if is_medical and in_tech:
        return _warn("occupation_industry_mismatch", "soft", "Occupation and industry combination seems unusual. Please check", ["occupation", "industry"])
    if is_tech_engineer and in_healthcare:
        return _warn("occupation_industry_mismatch", "soft", "Occupation and industry combination seems unusual. Please check", ["occupation", "industry"])
    return None


def _rule_education_occupation(education: Optional[str], occ_words: set[str]) -> Optional[dict]:
    """Rule 30: Education ↔ Occupation — doctor/lawyer + no formal education."""
    if not education:
        return None
    needs_degree = _words_overlap(occ_words, _REQUIRES_FORMAL_EDU)
    has_no_education = _contains_any(education, {"no formal education", "no education", "primary only", "no degree", "uneducated", "no schooling"})
    if needs_degree and has_no_education:
        return _warn("education_occupation_mismatch", "high", "This occupation typically requires specific education. Please check", ["education_level", "occupation"])
    return None


def _rule_occupation_category_awareness(occ_words: set[str], category_awareness: Optional[str]) -> Optional[dict]:
    """Rule 31: Occupation ↔ Category Awareness — industry expert + unaware; student + expert."""
    if not category_awareness:
        return None
    is_industry_expert = _words_overlap(occ_words, {"expert", "specialist", "consultant", "analyst", "professional", "researcher"})
    is_student = _words_overlap(occ_words, _STUDENT)
    is_unaware = _contains_any(category_awareness, _UNAWARE)
    is_expert_aware = _contains_any(category_awareness, _EXPERT_AWARENESS)
    if is_industry_expert and is_unaware:
        return _warn("occupation_awareness_mismatch", "soft", "Category awareness seems inconsistent with occupation. Please review", ["occupation", "category_awareness"])
    if is_student and is_expert_aware:
        return _warn("occupation_awareness_mismatch", "soft", "Category awareness seems inconsistent with occupation. Please review", ["occupation", "category_awareness"])
    return None


def _rule_industry_category_awareness(industry: Optional[str], category_awareness: Optional[str]) -> Optional[dict]:
    """Rule 32: Industry ↔ Category Awareness — relevant industry + unaware."""
    if not industry or not category_awareness:
        return None
    in_relevant_industry = _contains_any(industry, _TECHNOLOGY_INDUSTRY | _HEALTHCARE_INDUSTRY | {"finance", "consulting", "research"})
    if in_relevant_industry and _contains_any(category_awareness, _UNAWARE):
        return _warn("industry_awareness_mismatch", "soft", "Category awareness may not align with selected industry. Please check", ["industry", "category_awareness"])
    return None


# ---- CROSS-SECTION ----

def _rule_student_luxury(occ_words: set[str], lifestyle_words: set[str], category_awareness: Optional[str]) -> Optional[dict]:
    """Rule 34: Cross-Section Logical Conflict — student + luxury + expert awareness."""
    is_student = _words_overlap(occ_words, _STUDENT)
    has_luxury = _words_overlap(lifestyle_words, _LUXURY)
    is_expert = _contains_any(category_awareness, _EXPERT_AWARENESS)
    if is_student and has_luxury and is_expert:
        return _warn("student_luxury_expert", "high", "Some selections across sections may not form a coherent persona. Please review", ["occupation", "lifestyle", "category_awareness"])
    if is_student and has_luxury:
        return _warn("student_luxury", "medium", "Student occupation combined with a luxury lifestyle implies atypical financial support. Consider adding context.", ["occupation", "lifestyle"])
    return None


def _rule_over_idealized(
    income_val: Optional[int],
    education: Optional[str],
    lifestyle_words: set[str],
    occ_words: set[str],
    price_sensitivity: Optional[str],
) -> Optional[dict]:
    """Rule 31 (page 10): Over-Idealized Persona — too many best-case attributes."""
    score = 0
    if income_val is not None and income_val >= _INCOME_HIGH:
        score += 1
    if _contains_any(education, _HIGH_EDUCATION):
        score += 1
    if _words_overlap(lifestyle_words, _LUXURY):
        score += 1
    if _words_overlap(occ_words, _SENIOR | _EXECUTIVE):
        score += 1
    if _contains_any(price_sensitivity, {"low", "not sensitive", "insensitive", "premium"}):
        score += 1
    if score >= 4:
        return _warn("over_idealized_persona", "soft", "This persona may be overly idealized. Consider adding realistic trade-offs", ["income_range", "education_level", "lifestyle", "occupation", "price_sensitivity"])
    return None


def _rule_unrealistic_extremes(
    age_lower: Optional[int],
    income_val: Optional[int],
    category_awareness: Optional[str],
) -> Optional[dict]:
    """Rule 33 (page 10): Unrealistic Extremes — lowest age + highest income + highest expertise."""
    if age_lower is None or income_val is None:
        return None
    if age_lower <= 22 and income_val >= _INCOME_VERY_HIGH and _contains_any(category_awareness, _EXPERT_AWARENESS):
        return _warn("unrealistic_extremes", "high", "This combination is highly uncommon. Please check your selections", ["age_range", "income_range", "category_awareness"])
    return None


def _rule_hyper_specific(ctx: dict, age_lower: Optional[int], income_val: Optional[int]) -> Optional[dict]:
    """Rule 32 (page 10): Hyper-Specific Persona — too narrowly defined across all attributes."""
    specificity = sum([
        age_lower is not None,
        income_val is not None,
        bool(ctx["education"]),
        bool(ctx["geography"]),
        bool(ctx["marital_status"]),
        bool(ctx["family_structure"]),
        bool(ctx["occupation"]),
        bool(ctx["category_awareness"]),
        bool(ctx["job_level"]),
        bool(ctx["industry"]),
    ])
    if specificity >= 8:
        return _warn("hyper_specific_persona", "soft", "This persona is highly specific. Consider broadening for better simulation coverage", ["age_range", "income_range", "education_level", "geography", "occupation"])
    return None


def _rule_price_insensitive_low_income(price_sensitivity: Optional[str], income_val: Optional[int]) -> Optional[dict]:
    """Low price sensitivity (premium buyer) + very low income."""
    if income_val is None or not price_sensitivity:
        return None
    if _contains_any(price_sensitivity, {"low", "not sensitive", "insensitive", "premium", "luxury"}) and income_val < 20_000:
        return _warn("price_insensitive_low_income", "medium", "Low price sensitivity combined with a very low income is contradictory. Consider whether this reflects aspirational spending.", ["price_sensitivity", "income_range"])
    return None


# ── Context extraction ─────────────────────────────────────────────────────────

def _extract_context(payload: dict) -> dict:
    demo = payload.get("demographics") or {}
    psych = payload.get("psychological") or {}
    behav = payload.get("behavioural") or {}
    extra = payload.get("additional_info") or {}

    occupation = (
        extra.get("occupation")
        or demo.get("occupation")
        or payload.get("occupation")
        or ""
    )

    def _coerce_list(val) -> list:
        if not val:
            return []
        if isinstance(val, list):
            return val
        return [val]

    return {
        # Demographics
        "age_range": demo.get("age_range") or payload.get("age_range") or "",
        "income_range": demo.get("income_range") or payload.get("income_range") or "",
        "education": demo.get("education_level") or payload.get("education_level") or "",
        "occupation": occupation,
        "geography": demo.get("geography") or payload.get("geography") or "",
        "family_size": demo.get("family_size") or payload.get("family_size") or "",
        "marital_status": demo.get("marital_status") or payload.get("marital_status") or "",
        "family_structure": demo.get("family_structure") or payload.get("family_structure") or "",
        "gender": demo.get("gender") or payload.get("gender") or "",
        # Psychographic
        "lifestyle": _coerce_list(psych.get("lifestyle") or payload.get("lifestyle")),
        "values": _coerce_list(psych.get("values") or payload.get("values")),
        "personality": _coerce_list(psych.get("personality") or payload.get("personality")),
        "motivations": _coerce_list(psych.get("motivations") or payload.get("motivations")),
        "interests": _coerce_list(psych.get("interests") or behav.get("interests") or payload.get("interests")),
        # Behavioural
        "price_sensitivity": behav.get("price_sensitivity") or payload.get("price_sensitivity") or "",
        "brand_sensitivity": behav.get("brand_sensitivity") or payload.get("brand_sensitivity") or "",
        "digital_adoption": behav.get("digital_adoption") or payload.get("digital_adoption") or "",
        # Additional / Professional
        "category_awareness": extra.get("category_awareness") or payload.get("category_awareness") or "",
        "industry": extra.get("industry") or payload.get("industry") or "",
        "job_level": extra.get("job_level") or payload.get("job_level") or "",
        "years_of_experience": (
            extra.get("years_of_experience")
            or extra.get("years_experience")
            or payload.get("years_of_experience")
            or ""
        ),
        "decision_making": (
            extra.get("decision_making")
            or extra.get("decision_making_role")
            or extra.get("decision_making_style")
            or payload.get("decision_making")
            or ""
        ),
        "company_level": (
            extra.get("company_level")
            or extra.get("company_size_tier")
            or extra.get("company_type")
            or payload.get("company_level")
            or ""
        ),
        "employee_size": (
            extra.get("employee_size")
            or extra.get("company_size")
            or payload.get("employee_size")
            or ""
        ),
        "department": extra.get("department") or extra.get("function") or payload.get("department") or "",
        "primary_area_of_responsibility": (
            extra.get("primary_area_of_responsibility")
            or extra.get("area_of_responsibility")
            or payload.get("primary_area_of_responsibility")
            or ""
        ),
    }


# ── Main entry point ───────────────────────────────────────────────────────────

def evaluate_persona_plausibility(payload: dict) -> list[dict]:
    """
    Main entry point. Returns a list of warning dicts (empty = no issues).
    Never raises — unexpected or missing fields are silently handled.
    """
    try:
        ctx = _extract_context(payload)
    except Exception:
        return []

    age_lower = _parse_age_lower(ctx["age_range"])
    income_val = _parse_income_value(ctx["income_range"])
    lifestyle_words = _lower_set(ctx["lifestyle"])
    values_words = _lower_set(ctx["values"])
    personality_words = _lower_set(ctx["personality"])
    motivations_words = _lower_set(ctx["motivations"])
    occ_words = _lower_set([ctx["occupation"]])

    checks = [
        # Demographics (Rules 1–13)
        _rule_age_income(age_lower, income_val),
        _rule_age_education(age_lower, ctx["education"]),
        _rule_age_occupation(age_lower, occ_words),
        _rule_age_marital_status(age_lower, ctx["marital_status"]),
        _rule_age_family_structure(age_lower, ctx["family_structure"]),
        _rule_age_dependents(age_lower, ctx["family_size"]),
        _rule_marital_family_structure(ctx["marital_status"], ctx["family_structure"]),
        _rule_gender_family_structure(ctx["marital_status"], ctx["family_structure"]),
        _rule_income_occupation(occ_words, income_val),
        _rule_income_education(income_val, ctx["education"]),
        _rule_geography_income(ctx["geography"], income_val),
        _rule_geography_occupation(ctx["geography"], occ_words),
        _rule_geography_family_structure(ctx["geography"], ctx["family_structure"]),
        # Psychographics (Rules 14–22)
        _rule_values_motivation(values_words, motivations_words),
        _rule_personality_lifestyle(personality_words, lifestyle_words),
        _rule_personality_motivation(personality_words, motivations_words),
        _rule_values_interests(values_words, ctx["interests"]),
        _rule_internal_trait_contradictions(personality_words, values_words),
        _rule_job_level_decision_making(ctx["job_level"], ctx["decision_making"]),
        _rule_job_level_experience(ctx["job_level"], ctx["years_of_experience"], ctx["company_level"]),
        _rule_enterprise_employee_size(ctx["company_level"], ctx["employee_size"]),
        _rule_department_responsibility(ctx["department"], ctx["primary_area_of_responsibility"]),
        # Behavioral (Rules 23–28)
        _rule_interests_income(ctx["interests"], income_val),
        _rule_interests_age(ctx["interests"], age_lower),
        _rule_digital_adoption_age(ctx["digital_adoption"], age_lower),
        _rule_lifestyle_occupation(lifestyle_words, occ_words),
        _rule_lifestyle_income(lifestyle_words, income_val),
        _rule_lifestyle_geography(lifestyle_words, ctx["geography"]),
        # Additional Info (Rules 29–32)
        _rule_occupation_industry(occ_words, ctx["industry"]),
        _rule_education_occupation(ctx["education"], occ_words),
        _rule_occupation_category_awareness(occ_words, ctx["category_awareness"]),
        _rule_industry_category_awareness(ctx["industry"], ctx["category_awareness"]),
        # Cross-section
        _rule_student_luxury(occ_words, lifestyle_words, ctx["category_awareness"]),
        _rule_price_insensitive_low_income(ctx["price_sensitivity"], income_val),
        _rule_over_idealized(income_val, ctx["education"], lifestyle_words, occ_words, ctx["price_sensitivity"]),
        _rule_unrealistic_extremes(age_lower, income_val, ctx["category_awareness"]),
        _rule_hyper_specific(ctx, age_lower, income_val),
    ]

    return [w for w in checks if w is not None]


def evaluate_from_schema(data) -> list[dict]:
    """
    Convenience wrapper: accepts a Pydantic model instance or a plain dict.
    Use this from routers to avoid coupling the engine to any schema class.
    """
    if hasattr(data, "model_dump"):
        payload = data.model_dump()
    elif hasattr(data, "dict"):
        payload = data.dict()
    elif isinstance(data, dict):
        payload = data
    else:
        return []
    try:
        return evaluate_persona_plausibility(payload)
    except Exception:
        return []
