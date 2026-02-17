import React from 'react';
import { TbPlus } from "react-icons/tb";
import Tooltip from '../../../../../../../../components/common/Tooltip';

const EmptyState = ({ onAddPersona, onAIGenerate, isGeneratingAI = false }) => {
  return (
    <div className="flex flex-col items-center justify-center h-[500px] text-center max-w-2xl mx-auto space-y-8">
      <div className="space-y-4">
        <div className="w-20 h-20 bg-blue-100 dark:bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <TbPlus size={40} className="text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white">No personas… yet.</h2>
        <p className="text-gray-600 dark:text-gray-400 text-lg">
          Start by creating a persona that represents your target customer or let Omi create recommended personas based on your research objective
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
        <button
          onClick={onAddPersona}
          className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl font-bold shadow-xl shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-105 transition-all text-lg"
        >
          <TbPlus size={24} />
          <span>Manual Setup</span>
        </button>

        <Tooltip content="Omi Recommended Persona">
          <button
            onClick={onAIGenerate}
            disabled={isGeneratingAI}
            className={`w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 bg-white dark:bg-white/5 border-2 border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 rounded-2xl font-bold hover:bg-gray-50 dark:hover:bg-white/10 hover:border-blue-400 dark:hover:border-blue-500/50 transition-all text-lg group ${isGeneratingAI ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isGeneratingAI ? (
              <>
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" />
                </div>
                <span>Generating Personas...</span>
              </>
            ) : (
              <>
                <div className="relative flex h-3 w-3">
                  <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></div>
                  <div className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></div>
                </div>
                <span>Omi Recommended Persona</span>
              </>
            )}
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

export default EmptyState;