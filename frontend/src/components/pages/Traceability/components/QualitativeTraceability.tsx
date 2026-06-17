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
  interviews_conducted?: number | string;
  themes_surfaced?: number | string;
  rebuttal_sessions?: number | string;
  avg_interview_depth?: number | string;
}

interface QualData {
  quality_scores?: QualityScore[];
  overall_score?: number;
  signal_calibration?: SignalCalibration;
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

// ── Signal Calibration Section ────────────────────────────────

interface SignalCalibrationSectionProps {
  calibration: SignalCalibration;
}

const SignalCalibrationSection: React.FC<SignalCalibrationSectionProps> = ({ calibration }) => {
  const metrics: { label: string; sub: string; value: string | number; tooltip: string }[] = [
    {
      label:   'Interviews Conducted',
      sub:     'Simulated in-depth interviews run within this exploration',
      value:   calibration.interviews_conducted ?? '—',
      tooltip: 'Total number of simulated IDI sessions used to surface qualitative themes and behavioural narratives.',
    },
    {
      label:   'Themes Surfaced',
      sub:     'Distinct insight themes extracted across all interviews',
      value:   calibration.themes_surfaced ?? '—',
      tooltip: 'Number of unique qualitative themes identified through thematic analysis across all interview transcripts.',
    },
    {
      label:   'Rebuttal Sessions',
      sub:     'Adversarial challenges run to stress-test findings',
      value:   calibration.rebuttal_sessions ?? '—',
      tooltip: 'Number of rebuttal sessions conducted to challenge assumptions and validate the robustness of qualitative insights.',
    },
    {
      label:   'Avg. Interview Depth',
      sub:     'Average question rounds per simulated interview',
      value:   calibration.avg_interview_depth != null
        ? `${calibration.avg_interview_depth} rounds`
        : '—',
      tooltip: 'Measures probe depth per interview — higher rounds indicate richer qualitative signal extraction.',
    },
  ];

  return (
    <div className="trc-quant-section">
      <h2 className="trc-quant-section-title">Ground Truth: Interview Signal Calibration</h2>
      <p className="trc-quant-section-sub">
        How qualitative interview inputs were structured, simulated, and validated for depth of insight
      </p>
      <div className="trc-gt-signal-grid">
        {metrics.map((m, i) => (
          <div key={i} className="trc-gt-signal-card">
            <div className="trc-gt-signal-card-header">
              <span className="trc-gt-signal-label">{m.label}</span>
              <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 6 }}>
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

// ── Decision Intelligence ─────────────────────────────────────

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

const QualitativeTraceability: React.FC<QualitativeTraceabilityProps> = ({ data, isLoading = false }) => {
  const qualData     = data as QualData;
  const scores       = qualData.quality_scores   || [];
  const overallScore = qualData.overall_score    || 0;
  const calibration  = (qualData.signal_calibration as SignalCalibration) || {};

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

export default QualitativeTraceability;