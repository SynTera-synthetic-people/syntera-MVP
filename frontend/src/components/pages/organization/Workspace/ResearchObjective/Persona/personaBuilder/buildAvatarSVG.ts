import { FACES, HAIR, CLOTHING, ACCESSORIES } from './avatarParts';
import type { AvatarSelection } from './avatarMapper';

export function buildAvatarSVG(sel: AvatarSelection, size = 120): string {
  const {
    faceKey, hairIndex, hairColor, skinTone,
    clothingKey, clothingColor, accessoryKey,
  } = sel;

  const face      = FACES[faceKey](skinTone);
  const hairFn = HAIR[hairIndex] ?? HAIR[5]!;
const hair = hairFn(hairColor);
  const clothing  = CLOTHING[clothingKey](clothingColor);
  const accessory = ACCESSORIES[accessoryKey]();

  // Eyes + brow (simple, shared across all face types)
  const features = `
    <ellipse cx="46" cy="60" rx="5" ry="6" fill="#1a0a00"/>
    <ellipse cx="74" cy="60" rx="5" ry="6" fill="#1a0a00"/>
    <ellipse cx="45" cy="58" rx="2" ry="2.5" fill="white" opacity="0.6"/>
    <ellipse cx="73" cy="58" rx="2" ry="2.5" fill="white" opacity="0.6"/>
    <path d="M41 52 Q46 49 51 52" stroke="#333" stroke-width="1.5" fill="none"/>
    <path d="M69 52 Q74 49 79 52" stroke="#333" stroke-width="1.5" fill="none"/>
    <path d="M50 72 Q60 78 70 72" stroke="${skinTone}" stroke-width="2" fill="none" opacity="0.6"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 160">
  <defs>
    <clipPath id="ava-clip"><rect width="120" height="160"/></clipPath>
  </defs>
  <g clip-path="url(#ava-clip)">
    ${clothing}
    ${face}
    ${hair}
    ${features}
    ${accessory}
  </g>
</svg>`;
}