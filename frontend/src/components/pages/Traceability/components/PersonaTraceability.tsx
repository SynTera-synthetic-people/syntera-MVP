import React from 'react';
import CenteredScoreCard from './CenteredScoreCard';
import  omiDarkImg from "../../../../assets/OMI_Dark.png"
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

// ── Creator Avatar ────────────────────────────────────────────

const CreatorAvatar: React.FC<{ name: string }> = ({ name }) => {
  const isOmi = name?.toLowerCase() === 'omi';

  return (
    <div className="trc-creator">
      <div className={`trc-creator-avatar ${isOmi ? 'trc-creator-avatar--omi' : 'trc-creator-avatar--user'}`}>
        
        {isOmi ? (
          <img
            src={omiDarkImg}
            alt="Omi"
            className="trc-creator-avatar-img"
          />
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
            <th className="trc-col-persona-name">Persona Name</th>
            <th className="trc-col-created-by">Persona Created By</th>
            <th className="trc-col-confidence" style={{ textAlign: 'right' }}>Confidence Score</th>
          </tr>
        </thead>
        <tbody>
          {personas.map((p, i) => (
            <tr key={i}>
              <td>{p.personaName}</td>
              <td><CreatorAvatar name={p.createdBy} /></td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: '#fff' }}>{p.confidence}%</td>
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
          <th style={{ textAlign: 'right' }}>Calibration Measurement</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td>
              <div className="trc-evidence-metric">
                <span className="trc-evidence-metric-title">{row.metric}</span>
                <span className="trc-evidence-metric-sub">{row.metricSub}</span>
              </div>
            </td>
            <td style={{ textAlign: 'right' }}>
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
    defaultCreator: string
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
          allPersonas.reduce((acc, p) => acc + p.confidence, 0) / allPersonas.length
        )
      : 0;

  const groundTruthRows: GroundTruthRow[] = [
    {
      metric:    'Number of Real People Analysed',
      metricSub: 'Human population signals grounding models',
      value:     (personaData.number_of_real_people as string | number | null | undefined) ?? '1,23,456',
    },
    {
      metric:    'Neuroscience Inference',
      metricSub: 'Emotional science informing behavioural engines',
      value:     (personaData.neuroscience_inference as string | number | null | undefined) ?? '1,23,456',
    },
    {
      metric:    'Enrichment Layer',
      metricSub: 'Cross-platform conversations enriching behavioural depth',
      value:     personaData.enrichment_layer != null
        ? `${personaData.enrichment_layer} sites researched`
        : '1,23,456',
    },
    {
      metric:    'Contextual Layer',
      metricSub: 'High-quality thought-leadership shaping decisions under simulation',
      value:     (personaData.contextual_layer as string | number | null | undefined) ?? '1,23,456',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <CenteredScoreCard
        score={avgConfidence}
        description="High confidence based on multi-source behavioural data and ground truth validation"
      />

      <div>
        <h2 className="trc-section-heading">Section 1: Persona Inventory</h2>
        <p className="trc-section-heading-sub">All personas created within this exploration</p>
        <PersonaInventoryTable personas={allPersonas} loading={isLoading} />
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