import React from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { TbX } from "react-icons/tb";

const BackstoryModal = ({
  show,
  selectedPersona,
  backstory,
  isSubmitting,
  onBackstoryChange,
  onSubmit,
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
          className="bg-white dark:bg-[#1a1f2e] border-2 border-gray-300 dark:border-white/10 p-8 rounded-3xl shadow-2xl w-full max-w-lg relative"
        >
          <div className="flex justify-between items-start mb-2">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Nearly there!
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              <TbX size={24} />
            </button>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Add a brief backstory for <span className="font-bold text-blue-600 dark:text-blue-400">{selectedPersona}</span> to give them more depth.
          </p>

          <textarea
            value={backstory}
            onChange={onBackstoryChange}
            placeholder="Where do they come from? What are their daily struggles and aspirations?"
            className="w-full h-48 p-4 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-2xl text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 outline-none resize-none transition-all"
          />

          <div className="flex justify-end mt-8">
            <button
              onClick={onSubmit}
              disabled={isSubmitting}
              className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default BackstoryModal;