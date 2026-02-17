import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { TbLoader } from 'react-icons/tb';
import {
  usePersonas,
  useSimulatePopulation,
  useGenerateQuestionnaire,
  useQuestionnaires
} from '../../../../../../hooks/useQuantitativeQueries';
import PopulationSetup from './components/PopulationSetup';
import PopulationActive from './components/PopulationActive';
import Header from './components/Header';
import LoadingSpinner from './components/LoadingSpinner';
import { useOmniWorkflow } from '../../../../../../hooks/useOmiWorkflow';

const PopulationBuilder = () => {
  const navigate = useNavigate();
  const { workspaceId, objectiveId } = useParams();
  const explorationId = objectiveId;

  const [personas, setPersonas] = useState([]);
  const [selectedPersonas, setSelectedPersonas] = useState([]);
  const [sampleSizes, setSampleSizes] = useState({});
  const [isPopulationConfirmed, setIsPopulationConfirmed] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);
  const [questionnaireData, setQuestionnaireData] = useState([]);
  const [simulationId, setSimulationId] = useState(null); // Store simulation ID
  const { trigger } = useOmniWorkflow();

  const {
    data: personasData,
    isLoading: personasLoading
  } = usePersonas(workspaceId, explorationId);

  const simulatePopulationMutation = useSimulatePopulation();
  const generateQuestionnaireMutation = useGenerateQuestionnaire();

  // Updated: Include simulationId in questionnaires query
  const {
    data: questionnairesData,
    isLoading: questionnairesLoading,
    refetch: refetchQuestionnaires
  } = useQuestionnaires(
    workspaceId,
    explorationId,
    simulationId, // Pass simulationId instead of isPopulationConfirmed boolean
    isPopulationConfirmed // Still need this to trigger the query
  );

  // Effects
  useEffect(() => {
    if (personasData?.data) {
      setPersonas(personasData.data);
    }
  }, [personasData]);

  useEffect(() => {
    if (objectiveId) {
      trigger({
        stage: 'population_simulation',
        event: 'ENTER_POPULATION',
        payload: {},
      });
    }
  }, [objectiveId]);

  useEffect(() => {
    if (questionnairesData?.data) {
      setQuestionnaireData(questionnairesData.data);
    }
  }, [questionnairesData]);

  // Handlers
  const handleSelectPersona = (persona) => {
    const isSelected = selectedPersonas.some(p => p.id === persona.id);

    if (isSelected) {
      setSelectedPersonas(prev => prev.filter(p => p.id !== persona.id));
      const newSampleSizes = { ...sampleSizes };
      delete newSampleSizes[persona.id];
      setSampleSizes(newSampleSizes);
    } else {
      setSelectedPersonas(prev => [...prev, { id: persona.id, name: persona.name }]);
      setSampleSizes(prev => ({
        ...prev,
        [persona.id]: 50
      }));
    }
  };

  const handleSampleSizeChange = (personaId, size) => {
    const numericSize = parseInt(size);
    if (isNaN(numericSize) || numericSize < 1) return;

    setSampleSizes(prev => ({
      ...prev,
      [personaId]: numericSize
    }));
  };

  const handleRemovePersona = (personaId) => {
    setSelectedPersonas(prev => prev.filter(p => p.id !== personaId));
    const newSampleSizes = { ...sampleSizes };
    delete newSampleSizes[personaId];
    setSampleSizes(newSampleSizes);
  };

  const handleConfirmPopulation = async () => {
    if (selectedPersonas.length === 0) {
      alert('Please select at least one persona');
      return;
    }

    const missingSizes = selectedPersonas.filter(p => !sampleSizes[p.id] || sampleSizes[p.id] < 1);
    if (missingSizes.length > 0) {
      alert('Please set sample size for all selected personas');
      return;
    }

    try {
      const personaIds = selectedPersonas.map(p => p.id);
      const sampleDistribution = { ...sampleSizes };

      // Step 1: Simulate population
      const simulationResponse = await simulatePopulationMutation.mutateAsync({
        workspaceId,
        explorationId,
        personaIds,
        sampleDistribution
      });



      if (simulationResponse.status === 'success') {
        setSimulationResult(simulationResponse.data);
        setSimulationId(simulationResponse.data.id);

        trigger({
          stage: 'questionnaire',
          event: 'QUESTIONAIRE_BUILD',
          payload: {},
        });

        // Step 2: Generate questionnaire for ALL personas at once
        const generateResponse = await generateQuestionnaireMutation.mutateAsync({
          workspaceId,
          explorationId,
          personaIds, // Send array of persona IDs
          simulationId: simulationResponse.data.id
        });

        if (generateResponse.status === 'success') {
          // Step 3: Set confirmed state and fetch questionnaires with simulationId
          setIsPopulationConfirmed(true);
          // The questionnaires query will automatically refetch because simulationId changed
        }
      }
    } catch (error) {
      console.error('Error in population setup:', error);
    }
  };

  const handleLaunchSurvey = () => {
    if (!simulationResult || selectedPersonas.length === 0) return;

    trigger({
      stage: 'survey-launch',
      event: 'SURVEY_LAUNCH',
      payload: {},
    });

    const surveyConfig = {
      explorationId,
      personaIds: selectedPersonas.map(p => p.id),
      personaNames: selectedPersonas.map(p => p.name),
      simulationId: simulationResult.id,
      sampleDistribution: sampleSizes,
      totalSampleSize: Object.values(sampleSizes).reduce((sum, size) => sum + size, 0),
      simulationData: simulationResult,
      questionnaireData: questionnaireData
    };

    navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/survey-results`, {
      state: { surveyConfig, fromPopulationBuilder: true }
    });
  };

  const handleEditConfiguration = () => {
    setIsPopulationConfirmed(false);
  };

  if (personasLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="p-4 md:p-8 relative min-h-[calc(100vh-100px)] flex flex-col">
      <div className="max-w-7xl mx-auto relative z-10 w-full flex-grow flex flex-col">
        <Header
          isLoading={simulatePopulationMutation.isPending || generateQuestionnaireMutation.isPending}
          navigate={navigate}
        />

        <div className="relative min-h-[600px] flex flex-col">
          <AnimatePresence mode="wait">
            {!isPopulationConfirmed ? (
              <PopulationSetup
                personas={personas}
                selectedPersonas={selectedPersonas}
                sampleSizes={sampleSizes}
                onSelectPersona={handleSelectPersona}
                onSampleSizeChange={handleSampleSizeChange}
                onRemovePersona={handleRemovePersona}
                onConfirmPopulation={handleConfirmPopulation}
                isPending={simulatePopulationMutation.isPending || generateQuestionnaireMutation.isPending}
              />
            ) : (
              <PopulationActive
                selectedPersonas={selectedPersonas}
                sampleSizes={sampleSizes}
                simulationResult={simulationResult}
                questionnaireData={questionnaireData}
                questionnairesLoading={questionnairesLoading}
                onEditConfiguration={handleEditConfiguration}
                onLaunchSurvey={handleLaunchSurvey}
                workspaceId={workspaceId}
                explorationId={explorationId}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default PopulationBuilder;