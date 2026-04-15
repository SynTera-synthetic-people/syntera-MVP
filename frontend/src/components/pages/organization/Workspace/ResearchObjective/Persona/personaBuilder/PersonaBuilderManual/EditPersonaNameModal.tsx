// ══════════════════════════════════════════════════════════════════════════════
// EditPersonaNameModal — Figma Accurate
// Triggered by pencil icon next to "Persona 1"
// ══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbDeviceFloppy, TbX } from 'react-icons/tb';
import SpIcon from '../../../../../../../SPIcon';
import './EditPersonaNameModal.css';

const MAX_LENGTH = 100;

interface EditPersonaNameModalProps {
  isOpen: boolean;
  currentName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

const EditPersonaNameModal: React.FC<EditPersonaNameModalProps> = ({
  isOpen,
  currentName,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync with currentName when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      // Focus input after animation settles
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen, currentName]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="epn-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handleBackdropClick}
        >
          <motion.div
            className="epn-modal"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="epn-title"
          >
            {/* Title */}
            <h2 className="epn-title" id="epn-title">Edit Persona Name</h2>
            <p className="epn-subtitle">Content goes here</p>

            {/* Input */}
            <div className="epn-input-wrapper">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, MAX_LENGTH))}
                onKeyDown={handleKeyDown}
                className="epn-input"
                placeholder="Persona Name"
                maxLength={MAX_LENGTH}
              />
              <span className="epn-char-count">{name.length}/{MAX_LENGTH}</span>
            </div>

            {/* Actions */}
            <div className="epn-actions">
              <button className="epn-btn epn-btn--cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                className="epn-btn epn-btn--save"
                onClick={handleSave}
                disabled={!name.trim()}
              >
                <SpIcon name="sp-System-Save" />
                Save
              </button>
            </div>

            {/* Close X */}
            <button className="epn-close" onClick={onClose} aria-label="Close">
              <SpIcon name="sp-Menu-Close_SM" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default EditPersonaNameModal;