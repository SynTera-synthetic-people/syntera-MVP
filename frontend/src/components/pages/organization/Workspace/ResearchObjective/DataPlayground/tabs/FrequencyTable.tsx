import React, { useRef, useState } from 'react';
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

// The mime type used for the drag payload — a variable id being dragged
// either from the "All Variables" source list, or from within the
// "Selected Variables" list itself (for reordering).
const DND_MIME = 'application/x-dp-variable';

// ── Props ─────────────────────────────────────────────────────────────────────

interface FrequencyTableProps {
  allVariables: Variable[];
  selectedVars: Variable[];
  hasResults: boolean;
  onVarToggle: (variable: Variable) => void;
  onVarAdd: (variable: Variable) => void;
  onVarRemove: (varId: string) => void;
  onClearAll: () => void;
  onSelectAll: () => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onReorder: (from: number, to: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const FrequencyTable: React.FC<FrequencyTableProps> = ({
  allVariables,
  selectedVars,
  hasResults,
  onVarToggle,
  onVarAdd,
  onVarRemove,
  onClearAll,
  onSelectAll,
  onMoveUp,
  onMoveDown,
  onReorder,
}) => {
  const selectedIds = new Set(selectedVars.map((v) => v.id));

  // Track which pill in the selected panel is focused for up/down.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggingFromSelected = useRef<number | null>(null);

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

  // ── Drag & drop: source list → selected list ────────────────────────────

  const handleSourceDragStart = (e: React.DragEvent, variable: Variable) => {
    e.dataTransfer.setData(DND_MIME, variable.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDropZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropZoneActive(true);
  };

  const handleDropZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropZoneActive(false);
    draggingFromSelected.current = null;
    const varId = e.dataTransfer.getData(DND_MIME);
    const variable = allVariables.find((v) => v.id === varId);
    if (variable) onVarAdd(variable);
  };

  // ── Drag & drop: reordering inside the selected list ────────────────────

  const handleSelectedDragStart = (e: React.DragEvent, index: number) => {
    draggingFromSelected.current = index;
    e.dataTransfer.setData(DND_MIME, selectedVars[index]!.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleSelectedDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggingFromSelected.current != null ? 'move' : 'copy';
    setDragOverIndex(index);
  };

  const handleSelectedDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIndex(null);
    setDropZoneActive(false);

    if (draggingFromSelected.current != null) {
      onReorder(draggingFromSelected.current, index);
      draggingFromSelected.current = null;
      return;
    }

    // Dropped a brand-new variable from the source list at a specific slot.
    const varId = e.dataTransfer.getData(DND_MIME);
    const variable = allVariables.find((v) => v.id === varId);
    if (variable) onVarAdd(variable);
  };

  const handleSelectedDragEnd = () => {
    draggingFromSelected.current = null;
    setDragOverIndex(null);
    setDropZoneActive(false);
  };

  return (
    <>
      {/* Full-bleed "zone" — recessed dark background spanning the whole
          tab body. The variable panels AND the results content area both
          sit on top of it, per Figma. */}
      <div className="dp-zone-body">
        {/* All Variables panel — click or drag to move into Selected Variables */}
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
                variant="source"
                added={selectedIds.has(v.id)}
                onClick={onVarToggle}
                draggable={!selectedIds.has(v.id)}
                onDragStart={handleSourceDragStart}
              />
            ))}
          </div>
        </div>

        {/* Selected Variables panel — also acts as a drop target */}
        {selectedVars.length === 0 ? (
          <div
            className={`dp-panel dp-add-variable-zone${dropZoneActive ? ' dp-add-variable-zone--active' : ''}`}
            style={{ width: 190 }}
            onDragOver={handleDropZoneDragOver}
            onDragLeave={() => setDropZoneActive(false)}
            onDrop={handleDropZoneDrop}
          >
            <svg className="dp-add-variable-icon" width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2.5 20.5 7.5V16.5L12 21.5 3.5 16.5V7.5Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path d="M12 8V16M8 12H16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <div className="dp-add-variable-title">Add Variable</div>
            <div className="dp-add-variable-subtitle">
              Select or drag and drop variables from left panel
            </div>
          </div>
        ) : (
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
            <div
              className="dp-var-list"
              onDragOver={handleDropZoneDragOver}
              onDrop={handleDropZoneDrop}
            >
              {selectedVars.map((v, i) => (
                <div
                  key={v.id}
                  className={dragOverIndex === i ? 'dp-pill--drag-over' : undefined}
                  style={{ borderRadius: 6 }}
                >
                  <VariablePill
                    variable={v}
                    variant="selected"
                    focused={focusedIndex === i}
                    arrowDirection="left"
                    onClick={() => {
                      setFocusedIndex(i);
                      onVarRemove(v.id);
                    }}
                    draggable
                    onDragStart={(e) => handleSelectedDragStart(e, i)}
                    onDragOver={handleSelectedDragOver(i)}
                    onDrop={handleSelectedDrop(i)}
                    onDragEnd={handleSelectedDragEnd}
                  />
                </div>
              ))}
            </div>
            <div className="dp-updown-bar">
              <span className="dp-updown-label">Up/Down</span>
              <button
                className="dp-updown-btn dp-updown-btn--accent"
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
        )}

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
      </div>
    </>
  );
};

export default FrequencyTable;