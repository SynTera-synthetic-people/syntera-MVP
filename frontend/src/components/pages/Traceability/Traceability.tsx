import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTraceability, useExploration } from '../../../hooks/useExplorations';
import PersonaTraceability from './components/PersonaTraceability';
import QuantitativeTraceability from './components/QuantitativeTraceability';
import QualitativeTraceability from './components/QualitativeTraceability';
import SpIcon from '../../SPIcon';
import './Traceability.css';

// ── Types ─────────────────────────────────────────────────────

interface ResearchComponent {
  component: string;
  value: string;
  status: 'clear' | 'partial' | 'inferred' | 'missing' | string;
}

interface ROTraceability {
  components: ResearchComponent[];
  ro_score: number;
  summary?: string;
  input_coverage?: number;
  signal_precision?: number;
  behavioural_evidence?: number;
}

interface APIData {
  data: {
    ro_traceability?: ROTraceability;
    persona_traceability?: { data: Record<string, unknown> };
    quant_traceability?: Record<string, unknown>;
    qual_traceability?: Record<string, unknown>;
  };
}

interface ExplorationData {
  is_quantitative?: boolean;
  is_qualitative?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────

const getScoreLabel = (score: number): string => {
  if (score > 80) return 'Excellent';
  if (score > 60) return 'Strong';
  if (score > 40) return 'Good';
  return 'Needs More Signals';
};

const getScoreBadgeClass = (score: number): string => {
  if (score > 80) return 'trc-score-badge--excellent';
  if (score > 60) return 'trc-score-badge--strong';
  if (score > 40) return 'trc-score-badge--good';
  return 'trc-score-badge--poor';
};

// ── Status Icon ───────────────────────────────────────────────

const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  switch (status?.toLowerCase()) {
    case 'clear':
      return (
        <span className="trc-status-icon trc-status-icon--validated">
          <SpIcon name="sp-Warning-Circle_Check" size={14} />
        </span>
      );
    case 'partial':
      return (
        <span className="trc-status-icon trc-status-icon--partial">
          <SpIcon name="sp-Warning-Triangle_Warning" size={13} />
        </span>
      );
    case 'inferred':
      return (
        <span className="trc-status-icon trc-status-icon--inferred">
          <SpIcon name="sp-Arrow-Arrow_Reload_02" size={13} />
        </span>
      );
    case 'missing':
    default:
      return (
        <span className="trc-status-icon trc-status-icon--missing">
          <SpIcon name="sp-Warning-Help" size={13} />
        </span>
      );
  }
};

// ── Research component labels (from developer notes) ──────────

const COMPONENT_COVERAGE: Record<string, string> = {
  'Business Context':       'The broader business situation that makes this research necessary.',
  'Decision Problem':       'The specific decision this research is meant to inform or resolve.',
  'Information Gap':        'What is currently unknown or unclear about the problem.',
  'Primary Hypothesis':     'The main assumption being tested about how behaviour or outcomes might work.',
  'Secondary Hypotheses':   'Supporting assumptions that help explore additional behavioural patterns.',
  'Target Audience':        'The specific group of people whose behaviour this research aims to understand.',
  'Segmentation Logic':     'How the audience is divided into meaningful groups for deeper analysis.',
  'Category Competitive Frame': 'The market or product context in which these behaviours occur.',
  'Behaviours & Attitudes': 'The actions, motivations, and mindsets influencing how people make decisions.',
  'Geography':              'The locations or environments where the behaviours are being studied.',
};

// ── Calibration Score Card ────────────────────────────────────

interface ScoreCardProps {
  score: number;
  inputCoverage?: number | undefined;
  signalPrecision?: number | undefined;
  behaviouralEvidence?: number | undefined;
}

const CalibrationScoreCard: React.FC<ScoreCardProps> = ({
  score,
  inputCoverage,
  signalPrecision,
  behaviouralEvidence,
}) => {
  const hasBreakdown = inputCoverage != null || signalPrecision != null || behaviouralEvidence != null;
  return (
    <div className="trc-score-card">
      <div className="trc-score-main">
        <span className="trc-score-number">{score}%</span>
        <span className={`trc-score-badge ${getScoreBadgeClass(score)}`}>
          {getScoreLabel(score)}
        </span>
      </div>
      <span className="trc-score-label">Calibration Score</span>
      <div className="trc-score-bar-wrap">
        <div className="trc-score-bar-track">
          <div className="trc-score-bar-fill" style={{ width: `${score}%` }} />
        </div>
      </div>
      {hasBreakdown && (
        <>
          <span className="trc-score-breakdown-title">Breakdown</span>
          <div className="trc-score-breakdown-row">
            {inputCoverage != null && (
              <div className="trc-score-breakdown-item">
                <span className="trc-score-breakdown-key">Input Coverage</span>
                <span className="trc-score-breakdown-val">{inputCoverage}%</span>
              </div>
            )}
            {signalPrecision != null && (
              <div className="trc-score-breakdown-item">
                <span className="trc-score-breakdown-key">Signal Precision:</span>
                <span className="trc-score-breakdown-val">{signalPrecision}%</span>
              </div>
            )}
            {behaviouralEvidence != null && (
              <div className="trc-score-breakdown-item">
                <span className="trc-score-breakdown-key">Behavioural Evidence:</span>
                <span className="trc-score-breakdown-val">{behaviouralEvidence}%</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
// ── Research Table ────────────────────────────────────────────

interface ResearchTableProps {
  components: ResearchComponent[];
  loading: boolean;
}

const ResearchTable: React.FC<ResearchTableProps> = ({ components, loading }) => {
  if (loading) {
    return (
      <div className="trc-loading">
        <div className="trc-spinner" />
        <span style={{ color: '#6b7280', fontSize: 13 }}>Loading...</span>
      </div>
    );
  }

  if (!components || components.length === 0) {
    return <div className="trc-empty">No research components found.</div>;
  }

  return (
    <div className="trc-table-wrap">
      <table className="trc-table">
        <thead className="trc-table-head">
          <tr>
            <th>Research Component</th>
            <th>Coverage</th>
            <th className="trc-th-right">Validation Status</th>
          </tr>
        </thead>
        <tbody>
          {components.map((row, i) => (
            <tr key={i}>
              <td className="trc-td-component">{row.component}</td>
              <td className="trc-td-coverage">
                {COMPONENT_COVERAGE[row.component] || row.value || '—'}
              </td>
              <td className="trc-td-status">
                <StatusIcon status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────

const Traceability: React.FC = () => {
  const { workspaceId, explorationId } = useParams<{
    workspaceId: string;
    explorationId: string;
  }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'research' | 'persona' | 'quantitative' | 'qualitative'>('research');
  const [expanded, setExpanded] = useState(false);

  const { data: explorationData, isLoading: isExplorationLoading } =
    useExploration(explorationId) as { data: ExplorationData | undefined; isLoading: boolean };

  const { data: apiData, isLoading: isTraceabilityLoading, error } =
    useTraceability(
      workspaceId,
      explorationId,
      {
        is_quantitative: explorationData?.is_quantitative,
        is_qualitative: explorationData?.is_qualitative,
      },
      { enabled: !!explorationData }
    ) as { data: APIData | undefined; isLoading: boolean; error: Error | null };

  const isLoading = isExplorationLoading || isTraceabilityLoading;

  // Build tab list
  const allTabs = [
    { id: 'research' as const,     label: 'Research Objectives' },
    { id: 'persona' as const,      label: 'Persona Builder' },
    { id: 'quantitative' as const, label: 'Quant Simulation' },
    { id: 'qualitative' as const,  label: 'Qual Exploration' },
  ];

  const tabs = allTabs.filter(tab => {
    if (tab.id === 'research' || tab.id === 'persona') return true;
    if (tab.id === 'quantitative') return explorationData?.is_quantitative === true;
    if (tab.id === 'qualitative')  return explorationData?.is_qualitative === true;
    return true;
  });

  const roData = apiData?.data?.ro_traceability;
  const components: ResearchComponent[] = roData?.components || [];
  const roScore = roData?.ro_score || 0;

  // Summary counts
  const totalComponents = components.length;
  const validatedCount  = components.filter(c => c.status?.toLowerCase() === 'clear').length;
  const partialCount    = components.filter(c => c.status?.toLowerCase() === 'partial').length;
  const inferredCount   = components.filter(c => c.status?.toLowerCase() === 'inferred').length;
  const missingCount    = components.filter(c => c.status?.toLowerCase() === 'missing').length;

  // Research intent text (from summary or value of Business Context)
  const summaryText = roData?.summary
    || components.find(c => c.component === 'Business Context')?.value
    || '';

  const summaryTruncated = summaryText.length > 400 && !expanded
    ? summaryText.slice(0, 400) + '…'
    : summaryText;

  const personaData   = (apiData?.data?.persona_traceability?.data || {}) as Record<string, unknown>;
  const quantData     = (apiData?.data?.quant_traceability || {}) as Record<string, unknown>;
  const qualData      = (apiData?.data?.qual_traceability  || {}) as Record<string, unknown>;

  if (error) {
    return (
      <div className="trc-page">
        <div className="trc-error">Failed to load traceability data. Please try again.</div>
      </div>
    );
  }

  return (
    <div className="trc-page">
      {/* Back button */}
      <button
        className="trc-back-btn"
        onClick={() => navigate(`/main/organization/workspace/explorations/${workspaceId}`)}
      >
        <SpIcon name="sp-Arrow-Arrow_Left_SM" />
        Back
      </button>

      {/* Page heading */}
      <h1 className="trc-title">Traceability Logs</h1>
      <p className="trc-subtitle">
        Audit the inputs, assumptions, model calibration, and validation signals behind each output.
      </p>

      {/* Tabs */}
      <div className="trc-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`trc-tab ${activeTab === tab.id ? 'trc-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {activeTab === tab.id && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {/* ── Research Tab ── */}
      {activeTab === 'research' && (
        <div className="trc-research-layout">
          {/* Left: intent + table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {summaryText && (
              <div>
                <p className="trc-section-title">Research Intent</p>
                <p className="trc-research-text">{summaryTruncated}</p>
                {summaryText.length > 400 && (
                  <button className="trc-see-more" onClick={() => setExpanded(v => !v)}>
                    {expanded ? 'See Less' : 'See More'}
                  </button>
                )}
              </div>
            )}

            {/* Inputs evaluated */}
            <div className="trc-inputs-bar">
              <span className="trc-inputs-count">
                Inputs Evaluated: {totalComponents - missingCount} / {totalComponents}
              </span>
              <span className="trc-inputs-divider">|</span>
              <div className="trc-inputs-legend">
                <span className="trc-inputs-legend-item">
                  <SpIcon name="sp-Warning-Circle_Check" size={14} style={{ color: 'rgba(255,255,255,0.5)' }} />
                  Validated
                </span>
                <span className="trc-inputs-legend-item">
                  <SpIcon name="sp-Warning-Triangle_Warning" size={13} style={{ color: '#eab308' }} />
                  Partially Defined
                </span>
                <span className="trc-inputs-legend-item">
                  <SpIcon name="sp-Arrow-Arrow_Reload_02" size={13} />
                  Triangulated
                </span>
                <span className="trc-inputs-legend-item">
                  <SpIcon name="sp-Warning-Help" size={14} style={{ color: '#6b7280' }} />
                  Input Missing
                </span>
              </div>
            </div>

            <ResearchTable components={components} loading={isLoading} />
          </div>

          {/* Right: score card */}
          <CalibrationScoreCard
            score={roScore}
            inputCoverage={roData?.input_coverage}
            signalPrecision={roData?.signal_precision}
            behaviouralEvidence={roData?.behavioural_evidence}
          />
        </div>
      )}

      {/* ── Persona Tab ── */}
      {activeTab === 'persona' && (
        <PersonaTraceability data={personaData} isLoading={isLoading} />
      )}

      {/* ── Quant Tab ── */}
      {activeTab === 'quantitative' && (
        <QuantitativeTraceability data={quantData} isLoading={isLoading} />
      )}

      {/* ── Qual Tab ── */}
      {activeTab === 'qualitative' && (
        <QualitativeTraceability data={qualData} isLoading={isLoading} />
      )}
    </div>
  );
};

export default Traceability;
