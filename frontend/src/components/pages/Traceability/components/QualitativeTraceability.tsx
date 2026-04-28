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

// ── Static data (Figma-defined) ───────────────────────────────

const CORE_ANCHORS = [
  {
    anchor: 'Thematic Depth',
    definition: 'Themes drive questions, not topics. Every question maps to insight domains.',
    weight: '30%',
  },
  {
    anchor: 'Flow Architecture',
    definition: 'Safe→Vulnerable, Concrete→Abstract, Past→Present→Future progression.',
    weight: '20%',
  },
  {
    anchor: 'Question Quality',
    definition: 'Open-ended, neutral, non-leading. Enables narrative construction.',
    weight: '25%',
  },
  {
    anchor: 'Probe Sophistication',
    definition: 'Multi-layered probing (clarification, elaboration, emotional, causal).',
    weight: '15%',
  },
  {
    anchor: 'Bias Control',
    definition: 'Active mitigation of leading, confirmation, social desirability biases.',
    weight: '10%',
  },
];

const DECISION_FRAMEWORK = [
  {
    theme:    'Motivational Drivers',
    strategy: '"Why is that important to you?" + emotional/motivational probes',
  },
  {
    theme:    'Barriers & Friction',
    strategy: '"What prevents you…" + severity probes + context exploration',
  },
  {
    theme:    'Journey Mapping',
    strategy: 'Narrative questions + behavioral sequences + pain point identification',
  },
  {
    theme:    'Unmet Needs Discovery',
    strategy: 'Hypothetical scenarios + ideal state questions + frustration exploration',
  },
];

// ── Sub-tables ────────────────────────────────────────────────

const CoreDesignAnchorsTable: React.FC = () => (
  <div className="trc-quant-section">
    <h2 className="trc-quant-section-title">Core Design Anchors</h2>
    <p className="trc-quant-section-sub">The foundational principles that define qualitative discussion guide quality and rigor</p>
    <div className="trc-table-wrap">
      <table className="trc-table">
        <thead className="trc-table-head">
          <tr>
            <th>Core Anchor</th>
            <th>Definition &amp; Rationale</th>
            <th style={{ textAlign: 'right' }}>Weight</th>
          </tr>
        </thead>
        <tbody>
          {CORE_ANCHORS.map((row, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600, color: '#fff', width: '20%' }}>{row.anchor}</td>
              <td style={{ color: '#9ca3af' }}>{row.definition}</td>
              <td style={{ textAlign: 'right', width: '80px' }}>
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
            <th>Research Theme</th>
            <th>Question Design Strategy</th>
          </tr>
        </thead>
        <tbody>
          {DECISION_FRAMEWORK.map((row, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600, color: '#fff', width: '28%' }}>{row.theme}</td>
              <td style={{ color: '#9ca3af' }}>{row.strategy}</td>
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
            <th>Quality Dimension</th>
            <th style={{ textAlign: 'center' }}>Score</th>
            <th>Justification Rationale</th>
          </tr>
        </thead>
        <tbody>
          {scores.length > 0 ? scores.map((row, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600, color: '#fff', width: '22%' }}>{row.dimension}</td>
              <td style={{ textAlign: 'center', width: '100px' }}>
                <span className="trc-score-cell">{row.score}/100</span>
              </td>
              <td style={{ color: '#9ca3af' }}>{row.justification}</td>
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
  const qualData = data as QualData;
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
      {/* Score card */}
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
