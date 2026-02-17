import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const Tooltip = ({ children, content, position = 'top', className = '' }) => {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 mb-2',
    'top-left': 'bottom-full left-0 mb-2',
    'top-right': 'bottom-full right-0 mb-2',
    bottom: 'top-full left-1/2 mt-2',
    left: 'right-full top-1/2 mr-2',
    right: 'left-full top-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-[#1a1c1e]',
    'top-left': 'top-full left-4 border-t-[#1a1c1e]',
    'top-right': 'top-full right-4 border-t-[#1a1c1e]',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-[#1a1c1e]',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-[#1a1c1e]',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-[#1a1c1e]',
  };

  // Centering logic for Framer Motion to avoid CSS transform conflicts
  const isCenteredX = ['top', 'bottom'].includes(position);
  const isCenteredY = ['left', 'right'].includes(position);

  return (
    <div
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && content && (
          <motion.div
            initial={{
              opacity: 0,
              scale: 0.95,
              x: isCenteredX ? "-50%" : 0,
              y: isCenteredY ? "-50%" : (position === 'top' ? 5 : position === 'bottom' ? -5 : 0)
            }}
            animate={{
              opacity: 1,
              scale: 1,
              x: isCenteredX ? "-50%" : 0,
              y: isCenteredY ? "-50%" : 0
            }}
            exit={{
              opacity: 0,
              scale: 0.95,
              x: isCenteredX ? "-50%" : 0,
              y: isCenteredY ? "-50%" : (position === 'top' ? 5 : position === 'bottom' ? -5 : 0)
            }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={`absolute z-[100] px-4 py-2.5 text-[12px] leading-tight font-medium text-white bg-[#1a1c1e] rounded-xl shadow-2xl w-max max-w-[450px] whitespace-normal break-words pointer-events-none border border-white/10 backdrop-blur-md text-left ${positionClasses[position]}`}
          >
            {content}
            <div className={`absolute border-4 border-transparent ${arrowClasses[position]}`} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Tooltip;
