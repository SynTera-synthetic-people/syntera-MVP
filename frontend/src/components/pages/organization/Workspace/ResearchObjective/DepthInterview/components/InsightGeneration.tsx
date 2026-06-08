import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { TbLoader } from 'react-icons/tb';
import SpIcon, { type SpIconName } from '../../../../../../SPIcon';
import {
  useAllInterviewPreview,
  useDownloadQualTranscripts,
  useDownloadQualDecisionIntelligence,
  useDownloadQualBehaviorArchaeology,
  usePrepareQualReport,
  useQualReportStatus,
} from '../../../../../../../hooks/useInterview';
import { useExploration, useUpdateExplorationMethod } from '../../../../../../../hooks/useExplorations';
import { useOmniWorkflow } from '../../../../../../../hooks/useOmiWorkflow';
import InsightViewerModal from './InsightViewerModal';
import ImpactHighFiveModal from './ImpactHighFiveModal';
import ConversationStudioModal from './ConversationStudioModal';
import './InsightGeneration.css';

import OmiKeyboard from '../../../../../../../assets/Omi Animations/OmiKeyboard.mp4';

// ── Types ─────────────────────────────────────────────────────────────────────

type InsightCardId = 'verbatim' | 'decision' | 'behaviour';
type InsightCardState = 'idle' | 'generating' | 'ready';

interface InsightCard {
  id: InsightCardId;
  icon: SpIconName;
  timeBadge: string;
  title: string;
  description: string;
}

interface CardStates {
  verbatim: InsightCardState;
  decision: InsightCardState;
  behaviour: InsightCardState;
}

// ── Card definitions ──────────────────────────────────────────────────────────

const INSIGHT_CARDS: InsightCard[] = [
  {
    id: 'verbatim',
    icon: 'sp-User-User_Voice',
    timeBadge: 'Less than 20-30 sec',
    title: 'Interview Verbatim',
    description:
      'Raw transcripts of what each persona said during interviews. Direct quotes organized by question.',
  },
  {
    id: 'decision',
    icon: 'sp-Environment-Bulb',
    timeBadge: '2 to 3 mins',
    title: 'Decision Intelligence',
    description: 'From interview learnings to decision-ready insight',
  },
  {
    id: 'behaviour',
    icon: 'sp-Edit-Undo',
    timeBadge: '2 to 3 mins',
    title: 'Behaviour Archaeology',
    description:
      'Deep psychological analysis of behavioral patterns, motivations, and underlying drivers.',
  },
];

// ── Omi loader messages ───────────────────────────────────────────────────────

const LOADER_MESSAGES: Record<'decision' | 'behaviour', string[]> = {
  decision: [
    'Contextualizing your research objective...',
    'Analyzing interview conversations...',
    'Identifying recurring behavioral signals...',
    'Detecting hidden decision drivers...',
    'Connecting insights to business questions...',
    'Building strategic narratives...',
    'Structuring recommendations and actions...',
    'Finalizing your report',
  ],
  behaviour: [
    'Digging through consumer conversations...',
    'Looking beyond stated opinions...',
    'Finding the moments that shape decisions...',
    'Uncovering hidden motivations...',
    'Mapping behavioral patterns and rituals...',
    'Identifying tensions, trade-offs, and triggers...',
    'Connecting what people say with what they do...',
    'Revealing the mechanics behind decisions...',
    'Building your behavioral story...',
    'Unearthing the final insights',
  ],
};

// ── localStorage helpers ──────────────────────────────────────────────────────

const lsKey = (cardId: InsightCardId, objectiveId: string | undefined) =>
  `qual_${cardId}_ready_${objectiveId ?? ''}`;

const isLsReady = (cardId: InsightCardId, objectiveId: string | undefined): boolean =>
  localStorage.getItem(lsKey(cardId, objectiveId)) === '1';

const markLsReady = (cardId: InsightCardId, objectiveId: string | undefined) =>
  localStorage.setItem(lsKey(cardId, objectiveId), '1');

// ── OmiLoaderBar ──────────────────────────────────────────────────────────────

interface OmiLoaderBarProps {
  cardId: 'decision' | 'behaviour';
}

const OmiLoaderBar: React.FC<OmiLoaderBarProps> = ({ cardId }) => {
  const messages = LOADER_MESSAGES[cardId];
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    setMsgIdx(0);
  }, [cardId]);

  useEffect(() => {
    const id = setInterval(() => {
      setMsgIdx(prev => (prev + 1) % messages.length);
    }, 3_200);
    return () => clearInterval(id);
  }, [messages.length]);

  return (
    <motion.div
      className="ig-omi-bar"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.3 }}
    >
      {/* Omi avatar — inline styles so size is never overridden by stale CSS */}
      <div
        className="ig-omi-bar__avatar"
        style={{
          width: '2.5rem',
          height: '2.5rem',
          borderRadius: '50%',
          overflow: 'hidden',
          flexShrink: 0,
          background: 'rgba(30, 41, 80, 0.8)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <video
          src={OmiKeyboard}
          autoPlay
          loop
          muted
          playsInline
          className="ig-omi-bar__avatar-video"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 30%',
            display: 'block',
          }}
        />
      </div>

      {/* Cycling message */}
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

      {/* Pulsing dots */}
      <div className="ig-omi-bar__dots">
        <span /><span /><span />
      </div>
    </motion.div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

const InsightGeneration: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const isViewOnly = Boolean((location.state as any)?.viewOnly);
  const { workspaceId, objectiveId } = useParams<{
    workspaceId: string;
    objectiveId: string;
  }>();
  const { trigger } = useOmniWorkflow();

  const prevStatusRef = useRef<{ DI?: string; BA?: string }>({});

  const [cardStates, setCardStates] = useState<CardStates>(() => ({
    verbatim:  isLsReady('verbatim',  objectiveId) ? 'ready' : 'idle',
    decision:  isLsReady('decision',  objectiveId) ? 'ready' : 'idle',
    behaviour: isLsReady('behaviour', objectiveId) ? 'ready' : 'idle',
  }));

  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [viewingCard, setViewingCard] = useState<InsightCardId | null>(null);
  const [showImpactModal, setShowImpactModal] = useState<boolean>(false);
  const [showConversationStudio, setShowConversationStudio] = useState<boolean>(false);

  const hasAnyInsightReady = Object.values(cardStates).some((s) => s === 'ready');

  const downloadTranscriptsMutation = useDownloadQualTranscripts(workspaceId, objectiveId);
  const downloadDecisionMutation    = useDownloadQualDecisionIntelligence(workspaceId, objectiveId);
  const downloadBehaviourMutation   = useDownloadQualBehaviorArchaeology(workspaceId, objectiveId);
  const prepareMutation             = usePrepareQualReport(workspaceId, objectiveId);

  const { data: reportStatusData } = useQualReportStatus(workspaceId, objectiveId, {
    enabled: !!(workspaceId && objectiveId),
    refetchInterval: pollingEnabled ? 5_000 : false,
    staleTime: 0,
  });

  useEffect(() => {
    const qual = (reportStatusData as any)?.qual;
    if (!qual) return;

    const diStatus  = qual.DECISION_INTELLIGENCE;
    const baStatus  = qual.BEHAVIORAL_ARCHAEOLOGY;
    const trStatus  = qual.TRANSCRIPTS;

    const DI = diStatus?.status as string | undefined;
    const BA = baStatus?.status as string | undefined;
    const TR = trStatus?.status as string | undefined;

    const diReady   = Boolean(diStatus?.available) || DI === 'done';
    const baReady   = Boolean(baStatus?.available) || BA === 'done';
    const trReady   = Boolean(trStatus?.available) || TR === 'done';
    const diPending = DI === 'pending' || DI === 'generating';
    const baPending = BA === 'pending' || BA === 'generating';
    const trPending = TR === 'pending' || TR === 'generating';

    if (DI === 'failed' && prevStatusRef.current.DI === 'pending') {
      const msg = diStatus?.error_message as string | undefined;
      toast.error(
        msg
          ? `Decision Intelligence failed: ${msg.slice(0, 100)}`
          : 'Decision Intelligence generation failed — please try again.',
        { toastId: 'DI-failed' }
      );
    }
    if (BA === 'failed' && prevStatusRef.current.BA === 'pending') {
      const msg = baStatus?.error_message as string | undefined;
      toast.error(
        msg
          ? `Behaviour Archaeology failed: ${msg.slice(0, 100)}`
          : 'Behaviour Archaeology generation failed — please try again.',
        { toastId: 'BA-failed' }
      );
    }
    prevStatusRef.current = {
      ...(DI !== undefined && { DI }),
      ...(BA !== undefined && { BA }),
    };

    setCardStates((prev) => {
      const next = { ...prev };

      if (diReady) {
        next.decision = 'ready';
        markLsReady('decision', objectiveId);
      } else if (diPending) {
        next.decision = 'generating';
      } else if (diStatus && next.decision !== 'ready') {
        next.decision = 'idle';
      }

      if (baReady) {
        next.behaviour = 'ready';
        markLsReady('behaviour', objectiveId);
      } else if (baPending) {
        next.behaviour = 'generating';
      } else if (baStatus && next.behaviour !== 'ready') {
        next.behaviour = 'idle';
      }

      if (trReady) {
        next.verbatim = 'ready';
        markLsReady('verbatim', objectiveId);
      } else if (trPending) {
        next.verbatim = 'generating';
      } else if (trStatus && next.verbatim !== 'ready') {
        next.verbatim = 'idle';
      }

      return next;
    });

    if (diPending || baPending || trPending) {
      setPollingEnabled(true);
    } else {
      setPollingEnabled(false);
    }
  }, [reportStatusData, objectiveId]);

  const {
    data: verbatimPreviewData,
    isLoading: verbatimLoading,
  } = useAllInterviewPreview(workspaceId, objectiveId, {
    enabled: !!workspaceId && !!objectiveId,
  });

  const { data: explorationData } = useExploration(objectiveId);
  const updateExplorationMutation = useUpdateExplorationMethod();

  const _apiData         = (explorationData as any)?.data ?? (explorationData as any) ?? {};
  const _isQual          = !!_apiData?.is_qualitative;
  const _isQuant         = !!_apiData?.is_quantitative;
  const _derivedFromFlags = _isQual && _isQuant ? 'both' : _isQual ? 'qualitative' : _isQuant ? 'quantitative' : '';
  const researchApproach = (
    _apiData?.research_approach ||
    localStorage.getItem(`approach_${objectiveId}`) ||
    _derivedFromFlags
  ).toLowerCase().trim();

  const isExplorationEnded = !!_apiData?.is_end;

  const handleGenerate = async (cardId: InsightCardId) => {
    setCardStates((prev) => ({ ...prev, [cardId]: 'generating' }));
    try {
      if (cardId === 'verbatim') {
        await downloadTranscriptsMutation.mutateAsync();
        setCardStates((prev) => ({ ...prev, [cardId]: 'ready' }));
        markLsReady('verbatim', objectiveId);
      } else {
        const slug = cardId === 'decision' ? 'decision-intelligence' : 'behavior-archaeology';
        await prepareMutation.mutateAsync(slug);
        setPollingEnabled(true);
      }
    } catch (err) {
      console.error(`Failed to generate ${cardId}:`, err);
      setCardStates((prev) => ({ ...prev, [cardId]: 'idle' }));
    }
  };

  const handleEndExplorationClick = () => {
    setShowImpactModal(true);
  };

  const handleImpactSubmit = async () => {
    setShowImpactModal(false);
    try {
      if (objectiveId) {
        localStorage.setItem(`qualitative_sub3_${objectiveId}`, '1');
      }
      type EndFn = (args: { id: string | undefined; data: { is_end: boolean } }) => Promise<unknown>;
      await (updateExplorationMutation.mutateAsync as unknown as EndFn)({
        id: objectiveId,
        data: { is_end: true },
      });
      queryClient.invalidateQueries({ queryKey: ['explorations'] });
      navigate(`/main/organization/workspace/explorations/${workspaceId}`);
    } catch (err) {
      console.error('Failed to end exploration:', err);
      navigate(`/main/organization/workspace/explorations/${workspaceId}`);
    }
  };

  const handleBeginQuant = () => {
    if (objectiveId) {
      localStorage.setItem(`qualitative_sub3_${objectiveId}`, '1');
    }
    trigger({
      stage: 'population_simulation',
      event: 'ENTER_POPULATION',
      payload: {},
    });
    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/questionnaire`,
      { state: { viewOnly: isViewOnly } }
    );
  };

  const activeLoaderCard: 'decision' | 'behaviour' | null =
    cardStates.decision === 'generating'
      ? 'decision'
      : cardStates.behaviour === 'generating'
      ? 'behaviour'
      : null;

  return (
    <div className="ig-page">

      <div className="ig-header">
        <h1 className="ig-title">Insight Generation</h1>
        <p className="ig-subtitle">
          Generate detailed insights from your qualitative interviews. Choose which documents to create.
        </p>
      </div>

      <div className="ig-cards">
        {INSIGHT_CARDS.map((card, i) => {
          const state        = cardStates[card.id];
          const isGenerating = state === 'generating';
          const isReady      = state === 'ready';

          return (
            <motion.div
              key={card.id}
              className="ig-card"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="ig-card__icon">
                <SpIcon name={card.icon} size={36} />
              </div>

              <div className="ig-card__badge">
                <SpIcon name="sp-Calendar-Alarm" size={13} className="ig-card__badge-icon" />
                <span>{card.timeBadge}</span>
              </div>

              <h3 className="ig-card__title">{card.title}</h3>
              <p className="ig-card__desc">{card.description}</p>

              <button
                className={`ig-card__btn ${isReady ? 'ig-card__btn--view' : ''}`}
                disabled={isGenerating}
                onClick={() =>
                  isReady ? setViewingCard(card.id) : handleGenerate(card.id)
                }
              >
                {isGenerating ? (
                  <>
                    <TbLoader className="ig-card__btn-spinner" size={15} />
                    Generating…
                  </>
                ) : isReady ? (
                  'View'
                ) : (
                  'Generate'
                )}
              </button>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {activeLoaderCard !== null && (
          <OmiLoaderBar cardId={activeLoaderCard} />
        )}
      </AnimatePresence>

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

          {researchApproach === 'both' && !isViewOnly && !isExplorationEnded && (
            <button
              className="ig-footer__btn ig-footer__btn--white"
              onClick={handleBeginQuant}
            >
              Begin Quant Exploration
              <SpIcon name="sp-Arrow-Arrow_Right_SM" size={16} />
            </button>
          )}
        </div>

        {(isViewOnly || isExplorationEnded) ? (
          <button
            className="ig-footer__btn ig-footer__btn--end"
            onClick={() => navigate(`/main/organization/workspace/explorations/${workspaceId}`)}
          >
            End Journey
          </button>
        ) : (
          <button
            className="ig-footer__btn ig-footer__btn--end"
            onClick={handleEndExplorationClick}
          >
            End Exploration
          </button>
        )}
      </div>

      <AnimatePresence>
        {viewingCard !== null && (
          <InsightViewerModal
            cardId={viewingCard}
            workspaceId={workspaceId ?? ''}
            objectiveId={objectiveId ?? ''}
            verbatimPreviewData={verbatimPreviewData}
            verbatimLoading={verbatimLoading}
            downloadTranscriptsMutation={downloadTranscriptsMutation}
            downloadDecisionMutation={downloadDecisionMutation}
            downloadBehaviourMutation={downloadBehaviourMutation}
            onClose={() => setViewingCard(null)}
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
            workspaceId={workspaceId ?? ''}
            objectiveId={objectiveId ?? ''}
            flow="qual"
            onClose={() => setShowConversationStudio(false)}
          />
        )}
      </AnimatePresence>

    </div>
  );
};

export default InsightGeneration;