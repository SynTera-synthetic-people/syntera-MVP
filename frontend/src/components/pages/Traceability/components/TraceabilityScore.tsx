import React from 'react';
import CenteredScoreCard from './CenteredScoreCard';

interface BreakdownItem {
  label: string;
  value: number;
  weight: number;
}

interface TraceabilityScoreProps {
  score?: number;
  label?: string;
  percentage?: number;
  breakdown?: BreakdownItem[];
  title?: string;
  description?: string;
}

const TraceabilityScore: React.FC<TraceabilityScoreProps> = ({
  percentage = 0,
  description,
}) => {
  return (
    <CenteredScoreCard
      score={percentage}
      {...(description != null ? { description } : {})}
    />
  );
};

export default TraceabilityScore;