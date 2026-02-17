import React from 'react';
import { TbEdit, TbEye, TbSparkles } from "react-icons/tb";
import Tooltip from '../../../../../../../../components/common/Tooltip';

const PersonaListItem = ({
  name,
  isSelected,
  isEditing,
  newName,
  isAIPersona,
  savedPersona,
  onSelect,
  onDoubleClick,
  onNameChange,
  onNameBlur,
  onNameKeyDown,
  onPreview,
  onEditClick
}) => {
  return (
    <div
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      className={`w-full p-4 rounded-xl font-semibold transition-all duration-200 flex items-center justify-between group border cursor-pointer ${isSelected
        ? 'bg-blue-50 dark:bg-blue-500/20 border-blue-400 dark:border-blue-500/50 text-blue-700 dark:text-blue-300 shadow-md'
        : 'bg-white dark:bg-white/5 border-gray-200 dark:border-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10 shadow-sm'
        }`}
    >
      {isEditing ? (
        <input
          type="text"
          value={newName}
          onChange={onNameChange}
          onBlur={onNameBlur}
          onKeyDown={onNameKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-inherit cursor-text"
          autoFocus
        />
      ) : (
        <div className="flex-grow min-w-0 flex items-center pr-4">
          <Tooltip content={name} className="w-fit max-w-full" position="top-left">
            <span className="font-medium truncate block">
              {name}
            </span>
          </Tooltip>
        </div>
      )}

      <div className="flex items-center min-w-[80px] justify-end h-8">
        {isAIPersona && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full text-white shadow-sm group-hover:hidden transition-all duration-200">
            <TbSparkles size={12} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Omi</span>
          </div>
        )}

        <div className={`items-center gap-1 ${isAIPersona ? 'hidden group-hover:flex' : 'opacity-0 group-hover:opacity-100'} transition-all duration-200`}>
          {!isAIPersona && (
            <button
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={onEditClick}
              className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-white/10 text-gray-500 dark:text-gray-400"
              title="Rename"
            >
              <TbEdit size={16} />
            </button>
          )}
          <button
            onClick={onPreview}
            className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-white/10 text-gray-500 dark:text-gray-400"
            title="Preview"
          >
            <TbEye size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PersonaListItem;