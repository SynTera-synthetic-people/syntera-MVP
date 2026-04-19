import { motion } from "framer-motion";
import { TbDownload, TbLoader, TbX, TbChevronRight } from "react-icons/tb";
import ReactDOM from 'react-dom';

const toText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.label === 'string') return value.label;
    if (typeof value.value === 'string' || typeof value.value === 'number' || typeof value.value === 'boolean') {
      return String(value.value);
    }
  }
  return '';
};

const PreviewModal = ({
  isOpen,
  onClose,
  previewData,
  onDownload,        // legacy — kept for backward compat
  isLoading = false,
  isDownloading = false,
  onDownloadTranscripts,
  onDownloadDI,
  onDownloadBA,
  isDownloadingTranscripts = false,
  isDownloadingDI = false,
  isDownloadingBA = false,
}) => {
  if (!isOpen) return null;

  // Use portal to render at root level
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="sticky top-0 flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Survey Preview</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Review your survey results before downloading
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Transcripts CSV */}
            <button
              onClick={onDownloadTranscripts || onDownload}
              disabled={isDownloadingTranscripts || isDownloading}
              className="flex items-center gap-2 px-3 py-2 border border-cyan-500 text-cyan-600 dark:text-cyan-400 rounded-lg font-medium text-sm hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDownloadingTranscripts ? (
                <><TbLoader className="w-4 h-4 animate-spin" /><span>CSV…</span></>
              ) : (
                <><TbDownload size={16} /><span>Transcripts</span></>
              )}
            </button>
            {/* Decision Intelligence */}
            <button
              onClick={onDownloadDI}
              disabled={isDownloadingDI}
              className="flex items-center gap-2 px-3 py-2 border border-blue-500 text-blue-600 dark:text-blue-400 rounded-lg font-medium text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDownloadingDI ? (
                <><TbLoader className="w-4 h-4 animate-spin" /><span>Generating…</span></>
              ) : (
                <><TbDownload size={16} /><span>Decision Intelligence</span></>
              )}
            </button>
            {/* Behavior Archaeology */}
            <button
              onClick={onDownloadBA}
              disabled={isDownloadingBA}
              className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg font-medium text-sm hover:bg-purple-700 transition-colors shadow-lg shadow-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDownloadingBA ? (
                <><TbLoader className="w-4 h-4 animate-spin" /><span>Generating…</span></>
              ) : (
                <><TbDownload size={16} /><span>Behavior Archaeology</span></>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Close preview"
            >
              <TbX size={24} />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <TbLoader className="w-8 h-8 animate-spin text-blue-600" />
              <span className="ml-3 text-gray-600 dark:text-gray-400">Loading preview...</span>
            </div>
          ) : previewData ? (
            <div className="space-y-6">
              {/* Preview Content - You can customize this based on your preview data */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  Preview Generated Successfully
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Simulation ID</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {previewData.simulation_id || 'N/A'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Sample Size</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {previewData.total_sample_size || 0} participants
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Research Objective</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {previewData.research_objective || 'N/A'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Personas</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {previewData.personas?.length || 0} personas
                    </p>
                  </div>
                </div>
              </div>

              {/* Preview of sections with data */}
              {previewData.sections?.slice(0, 3).map((section, index) => (
                <div key={index} className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
	                  <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
	                    {toText(section.title).trim() || 'Untitled Section'}
	                  </h4>
	                  <div className="space-y-4">
	                    {section.questions?.slice(0, 2).map((question, qIndex) => (
	                      <div key={qIndex} className="space-y-3">
	                        <p className="font-medium text-gray-900 dark:text-white">
	                          {toText(question.question)}
	                        </p>
	                        {question.results?.length > 0 && (
	                          <div className="space-y-2">
	                            {question.results.slice(0, 3).map((result, rIndex) => (
	                              <div key={rIndex} className="flex justify-between items-center">
	                                <span className="text-sm text-gray-600 dark:text-gray-300">
	                                  {toText(result.option)}
	                                </span>
                                <span className="font-medium text-blue-600 dark:text-blue-400">
                                  {result.percentage || `${result.pct}%`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Narrative Summary */}
              {previewData.narrative?.summary && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
                  <h4 className="text-lg font-semibold text-blue-800 dark:text-blue-300 mb-3">
                    Summary
                  </h4>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {previewData.narrative.summary}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-20">
              <p className="text-gray-600 dark:text-gray-400">No preview data available</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

export default PreviewModal;
