import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FullGlobe from '../../../../Login/FullGlobe';
import OmiKeyboard from '../../../../../../assets/Omi Animations/OmiKeyboard.mp4';
import SpIcon from '../../../../../SPIcon';
import './SurveyInMotion.css';

interface SelectedPersona { id: string; name: string; }
interface SampleSizes { [personaId: string]: number; }

interface SurveyInMotionProps {
  selectedPersonas: SelectedPersona[];
  sampleSizes: SampleSizes;
  simulationResult: any;
  questionnaireData: any[];
  questionnairesLoading: boolean;
  onSurveyComplete: () => void | Promise<void>;
  onEditConfiguration: () => void;
  onModified: () => void;
  workspaceId: string;
  explorationId: string;
}

interface SurveyStepData {
  label: string;
  items: string[];
  outcome: string;
}

// ── Step definitions — exact sequence from spec ───────────────────────────────

const SURVEY_STEPS: SurveyStepData[] = [
  {
    label: 'Context Setup',
    items: [
      'Context and survey objective briefing to all respondents…',
      'Questionnaire being delivered and making sure everything in order',
    ],
    outcome: 'All respondents are briefed and the questionnaire is ready for delivery.',
  },
  {
    label: 'Response in Motion',
    items: [
      'Respondents are reviewing the questions',
      'Thinking through options',
      'Responding based on preference',
      'Reflecting on past experience',
      'Answer being submitted',
    ],
    outcome: 'Responses are being captured across the calibrated population.',
  },
  {
    label: 'Survey Completion',
    items: [
      'Responses are being recorded',
      'Making sure every question is answered',
      'Validation and structural checks',
      'Adding all responses to analysis pool',
      'Survey Completed',
    ],
    outcome: 'Survey complete. All responses validated and added to the analysis pool.',
  },
];

const TICK_MS     = 2_800;
const RING_RADIUS = 43;
const RING_CIRC   = 2 * Math.PI * RING_RADIUS;

// ── Component ─────────────────────────────────────────────────────────────────

const SurveyInMotion: React.FC<SurveyInMotionProps> = ({ onSurveyComplete }) => {
  // globalCheckedCount is the single source of truth — one counter that
  // increments every TICK_MS, same pattern as PersonaGenerationLoader.
  const [globalCheckedCount, setGlobalCheckedCount] = useState<number>(0);
  const [isComplete, setIsComplete] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onSurveyCompleteRef = useRef(onSurveyComplete);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    onSurveyCompleteRef.current = onSurveyComplete;
  }, [onSurveyComplete]);

  // ── Derived totals ────────────────────────────────────────────────────────
  const totalItems = SURVEY_STEPS.reduce((acc, s) => acc + s.items.length, 0);

  // Which step are we currently in?
  const currentStep = (() => {
    let acc = 0;
    for (let i = 0; i < SURVEY_STEPS.length; i++) {
      acc += SURVEY_STEPS[i]!.items.length;
      if (globalCheckedCount < acc) return i;
    }
    return SURVEY_STEPS.length - 1;
  })();

  const activeStep = SURVEY_STEPS[currentStep]!;

  const itemsBeforeCurrentStep = SURVEY_STEPS
    .slice(0, currentStep)
    .reduce((acc, s) => acc + s.items.length, 0);

  // How many items are done within the current step
  const currentStepItemsDone = globalCheckedCount - itemsBeforeCurrentStep;

  // The index of the currently-active item within this step
  // (the item that just appeared — not yet ticked)
  const activeItemIdx = Math.min(currentStepItemsDone, activeStep.items.length - 1);

  // Ring progress = ratio of done items within current step
  const ringProgress = Math.min(
    (currentStepItemsDone / activeStep.items.length) * 100,
    100
  );

  const offset = RING_CIRC * (1 - ringProgress / 100);

  // ── Auto-tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (isComplete) return;

    intervalRef.current = setInterval(() => {
      setGlobalCheckedCount((prev) => {
        const next = prev + 1;
        if (next >= totalItems) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setTimeout(() => setIsComplete(true), 1_000);
          return totalItems;
        }
        return next;
      });
    }, TICK_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalItems]);

  // ── Navigate when complete ────────────────────────────────────────────────
  useEffect(() => {
    if (!isComplete) return;
    void onSurveyCompleteRef.current();
  }, [isComplete]);

  // ── The single item to display (current active item in the step) ──────────
  // Once an item is "done" (globalCheckedCount moved past it) we show the
  // next one. Only ONE item is shown at a time, with a tick if it's done.
  const displayItemIdx  = Math.min(currentStepItemsDone, activeStep.items.length - 1);
  const displayItem     = activeStep.items[displayItemIdx] ?? '';
  // Item is done once the counter has moved past this item's global index
  const globalDisplayIdx = itemsBeforeCurrentStep + displayItemIdx;
  const displayItemDone  = globalCheckedCount > globalDisplayIdx;

  return (
    <motion.div
      className="sim-root"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
    >
      {/* Header */}
      <div className="sim-header">
        <h1 className="sim-title">Survey In Motion</h1>
        <p className="sim-subtitle">
          Your study is running across a calibrated population — capturing how decisions form
        </p>
      </div>

      {/* Globe */}
      <div className="sim-globe-wrap">
        <FullGlobe />
      </div>

      {/* Card area */}
      <div className="sim-card-area">
        <div className="sim-step-card">

          {/* Left: ring + Omi video */}
          <div className="sim-card-left">
            <div className="sim-ring-wrap">
              <svg className="sim-ring-svg" viewBox="0 0 96 96">
                <circle
                  cx="48" cy="48" r={RING_RADIUS}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="3.5"
                />
                <circle
                  cx="48" cy="48" r={RING_RADIUS}
                  fill="none"
                  stroke="#0E63EC"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={offset}
                  transform="rotate(-90 48 48)"
                  style={{ transition: 'stroke-dashoffset 0.7s ease' }}
                />
              </svg>
              <div className="sim-omi-video-circle">
                <video
                  ref={videoRef}
                  src={OmiKeyboard}
                  autoPlay loop muted playsInline
                  className="sim-omi-video"
                />
              </div>
            </div>
            <span className="sim-step-label">
              Step {currentStep + 1}/{SURVEY_STEPS.length}
            </span>
          </div>

          {/* Right: step title + single-item display */}
          <div className="sim-card-right">
            {/* Step title animates when step changes */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`step-title-${currentStep}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="sim-step-title"
              >
                {activeStep.label}
              </motion.div>
            </AnimatePresence>

            {/* Single item — animates out/in as each item changes */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`item-${currentStep}-${displayItemIdx}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className={[
                  'sim-check-item',
                  displayItemDone ? 'sim-check-item--done' : 'sim-check-item--active',
                ].join(' ')}
              >
                <div className="sim-check-icon">
                  <SpIcon
                    name={displayItemDone ? 'sp-Warning-Circle_Check' : 'sp-Interface-Radio_Unchecked'}
                    className={displayItemDone ? 'sim-icon-done' : 'sim-icon-default'}
                  />
                </div>
                <span className="sim-check-text">{displayItem}</span>
              </motion.div>
            </AnimatePresence>

            {/* Outcome appears once all items in this step are done */}
            <AnimatePresence>
              {currentStepItemsDone >= activeStep.items.length && (
                <motion.p
                  className="sim-outcome"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {activeStep.outcome}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </motion.div>
  );
};

export default SurveyInMotion;