import React from 'react';

const TabNavigation = ({ tabs, activeTab, onTabChange }) => {
  return (
    <div className="w-full my-2 scrollbar-hide">
      <div className="w-full py-1 rounded-xl">
        <div className="flex bg-gray-50 dark:bg-white/5 p-0.5 rounded-xl border border-gray-200 dark:border-white/10 shadow-xs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 px-2 py-3 rounded-lg items-center justify-center gap-2 transition-all duration-300 focus:outline-none relative overflow-hidden ${activeTab === tab.id
                ? 'bg-white dark:bg-white/10 shadow-md text-gray-900 dark:text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5'
                }`}
            >
              <span
                className={`text-sm ${activeTab === tab.id ? 'font-semibold' : 'font-medium'
                  }`}
              >
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TabNavigation;