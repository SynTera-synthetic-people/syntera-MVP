import React, { useState } from 'react';
import CenteredScoreCard from './CenteredScoreCard';
import omiDarkImg from '../../../../assets/OMI_Dark.png';
import '../Traceability.css';

// ── Types ─────────────────────────────────────────────────────

interface PersonaItem {
  name?: string;
  personaName?: string;
  confidence_scoring?: { score: string };
  confidence?: number;
  created_by?: string;
  [key: string]: unknown;
}

interface PersonaDetails {
  omi_generated?: PersonaItem[];
  manual_generated?: PersonaItem[];
}

interface PersonaData {
  persona_details?: PersonaDetails;
  enrichment_stats?: Record<string, unknown>;
  number_of_real_people?: string | number;
  number_of_sites_researched?: number;
  neuroscience_inference?: string | number;
  enrichment_layer?: string | number;
  contextual_layer?: string | number;
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

interface GroundTruthRow {
  metric: string;
  metricSub: string;
  tooltip: string;
  value: string | number;
}

// ── Helpers ───────────────────────────────────────────────────

const parseConfidence = (p: PersonaItem): number => {
  if (p.confidence_scoring?.score) {
    return parseInt(p.confidence_scoring.score.replace('%', ''), 10) || 0;
  }
  if (typeof p.confidence === 'number') return p.confidence;
  return 0;
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

// ── Ground Truth Table ────────────────────────────────────────

const GroundTruthTable: React.FC<{ rows: GroundTruthRow[] }> = ({ rows }) => (
  <div className="trc-table-wrap">
    <table className="trc-table">
      <thead className="trc-table-head">
        <tr>
          <th>Evidence Metric</th>
          <th className="trc-th-right">Calibration Measurement</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td>
              <div className="trc-evidence-metric">
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <span className="trc-evidence-metric-title">{row.metric}</span>
                  <InfoTooltip text={row.tooltip} />
                </span>
                <span className="trc-evidence-metric-sub">{row.metricSub}</span>
              </div>
            </td>
            <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
              <span className="trc-evidence-value">{row.value}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ── Main Component ────────────────────────────────────────────

const PersonaTraceability: React.FC<PersonaTraceabilityProps> = ({ data, isLoading = false }) => {
  const personaData = data as PersonaData;
  const personaDetails = personaData.persona_details ?? {};
  const omiRaw    = personaDetails.omi_generated    ?? [];
  const manualRaw = personaDetails.manual_generated ?? [];

  const processPersonas = (
    list: PersonaItem[],
    defaultCreator: string,
  ): ProcessedPersona[] =>
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
      ? Math.round(
          allPersonas.reduce((acc, p) => acc + p.confidence, 0) / allPersonas.length,
        )
      : 0;

  const groundTruthRows: GroundTruthRow[] = [
    {
      metric:    'Number of Real People Analysed',
      metricSub: 'Human population signals grounding models',
      tooltip:   'Count of real people actions (transactions, browsing patterns…) behind your personas',
      value:     (personaData.number_of_real_people as string | number | null | undefined) ?? '1,23,456',
    },
    {
      metric:    'Neuroscience Inference',
      metricSub: 'Emotional science informing behavioural engines',
      tooltip:   'Neuroscience-grounded emotion and decision signals applied to persona generation',
      value:     (personaData.neuroscience_inference as string | number | null | undefined) ?? '1,23,456',
    },
    {
      metric:    'Enrichment Layer',
      metricSub: 'Cross-platform conversations enriching behavioural depth',
      tooltip:   'Platforms and conversations we pull through to boost your Persona',
      value:     personaData.enrichment_layer != null
        ? `${personaData.enrichment_layer} sites researched`
        : '1,23,456',
    },
    {
      metric:    'Contextual Layer',
      metricSub: 'High-quality thought-leadership shaping decisions under simulation',
      tooltip:   'Handpicked sources adding extra context to your personas',
      value:     (personaData.contextual_layer as string | number | null | undefined) ?? '1,23,456',
    },
  ];

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
        description="High confidence based on multi-source behavioural data and ground truth validation"
      />

      <div>
        <h2 className="trc-section-heading">Section 1: Persona Inventory</h2>
        <p className="trc-section-heading-sub">All personas created within this exploration</p>
        <PersonaInventoryTable personas={allPersonas} loading={false} />
      </div>

      <div>
        <h2 className="trc-section-heading">Ground Truth: Evidence Foundation</h2>
        <p className="trc-section-heading-sub">Data sources and calibration measurements</p>
        <GroundTruthTable rows={groundTruthRows} />
      </div>
    </div>
  );
};

export default PersonaTraceability;