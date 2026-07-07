import React, { useState, useCallback } from 'react';
import './DataPlayground.css';
import FrequencyTable from './tabs/FrequencyTable';
import CrossTabs from './tabs/CrossTabs';
import ChartVisuals from './tabs/ChartVisuals';
import InsightsSummary from './tabs/InsightsSummary';
import CodedData from './tabs/CodedData';
import LabelledData from './tabs/LabelledData';
import DownloadModal from './DownloadModal';

export type TabId =
  | 'frequency'
  | 'crosstabs'
  | 'chart'
  | 'insights'
  | 'coded'
  | 'labelled';

export interface Variable {
  id: string;
  label: string;
}

export interface DownloadOptions {
  sheets: 'all' | 'one';
  direction: 'col' | 'row';
  display: 'both' | 'pct' | 'count';
  toc: boolean;
}

interface DataPlaygroundProps {
  onClose?: () => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'frequency', label: 'Frequency Table' },
  { id: 'crosstabs', label: 'Cross Tabs' },
  { id: 'chart', label: 'Chart/Visuals' },
  { id: 'insights', label: 'Insights/Summary' },
  { id: 'coded', label: 'Coded Data' },
  { id: 'labelled', label: 'Labelled Data' },
];

// Tabs that use the "Run <X>" primary action in the footer.
const RUN_TABS = new Set<TabId>(['frequency', 'crosstabs']);

// Tabs that show the "Upload Data" button in the header — per Figma, this
// only appears on the two raw-data-selection tabs (Frequency Table / Cross
// Tabs). Chart/Visuals, Insights/Summary, Coded Data and Labelled Data all
// hide it since they operate on data that's already been selected/loaded.
const UPLOAD_TABS = new Set<TabId>(['frequency', 'crosstabs']);

// Tabs whose footer always shows a download-style action, regardless of
// whether a "Run" has produced hasResults (Coded/Labelled data render
// immediately since they don't require variable selection).
const ALWAYS_DOWNLOAD_TABS = new Set<TabId>(['coded', 'labelled']);

export const ALL_VARIABLES: Variable[] = [
  { id: 'respid', label: 'respid' },
  { id: 'LOISec', label: 'LOISec' },
  { id: 'status', label: 'status' },
  { id: 'Comments', label: 'Comments' },
  { id: 'S1', label: 'S1' },
  { id: 'S1_14_other', label: 'S1_14_other' },
  { id: 'S2', label: 'S2' },
  { id: 'S3', label: 'S3' },
  { id: 'S4', label: 'S4' },
  { id: 'S4_24_other', label: 'S4_24_other' },
  { id: 'S5', label: 'S5' },
  { id: 'S5_9_other', label: 'S5_9_other' },
  { id: 'S6', label: 'S6' },
  { id: 'S6_7_other', label: 'S6_7_other' },
  { id: 'S7_1', label: 'S7_1' },
  { id: 'S7_2', label: 'S7_2' },
  { id: 'S7_3', label: 'S7_3' },
  { id: 'S7_4', label: 'S7_4' },
  { id: 'S7_5', label: 'S7_5' },
  { id: 'S7_6', label: 'S7_6' },
  { id: 'S7_7', label: 'S7_7' },
  { id: 'S8', label: 'S8' },
  { id: 'S8_6_other', label: 'S8_6_other' },
  { id: 'S9_1', label: 'S9_1' },
  { id: 'Q1_1', label: 'Q1_1' },
  { id: 'Q1_2', label: 'Q1_2' },
  { id: 'Q1_3', label: 'Q1_3' },
  { id: 'Q1_4', label: 'Q1_4' },
  { id: 'Q1_5', label: 'Q1_5' },
  { id: 'Q1_6', label: 'Q1_6' },
  { id: 'Q1_7', label: 'Q1_7' },
  { id: 'Q1_8', label: 'Q1_8' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function moveItemUp<T>(arr: T[], index: number): T[] {
  if (index <= 0) return arr;

  const next = [...arr];
  [next[index - 1], next[index]] = [
    next[index]!,
    next[index - 1]!,
  ];

  return next;
}

function moveItemDown<T>(arr: T[], index: number): T[] {
  if (index >= arr.length - 1) return arr;

  const next = [...arr];
  [next[index], next[index + 1]] = [
    next[index + 1]!,
    next[index]!,
  ];

  return next;
}

// ── Component ─────────────────────────────────────────────────────────────────

const DataPlayground: React.FC<DataPlaygroundProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabId>('frequency');
  const [hasResults, setHasResults] = useState(false);
  const [showDownload, setShowDownload] = useState(false);

  // Frequency tab state
  const [selectedVars, setSelectedVars] = useState<Variable[]>([]);

  // Cross tabs state
  const [bannerVars, setBannerVars] = useState<Variable[]>([]);
  const [mainVars, setMainVars] = useState<Variable[]>([]);

  const [downloadOptions, setDownloadOptions] = useState<DownloadOptions>({
    sheets: 'all',
    direction: 'col',
    display: 'both',
    toc: true,
  });

  // ── Tab change ────────────────────────────────────────────────────────────

  const handleTabChange = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
    setHasResults(false);
    setShowDownload(false);
  }, []);

  // ── Frequency handlers ────────────────────────────────────────────────────

  const handleFreqVarToggle = useCallback((variable: Variable) => {
    setHasResults(false);
    setSelectedVars((prev) => {
      const exists = prev.find((v) => v.id === variable.id);
      if (exists) return prev.filter((v) => v.id !== variable.id);
      return [...prev, variable];
    });
  }, []);

  const handleFreqVarRemove = useCallback((varId: string) => {
    setHasResults(false);
    setSelectedVars((prev) => prev.filter((v) => v.id !== varId));
  }, []);

  const handleFreqClearAll = useCallback(() => {
    setHasResults(false);
    setSelectedVars([]);
  }, []);

  const handleFreqSelectAll = useCallback(() => {
    setSelectedVars([...ALL_VARIABLES]);
    setHasResults(false);
  }, []);

  const handleFreqMoveUp = useCallback((index: number) => {
    setSelectedVars((prev) => moveItemUp(prev, index));
  }, []);

  const handleFreqMoveDown = useCallback((index: number) => {
    setSelectedVars((prev) => moveItemDown(prev, index));
  }, []);

  // ── Cross tab handlers ────────────────────────────────────────────────────

  const handleCrossAddToBanner = useCallback((v: Variable) => {
    setHasResults(false);
    setBannerVars((prev) => (prev.find((x) => x.id === v.id) ? prev : [...prev, v]));
  }, []);

  const handleCrossAddToMain = useCallback((v: Variable) => {
    setHasResults(false);
    setMainVars((prev) => (prev.find((x) => x.id === v.id) ? prev : [...prev, v]));
  }, []);

  const handleBannerRemove = useCallback((id: string) => {
    setHasResults(false);
    setBannerVars((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const handleMainRemove = useCallback((id: string) => {
    setHasResults(false);
    setMainVars((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const handleBannerMoveUp = useCallback((index: number) => {
    setBannerVars((prev) => moveItemUp(prev, index));
  }, []);

  const handleBannerMoveDown = useCallback((index: number) => {
    setBannerVars((prev) => moveItemDown(prev, index));
  }, []);

  const handleMainMoveUp = useCallback((index: number) => {
    setMainVars((prev) => moveItemUp(prev, index));
  }, []);

  const handleMainMoveDown = useCallback((index: number) => {
    setMainVars((prev) => moveItemDown(prev, index));
  }, []);

  // ── Run ───────────────────────────────────────────────────────────────────

  const handleRun = useCallback(() => {
    setHasResults(true);
  }, []);

  const getRunLabel = (): string => {
    switch (activeTab) {
      case 'frequency': return 'Run Frequency';
      case 'crosstabs': return 'Run Cross Tab';
      default: return 'Run';
    }
  };

  const isRunEnabled = (): boolean => {
    if (activeTab === 'frequency') return selectedVars.length > 0;
    if (activeTab === 'crosstabs') return bannerVars.length > 0 && mainVars.length > 0;
    return true;
  };

  const showRunBtn = RUN_TABS.has(activeTab);
  const showUploadBtn = UPLOAD_TABS.has(activeTab);

  // Footer download button: label differs for the report vs raw-data tabs,
  // and Coded/Labelled Data show it unconditionally since there's no "Run"
  // step gating their content.
  const showDownloadBtn =
    ALWAYS_DOWNLOAD_TABS.has(activeTab) ||
    activeTab === 'chart' ||
    activeTab === 'insights' ||
    (hasResults && (activeTab === 'frequency' || activeTab === 'crosstabs'));

  const getDownloadLabel = (): string => {
    if (activeTab === 'insights') return 'Download Report';
    if (activeTab === 'coded' || activeTab === 'labelled') return 'Download Data';
    return 'Download Data';
  };

  // ── Render tab content ────────────────────────────────────────────────────

  const renderTabContent = () => {
    switch (activeTab) {
      case 'frequency':
        return (
          <FrequencyTable
            allVariables={ALL_VARIABLES}
            selectedVars={selectedVars}
            hasResults={hasResults}
            onVarToggle={handleFreqVarToggle}
            onVarRemove={handleFreqVarRemove}
            onClearAll={handleFreqClearAll}
            onSelectAll={handleFreqSelectAll}
            onMoveUp={handleFreqMoveUp}
            onMoveDown={handleFreqMoveDown}
          />
        );
      case 'crosstabs':
        return (
          <CrossTabs
            allVariables={ALL_VARIABLES}
            bannerVars={bannerVars}
            mainVars={mainVars}
            hasResults={hasResults}
            onAddToBanner={handleCrossAddToBanner}
            onAddToMain={handleCrossAddToMain}
            onBannerRemove={handleBannerRemove}
            onMainRemove={handleMainRemove}
            onBannerMoveUp={handleBannerMoveUp}
            onBannerMoveDown={handleBannerMoveDown}
            onMainMoveUp={handleMainMoveUp}
            onMainMoveDown={handleMainMoveDown}
          />
        );
      case 'chart':
        return <ChartVisuals allVariables={ALL_VARIABLES} />;
      case 'insights':
        return <InsightsSummary />;
      case 'coded':
        return <CodedData />;
      case 'labelled':
        return <LabelledData />;
      default:
        return null;
    }
  };

  return (
    <div className="dp-overlay">
      <div className="dp-modal">

        {/* ── Header ── */}
        <div className="dp-header">
          <div className="dp-header-left">
            <h2 className="dp-header-title">Data Playground</h2>
            <p className="dp-header-subtitle">
              Slice, filter, and explore your data dynamically to test hypotheses and uncover patterns
            </p>
          </div>
          <div className="dp-header-right">
            {showUploadBtn && (
              <button className="dp-upload-btn">
                <span className="dp-upload-icon">⤒</span>
                Upload Data
              </button>
            )}
            <button className="dp-close-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="dp-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`dp-tab${activeTab === tab.id ? ' dp-tab--active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="dp-body">{renderTabContent()}</div>

        {/* ── Footer ── */}
        <div className="dp-footer">
          <div className="dp-footer-left">
            {showDownloadBtn && (
              <button
                className="dp-download-btn"
                onClick={() => setShowDownload(true)}
              >
                <span className="dp-download-icon">⬇</span>
                {getDownloadLabel()}
              </button>
            )}
          </div>
          {showRunBtn && (
            <button
              className="dp-run-btn"
              onClick={handleRun}
              disabled={!isRunEnabled()}
            >
              {getRunLabel()}
              <span className="dp-run-arrow">→</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Download Modal ── */}
      {showDownload && (
        <DownloadModal
          options={downloadOptions}
          onChange={setDownloadOptions}
          onClose={() => setShowDownload(false)}
          onDownload={() => {
            // TODO: wire actual download logic
            setShowDownload(false);
          }}
        />
      )}
    </div>
  );
};

export default DataPlayground;