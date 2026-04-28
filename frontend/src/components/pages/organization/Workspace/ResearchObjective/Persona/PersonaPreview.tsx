import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TbArrowLeft,
  TbArrowRight,
  TbTrash,
  TbLoader,
  TbAlertCircle,
  TbReceipt,
  TbCursorText,
  TbRoute,
  TbLayoutGrid,
  TbLink,
  TbWorld,
  TbBrain,
  TbEye,
  TbHeartbeat,
  TbActivity,
  TbMoodSmile,
  TbAtom,
  TbMicroscope,
  TbBook,
  TbSpeakerphone,
  TbUsers,
  TbSearch,
  TbPencil,
  TbBolt,
  TbChartBar,
  TbWifi,
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

import omiDarkImg from '../../../../../../assets/OMI_Dark.png';
import './PersonaPerview.css';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TraitMap {
  [key: string]: unknown;
  _additionalTraitKeys?: string[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TABS = [
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

type TabKey = typeof TABS[number]['key'];

// ── Calibration static data definitions ───────────────────────────────────────

interface CalibParamItem {
  icon: React.ReactNode;
  label: string;
}

const REAL_ACTIONS_PARAMS: CalibParamItem[] = [
  { icon: <TbReceipt size={14} />,     label: 'Purchase & Transaction Receipts' },
  { icon: <TbCursorText size={14} />,  label: 'Click intent' },
  { icon: <TbRoute size={14} />,       label: 'Interaction Trails' },
  { icon: <TbLayoutGrid size={14} />,  label: 'Feature Usage' },
  { icon: <TbLink size={14} />,        label: 'Engagement Channel' },
  { icon: <TbWorld size={14} />,       label: 'Online Browsing Patterns' },
];

const REAL_ACTIONS_TECHNIQUES: CalibParamItem[] = [
  { icon: <TbReceipt size={14} />,     label: 'Purchase & Transaction Receipts' },
  { icon: <TbCursorText size={14} />,  label: 'Click intent' },
  { icon: <TbRoute size={14} />,       label: 'Interaction Trails' },
  { icon: <TbWorld size={14} />,       label: 'Online Browsing Patterns' },
  { icon: <TbLayoutGrid size={14} />,  label: 'Feature Usage' },
  { icon: <TbLink size={14} />,        label: 'Engagement Channel' },
];

const EMOTIONAL_PARAMS: CalibParamItem[] = [
  { icon: <TbBrain size={14} />,       label: 'Cognitive Load and Decision Tension' },
  { icon: <TbMoodSmile size={14} />,   label: 'Subconscious Bias and Emotional Friction' },
  { icon: <TbAtom size={14} />,        label: 'Regret Anticipation & Risk Perception' },
  { icon: <TbLayoutGrid size={14} />,  label: 'Affective Response Modelling' },
];

const EMOTIONAL_TECH: CalibParamItem[] = [
  { icon: <TbEye size={14} />,         label: 'EOG (Eye Tracking)' },
  { icon: <TbHeartbeat size={14} />,   label: 'ECG (Electrocardiogram)' },
  { icon: <TbActivity size={14} />,    label: 'GSR (Galvanic Skin Response)' },
  { icon: <TbBolt size={14} />,        label: 'EMG (Electromyography)' },
  { icon: <TbMicroscope size={14} />,  label: 'PSG (Polysomnography)' },
  { icon: <TbWorld size={14} />,       label: 'ERP (Event-Related Potential)' },
];

const VALIDATED_TECH: CalibParamItem[] = [
  { icon: <TbUsers size={14} />,       label: 'FGDs' },
  { icon: <TbSearch size={14} />,      label: 'Survey' },
  { icon: <TbChartBar size={14} />,    label: 'Longitudinal Studies' },
  { icon: <TbWorld size={14} />,       label: 'Academic behaviour science benchmark' },
  { icon: <TbLink size={14} />,        label: 'CATI interviews and ethnographic research' },
  { icon: <TbBook size={14} />,        label: 'Thought Leaderships, White papers, Articles' },
];

const MULTIPLATFORM_ATTRS: CalibParamItem[] = [
  { icon: <TbSpeakerphone size={14} />, label: 'Volume' },
  { icon: <TbActivity size={14} />,     label: 'Recency' },
  { icon: <TbSearch size={14} />,       label: 'RO Alignment' },
  { icon: <TbWifi size={14} />,         label: 'Source Diversity' },
  { icon: <TbBolt size={14} />,         label: 'Signal Clarity' },
];

// Platform icons row
const PLATFORM_ICONS = [
  { icon: <SiLinkedin size={18} />,      key: 'linkedin' },
  { icon: <SiQuora size={18} />,         key: 'quora' },
  { icon: <MdOutlinePublic size={18} />, key: 'public' },
  { icon: <SiX size={18} />,             key: 'x' },
  { icon: <SiYoutube size={18} />,       key: 'youtube' },
  { icon: <SiInstagram size={18} />,     key: 'instagram' },
  { icon: <SiReddit size={18} />,        key: 'reddit' },
  { icon: <MdStarRate size={18} />,      key: 'reviews' },
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
    backstory: coerce(traits.backstory),
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
    'isAI', 'id', 'research_objective_id', 'exploration_id', 'sample_size',
    'auto_generated_persona', 'created_at', 'created_by', 'workspace_id',
    'persona_details', 'behaviors', 'attitudes_toward_category', 'barriers_pain_points',
    'triggers_opportunities', 'journey_stage_mapping', 'ocean_profile',
    'persona_generation_method', 'reference_sites_with_usage', 'confidence_scoring',
    'researched_sites', 'evidence_snapshot',
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
    <TbAlertCircle size={48} style={{ color: '#ef4444', marginBottom: 12 }} />
    <p style={{ color: '#ef4444', marginBottom: 16 }}>Failed to load persona preview</p>
    <button className="pp-back-btn" onClick={onBack}>Go Back</button>
  </div>
);

// ── Calibration param list item ────────────────────────────────────────────────

const CalibParamRow: React.FC<{ item: CalibParamItem }> = ({ item }) => (
  <div className="pp-calib-param-row">
    <span className="pp-calib-param-icon">{item.icon}</span>
    <span className="pp-calib-param-label">{item.label}</span>
  </div>
);

// ── Key Attribute row (with blue dot indicator) ────────────────────────────────

const KeyAttrRow: React.FC<{ item: CalibParamItem }> = ({ item }) => (
  <div className="pp-calib-param-row">
    <span className="pp-calib-param-icon">{item.icon}</span>
    <span className="pp-calib-param-label">{item.label}</span>
    <span className="pp-key-attr-dot" />
  </div>
);

// ── Calibration card ───────────────────────────────────────────────────────────

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
    {/* Card header */}
    <div className="pp-calib-card-header">
      <h3 className="pp-calib-card-title">{title}</h3>
      <p className="pp-calib-card-subtitle">{subtitle}</p>
    </div>

    {/* Big number */}
    <div className="pp-calib-card-count">{count}</div>
    <div className="pp-calib-card-count-label">{countLabel}</div>

    {/* Sections */}
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

// ── Main component ─────────────────────────────────────────────────────────────

const PersonaPreview: React.FC = () => {
  const navigate = useNavigate();
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
    {}
  ) as Record<string, unknown>;

  const oceanScores = (oceanProfile?.scores ?? {}) as Record<string, number>;

  const radarData = [
    { subject: 'Openness', A: oceanScores.openness ?? 0, fullMark: 1 },
    { subject: 'Conscientiousness', A: oceanScores.conscientiousness ?? 0, fullMark: 1 },
    { subject: 'Extraversion', A: oceanScores.extraversion ?? 0, fullMark: 1 },
    { subject: 'Agreeableness', A: oceanScores.agreeableness ?? 0, fullMark: 1 },
    { subject: 'Neuroticism', A: oceanScores.neuroticism ?? 0, fullMark: 1 },
  ];

  const barriersList = flatten(mergedTraits.barriers_pain_points);
  const triggersList = flatten(mergedTraits.triggers_opportunities);

  const personaName = (mergedTraits.name as string) ?? 'Unnamed Persona';
  const isAI = !!(mergedTraits.auto_generated_persona || !!(uiTraits.isAI));
  const createdByLabel = isAI ? 'Omi' : String(mergedTraits.created_by_name ?? mergedTraits.created_by ?? 'You');

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

  // ── Derive display count for calibration cards from API data ──────────────
  // Use first breakdown entry count if available, else finalScore formatted
  const getCalibCount = (key: string): string => {
    const entry = breakdownEntries.find(e =>
      e.label.toLowerCase().includes(key.toLowerCase())
    );
    if (entry) {
      return entry.score > 1
        ? entry.score.toLocaleString('en-IN')
        : `${Math.round(entry.score * 100)}%`;
    }
    // Default display number from Figma
    return '1,23,456';
  };

  if (isLoading && !previewData) {
    return <div className="pp-root"><LoadingPage /></div>;
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
            navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`)
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
          {tagSource.length > 0 && (
            <div className="pp-tags">
              {tagSource.map((tag, i) => (
                <span key={i} className="pp-tag">{tag}</span>
              ))}
            </div>
          )}
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

        <div className="pp-tab-bar">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`pp-tab${activeTab === tab.key ? ' pp-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {activeTab === tab.key && (
                <motion.div layoutId="pp-active-tab" className="pp-tab-underline" />
              )}
            </button>
          ))}
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
                const tab = TABS.find(t => t.key === activeTab) ?? TABS[0];
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

            {/* ── Ocean Personality Profile ── */}
            {activeTab === 'ocean' && (
              <div className="pp-ocean">
                {Object.keys(oceanScores).length > 0 ? (
                  <>
                    <div className="pp-radar-wrap">
                      <ResponsiveContainer width="100%" height={280}>
                        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                          <PolarGrid stroke={theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'} />
                          <PolarAngleAxis
                            dataKey="subject"
                            tick={{ fill: theme === 'dark' ? '#9ca3af' : '#6b7280', fontSize: 12, fontWeight: 600 }}
                          />
                          <PolarRadiusAxis
                            angle={30} domain={[0, 1]} tickCount={6}
                            tick={{ fill: theme === 'dark' ? '#6b7280' : '#9ca3af', fontSize: 10 }}
                          />
                          <Radar name={personaName} dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.45} strokeWidth={2} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="pp-ocean-scores">
                      {Object.entries(oceanScores).map(([trait, score]) => (
                        <div key={trait} className="pp-ocean-row">
                          <span className="pp-ocean-label">{trait.charAt(0).toUpperCase() + trait.slice(1)}</span>
                          <div className="pp-ocean-bar-wrap">
                            <div className="pp-ocean-bar-track">
                              <motion.div
                                className="pp-ocean-bar-fill"
                                initial={{ width: 0 }}
                                animate={{ width: `${score * 100}%` }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                              />
                            </div>
                            <span className="pp-ocean-pct">{Math.round(score * 100)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
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
                    {barriersList.length > 0 && (
                      <div className="pp-list-card pp-list-card--green">
                        <h4 className="pp-list-card-title">Primary Barriers</h4>
                        <ul>
                          {barriersList.map((item, i) => (
                            <li key={i} className="pp-list-item">• {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {triggersList.length > 0 && (
                      <div className="pp-list-card pp-list-card--amber">
                        <h4 className="pp-list-card-title">Key Triggers</h4>
                        <ul>
                          {triggersList.map((item, i) => (
                            <li key={i} className="pp-list-item">• {item}</li>
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

            {/* ══════════════════════════════════════════════════════════
                ── Calibration Breakdown ── NEW FIGMA-ACCURATE DESIGN ──
            ══════════════════════════════════════════════════════════ */}
            {activeTab === 'calibration' && (
              <div className="pp-calib-grid">

                {/* ── LEFT COLUMN ── */}
                <div className="pp-calib-col">

                  {/* Card 1: Real Actions Signal */}
                  <CalibCard
                    title="Real Actions Signal"
                    subtitle="Anchored in real people's action patterns, not self-reported opinions."
                    count={getCalibCount('real')}
                    countLabel="People analysed"
                    sections={[
                      { heading: 'Parameter Integrated', items: REAL_ACTIONS_PARAMS },
                      { heading: 'Technique Used',       items: REAL_ACTIONS_TECHNIQUES },
                    ]}
                  />

                  {/* Card 2: Validated Studies */}
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

                {/* ── RIGHT COLUMN ── */}
                <div className="pp-calib-col">

                  {/* Card 3: Emotional & Neural Layers */}
                  <CalibCard
                    title="Emotional & Neural Layers"
                    subtitle="Models emotional responses that shape decisions before rationalization appears."
                    count={getCalibCount('emotional')}
                    countLabel="Total Emotional & Neural Parameters Analysed:"
                    sections={[
                      { heading: 'Parameter Integrated', items: EMOTIONAL_PARAMS },
                      { heading: 'Technology Used',      items: EMOTIONAL_TECH },
                    ]}
                  />

                  {/* Card 4: Multiple-platform Conversation */}
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

      {/* ── Bottom nav ── */}
      <div className="pp-bottom-nav">
        <button
          className="pp-nav-arrow"
          disabled={!prevPersona}
          onClick={() => prevPersona && navigateToPersona(String((prevPersona as Record<string, unknown>).id))}
        >
          <TbArrowLeft size={18} />
        </button>
        <button
          className="pp-nav-arrow"
          disabled={!nextPersona}
          onClick={() => nextPersona && navigateToPersona(String((nextPersona as Record<string, unknown>).id))}
        >
          <TbArrowRight size={18} />
        </button>
      </div>

    </div>
  );
};

export default PersonaPreview;