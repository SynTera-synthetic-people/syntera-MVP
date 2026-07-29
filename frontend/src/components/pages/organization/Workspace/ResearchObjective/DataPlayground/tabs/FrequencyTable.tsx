import React, { useRef, useState } from 'react';
import type { Variable } from '../Index';
import type { FrequencyResult } from '../../../../../../../services/dataPlaygroundService';
import VariablePill from '../VariablePill';
import EmptyState from '../EmptyState';
import '../DataPlayground.css';

// The mime type used for the drag payload — a variable id being dragged
// either from the "All Variables" source list, or from within the
// "Selected Variables" list itself (for reordering).
const DND_MIME = 'application/x-dp-variable';

// ── Props ─────────────────────────────────────────────────────────────────────

interface FrequencyTableProps {
  allVariables: Variable[];
  selectedVars: Variable[];
  hasResults: boolean;
  results: FrequencyResult[] | null;
  isRunning: boolean;
  hasDataset: boolean;
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
  results,
  isRunning,
  hasDataset,
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
            {isRunning ? (
              <EmptyState title="Running frequency table..." subtitle="This will only take a moment" />
            ) : !hasResults || !results || results.length === 0 ? (
              <EmptyState
                title={hasDataset ? undefined : 'No dataset yet'}
                subtitle={hasDataset ? undefined : 'Upload a CSV or XLSX file to get started'}
              />
            ) : (
              results.map((result) => (
                <div key={result.variable} className="dp-freq-block">
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
                      {result.rows.length === 0 ? (
                        <tr>
                          <td colSpan={6}>No responses recorded for this variable.</td>
                        </tr>
                      ) : (
                        result.rows.map((row, idx) => (
                          <tr key={idx}>
                            <td>Valid</td>
                            <td>{row.label}</td>
                            <td>{row.frequency}</td>
                            <td>{row.percent.toFixed(1)}</td>
                            <td>{row.valid_percent.toFixed(1)}</td>
                            <td>{row.cumulative_percent.toFixed(1)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default FrequencyTable;