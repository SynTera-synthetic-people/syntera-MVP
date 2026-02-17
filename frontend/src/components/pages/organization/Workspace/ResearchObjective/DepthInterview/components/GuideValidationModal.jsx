import React from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { TbAlertCircle, TbCheck, TbEdit } from "react-icons/tb";

const GuideValidationModal = ({
  show,
  reason,
  onContinue,
  onClose
}) => {
  if (!show) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[100] p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="bg-white dark:bg-[#1a1f2e] border-2 border-gray-300 dark:border-white/10 p-8 rounded-3xl shadow-2xl w-full max-w-2xl"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-red-100 dark:bg-red-500/10 rounded-xl">
              <TbAlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Thematic Alignment Issue
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                The proposed change may not align with your research objective.
              </p>
            </div>
          </div>

          <div className="p-4 bg-yellow-50 dark:bg-yellow-500/5 border border-yellow-200 dark:border-yellow-500/20 rounded-xl mb-8">
            <h4 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2 flex items-center gap-2">
              <TbEdit className="w-4 h-4" />
              Validation Feedback:
            </h4>
            <p className="text-yellow-700 dark:text-yellow-400 leading-relaxed">
              {reason || "The content does not significantly contribute to the research theme."}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-4">
            <button
              onClick={onClose}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
            >
              <TbEdit className="w-4 h-4" />
              Go Back & Edit
            </button>
            <button
              onClick={onContinue}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-[1.02] transition-all active:scale-95"
            >
              <TbCheck className="w-4 h-4" />
              Keep Anyway
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default GuideValidationModal;
