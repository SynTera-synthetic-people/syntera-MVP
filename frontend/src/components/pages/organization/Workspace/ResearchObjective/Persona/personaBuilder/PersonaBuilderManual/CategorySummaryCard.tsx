// ══════════════════════════════════════════════════════════════════════════════
// CategorySummaryCard — always renders (empty state shows title + description)
// ══════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { motion } from 'framer-motion';
import type { PersonaFormData } from '../PersonaBuilderType';
import './CategorySummaryCard.css';

interface CategorySummaryCardProps {
  title: string;
  description?: string;
  attributes: Array<{
    key: keyof PersonaFormData;
    displayName: string;
  }>;
  formData: PersonaFormData;
  /** Only used by the Formative Experience card — plain string, not part of formData */
  formativeExperience?: string;
}

const CategorySummaryCard: React.FC<CategorySummaryCardProps> = ({
  title,
  description,
  attributes,
  formData,
  formativeExperience,
}) => {
  const filledAttributes = attributes.filter((attr) => {
    const value = formData[attr.key];
    if (Array.isArray(value)) return value.length > 0;
    return value && value.toString().trim() !== '';
  });

  const renderAttributeValue = (value: string | string[] | undefined): React.ReactNode => {
    if (!value) return null;
    if (Array.isArray(value)) {
      return (
        <div className="category-card__pills">
          {value.map((item, index) => (
            <span key={index} className="category-card__pill">{item}</span>
          ))}
        </div>
      );
    }
    return (
      <div className="category-card__pills">
        <span className="category-card__pill">{value}</span>
      </div>
    );
  };

  // Whether this card has anything to show
  const hasContent = filledAttributes.length > 0 || (formativeExperience && formativeExperience.trim() !== '');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="category-card"
    >
      <div className="category-card__header">
        <h3 className="category-card__title">{title}</h3>
        {description && (
          <p className="category-card__description">{description}</p>
        )}
      </div>

      {/* Pill attributes (Demographics, Behavioural, etc.) */}
      {filledAttributes.length > 0 && (
        <div className="category-card__content">
          {filledAttributes.map((attr) => {
            const value = formData[attr.key];
            return (
              <div key={attr.key} className="category-card__attribute">
                {renderAttributeValue(value)}
              </div>
            );
          })}
        </div>
      )}

      {/* Formative Experience — plain text block */}
      {formativeExperience && formativeExperience.trim() !== '' && (
        <p className="category-card__formative-text">
          {formativeExperience}
        </p>
      )}
    </motion.div>
  );
};

export default CategorySummaryCard;