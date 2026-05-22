import React, { useState, useEffect } from 'react';
import OmiKeyboard from '../../../../../../assets/Omi Animations/OmiKeyboard.mp4';
import './QuestionnaireLoader.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuestionnaireLoaderProps {
  /** Called once the animation completes AND backend is ready */
  onComplete: () => void;
  /**
   * When true the loader knows the backend has finished generating.
   * The final step will only complete once this is true.
   */
  isReady?: boolean;
  /**
   * 'generate' (default) — 4-step AI generation flow
   * 'upload'             — 5-step file upload processing flow
   */
  mode?: 'generate' | 'upload';
}

interface LoaderStep {
  statement: string;
}

// ── Step definitions ──────────────────────────────────────────────────────────

const GENERATE_STEPS: LoaderStep[] = [
  { statement: 'Interpreting your objective and measurement goals.' },
  { statement: 'Defining key variables, behaviours, and decision metrics.' },
  { statement: 'Structuring questions for clarity, scale, and statistical reliability.' },
  { statement: 'Preparing a survey-ready questionnaire for robust analysis.' },
];

const UPLOAD_STEPS: LoaderStep[] = [
  { statement: 'Extracting and analysing the content from your file…' },
  { statement: 'Decoding structure and measurement intent.' },
  { statement: 'Mapping variables and response scales.' },
  { statement: 'Aligning questions for consistency.' },
  { statement: 'Optimising for clarity and reliability.' },
];

const STEP_MS = 3_500;
const RING_RADIUS = 54;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

// ── Ring SVG ──────────────────────────────────────────────────────────────────

const RingProgress: React.FC<{ progress: number }> = ({ progress }) => {
  const offset = RING_CIRC - (progress / 100) * RING_CIRC;
  return (
    <svg className="ql-ring-svg" viewBox="0 0 120 120">
      <circle className="ql-ring-track" cx="60" cy="60" r={RING_RADIUS} />
      <circle
        className="ql-ring-progress"
        cx="60" cy="60" r={RING_RADIUS}
        strokeDasharray={RING_CIRC}
        strokeDashoffset={offset}
      />
    </svg>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

const QuestionnaireLoader: React.FC<QuestionnaireLoaderProps> = ({
  onComplete,
  isReady = false,
  mode = 'generate',
}) => {
  const LOADER_STEPS = mode === 'upload' ? UPLOAD_STEPS : GENERATE_STEPS;
  const TOTAL_STEPS = LOADER_STEPS.length;
  const LAST_STEP_IDX = TOTAL_STEPS - 1;

  const [currentStep, setCurrentStep] = useState(0);
  const [waitingForBackend, setWaitingForBackend] = useState(false);
  const [done, setDone] = useState(false);

  const ringProgress = done
    ? 100
    : waitingForBackend
      ? 88
      : ((currentStep + 1) / TOTAL_STEPS) * 100;

  // ── Advance steps 0 → (LAST_STEP_IDX - 1) at fixed interval ─────────────
  useEffect(() => {
    if (done || waitingForBackend) return;

    const timer = setTimeout(() => {
      if (currentStep < LAST_STEP_IDX - 1) {
        setCurrentStep((s) => s + 1);
      } else if (currentStep === LAST_STEP_IDX - 1) {
        setCurrentStep(LAST_STEP_IDX);
        setWaitingForBackend(true);
      }
    }, STEP_MS);

    return () => clearTimeout(timer);
  }, [currentStep, done, waitingForBackend, LAST_STEP_IDX]);

  // ── Once backend is ready and we're on the last step → complete ──────────
  useEffect(() => {
    if (!waitingForBackend || !isReady || done) return;

    const timer = setTimeout(() => {
      setDone(true);
      setTimeout(onComplete, 600);
    }, 1_200);

    return () => clearTimeout(timer);
  }, [waitingForBackend, isReady, done, onComplete]);

  const step = LOADER_STEPS[currentStep];

  const heading = mode === 'upload'
    ? 'Processing your Questionnaire'
    : 'Building Questionnaire';
  const subtitle = mode === 'upload'
    ? 'Extracting and structuring your file into a survey-ready questionnaire'
    : 'Let\'s translate your objective into structured questions that uncover real behaviour';

  return (
    <div className="ql-container">
      <div className="ql-header">
        <h1 className="ql-heading">{heading}</h1>
        <p className="ql-subtitle">{subtitle}</p>
      </div>

      <div className="ql-card">
        <div className="ql-card-left">
          <div className="ql-ring-wrapper">
            <RingProgress progress={ringProgress} />
            <div className="ql-character">
              <video
                className="dgl-character-video"
                src={OmiKeyboard}
                autoPlay
                loop
                muted
                playsInline
              />
            </div>
          </div>
          <p className="ql-step-label">Step {currentStep + 1}/{TOTAL_STEPS}</p>
        </div>

        <div className="ql-card-divider" />

        <div className="ql-card-right">
          <p key={currentStep} className="ql-statement">
            {step?.statement}
          </p>
          {waitingForBackend && !done && (
            <p className="ql-waiting-label">Finalising your questionnaire…</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuestionnaireLoader;