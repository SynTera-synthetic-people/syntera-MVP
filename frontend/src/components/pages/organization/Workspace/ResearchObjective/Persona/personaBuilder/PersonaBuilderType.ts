// ══════════════════════════════════════════════════════════════════════════════
// Shared TypeScript Types for PersonaBuilder
// ══════════════════════════════════════════════════════════════════════════════

export interface SavedPersona {
  id: string;
  name?: string;
  auto_generated_persona?: boolean;
  created_by?: string;
  created_by_name?: string;
  age_range?: string;
  gender?: string;
  geography?: string;
  location_country?: string;
  location_state?: string;
  confidence_scoring?: {
    confidence_calculation_detail?: { weighted_total?: number };
    score?: number;
  };
  confidence_score?: number;
  calibration_confidence?: number;
  persona_details?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PersonaData {
  name: string;
  isAI?: boolean;
  isAIGenerated?: boolean;
  isSaved?: boolean;
  id?: string;
  backstory?: string;
  originalData?: SavedPersona;
  [key: string]: unknown;
}

export interface EditingItem {
  category: string;
  item: string;
}

export interface ValidationError {
  results?: unknown;
  total_response?: string;
  group?: string;
  fromTab?: string;
  toTab?: string;
}

// New types for Manual flow
export interface AttributeOption {
  label: string;
  value: string;
  description?: string;
}

export interface PersonaAttribute {
  name: string;
  category: string;
  value: string | string[];
  isMultiSelect: boolean;
}

export interface CategoryProgress {
  categoryName: string;
  totalAttributes: number;
  completedAttributes: number;
  percentage: number;
}

export interface SubTab {
  id: string;
  label: string;
  attributeName: string;
}

export type MainCategory = 
  | 'Demographics'
  | 'Psychological'
  | 'Behavioural'
  | 'Additional Information'
  | 'Formative Experience';

export interface PersonaFormData {
  // Demographics
  age?: string;
  gender?: string;
  income?: string;
  educationLevel?: string;
  occupationLevel?: string;
  maritalStatus?: string;
  familyStructure?: string;
  geography?: string;
  
  // Additional Information
  occupation?: string;
  industry?: string;
  categoryAwareness?: string;
  
  // Psychological
  lifestyle?: string[];
  values?: string[];
  personality?: string[];
  interests?: string[];
  motivations?: string[];
  
  // Behavioural
  decisionMakingStyle?: string;
  consumptionFrequency?: string;
  purchaseChannel?: string;
  priceSensitivity?: string;
  brandSensitivity?: string;
  switchingBehaviour?: string;
  purchaseTriggers?: string;
  purchaseBarriers?: string;
  mediaConsumption?: string;
  digitalBehaviour?: string;
  
  // Formative Experience
  formativeExperience?: string;
}