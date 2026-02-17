import React from 'react';
import { motion } from 'framer-motion';
import CompactHeader from './CompactHeader';
import QuestionnaireBuilder from './QuestionnaireBuilder';
import { TbSend } from 'react-icons/tb';
import { useUploadQuestionnaire } from '../../../../../../../hooks/useQuantitativeQueries';

const PopulationActive = ({
  selectedPersonas,
  sampleSizes,
  simulationResult,
  questionnaireData,
  questionnairesLoading,
  onEditConfiguration,
  onLaunchSurvey,
  workspaceId,
  explorationId
}) => {
  const uploadQuestionnaireMutation = useUploadQuestionnaire();

  return (
    <motion.div
      key="active"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col relative z-20"
    >
      <CompactHeader
        selectedPersonas={selectedPersonas}
        sampleSizes={sampleSizes}
        simulationResult={simulationResult}
        onEditConfiguration={onEditConfiguration}
      />

      <QuestionnaireBuilder
        questionnaireData={questionnaireData}
        loading={questionnairesLoading}
        simulationId={simulationResult?.id}
        workspaceId={workspaceId}
        explorationId={explorationId}
        uploadQuestionnaireMutation={uploadQuestionnaireMutation}
      />

      <div className="flex justify-center pt-10 pb-4">
        <button
          onClick={onLaunchSurvey}
          className="px-12 py-5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-3xl font-black text-xl shadow-2xl shadow-blue-500/40 hover:shadow-blue-500/60 hover:scale-105 hover:-translate-y-1 transition-all active:scale-95 flex items-center gap-4"
        >
          <span>Launch Survey</span>
          <TbSend size={24} />
        </button>
      </div>
    </motion.div>
  );
};

export default PopulationActive;