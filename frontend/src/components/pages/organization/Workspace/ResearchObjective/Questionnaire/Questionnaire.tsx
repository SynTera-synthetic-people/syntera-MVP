import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { TbLoader, TbX, TbSend, TbUpload, TbCheck, TbChevronDown, TbAlertCircle } from 'react-icons/tb';
import SpIcon from '../../../../../SPIcon';
import QuestionnaireLoader from './QuestionnaireLoader';
import './Questionnaire.css';

// ── Types ────────────────────────────────────────────────────────────────────

interface QuestionItem {
  id: string;
  text: string;
  options: string[];
}

interface SectionItem {
  title: string;
  questions: QuestionItem[];
}

// ── File validation constants ─────────────────────────────────────────────────

const MAX_FILE_SIZE_MB = 2;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/** Allowed MIME types: PDF, Word (.doc / .docx), Excel (.xls / .xlsx) */
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** Fallback extension check in case MIME type is unreliable */
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];

type UploadError = 'size' | 'format' | null;

const getUploadErrorMessage = (errorType: UploadError): { title: string; subtitle: string } => {
  if (errorType === 'size') {
    return {
      title: 'Upload Failed',
      subtitle: `File may exceed size limits of ${MAX_FILE_SIZE_MB}MB" in case of space issue`,
    };
  }
  if (errorType === 'format') {
    return {
      title: 'Upload Failed',
      subtitle: 'Invalid file format. Only PDF, Word (.doc/.docx) and Excel (.xls/.xlsx) files are allowed.',
    };
  }
  return { title: '', subtitle: '' };
};

// ── Static questionnaire data ─────────────────────────────────────────────────

const SECTIONS: SectionItem[] = [
  {
    title: 'Section 1: Attitudes & Preferences',
    questions: [
      {
        id: 'Q1',
        text: 'How often do you consume pastries/desserts?',
        options: ['Daily', '2-3 times a week', 'Once a week', 'Once a month or less'],
      },
      {
        id: 'Q2',
        text: 'When choosing pastries, what factors matter most to you? (Rank top 3)',
        options: ['Taste', 'Price', 'Healthiness', 'Brand'],
      },
      {
        id: 'Q3',
        text: 'Would you be interested in healthier pastry options (e.g., reduced sugar, gluten-free, whole grains, plant-based ingredients)?',
        options: ['Very interested', 'Somewhat interested', 'Not interested', 'Unsure'],
      },
    ],
  },
  {
    title: 'Section 2: Perceptions & Acceptance',
    questions: [
      {
        id: 'Q4',
        text: 'Do you believe pastries can be made "healthier" without losing taste?',
        options: ['Yes, definitely', 'Yes, possibly', 'No, not really', 'No, not at all'],
      },
      {
        id: 'Q5',
        text: 'If a healthy gourmet patisserie opened in Whitefield, how likely are you to try it?',
        options: ['Very likely', 'Somewhat likely', 'Not likely', 'I would not try it'],
      },
      {
        id: 'Q6',
        text: 'What would make you choose a healthier pastry over a regular one?',
        options: ['Better taste', 'Lower price', 'Clear nutritional info', 'Recommendation'],
      },
    ],
  },
  {
    title: 'Section 3: Pricing & Purchase Intent',
    questions: [
      {
        id: 'Q7',
        text: 'What is your budget for a single pastry?',
        options: ['Less than $3', '$3 - $5', '$5 - $7', 'More than $7'],
      },
      {
        id: 'Q8',
        text: 'How much more would you be willing to pay for a healthier pastry?',
        options: ['Nothing extra', 'Up to 10% more', '10-25% more', 'More than 25% more'],
      },
      {
        id: 'Q9',
        text: 'Where do you typically buy pastries?',
        options: ['Supermarket', 'Local bakery', 'Cafe/Coffee shop', 'Gourmet patisserie'],
      },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

const Questionnaire: React.FC = () => {
  const navigate = useNavigate();
  const { workspaceId, objectiveId } = useParams<{ workspaceId: string; objectiveId: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── State ─────────────────────────────────────────────────────────────────

  const [hasQuestionnaire, setHasQuestionnaire] = useState(false);
  const [isGenerating,     setIsGenerating]     = useState(false);
  const [showLoader,       setShowLoader]       = useState(false);
  const [loaderMode,       setLoaderMode]       = useState<'generate' | 'upload'>('generate');
  const [loaderReady,      setLoaderReady]      = useState(false);
  const [showReadyToast,   setShowReadyToast]   = useState(false);
  const [showUploadToast,  setShowUploadToast]  = useState(false);
  const [uploadReady,      setUploadReady]      = useState(false);

  // ── Upload validation error state ─────────────────────────────────────────
  const [uploadError,      setUploadError]      = useState<UploadError>(null);

  const [openDropdown,     setOpenDropdown]     = useState<string | null>(null);
  const [selectedOptions,  setSelectedOptions]  = useState<Record<string, string>>({});

  // ── Close dropdown on outside click ──────────────────────────────────────

  useEffect(() => {
    const close = () => setOpenDropdown(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  // ── File validation ───────────────────────────────────────────────────────

  /**
   * Validates file against:
   *   1. Format — must be PDF, Word, or Excel (by MIME + extension)
   *   2. Size   — must be ≤ 2 MB
   *
   * Returns the error type if invalid, or null if valid.
   */
  const validateFile = (file: File): UploadError => {
    // 1. Format check — MIME type first, then extension as fallback
    const mimeOk = ALLOWED_MIME_TYPES.has(file.type);
    const extOk  = ALLOWED_EXTENSIONS.some(ext =>
      file.name.toLowerCase().endsWith(ext)
    );
    if (!mimeOk && !extOk) return 'format';

    // 2. Size check
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
      await new Promise<void>((resolve) => setTimeout(resolve, 14_000));
      setLoaderReady(true);
    } catch (err) {
      console.error('Generation failed:', err);
      setShowLoader(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUploadClick = () => {
    // Clear any previous error before opening picker
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset input so the same file can be re-selected after an error
    e.target.value = '';
    if (!file) return;

    // ── Run validations ────────────────────────────────────────────────────
    const errorType = validateFile(file);
    if (errorType) {
      setUploadError(errorType);
      // Auto-dismiss error banner after 6 s
      setTimeout(() => setUploadError(null), 6_000);
      return;
    }

    // ── Validation passed — proceed with upload flow ───────────────────────
    setUploadError(null);
    setLoaderMode('upload');
    setUploadReady(false);
    setShowLoader(true);

    setShowUploadToast(true);
    setTimeout(() => setShowUploadToast(false), 4000);

    try {
      // TODO: replace with real upload API call
      await new Promise<void>((resolve) => setTimeout(resolve, 18_000));
      setUploadReady(true);
    } catch (err) {
      console.error('Upload failed:', err);
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
    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/population-builder`
    );
  };

  const handleOptionSelect = (questionId: string, option: string) => {
    setSelectedOptions((prev) => ({ ...prev, [questionId]: option }));
    setOpenDropdown(null);
  };

  // ── Upload error banner (Figma-accurate, shown before loader) ─────────────

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

  // ── Loader screen ─────────────────────────────────────────────────────────

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

        {/* Error banner — floats above the card */}
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
    <div className="qu-page">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx"
        className="qu-file-input"
        onChange={handleFileChange}
      />

      {/* Error banner — floats at top of page */}
      <div className="qu-error-portal">
        <UploadErrorBanner />
      </div>

      <div className="qu-guide-page">

        {/* ── Page header ── */}
        <div className="qu-guide-page-header">
          <div>
            <h1 className="qu-guide-page-title">Questionnaire</h1>
            <p className="qu-guide-page-subtitle">
              Structured to measure behaviours, preferences, and decision-making at scale
            </p>
          </div>

          <div className="qu-header-actions">
            <AnimatePresence>
              {showReadyToast && (
                <motion.div
                  className="qu-ready-toast"
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.22 }}
                >
                  <SpIcon name="sp-Warning-Circle_Check" size={18} className="qu-ready-toast__icon" />
                  <span>Your Questionnaire is Ready</span>
                  <button
                    className="qu-ready-toast__close"
                    onClick={() => setShowReadyToast(false)}
                  >
                    <TbX size={14} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <button className="qu-btn qu-btn--outline qu-btn--sm" onClick={handleUploadClick}>
              <TbUpload size={16} />
              Upload
            </button>
          </div>
        </div>

        {/* ── Sections ── */}
        <div className="qu-guide-card">
          {SECTIONS.map((section, sectionIndex) => (
            <motion.div
              key={sectionIndex}
              className="qu-section"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: sectionIndex * 0.06 }}
            >
              <div className="qu-section__header">
                <div className="qu-section__num">{sectionIndex + 1}</div>
                <h3 className="qu-section__title">{section.title}</h3>
              </div>

              <div className="qu-section__divider" />

              <div className="qu-questions">
                {section.questions.map((question, qIndex) => (
                  <div
                    key={question.id}
                    className={`qu-question ${openDropdown === question.id ? 'qu-question--open' : ''}`}
                  >
                    <span className="qu-question__label">Q{qIndex + 1}.</span>

                    <div className="qu-question__body">
                      <p className="qu-question__text">{question.text}</p>

                      <div className="qu-dropdown-wrap">
                        <button
                          className={[
                            'qu-dropdown-trigger',
                            selectedOptions[question.id] ? 'qu-dropdown-trigger--selected' : '',
                          ].join(' ')}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDropdown(openDropdown === question.id ? null : question.id);
                          }}
                        >
                          <span className="qu-dropdown-trigger__label">
                            {selectedOptions[question.id] || 'Select an option to preview…'}
                          </span>
                          <TbChevronDown
                            className={[
                              'qu-dropdown-trigger__chevron',
                              openDropdown === question.id ? 'qu-dropdown-trigger__chevron--open' : '',
                            ].join(' ')}
                            size={16}
                          />
                        </button>

                        <AnimatePresence>
                          {openDropdown === question.id && (
                            <motion.div
                              className="qu-dropdown-menu"
                              initial={{ opacity: 0, y: 8, scale: 0.97 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 8, scale: 0.97 }}
                              transition={{ duration: 0.16 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {question.options.map((option) => {
                                const isSelected = selectedOptions[question.id] === option;
                                return (
                                  <button
                                    key={option}
                                    className={[
                                      'qu-dropdown-option',
                                      isSelected ? 'qu-dropdown-option--selected' : '',
                                    ].join(' ')}
                                    onClick={() => handleOptionSelect(question.id, option)}
                                  >
                                    <span>{option}</span>
                                    {isSelected && <TbCheck size={15} className="qu-dropdown-option__check" />}
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Confirm & Launch bar ── */}
        <div className="qu-launch-bar">
          <button className="qu-launch-btn" onClick={handleConfirmLaunch}>
            Confirm & Launch Survey
            <TbSend size={18} />
          </button>
        </div>

      </div>
    </div>
  );
};

export default Questionnaire;