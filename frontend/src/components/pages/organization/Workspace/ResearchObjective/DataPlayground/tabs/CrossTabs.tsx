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

interface NettGroup {
  id: number;
  label: string;
  memberIdxs: number[];
}

// ── Sample data ───────────────────────────────────────────────────────────────

const BANNER_COLS = [
  '1,000–4,999',
  '20,000+',
  '5,000–19,999',
  '500–999',
];

interface CrossRow {
  label: string;
  isBase?: boolean;
  isSigma?: boolean;
  isMean?: boolean;
  total: number;
  totalColPct: number;
  totalRowPct: number;
  colValues: Array<{ count: number; colPct: number; rowPct: number }>;
}

const COL_CROSSTAB: CrossRow[] = [
  { label: 'Base : All Respondents', isBase: true, total: 35, totalColPct: 1, totalRowPct: 1, colValues: [{ count: 5, colPct: 1, rowPct: 0.143 }, { count: 4, colPct: 1, rowPct: 0.114 }, { count: 22, colPct: 1, rowPct: 0.629 }, { count: 4, colPct: 1, rowPct: 0.114 }] },
  { label: 'AI is embedded in some channels but not yet scaled', total: 10, totalColPct: 0.2857, totalRowPct: 1, colValues: [{ count: 2, colPct: 0.40, rowPct: 0.20 }, { count: 0, colPct: 0, rowPct: 0 }, { count: 7, colPct: 0.318, rowPct: 0.70 }, { count: 1, colPct: 0.25, rowPct: 0.10 }] },
  { label: 'AI is foundational – used for optimization at scale', total: 6, totalColPct: 0.1714, totalRowPct: 1, colValues: [{ count: 2, colPct: 0.40, rowPct: 0.333 }, { count: 2, colPct: 0.50, rowPct: 0.333 }, { count: 1, colPct: 0.045, rowPct: 0.167 }, { count: 1, colPct: 0.25, rowPct: 0.167 }] },
  { label: 'AI is integrated across most marketing channels', total: 17, totalColPct: 0.4857, totalRowPct: 1, colValues: [{ count: 1, colPct: 0.20, rowPct: 0.059 }, { count: 2, colPct: 0.50, rowPct: 0.118 }, { count: 12, colPct: 0.545, rowPct: 0.706 }, { count: 2, colPct: 0.50, rowPct: 0.118 }] },
  { label: 'Isolated AI pilots in select areas (e.g., paid social)', total: 2, totalColPct: 0.0571, totalRowPct: 1, colValues: [{ count: 0, colPct: 0, rowPct: 0 }, { count: 0, colPct: 0, rowPct: 0 }, { count: 2, colPct: 0.091, rowPct: 1 }, { count: 0, colPct: 0, rowPct: 0 }] },
  { label: 'Sigma', isSigma: true, total: 35, totalColPct: 1, totalRowPct: 1, colValues: [{ count: 5, colPct: 1, rowPct: 0.143 }, { count: 4, colPct: 1, rowPct: 0.114 }, { count: 22, colPct: 1, rowPct: 0.629 }, { count: 4, colPct: 1, rowPct: 0.114 }] },
];

// Indexes into COL_CROSSTAB that are eligible to be grouped into a NETT
// (i.e. everything except the Base and Sigma rows).
const NETTABLE_ROW_IDXS = [1, 2, 3, 4];

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
  const [showAddRow, setShowAddRow] = useState(false);
  const [extraRows, setExtraRows] = useState<{ type: 'sigma' | 'mean'; label: string }[]>([]);
  const [nettGroups, setNettGroups] = useState<NettGroup[]>([]);
  const [showNettInput, setShowNettInput] = useState(false);
  const [nettLabel, setNettLabel] = useState('');
  const [buildingNettId, setBuildingNettId] = useState<number | null>(null);
  const [rowLabels, setRowLabels] = useState<Record<number, string>>({});

  const allSelectedIds = new Set([
    ...bannerVars.map((v) => v.id),
    ...mainVars.map((v) => v.id),
  ]);

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

  const handleAddSigma = () => {
    setExtraRows((prev) => [...prev, { type: 'sigma', label: 'Sigma' }]);
    setShowAddRow(false);
  };

  const handleAddMean = () => {
    setExtraRows((prev) => [...prev, { type: 'mean', label: 'Mean' }]);
    setShowAddRow(false);
  };

  const handleAddNett = () => {
    if (!nettLabel.trim()) return;
    const id = Date.now();
    setNettGroups((prev) => [...prev, { id, label: nettLabel.trim(), memberIdxs: [] }]);
    setBuildingNettId(id);
    setNettLabel('');
    setShowNettInput(false);
  };

  const toggleNettMember = (rowIdx: number) => {
    if (buildingNettId == null) return;
    setNettGroups((prev) =>
      prev.map((ng) =>
        ng.id !== buildingNettId
          ? ng
          : {
              ...ng,
              memberIdxs: ng.memberIdxs.includes(rowIdx)
                ? ng.memberIdxs.filter((i) => i !== rowIdx)
                : [...ng.memberIdxs, rowIdx],
            }
      )
    );
  };

  const handleEditRowLabel = (idx: number, text: string) => {
    setRowLabels((prev) => ({ ...prev, [idx]: text }));
  };

  const SIGMA_COUNTS = [5, 4, 22, 4] as const;

  const nettComputed = nettGroups.map((ng) => {
    const members = ng.memberIdxs
      .slice()
      .sort((a, b) => a - b)
      .map((i) => COL_CROSSTAB[i])
      .filter(Boolean) as CrossRow[];
    const total = members.reduce((sum, m) => sum + m.total, 0);
    const totalColPct = members.reduce((sum, m) => sum + m.totalColPct, 0);
    const colValues = BANNER_COLS.map((_, colIdx) => {
      const count = members.reduce((sum, m) => sum + (m.colValues[colIdx]?.count ?? 0), 0);
      const colPct = members.reduce((sum, m) => sum + (m.colValues[colIdx]?.colPct ?? 0), 0);
      const rowPct = members.reduce((sum, m) => sum + (m.colValues[colIdx]?.rowPct ?? 0), 0);
      return { count, colPct, rowPct };
    });
    const memberLabels = members.map((m) => m.label.split(' ').slice(0, 2).join(' '));
    return {
      ng,
      row: {
        label: `NETT: ${ng.label}`,
        total,
        totalColPct,
        totalRowPct: 1,
        colValues,
      } as CrossRow,
      caption: `NETT = ${memberLabels.join(' + ') || '…'}`,
    };
  });

  const tableRows: CrossRow[] = hasResults
    ? [
        ...COL_CROSSTAB,
        ...extraRows.map((r) => ({
          label: r.label,
          isBase: false,
          isSigma: r.type === 'sigma',
          isMean: r.type === 'mean',
          total: r.type === 'sigma' ? 35 : 4.2,
          totalColPct: r.type === 'sigma' ? 1 : 0,
          totalRowPct: 1,
          colValues: BANNER_COLS.map((_, i) => ({
            count: r.type === 'sigma' ? (SIGMA_COUNTS[i] ?? 0) : 0,
            colPct: r.type === 'sigma' ? 1 : 0,
            rowPct: 0,
          })),
        })),
      ]
    : [];

  const formatCell = (row: CrossRow, isTotal: boolean, colIdx: number) => {
    if (row.isBase || row.isSigma) {
      const count = isTotal ? row.total : row.colValues[colIdx]?.count ?? 0;
      return `${count} 100.0`;
    }
    if (row.isMean) {
      return isTotal ? row.total.toFixed(1) : '—';
    }
    const pct = percentMode === 'col'
      ? (isTotal ? row.totalColPct : row.colValues[colIdx]?.colPct ?? 0)
      : (isTotal ? row.totalRowPct : row.colValues[colIdx]?.rowPct ?? 0);
    const count = isTotal ? row.total : row.colValues[colIdx]?.count ?? 0;
    return `${count} ${(pct * 100).toFixed(1)}`;
  };

  return (
    <>
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
              selected={allSelectedIds.has(v.id)}
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
              bannerVars.map((v) => (
                <VariablePill
                  key={v.id}
                  variable={v}
                  selected
                  showLeftArrow
                  onClick={() => onBannerRemove(v.id)}
                />
              ))
            )}
          </div>
          <div className="dp-updown-bar">
            <span className="dp-updown-label">Up/Down</span>
            <button className="dp-updown-btn" onClick={() => onBannerMoveDown(bannerVars.length - 1)} aria-label="Move down">↓</button>
            <button className="dp-updown-btn" onClick={() => onBannerMoveUp(0)} aria-label="Move up">↑</button>
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
              mainVars.map((v) => (
                <VariablePill
                  key={v.id}
                  variable={v}
                  selected
                  showLeftArrow
                  onClick={() => onMainRemove(v.id)}
                />
              ))
            )}
          </div>
          <div className="dp-updown-bar">
            <span className="dp-updown-label">Up/Down</span>
            <button className="dp-updown-btn" onClick={() => onMainMoveDown(mainVars.length - 1)} aria-label="Move down">↓</button>
            <button className="dp-updown-btn" onClick={() => onMainMoveUp(0)} aria-label="Move up">↑</button>
          </div>
        </div>
      </div>

      {/* Results area */}
      <div className="dp-content-area">
        {hasResults && (bannerVars.length > 0 || mainVars.length > 0) && (
          <div className="dp-crosstab-toolbar">
            {/* Percent mode toggle */}
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
              {buildingNettId != null && (
                <button className="dp-toolbar-btn" onClick={() => setBuildingNettId(null)}>
                  ✓ Done grouping NETT
                </button>
              )}

              {/* Add Row */}
              <div className="dp-addrow-wrap">
                <button
                  className="dp-toolbar-btn"
                  onClick={() => setShowAddRow((p) => !p)}
                >
                  + Add Row
                </button>
                {showAddRow && (
                  <div className="dp-addrow-menu">
                    <button className="dp-addrow-option" onClick={handleAddSigma}>Sigma</button>
                    <button className="dp-addrow-option" onClick={handleAddMean}>Mean</button>
                    <button
                      className="dp-addrow-option"
                      onClick={() => { setShowNettInput(true); setShowAddRow(false); }}
                    >
                      NETT
                    </button>
                  </div>
                )}
              </div>

              {/* NETT input */}
              {showNettInput && (
                <div className="dp-nett-input-wrap">
                  <input
                    className="dp-nett-input"
                    placeholder="NETT label..."
                    value={nettLabel}
                    onChange={(e) => setNettLabel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddNett()}
                    autoFocus
                  />
                  <button className="dp-nett-ok-btn" onClick={handleAddNett}>Add</button>
                  <button className="dp-nett-cancel-btn" onClick={() => setShowNettInput(false)}>✕</button>
                </div>
              )}

              <button className="dp-toolbar-btn">Table Options</button>
              <button className="dp-toolbar-btn">Export</button>
              <button className="dp-toolbar-btn">Table View</button>
            </div>
          </div>
        )}

        <div className="dp-content-scroll">
          {!hasResults || (bannerVars.length === 0 && mainVars.length === 0) ? (
            <EmptyState />
          ) : (
            <div>
              <div className="dp-cross-block-title">
                Table 1 — Q2_Current approach to AI-powered marketing ×{' '}
                {bannerVars.map((v) => v.label).join(', ') || 'S2_Employee count'}
              </div>
              <div className="dp-cross-table-wrap">
                <table className="dp-cross-table">
                  <thead>
                    <tr>
                      <th className="dp-cross-td--rowctl" aria-hidden />
                      <th className="dp-cross-th--label"></th>
                      <th className="dp-cross-th--num">Total</th>
                      {BANNER_COLS.map((col) => (
                        <th key={col} className="dp-cross-th--num">
                          <span
                            className="dp-editable"
                            contentEditable
                            suppressContentEditableWarning
                          >
                            {col}
                          </span>
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className="dp-cross-td--rowctl" aria-hidden />
                      <th className="dp-cross-th--subhead">
                        {percentMode === 'col' ? 'Col%' : 'Row%'} / Count
                      </th>
                      <th className="dp-cross-th--subhead">Count</th>
                      {BANNER_COLS.map((col) => (
                        <th key={col} className="dp-cross-th--subhead">Count</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, i) => {
                      const isNettable = NETTABLE_ROW_IDXS.includes(i);
                      const isBuildingMember =
                        buildingNettId != null &&
                        nettGroups.find((ng) => ng.id === buildingNettId)?.memberIdxs.includes(i);

                      return (
                        <tr
                          key={i}
                          className={
                            row.isBase
                              ? 'dp-cross-row--base'
                              : row.isSigma
                              ? 'dp-cross-row--sigma'
                              : row.isMean
                              ? 'dp-cross-row--mean'
                              : isBuildingMember
                              ? 'dp-cross-row--nett-child'
                              : ''
                          }
                          onClick={() => isNettable && buildingNettId != null && toggleNettMember(i)}
                          style={buildingNettId != null && isNettable ? { cursor: 'pointer' } : undefined}
                        >
                          <td className="dp-cross-td--rowctl">
                            {row.isBase || row.isSigma ? (
                              <span className="dp-row-link-icon" title="Aggregate row">⛓</span>
                            ) : (
                              <span className="dp-row-updown">
                                <button className="dp-row-updown-btn" aria-label="Move row down">↓</button>
                                <button className="dp-row-updown-btn" aria-label="Move row up">↑</button>
                              </span>
                            )}
                          </td>
                          <td className="dp-cross-td--label">
                            <span
                              className="dp-editable"
                              contentEditable={!row.isBase && !row.isSigma}
                              suppressContentEditableWarning
                              onBlur={(e) => handleEditRowLabel(i, e.currentTarget.textContent ?? '')}
                            >
                              {rowLabels[i] ?? row.label}
                            </span>
                          </td>
                          <td className="dp-cross-td--num">{formatCell(row, true, -1)}</td>
                          {row.colValues.map((_, j) => (
                            <td key={j} className="dp-cross-td--num">
                              {formatCell(row, false, j)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}

                    {/* NETT rows — appended after the standard rows, each with
                        a small caption row showing its formula. */}
                    {nettComputed.map(({ ng, row, caption }) => (
                      <React.Fragment key={ng.id}>
                        <tr className="dp-cross-row--nett">
                          <td className="dp-cross-td--rowctl">
                            <span className="dp-row-link-icon" title="NETT aggregate">⛓</span>
                          </td>
                          <td className="dp-cross-td--label">{row.label}</td>
                          <td className="dp-cross-td--num">{formatCell(row, true, -1)}</td>
                          {row.colValues.map((_, j) => (
                            <td key={j} className="dp-cross-td--num">
                              {formatCell(row, false, j)}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="dp-cross-td--rowctl" />
                          <td
                            className="dp-cross-td--label"
                            colSpan={2 + row.colValues.length}
                            style={{ fontSize: 11, color: '#6b6f7a', fontStyle: 'italic' }}
                          >
                            {caption}
                            {buildingNettId === ng.id && ' — click rows above to add/remove members'}
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CrossTabs;