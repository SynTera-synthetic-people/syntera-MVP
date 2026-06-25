import React from 'react';
import './DataPlayground.css';

interface EmptyStateProps {
  title?: string;
  subtitle?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Data will appear here',
  subtitle = 'Content goes here',
}) => {
  return (
    <div className="dp-empty-state">
      <div className="dp-empty-icon">🗄</div>
      <h3 className="dp-empty-title">{title}</h3>
      <p className="dp-empty-subtitle">{subtitle}</p>
    </div>
  );
};

export default EmptyState;