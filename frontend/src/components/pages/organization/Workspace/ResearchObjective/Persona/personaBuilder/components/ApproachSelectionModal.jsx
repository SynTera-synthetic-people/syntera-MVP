import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbMicrophone, TbChartBar, TbRotate, TbX, TbChevronRight } from 'react-icons/tb';

const ApproachSelectionModal = ({ isOpen, onClose, onSelect, isLoading, currentApproach, isLocked }) => {
  const [selectedOption, setSelectedOption] = useState(currentApproach);

  // Update local state when currentApproach changes or modal opens
  useEffect(() => {
    setSelectedOption(currentApproach);
  }, [currentApproach, isOpen]);

  const options = [
    {
      id: 'qualitative',
      title: 'Qualitative',
      description: 'Uncover the Why',
      icon: TbMicrophone,
      color: 'from-blue-500 to-indigo-600',
      shadow: 'shadow-blue-500/20',
      tooltip: 'Rich quotes, motivations, emotions. Perfect for understanding what drives behavior.'
    },
    {
      id: 'quantitative',
      title: 'Quantitative',
      description: 'Measure the Many',
      icon: TbChartBar,
      color: 'from-purple-500 to-pink-600',
      shadow: 'shadow-purple-500/20',
      tooltip: 'Percentages, rankings, stats. Perfect for spotting trends at scale.'
    },
    {
      id: 'both',
      title: 'Both',
      description: 'Ultimate Combo',
      icon: TbRotate,
      color: 'from-emerald-500 to-teal-600',
      shadow: 'shadow-emerald-500/20',
      tooltip: 'Quotes, motivations + stats, trends. Perfect for why validated by how many.'
    }
  ];

  const filteredOptions = options.filter(option => {
    if (currentApproach === 'quantitative' && option.id === 'qualitative') return false;
    if (currentApproach === 'qualitative' && option.id === 'quantitative') return false;
    return true;
  });

  const handleProceed = () => {
    if (selectedOption && !isLocked) {
      onSelect(selectedOption);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/60 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-3xl bg-white dark:bg-[#0a0e1a] rounded-3xl shadow-2xl border border-gray-200 dark:border-white/10 flex flex-col my-8"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-8 pb-4 flex justify-between items-start flex-shrink-0 text-left">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    {isLocked ? 'Research Technique Selected' : 'Choose your research technique'}
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400">
                    {isLocked ? 'Your technique choice is now locked for this objective' : 'Deep Dive or Big Numbers?'}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors"
                  disabled={isLoading}
                >
                  <TbX className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              {/* Options Grid */}
              <div className={`p-8 grid gap-6 ${filteredOptions.length === 1 ? 'grid-cols-1 max-w-md mx-auto w-full' : filteredOptions.length === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-2xl mx-auto w-full' : 'grid-cols-1 md:grid-cols-3'}`}>
                {filteredOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = selectedOption === option.id;
                  const isDisabled = isLocked || (currentApproach && currentApproach !== 'both' && option.id !== 'both' && currentApproach !== option.id);

                  return (
                    <motion.button
                      key={option.id}
                      whileHover={!isDisabled ? { y: -4 } : {}}
                      whileTap={!isDisabled ? { scale: 0.98 } : {}}
                      onClick={() => !isDisabled && setSelectedOption(option.id)}
                      disabled={isLoading || isDisabled}
                      className={`group relative flex flex-col text-left p-6 rounded-2xl border-2 transition-all duration-300 hover:z-50 ${isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-500 shadow-xl shadow-blue-500/10'
                        : isDisabled
                          ? 'bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-white/5 opacity-40 cursor-not-allowed grayscale'
                          : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 hover:border-blue-300 dark:hover:border-blue-500/30'
                        }`}
                    >
                      {/* Tooltip */}
                      {!isLocked && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-60 p-3 bg-gray-900/95 text-white text-xs leading-normal rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 backdrop-blur-sm text-center">
                          {option.tooltip}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-6 border-transparent border-t-gray-900/95" />
                        </div>
                      )}

                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${option.color} flex items-center justify-center text-white mb-4 shadow-lg ${option.shadow} ${!isDisabled && isSelected && 'scale-110'} transition-transform duration-300`}>
                        <Icon className="w-6 h-6" />
                      </div>

                      <div className="flex justify-between items-start mb-2">
                        <h3 className={`text-lg font-bold ${isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                          {option.title}
                        </h3>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center"
                          >
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </motion.div>
                        )}
                      </div>

                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {option.description}
                      </p>
                    </motion.button>
                  );
                })}
              </div>

              {/* Footer with Proceed Button */}
              {!isLocked && (
                <div className="p-8 pt-0 mt-auto flex justify-end flex-shrink-0">
                  <button
                    onClick={handleProceed}
                    disabled={!selectedOption || isLoading}
                    className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Setting up...</span>
                      </>
                    ) : (
                      <>
                        <span>Proceed</span>
                        <TbChevronRight size={20} />
                      </>
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ApproachSelectionModal;
