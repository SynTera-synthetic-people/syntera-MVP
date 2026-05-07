import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbX } from 'react-icons/tb';
import './ShareInsightModal.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShareInsightsModalProps {
  onClose: () => void;
  onShare?: (email: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const ShareInsightsModal: React.FC<ShareInsightsModalProps> = ({ onClose, onShare }) => {
  const [email, setEmail] = useState('');

  const isValidEmail = email.trim().length > 0 && email.includes('@');

  const handleShare = () => {
    if (!isValidEmail) return;
    onShare?.(email.trim());
    onClose();
  };

  return (
    <motion.div
      className="sim-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="sim-modal"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Close button ── */}
        <button className="sim-close" onClick={onClose} aria-label="Close">
          <TbX size={18} />
        </button>

        {/* ── Header ── */}
        <div className="sim-header">
          <h2 className="sim-title">Share Insights Across<br />Teams</h2>
          <p className="sim-subtitle">
            Align your team with insights that are clear, actionable,<br />
            and decision-ready
          </p>
        </div>

        {/* ── Body ── */}
        <div className="sim-body">
          <div className="sim-field">
            <label className="sim-label">
              Email Address <span className="sim-required">*</span>
            </label>
            <input
              className="sim-input"
              type="email"
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleShare(); }}
              autoFocus
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="sim-footer">
          <button className="sim-btn sim-btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`sim-btn sim-btn--share ${isValidEmail ? 'sim-btn--share-active' : ''}`}
            onClick={handleShare}
            disabled={!isValidEmail}
          >
            Share
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ShareInsightsModal;