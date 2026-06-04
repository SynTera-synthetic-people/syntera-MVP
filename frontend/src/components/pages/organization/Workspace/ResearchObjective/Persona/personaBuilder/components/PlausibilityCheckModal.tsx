import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbAlertTriangle } from 'react-icons/tb';

interface PlausibilityWarning {
  rule: string;
  message: string;
  fields: string[];
}

interface PlausibilityCheckModalProps {
  show: boolean;
  warnings: PlausibilityWarning[];
  onContinue: () => void;
}

const WARNING_ROW = 'border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5';

const PlausibilityCheckModal: React.FC<PlausibilityCheckModalProps> = ({
  show,
  warnings,
  onContinue,
}) => {
  if (!show || warnings.length === 0) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.2 }}
          className="bg-white dark:bg-[#1a1f2e] border border-gray-200 dark:border-white/10 p-8 rounded-3xl shadow-2xl w-full max-w-xl"
        >
          {/* Header */}
          <div className="mb-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Quick persona check
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              We found a few combinations worth reviewing
            </p>
          </div>

          {/* Warning list */}
          <div className="mt-5 flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
            {warnings.map((w, i) => {
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${WARNING_ROW}`}
                >
                  <TbAlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500 dark:text-amber-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">
                      {w.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={onContinue}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105 transition-all text-sm"
            >
              Continue
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default PlausibilityCheckModal;
