import React from 'react';
import '../DataPlayground.css';

const InsightsSummary: React.FC = () => (
  <div className="dp-content-area">
    <div className="dp-content-scroll">
      <div className="dp-placeholder">
        <div className="dp-placeholder-icon">💡</div>
        <p className="dp-placeholder-text">AI-generated insights will appear here</p>
      </div>
    </div>
  </div>
);

export default InsightsSummary;