// ══════════════════════════════════════════════════════════════════════════════
// AttributePillButton — Figma Accurate
// ══════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { motion } from 'framer-motion';
import './AttributePillButton.css';

interface AttributePillButtonProps {
  label: string;
  value: string;
  isSelected: boolean;
  onClick: (value: string) => void;
  disabled?: boolean;
  variant?: 'default' | 'custom';
}

const AttributePillButton: React.FC<AttributePillButtonProps> = ({
  label,
  value,
  isSelected,
  onClick,
  disabled = false,
  variant = 'default',
}) => {
  return (
    <motion.button
      type="button"
      onClick={() => !disabled && onClick(value)}
      disabled={disabled}
      className={[
        'attribute-pill',
        isSelected ? 'attribute-pill--selected' : '',
        disabled ? 'attribute-pill--disabled' : '',
        variant === 'custom' ? 'attribute-pill--custom' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      {...(!disabled && {
        whileHover: { scale: 1.03 },
        whileTap: { scale: 0.97 },
      })}
    >
      {label}
    </motion.button>
  );
};

export default AttributePillButton;
