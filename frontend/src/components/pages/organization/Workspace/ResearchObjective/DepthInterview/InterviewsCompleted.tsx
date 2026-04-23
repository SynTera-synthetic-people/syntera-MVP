import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { TbX } from 'react-icons/tb';
import SpIcon from '../../../../../SPIcon';
import './InterviewsCompleted.css';

// ── Component ─────────────────────────────────────────────────────────────────

const InterviewsCompleted: React.FC = () => {
  const navigate = useNavigate();
  const { workspaceId, objectiveId } = useParams<{
    workspaceId: string;
    objectiveId: string;
  }>();

  const [showToast, setShowToast] = useState<boolean>(true);

  const handleGenerateInsights = () => {
    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/insights`
    );
  };

  return (
    <div className="ic-page">

      {/* ── "Interviews Completed" toast — top centre ── */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            className="ic-toast"
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,   scale: 1    }}
            exit={{   opacity: 0, y: -16,  scale: 0.95 }}
            transition={{ duration: 0.25 }}
          >
            <SpIcon name="sp-Warning-Circle_Check" size={20} className="ic-toast__icon" />
            <span className="ic-toast__text">Interviews Completed</span>
            <button
              className="ic-toast__close"
              onClick={() => setShowToast(false)}
              aria-label="Dismiss"
            >
              <TbX size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Centre card ── */}
      <motion.div
        className="ic-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0   }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        {/* Bar chart icon — matches Figma */}
        <div className="ic-card__icon">
          <SpIcon name="sp-Interface-Chart_Bar_Vertical_01" size={40} />
        </div>

        <h2 className="ic-card__title">From Interviews to Insights</h2>
        <p className="ic-card__subtitle">
          Transform raw conversations into decision-ready intelligence.
        </p>

        <button
          className="ic-card__cta"
          onClick={handleGenerateInsights}
        >
          <SpIcon name="sp-Other-Magic" size={18} className="ic-card__cta-icon" />
          Generate Insights
        </button>
      </motion.div>

    </div>
  );
};

export default InterviewsCompleted;