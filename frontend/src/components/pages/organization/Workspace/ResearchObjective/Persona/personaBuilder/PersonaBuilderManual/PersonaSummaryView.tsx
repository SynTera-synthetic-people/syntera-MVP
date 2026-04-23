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
  /** Called when user removes a pill — parent updates formData */
  onRemoveAttribute?: (key: keyof PersonaFormData, valueToRemove: string) => void;
  /** Called when user clears formative experience */
  onRemoveFormativeExperience?: () => void;
}

const PersonaSummaryView: React.FC<PersonaSummaryViewProps> = ({
  personaName,
  formData,
  formativeExperience,
  onEditName,
  onRemoveAttribute,
  onRemoveFormativeExperience,
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

      {/*
        ── Masonry column order fix ──────────────────────────────────────────
        CSS column-count flows cards top→bottom per column.
        With 2 columns and 5 cards the natural fill is:
          Col 1: card 1, card 3, card 5
          Col 2: card 2, card 4
        To get the Figma layout:
          Col 1: Core Identity, Behavioural Traits, Additional Traits
          Col 2: Phycological Traits, Formative Experience
        …we must order the cards as:
          1. Core Identity        → col 1 top
          2. Phycological Traits  → col 2 top
          3. Behavioural Traits   → col 1 middle
          4. Formative Experience → col 2 middle
          5. Additional Traits    → col 1 bottom
      */}
      <div className="persona-summary__cards">
        {/* 1 — col 1 top */}
        <CategorySummaryCard
          title="Core Identity"
          description="Traits that define this persona's identity."
          attributes={coreIdentityAttributes}
          formData={formData}
          {...(onRemoveAttribute && { onRemoveAttribute })}
        />
        {/* 2 — col 2 top */}
        <CategorySummaryCard
          title="Phycological Traits"
          description="What drives their thinking and decisions"
          attributes={phycologicalAttributes}
          formData={formData}
          {...(onRemoveAttribute && { onRemoveAttribute })}
        />
        {/* 3 — col 1 middle */}
        <CategorySummaryCard
          title="Behavioural Traits"
          description="How they act and operate"
          attributes={behaviouralAttributes}
          formData={formData}
          {...(onRemoveAttribute && { onRemoveAttribute })}
        />
        {/* 4 — col 2 middle */}
        <CategorySummaryCard
          title="Formative Experience"
          description="Backstories and scenarios - moments that shape how this persona thinks, decides, and behaves"
          attributes={[]}
          formData={formData}
          {...(formativeExperience && { formativeExperience })}
          {...(onRemoveFormativeExperience && { onRemoveFormativeExperience })}
        />
        {/* 5 — col 1 bottom */}
        <CategorySummaryCard
          title="Additional Traits"
          description="Additional Traits"
          attributes={additionalAttributes}
          formData={formData}
          {...(onRemoveAttribute && { onRemoveAttribute })}
        />
      </div>
    </div>
  );
};

export default PersonaSummaryView;