import React, { useEffect, useRef, useState } from 'react';
import type { Variable } from '../Index';
import VariablePill from '../VariablePill';
import '../DataPlayground.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type FlowState = 'choice' | 'omi-loading' | 'builder' | 'gallery';
type ChartType = 'bar' | 'line' | 'pie' | 'dual';
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

interface MappingRow {
  variable: string;
  chartType: ChartType | 'select';
  linkedVars: string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ChartVisualsProps {
  allVariables: Variable[];
}

// ── Sample loading steps (mirrors the "Generating charts" modal) ────────────

const LOADING_STEPS = [
  'Analyzing selected variables...',
  'Identifying key relationships...',
  'Structuring chart distributions...',
  'Rendering your visualization...',
];

// ── Sample series for the live chart preview ─────────────────────────────────

const CATEGORY_LABELS = ['Figma', 'Sketch', 'XD', 'Photoshop', 'Illustrator', 'AfterEffect'];
const SERIES_2023 = [56, 64, 76, 78, 70, 37];

// ── Chart Gallery data ────────────────────────────────────────────────────────

const GALLERY_TYPES = [
  { id: 'bar', label: 'Bar', icon: '▥' },
  { id: 'line', label: 'Line', icon: '📈' },
  { id: 'pie', label: 'Pie/Polar', icon: '◔' },
  { id: 'dual', label: 'Dual Axes', icon: '⇕' },
] as const;

const GALLERY_PALETTE = ['#8b5cf6', '#34d399', '#f59e0b', '#38bdf8'];

interface GalleryCardSpec {
  id: string;
  seriesCount: number;
  horizontal: boolean;
}

const GALLERY_CARDS: GalleryCardSpec[] = [
  { id: 'g1', seriesCount: 1, horizontal: false },
  { id: 'g2', seriesCount: 2, horizontal: false },
  { id: 'g3', seriesCount: 3, horizontal: false },
  { id: 'g4', seriesCount: 4, horizontal: false },
  { id: 'g5', seriesCount: 1, horizontal: true },
  { id: 'g6', seriesCount: 4, horizontal: true },
];

function seededValue(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return Math.floor((x - Math.floor(x)) * 80) + 15;
}

// Small representative bar-chart card preview — not a pixel copy of every
// Figma variant, but structurally faithful (series count / orientation).
const GalleryCardPreview: React.FC<{ spec: GalleryCardSpec }> = ({ spec }) => {
  const w = 220;
  const h = 120;

  if (spec.horizontal) {
    const barH = 10;
    const gap = 6;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        {CATEGORY_LABELS.map((_, catIdx) => {
          const groupY = catIdx * (spec.seriesCount * (barH + 2) + gap);
          return (
            <g key={catIdx}>
              {Array.from({ length: spec.seriesCount }).map((_, s) => {
                const val = seededValue(catIdx * 7 + s * 3 + 1);
                return (
                  <rect
                    key={s}
                    x={40}
                    y={groupY + s * (barH + 2)}
                    width={(val / 100) * (w - 50)}
                    height={barH}
                    fill={GALLERY_PALETTE[s % GALLERY_PALETTE.length]}
                    opacity={0.9}
                    rx={2}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    );
  }

  const groupW = (w - 20) / CATEGORY_LABELS.length;
  const barW = Math.max(4, (groupW - 6) / spec.seriesCount);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      {CATEGORY_LABELS.map((_, catIdx) => (
        <g key={catIdx}>
          {Array.from({ length: spec.seriesCount }).map((_, s) => {
            const val = seededValue(catIdx * 5 + s * 2 + 3);
            const barH = (val / 100) * (h - 20);
            const x = 10 + catIdx * groupW + s * barW;
            const y = h - 10 - barH;
            return (
              <rect
                key={s}
                x={x}
                y={y}
                width={barW - 2}
                height={barH}
                fill={GALLERY_PALETTE[s % GALLERY_PALETTE.length]}
                opacity={0.9}
                rx={2}
              />
            );
          })}
        </g>
      ))}
      <line x1={8} y1={h - 10} x2={w - 8} y2={h - 10} stroke="#2a2d33" strokeWidth={1} />
    </svg>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

const ChartVisuals: React.FC<ChartVisualsProps> = ({ allVariables }) => {
  const [flow, setFlow] = useState<FlowState>('choice');
  const [loadingStep, setLoadingStep] = useState(0);
  const [showReadyToast, setShowReadyToast] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chart Builder state
  const [selectedVars, setSelectedVars] = useState<Variable[]>([]);
  const [mapping] = useState<MappingRow[]>([
    { variable: 'S6', chartType: 'pie', linkedVars: 'S2, S6' },
    { variable: 'S6', chartType: 'bar', linkedVars: 'S2, S6' },
    { variable: 'S6', chartType: 'line', linkedVars: 'S2, S6' },
    { variable: 'S6', chartType: 'select', linkedVars: 'S3, S6' },
  ]);
  const [props, setProps] = useState<ChartProperties>({
    showLegend: true,
    dataLabel: 'pct',
    showBase: true,
    title1: '',
    title2: '',
    footnote1: '',
    footnote2: '',
  });

  // Chart Gallery state
  const [galleryType, setGalleryType] = useState<ChartType>('bar');
  const [selectedCardId, setSelectedCardId] = useState<string>('g1');

  const selectedIds = new Set(selectedVars.map((v) => v.id));

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const setProp = <K extends keyof ChartProperties>(key: K, value: ChartProperties[K]) => {
    setProps((prev) => ({ ...prev, [key]: value }));
  };

  const handleVarToggle = (v: Variable) => {
    setSelectedVars((prev) => {
      const exists = prev.find((x) => x.id === v.id);
      if (exists) return prev.filter((x) => x.id !== v.id);
      return [...prev, v];
    });
  };

  const runOmiGeneration = () => {
    setFlow('omi-loading');
    setLoadingStep(0);
    let step = 0;
    const advance = () => {
      step += 1;
      if (step < LOADING_STEPS.length) {
        setLoadingStep(step);
        timerRef.current = setTimeout(advance, 900);
      } else {
        setFlow('builder');
        setShowReadyToast(true);
        timerRef.current = setTimeout(() => setShowReadyToast(false), 3200);
      }
    };
    timerRef.current = setTimeout(advance, 900);
  };

  // ── Live preview chart for the Chart Builder ──────────────────────────────

  const renderLivePreview = () => {
    const chartH = 140;
    const barW = 34;
    const gap = 18;
    const totalW = CATEGORY_LABELS.length * (barW + gap);
    const maxVal = 100;

    return (
      <div className="dp-chart-preview-wrap">
        {props.title1 && <div className="dp-chart-title">{props.title1}</div>}
        {props.title2 && <div className="dp-chart-subtitle">{props.title2}</div>}
        <svg viewBox={`0 0 ${totalW + 40} ${chartH + 50}`} className="dp-chart-svg">
          {SERIES_2023.map((val, i) => {
            const barH = (val / maxVal) * chartH;
            const x = 20 + i * (barW + gap);
            const y = chartH - barH + 10;
            return (
              <g key={i}>
                <rect x={x} y={y} width={barW} height={barH} fill="#8b5cf6" rx={3} opacity={0.9} />
                {props.dataLabel !== 'counts' && (
                  <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="10" fill="#ccc">
                    {val}
                  </text>
                )}
                <text x={x + barW / 2} y={chartH + 24} textAnchor="middle" fontSize="9" fill="#9a9eab">
                  {CATEGORY_LABELS[i]}
                </text>
              </g>
            );
          })}
          <line x1="20" y1={chartH + 10} x2={totalW + 20} y2={chartH + 10} stroke="#2a2d33" strokeWidth="1" />
        </svg>
        {props.showBase && <div className="dp-chart-base">Base: All respondents (n=35)</div>}
        {props.showLegend && (
          <div className="dp-chart-legend">
            <div className="dp-chart-legend-item">
              <span className="dp-chart-legend-dot" style={{ background: '#8b5cf6' }} />
              <span className="dp-chart-legend-label">2023</span>
            </div>
          </div>
        )}
        {props.footnote1 && <div className="dp-chart-footnote">{props.footnote1}</div>}
        {props.footnote2 && <div className="dp-chart-footnote">{props.footnote2}</div>}
      </div>
    );
  };

  // ── Screen: initial choice ────────────────────────────────────────────────

  if (flow === 'choice') {
    return (
      <div className="dp-content-area">
        <div className="dp-chart-choice">
          <div className="dp-chart-choice-icons">
            <span>▤</span>
            <span>▥</span>
            <span>📈</span>
            <span>◔</span>
          </div>
          <h3 className="dp-chart-choice-title">Generate Charts</h3>
          <p className="dp-chart-choice-subtitle">
            Build a chart yourself, or let Omi generate one from your selected variables
          </p>
          <div className="dp-chart-choice-actions">
            <button className="dp-chart-choice-btn dp-chart-choice-btn--outline" onClick={() => setFlow('gallery')}>
              ◔ Create Custom Charts
            </button>
            <button className="dp-chart-choice-btn dp-chart-choice-btn--primary" onClick={runOmiGeneration}>
              ✦ Generate Chart using Omi
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Screen: Omi loading ───────────────────────────────────────────────────

  if (flow === 'omi-loading') {
    return (
      <div className="dp-content-area">
        <div className="dp-gen-loader">
          <h3 className="dp-gen-loader-title">Generating charts</h3>
          <p className="dp-gen-loader-subtitle">Content goes here...</p>
          <div className="dp-gen-step">
            <div className="dp-gen-step-left">
              <div className="dp-gen-step-avatar">🤖</div>
              <div className="dp-gen-step-label">Step {loadingStep + 1}/4</div>
            </div>
            <div className="dp-gen-step-right">{LOADING_STEPS[loadingStep]}</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Screen: Chart Gallery ("Create Custom Charts") ────────────────────────

  if (flow === 'gallery') {
    return (
      <div className="dp-content-area">
        <div className="dp-gallery">
          <div className="dp-gallery-sidebar">
            <div className="dp-gallery-sidebar-title">Types of Charts</div>
            <div className="dp-gallery-search">
              <span>🔍</span>
              <input placeholder="Search" readOnly />
            </div>
            {GALLERY_TYPES.map((t) => (
              <button
                key={t.id}
                className={`dp-gallery-type-btn${galleryType === t.id ? ' dp-gallery-type-btn--active' : ''}`}
                onClick={() => setGalleryType(t.id as ChartType)}
              >
                <span className="dp-gallery-type-icon">{t.icon}</span>
                {t.label}
                {t.id === 'dual' && <span className="dp-gallery-type-caret">⌄</span>}
              </button>
            ))}
          </div>

          <div className="dp-gallery-main">
            <div className="dp-gallery-main-title">
              {GALLERY_TYPES.find((t) => t.id === galleryType)?.label} Chart
            </div>
            <div className="dp-gallery-grid">
              {GALLERY_CARDS.map((card) => (
                <div
                  key={card.id}
                  className={`dp-gallery-card${selectedCardId === card.id ? ' dp-gallery-card--selected' : ''}`}
                  onClick={() => setSelectedCardId(card.id)}
                >
                  <div className="dp-gallery-card-label">
                    {GALLERY_TYPES.find((t) => t.id === galleryType)?.label}
                  </div>
                  <div className="dp-gallery-card-rule" />
                  <GalleryCardPreview spec={card} />
                  <div className="dp-gallery-card-legend">
                    {Array.from({ length: card.seriesCount }).map((_, i) => (
                      <span key={i} className="dp-chart-legend-item">
                        <span
                          className="dp-chart-legend-dot"
                          style={{ background: GALLERY_PALETTE[i % GALLERY_PALETTE.length] }}
                        />
                        <span className="dp-chart-legend-label">{2021 + i}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="dp-gallery-footer">
          <button className="dp-gallery-add-btn" onClick={() => setFlow('builder')}>
            + Add Chart
          </button>
        </div>
      </div>
    );
  }

  // ── Screen: Chart Builder ──────────────────────────────────────────────────

  return (
    <>
      {showReadyToast && (
        <div className="dp-toast">
          <span className="dp-toast-icon">✓</span>
          Your chart is ready
          <button className="dp-toast-close" onClick={() => setShowReadyToast(false)}>✕</button>
        </div>
      )}

      {/* All Variables panel */}
      <div className="dp-panel dp-panel--all">
        <div className="dp-panel-header">
          <span className="dp-panel-title">All Variables</span>
          <button className="dp-panel-arrow-btn" aria-label="Select all">→</button>
        </div>
        <div className="dp-var-list">
          {allVariables.map((v) => (
            <VariablePill key={v.id} variable={v} selected={selectedIds.has(v.id)} onClick={handleVarToggle} />
          ))}
        </div>
      </div>

      {/* Selected Variable mapping panel */}
      <div className="dp-panel" style={{ width: 260 }}>
        <div className="dp-panel-header">
          <span className="dp-panel-title">Selected Variable</span>
          <button className="dp-panel-arrow-btn" onClick={() => setSelectedVars([])} aria-label="Clear">←</button>
        </div>
        <div className="dp-var-list" style={{ padding: 0 }}>
          <table className="dp-cb-map-table">
            <thead>
              <tr>
                <th>Variables</th>
                <th>Chart Type</th>
                <th>Variables</th>
              </tr>
            </thead>
            <tbody>
              {mapping.map((row, i) => (
                <tr key={i}>
                  <td><span className="dp-cb-map-chip">{row.variable}</span></td>
                  <td style={{ textTransform: 'capitalize' }}>{row.chartType}</td>
                  <td>{row.linkedVars}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chart Builder main area */}
      <div className="dp-chart-builder">
        <div className="dp-cb-header">
          <span className="dp-cb-title">Chart Builder</span>
          <button className="dp-cb-switch-btn" onClick={() => setFlow('gallery')}>
            Switch to Custom Charts
          </button>
        </div>
        <div className="dp-cb-body">
          <div>
            <div className="dp-cb-field-label">Title 1</div>
            <input
              className="dp-cb-input"
              placeholder="Enter text"
              value={props.title1}
              onChange={(e) => setProp('title1', e.target.value)}
            />
          </div>
          <div>
            <div className="dp-cb-field-label">Title 2</div>
            <input
              className="dp-cb-input"
              placeholder="Enter text"
              value={props.title2}
              onChange={(e) => setProp('title2', e.target.value)}
            />
          </div>

          <div className="dp-cb-filters">
            {['Filter 1', 'Filter 2', 'Filter 3', 'Filter 4'].map((f) => (
              <button key={f} className="dp-cb-filter-chip">{f} ⌄</button>
            ))}
          </div>

          <div className="dp-cb-preview-box">{renderLivePreview()}</div>

          <div>
            <div className="dp-cb-field-label">Footer 1</div>
            <input
              className="dp-cb-input"
              placeholder="Footer text"
              value={props.footnote1}
              onChange={(e) => setProp('footnote1', e.target.value)}
            />
          </div>
          <div>
            <div className="dp-cb-field-label">Title 2</div>
            <input
              className="dp-cb-input"
              placeholder="Enter text"
              value={props.footnote2}
              onChange={(e) => setProp('footnote2', e.target.value)}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default ChartVisuals;