import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { TbLoader } from 'react-icons/tb';
import SpIcon from '../../../../../SPIcon';
import { useUpdateExplorationMethod } from '../../../../../../hooks/useExplorations';
import ImpactHighFiveModal from '../DepthInterview/components/ImpactHighFiveModal';
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
type ViewableCardId = 'decision' | 'behaviour';

interface InsightCard {
  id: string;
  icon: React.ReactNode;
  timeLabel: string;
  title: string;
  description: string;
  actionLabel: 'Generate' | 'Start';
  hasViewer?: boolean;
}

// ── Viewer Modal ──────────────────────────────────────────────────────────────

const VIEWER_META: Record<ViewableCardId, { title: string; subtitle: string }> = {
  decision: {
    title: 'Decision Intelligence',
    subtitle: 'How your personas make decisions and prioritize.',
  },
  behaviour: {
    title: 'Behaviour Archaeology',
    subtitle: 'Deep psychological patterns behind the choices.',
  },
};

const InsightViewerModal: React.FC<{ cardId: ViewableCardId; onClose: () => void }> = ({
  cardId,
  onClose,
}) => {
  const meta = VIEWER_META[cardId];

  return (
    <motion.div
      className="ig-ivm-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="ig-ivm-panel"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ig-ivm-header">
          <div className="ig-ivm-header__text">
            <h2 className="ig-ivm-header__title">{meta.title}</h2>
            <p className="ig-ivm-header__subtitle">{meta.subtitle}</p>
          </div>
          <button className="ig-ivm-close-btn" onClick={onClose} title="Close">
            <SpIcon name="sp-Menu-Close_MD" size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="ig-ivm-body">
          <div className="ig-ivm-placeholder">
            <p className="ig-ivm-placeholder__label">{meta.title}</p>
            <p className="ig-ivm-placeholder__sub">{meta.subtitle}</p>
            <p className="ig-ivm-placeholder__note">
              [Document content would render here as embedded PDF or HTML preview]
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="ig-ivm-footer">
          <button className="ig-ivm-download-btn">
            <SpIcon name="sp-File-File_Download" size={16} />
            Download PDF
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Card definitions ──────────────────────────────────────────────────────────

const INSIGHT_CARDS: InsightCard[] = [
  {
    id: 'raw',
    icon: <SpIcon name="sp-User-User_Voice" size={48} />,
    timeLabel: 'Less than 20-30 sec',
    title: 'Raw Data Shell',
    description: 'Structured response data, ready for analysis, export, and validation',
    actionLabel: 'Generate',
    hasViewer: false,
  },
  {
    id: 'decision',
    icon: <SpIcon name="sp-Environment-Bulb" size={48} />,
    timeLabel: '2-3 mins',
    title: 'Decision Intelligence',
    description: 'From responses to clear, decision-ready insights and recommendations',
    actionLabel: 'Generate',
    hasViewer: true,
  },
  {
    id: 'behaviour',
    icon: <SpIcon name="sp-Edit-Undo" size={48} />,
    timeLabel: '2 to 3 mins',
    title: 'Behaviour Archaeology',
    description: 'Uncover the behavioural patterns, motivations, and hidden drivers behind responses',
    actionLabel: 'Generate',
    hasViewer: true,
  },
  {
    id: 'playground',
    icon: <SpIcon name="sp-Environment-Puzzle" size={48} />,
    timeLabel: '2 to 3 mins',
    title: 'Data Playground',
    description: 'Slice, filter, and explore your data dynamically to test hypotheses and uncover patterns',
    actionLabel: 'Start',
    hasViewer: false,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

const InsightsGeneration: React.FC<InsightsGenerationProps> = ({
  onLaunchSurvey,
  explorationId,
  workspaceId,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const updateExplorationMutation = useUpdateExplorationMethod();

  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  const [viewingCard, setViewingCard] = useState<ViewableCardId | null>(null);
  const [showImpactModal, setShowImpactModal] = useState(false);

  useEffect(() => {
    if (explorationId) {
      localStorage.setItem(`quant_sub4_${explorationId}`, '1');
    }
  }, [explorationId]);

  // End Exploration is only enabled after at least one insight is generated
  const hasAnyInsightReady = Object.values(cardStates).some((s) => s === 'done');

  // ── Card action ───────────────────────────────────────────────────────────

  const handleAction = (card: InsightCard) => {
    const state = cardStates[card.id] ?? 'idle';

    // Done + has viewer → open modal instead of re-generating
    if (state === 'done' && card.hasViewer) {
      setViewingCard(card.id as ViewableCardId);
      return;
    }

    setCardStates((prev) => ({ ...prev, [card.id]: 'generating' }));
    setTimeout(() => {
      setCardStates((prev) => ({ ...prev, [card.id]: 'done' }));
    }, 2500);
  };

  // ── End Exploration ───────────────────────────────────────────────────────

  const handleEndExplorationClick = () => {
    setShowImpactModal(true);
  };

  const handleImpactSubmit = async () => {
    setShowImpactModal(false);
    try {
      if (explorationId) {
        localStorage.setItem(`quant_sub4_${explorationId}`, '1');
      }
      type EndFn = (args: { id: string | undefined; data: { is_end: boolean } }) => Promise<unknown>;
      await (updateExplorationMutation.mutateAsync as unknown as EndFn)({
        id: explorationId,
        data: { is_end: true },
      });
      queryClient.invalidateQueries({ queryKey: ['explorations'] });
      navigate(`/main/organization/workspace/explorations/${workspaceId}`);
    } catch (err) {
      console.error('Failed to end exploration:', err);
      // Navigate anyway so user is never stuck
      navigate(`/main/organization/workspace/explorations/${workspaceId}`);
    }
  };

  // ── Animation variants ────────────────────────────────────────────────────

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
          const isGenerating = state === 'generating';
          const isDone = state === 'done';

          return (
            <motion.div key={card.id} className="ig-card" variants={cardVariants}>
              <div className="ig-card__icon-wrap">
                {card.icon}
              </div>

              <div className="ig-card__badge">
                <SpIcon name="sp-Calendar-Alarm" size={16} />
                {card.timeLabel}
              </div>

              <h3 className="ig-card__title">{card.title}</h3>
              <p className="ig-card__desc">{card.description}</p>

              <button
                className={`ig-card__btn ${isDone && card.hasViewer
                    ? 'ig-card__btn--view'
                    : isDone
                      ? 'ig-card__btn--done'
                      : ''
                  }`}
                onClick={() => handleAction(card)}
                disabled={isGenerating || (isDone && !card.hasViewer)}
              >
                {isGenerating ? (
                  <><TbLoader className="ig-card__btn-spinner" size={14} />Generating…</>
                ) : isDone && card.hasViewer ? (
                  'View'
                ) : isDone ? (
                  'Ready'
                ) : (
                  card.actionLabel
                )}
              </button>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Footer ── */}
      <div className="ig-footer">
        <div className="ig-footer__left" />
        <button
          className="ig-footer__btn ig-footer__btn--end"
          disabled={!hasAnyInsightReady}
          onClick={handleEndExplorationClick}
        >
          End Exploration
        </button>
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {viewingCard !== null && (
          <InsightViewerModal
            cardId={viewingCard}
            onClose={() => setViewingCard(null)}
          />
        )}

        {showImpactModal && (
          <ImpactHighFiveModal
            onSubmit={handleImpactSubmit}
            onClose={() => setShowImpactModal(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default InsightsGeneration;