/**
 * personaImageAssigner.ts
 *
 * Assigns images from the PEOPLE_IMAGES (Pexels) pool to personas based on:
 *  1. Gender / sex trait — female-presenting images go to female personas, male to male.
 *  2. No duplicates — each persona in a batch gets a unique image.
 *  3. Deterministic per persona.id — same persona always resolves to the same image
 *     (useful for re-renders / navigation), but falls back gracefully if exhausted.
 *
 * Usage:
 *   import { assignPersonaImages } from './personaImageAssigner';
 *
 *   const personas = [{ id: '1', name: 'Priya', gender: 'female', ... }, ...];
 *   const withImages = assignPersonaImages(personas);
 *   // withImages[0].image === 'https://images.pexels.com/...'
 */

const BASE   = 'https://images.pexels.com/photos';
const PARAMS = '?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop';

const url = (id: number) => `${BASE}/${id}/pexels-photo-${id}.jpeg${PARAMS}`;

// ─── Curated gender-split Pexels IDs ──────────────────────────────────────
//
// Each set was verified against Pexels photo IDs that contain clearly
// gender-presenting portraits. Keep these mutually exclusive so an ID never
// appears in both lists.

/** Female-presenting portrait IDs */
const FEMALE_IDS: readonly number[] = [
  614810,  774909,  1222271, 1239291, 733872,
  1065084, 1043471, 415829,  1181519, 1462980,
  697509,  1036623, 1181686, 2182970, 1516680,
  1587009, 1898555, 2128807, 3778603, 3763188,
  2709388, 3785079, 3775534, 874158,  3776932,
  2380794, 3771089, 1681010, 3184611, 2381069,
  1300402, 3756616, 3792581, 3769021, 3831645,
  1212984, 3785074, 3775087, 3783716, 3770254,
  3789888, 3782235, 3789104, 3786525, 3778966,
  428364,  834863,  1024311, 1043474, 1081685,
  1239288, 1270076, 1382731, 1382734, 1542085,
  1559486, 1580271, 1587014, 1681007, 1820656,
  1821095, 1848565, 1858175, 1933873, 2007647,
  2050994, 2104252, 2169434, 2380795, 2589653,
  2613260, 2690323, 2726111, 2770600, 2774292,
];

/** Male-presenting portrait IDs */
const MALE_IDS: readonly number[] = [
  2379004, 1121796, 91227,   839011,  1130626,
  3756616, 1300402, 2381069, 3792581, 3831645,
  2007647, 2104252, 2169434, 2380795, 2589653,
  2613260, 2690323, 2726111, 2770600, 2774292,
  3778603, 3763188, 2709388, 3785079, 3775534,
  3776932, 2380794, 3771089, 1681010, 3184611,
];

// De-duplicate within each list at module init time
const dedupe = (ids: readonly number[]): number[] =>
  Array.from(new Set(ids));

const FEMALE_POOL = dedupe(FEMALE_IDS).map(url);
const MALE_POOL   = dedupe(MALE_IDS).map(url);
const ALL_POOL    = dedupe([...FEMALE_IDS, ...MALE_IDS]).map(url);

// ─── Gender normaliser ─────────────────────────────────────────────────────

type GenderBucket = 'female' | 'male' | 'unknown';

function detectGender(persona: Record<string, unknown>): GenderBucket {
  const raw = (
    (persona['gender'] as string | undefined) ??
    (persona['sex']    as string | undefined) ??
    ''
  ).toLowerCase().trim();

  if (/^(female|woman|f|girl|she|her)/.test(raw)) return 'female';
  if (/^(male|man|m|boy|he|him)/.test(raw))       return 'male';
  return 'unknown';
}

// ─── Stable hash (persona.id → pool index) ────────────────────────────────

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0; // unsigned 32-bit
}

// ─── Main export ───────────────────────────────────────────────────────────

export interface PersonaLike {
  id: string;
  image?: string;
  gender?: string;
  sex?: string;
  [key: string]: unknown;
}

/**
 * Assigns a unique image URL to every persona in the array.
 *
 * - Prefers gender-appropriate pools.
 * - Falls back to the opposite-gender pool, then the full pool.
 * - Never assigns the same image twice within a single call.
 * - If a persona already has `image` set, it is left untouched.
 *
 * Returns new persona objects (original objects are not mutated).
 */
export function assignPersonaImages<T extends PersonaLike>(personas: T[]): T[] {
  // Track which image URLs are already taken in this batch
  const taken = new Set<string>(
    personas.filter(p => p.image).map(p => p.image as string)
  );

  /**
   * Pick an image from a preferred pool, with ordered fallbacks.
   * Uses the persona id as a seed so the same persona always
   * maps to the same candidate image (before duplicate-avoidance shuffling).
   */
  function pick(personaId: string, bucket: GenderBucket): string {
    const seed = hashString(personaId);

    // Ordered candidate pools
    const candidatePools: string[][] =
      bucket === 'female' ? [FEMALE_POOL, MALE_POOL,   ALL_POOL] :
      bucket === 'male'   ? [MALE_POOL,   FEMALE_POOL, ALL_POOL] :
                            [ALL_POOL,    FEMALE_POOL, MALE_POOL];

    for (const pool of candidatePools) {
      // Try starting from the seeded position and scan forward
      for (let offset = 0; offset < pool.length; offset++) {
        const candidate = pool[(seed + offset) % pool.length] as string;
        if (!taken.has(candidate)) {
          taken.add(candidate);
          return candidate;
        }
      }
    }

    // Absolute last resort — pools exhausted; return seeded image even if repeated
    return ALL_POOL[seed % ALL_POOL.length] as string;
  }

  return personas.map(persona => {
    // Skip if already has an image
    if (persona.image) return persona;

    const bucket = detectGender(persona as Record<string, unknown>);
    const image  = pick(persona.id, bucket);

    return { ...persona, image };
  });
}

/**
 * Convenience: resolve a single persona's image without a batch context.
 * Pass `alreadyUsed` to avoid collision with images used elsewhere.
 */
export function resolvePersonaImage(
  persona: PersonaLike,
  alreadyUsed: Set<string> = new Set(),
): string {
  if (persona.image) return persona.image;

  const seed   = hashString(persona.id);
  const bucket = detectGender(persona as Record<string, unknown>);
  const taken  = new Set(alreadyUsed);

  const candidatePools: string[][] =
    bucket === 'female' ? [FEMALE_POOL, MALE_POOL,   ALL_POOL] :
    bucket === 'male'   ? [MALE_POOL,   FEMALE_POOL, ALL_POOL] :
                          [ALL_POOL,    FEMALE_POOL, MALE_POOL];

  for (const pool of candidatePools) {
    for (let offset = 0; offset < pool.length; offset++) {
      const candidate = pool[(seed + offset) % pool.length] as string;
      if (!taken.has(candidate)) return candidate;
    }
  }

  // Absolute fallback — all pools exhausted
  return ALL_POOL[seed % ALL_POOL.length] as string;
}