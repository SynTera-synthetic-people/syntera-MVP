import React from 'react';
import { motion } from 'framer-motion';

const TraceabilityScore = ({
  score = 0,
  label,
  percentage = 0,
  breakdown = [],
  title = "Your Confidence Score",
  description
}) => {
  return (
    <div className="mt-8 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-500/5 dark:to-blue-500/5 border border-purple-100 dark:border-purple-500/20 rounded-2xl p-8 backdrop-blur-xl relative overflow-hidden font-sans">
      {/* Decorative background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-blue-500/5 blur-[100px] pointer-events-none" />

      <div className="relative z-10 text-center">
        <h3 className="text-gray-500 dark:text-gray-400 font-bold text-sm uppercase tracking-[0.2em] mb-4">
          {title}
        </h3>

        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-bold text-purple-600 dark:text-purple-400 tracking-tighter">
              {percentage}%
            </span>
          </div>
          <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
            {label}
          </span>
        </div>

        {/* Progress Bar Container */}
        <div className="flex items-center justify-center gap-4 max-w-xl mx-auto mb-8 pr-12">
          <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700/50 rounded-full overflow-hidden relative">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-purple-600 to-blue-500 relative rounded-full"
            >
              {/* Pattern Overlay for the progress part */}
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_2px_2px,_rgba(255,255,255,0.4)_1px,_transparent_0)] bg-[length:4px_4px]" />
            </motion.div>

            {/* Percentage Label */}
            <div className="absolute right-[-60px] top-1/2 -translate-y-1/2 text-blue-600 dark:text-blue-400 font-bold text-lg">
              {percentage}%
            </div>
          </div>
        </div>

        {/* Breakdown */}
        {breakdown.length > 0 && (
          <div className="flex flex-wrap justify-center gap-x-12 gap-y-6 border-t border-gray-200 dark:border-gray-700/50 pt-8 mt-2">
            <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] mb-2 w-full">
              Breakdown
            </div>
            {breakdown.map((item, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 dark:text-gray-400 font-semibold text-[11px] uppercase tracking-wider">{item.label}:</span>
                  <span className="text-gray-900 dark:text-white font-bold text-xl">{item.value}%</span>
                </div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-widest">
                  ({item.weight}% weight)
                </span>
              </div>
            ))}
          </div>
        )}

        {description && (
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700/50">
            <p className="text-gray-500 dark:text-gray-400 text-sm italic font-medium">
              {description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TraceabilityScore;
