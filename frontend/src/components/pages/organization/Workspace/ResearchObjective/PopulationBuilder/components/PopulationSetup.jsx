import React, { useState } from 'react';
import { motion } from 'framer-motion';
import PersonaSelector from './PersonaSelector';
import SelectedPersonasList from './SelectedPersonasList';
import { TbSend, TbLoader } from 'react-icons/tb';

const PopulationSetup = ({
  personas,
  selectedPersonas,
  sampleSizes,
  onSelectPersona,
  onSampleSizeChange,
  onRemovePersona,
  onConfirmPopulation,
  isPending
}) => {
  const [showPersonaList, setShowPersonaList] = useState(false);

  const totalParticipants = Object.values(sampleSizes).reduce((sum, size) => sum + size, 0);
  const hasValidSelection = selectedPersonas.length > 0 &&
    selectedPersonas.every(p => sampleSizes[p.id] > 0);

  return (
    <motion.div
      key="setup"
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -40, scale: 0.95 }}
      className="flex-1 flex flex-col items-center justify-center py-12 relative z-20"
    >
      <div className="w-full max-w-xl bg-white/80 dark:bg-white/5 backdrop-blur-2xl border border-gray-200 dark:border-white/10 rounded-[32px] p-8 md:p-12 shadow-2xl relative overflow-visible">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Define Your Population</h2>
          <p className="text-gray-500 dark:text-gray-400">Select multiple personas and set sample sizes for each.</p>
        </div>

        <div className="space-y-6">
          <PersonaSelector
            personas={personas}
            selectedPersonas={selectedPersonas}
            showPersonaList={showPersonaList}
            onSelectPersona={onSelectPersona}
            onToggleList={() => setShowPersonaList(!showPersonaList)}
          />

          {selectedPersonas.length > 0 && (
            <>
              <SelectedPersonasList
                selectedPersonas={selectedPersonas}
                sampleSizes={sampleSizes}
                onSampleSizeChange={onSampleSizeChange}
                onRemovePersona={onRemovePersona}
              />

              <div className="bg-gray-50/50 dark:bg-white/5 rounded-xl p-4 border border-gray-200/50 dark:border-white/10">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Total Participants
                  </span>
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {totalParticipants}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {selectedPersonas.length} persona{selectedPersonas.length > 1 ? 's' : ''} selected
                </div>
              </div>
            </>
          )}

          <button
            disabled={!hasValidSelection || isPending}
            onClick={onConfirmPopulation}
            className="w-full py-4 mt-4 bg-blue-600 hover:bg-blue-700 text-white rounded-[20px] font-bold text-lg shadow-xl shadow-blue-500/20 hover:shadow-blue-500/40 hover:-translate-y-1 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
          >
            {isPending ? (
              <>
                <TbLoader className="w-5 h-5 animate-spin" />
                <span>Building Population...</span>
              </>
            ) : (
              <>
                <span>Build Population</span>
                <TbSend className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default PopulationSetup;