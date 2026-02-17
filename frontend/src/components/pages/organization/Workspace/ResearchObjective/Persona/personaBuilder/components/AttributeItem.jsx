import React from 'react';
import { TbChevronRight } from "react-icons/tb";
import Tooltip from '../../../../../../../common/Tooltip';
import { attributeTooltips } from '../data';

const AttributeItem = ({ item, currentValue, isEditing, onClick, disabled = false }) => {
  return (
    <div className="w-full mb-3 last:mb-0 group"> {/* Each item in its own row */}
      <Tooltip
        content={disabled ? "Omi Recommended - Read Only" : (attributeTooltips[item] || "Click to select or edit")}
        position="top"
        delay={300}
        className="w-full"
      >
        <button
          onClick={disabled ? undefined : onClick}
          className={`relative w-full flex items-center justify-between p-4 rounded-xl transition-all duration-200 border overflow-hidden ${isEditing
            ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 shadow-sm'
            : (disabled
              ? 'bg-gray-50/50 dark:bg-white/5 border-gray-100 dark:border-white/5 cursor-default'
              : 'bg-white dark:bg-white/5 border-gray-200 dark:border-transparent hover:bg-gray-50 dark:hover:bg-white/10 shadow-sm')
            }`}
        >
          {/* Top center blue indicator on hover - only if not disabled */}
          {!disabled && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-blue-500 rounded-b-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10" />
          )}

          <div className={`grid ${disabled ? 'grid-cols-1' : 'grid-cols-[85px_1fr]'} gap-2 items-start group-hover:items-center text-left w-full transition-all`}>
            {/* Attribute label */}
            <span className="font-semibold text-sm text-gray-700 dark:text-gray-300 break-words leading-tight">
              {item}
            </span>

            {/* Current value */}
            <div className="min-w-0">
              {currentValue ? (
                <span className={`block text-sm font-bold truncate ${disabled ? 'text-gray-900 dark:text-white' : 'text-blue-600 dark:text-blue-400'}`}>
                  {Array.isArray(currentValue) ? currentValue.join(', ') : currentValue}
                </span>
              ) : (
                <span className="block text-sm text-gray-400 dark:text-gray-600 italic truncate">
                  {disabled ? "Not Specified" : "Select"}
                </span>
              )}
            </div>
          </div>

          {/* Chevron icon - hide if disabled */}
          {!disabled && (
            <div className="ml-4 flex-shrink-0">
              <TbChevronRight
                className={`text-gray-400 transition-transform ${isEditing ? 'rotate-90 text-blue-500' : ''}`}
                size={20}
              />
            </div>
          )}
        </button>
      </Tooltip>
    </div>
  );
};

export default AttributeItem;