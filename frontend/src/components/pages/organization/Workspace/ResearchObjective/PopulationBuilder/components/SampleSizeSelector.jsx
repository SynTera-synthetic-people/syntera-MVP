import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbChartBar, TbChevronDown, TbCheck } from 'react-icons/tb';

const SampleSizeSelector = ({
  selectedPersonaId,
  currentSampleSize,
  showSampleList,
  customSampleSize,
  onSampleSizeChange,
  onCustomSampleSizeChange,
  onToggleList,
  onCustomInputChange
}) => {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">Sample Size</label>
      <div className="relative">
        <button
          disabled={!selectedPersonaId}
          onClick={onToggleList}
          className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-2xl hover:border-blue-500 transition-all font-medium text-gray-800 dark:text-gray-100 group shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-3">
            <TbChartBar className={`w-5 h-5 ${currentSampleSize ? 'text-blue-600' : 'text-gray-400'}`} />
            <span>{currentSampleSize ? `${currentSampleSize} Participants` : 'Select size...'}</span>
          </div>
          <TbChevronDown className={`transform transition-transform duration-300 ${showSampleList ? 'rotate-180' : ''} text-gray-400`} />
        </button>

        <AnimatePresence>
          {showSampleList && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              className="absolute top-full left-0 w-full mt-3 bg-white dark:bg-[#1a1f2e] border border-gray-200 dark:border-white/10 rounded-[20px] shadow-2xl z-[100] overflow-hidden"
            >
              {[20, 50, 100].map(size => (
                <button
                  key={size}
                  onClick={() => onSampleSizeChange(size)}
                  className="w-full text-left p-4 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-gray-700 dark:text-gray-200 transition-colors border-b last:border-0 border-gray-100 dark:border-white/5 font-medium flex items-center justify-between"
                >
                  {size} Participants
                  {currentSampleSize === size && <TbCheck className="text-blue-600" />}
                </button>
              ))}

              <div className="p-4 bg-gray-50/50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Custom size..."
                    value={customSampleSize}
                    onChange={(e) => onCustomInputChange(e.target.value)}
                    className="flex-1 bg-white dark:bg-[#0f172a] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-all text-gray-900 dark:text-white"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customSampleSize) {
                        onCustomSampleSizeChange(customSampleSize);
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (customSampleSize) {
                        onCustomSampleSizeChange(customSampleSize);
                      }
                    }}
                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
                  >
                    <TbCheck size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SampleSizeSelector;