import React from 'react';
import type { DownloadOptions } from './Index';
import './DataPlayground.css';

interface DownloadModalProps {
  options: DownloadOptions;
  onChange: (opts: DownloadOptions) => void;
  onClose: () => void;
  onDownload: () => void;
}

const DownloadModal: React.FC<DownloadModalProps> = ({
  options,
  onChange,
  onClose,
  onDownload,
}) => {
  const set = <K extends keyof DownloadOptions>(key: K, value: DownloadOptions[K]) => {
    onChange({ ...options, [key]: value });
  };

  return (
    <div className="dp-dl-overlay" onClick={onClose}>
      <div className="dp-dl-modal" onClick={(e) => e.stopPropagation()}>
        <button className="dp-dl-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <h2 className="dp-dl-title">Download Data</h2>
        <p className="dp-dl-subtitle">Content goes here...</p>

        {/* Worksheet layout */}
        <div className="dp-dl-section">
          <div className="dp-dl-section-label">Worksheet layout</div>
          <label className="dp-dl-radio-row">
            <input
              type="radio"
              name="dl-sheets"
              checked={options.sheets === 'all'}
              onChange={() => set('sheets', 'all')}
            />
            <label>All tables in one worksheet</label>
          </label>
          <label className="dp-dl-radio-row">
            <input
              type="radio"
              name="dl-sheets"
              checked={options.sheets === 'one'}
              onChange={() => set('sheets', 'one')}
            />
            <label>One table per sheet</label>
          </label>
        </div>

        {/* Percentage direction */}
        <div className="dp-dl-section">
          <div className="dp-dl-section-label">Percentage direction</div>
          <div className="dp-dl-radio-inline">
            <label className="dp-dl-radio-row">
              <input
                type="radio"
                name="dl-dir"
                checked={options.direction === 'col'}
                onChange={() => set('direction', 'col')}
              />
              <label>Col %</label>
            </label>
            <label className="dp-dl-radio-row">
              <input
                type="radio"
                name="dl-dir"
                checked={options.direction === 'row'}
                onChange={() => set('direction', 'row')}
              />
              <label>Row %</label>
            </label>
          </div>
        </div>

        {/* Cell display */}
        <div className="dp-dl-section">
          <div className="dp-dl-section-label">Cell display</div>
          <label className="dp-dl-radio-row">
            <input
              type="radio"
              name="dl-display"
              checked={options.display === 'both'}
              onChange={() => set('display', 'both')}
            />
            <label>Count + %</label>
          </label>
          <label className="dp-dl-radio-row">
            <input
              type="radio"
              name="dl-display"
              checked={options.display === 'pct'}
              onChange={() => set('display', 'pct')}
            />
            <label>% only</label>
          </label>
          <label className="dp-dl-radio-row">
            <input
              type="radio"
              name="dl-display"
              checked={options.display === 'count'}
              onChange={() => set('display', 'count')}
            />
            <label>Count only</label>
          </label>
        </div>

        {/* Table of content */}
        <div className="dp-dl-section">
          <div className="dp-dl-section-label">Additional options</div>
          <label className="dp-dl-check-row">
            <input
              type="checkbox"
              checked={options.toc}
              onChange={(e) => set('toc', e.target.checked)}
            />
            <label>Add table of content</label>
          </label>
        </div>

        <div className="dp-dl-footer">
          <button className="dp-dl-cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="dp-dl-download-btn" onClick={onDownload}>
            Download
          </button>
        </div>
      </div>
    </div>
  );
};

export default DownloadModal;