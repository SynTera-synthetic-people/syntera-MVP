import React from 'react';
import '../DataPlayground.css';

const LabelledData: React.FC = () => (
  <div className="dp-content-area">
    <div className="dp-content-scroll">
      <div className="dp-placeholder">
        <div className="dp-placeholder-icon">📋</div>
        <p className="dp-placeholder-text">Labelled data view will appear here</p>
      </div>
    </div>
  </div>
);

export default LabelledData;