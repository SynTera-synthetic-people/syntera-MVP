import { useState } from 'react';
import { TbX, TbDownload, TbLoader, TbAlertCircle, TbFileText, TbRefresh, TbUsers, TbChartBar, TbChevronDown, TbChevronUp } from 'react-icons/tb';
import { motion, AnimatePresence } from 'framer-motion';
import PremiumButton from '../../../../../../common/PremiumButton';
import { useTheme } from '../../../../../../../context/ThemeContext';
import { useExportAllInterviewsPdf, useAllInterviewPreview } from '../../../../../../../hooks/useInterview';

const AllInterviewsPreviewModal = ({
  isOpen,
  onClose,
  workspaceId,
  explorationId,
  onDownload,
  exportAllInterviewsMutation: externalMutation
}) => {
  const { theme } = useTheme();
  const [expandedSections, setExpandedSections] = useState({});

  // Use the React Query hook for all interviews preview data
  const {
    data: previewData,
    isLoading,
    isError,
    error,
    refetch
  } = useAllInterviewPreview(workspaceId, explorationId, {
    enabled: isOpen && !!workspaceId && !!explorationId,
  });

  const localMutation = useExportAllInterviewsPdf(workspaceId, explorationId);
  const exportAllInterviewsMutation = externalMutation || localMutation;

  const handleDownload = async () => {
    if (onDownload) {
      try {
        await onDownload();
        onClose(); // Close only after successful download
      } catch (error) {
        console.error("Download failed:", error);
        // Keep modal open
      }
    } else {
      onClose();
    }
  };

  const handleRetry = () => {
    refetch();
  };

  const toggleSection = (sectionIndex) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionIndex]: !prev[sectionIndex]
    }));
  };

  const toggleQuestion = (sectionIndex, questionIndex) => {
    const key = `${sectionIndex}-${questionIndex}`;
    setExpandedSections(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Calculate insights summary
  const calculateInsights = () => {
    if (!previewData?.data?.sections) return null;

    let totalQuestions = 0;
    let totalResponses = 0;
    const sectionCounts = {};

    previewData.data.sections.forEach(section => {
      section.questions.forEach(question => {
        totalQuestions++;
        totalResponses += question.response_count || 0;
        sectionCounts[section.section] = (sectionCounts[section.section] || 0) + 1;
      });
    });

    return {
      totalQuestions,
      totalResponses,
      averageResponses: totalQuestions > 0 ? (totalResponses / totalQuestions).toFixed(1) : 0,
      sectionCounts
    };
  };

  const insights = calculateInsights();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-[900px] max-h-[90vh] overflow-hidden bg-white dark:bg-gray-900 rounded-2xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-500/20">
                <TbUsers className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  All Interviews Report Preview
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Aggregated insights from all interviews
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRetry}
                disabled={isLoading}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                title="Refresh preview"
              >
                <TbRefresh className={`w-5 h-5 text-gray-500 dark:text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <TbX className="w-6 h-6 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-180px)] p-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <TbLoader className="w-12 h-12 animate-spin text-purple-600 dark:text-purple-400 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">Loading aggregated preview...</p>
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-12">
                <TbAlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <p className="text-red-600 dark:text-red-400 mb-2">Failed to load preview</p>
                <p className="text-gray-500 dark:text-gray-400 text-center mb-4">
                  {error?.message || 'An error occurred while loading the preview'}
                </p>
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                >
                  <TbRefresh className="w-4 h-4" />
                  Retry
                </button>
              </div>
            ) : previewData?.data ? (
              <div className="space-y-6">
                {/* Overview Stats */}
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-500/5 dark:to-blue-500/5 rounded-xl p-6 border border-purple-100 dark:border-purple-500/20">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <TbChartBar className="w-5 h-5" />
                    Report Overview
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center border border-gray-200 dark:border-gray-700">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {previewData.data.total_interviews || 0}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total Interviews</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center border border-gray-200 dark:border-gray-700">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {insights?.totalQuestions || 0}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Questions Asked</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center border border-gray-200 dark:border-gray-700">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {insights?.totalResponses || 0}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total Responses</div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 text-center border border-gray-200 dark:border-gray-700">
                      <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                        {previewData.data.sections?.length || 0}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Analysis Sections</div>
                    </div>
                  </div>
                </div>

                {/* Sections */}
                {previewData.data.sections && previewData.data.sections.length > 0 ? (
                  <div className="space-y-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <TbFileText className="w-5 h-5" />
                      Interview Analysis by Section
                    </h3>

                    {previewData.data.sections.map((section, sectionIndex) => (
                      <div key={sectionIndex} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        {/* Section Header */}
                        <button
                          onClick={() => toggleSection(sectionIndex)}
                          className="w-full p-4 bg-gray-50 dark:bg-gray-700/50 text-left flex justify-between items-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center">
                              <span className="font-bold text-purple-600 dark:text-purple-400">
                                {sectionIndex + 1}
                              </span>
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900 dark:text-white">
                                {section.section}
                              </h4>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {section.questions?.length || 0} questions • {section.questions?.reduce((acc, q) => acc + (q.response_count || 0), 0) || 0} responses
                              </p>
                            </div>
                          </div>
                          {expandedSections[sectionIndex] ? (
                            <TbChevronUp className="w-5 h-5 text-gray-400" />
                          ) : (
                            <TbChevronDown className="w-5 h-5 text-gray-400" />
                          )}
                        </button>

                        {/* Section Content */}
                        <AnimatePresence>
                          {expandedSections[sectionIndex] && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="border-t border-gray-200 dark:border-gray-700"
                            >
                              <div className="p-4 space-y-4">
                                {section.questions.map((question, questionIndex) => (
                                  <div key={questionIndex} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                                    {/* Question Header */}
                                    <button
                                      onClick={() => toggleQuestion(sectionIndex, questionIndex)}
                                      className="w-full text-left flex justify-between items-start gap-3 mb-3"
                                    >
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/20 px-2 py-0.5 rounded">
                                            Q{questionIndex + 1}
                                          </span>
                                          <span className="text-sm text-gray-500 dark:text-gray-400">
                                            • {question.response_count || 0} responses
                                          </span>
                                        </div>
                                        <h5 className="font-medium text-gray-900 dark:text-white">
                                          {question.question}
                                        </h5>
                                        {question.summary && (
                                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            {question.summary}
                                          </p>
                                        )}
                                      </div>
                                      {expandedSections[`${sectionIndex}-${questionIndex}`] ? (
                                        <TbChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                      ) : (
                                        <TbChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                                      )}
                                    </button>

                                    {/* Answers Preview */}
                                    <AnimatePresence>
                                      {expandedSections[`${sectionIndex}-${questionIndex}`] && question.answers && (
                                        <motion.div
                                          initial={{ opacity: 0 }}
                                          animate={{ opacity: 1 }}
                                          exit={{ opacity: 0 }}
                                          className="mt-4 space-y-4"
                                        >
                                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Sample Responses ({Math.min(question.answers.length, 3)} of {question.answers.length}):
                                          </div>
                                          {question.answers.slice(0, 3).map((answer, answerIndex) => (
                                            <div key={answerIndex} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                              <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                  <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center">
                                                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
                                                      {answer.persona_name?.charAt(0) || 'P'}
                                                    </span>
                                                  </div>
                                                  <div>
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                      {answer.persona_name}
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                      {answer.persona_occupation} • {answer.persona_age}
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                              <p className="text-gray-700 dark:text-gray-300 text-sm mb-3">
                                                "{answer.answer}"
                                              </p>
                                              {answer.implications && answer.implications.length > 0 && (
                                                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                                                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                                    Implications:
                                                  </div>
                                                  <ul className="space-y-1">
                                                    {answer.implications.slice(0, 2).map((implication, impIndex) => (
                                                      <li key={impIndex} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1 flex-shrink-0"></span>
                                                        {implication}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                          {question.answers.length > 3 && (
                                            <div className="text-center py-2">
                                              <span className="text-sm text-gray-500 dark:text-gray-400">
                                                + {question.answers.length - 3} more responses
                                              </span>
                                            </div>
                                          )}
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <TbAlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">No interview sections available yet</p>
                  </div>
                )}

                {/* Key Insights Summary */}
                {previewData.data.sections && previewData.data.sections.length > 0 && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-500/5 dark:to-emerald-500/5 rounded-xl p-6 border border-green-100 dark:border-green-500/20">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                      <TbChartBar className="w-5 h-5" />
                      Key Insights Summary
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Response Distribution</h4>
                        <div className="space-y-3">
                          {Object.entries(insights?.sectionCounts || {}).map(([section, count]) => (
                            <div key={section} className="flex items-center justify-between">
                              <span className="text-sm text-gray-600 dark:text-gray-300 truncate">{section}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-green-500 rounded-full"
                                    style={{ width: `${(count / (insights?.totalQuestions || 1)) * 100}%` }}
                                  />
                                </div>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-8 text-right">
                                  {count}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Response Metrics</h4>
                        <div className="space-y-4">
                          <div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">Average Responses per Question</div>
                            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                              {insights?.averageResponses}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">Response Coverage</div>
                            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                              {((insights?.totalResponses || 0) / (insights?.totalQuestions || 1) / (previewData.data.total_interviews || 1) * 100).toFixed(0)}%
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              Questions answered across all interviews
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <TbAlertCircle className="w-12 h-12 text-yellow-500 mb-4" />
                <p className="text-gray-500 dark:text-gray-400 mb-2">No aggregated data available</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center mb-4">
                  The all-interviews preview is not available yet or interviews are still in progress.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50/50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {previewData?.data ? 'Ready to download the full aggregated report?' : 'Preview the aggregated insights before downloading'}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Close
                </button>
                <PremiumButton
                  onClick={handleDownload}
                  variant="primary"
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700"
                  disabled={!previewData?.data || exportAllInterviewsMutation?.isPending}
                >
                  {exportAllInterviewsMutation?.isPending ? (
                    <>
                      <TbLoader className="w-4 h-4 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <TbDownload className="w-4 h-4" />
                      Download All Interviews Report
                    </>
                  )}
                </PremiumButton>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AllInterviewsPreviewModal;