import React from 'react';
import { useLocation } from 'react-router-dom';
import { BsRobot } from 'react-icons/bs';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';

const OMNI_STATE_KEY = ['omi-workflow-state'];

const ResponseBar = () => {
  const location = useLocation();

  const { data } = useQuery({
    queryKey: OMNI_STATE_KEY,
    enabled: false, // ❗ purely passive subscriber
  });

  const isResearchWorkflow = location.pathname.includes('/research-objectives/');
  const isExcludedPage = location.pathname.includes('/chatview') || location.pathname.includes('/rebuttal-mode');

  if (!isResearchWorkflow || isExcludedPage || !data) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="fixed bottom-4 inset-x-0 mx-auto z-10 w-full max-w-3xl px-6"
      >
        <div className="bg-white/40 dark:bg-black-primary-light/40 backdrop-blur-md rounded-xl shadow-2xl p-4 flex items-center gap-4">

          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <BsRobot className="w-6 h-6 text-blue-400" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {data.message || 'Waiting for response...'}
            </h3>

            {/* <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Omni state: {data.omi_state} · Visual: {data.visual_state}
            </p> */}
          </div>

          {/* {data.next_expected_event && (
            <div className="flex-shrink-0 animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
          )} */}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ResponseBar;
