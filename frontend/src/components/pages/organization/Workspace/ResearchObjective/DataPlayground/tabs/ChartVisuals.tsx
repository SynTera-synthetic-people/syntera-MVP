import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import type { Variable } from '../Index';
import VariablePill from '../VariablePill';
import '../DataPlayground.css';
import OmiKeyboard from '../../../../../../../assets/Omi Animations/OmiKeyboard.mp4';
import { useRunChart } from '../../../../../../../hooks/useDataPlaygroundQueries';
import { extractErrorMessage } from '../../../../../../../services/dataPlaygroundService';
import type { ChartResult } from '../../../../../../../services/dataPlaygroundService';

// ══════════════════════════════════════════════════════════════════════════
// Icons — plain named components, rendered by explicit reference (never via
// dot-notation JSX like <obj.Icon />) to keep this file as boring/portable
// as possible across build setups.
// ══════════════════════════════════════════════════════════════════════════

function IconColumnBars({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="10" width="4" height="10" rx="1" fill="currentColor" />
      <rect x="10" y="5.5" width="4" height="14.5" rx="1" fill="currentColor" />
      <rect x="16.5" y="13" width="4" height="7" rx="1" fill="currentColor" />
    </svg>
  );
}

function IconBarsHorizontal({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4.5" width="13" height="4" rx="1" fill="currentColor" />
      <rect x="3" y="10" width="18" height="4" rx="1" fill="currentColor" />
      <rect x="3" y="15.5" width="9" height="4" rx="1" fill="currentColor" />
    </svg>
  );
}

function IconLineChart({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 15.5 8.5 9.5 12.5 13 21 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21" cy="4.5" r="1.7" fill="currentColor" />
    </svg>
  );
}

function IconPie({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3 A9 9 0 0 1 21 12 L12 12 Z" fill="currentColor" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

function IconDualAxes({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="12" width="3.5" height="8" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="10" y="8" width="3.5" height="12" rx="1" fill="currentColor" opacity="0.55" />
      <path d="M4 8 10 12 14 6 20 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function IconSparkle({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2 L14.2 9.8 22 12 14.2 14.2 12 22 9.8 14.2 2 12 9.8 9.8 Z" fill="currentColor" />
    </svg>
  );
}

function IconSearch({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconArrowLeft({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Returns the icon component for a given chart-family id — used by both
 * the Gallery sidebar and anywhere else that needs to look one up by id. */
function chartTypeIcon(id: ChartType, size = 15) {
  switch (id) {
    case 'bar': return <IconColumnBars size={size} />;
    case 'line': return <IconLineChart size={size} />;
    case 'pie': return <IconPie size={size} />;
    case 'dual': return <IconDualAxes size={size} />;
  }
}

/** Animated loader avatar for the Omi "Generating charts" step — plays the
 * OmiKeyboard clip in a ringed circular frame, per the Figma reference. */
function LoaderAvatar() {
  return (
    <div className="dp-gen-step-avatar-ring">
      <video
        className="dp-gen-step-avatar-video"
        src={OmiKeyboard}
        autoPlay
        loop
        muted
        playsInline
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// Types & constants
// ══════════════════════════════════════════════════════════════════════════

type FlowState = 'choice' | 'omi-loading' | 'preview' | 'builder' | 'gallery';
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

interface ChartVisualsProps {
  allVariables: Variable[];
  workspaceId?: string;
  explorationId?: string;
  datasetId?: string | null;
}

const LOADING_STEPS = [
  'Analyzing selected variables...',
  'Identifying key relationships...',
  'Structuring chart distributions...',
  'Rendering your visualization...',
];

const CATEGORY_LABELS = ['Figma', 'Sketch', 'XD', 'Photoshop', 'Illustrator', 'AfterEffect'];

// Colors pixel-sampled from the Figma "Bar Chart.png" reference: purple
// #7947c4, green #45c276, orange #c37148, teal #2099ad, plus two extra
// tones in the same family for the larger Pie variants (up to 8 categories).
const PALETTE = ['#7947c4', '#45c276', '#c37148', '#2099ad', '#b347c3', '#c3a147', '#4763c3', '#c34774'];

const CHART_TYPE_LIST: { id: ChartType; label: string }[] = [
  { id: 'bar', label: 'Bar' },
  { id: 'line', label: 'Line' },
  { id: 'pie', label: 'Pie/Polar' },
  { id: 'dual', label: 'Dual Axes' },
];

// ══════════════════════════════════════════════════════════════════════════
// Chart Gallery — card specs & tiny SVG preview renderer
// ══════════════════════════════════════════════════════════════════════════

interface GalleryCardSpec {
  id: string;
  kind: ChartType;
  seriesCount: number;
  horizontal?: boolean;
  years: number[];
}

const CARDS_BY_TYPE: Record<ChartType, GalleryCardSpec[]> = {
  bar: [
    { id: 'bar1', kind: 'bar', seriesCount: 1, horizontal: false, years: [2023] },
    { id: 'bar2', kind: 'bar', seriesCount: 2, horizontal: false, years: [2023, 2024] },
    { id: 'bar3', kind: 'bar', seriesCount: 3, horizontal: false, years: [2022, 2023, 2024] },
    { id: 'bar4', kind: 'bar', seriesCount: 4, horizontal: false, years: [2021, 2022, 2023, 2024] },
    { id: 'bar5', kind: 'bar', seriesCount: 1, horizontal: true, years: [2023] },
    { id: 'bar6', kind: 'bar', seriesCount: 4, horizontal: true, years: [2021, 2022, 2023, 2024] },
  ],
  line: [
    { id: 'line1', kind: 'line', seriesCount: 1, years: [2023] },
    { id: 'line2', kind: 'line', seriesCount: 2, years: [2023, 2024] },
    { id: 'line3', kind: 'line', seriesCount: 3, years: [2022, 2023, 2024] },
    { id: 'line4', kind: 'line', seriesCount: 4, years: [2021, 2022, 2023, 2024] },
  ],
  pie: [
    { id: 'pie1', kind: 'pie', seriesCount: 2, years: [] },
    { id: 'pie2', kind: 'pie', seriesCount: 3, years: [] },
    { id: 'pie3', kind: 'pie', seriesCount: 4, years: [] },
    { id: 'pie4', kind: 'pie', seriesCount: 5, years: [] },
    { id: 'pie5', kind: 'pie', seriesCount: 6, years: [] },
    { id: 'pie6', kind: 'pie', seriesCount: 8, years: [] },
  ],
  dual: [
    { id: 'dual1', kind: 'dual', seriesCount: 1, years: [2023] },
    { id: 'dual2', kind: 'dual', seriesCount: 2, years: [2023, 2024] },
  ],
};

function seededValue(seed: number, min = 15, max = 95): number {
  const x = Math.sin(seed) * 10000;
  const frac = x - Math.floor(x);
  return Math.floor(frac * (max - min)) + min;
}

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

function GalleryCardPreview({ spec }: { spec: GalleryCardSpec }) {
  const w = 220;
  const h = 120;

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
                      fill={PALETTE[s % PALETTE.length]}
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
              return <rect key={s} x={x} y={y} width={barW - 1.5} height={barH} fill={PALETTE[s % PALETTE.length]} rx={1.5} />;
            })}
          </g>
        ))}
        <line x1={4} y1={h - 18} x2={w - 4} y2={h - 18} stroke="#2a2d33" strokeWidth={1} />
      </svg>
    );
  }

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
          const color = PALETTE[s % PALETTE.length]!;
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

  if (spec.kind === 'pie') {
    const cx = w / 2;
    const cy = h / 2;
    const rOuter = Math.min(w, h) / 2 - 4;
    const rInner = rOuter * 0.55;
    const raw = Array.from({ length: spec.seriesCount }).map((_, i) => seededValue(i * 9 + spec.seriesCount * 3, 20, 100));
    const total = raw.reduce((a, b) => a + b, 0);
    let angle = 0;
    const segments = raw.map((val, i) => {
      const sweep = (val / total) * 360;
      const seg = { start: angle, end: angle + sweep, color: PALETTE[i % PALETTE.length]! };
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

  // dual
  const groupW = (w - 16) / CATEGORY_LABELS.length;
  const barW = Math.max(4, (groupW - 8) / spec.seriesCount);
  const linePoints = CATEGORY_LABELS.map((_, i) => {
    const val = seededValue(i * 6 + 5, 15, 90);
    return { x: 8 + i * groupW + (groupW - 8) / 2, y: 6 + (1 - val / 100) * (h - 28) };
  });
  const lineColor = PALETTE[spec.seriesCount % PALETTE.length]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      {CATEGORY_LABELS.map((_, catIdx) => (
        <g key={catIdx}>
          {Array.from({ length: spec.seriesCount }).map((_, s) => {
            const val = seededValue(catIdx * 5 + s * 2 + 3, 15, 85);
            const barH = (val / 100) * (h - 26);
            const x = 8 + catIdx * groupW + s * barW;
            const y = h - 18 - barH;
            return <rect key={s} x={x} y={y} width={barW - 1.5} height={barH} fill={PALETTE[s % PALETTE.length]} rx={1.5} />;
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
}

function legendItemsFor(spec: GalleryCardSpec): { label: string; color: string }[] {
  if (spec.kind === 'pie') {
    return CATEGORY_LABELS.slice(0, spec.seriesCount).map((label, i) => ({ label, color: PALETTE[i % PALETTE.length]! }));
  }
  return spec.years.map((year, i) => ({ label: String(year), color: PALETTE[i % PALETTE.length]! }));
}

/** Fallback variable(s) for "Generate Chart using Omi" / "+ Add Chart" when
 * nothing was pre-selected (neither entry screen exposes a picker). Prefers
 * the first non-identifier column — charting a respondent-id column just
 * produces one bar of height 1 per respondent, which isn't a useful default. */
function defaultChartVariables(allVariables: Variable[]): Variable[] {
  const meaningful = allVariables.find((v) => v.dataType !== 'identifier');
  const fallback = meaningful ?? allVariables[0];
  return fallback ? [fallback] : [];
}

// ══════════════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════════════

export default function ChartVisuals({ allVariables, workspaceId, explorationId, datasetId }: ChartVisualsProps) {
  const [flow, setFlow] = useState<FlowState>('choice');
  const [loadingStep, setLoadingStep] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedVars, setSelectedVars] = useState<Variable[]>([]);
  const [galleryType, setGalleryType] = useState<ChartType>('bar');
  const [selectedCardId, setSelectedCardId] = useState<string>('bar1');
  const [chartResult, setChartResult] = useState<ChartResult | null>(null);
  const runChartMutation = useRunChart();

  // A new dataset invalidates any variable selection / fetched chart from
  // the previous one.
  useEffect(() => {
    setSelectedVars([]);
    setChartResult(null);
    setFlow('choice');
  }, [datasetId]);

  const [props, setProps] = useState<ChartProperties>({
    showLegend: true,
    dataLabel: 'pct',
    showBase: true,
    title1: '',
    title2: '',
    footnote1: '',
    footnote2: '',
  });

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (stepTimer.current) clearTimeout(stepTimer.current);
    };
  }, []);

  function setProp<K extends keyof ChartProperties>(key: K, value: ChartProperties[K]) {
    setProps((prev) => ({ ...prev, [key]: value }));
  }

  function toggleVariable(v: Variable) {
    setSelectedVars((prev) => (prev.some((x) => x.id === v.id) ? prev.filter((x) => x.id !== v.id) : [...prev, v]));
  }

  function flashToast(ms = 3200) {
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), ms);
  }

  function goToChoice() {
    if (stepTimer.current) clearTimeout(stepTimer.current);
    setFlow('choice');
  }

  function goToGallery() {
    setFlow('gallery');
  }

  function startOmiGeneration() {
    if (!datasetId) {
      toast.error('Upload a dataset first');
      return;
    }
    // Neither this screen nor the loading screen expose a variable picker
    // (it only appears after generation, in Preview/Builder) — so "let Omi
    // generate one from your selected variables" has to fall back to a
    // sensible default when nothing's been pre-selected yet, rather than
    // dead-ending on an error toast the user has no way to resolve here.
    const effectiveVars = selectedVars.length > 0 ? selectedVars : defaultChartVariables(allVariables);
    if (effectiveVars.length === 0) {
      toast.error('No variables available. Upload a dataset first.');
      return;
    }

    setFlow('omi-loading');
    setLoadingStep(0);

    // Fire the real fetch in parallel with the loading animation — Omi's
    // "suggestion" heuristic in V1 is simple: two-or-more variables get a
    // dual-axis chart, otherwise a bar chart.
    const chartType: ChartType = effectiveVars.length >= 2 ? 'dual' : 'bar';
    const fetchPromise = runChartMutation.mutateAsync({
      ...(workspaceId !== undefined ? { workspaceId } : {}),
      ...(explorationId !== undefined ? { explorationId } : {}),
      datasetId,
      variables: effectiveVars.map((v) => v.id),
      chartType,
    });

    let step = 0;
    const advance = () => {
      step += 1;
      if (step < LOADING_STEPS.length) {
        setLoadingStep(step);
        stepTimer.current = setTimeout(advance, 900);
      } else {
        fetchPromise
          .then((result) => {
            setChartResult(result);
            setSelectedVars(effectiveVars); // keep the mapping table in sync with what was fetched
            setGalleryType(chartType); // keep the "what did we actually request" type in sync too
            setFlow('preview');
            flashToast();
          })
          .catch((err) => {
            toast.error(extractErrorMessage(err, 'Failed to generate chart'));
            setFlow('choice');
          });
      }
    };
    stepTimer.current = setTimeout(advance, 900);
  }

  function selectGalleryType(id: ChartType) {
    setGalleryType(id);
    const first = CARDS_BY_TYPE[id][0];
    if (first) setSelectedCardId(first.id);
  }

  async function addChartFromGallery() {
    if (!datasetId) {
      toast.error('Upload a dataset first');
      return;
    }
    // Same reasoning as startOmiGeneration: the Gallery screen has no
    // variable picker either, so fall back to a default instead of a
    // dead-end error.
    const effectiveVars = selectedVars.length > 0 ? selectedVars : defaultChartVariables(allVariables);
    if (effectiveVars.length === 0) {
      toast.error('No variables available. Upload a dataset first.');
      return;
    }
    try {
      const result = await runChartMutation.mutateAsync({
        ...(workspaceId !== undefined ? { workspaceId } : {}),
        ...(explorationId !== undefined ? { explorationId } : {}),
        datasetId,
        variables: effectiveVars.map((v) => v.id),
        chartType: galleryType,
      });
      setChartResult(result);
      setSelectedVars(effectiveVars);
      setFlow('builder');
      flashToast();
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to generate chart'));
    }
  }

  const selectedIds = new Set(selectedVars.map((v) => v.id));

  // The chart type actually being displayed right now. In Builder mode this
  // is whatever the user explicitly picked in the Gallery (galleryType) —
  // that's the source of truth for "what did I ask for", and trusting it
  // over the backend's echoed chart_type means picking "Line" and adding it
  // always renders a line chart even if the API doesn't echo the type back
  // exactly. In Preview mode (the Omi-generated result) there's no manual
  // picker, so the backend's chart_type is authoritative there instead.
  const isBuilder = flow === 'builder';
  const currentChartType: ChartType = isBuilder
    ? galleryType
    : (chartResult?.chart_type as ChartType) ?? galleryType;

  // ── Live chart preview shared by Preview & Builder ────────────────────────
  // Renders bar / line / pie / dual based on currentChartType — previously
  // this always drew bars regardless of what was actually generated or
  // picked in the Gallery, which is why switching chart types looked like
  // it "did nothing."

  function LivePreview() {
    const chartH = 140;
    const barW = 34;
    const gap = 18;
    const labels = chartResult?.labels ?? [];
    const seriesList = chartResult?.series ?? [];
    const primary = seriesList[0];
    const secondary = seriesList[1];
    const values = primary?.values ?? [];
    const totalW = Math.max(labels.length, 1) * (barW + gap);
    // Scale to the real data's own range, not a fixed 100 — real counts are
    // often far below 100, which made bars/lines render as barely-visible
    // slivers hugging the bottom of the chart.
    const maxVal = Math.max(1, ...values, ...(secondary?.values ?? []));

    function renderBars(barValues: number[], color: string) {
      return barValues.map((val, i) => {
        const barH = (val / maxVal) * chartH;
        const x = 20 + i * (barW + gap);
        const y = chartH - barH + 10;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} fill={color} rx={3} opacity={0.9} />
            {props.dataLabel !== 'counts' && (
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="10" fill="#ccc">{val}</text>
            )}
            <text x={x + barW / 2} y={chartH + 24} textAnchor="middle" fontSize="9" fill="#9a9eab">{labels[i]}</text>
          </g>
        );
      });
    }

    function renderChart() {
      if (!chartResult) {
        return <div style={{ color: '#9a9eab', fontSize: 12, padding: '20px 0' }}>No chart data yet.</div>;
      }

      if (currentChartType === 'pie') {
        const w = 260;
        const h = 220;
        const cx = w / 2;
        const cy = h / 2;
        const rOuter = Math.min(w, h) / 2 - 10;
        const rInner = rOuter * 0.55;
        const total = values.reduce((a, b) => a + b, 0) || 1;
        let angle = 0;
        const segments = values.map((val, i) => {
          const sweep = (val / total) * 360;
          const seg = { start: angle, end: angle + sweep, color: PALETTE[i % PALETTE.length]!, label: labels[i], val };
          angle += sweep;
          return seg;
        });
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
              {segments.map((seg, i) => (
                <path key={i} d={donutSegmentPath(cx, cy, rOuter, rInner, seg.start, seg.end)} fill={seg.color} />
              ))}
              <text x={cx} y={cy + 6} textAnchor="middle" fontSize="18" fontWeight={700} fill="#f5f6f7">{total}</text>
            </svg>
            <div className="dp-chart-legend">
              {segments.map((seg, i) => (
                <div key={i} className="dp-chart-legend-item">
                  <span className="dp-chart-legend-dot" style={{ background: seg.color }} />
                  <span className="dp-chart-legend-label">{seg.label}: {seg.val}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      if (currentChartType === 'line') {
        const stepX = labels.length > 1 ? (totalW - 20) / (labels.length - 1) : 0;
        const points = values.map((val, i) => ({
          x: 20 + i * stepX,
          y: chartH - (val / maxVal) * chartH + 10,
        }));
        const color = '#7947c4';
        return (
          <svg viewBox={`0 0 ${totalW + 40} ${chartH + 50}`} className="dp-chart-svg">
            <path d={smoothPath(points)} fill="none" stroke={color} strokeWidth={2} />
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={3.5} fill="#121317" stroke={color} strokeWidth={1.8} />
                {props.dataLabel !== 'counts' && (
                  <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="10" fill="#ccc">{values[i]}</text>
                )}
                <text x={p.x} y={chartH + 24} textAnchor="middle" fontSize="9" fill="#9a9eab">{labels[i]}</text>
              </g>
            ))}
            <line x1="20" y1={chartH + 10} x2={totalW + 20} y2={chartH + 10} stroke="#2a2d33" strokeWidth="1" />
          </svg>
        );
      }

      if (currentChartType === 'dual' && secondary) {
        const stepX = labels.length > 1 ? (totalW - 20) / (labels.length - 1) : 0;
        const linePoints = secondary.values.map((val, i) => ({
          x: 20 + i * stepX + barW / 2,
          y: chartH - (val / maxVal) * chartH + 10,
        }));
        const lineColor = '#45c276';
        return (
          <svg viewBox={`0 0 ${totalW + 40} ${chartH + 50}`} className="dp-chart-svg">
            {renderBars(values, '#7947c4')}
            <path d={smoothPath(linePoints)} fill="none" stroke={lineColor} strokeWidth={2} />
            {linePoints.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3} fill="#121317" stroke={lineColor} strokeWidth={1.6} />
            ))}
            <line x1="20" y1={chartH + 10} x2={totalW + 20} y2={chartH + 10} stroke="#2a2d33" strokeWidth="1" />
          </svg>
        );
      }

      // 'bar', and 'dual' without a second series to plot as a line
      return (
        <svg viewBox={`0 0 ${totalW + 40} ${chartH + 50}`} className="dp-chart-svg">
          {renderBars(values, '#7947c4')}
          <line x1="20" y1={chartH + 10} x2={totalW + 20} y2={chartH + 10} stroke="#2a2d33" strokeWidth="1" />
        </svg>
      );
    }

    return (
      <div className="dp-chart-preview-wrap">
        {props.title1 && <div className="dp-chart-title">{props.title1}</div>}
        {props.title2 && <div className="dp-chart-subtitle">{props.title2}</div>}
        {renderChart()}
        {props.showBase && <div className="dp-chart-base">Base: All respondents (n={chartResult?.base ?? 0})</div>}
        {props.showLegend && primary && currentChartType !== 'pie' && (
          <div className="dp-chart-legend">
            <div className="dp-chart-legend-item">
              <span className="dp-chart-legend-dot" style={{ background: '#7947c4' }} />
              <span className="dp-chart-legend-label">{primary.name}</span>
            </div>
            {secondary && currentChartType === 'dual' && (
              <div className="dp-chart-legend-item">
                <span className="dp-chart-legend-dot" style={{ background: '#45c276' }} />
                <span className="dp-chart-legend-label">{secondary.name}</span>
              </div>
            )}
          </div>
        )}
        {props.footnote1 && <div className="dp-chart-footnote">{props.footnote1}</div>}
        {props.footnote2 && <div className="dp-chart-footnote">{props.footnote2}</div>}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // Screen: initial choice
  // ══════════════════════════════════════════════════════════════════════

  if (flow === 'choice') {
    return (
      <div className="dp-content-area">
        <div className="dp-chart-choice">
          <div className="dp-chart-choice-icons">
            <IconColumnBars size={22} />
            <IconBarsHorizontal size={22} />
            <IconLineChart size={22} />
            <IconPie size={22} />
          </div>
          <h3 className="dp-chart-choice-title">Generate Charts</h3>
          <p className="dp-chart-choice-subtitle">
            Build a chart yourself, or let Omi generate one from your selected variables
          </p>
          <div className="dp-chart-choice-actions">
            <button type="button" className="dp-chart-choice-btn dp-chart-choice-btn--outline" onClick={goToGallery}>
              <IconPie size={15} /> Create Custom Charts
            </button>
            <button type="button" className="dp-chart-choice-btn dp-chart-choice-btn--primary" onClick={startOmiGeneration}>
              <IconSparkle size={15} /> Generate Chart using Omi
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // Screen: Omi loading
  // ══════════════════════════════════════════════════════════════════════

  if (flow === 'omi-loading') {
    return (
      <div className="dp-content-area">
        <div className="dp-gen-loader">
          <h3 className="dp-gen-loader-title">Generating charts</h3>
          <p className="dp-gen-loader-subtitle">Content goes here...</p>
          <div className="dp-gen-step">
            <div className="dp-gen-step-left">
              <div className="dp-gen-step-avatar"><LoaderAvatar /></div>
              <div className="dp-gen-step-label">Step {loadingStep + 1}/4</div>
            </div>
            <div className="dp-gen-step-right">{LOADING_STEPS[loadingStep]}</div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // Screen: Chart Gallery ("Create Custom Charts")
  // ══════════════════════════════════════════════════════════════════════

  if (flow === 'gallery') {
    const cards = CARDS_BY_TYPE[galleryType];
    const activeLabel = CHART_TYPE_LIST.find((t) => t.id === galleryType)?.label ?? '';

    return (
      <div className="dp-content-area">
        <div className="dp-gallery">
          <div className="dp-gallery-sidebar">
            <button type="button" className="dp-gallery-back-btn" onClick={goToChoice}>
              <IconArrowLeft size={13} /> Back
            </button>
            <div className="dp-gallery-sidebar-title">Types of Charts</div>
            <div className="dp-gallery-search">
              <IconSearch />
              <input placeholder="Search" readOnly />
            </div>
            {CHART_TYPE_LIST.map((t) => (
              <button
                key={t.id}
                type="button"
                className={'dp-gallery-type-btn' + (galleryType === t.id ? ' dp-gallery-type-btn--active' : '')}
                onClick={() => selectGalleryType(t.id)}
              >
                <span className="dp-gallery-type-icon">{chartTypeIcon(t.id)}</span>
                {t.label}
                {t.id === 'dual' && <span className="dp-gallery-type-caret">⌄</span>}
              </button>
            ))}
          </div>

          <div className="dp-gallery-main">
            <div className="dp-gallery-main-title">{activeLabel} Chart</div>
            <div className="dp-gallery-grid">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className={'dp-gallery-card' + (selectedCardId === card.id ? ' dp-gallery-card--selected' : '')}
                  onClick={() => setSelectedCardId(card.id)}
                >
                  <div className="dp-gallery-card-label">{activeLabel}</div>
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
          <button type="button" className="dp-gallery-add-btn" onClick={addChartFromGallery}>
            + Add Chart
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // Screens: Preview (Omi result) / Chart Builder (manual, full editing)
  //
  // Both render the same underlying chart mapping: one row per selected
  // variable, showing the chart type that was actually fetched and the
  // full set of variables that went into that request.
  // ══════════════════════════════════════════════════════════════════════

  const visibleMapping: MappingRow[] = selectedVars.map((v) => ({
    variable: v.id,
    chartType: currentChartType,
    linkedVars: selectedVars.map((sv) => sv.id).join(', '),
  }));

  return (
    <>
      {toastVisible && (
        <div className="dp-toast">
          <span className="dp-toast-icon">✓</span>
          Your chart is ready
          <button type="button" className="dp-toast-close" onClick={() => setToastVisible(false)}>✕</button>
        </div>
      )}

      <div className="dp-panel dp-panel--all">
        <div className="dp-panel-header">
          <div className="dp-panel-header-left">
            <button type="button" className="dp-panel-back-btn" onClick={goToChoice} aria-label="Back to chart options" title="Back to chart options">
              <IconArrowLeft size={13} />
            </button>
            <span className="dp-panel-title">All Variables</span>
          </div>
        </div>
        <div className="dp-var-list">
          {allVariables.map((v) => (
            <VariablePill key={v.id} variable={v} variant="source" added={selectedIds.has(v.id)} onClick={toggleVariable} />
          ))}
        </div>
      </div>

      <div className="dp-panel" style={{ width: 260 }}>
        <div className="dp-panel-header">
          <span className="dp-panel-title">Selected Variable</span>
          <button type="button" className="dp-panel-arrow-btn" onClick={() => setSelectedVars([])} aria-label="Clear">←</button>
        </div>
        <div className="dp-var-list" style={{ padding: 0 }}>
          <table className="dp-cb-map-table">
            <thead>
              <tr>
                <th>Variables</th>
                <th>Chart Type</th>
                <th>{isBuilder ? 'Slicer/Filter' : 'Variables'}</th>
              </tr>
            </thead>
            <tbody>
              {visibleMapping.map((row, i) => (
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

      <div className="dp-chart-builder">
        <div className="dp-cb-header">
          <span className="dp-cb-title">{isBuilder ? 'Chart Builder' : 'Preview'}</span>
          {isBuilder ? (
            <button type="button" className="dp-cb-switch-btn" onClick={() => setFlow('preview')}>
              Switch to Omi Generated Charts
            </button>
          ) : (
            <button type="button" className="dp-cb-switch-btn" onClick={() => setFlow('builder')}>
              Switch to Custom Charts
            </button>
          )}
        </div>
        <div className="dp-cb-body">
          <div>
            <div className="dp-cb-field-label">Title 1</div>
            <input className="dp-cb-input" placeholder="Enter text" value={props.title1} onChange={(e) => setProp('title1', e.target.value)} />
          </div>
          <div>
            <div className="dp-cb-field-label">Title 2</div>
            <input className="dp-cb-input" placeholder="Enter text" value={props.title2} onChange={(e) => setProp('title2', e.target.value)} />
          </div>

          {isBuilder && (
            <div className="dp-cb-filters">
              {['Filter 1', 'Filter 2', 'Filter 3', 'Filter 4'].map((f) => (
                <button key={f} type="button" className="dp-cb-filter-chip">{f} ⌄</button>
              ))}
            </div>
          )}

          <div className="dp-cb-preview-box"><LivePreview /></div>

          <div>
            <div className="dp-cb-field-label">Footer 1</div>
            <input className="dp-cb-input" placeholder="Footer text" value={props.footnote1} onChange={(e) => setProp('footnote1', e.target.value)} />
          </div>
          <div>
            <div className="dp-cb-field-label">Title 2</div>
            <input className="dp-cb-input" placeholder="Enter text" value={props.footnote2} onChange={(e) => setProp('footnote2', e.target.value)} />
          </div>
        </div>
      </div>
    </>
  );
}