import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import './DataPlayground.css';
import FrequencyTable from './tabs/FrequencyTable';
import CrossTabs from './tabs/CrossTabs';
import ChartVisuals from './tabs/ChartVisuals';
import InsightsSummary from './tabs/InsightsSummary';
import CodedData from './tabs/CodedData';
import LabelledData from './tabs/LabelledData';
import DownloadModal from './DownloadModal';
import {
  useDatasetsList,
  useDatasetVariables,
  useUploadDataset,
  useRunFrequency,
  useRunCrosstab,
} from '../../../../../../hooks/useDataPlaygroundQueries';
import { extractErrorMessage } from '../../../../../../services/dataPlaygroundService';
import type { FrequencyResult, CrosstabTable } from '../../../../../../services/dataPlaygroundService';

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
  workspaceId?: string;
  explorationId?: string;
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

const ACCEPTED_FILE_TYPES = '.csv,.xlsx';

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

/** Move the item at `from` to sit at index `to`, shifting the rest. */
function reorderItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

// ── Component ─────────────────────────────────────────────────────────────────

const DataPlayground: React.FC<DataPlaygroundProps> = ({ workspaceId, explorationId, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabId>('frequency');
  const [hasResults, setHasResults] = useState(false);
  const [showDownload, setShowDownload] = useState(false);

  // ── Dataset context ───────────────────────────────────────────────────────
  // The Data Playground works against one active dataset per exploration:
  // whatever was most recently uploaded. On open, we auto-select the latest
  // existing dataset (if any) so returning users don't have to re-upload.

  const [datasetId, setDatasetId] = useState<string | null>(null);
  const datasetsQuery = useDatasetsList(workspaceId, explorationId);
  const variablesQuery = useDatasetVariables(workspaceId, explorationId, datasetId);
  const uploadMutation = useUploadDataset(workspaceId, explorationId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (datasetId || !datasetsQuery.data?.length) return;
    setDatasetId(datasetsQuery.data[0]!.dataset_id);
  }, [datasetsQuery.data, datasetId]);

  const allVariables: Variable[] = useMemo(
    () => (variablesQuery.data ?? []).map((v) => ({ id: v.variable_name, label: v.display_name })),
    [variablesQuery.data]
  );

  // Frequency tab state
  const [selectedVars, setSelectedVars] = useState<Variable[]>([]);
  const [frequencyResults, setFrequencyResults] = useState<FrequencyResult[] | null>(null);

  // Cross tabs state
  const [bannerVars, setBannerVars] = useState<Variable[]>([]);
  const [mainVars, setMainVars] = useState<Variable[]>([]);
  const [crosstabTables, setCrosstabTables] = useState<CrosstabTable[] | null>(null);

  const runFrequencyMutation = useRunFrequency();
  const runCrosstabMutation = useRunCrosstab();

  const [downloadOptions, setDownloadOptions] = useState<DownloadOptions>({
    sheets: 'all',
    direction: 'col',
    display: 'both',
    toc: true,
  });

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // allow re-selecting the same file later
      if (!file) return;

      try {
        const dataset = await uploadMutation.mutateAsync(file);
        setDatasetId(dataset.dataset_id);
        // Previous selections referenced the old dataset's variables.
        setSelectedVars([]);
        setBannerVars([]);
        setMainVars([]);
        setFrequencyResults(null);
        setCrosstabTables(null);
        setHasResults(false);
        toast.success(`"${file.name}" uploaded — ${dataset.rows} rows, ${dataset.columns} variables`);
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Failed to upload dataset'));
      }
    },
    [uploadMutation]
  );

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
    setSelectedVars([...allVariables]);
    setHasResults(false);
  }, [allVariables]);

  const handleFreqMoveUp = useCallback((index: number) => {
    setSelectedVars((prev) => moveItemUp(prev, index));
  }, []);

  const handleFreqMoveDown = useCallback((index: number) => {
    setSelectedVars((prev) => moveItemDown(prev, index));
  }, []);

  const handleFreqReorder = useCallback((from: number, to: number) => {
    setSelectedVars((prev) => reorderItem(prev, from, to));
  }, []);

  const handleFreqVarAdd = useCallback((variable: Variable) => {
    setHasResults(false);
    setSelectedVars((prev) => (prev.find((v) => v.id === variable.id) ? prev : [...prev, variable]));
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

  const handleRun = useCallback(async () => {
    if (!datasetId) return;

    if (activeTab === 'frequency') {
      try {
        const results = await runFrequencyMutation.mutateAsync({
          workspaceId,
          explorationId,
          datasetId,
          variables: selectedVars.map((v) => v.id),
        });
        setFrequencyResults(results);
        setHasResults(true);
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Failed to run frequency table'));
      }
      return;
    }

    if (activeTab === 'crosstabs') {
      try {
        const tables = await runCrosstabMutation.mutateAsync({
          workspaceId,
          explorationId,
          datasetId,
          bannerVariables: bannerVars.map((v) => v.id),
          mainVariables: mainVars.map((v) => v.id),
        });
        setCrosstabTables(tables);
        setHasResults(true);
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Failed to run cross tab'));
      }
    }
  }, [
    activeTab, datasetId, workspaceId, explorationId,
    selectedVars, bannerVars, mainVars,
    runFrequencyMutation, runCrosstabMutation,
  ]);

  const getRunLabel = (): string => {
    if (activeTab === 'frequency') return runFrequencyMutation.isPending ? 'Running...' : 'Run Frequency';
    if (activeTab === 'crosstabs') return runCrosstabMutation.isPending ? 'Running...' : 'Run Cross Tab';
    return 'Run';
  };

  const isRunEnabled = (): boolean => {
    if (!datasetId) return false;
    if (activeTab === 'frequency') return selectedVars.length > 0 && !runFrequencyMutation.isPending;
    if (activeTab === 'crosstabs') {
      return bannerVars.length > 0 && mainVars.length > 0 && !runCrosstabMutation.isPending;
    }
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
            allVariables={allVariables}
            selectedVars={selectedVars}
            hasResults={hasResults}
            results={frequencyResults}
            isRunning={runFrequencyMutation.isPending}
            hasDataset={!!datasetId}
            onVarToggle={handleFreqVarToggle}
            onVarAdd={handleFreqVarAdd}
            onVarRemove={handleFreqVarRemove}
            onClearAll={handleFreqClearAll}
            onSelectAll={handleFreqSelectAll}
            onMoveUp={handleFreqMoveUp}
            onMoveDown={handleFreqMoveDown}
            onReorder={handleFreqReorder}
          />
        );
      case 'crosstabs':
        return (
          <CrossTabs
            allVariables={allVariables}
            bannerVars={bannerVars}
            mainVars={mainVars}
            hasResults={hasResults}
            tables={crosstabTables}
            isRunning={runCrosstabMutation.isPending}
            hasDataset={!!datasetId}
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
        return (
          <ChartVisuals
            allVariables={allVariables}
            workspaceId={workspaceId}
            explorationId={explorationId}
            datasetId={datasetId}
          />
        );
      case 'insights':
        return (
          <InsightsSummary
            workspaceId={workspaceId}
            explorationId={explorationId}
            datasetId={datasetId}
            active={activeTab === 'insights'}
          />
        );
      case 'coded':
        return (
          <CodedData
            workspaceId={workspaceId}
            explorationId={explorationId}
            datasetId={datasetId}
            active={activeTab === 'coded'}
          />
        );
      case 'labelled':
        return (
          <LabelledData
            workspaceId={workspaceId}
            explorationId={explorationId}
            datasetId={datasetId}
            active={activeTab === 'labelled'}
          />
        );
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
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  style={{ display: 'none' }}
                  onChange={handleFileSelected}
                />
                <button
                  className="dp-upload-btn"
                  onClick={handleUploadClick}
                  disabled={uploadMutation.isPending}
                >
                  <span className="dp-upload-icon">⤒</span>
                  {uploadMutation.isPending ? 'Uploading...' : 'Upload Data'}
                </button>
              </>
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
            toast.info('Export is coming soon');
            setShowDownload(false);
          }}
        />
      )}
    </div>
  );
};

export default DataPlayground;
