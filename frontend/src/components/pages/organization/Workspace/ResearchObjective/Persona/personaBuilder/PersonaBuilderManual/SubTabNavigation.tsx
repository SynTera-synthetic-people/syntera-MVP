// ══════════════════════════════════════════════════════════════════════════════
// SubTabNavigation Component
// ══════════════════════════════════════════════════════════════════════════════

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { SubTab } from '../PersonaBuilderType';
import SpIcon from '../../../../../../../SPIcon';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Use a small timeout to let the DOM settle after render
    requestAnimationFrame(() => {
      setCanScrollLeft(el.scrollLeft > 2);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    const wrapper = wrapperRef.current;
    if (!el) return;

    // Run immediately + after a short delay to catch layout paint
    updateScrollState();
    const timer = setTimeout(updateScrollState, 100);

    el.addEventListener('scroll', updateScrollState, { passive: true });

    // Observe both the scroll container and its wrapper
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    if (wrapper) ro.observe(wrapper);

    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState, subTabs]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -160 : 160, behavior: 'smooth' });
  };

  return (
    <div ref={wrapperRef} className="subtab-nav">
      {canScrollLeft && (
        <button
          className="subtab-nav__arrow subtab-nav__arrow--left"
          onClick={() => scroll('left')}
          aria-label="Scroll tabs left"
        >
          <SpIcon name="sp-Arrow-Arrow_Left_SM" size={16} />
        </button>
      )}

      <div ref={scrollRef} className="subtab-nav__container">
        {subTabs.map((subTab) => {
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
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {canScrollRight && (
        <button
          className="subtab-nav__arrow subtab-nav__arrow--right"
          onClick={() => scroll('right')}
          aria-label="Scroll tabs right"
        >
          <SpIcon name="sp-Arrow-Arrow_Right_SM" size={16} />
        </button>
      )}
    </div>
  );
};

export default SubTabNavigation;