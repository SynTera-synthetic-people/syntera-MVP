import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from "framer-motion";
import { TbArrowLeft, TbChevronRight, TbDownload, TbChartBar, TbUser, TbUsers, TbLoader, TbExternalLink } from "react-icons/tb";
import { useTheme } from "../../../../../../context/ThemeContext";
import logoForDark from "../../../../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../../../../assets/Logo_Light_bg.png";
import {
  useDownloadSurveyPdf,
  useSimulateSurvey,
  useGetSurveySimulationBySource,
  usePreviewSurvey,
  useDownloadQuantTranscripts,
  useDownloadQuantDecisionIntelligence,
  useDownloadQuantBehaviorArchaeology,
} from '../../../../../../hooks/useQuantitativeQueries';
import { downloadQuestionnaireCsvExport } from '../../../../../../services/quantitativeServices';
import { getAxiosErrorMessage } from '../../../../../../utils/axiosBlobError';
import PreviewModal from './components/PreviewModal'; // Import the separate modal
import { useOmniWorkflow } from '../../../../../../hooks/useOmiWorkflow';

const AccordionButton = ({ title, isActive, onClick, hasData = true }) => (
  <button
    onClick={onClick}
    className={`w-full flex justify-between items-center p-4 text-left rounded-xl mb-3 transition-all duration-200 border ${isActive
      ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30'
      : `bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 ${!hasData ? 'opacity-50' : ''}`
      }`}
  >
    <span className="font-semibold">{title}</span>
    <TbChevronRight
      className={`w-5 h-5 transform transition-transform duration-200 ${isActive ? 'rotate-90' : ''}`}
    />
  </button>
);

const InsightCard = ({ title, points, implications, chartData, loading = false }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-gray-50/80 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-6 mb-6"
  >
    <h4 className="text-xl font-bold text-gray-900 dark:text-blue-400 mb-6">{title}</h4>

    {loading ? (
      <div className="flex items-center justify-center py-10">
        <TbLoader className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading data...</span>
      </div>
    ) : (
      <>
        {chartData && chartData.length > 0 && (
          <div className="mb-6">
            <div className="bg-white dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-white/10">
              <div className="space-y-4">
                {chartData.map((item, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{item.option}</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">{item.percentage || `${item.pct}%`}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full"
                        style={{ width: `${item.pct || parseFloat(item.percentage)}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {item.count} participants
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {points && points.length > 0 && (
          <div className="mb-8">
            <h5 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Key Findings</h5>
            <ul className="space-y-3">
              {points.map((point, index) => (
                <li key={index} className="flex items-start text-gray-700 dark:text-gray-200">
                  <span className="inline-block w-2 h-2 mt-2 mr-3 bg-blue-500 rounded-full flex-shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {implications && implications.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-500/10 rounded-lg p-5 border border-blue-100 dark:border-blue-500/20">
            <h5 className="flex items-center gap-2 font-semibold text-blue-800 dark:text-blue-300 mb-3">
              <span className="text-lg">💡</span> Strategic Implications
            </h5>
            <div className="space-y-3">
              {implications.map((imp, index) => (
                <p key={index} className="flex items-start text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                  <span className="mr-2 text-blue-500">•</span>
                  <span dangerouslySetInnerHTML={{ __html: imp }} />
                </p>
              ))}
            </div>
          </div>
        )}
      </>
    )}
  </motion.div>
);

const SurveyResults = () => {
  const [activeItem, setActiveItem] = useState('Summary');
  const [surveyConfig, setSurveyConfig] = useState(null);
  const [surveyResults, setSurveyResults] = useState(null);
  const [processedSections, setProcessedSections] = useState({});
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [questionnaireCsvDownloading, setQuestionnaireCsvDownloading] = useState(false);
  // Track whether we've already attempted to load/run the simulation for the
  // current simulationId so we never fire it twice in the same mount cycle.
  const simulationAttemptedRef = useRef(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { workspaceId, objectiveId } = useParams();
  const location = useLocation();
  const { theme } = useTheme();
  const { trigger } = useOmniWorkflow();

  const explorationId = objectiveId;

  // The population simulation ID coming from navigation state
  const populationSimulationId = location.state?.surveyConfig?.simulationId ?? null;
  // True when the user edited the questionnaire — bypass cached results and force a fresh run.
  // Reads from both navigation state (normal flow) and sessionStorage (survives page refresh).
  const forceRerun =
    location.state?.forceRerun === true ||
    sessionStorage.getItem(`forceRerun_${explorationId}`) === 'true';

  // Try to load an already-completed survey simulation from the server first.
  // Disabled when forceRerun=true so we skip the cache check and go straight to simulation.
  const {
    data: existingSimData,
    isLoading: existingSimLoading,
    isFetched: existingSimFetched,
  } = useGetSurveySimulationBySource(
    forceRerun ? null : workspaceId,
    forceRerun ? null : explorationId,
    forceRerun ? null : populationSimulationId,
  );

  const simulateSurveyMutation = useSimulateSurvey();
  const downloadSurveyPdfMutation = useDownloadSurveyPdf();
  const previewSurveyMutation = usePreviewSurvey();
  const downloadTranscriptsMutation = useDownloadQuantTranscripts();
  const downloadDIMutation = useDownloadQuantDecisionIntelligence();
  const downloadBAMutation = useDownloadQuantBehaviorArchaeology();

  // Handle preview with TanStack Query
  const handlePreview = async () => {
    if (!surveyConfig) return;

    try {
      const result = await previewSurveyMutation.mutateAsync({
        workspaceId,
        explorationId: surveyConfig.explorationId,
        simulationId: surveyResults.id
      });

      if (result.status === 'success') {
        setPreviewData(result.data);
        setShowPreview(true);
      }
    } catch (error) {
      console.error("Failed to preview survey:", error);
      alert('Failed to load preview. Please try again.');
    }
  };

  // Handle download from preview modal
  const handleDownloadFromPreview = async () => {
    if (!surveyConfig || !surveyResults) return;

    try {
      await downloadSurveyPdfMutation.mutateAsync({
        workspaceId,
        explorationId: surveyConfig.explorationId,
        simulationId: surveyResults.id,
        personaName: surveyConfig.personaName
      });
    } catch (error) {
      console.error("Failed to download survey PDF:", error);
      const detail = await getAxiosErrorMessage(error, 'Unknown error');
      alert(`Failed to download survey report.\n\n${detail}`);
    }
  };

  // Handle download from main view
  const handleDownloadPdf = async () => {
    if (!surveyConfig || !surveyResults) return;

    try {
      await downloadSurveyPdfMutation.mutateAsync({
        workspaceId,
        explorationId: surveyConfig.explorationId,
        simulationId: surveyResults.id,
        personaName: surveyConfig.personaName
      });
    } catch (error) {
      console.error("Failed to download survey PDF:", error);
      const detail = await getAxiosErrorMessage(error, 'Unknown error');
      alert(`Failed to download survey report.\n\n${detail}`);
    }
  };

  const handleDownloadQuestionnaireCsv = async () => {
    if (!surveyConfig?.explorationId || !surveyConfig?.simulationId) return;
    try {
      setQuestionnaireCsvDownloading(true);
      await downloadQuestionnaireCsvExport({
        workspaceId,
        explorationId: surveyConfig.explorationId,
        simulationId: surveyConfig.simulationId,
        surveySimulationId: surveyResults?.id,
      });
    } catch (error) {
      console.error('Failed to download questionnaire CSV:', error);
      if (error.response?.status === 404) {
        alert('No stored questionnaire found for this simulation.');
      } else {
        const detail = await getAxiosErrorMessage(error, 'Could not download questionnaire CSV.');
        alert(detail);
      }
    } finally {
      setQuestionnaireCsvDownloading(false);
    }
  };

  const handleDownloadTranscripts = async () => {
    if (!surveyConfig || !surveyResults) return;
    try {
      await downloadTranscriptsMutation.mutateAsync({
        workspaceId,
        explorationId: surveyConfig.explorationId,
        simulationId: surveyResults.id,
      });
    } catch (error) {
      console.error('Failed to download transcripts CSV:', error);
      const detail = await getAxiosErrorMessage(error, 'Could not download transcripts.');
      alert(detail);
    }
  };

  const handleDownloadDI = async () => {
    if (!surveyConfig || !surveyResults) return;
    try {
      await downloadDIMutation.mutateAsync({
        workspaceId,
        explorationId: surveyConfig.explorationId,
        simulationId: surveyResults.id,
      });
    } catch (error) {
      console.error('Failed to download Decision Intelligence:', error);
      const detail = await getAxiosErrorMessage(error, 'Could not download Decision Intelligence.');
      alert(detail);
    }
  };

  const handleDownloadBA = async () => {
    if (!surveyConfig || !surveyResults) return;
    try {
      await downloadBAMutation.mutateAsync({
        workspaceId,
        explorationId: surveyConfig.explorationId,
        simulationId: surveyResults.id,
      });
    } catch (error) {
      console.error('Failed to download Behavior Archaeology:', error);
      const detail = await getAxiosErrorMessage(error, 'Could not download Behavior Archaeology.');
      alert(detail);
    }
  };

  // Step 1: Extract surveyConfig from navigation state and guard against missing config.
  useEffect(() => {
    if (location.state?.surveyConfig) {
      setSurveyConfig(location.state.surveyConfig);
    } else {
      navigate(
        `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/population-builder`,
        { replace: true }
      );
    }
  }, [location.state]);

  // Step 2: Once we know whether an existing simulation result is available,
  // either load it directly or run the simulation for the first time.
  // When forceRerun=true we skip the cache check entirely and run fresh.
  useEffect(() => {
    if (!surveyConfig) return;

    // Deduplicate: only act once per populationSimulationId per mount.
    if (simulationAttemptedRef.current === surveyConfig.simulationId) return;

    if (forceRerun) {
      // User edited the questionnaire — purge stale cache then run fresh.
      queryClient.removeQueries({
        queryKey: ['surveySimulationBySource', workspaceId, explorationId, surveyConfig.simulationId],
      });
      simulationAttemptedRef.current = surveyConfig.simulationId;
      triggerSurveySimulation(surveyConfig, true);
      return;
    }

    // Normal path: wait for the server cache check before deciding.
    if (!existingSimFetched) return;
    simulationAttemptedRef.current = surveyConfig.simulationId;

    if (existingSimData?.data) {
      // Restore from server — no AI call needed.
      setSurveyResults(existingSimData.data);
      processSurveyResults(existingSimData.data);
    } else {
      // No existing result — run simulation for the first time.
      triggerSurveySimulation(surveyConfig, false);
    }
  }, [surveyConfig, existingSimFetched, existingSimData, forceRerun]);

  // Run the actual AI simulation (only called when no existing result exists, or forceRerun=true).
  const triggerSurveySimulation = async (config, shouldForceRerun = false) => {
    try {
      const result = await simulateSurveyMutation.mutateAsync({
        workspaceId,
        explorationId: config.explorationId,
        personaId: config.personaIds,
        simulationId: config.simulationId,
        forceRerun: shouldForceRerun,
      });

      if (result.status === 'success') {
        setSurveyResults(result.data);
        sessionStorage.removeItem(`forceRerun_${explorationId}`);
        // Seed the cache so re-navigations find this result immediately
        // without making a redundant POST (backend guard is still a safety net).
        queryClient.setQueryData(
          ['surveySimulationBySource', workspaceId, explorationId, config.simulationId],
          result
        );
        trigger({
          stage: 'survey-success',
          event: 'SURVEY_SUCCESS',
          payload: {},
        });
        processSurveyResults(result.data);
      }
    } catch (error) {
      console.error('Error simulating survey:', error);
    }
  };

  // Process survey results into sections
  const processSurveyResults = (results) => {
    if (!results?.sections) return;

    const sections = {};

    // Add summary section
    if (results.narrative?.summary) {
      sections['Summary'] = {
        title: 'Survey Summary',
        implications: [results.narrative.summary]
      };
    }

    // Process each section
    results.sections.forEach((section, index) => {
      const sectionKey = section.title || `Section ${index + 1}`;
      sections[sectionKey] = section.questions.map(question => ({
        title: question.question,
        chartData: question.results || [],
        points: generatePointsFromResults(question.results),
        implications: generateImplicationsFromQuestion(question.question, question.results)
      }));
    });

    // Add demographics section
    if (surveyConfig) {
      sections['Demographics'] = [{
        title: 'Survey Configuration',
        points: [
          `Persona: ${surveyConfig.personaName}`,
          `Sample Size: ${surveyConfig.sampleSize} participants`,
          `Simulation ID: ${surveyConfig.simulationId}`,
          `Weighted Score: ${surveyConfig.simulationData?.weighted_score || 'N/A'}/100`
        ]
      }];
    }

    // Add detailed results section
    if (results.results) {
      const detailedQuestions = [];
      Object.entries(results.results).forEach(([question, data]) => {
        detailedQuestions.push({
          title: question,
          chartData: data.map(item => ({
            option: item.option,
            count: item.count,
            pct: item.pct,
            percentage: `${item.pct}%`
          }))
        });
      });
      sections['Detailed Results'] = detailedQuestions;
    }

    setProcessedSections(sections);

    // Set first section as active
    const firstSection = Object.keys(sections)[0];
    if (firstSection) {
      setActiveItem(firstSection);
    }
  };

  // Helper functions
  const generatePointsFromResults = (results) => {
    if (!results || !Array.isArray(results)) return [];

    return results.map(result =>
      `${result.option}: ${result.percentage || result.pct}% (${result.count} participants)`
    );
  };

  const generateImplicationsFromQuestion = (question, results) => {
    if (!results || !Array.isArray(results) || results.length === 0) return [];

    const topResult = results.reduce((max, curr) =>
      parseFloat(curr.percentage || curr.pct) > parseFloat(max.percentage || max.pct) ? curr : max
    );

    return [
      `The majority (${topResult.percentage || topResult.pct}) prefer <span class="font-semibold text-gray-900 dark:text-white">"${topResult.option}"</span>.`
    ];
  };

  const sidebarItems = Object.keys(processedSections);

  const renderContent = () => {
    const content = processedSections[activeItem];

    if (!content) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-6">
          {(existingSimLoading || simulateSurveyMutation.isPending) ? (
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full animate-pulse" />
                <TbLoader className="w-12 h-12 animate-spin text-blue-600 relative z-10" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Simulating Survey Results</h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm">
                Generating comprehensive insights from your selected persona and questionnaire...
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center text-gray-400 dark:text-gray-500">
              <TbChartBar className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg">No survey data available yet.</p>
            </div>
          )}
        </div>
      );
    }

    if (activeItem === 'Summary') {
      return <InsightCard {...content} loading={existingSimLoading || simulateSurveyMutation.isPending} />;
    }

    if (Array.isArray(content)) {
      return (
        <div className="space-y-4">
          {content.map((item, index) => (
            <InsightCard key={index} {...item} loading={existingSimLoading || simulateSurveyMutation.isPending} />
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="p-4 md:p-8 relative min-h-[calc(100vh-100px)] flex flex-col mb-16">
      <PreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        previewData={previewData}
        onDownload={handleDownloadFromPreview}
        isLoading={previewSurveyMutation.isPending}
        isDownloading={downloadSurveyPdfMutation.isPending}
        onDownloadTranscripts={handleDownloadTranscripts}
        onDownloadDI={handleDownloadDI}
        onDownloadBA={handleDownloadBA}
        isDownloadingTranscripts={downloadTranscriptsMutation.isPending}
        isDownloadingDI={downloadDIMutation.isPending}
        isDownloadingBA={downloadBAMutation.isPending}
      />



      <div className="max-w-7xl mx-auto relative z-10 w-full px-4">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
            <div className="flex items-start gap-5">
              <button
                onClick={() => navigate(-1)}
                className="mt-1 p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-all hover:scale-105 active:scale-95"
                title="Go Back"
              >
                <TbArrowLeft className="w-6 h-6" />
              </button>

              <div className="space-y-2">
                <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                  Survey Results
                </h1>

                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-gray-500 dark:text-gray-400 font-medium">
                    Detailed analysis and insights from your market research survey
                  </p>

                  {surveyConfig?.simulationData?.weighted_score && (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-bold">
                      <TbChartBar size={14} />
                      <span>Confidence Score: {surveyConfig.simulationData.weighted_score}/100</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              {surveyConfig && (
                <button
                  type="button"
                  onClick={handleDownloadQuestionnaireCsv}
                  disabled={questionnaireCsvDownloading}
                  className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-white dark:bg-white/5 border border-cyan-200 dark:border-cyan-500/30 text-cyan-800 dark:text-cyan-200 rounded-xl font-semibold hover:bg-cyan-50 dark:hover:bg-cyan-500/10 transition-all disabled:opacity-50"
                >
                  {questionnaireCsvDownloading ? (
                    <>
                      <TbLoader className="w-5 h-5 animate-spin" />
                      <span>Preparing CSV…</span>
                    </>
                  ) : (
                    <>
                      <TbDownload size={20} />
                      <span>Questionnaire CSV</span>
                    </>
                  )}
                </button>
              )}

              {surveyResults && (
                <button
                  onClick={handlePreview}
                  disabled={previewSurveyMutation.isPending}
                  className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 rounded-xl font-semibold hover:bg-gray-50 dark:hover:bg-white/10 transition-all disabled:opacity-50"
                >
                  {previewSurveyMutation.isPending ? (
                    <>
                      <TbLoader className="w-5 h-5 animate-spin" />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <>
                      <TbExternalLink size={20} />
                      <span>Preview Report</span>
                    </>
                  )}
                </button>
              )}

              <button
                onClick={() => {
                  if (surveyConfig) {
                    navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/rebuttal-mode`, {
                      state: {
                        personaId: surveyConfig.personaIds,
                        simulationId: surveyConfig.simulationId,
                        personaName: surveyConfig.personaNames,
                        sampleSize: surveyConfig.sampleSize,
                        surveyResults: surveyResults
                      }
                    });
                  }
                }}
                disabled={!surveyResults}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-8 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                <span>Proceed to Rebuttal</span>
                <TbChevronRight size={20} />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Main Content Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/80 dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden p-6 md:p-8 min-h-[600px]"
        >
          <div className="flex flex-col md:flex-row gap-8 h-full">
            {/* Sidebar */}
            <div className="w-full md:w-1/4 flex-shrink-0">
              <div className="sticky top-6 space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 px-2">
                  Survey Sections
                </h3>
                {sidebarItems.length > 0 ? (
                  sidebarItems.map(item => (
                    <AccordionButton
                      key={item}
                      title={item}
                      isActive={activeItem === item}
                      onClick={() => setActiveItem(item)}
                      hasData={!existingSimLoading && !simulateSurveyMutation.isPending}
                    />
                  ))
                ) : (
                  <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                    <TbLoader className="w-5 h-5 animate-spin mx-auto mb-2" />
                    <span className="text-xs">Loading sections...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="h-full">
                {renderContent()}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default SurveyResults;