import React, { useState, useEffect } from 'react';
import { motion } from "framer-motion";
import { optionData, optionTooltips, multiSelectAttributes } from "../data";
import { TbPlus, TbCheck, TbX, TbTrash } from "react-icons/tb";
import Tooltip from '../../../../../../../common/Tooltip';

const SelectionPanel = ({ editingItem, currentValue, onSelect }) => {
  const [customValue, setCustomValue] = useState('');

  const isMultiSelect = multiSelectAttributes.includes(editingItem?.item);
  const options = optionData[editingItem?.item] || [];
  const tooltips = optionTooltips[editingItem?.item] || {};

  // Normalize currentValue to an array for multi-select
  const selectedOptions = isMultiSelect
    ? (Array.isArray(currentValue) ? currentValue : (currentValue ? currentValue.split(',').map(s => s.trim()) : []))
    : [currentValue];

  const isCustomValue = !isMultiSelect && currentValue && !options.includes(currentValue);

  useEffect(() => {
    if (editingItem) {
      if (isCustomValue) {
        setCustomValue(currentValue);
      } else {
        setCustomValue('');
      }
    }
  }, [editingItem, currentValue, isCustomValue]);

  const toggleOption = (option) => {
    if (isMultiSelect) {
      const newSelected = selectedOptions.includes(option)
        ? selectedOptions.filter(item => item !== option)
        : [...selectedOptions, option];
      onSelect(newSelected);
    } else {
      // If already selected, deselect it (set to empty string)
      if (selectedOptions.includes(option)) {
        onSelect("");
      } else {
        onSelect(option);
      }
    }
  };

  const handleClear = () => {
    onSelect(isMultiSelect ? [] : "");
  };

  if (!editingItem) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex-grow"
    >
      <div className="bg-gray-50 dark:bg-black/20 rounded-2xl p-6 border border-gray-200 dark:border-white/10 h-full">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {isMultiSelect ? `Select ${editingItem.item} (Multiple)` : `Select ${editingItem.item}`}
          </h3>
          {(selectedOptions.length > 0 && selectedOptions[0] !== "") && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
              title={`Clear ${editingItem.item} selection`}
            >
              <TbTrash size={14} />
              <span>Clear Selection</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {options.map(option => (
            <Tooltip
              key={option}
              content={tooltips[option]}
              position="top"
              className="w-full"
              delay={200}
            >
              <button
                onClick={() => toggleOption(option)}
                className={`w-full p-4 rounded-xl text-left font-semibold transition-all border flex items-center justify-between ${selectedOptions.includes(option)
                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30'
                  : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-blue-400 dark:hover:border-blue-500/50 shadow-sm'
                  }`}
              >
                <span>{option}</span>
                {selectedOptions.includes(option) && <TbCheck size={18} />}
              </button>
            </Tooltip>
          ))}
        </div>

        <div className="pt-6 border-t border-gray-200 dark:border-white/10">
          <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">
            {isMultiSelect ? "Selected Options" : "Or Use Custom Value"}
          </label>
          {isMultiSelect ? (
            <div className="flex flex-wrap gap-2 min-h-[3rem]">
              {selectedOptions.length > 0 ? (
                selectedOptions.map(option => (
                  <span
                    key={option}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-bold border border-blue-200 dark:border-blue-800"
                  >
                    {option}
                    <button
                      onClick={() => toggleOption(option)}
                      className="hover:text-blue-900 dark:hover:text-blue-100 p-0.5"
                    >
                      <TbX size={14} />
                    </button>
                  </span>
                ))
              ) : (
                <p className="text-sm text-gray-400 italic">No selections made yet</p>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder={`Enter custom ${editingItem.item.toLowerCase()}...`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customValue.trim() && customValue !== currentValue) {
                    onSelect(customValue.trim());
                  }
                }}
                className="flex-grow bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
              />
              <button
                onClick={() => customValue.trim() && onSelect(customValue.trim())}
                disabled={!customValue.trim() || customValue === currentValue}
                title={customValue === currentValue && isCustomValue ? "Current Value" : "Apply Custom Value"}
                className={`p-3 rounded-xl transition-all flex items-center justify-center min-w-[3.5rem] ${customValue === currentValue && isCustomValue
                  ? 'bg-green-500 text-white cursor-default'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
              >
                {customValue === currentValue && isCustomValue ? <TbCheck size={24} /> : <TbPlus size={24} />}
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default SelectionPanel;