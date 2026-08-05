import React, { useState, useEffect, useRef } from 'react';
import { useObjectives } from '../../../../../../context/ObjectiveContext';
import { useLoaderActive } from '../../../../../../context/LoaderActiveContext';
import ChatView from './ChatView';
import { motion, AnimatePresence } from 'framer-motion';
import { TbLoader, TbX, TbPlus, TbAlertCircle, TbPaperclip, TbExternalLink, TbDownload } from 'react-icons/tb';
import SpIcon from '../../../../../SPIcon';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import GuideValidationModal from './components/GuideValidationModal';
import {
  useDiscussionGuideWithAutoGenerate,
  useDiscussionGuideLimits,
  useCreateSection,
  useUpdateSection,
  useDeleteSection,
  useCreateQuestion,
  useUpdateQuestion,
  useDeleteQuestion,
  useDownloadDiscussionGuide,
} from '../../../../../../hooks/useDiscussionGuide';
import { useOmniWorkflow } from '../../../../../../hooks/useOmiWorkflow';
import { usePersonaBuilder } from '../../../../../../hooks/usePersonaBuilder';
import { useArtifactPipelineRun, getArtifactRunStageLabel } from '../../../../../../hooks/useArtifactPipelineRun';
import { artifactPipelineService } from '../../../../../../services/artifactPipelineService';
import { interviewService } from '../../../../../../services/interviewService';
import { getAxiosErrorMessage } from '../../../../../../utils/axiosBlobError';
import DiscussionGuideLoader from './DiscussionGuideLoader';
import OmiKeyboard from "../../../../../../assets/Omi Animations/OmiKeyboard.mp4";
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

// ── File validation constants ─────────────────────────────────────────────────

const MAX_FILE_SIZE_MB = 2;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];

type UploadError = 'size' | 'format' | null;

const getUploadErrorMessage = (errorType: UploadError): { title: string; subtitle: string } => {
  if (errorType === 'size') return {
    title: 'Upload Failed',
    subtitle: `File may exceed size limits of ${MAX_FILE_SIZE_MB}MB" in case of space issue`,
  };
  if (errorType === 'format') return {
    title: 'Upload Failed',
    subtitle: 'Invalid file format. Only PDF, Word (.doc/.docx) and Excel (.xls/.xlsx) files are allowed.',
  };
  return { title: '', subtitle: '' };
};

const validateFile = (file: File): UploadError => {
  const mimeOk = ALLOWED_MIME_TYPES.has(file.type);
  const extOk = ALLOWED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
  if (!mimeOk && !extOk) return 'format';
  if (file.size > MAX_FILE_SIZE_BYTES) return 'size';
  return null;
};

// ── Submitted artifact data (Research Objective Framer) ──────────────────────
//
// Mirrors ResearchObjectiveFramer's localStorage snapshot key. That component
// strips raw File objects before persisting (see stripFilesForStorage there),
// so file entries here only carry fileName/fileSizeLabel — never bytes. `url`
// is included defensively in case a backend-hosted URL is ever added to that
// payload; when present it's used to render an actual image preview instead
// of a generic file icon.

interface SubmittedArtifactFile {
  fileName: string;
  fileSizeLabel?: string | null;
  // Base64 data URL of the file's actual bytes, written by
  // ResearchObjectiveFramer's handleSubmitArtifact right before the
  // submitted snapshot is persisted. This is what lets us render a real
  // image preview (or offer a real download for non-image files) instead
  // of just a filename. Absent for artifacts submitted before this field
  // existed, or if the read failed — in that case we fall back to a
  // plain, non-interactive file card.
  dataUrl?: string | null;
}

interface SubmittedArtifactData {
  instruction: string;
  links: string[];
  files: SubmittedArtifactFile[];
}

const framerSubmittedDataKey = (objectiveId?: string) =>
  `ro_framer_submitted_data_${objectiveId ?? 'unknown'}`;

const loadSubmittedArtifact = (objectiveId?: string): SubmittedArtifactData | null => {
  try {
    const saved = localStorage.getItem(framerSubmittedDataKey(objectiveId));
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    const artifact = parsed?.material?.artifact;
    if (!artifact) return null;

    const links: string[] = Array.isArray(artifact.links)
      ? artifact.links
          .map((l: any) => (typeof l === 'string' ? l : l?.value))
          .filter((v: any): v is string => Boolean(v && String(v).trim()))
      : [];

    const files: SubmittedArtifactFile[] = Array.isArray(artifact.files)
      ? artifact.files
          .filter((f: any) => f?.fileName)
          .map((f: any) => ({
            fileName: f.fileName,
            fileSizeLabel: f.fileSizeLabel ?? null,
            dataUrl: f.dataUrl ?? null,
          }))
      : [];

    if (!links.length && !files.length) return null;
    return { instruction: artifact.instruction ?? '', links, files };
  } catch {
    return null;
  }
};

const isImageFileName = (name: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(name);

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
  const MAX = 500;
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

// ── Artifact File Card ─────────────────────────────────────────────────────
//
// Three states, in order of preference:
//  1. Image + we have its dataUrl  → render an actual <img> preview.
//  2. Any other file + dataUrl     → whole card becomes a clickable
//                                     download (video, doc, etc.) so the
//                                     user gets the real file rather than
//                                     just being told its name.
//  3. No dataUrl available         → plain, non-interactive file card
//                                     (legacy artifacts submitted before
//                                     dataUrl capture existed).

const ArtifactFileCard: React.FC<{ file: SubmittedArtifactFile }> = ({ file }) => {
  const isImage = isImageFileName(file.fileName);

  if (isImage && file.dataUrl) {
    return (
      <div className="di-artifact-modal__file-card">
        <img src={file.dataUrl} alt={file.fileName} />
        <span className="di-artifact-modal__file-name">{file.fileName}</span>
        {file.fileSizeLabel && (
          <span className="di-artifact-modal__file-size">{file.fileSizeLabel}</span>
        )}
      </div>
    );
  }

  if (file.dataUrl) {
    return (
      <a
        className="di-artifact-modal__file-card di-artifact-modal__file-card--download"
        href={file.dataUrl}
        download={file.fileName}
        title={`Download ${file.fileName}`}
      >
        <span className="di-artifact-modal__file-download-icon">
          <SpIcon name="sp-File-File_Blank" size={22} />
          <TbDownload size={11} className="di-artifact-modal__file-download-badge" />
        </span>
        <span className="di-artifact-modal__file-name">{file.fileName}</span>
        {file.fileSizeLabel && (
          <span className="di-artifact-modal__file-size">{file.fileSizeLabel}</span>
        )}
      </a>
    );
  }

  return (
    <div className="di-artifact-modal__file-card">
      <SpIcon name="sp-File-File_Blank" size={22} />
      <span className="di-artifact-modal__file-name">{file.fileName}</span>
      {file.fileSizeLabel && (
        <span className="di-artifact-modal__file-size">{file.fileSizeLabel}</span>
      )}
    </div>
  );
};

// ── Artifact View Modal ───────────────────────────────────────────────────────

const ArtifactViewModal: React.FC<{ data: SubmittedArtifactData; onClose: () => void }> = ({ data, onClose }) => (
  <ModalOverlay onClose={onClose}>
    <button className="di-modal__close" onClick={onClose}><TbX size={18} /></button>
    <h2 className="di-modal__title">Uploaded Artifact</h2>
    <p className="di-modal__subtitle">Material shared for this exploration</p>

    <div className="di-artifact-modal__body">
      {data.instruction && (
        <p className="di-artifact-modal__instruction">{data.instruction}</p>
      )}

      {data.links.length > 0 && (
        <div className="di-artifact-modal__section">
          <h4 className="di-artifact-modal__section-title">Links</h4>
          <ul className="di-artifact-modal__link-list">
            {data.links.map((link, i) => (
              <li key={`${link}-${i}`}>
                <a
                  className="di-artifact-modal__link"
                  href={link.startsWith('http') ? link : `https://${link}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="di-artifact-modal__link-text">{link}</span>
                  <TbExternalLink size={14} className="di-artifact-modal__link-icon" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.files.length > 0 && (
        <div className="di-artifact-modal__section">
          <h4 className="di-artifact-modal__section-title">Files</h4>
          <div className="di-artifact-modal__file-grid">
            {data.files.map((file, i) => (
              <ArtifactFileCard file={file} key={`${file.fileName}-${i}`} />
            ))}
          </div>
        </div>
      )}
    </div>
  </ModalOverlay>
);

// ── Main Component ────────────────────────────────────────────────────────────

const DepthInterview: React.FC = () => {
  const { objectives } = useObjectives();
  const { setLoaderActive } = useLoaderActive();
  const { workspaceId, objectiveId } = useParams<{ workspaceId: string; objectiveId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isViewOnly = Boolean((location.state as any)?.viewOnly);

  const {
    data: guideData, isLoading: isGuideLoading, error: guideError,
    refetch: refetchGuide, generateGuide, isGenerating, generationError, shouldAutoGenerate,
  } = useDiscussionGuideWithAutoGenerate(workspaceId, objectiveId);

  // Guide size caps come from backend settings — never hardcoded here, so the
  // limit is defined in exactly one place. While they are loading the Add
  // controls stay enabled; the backend rejects over-limit writes either way.
  const { data: limitsResponse } = useDiscussionGuideLimits(workspaceId, objectiveId);
  const limits = limitsResponse?.data;

  const createSectionMutation = useCreateSection(workspaceId!, objectiveId!);
  const updateSectionMutation = useUpdateSection(workspaceId!, objectiveId!);
  const deleteSectionMutation = useDeleteSection(workspaceId!, objectiveId!);
  const createQuestionMutation = useCreateQuestion(workspaceId!, objectiveId!);
  const updateQuestionMutation = useUpdateQuestion(workspaceId!, objectiveId!);
  const deleteQuestionMutation = useDeleteQuestion(workspaceId!, objectiveId!);
  const downloadGuideMutation = useDownloadDiscussionGuide(workspaceId, objectiveId);

  const { trigger } = useOmniWorkflow();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Artifact pipeline (runs before interviews start) ────────────────────────

  const { personas: fetchedPersonas } = usePersonaBuilder(workspaceId, objectiveId);
  const personaIds: string[] = ((fetchedPersonas as any)?.data ?? []).map((p: any) => p.id);

  const {
    startAndAwaitRun,
    status: artifactRunStatus,
  } = useArtifactPipelineRun(workspaceId!, objectiveId!);

  const [preparingArtifact, setPreparingArtifact] = useState(false);

  // ── UI state ──────────────────────────────────────────────────────────────

  const [showChat, setShowChat] = useState(false);
  const [showLoader, setShowLoader] = useState(false);

  // Sync loader visibility with the layout so StepSidebar hides Back button
  // while the discussion guide is being generated/uploaded, or while the
  // artifact pipeline is running ahead of the interview.
  useEffect(() => {
    setLoaderActive(showLoader || preparingArtifact);
  }, [showLoader, preparingArtifact, setLoaderActive]);
  useEffect(() => () => setLoaderActive(false), [setLoaderActive]);
  const [showReadyToast, setShowReadyToast] = useState(false);
  const [openKebabId, setOpenKebabId] = useState<string | null>(null);
  const [loaderMode, setLoaderMode] = useState<'generate' | 'upload'>('generate');
  const [showUploadToast, setShowUploadToast] = useState(false);
  const [uploadReady, setUploadReady] = useState(false);

  // ── Upload validation error ───────────────────────────────────────────────
  const [uploadError, setUploadError] = useState<UploadError>(null);

  // ── Uploaded artifact (from Research Objective Framer / File Upload Modal) ──
  const [artifactData, setArtifactData] = useState<SubmittedArtifactData | null>(null);
  const [showArtifactModal, setShowArtifactModal] = useState(false);

  useEffect(() => {
    setArtifactData(loadSubmittedArtifact(objectiveId));
    // Re-check whenever the guide data changes/reloads, in case an artifact
    // was submitted elsewhere in the flow since this screen last mounted.
  }, [objectiveId, guideData]);

  type ModalState =
    | { type: 'editSection'; sectionId: string; currentTitle: string }
    | { type: 'addSection' }
    | { type: 'editQuestion'; questionId: string; currentText: string }
    | { type: 'addQuestion'; sectionId: string }
    | { type: 'deleteSection'; sectionId: string }
    | { type: 'deleteQuestion'; questionId: string }
    | null;

  const [modal, setModal] = useState<ModalState>(null);

  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationReason, setValidationReason] = useState('');
  const [pendingValidationData, setPendingValidationData] = useState<PendingValidationType | null>(null);
  // Separate from validationReason: a size limit has no "Keep Anyway" path.
  const [limitReason, setLimitReason] = useState('');

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (objectiveId) trigger({ stage: 'persona_builder', event: 'BUILD_DISCUSSION_GUIDE', payload: {} });
  }, [objectiveId]);

  useEffect(() => {
    const close = () => setOpenKebabId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    const run = async () => {
      if (!isViewOnly && shouldAutoGenerate && workspaceId && objectiveId) {
        try {
          setLoaderMode('generate');
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
    setLoaderMode('generate');
    setShowLoader(true);
    try {
      trigger({ stage: 'discussion_guide', event: 'BUILD_DISCUSSION_GUIDE_LOAD', payload: {} });
      generateGuide();
    } catch (e) { console.error(e); }
  };

  const handleLoaderComplete = async () => {
    setShowLoader(false);
    setUploadReady(false);
    await refetchGuide();
    setShowReadyToast(true);
    setTimeout(() => setShowReadyToast(false), 4000);
    trigger({ stage: 'discussion_guide', event: 'BUILD_DISCUSSION_GUIDE_CREATED', payload: {} });
  };

  // ── Upload handlers ───────────────────────────────────────────────────────

  const handleUploadGuide = () => {
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    // ── Validate before doing anything ────────────────────────────────────
    const errorType = validateFile(file);
    if (errorType) {
      setUploadError(errorType);
      setTimeout(() => setUploadError(null), 6_000);
      return;
    }

    // ── Validation passed ─────────────────────────────────────────────────
    setUploadError(null);
    setLoaderMode('upload');
    setUploadReady(false);
    setShowLoader(true);

    setShowUploadToast(true);
    setTimeout(() => setShowUploadToast(false), 4000);

    try {
      trigger({ stage: 'discussion_guide', event: 'BUILD_DISCUSSION_GUIDE_UPLOAD', payload: {} });
      // TODO: replace with real upload API call
      await new Promise<void>((resolve) => setTimeout(resolve, 26_000));
      setUploadReady(true);
    } catch (err) {
      console.error('Upload failed:', err);
      setShowLoader(false);
      setUploadReady(false);
    }
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
    setModal(null); refetchGuide();
  };

  const addSection = async (title: string, isForce = false) => {
    const result = await createSectionMutation.mutateAsync({ title, is_force_insert: isForce });
    if ((result as any)?.data?.validation_status === 'limit_reached') {
      setLimitReason((result as any).data.reason);
      return;
    }
    if ((result as any)?.data?.validation_status === 'failed' && !isForce) {
      setValidationReason((result as any).data.reason);
      setPendingValidationData({ type: 'createSection', title });
      setShowValidationModal(true);
      return;
    }
    trigger({ stage: 'discussion_guide', event: 'BUILD_DISCUSSION_GUIDE_C_SECTION', payload: {} });
    setModal(null); refetchGuide();
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
    setModal(null); refetchGuide();
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
    setModal(null); refetchGuide();
  };

  const addQuestion = async (sectionId: string, text: string, isForce = false) => {
    const result = await createQuestionMutation.mutateAsync({ sectionId, text, is_force_insert: isForce });
    // A size limit is not advisory — unlike theme validation there is no
    // "add anyway", so surface the reason and stop regardless of isForce.
    if ((result as any)?.data?.validation_status === 'limit_reached') {
      setLimitReason((result as any).data.reason);
      return;
    }
    if ((result as any)?.data?.validation_status === 'failed' && !isForce) {
      setValidationReason((result as any).data.reason);
      setPendingValidationData({ type: 'createQuestion', sectionId, text });
      setShowValidationModal(true);
      return;
    }
    trigger({ stage: 'discussion_guide', event: 'BUILD_DISCUSSION_GUIDE_C_QUES', payload: {} });
    setModal(null); refetchGuide();
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
    setModal(null); refetchGuide();
  };

  // ── Start Interview ───────────────────────────────────────────────────────
  // Sequential flow: run the artifact pipeline to completion first (if there
  // are artifact files + personas to run it against), THEN navigate into the
  // interview flow exactly as before. If there's nothing to run, or the fetch
  // of available files fails, we skip straight to interviews so this never
  // becomes a hard blocker.
  //
  // Re-visit guard: checked against the BACKEND, not localStorage. If
  // interviews already exist for this objective (i.e. the user has already
  // been through this step before — visible as green checkmarks in the
  // sidebar), the artifact pipeline is skipped entirely and no loader is
  // ever shown. This is authoritative across browsers/sessions/reloads,
  // unlike a client-side flag.

  const handleStartInterview = async () => {
    if (objectiveId) localStorage.setItem(`qualitative_sub1_${objectiveId}`, '1');

    const goToInterview = () => {
      navigate(
        `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/chatview`,
        { state: { viewOnly: isViewOnly } }
      );
    };

    if (isViewOnly || !workspaceId || !objectiveId) {
      goToInterview();
      return;
    }

    // Already past this step — interviews exist for this objective already,
    // so don't touch the artifact pipeline at all, don't show its loader.
    try {
      const interviewsRes = await interviewService.getInterviews(workspaceId, objectiveId);
      const existingInterviews = (interviewsRes as any)?.data ?? interviewsRes;
      if (Array.isArray(existingInterviews) && existingInterviews.length > 0) {
        goToInterview();
        return;
      }
    } catch (err) {
      // If we can't tell, don't block on it — fall through to the normal
      // artifact-pipeline-then-interview flow below.
      console.error('Could not check for existing interviews:', err);
    }

    let availableFiles: any[] = [];
    try {
      const res = await artifactPipelineService.getAvailableFiles(workspaceId, objectiveId);
      availableFiles = res?.data ?? [];
    } catch (err) {
      console.error('Could not fetch available artifact files, skipping artifact pipeline:', err);
      goToInterview();
      return;
    }

    if (!availableFiles.length || !personaIds.length) {
      goToInterview();
      return;
    }

    setPreparingArtifact(true);
    try {
      const finalStatus = await startAndAwaitRun({
        sourceFileIds: availableFiles,
        personaIds,
      });

      // Even on failure we don't hard-block interviews — the run failing
      // shouldn't trap the user on this screen. Surface it, but proceed.
      if (!finalStatus || finalStatus.status === 'failed') {
        console.warn('Artifact pipeline did not complete successfully; proceeding to interviews anyway.');
      }
    } catch (err) {
      console.error('Artifact pipeline threw unexpectedly; proceeding to interviews anyway:', err);
    } finally {
      setPreparingArtifact(false);
    }

    goToInterview();
  };

  const handleDownloadGuide = async () => {
    if (!workspaceId || !objectiveId) return;
    try {
      await downloadGuideMutation.mutateAsync();
    } catch (err) {
      const detail = await getAxiosErrorMessage(err, 'Could not download the discussion guide.');
      window.alert(detail);
    }
  };

  // ── Upload error banner ───────────────────────────────────────────────────

  const UploadErrorBanner: React.FC = () => {
    if (!uploadError) return null;
    const { title, subtitle } = getUploadErrorMessage(uploadError);
    return (
      <AnimatePresence>
        {uploadError && (
          <motion.div
            className="di-upload-error-banner"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.22 }}
          >
            <TbAlertCircle size={20} className="di-upload-error-banner__icon" />
            <div className="di-upload-error-banner__body">
              <span className="di-upload-error-banner__title">{title}</span>
              <span className="di-upload-error-banner__subtitle">{subtitle}</span>
            </div>
            <button
              className="di-upload-error-banner__close"
              onClick={() => setUploadError(null)}
              aria-label="Dismiss"
            >
              <TbX size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    );
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const guide: Section[] = (guideData as GuideData | undefined)?.data ?? [];

  // ── Render guards ─────────────────────────────────────────────────────────

  if (showChat) return <ChatView />;

  // Artifact pipeline running ahead of the interview — blocks this screen
  // until the run reaches a terminal state, then handleStartInterview
  // navigates into ChatView on its own.
  if (preparingArtifact) {
    return (
      <div className="di-page di-page--centered">
        <div className="di-loading">
          <div className="di-loading__omi-wrap">
            <video
              className="di-loading__omi-video"
              src={OmiKeyboard}
              autoPlay
              loop
              muted
              playsInline
            />
          </div>
          <p className="di-loading__text">
            {getArtifactRunStageLabel(artifactRunStatus)}
          </p>
          {artifactRunStatus?.status === 'failed' && artifactRunStatus?.error_message && (
            <p className="di-loading__subtext">{artifactRunStatus.error_message}</p>
          )}
          {artifactRunStatus?.status !== 'failed' && artifactRunStatus?.persona_progress && (
            <p className="di-loading__subtext">
              {artifactRunStatus.persona_progress.completed}/{artifactRunStatus.persona_progress.total} personas processed
            </p>
          )}
        </div>
      </div>
    );
  }

  if (showLoader) return (
    <>
      <AnimatePresence>
        {showUploadToast && (
          <motion.div
            className="di-upload-toast"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
          >
            <SpIcon name="sp-Warning-Circle_Check" size={18} className="di-upload-toast__icon" />
            <span>File Uploaded Successfully</span>
            <button className="di-upload-toast__close" onClick={() => setShowUploadToast(false)}>
              <TbX size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!isViewOnly && <DiscussionGuideLoader
        mode={loaderMode}
        onComplete={handleLoaderComplete}
        isReady={loaderMode === 'upload' ? uploadReady : !isGenerating}
      />}
    </>
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
      {/* Hidden file input — only needed when not in view-only mode */}
      {!isViewOnly && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx"
          className="di-file-input"
          onChange={handleFileChange}
        />
      )}

      {/* Error banner portal — fixed top-center, above everything */}
      <div className="di-error-portal">
        <UploadErrorBanner />
      </div>

      {/* ── Empty state — hidden entirely in view-only mode ── */}
      {guide.length === 0 && !isViewOnly && (
        <div className="di-container">
          <motion.div
            className="di-empty-card"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="di-empty-card__icon-wrap">
              <SpIcon name="sp-Warning-Wavy_Help" size={40} />
            </div>
            <h2 className="di-empty-card__title">Start with Discussion Guide Creation</h2>
            <p className="di-empty-card__subtitle">
              Let's translate your objective into conversational questions that uncover real behaviour
            </p>
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

          <div className="di-guide-page-header">
            <div>
              <h1 className="di-guide-page-title">Discussion Guide</h1>
              <p className="di-guide-page-subtitle">
                Structured to uncover behaviours, motivations, and decision triggers
              </p>
            </div>
            <div className="di-guide-page-header-right">
              {artifactData && (
                <button
                  className="di-artifact-btn"
                  onClick={() => setShowArtifactModal(true)}
                  type="button"
                >
                  <TbPaperclip size={16} className="di-artifact-btn__icon" />
                  Artifact
                </button>
              )}
              <AnimatePresence>
                {showReadyToast && (
                  <motion.div
                    className="di-ready-toast"
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.22 }}
                  >
                    <SpIcon name="sp-Warning-Circle_Check" size={18} className="di-ready-toast__icon" />
                    <span>Your Discussion Guide is Ready</span>
                    <button className="di-ready-toast__close" onClick={() => setShowReadyToast(false)}>
                      <TbX size={14} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="di-guide-card">
            {guide.map((section, sectionIndex) => (
              <motion.div
                key={section.section_id}
                className="di-section"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: sectionIndex * 0.06 }}
              >
                <div className="di-section__header">
                  <div className="di-section__header-left">
                    <div className="di-section__num">{sectionIndex + 1}</div>
                    <h3 className="di-section__title">{section.title}</h3>
                    {/* Edit section button — hidden in view-only mode */}
                    {!isViewOnly && (
                      <button
                        className="di-icon-btn"
                        title="Edit Section"
                        onClick={() => setModal({ type: 'editSection', sectionId: section.section_id, currentTitle: section.title })}
                      >
                        <SpIcon name="sp-Edit-Edit_Pencil_01" size={16} />
                      </button>
                    )}
                  </div>
                  {/* Delete section button — hidden in view-only mode */}
                  {!isViewOnly && (
                    <button
                      className="di-icon-btn di-icon-btn--danger"
                      title="Delete Section"
                      onClick={() => setModal({ type: 'deleteSection', sectionId: section.section_id })}
                    >
                      <SpIcon name="sp-Interface-Trash_Full" size={18} />
                    </button>
                  )}
                </div>

                <div className="di-section__divider" />

                <div className="di-questions">
                  {section.questions?.map((question, qIndex) => (
                    <div className="di-question" key={question.id}>
                      <span className="di-question__label">Q{qIndex + 1}.</span>
                      <p className="di-question__text">{question.text}</p>
                      {/* Question kebab menu — hidden entirely in view-only mode */}
                      {!isViewOnly && (
                        <div className="di-question__menu-wrap">
                          <button
                            className="di-question__menu-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenKebabId(openKebabId === question.id ? null : question.id);
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
                                <SpIcon name="sp-Edit-Edit_Pencil_01" size={14} /> Edit
                              </button>
                              <button
                                className="di-question__menu-item di-question__menu-item--danger"
                                onClick={() => {
                                  setOpenKebabId(null);
                                  setModal({ type: 'deleteQuestion', questionId: question.id });
                                }}
                              >
                                <SpIcon name="sp-Interface-Trash_Empty" size={14} /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Question button — hidden in view-only mode, disabled at
                    the per-section cap. The backend enforces the same limit, so
                    this is a UX affordance rather than the control itself. */}
                {!isViewOnly && (() => {
                  const questionCount = section.questions?.length ?? 0;
                  const atLimit =
                    !!limits && questionCount >= limits.max_questions_per_section;
                  return (
                    <button
                      className="di-add-question-btn"
                      disabled={atLimit}
                      title={
                        atLimit
                          ? `Limit reached — ${limits!.max_questions_per_section} questions per section `
                            + `(${limits!.default_questions_per_section} generated + `
                            + `${limits!.max_extra_questions_per_section} you can add)`
                          : undefined
                      }
                      onClick={() => setModal({ type: 'addQuestion', sectionId: section.section_id })}
                    >
                      <TbPlus size={15} />
                      {atLimit
                        ? `Question limit reached (${questionCount}/${limits!.max_questions_per_section})`
                        : 'Add Question'}
                    </button>
                  );
                })()}
              </motion.div>
            ))}

            {/* Add New Section footer — hidden in view-only mode */}
            {!isViewOnly && (() => {
              const atSectionLimit =
                !!limits && guide.length >= limits.max_sections_per_guide;
              return (
                <div className="di-guide-footer">
                  <button
                    className="di-footer-add-section-btn"
                    disabled={atSectionLimit}
                    title={
                      atSectionLimit
                        ? `Limit reached — ${limits!.max_sections_per_guide} sections per guide`
                        : undefined
                    }
                    onClick={() => setModal({ type: 'addSection' })}
                  >
                    <TbPlus size={18} />
                    {atSectionLimit
                      ? `Section limit reached (${guide.length}/${limits!.max_sections_per_guide})`
                      : 'Add New Section'}
                  </button>
                </div>
              );
            })()}
          </div>

          <div className="di-start-interview-bar">
            <button
              className="di-download-guide-btn"
              onClick={handleDownloadGuide}
              disabled={downloadGuideMutation.isPending}
            >
              {downloadGuideMutation.isPending ? 'Downloading…' : 'Download Discussion Guide'}
              {downloadGuideMutation.isPending
                ? <TbLoader className="di-spin" size={20} />
                : <SpIcon name="sp-File-File_Download" size={24} />}
            </button>
            <button className="di-start-interview-btn" onClick={handleStartInterview}>
              Start Interview
              <SpIcon name="sp-Arrow-Arrow_Right_SM" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Modals — never rendered in view-only mode since triggers are hidden ── */}
      <AnimatePresence>
        {modal?.type === 'editSection' && (
          <SectionModal mode="edit" initialValue={modal.currentTitle} isPending={updateSectionMutation.isPending}
            onConfirm={(val) => saveSection(modal.sectionId, val)} onClose={() => setModal(null)} />
        )}
        {modal?.type === 'addSection' && (
          <SectionModal mode="add" isPending={createSectionMutation.isPending}
            onConfirm={(val) => addSection(val)} onClose={() => setModal(null)} />
        )}
        {modal?.type === 'editQuestion' && (
          <QuestionModal mode="edit" initialValue={modal.currentText} isPending={updateQuestionMutation.isPending}
            onConfirm={(val) => saveQuestion(modal.questionId, val)} onClose={() => setModal(null)} />
        )}
        {modal?.type === 'addQuestion' && (
          <QuestionModal mode="add" isPending={createQuestionMutation.isPending}
            onConfirm={(val) => addQuestion(modal.sectionId, val)} onClose={() => setModal(null)} />
        )}
        {modal?.type === 'deleteSection' && (
          <DeleteModal target="section" isPending={deleteSectionMutation.isPending}
            onConfirm={() => deleteSection(modal.sectionId)} onClose={() => setModal(null)} />
        )}
        {modal?.type === 'deleteQuestion' && (
          <DeleteModal target="question" isPending={deleteQuestionMutation.isPending}
            onConfirm={() => deleteQuestion(modal.questionId)} onClose={() => setModal(null)} />
        )}
      </AnimatePresence>

      {/* ── Artifact view modal ── */}
      <AnimatePresence>
        {showArtifactModal && artifactData && (
          <ArtifactViewModal data={artifactData} onClose={() => setShowArtifactModal(false)} />
        )}
      </AnimatePresence>

      <GuideValidationModal
        show={showValidationModal}
        reason={validationReason}
        onContinue={handleValidationContinue}
        onClose={() => {
          setShowValidationModal(false);
          setValidationReason('');
          setPendingValidationData(null);
        }}
      />

      {/* Size limit — no onContinue, so no "Keep Anyway" button is rendered. */}
      <GuideValidationModal
        show={!!limitReason}
        reason={limitReason}
        title="Discussion Guide Limit Reached"
        subtitle="Guide size is capped to keep interview generation fast and affordable."
        feedbackLabel="What you can do:"
        closeLabel="Got it"
        onClose={() => setLimitReason('')}
      />
    </div>
  );
};

export default DepthInterview;