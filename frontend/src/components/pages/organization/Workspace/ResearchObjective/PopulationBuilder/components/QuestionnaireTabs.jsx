import React from 'react';
import { motion } from 'framer-motion';

const QuestionnaireTabs = ({ sections, activeIndex, onTabClick }) => {
  return (
    <div className="flex gap-8 overflow-x-auto border-b border-gray-200 dark:border-white/10 mb-8 no-scrollbar">
      {sections.map((section, index) => (
        <button
          key={index}
          onClick={() => onTabClick(index)}
          className={`pb-3 px-1 whitespace-nowrap transition-all font-bold text-sm relative ${activeIndex === index
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
        >
          {section.title}
          {activeIndex === index && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400"
            />
          )}
        </button>
      ))}
    </div>
  );
};

export default QuestionnaireTabs;