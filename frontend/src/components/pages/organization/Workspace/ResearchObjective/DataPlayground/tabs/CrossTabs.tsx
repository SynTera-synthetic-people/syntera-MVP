import React, { useState, useCallback } from 'react';
import type { Variable } from '../Index';
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

interface AnswerOption {
  id: string;
  label: string;
  precode: number;
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

// ── Sample data ───────────────────────────────────────────────────────────────
// Every selected Main Variable ("question") gets its own table, mirroring
// the Figma "Table Behaviour" spec exactly (each answer option count/col%
// is a uniform dummy 35 / 100.0, consistent with the reference screens).

const SAMPLE_OPTIONS: AnswerOption[] = [
  { id: 'retail', label: 'Retail media advertising', precode: 1 },
  { id: 'social', label: 'Social media marketing', precode: 2 },
  { id: 'tv', label: 'TV advertising', precode: 3 },
  { id: 'other', label: 'Other', precode: 4 },
];

const DEFAULT_BANNER_COLS = ['1,000–4,999', '20,000+', '5,000–19,999', '500–999'];

const OPTION_COUNT = 35;
const OPTION_COL_PCT = 100.0;
const BASE_TOTAL = 35;

function defaultTableState(): TableState {
  return {
    optionOrder: SAMPLE_OPTIONS.map((o) => o.id),
    rowLabelOverrides: {},
    nettGroups: [],
    buildingNettId: null,
    sigmaRemoved: false,
    meanEnabled: false,
    meanFactors: Object.fromEntries(SAMPLE_OPTIONS.map((o) => [o.id, o.precode])),
  };
}

function getQuestionTitle(mainVar: Variable): string {
  return `${mainVar.label}_You indicated that you work in a marketing/advertising role. In which of the following types of marketing are you personally directly involved?`;
}

function getBannerTitle(bannerVars: Variable[]): string {
  const label = bannerVars.map((v) => v.label).join(', ') || 'Employee count';
  return `${label}_Using your best estimate how many employees work for your firm/organization worldwide?`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CrossTabsProps {
  allVariables: Variable[];
  bannerVars: Variable[];
  mainVars: Variable[];
  hasResults: boolean;
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
  const [bannerColLabels, setBannerColLabels] = useState<string[]>(DEFAULT_BANNER_COLS);

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

  const getTS = useCallback(
    (mainVarId: string): TableState => tableStates[mainVarId] ?? defaultTableState(),
    [tableStates]
  );

  const updateTS = useCallback((mainVarId: string, updater: (ts: TableState) => TableState) => {
    setTableStates((prev) => ({ ...prev, [mainVarId]: updater(prev[mainVarId] ?? defaultTableState()) }));
  }, []);

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

  const handleRemoveSigmaFromTable = (mainVarId: string) => {
    updateTS(mainVarId, (ts) => ({ ...ts, sigmaRemoved: true }));
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

  const handleMeanFactorChange = (mainVarId: string, optionId: string, value: number) => {
    updateTS(mainVarId, (ts) => ({ ...ts, meanFactors: { ...ts.meanFactors, [optionId]: value } }));
  };

  const handleMeanOk = () => {
    if (!meanPopup) return;
    updateTS(meanPopup.mainVarId, (ts) => ({ ...ts, meanEnabled: true }));
    setMeanPopup(null);
  };

  const handleRemoveMeanFromTable = (mainVarId: string) => {
    updateTS(mainVarId, (ts) => ({ ...ts, meanEnabled: false }));
  };

  // ── NETT (per-question grouping) ──────────────────────────────────────────

  const startBuildingNett = (mainVarId: string) => {
    const id = `nett-${Date.now()}`;
    setNettLabelDraft((prev) => ({ ...prev, [mainVarId]: '' }));
    updateTS(mainVarId, (ts) => ({
      ...ts,
      nettGroups: [...ts.nettGroups, { id, label: '', memberIds: [], expanded: true }],
      buildingNettId: id,
    }));
  };

  const toggleNettMember = (mainVarId: string, optionId: string) => {
    updateTS(mainVarId, (ts) => {
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

  const finishBuildingNett = (mainVarId: string) => {
    const label = (nettLabelDraft[mainVarId] ?? '').trim();
    updateTS(mainVarId, (ts) => ({
      ...ts,
      nettGroups: ts.nettGroups
        .map((ng) => (ng.id !== ts.buildingNettId ? ng : { ...ng, label: label || 'NETT' }))
        .filter((ng) => ng.id !== ts.buildingNettId || ng.memberIds.length > 0),
      buildingNettId: null,
    }));
  };

  const cancelBuildingNett = (mainVarId: string) => {
    updateTS(mainVarId, (ts) => ({
      ...ts,
      nettGroups: ts.nettGroups.filter((ng) => ng.id !== ts.buildingNettId),
      buildingNettId: null,
    }));
  };

  const removeNett = (mainVarId: string, nettId: string) => {
    updateTS(mainVarId, (ts) => ({ ...ts, nettGroups: ts.nettGroups.filter((ng) => ng.id !== nettId) }));
  };

  const toggleNettExpanded = (mainVarId: string, nettId: string) => {
    updateTS(mainVarId, (ts) => ({
      ...ts,
      nettGroups: ts.nettGroups.map((ng) => (ng.id !== nettId ? ng : { ...ng, expanded: !ng.expanded })),
    }));
  };

  // ── Row reordering / editing ──────────────────────────────────────────────

  const moveOptionUp = (mainVarId: string, optionId: string) => {
    updateTS(mainVarId, (ts) => {
      const idx = ts.optionOrder.indexOf(optionId);
      if (idx <= 0) return ts;
      const next = [...ts.optionOrder];
      [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
      return { ...ts, optionOrder: next };
    });
  };

  const moveOptionDown = (mainVarId: string, optionId: string) => {
    updateTS(mainVarId, (ts) => {
      const idx = ts.optionOrder.indexOf(optionId);
      if (idx === -1 || idx >= ts.optionOrder.length - 1) return ts;
      const next = [...ts.optionOrder];
      [next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!];
      return { ...ts, optionOrder: next };
    });
  };

  const handleEditRowLabel = (mainVarId: string, optionId: string, text: string) => {
    updateTS(mainVarId, (ts) => ({ ...ts, rowLabelOverrides: { ...ts.rowLabelOverrides, [optionId]: text } }));
  };

  const handleEditBannerCol = (index: number, text: string) => {
    setBannerColLabels((prev) => prev.map((c, i) => (i === index ? text : c)));
  };

  // ── Cell formatting helpers (uniform dummy data, matching Figma exactly) ──

  const formatBaseCell = () => `${BASE_TOTAL} 100.0`;
  const formatOptionCell = () => `${OPTION_COUNT} ${OPTION_COL_PCT.toFixed(1)}`;

  const meanPopupVar = meanPopup ? mainVars.find((v) => v.id === meanPopup.mainVarId) : undefined;
  const meanPopupTS = meanPopup ? getTS(meanPopup.mainVarId) : undefined;

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
        {hasResults && (bannerVars.length > 0 || mainVars.length > 0) && (
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
          {!hasResults || (bannerVars.length === 0 && mainVars.length === 0) ? (
            <EmptyState />
          ) : (
            mainVars.map((mainVar, tableIdx) => {
              const ts = getTS(mainVar.id);
              const memberIdsInNett = new Set(ts.nettGroups.flatMap((ng) => ng.memberIds));
              const remainingOptionIds = ts.optionOrder.filter((id) => !memberIdsInNett.has(id));
              const optionById = Object.fromEntries(SAMPLE_OPTIONS.map((o) => [o.id, o]));
              const showSigma = sigmaGlobalEnabled && !ts.sigmaRemoved;

              const meanValue = (() => {
                const totalFactor = SAMPLE_OPTIONS.reduce((sum, o) => sum + (ts.meanFactors[o.id] ?? o.precode) * OPTION_COUNT, 0);
                const totalCount = SAMPLE_OPTIONS.length * OPTION_COUNT;
                return totalCount === 0 ? 0 : totalFactor / totalCount;
              })();

              return (
                <div key={mainVar.id} className="dp-cross-block">
                  <div className="dp-cross-block-title-row">
                    <div className="dp-cross-block-title">Table {tableIdx + 1} — {getQuestionTitle(mainVar)}</div>
                    {ts.buildingNettId ? (
                      <div className="dp-nett-input-wrap">
                        <input
                          className="dp-nett-input"
                          placeholder="NETT label..."
                          value={nettLabelDraft[mainVar.id] ?? ''}
                          onChange={(e) => setNettLabelDraft((prev) => ({ ...prev, [mainVar.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && finishBuildingNett(mainVar.id)}
                          autoFocus
                        />
                        <button className="dp-nett-ok-btn" onClick={() => finishBuildingNett(mainVar.id)}>Add</button>
                        <button className="dp-nett-cancel-btn" onClick={() => cancelBuildingNett(mainVar.id)}>✕</button>
                      </div>
                    ) : (
                      <button className="dp-toolbar-btn" onClick={() => startBuildingNett(mainVar.id)}>
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
                          <th className="dp-cross-th--label">{getQuestionTitle(mainVar)}</th>
                          <th className="dp-cross-th--num" rowSpan={1}></th>
                          <th className="dp-cross-th--num" colSpan={bannerColLabels.length}>
                            {getBannerTitle(bannerVars)}
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
                          <th className="dp-cross-th--subhead">
                            {percentMode === 'col' ? 'Col %' : 'Row %'}
                          </th>
                          <th className="dp-cross-th--subhead">Count %</th>
                          {bannerColLabels.map((_, i) => (
                            <th key={i} className="dp-cross-th--subhead">Count %</th>
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
                          <td className="dp-cross-td--num">{formatBaseCell()}</td>
                          {bannerColLabels.map((_, i) => (
                            <td key={i} className="dp-cross-td--num">{formatBaseCell()}</td>
                          ))}
                        </tr>

                        {/* NETT groups (rendered right after Base, per Figma's Table Behaviour example) */}
                        {ts.nettGroups.map((ng) => {
                          const memberOptions = ng.memberIds.map((id) => optionById[id]).filter(Boolean) as AnswerOption[];
                          const total = memberOptions.length * BASE_TOTAL;
                          const isBuilding = ts.buildingNettId === ng.id;
                          return (
                            <React.Fragment key={ng.id}>
                              <tr className="dp-cross-row--nett">
                                <td className="dp-cross-td--rowctl">
                                  <button
                                    className="dp-row-updown-btn"
                                    onClick={() => toggleNettExpanded(mainVar.id, ng.id)}
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
                                    onClick={() => removeNett(mainVar.id, ng.id)}
                                    title="Remove this NETT group"
                                    aria-label="Remove NETT group"
                                  >
                                    −
                                  </button>
                                </td>
                                <td className="dp-cross-td--num">{total} 100.0</td>
                                {bannerColLabels.map((_, i) => (
                                  <td key={i} className="dp-cross-td--num">{total} 100.0</td>
                                ))}
                              </tr>
                              {ng.expanded &&
                                memberOptions.map((opt) => (
                                  <tr key={opt.id} className="dp-cross-row--nett-child">
                                    <td className="dp-cross-td--rowctl" />
                                    <td className="dp-cross-td--label" style={{ paddingLeft: 28 }}>
                                      {ts.rowLabelOverrides[opt.id] ?? opt.label}
                                    </td>
                                    <td className="dp-cross-td--num">{formatOptionCell()}</td>
                                    {bannerColLabels.map((_, i) => (
                                      <td key={i} className="dp-cross-td--num">{formatOptionCell()}</td>
                                    ))}
                                  </tr>
                                ))}
                            </React.Fragment>
                          );
                        })}

                        {/* Remaining (non-grouped) answer options */}
                        {remainingOptionIds.map((optionId) => {
                          const opt = optionById[optionId]!;
                          const isBuilding = ts.buildingNettId != null;
                          return (
                            <tr
                              key={opt.id}
                              className={
                                isBuilding && ts.nettGroups.find((ng) => ng.id === ts.buildingNettId)?.memberIds.includes(opt.id)
                                  ? 'dp-cross-row--nett-child'
                                  : ''
                              }
                              onClick={() => isBuilding && toggleNettMember(mainVar.id, opt.id)}
                              style={isBuilding ? { cursor: 'pointer' } : undefined}
                            >
                              <td className="dp-cross-td--rowctl">
                                <span className="dp-row-updown">
                                  <button
                                    className="dp-row-updown-btn"
                                    onClick={(e) => { e.stopPropagation(); moveOptionDown(mainVar.id, opt.id); }}
                                    aria-label="Move row down"
                                  >
                                    ↓
                                  </button>
                                  <button
                                    className="dp-row-updown-btn"
                                    onClick={(e) => { e.stopPropagation(); moveOptionUp(mainVar.id, opt.id); }}
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
                                  onBlur={(e) => handleEditRowLabel(mainVar.id, opt.id, e.currentTarget.textContent ?? '')}
                                >
                                  {ts.rowLabelOverrides[opt.id] ?? opt.label}
                                </span>
                              </td>
                              <td className="dp-cross-td--num">{formatOptionCell()}</td>
                              {bannerColLabels.map((_, i) => (
                                <td key={i} className="dp-cross-td--num">{formatOptionCell()}</td>
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
                                onClick={() => handleRemoveMeanFromTable(mainVar.id)}
                                title="Remove Mean row"
                                aria-label="Remove Mean row"
                              >
                                −
                              </button>
                            </td>
                            <td className="dp-cross-td--num">{meanValue.toFixed(2)}</td>
                            {bannerColLabels.map((_, i) => (
                              <td key={i} className="dp-cross-td--num">{meanValue.toFixed(2)}</td>
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
                                onClick={() => handleRemoveSigmaFromTable(mainVar.id)}
                                title="Remove Sigma row from this table"
                                aria-label="Remove Sigma row"
                              >
                                −
                              </button>
                            </td>
                            <td className="dp-cross-td--num">271% 100.0</td>
                            {bannerColLabels.map((_, i) => (
                              <td key={i} className="dp-cross-td--num">{formatOptionCell()}</td>
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
      {meanPopup && meanPopupVar && meanPopupTS && (
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
                {SAMPLE_OPTIONS.map((opt) => (
                  <tr key={opt.id}>
                    <td>{opt.label}</td>
                    <td>{opt.precode}</td>
                    <td>
                      <input
                        className="dp-mean-factor-input"
                        type="number"
                        value={meanPopupTS.meanFactors[opt.id] ?? opt.precode}
                        onChange={(e) => handleMeanFactorChange(meanPopupVar.id, opt.id, Number(e.target.value))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="dp-val-ok-btn" onClick={handleMeanOk}>OK</button>
          </div>
        </div>
      )}
    </>
  );
};

export default CrossTabs;