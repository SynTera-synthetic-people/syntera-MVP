import React from 'react';
import { motion } from "framer-motion";
import { TbChevronDown, TbChevronUp } from "react-icons/tb";
import Tooltip from '../../../../../../../common/Tooltip';
import { contentData } from '../data';

const TabsNavigation = ({ tabs, activeTab, onTabChange }) => {
  return (
    <div className="relative mb-8 border-b border-gray-200 dark:border-white/10">
      <div className="flex overflow-x-auto space-x-6 scrollbar-none pb-0">
        {tabs.map(tab => (
          <Tooltip
            key={tab}
            content={contentData[tab]?.tooltip || "Click to view or edit attributes"}
            position="top"
          >
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`relative flex items-center gap-2 pb-4 whitespace-nowrap text-sm font-semibold transition-all duration-300 focus:outline-none ${activeTab === tab
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-300"
                }`}
            >
              <span>{tab}</span>
              {activeTab === tab ? <TbChevronUp size={18} /> : <TbChevronDown size={18} />}
              {activeTab === tab && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full"
                />
              )}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
};

export default TabsNavigation;