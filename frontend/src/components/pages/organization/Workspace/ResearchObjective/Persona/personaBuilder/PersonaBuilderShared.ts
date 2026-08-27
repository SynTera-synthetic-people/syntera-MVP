// ══════════════════════════════════════════════════════════════════════════════
// Shared Utilities for PersonaBuilder
// ══════════════════════════════════════════════════════════════════════════════

import type { SavedPersona, PersonaData, CategoryProgress, PersonaFormData } from './PersonaBuilderType';

const getRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const getNested = (source: unknown, path: string[]): unknown => {
  let current: unknown = source;
  for (const key of path) {
    const record = getRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
};

const coerceConfidenceScore = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || typeof raw === 'boolean') return null;
  const cleaned = typeof raw === 'string' ? raw.trim().replace('%', '') : raw;
  if (cleaned === '' || String(cleaned).toLowerCase() === 'na') return null;
  const num = typeof cleaned === 'string'
    ? Number(cleaned.match(/-?\d+(?:\.\d+)?/)?.[0] ?? cleaned)
    : Number(cleaned);
  if (isNaN(num) || num < 0 || num > 100) return null;
  return Math.round(num <= 1 ? num * 100 : num);
};

// ── Confidence Score Utilities ────────────────────────────────────────────────

export const getConfidenceScore = (persona: SavedPersona): number | null => {
  // Backend now computes and persists this once (persona.master_calibration_confidence)
  // so every screen — this grid card included — shows the same number. Only fall back
  // to the legacy candidates below for personas the backend hasn't scored yet.
  // Read directly rather than through coerceConfidenceScore: this field is always
  // already an int 0-100 (or null) from the backend, never a 0-1 fraction, so
  // coerceConfidenceScore's "<=1 means fraction, multiply by 100" heuristic would
  // misinterpret a genuine score of 1 as 100.
  const raw = persona.master_calibration_confidence;
  if (typeof raw === 'number' && !Number.isNaN(raw) && raw >= 0 && raw <= 100) {
    return Math.round(raw);
  }

  const details = getRecord(persona.persona_details);
  const candidates = [
    persona.confidence_scoring?.weighted_score,
    persona.confidence_scoring?.score,
    persona.confidence_scoring?.confidence_calculation_detail?.weighted_total,
    getNested(details, ['confidence_scoring', 'weighted_score']),
    getNested(details, ['confidence_scoring', 'score']),
    getNested(details, ['confidence_scoring', 'confidence_calculation_detail', 'weighted_total']),
    getNested(details, ['confidence_scoring', 'confidence_calculation_detail', 'value']),
    getNested(details, ['evidence_snapshot', 'confidence_calculation_detail', 'weighted_total']),
    getNested(details, ['evidence_snapshot', 'confidence_calculation_detail', 'value']),
    getNested(details, ['evidence_snapshot', 'confidence_breakdown', 'weighted_total']),
    getNested(details, ['evidence_snapshot', 'confidence_breakdown', 'value']),
    getNested(details, ['confidence_calculation_detail', 'weighted_total']),
    getNested(details, ['confidence_calculation_detail', 'value']),
    getNested(details, ['confidence_breakdown', 'weighted_total']),
    getNested(details, ['confidence_breakdown', 'value']),
    persona.confidence_score,
    persona.calibration_confidence,
    (persona as any).confidence,
  ];
  for (const candidate of candidates) {
    const score = coerceConfidenceScore(candidate);
    if (score !== null) return score;
  }
  if (
    persona.auto_generated_persona === false &&
    (persona.calibration_status === 'draft' || details?.raw_traits || details?.raw_form_payload)
  ) {
    return 50;
  }

  return null;

};

export const getConfidenceBarClass = (score: number): string => {
  if (score >= 80) return 'pb-confidence-bar--green';
  if (score >= 60) return 'pb-confidence-bar--amber';
  return 'pb-confidence-bar--red';
};

export const getConfidenceTextColor = (score: number): string => {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
};

// ── Persona Data Formatting ───────────────────────────────────────────────────

export const formatPersonaData = (persona: SavedPersona): PersonaData => {
  const details: Record<string, unknown> = (persona.persona_details ?? {}) as Record<string, unknown>;
  
  const p = persona as Record<string, unknown>;
  const coerceStr = (v: unknown): string => {
    if (!v) return '';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  };

  return {
    'name': (persona.name ?? (details.name as string) ?? 'Unnamed Persona'),
    'id': persona.id,
    'Age': coerceStr(persona.age_range ?? details.age_range),
    'Gender': coerceStr(persona.gender ?? details.gender),
    'Geography': coerceStr(persona.geography ?? persona.location_country ?? persona.location_state ?? details.geography ?? details.location_country),
    'Education Level': coerceStr(p.education_level ?? details.education_level),
    'Occupation Level': coerceStr(persona.occupation_level ?? details.occupation_level),
    'Occupation / Employment Type': coerceStr(p.occupation ?? details.occupation),
    'Industry': coerceStr(persona.industry ?? details.industry),
    'Income Level': coerceStr(p.income_range ?? details.income_range),
    'Family Structure': coerceStr(persona.family_structure ?? p.family_size ?? details.family_structure ?? details.family_size),
    'Marital Status': coerceStr(p.marital_status ?? details.marital_status),
    'Lifestyle': coerceStr(p.lifestyle ?? details.lifestyle),
    'Values': coerceStr(p.values ?? details.values),
    'Personality': coerceStr(p.personality ?? details.personality),
    'Interests': coerceStr(p.interests ?? details.interests),
    'Motivations': coerceStr(p.motivations ?? details.motivations),
    'Brand Sensitivity': coerceStr(p.brand_sensitivity ?? details.brand_sensitivity),
    'Price Sensitivity': coerceStr(p.price_sensitivity ?? details.price_sensitivity),
    'Decision Making Style': coerceStr(persona.decision_making_style ?? details.decision_making_style),
    'Consumption Frequency': coerceStr(persona.consumption_frequency ?? details.consumption_frequency),
    'Purchase Channel': coerceStr(persona.purchase_channel ?? details.purchase_channel),
    'Switching Tendency': coerceStr(persona.switching_tendency ?? details.switching_tendency),
    'Category Awareness': coerceStr(persona.category_awareness ?? details.category_awareness),
    'Preferences': coerceStr(p.preferences ?? details.preferences),
    'Digital Activity': coerceStr(p.digital_activity ?? details.digital_activity),
    'Professional Traits': coerceStr(p.professional_traits ?? details.professional_traits),
    'Hobbies': coerceStr(p.hobbies ?? details.hobbies),
    'Mobility': coerceStr(p.mobility ?? details.mobility),
    'Home Ownership': coerceStr(p.accommodation ?? details.accommodation),
    'Daily Rhythm': coerceStr(p.daily_rhythm ?? details.daily_rhythm),
    'backstory': coerceStr(p.backstory ?? details.backstory ?? details.formative_experience_description),
    'isAI': (persona.auto_generated_persona ?? false),
    'isAIGenerated': (persona.auto_generated_persona ?? false),
    'isSaved': true,
  };
};

// ── Category Progress Calculation ─────────────────────────────────────────────

export const calculateCategoryProgress = (
  categoryName: string,
  formData: PersonaFormData,
  attributeMapping: Record<string, string[]>
): CategoryProgress => {
  const attributes = attributeMapping[categoryName] || [];
  const totalAttributes = attributes.length;
  
  let completedAttributes = 0;
  
  attributes.forEach(attr => {
    const value = formData[attr as keyof PersonaFormData];
    if (value) {
      if (Array.isArray(value)) {
        if (value.length > 0) completedAttributes++;
      } else if (typeof value === 'string' && value.trim() !== '') {
        completedAttributes++;
      }
    }
  });
  
  const percentage = totalAttributes > 0 
    ? Math.round((completedAttributes / totalAttributes) * 100) 
    : 0;
  
  return {
    categoryName,
    totalAttributes,
    completedAttributes,
    percentage,
  };
};

// ── Persona Validation ────────────────────────────────────────────────────────

export const validatePersonaData = (formData: PersonaFormData): {
  isValid: boolean;
  missingFields: string[];
} => {
  const requiredFields: Array<[keyof PersonaFormData, string]> = [
    ['age', 'Age'],
    ['gender', 'Gender'],
    ['income', 'Income'],
    ['educationLevel', 'Education Level'],
    ['occupationLevel', 'Occupation Level'],
    ['maritalStatus', 'Marital Status'],
    ['familyStructure', 'Family Structure'],
    ['geography', 'Geography'],
  ];
  
  const missingFields: string[] = [];
  
  requiredFields.forEach(([field, label]) => {
    const value = formData[field];
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      missingFields.push(label);
    }
  });
  
  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
};

// ── API Payload Transformation ────────────────────────────────────────────────

export const transformFormDataToAPIPayload = (
  formData: PersonaFormData,
  personaName: string,
  objectiveId: string | undefined
): Record<string, unknown> => {
  return {
    name: personaName,
    age_range: formData.age ?? '',
    gender: formData.gender ?? '',
    location_country: formData.geography ?? '',
    location_state: '',
    geography: formData.geography ?? '',
    education_level: formData.educationLevel ?? '',
    occupation: formData.occupation ?? '',
    income_range: formData.income ?? '',
    family_size: formData.familyStructure ?? '',
    marital_status: formData.maritalStatus ?? '',
    lifestyle: Array.isArray(formData.lifestyle) ? formData.lifestyle : (formData.lifestyle ? [formData.lifestyle] : []),
    values: Array.isArray(formData.values) ? formData.values : (formData.values ? [formData.values] : []),
    personality: Array.isArray(formData.personality) ? formData.personality : (formData.personality ? [formData.personality] : []),
    interests: formData.interests ?? '',
    motivations: formData.motivations ?? '',
    brand_sensitivity: formData.brandSensitivity ?? '',
    brand_sensitivity_detailed: formData.brandSensitivity ?? '',
    price_sensitivity: formData.priceSensitivity ?? '',
    price_sensitivity_general: formData.priceSensitivity ?? '',
    decision_making_style: formData.decisionMakingStyle ?? '',
    decision_making_style_1: formData.decisionMakingStyle ?? '',
    purchase_channel: formData.purchaseChannel ?? '',
    purchase_channel_detailed: formData.purchaseChannel ?? '',
    digital_behavior: formData.digitalBehaviour ?? '',
    digital_behavior_detailed: formData.digitalBehaviour ?? '',
    backstory: formData.formativeExperience ?? '',
    research_objective_id: '',
    exploration_id: objectiveId,
    sample_size: 50,
    auto_generated_persona: false,
  };
};

// ── Nested ManualPersonaCreate payload (for /validate and /manual endpoints) ──
// transformFormDataToAPIPayload produces a flat shape for legacy endpoints.
// buildManualPersonaPayload produces the nested ManualPersonaCreate shape that
// POST /personas/manual and POST /personas/validate both expect.

export const buildManualPersonaPayload = (
  formData: PersonaFormData,
  name?: string,
  formativeExperience?: string,
  // True only when the user actually renamed the persona. Calibration replaces
  // the name with an LLM-generated one unless this says the name is the user's
  // own — otherwise a persona the user called "Ravi Kumar" comes back renamed.
  nameIsCustom?: boolean,
): Record<string, unknown> => {
  const toArray = (v: unknown): string[] | null => {
    if (!v) return null;
    if (Array.isArray(v)) return v.length ? v : null;
    return [v as string];
  };

  return {
    name: name ?? null,
    name_is_custom: nameIsCustom ?? false,
    demographics: {
      age_range: formData.age ?? '',
      gender: formData.gender ?? '',
      income_range: formData.income ?? null,
      education_level: formData.educationLevel ?? null,
      occupation: formData.occupation ?? null,
      occupation_level: formData.occupationLevel ?? null,
      marital_status: formData.maritalStatus ?? null,
      family_size: formData.familyStructure ?? null,
      family_structure: formData.familyStructure ?? null,
      location_country: formData.geography ?? null,
      location_state: null,
      geography: formData.geography ?? null,
    },
    psychological: {
      lifestyle: toArray(formData.lifestyle),
      values: toArray(formData.values),
      personality: toArray(formData.personality),
      interests: toArray(formData.interests),
      motivations: toArray(formData.motivations),
    },
    behavioural: {
      decision_making_style: formData.decisionMakingStyle ?? null,
      consumption_frequency: formData.consumptionFrequency ?? null,
      purchase_channel: formData.purchaseChannel ? [formData.purchaseChannel] : null,
      price_sensitivity: formData.priceSensitivity ?? null,
      brand_sensitivity: formData.brandSensitivity ?? null,
      switching_tendency: formData.switchingBehaviour ?? null,  // new canonical field name
      switching_behaviour: formData.switchingBehaviour ?? null, // legacy alias kept
      purchase_triggers: toArray(formData.purchaseTriggers),
      purchase_barriers: toArray(formData.purchaseBarriers),
      media_consumption_patterns: toArray(formData.mediaConsumption),
      digital_behaviour: formData.digitalBehaviour ?? null,
    },
    additional_info: {
      occupation: formData.occupation ?? null,
      industry: formData.industry ?? null,
      category_awareness: formData.categoryAwareness ?? null,
    },
    formative_experience: formativeExperience ?? null,
  };
};

// ── String Utilities ──────────────────────────────────────────────────────────

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

export const capitalizeFirstLetter = (text: string): string => {
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// ── Array Utilities ───────────────────────────────────────────────────────────

export const toggleArrayItem = <T>(array: T[], item: T): T[] => {
  const index = array.indexOf(item);
  if (index > -1) {
    return array.filter((_, i) => i !== index);
  }
  return [...array, item];
};
