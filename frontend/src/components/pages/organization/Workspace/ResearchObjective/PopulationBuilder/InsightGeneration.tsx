import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TbLoader } from 'react-icons/tb';
import './InsightGeneration.css';

interface InsightsGenerationProps {
  selectedPersonas: { id: string; name: string }[];
  simulationResult: any;
  questionnaireData: any[];
  workspaceId: string;
  explorationId: string;
  onLaunchSurvey: () => void;
}

type CardState = 'idle' | 'generating' | 'done';

interface InsightCard {
  id: string;
  icon: React.ReactNode;
  timeLabel: string;
  title: string;
  description: string;
  actionLabel: 'Generate' | 'Start';
}

// Icons matching Figma exactly
const RawDataIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="38" height="38">
    <circle cx="12" cy="8" r="3" />
    <path d="M6 20v-1a6 6 0 0 1 12 0v1" />
    <path d="M17 8.5c.5-.3 1-.5 1.5-.5a3 3 0 0 1 0 6c-.5 0-1-.2-1.5-.5" />
    <path d="M19 19.5A6 6 0 0 1 24 20" />
  </svg>
);

const DecisionIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="38" height="38">
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
  </svg>
);

const BehaviourIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="38" height="38">
    <path d="M3 12a9 9 0 1 0 18 0" />
    <path d="M12 3v9" />
    <path d="M12 12l4.5 4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const PlaygroundIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="38" height="38">
    <path d="M12 2H6a2 2 0 0 0-2 2v4" />
    <path d="M12 2h6a2 2 0 0 1 2 2v4" />
    <path d="M12 2v10" />
    <path d="M4 8h16" />
    <path d="M4 8v10a2 2 0 0 0 2 2h4" />
    <path d="M20 8v10a2 2 0 0 1-2 2h-4" />
    <path d="M12 12v10" />
  </svg>
);

const INSIGHT_CARDS: InsightCard[] = [
  {
    id: 'raw',
    icon: <RawDataIcon />,
    timeLabel: 'Less than 20-30 sec',
    title: 'Raw Data Shell',
    description: 'Structured response data, ready for analysis, export, and validation',
    actionLabel: 'Generate',
  },
  {
    id: 'decision',
    icon: <DecisionIcon />,
    timeLabel: '2-3 mins',
    title: 'Decision Intelligence',
    description: 'From responses to clear, decision-ready insights and recommendations',
    actionLabel: 'Generate',
  },
  {
    id: 'behaviour',
    icon: <BehaviourIcon />,
    timeLabel: '2 to 3 mins',
    title: 'Behaviour Archaeology',
    description: 'Uncover the behavioural patterns, motivations, and hidden drivers behind responses',
    actionLabel: 'Generate',
  },
  {
    id: 'playground',
    icon: <PlaygroundIcon />,
    timeLabel: '2 to 3 mins',
    title: 'Data Playground',
    description: 'Slice, filter, and explore your data dynamically to test hypotheses and uncover patterns',
    actionLabel: 'Start',
  },
];

const InsightsGeneration: React.FC<InsightsGenerationProps> = ({ onLaunchSurvey }) => {
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});

  const handleAction = (cardId: string) => {
    setCardStates((prev) => ({ ...prev, [cardId]: 'generating' }));
    setTimeout(() => {
      setCardStates((prev) => ({ ...prev, [cardId]: 'done' }));
    }, 2500);
  };

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <motion.div
      className="ig-root"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="ig-header">
        <h1 className="ig-title">Insights Generation</h1>
        <p className="ig-subtitle">
          Generate detailed insights from your qualitative interviews. Choose which documents to create.
        </p>
      </div>

      <motion.div
        className="ig-grid"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {INSIGHT_CARDS.map((card) => {
          const state = cardStates[card.id] ?? 'idle';
          return (
            <motion.div key={card.id} className="ig-card" variants={cardVariants}>
              <div className="ig-card__icon-wrap">
                {card.icon}
              </div>

              <div className="ig-card__badge">
                <svg className="ig-card__badge-clock" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 5v3.5l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                {card.timeLabel}
              </div>

              <h3 className="ig-card__title">{card.title}</h3>
              <p className="ig-card__desc">{card.description}</p>

              <button
                className={`ig-card__btn ${state === 'done' ? 'ig-card__btn--done' : ''}`}
                onClick={() => handleAction(card.id)}
                disabled={state === 'generating' || state === 'done'}
              >
                {state === 'generating' ? (
                  <><TbLoader className="ig-card__btn-spinner" />Generating…</>
                ) : state === 'done' ? (
                  'Ready'
                ) : (
                  card.actionLabel
                )}
              </button>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.div>
  );
};

export default InsightsGeneration;
