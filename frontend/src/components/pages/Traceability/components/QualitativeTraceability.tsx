import React from 'react';
import CenteredScoreCard from './CenteredScoreCard';
import '../Traceability.css';

// ── Types ─────────────────────────────────────────────────────

interface QualityScore {
  dimension: string;
  score: number;
  justification: string;
}

interface QualData {
  quality_scores?: QualityScore[];
  overall_score?: number;
  [key: string]: unknown;
}

interface QualitativeTraceabilityProps {
  data: QualData | Record<string, unknown>;
  isLoading?: boolean;
}

// ── Static data ───────────────────────────────────────────────

const CORE_ANCHORS = [
  {
    anchor:     'Thematic Depth',
    definition: 'Themes drive questions, not topics. Every question maps to insight domains.',
    weight:     '30%',
  },
  {
    anchor:     'Flow Architecture',
    definition: 'Safe→Vulnerable, Concrete→Abstract, Past→Present→Future progression.',
    weight:     '20%',
  },
  {
    anchor:     'Question Quality',
    definition: 'Open-ended, neutral, non-leading. Enables narrative construction.',
    weight:     '25%',
  },
  {
    anchor:     'Probe Sophistication',
    definition: 'Multi-layered probing (clarification, elaboration, emotional, causal).',
    weight:     '15%',
  },
  {
    anchor:     'Bias Control',
    definition: 'Active mitigation of leading, confirmation, social desirability biases.',
    weight:     '10%',
  },
];

const DECISION_FRAMEWORK = [
  {
    theme:    'Motivational Drivers',
    strategy: '"Why is that important to you?" + emotional/motivational probes',
    weight:   '90%',
  },
  {
    theme:    'Barriers & Friction',
    strategy: '"What prevents you…" + severity probes + context exploration',
    weight:   '90%',
  },
  {
    theme:    'Journey Mapping',
    strategy: 'Narrative questions + behavioral sequences + pain point identification',
    weight:   '65%',
  },
  {
    theme:    'Unmet Needs Discovery',
    strategy: 'Hypothetical scenarios + ideal state questions + frustration exploration',
    weight:   '25%',
  },
];

// ── Sub-tables ────────────────────────────────────────────────

const CoreDesignAnchorsTable: React.FC = () => (
  <div className="trc-quant-section">
    <h2 className="trc-quant-section-title">Core Design Anchors</h2>
    <p className="trc-quant-section-sub">
      The foundational principles that define qualitative discussion guide quality and rigor
    </p>
    <div className="trc-table-wrap">
      <table className="trc-table">
        <thead className="trc-table-head">
          <tr>
            <th className="trc-col-anchor">Core Anchor</th>
            <th className="trc-col-definition">Definition &amp; Rationale</th>
            <th className="trc-col-weight trc-th-right">Weight</th>
          </tr>
        </thead>
        <tbody>
          {CORE_ANCHORS.map((row, i) => (
            <tr key={i}>
              <td className="trc-col-anchor" style={{ fontWeight: 600, color: '#fff' }}>{row.anchor}</td>
              <td className="trc-col-definition" style={{ color: '#9ca3af' }}>{row.definition}</td>
              <td className="trc-col-weight" style={{ textAlign: 'right' }}>
                <span className="trc-weight-badge">{row.weight}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const DecisionIntelligenceTable: React.FC = () => (
  <div className="trc-quant-section">
    <h2 className="trc-quant-section-title">Decision Intelligence Framework</h2>
    <p className="trc-quant-section-sub">Theme-to-insight mapping for strategic business decisions</p>
    <div className="trc-table-wrap">
      <table className="trc-table">
        <thead className="trc-table-head">
          <tr>
            <th className="trc-col-anchor">Core Anchor</th>
            <th className="trc-col-definition">Definition &amp; Rationale</th>
            <th className="trc-col-weight trc-th-right">Weight</th>
          </tr>
        </thead>
        <tbody>
          {DECISION_FRAMEWORK.map((row, i) => (
            <tr key={i}>
              <td className="trc-col-anchor" style={{ fontWeight: 600, color: '#fff' }}>{row.theme}</td>
              <td className="trc-col-definition" style={{ color: '#9ca3af' }}>{row.strategy}</td>
              <td className="trc-col-weight" style={{ textAlign: 'right' }}>
                <span className="trc-weight-badge">{row.weight}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

interface QualityScoringTableProps {
  scores: QualityScore[];
}

const QualityScoringTable: React.FC<QualityScoringTableProps> = ({ scores }) => (
  <div className="trc-quant-section">
    <h2 className="trc-quant-section-title">Quality Scoring Framework</h2>
    <p className="trc-quant-section-sub">Multi-dimensional evaluation system for research excellence</p>
    <div className="trc-table-wrap">
      <table className="trc-table">
        <thead className="trc-table-head">
          <tr>
            <th className="trc-col-quality-dim">Quality Dimension</th>
            <th className="trc-col-score" style={{ textAlign: 'center' }}>Score</th>
            <th className="trc-col-justification">Justification Rationale</th>
          </tr>
        </thead>
        <tbody>
          {scores.length > 0 ? scores.map((row, i) => (
            <tr key={i}>
              <td className="trc-col-quality-dim" style={{ fontWeight: 600, color: '#fff' }}>{row.dimension}</td>
              <td className="trc-col-score" style={{ textAlign: 'center' }}>
                <span className="trc-score-cell">{row.score}/100</span>
              </td>
              <td className="trc-col-justification" style={{ color: '#9ca3af' }}>{row.justification}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={3} className="trc-empty">No quality scores available.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────

const QualitativeTraceability: React.FC<QualitativeTraceabilityProps> = ({ data, isLoading = false }) => {
  const qualData     = data as QualData;
  const scores       = qualData.quality_scores || [];
  const overallScore = qualData.overall_score  || 0;

  if (isLoading) {
    return (
      <div className="trc-loading">
        <div className="trc-spinner" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <CenteredScoreCard
        score={overallScore}
        description="Aggregated score based on all quality dimensions"
      />
      <div style={{ marginTop: 24 }}>
        <CoreDesignAnchorsTable />
        <DecisionIntelligenceTable />
        <QualityScoringTable scores={scores} />
      </div>
    </div>
  );
};

export default QualitativeTraceability;