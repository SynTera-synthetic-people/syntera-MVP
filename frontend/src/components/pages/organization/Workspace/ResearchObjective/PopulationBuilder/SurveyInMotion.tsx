import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FullGlobe from '../../../../Login/FullGlobe';
import OmiKeyboard from '../../../../../../assets/Omi Animations/OmiKeyboard.mp4';
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

const SURVEY_STEPS = [
  { label: 'Context Setup',      sublabel: 'Context and survey objective briefing to all respondents...', durationMs: 6000 },
  { label: 'Context Setup',      sublabel: 'Questionnaire being delivered and making sure everything in order', durationMs: 6000 },
  { label: 'Response in Motion', sublabel: 'Respondents are reviewing the questions', durationMs: 6000 },
];

const SurveyInMotion: React.FC<SurveyInMotionProps> = ({ onSurveyComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const step = SURVEY_STEPS[currentStep]!;
    const tick = 50;
    const totalTicks = step.durationMs / tick;
    let tickCount = 0;

    timerRef.current = setInterval(() => {
      tickCount++;
      setStepProgress(Math.min((tickCount / totalTicks) * 100, 100));
      if (tickCount >= totalTicks) {
        clearInterval(timerRef.current!);
        if (currentStep < SURVEY_STEPS.length - 1) {
          setCurrentStep(p => p + 1);
          setStepProgress(0);
        } else {
          onSurveyComplete();
        }
      }
    }, tick);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [currentStep]);

  const step = SURVEY_STEPS[currentStep]!;
  const r = 34;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - stepProgress / 100);

  return (
    <motion.div className="sim-root"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
    >
      {/* Header */}
      <div className="sim-header">
        <h1 className="sim-title">Survey In Motion</h1>
        <p className="sim-subtitle">Your study is running across a calibrated population — capturing how decisions form</p>
      </div>

      {/* Globe — flex: 1, fills space between header and card */}
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
                <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
                <circle
                  cx="40" cy="40" r={r}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  transform="rotate(-90 40 40)"
                  style={{ transition: 'stroke-dashoffset 0.1s linear' }}
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

          {/* Right: step title + sublabel */}
          <div className="sim-card-right">
            <AnimatePresence mode="wait">
              <motion.div key={currentStep}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}
              >
                <div className="sim-step-title">{step.label}</div>
                <div className="sim-step-sub">
                  <span className="sim-dot" />
                  {step.sublabel}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

        </div>
      </div>
    </motion.div>
  );
};

export default SurveyInMotion;