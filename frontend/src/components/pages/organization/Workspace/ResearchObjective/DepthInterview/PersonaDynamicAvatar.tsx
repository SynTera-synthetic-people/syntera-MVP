import React from 'react';
import { getAvatarConfig, type AvatarGender } from './PersonaAvatarUtils';

// ─────────────────────────────────────────────────────────────────────────────
// MALE silhouette
//   • Flat-top rectangular head (no rounding at top)
//   • Very wide, angular shoulders — clearly masculine trapezoid
// ─────────────────────────────────────────────────────────────────────────────
const MaleSilhouette: React.FC<{ color: string; size?: number }> = ({ color, size = 56 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill={color} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    {/* Head — squarish, flat top */}
    <rect x="30" y="5" width="40" height="38" rx="8" ry="4" />
    {/* Neck */}
    <rect x="40" y="41" width="20" height="10" rx="3" />
    {/* Wide trapezoidal shoulders + body block */}
    <path d="M0 100 L0 80 Q0 65 20 62 L38 58 Q44 56 50 56 Q56 56 62 58 L80 62 Q100 65 100 80 L100 100 Z" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// FEMALE silhouette
//   • Round head
//   • Long hair: two thick curtains falling well below the chin on each side
//   • Narrow, rounded shoulders
// ─────────────────────────────────────────────────────────────────────────────
const FemaleSilhouette: React.FC<{ color: string; size?: number }> = ({ color, size = 56 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill={color} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    {/* Hair back — wide shape that extends well below the head */}
    <path d="M22 20 Q18 8 50 6 Q82 8 78 20 L76 62 Q72 70 68 62 L68 36 Q67 44 50 44 Q33 44 32 36 L32 62 Q28 70 24 62 Z" />
    {/* Head — round, sits on top of hair */}
    <circle cx="50" cy="27" r="20" />
    {/* Neck */}
    <rect x="42" y="45" width="16" height="10" rx="3" />
    {/* Narrower rounded shoulders */}
    <path d="M15 100 L15 82 Q15 68 28 65 L40 61 Q45 59 50 59 Q55 59 60 61 L72 65 Q85 68 85 82 L85 100 Z" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// NEUTRAL silhouette (standard person icon style)
// ─────────────────────────────────────────────────────────────────────────────
const NeutralSilhouette: React.FC<{ color: string; size?: number }> = ({ color, size = 56 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill={color} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="50" cy="28" r="20" />
    <rect x="40" y="46" width="20" height="10" rx="3" />
    <path d="M5 100 L5 80 Q5 65 22 62 L38 58 Q44 56 50 56 Q56 56 62 58 L78 62 Q95 65 95 80 L95 100 Z" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────

interface PersonaDynamicAvatarProps {
  persona: Record<string, unknown>;
  size?: number;
  className?: string;
}

const SILHOUETTE: Record<AvatarGender, React.FC<{ color: string; size?: number }>> = {
  male: MaleSilhouette,
  female: FemaleSilhouette,
  neutral: NeutralSilhouette,
};

const PersonaDynamicAvatar: React.FC<PersonaDynamicAvatarProps> = ({
  persona,
  size = 86,
  className,
}) => {
  const config = getAvatarConfig(persona);
  const Silhouette = SILHOUETTE[config.gender];
  // Fill ~72% of circle so silhouette is large and immediately readable
  const iconSize = Math.round(size * 0.72);

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: config.bgColor,
        border: `2px solid rgba(255,255,255,0.08)`,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: `inset 0 0 22px ${config.iconColor}30`,
      }}
      title={`${(persona.name as string) ?? 'Persona'} (${config.gender})`}
    >
      <Silhouette color={config.iconColor} size={iconSize} />
    </div>
  );
};

export default PersonaDynamicAvatar;