import React, { useState, useCallback } from 'react';
import type { Variable } from '../Index';
import VariablePill from '../VariablePill';
import EmptyState from '../EmptyState';
import '../DataPlayground.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type ChartType = 'bar' | 'line' | 'pie' | 'stacked' | 'column';
type DataLabel = 'counts' | 'pct' | 'both';

interface ChartProperties {
  showLegend: boolean;
  dataLabel: DataLabel;
  showBase: boolean;
  title1: string;
  title2: string;
  footnote1: string;
  footnote2: string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ChartVisualsProps {
  allVariables: Variable[];
  hasResults: boolean;
}

// ── Chart type options ────────────────────────────────────────────────────────

const CHART_TYPES: { id: ChartType; label: string; icon: string }[] = [
  { id: 'bar', label: 'Bar', icon: '▬' },
  { id: 'column', label: 'Column', icon: '▐' },
  { id: 'line', label: 'Line', icon: '╱' },
  { id: 'pie', label: 'Pie', icon: '◕' },
  { id: 'stacked', label: 'Stacked', icon: '▦' },
];

// ── Component ─────────────────────────────────────────────────────────────────

const ChartVisuals: React.FC<ChartVisualsProps> = ({ allVariables, hasResults }) => {
  const [selectedVars, setSelectedVars] = useState<Variable[]>([]);
  const [selectedChart, setSelectedChart] = useState<ChartType>('bar');
  const [showProperties, setShowProperties] = useState(true);
  const [props, setProps] = useState<ChartProperties>({
    showLegend: true,
    dataLabel: 'pct',
    showBase: true,
    title1: '',
    title2: '',
    footnote1: '',
    footnote2: '',
  });

  const selectedIds = new Set(selectedVars.map((v) => v.id));

  const handleVarToggle = useCallback((v: Variable) => {
    setSelectedVars((prev) => {
      const exists = prev.find((x) => x.id === v.id);
      if (exists) return prev.filter((x) => x.id !== v.id);
      return [...prev, v];
    });
  }, []);

  const setProp = <K extends keyof ChartProperties>(key: K, value: ChartProperties[K]) => {
    setProps((prev) => ({ ...prev, [key]: value }));
  };

  // Minimal SVG bar chart for demonstration
  const renderChartPreview = () => {
    const bars = [
      { label: 'AI embedded', value: 29, color: '#00e5b3' },
      { label: 'AI foundational', value: 17, color: '#2563eb' },
      { label: 'AI integrated', value: 49, color: '#7c3aed' },
      { label: 'Isolated pilots', value: 6, color: '#f59e0b' },
    ];
    const maxVal = 100;
    const chartH = 160;
    const barW = 40;
    const gap = 20;
    const totalW = bars.length * (barW + gap);

    if (selectedChart === 'pie') {
      // Simple pie placeholder
      return (
        <div className="dp-chart-preview-wrap">
          <svg viewBox="0 0 200 200" className="dp-chart-svg">
            <circle cx="100" cy="100" r="80" fill="#00e5b3" opacity="0.8" />
            <path d="M100,100 L100,20 A80,80 0 0,1 163,140 Z" fill="#2563eb" />
            <path d="M100,100 L163,140 A80,80 0 0,1 37,140 Z" fill="#7c3aed" />
            <path d="M100,100 L37,140 A80,80 0 0,1 100,20 Z" fill="#f59e0b" opacity="0.7" />
            <text x="100" y="195" textAnchor="middle" fontSize="11" fill="#888">
              {props.title1 || 'Chart Preview'}
            </text>
          </svg>
          {props.showLegend && (
            <div className="dp-chart-legend">
              {bars.map((b) => (
                <div key={b.label} className="dp-chart-legend-item">
                  <span className="dp-chart-legend-dot" style={{ background: b.color }} />
                  <span className="dp-chart-legend-label">{b.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="dp-chart-preview-wrap">
        {props.title1 && <div className="dp-chart-title">{props.title1}</div>}
        {props.title2 && <div className="dp-chart-subtitle">{props.title2}</div>}
        <svg
          viewBox={`0 0 ${totalW + 40} ${chartH + 60}`}
          className="dp-chart-svg"
        >
          {bars.map((b, i) => {
            const barH = (b.value / maxVal) * chartH;
            const x = 20 + i * (barW + gap);
            const y = chartH - barH + 10;
            return (
              <g key={b.label}>
                {selectedChart === 'line' ? (
                  i < bars.length - 1 ? (
                    <line
                      x1={x + barW / 2}
                      y1={y}
                      x2={20 + (i + 1) * (barW + gap) + barW / 2}
                      y2={chartH - (bars[i + 1]!.value / maxVal) * chartH + 10}
                      stroke="#00e5b3"
                      strokeWidth="2"
                    />
                  ) : null
                ) : (
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={barH}
                    fill={b.color}
                    rx="3"
                    opacity="0.85"
                  />
                )}
                {selectedChart === 'line' && (
                  <circle cx={x + barW / 2} cy={y} r="4" fill={b.color} />
                )}
                {props.dataLabel !== 'counts' && (
                  <text
                    x={x + barW / 2}
                    y={y - 5}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#ccc"
                  >
                    {b.value}%
                  </text>
                )}
                <text
                  x={x + barW / 2}
                  y={chartH + 24}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#888"
                >
                  {b.label.split(' ').slice(0, 2).join(' ')}
                </text>
              </g>
            );
          })}
          {/* Baseline */}
          <line x1="20" y1={chartH + 10} x2={totalW + 20} y2={chartH + 10} stroke="#3a3a3a" strokeWidth="1" />
        </svg>
        {props.showBase && (
          <div className="dp-chart-base">Base: All respondents (n=35)</div>
        )}
        {props.showLegend && (
          <div className="dp-chart-legend">
            {bars.map((b) => (
              <div key={b.label} className="dp-chart-legend-item">
                <span className="dp-chart-legend-dot" style={{ background: b.color }} />
                <span className="dp-chart-legend-label">{b.label}</span>
              </div>
            ))}
          </div>
        )}
        {props.footnote1 && <div className="dp-chart-footnote">{props.footnote1}</div>}
        {props.footnote2 && <div className="dp-chart-footnote">{props.footnote2}</div>}
      </div>
    );
  };

  return (
    <>
      {/* All Variables panel */}
      <div className="dp-panel dp-panel--all">
        <div className="dp-panel-header">
          <span className="dp-panel-title">All Variables</span>
          <button className="dp-panel-arrow-btn" aria-label="Select all">→</button>
        </div>
        <div className="dp-var-list">
          {allVariables.map((v) => (
            <VariablePill
              key={v.id}
              variable={v}
              selected={selectedIds.has(v.id)}
              onClick={handleVarToggle}
            />
          ))}
        </div>
      </div>

      {/* Selected Variables panel */}
      <div className="dp-panel" style={{ width: 180 }}>
        <div className="dp-panel-header">
          <span className="dp-panel-title">Selected Variables</span>
          <button
            className="dp-panel-arrow-btn"
            onClick={() => setSelectedVars([])}
            aria-label="Clear"
          >
            ←
          </button>
        </div>
        <div className="dp-var-list">
          {selectedVars.length === 0 ? (
            <p className="dp-panel-empty-hint">Select variables from left</p>
          ) : (
            selectedVars.map((v) => (
              <VariablePill
                key={v.id}
                variable={v}
                selected
                showLeftArrow
                onClick={() => handleVarToggle(v)}
              />
            ))
          )}
        </div>
      </div>

      {/* Chart area + Properties panel */}
      <div className="dp-content-area">
        {/* Chart type selector bar */}
        {hasResults && (
          <div className="dp-chart-typebar">
            {CHART_TYPES.map((ct) => (
              <button
                key={ct.id}
                className={`dp-chart-type-btn${selectedChart === ct.id ? ' dp-chart-type-btn--active' : ''}`}
                onClick={() => setSelectedChart(ct.id)}
                title={ct.label}
              >
                <span className="dp-chart-type-icon">{ct.icon}</span>
                <span className="dp-chart-type-label">{ct.label}</span>
              </button>
            ))}
            <button
              className="dp-chart-prop-toggle"
              onClick={() => setShowProperties((p) => !p)}
            >
              {showProperties ? '▶ Properties' : '◀ Properties'}
            </button>
          </div>
        )}

        <div className="dp-chart-body">
          <div className="dp-content-scroll">
            {!hasResults ? (
              <EmptyState
                title="Data will appear here"
                subtitle="Select variables and generate a chart"
              />
            ) : (
              renderChartPreview()
            )}
          </div>

          {/* Properties panel */}
          {hasResults && showProperties && (
            <div className="dp-properties-panel">
              <div className="dp-properties-title">Properties</div>

              <div className="dp-prop-section">
                <div className="dp-prop-label">Legends</div>
                <label className="dp-prop-toggle-row">
                  <input
                    type="checkbox"
                    checked={props.showLegend}
                    onChange={(e) => setProp('showLegend', e.target.checked)}
                  />
                  <span>Show Legend</span>
                </label>
              </div>

              <div className="dp-prop-section">
                <div className="dp-prop-label">Data Labels</div>
                <label className="dp-prop-radio-row">
                  <input type="radio" name="dl" checked={props.dataLabel === 'counts'} onChange={() => setProp('dataLabel', 'counts')} />
                  <span>Counts</span>
                </label>
                <label className="dp-prop-radio-row">
                  <input type="radio" name="dl" checked={props.dataLabel === 'pct'} onChange={() => setProp('dataLabel', 'pct')} />
                  <span>%</span>
                </label>
                <label className="dp-prop-radio-row">
                  <input type="radio" name="dl" checked={props.dataLabel === 'both'} onChange={() => setProp('dataLabel', 'both')} />
                  <span>Both</span>
                </label>
              </div>

              <div className="dp-prop-section">
                <label className="dp-prop-toggle-row">
                  <input
                    type="checkbox"
                    checked={props.showBase}
                    onChange={(e) => setProp('showBase', e.target.checked)}
                  />
                  <span>Show Base</span>
                </label>
              </div>

              <div className="dp-prop-section">
                <div className="dp-prop-label">Title 1</div>
                <input
                  className="dp-prop-input"
                  value={props.title1}
                  onChange={(e) => setProp('title1', e.target.value)}
                  placeholder="Chart title..."
                />
              </div>

              <div className="dp-prop-section">
                <div className="dp-prop-label">Title 2</div>
                <input
                  className="dp-prop-input"
                  value={props.title2}
                  onChange={(e) => setProp('title2', e.target.value)}
                  placeholder="Subtitle..."
                />
              </div>

              <div className="dp-prop-section">
                <div className="dp-prop-label">Footnote 1</div>
                <input
                  className="dp-prop-input"
                  value={props.footnote1}
                  onChange={(e) => setProp('footnote1', e.target.value)}
                  placeholder="Footnote..."
                />
              </div>

              <div className="dp-prop-section">
                <div className="dp-prop-label">Footnote 2</div>
                <input
                  className="dp-prop-input"
                  value={props.footnote2}
                  onChange={(e) => setProp('footnote2', e.target.value)}
                  placeholder="Footnote..."
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ChartVisuals;