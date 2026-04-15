// ══════════════════════════════════════════════════════════════════════════════
// Shared Utilities for PersonaBuilder
// ══════════════════════════════════════════════════════════════════════════════

import type { SavedPersona, PersonaData, CategoryProgress, PersonaFormData } from './PersonaBuilderType';

// ── Confidence Score Utilities ────────────────────────────────────────────────

export const getConfidenceScore = (persona: SavedPersona): number | null => {
  const raw =
    persona.confidence_scoring?.confidence_calculation_detail?.weighted_total ??
    persona.confidence_scoring?.score ??
    persona.confidence_score ??
    persona.calibration_confidence ??
    (persona as any).confidence ??
    null;

  if (raw === null || raw === undefined) return null;

  const num = Number(raw);
  if (isNaN(num)) return null;

  return Math.round(num <= 1 ? num * 100 : num);
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
  
  return {
    name: (persona.name ?? (details.name as string) ?? 'Unnamed Persona'),
    'Age': (persona.age_range ?? details.age_range ?? '') as string,
    'Gender': (persona.gender ?? details.gender ?? '') as string,
    'Geography': (persona.geography ?? persona.location_country ?? persona.location_state ?? details.geography ?? details.location_country ?? '') as string,
    'Education Level': ((persona as Record<string, unknown>).education_level ?? details.education_level ?? '') as string,
    'Occupation / Employment Type': ((persona as Record<string, unknown>).occupation ?? details.occupation ?? '') as string,
    'Income Level': ((persona as Record<string, unknown>).income_range ?? details.income_range ?? '') as string,
    'backstory': ((persona as Record<string, unknown>).backstory ?? details.backstory ?? '') as string,
    'id': persona.id,
    'Family Structure': ((persona as Record<string, unknown>).family_size ?? details.family_size ?? '') as string,
    'Lifestyle': ((persona as Record<string, unknown>).lifestyle ?? details.lifestyle ?? '') as string,
    'Hobbies': ((persona as Record<string, unknown>).hobbies ?? details.hobbies ?? '') as string,
    'Marital Status': ((persona as Record<string, unknown>).marital_status ?? details.marital_status ?? '') as string,
    'Daily Rhythm': ((persona as Record<string, unknown>).daily_rhythm ?? details.daily_rhythm ?? '') as string,
    'Values': ((persona as Record<string, unknown>).values ?? details.values ?? '') as string,
    'Personality': ((persona as Record<string, unknown>).personality ?? details.personality ?? '') as string,
    'Interests': ((persona as Record<string, unknown>).interests ?? details.interests ?? '') as string,
    'Motivations': ((persona as Record<string, unknown>).motivations ?? details.motivations ?? '') as string,
    'Brand Sensitivity': ((persona as Record<string, unknown>).brand_sensitivity ?? (persona as Record<string, unknown>).brand_sensitivity_detailed ?? details.brand_sensitivity ?? '') as string,
    'Price Sensitivity': ((persona as Record<string, unknown>).price_sensitivity ?? (persona as Record<string, unknown>).price_sensitivity_general ?? details.price_sensitivity ?? '') as string,
    'Preferences': ((persona as Record<string, unknown>).preferences ?? details.preferences ?? '') as string,
    'Digital Activity': ((persona as Record<string, unknown>).digital_activity ?? details.digital_activity ?? '') as string,
    'Professional Traits': ((persona as Record<string, unknown>).professional_traits ?? details.professional_traits ?? '') as string,
    'Mobility': ((persona as Record<string, unknown>).mobility ?? details.mobility ?? '') as string,
    'Home Ownership': ((persona as Record<string, unknown>).accommodation ?? details.accommodation ?? '') as string,
    'Decision Making Style': ((persona as Record<string, unknown>).decision_making_style ?? (persona as Record<string, unknown>).decision_making_style_1 ?? details.decision_making_style ?? '') as string,
    'Purchase Frequency': ((persona as Record<string, unknown>).purchase_frequency ?? details.purchase_frequency ?? '') as string,
    'Purchase Channel': ((persona as Record<string, unknown>).purchase_channel ?? (persona as Record<string, unknown>).purchase_channel_detailed ?? details.purchase_channel ?? '') as string,
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
  const requiredFields: (keyof PersonaFormData)[] = [
    'age',
    'gender',
    'geography',
  ];
  
  const missingFields: string[] = [];
  
  requiredFields.forEach(field => {
    const value = formData[field];
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      missingFields.push(field);
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