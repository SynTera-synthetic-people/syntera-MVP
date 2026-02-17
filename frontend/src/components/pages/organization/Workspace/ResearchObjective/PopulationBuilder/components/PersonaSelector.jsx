import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbUserPlus, TbChevronDown, TbCheck } from 'react-icons/tb';

const PersonaSelector = ({
  personas,
  selectedPersonas,
  showPersonaList,
  onSelectPersona,
  onToggleList
}) => {
  // Filter out already selected personas
  const availablePersonas = personas.filter(persona =>
    !selectedPersonas.some(selected => selected.id === persona.id)
  );

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
        Add Personas
      </label>
      <div className="relative">
        <button
          onClick={onToggleList}
          className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-2xl hover:border-blue-500 transition-all font-medium text-gray-800 dark:text-gray-100 group shadow-sm"
        >
          <div className="flex items-center gap-3">
            <TbUserPlus className={`w-5 h-5 ${selectedPersonas.length > 0 ? 'text-blue-600' : 'text-gray-400'}`} />
            <span>
              {selectedPersonas.length === 0
                ? 'Select personas...'
                : `${selectedPersonas.length} persona${selectedPersonas.length > 1 ? 's' : ''} selected`
              }
            </span>
          </div>
          <TbChevronDown className={`transform transition-transform duration-300 ${showPersonaList ? 'rotate-180' : ''} text-gray-400`} />
        </button>

        <AnimatePresence>
          {showPersonaList && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
            >
              {personas.length > 0 ? (
                personas.map(persona => {
                  const isSelected = selectedPersonas.some(p => p.id === persona.id);
                  return (
                    <button
                      key={persona.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPersona(persona);
                      }}
                      className={`w-full text-left p-4 transition-colors border-b last:border-0 border-gray-100 dark:border-white/5 font-medium flex items-center justify-between ${isSelected
                        ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                        : 'hover:bg-gray-50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-200'
                        }`}
                    >
                      {persona.name}
                      {isSelected && <TbCheck className="text-blue-600 dark:text-blue-400" />}
                    </button>
                  );
                })
              ) : (
                <div className="p-8 text-center text-gray-500 italic">
                  No personas available
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default PersonaSelector;