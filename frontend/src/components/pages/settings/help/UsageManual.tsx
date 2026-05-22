import React from 'react';
import { TbFileDownload } from 'react-icons/tb';
import './UsageManualStyle.css';

// ── Component ─────────────────────────────────────────────────────────────────

const UsageManual: React.FC = () => {
  const handleDownload = () => {
    // TODO: wire to actual PDF URL / API endpoint
    const link = document.createElement('a');
    link.href = '/assets/usage-manual.pdf';
    link.download = 'Synthetic-People-Usage-Manual.pdf';
    link.click();
  };

  return (
    <div className="um-page">
      <h3 className="um-title">What is Usage Manual?</h3>
      <p className="um-description">
        A practical guide to using Synthetic People from building explorations to interpreting
        behavioural insights. Designed to help you move faster, ask better questions, and get
        more reliable outputs from every study.
      </p>
      <button className="um-download-btn" onClick={handleDownload}>
        <TbFileDownload size={17} />
        Download Manual
      </button>
    </div>
  );
};

export default UsageManual;