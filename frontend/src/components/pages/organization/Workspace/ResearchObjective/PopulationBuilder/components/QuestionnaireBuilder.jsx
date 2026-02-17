import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import QuestionnaireTabs from './QuestionnaireTabs';
import QuestionList from './QuestionList';
import { TbUpload, TbLoader, TbCheck } from 'react-icons/tb';

const QuestionnaireBuilder = ({ questionnaireData, loading, simulationId, workspaceId, explorationId, uploadQuestionnaireMutation }) => {
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [uploadStatus, setUploadStatus] = useState({ isLoading: false, isSuccess: false, error: null });
  const fileInputRef = useRef(null);

  const transformQuestionnaireData = (apiData) => {
    if (!apiData || !Array.isArray(apiData)) return [];
    return apiData.map(section => ({
      title: section.title,
      questions: section.questions.map(q => ({
        id: q.id,
        text: q.text,
        options: q.options || []
      }))
    }));
  };

  const questionnaireSections = transformQuestionnaireData(questionnaireData);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type if needed
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|docx|txt)$/i)) {
      setUploadStatus({ isLoading: false, isSuccess: false, error: 'Please upload a valid file (PDF, DOCX, or TXT)' });
      return;
    }

    setUploadStatus({ isLoading: true, isSuccess: false, error: null });

    try {
      // Call the upload mutation
      await uploadQuestionnaireMutation.mutateAsync({
        workspaceId,
        explorationId,
        simulationId,
        file
      });

      setUploadStatus({ isLoading: false, isSuccess: true, error: null });

      // Reset success state after 3 seconds
      setTimeout(() => {
        setUploadStatus({ isLoading: false, isSuccess: false, error: null });
      }, 3000);

    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus({
        isLoading: false,
        isSuccess: false,
        error: error.response?.data?.message || 'Failed to upload questionnaire. Please try again.'
      });
    }

    // Reset file input
    e.target.value = '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <TbLoader className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading questionnaire...</span>
      </div>
    );
  }

  if (questionnaireSections.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500 dark:text-gray-400">
        No questionnaire data available.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Questionnaire Builder</h3>
        <div className="flex gap-2 items-center">
          {uploadStatus.isLoading && (
            <div className="flex items-center text-blue-600">
              <TbLoader className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Uploading...</span>
            </div>
          )}
          {uploadStatus.isSuccess && (
            <div className="flex items-center text-green-600">
              <TbCheck className="w-5 h-5 mr-2" />
              <span className="text-sm">Upload successful!</span>
            </div>
          )}
          {uploadStatus.error && (
            <div className="text-red-600 text-sm">
              {uploadStatus.error}
            </div>
          )}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileChange}
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          />
          <button
            onClick={handleUploadClick}
            disabled={uploadStatus.isLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-white/10 transition-all font-bold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadStatus.isLoading ? (
              <TbLoader className="w-5 h-5 animate-spin" />
            ) : (
              <TbUpload size={18} />
            )}
            <span>Upload Questionnaire</span>
          </button>
        </div>
      </div>

      <QuestionnaireTabs
        sections={questionnaireSections}
        activeIndex={activeSectionIndex}
        onTabClick={setActiveSectionIndex}
      />

      <QuestionList
        section={questionnaireSections[activeSectionIndex]}
      />
    </div>
  );
};

export default QuestionnaireBuilder;