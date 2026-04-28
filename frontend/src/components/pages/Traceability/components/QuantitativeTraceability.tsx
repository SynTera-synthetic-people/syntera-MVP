import React from 'react';
import CenteredScoreCard from './CenteredScoreCard';
import '../Traceability.css';

// ── Types ─────────────────────────────────────────────────────

interface QualityScore {
  dimension: string;
  score: number;
  justification: string;
}

interface QuantData {
  quality_scores?: QualityScore[];
  overall_score?: number;
  [key: string]: unknown;
}

interface QuantitativeTraceabilityProps {
  data: QuantData | Record<string, unknown>;
  isLoading?: boolean;
}

// ── Static data (Figma-defined) ───────────────────────────────

const CORE_ANCHORS = [
  {
    anchor: 'Objective Alignment',
    definition: 'Every question serves a testable hypothesis or business decision, not just data collection.',
    weight: '90%',
  },
  {
    anchor: 'Thematic Integration',
    definition: 'Captures 8 qualitative themes: Context, Behavior, Attitudes, Emotions, Motivations, Barriers, Scenarios, Identity.',
    weight: '90%',
  },
  {
    anchor: 'Methodological Rigor',
    definition: 'Proper scales, unbiased wording, validated constructs. Statistical analysis-ready.',
    weight: '65%',
  },
  {
    anchor: 'Hypothesis Architecture',
    definition: 'Each hypothesis has primary test question + 2-3 validation questions + moderating variables.',
    weight: '25%',
  },
  {
    anchor: 'Respondent Optimization',
    definition: 'Minimizes cognitive load, fatigue, and bias. Efficient question count with strategic depth.',
    weight: '25%',
  },
];

const DECISION_FRAMEWORK = [
  {
    type: 'Segment Difference',
    test: 'ANOVA / t-test',
    design: 'No survey questions or hypotheses are provided, preventing any mapping assessment.',
  },
  {
    type: 'Driver Correlation',
    test: 'Pearson / Regression',
    design: 'Although themes are suggested in the objectives and personas, no actual survey instruments or questions are present to evaluate coverage.',
  },
  {
    type: 'Barrier Identification',
    test: 'MaxDiff / Importance',
    design: 'No measurement scales or instruments are provided for evaluation.',
  },
];

// ── Sub-tables ────────────────────────────────────────────────

const CoreDesignAnchorsTable: React.FC = () => (
  <div className="trc-quant-section">
    <h2 className="trc-quant-section-title">Core Design Anchors</h2>
    <p className="trc-quant-section-sub">Foundational principles bridging quantitative rigor with qualitative depth</p>
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
    <p className="trc-quant-section-sub">Hypothesis-driven design for statistically testable business decisions</p>
    <div className="trc-table-wrap">
      <table className="trc-table">
        <thead className="trc-table-head">
          <tr>
            <th>Hypothesis Type</th>
            <th>Statistical Test</th>
            <th>Required Question Design</th>
          </tr>
        </thead>
        <tbody>
          {DECISION_FRAMEWORK.map((row, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600, color: '#fff', width: '20%' }}>{row.type}</td>
              <td style={{ width: '18%' }}>
                <span className="trc-stat-test">{row.test}</span>
              </td>
              <td style={{ color: '#9ca3af' }}>{row.design}</td>
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

const QuantitativeTraceability: React.FC<QuantitativeTraceabilityProps> = ({ data, isLoading = false }) => {
  const quantData = data as QuantData;
  const scores = quantData.quality_scores || [];
  const overallScore = quantData.overall_score || 0;

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

export default QuantitativeTraceability;
