import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { TbLoader } from 'react-icons/tb';
import SpIcon from '../../../../../SPIcon';
import { useUpdateExplorationMethod } from '../../../../../../hooks/useExplorations';
import {
  useEnsureSurveySimulation,
  useDownloadQuantTranscripts,
  useDownloadQuantDecisionIntelligence,
  useDownloadQuantBehaviorArchaeology,
} from '../../../../../../hooks/useQuantitativeQueries';
import { getSurveySimulationBySource } from '../../../../../../services/quantitativeServices';
import { getAxiosErrorMessage } from '../../../../../../utils/axiosBlobError';
import ImpactHighFiveModal from '../DepthInterview/components/ImpactHighFiveModal';
import './InsightGeneration.css';

interface InsightsGenerationProps {
  selectedPersonas: { id: string; name: string }[];
  simulationResult: any;
  questionnaireData: any[];
  initialSurveySimulationId?: string;
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

interface InsightViewerModalProps {
  cardId: ViewableCardId;
  onClose: () => void;
  onDownload: () => void;
  isDownloading: boolean;
}

const InsightViewerModal: React.FC<InsightViewerModalProps> = ({
  cardId,
  onClose,
  onDownload,
  isDownloading,
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
              Your report is ready. Click the download button below to save it as a PDF.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="ig-ivm-footer">
          <button
            className="ig-ivm-download-btn"
            onClick={onDownload}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <><TbLoader className="ig-card__btn-spinner" size={14} /> Downloading…</>
            ) : (
              <><SpIcon name="sp-File-File_Download" size={16} /> Download PDF</>
            )}
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
  selectedPersonas,
  explorationId,
  workspaceId,
  simulationResult,
  initialSurveySimulationId,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const updateExplorationMutation = useUpdateExplorationMethod();

  const populationSimulationId: string = simulationResult?.id ?? '';

  const ensureSurveySimulationMutation = useEnsureSurveySimulation();
  const downloadTranscriptsMutation = useDownloadQuantTranscripts();
  const downloadDecisionMutation = useDownloadQuantDecisionIntelligence();
  const downloadBehaviourMutation = useDownloadQuantBehaviorArchaeology();

  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  const [viewingCard, setViewingCard] = useState<ViewableCardId | null>(null);
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [surveySimulationId, setSurveySimulationId] = useState(initialSurveySimulationId ?? '');
  const ensureSurveyPromiseRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    if (explorationId) {
      localStorage.setItem(`quant_sub4_${explorationId}`, '1');
    }
  }, [explorationId]);

  useEffect(() => {
    if (initialSurveySimulationId) {
      setSurveySimulationId(initialSurveySimulationId);
      if (explorationId) {
        localStorage.setItem(`quant_sub3_${explorationId}`, '1');
      }
    }
  }, [initialSurveySimulationId, explorationId]);

  useEffect(() => {
    let cancelled = false;

    if (!workspaceId || !explorationId || !populationSimulationId) {
      setSurveySimulationId('');
      return undefined;
    }
    if (surveySimulationId) return undefined;

    const hydrateSurveySimulation = async () => {
      try {
        const existing = await getSurveySimulationBySource({
          workspaceId,
          explorationId,
          simulationSourceId: populationSimulationId,
        });
        const existingSurveyId = existing?.data?.id;
        if (!cancelled && existingSurveyId) {
          setSurveySimulationId(existingSurveyId);
          localStorage.setItem(`quant_sub3_${explorationId}`, '1');
        }
      } catch (err) {
        console.warn('Could not hydrate survey simulation for insights', err);
      }
    };

    hydrateSurveySimulation();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, explorationId, populationSimulationId, surveySimulationId]);

  const hasAnyInsightReady = Object.values(cardStates).some((s) => s === 'done');

  const getPersonaIds = () => {
    const selectedIds = selectedPersonas.map((p) => p.id).filter(Boolean);
    if (selectedIds.length > 0) return selectedIds;

    if (Array.isArray(simulationResult?.persona_ids)) {
      return simulationResult.persona_ids.filter(Boolean);
    }

    if (Array.isArray(simulationResult?.persona_id)) {
      return simulationResult.persona_id.filter(Boolean);
    }

    return [];
  };

  const ensureSurveySimulationId = async () => {
    if (surveySimulationId) return surveySimulationId;
    if (ensureSurveyPromiseRef.current) return ensureSurveyPromiseRef.current;

    const promise = (async () => {
      if (!workspaceId || !explorationId || !populationSimulationId) {
        throw new Error('Missing population simulation context.');
      }

      const personaIds = getPersonaIds();
      const result = await ensureSurveySimulationMutation.mutateAsync({
        workspaceId,
        explorationId,
        personaIds,
        simulationId: populationSimulationId,
        forceRerun: false,
      });
      const nextSurveyId = result?.data?.id;
      if (!nextSurveyId) {
        throw new Error('Survey simulation did not return an ID.');
      }

      setSurveySimulationId(nextSurveyId);
      queryClient.setQueryData(
        ['surveySimulationBySource', workspaceId, explorationId, populationSimulationId],
        result,
      );
      localStorage.setItem(`quant_sub3_${explorationId}`, '1');
      return nextSurveyId;
    })();

    ensureSurveyPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      ensureSurveyPromiseRef.current = null;
    }
  };

  // ── Card action ───────────────────────────────────────────────────────────

  const handleAction = async (card: InsightCard) => {
    const state = cardStates[card.id] ?? 'idle';

    // Done + has viewer → open modal
    if (state === 'done' && card.hasViewer) {
      setViewingCard(card.id as ViewableCardId);
      return;
    }

    // Playground has no API — mark done immediately
    if (card.id === 'playground') {
      setCardStates((prev) => ({ ...prev, [card.id]: 'generating' }));
      setTimeout(() => setCardStates((prev) => ({ ...prev, [card.id]: 'done' })), 800);
      return;
    }

    setCardStates((prev) => ({ ...prev, [card.id]: 'generating' }));
    try {
      const reportSimulationId = await ensureSurveySimulationId();
      const payload = { workspaceId, explorationId, simulationId: reportSimulationId };
      if (card.id === 'raw') {
        await downloadTranscriptsMutation.mutateAsync(payload);
      } else if (card.id === 'decision') {
        await downloadDecisionMutation.mutateAsync(payload);
      } else if (card.id === 'behaviour') {
        await downloadBehaviourMutation.mutateAsync(payload);
      }
      setCardStates((prev) => ({ ...prev, [card.id]: 'done' }));
    } catch (err) {
      console.error(`Failed to generate ${card.id}:`, err);
      const detail = await getAxiosErrorMessage(err, 'Could not generate this report.');
      alert(detail);
      setCardStates((prev) => ({ ...prev, [card.id]: 'idle' }));
    }
  };

  // ── Modal download handler ────────────────────────────────────────────────

  const handleModalDownload = async () => {
    if (!viewingCard) return;
    try {
      const reportSimulationId = await ensureSurveySimulationId();
      const payload = { workspaceId, explorationId, simulationId: reportSimulationId };
      if (viewingCard === 'decision') {
        await downloadDecisionMutation.mutateAsync(payload);
      } else if (viewingCard === 'behaviour') {
        await downloadBehaviourMutation.mutateAsync(payload);
      }
    } catch (err) {
      console.error(`Failed to download ${viewingCard}:`, err);
      const detail = await getAxiosErrorMessage(err, 'Could not download this report.');
      alert(detail);
    }
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

  const isModalDownloading =
    ensureSurveySimulationMutation.isPending
      ? true
      : viewingCard === 'decision'
      ? downloadDecisionMutation.isPending
      : downloadBehaviourMutation.isPending;

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
          Generate detailed insights from your quantitative survey. Choose which documents to create.
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
                disabled={isGenerating || (isDone && !card.hasViewer && card.id !== 'playground')}
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
            onDownload={handleModalDownload}
            isDownloading={isModalDownloading}
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
