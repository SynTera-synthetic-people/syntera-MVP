import React from 'react';
import CenteredScoreCard from './CenteredScoreCard';
import '../Traceability.css';

// ── Types ─────────────────────────────────────────────────────

interface QualityScore {
  dimension: string;
  score: number;
  justification: string;
}

interface SignalCalibration {
  survey_responses?: number | string;
  hypotheses_tested?: number | string;
  segments_analysed?: number | string;
  completion_rate?: number | string;
}

interface QuantData {
  quality_scores?: QualityScore[];
  overall_score?: number;
  signal_calibration?: SignalCalibration;
  [key: string]: unknown;
}

interface QuantitativeTraceabilityProps {
  data: QuantData | Record<string, unknown>;
  isLoading?: boolean;
}

// ── Static data ───────────────────────────────────────────────

const CORE_ANCHORS = [
  {
    anchor:     'Objective Alignment',
    definition: 'Every question serves a testable hypothesis or business decision, not just data collection.',
    weight:     '90%',
  },
  {
    anchor:     'Thematic Integration',
    definition: 'Captures 8 qualitative themes: Context, Behavior, Attitudes, Emotions, Motivations, Barriers, Scenarios, Identity.',
    weight:     '90%',
  },
  {
    anchor:     'Methodological Rigor',
    definition: 'Proper scales, unbiased wording, validated constructs. Statistical analysis-ready.',
    weight:     '65%',
  },
  {
    anchor:     'Hypothesis Architecture',
    definition: 'Each hypothesis has primary test question + 2-3 validation questions + moderating variables.',
    weight:     '25%',
  },
  {
    anchor:     'Respondent Optimization',
    definition: 'Minimizes cognitive load, fatigue, and bias. Efficient question count with strategic depth.',
    weight:     '25%',
  },
];

const DECISION_FRAMEWORK = [
  {
    type:   'Segment Difference',
    test:   'ANOVA / t-test',
    design: 'Scaled comparisons across demographic/behavioral segments',
  },
  {
    type:   'Driver Correlation',
    test:   'Pearson / Regression',
    design: 'Importance ratings + outcome measures (e.g., purchase intent)',
  },
  {
    type:   'Barrier Identification',
    test:   'MaxDiff / Importance',
    design: 'Barrier multi-select + severity ratings + ranking',
  },
];

// ── Signal Calibration Section ────────────────────────────────

interface SignalCalibrationSectionProps {
  calibration: SignalCalibration;
}

const SignalCalibrationSection: React.FC<SignalCalibrationSectionProps> = ({ calibration }) => {
  const metrics: { label: string; sub: string; value: string | number; tooltip: string }[] = [
    {
      label:   'Survey Responses Simulated',
      sub:     'Total synthetic respondent signals generated for this exploration',
      value:   calibration.survey_responses ?? '—',
      tooltip: 'Number of simulated survey responses used to derive quantitative patterns across segments.',
    },
    {
      label:   'Hypotheses Tested',
      sub:     'Distinct business questions validated through survey design',
      value:   calibration.hypotheses_tested ?? '—',
      tooltip: 'Each hypothesis maps to primary test questions and 2–3 validation questions in the survey.',
    },
    {
      label:   'Segments Analysed',
      sub:     'Demographic and behavioural cuts applied across responses',
      value:   calibration.segments_analysed ?? '—',
      tooltip: 'Number of distinct audience segments cross-tabulated to surface differential patterns.',
    },
    {
      label:   'Completion Rate',
      sub:     'Signal integrity across the full response set',
      value:   calibration.completion_rate != null
        ? `${calibration.completion_rate}%`
        : '—',
      tooltip: 'Percentage of simulated respondents who completed the full survey, indicating signal completeness.',
    },
  ];

  return (
    <div className="trc-quant-section">
      <h2 className="trc-quant-section-title">Ground Truth: Survey Signal Calibration</h2>
      <p className="trc-quant-section-sub">
        How simulation inputs were constructed and validated for quantitative rigour
      </p>
      <div className="trc-gt-signal-grid">
        {metrics.map((m, i) => (
          <div key={i} className="trc-gt-signal-card">
            <div className="trc-gt-signal-card-header">
              <span className="trc-gt-signal-label">{m.label}</span>
              <span className="trc-info-wrap" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 6 }}>
                <SignalInfoTooltip text={m.tooltip} />
              </span>
            </div>
            <span className="trc-gt-signal-value">{String(m.value)}</span>
            <span className="trc-gt-signal-sub">{m.sub}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Inline tooltip for signal cards (avoids importing full InfoTooltip state)
const SignalInfoTooltip: React.FC<{ text: string }> = ({ text }) => {
  const [show, setShow] = React.useState(false);
  return (
    <span
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ display: 'inline-flex', alignItems: 'center', cursor: 'default' }}
    >
      <span className="trc-info-icon">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M7 6.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="7" cy="4.5" r="0.7" fill="currentColor" />
        </svg>
      </span>
      {show && <span className="trc-tooltip">{text}</span>}
    </span>
  );
};

// ── Core Design Anchors ───────────────────────────────────────

const CoreDesignAnchorsTable: React.FC = () => (
  <div className="trc-quant-section">
    <h2 className="trc-quant-section-title">Core Design Anchors</h2>
    <p className="trc-quant-section-sub">
      Foundational principles bridging quantitative rigor with qualitative depth
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

// ── Decision Intelligence ─────────────────────────────────────

const DecisionIntelligenceTable: React.FC = () => (
  <div className="trc-quant-section">
    <h2 className="trc-quant-section-title">Decision Intelligence Framework</h2>
    <p className="trc-quant-section-sub">
      Hypothesis-driven design for statistically testable business decisions
    </p>
    <div className="trc-table-wrap">
      <table className="trc-table">
        <thead className="trc-table-head">
          <tr>
            <th className="trc-col-hypo-type">Hypothesis Type</th>
            <th className="trc-col-stat-test">Statistical Test</th>
            <th className="trc-col-question-design">Required Question Design</th>
          </tr>
        </thead>
        <tbody>
          {DECISION_FRAMEWORK.map((row, i) => (
            <tr key={i}>
              <td className="trc-col-hypo-type" style={{ fontWeight: 600, color: '#fff' }}>{row.type}</td>
              <td className="trc-col-stat-test">
                <span className="trc-stat-test">{row.test}</span>
              </td>
              <td className="trc-col-question-design" style={{ color: '#9ca3af' }}>{row.design}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ── Quality Scoring ───────────────────────────────────────────

const QualityScoringTable: React.FC<{ scores: QualityScore[] }> = ({ scores }) => (
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

const QuantitativeTraceability: React.FC<QuantitativeTraceabilityProps> = ({ data, isLoading = false }) => {
  const quantData    = data as QuantData;
  const scores       = quantData.quality_scores    || [];
  const overallScore = quantData.overall_score     || 0;
  const calibration  = (quantData.signal_calibration as SignalCalibration) || {};

  if (isLoading) {
    return (
      <div className="trc-loading">
        <div className="trc-spinner" />
      </div>
    );
  }

  const hasCalibration = Object.values(calibration).some(v => v != null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <CenteredScoreCard
        score={overallScore}
        description="Aggregated score based on all quality dimensions"
      />
      <div style={{ marginTop: 24 }}>
        {hasCalibration && <SignalCalibrationSection calibration={calibration} />}
        <CoreDesignAnchorsTable />
        <DecisionIntelligenceTable />
        <QualityScoringTable scores={scores} />
      </div>
    </div>
  );
};

export default QuantitativeTraceability;