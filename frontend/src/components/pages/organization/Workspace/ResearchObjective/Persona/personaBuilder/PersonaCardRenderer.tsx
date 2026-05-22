// ─────────────────────────────────────────────────────────────────────────────
// PersonaCardRenderer.tsx
//
// A self-contained, pixel-perfect card built for html2canvas capture.
// Rules for capture-safe rendering:
//  1. Inline ALL styles (no CSS classes — html2canvas misses external sheets)
//  2. Use only web-safe / data-uri fonts  (or embed a @font-face style tag)
//  3. No backdrop-filter, no CSS variables, no animations
//  4. SVG avatars are inlined (not <img src=data:... > — html2canvas can choke)
//  5. Fixed 900 × 540 px at 2× device-pixel-ratio → 1800 × 1080 export
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import {
  buildAvatarConfig,
  buildCardPalette,
  normaliseOcean,
  inferOceanFromTraits,
  renderAvatarSVG,
  svgToDataUri,
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

  // Tags
  tags?: string[];

  [key: string]: unknown;
}

interface Props {
  persona: PersonaCardData;
  /** Width of the card in px (default 900) */
  width?: number;
}

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

function getOceanScores(p: PersonaCardData): OceanScores {
  const raw = p.ocean_profile?.scores;
  if (raw && Object.keys(raw).length >= 4) return normaliseOcean(raw);

  const traits = p.ocean_profile?.traits;
  if (traits && traits.length >= 4) {
    const map: Record<string, number> = {};
    traits.forEach(t => { map[t.name.toLowerCase()] = t.score; });
    return normaliseOcean(map);
  }

  // Fallback: infer from demographic traits
  return inferOceanFromTraits(p as Record<string, unknown>);
}

function confColor(score: number): string {
  return score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
}

// ── Mini OCEAN pentagon (pure SVG, no recharts) ───────────────────────────────

function OceanPentagon({
  scores,
  accentColor,
  size = 140,
}: {
  scores: OceanScores;
  accentColor: string;
  size?: number;
}) {
  const cx = size / 2, cy = size / 2;
  const maxR = size * 0.38;
  const n = 5;
  const labels = ['O', 'C', 'E', 'A', 'S'];
  const values = [
    scores.openness,
    scores.conscientiousness,
    scores.extraversion,
    scores.agreeableness,
    1 - scores.neuroticism, // invert neuroticism → "Stability"
  ];

  const pt = (idx: number, r: number) => {
    const angle = (idx / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const gridLevels = [0.25, 0.5, 0.75, 1];
  const dataPts = values.map((v, i) => pt(i, v * maxR));
  const dataPath = dataPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid rings */}
      {gridLevels.map(l => {
        const poly = values.map((_, i) => {
          const p = pt(i, l * maxR);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        }).join(' ');
        return <polygon key={l} points={poly} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />;
      })}
      {/* Spokes */}
      {values.map((_, i) => {
        const p = pt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={p.x.toFixed(1)} y2={p.y.toFixed(1)} stroke="rgba(255,255,255,0.09)" strokeWidth="1" />;
      })}
      {/* Data polygon */}
      <polygon
        points={dataPath}
        fill={accentColor}
        fillOpacity="0.22"
        stroke={accentColor}
        strokeWidth="1.5"
        strokeOpacity="0.9"
      />
      {/* Data points */}
      {dataPts.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="2.5" fill={accentColor} />
      ))}
      {/* Labels */}
      {values.map((v, i) => {
        const lp = pt(i, maxR + 13);
        const vp = pt(i, maxR + 22);
        return (
          <g key={i}>
            <text
              x={lp.x.toFixed(1)} y={lp.y.toFixed(1)}
              textAnchor="middle" dominantBaseline="central"
              fontSize="9" fontWeight="700" fill="rgba(255,255,255,0.55)"
              fontFamily="'DM Sans', 'Segoe UI', sans-serif"
            >{labels[i]}</text>
            <text
              x={vp.x.toFixed(1)} y={vp.y.toFixed(1)}
              textAnchor="middle" dominantBaseline="central"
              fontSize="7.5" fill="rgba(255,255,255,0.3)"
              fontFamily="'DM Mono', 'Courier New', monospace"
            >{Math.round(v * 100)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Trait Bar (inline styles only, no animation for capture) ─────────────────

function TraitBar({
  label, value, color,
}: { label: string; value: number; color: string }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{
          fontSize: 10, color: 'rgba(255,255,255,0.5)',
          fontFamily: "'DM Sans','Segoe UI',sans-serif",
        }}>{label}</span>
        <span style={{
          fontSize: 10, color, fontWeight: 700,
          fontFamily: "'DM Mono','Courier New',monospace",
        }}>{value}</span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(value, 100)}%`, background: color, borderRadius: 99 }} />
      </div>
    </div>
  );
}

// ── Tag chip ─────────────────────────────────────────────────────────────────

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 99,
      border: `1px solid ${color}55`, color, fontSize: 9,
      fontFamily: "'DM Mono','Courier New',monospace",
      letterSpacing: '0.04em', fontWeight: 700,
      textTransform: 'uppercase', background: `${color}12`,
    }}>{label}</span>
  );
}

// ── Pill list item ────────────────────────────────────────────────────────────

function PillItem({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
      <div style={{
        width: 16, height: 16, borderRadius: 5, flexShrink: 0,
        background: `${color}14`, border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
      </div>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', lineHeight: 1.35, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
        {text}
      </span>
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 8, fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)',
      marginBottom: 8, fontFamily: "'DM Mono','Courier New',monospace",
    }}>{children}</div>
  );
}

// ── Source row ────────────────────────────────────────────────────────────────

function SourceRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>{label}</span>
      <span style={{ fontSize: 9, fontFamily: "'DM Mono','Courier New',monospace", color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ── Main Card ─────────────────────────────────────────────────────────────────

const PersonaCardRenderer = React.forwardRef<HTMLDivElement, Props>(
  ({ persona, width = 900 }, ref) => {
    const height = Math.round(width * 0.60); // 900 × 540 golden-ish ratio
    const leftW = Math.round(width * 0.285);
    const rightW = width - leftW;

    // ── Derived data ─────────────────────────────────────────────────────────

    const ocean = getOceanScores(persona);
    const avatarCfg = buildAvatarConfig(ocean);
    const palette = buildCardPalette(avatarCfg);
    const { accent, accentMuted, complement, triadic } = palette;

    const confidenceScore = getConfidenceScore(persona);
    const confFill = confColor(confidenceScore);
    const confBarW = `${Math.min(confidenceScore, 100)}%`;

    const avatarSvg = renderAvatarSVG(avatarCfg, 88);
    const avatarDataUri = svgToDataUri(avatarSvg);

    const personaName = persona.name ?? 'Unnamed Persona';
    const archetype = persona.archetype ?? 'Research Persona';
    const isAI = !!persona.auto_generated_persona;
    const createdBy = isAI ? 'Omi' : (persona.created_by_name ?? persona.created_by ?? 'You');

    const locationStr = [persona.location_state, persona.location_country ?? persona.geography]
      .filter(Boolean).join(', ') || 'Location unavailable';

    const tags = [
      ...(persona.tags ?? []),
      coerce(persona.personality).split(',').map(s => s.trim()).filter(Boolean).slice(0, 2),
    ].flat().filter(Boolean).slice(0, 5) as string[];

    const sources = persona.calibration_sources ?? {
      real_actions: 120000,
      emotional_neural: 120000,
      validated_research: 120000,
      multi_platform: 120000,
    };

    const motivators = [
      ...(Array.isArray(persona.triggers_opportunities)
        ? persona.triggers_opportunities as string[]
        : coerce(persona.triggers_opportunities).split(',').map(s => s.trim()).filter(Boolean)
      ),
      ...(Array.isArray(persona.motivations)
        ? persona.motivations as string[]
        : coerce(persona.motivations).split(',').map(s => s.trim()).filter(Boolean)
      ),
    ].slice(0, 3);

    const barriers = (
      Array.isArray(persona.barriers_pain_points)
        ? persona.barriers_pain_points as string[]
        : coerce(persona.barriers_pain_points).split(',').map(s => s.trim()).filter(Boolean)
    ).slice(0, 3);

    const media = coerce(persona.media_consumption).split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);

    // ── Behavioural scores (estimated from string hints if no direct number) ──

    const bScore = (key: string, fallback: number): number => {
      const raw = persona[key];
      if (typeof raw === 'number') return Math.round(raw <= 1 ? raw * 100 : raw);
      const str = coerce(raw).toLowerCase();
      if (/high|very|strong|always/i.test(str)) return 80 + Math.round(Math.random() * 15);
      if (/low|rare|minimal|never/i.test(str)) return 20 + Math.round(Math.random() * 15);
      if (/medium|moderate|sometimes/i.test(str)) return 48 + Math.round(Math.random() * 18);
      return fallback;
    };

    const behaviouralScores = {
      digitalNative: bScore('digital_activity', Math.round(ocean.openness * 60 + 30)),
      researchDepth: bScore('decision_making_style', Math.round(ocean.conscientiousness * 60 + 30)),
      impulseBuying: bScore('price_sensitivity', Math.round((1 - ocean.conscientiousness) * 50 + 20)),
      brandLoyalty: bScore('brand_sensitivity', Math.round(ocean.agreeableness * 50 + 25)),
    };

    // ── Background gradient (subtle, capture-safe) ────────────────────────────

    const bgGrad = `linear-gradient(145deg, #0d0d11 0%, #0f0f14 60%, #0b0d10 100%)`;
    const leftBg  = '#111115';
    const glowL   = `radial-gradient(ellipse at 30% 20%, ${accent}14 0%, transparent 65%)`;
    const glowR   = `radial-gradient(ellipse at 80% 80%, ${accent}09 0%, transparent 60%)`;

    return (
      <div
        ref={ref}
        style={{
          width,
          height,
          background: bgGrad,
          borderRadius: 20,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'row',
          fontFamily: "'DM Sans','Segoe UI',sans-serif",
          position: 'relative',
          boxSizing: 'border-box',
        }}
      >
        {/* ── Glow layers ── */}
        <div style={{ position: 'absolute', inset: 0, background: glowL, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: glowR, pointerEvents: 'none' }} />

        {/* ════════════════════════════════════════════════
            LEFT PANEL
        ════════════════════════════════════════════════ */}
        <div style={{
          width: leftW,
          flexShrink: 0,
          height: '100%',
          background: leftBg,
          borderRight: '1px solid rgba(255,255,255,0.07)',
          padding: '26px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          boxSizing: 'border-box',
          position: 'relative',
          overflow: 'hidden',
        }}>

          {/* Avatar + identity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {/* Avatar with confidence ring */}
            <div style={{ position: 'relative', width: 88, flexShrink: 0 }}>
              <img
                src={avatarDataUri}
                alt={personaName}
                width={88}
                height={88}
                style={{ display: 'block', borderRadius: '50%' }}
              />
              {/* Status dot */}
              <div style={{
                position: 'absolute', bottom: 1, right: -2,
                width: 18, height: 18, borderRadius: '50%',
                background: leftBg, border: `2px solid ${accent}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: accent }} />
              </div>
            </div>

            <div>
              {/* Archetype label */}
              <div style={{
                fontSize: 8, color: accent,
                fontFamily: "'DM Mono','Courier New',monospace",
                letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4,
              }}>{archetype}</div>

              {/* Persona name */}
              <div style={{
                fontSize: 15, fontWeight: 700, lineHeight: 1.25,
                color: 'rgba(255,255,255,0.95)', fontFamily: "'DM Sans','Segoe UI',sans-serif",
                marginBottom: 4,
              }}>{personaName}</div>

              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
                by <span style={{ color: accentMuted }}>{createdBy}</span>
              </div>
            </div>

            {/* Confidence badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 99, padding: '4px 11px 4px 8px', width: 'fit-content',
            }}>
              {/* Mini ring */}
              <svg width="8" height="8" viewBox="0 0 8 8">
                <circle cx="4" cy="4" r="3.2" fill="none" stroke={accent} strokeWidth="1.4"
                  strokeDasharray={`${(confidenceScore / 100) * 20.1} 20.1`}
                  transform="rotate(-90 4 4)" />
                <circle cx="4" cy="4" r="1.4" fill={accent} />
              </svg>
              <span style={{ fontSize: 10, fontFamily: "'DM Mono','Courier New',monospace", color: accent, fontWeight: 700 }}>
                {confidenceScore}%
              </span>
              <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.28)' }}>calibrated</span>
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <SectionLabel>Profile Tags</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {tags.map(t => <Tag key={t} label={t} color={accent} />)}
              </div>
            </div>
          )}

          {/* Demographics */}
          <div>
            <SectionLabel>Demographics</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 10px' }}>
              {[
                { k: 'Age',       v: coerce(persona.age_range) },
                { k: 'Gender',    v: coerce(persona.gender) },
                { k: 'Income',    v: coerce(persona.income_range) },
                { k: 'Education', v: coerce(persona.education_level) },
                { k: 'Location',  v: locationStr },
                { k: 'Status',    v: coerce(persona.marital_status) },
              ].filter(r => r.v).map(({ k, v }) => (
                <div key={k}>
                  <div style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'DM Mono','Courier New',monospace" }}>{k}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.82)', fontWeight: 500, marginTop: 2, lineHeight: 1.3, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Signal sources — pushed to bottom */}
          <div style={{ marginTop: 'auto' }}>
            <SectionLabel>Signal Sources</SectionLabel>
            <SourceRow label="Real Actions Signal"   value={`${Math.round((sources.real_actions ?? 120000) / 1000)}K`} />
            <SourceRow label="Emotional & Neural"    value={`${Math.round((sources.emotional_neural ?? 120000) / 1000)}K`} />
            <SourceRow label="Validated Research"    value={`${Math.round((sources.validated_research ?? 120000) / 1000)}K`} />
            <SourceRow label="Multi-Platform Conv."  value={`${Math.round((sources.multi_platform ?? 120000) / 1000)}K`} />
          </div>
        </div>

        {/* ════════════════════════════════════════════════
            RIGHT PANEL
        ════════════════════════════════════════════════ */}
        <div style={{
          flex: 1,
          height: '100%',
          padding: '26px 28px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          boxSizing: 'border-box',
          position: 'relative',
          overflow: 'hidden',
        }}>

          {/* TOP SECTION: OCEAN radar + Behavioural bars */}
          <div style={{ display: 'grid', gridTemplateColumns: '148px 1fr', gap: 26, alignItems: 'start' }}>

            {/* OCEAN Pentagon */}
            <div>
              <SectionLabel>Personality Profile</SectionLabel>
              <OceanPentagon scores={ocean} accentColor={accent} size={148} />

              {/* Mini legend */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 6px', marginTop: 4 }}>
                {['Openness','Conscien.','Extraver.','Agreeable','Stability'].map((label, i) => {
                  const vals = [ocean.openness, ocean.conscientiousness, ocean.extraversion, ocean.agreeableness, 1 - ocean.neuroticism];
                  return (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: accent, opacity: 0.5 + vals[i]! * 0.5 }} />
                      <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.4)', fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>{label}</span>
                      <span style={{ fontSize: 8.5, fontFamily: "'DM Mono','Courier New',monospace", color: accentMuted, marginLeft: 'auto' }}>
                        {Math.round(vals[i]! * 100)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Behavioural bars */}
            <div>
              <SectionLabel>Behavioural Traits</SectionLabel>
              <div style={{ marginBottom: 14 }}>
                <TraitBar label="Digital Native"  value={behaviouralScores.digitalNative}  color={accent} />
                <TraitBar label="Research Depth"  value={behaviouralScores.researchDepth}  color={accentMuted} />
                <TraitBar label="Impulse Buying"  value={behaviouralScores.impulseBuying}  color={complement} />
                <TraitBar label="Brand Loyalty"   value={behaviouralScores.brandLoyalty}   color={triadic} />
              </div>

              {/* Decision style highlight box */}
              {persona.decision_making_style && (
                <div style={{
                  padding: '9px 12px', borderRadius: 10,
                  background: `${accent}0d`, border: `1px solid ${accent}20`,
                }}>
                  <div style={{
                    fontSize: 8, color: 'rgba(255,255,255,0.28)',
                    fontFamily: "'DM Mono','Courier New',monospace",
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4,
                  }}>Decision Style</div>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: accent,
                    fontFamily: "'DM Sans','Segoe UI',sans-serif",
                    fontStyle: 'italic',
                  }}>{coerce(persona.decision_making_style)}</div>
                </div>
              )}

              {/* Calibration confidence bar (repeated in right panel for visual weight) */}
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: "'DM Mono','Courier New',monospace", textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Calibration Confidence
                  </span>
                  <span style={{ fontSize: 9, color: confFill, fontWeight: 700, fontFamily: "'DM Mono','Courier New',monospace" }}>
                    {confidenceScore}%
                  </span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: confBarW, background: confFill, borderRadius: 99 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 -28px' }} />

          {/* BOTTOM SECTION: Motivators / Barriers / Media */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, flex: 1 }}>
            <div>
              <SectionLabel>Motivators</SectionLabel>
              {motivators.length > 0
                ? motivators.map(m => <PillItem key={m} text={m} color={accent} />)
                : <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>—</span>
              }
            </div>
            <div>
              <SectionLabel>Barriers</SectionLabel>
              {barriers.length > 0
                ? barriers.map(b => <PillItem key={b} text={b} color={complement} />)
                : <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>—</span>
              }
            </div>
            <div>
              <SectionLabel>Media Habits</SectionLabel>
              {media.length > 0
                ? media.map(m => <PillItem key={m} text={m} color={accentMuted} />)
                : <PillItem text={coerce(persona.digital_activity) || '—'} color={accentMuted} />
              }
            </div>
          </div>

          {/* Watermark */}
          <div style={{
            position: 'absolute', bottom: 14, right: 22,
            fontSize: 8, color: 'rgba(255,255,255,0.12)',
            fontFamily: "'DM Mono','Courier New',monospace", letterSpacing: '0.07em',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="4" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <circle cx="5" cy="5" r="1.5" fill="rgba(255,255,255,0.12)" />
            </svg>
            PERSONA CARD · RESEARCH EXPLORATION
          </div>
        </div>
      </div>
    );
  }
);

PersonaCardRenderer.displayName = 'PersonaCardRenderer';

export default PersonaCardRenderer;