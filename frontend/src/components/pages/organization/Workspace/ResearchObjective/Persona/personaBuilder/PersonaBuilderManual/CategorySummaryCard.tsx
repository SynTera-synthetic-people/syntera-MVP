// ══════════════════════════════════════════════════════════════════════════════
// CategorySummaryCard — always renders (empty state shows title + description)
// ══════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { motion } from 'framer-motion';
import type { PersonaFormData } from '../PersonaBuilderType';
import SpIcon from '../../../../../../../SPIcon';
import './CategorySummaryCard.css';

interface CategorySummaryCardProps {
  title: string;
  description?: string;
  attributes: Array<{
    key: keyof PersonaFormData;
    displayName: string;
  }>;
  formData: PersonaFormData;
  formativeExperience?: string;
  onRemoveAttribute?: (key: keyof PersonaFormData, valueToRemove: string) => void;
  onRemoveFormativeExperience?: () => void;
}

const CategorySummaryCard: React.FC<CategorySummaryCardProps> = ({
  title,
  description,
  attributes,
  formData,
  formativeExperience,
  onRemoveAttribute,
  onRemoveFormativeExperience,
}) => {
  const filledAttributes = attributes.filter((attr) => {
    const value = formData[attr.key];
    if (Array.isArray(value)) return value.length > 0;
    return value && value.toString().trim() !== '';
  });

  const renderAttributeValue = (
    key: keyof PersonaFormData,
    value: string | string[] | undefined,
    displayName: string,
  ): React.ReactNode => {
    if (!value) return null;

    const pills = Array.isArray(value) ? value : [value];

    return (
      <div className="category-card__pills">
        {pills.map((item, index) => (
          <span key={index} className="category-card__pill">
            <span className="category-card__pill-tooltip">{displayName}</span>
            {item}
            {onRemoveAttribute && (
              <button
                className="category-card__pill-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveAttribute(key, item);
                }}
                aria-label={`Remove ${item}`}
                title={`Remove ${item}`}
              >
                <SpIcon name="sp-Menu-Close_MD" size={15} />
              </button>
            )}
          </span>
        ))}
      </div>
    );
  };

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

      {/* Pill attributes */}
      {filledAttributes.length > 0 && (
        <div className="category-card__content">
          {filledAttributes.map((attr) => {
            const value = formData[attr.key];
            return (
              <div key={attr.key} className="category-card__attribute">
                {renderAttributeValue(attr.key, value, attr.displayName)}
              </div>
            );
          })}
        </div>
      )}

      {/* Formative Experience */}
      {formativeExperience && formativeExperience.trim() !== '' && (
        <div className="category-card__formative-wrap">
          <p className="category-card__formative-text">
            {formativeExperience}
          </p>
          {onRemoveFormativeExperience && (
            <button
              className="category-card__formative-remove"
              onClick={onRemoveFormativeExperience}
              aria-label="Remove formative experience"
              title="Remove formative experience"
            >
              <SpIcon name="sp-Menu-Close_SM" size={10} />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default CategorySummaryCard;