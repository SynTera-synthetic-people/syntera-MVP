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
  PieChart,
  Pie,
  Cell,
  Tooltip,
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
      'Age', 'Gender', 'Income Level', 'Education Level', 'Occupation Level',
      'Occupation / Employment Type', 'Industry', 'Family Structure', 'Geography',
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
      'Decision Making Style', 'Consumption Frequency', 'Purchase Frequency',
      'Purchase Channel', 'Price Sensitivity', 'Brand Sensitivity',
      'Switching Tendency', 'Loyalty / Switching Behavior',
      'Category Awareness', 'Purchase Triggers & Occasions',
      'Purchase Barriers', 'Media Consumption Patterns',
      'Digital Behavior', 'Digital Activity', 'Preferences', 'Professional Traits',
      'Hobbies & Interests', 'Mobility', 'Home Ownership', 'Daily Rhythm',
    ],
  },
  { key: 'ocean', label: 'Ocean Personality Profile', fields: [] },
  { key: 'psychometric', label: 'Psychometric Profile', fields: [] },
  { key: 'calibration', label: 'Calibration Breakdown', fields: [] },
] as const;

const FORMATIVE_TAB = { key: 'formative', label: 'Formative Experience', fields: [] } as const;
const AUTO_FILL_TAB = { key: 'autofill', label: 'AI Auto-Fill Report', fields: [] } as const;

type BaseTabKey = typeof BASE_TABS[number]['key'];
type TabKey = BaseTabKey | 'formative' | 'autofill';

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

// ── ML Actions static data (mirrors the "ML Actions" ground-truth layer used in
//    PersonaCardRenderer's GroundTruthFoundation — same underlying signal as the
//    "Real Actions Signal" card, just presented as stat pills + freshness bars
//    instead of a single count + duplicated pill lists). ───────────────────────

interface MLStatItem {
  value: string;
  label: string;
}

const ML_ACTIONS_STATS: MLStatItem[] = [
  { value: '750M+', label: 'Platform Actions' },
  { value: '55M', label: 'People Analysed' },
  { value: '25', label: 'Behaviour Signals' },
  { value: '123', label: 'Models Activated' },
];

interface FreshnessItem {
  label: string;
  pct: number;
}

const FRESHNESS_BREAKDOWN: FreshnessItem[] = [
  { label: 'Last 3M', pct: 35 },
  { label: 'Last 6M', pct: 30 },
  { label: 'Last 12M', pct: 22 },
  { label: 'Older', pct: 13 },
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

// Slice colours for the donut — pulled from the Synthetic People brand palette
// (Electric Blue + Soft Cyan family, plus the tertiary accent colours).
const DONUT_COLORS = [
  '#0E63EC', // Electric Blue P500 (primary)
  '#24E5B6', // Soft Cyan S500
  '#5D74EB', // Cornflower Blue
  '#24BCD3', // Sky Blue
  '#EC0E7D', // Pink
  '#9355F0', // Purple
  '#FABC48', // Yellow
  '#39B2CB', // Cyan Dark
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
    'Occupation Level': c(['occupation_level', 'Occupation Level']),
    'Occupation / Employment Type': c(['occupation', 'Occupation / Employment Type']),
    Industry: c(['industry', 'Industry']),
    'Family Structure': c(['family_structure', 'family_size', 'Family Structure']),
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
    'Decision Making Style': c(['decision_making_style', 'decision_making_style_1', 'Decision Making Style']),
    'Consumption Frequency': c(['consumption_frequency', 'Consumption Frequency']),
    'Purchase Frequency': c(['purchase_frequency', 'Purchase Frequency']),
    'Purchase Channel': c(['purchase_channel', 'purchase_channel_detailed', 'Purchase Channel']),
    'Price Sensitivity Profile': c(['price_sensitivity_profile', 'Price Sensitivity Profile']),
    'Switching Tendency': c(['switching_tendency', 'Switching Tendency']),
    'Loyalty / Switching Behavior': c(['loyalty_behavior', 'Loyalty / Switching Behavior']),
    'Category Awareness': c(['category_awareness', 'Category Awareness']),
    'Purchase Triggers & Occasions': c(['purchase_triggers', 'Purchase Triggers & Occasions']),
    'Purchase Barriers': c(['purchase_barriers', 'Purchase Barriers']),
    'Media Consumption Patterns': c(['media_consumption_patterns', 'media_consumption', 'Media Consumption Patterns']),
    'Digital Behavior': c(['digital_behaviour', 'digital_behavior', 'digital_behavior_detailed', 'Digital Behavior']),
    'Digital Activity': c(['digital_activity', 'Digital Activity']),
    Preferences: c(['preferences', 'Preferences']),
    'Professional Traits': c(['professional_traits', 'Professional Traits']),
    backstory: coerce(
      traits.backstory ??
      traits.formative_experience_description ??
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
    'occupation_level', 'family_size', 'family_structure', 'industry',
    'location_country', 'location_state', 'geography', 'lifestyle',
    'values', 'personality', 'personality_traits', 'interests', 'motivations',
    'brand_sensitivity', 'price_sensitivity', 'decision_making_style',
    'consumption_frequency', 'purchase_channel', 'switching_tendency',
    'category_awareness', 'purchase_patterns',
    'mobility', 'accommodation', 'marital_status', 'daily_rhythm',
    'hobbies', 'professional_traits', 'digital_activity', 'preferences', 'backstory',
    'formative_experience', 'formativeExperience', 'formative_experience_description',
    'isAI', 'id', 'research_objective_id', 'exploration_id', 'sample_size',
    'auto_generated_persona', 'created_at', 'created_by', 'workspace_id',
    'persona_details', 'behaviors', 'attitudes_toward_category', 'barriers_pain_points',
    'triggers_opportunities', 'journey_stage_mapping', 'ocean_profile',
    'persona_generation_method', 'reference_sites_with_usage', 'confidence_scoring',
    'researched_sites', 'evidence_snapshot', 'confidence_calculation_detail',
    'auto_fill_report', 'calibration_confidence', 'calibration_status',
    'calibration_breakdown', 'persona_source', 'parent_persona_id',
    'created_by_name', 'subject_key', 'ml_domain',
    'replication_mode', 'replication_artifacts',
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
  if (typeof obj === 'string') {
    const text = obj.trim();
    return text ? [text] : [];
  }
  if (Array.isArray(obj)) return obj.flatMap(flatten);
  if (typeof obj === 'object') {
    return Object.values(obj as Record<string, unknown>).flatMap(flatten);
  }
  return [];
};

const uniqueList = (...groups: string[][]): string[] => {
  const seen = new Set<string>();
  return groups
    .flat()
    .map(item => item.trim())
    .filter(item => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
};

const confColor = (score: number) =>
  score >= 80 ? '#1AAB18' : score >= 60 ? '#FABC48' : '#E52728';

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
  comingSoon?: boolean;
  sections: Array<{
    heading: string;
    items: CalibParamItem[];
    variant?: 'default' | 'key-attr';
  }>;
  extraFooter?: React.ReactNode;
}

const CalibCard: React.FC<CalibCardProps> = ({
  title, subtitle, count, countLabel, comingSoon, sections, extraFooter,
}) => (
  <div className="pp-calib-card">
    <div className="pp-calib-card-header">
      <h3 className="pp-calib-card-title">{title}</h3>
      <p className="pp-calib-card-subtitle">{subtitle}</p>
    </div>
    {comingSoon ? (
      <span className="pp-coming-soon-pill">Coming Soon</span>
    ) : (
      <>
        <div className="pp-calib-card-count">{count}</div>
        <div className="pp-calib-card-count-label">{countLabel}</div>
      </>
    )}
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

// ── MLActionsCard ────────────────────────────────────────────────────────────
// Replaces the old count + duplicated pill-list layout for "Real Actions Signal"
// with the same "ML Actions" representation used elsewhere for this signal:
// headline stat pills + a freshness-of-signal breakdown, followed by a single
// horizontal row of integrated parameters (the "Technique Used" list has been
// dropped since it duplicated "Parameter Integrated").

const MLActionsCard: React.FC<{
  title: string;
  subtitle: string;
  params: CalibParamItem[];
}> = ({ title, subtitle, params }) => (
  <div className="pp-calib-card">
    <div className="pp-calib-card-header">
      <h3 className="pp-calib-card-title">{title}</h3>
      <p className="pp-calib-card-subtitle">{subtitle}</p>
    </div>

    <div className="pp-mlaction-stats">
      {ML_ACTIONS_STATS.map(s => (
        <div key={s.label} className="pp-mlaction-stat">
          <span className="pp-mlaction-stat-value">{s.value}</span>
          <span className="pp-mlaction-stat-label">{s.label}</span>
        </div>
      ))}
    </div>

    <div className="pp-calib-section">
      <h4 className="pp-calib-section-heading">Freshness of Behaviour Signals</h4>
      <div className="pp-mlaction-freshness-grid">
        {FRESHNESS_BREAKDOWN.map(f => (
          <div key={f.label} className="pp-mlaction-freshness-row">
            <div className="pp-mlaction-freshness-header">
              <span>{f.label}</span>
              <span>{f.pct}%</span>
            </div>
            <div className="pp-mlaction-freshness-track">
              <div className="pp-mlaction-freshness-fill" style={{ width: `${f.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="pp-calib-section">
      <h4 className="pp-calib-section-heading">Parameter Integrated</h4>
      <div className="pp-calib-param-list">
        {params.map((item, ii) => <CalibParamRow key={ii} item={item} />)}
      </div>
    </div>
  </div>
);

// ── MultiPlatformCalibCard ─────────────────────────────────────────────────────
// Replaces the old CalibCard for the "multi" slot with a donut chart showing
// conversation counts per platform + confidence breakdown bars side-by-side.

interface DonutEntry {
  name: string;
  value: number;
  color: string;
}

interface MultiPlatformDonutTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
}

const MultiPlatformDonutTooltip: React.FC<MultiPlatformDonutTooltipProps> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload![0]!;
  return (
    <div style={{
      background: '#1a1d24',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 13,
      color: '#f1f5f9',
      pointerEvents: 'none',
    }}>
      <span style={{ fontWeight: 700 }}>{name}</span>
      <span style={{ color: 'rgba(255,255,255,0.45)', marginLeft: 8 }}>
        {(value as number).toLocaleString('en-IN')} conversations
      </span>
    </div>
  );
};

interface MultiPlatformCalibCardProps {
  title: string;
  subtitle: string;
  totalCount: string;
  totalCountLabel: string;
  /** Per-platform conversation counts, e.g. { Reddit: 214, LinkedIn: 89 } */
  platformCounts: Record<string, number>;
  /** Confidence component scores, e.g. { Volume: 75, Recency: 100, ... } */
  confidenceComponents: Record<string, number>;
  /** Overall confidence score 0-100 */
  overallScore: number;
  isManualMode: boolean;
}

const MultiPlatformCalibCard: React.FC<MultiPlatformCalibCardProps> = ({
  title,
  subtitle,
  totalCount,
  totalCountLabel,
  platformCounts,
  confidenceComponents,
  overallScore,
  isManualMode,
}) => {
  const [hoveredSlice, setHoveredSlice] = useState<DonutEntry | null>(null);
  // Animated bar widths — keyed by label
  const [barWidths, setBarWidths] = useState<Record<string, number>>({});

  useEffect(() => {
    const timer = setTimeout(() => {
      const widths: Record<string, number> = {};
      Object.entries(confidenceComponents).forEach(([label, score]) => {
        widths[label] = Math.min(score, 100);
      });
      setBarWidths(widths);
    }, 120);
    return () => clearTimeout(timer);
  }, [confidenceComponents]);

  const donutData: DonutEntry[] = Object.entries(platformCounts).map(
    ([name, value], i) => ({
      name,
      value,
      color: DONUT_COLORS[i % DONUT_COLORS.length]!,
    })
  );

  const totalConversations = Object.values(platformCounts).reduce((a, b) => a + b, 0);
  const hasDonutData = donutData.length > 0 && totalConversations > 0;
  const hasConfidenceData = Object.keys(confidenceComponents).length > 0;

  return (
    <div className="pp-calib-card">
      {/* ── Header ── */}
      <div className="pp-calib-card-header">
        <h3 className="pp-calib-card-title">{title}</h3>
        <p className="pp-calib-card-subtitle">{subtitle}</p>
      </div>

      {/* ── Donut + confidence side-by-side ── */}
      {(hasDonutData || hasConfidenceData) ? (
        <div className="pp-multi-body">

          {/* Left — donut chart */}
          {hasDonutData && (
            <div className="pp-multi-donut-wrap">
              <div className="pp-multi-donut-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={46}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                      strokeWidth={0}
                      onMouseEnter={(_, index) => setHoveredSlice(donutData[index] ?? null)}
                      onMouseLeave={() => setHoveredSlice(null)}
                    >
                      {donutData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.color}
                          style={{
                            opacity: hoveredSlice && hoveredSlice.name !== entry.name ? 0.3 : 1,
                            transition: 'opacity 0.2s',
                            cursor: 'pointer',
                          }}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<MultiPlatformDonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>

                {/* Centre label */}
                <div className="pp-multi-donut-center">
                  {hoveredSlice ? (
                    <>
                      <span className="pp-multi-donut-center-num">
                        {hoveredSlice.value.toLocaleString('en-IN')}
                      </span>
                      <span className="pp-multi-donut-center-label">
                        {hoveredSlice.name}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="pp-multi-donut-center-num">
                        {totalConversations.toLocaleString('en-IN')}
                      </span>
                      <span className="pp-multi-donut-center-label">
                        total<br />conversations
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Legend dots */}
              <div className="pp-multi-legend">
                {donutData.map((d) => (
                  <div
                    key={d.name}
                    className="pp-multi-legend-row"
                    style={{
                      opacity: hoveredSlice && hoveredSlice.name !== d.name ? 0.3 : 1,
                      transition: 'opacity 0.2s',
                    }}
                  >
                    <span
                      className="pp-multi-legend-dot"
                      style={{ background: d.color }}
                    />
                    <span className="pp-multi-legend-name">{d.name}</span>
                    <span className="pp-multi-legend-count">
                      {d.value.toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Right — calibration confidence breakdown */}
          {hasConfidenceData && (
            <div className="pp-multi-conf-side">
              {/* Overall score pill */}
              <div className="pp-multi-conf-pill" style={{
                background: overallScore >= 80
                  ? 'rgba(26,171,24,0.1)'
                  : overallScore >= 60
                    ? 'rgba(250,188,72,0.1)'
                    : 'rgba(229,39,40,0.1)',
                border: `1px solid ${confColor(overallScore)}33`,
              }}>
                <span className="pp-multi-conf-pill-label">Calibration Confidence</span>
                <span
                  className="pp-multi-conf-pill-score"
                  style={{ color: confColor(overallScore) }}
                >
                  {overallScore}%
                </span>
              </div>

              {/* Per-component bars */}
              {Object.entries(confidenceComponents).map(([label, score]) => (
                <div key={label} className="pp-multi-conf-bar-row">
                  <div className="pp-multi-conf-bar-header">
                    <span className="pp-multi-conf-bar-label">{label}</span>
                    <span
                      className="pp-multi-conf-bar-score"
                      style={{ color: confColor(score) }}
                    >
                      {score}%
                    </span>
                  </div>
                  <div className="pp-multi-conf-bar-track">
                    <div
                      className="pp-multi-conf-bar-fill"
                      style={{
                        width: `${barWidths[label] ?? 0}%`,
                        background: confColor(score),
                        transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Fallback: show the raw count if no breakdown data yet */
        <>
          <div className="pp-calib-card-count">{totalCount}</div>
          <div className="pp-calib-card-count-label">{totalCountLabel}</div>
        </>
      )}

      {/* ── Divider ── */}
      <div className="pp-multi-divider" />

      {/* ── Platforms Covered icon row ── */}
      <div className="pp-calib-section" style={{ marginTop: 0 }}>
        <h4 className="pp-calib-section-heading">Platforms Covered</h4>
        <div className="pp-calib-platforms">
          {PLATFORM_ICONS.map(p => (
            <span key={p.key} className="pp-calib-platform-icon">
              {p.icon}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

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
  const rawPromptTraits = (
    personaDetails?.raw_traits ??
    rawTraits?.raw_traits ??
    rawData?.raw_traits ??
    {}
  ) as Record<string, unknown>;
  const rawPromptBehavioural = (rawPromptTraits?.behavioural ?? {}) as Record<string, unknown>;
  const rawFormPayload = (
    personaDetails?.raw_form_payload ??
    rawTraits?.raw_form_payload ??
    rawData?.raw_form_payload ??
    {}
  ) as Record<string, unknown>;
  const rawFormBehavioural = (rawFormPayload?.behavioural ?? {}) as Record<string, unknown>;

  const mergedTraits = smartMerge(
    personaDetails,
    rawTraits,
    rawData?.traits as Record<string, unknown> ?? {},
    rawData ?? {},
    manualPersona ?? {},
  );
  const calibrationStatus = String(
    mergedTraits.calibration_status ??
    rawData?.calibration_status ??
    manualPersona?.calibration_status ??
    ''
  );

  useEffect(() => {
    if (calibrationStatus !== 'draft' || !workspaceId || !objectiveId || !personaId) return;
    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-generating`,
      { state: { flow: 'manual', personaId } }
    );
  }, [calibrationStatus, workspaceId, objectiveId, personaId, navigate]);

  const uiTraits = mapApiTraitsToUi(mergedTraits, personaId);

  // ── Confidence data ────────────────────────────────────────────────────────

  const evidenceSnapshot = (
    rawData?.evidence_snapshot ??
    mergedTraits?.evidence_snapshot ??
    {}
  ) as Record<string, unknown>;

  const confidence = (
    rawData?.confidence_scoring ??
    mergedTraits.confidence_scoring ??
    personaDetails?.confidence_scoring ??
    rawData?.confidence ??
    {}
  ) as Record<string, unknown>;

  const confidenceDetail = (
    (evidenceSnapshot as Record<string, unknown>)?.confidence_calculation_detail ??
    (evidenceSnapshot as Record<string, unknown>)?.confidence_breakdown ??
    rawData?.confidence_calculation_detail ??
    mergedTraits?.confidence_calculation_detail ??
    personaDetails?.confidence_calculation_detail
  ) as Record<string, unknown> | undefined;

  const newFormatWeightedScore =
    typeof confidence.weighted_score === 'number' ? confidence.weighted_score : null;
  const legacyWeightedTotal =
    confidenceDetail?.weighted_total !== undefined
      ? parseFloat(String(confidenceDetail.weighted_total))
      : null;

  const rawWeightedScore = newFormatWeightedScore ?? legacyWeightedTotal;
  const weightedTotal = rawWeightedScore !== null ? Math.round(rawWeightedScore * 100) : null;

  const finalScore =
    weightedTotal ??
    parseInt(String(confidence.score ?? mergedTraits.confidence_score ?? 0), 10);

  const confidenceMode = (confidence.mode ?? '') as string;
  const confidenceNote = (confidence.note ?? '') as string;
  const confidenceLevel = (confidence.confidence_level ?? '') as string;

  const breakdownComponents = (
    (confidence.components as Record<string, number> | undefined) ??
    (confidenceDetail?.components as Record<string, number> | undefined)
  );

  const formatBreakdownLabel = (key: string): string =>
    key
      .replace(/_score$/, '')
      .split('_')
      .map(w => (w === 'ro' ? 'RO' : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');

  const breakdownEntries: Array<{ label: string; score: number }> = breakdownComponents
    ? Object.entries(breakdownComponents).map(([key, score]) => ({
      label: formatBreakdownLabel(key),
      score,
    }))
    : Object.entries(confidenceDetail ?? {})
      .filter(([k, v]) => k.endsWith('_score') && typeof v === 'number')
      .map(([k, v]) => ({
        label: formatBreakdownLabel(k),
        score: v as number,
      }));

  // ── Auto-fill report ───────────────────────────────────────────────────────

  const autoFillReport = (
    rawData?.auto_fill_report ??
    mergedTraits?.auto_fill_report ??
    personaDetails?.auto_fill_report
  ) as {
    total_sub_traits?: number;
    user_provided_count?: number;
    auto_filled_count?: number;
    auto_filled_traits?: string[];
  } | undefined;

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
  const oceanLabels = (oceanProfile?.labels ?? {}) as Record<string, string>;

  const oceanTraits = (oceanProfile?.traits ?? []) as Array<{
    name: string;
    score: number;
    level?: string;
    description?: string;
    interpretation?: string;
  }>;

  const OCEAN_KEYS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
  const flatOceanScores = Object.fromEntries(
    OCEAN_KEYS
      .filter(k => typeof oceanProfile[k] === 'number')
      .map(k => [k, oceanProfile[k] as number])
  );

  const resolvedOceanScores: Record<string, number> =
    Object.keys(oceanScores).length > 0
      ? oceanScores
      : oceanTraits.length > 0
        ? Object.fromEntries(oceanTraits.map(t => [t.name.toLowerCase(), t.score]))
        : flatOceanScores;

  const oceanSummary = (oceanProfile?.summary ?? oceanProfile?.description ?? '') as string;
  const oceanRationale = (oceanProfile?.rationale ?? {}) as Record<string, string>;

  const oceanItems = oceanTraits.length > 0
    ? oceanTraits.map(t => ({
      trait: t.name.toLowerCase(),
      label: t.name.charAt(0).toUpperCase() + t.name.slice(1).toLowerCase(),
      score: t.score,
      pct: Math.round(t.score * 100),
      level: oceanLabels[t.name.toLowerCase()] ?? t.level,
      description: t.description ?? t.interpretation,
      rationale: oceanRationale[t.name.toLowerCase()] ?? '',
    }))
    : Object.entries(resolvedOceanScores).map(([trait, score]) => {
      const meta = OCEAN_DESCRIPTIONS[trait.toLowerCase()];
      const level = oceanLabels[trait.toLowerCase()] ?? (meta ? meta.getLevel(score) : undefined);
      return {
        trait,
        label: trait.charAt(0).toUpperCase() + trait.slice(1),
        score,
        pct: Math.round(score * 100),
        level,
        description: meta?.description,
        rationale: oceanRationale[trait.toLowerCase()] ?? '',
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

  const barriersList = uniqueList(
    flatten(mergedTraits.barriers_pain_points),
    flatten(rawData?.barriers_pain_points),
    flatten(rawTraits?.barriers_pain_points),
    flatten(personaDetails?.barriers_pain_points),
    flatten(mergedTraits.purchase_barriers),
    flatten(rawTraits?.purchase_barriers),
    flatten(personaDetails?.purchase_barriers),
    flatten(rawPromptBehavioural?.purchase_barriers),
    flatten(rawFormBehavioural?.purchase_barriers),
    flatten(uiTraits['Purchase Barriers'])
  );

  const triggersList = uniqueList(
    flatten(mergedTraits.triggers_opportunities),
    flatten(rawData?.triggers_opportunities),
    flatten(rawTraits?.triggers_opportunities),
    flatten(personaDetails?.triggers_opportunities),
    flatten(mergedTraits.purchase_triggers),
    flatten(rawTraits?.purchase_triggers),
    flatten(personaDetails?.purchase_triggers),
    flatten(rawPromptBehavioural?.purchase_triggers),
    flatten(rawFormBehavioural?.purchase_triggers),
    flatten(uiTraits['Purchase Triggers & Occasions'])
  );

  // ── Persona meta ───────────────────────────────────────────────────────────

  const personaName = (mergedTraits.name as string) ?? 'Unnamed Persona';
  const isAI = !!(mergedTraits.auto_generated_persona || !!(uiTraits.isAI));
  const createdByLabel = isAI ? 'Omi' : String(mergedTraits.created_by_name ?? mergedTraits.created_by ?? 'You');

  // ── Formative experience ───────────────────────────────────────────────────

  const formativeText = String(uiTraits.backstory ?? '').trim();

  // ── Active tabs ────────────────────────────────────────────────────────────
  const activeTabs = isAI
    ? BASE_TABS
    : [
      ...BASE_TABS.slice(0, 3),
      FORMATIVE_TAB,
      AUTO_FILL_TAB,
      ...BASE_TABS.slice(3),
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

  // ── Calibration breakdown ──────────────────────────────────────────────────
  const calibrationBreakdown = (
    rawData?.calibration_breakdown ??
    mergedTraits?.calibration_breakdown ??
    personaDetails?.calibration_breakdown
  ) as Record<string, Record<string, unknown>> | undefined;

  const isManualMode = !!(calibrationBreakdown?.is_manual_mode);

  type CalibKey = 'real' | 'emotional' | 'validated' | 'multi';

  const CB_KEY_MAP: Record<CalibKey, string> = {
    real: 'real_actions_signal',
    emotional: 'emotional_neural_layers',
    validated: 'validated_studies',
    multi: 'multi_platform_conversations',
  };

  const getCalibCount = (key: CalibKey): string => {
    const section = calibrationBreakdown?.[CB_KEY_MAP[key]];
    if (section) {
      const count = section.count as number | undefined;
      if (count !== undefined && count !== null) {
        if (count === 0) return '—';
        return count.toLocaleString('en-IN');
      }
    }
    const entry = breakdownEntries.find(e =>
      e.label.toLowerCase().includes(key.toLowerCase())
    );
    if (entry) {
      return entry.score > 1
        ? entry.score.toLocaleString('en-IN')
        : `${Math.round(entry.score * 100)}%`;
    }
    return '—';
  };

  const getCalibLabel = (key: CalibKey, fallback: string): string => {
    const label = calibrationBreakdown?.[CB_KEY_MAP[key]]?.count_label as string | undefined;
    return label || fallback;
  };

  // ── Multi-platform data for the new donut card ─────────────────────────────
  // Build platform counts: prefer calibration_breakdown component_scores
  // (Omi mode has per-platform counts), else fall back to evidenceSites.
  const multiSection = calibrationBreakdown?.multi_platform_conversations;
  const rawCompScores = multiSection?.component_scores as Record<string, number> | undefined;

  // For Omi personas: component_scores = { Reddit: 214, Quora: 89, ... }
  // For manual mode: component_scores = { "Demographic Fit": 85, ... } (confidence-style)
  // We only use them as platform counts when NOT in manual mode.
  const platformCounts: Record<string, number> = (() => {
    if (!isManualMode && rawCompScores && Object.keys(rawCompScores).length > 0) {
      return rawCompScores;
    }
    // Fall back to evidenceSites (already deduplicated + sorted)
    return evidenceSites.reduce<Record<string, number>>((acc, s) => {
      acc[s.name] = s.count;
      return acc;
    }, {});
  })();

  // Confidence components for the bar chart on the right side of the donut.
  // Prefer breakdownEntries (already normalised to 0-100) from the hero panel.
  const multiConfidenceBreakdown = (
    multiSection?.confidence_components ??
    multiSection?.confidence_breakdown ??
    multiSection?.breakdown
  ) as Record<string, number> | undefined;

  const donutConfidenceComponents: Record<string, number> = (() => {
    if (multiConfidenceBreakdown && Object.keys(multiConfidenceBreakdown).length > 0) {
      return Object.entries(multiConfidenceBreakdown).reduce<Record<string, number>>((acc, [k, v]) => {
        acc[k] = v <= 1 ? Math.round(v * 100) : v;
        return acc;
      }, {});
    }
    // Manual mode: component_scores ARE the confidence components
    if (isManualMode && rawCompScores) {
      return Object.entries(rawCompScores).reduce<Record<string, number>>((acc, [k, v]) => {
        acc[k] = v;
        return acc;
      }, {});
    }
    // Last-resort fallback: generic hero-panel breakdown
    if (breakdownEntries.length > 0) {
      return breakdownEntries.reduce<Record<string, number>>((acc, e) => {
        acc[e.label] = e.score <= 1 ? Math.round(e.score * 100) : e.score;
        return acc;
      }, {});
    }
    return {};
  })();

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
            Loading Persona Preview...
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
          {confidenceMode && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>
              {confidenceMode}
              {confidenceLevel && (
                <span style={{
                  marginLeft: 6,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: confidenceLevel === 'High' ? 'rgba(26,171,24,0.15)' : confidenceLevel === 'Medium' ? 'rgba(250,188,72,0.15)' : 'rgba(229,39,40,0.15)',
                  color: confidenceLevel === 'High' ? '#1AAB18' : confidenceLevel === 'Medium' ? '#FABC48' : '#E52728',
                  fontWeight: 600,
                }}>
                  {confidenceLevel}
                </span>
              )}
            </div>
          )}
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
          {confidenceNote && (
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 8, lineHeight: 1.4 }}>
              {confidenceNote}
            </p>
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

            {/* ── AI Auto-Fill Report (manual personas only) ── */}
            {activeTab === 'autofill' && (
              <div className="pp-psychometric">
                {autoFillReport ? (
                  <>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
                      {[
                        { num: autoFillReport.user_provided_count ?? 0, label: 'Traits Provided by You', color: '#1AAB18' },
                        { num: autoFillReport.auto_filled_count ?? 0, label: 'Traits Auto-Filled by AI', color: '#FABC48' },
                        { num: autoFillReport.total_sub_traits ?? 0, label: 'Total Traits', color: 'rgba(255,255,255,0.7)' },
                      ].map(({ num, label, color }) => (
                        <div key={label} style={{
                          flex: '1 1 140px',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 12,
                          padding: '18px 20px',
                          textAlign: 'center',
                        }}>
                          <div style={{ fontSize: 32, fontWeight: 700, color }}>{num}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>{label}</div>
                        </div>
                      ))}
                    </div>

                    {(autoFillReport.total_sub_traits ?? 0) > 0 && (
                      <div style={{ marginBottom: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                          <span>Trait Completeness (User-Provided)</span>
                          <span>{Math.round(((autoFillReport.user_provided_count ?? 0) / (autoFillReport.total_sub_traits ?? 1)) * 100)}%</span>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            borderRadius: 4,
                            background: '#1AAB18',
                            width: `${Math.round(((autoFillReport.user_provided_count ?? 0) / (autoFillReport.total_sub_traits ?? 1)) * 100)}%`,
                            transition: 'width 0.8s ease',
                          }} />
                        </div>
                      </div>
                    )}

                    {(autoFillReport.auto_filled_traits ?? []).length > 0 && (
                      <div className="pp-list-card">
                        <h4 className="pp-list-card-title">
                          AI Auto-Filled Traits ({autoFillReport.auto_filled_count ?? 0})
                        </h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                          {(autoFillReport.auto_filled_traits ?? []).map((t, i) => (
                            <span key={i} style={{
                              padding: '4px 10px',
                              background: 'rgba(250,188,72,0.12)',
                              border: '1px solid rgba(250,188,72,0.25)',
                              borderRadius: 20,
                              fontSize: 12,
                              color: '#FABC48',
                              fontWeight: 500,
                            }}>
                              {t.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="pp-empty">Auto-fill report not available for this persona. Calibrate the persona to generate it.</p>
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
                        {oceanItems.map(({ trait, label, pct, level, description, rationale }) => (
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
                            {rationale && (
                              <p style={{
                                fontSize: 11,
                                color: 'rgba(255,255,255,0.45)',
                                fontStyle: 'italic',
                                marginTop: 4,
                                lineHeight: 1.4,
                              }}>
                                {rationale}
                              </p>
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
                  <MLActionsCard
                    title="Real Actions Signal"
                    subtitle={
                      isManualMode
                        ? 'Traits the researcher directly provided in the persona form.'
                        : 'Anchored in real people\'s action patterns, not self-reported opinions.'
                    }
                    params={REAL_ACTIONS_PARAMS}
                  />
                  <CalibCard
                    title="Validated Studies"
                    subtitle={
                      isManualMode
                        ? 'Total sub-traits across all categories evaluated during calibration.'
                        : 'Calibrated against credible consumer and behavioural studies.'
                    }
                    count={getCalibCount('validated')}
                    countLabel={getCalibLabel('validated', 'Total studies inferred')}
                    sections={[
                      { heading: 'Technology Used', items: VALIDATED_TECH },
                    ]}
                  />
                </div>
                <div className="pp-calib-col">
                  <CalibCard
                    title="Emotional & Neural Layers"
                    subtitle={
                      isManualMode
                        ? 'Traits intelligently auto-filled by AI using Research Objective context and cross-trait inference.'
                        : 'Models emotional responses that shape decisions before rationalization appears.'
                    }
                    count={getCalibCount('emotional')}
                    countLabel={getCalibLabel('emotional', 'Total Emotional & Neural Parameters Analysed')}
                    comingSoon={getCalibCount('emotional') === '—'}
                    sections={[
                      { heading: 'Parameter Integrated', items: EMOTIONAL_PARAMS },
                      { heading: 'Technology Used', items: EMOTIONAL_TECH },
                    ]}
                  />
                  {/* ── NEW: Multi-platform card with donut chart ── */}
                  <MultiPlatformCalibCard
                    title={isManualMode ? 'RO Alignment Score' : 'Multi-platform Conversation'}
                    subtitle={
                      isManualMode
                        ? 'Research Objective alignment scored across 4 dimensions: demographics, psychographics, behaviour, and trait completeness.'
                        : 'Calibrated against real consumer conversations across multiple platforms.'
                    }
                    totalCount={getCalibCount('multi')}
                    totalCountLabel={getCalibLabel('multi', 'Total conversations inferred')}
                    platformCounts={platformCounts}
                    confidenceComponents={donutConfidenceComponents}
                    overallScore={finalScore}
                    isManualMode={isManualMode}
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