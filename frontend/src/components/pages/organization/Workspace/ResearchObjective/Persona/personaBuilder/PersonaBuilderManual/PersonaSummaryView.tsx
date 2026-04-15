// ══════════════════════════════════════════════════════════════════════════════
// PersonaSummaryView — always visible below the attribute card
// ══════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { motion } from 'framer-motion';
import SpIcon from '../../../../../../../SPIcon';
import type { PersonaFormData } from '../PersonaBuilderType';
import CategorySummaryCard from './CategorySummaryCard';
import './PersonaSummaryView.css';

interface PersonaSummaryViewProps {
  personaName: string;
  formData: PersonaFormData;
  formativeExperience: string;
  onFormativeExperienceChange: (value: string) => void;
  onEditName?: () => void;
}

const PersonaSummaryView: React.FC<PersonaSummaryViewProps> = ({
  personaName,
  formData,
  formativeExperience,
  onEditName,
}) => {
  const coreIdentityAttributes = [
    { key: 'age' as keyof PersonaFormData, displayName: 'Age' },
    { key: 'gender' as keyof PersonaFormData, displayName: 'Gender' },
    { key: 'income' as keyof PersonaFormData, displayName: 'Income' },
    { key: 'educationLevel' as keyof PersonaFormData, displayName: 'Education Level' },
    { key: 'occupationLevel' as keyof PersonaFormData, displayName: 'Occupation Level' },
    { key: 'maritalStatus' as keyof PersonaFormData, displayName: 'Marital Status' },
    { key: 'familyStructure' as keyof PersonaFormData, displayName: 'Family Structure' },
    { key: 'geography' as keyof PersonaFormData, displayName: 'Geography' },
  ];

  const phycologicalAttributes = [
    { key: 'lifestyle' as keyof PersonaFormData, displayName: 'Lifestyle' },
    { key: 'values' as keyof PersonaFormData, displayName: 'Values' },
    { key: 'personality' as keyof PersonaFormData, displayName: 'Personality' },
    { key: 'interests' as keyof PersonaFormData, displayName: 'Interests' },
    { key: 'motivations' as keyof PersonaFormData, displayName: 'Motivations' },
  ];

  const behaviouralAttributes = [
    { key: 'decisionMakingStyle' as keyof PersonaFormData, displayName: 'Decision Making Style' },
    { key: 'consumptionFrequency' as keyof PersonaFormData, displayName: 'Consumption Frequency' },
    { key: 'purchaseChannel' as keyof PersonaFormData, displayName: 'Purchase Channel' },
    { key: 'priceSensitivity' as keyof PersonaFormData, displayName: 'Price Sensitivity' },
    { key: 'brandSensitivity' as keyof PersonaFormData, displayName: 'Brand Sensitivity' },
    { key: 'switchingBehaviour' as keyof PersonaFormData, displayName: 'Switching Behaviour' },
    { key: 'purchaseTriggers' as keyof PersonaFormData, displayName: 'Purchase Triggers' },
    { key: 'purchaseBarriers' as keyof PersonaFormData, displayName: 'Purchase Barriers' },
    { key: 'mediaConsumption' as keyof PersonaFormData, displayName: 'Media Consumption' },
    { key: 'digitalBehaviour' as keyof PersonaFormData, displayName: 'Digital Behaviour' },
  ];

  const additionalAttributes = [
    { key: 'occupation' as keyof PersonaFormData, displayName: 'Occupation' },
    { key: 'industry' as keyof PersonaFormData, displayName: 'Industry' },
    { key: 'categoryAwareness' as keyof PersonaFormData, displayName: 'Category Awareness' },
  ];

  return (
    <div className="persona-summary">
      {/* "Persona 1" + pencil icon */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="persona-summary__header"
      >
        <h2 className="persona-summary__name">{personaName}</h2>
        {onEditName && (
          <button
            onClick={onEditName}
            className="persona-summary__edit-btn"
            aria-label="Edit persona name"
          >
            <SpIcon name="sp-Edit-Edit_Pencil_01" />
          </button>
        )}
      </motion.div>

      {/* 2×2 cards */}
      <div className="persona-summary__cards">
        <CategorySummaryCard
          title="Core Identity"
          description="Traits that define this persona's identity."
          attributes={coreIdentityAttributes}
          formData={formData}
        />
        <CategorySummaryCard
          title="Phycological Traits"
          description="What drives their thinking and decisions"
          attributes={phycologicalAttributes}
          formData={formData}
        />
        <CategorySummaryCard
          title="Behavioural Traits"
          description="How they act and operate"
          attributes={behaviouralAttributes}
          formData={formData}
        />

        {/* ── Formative Experience — rendered separately since it's a plain string, not formData ── */}
        <CategorySummaryCard
          title="Formative Experience"
          description="Backstories and scenarios - moments that shape how this persona thinks, decides, and behaves"
          attributes={[]}
          formData={formData}
          formativeExperience={formativeExperience}
        />

        <CategorySummaryCard
          title="Additional Traits"
          description="Additional Traits"
          attributes={additionalAttributes}
          formData={formData}
        />
      </div>
    </div>
  );
};

export default PersonaSummaryView;