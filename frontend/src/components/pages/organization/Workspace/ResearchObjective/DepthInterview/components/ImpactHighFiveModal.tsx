import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TbX, TbLoader } from 'react-icons/tb';
import './ImpactHighFiveModal.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImpactHighFiveModalProps {
  onSubmit: () => Promise<void>;
  onClose: () => void;
}

type Q1Answer = 'direct' | 'partial' | 'pending' | null;
type Q2Answer = 'skip_human' | 'no_skip' | null;

// ── Component ─────────────────────────────────────────────────────────────────

const ImpactHighFiveModal: React.FC<ImpactHighFiveModalProps> = ({ onSubmit, onClose }) => {
  const [q1, setQ1] = useState<Q1Answer>(null);
  const [q2, setQ2] = useState<Q2Answer>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const canSubmit = q1 !== null && q2 !== null;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="ihf-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="ihf-modal"
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        exit={{   opacity: 0, scale: 0.95,  y: 16 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Close */}
        <button className="ihf-close" onClick={onClose} aria-label="Close">
          <TbX size={18} />
        </button>

        {/* Title */}
        <h2 className="ihf-title">Impact High-Five</h2>
        <p className="ihf-subtitle">
          Quick 20-sec fist bump to show how Synthetic-People powered your wins!
        </p>

        {/* Q1 */}
        <div className="ihf-question">
          <p className="ihf-question__label">
            <span className="ihf-question__num">Q.1</span>
            Did this exploration influenced a real decision?
          </p>
          <div className="ihf-options">
            {[
              { value: 'direct',  label: 'Yes - It directly shaped a decision' },
              { value: 'partial', label: 'Partly - It was one of serval inputs' },
              { value: 'pending', label: 'Not yet - Decision pending' },
            ].map((opt) => (
              <button
                key={opt.value}
                className={`ihf-option ${q1 === opt.value ? 'ihf-option--selected' : ''}`}
                onClick={() => setQ1(opt.value as Q1Answer)}
              >
                <span className={`ihf-option__radio ${q1 === opt.value ? 'ihf-option__radio--selected' : ''}`} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Q2 */}
        <div className="ihf-question">
          <p className="ihf-question__label">
            <span className="ihf-question__num">Q.2</span>
            After this exploration, are you planning to skip a full human study?
          </p>
          <div className="ihf-options">
            {[
              { value: 'skip_human', label: 'Yes - this was enough confidence' },
              { value: 'no_skip',    label: 'No - still planning human study' },
            ].map((opt) => (
              <button
                key={opt.value}
                className={`ihf-option ${q2 === opt.value ? 'ihf-option--selected' : ''}`}
                onClick={() => setQ2(opt.value as Q2Answer)}
              >
                <span className={`ihf-option__radio ${q2 === opt.value ? 'ihf-option__radio--selected' : ''}`} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          className="ihf-submit"
          disabled={!canSubmit || submitting}
          onClick={handleSubmit}
        >
          {submitting ? (
            <>
              <TbLoader className="ihf-submit__spinner" size={16} />
              Submitting…
            </>
          ) : (
            'Submit'
          )}
        </button>

      </motion.div>
    </motion.div>
  );
};

export default ImpactHighFiveModal;