import React from 'react';
import { TbCheck, TbEdit, TbLoader, TbPlus, TbTrash, TbX } from 'react-icons/tb';

const optionToText = (option) => {
  if (option === null || option === undefined) return '';
  if (typeof option === 'string') return option;
  if (typeof option === 'number' || typeof option === 'boolean') return String(option);
  if (typeof option === 'object') {
    if (typeof option.text === 'string') return option.text;
    if (typeof option.label === 'string') return option.label;
    if (typeof option.value === 'string' || typeof option.value === 'number' || typeof option.value === 'boolean') {
      return String(option.value);
    }
  }
  return '';
};

const QuestionItem = ({
  question,
  isEditing,
  editingText,
  editingOptions,
  onStartEdit,
  onCancelEdit,
  onEditingTextChange,
  onEditingOptionChange,
  onAddOption,
  onRemoveOption,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}) => {
  const safeQuestionText = optionToText(question?.text);
  const safeQuestionOptions = Array.isArray(question?.options) ? question.options : [];

  if (isEditing) {
    return (
      <div className="bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-gray-100 dark:border-white/5 rounded-2xl p-6 shadow-sm">
        <div className="space-y-5">
          <textarea
            value={editingText}
            onChange={(event) => onEditingTextChange(event.target.value)}
            className="w-full min-h-[110px] rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none"
            placeholder="Edit question text..."
            autoFocus
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="text-[10px] uppercase tracking-wider font-bold">Simulated Responses</span>
                <span className="text-xs">({editingOptions.length} options)</span>
              </div>
              <button
                type="button"
                onClick={onAddOption}
                className="flex items-center gap-1 text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                <TbPlus size={16} />
                <span>Add Option</span>
              </button>
            </div>

            <div className="space-y-2">
              {editingOptions.map((option, index) => (
                <div key={`${question.id}-option-${index}`} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={optionToText(option)}
                    onChange={(event) => onEditingOptionChange(index, event.target.value)}
                    className="flex-1 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder={`Option ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveOption(index)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Remove Option"
                    disabled={editingOptions.length <= 2}
                  >
                    <TbTrash size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isSaving}
            >
              {isSaving ? <TbLoader className="w-4 h-4 animate-spin" /> : <TbCheck size={16} />}
              <span>{isSaving ? 'Saving...' : 'Save Question'}</span>
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 font-bold text-sm hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
            >
              <TbX size={16} />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-gray-100 dark:border-white/5 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-gray-900 dark:text-gray-100 font-bold text-lg leading-relaxed mb-2">
              {safeQuestionText}
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span className="text-[10px] uppercase tracking-wider font-bold">Simulated Responses</span>
              <span className="text-xs">({safeQuestionOptions.length} options)</span>
            </div>
          </div>

          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={onStartEdit}
              className="p-2 rounded-lg text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
              title="Edit Question"
            >
              <TbEdit size={16} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              title="Delete Question"
              disabled={isDeleting}
            >
              {isDeleting ? <TbLoader className="w-4 h-4 animate-spin" /> : <TbTrash size={16} />}
            </button>
          </div>
        </div>

        {safeQuestionOptions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {safeQuestionOptions.map((option, index) => (
              <div
                key={`${question.id}-read-option-${index}`}
                className="px-3 py-1.5 border border-gray-300 dark:border-white/20 rounded-lg text-gray-700 dark:text-gray-300 font-medium text-sm bg-gray-50/50 dark:bg-white/5"
              >
                {optionToText(option)}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-3 bg-gray-50/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-xl text-gray-500 dark:text-gray-400 italic">
            No response options available
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestionItem;
