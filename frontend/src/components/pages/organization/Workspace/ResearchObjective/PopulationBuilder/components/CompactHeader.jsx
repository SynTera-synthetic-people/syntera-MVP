import React from 'react';
import { TbEdit } from 'react-icons/tb';

const CompactHeader = ({
  selectedPersonas,
  sampleSizes,
  simulationResult,
  onEditConfiguration
}) => {
  const totalParticipants = Object.values(sampleSizes).reduce((sum, size) => sum + size, 0);

  return (
    <div className="bg-white/40 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-3 px-6 mb-8 flex flex-wrap items-center justify-between gap-4 shadow-sm">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">Personas</span>
          <div className="flex gap-2">
            {selectedPersonas.slice(0, 2).map(persona => (
              <div
                key={persona.id}
                className="bg-blue-100 dark:bg-blue-600/20 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-500/20"
              >
                <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{persona.name}</span>
              </div>
            ))}
            {selectedPersonas.length > 2 && (
              <div className="bg-blue-100 dark:bg-blue-600/20 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-500/20">
                <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                  +{selectedPersonas.length - 2} more
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="w-[1px] h-6 bg-gray-200 dark:bg-white/10" />

        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">Total Sample</span>
          <div className="bg-blue-100 dark:bg-blue-600/20 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-500/20">
            <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{totalParticipants} Participants</span>
          </div>
        </div>

        {simulationResult && (
          <>
            <div className="w-[1px] h-6 bg-gray-200 dark:bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">Confidence Score</span>
              <div className="bg-green-100 dark:bg-green-600/20 px-3 py-1 rounded-full border border-green-200 dark:border-green-500/20">
                <span className="text-sm font-bold text-green-700 dark:text-green-300">{simulationResult.weighted_score}%</span>
              </div>
            </div>
          </>
        )}
      </div>

      <button
        onClick={onEditConfiguration}
        className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl transition-all font-bold text-xs"
      >
        <TbEdit size={14} />
        <span>Edit Configuration</span>
      </button>
    </div>
  );
};

export default CompactHeader;