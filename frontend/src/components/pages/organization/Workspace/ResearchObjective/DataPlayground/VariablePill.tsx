import React from 'react';
import type { Variable } from './DataPlayground';
import './DataPlayground.css';

interface VariablePillProps {
  variable: Variable;
  selected?: boolean;
  onClick: (variable: Variable) => void;
  showLeftArrow?: boolean;
}

const VariablePill: React.FC<VariablePillProps> = ({
  variable,
  selected = false,
  onClick,
  showLeftArrow = false,
}) => {
  return (
    <button
      className={`dp-pill${selected ? ' dp-pill--selected' : ''}`}
      onClick={() => onClick(variable)}
      title={variable.label}
    >
      {showLeftArrow && selected && (
        <span className="dp-pill-arrow">←</span>
      )}
      <span className="dp-pill-label">{variable.label}</span>
      {!showLeftArrow && selected && (
        <span className="dp-pill-arrow">→</span>
      )}
    </button>
  );
};

export default VariablePill;