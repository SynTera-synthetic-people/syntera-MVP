// ══════════════════════════════════════════════════════════════════════════════
// SubTabNavigation Component
// Horizontal navigation for sub-tabs within main categories
// ══════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { motion } from 'framer-motion';
import type { SubTab } from '../PersonaBuilderType';
import './SubTabNavigation.css';

interface SubTabNavigationProps {
  subTabs: SubTab[];
  activeSubTab: string;
  onSubTabChange: (subTabId: string) => void;
  completedSubTabs?: string[];
}

const SubTabNavigation: React.FC<SubTabNavigationProps> = ({
  subTabs,
  activeSubTab,
  onSubTabChange,
  completedSubTabs = [],
}) => {
  return (
    <div className="subtab-nav">
      <div className="subtab-nav__container">
        {subTabs.map((subTab, index) => {
          const isActive = activeSubTab === subTab.id;
          const isCompleted = completedSubTabs.includes(subTab.id);
          
          return (
            <button
              key={subTab.id}
              onClick={() => onSubTabChange(subTab.id)}
              className={`subtab-nav__item ${
                isActive ? 'subtab-nav__item--active' : ''
              } ${isCompleted ? 'subtab-nav__item--completed' : ''}`}
            >
              <span className="subtab-nav__label">{subTab.label}</span>
              {isActive && (
                <motion.div
                  layoutId="activeSubTabIndicator"
                  className="subtab-nav__indicator"
                  initial={false}
                  transition={{
                    type: 'spring',
                    stiffness: 380,
                    damping: 30,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SubTabNavigation;