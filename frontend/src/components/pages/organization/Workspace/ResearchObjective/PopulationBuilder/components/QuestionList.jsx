import React from 'react';
import { TbCheck, TbEdit, TbLoader, TbPlus, TbTrash, TbX } from 'react-icons/tb';
import QuestionItem from './QuestionItem';

const toText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.label === 'string') return value.label;
    if (typeof value.value === 'string' || typeof value.value === 'number' || typeof value.value === 'boolean') {
      return String(value.value);
    }
  }
  return '';
};

const QuestionList = ({
  section,
  editingSectionId,
  editingSectionTitle,
  onEditingSectionTitleChange,
  onStartEditSection,
  onSaveSection,
  onCancelEditSection,
  onDeleteSection,
  isUpdatingSection,
  isDeletingSection,
  addingQuestionToSection,
  newQuestionText,
  newQuestionOptions,
  onNewQuestionTextChange,
  onNewQuestionOptionChange,
  onAddNewQuestionOption,
  onRemoveNewQuestionOption,
  onStartAddQuestion,
  onCancelAddQuestion,
  onCreateQuestion,
  isCreatingQuestion,
  editingQuestionId,
  editedQuestionText,
  editedQuestionOptions,
  onStartEditQuestion,
  onCancelEditQuestion,
  onEditedQuestionTextChange,
  onEditedQuestionOptionChange,
  onAddEditedQuestionOption,
  onRemoveEditedQuestionOption,
  onSaveQuestion,
  onDeleteQuestion,
  isUpdatingQuestion,
  deletingQuestionId,
}) => {
  if (!section) {
    return null;
  }

  const sectionTitle = toText(section.title).trim() || 'Untitled Section';
  const sectionQuestions = Array.isArray(section.questions) ? section.questions : [];
  const isEditingSection = editingSectionId === section.section_id;
  const isAddingQuestion = addingQuestionToSection === section.section_id;

  return (
    <div className="mb-10">
      <div className="text-lg font-bold text-gray-800 dark:text-white mb-5 pl-4 border-l-4 border-blue-500">
        {isEditingSection ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={editingSectionTitle}
              onChange={(event) => onEditingSectionTitleChange(event.target.value)}
              className="min-w-[260px] flex-1 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-base text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              placeholder="Enter section title..."
              autoFocus
            />
            <button
              type="button"
              onClick={onSaveSection}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isUpdatingSection}
            >
              {isUpdatingSection ? <TbLoader className="w-4 h-4 animate-spin" /> : <TbCheck size={16} />}
              <span>{isUpdatingSection ? 'Saving...' : 'Save'}</span>
            </button>
            <button
              type="button"
              onClick={onCancelEditSection}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 font-bold text-sm hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
            >
              <TbX size={16} />
              <span>Cancel</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span>{sectionTitle}</span>
              <span className="text-[10px] bg-blue-100 dark:bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full">
                {sectionQuestions.length} Questions
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onStartEditSection(section)}
                className="p-2 rounded-lg text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                title="Edit Section"
              >
                <TbEdit size={16} />
              </button>
              <button
                type="button"
                onClick={() => onDeleteSection(section.section_id)}
                className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title="Delete Section"
                disabled={isDeletingSection}
              >
                {isDeletingSection ? <TbLoader className="w-4 h-4 animate-spin" /> : <TbTrash size={16} />}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        {sectionQuestions.length > 0 ? (
          sectionQuestions.map((question) => (
            <QuestionItem
              key={question.id}
              question={question}
              isEditing={editingQuestionId === question.id}
              editingText={editedQuestionText}
              editingOptions={editedQuestionOptions}
              onStartEdit={() => onStartEditQuestion(question)}
              onCancelEdit={onCancelEditQuestion}
              onEditingTextChange={onEditedQuestionTextChange}
              onEditingOptionChange={onEditedQuestionOptionChange}
              onAddOption={onAddEditedQuestionOption}
              onRemoveOption={onRemoveEditedQuestionOption}
              onSave={() => onSaveQuestion(question.id)}
              onDelete={() => onDeleteQuestion(question.id)}
              isSaving={isUpdatingQuestion}
              isDeleting={deletingQuestionId === question.id}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 bg-white/40 dark:bg-white/5 px-6 py-8 text-sm text-gray-500 dark:text-gray-400">
            No questions in this section yet.
          </div>
        )}

        {isAddingQuestion ? (
          <div className="bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-gray-100 dark:border-white/5 rounded-2xl p-6 shadow-sm">
            <div className="space-y-5">
              <textarea
                value={newQuestionText}
                onChange={(event) => onNewQuestionTextChange(event.target.value)}
                className="w-full min-h-[110px] rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none"
                placeholder="Enter question text..."
                autoFocus
              />

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <span className="text-[10px] uppercase tracking-wider font-bold">Simulated Responses</span>
                    <span className="text-xs">({newQuestionOptions.length} options)</span>
                  </div>
                  <button
                    type="button"
                    onClick={onAddNewQuestionOption}
                    className="flex items-center gap-1 text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    <TbPlus size={16} />
                    <span>Add Option</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {newQuestionOptions.map((option, index) => (
                    <div key={`${section.section_id}-new-option-${index}`} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={toText(option)}
                        onChange={(event) => onNewQuestionOptionChange(index, event.target.value)}
                        className="flex-1 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        placeholder={`Option ${index + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => onRemoveNewQuestionOption(index)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Remove Option"
                        disabled={newQuestionOptions.length <= 2}
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
                  onClick={() => onCreateQuestion(section.section_id)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={isCreatingQuestion}
                >
                  {isCreatingQuestion ? <TbLoader className="w-4 h-4 animate-spin" /> : <TbCheck size={16} />}
                  <span>{isCreatingQuestion ? 'Adding...' : 'Add Question'}</span>
                </button>
                <button
                  type="button"
                  onClick={onCancelAddQuestion}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 font-bold text-sm hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                >
                  <TbX size={16} />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onStartAddQuestion(section.section_id)}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-blue-200 dark:border-blue-500/20 bg-blue-50/40 dark:bg-blue-500/5 text-blue-600 dark:text-blue-400 font-bold text-sm hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
          >
            <TbPlus size={18} />
            <span>Add Question</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default QuestionList;
