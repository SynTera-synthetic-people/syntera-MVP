import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TbRocket, TbArrowLeft, TbMail, TbCheck } from 'react-icons/tb';

const PLAN_FEATURES = [
  'Unlimited research explorations',
  'Advanced persona builder',
  'Full depth interview suite',
  'Population builder & questionnaire',
  'Traceability reports',
  'Team workspace management',
  'Priority support',
];

const Upgrade = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-blue-50/30 to-blue-100/20 dark:from-[#0a0e1a] dark:via-[#0f1419] dark:to-[#1a1f2e] p-4 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-gradient-to-br from-blue-400/30 to-blue-600/20 dark:from-blue-500/40 dark:to-blue-700/30 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-tl from-blue-300/25 to-cyan-500/15 dark:from-blue-400/35 dark:to-cyan-600/25 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg"
      >
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors"
        >
          <TbArrowLeft size={16} />
          Go back
        </button>

        <div className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden">
          {/* Header gradient strip */}
          <div className="h-2 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-600" />

          <div className="p-8">
            {/* Icon + headline */}
            <div className="text-center mb-8">
              <div className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-500/30 text-white mb-4">
                <TbRocket className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Your free trial has ended
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto">
                You've completed your trial exploration. Upgrade to a full plan to unlock unlimited research and all platform features.
              </p>
            </div>

            {/* Features list */}
            <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-5 mb-8">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
                Everything in the full plan
              </p>
              <ul className="space-y-3">
                {PLAN_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center">
                      <TbCheck className="w-3 h-3 text-green-600 dark:text-green-400" />
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA */}
            <motion.a
              href="mailto:humans@synthetic-people.ai?subject=Upgrade%20Request"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all"
            >
              <TbMail size={20} />
              Contact Sales to Upgrade
            </motion.a>

            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
              Our team will get back to you within 24 hours.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Upgrade;
