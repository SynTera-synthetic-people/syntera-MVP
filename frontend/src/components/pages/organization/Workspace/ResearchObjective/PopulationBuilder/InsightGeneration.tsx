import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
import ConversationStudioModal from '../DepthInterview/components/ConversationStudioModal';
import InsightViewerModalQuant, { type ViewableCardId } from './InsightViewerModalQuant';
import './InsightGeneration.css';

import OmiKeyboard from '../../../../../../assets/Omi Animations/OmiKeyboard.mp4';

// ── Props ─────────────────────────────────────────────────────────────────────

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

interface InsightCard {
  id: string;
  icon: React.ReactNode;
  timeLabel: string;
  title: string;
  description: string;
  actionLabel: 'Generate' | 'Start';
  hasViewer?: boolean;
  comingSoon?: boolean;
}

// ── localStorage helpers ──────────────────────────────────────────────────────

const lsKey = (cardId: string, explorationId: string) =>
  `quant_insight_${cardId}_ready_${explorationId}`;

const isLsReady = (cardId: string, explorationId: string): boolean =>
  localStorage.getItem(lsKey(cardId, explorationId)) === '1';

const markLsReady = (cardId: string, explorationId: string) =>
  localStorage.setItem(lsKey(cardId, explorationId), '1');

// ── Card definitions ──────────────────────────────────────────────────────────

const INSIGHT_CARDS: InsightCard[] = [
  {
    id: 'raw',
    icon: <SpIcon name="sp-User-User_Voice" size={48} />,
    timeLabel: 'Less than 20-30 sec',
    title: 'Raw Data Shell',
    description: 'Structured response data, ready for analysis, export, and validation',
    actionLabel: 'Generate',
    hasViewer: true,
    comingSoon: false,
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
    comingSoon: true,
  },
];

// ── Omi loader messages ───────────────────────────────────────────────────────

const LOADER_MESSAGES: Record<'decision' | 'behaviour', string[]> = {
  decision: [
    'Processing patterns from data shell...',
    'Mapping key consumer segments...',
    'Identifying statistically significant signals...',
    'Connecting findings to your research objectives...',
    'Detecting opportunities, barriers, and risks...',
    'Prioritizing the signals that matter most...',
    'Translating data into strategic implications...',
    'Building your decision intelligence story...',
    'Structuring recommendations and actions...',
    'Finalizing your report',
  ],
  behaviour: [
    'Exploring consumer response patterns...',
    'Looking beneath the surface of the numbers...',
    'Identifying behavioral clusters...',
    'Detecting hidden motivations and tensions...',
    'Mapping decision-making pathways...',
    'Finding recurring habits and rituals...',
    'Uncovering trade-offs and triggers...',
    'Connecting attitudes with likely behaviors...',
    'Building behavioral archetypes...',
    'Constructing the behavioral story...',
    'Unearthing the final insights',
  ],
};

// ── OmiLoaderBar ──────────────────────────────────────────────────────────────

interface OmiLoaderBarProps {
  cardId: 'decision' | 'behaviour';
}

const OmiLoaderBar: React.FC<OmiLoaderBarProps> = ({ cardId }) => {
  const messages = LOADER_MESSAGES[cardId];
  const [msgIdx, setMsgIdx] = useState(0);

  // Reset when card switches
  useEffect(() => {
    setMsgIdx(0);
  }, [cardId]);

  useEffect(() => {
    // Stay on the last message — don't loop
    if (msgIdx >= messages.length - 1) return;

    const id = setTimeout(() => {
      setMsgIdx(prev => prev + 1);
    }, 8_500);

    return () => clearTimeout(id);
  }, [msgIdx, messages.length]);

  return (
    <motion.div
      className="ig-omi-bar"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.3 }}
    >
      <div className="ig-omi-bar__avatar">
        <video
          src={OmiKeyboard}
          autoPlay
          loop
          muted
          playsInline
          className="ig-omi-bar__avatar-video"
        />
      </div>

      <div className="ig-omi-bar__msg-wrap">
        <AnimatePresence mode="wait">
          <motion.span
            key={msgIdx}
            className="ig-omi-bar__msg"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            <span className="ig-omi-bar__bullet" />
            {messages[msgIdx]}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="ig-omi-bar__dots">
        <span /><span /><span />
      </div>
    </motion.div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

const InsightsGeneration: React.FC<InsightsGenerationProps> = ({
  selectedPersonas,
  explorationId,
  workspaceId,
  simulationResult,
  initialSurveySimulationId,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isViewOnly = Boolean((location.state as any)?.viewOnly);
  const queryClient = useQueryClient();
  const updateExplorationMutation = useUpdateExplorationMethod();

  const populationSimulationId: string = simulationResult?.id ?? '';

  const ensureSurveySimulationMutation = useEnsureSurveySimulation();
  const downloadTranscriptsMutation = useDownloadQuantTranscripts();
  const downloadDecisionMutation = useDownloadQuantDecisionIntelligence();
  const downloadBehaviourMutation = useDownloadQuantBehaviorArchaeology();

  // ── Card states ───────────────────────────────────────────────────────────
  // localStorage is used only to RESTORE "done" state from a prior session so
  // the "View" button reappears on reload — it does NOT skip the Generate flow
  // when the user explicitly clicks Generate on an idle card.
  const [cardStates, setCardStates] = useState<Record<string, CardState>>(() => {
    if (!explorationId) return {};
    return INSIGHT_CARDS.reduce<Record<string, CardState>>((acc, card) => {
      acc[card.id] = isLsReady(card.id, explorationId) ? 'done' : 'idle';
      return acc;
    }, {});
  });

  const [viewingCard, setViewingCard] = useState<ViewableCardId | null>(null);
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [showConversationStudio, setShowConversationStudio] = useState(false);
  const [surveySimulationId, setSurveySimulationId] = useState(initialSurveySimulationId ?? '');
  const ensureSurveyPromiseRef = useRef<Promise<string> | null>(null);

  // ── Side-effects ──────────────────────────────────────────────────────────

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

    const hydrate = async () => {
      try {
        const existing = await getSurveySimulationBySource({
          workspaceId,
          explorationId,
          simulationSourceId: populationSimulationId,
        });
        const id = existing?.data?.id;
        if (!cancelled && id) {
          setSurveySimulationId(id);
          localStorage.setItem(`quant_sub3_${explorationId}`, '1');
        }
      } catch (err) {
        console.warn('Could not hydrate survey simulation for insights', err);
      }
    };
    hydrate();
    return () => { cancelled = true; };
  }, [workspaceId, explorationId, populationSimulationId, surveySimulationId]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const hasAnyInsightReady = Object.values(cardStates).some((s) => s === 'done');

  // Derive which loader card (if any) is currently generating
  const activeLoaderCard: 'decision' | 'behaviour' | null =
    cardStates['decision'] === 'generating'
      ? 'decision'
      : cardStates['behaviour'] === 'generating'
        ? 'behaviour'
        : null;

  // ── Survey simulation ID resolution ──────────────────────────────────────

  const getPersonaIds = () => {
    const selectedIds = selectedPersonas.map((p) => p.id).filter(Boolean);
    if (selectedIds.length > 0) return selectedIds;
    if (Array.isArray(simulationResult?.persona_ids)) return simulationResult.persona_ids.filter(Boolean);
    if (Array.isArray(simulationResult?.persona_id)) return simulationResult.persona_id.filter(Boolean);
    return [];
  };

  const ensureSurveySimulationId = async (): Promise<string> => {
    if (surveySimulationId) return surveySimulationId;
    if (ensureSurveyPromiseRef.current) return ensureSurveyPromiseRef.current;

    const promise = (async () => {
      if (!workspaceId || !explorationId || !populationSimulationId) {
        throw new Error('Missing population simulation context.');
      }
      const result = await ensureSurveySimulationMutation.mutateAsync({
        workspaceId,
        explorationId,
        personaIds: getPersonaIds(),
        simulationId: populationSimulationId,
        forceRerun: false,
      });
      const nextId = result?.data?.id;
      if (!nextId) throw new Error('Survey simulation did not return an ID.');
      setSurveySimulationId(nextId);
      queryClient.setQueryData(
        ['surveySimulationBySource', workspaceId, explorationId, populationSimulationId],
        result,
      );
      localStorage.setItem(`quant_sub3_${explorationId}`, '1');
      return nextId;
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

    // ── "View" click: card already generated, open the modal ─────────────
    // Only enter this branch when state is 'done' AND the user clicks the
    // "View" button (button label changes to "View" when done + hasViewer).
    // The "Generate" button is only rendered when state === 'idle', so there
    // is no risk of accidentally entering this branch on a Generate click.
    if (state === 'done' && card.hasViewer) {
      setViewingCard(card.id as ViewableCardId);
      return;
    }

    // Already generating — ignore double-clicks
    if (state === 'generating') return;

    // ── Playground — no API, mark done instantly ──────────────────────────
    if (card.id === 'playground') {
      setCardStates((prev) => ({ ...prev, [card.id]: 'generating' }));
      setTimeout(() => {
        setCardStates((prev) => ({ ...prev, [card.id]: 'done' }));
        markLsReady(card.id, explorationId);
      }, 800);
      return;
    }

    // ── Generate flow for raw / decision / behaviour ──────────────────────
    // Set generating immediately so the loader bar appears right away
    setCardStates((prev) => ({ ...prev, [card.id]: 'generating' }));

    try {
      // Step 1: make sure the survey simulation exists
      const simulationId = await ensureSurveySimulationId();
      const payload = { workspaceId, explorationId, simulationId };

      // Step 2: call the card-specific generation/download mutation
      if (card.id === 'raw') {
        await downloadTranscriptsMutation.mutateAsync(payload);
      } else if (card.id === 'decision') {
        await downloadDecisionMutation.mutateAsync(payload);
      } else if (card.id === 'behaviour') {
        await downloadBehaviourMutation.mutateAsync(payload);
      }

      // Step 3: mark done
      setCardStates((prev) => ({ ...prev, [card.id]: 'done' }));
      markLsReady(card.id, explorationId);
    } catch (err) {
      console.error(`Failed to generate ${card.id}:`, err);
      const detail = await getAxiosErrorMessage(err, 'Could not generate this report.');
      alert(detail);
      setCardStates((prev) => ({ ...prev, [card.id]: 'idle' }));
    }
  };

  // ── Modal download ────────────────────────────────────────────────────────
  // The modal download re-downloads an already-generated report.
  // It does NOT re-run generation — just fetches the existing artifact again.

  const handleModalDownload = async () => {
    if (!viewingCard) return;
    try {
      const reportSimulationId = await ensureSurveySimulationId();
      const payload = { workspaceId, explorationId, simulationId: reportSimulationId };
      if (viewingCard === 'raw') {
        await downloadTranscriptsMutation.mutateAsync(payload);
      } else if (viewingCard === 'decision') {
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

  const handleEndExplorationClick = () => setShowImpactModal(true);

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
    downloadTranscriptsMutation.isPending ||
    downloadDecisionMutation.isPending ||
    downloadBehaviourMutation.isPending;

  // ── Render ────────────────────────────────────────────────────────────────

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
              <div className="ig-card__icon-wrap">{card.icon}</div>

              <div className="ig-card__badge">
                <SpIcon name="sp-Calendar-Alarm" size={16} />
                {card.timeLabel}
              </div>

              <h3 className="ig-card__title">{card.title}</h3>
              <p className="ig-card__desc">{card.description}</p>

              <button
                className={`ig-card__btn ${card.comingSoon
                    ? 'ig-card__btn--coming-soon'
                    : isDone && card.hasViewer
                      ? 'ig-card__btn--view'
                      : isDone
                        ? 'ig-card__btn--done'
                        : ''
                  }`}
                onClick={() => !card.comingSoon && handleAction(card)}
                disabled={
                  isGenerating ||
                  card.comingSoon ||
                  (isDone && !card.hasViewer && card.id !== 'playground')
                }
              >
                {card.comingSoon ? (
                  'Coming Soon'
                ) : isGenerating ? (
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

      {/* ── Omi loader bar — shown while Decision Intelligence or Behaviour Archaeology is generating ── */}
      <AnimatePresence>
        {activeLoaderCard !== null && (
          <OmiLoaderBar cardId={activeLoaderCard} />
        )}
      </AnimatePresence>

      {/* ── Footer ── */}
      <div className="ig-footer">
        <div className="ig-footer__left">
          {hasAnyInsightReady && (
            <button
              className="ig-footer__btn ig-footer__btn--white"
              onClick={() => setShowConversationStudio(true)}
            >
              Conversation Studio
            </button>
          )}
        </div>

        {isViewOnly ? (
          <button
            className="ig-footer__btn ig-footer__btn--end"
            onClick={() => navigate(`/main/organization/workspace/explorations/${workspaceId}`)}
          >
            End Journey
          </button>
        ) : (
          <button
            className="ig-footer__btn ig-footer__btn--end"
            disabled={!hasAnyInsightReady}
            onClick={handleEndExplorationClick}
          >
            End Exploration
          </button>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {viewingCard !== null && (
          <InsightViewerModalQuant
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

        {showConversationStudio && (
          <ConversationStudioModal
            workspaceId={workspaceId}
            flow="quant"
            objectiveId={explorationId}
            onClose={() => setShowConversationStudio(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default InsightsGeneration;