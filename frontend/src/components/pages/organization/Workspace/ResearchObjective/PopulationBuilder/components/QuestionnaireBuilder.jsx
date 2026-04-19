import React, { useRef, useState } from 'react';
import QuestionnaireTabs from './QuestionnaireTabs';
import QuestionList from './QuestionList';
import { TbCheck, TbDownload, TbLoader, TbPlus, TbUpload } from 'react-icons/tb';
import { downloadQuestionnaireCsv } from '../../../../../../../utils/questionnaireCsv';
import {
  useCreateQuestionnaireQuestion,
  useCreateQuestionnaireSection,
  useDeleteQuestionnaireQuestion,
  useDeleteQuestionnaireSection,
  useUpdateQuestionnaireQuestion,
  useUpdateQuestionnaireSection,
} from '../../../../../../../hooks/useQuantitativeQueries';

const DEFAULT_OPTION_DRAFTS = ['', ''];

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

const normalizeQuestionnaireData = (apiData) => {
  if (!Array.isArray(apiData)) return [];

  return apiData.map((section) => ({
    section_id: section.section_id || section.id,
    simulation_id: section.simulation_id || null,
    title: optionToText(section.title).trim() || 'Untitled Section',
    questions: Array.isArray(section.questions)
      ? section.questions.map((question) => ({
        id: question.id,
        text: optionToText(question.text),
        options: Array.isArray(question.options)
          ? question.options.map(optionToText).map((option) => option.trim()).filter(Boolean)
          : [],
      }))
      : [],
  }));
};

const sanitizeOptions = (options = []) =>
  options.map(optionToText).map((option) => option.trim()).filter(Boolean);

const createOptionDrafts = (options = []) =>
  Array.isArray(options) && options.length > 0
    ? options.map(optionToText)
    : [...DEFAULT_OPTION_DRAFTS];

const QuestionnaireBuilder = ({
  questionnaireData,
  loading,
  simulationId,
  workspaceId,
  explorationId,
  uploadQuestionnaireMutation,
  onModified,
}) => {
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [uploadStatus, setUploadStatus] = useState({
    isLoading: false,
    isSuccess: false,
    error: null,
    respondentCountsAvailable: false,
  });
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState('');
  const [addingQuestionToSection, setAddingQuestionToSection] = useState(null);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionOptions, setNewQuestionOptions] = useState([...DEFAULT_OPTION_DRAFTS]);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [editedQuestionText, setEditedQuestionText] = useState('');
  const [editedQuestionOptions, setEditedQuestionOptions] = useState([...DEFAULT_OPTION_DRAFTS]);
  const [deletingSectionId, setDeletingSectionId] = useState(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState(null);
  const fileInputRef = useRef(null);

  const createSectionMutation = useCreateQuestionnaireSection(workspaceId, explorationId, simulationId);
  const updateSectionMutation = useUpdateQuestionnaireSection(workspaceId, explorationId, simulationId);
  const deleteSectionMutation = useDeleteQuestionnaireSection(workspaceId, explorationId, simulationId);
  const createQuestionMutation = useCreateQuestionnaireQuestion(workspaceId, explorationId, simulationId);
  const updateQuestionMutation = useUpdateQuestionnaireQuestion(workspaceId, explorationId, simulationId);
  const deleteQuestionMutation = useDeleteQuestionnaireQuestion(workspaceId, explorationId, simulationId);

  const questionnaireSections = normalizeQuestionnaireData(questionnaireData);
  const hasSections = questionnaireSections.length > 0;

  const displaySectionIndex =
    questionnaireSections.length === 0
      ? 0
      : Math.min(activeSectionIndex, questionnaireSections.length - 1);
  const currentSection = questionnaireSections[displaySectionIndex];

  const handleDownloadCsv = () => {
    if (questionnaireSections.length === 0) return;
    downloadQuestionnaireCsv(questionnaireSections, 'questionnaire_exploration.csv');
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|docx|txt|csv|xlsx|xls)$/i)) {
      setUploadStatus({
        isLoading: false,
        isSuccess: false,
        error: 'Please upload a valid file (PDF, DOCX, TXT, CSV, or Excel)',
        respondentCountsAvailable: false,
      });
      return;
    }

    setUploadStatus({
      isLoading: true,
      isSuccess: false,
      error: null,
      respondentCountsAvailable: false,
    });

    try {
      const apiRes = await uploadQuestionnaireMutation.mutateAsync({
        workspaceId,
        explorationId,
        simulationId,
        file,
      });
      const countsAvail = !!apiRes?.data?.respondent_counts_available;

      setUploadStatus({
        isLoading: false,
        isSuccess: true,
        error: null,
        respondentCountsAvailable: countsAvail,
      });
      onModified?.();

      setTimeout(() => {
        setUploadStatus({
          isLoading: false,
          isSuccess: false,
          error: null,
          respondentCountsAvailable: false,
        });
      }, 6000);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus({
        isLoading: false,
        isSuccess: false,
        error: error.response?.data?.message || 'Failed to upload questionnaire. Please try again.',
        respondentCountsAvailable: false,
      });
    }

    event.target.value = '';
  };

  const handleStartEditSection = (section) => {
    setEditingSectionId(section.section_id);
    setEditingSectionTitle(optionToText(section.title));
  };

  const handleCancelEditSection = () => {
    setEditingSectionId(null);
    setEditingSectionTitle('');
  };

  const handleSaveSection = async () => {
    const title = editingSectionTitle.trim();
    if (!editingSectionId) return;
    if (!title) {
      window.alert('Section title cannot be empty');
      return;
    }

    try {
      await updateSectionMutation.mutateAsync({
        sectionId: editingSectionId,
        title,
      });
      handleCancelEditSection();
      onModified?.();
    } catch (error) {
      console.error('Failed to update section:', error);
    }
  };

  const handleCreateSection = async () => {
    if (!simulationId) return;

    try {
      setActiveSectionIndex(questionnaireSections.length);
      await createSectionMutation.mutateAsync({
        title: 'New Section',
        simulationId,
      });
      onModified?.();
    } catch (error) {
      console.error('Failed to create section:', error);
    }
  };

  const handleDeleteSection = async (sectionId) => {
    if (!window.confirm('Are you sure you want to delete this section and all its questions?')) {
      return;
    }

    const deletedIndex = questionnaireSections.findIndex((s) => s.section_id === sectionId);
    setDeletingSectionId(sectionId);
    try {
      await deleteSectionMutation.mutateAsync({ sectionId });
      if (deletedIndex >= 0 && deletedIndex <= activeSectionIndex) {
        setActiveSectionIndex(Math.max(0, activeSectionIndex - 1));
      }
      onModified?.();
    } catch (error) {
      console.error('Failed to delete section:', error);
    } finally {
      setDeletingSectionId(null);
    }
  };

  const validateQuestionPayload = (text, options) => {
    const nextText = text.trim();
    const nextOptions = sanitizeOptions(options);

    if (!nextText) {
      window.alert('Question cannot be empty');
      return null;
    }

    if (nextOptions.length < 2) {
      window.alert('Please provide at least two response options');
      return null;
    }

    return { text: nextText, options: nextOptions };
  };

  const handleStartAddQuestion = (sectionId) => {
    setAddingQuestionToSection(sectionId);
    setNewQuestionText('');
    setNewQuestionOptions([...DEFAULT_OPTION_DRAFTS]);
  };

  const handleCancelAddQuestion = () => {
    setAddingQuestionToSection(null);
    setNewQuestionText('');
    setNewQuestionOptions([...DEFAULT_OPTION_DRAFTS]);
  };

  const handleAddQuestion = async (sectionId) => {
    const payload = validateQuestionPayload(newQuestionText, newQuestionOptions);
    if (!payload) return;

    try {
      await createQuestionMutation.mutateAsync({
        sectionId,
        text: payload.text,
        options: payload.options,
      });
      handleCancelAddQuestion();
      onModified?.();
    } catch (error) {
      console.error('Failed to create question:', error);
    }
  };

  const handleStartEditQuestion = (question) => {
    setEditingQuestionId(question.id);
    setEditedQuestionText(question.text);
    setEditedQuestionOptions(createOptionDrafts(question.options));
  };

  const handleCancelEditQuestion = () => {
    setEditingQuestionId(null);
    setEditedQuestionText('');
    setEditedQuestionOptions([...DEFAULT_OPTION_DRAFTS]);
  };

  const handleSaveQuestion = async (questionId) => {
    const payload = validateQuestionPayload(editedQuestionText, editedQuestionOptions);
    if (!payload) return;

    try {
      await updateQuestionMutation.mutateAsync({
        questionId,
        text: payload.text,
        options: payload.options,
      });
      handleCancelEditQuestion();
      onModified?.();
    } catch (error) {
      console.error('Failed to update question:', error);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm('Are you sure you want to delete this question?')) {
      return;
    }

    setDeletingQuestionId(questionId);
    try {
      await deleteQuestionMutation.mutateAsync({ questionId });
      onModified?.();
    } catch (error) {
      console.error('Failed to delete question:', error);
    } finally {
      setDeletingQuestionId(null);
    }
  };

  const updateOptionDraftList = (setter, options, index, value) => {
    setter(options.map((option, optionIndex) => (optionIndex === index ? value : option)));
  };

  const removeOptionDraft = (setter, options, index) => {
    if (options.length <= 2) return;
    setter(options.filter((_, optionIndex) => optionIndex !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <TbLoader className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading questionnaire...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Questionnaire Builder</h3>
        <div className="flex gap-2 items-center flex-wrap justify-end">
          {uploadStatus.isLoading && (
            <div className="flex items-center text-blue-600">
              <TbLoader className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Uploading...</span>
            </div>
          )}
          {uploadStatus.isSuccess && (
            <div className="flex flex-col text-green-600 max-w-md">
              <div className="flex items-center">
                <TbCheck className="w-5 h-5 mr-2 flex-shrink-0" />
                <span className="text-sm">Upload successful!</span>
              </div>
              {uploadStatus.respondentCountsAvailable && (
                <span className="text-xs text-gray-600 dark:text-gray-400 mt-1 pl-7">
                  Survey results exist for this run. Use &quot;Download questionnaire (CSV)&quot; from the exploration list or Survey Results to export with respondent counts.
                </span>
              )}
            </div>
          )}
          {uploadStatus.error && (
            <div className="text-red-600 text-sm">
              {uploadStatus.error}
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileChange}
            accept=".pdf,.docx,.txt,.csv,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          />

          <button
            type="button"
            onClick={handleCreateSection}
            disabled={createSectionMutation.isPending || !simulationId}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createSectionMutation.isPending ? (
              <TbLoader className="w-5 h-5 animate-spin" />
            ) : (
              <TbPlus size={18} />
            )}
            <span>{createSectionMutation.isPending ? 'Adding...' : 'Add Section'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={!hasSections}
            className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-white/10 transition-all font-bold text-sm shadow-sm"
          >
            <TbDownload size={18} />
            <span>Download CSV</span>
          </button>

          <button
            onClick={handleUploadClick}
            disabled={uploadStatus.isLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-white/10 transition-all font-bold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadStatus.isLoading ? (
              <TbLoader className="w-5 h-5 animate-spin" />
            ) : (
              <TbUpload size={18} />
            )}
            <span>Upload Questionnaire</span>
          </button>
        </div>
      </div>

      {hasSections ? (
        <>
          <QuestionnaireTabs
            sections={questionnaireSections}
            activeIndex={displaySectionIndex}
            onTabClick={setActiveSectionIndex}
          />

          <QuestionList
            section={currentSection}
            editingSectionId={editingSectionId}
            editingSectionTitle={editingSectionTitle}
            onEditingSectionTitleChange={setEditingSectionTitle}
            onStartEditSection={handleStartEditSection}
            onSaveSection={handleSaveSection}
            onCancelEditSection={handleCancelEditSection}
            onDeleteSection={handleDeleteSection}
            isUpdatingSection={updateSectionMutation.isPending}
            isDeletingSection={deletingSectionId === currentSection?.section_id}
            addingQuestionToSection={addingQuestionToSection}
            newQuestionText={newQuestionText}
            newQuestionOptions={newQuestionOptions}
            onNewQuestionTextChange={setNewQuestionText}
            onNewQuestionOptionChange={(index, value) =>
              updateOptionDraftList(setNewQuestionOptions, newQuestionOptions, index, value)
            }
            onAddNewQuestionOption={() => setNewQuestionOptions([...newQuestionOptions, ''])}
            onRemoveNewQuestionOption={(index) =>
              removeOptionDraft(setNewQuestionOptions, newQuestionOptions, index)
            }
            onStartAddQuestion={handleStartAddQuestion}
            onCancelAddQuestion={handleCancelAddQuestion}
            onCreateQuestion={handleAddQuestion}
            isCreatingQuestion={createQuestionMutation.isPending}
            editingQuestionId={editingQuestionId}
            editedQuestionText={editedQuestionText}
            editedQuestionOptions={editedQuestionOptions}
            onStartEditQuestion={handleStartEditQuestion}
            onCancelEditQuestion={handleCancelEditQuestion}
            onEditedQuestionTextChange={setEditedQuestionText}
            onEditedQuestionOptionChange={(index, value) =>
              updateOptionDraftList(setEditedQuestionOptions, editedQuestionOptions, index, value)
            }
            onAddEditedQuestionOption={() => setEditedQuestionOptions([...editedQuestionOptions, ''])}
            onRemoveEditedQuestionOption={(index) =>
              removeOptionDraft(setEditedQuestionOptions, editedQuestionOptions, index)
            }
            onSaveQuestion={handleSaveQuestion}
            onDeleteQuestion={handleDeleteQuestion}
            isUpdatingQuestion={updateQuestionMutation.isPending}
            deletingQuestionId={deletingQuestionId}
          />
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/10 bg-white/40 dark:bg-white/5 px-6 py-16 text-center text-gray-500 dark:text-gray-400">
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">No questionnaire sections yet</p>
          <p className="text-sm">Add a new section or upload a questionnaire to continue building your survey.</p>
        </div>
      )}
    </div>
  );
};

export default QuestionnaireBuilder;
