import React from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { TbAlertCircle } from "react-icons/tb";

const ValidationModal = ({
  show,
  validationError,
  onContinue,
  onClose
}) => {
  if (!show) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
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
                {validationError?.group === 'demographics' ? 'Demographic Validation Issues' : 'Trait Validation Issues'}
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Some {validationError?.group} traits need attention before proceeding to {validationError?.toTab}
              </p>
            </div>
          </div>

          {validationError?.total_response && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-500/5 border border-yellow-200 dark:border-yellow-500/20 rounded-xl mb-6">
              <h4 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
                Summary:
              </h4>
              <p className="text-yellow-700 dark:text-yellow-400">
                {validationError.total_response ?? "No Conflict in Traits Selection you can continue or stay and change the traits"}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-4">
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
            >
              Stay on {validationError?.fromTab}
            </button>
            <button
              onClick={onContinue}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-105 transition-all"
            >
              Continue to {validationError?.toTab}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ValidationModal;