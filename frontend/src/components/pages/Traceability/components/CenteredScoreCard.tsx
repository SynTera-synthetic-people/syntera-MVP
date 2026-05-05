import React from 'react';
import '../Traceability.css';

interface CenteredScoreCardProps {
  score: number;
  description?: string | undefined;
}

const getScoreLabel = (score: number): string => {
  if (score > 80) return 'Excellent';
  if (score > 60) return 'Strong';
  if (score > 40) return 'Good';
  return 'Needs More Signals';
};

const getScoreBadgeClass = (score: number): string => {
  if (score > 80) return 'trc-score-badge--excellent';
  if (score > 60) return 'trc-score-badge--strong';
  if (score > 40) return 'trc-score-badge--good';
  return 'trc-score-badge--poor';
};

// Display score — show integer if whole number, otherwise 2 decimal places
const formatScore = (score: number): string =>
  Number.isInteger(score) ? `${score}%` : `${score.toFixed(2)}%`;

const CenteredScoreCard: React.FC<CenteredScoreCardProps> = ({ score, description }) => {
  return (
    <div className="trc-centered-score">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 10, marginBottom: 4 }}>
        <span className="trc-centered-score-number">{formatScore(score)}</span>
        <span className={`trc-score-badge ${getScoreBadgeClass(score)}`}>
          {getScoreLabel(score)}
        </span>
      </div>
      <p className="trc-centered-score-sublabel">Calibration Score</p>
      <div className="trc-centered-score-bar-track">
        <div
          className="trc-centered-score-bar-fill"
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      {description != null && (
        <p className="trc-centered-score-desc">{description}</p>
      )}
    </div>
  );
};

export default CenteredScoreCard;