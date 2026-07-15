// ─────────────────────────────────────────────────────────────────────────────
// PersonaCardRenderer.tsx  — "Dossier" edition  v10
//
// v10 = v9 + a cross-check pass against the current PersonaPreview.tsx that
// found the v9 changelog described fixes that were never actually applied in
// code. Fixed here for real:
//   • BUG FIX — Source Mix legend overlap/clipped text (STILL BROKEN in v9
//     despite the changelog claiming it was fixed): SourceTypeBar was still
//     using a 3-column CSS grid with overflow:hidden + textOverflow:'ellipsis'
//     per label — the exact construct html2canvas cannot reliably clip,
//     which is what produced the overlapping/clipped "Academic Researcl",
//     "Behaviour Science P", "White Papers & Artic" text in the exported
//     PDF. Now genuinely switched to a single full-width column with a
//     JS-side hard-truncation backstop (truncateLabel()), so label width
//     never depends on CSS ellipsis behaviour.
//   • BUG FIX — Knowledge Enrichment real-data wiring was silently broken:
//     computeKnowledgeEnrichment(persona) was being called as
//     computeKnowledgeEnrichment(persona.id || personaName) — i.e. passed a
//     *string*, not the persona object. Since the function reads
//     persona.ke_source_type_breakdown / persona.ke_confidence off its
//     argument, this meant hasRealBreakdown was always false and the card
//     ALWAYS rendered the seeded placeholder Source Mix instead of real KE
//     Sourcebank data, even for fully enriched personas — silently
//     diverging from PersonaPreview. Fixed to pass the actual persona object.
//   • BUG FIX — Knowledge Enrichment "Confidence Components" bars were
//     hardcoded to the module-level KE_CONFIDENCE_COMPONENTS constant
//     instead of reading the computed knowledgeEnrichment.confidenceComponents
//     prop (which already correctly blends in persona.ke_confidence.components
//     when present) — the prop type didn't even declare the field, so the
//     JSX silently fell back to the hardcoded fallback for every persona.
//     Now reads the real computed value.
//   • BUG FIX — Real Actions Signal confidence was still using the old
//     25/35/40 Dimensions/Depth-Layer/Pattern weighted blend inside
//     computeRealActionsSignal(), even though the v9 changelog said this had
//     been replaced with persona.predominant_patterns.score (matching
//     PersonaPreview's realActionsConfidenceScore). Fixed to read
//     predominant_patterns.score first, falling back to the pattern-only
//     accuracy heuristic — identical priority order to the live preview.
//     Pattern detail chips now also prefer persona.predominant_patterns.patterns
//     (real backend strings) over the depth-layer-derived text, again
//     matching the preview.
//   • BUG FIX — Dimensions Triggered / Depth Layer rows were rendering a
//     numeric accuracy bar + percentage in the PDF (visible in the reported
//     screenshot as stray "100%" bars), even though the changelog said these
//     were demoted to context-only rows matching PersonaPreview's
//     DepthSignalSection (only the Predominant-Patterns row shows a
//     confidence bar there, labelled "Research Objective Alignment").
//     DepthSignalRow now honours a showAccuracy/accuracyLabel flag on each
//     stat, and computeRealActionsSignal sets those flags the same way the
//     preview does.
//
// v9 = v8 + a data-consistency pass against the current PersonaPreview.tsx,
// plus a fix for the Knowledge Enrichment "Source Mix" legend overlapping
// itself in the exported PDF (see v10 notes above — the v9 fix described
// here did not actually land in the code and has now been corrected).
//
// v8 = v7 (calibration-model alignment) + the html2canvas rendering fixes
// that were made on top of v6:
//   • Every CSS gradient background used purely for decoration has been
//     flattened to a solid colour. html2canvas renders multi-stop
//     linear-/radial-gradients unreliably (missing fills, banding, or fully
//     blank regions in the exported PDF), so the Section top-border glow,
//     the page ambient glow, and the freshness-bar fill are now solid
//     colours instead of gradients. (SVG <linearGradient> defs inside the
//     OCEAN radar are untouched — those rasterise fine.)
//   • Every percentage-width bar-fill <div> is now only rendered when its
//     value is > 0, instead of always rendering a 0%-wide div. A handful of
//     html2canvas versions mis-paint zero-width flex/absolute children, so
//     this guard is applied everywhere a confidence/accuracy/intensity bar
//     is drawn (DimCard, ConfidenceBar, Freshness rows, DepthSignalRow).
//
// v7 changes vs v6 — aligned with the calibration model shipped in
// PersonaPreview (Real Actions Signal / Knowledge Enrichment Layer /
// Multi-platform Conversation / Neuroscience-Informed):
//   • Ground Truth Foundation now mirrors the 4-layer model 1:1:
//       1. Real Actions Signal   — ML action stats + freshness (unchanged)
//          PLUS the new Dimensions Triggered / Depth Layer / Pattern
//          Extracted breakdown with the same 25/35/40 weighted confidence
//          formula used in PersonaPreview.
//       2. Knowledge Enrichment Layer — now LIVE (was "HQ Sources — Coming
//          Soon"). Shows the curated-source stat strip, a source-type
//          proportion bar + legend, the 4-component confidence breakdown,
//          and the source-type chip row — same figures as the preview
//          (KE_CONFIDENCE_SCORE = 90, same component list).
//       3. Multi-platform Conversation — the old "Evidence Conversations"
//          block, now also surfaces the confidence-component breakdown
//          when the backend supplies calibration_breakdown.multi_platform_
//          conversations.confidence_components (falls back gracefully).
//       4. Neuroscience-Informed Calibration — still Coming Soon, per the
//          explicit instruction to leave this layer unimplemented for now.
//   • Master Calibration Confidence ring is now the average of the three
//     live layers (Real Actions Signal, Knowledge Enrichment Layer,
//     Multi-platform Conversation) — exactly how PersonaPreview computes
//     masterConfidenceScore — with a breakdown-pill list underneath it,
//     mirroring the hero panel in PersonaPreview.
//   • Removed the old ad-hoc getConfidenceScore()/coerceConfidenceScore()
//     heuristics (superseded by the shared compute* functions below) and
//     the now-redundant "Calibration Breakdown" row that duplicated what
//     Ground Truth Foundation already shows.
//   • Knowledge Enrichment's "random" source total is now seeded off the
//     persona id (deterministic) instead of Math.random(), so repeated
//     PDF exports of the same persona are stable rather than reshuffling
//     numbers on every render.
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
  // Confidence breakdown for the multi-platform-conversation layer. Backend
  // naming has varied historically, so all three aliases are accepted —
  // mirrors the fallback chain used in PersonaPreview.
  confidence_components?: Record<string, number>;
  confidence_breakdown?: Record<string, number>;
  breakdown?: Record<string, number>;
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

// ── Reference source (Evidence Sources sub-panel) ────────────────────────────
interface ReferenceSource {
  site?: string;
  url?: string;
  usage_context?: string;
  context?: string;
  relevance?: string;
  insight?: string;
}

// ── Real Actions Signal — depth-layer inputs (same shape PersonaPreview reads
// off the raw persona / traits payload for stage_2 / stage_3a data) ──────────
interface DepthLayerVerdict {
  pattern_detected?: string;
  behavioral_signal?: string;
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
  // Backend-computed, persisted once by compute_master_calibration_confidence()
  // so the card and the preview page show the same number. Preferred over the
  // live 3-layer client-side average below when present.
  master_calibration_confidence?: number;
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

  // Structured reference sites with insight context
  reference_sites_with_usage?: Array<ReferenceSource | string>;

  // Calibration
  calibration_breakdown?: CalibrationBreakdown;
  calibration_sources?: {
    real_actions?: number;
    emotional_neural?: number;
    validated_research?: number;
    multi_platform?: number;
  };

  // Real Actions Signal — depth-signal inputs (Dimensions / Depth Layer /
  // Pattern Extracted), same fields PersonaPreview reads off the raw payload.
  stage_2_dimensions?: { activated_dimensions?: Array<number | string> };
  stage_3a_depth_layers?: DepthLayerVerdict[];
  evidence?: { action_data?: DepthLayerVerdict[] };

  // OCEAN
  ocean_profile?: {
    scores?: Record<string, number>;
    traits?: Array<{ name: string; score: number }>;
  };

  // Predominant Patterns Extracted — backend-computed Research-Objective-
  // Alignment score for the pattern layer. This is the *only* input that
  // drives Real Actions Signal confidence in PersonaPreview (Dimensions /
  // Depth Layer accuracy are shown for context only), so the PDF card reads
  // it too instead of re-deriving confidence from a 25/35/40 weighted blend.
  predominant_patterns?: {
    score?: number;
    patterns?: string[];
  };

  // Real Knowledge-Enrichment sourcebank data (populated by
  // enrich_persona_ke_sources()). When present, these override the
  // deterministic seeded placeholder so the PDF card matches PersonaPreview's
  // "real data when available, seeded fallback otherwise" behaviour.
  ke_source_type_breakdown?: Record<string, number>;
  ke_confidence?: { overall?: number; components?: Record<string, number> };

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

/** Format large numbers as "16.8M", "750M", "1.2B" etc. Small numbers pass through. */
function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${parseFloat((n / 1_000_000_000).toFixed(1))}B`;
  if (n >= 1_000_000) return `${parseFloat((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1_000) return `${parseFloat((n / 1_000).toFixed(1))}K`;
  return String(n);
}

/** Hard JS-side truncation backstop for labels rendered inside html2canvas
 *  captures. html2canvas does not reliably honour CSS text-overflow:ellipsis,
 *  so any label that could realistically overflow its row must be truncated
 *  here in JS instead of relying on CSS clipping. Used as a safety net only —
 *  layouts that give labels a full row's width (see SourceTypeBar) shouldn't
 *  need to truncate in practice, but arbitrary backend-supplied category
 *  names can still be longer than expected. */
function truncateLabel(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
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

function humaniseInsight(s: string, jargonMap: Array<[RegExp, string]>): string {
  if (!s) return s;

  s = s.replace(/[ⓘ①②③④⑤⑥⑦⑧⑨⑩•·–—]+\s*$/u, '').trim();
  s = s.replace(/[,;:\s]+$/, '').trim();

  const semiIdx = s.indexOf(';');
  if (semiIdx > 0) {
    const before = s.slice(0, semiIdx).trim();
    const after = s.slice(semiIdx + 1).trim();
    s = before.length >= 20 ? before : after;
  }

  for (const [pattern, replacement] of jargonMap) {
    s = s.replace(pattern, replacement);
  }

  s = s.charAt(0).toUpperCase() + s.slice(1);

  if (s && !/[.!?]$/.test(s)) {
    s = s + '.';
  }

  return s;
}

// ── ML Actions / Freshness constants (Real Actions Signal, layer 1) ─────────

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
  { original: 'orders_per_week', clientReady: 'Weekly Action Frequency' },
  { original: 'growth_rate', clientReady: 'Behaviour Growth Momentum' },
  { original: 'recency_weighted_frequency', clientReady: 'Recent Activity Intensity' },
  { original: 'volatility', clientReady: 'Behaviour Variability Index' },
  { original: 'trend_slope', clientReady: 'Behaviour Direction Signal' },
  { original: 'avg_order_value', clientReady: 'Average Spend Level' },
  { original: 'spending_trend', clientReady: 'Spend Momentum' },
  { original: 'price_sensitivity', clientReady: 'Price Sensitivity Signal' },
  { original: 'basket_size', clientReady: 'Basket Depth' },
  { original: 'discount_usage_rate', clientReady: 'Discount Dependence Signal' },
  { original: 'night_order_ratio', clientReady: 'Time Activity Pattern' },
  { original: 'weekend_ratio', clientReady: 'Weekend Behaviour Skew' },
  { original: 'peak_hour_preference', clientReady: 'Peak Activity Window' },
  { original: 'seasonality_index', clientReady: 'Seasonal Behaviour Signal' },
  { original: 'inter_order_time', clientReady: 'Purchase Gap Pattern' },
  { original: 'recency_score', clientReady: 'Recency Strength Score' },
  { original: 'frequency_score', clientReady: 'Frequency Strength Score' },
  { original: 'monetary_score', clientReady: 'Monetary Strength Score' },
  { original: 'rfm_score', clientReady: 'RFM Behaviour Score' },
  { original: 'time_consistency', clientReady: 'Routine Consistency Signal' },
  { original: 'rush_hour_ratio', clientReady: 'Rush-Hour Activity Skew' },
  { original: 'weekday_preference', clientReady: 'Weekday Preference Pattern' },
  { original: 'tenure_days', clientReady: 'Relationship Tenure' },
  { original: 'activity_density', clientReady: 'Engagement Density' },
  { original: 'retention_rate', clientReady: 'Retention Strength Signal' },
];

const FRESHNESS_CARD = [
  { label: 'Last 3M', pct: 35 },
  { label: 'Last 6M', pct: 30 },
  { label: 'Last 12M', pct: 22 },
  { label: 'Older', pct: 13 },
];

// Same headline stats used in PersonaPreview's Real Actions Signal card.
const ML_ACTIONS_STATS = [
  { value: '55 Million', label: 'People Behaviour Base' },
  { value: '750 Million', label: "People's Actions Ingested" },
  { value: '400+', label: 'Behaviour Signals Mapped' },
  { value: '100 Million', label: 'Intent Scenarios Simulated' },
];

const REAL_ACTIONS_PARAMS = [
  'Purchase & Transaction Receipts', 'Click Intent', 'Interaction Trails',
  'Feature Usage', 'Engagement Channel', 'Online Browsing Patterns',
];

// Dimension id → name map, mirrors DIMENSION_NAMES in the digital_brain_pipeline
// / PersonaPreview.
const DIMENSION_NAMES_MAP: Record<number, string> = {
  1: 'Frequency / Usage',
  2: 'Category / Brand Switching',
  3: 'Price / Value Sensitivity',
  4: 'Temporal Patterns',
  5: 'Geographic Patterns',
  6: 'Adoption / Trial',
  7: 'Churn / Abandonment',
  8: 'Loyalty / Retention',
  9: 'Decision Journey',
  10: 'Social / Peer Influence',
  11: 'Lifestyle / Cross-Category',
  12: 'Need Gap / Innovation',
  13: 'Trust Building',
  14: 'Risk Tolerance',
  15: 'Information Processing',
  16: 'Emotional Engagement',
};

// ── Knowledge Enrichment Layer constants (layer 2 — now live) ───────────────

const KE_TOP_STATS = [
  { value: '10,000+', label: 'Curated Source Links' },
  { value: '250+', label: 'Industries Covered' },
  { value: '1,500+', label: 'Categories & Topics' },
];

interface KESourceType { name: string; value: number; color: string; }

const KE_SOURCE_TYPES: KESourceType[] = [
  { name: 'Industry Reports', value: 2400, color: '#0E63EC' },
  { name: 'Consumer Studies', value: 1800, color: '#24E5B6' },
  { name: 'Academic Research', value: 1600, color: '#5D74EB' },
  { name: 'Market Reports', value: 1400, color: '#24BCD3' },
  { name: 'Behaviour Science Papers', value: 1100, color: '#EC0E7D' },
  { name: 'Trend Reports', value: 900, color: '#9355F0' },
  { name: 'White Papers & Articles', value: 700, color: '#FABC48' },
  { name: 'Public Datasets', value: 600, color: '#39B2CB' },
  { name: 'Ethnographic Studies', value: 500, color: '#37FFCE' },
];

const KE_CONFIDENCE_SCORE = 90;

const KE_CONFIDENCE_COMPONENTS = [
  { label: 'Volume', score: 88 },
  { label: 'Recency', score: 82 },
  { label: 'Research Objective Alignment', score: 95 },
  { label: 'Source Diversity', score: 94 },
];

const KE_SOURCE_CHIPS = [
  'Industry Reports', 'Consumer Studies', 'Academic Research', 'Market Reports',
  'Behaviour Science Papers', 'Trend Reports', 'White Papers', 'Expert Articles',
  'Public Datasets', 'Ethnographic Studies',
];

/** Deterministic 50–100 "total sources" figure, seeded off the persona id so
 *  repeat exports of the same persona are stable instead of reshuffling on
 *  every render (unlike the live preview, a PDF card has no reason to be
 *  non-deterministic). */
function seededSourceTotal(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return 50 + (hash % 51);
}

function scaleSourceTypesToTotal(sourceTypes: KESourceType[], total: number): KESourceType[] {
  const rawSum = sourceTypes.reduce((s, t) => s + t.value, 0);
  const scaled = sourceTypes.map(t => ({
    ...t,
    value: Math.max(1, Math.round((t.value / rawSum) * total)),
  }));
  const scaledSum = scaled.reduce((s, t) => s + t.value, 0);
  const drift = total - scaledSum;
  if (drift !== 0) {
    const largestIdx = scaled.reduce(
      (maxIdx, t, i) => (t.value > scaled[maxIdx]!.value ? i : maxIdx),
      0
    );
    scaled[largestIdx] = { ...scaled[largestIdx]!, value: Math.max(1, scaled[largestIdx]!.value + drift) };
  }
  return scaled;
}

function computeKnowledgeEnrichment(persona: PersonaCardData): {
  total: number;
  sourceTypes: KESourceType[];
  confidenceScore: number;
  confidenceComponents: Array<{ label: string; score: number }>;
} {
  const seed = persona.id || 'persona';

  // Real KE Sourcebank data (enrich_persona_ke_sources()) — same "real data
  // when available" pattern PersonaPreview uses, so an enriched persona
  // shows identical Source Mix numbers in the PDF as in the live preview.
  const realBreakdown = persona.ke_source_type_breakdown;
  const hasRealBreakdown = !!realBreakdown && Object.keys(realBreakdown).length > 0;

  const seededTotal = seededSourceTotal(seed);
  const realTotal = hasRealBreakdown
    ? Object.values(realBreakdown!).reduce((a, b) => a + b, 0)
    : 0;
  const total = hasRealBreakdown && realTotal > 0 ? realTotal : seededTotal;

  const sourceTypes = hasRealBreakdown
    ? (() => {
      const mapped = KE_SOURCE_TYPES
        .map(t => ({ ...t, value: realBreakdown![t.name] ?? 0 }))
        .filter(t => t.value > 0);
      return mapped.length > 0 ? mapped : scaleSourceTypesToTotal(KE_SOURCE_TYPES, total);
    })()
    : scaleSourceTypesToTotal(KE_SOURCE_TYPES, total);

  const confidenceScore = typeof persona.ke_confidence?.overall === 'number'
    && !Number.isNaN(persona.ke_confidence.overall)
    ? Math.round(persona.ke_confidence.overall)
    : KE_CONFIDENCE_SCORE;

  const confidenceComponents = persona.ke_confidence?.components
    ? KE_CONFIDENCE_COMPONENTS.map(c => ({
      label: c.label,
      score: persona.ke_confidence!.components![c.label] ?? c.score,
    }))
    : KE_CONFIDENCE_COMPONENTS;

  return { total, sourceTypes, confidenceScore, confidenceComponents };
}

// ── Real Actions Signal — depth-signal computation (layer 1 addendum) ───────

interface DepthSignalStat {
  name: string;
  value: number;
  displayValue: number;
  accuracy: number;
  color: string;
  detailLabel: string;
  details: string[];
  showAccuracy?: boolean;
  accuracyLabel?: string;
  // Whether to render the numeric count (formatCompact(displayValue)) in the
  // row header. Mirrors PersonaPreview's showCount prop — only used to hide
  // the "55 Million people analyzed" style figure on the Predominant
  // Patterns row per design feedback; defaults to true for the other rows.
  showCount?: boolean;
}

interface RealActionsSignalResult {
  dimensionsTriggeredCount: number;
  depthLayerCount: number;
  patternsExtractedCount: number;
  confidenceScore: number;
  stats: DepthSignalStat[];
}

// Real Actions Signal confidence is driven solely by the Predominant
// Patterns / Research-Objective-Alignment score (persona.predominant_patterns
// .score), identical to how PersonaPreview's realActionsConfidenceScore is
// computed — Dimensions Triggered and Depth Layer accuracy are shown for
// context only and no longer feed into the confidence number.
function computeRealActionsSignal(persona: PersonaCardData): RealActionsSignalResult {
  const dimensionsActivated = persona.stage_2_dimensions?.activated_dimensions ?? [];
  const dimensionsTriggeredCount = dimensionsActivated.length > 0 ? dimensionsActivated.length : 8;

  const actionDataVerdicts = persona.evidence?.action_data ?? persona.stage_3a_depth_layers ?? [];
  const depthLayerCount = actionDataVerdicts.length > 0 ? actionDataVerdicts.length : 6;
  const patternsExtractedCount = actionDataVerdicts.length > 0
    ? (actionDataVerdicts.filter(v => !!v?.pattern_detected).length || actionDataVerdicts.length)
    : 14;

  const dimAccuracy = Math.round(Math.min(dimensionsTriggeredCount / 16, 1) * 100);
  const dlAccuracy = Math.round(Math.min(depthLayerCount / 10, 1) * 100);
  const patAccuracy = Math.round(Math.min(patternsExtractedCount / 20, 1) * 100);

  // Prefer the backend-computed Research-Objective-Alignment score for the
  // pattern layer — same field, same priority order, as PersonaPreview's
  // realActionsConfidenceScore. Only fall back to the count-derived heuristic
  // for personas that haven't had predominant_patterns generated yet.
  const predominantPatterns = persona.predominant_patterns;
  const confidenceScore =
    typeof predominantPatterns?.score === 'number' && !Number.isNaN(predominantPatterns.score)
      ? Math.round(predominantPatterns.score)
      : patAccuracy;

  const activatedDimNames = dimensionsActivated.map(d => {
    const id = typeof d === 'number' ? d : parseInt(String(d), 10);
    return DIMENSION_NAMES_MAP[id] ?? `Dimension ${id}`;
  });
  const fallbackDimNames = [
    'Category / Brand Switching', 'Price / Value Sensitivity', 'Social / Peer Influence',
    'Loyalty / Retention', 'Frequency / Usage', 'Temporal Patterns',
    'Decision Journey', 'Emotional Engagement',
  ];

  const depthLayerDetails = actionDataVerdicts.map(v => String(v?.pattern_detected ?? '').trim()).filter(Boolean);
  const fallbackDepthDetails = [
    '8 users switch brands in this category',
    '5 users show repeat-brand loyalty',
    'Average spend Rs 1,200 — mid-range tier',
    'Peak purchases at 21:00 — Evening (18–24)',
    'Data from 8 cities: 4 Tier-1, 4 Tier-2/3',
    'Peer clustering detected in 3 cities',
  ];

  // Pattern detail chips prefer the real backend pattern strings off
  // predominant_patterns.patterns — same source and same priority order
  // PersonaPreview's patternRealDetails uses — before falling back to
  // depth-layer-derived text or the hardcoded fallback list.
  const patternRealDetails = Array.isArray(predominantPatterns?.patterns)
    ? predominantPatterns!.patterns!.filter((p): p is string => typeof p === 'string' && !!p)
    : [];
  const patternDerivedDetails = actionDataVerdicts
    .map(v => String(v?.behavioral_signal ?? v?.pattern_detected ?? '').trim())
    .filter(Boolean);
  const fallbackPatternDetails = [
    'Explorer brain overrides stated quality preference',
    'Novelty-seeking disguised as quality talk',
    'Peer-driven switching clusters in same city',
    'Evening impulse purchase behaviour (21:00 peak)',
    'COD preference signals trust friction in Tier-2',
    'Premium brand aspiration vs budget-brand behaviour gap',
  ];
  const patternDetails = patternRealDetails.length > 0
    ? patternRealDetails
    : patternDerivedDetails.length > 0
      ? patternDerivedDetails
      : fallbackPatternDetails;

  const stats: DepthSignalStat[] = [
    {
      name: 'Dimensions Triggered',
      value: dimensionsTriggeredCount,
      displayValue: dimensionsTriggeredCount,
      accuracy: dimAccuracy,
      color: ACCENT,
      detailLabel: 'Behavioral dimensions activated for this persona',
      details: activatedDimNames.length > 0 ? activatedDimNames : fallbackDimNames,
      // Context-only row — no numeric confidence bar, matching PersonaPreview.
      showAccuracy: false,
    },
    {
      name: 'Depth Layer',
      value: depthLayerCount,
      displayValue: depthLayerCount,
      accuracy: dlAccuracy,
      color: GREEN,
      detailLabel: 'Patterns detected across depth layers',
      details: depthLayerDetails.length > 0 ? depthLayerDetails : fallbackDepthDetails,
      // Context-only row — no numeric confidence bar, matching PersonaPreview.
      showAccuracy: false,
    },
{
  name: 'Predominant Patterns Extracted',
  value: patternsExtractedCount,
  displayValue: patternsExtractedCount > 0
    ? Math.min(patternsExtractedCount * 12_000_000, 750_000_000)
    : 84_000_000,
  accuracy: patAccuracy,
  color: PURPLE,
  detailLabel: 'Behavioral signals extracted from action patterns',
  details: patternDetails,
  showAccuracy: true,
  accuracyLabel: 'Research Objective Alignment',
  // Commented out per design feedback — no longer showing the large
  // "X Million" figure next to this row, matching PersonaPreview.
  showCount: false,
},
  ];

  return { dimensionsTriggeredCount, depthLayerCount, patternsExtractedCount, confidenceScore, stats };
}

// ── Multi-platform Conversation computation (layer 3) ────────────────────────

function computeMultiPlatform(persona: PersonaCardData): {
  platformCounts: Record<string, number>;
  confidenceComponents: Record<string, number>;
  confidenceScore: number;
} {
  const multiSection = persona.calibration_breakdown?.multi_platform_conversations;
  const rawCompScores = multiSection?.component_scores ?? {};
  const sourcesBreakdown = persona.sources_breakdown ?? [];

  const platformCounts: Record<string, number> = Object.keys(rawCompScores).length > 0
    ? rawCompScores
    : sourcesBreakdown.reduce<Record<string, number>>((acc, s) => {
      if (s.platform) acc[s.platform] = (acc[s.platform] ?? 0) + (s.threads_or_posts ?? 1);
      return acc;
    }, {});

  const rawConfidence =
    multiSection?.confidence_components ??
    multiSection?.confidence_breakdown ??
    multiSection?.breakdown;

  const confidenceComponents: Record<string, number> = rawConfidence
    ? Object.entries(rawConfidence).reduce<Record<string, number>>((acc, [k, v]) => {
      acc[k] = v <= 1 ? Math.round(v * 100) : v;
      return acc;
    }, {})
    : {};

  const vals = Object.values(confidenceComponents);
  const fallbackFromLevel =
    persona.evidence_confidence_level === 'High' ? 85 :
      persona.evidence_confidence_level === 'Medium' ? 65 :
        persona.evidence_confidence_level === 'Low' ? 40 : 70;

  // evidence_confidence_score can arrive as either a 0–1 fraction or an
  // already-scaled 0–100 score. Normalise it the same way the per-component
  // values above are normalised, so it doesn't render as "0.93%" instead of
  // "93%" when no component breakdown is available from the backend.
  const rawFallbackScore = persona.evidence_confidence_score ?? fallbackFromLevel;
  const normalisedFallbackScore = rawFallbackScore <= 1
    ? Math.round(rawFallbackScore * 100)
    : Math.round(rawFallbackScore);

  const confidenceScore = vals.length > 0
    ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    : normalisedFallbackScore;

  return { platformCounts, confidenceComponents, confidenceScore };
}

// ── Ocean / misc helpers (unchanged) ─────────────────────────────────────────

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

// NOTE: the section top-border used to be a 3-stop linear-gradient
// (transparent → ACCENT → transparent). html2canvas renders multi-stop CSS
// gradients unreliably during PDF export (missing fills / banding), so this
// is now a flat, low-opacity accent line instead.
function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '24px 24px 20px', position: 'relative', overflow: 'hidden', ...style }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: ACCENT, opacity: 0.18 }} />
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

/** Compact confidence-score pill, reused wherever a layer needs to show its
 *  own overall %, e.g. "Calibration Confidence 90%". */
function ConfidencePill({ score, label = 'Calibration Confidence' }: { score: number; label?: string }) {
  const color = score >= 80 ? GREEN : score >= 60 ? AMBER : RED;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 20,
      padding: '5px 12px', background: `${color}18`, border: `1px solid ${color}55`,
    }}>
      <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: TEXT_SEC }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color }}>{score}%</span>
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

// ── Master Calibration Confidence breakdown pills (header) ──────────────────

function MasterBreakdownRow({ label, score, comingSoon }: { label: string; score: number; comingSoon?: boolean }) {
  const color = score >= 80 ? GREEN : score >= 60 ? AMBER : RED;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ fontFamily: SANS, fontSize: 11, color: TEXT_TER }}>{label}</span>
      {comingSoon ? (
        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: TEXT_TER, background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER_BR}`, borderRadius: 4, padding: '2px 7px' }}>
          Coming Soon
        </span>
      ) : (
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color }}>{score}%</span>
      )}
    </div>
  );
}

// ── OCEAN radar ───────────────────────────────────────────────────────────────
// (SVG <linearGradient> defs rasterise fine in html2canvas — unlike CSS
// background gradients on regular divs — so this is left untouched.)

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
        {/* Guarded: a 0%-wide fill div paints unreliably in html2canvas exports. */}
        {value > 0 && <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 3 }} />}
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

// ── Confidence component bar (reused by RO Alignment + Knowledge Enrichment
// + Multi-platform confidence breakdowns) ────────────────────────────────────

function ConfidenceBar({ label, value }: { label: string; value: number }) {
  // Accepts either a 0–1 fraction or an already-scaled 0–100 score.
  const pct = value <= 1 ? Math.round(value * 100) : Math.round(value);
  const color = pct >= 75 ? GREEN : pct >= 55 ? AMBER : RED;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontFamily: SANS, fontSize: 12, color: TEXT_SEC }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
        {pct > 0 && <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />}
      </div>
    </div>
  );
}

// ── Ground Truth sub-section header ──────────────────────────────────────────

function GTSectionHeader({
  number, title, subtitle, comingSoon = false, rightSlot,
}: {
  number: number; title: string; subtitle: string; comingSoon?: boolean; rightSlot?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' as const, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
        {rightSlot}
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

// ── Depth-signal metric row (Dimensions / Depth Layer / Pattern Extracted) ──

function DepthSignalRow({ stat }: { stat: DepthSignalStat }) {
  const showAccuracy = stat.showAccuracy !== false;
  const showCount = stat.showCount !== false;
  return (
    <div style={{ background: SURFACE_EL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: stat.color, flexShrink: 0 }} />
          <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: TEXT_PRI }}>{stat.name}</span>
        </div>
        {showCount && (
          <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: stat.color }}>{formatCompact(stat.displayValue)}</span>
        )}
      </div>
      {showAccuracy && (
        <>
          {stat.accuracyLabel && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontFamily: SANS, fontSize: 10, color: TEXT_TER }}>{stat.accuracyLabel}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: stat.details.length ? 8 : 0 }}>
            <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
              {stat.accuracy > 0 && <div style={{ height: '100%', width: `${stat.accuracy}%`, background: stat.color, borderRadius: 99 }} />}
            </div>
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: stat.color, minWidth: 30, textAlign: 'right' as const }}>{stat.accuracy}%</span>
          </div>
        </>
      )}
      {stat.details.length > 0 && (
        <p style={{ fontFamily: SANS, fontSize: 10, lineHeight: 1.5, color: TEXT_TER, margin: showAccuracy ? 0 : '6px 0 0' }}>
          {stat.detailLabel}: {stat.details.slice(0, 3).join(' · ')}
        </p>
      )}
    </div>
  );
}

// ── Source-type proportion bar + legend (Knowledge Enrichment Layer) ────────
//
// FIXED: previously a 3-column CSS grid relying on overflow:hidden +
// textOverflow:'ellipsis' per label. At this section's actual rendered width,
// columns were as narrow as ~120px, and labels like "Behaviour Science
// Papers" or "White Papers & Articles" didn't fit — and html2canvas does not
// reliably render CSS text-overflow:ellipsis during PDF export, so instead of
// a clean "…" truncation the label text overflowed its box and visually
// collided with the row below (the exact bug shown in the reported
// screenshot). Now a single full-width column, one label per row, with a
// JS-side hard-truncation backstop (truncateLabel) instead of depending on
// CSS clipping.
function SourceTypeBar({ segments, total }: { segments: KESourceType[]; total: number }) {
  return (
    <div>
      <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
        {segments.map(s => (
          <div key={s.name} style={{ width: `${Math.max((s.value / total) * 100, 0.6)}%`, background: s.color }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginTop: 12 }}>
        {segments.map(s => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ fontFamily: SANS, fontSize: 11, color: TEXT_SEC, flex: 1, minWidth: 0, whiteSpace: 'nowrap' as const }}>
              {truncateLabel(s.name, 40)}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_TER, flexShrink: 0 }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Ground Truth Foundation — all 4 calibration layers in sequence ──────────
// 1 Real Actions Signal (live) · 2 Knowledge Enrichment Layer (live) ·
// 3 Multi-platform Conversation (live) · 4 Neuroscience-Informed (coming soon)

function GroundTruthFoundation({
  persona, isManualMode, realActionsSignal, knowledgeEnrichment, multiPlatform,
}: {
  persona: PersonaCardData;
  isManualMode: boolean;
  realActionsSignal: RealActionsSignalResult;
  knowledgeEnrichment: {
    total: number;
    sourceTypes: KESourceType[];
    confidenceScore: number;
    confidenceComponents: Array<{ label: string; score: number }>;
  };
  multiPlatform: { platformCounts: Record<string, number>; confidenceComponents: Record<string, number>; confidenceScore: number };
}) {
  const half = Math.ceil(ML_FEATURES_CARD.length / 2);
  const col1 = ML_FEATURES_CARD.slice(0, half);
  const col2 = ML_FEATURES_CARD.slice(half);

  // Evidence / multi-platform data
  const totalConvs = persona.total_conversations_analyzed ?? 0;
  const sourcesBreakdown = persona.sources_breakdown ?? [];
  const evidenceSource = persona.evidence_source ?? '';
  const evidenceLevel = persona.evidence_confidence_level ?? '';
  const recencyPct = persona.recency_percentage ?? null;
  const monthsAnalyzed = persona.months_analyzed ?? null;
  const hasEvidence = !!(totalConvs > 0 || sourcesBreakdown.length > 0 || evidenceSource);

  const sitesResearched = (persona as any).number_of_sites_researched ?? (persona as any).enrichment_layer ?? null;
  const realPeople = (persona as any).number_of_real_people ?? null;

  const platformEntries = Object.entries(multiPlatform.platformCounts);
  const confidenceEntries = Object.entries(multiPlatform.confidenceComponents);

  return (
    <Section style={{ marginBottom: 24, position: 'relative', zIndex: 1 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <SectionTitle>Ground Truth Foundation</SectionTitle>
        <p style={{ fontFamily: SANS, fontSize: 11, color: TEXT_TER, margin: '-12px 0 0 0' }}>
          Four calibration layers that validate and enrich every persona — three live, one coming soon
        </p>
      </div>

      {/* ── 1: Real Actions Signal ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <GTSectionHeader
          number={1}
          title="Real Actions Signal"
          subtitle={
            isManualMode
              ? 'Traits the researcher directly provided in the persona form.'
              : "Anchored in real people's action patterns, not self-reported opinions."
          }
          rightSlot={<ConfidencePill score={realActionsSignal.confidenceScore} />}
        />

        {/* Stat pills */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
          {ML_ACTIONS_STATS.map(({ value, label }) => (
            <div key={label} style={{
              background: SURFACE_EL, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: ACCENT, lineHeight: 1 }}>{value}</span>
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
                {/* Flat ACCENT fill (was a 2-stop gradient) — same html2canvas
                    reliability fix as the Section top-border above. */}
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                  {pct > 0 && <div style={{ height: '100%', width: `${pct}%`, background: ACCENT, borderRadius: 99 }} />}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dimensions / Depth Layer / Pattern Extracted */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.10em', color: TEXT_TER, fontWeight: 600, marginBottom: 10 }}>
            Dimensions, Depth Layer &amp; Pattern Signals <span style={{ color: 'rgba(255,255,255,0.25)', textTransform: 'none' as const, letterSpacing: 0 }}>(only Predominant Patterns drives confidence)</span>
          </div>
          {realActionsSignal.stats.map(s => <DepthSignalRow key={s.name} stat={s} />)}
        </div>

        {/* Feature table */}
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.10em', color: TEXT_TER, fontWeight: 600, marginBottom: 10 }}>
            Behaviour Signals Extracted
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
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

          <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.10em', color: TEXT_TER, fontWeight: 600, marginBottom: 10 }}>
            Parameter Integrated
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
            {REAL_ACTIONS_PARAMS.map(p => (
              <span key={p} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, fontFamily: SANS, fontSize: 10, color: TEXT_SEC, padding: '5px 10px', borderRadius: 6 }}>{p}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: BORDER, margin: '4px 0 24px' }} />

      {/* ── 2: Knowledge Enrichment Layer (now live) ──────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <GTSectionHeader
          number={2}
          title="Knowledge Enrichment Layer"
          subtitle={
            isManualMode
              ? 'Total sub-traits across all categories evaluated during calibration.'
              : 'Enriched using a curated knowledge bank of credible sources across industries, segments, and consumer topics.'
          }
          rightSlot={<ConfidencePill score={knowledgeEnrichment.confidenceScore} />}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
          {KE_TOP_STATS.map(s => (
            <div key={s.label} style={{
              background: SURFACE_EL, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: ACCENT, lineHeight: 1 }}>{s.value}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: TEXT_TER }}>{s.label}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' as const, marginBottom: 18 }}>
          <div style={{ flex: '1 1 260px', minWidth: 220 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.10em', color: TEXT_TER, fontWeight: 600, marginBottom: 10 }}>
              Source Mix — {knowledgeEnrichment.total.toLocaleString('en-IN')} total sources
            </div>
            <SourceTypeBar segments={knowledgeEnrichment.sourceTypes} total={knowledgeEnrichment.total} />
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 200 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.10em', color: TEXT_TER, fontWeight: 600, marginBottom: 10 }}>
              Confidence Components
            </div>
            {/* FIXED: was hardcoded to the module-level KE_CONFIDENCE_COMPONENTS
                constant regardless of persona data. Now reads the computed
                prop, which already blends in persona.ke_confidence.components
                when the backend has enriched this persona — matching
                PersonaPreview's keConfidenceComponents. */}
            {knowledgeEnrichment.confidenceComponents.map(c => <ConfidenceBar key={c.label} label={c.label} value={c.score} />)}
          </div>
        </div>

        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.10em', color: TEXT_TER, fontWeight: 600, marginBottom: 10 }}>
            Source Types
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
            {KE_SOURCE_CHIPS.map(c => (
              <span key={c} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, fontFamily: SANS, fontSize: 10, color: TEXT_SEC, padding: '5px 10px', borderRadius: 6 }}>{c}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: BORDER, margin: '4px 0 24px' }} />

      {/* ── 3: Multi-platform Conversation ────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <GTSectionHeader
          number={3}
          title={isManualMode ? 'RO Alignment Score' : 'Multi-platform Conversation'}
          subtitle={
            isManualMode
              ? 'Research Objective alignment scored across demographics, psychographics, behaviour, and trait completeness.'
              : 'Cross-platform conversations and real-world signals that enrich the behavioural depth of each persona.'
          }
          rightSlot={<ConfidencePill score={multiPlatform.confidenceScore} />}
        />

        {/* Top-level stats */}
        {hasEvidence && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
            {totalConvs > 0 && (
              <StatChip value={totalConvs.toLocaleString('en-IN')} label="Conversations Analyzed" />
            )}
            {(platformEntries.length > 0 || sourcesBreakdown.length > 0) && (
              <StatChip value={String(platformEntries.length || sourcesBreakdown.length)} label="Platforms" />
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
        {platformEntries.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
            {platformEntries.map(([platform, count]) => (
              <div key={platform} style={{ background: SURFACE_EL, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: SANS, fontSize: 11, color: TEXT_SEC }}>{platform}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: ACCENT }}>{count.toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        )}

        {/* Confidence-component breakdown, when the backend supplies it */}
        {confidenceEntries.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase' as const, letterSpacing: '0.10em', color: TEXT_TER, fontWeight: 600, marginBottom: 10 }}>
              Confidence Components
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 24px' }}>
              {confidenceEntries.map(([label, score]) => <ConfidenceBar key={label} label={label} value={score} />)}
            </div>
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
          {!hasEvidence && !realPeople && !sitesResearched && platformEntries.length === 0 && (
            <div style={{ padding: '14px 16px', fontFamily: SANS, fontSize: 11, color: TEXT_TER }}>
              No evidence data available for this persona.
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: BORDER, margin: '4px 0 24px' }} />

      {/* ── 4: Neuroscience-Informed Calibration — Coming Soon ─────────────── */}
      <GTComingSoonBlock
        number={4}
        title="Neuroscience-Informed Calibration"
        subtitle={
          isManualMode
            ? 'Traits intelligently auto-filled by AI using Research Objective context and cross-trait inference.'
            : 'Models emotional and cognitive signals that shape decisions at a sub-conscious level.'
        }
      />
    </Section>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────

const PersonaCardRenderer = React.forwardRef<HTMLDivElement, Props>(
  ({ persona, width = 900 }, ref) => {
    const ocean = getOceanScores(persona);

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
        .map(s => humaniseInsight(s, JARGON_MAP))
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

    // Evidence (kept for the header stat chips + backwards compatibility)
    const totalConvs = persona.total_conversations_analyzed ?? 0;
    const evidenceLevel = persona.evidence_confidence_level ?? '';
    const recencyPct = persona.recency_percentage ?? null;
    const monthsAnalyzed = persona.months_analyzed ?? null;

    // Confidence scoring (manual mode)
    const cs = persona.confidence_scoring;
    const csComponents = cs?.components;
    const hasCSComponents = !!(csComponents && Object.keys(csComponents).length > 0 && cs?.mode === 'Manual Build Mode');

    // Auto-fill report
    const afr = persona.auto_fill_report;
    const hasAFR = !!(afr && (afr.auto_filled_count ?? 0) > 0);

    // ── Calibration layers — same three-layer average PersonaPreview uses ──
    const isManualMode = !!persona.calibration_breakdown?.is_manual_mode;
    const realActionsSignal = React.useMemo(() => computeRealActionsSignal(persona), [persona]);
    // FIXED: previously called as computeKnowledgeEnrichment(persona.id ||
    // personaName) — a *string*, not the persona object — so
    // persona.ke_source_type_breakdown / persona.ke_confidence were always
    // read off a string and hasRealBreakdown was permanently false. The card
    // therefore silently ignored real KE Sourcebank data for every persona
    // and always fell back to the seeded placeholder mix, diverging from
    // PersonaPreview. Now passes the full persona object, matching the
    // function's actual signature.
    const knowledgeEnrichment = React.useMemo(
      () => computeKnowledgeEnrichment(persona),
      [persona]
    );
    const multiPlatform = React.useMemo(() => computeMultiPlatform(persona), [persona]);

    // Prefer the backend-persisted score (same value the preview page shows);
    // fall back to the live 3-layer client average only when it hasn't been
    // computed for this persona yet.
    const masterConfidenceScore = typeof persona.master_calibration_confidence === 'number'
      && !Number.isNaN(persona.master_calibration_confidence)
      ? Math.round(persona.master_calibration_confidence)
      : Math.round(
        (realActionsSignal.confidenceScore + knowledgeEnrichment.confidenceScore + multiPlatform.confidenceScore) / 3
      );

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

        {/* Ambient glow — flattened from a two-radial-gradient composite to a
            single flat colour wash. Multiple stacked CSS gradients on one
            element are a common source of blank/black regions when
            html2canvas rasterises the card for PDF export. */}
        <div style={{ position: 'absolute', top: '-40%', left: '-30%', width: '160%', height: '160%', background: 'rgba(14,99,236,0.025)', pointerEvents: 'none', zIndex: 0 }} />

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

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <CalibRing score={masterConfidenceScore} size={160} />

            {/* Master Calibration Confidence breakdown — mirrors the hero
                panel in PersonaPreview (3 live layers + Neuroscience coming soon) */}
            <div style={{ width: 200 }}>
              <MasterBreakdownRow label="Real Actions Signal" score={realActionsSignal.confidenceScore} />
              <MasterBreakdownRow label="Knowledge Enrichment Layer" score={knowledgeEnrichment.confidenceScore} />
              <MasterBreakdownRow label="Multi-platform Conversation" score={multiPlatform.confidenceScore} />
              <MasterBreakdownRow label="Neuroscience-Informed" score={0} comingSoon />
            </div>

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

        {/* ── Ground Truth Foundation (Real Actions Signal · Knowledge
             Enrichment Layer · Multi-platform Conversation · Neuroscience-
             Informed) — the single source of truth for all calibration data,
             replacing the old separate "Evidence Base" + "Calibration
             Breakdown" rows so numbers can't drift out of sync. ──────────── */}
        <GroundTruthFoundation
          persona={persona}
          isManualMode={isManualMode}
          realActionsSignal={realActionsSignal}
          knowledgeEnrichment={knowledgeEnrichment}
          multiPlatform={multiPlatform}
        />

        {/* ── ROW: Confidence Scoring (manual mode only) ───────────────────── */}
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