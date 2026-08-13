import React from 'react';
import type { Variable } from './DataPlayground';
import './DataPlayground.css';

interface VariablePillProps {
  variable: Variable;
  /**
   * 'source'   — pill inside the "All Variables" list. Gets a solid mint
   *              fill once the variable has been added elsewhere.
   * 'selected' — pill inside a "Selected/Banner/Main Variables" list. Stays
   *              the neutral slate fill; the *focused* item shows a mint
   *              arrow badge instead of turning the whole pill mint.
   */
  variant?: 'source' | 'selected';
  /** Source variant: true once this variable has been added to a target list. */
  added?: boolean;
  /** Selected variant: true if this is the item Up/Down controls act on. */
  focused?: boolean;
  /** Arrow direction for the little mint badge (source hover / selected focus). */
  arrowDirection?: 'left' | 'right';
  onClick: (variable: Variable) => void;

  // Drag & drop (all optional — components that don't wire these up simply
  // won't be draggable).
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, variable: Variable) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, variable: Variable) => void;
  onDragEnd?: (e: React.DragEvent) => void;

  /** @deprecated use `variant`/`focused` instead — kept for backward compat. */
  selected?: boolean;
  /** @deprecated use `arrowDirection` instead. */
  showLeftArrow?: boolean;
}

const VariablePill: React.FC<VariablePillProps> = ({
  variable,
  variant = 'source',
  added,
  focused,
  arrowDirection,
  onClick,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  selected,
  showLeftArrow,
}) => {
  // Backward-compat shim: old callers passed `selected` + `showLeftArrow`.
  const isSourceAdded = variant === 'source' && (added ?? (variant === 'source' ? selected : false));
  const isFocused = variant === 'selected' && (focused ?? selected ?? false);
  const direction = arrowDirection ?? (showLeftArrow ? 'left' : 'right');

  const showArrowBadge =
    (variant === 'source' && !isSourceAdded) || (variant === 'selected' && isFocused);

  return (
    <button
      className={`dp-pill${isSourceAdded ? ' dp-pill--added' : ''}${isFocused ? ' dp-pill--focused' : ''}`}
      onClick={() => onClick(variable)}
      title={variable.label}
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, variable)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop?.(e, variable)}
      onDragEnd={onDragEnd}
    >
      {direction === 'left' && showArrowBadge && (
        <span className={`dp-pill-arrow-badge${isFocused ? ' dp-pill-arrow-badge--pinned' : ''}`}>←</span>
      )}
      <span className="dp-pill-label">{variable.label}</span>
      {direction === 'right' && showArrowBadge && (
        <span className={`dp-pill-arrow-badge${isFocused ? ' dp-pill-arrow-badge--pinned' : ''}`}>→</span>
      )}
    </button>
  );
};

export default VariablePill;