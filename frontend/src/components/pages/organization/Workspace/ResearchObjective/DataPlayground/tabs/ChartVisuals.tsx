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
//
// Colors pixel-sampled directly from the Figma "Bar Chart.png" reference:
// purple #7947c4, green #45c276, orange #c37148, teal #2099ad. Two extra
// tones (violet / gold) are added in the same family for the larger Pie
// variants which use up to 8 categories.

const GALLERY_TYPES = [
  { id: 'bar', label: 'Bar', icon: '▥' },
  { id: 'line', label: 'Line', icon: '📈' },
  { id: 'pie', label: 'Pie/Polar', icon: '◔' },
  { id: 'dual', label: 'Dual Axes', icon: '⇕' },
] as const;

const GALLERY_PALETTE = ['#7947c4', '#45c276', '#c37148', '#2099ad', '#b347c3', '#c3a147', '#4763c3', '#c34774'];

interface GalleryCardSpec {
  id: string;
  kind: 'bar' | 'line' | 'pie' | 'dual';
  seriesCount: number;
  horizontal?: boolean;
  years: number[];
}

const BAR_CARDS: GalleryCardSpec[] = [
  { id: 'bar1', kind: 'bar', seriesCount: 1, horizontal: false, years: [2023] },
  { id: 'bar2', kind: 'bar', seriesCount: 2, horizontal: false, years: [2023, 2024] },
  { id: 'bar3', kind: 'bar', seriesCount: 3, horizontal: false, years: [2022, 2023, 2024] },
  { id: 'bar4', kind: 'bar', seriesCount: 4, horizontal: false, years: [2021, 2022, 2023, 2024] },
  { id: 'bar5', kind: 'bar', seriesCount: 1, horizontal: true, years: [2023] },
  { id: 'bar6', kind: 'bar', seriesCount: 4, horizontal: true, years: [2021, 2022, 2023, 2024] },
];

const LINE_CARDS: GalleryCardSpec[] = [
  { id: 'line1', kind: 'line', seriesCount: 1, years: [2023] },
  { id: 'line2', kind: 'line', seriesCount: 2, years: [2023, 2024] },
  { id: 'line3', kind: 'line', seriesCount: 3, years: [2022, 2023, 2024] },
  { id: 'line4', kind: 'line', seriesCount: 4, years: [2021, 2022, 2023, 2024] },
];

const PIE_CARDS: GalleryCardSpec[] = [
  { id: 'pie1', kind: 'pie', seriesCount: 2, years: [] },
  { id: 'pie2', kind: 'pie', seriesCount: 3, years: [] },
  { id: 'pie3', kind: 'pie', seriesCount: 4, years: [] },
  { id: 'pie4', kind: 'pie', seriesCount: 5, years: [] },
  { id: 'pie5', kind: 'pie', seriesCount: 6, years: [] },
  { id: 'pie6', kind: 'pie', seriesCount: 8, years: [] },
];

const DUAL_CARDS: GalleryCardSpec[] = [
  { id: 'dual1', kind: 'dual', seriesCount: 1, years: [2023] },
  { id: 'dual2', kind: 'dual', seriesCount: 2, years: [2023, 2024] },
];

const CARDS_BY_TYPE: Record<ChartType, GalleryCardSpec[]> = {
  bar: BAR_CARDS,
  line: LINE_CARDS,
  pie: PIE_CARDS,
  dual: DUAL_CARDS,
};

function seededValue(seed: number, min = 15, max = 95): number {
  const x = Math.sin(seed) * 10000;
  const frac = x - Math.floor(x);
  return Math.floor(frac * (max - min)) + min;
}

/** Smooth a polyline into a natural curve (Catmull-Rom → cubic Bezier). */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;

  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** SVG path for one donut segment between two angles. */
function donutSegmentPath(cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number): string {
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const p0 = polarPoint(cx, cy, rOuter, startDeg);
  const p1 = polarPoint(cx, cy, rOuter, endDeg);
  const p2 = polarPoint(cx, cy, rInner, endDeg);
  const p3 = polarPoint(cx, cy, rInner, startDeg);
  return [
    `M ${p0.x} ${p0.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${p3.x} ${p3.y}`,
    'Z',
  ].join(' ');
}

// ── Per-type gallery card preview ─────────────────────────────────────────────
// Structurally faithful to each Figma chart family (Bar / Line / Pie / Dual
// Axes) using the sampled color palette — not a pixel copy of every one of
// the ~20 individual card variants, but each TYPE renders as that type.

const GalleryCardPreview: React.FC<{ spec: GalleryCardSpec }> = ({ spec }) => {
  const w = 220;
  const h = 120;

  // ── Bar ──
  if (spec.kind === 'bar') {
    if (spec.horizontal) {
      const barH = 8;
      const rowGap = 4;
      const groupGap = 8;
      return (
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
          {CATEGORY_LABELS.map((_, catIdx) => {
            const groupH = spec.seriesCount * (barH + rowGap);
            const groupY = 4 + catIdx * (groupH + groupGap - rowGap);
            return (
              <g key={catIdx}>
                {Array.from({ length: spec.seriesCount }).map((_, s) => {
                  const val = seededValue(catIdx * 7 + s * 3 + 1);
                  return (
                    <rect
                      key={s}
                      x={2}
                      y={groupY + s * (barH + rowGap)}
                      width={(val / 100) * (w - 10)}
                      height={barH}
                      fill={GALLERY_PALETTE[s % GALLERY_PALETTE.length]}
                      rx={1.5}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      );
    }

    const groupW = (w - 16) / CATEGORY_LABELS.length;
    const barW = Math.max(3, (groupW - 6) / spec.seriesCount);
    return (
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        {CATEGORY_LABELS.map((_, catIdx) => (
          <g key={catIdx}>
            {Array.from({ length: spec.seriesCount }).map((_, s) => {
              const val = seededValue(catIdx * 5 + s * 2 + 3);
              const barH = (val / 100) * (h - 24);
              const x = 8 + catIdx * groupW + s * barW;
              const y = h - 18 - barH;
              return (
                <rect
                  key={s}
                  x={x}
                  y={y}
                  width={barW - 1.5}
                  height={barH}
                  fill={GALLERY_PALETTE[s % GALLERY_PALETTE.length]}
                  rx={1.5}
                />
              );
            })}
          </g>
        ))}
        <line x1={4} y1={h - 18} x2={w - 4} y2={h - 18} stroke="#2a2d33" strokeWidth={1} />
      </svg>
    );
  }

  // ── Line ──
  if (spec.kind === 'line') {
    const stepX = (w - 24) / (CATEGORY_LABELS.length - 1);
    return (
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        <line x1={12} y1={h - 16} x2={w - 12} y2={h - 16} stroke="#2a2d33" strokeWidth={1} />
        {Array.from({ length: spec.seriesCount }).map((_, s) => {
          const points = CATEGORY_LABELS.map((_, i) => {
            const val = seededValue(i * 4 + s * 11 + 2, 15, 92);
            return { x: 12 + i * stepX, y: 6 + (1 - val / 100) * (h - 30) };
          });
          const color = GALLERY_PALETTE[s % GALLERY_PALETTE.length];
          return (
            <g key={s}>
              <path d={smoothPath(points)} fill="none" stroke={color} strokeWidth={2} />
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2.6} fill="#121317" stroke={color} strokeWidth={1.6} />
              ))}
            </g>
          );
        })}
      </svg>
    );
  }

  // ── Pie / Donut ──
  if (spec.kind === 'pie') {
    const cx = w / 2;
    const cy = h / 2;
    const rOuter = Math.min(w, h) / 2 - 4;
    const rInner = rOuter * 0.55;
    const n = spec.seriesCount;
    const raw = Array.from({ length: n }).map((_, i) => seededValue(i * 9 + n * 3, 20, 100));
    const total = raw.reduce((a, b) => a + b, 0);
    let angle = 0;
    const segments = raw.map((val, i) => {
      const sweep = (val / total) * 360;
      const seg = { start: angle, end: angle + sweep, color: GALLERY_PALETTE[i % GALLERY_PALETTE.length] };
      angle += sweep;
      return seg;
    });
    return (
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
        {segments.map((seg, i) => (
          <path key={i} d={donutSegmentPath(cx, cy, rOuter, rInner, seg.start, seg.end)} fill={seg.color} />
        ))}
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize="15" fontWeight={700} fill="#f5f6f7">
          {total}
        </text>
      </svg>
    );
  }

  // ── Dual Axes (bars + overlaid line on a secondary axis) ──
  const barSeriesCount = spec.seriesCount;
  const groupW = (w - 16) / CATEGORY_LABELS.length;
  const barW = Math.max(4, (groupW - 8) / barSeriesCount);
  const linePoints = CATEGORY_LABELS.map((_, i) => {
    const val = seededValue(i * 6 + 5, 15, 90);
    return { x: 8 + i * groupW + (groupW - 8) / 2, y: 6 + (1 - val / 100) * (h - 28) };
  });
  const lineColor = GALLERY_PALETTE[barSeriesCount % GALLERY_PALETTE.length];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      {CATEGORY_LABELS.map((_, catIdx) => (
        <g key={catIdx}>
          {Array.from({ length: barSeriesCount }).map((_, s) => {
            const val = seededValue(catIdx * 5 + s * 2 + 3, 15, 85);
            const barH = (val / 100) * (h - 26);
            const x = 8 + catIdx * groupW + s * barW;
            const y = h - 18 - barH;
            return (
              <rect key={s} x={x} y={y} width={barW - 1.5} height={barH} fill={GALLERY_PALETTE[s % GALLERY_PALETTE.length]} rx={1.5} />
            );
          })}
        </g>
      ))}
      <path d={smoothPath(linePoints)} fill="none" stroke={lineColor} strokeWidth={2} />
      {linePoints.map((p, i) => (
        <rect key={i} x={p.x - 2.5} y={p.y - 2.5} width={5} height={5} fill="#121317" stroke={lineColor} strokeWidth={1.4} transform={`rotate(45 ${p.x} ${p.y})`} />
      ))}
      <line x1={4} y1={h - 18} x2={w - 4} y2={h - 18} stroke="#2a2d33" strokeWidth={1} />
    </svg>
  );
};

/** Legend entries shown under each gallery card — years for time-series
 * chart kinds, category names for pie/donut kinds. */
function legendItemsFor(spec: GalleryCardSpec): { label: string; color: string }[] {
  if (spec.kind === 'pie') {
    return CATEGORY_LABELS.slice(0, spec.seriesCount).map((label, i) => ({
      label,
      color: GALLERY_PALETTE[i % GALLERY_PALETTE.length]!,
    }));
  }
  return spec.years.map((year, i) => ({
    label: String(year),
    color: GALLERY_PALETTE[i % GALLERY_PALETTE.length]!,
  }));
}

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
  const [selectedCardId, setSelectedCardId] = useState<string>('bar1');

  const handleGalleryTypeChange = (type: ChartType) => {
    setGalleryType(type);
    setSelectedCardId(CARDS_BY_TYPE[type][0]!.id);
  };

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
                <rect x={x} y={y} width={barW} height={barH} fill="#7947c4" rx={3} opacity={0.9} />
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
              <span className="dp-chart-legend-dot" style={{ background: '#7947c4' }} />
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
                onClick={() => handleGalleryTypeChange(t.id as ChartType)}
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
              {CARDS_BY_TYPE[galleryType].map((card) => (
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
                    {legendItemsFor(card).map((item, i) => (
                      <span key={i} className="dp-chart-legend-item">
                        <span className="dp-chart-legend-dot" style={{ background: item.color }} />
                        <span className="dp-chart-legend-label">{item.label}</span>
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
            <VariablePill key={v.id} variable={v} variant="source" added={selectedIds.has(v.id)} onClick={handleVarToggle} />
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