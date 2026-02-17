import React from 'react';

const QuestionItem = ({ question }) => {
  return (
    <div className="bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-gray-100 dark:border-white/5 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
      <div className="space-y-6">
        <div>
          <p className="text-gray-900 dark:text-gray-100 font-bold text-lg leading-relaxed mb-2">
            {question.text}
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="text-[10px] uppercase tracking-wider font-bold">Simulated Responses</span>
            <span className="text-xs">({question.options.length} options)</span>
          </div>
        </div>

        {question.options && question.options.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {question.options.map((option, index) => (
              <div
                key={index}
                className="px-3 py-1.5 border border-gray-300 dark:border-white/20 rounded-lg text-gray-700 dark:text-gray-300 font-medium text-sm bg-gray-50/50 dark:bg-white/5"
              >
                {option}
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-3 bg-gray-50/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-xl text-gray-500 dark:text-gray-400 italic">
            No response options available
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestionItem;