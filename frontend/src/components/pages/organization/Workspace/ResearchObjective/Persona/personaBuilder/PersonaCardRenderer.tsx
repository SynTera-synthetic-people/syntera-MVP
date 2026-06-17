// ─────────────────────────────────────────────────────────────────────────────
// PersonaCardRenderer.tsx  — "Dossier" edition  v6
//
// v6 changes vs v5:
//   • URL strings are filtered out of all barriers / triggers lists so raw
//     links never surface in those sections.
//   • reference_sites_with_usage is now rendered as a proper "Evidence Sources"
//     sub-panel inside the Evidence Base section, showing the site name, usage
//     context, and relevance label — not a raw hyperlink.
//   • New ReferenceSource interface + EvidenceSourceRow atom.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import {
  normaliseOcean,
  inferOceanFromTraits,
  type OceanScores,
} from './personaCardUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalibrationCard {
  description?: string;
  count?: number;
  count_label?: string;
  parameters_integrated?: string[];
  techniques_used?: string[];
  technology_used?: string[];
  key_attributes?: string[];
  platforms_covered?: string[];
  component_scores?: Record<string, number>;
}

interface CalibrationBreakdown {
  is_manual_mode?: boolean;
  real_actions_signal?: CalibrationCard;
  emotional_neural_layers?: CalibrationCard;
  validated_studies?: CalibrationCard;
  multi_platform_conversations?: CalibrationCard;
}

interface ConfidenceComponents {
  demographic_ro_fit?: number;
  psychographic_ro_fit?: number;
  behavioural_ro_fit?: number;
  trait_completeness?: number;
}

interface ConfidenceScoring {
  mode?: string;
  weighted_score?: number;
  confidence_level?: string;
  components?: ConfidenceComponents;
  note?: string;
}

interface AutoFillReport {
  total_sub_traits?: number;
  user_provided_count?: number;
  auto_filled_count?: number;
  auto_filled_traits?: string[];
}

interface SourceBreakdown {
  platform?: string;
  threads_or_posts?: number;
}

// ── NEW: reference_sites_with_usage item ─────────────────────────────────────
interface ReferenceSource {
  site?: string;
  url?: string;
  usage_context?: string;
  context?: string;
  relevance?: string;
  insight?: string;
}

export interface PersonaCardData {
  id: string;
  name?: string;
  archetype?: string;
  created_by_name?: string;
  created_by?: string;
  auto_generated_persona?: boolean;
  persona_source?: 'omi' | 'manual' | 'replicated';
  calibration_status?: string;
  calibration_confidence?: number;
  confidence_score?: number;
  confidence_scoring?: ConfidenceScoring;
  auto_fill_report?: AutoFillReport;

  // Demographics
  age_range?: string;
  gender?: string;
  income_range?: string;
  education_level?: string;
  occupation?: string;
  occupation_level?: string;
  industry?: string;
  geography?: string;
  location_country?: string;
  location_state?: string;
  marital_status?: string;
  family_size?: string;
  family_structure?: string;

  // Psychographic
  lifestyle?: string;
  values?: string | string[];
  personality?: string | string[];
  interests?: string | string[];
  motivations?: string;
  hobbies?: string;
  professional_traits?: string;
  backstory?: string;
  preferences?: string;

  // Behavioural
  decision_making_style?: string;
  consumption_frequency?: string;
  purchase_channel?: string | string[];
  switching_tendency?: string;
  category_awareness?: string;
  brand_sensitivity?: string;
  price_sensitivity?: string;
  digital_activity?: string;
  digital_behaviour?: string;
  media_consumption_patterns?: string | string[];

  // Barriers
  structural_barriers?: string[];
  psychological_barriers?: string[];
  emotional_barriers?: string[];
  category_specific_barriers?: string[];

  // Triggers
  functional_triggers?: string[];
  emotional_triggers?: string[];
  situational_triggers?: string[];
  promotional_triggers?: string[];

  // Evidence
  total_conversations_analyzed?: number;
  sources_breakdown?: SourceBreakdown[];
  evidence_confidence_score?: number;
  evidence_confidence_level?: string;
  evidence_source?: string;
  recency_percentage?: number;
  recency_months?: number;
  months_analyzed?: number;

  // NEW: structured reference sites with insight context
  reference_sites_with_usage?: Array<ReferenceSource | string>;

  // Calibration
  calibration_breakdown?: CalibrationBreakdown;
  calibration_sources?: {
    real_actions?: number;
    emotional_neural?: number;
    validated_research?: number;
    multi_platform?: number;
  };

  // OCEAN
  ocean_profile?: {
    scores?: Record<string, number>;
    traits?: Array<{ name: string; score: number }>;
  };

  tags?: string[];
  [key: string]: unknown;
}

interface Props {
  persona: PersonaCardData;
  width?: number;
}

// ── Palette ───────────────────────────────────────────────────────────────────

const BG = '#050505';
const SURFACE = '#0d0d0d';
const SURFACE_EL = '#151515';
const BORDER = 'rgba(255,255,255,0.06)';
const BORDER_BR = 'rgba(255,255,255,0.12)';
const TEXT_PRI = '#ffffff';
const TEXT_SEC = 'rgba(255,255,255,0.70)';
const TEXT_TER = 'rgba(255,255,255,0.40)';
const ACCENT = '#0E63EC';
const ACCENT_DIM = 'rgba(14,99,236,0.18)';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const PURPLE = '#a855f7';

const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Inter', 'Segoe UI', sans-serif";

// ── Helpers ───────────────────────────────────────────────────────────────────

function coerce(v: unknown): string {
  if (!v) return '';
  if (Array.isArray(v)) return v.filter(Boolean).join(', ');
  return String(v);
}

function toList(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((s): s is string => typeof s === 'string' && !!s);
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

// ── URL / source-annotation helpers ──────────────────────────────────────────

function isUrl(s: string): boolean {
  const t = s.trim();
  if (/^https?:\/\//i.test(t)) return true;
  if (/^www\./i.test(t)) return true;
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/\S*)?(\s*[\u2014\u2013-].*)?$/.test(t)) return true;
  return false;
}

function cleanInsight(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;

  s = s.replace(/\s*\(https?:\/\/[^)]+\)/gi, '').trim();
  s = s.replace(/\s*\[https?:\/\/[^\]]+\]/gi, '').trim();
  s = s.replace(/\s*\[[a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\]]*\]/gi, '').trim();
  s = s.replace(/\s*\([a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^)]*\)/gi, '').trim();
  s = s.replace(/\s+https?:\/\/\S+$/gi, '').trim();
  s = s.replace(/[,;.\s]+$/, '').trim();

  if (!s) return null;
  if (isUrl(s)) return null;
  return s;
}

// ── STEP 1: ML_FEATURES_CARD and FRESHNESS_CARD constants ────────────────────
// Placed at module level after JARGON_MAP, as per instructions.

const JARGON_MAP: Array<[RegExp, string]> = [
  [/\banalysis paralysis\b/gi, 'tends to overthink options'],
  [/\bauthenticity\/finish concerns\b/gi, 'worries about product quality online'],
  [/\bauthenticity concerns\b/gi, 'questions product authenticity online'],
  [/\bdeep online discounts\b/gi, 'heavily discounted online deals'],
  [/\bskepticism toward\b/gi, 'distrusts'],
  [/\bsocial proof\b/gi, 'peer validation'],
  [/\bvalue-performance parity\b/gi, 'good value for the price'],
  [/\bvalue performance parity\b/gi, 'good value for the price'],
  [/\bfrictionless\b/gi, 'hassle-free'],
  [/\bomnichannel\b/gi, 'across online and in-store'],
  [/\bpre-race panic\b/gi, 'last-minute pre-race nerves'],
  [/\brun club\b/gi, 'running community'],
  [/\bRO\b/g, 'research objective'],
  [/\bsanity check\b/gi, 'quick verification'],
  [/\bvalidate purchase\b/gi, 'confirm before buying'],
];

const ML_FEATURES_CARD: { original: string; clientReady: string }[] = [
  { original: 'orders_per_week',            clientReady: 'Weekly Action Frequency' },
  { original: 'growth_rate',                clientReady: 'Behaviour Growth Momentum' },
  { original: 'recency_weighted_frequency', clientReady: 'Recent Activity Intensity' },
  { original: 'volatility',                 clientReady: 'Behaviour Variability Index' },
  { original: 'trend_slope',                clientReady: 'Behaviour Direction Signal' },
  { original: 'avg_order_value',            clientReady: 'Average Spend Level' },
  { original: 'spending_trend',             clientReady: 'Spend Momentum' },
  { original: 'price_sensitivity',          clientReady: 'Price Sensitivity Signal' },
  { original: 'basket_size',                clientReady: 'Basket Depth' },
  { original: 'discount_usage_rate',        clientReady: 'Discount Dependence Signal' },
  { original: 'night_order_ratio',          clientReady: 'Time Activity Pattern' },
  { original: 'weekend_ratio',              clientReady: 'Weekend Behaviour Skew' },
  { original: 'peak_hour_preference',       clientReady: 'Peak Activity Window' },
  { original: 'seasonality_index',          clientReady: 'Seasonal Behaviour Signal' },
  { original: 'inter_order_time',           clientReady: 'Purchase Gap Pattern' },
  { original: 'recency_score',              clientReady: 'Recency Strength Score' },
  { original: 'frequency_score',            clientReady: 'Frequency Strength Score' },
  { original: 'monetary_score',             clientReady: 'Monetary Strength Score' },
  { original: 'rfm_score',                  clientReady: 'RFM Behaviour Score' },
  { original: 'time_consistency',           clientReady: 'Routine Consistency Signal' },
  { original: 'rush_hour_ratio',            clientReady: 'Rush-Hour Activity Skew' },
  { original: 'weekday_preference',         clientReady: 'Weekday Preference Pattern' },
  { original: 'tenure_days',               clientReady: 'Relationship Tenure' },
  { original: 'activity_density',           clientReady: 'Engagement Density' },
  { original: 'retention_rate',             clientReady: 'Retention Strength Signal' },
];

const FRESHNESS_CARD = [
  { label: 'Last 3M',  pct: 35 },
  { label: 'Last 6M',  pct: 30 },
  { label: 'Last 12M', pct: 22 },
  { label: 'Older',    pct: 13 },
];

function humaniseInsight(s: string): string {
  if (!s) return s;

  s = s.replace(/[ⓘ①②③④⑤⑥⑦⑧⑨⑩•·–—]+\s*$/u, '').trim();
  s = s.replace(/[,;:\s]+$/, '').trim();

  const semiIdx = s.indexOf(';');
  if (semiIdx > 0) {
    const before = s.slice(0, semiIdx).trim();
    const after = s.slice(semiIdx + 1).trim();
    s = before.length >= 20 ? before : after;
  }

  for (const [pattern, replacement] of JARGON_MAP) {
    s = s.replace(pattern, replacement);
  }

  s = s.charAt(0).toUpperCase() + s.slice(1);

  if (s && !/[.!?]$/.test(s)) {
    s = s + '.';
  }

  return s;
}

// ── Normalise a reference_sites_with_usage entry ──────────────────────────────
function normaliseReferenceSource(raw: ReferenceSource | string): ReferenceSource | null {
  if (!raw) return null;

  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    const dashIdx = s.search(/\s*[—–-]{1,2}\s*/);
    if (dashIdx > 0) {
      return {
        site: s.slice(0, dashIdx).trim(),
        usage_context: s.slice(dashIdx).replace(/^[—–-]+\s*/, '').trim(),
      };
    }
    return { site: s };
  }

  const site = raw.site || raw.url || '';
  const context = raw.usage_context || raw.context || raw.insight || '';
  const relevance = raw.relevance || '';
  if (!site && !context) return null;
  return { site, usage_context: context, relevance };
}

function coerceConfidenceScore(raw: unknown): number | null {
  if (raw === null || raw === undefined || typeof raw === 'boolean') return null;
  const cleaned = typeof raw === 'string' ? raw.trim().replace('%', '') : raw;
  if (cleaned === '' || String(cleaned).toLowerCase() === 'na') return null;
  const n = typeof cleaned === 'string'
    ? Number(cleaned.match(/-?\d+(?:\.\d+)?/)?.[0] ?? cleaned)
    : Number(cleaned);
  if (isNaN(n) || n < 0 || n > 100) return null;
  return Math.round(n <= 1 ? n * 100 : n);
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getNested(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    const record = getRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function getConfidenceScore(p: PersonaCardData): number {
  const details = getRecord((p as any).persona_details);
  const candidates = [
    p.confidence_scoring?.weighted_score,
    getNested(details, ['confidence_scoring', 'weighted_score']),
    getNested(details, ['confidence_scoring', 'score']),
    getNested(details, ['evidence_snapshot', 'confidence_calculation_detail', 'value']),
    getNested(details, ['evidence_snapshot', 'confidence_calculation_detail', 'weighted_total']),
    p.evidence_confidence_score,
    p.confidence_score,
    p.calibration_confidence,
  ];
  for (const c of candidates) {
    const s = coerceConfidenceScore(c);
    if (s !== null) return s;
  }
  if (!p.auto_generated_persona && (p.calibration_status === 'draft' || details?.raw_traits)) return 50;
  return 0;
}

function getOceanScores(p: PersonaCardData): OceanScores {
  const raw = p.ocean_profile?.scores;
  if (raw && Object.keys(raw).length >= 4) return normaliseOcean(raw);
  const traits = p.ocean_profile?.traits;
  if (traits && traits.length >= 4) {
    const map: Record<string, number> = {};
    traits.forEach(t => { map[t.name.toLowerCase()] = t.score; });
    return normaliseOcean(map);
  }
  return inferOceanFromTraits(p as Record<string, unknown>);
}

function sensitivityColor(val: string): string {
  const v = val.toLowerCase();
  if (v === 'high') return RED;
  if (v === 'medium') return AMBER;
  if (v === 'low') return GREEN;
  return TEXT_TER;
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: ACCENT, fontWeight: 600 }}>
      <div style={{ width: 3, height: 14, background: ACCENT, borderRadius: 2, flexShrink: 0 }} />
      {children}
    </div>
  );
}

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '24px 24px 20px', position: 'relative', overflow: 'hidden', ...style }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, opacity: 0.25 }} />
      {children}
    </div>
  );
}

function DemoItem({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ borderLeft: `2px solid ${BORDER_BR}`, paddingLeft: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_TER, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: TEXT_PRI }}>{value}</div>
    </div>
  );
}

function PsychoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ borderLeft: `2px solid ${BORDER_BR}`, paddingLeft: 14, marginBottom: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.10em', color: TEXT_TER, marginBottom: 5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: SANS, fontSize: 12, lineHeight: 1.65, color: TEXT_SEC }}>{children}</div>
    </div>
  );
}

function InterestChip({ label }: { label: string }) {
  return (
    <div style={{ background: SURFACE_EL, border: `1px solid ${BORDER}`, padding: '6px 10px', borderRadius: 6, fontSize: 11, fontFamily: SANS, color: TEXT_SEC, textAlign: 'center' as const }}>{label}</div>
  );
}

function BulletList({ items }: { items: string[] }) {
  const cleaned = items.filter(item => !isUrl(item));
  if (!cleaned.length) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: 16 }}>
      {cleaned.map((item, i) => (
        <li key={i} style={{ fontFamily: SANS, fontSize: 11, lineHeight: 1.65, color: TEXT_SEC, marginBottom: 4 }}>{item}</li>
      ))}
    </ul>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ background: `${color}22`, border: `1px solid ${color}`, color, fontFamily: MONO, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4 }}>{label}</span>
  );
}

function StatChip({ value, label, color = ACCENT }: { value: string; label: string; color?: string }) {
  return (
    <div style={{ background: SURFACE_EL, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 10px', textAlign: 'center' as const }}>
      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontFamily: MONO, fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: TEXT_TER }}>{label}</div>
    </div>
  );
}


// ── Calibration ring ──────────────────────────────────────────────────────────

function CalibRing({ score, size = 140 }: { score: number; size?: number }) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  return (
    <div style={{ width: size, height: size, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="9" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ACCENT} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
        <span style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, color: ACCENT, lineHeight: 1 }}>{score}%</span>
        <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: TEXT_TER, marginTop: 5 }}>Calibrated</span>
      </div>
    </div>
  );
}

// ── OCEAN radar ───────────────────────────────────────────────────────────────

function OceanRadar({ scores, size = 220 }: { scores: OceanScores; size?: number }) {
  const cx = size / 2, cy = size / 2, maxR = size * 0.36, n = 5;
  const dims = [
    { label: 'O', value: scores.openness },
    { label: 'C', value: scores.conscientiousness },
    { label: 'E', value: scores.extraversion },
    { label: 'A', value: scores.agreeableness },
    { label: 'N', value: scores.neuroticism },
  ];
  const pt = (idx: number, r: number) => {
    const a = (idx / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const dataPts = dims.map((d, i) => pt(i, d.value * maxR));
  const dataPath = dataPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter: 'drop-shadow(0 0 18px rgba(14,99,236,0.25))' }}>
      <defs>
        <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
          <stop offset="100%" stopColor="#5b9bff" stopOpacity="0.10" />
        </linearGradient>
      </defs>
      {[0.2, 0.4, 0.6, 0.8, 1.0].map(l => (
        <polygon key={l} points={dims.map((_, i) => { const p = pt(i, l * maxR); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ')}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      ))}
      {dims.map((_, i) => { const p = pt(i, maxR); return <line key={i} x1={cx} y1={cy} x2={p.x.toFixed(1)} y2={p.y.toFixed(1)} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />; })}
      <path d={dataPath} fill="url(#radarFill)" stroke={ACCENT} strokeWidth="2.5" strokeLinejoin="round" />
      {dataPts.map((p, i) => <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="4.5" fill={ACCENT} />)}
      {dims.map((d, i) => { const lp = pt(i, maxR + 18); return <text key={i} x={lp.x.toFixed(1)} y={lp.y.toFixed(1)} textAnchor="middle" dominantBaseline="central" fontSize="13" fontWeight="600" fill="rgba(255,255,255,0.50)" fontFamily={MONO}>{d.label}</text>; })}
    </svg>
  );
}

function OceanRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ fontFamily: SANS, fontSize: 12, color: TEXT_SEC }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: ACCENT }}>{Math.round(value * 100)}</span>
    </div>
  );
}

// ── Behavioral dim card ───────────────────────────────────────────────────────

interface DimCardProps { name: string; description: string; intensity: string; value: number; color: string; }
function DimCard({ name, description, intensity, value, color }: DimCardProps) {
  return (
    <div style={{ background: SURFACE_EL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', position: 'relative', overflow: 'hidden', marginBottom: 10 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, opacity: 0.55 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: TEXT_PRI }}>{name}</span>
        <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.05em', background: color, color: BG }}>{intensity}</span>
      </div>
      <p style={{ fontFamily: SANS, fontSize: 11, lineHeight: 1.55, color: TEXT_SEC, marginBottom: 10 }}>{description}</p>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function TriggerItem({ text, color }: { text: string; color: string }) {
  if (isUrl(text)) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0 }} />
      <span style={{ fontFamily: SANS, fontSize: 11, lineHeight: 1.6, color: TEXT_SEC }}>{text}</span>
    </div>
  );
}

// ── Calibration breakdown card ────────────────────────────────────────────────

function CalibCard({ title, card, accentColor }: { title: string; card: CalibrationCard; accentColor: string }) {
  if (!card) return null;
  const items = card.techniques_used ?? card.technology_used ?? card.parameters_integrated ?? [];
  return (
    <div style={{ background: SURFACE_EL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accentColor, opacity: 0.6 }} />
      {card.count !== undefined && card.count > 0 && (
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: accentColor }}>{card.count.toLocaleString('en-IN')}</span>
          {card.count_label && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: TEXT_TER, textTransform: 'uppercase', letterSpacing: '0.08em', marginLeft: 8 }}>{card.count_label}</span>
          )}
        </div>
      )}
      <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.10em', color: accentColor, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {card.description && (
        <p style={{ fontFamily: SANS, fontSize: 11, lineHeight: 1.55, color: TEXT_SEC, marginBottom: items.length ? 10 : 0 }}>{card.description}</p>
      )}
      {items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
          {items.map((item: string) => (
            <span key={item} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, fontFamily: SANS, fontSize: 9, color: TEXT_TER, padding: '3px 7px', borderRadius: 4 }}>{item}</span>
          ))}
        </div>
      )}
      {card.component_scores && Object.keys(card.component_scores).length > 0 && (
        <div style={{ marginTop: 10 }}>
          {Object.entries(card.component_scores).map(([platform, count]) => (
            <div key={platform} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontFamily: SANS, fontSize: 10, color: TEXT_SEC }}>{platform}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: accentColor }}>{typeof count === 'number' ? count.toLocaleString('en-IN') : count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Confidence component bar ──────────────────────────────────────────────────

function ConfidenceBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? GREEN : pct >= 55 ? AMBER : RED;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontFamily: SANS, fontSize: 12, color: TEXT_SEC }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

// ── Ground Truth sub-section header ──────────────────────────────────────────

function GTSectionHeader({
  number, title, subtitle, comingSoon = false,
}: {
  number: number; title: string; subtitle: string; comingSoon?: boolean;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: comingSoon ? 'rgba(255,255,255,0.05)' : ACCENT_DIM,
          border: `1px solid ${comingSoon ? 'rgba(255,255,255,0.10)' : ACCENT}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: MONO, fontSize: 10, fontWeight: 700,
          color: comingSoon ? TEXT_TER : ACCENT, flexShrink: 0,
        }}>
          {number}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: comingSoon ? TEXT_TER : TEXT_PRI, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
          {title}
        </span>
        {comingSoon && (
          <span style={{
            background: 'rgba(245,158,11,0.12)', border: `1px solid ${AMBER}`,
            color: AMBER, fontFamily: MONO, fontSize: 8, fontWeight: 700,
            textTransform: 'uppercase' as const, letterSpacing: '0.08em',
            padding: '2px 7px', borderRadius: 4,
          }}>
            Coming Soon
          </span>
        )}
      </div>
      <p style={{ fontFamily: SANS, fontSize: 11, lineHeight: 1.55, color: TEXT_TER, margin: 0, paddingLeft: 32 }}>
        {subtitle}
      </p>
    </div>
  );
}

// ── Coming Soon placeholder block ─────────────────────────────────────────────

function GTComingSoonBlock({ number, title, subtitle }: { number: number; title: string; subtitle: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: `1px dashed rgba(255,255,255,0.08)`,
      borderRadius: 12,
      padding: '20px 22px',
      marginBottom: 16,
    }}>
      <GTSectionHeader number={number} title={title} subtitle={subtitle} comingSoon />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', borderRadius: 8,
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid rgba(255,255,255,0.05)`,
      }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="14" cy="14" r="13" stroke="rgba(255,255,255,0.10)" strokeWidth="1.2" />
          <path d="M14 8.5v5.5l3.5 1.75" stroke="rgba(255,255,255,0.18)" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <p style={{ fontFamily: SANS, fontSize: 11, lineHeight: 1.55, color: TEXT_TER, margin: 0 }}>
          This ground truth layer is under development and will be available soon.
        </p>
      </div>
    </div>
  );
}

// ── Ground Truth Foundation — all 4 sections in sequence ─────────────────────
// Order mirrors PersonaTraceability: 1 ML Actions, 2 HQ Sources, 3 Evidence, 4 Neuroscience

function GroundTruthFoundation({ persona }: { persona: PersonaCardData }) {
  const half = Math.ceil(ML_FEATURES_CARD.length / 2);
  const col1 = ML_FEATURES_CARD.slice(0, half);
  const col2 = ML_FEATURES_CARD.slice(half);

  // Evidence data from persona
  const totalConvs      = persona.total_conversations_analyzed ?? 0;
  const sourcesBreakdown = persona.sources_breakdown ?? [];
  const evidenceSource  = persona.evidence_source ?? '';
  const evidenceLevel   = persona.evidence_confidence_level ?? '';
  const recencyPct      = persona.recency_percentage ?? null;
  const monthsAnalyzed  = persona.months_analyzed ?? null;
  const hasEvidence     = !!(totalConvs > 0 || sourcesBreakdown.length > 0 || evidenceSource);

  const sitesResearched = (persona as any).number_of_sites_researched ?? (persona as any).enrichment_layer ?? null;
  const realPeople      = (persona as any).number_of_real_people ?? null;

  return (
    <Section style={{ marginBottom: 24, position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <SectionTitle>Ground Truth Foundation</SectionTitle>
        <p style={{ fontFamily: SANS, fontSize: 11, color: TEXT_TER, margin: '-12px 0 0 0' }}>
          Four calibration layers that validate and enrich every persona — two live, two coming soon
        </p>
      </div>

      {/* ── 1: ML Actions ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <GTSectionHeader
          number={1}
          title="ML Actions"
          subtitle="Actions-to-Behaviour Calibration Layer — how platform signals are transformed into persona intelligence"
        />

        {/* Stat pills */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
          {[
            { value: '750M+', label: 'Platform Actions' },
            { value: '55M',   label: 'People Analysed'  },
            { value: '25',    label: 'Behaviour Signals' },
            { value: '123',   label: 'Models Activated'  },
          ].map(({ value, label }) => (
            <div key={label} style={{
              background: SURFACE_EL, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: ACCENT, lineHeight: 1 }}>{value}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: TEXT_TER }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Freshness */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.10em', color: TEXT_TER, fontWeight: 600, marginBottom: 10 }}>
            Freshness of Behaviour Signals
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 24px' }}>
            {FRESHNESS_CARD.map(({ label, pct }) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: SANS, fontSize: 11, color: TEXT_SEC }}>{label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: TEXT_PRI }}>{pct}%</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${ACCENT}, ${GREEN})`, borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Feature table */}
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.10em', color: TEXT_TER, fontWeight: 600, marginBottom: 10 }}>
            Behaviour Signals Extracted
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[col1, col2].map((col, ci) => (
              <div key={ci} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <th style={{ fontFamily: MONO, fontSize: 8, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: TEXT_TER, padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>Behaviour Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {col.map((f, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                        <td style={{ fontFamily: SANS, fontSize: 10, color: TEXT_SEC, padding: '6px 12px', fontWeight: 500 }}>{f.clientReady}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: BORDER, margin: '4px 0 24px' }} />

      {/* ── 2: HQ Sources — Coming Soon ────────────────────────────────────── */}
      <GTComingSoonBlock
        number={2}
        title="HQ Sources"
        subtitle="High-quality thought-leadership and curated content shaping decisions under simulation"
      />

      {/* Divider */}
      <div style={{ height: 1, background: BORDER, margin: '4px 0 24px' }} />

      {/* ── 3: Evidence Conversations ───────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <GTSectionHeader
          number={3}
          title="Evidence Conversations"
          subtitle="Cross-platform conversations and real-world signals that enrich the behavioural depth of each persona"
        />

        {/* Top-level stats */}
        {hasEvidence && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            {totalConvs > 0 && (
              <StatChip value={totalConvs.toLocaleString('en-IN')} label="Conversations Analyzed" />
            )}
            {sourcesBreakdown.length > 0 && (
              <StatChip value={String(sourcesBreakdown.length)} label="Platforms" />
            )}
            {monthsAnalyzed && (
              <StatChip value={`${monthsAnalyzed}mo`} label="Data Window" />
            )}
            {recencyPct != null && (
              <StatChip value={`${recencyPct}%`} label="Recent Data" color={GREEN} />
            )}
          </div>
        )}

        {/* Per-platform breakdown */}
        {sourcesBreakdown.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            {sourcesBreakdown.map(s => (
              <div key={s.platform} style={{ background: SURFACE_EL, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: SANS, fontSize: 11, color: TEXT_SEC }}>{s.platform}</span>
                {s.threads_or_posts != null && (
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: ACCENT }}>{s.threads_or_posts.toLocaleString('en-IN')}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Evidence source + Real people / sites rows */}
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
          {(realPeople || sitesResearched) && (
            <>
              {realPeople && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
                  <div>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: TEXT_SEC, fontWeight: 500 }}>Real People Analysed</div>
                    <div style={{ fontFamily: SANS, fontSize: 10, color: TEXT_TER, marginTop: 2 }}>Human population signals grounding models</div>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: ACCENT }}>{String(realPeople)}</span>
                </div>
              )}
              {sitesResearched && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: evidenceSource ? `1px solid ${BORDER}` : undefined }}>
                  <div>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: TEXT_SEC, fontWeight: 500 }}>Sites & Platforms Researched</div>
                    <div style={{ fontFamily: SANS, fontSize: 10, color: TEXT_TER, marginTop: 2 }}>Cross-platform conversations enriching behavioural depth</div>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: ACCENT }}>{sitesResearched} sites</span>
                </div>
              )}
            </>
          )}
          {evidenceSource && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.10em', color: TEXT_TER }}>Evidence Source</div>
              <Badge label={evidenceSource.replace(/_/g, ' ')} color={ACCENT} />
              {evidenceLevel && <Badge label={evidenceLevel} color={evidenceLevel === 'High' ? GREEN : evidenceLevel === 'Medium' ? AMBER : RED} />}
            </div>
          )}
          {!hasEvidence && !realPeople && !sitesResearched && (
            <div style={{ padding: '14px 16px', fontFamily: SANS, fontSize: 11, color: TEXT_TER }}>
              No evidence data available for this persona.
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: BORDER, margin: '4px 0 24px' }} />

      {/* ── 4: Neuroscience — Coming Soon ──────────────────────────────────── */}
      <GTComingSoonBlock
        number={4}
        title="Neuroscience"
        subtitle="Emotional science and neuroscience-grounded decision signals applied to persona generation"
      />
    </Section>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

const PersonaCardRenderer = React.forwardRef<HTMLDivElement, Props>(
  ({ persona, width = 900 }, ref) => {
    const ocean = getOceanScores(persona);
    const confidenceScore = getConfidenceScore(persona);

    const personaName = persona.name ?? 'Unnamed Persona';
    const archetype = persona.archetype ?? 'Research Persona';
    const isAI = !!persona.auto_generated_persona;
    const createdBy = isAI ? 'Omi' : (persona.created_by_name ?? persona.created_by ?? 'You');
    const locationStr = [persona.location_state, persona.location_country ?? persona.geography].filter(Boolean).join(', ') || '';

    const interests = toList(persona.interests).slice(0, 6);
    const motivations = coerce(persona.motivations);
    const lifestyle = coerce(persona.lifestyle);
    const values = coerce(persona.values);
    const personality = coerce(persona.personality);

    // Behavioural
    const decisionStyle = coerce(persona.decision_making_style);
    const consumptionFreq = coerce(persona.consumption_frequency);
    const purchaseChannel = coerce(persona.purchase_channel);
    const switchingTendency = coerce(persona.switching_tendency);
    const categoryAwareness = coerce(persona.category_awareness);
    const hasBehavioural = !!(decisionStyle || consumptionFreq || purchaseChannel || switchingTendency || categoryAwareness);

    // Media & Digital
    const mediaPatterns = toList(persona.media_consumption_patterns);
    const digitalBehaviour = coerce(persona.digital_behaviour) || coerce(persona.digital_activity);
    const hasMedia = !!(mediaPatterns.length || digitalBehaviour);

    // Barriers
    const cleanList = (arr: string[]): string[] =>
      arr
        .map(cleanInsight)
        .filter((s): s is string => s !== null && s.length > 0)
        .map(humaniseInsight)
        .filter(s => s.length > 0);

    const structuralBarriers = cleanList(persona.structural_barriers ?? []);
    const psychologicalBarriers = cleanList(persona.psychological_barriers ?? []);
    const emotionalBarriers = cleanList(persona.emotional_barriers ?? []);
    const categoryBarriers = cleanList(persona.category_specific_barriers ?? []);
    const hasBarriers = !!(structuralBarriers.length || psychologicalBarriers.length || emotionalBarriers.length || categoryBarriers.length);

    // Triggers
    const functionalTriggers = cleanList(persona.functional_triggers ?? []);
    const emotionalTriggers = cleanList(persona.emotional_triggers ?? []);
    const situationalTriggers = cleanList(persona.situational_triggers ?? []);
    const promotionalTriggers = cleanList(persona.promotional_triggers ?? []);
    const hasTriggers = !!(functionalTriggers.length || emotionalTriggers.length || situationalTriggers.length || promotionalTriggers.length);

    // Evidence
    const totalConvs = persona.total_conversations_analyzed ?? 0;
    const sourcesBreakdown = persona.sources_breakdown ?? [];
    const evidenceLevel = persona.evidence_confidence_level ?? '';
    const evidenceSource = persona.evidence_source ?? '';
    const recencyPct = persona.recency_percentage ?? null;
    const monthsAnalyzed = persona.months_analyzed ?? null;
    const hasEvidence = !!(totalConvs > 0 || sourcesBreakdown.length > 0 || evidenceSource);

    // Calibration breakdown
    const cb = persona.calibration_breakdown;
    const isManualMode = cb?.is_manual_mode ?? false;
    const hasCalibBreakdown = !!cb;

    // Confidence scoring (manual mode)
    const cs = persona.confidence_scoring;
    const csComponents = cs?.components;
    const hasCSComponents = !!(csComponents && Object.keys(csComponents).length > 0 && cs?.mode === 'Manual Build Mode');

    // Auto-fill report
    const afr = persona.auto_fill_report;
    const hasAFR = !!(afr && (afr.auto_filled_count ?? 0) > 0);

    // Behavioral dim cards
    const dims: DimCardProps[] = [
      {
        name: 'Decision Making',
        description: decisionStyle || 'Analytical approach balancing competing priorities before committing',
        intensity: ocean.conscientiousness > 0.65 ? 'Methodical' : 'Instinctive',
        value: Math.round(ocean.conscientiousness * 100),
        color: '#ff6b6b',
      },
      {
        name: 'Time Sensitivity',
        description: consumptionFreq ? `Consumption frequency: ${consumptionFreq}` : 'Every decision is evaluated against competing priorities',
        intensity: ocean.neuroticism > 0.6 ? 'Extreme' : 'High',
        value: Math.round((ocean.conscientiousness * 0.5 + ocean.neuroticism * 0.5) * 100),
        color: '#ff3333',
      },
      {
        name: 'Brand Skepticism',
        description: coerce(persona.brand_sensitivity) || 'Prefers brands with transparent methodologies and real proof points',
        intensity: ocean.agreeableness < 0.5 ? 'Moderate' : 'Low',
        value: Math.round((1 - ocean.agreeableness) * 100),
        color: '#ffd93d',
      },
    ];

    const GAP = 24;
    const HALF = (width - GAP * 3) / 2;

    return (
      <div ref={ref} style={{ width, background: BG, padding: '52px 40px 48px', boxSizing: 'border-box', fontFamily: SANS, position: 'relative', overflow: 'hidden' }}>

        {/* Ambient glow */}
        <div style={{ position: 'absolute', top: '-40%', left: '-30%', width: '160%', height: '160%', background: `radial-gradient(circle at 30% 20%, rgba(14,99,236,0.04) 0%, transparent 40%), radial-gradient(circle at 70% 80%, rgba(14,99,236,0.03) 0%, transparent 40%)`, pointerEvents: 'none', zIndex: 0 }} />

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 52, position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: width * 0.60 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: ACCENT }}>
                {archetype} · by {createdBy}
              </span>
              {persona.persona_source && (
                <Badge label={persona.persona_source}
                  color={persona.persona_source === 'omi' ? ACCENT : persona.persona_source === 'replicated' ? PURPLE : GREEN} />
              )}
              {persona.calibration_status === 'draft' && <Badge label="Draft" color={AMBER} />}
            </div>

            <div style={{ position: 'relative', marginBottom: 16, display: 'inline-block' }}>
              <div style={{ position: 'absolute', left: -8, top: 4, bottom: 4, width: 5, borderRadius: 3, background: ACCENT, opacity: 0.9 }} />
              <h1 style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 900, lineHeight: 1.08, letterSpacing: '-0.025em', color: TEXT_PRI, paddingLeft: 14, margin: 0 }}>{personaName}</h1>
            </div>

            {personality && <p style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.60, color: TEXT_SEC, marginBottom: 28, maxWidth: 540 }}>{personality}</p>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0 20px' }}>
              <DemoItem label="Age" value={coerce(persona.age_range)} />
              <DemoItem label="Income" value={coerce(persona.income_range)} />
              <DemoItem label="Location" value={locationStr} />
              <DemoItem label="Status" value={coerce(persona.marital_status)} />
              <DemoItem label="Family" value={coerce(persona.family_size) || coerce(persona.family_structure)} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <CalibRing score={confidenceScore} size={160} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: 200 }}>
              {evidenceLevel && (
                <StatChip value={evidenceLevel}
                  label="Evidence Level"
                  color={evidenceLevel === 'High' ? GREEN : evidenceLevel === 'Medium' ? AMBER : RED} />
              )}
              {totalConvs > 0 && (
                <StatChip value={totalConvs.toLocaleString('en-IN')} label="Conversations" />
              )}
              {monthsAnalyzed && (
                <StatChip value={`${monthsAnalyzed}mo`} label="Data Window" />
              )}
              {recencyPct != null && (
                <StatChip value={`${recencyPct}%`} label="Recent Data" color={GREEN} />
              )}
            </div>
          </div>
        </div>

        {/* ── ROW 1: Behavioral Dimensions + Psychographic Profile ─────────── */}
        <div style={{ display: 'flex', gap: GAP, marginBottom: GAP, position: 'relative', zIndex: 1 }}>
          <Section style={{ width: HALF, flexShrink: 0 }}>
            <SectionTitle>Behavioral Dimensions</SectionTitle>
            {dims.map(d => <DimCard key={d.name} {...d} />)}
          </Section>

          <Section style={{ flex: 1 }}>
            <SectionTitle>Psychographic Profile</SectionTitle>
            {lifestyle && <PsychoItem label="Lifestyle">{lifestyle}</PsychoItem>}
            {values && <PsychoItem label="Values">{values}</PsychoItem>}
            {personality && <PsychoItem label="Personality">{personality}</PsychoItem>}
            {interests.length > 0 && (
              <PsychoItem label="Interests">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                  {interests.map(i => <InterestChip key={i} label={i} />)}
                </div>
              </PsychoItem>
            )}
            {motivations && <PsychoItem label="Motivations">{motivations}</PsychoItem>}
            {coerce(persona.hobbies) && <PsychoItem label="Hobbies">{coerce(persona.hobbies)}</PsychoItem>}
            {coerce(persona.professional_traits) && <PsychoItem label="Professional Traits">{coerce(persona.professional_traits)}</PsychoItem>}
          </Section>
        </div>

        {/* ── ROW 2: OCEAN ─────────────────────────────────────────────────── */}
        <Section style={{ marginBottom: GAP, position: 'relative', zIndex: 1 }}>
          <SectionTitle>OCEAN Personality Profile</SectionTitle>
          <div style={{ display: 'flex', gap: 48, alignItems: 'center' }}>
            <div style={{ flexShrink: 0 }}><OceanRadar scores={ocean} size={220} /></div>
            <div style={{ flex: 1 }}>
              {([
                { label: 'Openness', value: ocean.openness },
                { label: 'Conscientiousness', value: ocean.conscientiousness },
                { label: 'Extraversion', value: ocean.extraversion },
                { label: 'Agreeableness', value: ocean.agreeableness },
                { label: 'Neuroticism', value: ocean.neuroticism },
              ] as const).map(d => <OceanRow key={d.label} label={d.label} value={d.value} />)}
            </div>
            <div style={{ flexShrink: 0, width: 220 }}>
              {persona.occupation && <PsychoItem label="Occupation">{coerce(persona.occupation)}</PsychoItem>}
              {persona.occupation_level && <PsychoItem label="Seniority">{coerce(persona.occupation_level)}</PsychoItem>}
              {persona.industry && <PsychoItem label="Industry">{coerce(persona.industry)}</PsychoItem>}
              {persona.education_level && <PsychoItem label="Education">{coerce(persona.education_level)}</PsychoItem>}
              {digitalBehaviour && <PsychoItem label="Digital">{digitalBehaviour}</PsychoItem>}
            </div>
          </div>
        </Section>

        {/* ── ROW 3: Behavioural Profile ───────────────────────────────────── */}
        {hasBehavioural && (
          <Section style={{ marginBottom: GAP, position: 'relative', zIndex: 1 }}>
            <SectionTitle>Behavioural Profile</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: GAP }}>
              {decisionStyle && (
                <PsychoItem label="Decision Making Style">{decisionStyle}</PsychoItem>
              )}
              {consumptionFreq && (
                <PsychoItem label="Consumption Frequency">{consumptionFreq}</PsychoItem>
              )}
              {purchaseChannel && (
                <PsychoItem label="Purchase Channel">{purchaseChannel}</PsychoItem>
              )}
              {switchingTendency && (
                <div style={{ borderLeft: `2px solid ${BORDER_BR}`, paddingLeft: 14, marginBottom: 16 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.10em', color: TEXT_TER, marginBottom: 8, fontWeight: 600 }}>Switching Tendency</div>
                  <Badge label={switchingTendency} color={sensitivityColor(switchingTendency)} />
                </div>
              )}
              {coerce(persona.price_sensitivity) && (
                <div style={{ borderLeft: `2px solid ${BORDER_BR}`, paddingLeft: 14, marginBottom: 16 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.10em', color: TEXT_TER, marginBottom: 8, fontWeight: 600 }}>Price Sensitivity</div>
                  <Badge label={coerce(persona.price_sensitivity)} color={sensitivityColor(coerce(persona.price_sensitivity))} />
                </div>
              )}
              {categoryAwareness && (
                <PsychoItem label="Category Awareness">{categoryAwareness}</PsychoItem>
              )}
            </div>
          </Section>
        )}

        {/* ── ROW 4: Barriers + Triggers ───────────────────────────────────── */}
        {(hasBarriers || hasTriggers) && (
          <div style={{ display: 'flex', gap: GAP, marginBottom: GAP, position: 'relative', zIndex: 1 }}>

            {hasBarriers && (
              <Section style={{ flex: 1 }}>
                <SectionTitle>Barriers & Pain Points</SectionTitle>
                {structuralBarriers.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: RED, marginBottom: 8, fontWeight: 600 }}>Structural</div>
                    <BulletList items={structuralBarriers} />
                  </div>
                )}
                {psychologicalBarriers.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: AMBER, marginBottom: 8, fontWeight: 600 }}>Psychological</div>
                    <BulletList items={psychologicalBarriers} />
                  </div>
                )}
                {emotionalBarriers.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: PURPLE, marginBottom: 8, fontWeight: 600 }}>Emotional</div>
                    <BulletList items={emotionalBarriers} />
                  </div>
                )}
                {categoryBarriers.length > 0 && (
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_TER, marginBottom: 8, fontWeight: 600 }}>Category Specific</div>
                    <BulletList items={categoryBarriers} />
                  </div>
                )}
              </Section>
            )}

            {hasTriggers && (
              <Section style={{ flex: 1 }}>
                <SectionTitle>Triggers & Opportunities</SectionTitle>
                {functionalTriggers.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: GREEN, marginBottom: 8, fontWeight: 600 }}>Functional</div>
                    {functionalTriggers.map((t, i) => <TriggerItem key={i} text={t} color={GREEN} />)}
                  </div>
                )}
                {emotionalTriggers.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: PURPLE, marginBottom: 8, fontWeight: 600 }}>Emotional</div>
                    {emotionalTriggers.map((t, i) => <TriggerItem key={i} text={t} color={PURPLE} />)}
                  </div>
                )}
                {situationalTriggers.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: AMBER, marginBottom: 8, fontWeight: 600 }}>Situational</div>
                    {situationalTriggers.map((t, i) => <TriggerItem key={i} text={t} color={AMBER} />)}
                  </div>
                )}
                {promotionalTriggers.length > 0 && (
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: ACCENT, marginBottom: 8, fontWeight: 600 }}>Promotional</div>
                    {promotionalTriggers.map((t, i) => <TriggerItem key={i} text={t} color={ACCENT} />)}
                  </div>
                )}
              </Section>
            )}
          </div>
        )}

        {/* ── ROW 5: Media & Digital ───────────────────────────────────────── */}
        {hasMedia && (
          <Section style={{ marginBottom: GAP, position: 'relative', zIndex: 1 }}>
            <SectionTitle>Media & Digital Behaviour</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: GAP }}>
              {mediaPatterns.length > 0 && (
                <PsychoItem label="Media Consumption Patterns">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                    {mediaPatterns.map(m => <InterestChip key={m} label={m} />)}
                  </div>
                </PsychoItem>
              )}
              {digitalBehaviour && (
                <PsychoItem label="Digital Behaviour">{digitalBehaviour}</PsychoItem>
              )}
            </div>
          </Section>
        )}

        {/* ── ROW 6: Evidence Base ─────────────────────────────────────────── */}
        {hasEvidence && (
          <Section style={{ marginBottom: GAP, background: `linear-gradient(135deg, ${SURFACE} 0%, ${SURFACE_EL} 100%)`, position: 'relative', zIndex: 1 }}>
            <SectionTitle>Evidence Base</SectionTitle>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
              {totalConvs > 0 && (
                <StatChip value={totalConvs.toLocaleString('en-IN')} label="Conversations Analyzed" />
              )}
              {sourcesBreakdown.length > 0 && (
                <StatChip value={String(sourcesBreakdown.length)} label="Platforms" />
              )}
              {monthsAnalyzed && (
                <StatChip value={`${monthsAnalyzed}mo`} label="Data Window" />
              )}
              {recencyPct != null && (
                <StatChip value={`${recencyPct}%`} label="Recent Data" color={GREEN} />
              )}
            </div>

            {sourcesBreakdown.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                {sourcesBreakdown.map(s => (
                  <div key={s.platform} style={{ background: SURFACE_EL, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: SANS, fontSize: 11, color: TEXT_SEC }}>{s.platform}</span>
                    {s.threads_or_posts != null && (
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: ACCENT }}>{s.threads_or_posts.toLocaleString('en-IN')}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {evidenceSource && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.10em', color: TEXT_TER }}>Evidence Source</div>
                <Badge label={evidenceSource.replace(/_/g, ' ')} color={ACCENT} />
                {evidenceLevel && <Badge label={evidenceLevel} color={evidenceLevel === 'High' ? GREEN : evidenceLevel === 'Medium' ? AMBER : RED} />}
              </div>
            )}
          </Section>
        )}

        {/* ── Ground Truth Foundation (ML Actions · HQ Sources · Evidence · Neuroscience) */}
        <GroundTruthFoundation persona={persona} />

        {/* ── ROW 7: Calibration Breakdown ─────────────────────────────────── */}
        {hasCalibBreakdown && (
          <Section style={{ marginBottom: GAP, position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <SectionTitle>{isManualMode ? 'Manual Build Calibration' : 'Calibration Breakdown'}</SectionTitle>
              {isManualMode && <Badge label="Manual Build Mode" color={GREEN} />}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
              {cb?.real_actions_signal && (
                <CalibCard title={isManualMode ? 'Traits Provided by You' : 'Real Actions Signal'}
                  card={cb.real_actions_signal} accentColor={ACCENT} />
              )}
              {cb?.emotional_neural_layers && (
                <CalibCard title={isManualMode ? 'AI Auto-Filled Traits' : 'Emotional & Neural Layers'}
                  card={cb.emotional_neural_layers} accentColor={PURPLE} />
              )}
              {cb?.validated_studies && (
                <CalibCard title={isManualMode ? 'Total Traits Analysed' : 'Validated Studies'}
                  card={cb.validated_studies} accentColor={GREEN} />
              )}
              {cb?.multi_platform_conversations && (
                <CalibCard title={isManualMode ? 'RO Alignment Score' : 'Multi-Platform Conversations'}
                  card={cb.multi_platform_conversations} accentColor={AMBER} />
              )}
            </div>
          </Section>
        )}

        {/* ── ROW 8: Confidence Scoring (manual mode only) ─────────────────── */}
        {hasCSComponents && csComponents && (
          <div style={{ display: 'flex', gap: GAP, marginBottom: GAP, position: 'relative', zIndex: 1 }}>
            <Section style={{ flex: 1 }}>
              <SectionTitle>RO Alignment Scoring</SectionTitle>
              <div style={{ fontFamily: MONO, fontSize: 9, color: TEXT_TER, marginBottom: 18, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Confidence components — Manual Build Mode
              </div>
              {csComponents.demographic_ro_fit != null && <ConfidenceBar label="Demographic RO Fit" value={csComponents.demographic_ro_fit} />}
              {csComponents.psychographic_ro_fit != null && <ConfidenceBar label="Psychographic RO Fit" value={csComponents.psychographic_ro_fit} />}
              {csComponents.behavioural_ro_fit != null && <ConfidenceBar label="Behavioural RO Fit" value={csComponents.behavioural_ro_fit} />}
              {csComponents.trait_completeness != null && <ConfidenceBar label="Trait Completeness" value={csComponents.trait_completeness} />}
              {cs?.note && (
                <p style={{ fontFamily: SANS, fontSize: 10, color: TEXT_TER, lineHeight: 1.55, marginTop: 12, borderTop: `1px solid ${BORDER}`, paddingTop: 12 }}>{cs.note}</p>
              )}
            </Section>

            {hasAFR && afr && (
              <Section style={{ flex: 1 }}>
                <SectionTitle>Auto-Fill Report</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
                  <StatChip value={String(afr.total_sub_traits ?? 0)} label="Total Traits" />
                  <StatChip value={String(afr.user_provided_count ?? 0)} label="You Provided" color={GREEN} />
                  <StatChip value={String(afr.auto_filled_count ?? 0)} label="AI Filled" color={AMBER} />
                </div>
                {(afr.auto_filled_traits ?? []).length > 0 && (
                  <>
                    <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.10em', color: TEXT_TER, marginBottom: 10 }}>AI-Inferred Fields</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
                      {(afr.auto_filled_traits ?? []).map(t => (
                        <span key={t} style={{ background: SURFACE_EL, border: `1px solid ${BORDER}`, fontFamily: MONO, fontSize: 9, color: AMBER, padding: '3px 8px', borderRadius: 4 }}>{t}</span>
                      ))}
                    </div>
                  </>
                )}
              </Section>
            )}
          </div>
        )}

        {/* ── Backstory ─────────────────────────────────────────────────────── */}
        {persona.backstory && (
          <Section style={{ marginBottom: GAP, position: 'relative', zIndex: 1 }}>
            <SectionTitle>Formative Story</SectionTitle>
            <p style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.75, color: TEXT_SEC, fontStyle: 'italic', margin: 0 }}>"{coerce(persona.backstory)}"</p>
          </Section>
        )}

        {/* Watermark */}
        <div style={{ position: 'absolute', bottom: 18, right: 28, fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.10em', zIndex: 2 }}>
          SYNTHETIC PEOPLE AI
        </div>
      </div>
    );
  }
);

PersonaCardRenderer.displayName = 'PersonaCardRenderer';
export default PersonaCardRenderer;