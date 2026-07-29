import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbX, TbLoader, TbMaximize, TbMinimize, TbAlertCircle } from 'react-icons/tb';
import SpIcon from '../../../../../../SPIcon';
import { useShareQualReport } from '../../../../../../../hooks/useInterview';
import { interviewService } from '../../../../../../../services/interviewService';
import ShareInsightsModal from './ShareInsightModal';
import './InsightViewerModal.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type InsightCardId = 'verbatim' | 'decision' | 'behaviour';

interface DownloadMutation {
  mutateAsync: () => Promise<unknown>;
  isPending: boolean;
}

interface InsightViewerModalProps {
  cardId: InsightCardId;
  workspaceId: string;
  objectiveId: string;
  verbatimPreviewData: unknown;
  verbatimLoading: boolean;
  downloadTranscriptsMutation: DownloadMutation;
  downloadDecisionMutation: DownloadMutation;
  downloadBehaviourMutation: DownloadMutation;
  onClose: () => void;
}

// ── Card metadata map ─────────────────────────────────────────────────────────

const CARD_META: Record<InsightCardId, { title: string; subtitle: string }> = {
  verbatim: {
    title: 'Interview Verbatim',
    subtitle: 'What people said - in their own words',
  },
  decision: {
    title: 'Decision Intelligence',
    subtitle: 'How your personas make decisions and prioritize.',
  },
  behaviour: {
    title: 'Behaviour Archaeology',
    subtitle: 'Deep psychological patterns behind the choices.',
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

const CARD_SLUG: Record<InsightCardId, string> = {
  verbatim: 'transcripts',
  decision: 'decision-intelligence',
  behaviour: 'behavior-archaeology',
};

// ── Blob download helper (mirrors _triggerBlobDownload in useInterview.ts) ────

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 150);
}

const InsightViewerModal: React.FC<InsightViewerModalProps> = ({
  cardId,
  workspaceId,
  objectiveId,
  verbatimPreviewData,
  verbatimLoading,
  downloadTranscriptsMutation,
  downloadDecisionMutation,
  downloadBehaviourMutation,
  onClose,
}) => {
  const meta = CARD_META[cardId];

  // ── Share modal state ─────────────────────────────────────────────────────
  const [shareOpen, setShareOpen] = useState(false);

  // ── Maximize state ────────────────────────────────────────────────────────
  const [isMaximized, setIsMaximized] = useState(false);

  // ── Inline PDF preview state (decision / behaviour reports) ──────────────
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    // Verbatim has its own JSON-based preview (VerbatimContent) — no PDF needed.
    if (cardId === 'verbatim') return;

    let cancelled = false;
    let objectUrl: string | null = null;

    const fetchPreview = async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      previewBlobRef.current = null;
      try {
        const blob =
          cardId === 'decision'
            ? await interviewService.downloadQualDecisionIntelligence(workspaceId, objectiveId)
            : await interviewService.downloadQualBehaviorArchaeology(workspaceId, objectiveId);

        if (cancelled) return;
        previewBlobRef.current = blob;
        objectUrl = window.URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      } catch (err) {
        console.error(`Failed to load ${cardId} preview:`, err);
        if (!cancelled) {
          setPreviewError('Unable to load the preview. You can still try downloading the report.');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };

    fetchPreview();

    return () => {
      cancelled = true;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [cardId, workspaceId, objectiveId]);

  const shareReportMutation = useShareQualReport(workspaceId, objectiveId);
  const activeMutation =
    cardId === 'verbatim'
      ? downloadTranscriptsMutation
      : cardId === 'decision'
        ? downloadDecisionMutation
        : downloadBehaviourMutation;

  const handleDownload = async () => {
    try {
      if (previewBlobRef.current) {
        // Reuse the blob we already fetched for the inline preview —
        // no need to hit the backend a second time.
        triggerBlobDownload(previewBlobRef.current, `${CARD_SLUG[cardId]}_${objectiveId}.pdf`);
      } else {
        await activeMutation.mutateAsync();
      }
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleShareSend = (email: string) => {
    shareReportMutation.mutate({ reportSlug: CARD_SLUG[cardId], recipientEmail: email });
  };

  return (
    <>
      <motion.div
        className="ivm-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className={`ivm-panel ${isMaximized ? 'ivm-panel--maximized' : ''}`}
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
        >

          {/* ── Header ── */}
          <div className="ivm-header">
            <div className="ivm-header__text">
              <h2 className="ivm-header__title">{meta.title}</h2>
              <p className="ivm-header__subtitle">{meta.subtitle}</p>
            </div>
            <div className="ivm-header__actions">
              {/* Share — opens ShareInsightsModal */}
              <button
                className="ivm-icon-btn ivm-icon-btn--circle"
                onClick={() => setShareOpen(true)}
                title="Share"
              >
                <SpIcon name="sp-Communication-Share_Android" size={20} />
              </button>

              {/* Maximize / Restore */}
              <button
                className="ivm-icon-btn ivm-icon-btn--circle"
                onClick={() => setIsMaximized((prev) => !prev)}
                title={isMaximized ? 'Restore' : 'Maximize'}
              >
                {isMaximized ? <TbMinimize size={20} /> : <TbMaximize size={20} />}
              </button>

              {/* Close */}
              <button
                className="ivm-icon-btn ivm-icon-btn--ghost"
                onClick={onClose}
                title="Close"
              >
                <SpIcon name="sp-Menu-Close_MD" size={20} />
              </button>
            </div>
          </div>

          {/* ── Content area ── */}
          <div className={`ivm-body ${cardId !== 'verbatim' ? 'ivm-body--pdf' : ''}`}>
            {cardId === 'verbatim' ? (
              verbatimLoading ? (
                <div className="ivm-loading">
                  <TbLoader className="ivm-loading__spinner" size={32} />
                  <p className="ivm-loading__text">Loading transcript…</p>
                </div>
              ) : verbatimPreviewData ? (
                <VerbatimContent data={verbatimPreviewData} />
              ) : (
                <div className="ivm-empty">
                  <p>No verbatim data available yet.</p>
                </div>
              )
            ) : previewLoading ? (
              <div className="ivm-loading">
                <TbLoader className="ivm-loading__spinner" size={32} />
                <p className="ivm-loading__text">Loading report…</p>
              </div>
            ) : previewError ? (
              <div className="ivm-empty ivm-empty--error">
                <TbAlertCircle size={28} />
                <p>{previewError}</p>
              </div>
            ) : previewUrl ? (
              <div className="ivm-pdf-wrapper">
                <iframe
                  src={previewUrl}
                  title={meta.title}
                  className="ivm-pdf-frame"
                />
              </div>
            ) : (
              <div className="ivm-empty">
                <p>No report available yet.</p>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="ivm-footer">
            <button
              className="ivm-download-btn"
              onClick={handleDownload}
              disabled={activeMutation.isPending}
            >
              {activeMutation.isPending ? (
                <>
                  <TbLoader className="ivm-download-btn__spinner" size={16} />
                  Downloading…
                </>
              ) : (
                <>
                  <SpIcon name="sp-File-File_Download" size={16} />
                  Download PDF
                </>
              )}
            </button>
          </div>

        </motion.div>
      </motion.div>

      {/* ── Share Insights Modal — rendered on top ── */}
      <AnimatePresence>
        {shareOpen && (
          <ShareInsightsModal
            onClose={() => setShareOpen(false)}
            onShare={handleShareSend}
          />
        )}
      </AnimatePresence>
    </>
  );
};

// ── VerbatimContent ───────────────────────────────────────────────────────────

interface VerbatimSection {
  section: string;
  questions: Array<{
    question: string;
    response_count?: number;
    answers?: Array<{
      persona_name?: string;
      persona_occupation?: string;
      answer?: string;
    }>;
  }>;
}

interface VerbatimData {
  data?: {
    sections?: VerbatimSection[];
    total_interviews?: number;
  };
}

const VerbatimContent: React.FC<{ data: unknown }> = ({ data }) => {
  const typed = data as VerbatimData;
  const sections = typed?.data?.sections ?? [];

  if (sections.length === 0) {
    return (
      <div className="ivm-empty">
        <p>No transcript sections available yet.</p>
      </div>
    );
  }

  return (
    <div className="ivm-verbatim">
      {sections.map((section, si) => (
        <div key={si} className="ivm-verbatim__section">
          <h3 className="ivm-verbatim__section-title">{section.section}</h3>
          {section.questions.map((q, qi) => (
            <div key={qi} className="ivm-verbatim__question">
              <p className="ivm-verbatim__question-text">
                <span className="ivm-verbatim__q-label">Q{qi + 1}.</span> {q.question}
              </p>
              {q.answers && q.answers.length > 0 && (
                <div className="ivm-verbatim__answers">
                  {q.answers.map((ans, ai) => (
                    <div key={ai} className="ivm-verbatim__answer">
                      <span className="ivm-verbatim__persona-name">
                        {ans.persona_name ?? 'Persona'}{ans.persona_occupation ? ` · ${ans.persona_occupation}` : ''}
                      </span>
                      <p className="ivm-verbatim__answer-text">"{ans.answer}"</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default InsightViewerModal;