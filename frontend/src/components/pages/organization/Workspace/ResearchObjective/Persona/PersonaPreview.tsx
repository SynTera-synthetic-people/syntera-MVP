import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TbArrowLeft,
  TbArrowRight,
  TbLoader,
} from 'react-icons/tb';
import {
  SiLinkedin,
  SiQuora,
  SiYoutube,
  SiX,
  SiInstagram,
  SiReddit,
} from 'react-icons/si';
import { MdStarRate, MdOutlinePublic } from 'react-icons/md';
import SpIcon from '../../../../../SPIcon';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';

import {
  usePersonaPreview,
  useDeletePersona,
  usePersonas,
} from '../../../../../../hooks/usePersonaBuilder';
import { useTheme } from '../../../../../../context/ThemeContext';
import omiTransitionSrc from '../../../../../../assets/Omi Animations/OmiTransition.mp4';
import omiDarkImg from '../../../../../../assets/OMI_Dark.png';
import './PersonaPerview.css';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TraitMap {
  [key: string]: unknown;
  _additionalTraitKeys?: string[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const BASE_TABS = [
  {
    key: 'demographics',
    label: 'Demographics',
    fields: [
      'Age', 'Gender', 'Income Level', 'Education Level',
      'Occupation / Employment Type', 'Family Structure', 'Geography',
      'Marital Status',
    ],
  },
  {
    key: 'psychographic',
    label: 'Psychographic Traits',
    fields: ['Lifestyle', 'Values', 'Personality', 'Interests', 'Motivations'],
  },
  {
    key: 'behavioral',
    label: 'Behavioural Traits',
    fields: [
      'Decision Making Style', 'Purchase Frequency', 'Purchase Channel',
      'Price Sensitivity', 'Brand Sensitivity', 'Price Sensitivity Profile',
      'Loyalty / Switching Behavior', 'Purchase Triggers & Occasions',
      'Purchase Barriers', 'Decision-Making Style', 'Media Consumption Patterns',
      'Digital Behavior', 'Digital Activity', 'Preferences', 'Professional Traits',
      'Hobbies & Interests', 'Mobility', 'Home Ownership', 'Daily Rhythm',
    ],
  },
  { key: 'ocean', label: 'Ocean Personality Profile', fields: [] },
  { key: 'psychometric', label: 'Psychometric Profile', fields: [] },
  { key: 'calibration', label: 'Calibration Breakdown', fields: [] },
] as const;

const FORMATIVE_TAB = { key: 'formative', label: 'Formative Experience', fields: [] } as const;

type BaseTabKey = typeof BASE_TABS[number]['key'];
type TabKey = BaseTabKey | 'formative';

// ── Calibration static data definitions ───────────────────────────────────────

interface CalibParamItem {
  icon: React.ReactNode;
  label: string;
}

const REAL_ACTIONS_PARAMS: CalibParamItem[] = [
  { icon: <SpIcon name="sp-File-File_Document" size={14} />, label: 'Purchase & Transaction Receipts' },
  { icon: <SpIcon name="sp-Navigation-Navigation" size={14} />, label: 'Click intent' },
  { icon: <SpIcon name="sp-Edit-Copy" size={14} />, label: 'Interaction Trails' },
  { icon: <SpIcon name="sp-Other-Dashboard" size={14} />, label: 'Feature Usage' },
  { icon: <SpIcon name="sp-Edit-Path" size={14} />, label: 'Engagement Channel' },
  { icon: <SpIcon name="sp-Navigation-Globe" size={14} />, label: 'Online Browsing Patterns' },
];

const REAL_ACTIONS_TECHNIQUES: CalibParamItem[] = [
  { icon: <SpIcon name="sp-File-File_Document" size={14} />, label: 'Purchase & Transaction Receipts' },
  { icon: <SpIcon name="sp-Navigation-Navigation" size={14} />, label: 'Click intent' },
  { icon: <SpIcon name="sp-Edit-Copy" size={14} />, label: 'Interaction Trails' },
  { icon: <SpIcon name="sp-Navigation-Globe" size={14} />, label: 'Online Browsing Patterns' },
  { icon: <SpIcon name="sp-Other-Dashboard" size={14} />, label: 'Feature Usage' },
  { icon: <SpIcon name="sp-Edit-Path" size={14} />, label: 'Engagement Channel' },
];

const EMOTIONAL_PARAMS: CalibParamItem[] = [
  { icon: <SpIcon name="sp-Environment-Puzzle" size={14} />, label: 'Cognitive Load and Decision Tension' },
  { icon: <SpIcon name="sp-Edit-Copy" size={14} />, label: 'Subconscious Bias and Emotional Friction' },
  { icon: <SpIcon name="sp-Navigation-Navigation" size={14} />, label: 'Regret Anticipation & Risk Perception' },
  { icon: <SpIcon name="sp-Other-Dashboard" size={14} />, label: 'Affective Response Modelling' },
];

const EMOTIONAL_TECH: CalibParamItem[] = [
  { icon: <SpIcon name="sp-Edit-Show" size={14} />, label: 'EOG (Eye Tracking)' },
  { icon: <SpIcon name="sp-Interface-Option" size={14} />, label: 'ECG (Electrocardiogram)' },
  { icon: <SpIcon name="sp-Other-Dashboard" size={14} />, label: 'GSR (Galvanic Skin Response)' },
  { icon: <SpIcon name="sp-File-File_Document" size={14} />, label: 'EMG (Electromyography)' },
  { icon: <SpIcon name="sp-Edit-Path" size={14} />, label: 'PSG (Polysomnography)' },
  { icon: <SpIcon name="sp-Navigation-Globe" size={14} />, label: 'ERP (Event-Related Potential)' },
];

const VALIDATED_TECH: CalibParamItem[] = [
  { icon: <SpIcon name="sp-Edit-Copy" size={14} />, label: 'FGDs' },
  { icon: <SpIcon name="sp-Navigation-Navigation" size={14} />, label: 'Survey' },
  { icon: <SpIcon name="sp-Other-Dashboard" size={14} />, label: 'Longitudinal Studies' },
  { icon: <SpIcon name="sp-Navigation-Globe" size={14} />, label: 'Academic behaviour science benchmark' },
  { icon: <SpIcon name="sp-Edit-Path" size={14} />, label: 'CATI interviews and ethnographic research' },
  { icon: <SpIcon name="sp-File-File_Document" size={14} />, label: 'Thought Leaderships, White papers, Articles' },
];

const MULTIPLATFORM_ATTRS: CalibParamItem[] = [
  { icon: <SpIcon name="sp-Media-Volume_Min" size={14} />, label: 'Volume' },
  { icon: <SpIcon name="sp-Edit-Copy" size={14} />, label: 'Recency' },
  { icon: <SpIcon name="sp-Navigation-Globe" size={14} />, label: 'RO Alignment' },
  { icon: <SpIcon name="sp-Navigation-Navigation" size={14} />, label: 'Source Diversity' },
  { icon: <SpIcon name="sp-System-Wifi_High" size={14} />, label: 'Signal Clarity' },
];

const PLATFORM_ICONS = [
  { icon: <SiLinkedin size={18} />, key: 'linkedin' },
  { icon: <SiQuora size={18} />, key: 'quora' },
  { icon: <MdOutlinePublic size={18} />, key: 'public' },
  { icon: <SiX size={18} />, key: 'x' },
  { icon: <SiYoutube size={18} />, key: 'youtube' },
  { icon: <SiInstagram size={18} />, key: 'instagram' },
  { icon: <SiReddit size={18} />, key: 'reddit' },
  { icon: <MdStarRate size={18} />, key: 'reviews' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const smartMerge = (
  base: Record<string, unknown>,
  ...overlays: (Record<string, unknown> | null | undefined)[]
): Record<string, unknown> => {
  const result = { ...base };
  for (const overlay of overlays) {
    if (!overlay) continue;
    for (const [k, v] of Object.entries(overlay)) {
      const nonEmpty =
        v !== '' && v !== null && v !== undefined &&
        !(Array.isArray(v) && v.length === 0);
      if (nonEmpty) result[k] = v;
    }
  }
  return result;
};

const coerce = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
};

const mapApiTraitsToUi = (
  traits: Record<string, unknown>,
  personaId?: string
): TraitMap => {
  const c = (keys: string[]): string =>
    coerce(keys.map(k => traits[k]).find(v => v !== '' && v !== null && v !== undefined));

  const mapped: TraitMap = {
    Age: c(['age_range', 'Age']),
    Gender: c(['gender', 'Gender']),
    'Income Level': c(['income_range', 'income', 'Income Level']),
    'Education Level': c(['education_level', 'education', 'Education Level']),
    'Occupation / Employment Type': c(['occupation', 'Occupation / Employment Type']),
    'Family Structure': c(['family_size', 'family_structure', 'Family Structure']),
    Geography: c(['geography', 'location_country', 'Geography']),
    Lifestyle: c(['lifestyle', 'lifestyle_type', 'Lifestyle']),
    Values: c(['values', 'Values']),
    Personality: c(['personality', 'personality_type', 'personality_traits', 'Personality']),
    Interests: c(['interests', 'Interests']),
    Motivations: c(['motivations', 'Motivations']),
    'Brand Sensitivity': c(['brand_sensitivity_detailed', 'brand_sensitivity', 'Brand Sensitivity']),
    'Price Sensitivity': c(['price_sensitivity_general', 'price_sensitivity', 'Price Sensitivity']),
    Mobility: c(['mobility', 'Mobility']),
    'Home Ownership': c(['accommodation', 'home_ownership', 'Home Ownership']),
    'Marital Status': c(['marital_status', 'Marital Status']),
    'Daily Rhythm': c(['daily_rhythm', 'Daily Rhythm']),
    'Hobbies & Interests': c(['hobbies', 'Hobbies & Interests']),
    'Decision Making Style': c(['decision_making_style_1', 'Decision Making Style']),
    'Purchase Frequency': c(['purchase_frequency', 'Purchase Frequency']),
    'Purchase Channel': c(['purchase_channel_detailed', 'purchase_channel', 'Purchase Channel']),
    'Price Sensitivity Profile': c(['price_sensitivity_profile', 'Price Sensitivity Profile']),
    'Loyalty / Switching Behavior': c(['loyalty_behavior', 'Loyalty / Switching Behavior']),
    'Purchase Triggers & Occasions': c(['purchase_triggers', 'Purchase Triggers & Occasions']),
    'Purchase Barriers': c(['purchase_barriers', 'Purchase Barriers']),
    'Decision-Making Style': c(['decision_making_style_2', 'Decision-Making Style']),
    'Media Consumption Patterns': c(['media_consumption', 'Media Consumption Patterns']),
    'Digital Behavior': c(['digital_behavior_detailed', 'Digital Behavior']),
    'Digital Activity': c(['digital_activity', 'Digital Activity']),
    Preferences: c(['preferences', 'Preferences']),
    'Professional Traits': c(['professional_traits', 'Professional Traits']),
    backstory: coerce(
      traits.backstory ??
      traits.formative_experience ??
      traits.formativeExperience
    ),
    isAI: !!(
      traits.isAI ||
      traits.auto_generated_persona ||
      personaId?.toLowerCase().includes('ai')
    ),
  };

  const STANDARD_KEYS = new Set([
    'name', 'age_range', 'gender', 'income_range', 'education_level', 'occupation',
    'family_size', 'location_country', 'location_state', 'geography', 'lifestyle',
    'values', 'personality', 'personality_traits', 'interests', 'motivations',
    'brand_sensitivity', 'price_sensitivity', 'decision_making_style', 'purchase_patterns',
    'purchase_channel', 'mobility', 'accommodation', 'marital_status', 'daily_rhythm',
    'hobbies', 'professional_traits', 'digital_activity', 'preferences', 'backstory',
    'formative_experience', 'formativeExperience',
    'isAI', 'id', 'research_objective_id', 'exploration_id', 'sample_size',
    'auto_generated_persona', 'created_at', 'created_by', 'workspace_id',
    'persona_details', 'behaviors', 'attitudes_toward_category', 'barriers_pain_points',
    'triggers_opportunities', 'journey_stage_mapping', 'ocean_profile',
    'persona_generation_method', 'reference_sites_with_usage', 'confidence_scoring',
    'researched_sites', 'evidence_snapshot',
    'confidence_calculation_detail',
  ]);

  const additionalKeys: string[] = [];
  for (const [key, value] of Object.entries(traits)) {
    if (STANDARD_KEYS.has(key)) continue;
    if (typeof value === 'object' && !Array.isArray(value)) continue;
    if (value === '' || value === null || value === undefined) continue;
    if (key.toLowerCase().includes('id')) continue;
    const label = key
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    mapped[label] = Array.isArray(value) ? value.join(', ') : value;
    additionalKeys.push(label);
  }
  mapped._additionalTraitKeys = additionalKeys;

  return mapped;
};

const flatten = (obj: unknown): string[] => {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj.filter((v): v is string => typeof v === 'string');
  if (typeof obj === 'string') return [obj];
  return Object.values(obj as Record<string, unknown>)
    .flat()
    .filter((v): v is string => typeof v === 'string' && v !== '');
};

const confColor = (score: number) =>
  score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';

const renderWithLinks = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;
  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer" className="pp-inline-link">
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 0 ? text : <>{parts}</>;
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const TraitRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="pp-trait-row">
    <span className="pp-trait-label">{label}</span>
    <span className="pp-trait-value">{value}</span>
  </div>
);

const LoadingPage: React.FC = () => (
  <div className="pp-center-page">
    <TbLoader className="pp-spin" size={36} />
  </div>
);

const ErrorPage: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="pp-center-page">
    <SpIcon name="sp-Warning-Circle_Warning" size={48} style={{ color: '#ef4444', marginBottom: 12 }} />
    <p style={{ color: '#ef4444', marginBottom: 16 }}>Failed to load persona preview</p>
    <button className="pp-back-btn" onClick={onBack}>Go Back</button>
  </div>
);

const CalibParamRow: React.FC<{ item: CalibParamItem }> = ({ item }) => (
  <div className="pp-calib-param-row">
    <span className="pp-calib-param-icon">{item.icon}</span>
    <span className="pp-calib-param-label">{item.label}</span>
  </div>
);

const KeyAttrRow: React.FC<{ item: CalibParamItem }> = ({ item }) => (
  <div className="pp-calib-param-row">
    <span className="pp-calib-param-icon">{item.icon}</span>
    <span className="pp-calib-param-label">{item.label}</span>
    <span className="pp-key-attr-dot" />
  </div>
);

interface CalibCardProps {
  title: string;
  subtitle: string;
  count: string;
  countLabel: string;
  sections: Array<{
    heading: string;
    items: CalibParamItem[];
    variant?: 'default' | 'key-attr';
  }>;
  extraFooter?: React.ReactNode;
}

const CalibCard: React.FC<CalibCardProps> = ({
  title, subtitle, count, countLabel, sections, extraFooter,
}) => (
  <div className="pp-calib-card">
    <div className="pp-calib-card-header">
      <h3 className="pp-calib-card-title">{title}</h3>
      <p className="pp-calib-card-subtitle">{subtitle}</p>
    </div>
    <div className="pp-calib-card-count">{count}</div>
    <div className="pp-calib-card-count-label">{countLabel}</div>
    {sections.map((section, si) => (
      <div key={si} className="pp-calib-section">
        <h4 className="pp-calib-section-heading">{section.heading}</h4>
        <div className="pp-calib-param-list">
          {section.items.map((item, ii) =>
            section.variant === 'key-attr'
              ? <KeyAttrRow key={ii} item={item} />
              : <CalibParamRow key={ii} item={item} />
          )}
        </div>
      </div>
    ))}
    {extraFooter}
  </div>
);

const OCEAN_DESCRIPTIONS: Record<string, { getLevel: (s: number) => string; description: string }> = {
  openness: {
    getLevel: (s) => s >= 0.7 ? 'High' : s >= 0.4 ? 'Medium' : 'Low',
    description: 'Creativity, curiosity, appreciation for art and adventure',
  },
  conscientiousness: {
    getLevel: (s) => s >= 0.7 ? 'High' : s >= 0.4 ? 'Medium' : 'Low',
    description: 'Organised, dependable, goal-directed and disciplined',
  },
  extraversion: {
    getLevel: (s) => s >= 0.7 ? 'High' : s >= 0.4 ? 'Medium' : 'Low',
    description: 'Sociable, assertive, energised by social interaction',
  },
  agreeableness: {
    getLevel: (s) => s >= 0.7 ? 'High' : s >= 0.4 ? 'Medium' : 'Low',
    description: 'Cooperative, trusting, empathetic and helpful',
  },
  neuroticism: {
    getLevel: (s) => s >= 0.7 ? 'High' : s >= 0.4 ? 'Medium' : 'Low',
    description: 'Tendency toward emotional instability and stress sensitivity',
  },
};

// ── Main component ─────────────────────────────────────────────────────────────

const PersonaPreview: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaceId, objectiveId, personaId } = useParams<{
    workspaceId: string;
    objectiveId: string;
    personaId: string;
  }>();
  const { theme } = useTheme();

  const {
    data: previewData,
    isLoading,
    error,
    refetch,
  } = usePersonaPreview(workspaceId, objectiveId, personaId, {
    enabled: !!(workspaceId && objectiveId && personaId),
  });

  const { data: manualPersonasData } = usePersonas(workspaceId, objectiveId);
  const deletePersonaMutation = useDeletePersona(workspaceId, objectiveId);

  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('demographics');

  // ── Tab bar scroll arrows ──────────────────────────────────────────────────
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = tabBarRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState);
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState]);

  const scrollTabs = useCallback((dir: 'left' | 'right') => {
    const el = tabBarRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (workspaceId && objectiveId && personaId) refetch();
  }, [workspaceId, objectiveId, personaId, refetch]);

  const personasList: Record<string, unknown>[] = Array.isArray(manualPersonasData)
    ? (manualPersonasData as Record<string, unknown>[])
    : Array.isArray((manualPersonasData as Record<string, unknown>)?.data)
      ? ((manualPersonasData as Record<string, unknown>).data as Record<string, unknown>[])
      : [];

  const manualPersona = personasList.find(
    (p) => (p as Record<string, unknown>).id === personaId
  ) as Record<string, unknown> | undefined;

  const rawData = (previewData as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const rawTraits = (rawData?.traits ?? rawData ?? {}) as Record<string, unknown>;
  const personaDetails = (rawData?.persona_details ?? rawTraits?.persona_details ?? {}) as Record<string, unknown>;

  const mergedTraits = smartMerge(
    personaDetails,
    rawTraits,
    rawData?.traits as Record<string, unknown> ?? {},
    rawData ?? {},
    manualPersona ?? {},
  );

  const uiTraits = mapApiTraitsToUi(mergedTraits, personaId);

  // ── Confidence data ────────────────────────────────────────────────────────

  const evidenceSnapshot = (
    rawData?.evidence_snapshot ??
    (rawData as Record<string, unknown>)?.evidence_snapshot ??
    mergedTraits?.evidence_snapshot ??
    {}
  ) as Record<string, unknown>;

  const confidence = (mergedTraits.confidence_scoring ?? rawData?.confidence ?? {}) as Record<string, unknown>;

  const confidenceDetail = (
    (evidenceSnapshot as Record<string, unknown>)?.confidence_calculation_detail ??
    (evidenceSnapshot as Record<string, unknown>)?.confidence_breakdown ??
    rawData?.confidence_calculation_detail ??
    (rawData?.traits
      ? (rawData.traits as Record<string, unknown>)?.confidence_calculation_detail
      : undefined) ??
    mergedTraits?.confidence_calculation_detail ??
    confidence?.confidence_calculation_detail ??
    (mergedTraits?.confidence_scoring as Record<string, unknown>)?.confidence_calculation_detail ??
    rawTraits?.confidence_calculation_detail ??
    personaDetails?.confidence_calculation_detail
  ) as Record<string, unknown> | undefined;

  const weightedTotal =
    confidenceDetail?.weighted_total !== undefined
      ? Math.round(parseFloat(String(confidenceDetail.weighted_total)) * 100)
      : null;

  const finalScore =
    weightedTotal ??
    parseInt(String(confidence.score ?? mergedTraits.confidence_score ?? 0), 10);

  const breakdownComponents = confidenceDetail?.components as Record<string, number> | undefined;
  const breakdownEntries: Array<{ label: string; score: number }> = breakdownComponents
    ? Object.entries(breakdownComponents).map(([key, score]) => ({
      label: key
        .replace(/_score$/, '')
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      score,
    }))
    : Object.entries(confidenceDetail ?? {})
      .filter(([k, v]) => k.endsWith('_score') && typeof v === 'number')
      .map(([k, v]) => ({
        label: k
          .replace(/_score$/, '')
          .split('_')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        score: v as number,
      }));

  // ── Evidence sites ─────────────────────────────────────────────────────────

  const evidenceSitesRaw = (
    (evidenceSnapshot as Record<string, unknown>)?.sources ??
    mergedTraits.researched_sites ??
    rawData?.researched_sites ??
    rawTraits.researched_sites ??
    personaDetails.researched_sites ??
    confidence.researched_sites ??
    []
  ) as unknown;

  const PLATFORM_MAP: Record<string, string> = {
    'quora.com': 'Quora', 'reddit.com': 'Reddit', 'youtube.com': 'YouTube',
    'x.com': 'X (Twitter)', 'twitter.com': 'X (Twitter)', 'linkedin.com': 'LinkedIn',
    'medium.com': 'Medium', 'producthunt.com': 'Product Hunt',
    'trustpilot.com': 'Trustpilot', 'capterra': 'Capterra', 'yelp.com': 'Yelp',
  };

  const prettifyPlatform = (site: string): string | null => {
    const lower = site.toLowerCase();
    for (const [domain, name] of Object.entries(PLATFORM_MAP)) {
      if (lower.includes(domain)) return name;
    }
    try {
      const url = new URL(lower.startsWith('http') ? lower : `https://${lower}`);
      const domain = url.hostname.replace('www.', '');
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch {
      return site || null;
    }
  };

  const formattedSites: Array<{ name: string; count: number }> = [];
  if (Array.isArray(evidenceSitesRaw)) {
    for (const site of evidenceSitesRaw) {
      if (typeof site === 'object' && site !== null) {
        const s = site as Record<string, unknown>;
        const name = prettifyPlatform(String(s.platform ?? s.name ?? s.site ?? ''));
        if (name) formattedSites.push({ name, count: Number(s.threads_or_posts ?? s.count ?? 1) });
      } else {
        const name = prettifyPlatform(String(site));
        if (name) formattedSites.push({ name, count: 1 });
      }
    }
  } else if (typeof evidenceSitesRaw === 'object' && evidenceSitesRaw !== null) {
    for (const [site, count] of Object.entries(evidenceSitesRaw as Record<string, unknown>)) {
      const name = prettifyPlatform(site);
      if (name) formattedSites.push({ name, count: Number(count) || 1 });
    }
  }

  const evidenceSites = formattedSites.reduce<Array<{ name: string; count: number }>>(
    (acc, curr) => {
      const ex = acc.find(i => i.name === curr.name);
      if (ex) ex.count += curr.count;
      else acc.push({ ...curr });
      return acc;
    },
    []
  ).sort((a, b) => b.count - a.count);

  // ── OCEAN profile ──────────────────────────────────────────────────────────

  const oceanProfile = (
    rawTraits?.ocean_profile ??
    (rawData?.traits as Record<string, unknown>)?.ocean_profile ??
    (rawData as Record<string, unknown>)?.ocean_profile ??
    mergedTraits?.ocean_profile ??
    personaDetails?.ocean_profile ??
    {}
  ) as Record<string, unknown>;

  const oceanScores = (oceanProfile?.scores ?? {}) as Record<string, number>;

  const oceanTraits = (oceanProfile?.traits ?? []) as Array<{
    name: string;
    score: number;
    level?: string;
    description?: string;
    interpretation?: string;
  }>;

  const resolvedOceanScores: Record<string, number> =
    Object.keys(oceanScores).length > 0
      ? oceanScores
      : Object.fromEntries(oceanTraits.map(t => [t.name.toLowerCase(), t.score]));

  const oceanSummary = (oceanProfile?.summary ?? oceanProfile?.description ?? '') as string;
  const oceanItems = oceanTraits.length > 0
    ? oceanTraits.map(t => ({
      trait: t.name.toLowerCase(),
      label: t.name.charAt(0).toUpperCase() + t.name.slice(1).toLowerCase(),
      score: t.score,
      pct: Math.round(t.score * 100),
      level: t.level,
      description: t.description ?? t.interpretation,
    }))
    : Object.entries(resolvedOceanScores).map(([trait, score]) => {
      const meta = OCEAN_DESCRIPTIONS[trait.toLowerCase()];
      return {
        trait,
        label: trait.charAt(0).toUpperCase() + trait.slice(1),
        score,
        pct: Math.round(score * 100),
        level: meta ? meta.getLevel(score) : undefined,
        description: meta?.description,
      };
    });

  const radarData = [
    { subject: 'Openness', A: Math.round((resolvedOceanScores.openness ?? 0) * 100), fullMark: 100 },
    { subject: 'Conscientiousness', A: Math.round((resolvedOceanScores.conscientiousness ?? 0) * 100), fullMark: 100 },
    { subject: 'Extraversion', A: Math.round((resolvedOceanScores.extraversion ?? 0) * 100), fullMark: 100 },
    { subject: 'Agreeableness', A: Math.round((resolvedOceanScores.agreeableness ?? 0) * 100), fullMark: 100 },
    { subject: 'Neuroticism', A: Math.round((resolvedOceanScores.neuroticism ?? 0) * 100), fullMark: 100 },
  ];

  // ── Psychometric ───────────────────────────────────────────────────────────

  const barriersList = flatten(
    mergedTraits.barriers_pain_points ??
    rawData?.barriers_pain_points ??
    rawTraits?.barriers_pain_points ??
    personaDetails?.barriers_pain_points
  );

  const triggersList = flatten(
    mergedTraits.triggers_opportunities ??
    rawData?.triggers_opportunities ??
    rawTraits?.triggers_opportunities ??
    personaDetails?.triggers_opportunities
  );

  // ── Persona meta ───────────────────────────────────────────────────────────

  const personaName = (mergedTraits.name as string) ?? 'Unnamed Persona';
  const isAI = !!(mergedTraits.auto_generated_persona || !!(uiTraits.isAI));
  const createdByLabel = isAI ? 'Omi' : String(mergedTraits.created_by_name ?? mergedTraits.created_by ?? 'You');

  // ── Formative experience ───────────────────────────────────────────────────

  const formativeText = String(uiTraits.backstory ?? '').trim();

  // ── Active tabs ────────────────────────────────────────────────────────────
  // For manual personas: insert Formative Experience right after Behavioural
  // Traits (index 2), before Ocean, Psychometric and Calibration.
  // For AI personas: keep the original BASE_TABS order unchanged.
  const activeTabs = isAI
    ? BASE_TABS
    : [
      ...BASE_TABS.slice(0, 3),  // demographics, psychographic, behavioral
      FORMATIVE_TAB,             // ← inserted here, after behavioral
      ...BASE_TABS.slice(3),     // ocean, psychometric, calibration
    ];

  const tagSource = [
    ...(Array.isArray(mergedTraits.interests) ? mergedTraits.interests as string[] : [String(mergedTraits.interests ?? '')].filter(Boolean)),
    ...(Array.isArray(mergedTraits.personality) ? mergedTraits.personality as string[] : [String(mergedTraits.personality ?? '')].filter(Boolean)),
    ...((mergedTraits.tags as string[]) ?? []),
  ].filter(Boolean).slice(0, 12);

  const currentIndex = personasList.findIndex(p => (p as Record<string, unknown>).id === personaId);
  const prevPersona = currentIndex > 0 ? personasList[currentIndex - 1] as Record<string, unknown> : null;
  const nextPersona = currentIndex >= 0 && currentIndex < personasList.length - 1
    ? personasList[currentIndex + 1] as Record<string, unknown>
    : null;

  const navigateToPersona = useCallback(
    (id: string) => {
      navigate(
        `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-preview/${id}`
      );
    },
    [navigate, workspaceId, objectiveId]
  );

  const handleDelete = async () => {
    if (!personaId || isDeleting) return;
    const confirmed = window.confirm(`Delete "${personaName}"? This cannot be undone.`);
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      type DeleteFn = (id: string) => Promise<unknown>;
      await (deletePersonaMutation.mutateAsync as unknown as DeleteFn)(personaId);
      navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`);
    } catch {
      alert('Failed to delete persona. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const getCalibCount = (key: string): string => {
    const entry = breakdownEntries.find(e =>
      e.label.toLowerCase().includes(key.toLowerCase())
    );
    if (entry) {
      return entry.score > 1
        ? entry.score.toLocaleString('en-IN')
        : `${Math.round(entry.score * 100)}%`;
    }
    return '1,23,456';
  };

  if (isLoading && !previewData) {
    return (
      <div className="pp-root" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}>
          <video
            src={omiTransitionSrc}
            autoPlay
            loop
            muted
            playsInline
            style={{
              width: 700,
              height: 100,
              objectFit: 'cover',
              mixBlendMode: 'screen',
              borderRadius: '0px',
            }}
          />
          <p style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: '14px',
            fontWeight: 500,
            letterSpacing: '0.02em',
            margin: 0,
          }}>
            Loading persona...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="pp-root"><ErrorPage onBack={() => navigate(-1)} /></div>;
  }

  return (
    <div className="pp-root">

      {/* ── Top bar ── */}
      <div className="pp-topbar">
        <button
          className="pp-back-link"
          onClick={() =>
            navigate(
              `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`,
              { state: { fromLoader: true } }
            )
          }
        >
          <SpIcon name="sp-Arrow-Arrow_Left_SM" size={15} />
          Back to List of the personas
        </button>
      </div>

      {/* ── Hero ── */}
      <div className="pp-hero">
        <div className="pp-hero-left">
          <div className="pp-created-by-row">
            {isAI ? (
              <span className="pp-created-omi-pill">
                <img src={omiDarkImg} alt="Omi" className="pp-omi-pill-img" />
                Created by Omi
              </span>
            ) : (
              <span className="pp-created-by-text">Created by {createdByLabel}</span>
            )}
          </div>
          <h1 className="pp-persona-name">{personaName}</h1>
          <div className="pp-key-facts">
            {!!uiTraits['Age'] && (
              <span className="pp-fact">
                <span className="pp-fact-label">Age:</span>
                {String(uiTraits['Age'])}
              </span>
            )}
            {!!uiTraits['Income Level'] && (
              <span className="pp-fact">
                <span className="pp-fact-label">Income:</span>
                {String(uiTraits['Income Level'])}
              </span>
            )}
            {!!uiTraits['Geography'] && (
              <span className="pp-fact">
                <span className="pp-fact-label">Geography:</span>
                {String(uiTraits['Geography'])}
              </span>
            )}
          </div>
        </div>

        <div className="pp-confidence-panel">
          <div className="pp-conf-header">
            <span className="pp-conf-title">Calibration Confidence:</span>
            <span className="pp-conf-score" style={{ color: confColor(finalScore) }}>
              {finalScore}%
            </span>
          </div>
          <div className="pp-conf-bar-track">
            <motion.div
              className="pp-conf-bar-fill"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(finalScore, 100)}%` }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              style={{ background: confColor(finalScore) }}
            />
          </div>
          {breakdownEntries.length > 0 && (
            <div className="pp-breakdown-rows">
              {breakdownEntries.map(({ label, score }) => (
                <div key={label} className="pp-breakdown-row">
                  <span className="pp-breakdown-label">{label}</span>
                  <span className="pp-breakdown-score">
                    {score <= 1
                      ? `${Math.round(score * 100)}%`
                      : score.toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button className="pp-calib-link" onClick={() => setActiveTab('calibration')}>
            Calibration Breakdown <SpIcon name="sp-Arrow-Arrow_Right_SM" />
          </button>
        </div>
      </div>

      {/* ── Attributes Showcase ── */}
      <div className="pp-showcase">
        <h2 className="pp-showcase-title">Attributes Showcase</h2>

        <div className={`pp-tab-bar-wrap${canScrollLeft ? ' pp-can-scroll-left' : ''}${canScrollRight ? ' pp-can-scroll-right' : ''}`}>
          <div className="pp-tab-bar" ref={tabBarRef}>
            {activeTabs.map(tab => (
              <button
                key={tab.key}
                className={`pp-tab${activeTab === tab.key ? ' pp-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.key as TabKey)}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <motion.div layoutId="pp-active-tab" className="pp-tab-underline" />
                )}
              </button>
            ))}
          </div>
          {canScrollLeft && (
            <button
              className="pp-tab-scroll-btn pp-tab-scroll-btn--left"
              onClick={() => scrollTabs('left')}
              aria-label="Scroll tabs left"
            >
              <TbArrowLeft size={13} />
            </button>
          )}
          {canScrollRight && (
            <button
              className="pp-tab-scroll-btn pp-tab-scroll-btn--right"
              onClick={() => scrollTabs('right')}
              aria-label="Scroll tabs right"
            >
              <TbArrowRight size={13} />
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="pp-tab-content"
          >

            {/* ── Demographics / Psychographic / Behavioral ── */}
            {(activeTab === 'demographics' ||
              activeTab === 'psychographic' ||
              activeTab === 'behavioral') && ((): React.ReactElement => {
                const tab = BASE_TABS.find(t => t.key === activeTab) ?? BASE_TABS[0];
                const rows = (tab.fields as readonly string[])
                  .map(f => ({ label: f, value: String(uiTraits[f] ?? '') }))
                  .filter(r => r.value);
                return rows.length > 0 ? (
                  <div className="pp-trait-table">
                    {rows.map(r => <TraitRow key={r.label} label={r.label} value={r.value} />)}
                  </div>
                ) : (
                  <p className="pp-empty">No traits available for this category.</p>
                );
              })()}

            {/* ── Formative Experience (manual personas only) ── */}
            {activeTab === 'formative' && (
              <div className="pp-formative">
                {formativeText !== '' ? (
                  <div className="pp-formative-card">
                    <p className="pp-formative-text">"{formativeText}"</p>
                  </div>
                ) : (
                  <p className="pp-empty">No formative experience provided for this persona.</p>
                )}
              </div>
            )}

            {/* ── Ocean Personality Profile ── */}
            {activeTab === 'ocean' && (
              <div className="pp-ocean">
                {oceanSummary && (
                  <p className="pp-ocean-summary">{oceanSummary}</p>
                )}
                {Object.keys(resolvedOceanScores).length > 0 ? (
                  <div className="pp-ocean-card">
                    <div className="pp-radar-wrap">
                      <ResponsiveContainer width="100%" height={340}>
                        <RadarChart cx="50%" cy="50%" outerRadius="60%" data={radarData}>
                          <PolarGrid stroke="rgba(255,255,255,0.1)" />
                          <PolarAngleAxis
                            dataKey="subject"
                            tick={(props) => {
                              const { x, y, textAnchor, payload } = props;
                              const words = (payload.value as string).split(' ');
                              return (
                                <text x={x} y={y} textAnchor={textAnchor} fill="#9ca3af" fontSize={11} fontWeight={600}>
                                  {words.map((word: string, i: number) => (
                                    <tspan key={i} x={x} dy={i === 0 ? 0 : 14}>
                                      {word}
                                    </tspan>
                                  ))}
                                </text>
                              );
                            }}
                          />
                          <PolarRadiusAxis
                            domain={[0, 100]}
                            tick={false}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Radar
                            name={personaName}
                            dataKey="A"
                            stroke="#0E63EC"
                            fill="rgba(14, 99, 236, 0.50)"
                            fillOpacity={0.45}
                            strokeWidth={2}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="pp-ocean-interp-side">
                      <h4 className="pp-ocean-interp-title">Score Interpretation</h4>
                      <div className="pp-ocean-interp-grid">
                        {oceanItems.map(({ trait, label, pct, level, description }) => (
                          <div key={trait} className="pp-ocean-interp-card">
                            <div className="pp-ocean-interp-header">
                              <span className="pp-ocean-interp-name">
                                {label.toUpperCase()} — {pct}%
                              </span>
                              {level && (
                                <span className="pp-ocean-interp-level">
                                  {level} (Score: {(pct / 100).toFixed(2)}/1)
                                </span>
                              )}
                            </div>
                            {description && (
                              <p className="pp-ocean-interp-desc">{description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="pp-empty">OCEAN profile not available for this persona.</p>
                )}
              </div>
            )}

            {/* ── Psychometric Profile ── */}
            {activeTab === 'psychometric' && (
              <div className="pp-psychometric">
                {(barriersList.length > 0 || triggersList.length > 0) ? (
                  <div className="pp-two-col">
                    {triggersList.length > 0 && (
                      <div className="pp-list-card">
                        <h4 className="pp-list-card-title">Key Triggers</h4>
                        <ul>
                          {triggersList.map((item, i) => (
                            <li key={i} className="pp-list-item">{renderWithLinks(item)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {barriersList.length > 0 && (
                      <div className="pp-list-card">
                        <h4 className="pp-list-card-title">Primary Barriers</h4>
                        <ul>
                          {barriersList.map((item, i) => (
                            <li key={i} className="pp-list-item">{renderWithLinks(item)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="pp-empty">Psychometric data not available for this persona.</p>
                )}
                {evidenceSites.length > 0 && (
                  <div className="pp-evidence">
                    <h4 className="pp-evidence-title">Evidence Base</h4>
                    <div className="pp-evidence-grid">
                      {evidenceSites.map((s, i) => (
                        <div key={i} className="pp-evidence-item">
                          <span>{s.name}</span>
                          <span className="pp-evidence-count">{s.count.toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Calibration Breakdown ── */}
            {activeTab === 'calibration' && (
              <div className="pp-calib-grid">
                <div className="pp-calib-col">
                  <CalibCard
                    title="Real Actions Signal"
                    subtitle="Anchored in real people's action patterns, not self-reported opinions."
                    count={getCalibCount('real')}
                    countLabel="People analysed"
                    sections={[
                      { heading: 'Parameter Integrated', items: REAL_ACTIONS_PARAMS },
                      { heading: 'Technique Used', items: REAL_ACTIONS_TECHNIQUES },
                    ]}
                  />
                  <CalibCard
                    title="Validated Studies"
                    subtitle="Calibrated against credible consumer and behavioural studies."
                    count={getCalibCount('validated')}
                    countLabel="Total studies inferred"
                    sections={[
                      { heading: 'Technology Used', items: VALIDATED_TECH },
                    ]}
                  />
                </div>
                <div className="pp-calib-col">
                  <CalibCard
                    title="Emotional & Neural Layers"
                    subtitle="Models emotional responses that shape decisions before rationalization appears."
                    count={getCalibCount('emotional')}
                    countLabel="Total Emotional & Neural Parameters Analysed:"
                    sections={[
                      { heading: 'Parameter Integrated', items: EMOTIONAL_PARAMS },
                      { heading: 'Technology Used', items: EMOTIONAL_TECH },
                    ]}
                  />
                  <CalibCard
                    title="Multiple-platform Conversation"
                    subtitle="Calibrated against credible consumer and behavioural studies."
                    count={getCalibCount('multi')}
                    countLabel="Total conversations inferred"
                    sections={[
                      { heading: 'Key Attributes', items: MULTIPLATFORM_ATTRS, variant: 'key-attr' },
                    ]}
                    extraFooter={
                      <div className="pp-calib-section">
                        <h4 className="pp-calib-section-heading">Platforms Covered</h4>
                        <div className="pp-calib-platforms">
                          {PLATFORM_ICONS.map(p => (
                            <span key={p.key} className="pp-calib-platform-icon">
                              {p.icon}
                            </span>
                          ))}
                        </div>
                      </div>
                    }
                  />
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Bottom nav — cycles through tabs ── */}
      {(() => {
        const tabIndex = activeTabs.findIndex(t => t.key === activeTab);
        const hasPrev = tabIndex > 0;
        const hasNext = tabIndex < activeTabs.length - 1;
        return (
          <div className="pp-bottom-nav">
            <button
              className="pp-nav-arrow"
              disabled={!hasPrev}
              onClick={() => hasPrev && setActiveTab(activeTabs[tabIndex - 1]!.key as TabKey)}
            >
              <TbArrowLeft size={18} />
            </button>
            <button
              className="pp-nav-arrow"
              disabled={!hasNext}
              onClick={() => hasNext && setActiveTab(activeTabs[tabIndex + 1]!.key as TabKey)}
            >
              <TbArrowRight size={18} />
            </button>
          </div>
        );
      })()}

    </div>
  );
};

export default PersonaPreview;