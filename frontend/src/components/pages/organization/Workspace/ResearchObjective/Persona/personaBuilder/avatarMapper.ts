import type { PersonaCardData } from './PersonaCardRenderer';
import type { FaceKey, ClothingKey, AccessoryKey, SkinTone } from './avatarParts';
import { SKIN_TONES } from './avatarParts';

export interface AvatarSelection {
  faceKey: FaceKey;
  hairIndex: number;
  hairColor: string;
  skinTone: SkinTone;
  clothingKey: ClothingKey;
  clothingColor: string;
  accessoryKey: AccessoryKey;
}

const OCCUPATION_TO_PROP: Record<string, AccessoryKey> = {
  engineer: 'laptop', developer: 'laptop', programmer: 'laptop',
  analyst: 'laptop', designer: 'laptop',
  support: 'headset', sales: 'headset', manager: 'headset',
  doctor: 'stethoscope', nurse: 'stethoscope', therapist: 'stethoscope',
  executive: 'briefcase', lawyer: 'briefcase', consultant: 'briefcase',
  technician: 'wrench', mechanic: 'wrench',
  teacher: 'pencil', writer: 'pencil', researcher: 'pencil',
};

export function mapPersonaToAvatar(p: PersonaCardData): AvatarSelection {
  const age    = parseInt(String(p.age_range ?? '30'), 10) || 30;
  const gender = String(p.gender ?? '').toLowerCase();
  const income = String(p.income_range ?? '').toLowerCase();
  const occ    = String(p.occupation ?? '').toLowerCase();

  // Face key
  const isF  = gender.startsWith('f') || gender === 'woman';
  const isY  = age < 36;
  const faceKey: FaceKey = `${isF ? 'F' : 'M'}${isY ? 'Y' : 'O'}`;

  // Hair index — stable, derived from name hash + age bracket
  const nameHash = [...(p.name ?? 'X')].reduce((a, c) => a + c.charCodeAt(0), 0);
  const hairPool = isF ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9];
  const hairIndex = hairPool[nameHash % hairPool.length] ?? 5;

  // Hair color — age-driven
  const hairColors = age < 30 ? ['#1a1a1a', '#3B2314', '#8B6914', '#C9A96E', '#6B3A2A']
    : age < 50 ? ['#2C1810', '#4A3728', '#6B4F35', '#8B7355', '#5C4033']
    : ['#888888', '#6B6B6B', '#555555', '#9A9A9A', '#777777'];
  const hairColor = hairColors[nameHash % hairColors.length] ?? '#1a1a1a';

  // Skin tone — 6-step palette, hash-stable
const skinTone: SkinTone = SKIN_TONES[(nameHash + age) % SKIN_TONES.length] ?? '#FDDBB4';

  // Clothing
  const isHighIncome = /lpa|lakh|senior|exec|direct|vp|chief|\d{2,}l/i.test(income);
  const isMidIncome  = /mid|manager|lead/i.test(income) || (!isHighIncome && age > 35);
  const clothingKey: ClothingKey = isHighIncome ? 'formal' : isMidIncome ? 'business' : 'casual';

  const clothingColors = {
    formal:   ['#1a2340', '#2C3E50', '#3D3D3D', '#1B4332'],
    business: ['#2C4A6B', '#34495E', '#5D4037', '#4A235A'],
    casual:   ['#2980B9', '#27AE60', '#E67E22', '#8E44AD', '#C0392B'],
  };
  const ccPool = clothingColors[clothingKey];
  const clothingColor = ccPool[nameHash % ccPool.length] ?? '#2C3E50';

  // Accessory
  const occWords = occ.split(/\s+/);
  let accessoryKey: AccessoryKey = 'none';
  for (const word of occWords) {
    for (const [key, prop] of Object.entries(OCCUPATION_TO_PROP)) {
      if (word.includes(key)) { accessoryKey = prop; break; }
    }
    if (accessoryKey !== 'none') break;
  }

  return { faceKey, hairIndex, hairColor, skinTone, clothingKey, clothingColor, accessoryKey };
}