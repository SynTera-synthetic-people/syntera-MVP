import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbAlertTriangle, TbInfoCircle, TbAlertCircle } from 'react-icons/tb';

interface PlausibilityWarning {
  rule: string;
  severity: 'high' | 'medium' | 'soft';
  message: string;
  fields: string[];
}

interface PlausibilityCheckModalProps {
  show: boolean;
  warnings: PlausibilityWarning[];
  onContinue: () => void;
}

const SEVERITY_CONFIG = {
  high: {
    icon: TbAlertCircle,
    badge: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    row: 'border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5',
    label: 'Review',
  },
  medium: {
    icon: TbAlertTriangle,
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    row: 'border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5',
    label: 'Check',
  },
  soft: {
    icon: TbInfoCircle,
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    row: 'border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/5',
    label: 'Note',
  },
} as const;

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
              const cfg = SEVERITY_CONFIG[w.severity] ?? SEVERITY_CONFIG.soft;
              const Icon = cfg.icon;
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 border rounded-xl px-4 py-3 ${cfg.row}`}
                >
                  <Icon className="w-4 h-4 mt-0.5 shrink-0 text-inherit" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">
                      {w.message}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${cfg.badge}`}
                  >
                    {cfg.label}
                  </span>
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
