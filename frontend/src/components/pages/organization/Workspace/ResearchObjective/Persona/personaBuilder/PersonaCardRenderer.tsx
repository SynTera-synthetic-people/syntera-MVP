// ─────────────────────────────────────────────────────────────────────────────
// PersonaCardRenderer.tsx  — "Dossier" edition
//Capture-safe rules still apply:
//  1. Inline ALL styles (no CSS classes — html2canvas misses external sheets)
//  2. Only system / data-uri fonts  (Playfair Display & JetBrains Mono loaded
//     via a <style> tag injected into the card itself; html2canvas captures
//     inline <style> tags correctly when the fonts are already in the browser
//     cache — make sure the parent page loads them via <link> first)
//  3. No backdrop-filter, no CSS variables, no JS animations
//  4. Fixed 900 × 560 px at 2× device-pixel-ratio → 1800 × 1120 export
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import {
  buildAvatarConfig,
  buildCardPalette,
  normaliseOcean,
  inferOceanFromTraits,
  type OceanScores,
} from './personaCardUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PersonaCardData {
  id: string;
  name?: string;
  archetype?: string;
  created_by_name?: string;
  created_by?: string;
  auto_generated_persona?: boolean;
  calibration_confidence?: number;
  confidence_score?: number;
  confidence_scoring?: {
    confidence_calculation_detail?: { weighted_total?: number };
    score?: number;
  };

  // Demographics
  age_range?: string;
  gender?: string;
  income_range?: string;
  education_level?: string;
  occupation?: string;
  geography?: string;
  location_country?: string;
  location_state?: string;
  marital_status?: string;

  // Psychographic
  lifestyle?: string;
  values?: string | string[];
  personality?: string | string[];
  interests?: string | string[];
  motivations?: string;
  barriers_pain_points?: string | string[];
  triggers_opportunities?: string | string[];

  // Behavioural
  decision_making_style?: string;
  purchase_frequency?: string;
  purchase_channel?: string;
  brand_sensitivity?: string;
  price_sensitivity?: string;
  digital_activity?: string;
  media_consumption?: string;

  // OCEAN (0–1 or 0–100 both accepted)
  ocean_profile?: {
    scores?: Record<string, number>;
    traits?: Array<{ name: string; score: number }>;
  };

  // Calibration source counts
  calibration_sources?: {
    real_actions?: number;
    emotional_neural?: number;
    validated_research?: number;
    multi_platform?: number;
  };

  tags?: string[];
  [key: string]: unknown;
}

interface Props {
  persona: PersonaCardData;
  width?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BG         = '#050505';
const SURFACE    = '#0d0d0d';
const SURFACE_EL = '#151515';
const BORDER     = 'rgba(255,255,255,0.06)';
const BORDER_BR  = 'rgba(255,255,255,0.12)';
const TEXT_PRI   = '#ffffff';
const TEXT_SEC   = 'rgba(255,255,255,0.70)';
const TEXT_TER   = 'rgba(255,255,255,0.40)';
const ACCENT     = '#0E63EC';
const ACCENT_DIM = 'rgba(14,99,236,0.18)';
const ACCENT_GLOW = 'rgba(14,99,236,0.22)';
const GOLD       = '#ffd700';

const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SERIF = "'Playfair Display', Georgia, serif";
const SANS  = "'Inter', 'Segoe UI', sans-serif";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getConfidenceScore(p: PersonaCardData): number {
  const raw =
    p.confidence_scoring?.confidence_calculation_detail?.weighted_total ??
    p.confidence_scoring?.score ??
    p.confidence_score ??
    p.calibration_confidence ??
    0;
  const n = Number(raw);
  return isNaN(n) ? 0 : Math.round(n <= 1 ? n * 100 : n);
}

function coerce(v: unknown): string {
  if (!v) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function toList(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((s): s is string => typeof s === 'string' && !!s);
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
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

// Deterministic seeded pseudo-random (no Math.random — stable across renders)
function seededVal(seed: number, index: number): number {
  const x = Math.sin(seed + index * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// ── OCEAN Radar (pure SVG) ────────────────────────────────────────────────────

function OceanRadar({ scores, size = 220 }: { scores: OceanScores; size?: number }) {
  const cx = size / 2, cy = size / 2;
  const maxR = size * 0.36;
  const n = 5;

  const dims = [
    { label: 'O', full: 'Openness',          value: scores.openness },
    { label: 'C', full: 'Conscientiousness', value: scores.conscientiousness },
    { label: 'E', full: 'Extraversion',       value: scores.extraversion },
    { label: 'A', full: 'Agreeableness',      value: scores.agreeableness },
    { label: 'N', full: 'Neuroticism',        value: scores.neuroticism },
  ];

  const pt = (idx: number, r: number) => {
    const angle = (idx / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const dataPts = dims.map((d, i) => pt(i, d.value * maxR));
  const dataPath = dataPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';

  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ filter: 'drop-shadow(0 0 18px rgba(14,99,236,0.25))' }}>
      <defs>
        <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
          <stop offset="100%" stopColor="#5b9bff" stopOpacity="0.10" />
        </linearGradient>
      </defs>
      {/* Grid rings */}
      {gridLevels.map(l => {
        const poly = dims.map((_, i) => {
          const p = pt(i, l * maxR);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        }).join(' ');
        return <polygon key={l} points={poly} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
      })}
      {/* Axes */}
      {dims.map((_, i) => {
        const p = pt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={p.x.toFixed(1)} y2={p.y.toFixed(1)} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />;
      })}
      {/* Data polygon */}
      <path d={dataPath} fill="url(#radarFill)" stroke={ACCENT} strokeWidth="2.5" strokeLinejoin="round" />
      {/* Data points */}
      {dataPts.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="4.5" fill={ACCENT} />
      ))}
      {/* Labels */}
      {dims.map((d, i) => {
        const lp = pt(i, maxR + 18);
        return (
          <text key={i}
            x={lp.x.toFixed(1)} y={lp.y.toFixed(1)}
            textAnchor="middle" dominantBaseline="central"
            fontSize="13" fontWeight="600" fill="rgba(255,255,255,0.50)"
            fontFamily={MONO}
          >{d.label}</text>
        );
      })}
    </svg>
  );
}

// ── Calibration ring SVG ──────────────────────────────────────────────────────

function CalibRing({ score, size = 140 }: { score: number; size?: number }) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  return (
    <div style={{ width: size, height: size, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, left: 0 }}>
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="9" />
        {/* Fill */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={ACCENT} strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
        <span style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, color: ACCENT, lineHeight: 1 }}>
          {score}%
        </span>
        <span style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.15em', color: TEXT_TER, marginTop: 5 }}>
          Calibrated
        </span>
      </div>
    </div>
  );
}

// ── Behavioral dimension bar card ─────────────────────────────────────────────

interface DimCardProps {
  name: string;
  description: string;
  intensity: string;
  value: number;
  color: string;
}

function DimCard({ name, description, intensity, value, color }: DimCardProps) {
  return (
    <div style={{
      background: SURFACE_EL,
      border: `1px solid ${BORDER}`,
      borderRadius: 10,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      marginBottom: 10,
    }}>
      {/* top accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, opacity: 0.55 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: TEXT_PRI }}>{name}</span>
        <span style={{
          padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700,
          fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.05em',
          background: color, color: BG,
        }}>{intensity}</span>
      </div>
      <p style={{ fontFamily: SANS, fontSize: 11, lineHeight: 1.55, color: TEXT_SEC, marginBottom: 10 }}>{description}</p>
      {/* Progress bar */}
      <div style={{ height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

// ── Psycho item (left-border style) ──────────────────────────────────────────

function PsychoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ borderLeft: `2px solid ${BORDER_BR}`, paddingLeft: 14, marginBottom: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.10em', color: TEXT_TER, marginBottom: 5, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 12, lineHeight: 1.65, color: TEXT_SEC }}>{children}</div>
    </div>
  );
}

// ── Interest chip ─────────────────────────────────────────────────────────────

function InterestChip({ label }: { label: string }) {
  return (
    <div style={{
      background: SURFACE_EL, border: `1px solid ${BORDER}`,
      padding: '6px 10px', borderRadius: 6, fontSize: 11,
      fontFamily: SANS, color: TEXT_SEC, textAlign: 'center' as const,
    }}>{label}</div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
      fontFamily: MONO, fontSize: 10, textTransform: 'uppercase',
      letterSpacing: '0.15em', color: ACCENT, fontWeight: 600,
    }}>
      <div style={{ width: 3, height: 14, background: ACCENT, borderRadius: 2, flexShrink: 0 }} />
      {children}
    </div>
  );
}

// ── Section card (surface bg with top gradient line) ──────────────────────────

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: SURFACE,
      border: `1px solid ${BORDER}`,
      borderRadius: 14,
      padding: '24px 24px 20px',
      position: 'relative',
      overflow: 'hidden',
      ...style,
    }}>
      {/* top shimmer line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`,
        opacity: 0.25,
      }} />
      {children}
    </div>
  );
}

// ── Demo row ──────────────────────────────────────────────────────────────────

function DemoItem({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ borderLeft: `2px solid ${BORDER_BR}`, paddingLeft: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_TER, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: TEXT_PRI }}>{value}</div>
    </div>
  );
}

// ── Evidence source tag ───────────────────────────────────────────────────────

function SourceTag({ label }: { label: string }) {
  return (
    <div style={{
      background: SURFACE_EL, border: `1px solid ${BORDER}`,
      padding: '7px 10px', borderRadius: 6, fontSize: 10,
      fontFamily: SANS, color: TEXT_SEC, textAlign: 'center' as const,
    }}>{label}</div>
  );
}

function TechTag({ label }: { label: string }) {
  return (
    <span style={{
      background: ACCENT_DIM, border: `1px solid ${ACCENT}`,
      padding: '4px 10px', borderRadius: 4, fontSize: 9,
      fontFamily: MONO, color: ACCENT, textTransform: 'uppercase' as const,
      letterSpacing: '0.05em',
    }}>{label}</span>
  );
}

// ── OCEAN value row (right side of radar) ─────────────────────────────────────

function OceanRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: `1px solid ${BORDER}`,
    }}>
      <span style={{ fontFamily: SANS, fontSize: 12, color: TEXT_SEC }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: ACCENT }}>
        {Math.round(value * 100)}
      </span>
    </div>
  );
}

// ── Main Card ─────────────────────────────────────────────────────────────────

const PersonaCardRenderer = React.forwardRef<HTMLDivElement, Props>(
  ({ persona, width = 900 }, ref) => {
    // ── Derived data ──────────────────────────────────────────────────────────
    const ocean = getOceanScores(persona);
    const confidenceScore = getConfidenceScore(persona);

    const personaName = persona.name ?? 'Unnamed Persona';
    const archetype   = persona.archetype ?? 'Research Persona';
    const isAI        = !!persona.auto_generated_persona;
    const createdBy   = isAI ? 'Omi' : (persona.created_by_name ?? persona.created_by ?? 'You');

    const locationStr = [persona.location_state, persona.location_country ?? persona.geography]
      .filter(Boolean).join(', ') || '';

    const interests   = toList(persona.interests).slice(0, 6);
    const motivations = coerce(persona.motivations);
    const lifestyle   = coerce(persona.lifestyle);
    const values      = coerce(persona.values);
    const personality = coerce(persona.personality);

    const sources     = persona.calibration_sources ?? {};
    const numPeople   = (
      sources.real_actions ??
      sources.emotional_neural ??
      123456
    ).toLocaleString('en-IN');

    const EVIDENCE_SOURCES = [
      'Purchase & Transaction Receipts',
      'Click Intent',
      'Interaction Trails',
      'Feature Usage',
      'Engagement Channel',
      'Online Browsing Patterns',
    ];

    const TECHNOLOGIES = ['EOG', 'ECG', 'GSR', 'EMG', 'PSG', 'ERP'];

    // Derive behavioral dimensions from persona data
    const dims: DimCardProps[] = [
      {
        name: 'Optimization Under Pressure',
        description: persona.decision_making_style
          ? `Decision style: ${coerce(persona.decision_making_style)}`
          : 'Turns chaos into systems, but the systems become their own source of stress',
        intensity: 'High',
        value: Math.round(ocean.conscientiousness * 100),
        color: '#ff6b6b',
      },
      {
        name: 'Time Sensitivity',
        description: persona.purchase_frequency
          ? `Purchase frequency: ${coerce(persona.purchase_frequency)}`
          : 'Every decision is a trade-off evaluated against competing priorities',
        intensity: ocean.neuroticism > 0.6 ? 'Extreme' : 'High',
        value: Math.round((ocean.conscientiousness * 0.5 + ocean.neuroticism * 0.5) * 100),
        color: '#ff3333',
      },
      {
        name: 'Brand Skepticism',
        description: persona.brand_sensitivity
          ? coerce(persona.brand_sensitivity)
          : 'Prefers brands that publish real methodologies, roadmaps, and trade-offs',
        intensity: ocean.agreeableness < 0.5 ? 'Moderate' : 'Low',
        value: Math.round((1 - ocean.agreeableness) * 100),
        color: '#ffd93d',
      },
    ];

    // Calibration breakdown
    const calibBreakdown: Array<{ label: string; value: number }> = [
      { label: 'Volume',          value: 100 },
      { label: 'Source Diversity',value: 85  },
      { label: 'Recency',         value: 100 },
      { label: 'Signal Clarity',  value: 100 },
    ];

    // ── Layout constants ──────────────────────────────────────────────────────
    // We render at full scroll height — caller wraps in a fixed-height
    // clipping div for html2canvas if needed. Keeping it tall ensures all
    // content is captured. Typical html2canvas usage: scale: 2, useCORS: true.
    const GAP = 24;
    const HALF = (width - GAP * 3) / 2;

    return (
      <div
        ref={ref}
        style={{
          width,
          background: BG,
          padding: '52px 40px 48px',
          boxSizing: 'border-box',
          fontFamily: SANS,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* ── Ambient glow layers ── */}
        <div style={{
          position: 'absolute', top: '-40%', left: '-30%', width: '160%', height: '160%',
          background: `radial-gradient(circle at 30% 20%, rgba(14,99,236,0.04) 0%, transparent 40%),
                       radial-gradient(circle at 70% 80%, rgba(14,99,236,0.03) 0%, transparent 40%)`,
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* ─────────────────────────── HEADER ─────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 52, position: 'relative', zIndex: 1 }}>

          {/* Left: name + tagline + demo grid */}
          <div style={{ maxWidth: width * 0.60 }}>
            {/* Archetype label */}
            <div style={{
              fontFamily: MONO, fontSize: 10, textTransform: 'uppercase',
              letterSpacing: '0.12em', color: ACCENT, marginBottom: 12,
            }}>
              {archetype} · by {createdBy}
            </div>

            {/* Persona name */}
            <div style={{ position: 'relative', marginBottom: 16, display: 'inline-block' }}>
              {/* Blue highlight bar behind first line */}
              <div style={{
                position: 'absolute', left: -8, top: 4, bottom: 4,
                width: 5, borderRadius: 3,
                background: ACCENT,
                opacity: 0.9,
              }} />
              <h1 style={{
                fontFamily: SERIF, fontSize: 52, fontWeight: 900, lineHeight: 1.08,
                letterSpacing: '-0.025em',
                color: TEXT_PRI,
                paddingLeft: 14,
                margin: 0,
              }}>{personaName}</h1>
            </div>

            {/* Tagline */}
            {personality && (
              <p style={{
                fontFamily: SANS, fontSize: 15, lineHeight: 1.60,
                color: TEXT_SEC, marginBottom: 28, maxWidth: 540,
              }}>{personality}</p>
            )}

            {/* Demographics grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0 24px' }}>
              <DemoItem label="Age"        value={coerce(persona.age_range)} />
              <DemoItem label="Income"     value={coerce(persona.income_range)} />
              <DemoItem label="Location"   value={locationStr} />
              <DemoItem label="Status"     value={coerce(persona.marital_status)} />
            </div>
          </div>

          {/* Right: calibration badge + mini breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <CalibRing score={confidenceScore} size={160} />

            {/* mini metric chips */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: 200 }}>
              {calibBreakdown.map(b => (
                <div key={b.label} style={{
                  background: SURFACE,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8, padding: '10px 8px', textAlign: 'center',
                }}>
                  <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: ACCENT }}>{b.value}%</div>
                  <div style={{ fontFamily: MONO, fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.08em', color: TEXT_TER, marginTop: 3 }}>
                    {b.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─────────────────────────── ROW 1 ─────────────────────────────── */}
        <div style={{ display: 'flex', gap: GAP, marginBottom: GAP, position: 'relative', zIndex: 1 }}>

          {/* Behavioral Dimensions */}
          <Section style={{ width: HALF, flexShrink: 0 }}>
            <SectionTitle>Behavioral Dimensions</SectionTitle>
            {dims.map(d => <DimCard key={d.name} {...d} />)}
          </Section>

          {/* Psychographic Profile */}
          <Section style={{ flex: 1 }}>
            <SectionTitle>Psychographic Profile</SectionTitle>
            {lifestyle   && <PsychoItem label="Lifestyle">{lifestyle}</PsychoItem>}
            {values      && <PsychoItem label="Values">{values}</PsychoItem>}
            {personality && <PsychoItem label="Personality">{personality}</PsychoItem>}

            {interests.length > 0 && (
              <PsychoItem label="Interests">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                  {interests.map(i => <InterestChip key={i} label={i} />)}
                </div>
              </PsychoItem>
            )}

            {motivations && <PsychoItem label="Motivations">{motivations}</PsychoItem>}
          </Section>
        </div>

        {/* ─────────────────────────── ROW 2 – OCEAN ──────────────────────── */}
        <Section style={{ marginBottom: GAP, position: 'relative', zIndex: 1 }}>
          <SectionTitle>OCEAN Personality Profile</SectionTitle>
          <div style={{ display: 'flex', gap: 48, alignItems: 'center' }}>
            {/* Radar */}
            <div style={{ flexShrink: 0 }}>
              <OceanRadar scores={ocean} size={220} />
            </div>

            {/* Value rows */}
            <div style={{ flex: 1 }}>
              {[
                { label: 'Openness',          value: ocean.openness },
                { label: 'Conscientiousness', value: ocean.conscientiousness },
                { label: 'Extraversion',      value: ocean.extraversion },
                { label: 'Agreeableness',     value: ocean.agreeableness },
                { label: 'Neuroticism',       value: ocean.neuroticism },
              ].map(d => (
                <OceanRow key={d.label} label={d.label} value={d.value} />
              ))}
            </div>

            {/* Additional psychometric quick facts */}
            <div style={{ flexShrink: 0, width: 220 }}>
              {persona.occupation && (
                <PsychoItem label="Occupation">{coerce(persona.occupation)}</PsychoItem>
              )}
              {persona.education_level && (
                <PsychoItem label="Education">{coerce(persona.education_level)}</PsychoItem>
              )}
              {persona.digital_activity && (
                <PsychoItem label="Digital Activity">{coerce(persona.digital_activity)}</PsychoItem>
              )}
              {persona.media_consumption && (
                <PsychoItem label="Media">{coerce(persona.media_consumption)}</PsychoItem>
              )}
            </div>
          </div>
        </Section>

        {/* ─────────────────────────── ROW 3 – EVIDENCE ───────────────────── */}
        <Section style={{
          background: `linear-gradient(135deg, ${SURFACE} 0%, ${SURFACE_EL} 100%)`,
          position: 'relative', zIndex: 1,
        }}>
          <SectionTitle>Evidence Base</SectionTitle>

          {/* Top stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginBottom: 20 }}>
            {[
              { n: numPeople,                         label: 'People Analyzed' },
              { n: String(EVIDENCE_SOURCES.length),   label: 'Data Sources' },
              { n: String(TECHNOLOGIES.length),        label: 'Technologies Used' },
            ].map(s => (
              <div key={s.label} style={{
                textAlign: 'center', padding: '16px 12px',
                background: 'rgba(14,99,236,0.04)',
                border: `1px solid ${BORDER}`, borderRadius: 10,
              }}>
                <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: ACCENT, marginBottom: 6 }}>{s.n}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.10em', color: TEXT_TER }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Source tags grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
            {EVIDENCE_SOURCES.map(s => <SourceTag key={s} label={s} />)}
          </div>

          {/* Technology chips */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {TECHNOLOGIES.map(t => <TechTag key={t} label={t} />)}
          </div>
        </Section>

        {/* ── Watermark ── */}
        <div style={{
          position: 'absolute', bottom: 18, right: 28,
          fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,0.18)',
          letterSpacing: '0.10em', zIndex: 2,
        }}>
          SYNTHETIC PEOPLE AI
        </div>
      </div>
    );
  }
);

PersonaCardRenderer.displayName = 'PersonaCardRenderer';

export default PersonaCardRenderer;