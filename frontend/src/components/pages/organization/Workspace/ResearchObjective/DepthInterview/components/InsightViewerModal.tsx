import React from 'react';
import { motion } from 'framer-motion';
import { TbX, TbDownload, TbLoader, TbShare } from 'react-icons/tb';
import SpIcon from '../../../../../../SPIcon';
import './InsightViewerModal.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type InsightCardId = 'verbatim' | 'decision' | 'behaviour';

interface InsightViewerModalProps {
  cardId: InsightCardId;
  workspaceId: string;
  objectiveId: string;
  verbatimPreviewData: unknown;
  verbatimLoading: boolean;
  exportAllMutation: {
    mutateAsync: () => Promise<unknown>;
    isPending: boolean;
  };
  onClose: () => void;
}

// ── Card metadata map ─────────────────────────────────────────────────────────

const CARD_META: Record<InsightCardId, { title: string; subtitle: string }> = {
  verbatim: {
    title: 'Interview Verbatim',
    subtitle: 'What people said — in their own words',
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

const InsightViewerModal: React.FC<InsightViewerModalProps> = ({
  cardId,
  workspaceId,
  objectiveId,
  verbatimPreviewData,
  verbatimLoading,
  exportAllMutation,
  onClose,
}) => {
  const meta = CARD_META[cardId];

  const handleDownload = async () => {
    if (cardId === 'verbatim') {
      try {
        await exportAllMutation.mutateAsync();
      } catch (err) {
        console.error('Download failed:', err);
      }
    }
    // Decision Intelligence & Behaviour Archaeology download hooks TBD
  };

  const handleShare = () => {
    // Share functionality — TBD with backend shareable link endpoint
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href).catch(console.error);
    }
  };

  return (
    <motion.div
      className="ivm-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="ivm-panel"
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
            {/* Share (circular bordered) */}
            <button
              className="ivm-icon-btn ivm-icon-btn--circle"
              onClick={handleShare}
              title="Share"
            >
              <SpIcon name="sp-Communication-Share_Android" size={20} />
            </button>

            {/* Close (no border) */}
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
        <div className="ivm-body">
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
          ) : (
            // Decision Intelligence & Behaviour Archaeology — placeholder until
            // backend endpoints are wired up. Content renders here once the
            // generate mutation returns document data.
            <div className="ivm-placeholder">
              <p className="ivm-placeholder__label">
                {meta.title}
              </p>
              <p className="ivm-placeholder__sub">
                {meta.subtitle}
              </p>
              <p className="ivm-placeholder__note">
                [Document content would render here as embedded PDF or HTML preview]
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="ivm-footer">
          <button
            className="ivm-download-btn"
            onClick={handleDownload}
            disabled={exportAllMutation.isPending}
          >
            {exportAllMutation.isPending ? (
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
  );
};

// ── VerbatimContent — renders useAllInterviewPreview data ─────────────────────

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