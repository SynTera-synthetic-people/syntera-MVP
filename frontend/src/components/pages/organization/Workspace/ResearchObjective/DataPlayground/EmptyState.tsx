import React from 'react';
import './DataPlayground.css';

interface EmptyStateProps {
  title?: string | undefined;
  subtitle?: string | undefined;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Data will appear here',
  subtitle,
}) => {
  return (
    <div className="dp-empty-state">
      <div className="dp-empty-icon">🗄</div>
      <h3 className="dp-empty-title">{title}</h3>
      {/* No placeholder default: an empty state with nothing useful to add
          should show the title alone rather than filler copy. */}
      {subtitle && <p className="dp-empty-subtitle">{subtitle}</p>}
    </div>
  );
};

export default EmptyState;