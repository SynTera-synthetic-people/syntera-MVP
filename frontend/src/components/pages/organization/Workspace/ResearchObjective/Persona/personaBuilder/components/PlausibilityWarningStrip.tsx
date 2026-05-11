import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbAlertTriangle, TbAlertCircle, TbInfoCircle, TbX } from 'react-icons/tb';

export interface PlausibilityWarning {
  rule: string;
  severity: 'high' | 'medium' | 'soft';
  message: string;
  fields: string[];
}

interface PlausibilityWarningStripProps {
  warnings: PlausibilityWarning[];
  onDismiss: () => void;
}

const SEVERITY_ICON = {
  high: TbAlertCircle,
  medium: TbAlertTriangle,
  soft: TbInfoCircle,
} as const;

const SEVERITY_COLOR = {
  high: 'text-red-500 dark:text-red-400',
  medium: 'text-amber-500 dark:text-amber-400',
  soft: 'text-blue-500 dark:text-blue-400',
} as const;

// Maps backend rule ids to a human-readable "Section > Topic" label.
const RULE_LABEL: Record<string, string> = {
  age_income: 'Demographics › Age & Income',
  age_education: 'Demographics › Age & Education',
  age_occupation: 'Demographics › Age & Occupation',
  age_marital: 'Demographics › Age & Marital Status',
  age_family: 'Demographics › Age & Family',
  age_dependents: 'Demographics › Age & Dependents',
  marital_family: 'Demographics › Marital & Family',
  gender_family: 'Demographics › Gender & Family',
  income_occupation: 'Demographics › Income & Occupation',
  income_education: 'Demographics › Income & Education',
  geo_income: 'Demographics › Geography & Income',
  geo_occupation: 'Demographics › Geography & Occupation',
  geo_family: 'Demographics › Geography & Family',
  values_motivation: 'Psychographics › Values & Motivation',
  personality_lifestyle: 'Psychographics › Personality & Lifestyle',
  personality_motivation: 'Psychographics › Personality & Motivation',
  values_interests: 'Psychographics › Values & Interests',
  trait_contradiction: 'Psychographics › Trait Contradictions',
  job_decision: 'Psychographics › Job Level & Decision Making',
  job_experience: 'Psychographics › Job Level & Experience',
  enterprise_size: 'Psychographics › Company & Employee Size',
  dept_responsibility: 'Psychographics › Department & Responsibility',
  interests_income: 'Behavioural › Interests & Income',
  interests_age: 'Behavioural › Interests & Age',
  digital_age: 'Behavioural › Digital Adoption & Age',
  lifestyle_occupation: 'Behavioural › Lifestyle & Occupation',
  lifestyle_income: 'Behavioural › Lifestyle & Income',
  lifestyle_geography: 'Behavioural › Lifestyle & Geography',
  occupation_industry: 'Additional › Occupation & Industry',
  education_occupation: 'Additional › Education & Occupation',
  occupation_awareness: 'Additional › Occupation & Awareness',
  industry_awareness: 'Additional › Industry & Awareness',
  student_luxury_expert: 'Cross-section › Logical Conflict',
  over_idealized: 'Cross-section › Over-Idealized Persona',
  unrealistic_extremes: 'Cross-section › Unrealistic Extremes',
  hyper_specific: 'Cross-section › Hyper-Specific Persona',
  price_insensitive_low_income: 'Behavioural › Price & Income',
};

const PlausibilityWarningStrip: React.FC<PlausibilityWarningStripProps> = ({
  warnings,
  onDismiss,
}) => {
  if (warnings.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="plausibility-strip"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18 }}
        className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5 px-4 py-3 mb-4"
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-sm font-semibold text-gray-800 dark:text-white">
              Quick persona check
            </span>
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              We found a few combinations worth reviewing
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Dismiss"
          >
            <TbX className="w-4 h-4" />
          </button>
        </div>

        {/* Warning rows */}
        <div className="flex flex-col gap-1.5">
          {warnings.map((w, i) => {
            const Icon = SEVERITY_ICON[w.severity] ?? TbInfoCircle;
            const color = SEVERITY_COLOR[w.severity] ?? SEVERITY_COLOR.soft;
            const label = RULE_LABEL[w.rule] ?? w.rule;
            return (
              <div key={i} className="flex items-start gap-2">
                <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mr-1">
                    {label}
                  </span>
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    — {w.message}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PlausibilityWarningStrip;
