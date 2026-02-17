import { useState, useEffect } from 'react';
import { TbX, TbDownload, TbLoader, TbAlertCircle, TbFileText, TbRefresh, TbMessageCircle } from 'react-icons/tb';
import { motion, AnimatePresence } from 'framer-motion';
import ReactDOM from 'react-dom'; // Add this import
import PremiumButton from '../../../../../../common/PremiumButton';
import { useTheme } from '../../../../../../../context/ThemeContext';
import { useExportInterviewReport, useInterviewPreview } from '../../../../../../../hooks/useInterview';

const PreviewReportModal = ({
  isOpen,
  onClose,
  workspaceId,
  explorationId,
  interviewId,
  personaName,
  onDownload,
  exportInterviewReportMutation: externalMutation // Rename to avoid conflict with local
}) => {
  const { theme } = useTheme();

  // Use the React Query hook for preview data
  const {
    data: previewData,
    isLoading,
    isError,
    error,
    refetch
  } = useInterviewPreview(workspaceId, explorationId, interviewId, {
    enabled: isOpen && !!workspaceId && !!explorationId && !!interviewId,
  });

  const localMutation = useExportInterviewReport(workspaceId, explorationId);
  const exportInterviewReportMutation = externalMutation || localMutation;

  const handleDownload = async () => {
    if (onDownload) {
      try {
        await onDownload();
        onClose(); // Close only after successful download
      } catch (error) {
        console.error("Download failed:", error);
        // Keep modal open so user can see error or retry
      }
    } else {
      onClose();
    }
  };

  const handleRetry = () => {
    refetch();
  };

  // Helper function to safely render data
  const renderData = (data) => {
    if (typeof data === 'string') {
      return <p>{data}</p>;
    }
    if (Array.isArray(data)) {
      return (
        <ul className="space-y-2">
          {data.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 flex-shrink-0"></span>
              <span>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
            </li>
          ))}
        </ul>
      );
    }
    if (typeof data === 'object' && data !== null) {
      return (
        <pre className="text-sm whitespace-pre-wrap bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      );
    }
    return <p>{String(data)}</p>;
  };

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Use portal to render at root level (same as working PreviewModal)
  return ReactDOM.createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-[900px] max-h-[90vh] overflow-hidden bg-white dark:bg-gray-900 rounded-2xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-500/20">
                <TbFileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 id="modal-title" className="text-xl font-bold text-gray-900 dark:text-white">
                  Report Preview
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {personaName} • Interview Analysis
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRetry}
                disabled={isLoading}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                title="Refresh preview"
                aria-label="Refresh preview"
              >
                <TbRefresh className={`w-5 h-5 text-gray-500 dark:text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close modal"
              >
                <TbX className="w-6 h-6 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-180px)] p-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <TbLoader className="w-12 h-12 animate-spin text-blue-600 dark:text-blue-400 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">Loading preview...</p>
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <TbRefresh className="w-4 h-4" />
                  Retry
                </button>
              </div>
            ) : previewData?.data ? (
              <div className="space-y-6">
                {/* Interview Details */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <TbFileText className="w-5 h-5" />
                    Interview Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Interview ID</p>
                      <p className="font-mono text-sm text-gray-700 dark:text-gray-300">
                        {previewData.data.interview_id}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Created</p>
                      <p className="text-gray-700 dark:text-gray-300">
                        {new Date(previewData.data.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Total Messages</p>
                      <p className="text-gray-700 dark:text-gray-300">
                        {previewData.data.message_count} messages
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Conversation Exchanges</p>
                      <p className="text-gray-700 dark:text-gray-300">
                        {previewData.data.conversation_summary?.total_exchanges || 0} exchanges
                      </p>
                    </div>
                  </div>
                </div>

                {/* Persona Information */}
                {previewData.data.persona && (
                  <div className="bg-blue-50/50 dark:bg-blue-500/5 rounded-xl p-5 border border-blue-100 dark:border-blue-500/20">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Persona Profile
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Name</p>
                        <p className="text-gray-700 dark:text-gray-300 font-medium">
                          {previewData.data.persona.name}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Age Range</p>
                        <p className="text-gray-700 dark:text-gray-300">
                          {previewData.data.persona.age_range}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Occupation</p>
                        <p className="text-gray-700 dark:text-gray-300">
                          {previewData.data.persona.occupation}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Conversation Summary */}
                {previewData.data.conversation_summary && (
                  <div className="bg-green-50/50 dark:bg-green-500/5 rounded-xl p-5 border border-green-100 dark:border-green-500/20">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      Conversation Summary
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700 dark:text-gray-300">Total Exchanges:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {previewData.data.conversation_summary.total_exchanges}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700 dark:text-gray-300">Persona Responses:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {previewData.data.conversation_summary.persona_responses}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sample Messages Preview */}
                {previewData.data.messages && Array.isArray(previewData.data.messages) && (
                  <div className="bg-purple-50/50 dark:bg-purple-500/5 rounded-xl p-5 border border-purple-100 dark:border-purple-500/20">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <TbMessageCircle className="w-5 h-5" />
                      Conversation Preview
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                      Showing {previewData.data.messages.length} messages
                    </p>
                    <div className="space-y-4 max-h-60 overflow-y-auto">
                      {previewData.data.messages.map((message, index) => (
                        <div
                          key={index}
                          className={`p-3 rounded-lg ${message.role === 'persona'
                            ? 'bg-purple-100 dark:bg-purple-500/10 border-l-4 border-purple-500'
                            : message.role === 'user'
                              ? 'bg-blue-100 dark:bg-blue-500/10 border-l-4 border-blue-500'
                              : 'bg-gray-100 dark:bg-gray-800 border-l-4 border-gray-500'
                            }`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${message.role === 'persona'
                              ? 'bg-purple-200 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300'
                              : message.role === 'user'
                                ? 'bg-blue-200 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                              }`}>
                              {message.role === 'persona' ? 'Persona' : message.role === 'user' ? 'Interviewer' : 'System'}
                            </span>
                            {message.meta?.section && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {message.meta.section}
                              </span>
                            )}
                          </div>
                          <p className="text-gray-700 dark:text-gray-300 text-sm">
                            {message.text || <span className="italic text-gray-500">No response yet</span>}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Additional Data Sections - Safely render all other data */}
                <div className="space-y-4">
                  {Object.entries(previewData.data)
                    .filter(([key]) => !['interview_id', 'workspace_id', 'exploration_id', 'created_at', 'persona', 'messages', 'message_count', 'conversation_summary'].includes(key))
                    .map(([key, value], index) => (
                      <div key={index} className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 capitalize">
                          {key.replace(/_/g, ' ')}
                        </h3>
                        <div className="text-gray-700 dark:text-gray-300">
                          {renderData(value)}
                        </div>
                      </div>
                    ))}
                </div>

                {/* Fallback if no specific sections */}
                {Object.keys(previewData.data).length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <TbAlertCircle className="w-12 h-12 text-yellow-500 mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">Preview data loaded but appears empty</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <TbAlertCircle className="w-12 h-12 text-yellow-500 mb-4" />
                <p className="text-gray-500 dark:text-gray-400 mb-2">No preview data available</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center mb-4">
                  The report preview is not available yet or the interview is still in progress.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50/50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {previewData?.data ? 'Ready to download the full report?' : 'Preview the report before downloading'}
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
                  className="flex items-center gap-2"
                  disabled={!previewData?.data || exportInterviewReportMutation?.isPending}
                >
                  {exportInterviewReportMutation?.isPending ? (
                    <>
                      <TbLoader className="w-4 h-4 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <TbDownload className="w-4 h-4" />
                      Download Full Report
                    </>
                  )}
                </PremiumButton>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body // Render directly to body
  );
};

export default PreviewReportModal;