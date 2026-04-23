import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { TbLoader, TbX } from 'react-icons/tb';
import SpIcon, { type SpIconName } from '../../../../../../SPIcon';
import {
  useExportAllInterviewsPdf,
  useAllInterviewPreview,
} from '../../../../../../../hooks/useInterview';
import { useExploration,useUpdateExplorationMethod } from '../../../../../../../hooks/useExplorations';
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

// ── Card definitions (matches Figma image 3 exactly) ─────────────────────────

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



// ── Component ─────────────────────────────────────────────────────────────────

const InsightGeneration: React.FC = () => {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const { workspaceId, objectiveId } = useParams<{
    workspaceId: string;
    objectiveId: string;
  }>();
  const { trigger } = useOmniWorkflow();

  // ── Card generate/ready state per card ───────────────────────────────────

  const [cardStates, setCardStates] = useState<CardStates>({
    verbatim: 'idle',
    decision: 'idle',
    behaviour: 'idle',
  });

  // ── Modal visibility ──────────────────────────────────────────────────────

  const [viewingCard,          setViewingCard]          = useState<InsightCardId | null>(null);
  const [showImpactModal,      setShowImpactModal]      = useState<boolean>(false);
  const [showConversationStudio, setShowConversationStudio] = useState<boolean>(false);
  // Conversation Studio only rendered once at least one insight has been generated
  const hasAnyInsightReady = Object.values(cardStates).some((s) => s === 'ready');

  // ── Hooks ─────────────────────────────────────────────────────────────────

  const exportAllMutation = useExportAllInterviewsPdf(workspaceId, objectiveId);

  // Pre-fetch verbatim preview data so it's ready when user clicks "View"
  const {
    data: verbatimPreviewData,
    isLoading: verbatimLoading,
    refetch: refetchVerbatim,
  } = useAllInterviewPreview(workspaceId, objectiveId, {
    enabled: !!workspaceId && !!objectiveId,
  });

  const { data: explorationData } = useExploration(objectiveId);
  const updateExplorationMutation  = useUpdateExplorationMethod();

  const researchApproach = (
    (explorationData as any)?.data?.research_approach ||
    (explorationData as any)?.research_approach ||
    localStorage.getItem(`approach_${objectiveId}`) ||
    ''
  ).toLowerCase().trim();

  // ── Generate handlers ─────────────────────────────────────────────────────

  const handleGenerate = async (cardId: InsightCardId) => {
    setCardStates((prev) => ({ ...prev, [cardId]: 'generating' }));

    try {
      if (cardId === 'verbatim') {
        // Verbatim uses the existing export-all-interviews PDF endpoint
        await exportAllMutation.mutateAsync();
        await refetchVerbatim();
      } else {
        // Decision Intelligence & Behaviour Archaeology: hooks TBD from backend.
        // For now we simulate the generation delay and mark as ready.
        // Replace the setTimeout with the real mutateAsync call once the
        // backend endpoints are available (e.g. useGenerateDecisionIntel,
        // useGenerateBehaviourArchaeology).
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
      }
      setCardStates((prev) => ({ ...prev, [cardId]: 'ready' }));
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
      // Set sub3 (Insights Generation) as done
      if (objectiveId) {
        localStorage.setItem(`qualitative_sub3_${objectiveId}`, '1');
      }
      // Mark exploration as complete — same pattern used by PersonaBuilder
      type EndFn = (args: { id: string | undefined; data: { is_end: boolean } }) => Promise<unknown>;
      await (updateExplorationMutation.mutateAsync as unknown as EndFn)({
        id: objectiveId,
        data: { is_end: true },
      });
      queryClient.invalidateQueries({ queryKey: ['explorations'] });
      navigate(`/main/organization/workspace/explorations/${workspaceId}`);
    } catch (err) {
      console.error('Failed to end exploration:', err);
      // Navigate anyway so user isn't stuck
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
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/population-builder`
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
          const state = cardStates[card.id];
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
          {/* Conversation Studio — only rendered after at least one insight is generated */}
          {hasAnyInsightReady && (
            <button
              className="ig-footer__btn ig-footer__btn--ghost"
              onClick={() => setShowConversationStudio(true)}
            >
              Conversation Studio
            </button>
          )}

          {/* Begin Quant Exploration — only shown when user chose "Both".
               Pure quantitative users never reach this page via the qual flow. */}
          {researchApproach === 'both' && (
            <button
              className="ig-footer__btn ig-footer__btn--ghost ig-footer__btn--arrow"
              onClick={handleBeginQuant}
            >
              Begin Quant Exploration
              <SpIcon name="sp-Arrow-Arrow_Right_SM" size={16} />
            </button>
          )}
        </div>

        {/* End Exploration */}
        <button
          className="ig-footer__btn ig-footer__btn--end"
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
            workspaceId={workspaceId ?? ''}
            objectiveId={objectiveId ?? ''}
            verbatimPreviewData={verbatimPreviewData}
            verbatimLoading={verbatimLoading}
            exportAllMutation={exportAllMutation}
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