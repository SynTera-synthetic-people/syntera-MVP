// ── Persona Avatar Utilities ──────────────────────────────────────────────────
// Generates a deterministic, gender-aware avatar for each persona.
// Falls back gracefully when gender data is absent.

export type AvatarGender = 'male' | 'female' | 'neutral';
export type AvatarStyle = 'dark' | 'blue' | 'pink' | 'teal' | 'purple' | 'orange';

export interface AvatarConfig {
  gender: AvatarGender;
  bgColor: string;
  ringColor: string;
  iconColor: string;
  label: string;
}

// ── Gender detection ──────────────────────────────────────────────────────────

const FEMALE_KEYWORDS = [
  'female', 'woman', 'girl', 'she', 'her', 'lady', 'ms', 'mrs', 'miss',
  'mother', 'mom', 'daughter', 'sister', 'aunt', 'grandmother', 'wife',
];

const MALE_KEYWORDS = [
  'male', 'man', 'boy', 'he', 'him', 'his', 'mr', 'father', 'dad',
  'son', 'brother', 'uncle', 'grandfather', 'husband',
];

export function detectGender(persona: Record<string, unknown>): AvatarGender {
  // ── Step 1: check the dedicated gender / sex field directly ──────────────
  // API returns exact values like "Female", "Male", "female", "male", "F", "M"
  // Check this field in isolation BEFORE any concatenated matching to avoid
  // "Female".includes("male") === true false-positive.
  const genderField = String(persona.gender ?? persona.sex ?? '').trim().toLowerCase();

  if (genderField === 'female' || genderField === 'f' || genderField === 'woman') {
    return 'female';
  }
  if (genderField === 'male' || genderField === 'm' || genderField === 'man') {
    return 'male';
  }

  // ── Step 2: fallback fuzzy scan on other fields (name, occupation, etc.) ──
  // Exclude the gender field itself from this scan to avoid re-triggering the
  // "female contains male" bug.
  const haystack = [
    persona.name,
    persona.occupation,
    persona.description,
    persona.bio,
    persona.demographics,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // Use word-boundary safe checks: wrap keywords so "male" won't fire inside "female"
  const wordMatch = (word: string) => new RegExp(`\\b${word}\\b`).test(haystack);

  const femaleScore = FEMALE_KEYWORDS.filter(wordMatch).length;
  const maleScore   = MALE_KEYWORDS.filter(wordMatch).length;

  if (femaleScore > maleScore) return 'female';
  if (maleScore > femaleScore) return 'male';
  return 'neutral';
}

// ── Color palette ─────────────────────────────────────────────────────────────
// Each persona gets a stable color derived from their id so the color
// never changes between renders, yet differs across personas.

const MALE_PALETTES = [
  { bgColor: '#1a1d2a', ringColor: '#3B82F6', iconColor: '#3B82F6' }, // blue
  { bgColor: '#1a1d2a', ringColor: '#06A17B', iconColor: '#06A17B' }, // teal
  { bgColor: '#1a1d2a', ringColor: '#8B5CF6', iconColor: '#8B5CF6' }, // purple
  { bgColor: '#1a1d2a', ringColor: '#F59E0B', iconColor: '#F59E0B' }, // amber
];

const FEMALE_PALETTES = [
  { bgColor: '#1a1d2a', ringColor: '#EC4899', iconColor: '#EC4899' }, // pink
  { bgColor: '#1a1d2a', ringColor: '#F472B6', iconColor: '#F472B6' }, // rose
  { bgColor: '#1a1d2a', ringColor: '#A78BFA', iconColor: '#A78BFA' }, // violet
  { bgColor: '#1a1d2a', ringColor: '#34D399', iconColor: '#34D399' }, // emerald
];

const NEUTRAL_PALETTES = [
  { bgColor: '#1a1d2a', ringColor: '#9CA3AF', iconColor: '#9CA3AF' }, // gray
  { bgColor: '#1a1d2a', ringColor: '#60A5FA', iconColor: '#60A5FA' }, // light-blue
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getAvatarConfig(persona: Record<string, unknown>): AvatarConfig {
  const id = (persona.id as string) ?? String(Math.random());
  const gender = detectGender(persona);
  const hash = hashId(id);

  const palettes =
    gender === 'female'
      ? FEMALE_PALETTES
      : gender === 'male'
      ? MALE_PALETTES
      : NEUTRAL_PALETTES;

  const palette = palettes[hash % palettes.length]!;

  return {
    gender,
    ...palette,
    label: gender === 'female' ? 'F' : gender === 'male' ? 'M' : '?',
  };
}