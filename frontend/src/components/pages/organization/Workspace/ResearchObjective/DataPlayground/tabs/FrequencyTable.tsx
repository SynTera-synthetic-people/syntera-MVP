import React from 'react';
import type { Variable } from '../Index';
import VariablePill from '../VariablePill';
import EmptyState from '../EmptyState';
import '../DataPlayground.css';

// ── Sample frequency data ─────────────────────────────────────────────────────

interface FreqRow {
  label: string;
  frequency: number;
  percent: number;
  validPercent: number;
  cumulativePercent: number;
}

interface FreqResult {
  varId: string;
  title: string;
  rows: FreqRow[];
}

const FREQ_RESULTS: Record<string, FreqResult> = {
  S1: {
    varId: 'S1',
    title: 'S1_In which country are you located?',
    rows: [
      { label: 'United States', frequency: 35, percent: 100.0, validPercent: 100.0, cumulativePercent: 100.0 },
    ],
  },
  S2: {
    varId: 'S2',
    title: 'S2_How many employees work for your firm/organization worldwide?',
    rows: [
      { label: '1,000 to 4,999 employees', frequency: 5,  percent: 14.3, validPercent: 14.3, cumulativePercent: 14.3 },
      { label: '20,000 or more employees', frequency: 4,  percent: 11.4, validPercent: 11.4, cumulativePercent: 25.7 },
      { label: '5,000 to 19,999 employees', frequency: 22, percent: 62.9, validPercent: 62.9, cumulativePercent: 88.6 },
      { label: '500 to 999 employees',      frequency: 4,  percent: 11.4, validPercent: 11.4, cumulativePercent: 100.0 },
    ],
  },
  Q1_1: {
    varId: 'Q1_1',
    title: 'Q1_1_Improve creative velocity across channels and formats',
    rows: [
      { label: 'Not on our agenda', frequency: 2,  percent: 5.7,  validPercent: 5.7,  cumulativePercent: 5.7 },
      { label: 'Low priority',      frequency: 5,  percent: 14.3, validPercent: 14.3, cumulativePercent: 20.0 },
      { label: 'High priority',     frequency: 12, percent: 34.3, validPercent: 34.3, cumulativePercent: 54.3 },
      { label: 'Critical priority', frequency: 16, percent: 45.7, validPercent: 45.7, cumulativePercent: 100.0 },
    ],
  },
};

function getFallbackResult(varId: string): FreqResult {
  return {
    varId,
    title: `${varId} — variable question text`,
    rows: [
      { label: 'Response option 1', frequency: 20, percent: 57.1, validPercent: 57.1, cumulativePercent: 57.1 },
      { label: 'Response option 2', frequency: 10, percent: 28.6, validPercent: 28.6, cumulativePercent: 85.7 },
      { label: 'Response option 3', frequency: 5,  percent: 14.3, validPercent: 14.3, cumulativePercent: 100.0 },
    ],
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface FrequencyTableProps {
  allVariables: Variable[];
  selectedVars: Variable[];
  hasResults: boolean;
  onVarToggle: (variable: Variable) => void;
  onVarRemove: (varId: string) => void;
  onClearAll: () => void;
  onSelectAll: () => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const FrequencyTable: React.FC<FrequencyTableProps> = ({
  allVariables,
  selectedVars,
  hasResults,
  onVarToggle,
  onVarRemove,
  onClearAll,
  onSelectAll,
  onMoveUp,
  onMoveDown,
}) => {
  const selectedIds = new Set(selectedVars.map((v) => v.id));

  // Track which pill in the selected panel is focused for up/down
  const [focusedIndex, setFocusedIndex] = React.useState<number | null>(null);

  const handleMoveUp = () => {
    const idx = focusedIndex ?? selectedVars.length - 1;
    if (idx > 0) {
      onMoveUp(idx);
      setFocusedIndex(idx - 1);
    }
  };

  const handleMoveDown = () => {
    const idx = focusedIndex ?? 0;
    if (idx < selectedVars.length - 1) {
      onMoveDown(idx);
      setFocusedIndex(idx + 1);
    }
  };

  return (
    <>
      {/* All Variables panel — single-select: click toggles in/out */}
      <div className="dp-panel" style={{ width: 190 }}>
        <div className="dp-panel-header">
          <span className="dp-panel-title">All Variables</span>
          <button
            className="dp-panel-arrow-btn"
            onClick={onSelectAll}
            title="Select all variables"
            aria-label="Select all variables"
          >
            →
          </button>
        </div>
        <div className="dp-var-list">
          {allVariables.map((v) => (
            <VariablePill
              key={v.id}
              variable={v}
              selected={selectedIds.has(v.id)}
              onClick={onVarToggle}
            />
          ))}
        </div>
      </div>

      {/* Selected Variables panel */}
      <div className="dp-panel" style={{ width: 190 }}>
        <div className="dp-panel-header">
          <span className="dp-panel-title">Selected Variables</span>
          <button
            className="dp-panel-arrow-btn"
            onClick={onClearAll}
            title="Clear all selected"
            aria-label="Clear all selected variables"
          >
            ←
          </button>
        </div>
        <div className="dp-var-list">
          {selectedVars.length === 0 ? (
            <p className="dp-panel-empty-hint">
              Select or drag variables from left panel
            </p>
          ) : (
            selectedVars.map((v, i) => (
              <button
                key={v.id}
                className={`dp-pill dp-pill--selected${focusedIndex === i ? ' dp-pill--focused' : ''}`}
                onClick={() => {
                  setFocusedIndex(i);
                  onVarRemove(v.id);
                }}
                onFocus={() => setFocusedIndex(i)}
                title={`Remove ${v.label}`}
              >
                <span className="dp-pill-arrow">←</span>
                <span className="dp-pill-label">{v.label}</span>
              </button>
            ))
          )}
        </div>
        <div className="dp-updown-bar">
          <span className="dp-updown-label">Up/Down</span>
          <button
            className="dp-updown-btn"
            onClick={handleMoveDown}
            disabled={selectedVars.length < 2}
            title="Move selected item down"
            aria-label="Move down"
          >
            ↓
          </button>
          <button
            className="dp-updown-btn"
            onClick={handleMoveUp}
            disabled={selectedVars.length < 2}
            title="Move selected item up"
            aria-label="Move up"
          >
            ↑
          </button>
        </div>
      </div>

      {/* Results content area */}
      <div className="dp-content-area">
        <div className="dp-content-scroll">
          {!hasResults || selectedVars.length === 0 ? (
            <EmptyState />
          ) : (
            selectedVars.map((v) => {
              const result = FREQ_RESULTS[v.id] ?? getFallbackResult(v.id);
              return (
                <div key={v.id} className="dp-freq-block">
                  <div className="dp-freq-block-title">{result.title}</div>
                  <table className="dp-freq-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th></th>
                        <th>Frequency</th>
                        <th>Percent</th>
                        <th>Valid Percent</th>
                        <th>Cumulative Percent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, idx) => (
                        <tr key={idx}>
                          <td>Valid</td>
                          <td>{row.label}</td>
                          <td>{row.frequency}</td>
                          <td>{row.percent.toFixed(1)}</td>
                          <td>{row.validPercent.toFixed(1)}</td>
                          <td>{row.cumulativePercent.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};

export default FrequencyTable;