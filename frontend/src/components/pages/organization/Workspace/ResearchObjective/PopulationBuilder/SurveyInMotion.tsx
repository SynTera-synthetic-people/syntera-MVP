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
  onSurveyComplete: () => void;
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

const TICK_MS = 2_800;

const RING_RADIUS = 34;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

const SurveyInMotion: React.FC<SurveyInMotionProps> = ({ onSurveyComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [checkedItems, setCheckedItems] = useState<number[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);

  // ── Auto-tick through items ──────────────────────────────────────────────
  useEffect(() => {
    let stepIndex = 0;
    let itemIndex = 0;

    const interval = setInterval(() => {
      const stepData = SURVEY_STEPS[stepIndex];
      if (!stepData) { clearInterval(interval); return; }

      const globalOffset = SURVEY_STEPS.slice(0, stepIndex).reduce((acc, s) => acc + s.items.length, 0);
      setCheckedItems((prev) => [...prev, globalOffset + itemIndex]);
      itemIndex++;

      if (itemIndex >= stepData.items.length) {
        stepIndex++;
        itemIndex = 0;
        if (stepIndex < SURVEY_STEPS.length) {
          setCurrentStep(stepIndex);
        } else {
          clearInterval(interval);
          setTimeout(() => onSurveyComplete(), 1000);
        }
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────
  const activeStep = SURVEY_STEPS[currentStep]!;

  const itemsBeforeCurrentStep = SURVEY_STEPS
    .slice(0, currentStep)
    .reduce((acc, s) => acc + s.items.length, 0);

  const currentStepItemsDone = checkedItems.filter(
    (i) => i >= itemsBeforeCurrentStep && i < itemsBeforeCurrentStep + activeStep.items.length
  ).length;

  const ringProgress = (currentStepItemsDone / activeStep.items.length) * 100;

  const offset = RING_CIRC * (1 - ringProgress / 100);

  return (
    <motion.div
      className="sim-root"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
    >
      {/* Header */}
      <div className="sim-header">
        <h1 className="sim-title">Survey In Motion</h1>
        <p className="sim-subtitle">Your study is running across a calibrated population — capturing how decisions form</p>
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
              <svg className="sim-ring-svg" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                <circle
                  cx="40" cy="40" r={RING_RADIUS}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={offset}
                  transform="rotate(-90 40 40)"
                  style={{ transition: 'stroke-dashoffset 0.3s linear' }}
                />
              </svg>
              <video
                ref={videoRef}
                src={OmiKeyboard}
                autoPlay loop muted playsInline
                className="sim-omi-video"
              />
            </div>
            <span className="sim-step-label">Step {currentStep + 1}/{SURVEY_STEPS.length}</span>
          </div>

          {/* Right: step title + checklist */}
          <div className="sim-card-right">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="sim-step-content"
              >
                <div className="sim-step-title">{activeStep.label}</div>

                <ul className="sim-checklist">
                  {activeStep.items.map((item, itemIdx) => {
                    const globalIndex = itemsBeforeCurrentStep + itemIdx;
                    const isDone = checkedItems.includes(globalIndex);
                    const isVisible = itemIdx <= currentStepItemsDone;
                    const isActive = itemIdx === currentStepItemsDone;

                    if (!isVisible) return null;

                    return (
                      <li
                        key={globalIndex}
                        className={[
                          'sim-check-item',
                          isDone ? 'sim-check-item--done' : '',
                          isActive ? 'sim-check-item--active' : '',
                        ].join(' ')}
                      >
                        <div className="sim-check-icon">
                          <SpIcon
                            name={isDone ? 'sp-Warning-Circle_Check' : 'sp-Interface-Radio_Unchecked'}
                            className={isDone ? 'sim-icon-done' : 'sim-icon-default'}
                          />
                        </div>
                        <span className="sim-check-text">{item}</span>
                      </li>
                    );
                  })}
                </ul>

                {currentStepItemsDone === activeStep.items.length && (
                  <motion.p
                    className="sim-outcome"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    {activeStep.outcome}
                  </motion.p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

        </div>
      </div>
    </motion.div>
  );
};

export default SurveyInMotion;