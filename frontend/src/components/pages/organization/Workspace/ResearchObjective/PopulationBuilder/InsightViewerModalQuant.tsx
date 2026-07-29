import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { TbLoader, TbAlertCircle } from 'react-icons/tb';
import SpIcon from '../../../../../SPIcon';
import { downloadQuantDecisionIntelligence } from '../../../../../../services/quantitativeServices';
import './InsightViewModalQuant.css';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ViewableCardId = 'raw' | 'decision' | 'behaviour';

interface InsightViewerModalProps {
  cardId: ViewableCardId;
  workspaceId: string;
  explorationId: string;
  /**
   * Resolves the survey simulation ID needed to fetch reports — mirrors what
   * the parent already does before calling the download mutations
   * (ensureSurveySimulationId in InsightsGeneration.tsx).
   */
  getSimulationId: () => Promise<string>;
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

// ── Blob download helper (mirrors _triggerBlobDownload in useQuantitativeQueries.ts) ──

function triggerBlobDownload(blob: Blob, filename: string, mimeType = 'application/pdf'): void {
  const url = window.URL.createObjectURL(new Blob([blob], { type: mimeType }));
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

// ── Component ─────────────────────────────────────────────────────────────────

const InsightViewerModalQuant: React.FC<InsightViewerModalProps> = ({
  cardId,
  workspaceId,
  explorationId,
  getSimulationId,
  onClose,
  onDownload,
  isDownloading,
}) => {
  const meta = VIEWER_META[cardId];

  // ── Inline PDF preview state (Decision Intelligence only — Behaviour
  //    Archaeology is disabled in this flow and Raw Data Shell is structured
  //    JSON data, not a PDF) ────────────────────────────────────────────────
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    if (cardId !== 'decision') return;

    let cancelled = false;
    let objectUrl: string | null = null;

    const fetchPreview = async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      previewBlobRef.current = null;
      try {
        const simulationId = await getSimulationId();
        const blob = await downloadQuantDecisionIntelligence({
          workspaceId,
          explorationId,
          simulationId,
        });

        if (cancelled) return;
        previewBlobRef.current = blob;
        objectUrl = window.URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      } catch (err) {
        console.error('Failed to load decision intelligence preview:', err);
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
  }, [cardId, workspaceId, explorationId, getSimulationId]);

  const handleDownloadClick = () => {
    if (previewBlobRef.current) {
      // Reuse the blob we already fetched for the preview instead of
      // re-hitting the backend.
      triggerBlobDownload(previewBlobRef.current, `decision_intelligence_${explorationId}.pdf`);
    } else {
      onDownload();
    }
  };

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
        <div className={`qivm-body ${cardId === 'decision' ? 'qivm-body--pdf' : ''}`}>
          {cardId === 'decision' ? (
            previewLoading ? (
              <div className="qivm-loading">
                <TbLoader className="qivm-loading__spinner" size={32} />
                <p className="qivm-loading__text">Loading report…</p>
              </div>
            ) : previewError ? (
              <div className="qivm-empty qivm-empty--error">
                <TbAlertCircle size={28} />
                <p>{previewError}</p>
              </div>
            ) : previewUrl ? (
              <div className="qivm-pdf-wrapper">
                <iframe
                  src={previewUrl}
                  title={meta.title}
                  className="qivm-pdf-frame"
                />
              </div>
            ) : (
              <div className="qivm-empty">
                <p>No report available yet.</p>
              </div>
            )
          ) : (
            <div className="qivm-placeholder">
              <p className="qivm-placeholder__label">{meta.title}</p>
              <p className="qivm-placeholder__sub">{meta.subtitle}</p>
              <p className="qivm-placeholder__note">{meta.note}</p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="qivm-footer">
          <button
            className="qivm-download-btn"
            onClick={handleDownloadClick}
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