import React, { useState, useEffect } from 'react';
import OmiKeyboard from '../../../../../../assets/Omi Animations/OmiKeyboard.mp4';
import './DiscussionGuideLoader.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiscussionGuideLoaderProps {
  /** Called once the 4-step animation completes AND backend is ready */
  onComplete: () => void;
  /**
   * When true the loader knows the backend has finished generating.
   * The final step will only complete once this is true.
   * Pass `isGenerating === false` from the hook.
   */
  isReady?: boolean;
}

interface LoaderStep {
  statement: string;
}

// ── Step definitions ──────────────────────────────────────────────────────────

const LOADER_STEPS: LoaderStep[] = [
  { statement: 'Understanding your objective, context, and decision focus.' },
  { statement: 'Identifying key behaviours, motivations, and decision triggers to explore.' },
  { statement: 'Designing question sequences to uncover depth, not just responses.' },
  { statement: 'Structuring the guide for natural conversation flow and insight depth.' },
];

const TOTAL_STEPS   = LOADER_STEPS.length;
const LAST_STEP_IDX = TOTAL_STEPS - 1;
const STEP_MS       = 3_500;
const RING_RADIUS   = 54;
const RING_CIRC     = 2 * Math.PI * RING_RADIUS;

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
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  // Whether the animation has reached the last step and is waiting for isReady
  const [waitingForBackend, setWaitingForBackend] = useState(false);
  const [done,              setDone]              = useState(false);

  // Ring fills proportionally. When waiting at last step keep it at 75% until
  // backend confirms, then jump to 100% right before completing.
  const ringProgress = done
    ? 100
    : waitingForBackend
    ? 88  // slightly past 75% — shows "almost done"
    : ((currentStep + 1) / TOTAL_STEPS) * 100;

  // ── Advance steps 0 → 2 (first three steps) at fixed interval ──────────────
  useEffect(() => {
    if (done || waitingForBackend) return;

    const timer = setTimeout(() => {
      if (currentStep < LAST_STEP_IDX - 1) {
        // Steps 0, 1 → advance normally
        setCurrentStep((s) => s + 1);
      } else if (currentStep === LAST_STEP_IDX - 1) {
        // Reached step 3 (index 2) → move to last step and then wait
        setCurrentStep(LAST_STEP_IDX);
        setWaitingForBackend(true);
      }
    }, STEP_MS);

    return () => clearTimeout(timer);
  }, [currentStep, done, waitingForBackend]);

  // ── Once backend is ready and we're on the last step → complete ─────────────
  useEffect(() => {
    if (!waitingForBackend || !isReady || done) return;

    // Short pause so user sees the final step text before dismissing
    const timer = setTimeout(() => {
      setDone(true);
      setTimeout(onComplete, 600);
    }, 1_200);

    return () => clearTimeout(timer);
  }, [waitingForBackend, isReady, done, onComplete]);

  const step = LOADER_STEPS[currentStep];

  return (
    <div className="dgl-container">
      <div className="dgl-header">
        <h1 className="dgl-heading">Building the Discussion Guide</h1>
        <p className="dgl-subtitle">
          Interpreting your objective and shaping it into a structured discussion flow
        </p>
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
          {/* Waiting indicator — shown on last step while backend catches up */}
          {waitingForBackend && !done && (
            <p className="dgl-waiting-label">Finalising your guide…</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiscussionGuideLoader;