import React, { useState, useEffect } from 'react';
import OmiKeyboard from '../../../../../../assets/Omi Animations/OmiKeyboard.mp4';
import './DiscussionGuideLoader.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiscussionGuideLoaderProps {
  /** Called once the animation completes AND backend is ready */
  onComplete: () => void;
  /**
   * When true the loader knows the backend has finished generating.
   * The final step will only complete once this is true.
   * Pass `isGenerating === false` from the hook.
   */
  isReady?: boolean;
  /**
   * 'generate' (default) — 4-step AI generation flow
   * 'upload'             — 7-step file upload processing flow
   */
  mode?: 'generate' | 'upload';
}

interface LoaderStep {
  statement: string;
}

// ── Step definitions ──────────────────────────────────────────────────────────

const GENERATE_STEPS: LoaderStep[] = [
  { statement: 'Understanding your objective, context, and decision focus.' },
  { statement: 'Identifying key behaviours, motivations, and decision triggers to explore.' },
  { statement: 'Designing question sequences to uncover depth, not just responses.' },
  { statement: 'Structuring the guide for natural conversation flow and insight depth.' },
];

const UPLOAD_STEPS: LoaderStep[] = [
  { statement: 'Extracting and analysing the content from your file…' },
  { statement: 'Aligning with the research intent…' },
  { statement: 'Identifying key themes and sections…' },
  { statement: 'Structuring questions for behavioural depth…' },
  { statement: 'Mapping probes and follow-ups…' },
  { statement: 'Aligning for consistent conversation flow…' },
  { statement: 'Preparing your discussion guide…' },
];

const STEP_MS     = 3_500;
const RING_RADIUS = 54;
const RING_CIRC   = 2 * Math.PI * RING_RADIUS;

// ── Ring SVG ──────────────────────────────────────────────────────────────────

const RingProgress: React.FC<{ progress: number }> = ({ progress }) => {
  const offset = RING_CIRC - (progress / 100) * RING_CIRC;
  return (
    <svg className="dgl-ring-svg" viewBox="0 0 120 120">
      <circle className="dgl-ring-track"    cx="60" cy="60" r={RING_RADIUS} />
      <circle
        className="dgl-ring-progress"
        cx="60" cy="60" r={RING_RADIUS}
        strokeDasharray={RING_CIRC}
        strokeDashoffset={offset}
      />
    </svg>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

const DiscussionGuideLoader: React.FC<DiscussionGuideLoaderProps> = ({
  onComplete,
  isReady = false,
  mode = 'generate',
}) => {
  // ── Conditional step list based on mode ──────────────────────────────────
  const LOADER_STEPS  = mode === 'upload' ? UPLOAD_STEPS : GENERATE_STEPS;
  const TOTAL_STEPS   = LOADER_STEPS.length;
  const LAST_STEP_IDX = TOTAL_STEPS - 1;

  const [currentStep,        setCurrentStep]        = useState(0);
  const [waitingForBackend,  setWaitingForBackend]  = useState(false);
  const [done,               setDone]               = useState(false);

  // Ring fills proportionally. When waiting at last step keep it slightly past
  // the penultimate mark until backend confirms, then jump to 100%.
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
        // Move to final step, then wait for backend
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

  // Heading/subtitle differ slightly by mode
  const heading  = mode === 'upload'
    ? 'Processing your Discussion Guide'
    : 'Building the Discussion Guide';
  const subtitle = mode === 'upload'
    ? 'Extracting and structuring your file into a ready-to-use discussion guide'
    : 'Interpreting your objective and shaping it into a structured discussion flow';

  return (
    <div className="dgl-container">
      <div className="dgl-header">
        <h1 className="dgl-heading">{heading}</h1>
        <p className="dgl-subtitle">{subtitle}</p>
      </div>

      <div className="dgl-card">
        <div className="dgl-card-left">
          <div className="dgl-ring-wrapper">
            <RingProgress progress={ringProgress} />
            <div className="dgl-character">
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
          <p className="dgl-step-label">Step {currentStep + 1}/{TOTAL_STEPS}</p>
        </div>

        <div className="dgl-card-divider" />

        <div className="dgl-card-right">
          <p key={currentStep} className="dgl-statement">
            {step?.statement}
          </p>
          {waitingForBackend && !done && (
            <p className="dgl-waiting-label">Finalising your guide…</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiscussionGuideLoader;