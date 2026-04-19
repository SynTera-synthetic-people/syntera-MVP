import React from 'react';

const toText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.label === 'string') return value.label;
    if (typeof value.value === 'string' || typeof value.value === 'number' || typeof value.value === 'boolean') {
      return String(value.value);
    }
  }
  return '';
};

const QuestionnaireTabs = ({ sections, activeIndex, onTabClick }) => {
  return (
    <div className="flex gap-8 overflow-x-auto border-b border-gray-200 dark:border-white/10 mb-8 no-scrollbar">
      {sections.map((section, index) => (
        <button
          key={section.section_id || section.id || index}
          onClick={() => onTabClick(index)}
          className={`pb-3 px-1 whitespace-nowrap transition-all font-bold text-sm relative ${activeIndex === index
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
        >
          {toText(section.title).trim() || 'Untitled Section'}
          {activeIndex === index && (
            <div
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
            />
          )}
        </button>
      ))}
    </div>
  );
};

export default QuestionnaireTabs;
