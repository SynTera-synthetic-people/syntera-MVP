// avatarParts.ts

export type SkinTone = '#F1C27D' | '#E8A87C' | '#C68642' | '#8D5524' | '#4A2912' | '#FDDBB4';
export const SKIN_TONES: SkinTone[] = ['#FDDBB4', '#F1C27D', '#E8A87C', '#C68642', '#8D5524', '#4A2912'];

// Face shapes — keyed to (gender_bracket × age_bracket)
// gender_bracket: 'M' | 'F'   age_bracket: 'Y' (under 35) | 'O' (35+)
export type FaceKey = 'MY' | 'MO' | 'FY' | 'FO';

export const FACES: Record<FaceKey, (skin: string) => string> = {
  MY: (s) => `<g id="face">
    <ellipse cx="60" cy="68" rx="38" ry="44" fill="${s}"/>
    <path d="M22 82 Q60 114 98 82" fill="${s}" stroke="none"/>
  </g>`,

  MO: (s) => `<g id="face">
    <ellipse cx="60" cy="70" rx="40" ry="44" fill="${s}"/>
    <path d="M20 86 Q60 116 100 86" fill="${s}"/>
  </g>`,

  FY: (s) => `<g id="face">
    <ellipse cx="60" cy="66" rx="34" ry="42" fill="${s}"/>
    <path d="M26 82 Q60 108 94 82" fill="${s}"/>
  </g>`,

  FO: (s) => `<g id="face">
    <ellipse cx="60" cy="68" rx="36" ry="43" fill="${s}"/>
    <path d="M24 84 Q60 110 96 84" fill="${s}"/>
  </g>`,
};

// Hair styles — index 0-4 = feminine-coded, 5-9 = masculine-coded
export const HAIR: [
  (color: string) => string,
  (color: string) => string,
  (color: string) => string,
  (color: string) => string,
  (color: string) => string,
  (color: string) => string,
  (color: string) => string,
  (color: string) => string,
  (color: string) => string,
  (color: string) => string,
] = [
  // 0: long straight — feminine
  (c) => `<g id="hair"><path d="M22 62 Q20 110 30 140 Q60 155 90 140 Q100 110 98 62 Q60 34 22 62Z" fill="${c}"/></g>`,

  // 1: shoulder bob — feminine
  (c) => `<g id="hair"><path d="M22 62 Q20 100 32 120 Q60 128 88 120 Q100 100 98 62 Q60 32 22 62Z" fill="${c}"/></g>`,

  // 2: bun — feminine
  (c) => `<g id="hair"><path d="M26 64 Q60 36 94 64 Q60 50 26 64Z" fill="${c}"/><circle cx="60" cy="32" r="14" fill="${c}"/></g>`,

  // 3: curly long — feminine
  (c) => `<g id="hair"><ellipse cx="60" cy="58" rx="42" ry="28" fill="${c}"/><ellipse cx="28" cy="90" rx="16" ry="24" fill="${c}"/><ellipse cx="92" cy="90" rx="16" ry="24" fill="${c}"/></g>`,

  // 4: ponytail — feminine
  (c) => `<g id="hair"><path d="M24 64 Q60 34 96 64 Q60 48 24 64Z" fill="${c}"/><rect x="52" y="26" width="16" height="40" rx="6" fill="${c}"/></g>`,

  // 5: short crop — masculine
  (c) => `<g id="hair"><path d="M24 66 Q60 34 96 66 Q90 48 60 42 Q30 48 24 66Z" fill="${c}"/></g>`,

  // 6: medium business — masculine
  (c) => `<g id="hair"><path d="M22 68 Q60 32 98 68 Q94 50 60 40 Q26 50 22 68Z" fill="${c}"/><path d="M22 68 Q18 82 22 90 Q30 86 28 72Z" fill="${c}"/><path d="M98 68 Q102 82 98 90 Q90 86 92 72Z" fill="${c}"/></g>`,

  // 7: buzz cut — masculine
  (c) => `<g id="hair"><path d="M26 70 Q60 38 94 70 Q88 56 60 50 Q32 56 26 70Z" fill="${c}" opacity="0.8"/></g>`,

  // 8: bald — returns empty
  (_c) => `<g id="hair"></g>`,

  // 9: textured / afro — masculine
  (c) => `<g id="hair"><ellipse cx="60" cy="50" rx="44" ry="28" fill="${c}"/><ellipse cx="32" cy="64" rx="18" ry="14" fill="${c}"/><ellipse cx="88" cy="64" rx="18" ry="14" fill="${c}"/></g>`,
];

// Clothing — income/seniority mapped
export type ClothingKey = 'casual' | 'business' | 'formal';
export const CLOTHING: Record<ClothingKey, (color: string) => string> = {
  casual: (c) => `<g id="clothing">
    <path d="M20 118 Q20 140 20 160 L100 160 Q100 140 100 118 Q80 108 60 110 Q40 108 20 118Z" fill="${c}"/>
    <!-- crew neck -->
    <path d="M48 110 Q60 122 72 110" fill="none" stroke="${c}" stroke-width="3"/>
  </g>`,
  business: (c) => `<g id="clothing">
    <!-- blazer body -->
    <path d="M18 116 Q16 145 16 160 L104 160 Q104 145 102 116 Q82 106 60 108 Q38 106 18 116Z" fill="${c}"/>
    <!-- lapels -->
    <path d="M60 108 L48 128 L40 116Z" fill="#e8e8e8" opacity="0.5"/>
    <path d="M60 108 L72 128 L80 116Z" fill="#e8e8e8" opacity="0.5"/>
  </g>`,
  formal: (c) => `<g id="clothing">
    <!-- suit jacket -->
    <path d="M16 114 Q14 148 14 160 L106 160 Q106 148 104 114 Q82 104 60 106 Q38 104 16 114Z" fill="${c}"/>
    <!-- white shirt -->
    <rect x="52" y="106" width="16" height="40" fill="#f5f5f5" opacity="0.8"/>
    <!-- tie -->
    <path d="M58 108 L60 115 L62 108Z" fill="#880000"/>
    <path d="M57 115 L60 148 L63 115Z" fill="#880000"/>
    <!-- lapels -->
    <path d="M60 106 L46 126 L38 114Z" fill="${c}"/>
    <path d="M60 106 L74 126 L82 114Z" fill="${c}"/>
  </g>`,
};

// Accessories (profession prop, drawn bottom-right of face)
export type AccessoryKey = 'laptop' | 'headset' | 'stethoscope' | 'briefcase' | 'wrench' | 'pencil' | 'none';
export const ACCESSORIES: Record<AccessoryKey, () => string> = {
  none: () => '',
  laptop: () => `<g id="prop" transform="translate(62,90)">
    <rect x="0" y="0" width="36" height="24" rx="3" fill="#333" stroke="#555" stroke-width="0.5"/>
    <rect x="2" y="2" width="32" height="18" fill="#1a6cc4" opacity="0.8"/>
    <rect x="-4" y="24" width="44" height="4" rx="2" fill="#444"/>
  </g>`,
  headset: () => `<g id="prop" transform="translate(16,32)">
    <!-- band -->
    <path d="M4 20 Q4 0 36 0 Q68 0 68 20" fill="none" stroke="#333" stroke-width="4" stroke-linecap="round"/>
    <!-- ear cups -->
    <rect x="0" y="18" width="10" height="16" rx="4" fill="#333"/>
    <rect x="62" y="18" width="10" height="16" rx="4" fill="#333"/>
    <!-- mic -->
    <path d="M6 26 Q-4 30 -2 38" fill="none" stroke="#555" stroke-width="2"/>
    <circle cx="-2" cy="40" r="3" fill="#555"/>
  </g>`,
  stethoscope: () => `<g id="prop" transform="translate(56,86)">
    <path d="M0 0 Q12 6 12 18 Q12 30 4 30" fill="none" stroke="#666" stroke-width="3" stroke-linecap="round"/>
    <circle cx="4" cy="34" r="6" fill="none" stroke="#888" stroke-width="2"/>
  </g>`,
  briefcase: () => `<g id="prop" transform="translate(60,92)">
    <rect x="0" y="6" width="40" height="30" rx="4" fill="#6B4F2A" stroke="#4A3519" stroke-width="0.5"/>
    <rect x="12" y="0" width="16" height="10" rx="3" fill="none" stroke="#6B4F2A" stroke-width="2.5"/>
    <line x1="0" y1="20" x2="40" y2="20" stroke="#4A3519" stroke-width="1" opacity="0.5"/>
    <rect x="18" y="18" width="4" height="4" rx="1" fill="#c8a84b"/>
  </g>`,
  wrench: () => `<g id="prop" transform="translate(74,82) rotate(-35)">
    <rect x="0" y="0" width="8" height="36" rx="4" fill="#888"/>
    <path d="M0 0 Q-8 2 -8 10 Q-8 18 0 20 Q4 18 4 10 Q4 2 0 0Z" fill="#aaa"/>
    <path d="M8 36 Q0 38 0 46 Q0 54 8 56 Q12 54 12 46 Q12 38 8 36Z" fill="#aaa"/>
  </g>`,
  pencil: () => `<g id="prop" transform="translate(78,78) rotate(-30)">
    <rect x="0" y="0" width="8" height="46" rx="2" fill="#F5C518"/>
    <rect x="0" y="40" width="8" height="8" rx="0" fill="#fddbb4"/>
    <polygon points="0,48 8,48 4,58" fill="#333"/>
    <rect x="0" y="0" width="8" height="6" fill="#d44"/>
    <rect x="1" y="6" width="6" height="2" fill="#bbb"/>
  </g>`,
};