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
  // Backend milestones — drive step transitions instead of a hardcoded timer
  questionnaireReady: boolean;  // true when questionnaire generation is complete
  surveySimComplete: boolean;   // true when survey simulation has finished
}

interface SurveyStepData {
  label: string;
  items: string[];
  outcome: string;
}

// ── Step definitions ──────────────────────────────────────────────────────────

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

// Minimum time each step is shown before the UI advances (even if backend is faster).
// Prevents jarring instant step-jumps if backend responds very quickly.
const MIN_STEP_MS = 3_000;
const TICK_MS     = 2_800; // how fast items cycle within a step (cosmetic)
const RING_RADIUS = 43;
const RING_CIRC   = 2 * Math.PI * RING_RADIUS;

// ── Component ─────────────────────────────────────────────────────────────────

const SurveyInMotion: React.FC<SurveyInMotionProps> = ({
  onSurveyComplete,
  questionnaireReady,
  surveySimComplete,
}) => {
  // currentStep: what the UI is currently showing (0 → 1 → 2, never backwards)
  // Advances toward backendStage one step at a time, with MIN_STEP_MS minimum per step.
  const [currentStep, setCurrentStep] = useState(0);
  const stepShownAtRef = useRef(Date.now());

  // itemIdx: which item within the current step is showing — cycles continuously
  const [itemIdx, setItemIdx] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const onSurveyCompleteRef = useRef(onSurveyComplete);
  useEffect(() => { onSurveyCompleteRef.current = onSurveyComplete; }, [onSurveyComplete]);

  // Derive backend stage from props:
  // 0 = questionnaire still generating
  // 1 = questionnaire done, survey simulation running
  // 2 = survey simulation complete
  const backendStage = !questionnaireReady ? 0 : !surveySimComplete ? 1 : 2;

  // ── Advance UI step toward backendStage (one at a time, MIN_STEP_MS floor) ─

  useEffect(() => {
    if (backendStage <= currentStep) return;
    const elapsed  = Date.now() - stepShownAtRef.current;
    const waitMore = Math.max(0, MIN_STEP_MS - elapsed);
    const timer    = setTimeout(() => {
      setCurrentStep((prev) => prev + 1); // advance one step at a time
      stepShownAtRef.current = Date.now();
    }, waitMore);
    return () => clearTimeout(timer);
  }, [backendStage, currentStep]);

  // ── Reset item index when step changes ────────────────────────────────────

  useEffect(() => {
    setItemIdx(0);
  }, [currentStep]);

  // ── Cycle items within the current step (purely cosmetic) ─────────────────

  useEffect(() => {
    const items = SURVEY_STEPS[currentStep]!.items;
    const timer = setInterval(() => {
      setItemIdx((prev) => (prev + 1) % items.length);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [currentStep]);

  // ── Navigate after showing step 2 briefly ────────────────────────────────
  // By the time currentStep reaches 2, surveySimComplete is true, so
  // onSurveyComplete (handleSurveyComplete) will return almost immediately.

  useEffect(() => {
    if (currentStep !== 2) return;
    const timer = setTimeout(() => {
      void onSurveyCompleteRef.current();
    }, 2_500);
    return () => clearTimeout(timer);
  }, [currentStep]);

  // ── Derived display values ────────────────────────────────────────────────

  const activeStep  = SURVEY_STEPS[currentStep]!;
  const displayItem = activeStep.items[itemIdx] ?? '';
  const ringProgress = ((itemIdx + 1) / activeStep.items.length) * 100;
  const offset       = RING_CIRC * (1 - ringProgress / 100);

  // Show the outcome line when backend has completed this step but UI
  // is still showing it (waiting for MIN_STEP_MS), or on the final step.
  const showOutcome = backendStage > currentStep || currentStep === SURVEY_STEPS.length - 1;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <motion.div
      className="sim-root"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
    >
      <div className="sim-header">
        <h1 className="sim-title">Survey In Motion</h1>
        <p className="sim-subtitle">
          Your study is running across a calibrated population — capturing how decisions form
        </p>
      </div>

      <div className="sim-globe-wrap">
        <FullGlobe />
      </div>

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
            <span className="sim-step-label">Step {currentStep + 1}/{SURVEY_STEPS.length}</span>
          </div>

          {/* Right: step title + cycling item */}
          <div className="sim-card-right">

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

            <AnimatePresence mode="wait">
              <motion.div
                key={`item-${currentStep}-${itemIdx}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="sim-check-item sim-check-item--active"
              >
                <div className="sim-check-icon">
                  <SpIcon name="sp-Interface-Radio_Unchecked" className="sim-icon-default" />
                </div>
                <span className="sim-check-text">{displayItem}</span>
              </motion.div>
            </AnimatePresence>

            <AnimatePresence>
              {showOutcome && (
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
