import React, { useState, useEffect, useRef } from 'react';
import { useObjectives } from '../../../../../../context/ObjectiveContext';
import ChatView from './ChatView';
import { motion, AnimatePresence } from 'framer-motion';
import { TbLoader, TbX, TbPlus } from 'react-icons/tb';
import SpIcon from '../../../../../SPIcon';
import { useNavigate, useParams } from 'react-router-dom';
import GuideValidationModal from './components/GuideValidationModal';
import {
  useDiscussionGuideWithAutoGenerate,
  useCreateSection,
  useUpdateSection,
  useDeleteSection,
  useCreateQuestion,
  useUpdateQuestion,
  useDeleteQuestion,
} from '../../../../../../hooks/useDiscussionGuide';
import { useOmniWorkflow } from '../../../../../../hooks/useOmiWorkflow';
import DiscussionGuideLoader from './DiscussionGuideLoader';
import './DepthInterview.css';

// ── Types ────────────────────────────────────────────────────────────────────

interface Question { id: string; text: string; }
interface Section { section_id: string; title: string; questions?: Question[]; }
interface GuideData { data?: Section[]; }

type PendingValidationType =
  | { type: 'updateQuestion'; questionId: string; text: string }
  | { type: 'createQuestion'; sectionId: string; text: string }
  | { type: 'updateSection'; sectionId: string; title: string }
  | { type: 'createSection'; title: string }
  | { type: 'deleteQuestion'; questionId: string }
  | { type: 'deleteSection'; sectionId: string };

// ── Shared Modal Shell ────────────────────────────────────────────────────────

const ModalOverlay: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => (
  <motion.div
    className="di-modal-overlay"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onClick={onClose}
  >
    <motion.div
      className="di-modal"
      initial={{ opacity: 0, scale: 0.95, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 16 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </motion.div>
  </motion.div>
);

// ── Edit / Add Section Modal ──────────────────────────────────────────────────

interface SectionModalProps {
  mode: 'edit' | 'add';
  initialValue?: string;
  isPending: boolean;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

const SectionModal: React.FC<SectionModalProps> = ({ mode, initialValue = '', isPending, onConfirm, onClose }) => {
  const [value, setValue] = useState(initialValue);
  const MAX = 100;

  return (
    <ModalOverlay onClose={onClose}>
      <button className="di-modal__close" onClick={onClose}><TbX size={18} /></button>
      <h2 className="di-modal__title">{mode === 'edit' ? 'Edit Section' : 'Add New Section'}</h2>
      <p className="di-modal__subtitle">{mode === 'edit' ? 'Alter the section name' : "Didn't find it? Add your own"}</p>
      <div className="di-modal__field">
        <input
          className="di-modal__input"
          value={value}
          maxLength={MAX}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) onConfirm(value.trim()); }}
          placeholder="Section title…"
        />
        <span className="di-modal__char-count">{value.length}/{MAX}</span>
      </div>
      <div className="di-modal__actions">
        <button className="di-modal__btn di-modal__btn--cancel" onClick={onClose}>Cancel</button>
        <button
          className="di-modal__btn di-modal__btn--confirm"
          disabled={!value.trim() || isPending}
          onClick={() => onConfirm(value.trim())}
        >
          {isPending ? <TbLoader className="di-spin" size={16} /> : (mode === 'edit' ? 'Update' : 'Add')}
        </button>
      </div>
    </ModalOverlay>
  );
};

// ── Edit / Add Question Modal ─────────────────────────────────────────────────

interface QuestionModalProps {
  mode: 'edit' | 'add';
  initialValue?: string;
  isPending: boolean;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

const QuestionModal: React.FC<QuestionModalProps> = ({ mode, initialValue = '', isPending, onConfirm, onClose }) => {
  const [value, setValue] = useState(initialValue);
  const MAX = 100;

  return (
    <ModalOverlay onClose={onClose}>
      <button className="di-modal__close" onClick={onClose}><TbX size={18} /></button>
      <h2 className="di-modal__title">{mode === 'edit' ? 'Edit Question' : 'Add New Question'}</h2>
      <p className="di-modal__subtitle">{mode === 'edit' ? 'Alter the question' : "Add your question, we'll take it from there."}</p>
      <div className="di-modal__field">
        <textarea
          className="di-modal__textarea"
          value={value}
          maxLength={MAX}
          autoFocus
          rows={3}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter question text…"
        />
        <span className="di-modal__char-count">{value.length}/{MAX}</span>
      </div>
      <div className="di-modal__actions">
        <button className="di-modal__btn di-modal__btn--cancel" onClick={onClose}>Cancel</button>
        <button
          className="di-modal__btn di-modal__btn--confirm"
          disabled={!value.trim() || isPending}
          onClick={() => onConfirm(value.trim())}
        >
          {isPending ? <TbLoader className="di-spin" size={16} /> : (mode === 'edit' ? 'Update' : 'Add')}
        </button>
      </div>
    </ModalOverlay>
  );
};

// ── Delete Confirmation Modal ─────────────────────────────────────────────────

interface DeleteModalProps {
  target: 'section' | 'question';
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const DeleteModal: React.FC<DeleteModalProps> = ({ target, isPending, onConfirm, onClose }) => (
  <ModalOverlay onClose={onClose}>
    <button className="di-modal__close" onClick={onClose}><TbX size={18} /></button>
    <div className="di-modal__delete-icon">
      <SpIcon name="sp-Interface-Trash_Full" size={28} />
    </div>
    <h2 className="di-modal__title">Delete {target === 'section' ? 'Section' : 'Question'}</h2>
    <p className="di-modal__subtitle">
      This will erase the {target === 'section' ? 'section' : 'question'} permenantly
    </p>
    <div className="di-modal__actions">
      <button
        className="di-modal__btn di-modal__btn--delete"
        disabled={isPending}
        onClick={onConfirm}
      >
        {isPending ? <TbLoader className="di-spin" size={16} /> : 'Delete'}
      </button>
      <button className="di-modal__btn di-modal__btn--cancel" onClick={onClose}>Cancel</button>
    </div>
  </ModalOverlay>
);

// ── Main Component ────────────────────────────────────────────────────────────

const DepthInterview: React.FC = () => {
  const { objectives } = useObjectives();
  const { workspaceId, objectiveId } = useParams<{ workspaceId: string; objectiveId: string }>();
  const navigate = useNavigate();

  const {
    data: guideData, isLoading: isGuideLoading, error: guideError,
    refetch: refetchGuide, generateGuide, isGenerating, generationError, shouldAutoGenerate,
  } = useDiscussionGuideWithAutoGenerate(workspaceId, objectiveId);

  const createSectionMutation = useCreateSection(workspaceId!, objectiveId!);
  const updateSectionMutation = useUpdateSection(workspaceId!, objectiveId!);
  const deleteSectionMutation = useDeleteSection(workspaceId!, objectiveId!);
  const createQuestionMutation = useCreateQuestion(workspaceId!, objectiveId!);
  const updateQuestionMutation = useUpdateQuestion(workspaceId!, objectiveId!);
  const deleteQuestionMutation = useDeleteQuestion(workspaceId!, objectiveId!);

  const { trigger } = useOmniWorkflow();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── UI state ──────────────────────────────────────────────────────────────

  const [showChat, setShowChat] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [showReadyToast, setShowReadyToast] = useState(false);
  // Tracks which question's kebab menu is open (by question id)
  const [openKebabId, setOpenKebabId] = useState<string | null>(null);

  // Modal state — one active modal at a time
  type ModalState =
    | { type: 'editSection'; sectionId: string; currentTitle: string }
    | { type: 'addSection' }
    | { type: 'editQuestion'; questionId: string; currentText: string }
    | { type: 'addQuestion'; sectionId: string }
    | { type: 'deleteSection'; sectionId: string }
    | { type: 'deleteQuestion'; questionId: string }
    | null;

  const [modal, setModal] = useState<ModalState>(null);

  // Validation modal
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationReason, setValidationReason] = useState('');
  const [pendingValidationData, setPendingValidationData] = useState<PendingValidationType | null>(null);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (objectiveId) trigger({ stage: 'persona_builder', event: 'BUILD_DISCUSSION_GUIDE', payload: {} });
  }, [objectiveId]);

  // Close kebab menu when clicking anywhere outside
  useEffect(() => {
    const close = () => setOpenKebabId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    const run = async () => {
      if (shouldAutoGenerate && workspaceId && objectiveId) {
        try {
          setShowLoader(true);
          trigger({ stage: 'discussion_guide', event: 'BUILD_DISCUSSION_GUIDE_LOAD', payload: {} });
          await generateGuide();
        } catch (e) {
          console.error(e);
          setShowLoader(false);
        }
      }
    };
    run();
  }, [shouldAutoGenerate, workspaceId, objectiveId]);

  // ── Guide handlers ────────────────────────────────────────────────────────

  const handleCreateGuide = () => {
    setShowLoader(true);
    try {
      trigger({ stage: 'discussion_guide', event: 'BUILD_DISCUSSION_GUIDE_LOAD', payload: {} });
      generateGuide();
    } catch (e) { console.error(e); }
  };

  const handleLoaderComplete = async () => {
    setShowLoader(false);
    await refetchGuide();
    setShowReadyToast(true);
    setTimeout(() => setShowReadyToast(false), 4000);
    trigger({ stage: 'discussion_guide', event: 'BUILD_DISCUSSION_GUIDE_CREATED', payload: {} });
  };

  const handleUploadGuide = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) console.log('Uploading:', file.name);
  };

  // ── Validation modal ──────────────────────────────────────────────────────

  const handleValidationContinue = async () => {
    const data = pendingValidationData;
    if (!data) return;
    setShowValidationModal(false);
    setValidationReason('');
    setPendingValidationData(null);
    try {
      if (data.type === 'updateQuestion') await saveQuestion(data.questionId, data.text, true);
      else if (data.type === 'createQuestion') await addQuestion(data.sectionId, data.text, true);
      else if (data.type === 'updateSection') await saveSection(data.sectionId, data.title, true);
      else if (data.type === 'createSection') await addSection(data.title, true);
      else if (data.type === 'deleteQuestion') await deleteQuestion(data.questionId, true);
      else if (data.type === 'deleteSection') await deleteSection(data.sectionId, true);
    } catch (e) { console.error(e); }
  };

  // ── Section operations ────────────────────────────────────────────────────

  const saveSection = async (sectionId: string, title: string, isForce = false) => {
    const result = await updateSectionMutation.mutateAsync({ sectionId, title, is_force_insert: isForce });
    if ((result as any)?.data?.validation_status === 'failed' && !isForce) {
      setValidationReason((result as any).data.reason);
      setPendingValidationData({ type: 'updateSection', sectionId, title });
      setShowValidationModal(true);
      return;
    }
    setModal(null);
    refetchGuide();
  };

  const addSection = async (title: string, isForce = false) => {
    const result = await createSectionMutation.mutateAsync({ title, is_force_insert: isForce });
    if ((result as any)?.data?.validation_status === 'failed' && !isForce) {
      setValidationReason((result as any).data.reason);
      setPendingValidationData({ type: 'createSection', title });
      setShowValidationModal(true);
      return;
    }
    trigger({ stage: 'discussion_guide', event: 'BUILD_DISCUSSION_GUIDE_C_SECTION', payload: {} });
    setModal(null);
    refetchGuide();
  };

  const deleteSection = async (sectionId: string, isForce = false) => {
    const result = await deleteSectionMutation.mutateAsync({ sectionId, data: { is_force_insert: isForce } });
    if ((result as any)?.data?.validation_status === 'failed' && !isForce) {
      setValidationReason((result as any).data.reason);
      setPendingValidationData({ type: 'deleteSection', sectionId });
      setShowValidationModal(true);
      return;
    }
    trigger({ stage: 'discussion_guide', event: 'BUILD_DISCUSSION_GUIDE_D_SECTION', payload: {} });
    setModal(null);
    refetchGuide();
  };

  // ── Question operations ───────────────────────────────────────────────────

  const saveQuestion = async (questionId: string, text: string, isForce = false) => {
    const result = await updateQuestionMutation.mutateAsync({ questionId, data: { text, is_force_insert: isForce } });
    if ((result as any)?.data?.validation_status === 'failed' && !isForce) {
      setValidationReason((result as any).data.reason);
      setPendingValidationData({ type: 'updateQuestion', questionId, text });
      setShowValidationModal(true);
      return;
    }
    setModal(null);
    refetchGuide();
  };

  const addQuestion = async (sectionId: string, text: string, isForce = false) => {
    const result = await createQuestionMutation.mutateAsync({ sectionId, text, is_force_insert: isForce });
    if ((result as any)?.data?.validation_status === 'failed' && !isForce) {
      setValidationReason((result as any).data.reason);
      setPendingValidationData({ type: 'createQuestion', sectionId, text });
      setShowValidationModal(true);
      return;
    }
    trigger({ stage: 'discussion_guide', event: 'BUILD_DISCUSSION_GUIDE_C_QUES', payload: {} });
    setModal(null);
    refetchGuide();
  };

  const deleteQuestion = async (questionId: string, isForce = false) => {
    const result = await deleteQuestionMutation.mutateAsync({ questionId, data: { is_force_insert: isForce } });
    if ((result as any)?.data?.validation_status === 'failed' && !isForce) {
      setValidationReason((result as any).data.reason);
      setPendingValidationData({ type: 'deleteQuestion', questionId });
      setShowValidationModal(true);
      return;
    }
    trigger({ stage: 'discussion_guide', event: 'BUILD_DISCUSSION_GUIDE_D_QUES', payload: {} });
    setModal(null);
    refetchGuide();
  };

  // ── Start Interview ───────────────────────────────────────────────────────

  const handleStartInterview = () => {
    if (objectiveId) localStorage.setItem(`qualitative_sub1_${objectiveId}`, '1');
    navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/chatview`);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const guide: Section[] = (guideData as GuideData | undefined)?.data ?? [];

  // ── Render guards ─────────────────────────────────────────────────────────

  if (showChat) return <ChatView />;
  // isReady = backend has finished generating (isGenerating flipped to false)
  if (showLoader) return (
    <DiscussionGuideLoader
      onComplete={handleLoaderComplete}
      isReady={!isGenerating}
    />
  );

  if (isGuideLoading) {
    return (
      <div className="di-page di-page--centered">
        <div className="di-loading">
          <TbLoader className="di-loading__spinner" />
          <p className="di-loading__text">Loading…</p>
        </div>
      </div>
    );
  }

  if (guideError || generationError) {
    return (
      <div className="di-page di-page--centered">
        <div className="di-error">
          <p className="di-error__text">Failed to load discussion guide</p>
          <button onClick={() => navigate(-1)} className="di-error__btn">Go Back</button>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="di-page">
      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="di-file-input" onChange={handleFileChange} />

      {/* ── Empty state ── */}
      {guide.length === 0 && (
        <div className="di-container">
          <motion.div className="di-empty-card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            <div className="di-empty-card__icon-wrap">
              <SpIcon name="sp-Warning-Wavy_Help" size={40} />
            </div>
            <h2 className="di-empty-card__title">Start with Discussion Guide Creation</h2>
            <p className="di-empty-card__subtitle">Let's translate your objective into conversational questions that uncover real behaviour</p>
            <div className="di-empty-card__actions">
              <button className="di-btn di-btn--outline" onClick={handleUploadGuide}>
                <SpIcon name="sp-File-Cloud_Upload" size={20} className="di-btn__icon" />
                Upload Discussion Guide
              </button>
              <button className="di-btn di-btn--primary" onClick={handleCreateGuide} disabled={isGenerating}>
                {isGenerating
                  ? <TbLoader className="di-btn__icon di-btn__icon--spin" />
                  : <SpIcon name="sp-Other-Magic" size={20} className="di-btn__icon" />}
                {isGenerating ? 'Creating…' : 'Create Discussion Guide'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Guide content ── */}
      {guide.length > 0 && (
        <div className="di-guide-page">

          {/* Header */}
          <div className="di-guide-page-header">
            <div>
              <h1 className="di-guide-page-title">Discussion Guide</h1>
              <p className="di-guide-page-subtitle">Structured to uncover behaviours, motivations, and decision triggers</p>
            </div>
            <AnimatePresence>
              {showReadyToast && (
                <motion.div className="di-ready-toast"
                  initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ duration: 0.22 }}>
                  <SpIcon name="sp-Warning-Circle_Check" size={18} className="di-ready-toast__icon" />
                  <span>Your Discussion Guide is Ready</span>
                  <button className="di-ready-toast__close" onClick={() => setShowReadyToast(false)}><TbX size={14} /></button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sections container */}
          <div className="di-guide-card">
            {guide.map((section, sectionIndex) => (
              <motion.div key={section.section_id} className="di-section"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: sectionIndex * 0.06 }}>

                {/* Section header */}
                <div className="di-section__header">
                  <div className="di-section__header-left">
                    <div className="di-section__num">{sectionIndex + 1}</div>
                    <h3 className="di-section__title">{section.title}</h3>
                    <button
                      className="di-icon-btn"
                      title="Edit Section"
                      onClick={() => setModal({ type: 'editSection', sectionId: section.section_id, currentTitle: section.title })}
                    >
                      <SpIcon name="sp-Edit-Edit_Pencil_01" size={16} />
                    </button>
                  </div>
                  <button
                    className="di-icon-btn di-icon-btn--danger"
                    title="Delete Section"
                    onClick={() => setModal({ type: 'deleteSection', sectionId: section.section_id })}
                  >
                    <SpIcon name="sp-Interface-Trash_Full" size={18} />
                  </button>
                </div>

                <div className="di-section__divider" />

                {/* Questions */}
                <div className="di-questions">
                  {section.questions?.map((question, qIndex) => (
                    <div className="di-question" key={question.id}>
                      <span className="di-question__label">Q{qIndex + 1}.</span>
                      <p className="di-question__text">{question.text}</p>

                      {/* ── Three-dot kebab menu (Figma: ⋮ on the right) ── */}
                      <div className="di-question__menu-wrap">
                        <button
                          className="di-question__menu-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenKebabId(
                              openKebabId === question.id ? null : question.id
                            );
                          }}
                          aria-label="Question options"
                        >
                          <SpIcon name="sp-Menu-More_Vertical" size={16} />
                        </button>
                        {openKebabId === question.id && (
                          <div className="di-question__menu" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="di-question__menu-item"
                              onClick={() => {
                                setOpenKebabId(null);
                                setModal({ type: 'editQuestion', questionId: question.id, currentText: question.text });
                              }}
                            >
                              <SpIcon name="sp-Edit-Edit_Pencil_01" size={14} />
                              Edit
                            </button>
                            <button
                              className="di-question__menu-item di-question__menu-item--danger"
                              onClick={() => {
                                setOpenKebabId(null);
                                setModal({ type: 'deleteQuestion', questionId: question.id });
                              }}
                            >
                              <SpIcon name="sp-Interface-Trash_Empty" size={14} />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add question */}
                <button
                  className="di-add-question-btn"
                  onClick={() => setModal({ type: 'addQuestion', sectionId: section.section_id })}
                >
                  <TbPlus size={15} />
                  Add Question
                </button>

              </motion.div>
            ))}
            {/* Add New Section */}
            <div className="di-guide-footer">
              <button className="di-footer-add-section-btn" onClick={() => setModal({ type: 'addSection' })}>
                <TbPlus size={18} />
                Add New Section
              </button>
            </div>
          </div>



          {/* Start Interview */}
          <div className="di-start-interview-bar">
            <button className="di-start-interview-btn" onClick={handleStartInterview}>
              Start Interview
              <SpIcon name="sp-Arrow-Arrow_Right_SM" size={16} />
            </button>
          </div>

        </div>
      )}

      {/* ── Modals ── */}
      <AnimatePresence>
        {modal?.type === 'editSection' && (
          <SectionModal
            mode="edit"
            initialValue={modal.currentTitle}
            isPending={updateSectionMutation.isPending}
            onConfirm={(val) => saveSection(modal.sectionId, val)}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.type === 'addSection' && (
          <SectionModal
            mode="add"
            isPending={createSectionMutation.isPending}
            onConfirm={(val) => addSection(val)}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.type === 'editQuestion' && (
          <QuestionModal
            mode="edit"
            initialValue={modal.currentText}
            isPending={updateQuestionMutation.isPending}
            onConfirm={(val) => saveQuestion(modal.questionId, val)}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.type === 'addQuestion' && (
          <QuestionModal
            mode="add"
            isPending={createQuestionMutation.isPending}
            onConfirm={(val) => addQuestion(modal.sectionId, val)}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.type === 'deleteSection' && (
          <DeleteModal
            target="section"
            isPending={deleteSectionMutation.isPending}
            onConfirm={() => deleteSection(modal.sectionId)}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.type === 'deleteQuestion' && (
          <DeleteModal
            target="question"
            isPending={deleteQuestionMutation.isPending}
            onConfirm={() => deleteQuestion(modal.questionId)}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>

      <GuideValidationModal
        show={showValidationModal}
        reason={validationReason}
        onContinue={handleValidationContinue}
        onClose={() => { setShowValidationModal(false); setValidationReason(''); setPendingValidationData(null); }}
      />
    </div>
  );
};

export default DepthInterview;