import React from 'react';
import { motion } from 'framer-motion';
import { TbLoader } from 'react-icons/tb';
import SpIcon from '../../../../../SPIcon';
import './InsightViewModalQuant.css';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ViewableCardId = 'raw' | 'decision' | 'behaviour';

interface InsightViewerModalProps {
  cardId: ViewableCardId;
  onClose: () => void;
  onDownload: () => void;
  isDownloading: boolean;
}

// ── Meta per card ─────────────────────────────────────────────────────────────

const VIEWER_META: Record<ViewableCardId, { title: string; subtitle: string; note: string }> = {
  raw: {
    title: 'Raw Data Shell',
    subtitle: 'Structured response data, ready for analysis, export, and validation.',
    note: 'Your raw data report is ready. Click the download button below to save it.',
  },
  decision: {
    title: 'Decision Intelligence',
    subtitle: 'How your personas make decisions and prioritize.',
    note: 'Your report is ready. Click the download button below to save it as a PDF.',
  },
  behaviour: {
    title: 'Behaviour Archaeology',
    subtitle: 'Deep psychological patterns behind the choices.',
    note: 'Your report is ready. Click the download button below to save it as a PDF.',
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

const InsightViewerModalQuant: React.FC<InsightViewerModalProps> = ({
  cardId,
  onClose,
  onDownload,
  isDownloading,
}) => {
  const meta = VIEWER_META[cardId];

  return (
    <motion.div
      className="qivm-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="qivm-panel"
        initial={{ opacity: 0, scale: 0.97, y: 24 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{   opacity: 0, scale: 0.97,  y: 24 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="qivm-header">
          <div className="qivm-header__text">
            <h2 className="qivm-header__title">{meta.title}</h2>
            <p className="qivm-header__subtitle">{meta.subtitle}</p>
          </div>
          <div className="qivm-header__actions">
            <button
              className="qivm-icon-btn qivm-icon-btn--ghost"
              onClick={onClose}
              aria-label="Close"
            >
              <SpIcon name="sp-Menu-Close_MD" size={18} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="qivm-body">
          <div className="qivm-placeholder">
            <p className="qivm-placeholder__label">{meta.title}</p>
            <p className="qivm-placeholder__sub">{meta.subtitle}</p>
            <p className="qivm-placeholder__note">{meta.note}</p>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="qivm-footer">
          <button
            className="qivm-download-btn"
            onClick={onDownload}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <>
                <TbLoader className="qivm-download-btn__spinner" size={16} />
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

export default InsightViewerModalQuant;