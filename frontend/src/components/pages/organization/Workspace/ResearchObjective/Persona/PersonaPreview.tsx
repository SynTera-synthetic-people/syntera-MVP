import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TbArrowLeft,
  TbArrowRight,
  TbTrash,
  TbLoader,
  TbAlertCircle,
  TbChevronRight,
} from 'react-icons/tb';
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

/**
 * Tab definitions matching the Figma tab bar exactly.
 * Each tab has a `key` (used for routing/state), a `label` (displayed),
 * and a `fields` array listing which mapped trait keys belong to it.
 */
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

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Deep merge: later overlays win only when their value is non-empty. */
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

/** Coerce a value that may be an array or string to a display string. */
const coerce = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
};

/**
 * Map raw API traits to a flat UI-friendly object.
 * Mirrors the mapApiTraitsToUi function from PersonaPreview.jsx exactly.
 */
const mapApiTraitsToUi = (
  traits: Record<string, unknown>,
  personaId?: string
): TraitMap => {
  const c = (keys: string[]): string =>
    coerce(keys.map(k => traits[k]).find(v => v !== '' && v !== null && v !== undefined));

  const mapped: TraitMap = {
    Age:                          c(['age_range', 'Age']),
    Gender:                       c(['gender', 'Gender']),
    'Income Level':               c(['income_range', 'income', 'Income Level']),
    'Education Level':            c(['education_level', 'education', 'Education Level']),
    'Occupation / Employment Type': c(['occupation', 'Occupation / Employment Type']),
    'Family Structure':           c(['family_size', 'family_structure', 'Family Structure']),
    Geography:                    c(['geography', 'location_country', 'Geography']),
    Lifestyle:                    c(['lifestyle', 'lifestyle_type', 'Lifestyle']),
    Values:                       c(['values', 'Values']),
    Personality:                  c(['personality', 'personality_type', 'personality_traits', 'Personality']),
    Interests:                    c(['interests', 'Interests']),
    Motivations:                  c(['motivations', 'Motivations']),
    'Brand Sensitivity':          c(['brand_sensitivity_detailed', 'brand_sensitivity', 'Brand Sensitivity']),
    'Price Sensitivity':          c(['price_sensitivity_general', 'price_sensitivity', 'Price Sensitivity']),
    Mobility:                     c(['mobility', 'Mobility']),
    'Home Ownership':             c(['accommodation', 'home_ownership', 'Home Ownership']),
    'Marital Status':             c(['marital_status', 'Marital Status']),
    'Daily Rhythm':               c(['daily_rhythm', 'Daily Rhythm']),
    'Hobbies & Interests':        c(['hobbies', 'Hobbies & Interests']),
    'Decision Making Style':      c(['decision_making_style_1', 'Decision Making Style']),
    'Purchase Frequency':         c(['purchase_frequency', 'Purchase Frequency']),
    'Purchase Channel':           c(['purchase_channel_detailed', 'purchase_channel', 'Purchase Channel']),
    'Price Sensitivity Profile':  c(['price_sensitivity_profile', 'Price Sensitivity Profile']),
    'Loyalty / Switching Behavior': c(['loyalty_behavior', 'Loyalty / Switching Behavior']),
    'Purchase Triggers & Occasions': c(['purchase_triggers', 'Purchase Triggers & Occasions']),
    'Purchase Barriers':          c(['purchase_barriers', 'Purchase Barriers']),
    'Decision-Making Style':      c(['decision_making_style_2', 'Decision-Making Style']),
    'Media Consumption Patterns': c(['media_consumption', 'Media Consumption Patterns']),
    'Digital Behavior':           c(['digital_behavior_detailed', 'Digital Behavior']),
    'Digital Activity':           c(['digital_activity', 'Digital Activity']),
    Preferences:                  c(['preferences', 'Preferences']),
    'Professional Traits':        c(['professional_traits', 'Professional Traits']),
    backstory:                    coerce(traits.backstory),
    isAI: !!(
      traits.isAI ||
      traits.auto_generated_persona ||
      personaId?.toLowerCase().includes('ai')
    ),
  };

  // ── Additional / dynamic traits ──
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

/** Flatten nested barrier/trigger object into a string array. */
const flatten = (obj: unknown): string[] => {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj.filter((v): v is string => typeof v === 'string');
  if (typeof obj === 'string') return [obj];
  return Object.values(obj as Record<string, unknown>)
    .flat()
    .filter((v): v is string => typeof v === 'string' && v !== '');
};

// ── Confidence bar colour ──────────────────────────────────────────────────────

const confColor = (score: number) =>
  score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';

// ── Subcomponents ─────────────────────────────────────────────────────────────

/** Two-column key-value row used inside the attributes table. */
const TraitRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="pp-trait-row">
    <span className="pp-trait-label">{label}</span>
    <span className="pp-trait-value">{value}</span>
  </div>
);

/** Inline loading spinner page. */
const LoadingPage: React.FC = () => (
  <div className="pp-center-page">
    <TbLoader className="pp-spin" size={36} />
  </div>
);

/** Inline error page. */
const ErrorPage: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="pp-center-page">
    <TbAlertCircle size={48} style={{ color: '#ef4444', marginBottom: 12 }} />
    <p style={{ color: '#ef4444', marginBottom: 16 }}>Failed to load persona preview</p>
    <button className="pp-back-btn" onClick={onBack}>Go Back</button>
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

  // ── Data fetching (unchanged from JSX) ──────────────────────────────────────

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

  // Refetch on ID change
  useEffect(() => {
    if (workspaceId && objectiveId && personaId) refetch();
  }, [workspaceId, objectiveId, personaId, refetch]);

  // ── Derive merged traits (unchanged logic from JSX) ────────────────────────

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

  // ── Confidence data (unchanged logic from JSX) ─────────────────────────────

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

  // ── Breakdown line items ───────────────────────────────────────────────────
  // These are the "Real Actions Signal: 1,20,000" rows shown top-right in Figma

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

  // Evidence sites (unchanged from JSX)
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
    { subject: 'Openness',          A: oceanScores.openness          ?? 0, fullMark: 1 },
    { subject: 'Conscientiousness', A: oceanScores.conscientiousness ?? 0, fullMark: 1 },
    { subject: 'Extraversion',      A: oceanScores.extraversion      ?? 0, fullMark: 1 },
    { subject: 'Agreeableness',     A: oceanScores.agreeableness     ?? 0, fullMark: 1 },
    { subject: 'Neuroticism',       A: oceanScores.neuroticism       ?? 0, fullMark: 1 },
  ];

  // ── Barriers / triggers ────────────────────────────────────────────────────

  const barriersList  = flatten(mergedTraits.barriers_pain_points);
  const triggersList  = flatten(mergedTraits.triggers_opportunities);

  // ── Persona meta ───────────────────────────────────────────────────────────

  const personaName = (mergedTraits.name as string) ?? 'Unnamed Persona';
  const isAI = !!(
    mergedTraits.auto_generated_persona ||
    !!(uiTraits.isAI)
  );
  const createdByLabel = isAI ? 'Omi' : String(mergedTraits.created_by_name ?? mergedTraits.created_by ?? 'You');

  // Tag pills: interests + personality as individual tags
  const tagSource = [
    ...(Array.isArray(mergedTraits.interests) ? mergedTraits.interests as string[] : [String(mergedTraits.interests ?? '')].filter(Boolean)),
    ...(Array.isArray(mergedTraits.personality) ? mergedTraits.personality as string[] : [String(mergedTraits.personality ?? '')].filter(Boolean)),
    ...((mergedTraits.tags as string[]) ?? []),
  ].filter(Boolean).slice(0, 12);

  // ── Persona list for ← → navigation ───────────────────────────────────────

  const currentIndex = personasList.findIndex(p => (p as Record<string, unknown>).id === personaId);
  const prevPersona  = currentIndex > 0 ? personasList[currentIndex - 1] as Record<string, unknown> : null;
  const nextPersona  = currentIndex >= 0 && currentIndex < personasList.length - 1
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

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!personaId || isDeleting) return;
    const confirmed = window.confirm(
      `Delete "${personaName}"? This cannot be undone.`
    );
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      type DeleteFn = (id: string) => Promise<unknown>;
      await (deletePersonaMutation.mutateAsync as unknown as DeleteFn)(personaId);
      navigate(
        `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`
      );
    } catch {
      alert('Failed to delete persona. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (isLoading && !previewData) {
    return (
      <div className="pp-root">
        <LoadingPage />
      </div>
    );
  }

  if (error) {
    return (
      <div className="pp-root">
        <ErrorPage onBack={() => navigate(-1)} />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="pp-root">

      {/* ── Top bar ── */}
      <div className="pp-topbar">
        {/* Back link */}
        <button
          className="pp-back-link"
          onClick={() =>
            navigate(
              `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`
            )
          }
        >
          <TbArrowLeft size={15} />
          Back to List of the personas
        </button>

        {/* Delete button — right side */}
        <button
          className="pp-delete-btn"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          {isDeleting ? <TbLoader size={14} className="pp-spin" /> : <TbTrash size={14} />}
          {isDeleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>

      {/* ── Hero section ── */}
      <div className="pp-hero">

        {/* Left: persona identity */}
        <div className="pp-hero-left">
          {/* Created by row */}
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

          {/* Persona name */}
          <h1 className="pp-persona-name">{personaName}</h1>

          {/* Key facts inline */}
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

          {/* Tag pills */}
          {tagSource.length > 0 && (
            <div className="pp-tags">
              {tagSource.map((tag, i) => (
                <span key={i} className="pp-tag">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Right: calibration confidence panel */}
        <div className="pp-confidence-panel">
          <div className="pp-conf-header">
            <span className="pp-conf-title">Calibration Confidence:</span>
            <span className="pp-conf-score" style={{ color: confColor(finalScore) }}>
              {finalScore}%
            </span>
          </div>

          {/* Main bar */}
          <div className="pp-conf-bar-track">
            <motion.div
              className="pp-conf-bar-fill"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(finalScore, 100)}%` }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              style={{ background: confColor(finalScore) }}
            />
          </div>

          {/* Breakdown rows (the "Real Actions Signal: 1,20,000" items) */}
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

          {/* Calibration Breakdown link */}
          <button
            className="pp-calib-link"
            onClick={() => setActiveTab('calibration')}
          >
            Calibration Breakdown
            <TbChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* ── Attributes Showcase ── */}
      <div className="pp-showcase">
        <h2 className="pp-showcase-title">Attributes Showcase</h2>

        {/* Tab bar */}
        <div className="pp-tab-bar">
          {TABS.map(tab => (
            <button
              key={tab.key}
              className={`pp-tab${activeTab === tab.key ? ' pp-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="pp-active-tab"
                  className="pp-tab-underline"
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="pp-tab-content"
          >

            {/* ── Demographics / Psychographic / Behavioral tabs ── */}
            {(activeTab === 'demographics' ||
              activeTab === 'psychographic' ||
              activeTab === 'behavioral') && ((): React.ReactElement => {
              const tab = TABS.find(t => t.key === activeTab) ?? TABS[0];
              const rows = (tab.fields as readonly string[])
                .map(f => ({ label: f, value: String(uiTraits[f] ?? '') }))
                .filter(r => r.value);
              return rows.length > 0 ? (
                <div className="pp-trait-table">
                  {rows.map(r => (
                    <TraitRow key={r.label} label={r.label} value={r.value} />
                  ))}
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
                          <PolarGrid
                            stroke={theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}
                          />
                          <PolarAngleAxis
                            dataKey="subject"
                            tick={{
                              fill: theme === 'dark' ? '#9ca3af' : '#6b7280',
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          />
                          <PolarRadiusAxis
                            angle={30}
                            domain={[0, 1]}
                            tickCount={6}
                            tick={{ fill: theme === 'dark' ? '#6b7280' : '#9ca3af', fontSize: 10 }}
                          />
                          <Radar
                            name={personaName}
                            dataKey="A"
                            stroke="#3b82f6"
                            fill="#3b82f6"
                            fillOpacity={0.45}
                            strokeWidth={2}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="pp-ocean-scores">
                      {Object.entries(oceanScores).map(([trait, score]) => (
                        <div key={trait} className="pp-ocean-row">
                          <span className="pp-ocean-label">
                            {trait.charAt(0).toUpperCase() + trait.slice(1)}
                          </span>
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

                {/* Evidence base */}
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
              <div className="pp-calibration">
                {/* Summary */}
                {!!(evidenceSnapshot as Record<string, unknown>)?.summary && (
                  <div className="pp-calib-summary">
                    <p className="pp-calib-summary-text">
                      "{String((evidenceSnapshot as Record<string, unknown>).summary)}"
                    </p>
                  </div>
                )}

                {/* Score bars */}
                {breakdownEntries.length > 0 ? (
                  <div className="pp-calib-rows">
                    {breakdownEntries.map(({ label, score }) => {
                      const pct = score <= 1 ? Math.round(score * 100) : score;
                      return (
                        <div key={label} className="pp-calib-row">
                          <div className="pp-calib-row-header">
                            <span className="pp-calib-row-label">{label}</span>
                            <span className="pp-calib-row-pct" style={{ color: confColor(pct) }}>
                              {score <= 1 ? `${pct}%` : score.toLocaleString('en-IN')}
                            </span>
                          </div>
                          {score <= 1 && (
                            <div className="pp-calib-bar-track">
                              <motion.div
                                className="pp-calib-bar-fill"
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                                style={{ background: confColor(pct) }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="pp-empty">Calibration breakdown not available.</p>
                )}

                {/* Weighted total */}
                {weightedTotal !== null && (
                  <div className="pp-calib-total">
                    <span className="pp-calib-total-label">Weighted Total</span>
                    <span className="pp-calib-total-score" style={{ color: confColor(weightedTotal) }}>
                      {weightedTotal}%
                    </span>
                  </div>
                )}
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Bottom navigation arrows ── */}
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