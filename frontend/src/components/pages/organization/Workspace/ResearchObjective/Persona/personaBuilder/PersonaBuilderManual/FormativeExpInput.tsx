// ══════════════════════════════════════════════════════════════════════════════
// FormativeExperienceInput Component
// Large textarea for entering formative experiences / backstory
// ══════════════════════════════════════════════════════════════════════════════

import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import './FormativeExpInput.css';

interface FormativeExperienceInputProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
}

const FormativeExperienceInput: React.FC<FormativeExperienceInputProps> = ({
  value,
  onChange,
  maxLength = 1000,
  placeholder,
  disabled = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= maxLength) {
      onChange(newValue);
    }
  };

  const characterCount = value.length;
  const isNearLimit = characterCount >= maxLength * 0.9;

  const defaultPlaceholder = `Add key experiences or moments that shape how this persona thinks and decides.
For example:
1. Tried multiple fitness apps but dropped off within weeks due to lack of motivation
2. Tracks expenses actively but rarely sticks to budgets
3. Plans extensively but books last-minute deals
4. Relies heavily on reviews and peer recommendations`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="formative-input"
    >
      <div className="formative-input__header">
        <label className="formative-input__label">
          Description
          <span className="formative-input__info-icon" title="Enter formative experiences that define this persona">
            ⓘ
          </span>
        </label>
        <span
          className={`formative-input__counter ${
            isNearLimit ? 'formative-input__counter--warning' : ''
          }`}
        >
          {characterCount}/{maxLength}
        </span>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder || defaultPlaceholder}
        disabled={disabled}
        className="formative-input__textarea"
        rows={8}
      />
    </motion.div>
  );
};

export default FormativeExperienceInput;