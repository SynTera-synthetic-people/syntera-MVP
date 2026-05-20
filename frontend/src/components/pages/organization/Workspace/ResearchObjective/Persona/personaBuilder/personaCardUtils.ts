// ─────────────────────────────────────────────────────────────────────────────
// personaCardUtils.ts
// Deterministic avatar + color palette generation from persona trait data.
// Zero LLMs, zero external image APIs — everything computed from trait scores.
// ─────────────────────────────────────────────────────────────────────────────

export interface OceanScores {
  openness: number;          // 0–1
  conscientiousness: number; // 0–1
  extraversion: number;      // 0–1
  agreeableness: number;     // 0–1
  neuroticism: number;       // 0–1
}

export interface AvatarConfig {
  /** Primary HSL hue (0–360) */
  hue: number;
  saturation: number;
  lightness: number;
  /** How many orbital shape blobs to draw */
  shapeCount: number;
  /** "structured" = concentric, "organic" = scattered */
  complexity: 'structured' | 'organic';
  /** Deterministic seed for positional calculations */
  seed: number;
  /** Accent hue offset */
  accentHue: number;
}

export interface CardPalette {
  /** Main accent color (css string) */
  accent: string;
  /** Lighter tint */
  accentMuted: string;
  /** Complementary color for secondary data */
  complement: string;
  /** Triadic third color */
  triadic: string;
  /** Raw hsl components for SVG */
  hue: number;
  saturation: number;
  lightness: number;
}

/**
 * Derive a fully deterministic AvatarConfig from OCEAN personality scores.
 *
 * Mapping rationale:
 *  - Hue   ← openness + extraversion (warm = open/extraverted, cool = closed/introverted)
 *  - Shape count ← openness (creative minds = more complexity)
 *  - Layout ← conscientiousness (organised = structured rings, low = organic scatter)
 *  - Saturation ← extraversion (high E = vibrant)
 *  - Lightness ← agreeableness (warm/light = agreeable)
 */
export function buildAvatarConfig(ocean: OceanScores): AvatarConfig {
  // Clamp inputs to 0–1
  const O = Math.min(1, Math.max(0, ocean.openness));
  const C = Math.min(1, Math.max(0, ocean.conscientiousness));
  const E = Math.min(1, Math.max(0, ocean.extraversion));
  const A = Math.min(1, Math.max(0, ocean.agreeableness));

  // Hue: openness drives towards warm yellows/reds (0–60°),
  // extraversion lifts it into teals/blues (180–240°).
  // Combined: low O+E → ~220° (cool blue), high O+E → ~30° (warm amber)
  const hue = ((1 - (O * 0.5 + E * 0.5)) * 200 + 20) % 360;

  const saturation = 48 + E * 30; // 48–78%
  const lightness = 38 + A * 18;  // 38–56%
  const shapeCount = Math.round(3 + O * 4); // 3–7
  const complexity = C > 0.55 ? 'structured' : 'organic';

  // Seed used for positional jitter — integer, stable per persona
  const seed = Math.round(
    (O * 1000 + C * 100 + E * 10 + A) * 137
  );

  const accentHue = (hue + 180) % 360;

  return { hue, saturation, lightness, shapeCount, complexity, seed, accentHue };
}

/**
 * Build the full color palette for a card from an AvatarConfig.
 */
export function buildCardPalette(cfg: AvatarConfig): CardPalette {
  const { hue, saturation, lightness } = cfg;

  const hsl = (h: number, s: number, l: number) =>
    `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;

  return {
    accent:      hsl(hue, saturation, lightness + 15),
    accentMuted: hsl(hue, saturation - 10, lightness + 28),
    complement:  hsl((hue + 60)  % 360, 68, 62),
    triadic:     hsl((hue + 120) % 360, 62, 58),
    hue,
    saturation,
    lightness,
  };
}

/**
 * Render a deterministic SVG avatar string (embeddable as data-uri or inline).
 * All geometry is computed — no external resources needed.
 */
export function renderAvatarSVG(cfg: AvatarConfig, size = 120): string {
  const { hue, saturation, lightness, shapeCount, complexity, seed, accentHue } = cfg;

  const primary  = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  const secondary = `hsl(${(hue + 60) % 360}, ${saturation}%, ${lightness + 15}%)`;
  const accent   = `hsl(${accentHue}, ${saturation + 10}%, ${lightness - 10}%)`;
  const bgStart  = `hsl(${hue}, ${saturation - 20}%, ${lightness + 35}%)`;
  const bgEnd    = `hsl(${hue}, ${saturation - 10}%, ${lightness + 20}%)`;

  // Orbital blobs
  const blobs = Array.from({ length: shapeCount }, (_, i) => {
    const angle = (i / shapeCount) * Math.PI * 2 + seed * 0.01;
    const radius = complexity === 'structured' ? 22 : 18 + ((seed * (i + 1) * 13) % 18);
    const cx = 60 + Math.cos(angle) * radius;
    const cy = 60 + Math.sin(angle) * radius;
    const r  = 8 + (i * 3 % 9);
    const fill = i % 2 === 0 ? primary : secondary;
    const opacity = (0.28 + (i / shapeCount) * 0.32).toFixed(2);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${fill}" opacity="${opacity}"/>`;
  }).join('\n    ');

  const uid = `av${seed}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="bg-${uid}" cx="40%" cy="35%">
      <stop offset="0%" stop-color="${bgStart}"/>
      <stop offset="100%" stop-color="${bgEnd}"/>
    </radialGradient>
    <clipPath id="clip-${uid}"><circle cx="60" cy="60" r="60"/></clipPath>
  </defs>
  <circle cx="60" cy="60" r="60" fill="url(#bg-${uid})"/>
  <g clip-path="url(#clip-${uid})">
    ${blobs}
    <circle cx="60" cy="52" r="22" fill="${primary}" opacity="0.9"/>
    <circle cx="60" cy="52" r="15" fill="${secondary}" opacity="0.85"/>
    <circle cx="60" cy="52" r="8"  fill="${accent}" opacity="0.95"/>
    <ellipse cx="60" cy="85" rx="20" ry="10" fill="${primary}" opacity="0.7"/>
  </g>
</svg>`;
}

/**
 * Convert SVG string to a data URI for use in <img src> or canvas drawImage.
 */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

// ─── OCEAN normalisation helpers ─────────────────────────────────────────────

/**
 * Normalise raw API ocean scores (may be 0–1 or 0–100) to 0–1.
 */
export function normaliseOcean(raw: Record<string, number>): OceanScores {
  const norm = (v: number) => (v > 1 ? v / 100 : v);
  return {
    openness:          norm(raw.openness ?? 0.5),
    conscientiousness: norm(raw.conscientiousness ?? 0.5),
    extraversion:      norm(raw.extraversion ?? 0.5),
    agreeableness:     norm(raw.agreeableness ?? 0.5),
    neuroticism:       norm(raw.neuroticism ?? 0.5),
  };
}

/**
 * Fallback OCEAN scores derived from demographic/behavioural traits when
 * the API hasn't returned an ocean_profile block.
 *
 * This is intentionally rough — good enough to produce a distinct avatar.
 */
export function inferOceanFromTraits(traits: Record<string, unknown>): OceanScores {
  const age = parseInt(String(traits.age_range ?? traits.Age ?? '35'), 10) || 35;
  const gender = String(traits.gender ?? traits.Gender ?? '').toLowerCase();
  const income = String(traits.income_range ?? traits['Income Level'] ?? '');
  const education = String(traits.education_level ?? traits['Education Level'] ?? '');

  // Very rough heuristics — creates stable, varied avatars
  const youngBias = age < 30 ? 0.15 : age > 50 ? -0.1 : 0;
  const femaleBias = gender.startsWith('f') ? 0.08 : 0;
  const highIncome = /lpa|lakh|high|senior|executive/i.test(income) ? 0.1 : 0;
  const educated = /phd|post|master|graduate/i.test(education) ? 0.12 : 0;

  return {
    openness:          Math.min(1, 0.55 + youngBias + educated),
    conscientiousness: Math.min(1, 0.50 + highIncome + educated * 0.5),
    extraversion:      Math.min(1, 0.52 + youngBias + femaleBias),
    agreeableness:     Math.min(1, 0.55 + femaleBias + youngBias * 0.5),
    neuroticism:       Math.max(0, 0.40 - highIncome * 0.5 + youngBias * 0.3),
  };
}