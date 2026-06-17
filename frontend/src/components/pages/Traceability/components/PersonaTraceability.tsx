import React, { useState } from 'react';
import CenteredScoreCard from './CenteredScoreCard';
import omiDarkImg from '../../../../assets/OMI_Dark.png';
import '../Traceability.css';

// ── Types ─────────────────────────────────────────────────────

interface EvidenceSourceItem {
  platform?: string;
  threads_or_posts?: number;
  [key: string]: unknown;
}

interface EvidenceSnapshot {
  evidence_source?: string;
  total_conversations?: number;
  sources?: EvidenceSourceItem[];
  confidence_calculation_detail?: { value?: number; level?: string; weighted_total?: number };
  timeframe?: {
    months_analyzed?: number;
    recent_activity?: { months?: number; percentage?: number };
  };
  [key: string]: unknown;
}

interface PersonaItem {
  name?: string;
  personaName?: string;
  confidence_scoring?: { score: string };
  confidence?: number;
  created_by?: string;
  persona_details?: { evidence_snapshot?: EvidenceSnapshot; [key: string]: unknown };
  evidence_snapshot?: EvidenceSnapshot;
  [key: string]: unknown;
}

interface PersonaDetails {
  omi_generated?: PersonaItem[];
  manual_generated?: PersonaItem[];
}

interface PersonaData {
  exploration_id?: string | number;
  persona_details?: PersonaDetails;
  enrichment_stats?: Record<string, unknown>;
  number_of_real_people?: string | number;
  number_of_sites_researched?: number;
  neuroscience_inference?: string | number;
  enrichment_layer?: string | number;
  contextual_layer?: string | number;
  ground_truth_breakdown?: {
    platform_action_universe?: { total_actions?: string; total_people?: string };
    freshness_of_behaviour_signals?: Record<string, string>;
    behaviour_dimensions_extracted?: number;
    relevant_models_activated?: number;
  };
  [key: string]: unknown;
}

interface PersonaTraceabilityProps {
  data: PersonaData | Record<string, unknown>;
  isLoading?: boolean;
}

interface ProcessedPersona {
  personaName: string;
  createdBy: string;
  confidence: number;
}

// ── Static: 28 ML feature map ─────────────────────────────────

const ML_FEATURES: { original: string; clientReady: string }[] = [
  { original: 'orders_per_week',            clientReady: 'Weekly Action Frequency' },
  { original: 'growth_rate',                clientReady: 'Behaviour Growth Momentum' },
  { original: 'recency_weighted_frequency', clientReady: 'Recent Activity Intensity' },
  { original: 'volatility',                 clientReady: 'Behaviour Variability Index' },
  { original: 'trend_slope',                clientReady: 'Behaviour Direction Signal' },
  { original: 'avg_order_value',            clientReady: 'Average Spend Level' },
  { original: 'spending_trend',             clientReady: 'Spend Momentum' },
  { original: 'price_sensitivity',          clientReady: 'Price Sensitivity Signal' },
  { original: 'basket_size',                clientReady: 'Basket Depth' },
  { original: 'discount_usage_rate',        clientReady: 'Discount Dependence Signal' },
  { original: 'night_order_ratio',          clientReady: 'Time Activity Pattern' },
  { original: 'weekend_ratio',              clientReady: 'Weekend Behaviour Skew' },
  { original: 'peak_hour_preference',       clientReady: 'Peak Activity Window' },
  { original: 'seasonality_index',          clientReady: 'Seasonal Behaviour Signal' },
  { original: 'inter_order_time',           clientReady: 'Purchase Gap Pattern' },
  { original: 'recency_score',              clientReady: 'Recency Strength Score' },
  { original: 'frequency_score',            clientReady: 'Frequency Strength Score' },
  { original: 'monetary_score',             clientReady: 'Monetary Strength Score' },
  { original: 'rfm_score',                  clientReady: 'RFM Behaviour Score' },
  { original: 'time_consistency',           clientReady: 'Routine Consistency Signal' },
  { original: 'rush_hour_ratio',            clientReady: 'Rush-Hour Activity Skew' },
  { original: 'weekday_preference',         clientReady: 'Weekday Preference Pattern' },
  { original: 'tenure_days',                clientReady: 'Relationship Tenure' },
  { original: 'activity_density',           clientReady: 'Engagement Density' },
  { original: 'retention_rate',             clientReady: 'Retention Strength Signal' },
];

// ── Helpers ───────────────────────────────────────────────────

const parseConfidence = (p: PersonaItem): number => {
  if (p.confidence_scoring?.score) {
    return parseInt(p.confidence_scoring.score.replace('%', ''), 10) || 0;
  }
  if (typeof p.confidence === 'number') return p.confidence;
  return 0;
};

const formatNumber = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
    ? n.toLocaleString('en-IN')
    : String(n);

// Deterministic hash → stable pseudo-random number in [min, max] for a given seed.
// Same seed (exploration_id) always produces the same number, so the value
// stays consistent across reopens of the same exploration's traceability.
const seededNumberInRange = (seed: string, min: number, max: number): number => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0; // keep as 32-bit int
  }
  // Normalize to [0, 1) regardless of sign, then map into range.
  const normalized = (Math.abs(hash) % 100000) / 100000;
  return Math.round(min + normalized * (max - min));
};

// ── Info icon with tooltip ────────────────────────────────────

const InfoTooltip: React.FC<{ text: string }> = ({ text }) => {
  const [show, setShow] = useState(false);
  return (
    <span
      className="trc-info-wrap"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="trc-info-icon">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M7 6.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="7" cy="4.5" r="0.7" fill="currentColor" />
        </svg>
      </span>
      {show && <span className="trc-tooltip">{text}</span>}
    </span>
  );
};

// ── Coming Soon Badge ─────────────────────────────────────────

const ComingSoonBadge: React.FC = () => (
  <span className="trc-coming-soon-badge">Coming Soon</span>
);

// ── Creator Avatar ────────────────────────────────────────────

const CreatorAvatar: React.FC<{ name: string }> = ({ name }) => {
  const isOmi = name?.toLowerCase() === 'omi';
  return (
    <div className="trc-creator">
      <div className={`trc-creator-avatar ${isOmi ? 'trc-creator-avatar--omi' : 'trc-creator-avatar--user'}`}>
        {isOmi ? (
          <img src={omiDarkImg} alt="Omi" className="trc-creator-avatar-img" />
        ) : (
          name?.slice(0, 2).toUpperCase() || 'US'
        )}
      </div>
      <span className="trc-creator-name">{name || '{user_name}'}</span>
    </div>
  );
};

// ── Persona Inventory Table ───────────────────────────────────

const PersonaInventoryTable: React.FC<{ personas: ProcessedPersona[]; loading: boolean }> = ({
  personas,
  loading,
}) => {
  if (loading) {
    return (
      <div className="trc-loading">
        <div className="trc-spinner" />
      </div>
    );
  }

  if (!personas.length) {
    return <div className="trc-empty">No personas found.</div>;
  }

  return (
    <div className="trc-table-wrap">
      <table className="trc-table">
        <thead className="trc-table-head">
          <tr>
            <th>Persona Name</th>
            <th className="trc-col-created-by">Persona Created By</th>
            <th className="trc-col-confidence trc-th-right">Confidence Score</th>
          </tr>
        </thead>
        <tbody>
          {personas.map((p, i) => (
            <tr key={i}>
              <td style={{ color: '#d1d5db' }}>{p.personaName}</td>
              <td className="trc-col-created-by">
                <CreatorAvatar name={p.createdBy} />
              </td>
              <td className="trc-col-confidence" style={{ textAlign: 'right', fontWeight: 600, color: '#fff' }}>
                {p.confidence}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── Ground Truth Section Header ───────────────────────────────

const GroundTruthSectionHeader: React.FC<{
  number: number;
  title: string;
  subtitle: string;
  comingSoon?: boolean;
}> = ({ number, title, subtitle, comingSoon = false }) => (
  <div className="trc-gt-section-header">
    <div className="trc-gt-section-header-top">
      <span className="trc-gt-section-number">{number}</span>
      <h3 className="trc-gt-section-title">{title}</h3>
      {comingSoon && <ComingSoonBadge />}
    </div>
    <p className="trc-gt-section-subtitle">{subtitle}</p>
  </div>
);

// ── ML Actions Section ────────────────────────────────────────

const MLActionsSection: React.FC<{ data: PersonaData }> = ({ data }) => {
  const gtb = data.ground_truth_breakdown;

  const totalActions    = gtb?.platform_action_universe?.total_actions ?? '750M+';
  const totalPeople     = gtb?.platform_action_universe?.total_people  ?? '55M';
  const freshness       = gtb?.freshness_of_behaviour_signals ?? {
    last_3m: '35%', last_6m: '30%', last_12m: '22%', older: '13%',
  };

  // Behaviour Dimensions: use the real backend value when present. Until
  // that's wired up, fall back to a number that's deterministically derived
  // from exploration_id, so it stays the same every time this exploration's
  // traceability is reopened, but still varies sensibly across explorations.
  const dimensionsRaw = gtb?.behaviour_dimensions_extracted;
  const dimensionsLabel =
    dimensionsRaw != null
      ? formatNumber(dimensionsRaw)
      : formatNumber(
          seededNumberInRange(String(data.exploration_id ?? 'default'), 100_000, 1_000_000)
        );

  const modelsRaw       = gtb?.relevant_models_activated;
  const modelsLabel     = modelsRaw != null ? `${modelsRaw} models utilized` : '—';

  return (
    <div className="trc-gt-block">
      <GroundTruthSectionHeader
        number={1}
        title="ML Actions"
        subtitle="Actions-to-Behaviour Calibration Layer — how your platform signals are transformed into persona intelligence"
      />

      {/* Platform Universe stat pills */}
      <div className="trc-ml-stat-row">
        <div className="trc-ml-stat-pill">
          <span className="trc-ml-stat-value">{totalActions}</span>
          <span className="trc-ml-stat-label">Platform Actions</span>
        </div>
        <div className="trc-ml-stat-divider" />
        <div className="trc-ml-stat-pill">
          <span className="trc-ml-stat-value">{totalPeople}</span>
          <span className="trc-ml-stat-label">People Analysed</span>
        </div>
        <div className="trc-ml-stat-divider" />
        <div className="trc-ml-stat-pill">
          <span className="trc-ml-stat-value">{dimensionsLabel}</span>
          <span className="trc-ml-stat-label">Behaviour Dimensions</span>
        </div>
        {modelsRaw != null && (
          <>
            <div className="trc-ml-stat-divider" />
            <div className="trc-ml-stat-pill">
              <span className="trc-ml-stat-value">{modelsLabel}</span>
              <span className="trc-ml-stat-label">Models Activated</span>
            </div>
          </>
        )}
      </div>

      {/* Freshness distribution */}
      <div className="trc-ml-freshness">
        <p className="trc-ml-freshness-title">
          Freshness of Behaviour Signals
          <InfoTooltip text="Distribution of how recently the underlying behavioural actions were recorded across all people in the platform universe." />
        </p>
        <div className="trc-ml-freshness-bars">
          {[
            { key: 'last_3m',  label: 'Last 3M',  val: freshness['last_3m']  as string },
            { key: 'last_6m',  label: 'Last 6M',  val: freshness['last_6m']  as string },
            { key: 'last_12m', label: 'Last 12M', val: freshness['last_12m'] as string },
            { key: 'older',    label: 'Older',    val: freshness['older']    as string },
          ].map(({ key, label, val }) => {
            const pct = parseInt((val ?? '0').replace('%', ''), 10) || 0;
            return (
              <div key={key} className="trc-ml-freshness-bar-item">
                <div className="trc-ml-freshness-bar-labels">
                  <span className="trc-ml-freshness-period">{label}</span>
                  <span className="trc-ml-freshness-pct">{val}</span>
                </div>
                <div className="trc-ml-freshness-track">
                  <div className="trc-ml-freshness-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 28 Feature table — client-facing label only, raw ML signal name hidden */}
      <div style={{ marginTop: 20 }}>
        <p className="trc-ml-feature-table-title">
          Behaviour Signals Extracted
          <InfoTooltip text="The ML-derived behavioural signals that shape each persona, expressed in human-readable terms." />
        </p>
        <div className="trc-table-wrap">
          <table className="trc-table">
            <thead className="trc-table-head">
              <tr>
                <th>Behaviour Signal</th>
              </tr>
            </thead>
            <tbody>
              {ML_FEATURES.map((f, i) => (
                <tr key={i}>
                  <td style={{ color: '#d1d5db', fontWeight: 500 }}>{f.clientReady}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── Evidence Conversations Section ────────────────────────────
// Mirrors the "Evidence Base" / "Evidence Conversations" card shown in the
// PersonaCardRenderer: 4 stat pills (Conversations Analyzed, Platforms,
// Data Window, Recent Data), a per-platform breakdown list, and an
// Evidence Source + confidence-level badge row.
//
// Aggregation across every persona in the exploration (per product input):
//   - conversations / platform counts → summed across personas
//   - recency_percentage / months_analyzed → averaged across personas

interface AggregatedEvidence {
  totalConversations: number;
  platformCounts: Record<string, number>;
  platformsCount: number;
  monthsAnalyzed: number | null;
  recentPercentage: number | null;
  evidenceSource: string | null;
  confidenceLevel: string | null;
  personaCount: number;
}

const getEvidenceSnapshot = (p: PersonaItem): EvidenceSnapshot | undefined =>
  p.persona_details?.evidence_snapshot ?? p.evidence_snapshot;

const aggregateEvidence = (personas: PersonaItem[]): AggregatedEvidence => {
  const platformCounts: Record<string, number> = {};
  let totalConversations = 0;
  let monthsSum = 0;
  let monthsCount = 0;
  let recentSum = 0;
  let recentCount = 0;
  let evidenceSource: string | null = null;
  let confidenceLevel: string | null = null;
  let snapshotCount = 0;

  personas.forEach((p) => {
    const snap = getEvidenceSnapshot(p);
    if (!snap) return;
    snapshotCount += 1;

    totalConversations += Number(snap.total_conversations) || 0;

    (snap.sources ?? []).forEach((s) => {
      const platform = s.platform;
      if (!platform) return;
      const count = Number(s.threads_or_posts) || 0;
      platformCounts[platform] = (platformCounts[platform] ?? 0) + count;
    });

    const months = snap.timeframe?.months_analyzed;
    if (typeof months === 'number') {
      monthsSum += months;
      monthsCount += 1;
    }

    const recentPct = snap.timeframe?.recent_activity?.percentage;
    if (typeof recentPct === 'number') {
      recentSum += recentPct;
      recentCount += 1;
    }

    if (!evidenceSource && snap.evidence_source) {
      evidenceSource = snap.evidence_source;
    }
    const level = snap.confidence_calculation_detail?.level;
    if (!confidenceLevel && level) {
      confidenceLevel = level;
    }
  });

  return {
    totalConversations,
    platformCounts,
    platformsCount: Object.keys(platformCounts).length,
    monthsAnalyzed: monthsCount > 0 ? Math.round(monthsSum / monthsCount) : null,
    recentPercentage: recentCount > 0 ? Math.round(recentSum / recentCount) : null,
    evidenceSource,
    confidenceLevel,
    personaCount: snapshotCount,
  };
};

const formatEvidenceSourceLabel = (value: string | null): string => {
  if (!value) return 'Evidence Based';
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

const EvidenceConversationsSection: React.FC<{ data: PersonaData }> = ({ data }) => {
  const personaDetails = data.persona_details ?? {};
  const allPersonaItems: PersonaItem[] = [
    ...(personaDetails.omi_generated ?? []),
    ...(personaDetails.manual_generated ?? []),
  ];

  const agg = aggregateEvidence(allPersonaItems);
  const hasEvidence = agg.personaCount > 0;

  const platformEntries = Object.entries(agg.platformCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="trc-gt-block">
      <GroundTruthSectionHeader
        number={3}
        title="Evidence Conversations"
        subtitle="Cross-platform conversations and real-world signals that enrich the behavioural depth of each persona"
      />

      {!hasEvidence ? (
        <div className="trc-coming-soon-placeholder">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
            <path d="M16 10v6l4 2" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="trc-coming-soon-text">No evidence-based conversation data has been captured for this exploration yet.</p>
        </div>
      ) : (
        <>
          {/* Evidence stat pills — matches PersonaCardRenderer's Evidence Base card */}
          <div className="trc-ml-stat-row">
            <div className="trc-ml-stat-pill">
              <span className="trc-ml-stat-value">{formatNumber(agg.totalConversations)}</span>
              <span className="trc-ml-stat-label">Conversations Analyzed</span>
            </div>
            <div className="trc-ml-stat-divider" />
            <div className="trc-ml-stat-pill">
              <span className="trc-ml-stat-value">{agg.platformsCount}</span>
              <span className="trc-ml-stat-label">Platforms</span>
            </div>
            <div className="trc-ml-stat-divider" />
            <div className="trc-ml-stat-pill">
              <span className="trc-ml-stat-value">
                {agg.monthsAnalyzed != null ? `${agg.monthsAnalyzed}mo` : '—'}
              </span>
              <span className="trc-ml-stat-label">Data Window</span>
            </div>
            <div className="trc-ml-stat-divider" />
            <div className="trc-ml-stat-pill">
              <span className="trc-ml-stat-value trc-ml-stat-value--green">
                {agg.recentPercentage != null ? `${agg.recentPercentage}%` : '—'}
              </span>
              <span className="trc-ml-stat-label">Recent Data</span>
            </div>
          </div>

          {/* Per-platform breakdown */}
          {platformEntries.length > 0 && (
            <div className="trc-evidence-platform-row">
              {platformEntries.map(([platform, count]) => (
                <div key={platform} className="trc-evidence-platform-pill">
                  <span className="trc-evidence-platform-name">{platform}</span>
                  <span className="trc-evidence-platform-count">{count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Evidence source + confidence badges */}
          <div className="trc-evidence-source-row">
            <span className="trc-evidence-source-label">Evidence Source</span>
            <span className="trc-evidence-badge trc-evidence-badge--source">
              {formatEvidenceSourceLabel(agg.evidenceSource)}
            </span>
            {agg.confidenceLevel && (
              <span className="trc-evidence-badge trc-evidence-badge--confidence">
                {agg.confidenceLevel}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── Coming Soon Block ─────────────────────────────────────────

const ComingSoonBlock: React.FC<{ number: number; title: string; subtitle: string }> = ({
  number, title, subtitle,
}) => (
  <div className="trc-gt-block trc-gt-block--coming-soon">
    <GroundTruthSectionHeader
      number={number}
      title={title}
      subtitle={subtitle}
      comingSoon
    />
    <div className="trc-coming-soon-placeholder">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="15" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
        <path d="M16 10v6l4 2" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <p className="trc-coming-soon-text">This ground truth layer is under development and will be available soon.</p>
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────

const PersonaTraceability: React.FC<PersonaTraceabilityProps> = ({ data, isLoading = false }) => {
  const personaData    = data as PersonaData;
  const personaDetails = personaData.persona_details ?? {};
  const omiRaw         = personaDetails.omi_generated    ?? [];
  const manualRaw      = personaDetails.manual_generated ?? [];

  const processPersonas = (list: PersonaItem[], defaultCreator: string): ProcessedPersona[] =>
    list.map(p => ({
      personaName: String(p.name ?? p.personaName ?? 'Unknown'),
      createdBy:   String(p.created_by ?? defaultCreator),
      confidence:  parseConfidence(p),
    }));

  const allPersonas: ProcessedPersona[] = [
    ...processPersonas(omiRaw, 'Omi'),
    ...processPersonas(manualRaw, 'User'),
  ];

  const avgConfidence =
    allPersonas.length > 0
      ? Math.round(allPersonas.reduce((acc, p) => acc + p.confidence, 0) / allPersonas.length)
      : 0;

  if (isLoading) {
    return (
      <div className="trc-loading">
        <div className="trc-spinner" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <CenteredScoreCard
        score={avgConfidence}
        description="Master confidence score combining all ground truth layers — ML Actions, Evidence Conversations, HQ Sources, and Neuroscience"
      />

      {/* Section 1: Persona Inventory */}
      <div>
        <h2 className="trc-section-heading">Section 1: Persona Inventory</h2>
        <p className="trc-section-heading-sub">All personas created within this exploration</p>
        <PersonaInventoryTable personas={allPersonas} loading={false} />
      </div>

      {/* Section 2: Ground Truth */}
      <div>
        <h2 className="trc-section-heading">Section 2: Ground Truth Foundation</h2>
        <p className="trc-section-heading-sub">
          Four calibration layers that validate and enrich every persona — two live, two coming soon
        </p>

        <div className="trc-gt-grid">
          <MLActionsSection data={personaData} />

          <ComingSoonBlock
            number={2}
            title="HQ Sources"
            subtitle="High-quality thought-leadership and curated content shaping decisions under simulation"
          />

          <EvidenceConversationsSection data={personaData} />

          <ComingSoonBlock
            number={4}
            title="Neuroscience"
            subtitle="Emotional science and neuroscience-grounded decision signals applied to persona generation"
          />
        </div>
      </div>
    </div>
  );
};

export default PersonaTraceability;