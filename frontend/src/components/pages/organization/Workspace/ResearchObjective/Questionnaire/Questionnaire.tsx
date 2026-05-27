import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { TbLoader, TbX, TbAlertCircle } from 'react-icons/tb';
import SpIcon from '../../../../../SPIcon';
import QuestionnaireLoader from './QuestionnaireLoader';
import QuestionnaireGuide from './QuestionnaireGuide';
import type { Question } from './QuestionModal';
import type { QuestionType } from './QuestionModal';
import {
  useAllQuestionnairesForExploration,
  usePersonas,
} from '../../../../../../hooks/useQuantitativeQueries';
import {
  generateQuestionnaire,
  getQuestionnaireGenerationStatus,
  uploadQuestionnaire,
  getAllQuestionnairesForExploration,
} from '../../../../../../services/quantitativeServices';
import './Questionnaire.css';

// ── Types ────────────────────────────────────────────────────────────────────

interface Section {
  id: string;
  title: string;
  questions: Question[];
}

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
const GENERATION_POLL_INTERVAL_MS = 3_000;
const GENERATION_MAX_WAIT_MS = 10 * 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type UploadError = 'size' | 'format' | 'api' | null;

const getUploadErrorMessage = (errorType: UploadError): { title: string; subtitle: string } => {
  if (errorType === 'size') {
    return {
      title: 'Upload Failed',
      subtitle: `File may exceed size limits of ${MAX_FILE_SIZE_MB}MB`,
    };
  }
  if (errorType === 'format') {
    return {
      title: 'Upload Failed',
      subtitle: 'Invalid file format. Only PDF, Word (.doc/.docx) and Excel (.xls/.xlsx) files are allowed.',
    };
  }
  if (errorType === 'api') {
    return {
      title: 'Generation Failed',
      subtitle: 'Could not generate questionnaire. Please try again.',
    };
  }
  return { title: '', subtitle: '' };
};

// ── Helper — map backend section/question shape to QuestionnaireGuide Section ─

const makeId = () => Math.random().toString(36).slice(2, 8);

const mapApiToSections = (apiSections: any[]): Section[] =>
  (apiSections ?? []).map((sec: any) => ({
    id: sec.id || makeId(),
    title: sec.title || 'Section',
    questions: (sec.questions ?? []).map((q: any) => ({
      id: q.id || makeId(),
      type: ((q.question_type || q.type || 'single_select') as QuestionType),
      text: q.text || '',
      required: q.required ?? false,
      options: Array.isArray(q.options) ? q.options : [],
    })),
  }));

// ── Component ─────────────────────────────────────────────────────────────────

const Questionnaire: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isViewOnly = Boolean((location.state as any)?.viewOnly);
  const { workspaceId, objectiveId } = useParams<{ workspaceId: string; objectiveId: string }>();
  if (!workspaceId || !objectiveId) {
    return null;
  }
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State ─────────────────────────────────────────────────────────────────

  const [sections, setSections] = useState<Section[]>([]);
  const [hasQuestionnaire, setHasQuestionnaire] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [loaderMode, setLoaderMode] = useState<'generate' | 'upload'>('generate');
  const [loaderReady, setLoaderReady] = useState(false);
  const [showReadyToast, setShowReadyToast] = useState(false);
  const [showUploadToast, setShowUploadToast] = useState(false);
  const [uploadReady, setUploadReady] = useState(false);
  const [uploadError, setUploadError] = useState<UploadError>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────

  // Fetch personas so we can pass their IDs to the generate API
  const { data: personasData } = usePersonas(workspaceId, objectiveId);

  // Fetch any already-generated questionnaire for this exploration
  const {
    data: existingQData,
    isLoading: existingLoading,
  } = useAllQuestionnairesForExploration(workspaceId, objectiveId);

  // When existing questionnaire loads, hydrate the UI
  useEffect(() => {
    const apiSections: any[] = existingQData?.data ?? [];
    if (apiSections.length > 0) {
      setSections(mapApiToSections(apiSections));
      setHasQuestionnaire(true);
      if (objectiveId) {
        localStorage.setItem(`quantitative_sub1_${objectiveId}`, '1');
      }
    }
  }, [existingQData, objectiveId]);

  // ── File validation ───────────────────────────────────────────────────────

  const validateFile = (file: File): 'size' | 'format' | null => {
    const mimeOk = ALLOWED_MIME_TYPES.has(file.type);
    const extOk = ALLOWED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
    if (!mimeOk && !extOk) return 'format';
    if (file.size > MAX_FILE_SIZE_BYTES) return 'size';
    return null;
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreateQuestionnaire = async () => {
    setLoaderMode('generate');
    setLoaderReady(false);
    setShowLoader(true);
    setIsGenerating(true);

    try {
      const personas: any[] = personasData?.data ?? [];
      const personaIds: string[] = personas.map((p: any) => p.id).filter(Boolean);

      // Step 1: trigger LLM generation + DB store
      const generationResponse = await generateQuestionnaire({
        workspaceId,
        explorationId: objectiveId,
        personaIds,
        simulationId: undefined, // not available at questionnaire-design step (pre-population)
      });
      const generationData = generationResponse?.data ?? {};

      let generatedSections: any[] = Array.isArray(generationData.questionnaire)
        ? generationData.questionnaire
        : [];

      if (!generatedSections.length && generationData.job_id) {
        const deadline = Date.now() + GENERATION_MAX_WAIT_MS;
        while (Date.now() < deadline) {
          await sleep(GENERATION_POLL_INTERVAL_MS);
          const statusResponse = await getQuestionnaireGenerationStatus({
            workspaceId,
            explorationId: objectiveId,
            jobId: generationData.job_id,
          });
          const statusData = statusResponse?.data ?? {};
          if (statusData.status === 'completed') {
            generatedSections = Array.isArray(statusData.questionnaire)
              ? statusData.questionnaire
              : [];
            break;
          }
          if (statusData.status === 'failed') {
            throw new Error(statusData.error_message || 'Questionnaire generation failed');
          }
        }

        if (!generatedSections.length) {
          throw new Error('Questionnaire generation timed out');
        }
      }

      // Step 2: fetch sections from the authoritative /all endpoint so we never
      // depend on the generate-response format (LLM may wrap output differently).
      const freshData = await getAllQuestionnairesForExploration({
        workspaceId,
        explorationId: objectiveId,
      });
      const apiSections: any[] = freshData?.data ?? [];
      setSections(mapApiToSections(apiSections.length ? apiSections : generatedSections));

      setLoaderReady(true);
    } catch (err) {
      console.error('Questionnaire generation failed:', err);
      try {
        const freshData = await getAllQuestionnairesForExploration({
          workspaceId,
          explorationId: objectiveId,
        });
        const apiSections: any[] = freshData?.data ?? [];
        if (apiSections.length > 0) {
          setSections(mapApiToSections(apiSections));
          setLoaderReady(true);
          return;
        }
      } catch (fetchErr) {
        console.error('Questionnaire fallback fetch failed:', fetchErr);
      }
      setUploadError('api');
      setTimeout(() => setUploadError(null), 6_000);
      setShowLoader(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUploadClick = () => {
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const errorType = validateFile(file);
    if (errorType) {
      setUploadError(errorType);
      setTimeout(() => setUploadError(null), 6_000);
      return;
    }

    setUploadError(null);
    setLoaderMode('upload');
    setUploadReady(false);
    setShowLoader(true);
    setShowUploadToast(true);
    setTimeout(() => setShowUploadToast(false), 4000);

    try {
      // Upload without simulation_id — questionnaire design step precedes population
      await uploadQuestionnaire({
        workspaceId,
        explorationId: objectiveId,
        simulationId: undefined as any,
        file,
      });

      // Fetch from /all after store so we always read from the canonical DB state
      const freshData = await getAllQuestionnairesForExploration({
        workspaceId,
        explorationId: objectiveId,
      });
      const apiSections: any[] = freshData?.data ?? [];
      setSections(mapApiToSections(apiSections));

      setUploadReady(true);
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError('api');
      setTimeout(() => setUploadError(null), 6_000);
      setShowLoader(false);
      setUploadReady(false);
    }
  };

  const handleLoaderComplete = () => {
    setShowLoader(false);
    setUploadReady(false);
    setLoaderReady(false);
    setHasQuestionnaire(true);
    if (objectiveId) {
      localStorage.setItem(`quantitative_sub1_${objectiveId}`, '1');
    }
    setShowReadyToast(true);
    setTimeout(() => setShowReadyToast(false), 4000);
  };

  const handleConfirmLaunch = () => {
    if (objectiveId) {
      localStorage.setItem(`quantitative_sub1_${objectiveId}`, '1');
    }
    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/population-builder`,
      { state: { viewOnly: isViewOnly } }
    );
  };

  // ── Upload error banner ───────────────────────────────────────────────────

  const UploadErrorBanner: React.FC = () => {
    if (!uploadError) return null;
    const { title, subtitle } = getUploadErrorMessage(uploadError);
    return (
      <AnimatePresence>
        {uploadError && (
          <motion.div
            className="qu-upload-error-banner"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.22 }}
          >
            <TbAlertCircle size={20} className="qu-upload-error-banner__icon" />
            <div className="qu-upload-error-banner__body">
              <span className="qu-upload-error-banner__title">{title}</span>
              <span className="qu-upload-error-banner__subtitle">{subtitle}</span>
            </div>
            <button
              className="qu-upload-error-banner__close"
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

  // ── Loading state while fetching existing questionnaire ───────────────────

  if (existingLoading) {
    return (
      <div className="qu-page qu-page--centered">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary, #aaa)' }}>
          <TbLoader size={22} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Loading questionnaire…</span>
        </div>
      </div>
    );
  }

  // ── Loader screen (generate / upload animation) ───────────────────────────

  if (showLoader) {
    return (
      <>
        <AnimatePresence>
          {showUploadToast && (
            <motion.div
              className="qu-upload-toast"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22 }}
            >
              <SpIcon name="sp-Warning-Circle_Check" size={18} className="qu-upload-toast__icon" />
              <span>File Uploaded Successfully</span>
              <button className="qu-upload-toast__close" onClick={() => setShowUploadToast(false)}>
                <TbX size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <QuestionnaireLoader
          mode={loaderMode}
          onComplete={handleLoaderComplete}
          isReady={loaderMode === 'upload' ? uploadReady : loaderReady}
        />
      </>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (!hasQuestionnaire) {
    return (
      <div className="qu-page qu-page--centered">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx"
          className="qu-file-input"
          onChange={handleFileChange}
        />

        <div className="qu-error-portal">
          <UploadErrorBanner />
        </div>

        <div className="qu-container">
          <motion.div
            className="qu-empty-card"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="qu-empty-card__icon-wrap">
              <SpIcon name="sp-Warning-Wavy_Help" size={40} />
            </div>
            <h2 className="qu-empty-card__title">Start with Questionnaire Creation</h2>
            <p className="qu-empty-card__subtitle">
              Let's translate your objective into structured questions that uncover real behaviour
            </p>
            <div className="qu-empty-card__actions">
              <button className="qu-btn qu-btn--outline" onClick={handleUploadClick}>
                <SpIcon name="sp-File-Cloud_Upload" size={20} className="qu-btn__icon" />
                Upload Questionnaire
              </button>
              <button
                className="qu-btn qu-btn--primary"
                onClick={handleCreateQuestionnaire}
                disabled={isGenerating}
              >
                {isGenerating
                  ? <TbLoader className="qu-btn__icon qu-btn__icon--spin" />
                  : <SpIcon name="sp-Other-Magic" size={20} className="qu-btn__icon" />
                }
                {isGenerating ? 'Creating…' : 'Create Questionnaire'}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Main questionnaire view ───────────────────────────────────────────────

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx"
        className="qu-file-input"
        onChange={handleFileChange}
      />

      <div className="qu-error-portal">
        <UploadErrorBanner />
      </div>

      <QuestionnaireGuide
        onConfirm={handleConfirmLaunch}
        onUpload={handleUploadClick}
        showReadyToast={showReadyToast}
        onDismissToast={() => setShowReadyToast(false)}
        initialSections={sections}
        isViewOnly={isViewOnly}
        workspaceId={workspaceId}
        explorationId={objectiveId}
        onSectionsChange={setSections}
      />
    </>
  );
};

export default Questionnaire;
