import React from 'react';
import { motion } from "framer-motion";
import { TbArrowLeft, TbSparkles } from "react-icons/tb";
import Tooltip from '../../../../../../../../components/common/Tooltip';

const Header = ({ personas, onBack, onAIGenerate, isGeneratingAI = false, showAIGenerate = true }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 flex justify-between items-start"
    >
      <div>
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={onBack}
            className="p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors"
            title="Go Back"
          >
            <TbArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Persona Builder
          </h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Bring your ideal customers to life-one trait at a time
        </p>
      </div>

      <div className="flex items-center gap-3">
        {showAIGenerate && (
          <Tooltip content="Omi Recommended Persona" position="top-right">
            <button
              onClick={onAIGenerate}
              disabled={isGeneratingAI}
              className={`px-6 py-3 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-50 dark:hover:bg-white/10 transition-all flex items-center gap-3 ${isGeneratingAI ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isGeneratingAI ? (
                <>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" />
                  </div>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <div className="relative flex h-2 w-2">
                    <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></div>
                    <div className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></div>
                  </div>
                  <span>Omi Recommended Persona</span>
                </>
              )}
            </button>
          </Tooltip>
        )}
      </div>
    </motion.div>
  );
};

export default Header;