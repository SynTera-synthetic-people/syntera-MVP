// ══════════════════════════════════════════════════════════════════════════════
// AttributeSelectionPanel — Figma Accurate
// Renders pills with "or + Add Custom", geography gets dropdowns
// ══════════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbPlus } from 'react-icons/tb';
import AttributePillButton from './AttributePillButton';
import { getAttributeOptions, isMultiSelectAttribute } from '../data';
import './AttributeSelectionPanel.css';

interface AttributeSelectionPanelProps {
  attributeName: string;
  currentValue: string | string[] | undefined;
  onSelect: (value: string | string[]) => void;
  disabled?: boolean;
}

const GEO_ATTRIBUTE = 'Geography';

const AttributeSelectionPanel: React.FC<AttributeSelectionPanelProps> = ({
  attributeName,
  currentValue,
  onSelect,
  disabled = false,
}) => {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const options = getAttributeOptions(attributeName);
  const isMultiSelect = isMultiSelectAttribute(attributeName);
  const isGeo = attributeName === GEO_ATTRIBUTE;

  const selectedValues = Array.isArray(currentValue)
    ? currentValue
    : currentValue
    ? [currentValue]
    : [];

  const handlePillClick = (value: string) => {
    if (disabled) return;
    if (isMultiSelect) {
      const next = selectedValues.includes(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value];
      onSelect(next);
    } else {
      onSelect(selectedValues.includes(value) ? '' : value);
    }
  };

  const handleAddCustom = () => {
    if (!customValue.trim()) return;
    if (isMultiSelect) {
      onSelect([...selectedValues, customValue.trim()]);
    } else {
      onSelect(customValue.trim());
    }
    setCustomValue('');
    setShowCustomInput(false);
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddCustom(); }
    if (e.key === 'Escape') { setCustomValue(''); setShowCustomInput(false); }
  };

  return (
    <div className="attribute-selection">
      <h3 className="attribute-selection__title">
        Select {attributeName}
        {isMultiSelect && <span className="attribute-selection__badge">Multiple</span>}
      </h3>

      {isGeo ? (
        /* Geography — dropdown selects */
        <div className="attribute-selection__geo-row">
          <select
            className="attribute-selection__geo-select"
            disabled={disabled}
            onChange={(e) => onSelect(e.target.value)}
          >
            <option value="">Country</option>
            <option value="India">India</option>
            <option value="USA">USA</option>
            <option value="UK">UK</option>
          </select>
          <select className="attribute-selection__geo-select" disabled={disabled}>
            <option value="">State</option>
            <option value="Gujarat">Gujarat</option>
            <option value="Maharashtra">Maharashtra</option>
          </select>
          <select className="attribute-selection__geo-select" disabled={disabled}>
            <option value="">City</option>
            <option value="Dahod">Dahod</option>
            <option value="Ahmedabad">Ahmedabad</option>
          </select>
          <span className="attribute-selection__or">or</span>
          <button className="attribute-selection__add-custom" disabled={disabled}>
            <TbPlus size={14} />
            Add Custom
          </button>
        </div>
      ) : (
        /* All other attributes — pill buttons */
        <div className="attribute-selection__pills">
          {options.map((option, i) => (
            <AttributePillButton
              key={`${option}-${i}`}
              label={option}
              value={option}
              isSelected={selectedValues.includes(option)}
              onClick={handlePillClick}
              disabled={disabled}
            />
          ))}

          <span className="attribute-selection__or">or</span>

          <AnimatePresence mode="wait">
            {!showCustomInput ? (
              <motion.button
                key="add-btn"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                type="button"
                onClick={() => setShowCustomInput(true)}
                disabled={disabled}
                className="attribute-selection__add-custom"
              >
                <TbPlus size={14} />
                Add Custom
              </motion.button>
            ) : (
              <motion.div
                key="custom-input"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                className="attribute-selection__custom-input-wrapper"
              >
                <input
                  type="text"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyDown={handleCustomKeyDown}
                  onBlur={() => { if (!customValue.trim()) setShowCustomInput(false); }}
                  placeholder="Type and press Enter"
                  className="attribute-selection__custom-input"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddCustom}
                  disabled={!customValue.trim()}
                  className="attribute-selection__custom-btn attribute-selection__custom-btn--add"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setCustomValue(''); setShowCustomInput(false); }}
                  className="attribute-selection__custom-btn attribute-selection__custom-btn--cancel"
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {isMultiSelect && selectedValues.length > 0 && (
        <p className="attribute-selection__hint">{selectedValues.length} selected</p>
      )}
    </div>
  );
};

export default AttributeSelectionPanel;
