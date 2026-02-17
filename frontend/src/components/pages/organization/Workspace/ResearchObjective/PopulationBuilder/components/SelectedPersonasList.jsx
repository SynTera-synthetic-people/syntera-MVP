import React from 'react';
import { TbX } from 'react-icons/tb';

const SelectedPersonasList = ({
  selectedPersonas,
  sampleSizes,
  onSampleSizeChange,
  onRemovePersona
}) => {
  return (
    <div className="space-y-4">
      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 ml-1">
        Selected Personas & Sample Sizes
      </label>

      <div className="space-y-3 max-h-60 overflow-y-auto pr-2 no-scrollbar">
        {selectedPersonas.map(persona => (
          <div
            key={persona.id}
            className="flex items-center justify-between p-4 bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl hover:border-blue-500 transition-all group"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 font-bold text-sm">
                {persona.name.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                {persona.name}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={sampleSizes[persona.id] || ''}
                  onChange={(e) => onSampleSizeChange(persona.id, e.target.value)}
                  className="w-24 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-all text-gray-900 dark:text-white"
                  placeholder="Size"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  participants
                </span>
              </div>

              <button
                onClick={() => onRemovePersona(persona.id)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
              >
                <TbX size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SelectedPersonasList;