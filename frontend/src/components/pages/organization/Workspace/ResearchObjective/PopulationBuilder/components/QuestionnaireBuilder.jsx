import React, { useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import QuestionnaireTabs from './QuestionnaireTabs';
import QuestionList from './QuestionList';
import QuestionModal, { defaultQuestion } from '../../Questionnaire/QuestionModal';
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

// ─── Backend ↔ frontend type name mapping ─────────────────────────────────────
// Backend uses snake_case canonical keys; QuestionModal uses some different names.
const BACKEND_TO_MODAL_TYPE = {
  grid_single_select: 'single_select_grid',
  ranking: 'rank_sort',
  video_player_url: 'video_player_embed',
};
const MODAL_TO_BACKEND_TYPE = {
  single_select_grid: 'grid_single_select',
  rank_sort: 'ranking',
  video_player_embed: 'video_player_url',
};

// ─── Build API payload from modal Question object ─────────────────────────────
const buildApiPayload = (q) => {
  const question_type = MODAL_TO_BACKEND_TYPE[q.type] || q.type;

  // flat string options array (legacy compat)
  let options = [];
  switch (q.type) {
    case 'single_select':
    case 'multi_select':
    case 'dropdown':
      options = (q.options || []).filter(Boolean);
      break;
    case 'button_rating':
      options = (q.buttonRatingRows || []).filter(Boolean);
      break;
    case 'single_select_grid':
      options = (q.rows || []).filter(Boolean);
      break;
    case 'this_or_that':
      options = [...(q.leftOptions || []), ...(q.rightOptions || [])].filter(Boolean);
      break;
    case 'star_rating':
      options = (q.starTooltips || []).filter(Boolean);
      break;
    case 'rating_scale':
      options = (q.scaleRows || []).filter(Boolean);
      break;
    case 'card_rating':
      options = (q.cardRatingCards || []).filter(Boolean);
      break;
    case 'slider_rating':
      options = (q.sliders || []).filter(Boolean);
      break;
    case 'slider':
      options = (q.sliders || []).filter(Boolean);
      break;
    case 'rank_sort':
      options = (q.rankItems || []).filter(Boolean);
      break;
    case 'card_sort':
      options = (q.cards || []).filter(Boolean);
      break;
    case 'maxdiff':
      options = (q.attributes || []).filter(Boolean);
      break;
    case 'language':
      options = (q.options || []).filter(Boolean);
      break;
    default:
      options = [];
  }

  // type-specific config
  const config = {};
  if (q.instruction) config.instruction = q.instruction;

  switch (q.type) {
    case 'single_select':
      config.min_select = 1;
      config.max_select = 1;
      break;
    case 'multi_select':
      config.min_select = 1;
      config.max_select = options.length || 1;
      break;
    case 'dropdown':
      config.min_select = 1;
      config.max_select = 1;
      config.searchable = false;
      break;
    case 'this_or_that':
      config.left_options = (q.leftOptions || []).filter(Boolean);
      config.right_options = (q.rightOptions || []).filter(Boolean);
      config.columns = (q.columns || []).filter(Boolean);
      break;
    case 'single_select_grid':
      config.rows = (q.rows || []).filter(Boolean).map((r) => ({ text: r }));
      config.columns = (q.columns || []).filter(Boolean).map((c) => ({ text: c }));
      break;
    case 'button_rating':
      config.rows = (q.buttonRatingRows || []).filter(Boolean);
      break;
    case 'star_rating':
      config.max_stars = (q.starTooltips || []).length || 5;
      config.star_tooltip = q.starTooltips?.[0] || '';
      config.rows = (q.starRows || []).filter(Boolean);
      break;
    case 'rating_scale':
      config.rows = (q.scaleRows || []).filter(Boolean);
      config.columns = (q.scaleColumns || []).filter(Boolean);
      config.scale = { min: 1, max: (q.scaleColumns || []).length || 5, step: 1 };
      break;
    case 'card_rating':
      config.cards = (q.cardRatingCards || []).filter(Boolean);
      config.buttons = (q.cardRatingButtons || []).filter(Boolean);
      break;
    case 'slider_rating':
      config.sliders = (q.sliders || []).filter(Boolean);
      config.points = (q.sliderPoints || []).filter(Boolean);
      config.scale = { min: 0, max: 100, step: 1 };
      break;
    case 'slider':
      config.sliders = (q.sliders || []).filter(Boolean);
      config.scale = { min: 0, max: 100, step: 1 };
      break;
    case 'rank_sort':
      config.rank_labels = (q.rankLabels || []).filter(Boolean);
      config.rankable_items = (q.rankItems || []).filter(Boolean);
      break;
    case 'card_sort':
      config.cards = (q.cards || []).filter(Boolean);
      config.buckets = (q.buckets || []).filter(Boolean);
      break;
    case 'maxdiff':
      config.attributes = (q.attributes || []).filter(Boolean);
      config.columns = (q.maxdiffColumns || []).filter(Boolean);
      break;
    case 'auto_suggest':
      config.source_file_name = q.autoSuggestSourceFileName || '';
      break;
    case 'image_map':
      config.markers = (q.imageMapMarkers || []).filter(Boolean);
      config.images = (q.imageMapFiles || []).map((f) => ({ name: f.name }));
      break;
    case 'page_turner':
      config.pages = (q.pageTurnerPages || []).map((f) => ({ name: f.name }));
      break;
    case 'video_player':
      config.video_filename = q.videoFileName || '';
      break;
    case 'video_player_embed':
      config.name = q.videoEmbedName || '';
      config.url = q.videoEmbedUrl || '';
      break;
    case 'image_upload':
      config.images = (q.imageUploadFiles || []).map((f) => ({ name: f.name }));
      break;
    case 'section':
      config.section_name = q.sectionName || '';
      break;
    case 'note':
      config.note_text = q.noteText || '';
      break;
    case 'exec':
      config.exec_instruction = q.execInstruction || '';
      break;
    case 'autosum':
      config.rows = (q.rows || []).filter(Boolean);
      config.columns = (q.columns || []).filter(Boolean);
      break;
    default:
      break;
  }

  return { text: q.text, options, question_type, config };
};

// ─── Restore API question → QuestionModal form shape ──────────────────────────
const questionToModalForm = (apiQ) => {
  const rawType = apiQ.question_type || 'single_select';
  const type = BACKEND_TO_MODAL_TYPE[rawType] || rawType;
  const options = Array.isArray(apiQ.options) ? apiQ.options.filter(Boolean) : [];
  const config = apiQ.config || {};

  const base = { ...defaultQuestion(), id: apiQ.id, type, text: apiQ.text || '', instruction: config.instruction || '' };

  switch (type) {
    case 'single_select':
    case 'multi_select':
    case 'dropdown':
      base.options = options.length ? options : ['', ''];
      break;
    case 'single_select_grid':
      base.rows = (config.rows || []).map((r) => (typeof r === 'string' ? r : r.text || ''));
      base.columns = (config.columns || []).map((c) => (typeof c === 'string' ? c : c.text || ''));
      if (!base.rows.length) base.rows = options.length ? options : [''];
      if (!base.columns.length) base.columns = [''];
      break;
    case 'this_or_that':
      base.leftOptions = config.left_options || ['', ''];
      base.rightOptions = config.right_options || ['', ''];
      base.columns = config.columns || [''];
      break;
    case 'button_rating':
      base.buttonRatingRows = config.rows || options || [''];
      break;
    case 'star_rating':
      base.starTooltips = options.length ? options : config.star_tooltip ? [config.star_tooltip] : ['Text', 'Text', 'Text', 'Text', 'Text'];
      base.starRows = config.rows || ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5'];
      break;
    case 'rating_scale':
      base.scaleRows = config.rows || options || ['Text', 'Text', 'Text', 'Text', 'Text'];
      base.scaleColumns = config.columns || ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5'];
      break;
    case 'card_rating':
      base.cardRatingCards = config.cards || options || ['Text', 'Text'];
      base.cardRatingButtons = config.buttons || ['Button 1', 'Button 2'];
      break;
    case 'slider_rating':
      base.sliders = config.sliders || options || ['Button 1', 'Button 2'];
      base.sliderPoints = config.points || ['Text', 'Text'];
      break;
    case 'slider':
      base.sliders = config.sliders || options || ['Button 1', 'Button 2'];
      break;
    case 'rank_sort':
      base.rankLabels = config.rank_labels || ['Button 1', 'Button 2'];
      base.rankItems = config.rankable_items || options || ['Button 1', 'Button 2'];
      break;
    case 'card_sort':
      base.cards = config.cards || options || ['Button 1', 'Button 2'];
      base.buckets = config.buckets || ['Button 1', 'Button 2'];
      break;
    case 'maxdiff':
      base.attributes = config.attributes || options || ['Button 1', 'Button 2'];
      base.maxdiffColumns = config.columns || ['Button 1', 'Button 2'];
      break;
    case 'auto_suggest':
      base.autoSuggestSourceFileName = config.source_file_name || '';
      break;
    case 'image_map':
      base.imageMapMarkers = config.markers || [''];
      base.imageMapFiles = (config.images || []).map((f) => ({ name: typeof f === 'string' ? f : f.name }));
      break;
    case 'page_turner':
      base.pageTurnerPages = (config.pages || []).map((p) => ({ name: typeof p === 'string' ? p : p.name }));
      break;
    case 'video_player':
      base.videoFileName = config.video_filename || '';
      break;
    case 'video_player_embed':
      base.videoEmbedName = config.name || '';
      base.videoEmbedUrl = config.url || '';
      break;
    case 'image_upload':
      base.imageUploadFiles = (config.images || []).map((f) => ({ name: typeof f === 'string' ? f : f.name }));
      break;
    case 'section':
      base.sectionName = config.section_name || '';
      break;
    case 'note':
      base.noteText = config.note_text || '';
      break;
    case 'exec':
      base.execInstruction = config.exec_instruction || '';
      break;
    case 'autosum':
      base.rows = config.rows || [''];
      base.columns = config.columns || [''];
      break;
    default:
      if (options.length) base.options = options;
  }

  return base;
};

// ─── Normalize API response sections/questions ────────────────────────────────
const optionToText = (option) => {
  if (option === null || option === undefined) return '';
  if (typeof option === 'string') return option;
  if (typeof option === 'number' || typeof option === 'boolean') return String(option);
  if (typeof option === 'object') {
    if (typeof option.text === 'string') return option.text;
    if (typeof option.label === 'string') return option.label;
    if (typeof option.value !== 'undefined') return String(option.value);
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
      ? section.questions.map((q) => ({
          id: q.id,
          question_key: q.question_key || q.id,
          question_type: q.question_type || 'single_select',
          text: optionToText(q.text),
          options: Array.isArray(q.options)
            ? q.options.map(optionToText).map((o) => o.trim()).filter(Boolean)
            : [],
          config: q.config || {},
          order_index: q.order_index || 0,
        }))
      : [],
  }));
};

// ─── Component ────────────────────────────────────────────────────────────────
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
  const [uploadStatus, setUploadStatus] = useState({ isLoading: false, isSuccess: false, error: null, respondentCountsAvailable: false });
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState('');
  const [deletingSectionId, setDeletingSectionId] = useState(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState(null);

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitial, setModalInitial] = useState(null);     // null = add, Question = edit
  const [modalTargetSectionId, setModalTargetSectionId] = useState(null);
  const [modalTargetQuestionId, setModalTargetQuestionId] = useState(null);
  const [modalSectionTitle, setModalSectionTitle] = useState('');

  const fileInputRef = useRef(null);

  const createSectionMutation = useCreateQuestionnaireSection(workspaceId, explorationId, simulationId);
  const updateSectionMutation = useUpdateQuestionnaireSection(workspaceId, explorationId, simulationId);
  const deleteSectionMutation = useDeleteQuestionnaireSection(workspaceId, explorationId, simulationId);
  const createQuestionMutation = useCreateQuestionnaireQuestion(workspaceId, explorationId, simulationId);
  const updateQuestionMutation = useUpdateQuestionnaireQuestion(workspaceId, explorationId, simulationId);
  const deleteQuestionMutation = useDeleteQuestionnaireQuestion(workspaceId, explorationId, simulationId);

  const questionnaireSections = normalizeQuestionnaireData(questionnaireData);
  const hasSections = questionnaireSections.length > 0;
  const displaySectionIndex = questionnaireSections.length === 0 ? 0 : Math.min(activeSectionIndex, questionnaireSections.length - 1);
  const currentSection = questionnaireSections[displaySectionIndex];

  // ── Section handlers ─────────────────────────────────────────────────────────
  const handleDownloadCsv = () => {
    if (!hasSections) return;
    downloadQuestionnaireCsv(questionnaireSections, 'questionnaire_exploration.csv');
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const validExts = /\.(pdf|docx|txt|csv|xlsx|xls)$/i;
    if (!validExts.test(file.name)) {
      setUploadStatus({ isLoading: false, isSuccess: false, error: 'Please upload PDF, DOCX, TXT, CSV, or Excel', respondentCountsAvailable: false });
      return;
    }
    setUploadStatus({ isLoading: true, isSuccess: false, error: null, respondentCountsAvailable: false });
    try {
      const apiRes = await uploadQuestionnaireMutation.mutateAsync({ workspaceId, explorationId, simulationId, file });
      setUploadStatus({ isLoading: false, isSuccess: true, error: null, respondentCountsAvailable: !!apiRes?.data?.respondent_counts_available });
      onModified?.();
      setTimeout(() => setUploadStatus({ isLoading: false, isSuccess: false, error: null, respondentCountsAvailable: false }), 6000);
    } catch (err) {
      setUploadStatus({ isLoading: false, isSuccess: false, error: err.response?.data?.message || 'Upload failed', respondentCountsAvailable: false });
    }
    event.target.value = '';
  };

  const handleStartEditSection = (section) => {
    setEditingSectionId(section.section_id);
    setEditingSectionTitle(optionToText(section.title));
  };
  const handleCancelEditSection = () => { setEditingSectionId(null); setEditingSectionTitle(''); };
  const handleSaveSection = async () => {
    const title = editingSectionTitle.trim();
    if (!editingSectionId || !title) { window.alert('Section title cannot be empty'); return; }
    try {
      await updateSectionMutation.mutateAsync({ sectionId: editingSectionId, title });
      handleCancelEditSection();
      onModified?.();
    } catch (err) { console.error('Failed to update section:', err); }
  };

  const handleCreateSection = async () => {
    if (!simulationId) return;
    try {
      setActiveSectionIndex(questionnaireSections.length);
      await createSectionMutation.mutateAsync({ title: 'New Section', simulationId });
      onModified?.();
    } catch (err) { console.error('Failed to create section:', err); }
  };

  const handleDeleteSection = async (sectionId) => {
    if (!window.confirm('Delete this section and all its questions?')) return;
    const idx = questionnaireSections.findIndex((s) => s.section_id === sectionId);
    setDeletingSectionId(sectionId);
    try {
      await deleteSectionMutation.mutateAsync({ sectionId });
      if (idx >= 0 && idx <= activeSectionIndex) setActiveSectionIndex(Math.max(0, activeSectionIndex - 1));
      onModified?.();
    } catch (err) { console.error('Failed to delete section:', err); }
    finally { setDeletingSectionId(null); }
  };

  // ── Modal open handlers ──────────────────────────────────────────────────────
  const handleStartAddQuestion = (sectionId) => {
    const section = questionnaireSections.find((s) => s.section_id === sectionId);
    setModalTargetSectionId(sectionId);
    setModalTargetQuestionId(null);
    setModalInitial(null);
    setModalSectionTitle(section?.title || 'Untitled Section');
    setModalOpen(true);
  };

  const handleStartEditQuestion = (question) => {
    const section = questionnaireSections.find((s) =>
      s.questions.some((q) => q.id === question.id)
    );
    setModalTargetSectionId(null);
    setModalTargetQuestionId(question.id);
    setModalInitial(questionToModalForm(question));
    setModalSectionTitle(section?.title || 'Untitled Section');
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setModalInitial(null);
    setModalTargetSectionId(null);
    setModalTargetQuestionId(null);
  };

  const handleModalSave = async (q) => {
    const payload = buildApiPayload(q);
    try {
      if (modalTargetQuestionId) {
        await updateQuestionMutation.mutateAsync({ questionId: modalTargetQuestionId, ...payload });
      } else {
        await createQuestionMutation.mutateAsync({ sectionId: modalTargetSectionId, ...payload });
      }
      handleModalClose();
      onModified?.();
    } catch (err) {
      console.error('Failed to save question:', err);
    }
  };

  // ── Delete question ──────────────────────────────────────────────────────────
  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm('Delete this question?')) return;
    setDeletingQuestionId(questionId);
    try {
      await deleteQuestionMutation.mutateAsync({ questionId });
      onModified?.();
    } catch (err) { console.error('Failed to delete question:', err); }
    finally { setDeletingQuestionId(null); }
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
    <>
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
                    Survey results exist. Use &quot;Download questionnaire (CSV)&quot; to export with respondent counts.
                  </span>
                )}
              </div>
            )}
            {uploadStatus.error && <div className="text-red-600 text-sm">{uploadStatus.error}</div>}

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileChange}
              accept=".pdf,.docx,.txt,.csv,.xlsx,.xls"
            />

            <button
              type="button"
              onClick={handleCreateSection}
              disabled={createSectionMutation.isPending || !simulationId}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-bold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createSectionMutation.isPending ? <TbLoader className="w-5 h-5 animate-spin" /> : <TbPlus size={18} />}
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
              {uploadStatus.isLoading ? <TbLoader className="w-5 h-5 animate-spin" /> : <TbUpload size={18} />}
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
              // ── Add-question wired to modal; inline form disabled ──
              addingQuestionToSection={null}
              newQuestionText=""
              newQuestionOptions={[]}
              onNewQuestionTextChange={() => {}}
              onNewQuestionOptionChange={() => {}}
              onAddNewQuestionOption={() => {}}
              onRemoveNewQuestionOption={() => {}}
              onStartAddQuestion={handleStartAddQuestion}
              onCancelAddQuestion={handleModalClose}
              onCreateQuestion={() => {}}
              isCreatingQuestion={createQuestionMutation.isPending}
              // ── Edit wired to modal; inline form disabled ──
              editingQuestionId={null}
              editedQuestionText=""
              editedQuestionOptions={[]}
              onStartEditQuestion={handleStartEditQuestion}
              onCancelEditQuestion={handleModalClose}
              onEditedQuestionTextChange={() => {}}
              onEditedQuestionOptionChange={() => {}}
              onAddEditedQuestionOption={() => {}}
              onRemoveEditedQuestionOption={() => {}}
              onSaveQuestion={() => {}}
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

      {/* ── QuestionModal (Add / Edit) ─────────────────────────────────────────── */}
      <AnimatePresence>
        {modalOpen && (
          <QuestionModal
            key="question-modal"
            initial={modalInitial}
            sectionTitle={modalSectionTitle}
            onSave={handleModalSave}
            onClose={handleModalClose}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default QuestionnaireBuilder;
