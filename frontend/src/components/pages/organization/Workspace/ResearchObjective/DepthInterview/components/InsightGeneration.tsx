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

// ── localStorage helpers ──────────────────────────────────────────────────────

const lsKey = (cardId: InsightCardId, objectiveId: string | undefined) =>
  `qual_${cardId}_ready_${objectiveId ?? ''}`;

const isLsReady = (cardId: InsightCardId, objectiveId: string | undefined): boolean =>
  localStorage.getItem(lsKey(cardId, objectiveId)) === '1';

const markLsReady = (cardId: InsightCardId, objectiveId: string | undefined) =>
  localStorage.setItem(lsKey(cardId, objectiveId), '1');

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

  // Tracks previous DI/BA statuses so we only toast on actual transitions
  const prevStatusRef = useRef<{ DI?: string; BA?: string }>({});

  // ── Card states — initialised from localStorage so they survive logout ────
  const [cardStates, setCardStates] = useState<CardStates>(() => ({
    verbatim:  isLsReady('verbatim',  objectiveId) ? 'ready' : 'idle',
    decision:  isLsReady('decision',  objectiveId) ? 'ready' : 'idle',
    behaviour: isLsReady('behaviour', objectiveId) ? 'ready' : 'idle',
  }));

  // When true, useQualReportStatus polls every 5 s for DI/BA completion.
  const [pollingEnabled, setPollingEnabled] = useState(false);

  // ── Modal visibility ──────────────────────────────────────────────────────

  const [viewingCard, setViewingCard] = useState<InsightCardId | null>(null);
  const [showImpactModal, setShowImpactModal] = useState<boolean>(false);
  const [showConversationStudio, setShowConversationStudio] = useState<boolean>(false);

  const hasAnyInsightReady = Object.values(cardStates).some((s) => s === 'ready');

  // ── Hooks ─────────────────────────────────────────────────────────────────

  const downloadTranscriptsMutation = useDownloadQualTranscripts(workspaceId, objectiveId);
  const downloadDecisionMutation    = useDownloadQualDecisionIntelligence(workspaceId, objectiveId);
  const downloadBehaviourMutation   = useDownloadQualBehaviorArchaeology(workspaceId, objectiveId);
  const prepareMutation             = usePrepareQualReport(workspaceId, objectiveId);

  const { data: reportStatusData } = useQualReportStatus(workspaceId, objectiveId, {
    enabled: !!(workspaceId && objectiveId),
    refetchInterval: pollingEnabled ? 5_000 : false,
    staleTime: 0,
  });

  // ── Sync card states from server — never regress a 'ready' card ──────────
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

    // Toast only on actual pending → failed transitions
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

      // ── Decision Intelligence ──
      if (diReady) {
        next.decision = 'ready';
        markLsReady('decision', objectiveId);
      } else if (diPending) {
        next.decision = 'generating';
      } else if (diStatus && next.decision !== 'ready') {
        // Only reset to idle if not already ready (prevents regression)
        next.decision = 'idle';
      }

      // ── Behaviour Archaeology ──
      if (baReady) {
        next.behaviour = 'ready';
        markLsReady('behaviour', objectiveId);
      } else if (baPending) {
        next.behaviour = 'generating';
      } else if (baStatus && next.behaviour !== 'ready') {
        next.behaviour = 'idle';
      }

      // ── Verbatim / Transcripts ──
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

    // Re-enable polling when tasks are still in flight
    if (diPending || baPending || trPending) {
      setPollingEnabled(true);
    } else {
      setPollingEnabled(false);
    }
  }, [reportStatusData, objectiveId]);

  // Pre-fetch verbatim preview data so it's ready when user clicks "View"
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

  // ── Generate handlers ─────────────────────────────────────────────────────

  const handleGenerate = async (cardId: InsightCardId) => {
    setCardStates((prev) => ({ ...prev, [cardId]: 'generating' }));
    try {
      if (cardId === 'verbatim') {
        // Synchronous DOCX generation — no LLM, completes in seconds
        await downloadTranscriptsMutation.mutateAsync();
        setCardStates((prev) => ({ ...prev, [cardId]: 'ready' }));
        markLsReady('verbatim', objectiveId);
      } else {
        // DI / BA: fire background LLM task on server, return immediately.
        // useQualReportStatus polls every 5s and flips the card to 'ready'
        // once the server reports the PDF is done.
        const slug = cardId === 'decision' ? 'decision-intelligence' : 'behavior-archaeology';
        await prepareMutation.mutateAsync(slug);
        setPollingEnabled(true);
      }
    } catch (err) {
      console.error(`Failed to generate ${cardId}:`, err);
      setCardStates((prev) => ({ ...prev, [cardId]: 'idle' }));
    }
  };

  // ── End Exploration ───────────────────────────────────────────────────────

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

  // ── Quant navigation ──────────────────────────────────────────────────────

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
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/questionnaire`
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="ig-page">

      {/* ── Page header ── */}
      <div className="ig-header">
        <h1 className="ig-title">Insight Generation</h1>
        <p className="ig-subtitle">
          Generate detailed insights from your qualitative interviews. Choose which documents to create.
        </p>
      </div>

      {/* ── 3-card grid ── */}
      <div className="ig-cards">
        {INSIGHT_CARDS.map((card, i) => {
          const state       = cardStates[card.id];
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
              {/* Icon */}
              <div className="ig-card__icon">
                <SpIcon name={card.icon} size={36} />
              </div>

              {/* Time badge */}
              <div className="ig-card__badge">
                <SpIcon name="sp-Calendar-Alarm" size={13} className="ig-card__badge-icon" />
                <span>{card.timeBadge}</span>
              </div>

              {/* Title */}
              <h3 className="ig-card__title">{card.title}</h3>

              {/* Description */}
              <p className="ig-card__desc">{card.description}</p>

              {/* CTA — Generate → View */}
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

      {/* ── Footer action bar ── */}
      <div className="ig-footer">
        <div className="ig-footer__left">

          {/* Conversation Studio */}
          {hasAnyInsightReady && (
            <button
              className="ig-footer__btn ig-footer__btn--white"
              onClick={() => setShowConversationStudio(true)}
            >
              Conversation Studio
            </button>
          )}

          {/* Begin Quant Exploration — hidden in view-only mode */}
          {researchApproach === 'both' && !isViewOnly && (
            <button
              className="ig-footer__btn ig-footer__btn--white"
              onClick={handleBeginQuant}
            >
              Begin Quant Exploration
              <SpIcon name="sp-Arrow-Arrow_Right_SM" size={16} />
            </button>
          )}
        </div>

        {/* End Journey (view-only) / End Exploration (normal) */}
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
            onClick={handleEndExplorationClick}
          >
            End Exploration
          </button>
        )}
      </div>

      {/* ── Modals ── */}
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
            onClose={() => setShowConversationStudio(false)}
          />
        )}
      </AnimatePresence>

    </div>
  );
};

export default InsightGeneration;