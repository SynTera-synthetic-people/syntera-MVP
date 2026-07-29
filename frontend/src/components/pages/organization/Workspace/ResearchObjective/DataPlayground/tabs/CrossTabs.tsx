import React, { useCallback, useEffect, useState } from 'react';
import type { Variable } from '../Index';
import type { CrosstabTable, CrosstabRow } from '../../../../../../../services/dataPlaygroundService';
import VariablePill from '../VariablePill';
import EmptyState from '../EmptyState';
import '../DataPlayground.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type WhereTarget = 'banner' | 'main';
type PercentMode = 'col' | 'row';

interface ValueModalState {
  variable: Variable;
  target: WhereTarget;
}

interface NettGroup {
  id: string;
  label: string;
  memberIds: string[];
  expanded: boolean;
}

interface TableState {
  optionOrder: string[];
  rowLabelOverrides: Record<string, string>;
  nettGroups: NettGroup[];
  buildingNettId: string | null;
  sigmaRemoved: boolean;
  meanEnabled: boolean;
  meanFactors: Record<string, number>;
}

function defaultTableState(rowLabels: string[]): TableState {
  return {
    optionOrder: rowLabels,
    rowLabelOverrides: {},
    nettGroups: [],
    buildingNettId: null,
    sigmaRemoved: false,
    meanEnabled: false,
    meanFactors: {},
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Default weighting factor for an option row when the user hasn't set one
 * explicitly — the row's real precode, or its position if it has none. */
function defaultFactor(row: CrosstabRow, index: number): number {
  return row.code ?? index + 1;
}

/** count/col%/row% for an aggregate row (NETT group or Sigma) built by
 * summing several real option rows, column by column. columnCount includes
 * the leading "Total" column. Total's row_pct mirrors its col_pct (matches
 * how the backend defines a regular row's Total cell — it's not one of the
 * mutually-exclusive banner segments, so a self-referential 100% wouldn't
 * mean anything useful there). */
function aggregateCells(
  memberRows: CrosstabRow[],
  baseByColumn: number[],
): { count: number; col_pct: number; row_pct: number }[] {
  const columnCount = baseByColumn.length;
  const counts = Array.from({ length: columnCount }, (_, colIdx) =>
    memberRows.reduce((sum, r) => sum + (r.cells[colIdx]?.count ?? 0), 0)
  );
  const rowTotal = counts.slice(1).reduce((a, b) => a + b, 0);
  return counts.map((count, colIdx) => {
    const colBase = baseByColumn[colIdx] ?? 0;
    const colPct = colBase ? (count / colBase) * 100 : 0;
    const rowPct = colIdx === 0 ? colPct : (rowTotal ? (count / rowTotal) * 100 : 0);
    return { count, col_pct: round1(colPct), row_pct: round1(rowPct) };
  });
}

function weightedMeanPerColumn(
  rows: CrosstabRow[],
  factors: Record<string, number>,
  columnCount: number,
): number[] {
  return Array.from({ length: columnCount }, (_, colIdx) => {
    let weighted = 0;
    let totalCount = 0;
    rows.forEach((row, idx) => {
      const count = row.cells[colIdx]?.count ?? 0;
      const factor = factors[row.label] ?? defaultFactor(row, idx);
      weighted += factor * count;
      totalCount += count;
    });
    return totalCount ? weighted / totalCount : 0;
  });
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CrossTabsProps {
  allVariables: Variable[];
  bannerVars: Variable[];
  mainVars: Variable[];
  hasResults: boolean;
  tables: CrosstabTable[] | null;
  isRunning: boolean;
  hasDataset: boolean;
  onAddToBanner: (v: Variable) => void;
  onAddToMain: (v: Variable) => void;
  onBannerRemove: (id: string) => void;
  onMainRemove: (id: string) => void;
  onBannerMoveUp: (index: number) => void;
  onBannerMoveDown: (index: number) => void;
  onMainMoveUp: (index: number) => void;
  onMainMoveDown: (index: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const CrossTabs: React.FC<CrossTabsProps> = ({
  allVariables,
  bannerVars,
  mainVars,
  hasResults,
  tables,
  isRunning,
  hasDataset,
  onAddToBanner,
  onAddToMain,
  onBannerRemove,
  onMainRemove,
  onBannerMoveUp,
  onBannerMoveDown,
  onMainMoveUp,
  onMainMoveDown,
}) => {
  const [pendingVar, setPendingVar] = useState<Variable | null>(null);
  const [valueModal, setValueModal] = useState<ValueModalState | null>(null);
  const [selectedValue1, setSelectedValue1] = useState<string>('');
  const [selectedValue2, setSelectedValue2] = useState<string>('2');
  const [percentMode, setPercentMode] = useState<PercentMode>('col');
  const [bannerColLabels, setBannerColLabels] = useState<string[]>([]);

  // Sigma / Mean — Sigma is a single global toggle that applies to every
  // question's table at once; Mean is configured per-question via a Factors
  // popup (dev note: "enabled once user selects a question id").
  const [sigmaGlobalEnabled, setSigmaGlobalEnabled] = useState(false);
  const [meanQuestionPicker, setMeanQuestionPicker] = useState(false);
  const [meanPopup, setMeanPopup] = useState<{ mainVarId: string } | null>(null);

  const [nettLabelDraft, setNettLabelDraft] = useState<Record<string, string>>({});
  const [tableStates, setTableStates] = useState<Record<string, TableState>>({});

  const allSelectedIds = new Set([
    ...bannerVars.map((v) => v.id),
    ...mainVars.map((v) => v.id),
  ]);

  // Banner columns are shared across every table in one crosstab response
  // (same banner variable) — re-seed the editable header labels whenever a
  // fresh Run comes back.
  useEffect(() => {
    if (tables && tables[0]) {
      setBannerColLabels(tables[0].columns.slice(1).map((c) => c.label));
    }
  }, [tables]);

  const getTS = useCallback(
    (mainVarId: string, rowLabels: string[]): TableState =>
      tableStates[mainVarId] ?? defaultTableState(rowLabels),
    [tableStates]
  );

  const updateTS = useCallback(
    (mainVarId: string, rowLabels: string[], updater: (ts: TableState) => TableState) => {
      setTableStates((prev) => ({
        ...prev,
        [mainVarId]: updater(prev[mainVarId] ?? defaultTableState(rowLabels)),
      }));
    },
    []
  );

  // ── Variable selection flow (All Variables → Where to move? → Value) ─────

  const handleVarClick = useCallback(
    (variable: Variable) => {
      if (allSelectedIds.has(variable.id)) return;
      setPendingVar(variable);
    },
    [allSelectedIds]
  );

  const handleWhereSelect = useCallback(
    (target: WhereTarget) => {
      if (!pendingVar) return;
      setPendingVar(null);
      setValueModal({ variable: pendingVar, target });
      setSelectedValue1('');
      setSelectedValue2('2');
    },
    [pendingVar]
  );

  const handleValueOk = useCallback(() => {
    if (!valueModal) return;
    if (valueModal.target === 'banner') onAddToBanner(valueModal.variable);
    else onAddToMain(valueModal.variable);
    setValueModal(null);
  }, [valueModal, onAddToBanner, onAddToMain]);

  // ── Sigma (global toggle, per-table "−" override) ─────────────────────────

  const handleToggleSigma = () => {
    setSigmaGlobalEnabled((prev) => {
      const next = !prev;
      if (!next) {
        // Re-arming the toggle later should show Sigma everywhere again, so
        // clear any per-table "removed" overrides when it's switched off.
        setTableStates((ts) =>
          Object.fromEntries(Object.entries(ts).map(([k, v]) => [k, { ...v, sigmaRemoved: false }]))
        );
      }
      return next;
    });
  };

  const handleRemoveSigmaFromTable = (mainVarId: string, rowLabels: string[]) => {
    updateTS(mainVarId, rowLabels, (ts) => ({ ...ts, sigmaRemoved: true }));
  };

  // ── Mean (per-question Factors popup) ─────────────────────────────────────

  const handleMeanToggleClick = () => {
    if (mainVars.length === 0) return;
    if (mainVars.length === 1) {
      setMeanPopup({ mainVarId: mainVars[0]!.id });
    } else {
      setMeanQuestionPicker(true);
    }
  };

  const handlePickMeanQuestion = (mainVarId: string) => {
    setMeanQuestionPicker(false);
    setMeanPopup({ mainVarId });
  };

  const handleMeanFactorChange = (mainVarId: string, rowLabels: string[], rowLabel: string, value: number) => {
    updateTS(mainVarId, rowLabels, (ts) => ({ ...ts, meanFactors: { ...ts.meanFactors, [rowLabel]: value } }));
  };

  const handleMeanOk = (rowLabels: string[]) => {
    if (!meanPopup) return;
    updateTS(meanPopup.mainVarId, rowLabels, (ts) => ({ ...ts, meanEnabled: true }));
    setMeanPopup(null);
  };

  const handleRemoveMeanFromTable = (mainVarId: string, rowLabels: string[]) => {
    updateTS(mainVarId, rowLabels, (ts) => ({ ...ts, meanEnabled: false }));
  };

  // ── NETT (per-question grouping) ──────────────────────────────────────────

  const startBuildingNett = (mainVarId: string, rowLabels: string[]) => {
    const id = `nett-${Date.now()}`;
    setNettLabelDraft((prev) => ({ ...prev, [mainVarId]: '' }));
    updateTS(mainVarId, rowLabels, (ts) => ({
      ...ts,
      nettGroups: [...ts.nettGroups, { id, label: '', memberIds: [], expanded: true }],
      buildingNettId: id,
    }));
  };

  const toggleNettMember = (mainVarId: string, rowLabels: string[], optionId: string) => {
    updateTS(mainVarId, rowLabels, (ts) => {
      if (!ts.buildingNettId) return ts;
      return {
        ...ts,
        nettGroups: ts.nettGroups.map((ng) =>
          ng.id !== ts.buildingNettId
            ? ng
            : {
                ...ng,
                memberIds: ng.memberIds.includes(optionId)
                  ? ng.memberIds.filter((x) => x !== optionId)
                  : [...ng.memberIds, optionId],
              }
        ),
      };
    });
  };

  const finishBuildingNett = (mainVarId: string, rowLabels: string[]) => {
    const label = (nettLabelDraft[mainVarId] ?? '').trim();
    updateTS(mainVarId, rowLabels, (ts) => ({
      ...ts,
      nettGroups: ts.nettGroups
        .map((ng) => (ng.id !== ts.buildingNettId ? ng : { ...ng, label: label || 'NETT' }))
        .filter((ng) => ng.id !== ts.buildingNettId || ng.memberIds.length > 0),
      buildingNettId: null,
    }));
  };

  const cancelBuildingNett = (mainVarId: string, rowLabels: string[]) => {
    updateTS(mainVarId, rowLabels, (ts) => ({
      ...ts,
      nettGroups: ts.nettGroups.filter((ng) => ng.id !== ts.buildingNettId),
      buildingNettId: null,
    }));
  };

  const removeNett = (mainVarId: string, rowLabels: string[], nettId: string) => {
    updateTS(mainVarId, rowLabels, (ts) => ({ ...ts, nettGroups: ts.nettGroups.filter((ng) => ng.id !== nettId) }));
  };

  const toggleNettExpanded = (mainVarId: string, rowLabels: string[], nettId: string) => {
    updateTS(mainVarId, rowLabels, (ts) => ({
      ...ts,
      nettGroups: ts.nettGroups.map((ng) => (ng.id !== nettId ? ng : { ...ng, expanded: !ng.expanded })),
    }));
  };

  // ── Row reordering / editing ──────────────────────────────────────────────

  const moveOptionUp = (mainVarId: string, rowLabels: string[], optionId: string) => {
    updateTS(mainVarId, rowLabels, (ts) => {
      const idx = ts.optionOrder.indexOf(optionId);
      if (idx <= 0) return ts;
      const next = [...ts.optionOrder];
      [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
      return { ...ts, optionOrder: next };
    });
  };

  const moveOptionDown = (mainVarId: string, rowLabels: string[], optionId: string) => {
    updateTS(mainVarId, rowLabels, (ts) => {
      const idx = ts.optionOrder.indexOf(optionId);
      if (idx === -1 || idx >= ts.optionOrder.length - 1) return ts;
      const next = [...ts.optionOrder];
      [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
      return { ...ts, optionOrder: next };
    });
  };

  const handleEditRowLabel = (mainVarId: string, rowLabels: string[], optionId: string, text: string) => {
    updateTS(mainVarId, rowLabels, (ts) => ({ ...ts, rowLabelOverrides: { ...ts.rowLabelOverrides, [optionId]: text } }));
  };

  const handleEditBannerCol = (index: number, text: string) => {
    setBannerColLabels((prev) => prev.map((c, i) => (i === index ? text : c)));
  };

  // ── Cell formatting helpers ────────────────────────────────────────────────

  const formatCell = (count: number, colPct: number, rowPct: number) =>
    `${count} ${(percentMode === 'col' ? colPct : rowPct).toFixed(1)}`;

  const meanPopupVar = meanPopup ? mainVars.find((v) => v.id === meanPopup.mainVarId) : undefined;
  const meanPopupTable = meanPopup ? (tables ?? []).find((t) => t.main_variable === meanPopup.mainVarId) : undefined;
  const meanPopupRowLabels = meanPopupTable ? meanPopupTable.rows.map((r) => r.label) : [];
  const meanPopupTS = meanPopup ? getTS(meanPopup.mainVarId, meanPopupRowLabels) : undefined;

  const tablesByMainVar = new Map((tables ?? []).map((t) => [t.main_variable, t]));

  return (
    <>
      {/* Full-bleed "zone" — recessed dark background spanning the whole
          tab body. The All Variables / Banner / Main panels AND the
          results content area all sit on top of it, per Figma. */}
      <div className="dp-zone-body">
        {/* All Variables panel */}
        <div className="dp-panel dp-panel--all" style={{ position: 'relative' }}>
          <div className="dp-panel-header">
            <span className="dp-panel-title">All Variables</span>
            <button className="dp-panel-arrow-btn" aria-label="Move all right">→</button>
          </div>
          <div className="dp-var-list">
            {allVariables.map((v) => (
              <VariablePill
                key={v.id}
                variable={v}
                variant="source"
                added={allSelectedIds.has(v.id)}
                onClick={handleVarClick}
              />
            ))}
          </div>

          {/* Where to move modal */}
          {pendingVar && (
            <div className="dp-where-overlay" onClick={() => setPendingVar(null)}>
              <div className="dp-where-box" onClick={(e) => e.stopPropagation()}>
                <p className="dp-where-title">Where to move?</p>
                <button className="dp-where-option" onClick={() => handleWhereSelect('banner')}>
                  Banner Variables
                </button>
                <button className="dp-where-option" onClick={() => handleWhereSelect('main')}>
                  Main Variables
                </button>
                <p className="dp-where-note">Add into respective column</p>
              </div>
            </div>
          )}

          {/* Value modal */}
          {valueModal && (
            <div className="dp-val-overlay" onClick={() => setValueModal(null)}>
              <div className="dp-val-box" onClick={(e) => e.stopPropagation()}>
                <p className="dp-val-title">Value</p>
                <select
                  className="dp-val-select"
                  value={selectedValue1}
                  onChange={(e) => setSelectedValue1(e.target.value)}
                >
                  <option value="">Select Value</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
                <select
                  className="dp-val-select"
                  value={selectedValue2}
                  onChange={(e) => setSelectedValue2(e.target.value)}
                >
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
                <button className="dp-val-ok-btn" onClick={handleValueOk}>
                  OK
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Banner + Main panels stacked */}
        <div className="dp-cross-panels">
          {/* Banner Variables */}
          <div className="dp-cross-section">
            <div className="dp-panel-header">
              <span className="dp-panel-title">Banner Variables</span>
              <button
                className="dp-panel-arrow-btn"
                onClick={() => bannerVars.forEach((v) => onBannerRemove(v.id))}
                aria-label="Clear banner variables"
              >
                ←
              </button>
            </div>
            <div className="dp-var-list">
              {bannerVars.length === 0 ? (
                <p className="dp-panel-empty-hint">No banner variables</p>
              ) : (
                bannerVars.map((v, i) => (
                  <VariablePill
                    key={v.id}
                    variable={v}
                    variant="selected"
                    focused={i === 0}
                    arrowDirection="left"
                    onClick={() => onBannerRemove(v.id)}
                  />
                ))
              )}
            </div>
            <div className="dp-updown-bar">
              <span className="dp-updown-label">Up/Down</span>
              <button
                className="dp-updown-btn dp-updown-btn--accent"
                onClick={() => onBannerMoveDown(bannerVars.length - 1)}
                disabled={bannerVars.length < 2}
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                className="dp-updown-btn"
                onClick={() => onBannerMoveUp(0)}
                disabled={bannerVars.length < 2}
                aria-label="Move up"
              >
                ↑
              </button>
            </div>
          </div>

          {/* Main Variables */}
          <div className="dp-cross-section">
            <div className="dp-panel-header">
              <span className="dp-panel-title">Main Variables</span>
              <button
                className="dp-panel-arrow-btn"
                onClick={() => mainVars.forEach((v) => onMainRemove(v.id))}
                aria-label="Clear main variables"
              >
                ←
              </button>
            </div>
            <div className="dp-var-list">
              {mainVars.length === 0 ? (
                <p className="dp-panel-empty-hint">No main variables</p>
              ) : (
                mainVars.map((v, i) => (
                  <VariablePill
                    key={v.id}
                    variable={v}
                    variant="selected"
                    focused={i === 0}
                    arrowDirection="left"
                    onClick={() => onMainRemove(v.id)}
                  />
                ))
              )}
            </div>
            <div className="dp-updown-bar">
              <span className="dp-updown-label">Up/Down</span>
              <button
                className="dp-updown-btn dp-updown-btn--accent"
                onClick={() => onMainMoveDown(mainVars.length - 1)}
                disabled={mainVars.length < 2}
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                className="dp-updown-btn"
                onClick={() => onMainMoveUp(0)}
                disabled={mainVars.length < 2}
                aria-label="Move up"
              >
                ↑
              </button>
            </div>
          </div>
        </div>

        {/* Results area */}
        <div className="dp-content-area">
        {hasResults && tables && tables.length > 0 && (
          <>
            {/* Sigma / Mean statistic toggles */}
            <div className="dp-cross-stat-row">
              <button
                className={`dp-cross-stat-pill${sigmaGlobalEnabled ? ' dp-cross-stat-pill--active' : ''}`}
                onClick={handleToggleSigma}
              >
                Sigma
                <span
                  className="dp-cross-stat-info"
                  title="Sigma = sum of counts for all answer options (excluding NETT and statistics rows). Adds a Sigma row to every selected question's table."
                >
                  ⓘ
                </span>
              </button>
              <button
                className={`dp-cross-stat-pill${mainVars.length === 0 ? ' dp-cross-stat-pill--disabled' : ''}`}
                onClick={handleMeanToggleClick}
                disabled={mainVars.length === 0}
              >
                Mean
                <span
                  className="dp-cross-stat-info"
                  title="Select a question, then set a numeric factor per answer option. Mean is calculated from those factors and added as a row to that question's table."
                >
                  ⓘ
                </span>
              </button>
            </div>

            <div className="dp-crosstab-toolbar">
              <div className="dp-pct-toggle">
                <button
                  className={`dp-pct-btn${percentMode === 'col' ? ' dp-pct-btn--active' : ''}`}
                  onClick={() => setPercentMode('col')}
                >
                  Col %
                </button>
                <button
                  className={`dp-pct-btn${percentMode === 'row' ? ' dp-pct-btn--active' : ''}`}
                  onClick={() => setPercentMode('row')}
                >
                  Row %
                </button>
              </div>
              <div className="dp-crosstab-toolbar-right">
                <button className="dp-toolbar-btn">Table Options</button>
                <button className="dp-toolbar-btn">Export</button>
                <button className="dp-toolbar-btn">Table View</button>
              </div>
            </div>
          </>
        )}

        <div className="dp-content-scroll">
          {isRunning ? (
            <EmptyState title="Running cross tab..." subtitle="This will only take a moment" />
          ) : !hasResults || !tables || tables.length === 0 ? (
            <EmptyState
              title={hasDataset ? undefined : 'No dataset yet'}
              subtitle={hasDataset ? undefined : 'Upload a CSV or XLSX file to get started'}
            />
          ) : (
            mainVars.map((mainVar, tableIdx) => {
              const table = tablesByMainVar.get(mainVar.id);
              if (!table) return null;

              const rowLabels = table.rows.map((r) => r.label);
              const ts = getTS(mainVar.id, rowLabels);
              const memberIdsInNett = new Set(ts.nettGroups.flatMap((ng) => ng.memberIds));
              const remainingOptionIds = ts.optionOrder.filter((id) => !memberIdsInNett.has(id));
              const optionByLabel = new Map(table.rows.map((r) => [r.label, r]));
              const showSigma = sigmaGlobalEnabled && !ts.sigmaRemoved;
              const columnCount = table.columns.length; // Total + banner columns

              const meanByColumn = ts.meanEnabled
                ? weightedMeanPerColumn(table.rows, ts.meanFactors, columnCount)
                : [];
              const sigmaCells = showSigma ? aggregateCells(table.rows, table.base.by_column) : [];

              return (
                <div key={mainVar.id} className="dp-cross-block">
                  <div className="dp-cross-block-title-row">
                    <div className="dp-cross-block-title">Table {tableIdx + 1} — {table.title}</div>
                    {ts.buildingNettId ? (
                      <div className="dp-nett-input-wrap">
                        <input
                          className="dp-nett-input"
                          placeholder="NETT label..."
                          value={nettLabelDraft[mainVar.id] ?? ''}
                          onChange={(e) => setNettLabelDraft((prev) => ({ ...prev, [mainVar.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && finishBuildingNett(mainVar.id, rowLabels)}
                          autoFocus
                        />
                        <button className="dp-nett-ok-btn" onClick={() => finishBuildingNett(mainVar.id, rowLabels)}>Add</button>
                        <button className="dp-nett-cancel-btn" onClick={() => cancelBuildingNett(mainVar.id, rowLabels)}>✕</button>
                      </div>
                    ) : (
                      <button className="dp-toolbar-btn" onClick={() => startBuildingNett(mainVar.id, rowLabels)}>
                        + NETT
                      </button>
                    )}
                  </div>

                  {ts.buildingNettId && (
                    <p className="dp-nett-hint">Click rows below to add/remove them from the NETT group.</p>
                  )}

                  <div className="dp-cross-table-wrap">
                    <table className="dp-cross-table">
                      <thead>
                        <tr>
                          <th className="dp-cross-td--rowctl" aria-hidden />
                          <th className="dp-cross-th--label">{table.title}</th>
                          <th className="dp-cross-th--num" rowSpan={1}></th>
                          <th className="dp-cross-th--num" colSpan={bannerColLabels.length}>
                            {table.banner_title}
                          </th>
                        </tr>
                        <tr>
                          <th className="dp-cross-td--rowctl" aria-hidden />
                          <th className="dp-cross-th--label"></th>
                          <th className="dp-cross-th--num">Total</th>
                          {bannerColLabels.map((col, i) => (
                            <th key={i} className="dp-cross-th--num">
                              <span
                                className="dp-editable"
                                contentEditable
                                suppressContentEditableWarning
                                onBlur={(e) => handleEditBannerCol(i, e.currentTarget.textContent ?? '')}
                              >
                                {col}
                              </span>
                            </th>
                          ))}
                        </tr>
                        <tr>
                          <th className="dp-cross-td--rowctl" aria-hidden />
                          <th className="dp-cross-th--subhead"></th>
                          <th className="dp-cross-th--subhead">
                            {percentMode === 'col' ? 'Col %' : 'Row %'}
                          </th>
                          {bannerColLabels.map((_, i) => (
                            <th key={i} className="dp-cross-th--subhead">
                              {percentMode === 'col' ? 'Col %' : 'Row %'}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Base row */}
                        <tr className="dp-cross-row--base">
                          <td className="dp-cross-td--rowctl">
                            <span className="dp-row-link-icon" title="Aggregate row">⛓</span>
                          </td>
                          <td className="dp-cross-td--label">Base: All respondents</td>
                          {table.base.by_column.map((count, i) => (
                            <td key={i} className="dp-cross-td--num">{count} 100.0</td>
                          ))}
                        </tr>

                        {/* NETT groups (rendered right after Base, per Figma's Table Behaviour example) */}
                        {ts.nettGroups.map((ng) => {
                          const memberOptions = ng.memberIds.map((id) => optionByLabel.get(id)).filter(Boolean) as CrosstabRow[];
                          const cells = aggregateCells(memberOptions, table.base.by_column);
                          const isBuilding = ts.buildingNettId === ng.id;
                          return (
                            <React.Fragment key={ng.id}>
                              <tr className="dp-cross-row--nett">
                                <td className="dp-cross-td--rowctl">
                                  <button
                                    className="dp-row-updown-btn"
                                    onClick={() => toggleNettExpanded(mainVar.id, rowLabels, ng.id)}
                                    aria-label={ng.expanded ? 'Collapse NETT' : 'Expand NETT'}
                                    title={ng.expanded ? 'Collapse' : 'Expand'}
                                  >
                                    {ng.expanded ? '⌃' : '⌄'}
                                  </button>
                                </td>
                                <td className="dp-cross-td--label">
                                  <span className="dp-row-link-icon" title="NETT aggregate" style={{ marginRight: 6 }}>⛓</span>
                                  {isBuilding ? 'NETT (building…)' : `NETT = ${ng.label || memberOptions.map((m) => m.label.split(' ')[0]).join(' + ')}`}
                                  <button
                                    className="dp-row-remove-btn"
                                    onClick={() => removeNett(mainVar.id, rowLabels, ng.id)}
                                    title="Remove this NETT group"
                                    aria-label="Remove NETT group"
                                  >
                                    −
                                  </button>
                                </td>
                                {cells.map((cell, i) => (
                                  <td key={i} className="dp-cross-td--num">{formatCell(cell.count, cell.col_pct, cell.row_pct)}</td>
                                ))}
                              </tr>
                              {ng.expanded &&
                                memberOptions.map((opt) => (
                                  <tr key={opt.label} className="dp-cross-row--nett-child">
                                    <td className="dp-cross-td--rowctl" />
                                    <td className="dp-cross-td--label" style={{ paddingLeft: 28 }}>
                                      {ts.rowLabelOverrides[opt.label] ?? opt.label}
                                    </td>
                                    {opt.cells.map((cell, i) => (
                                      <td key={i} className="dp-cross-td--num">{formatCell(cell.count, cell.col_pct, cell.row_pct)}</td>
                                    ))}
                                  </tr>
                                ))}
                            </React.Fragment>
                          );
                        })}

                        {/* Remaining (non-grouped) answer options */}
                        {remainingOptionIds.map((optionId) => {
                          const opt = optionByLabel.get(optionId);
                          if (!opt) return null;
                          const isBuilding = ts.buildingNettId != null;
                          return (
                            <tr
                              key={opt.label}
                              className={
                                isBuilding && ts.nettGroups.find((ng) => ng.id === ts.buildingNettId)?.memberIds.includes(opt.label)
                                  ? 'dp-cross-row--nett-child'
                                  : ''
                              }
                              onClick={() => isBuilding && toggleNettMember(mainVar.id, rowLabels, opt.label)}
                              style={isBuilding ? { cursor: 'pointer' } : undefined}
                            >
                              <td className="dp-cross-td--rowctl">
                                <span className="dp-row-updown">
                                  <button
                                    className="dp-row-updown-btn"
                                    onClick={(e) => { e.stopPropagation(); moveOptionDown(mainVar.id, rowLabels, opt.label); }}
                                    aria-label="Move row down"
                                  >
                                    ↓
                                  </button>
                                  <button
                                    className="dp-row-updown-btn"
                                    onClick={(e) => { e.stopPropagation(); moveOptionUp(mainVar.id, rowLabels, opt.label); }}
                                    aria-label="Move row up"
                                  >
                                    ↑
                                  </button>
                                </span>
                              </td>
                              <td className="dp-cross-td--label">
                                <span
                                  className="dp-editable"
                                  contentEditable
                                  suppressContentEditableWarning
                                  onBlur={(e) => handleEditRowLabel(mainVar.id, rowLabels, opt.label, e.currentTarget.textContent ?? '')}
                                >
                                  {ts.rowLabelOverrides[opt.label] ?? opt.label}
                                </span>
                              </td>
                              {opt.cells.map((cell, i) => (
                                <td key={i} className="dp-cross-td--num">{formatCell(cell.count, cell.col_pct, cell.row_pct)}</td>
                              ))}
                            </tr>
                          );
                        })}

                        {/* Mean row */}
                        {ts.meanEnabled && (
                          <tr className="dp-cross-row--mean">
                            <td className="dp-cross-td--rowctl">
                              <span className="dp-row-link-icon" title="Computed row">⛓</span>
                            </td>
                            <td className="dp-cross-td--label">
                              Mean
                              <button
                                className="dp-row-remove-btn"
                                onClick={() => handleRemoveMeanFromTable(mainVar.id, rowLabels)}
                                title="Remove Mean row"
                                aria-label="Remove Mean row"
                              >
                                −
                              </button>
                            </td>
                            {meanByColumn.map((value, i) => (
                              <td key={i} className="dp-cross-td--num">{value.toFixed(2)}</td>
                            ))}
                          </tr>
                        )}

                        {/* Sigma row */}
                        {showSigma && (
                          <tr className="dp-cross-row--sigma">
                            <td className="dp-cross-td--rowctl">
                              <span className="dp-row-link-icon" title="Aggregate row">⛓</span>
                            </td>
                            <td className="dp-cross-td--label">
                              Sigma
                              <button
                                className="dp-row-remove-btn"
                                onClick={() => handleRemoveSigmaFromTable(mainVar.id, rowLabels)}
                                title="Remove Sigma row from this table"
                                aria-label="Remove Sigma row"
                              >
                                −
                              </button>
                            </td>
                            {sigmaCells.map((cell, i) => (
                              <td key={i} className="dp-cross-td--num">{formatCell(cell.count, cell.col_pct, cell.row_pct)}</td>
                            ))}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
        </div>
      </div>

      {/* Mean: question picker (only when multiple Main Variables are selected) */}
      {meanQuestionPicker && (
        <div className="dp-where-overlay" onClick={() => setMeanQuestionPicker(false)}>
          <div className="dp-where-box" onClick={(e) => e.stopPropagation()}>
            <p className="dp-where-title">Add Mean to which question?</p>
            {mainVars.map((v) => (
              <button key={v.id} className="dp-where-option" onClick={() => handlePickMeanQuestion(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mean: Factors popup */}
      {meanPopup && meanPopupVar && meanPopupTable && meanPopupTS && (
        <div className="dp-val-overlay" onClick={() => setMeanPopup(null)}>
          <div className="dp-mean-box" onClick={(e) => e.stopPropagation()}>
            <p className="dp-val-title">Mean — {meanPopupVar.label}</p>
            <table className="dp-mean-table">
              <thead>
                <tr>
                  <th>Answer Option</th>
                  <th>Original Precode</th>
                  <th>Required Factor</th>
                </tr>
              </thead>
              <tbody>
                {meanPopupTable.rows.map((row, idx) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{defaultFactor(row, idx)}</td>
                    <td>
                      <input
                        className="dp-mean-factor-input"
                        type="number"
                        value={meanPopupTS.meanFactors[row.label] ?? defaultFactor(row, idx)}
                        onChange={(e) => handleMeanFactorChange(meanPopupVar.id, meanPopupRowLabels, row.label, Number(e.target.value))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="dp-val-ok-btn" onClick={() => handleMeanOk(meanPopupRowLabels)}>OK</button>
          </div>
        </div>
      )}
    </>
  );
};

export default CrossTabs;
