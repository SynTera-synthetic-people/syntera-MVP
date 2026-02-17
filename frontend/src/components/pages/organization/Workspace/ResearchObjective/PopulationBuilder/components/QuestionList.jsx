import React from 'react';
import QuestionItem from './QuestionItem';

const QuestionList = ({ section }) => {
  return (
    <div className="mb-10">
      <h4 className="text-lg font-bold text-gray-800 dark:text-white mb-5 pl-4 border-l-4 border-blue-500 flex items-center justify-between">
        <span>{section.title}</span>
        <span className="text-[10px] bg-blue-100 dark:bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full">
          {section.questions.length} Questions
        </span>
      </h4>
      <div className="grid grid-cols-1 gap-6">
        {section.questions.map((question) => (
          <QuestionItem key={question.id} question={question} />
        ))}
      </div>
    </div>
  );
};

export default QuestionList;