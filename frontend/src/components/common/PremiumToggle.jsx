import React from "react";
import { motion } from "framer-motion";

/**
 * PremiumToggle - Reusable toggle switch component
 * 
 * @param {Object} props
 * @param {boolean} props.enabled - Current state
 * @param {Function} props.onChange - Change handler
 * @param {string} props.label - Optional label
 * @param {string} props.description - Optional description
 * @param {string} props.className - Additional CSS classes
 */
const PremiumToggle = ({
  enabled,
  onChange,
  label,
  description,
  className = ""
}) => {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      {(label || description) && (
        <div className="mr-4">
          {label && (
            <div className="text-sm font-medium text-gray-900 dark:text-gray-200">
              {label}
            </div>
          )}
          {description && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {description}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
          }`}
      >
        <span className="sr-only">Use setting</span>
        <span
          className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
        />
      </button>
    </div>
  );
};

export default PremiumToggle;
