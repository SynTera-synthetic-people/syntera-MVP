import React from 'react';
import { motion } from 'framer-motion';
import { TbArrowLeft, TbLoader } from 'react-icons/tb';

const Header = ({ isLoading, navigate }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8"
    >
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate(-1)}
          className="p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors"
        >
          <TbArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Population Builder
        </h1>
        {isLoading && (
          <TbLoader className="w-5 h-5 animate-spin text-blue-600" />
        )}
      </div>
      <p className="text-gray-600 dark:text-gray-400">
        Define your target audience and sample sizes for the quantitative survey.
      </p>
    </motion.div>
  );
};

export default Header;