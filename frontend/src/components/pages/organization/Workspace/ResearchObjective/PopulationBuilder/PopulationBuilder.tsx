import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  usePersonas,
  useSimulatePopulation,
  useGenerateQuestionnaire,
  useQuestionnaires,
  usePopulationSimulations,
} from '../../../../../../hooks/useQuantitativeQueries';
import { getAllQuestionnaires } from '../../../../../../services/quantitativeServices';
import PopulationSetup from './PopulationSetup';
import SurveyInMotion from './SurveyInMotion';
import InsightsGeneration from './InsightGeneration';
import LoadingSpinner from './LoadingSpinner';
import { useOmniWorkflow } from '../../../../../../hooks/useOmiWorkflow';
import './PopulationBuilder.css';

export type PopulationPhase = 'setup' | 'survey' | 'insights';

interface SelectedPersona {
  id: string;
  name: string;
}

interface SampleSizes {
  [personaId: string]: number;
}

const PopulationBuilder: React.FC = () => {
  const navigate = useNavigate();
  const { workspaceId, objectiveId } = useParams<{ workspaceId: string; objectiveId: string }>();
  const explorationId = objectiveId;

  const [personas, setPersonas] = useState<any[]>([]);
  const [selectedPersonas, setSelectedPersonas] = useState<SelectedPersona[]>([]);
  const [sampleSizes, setSampleSizes] = useState<SampleSizes>({});
  const [phase, setPhase] = useState<PopulationPhase>('setup');
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [questionnaireData, setQuestionnaireData] = useState<any[]>([]);
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [questionnaireModified, setQuestionnaireModified] = useState(false);
  const { trigger } = useOmniWorkflow();
  const restoredFromServerRef = useRef(false);

  const { data: personasData, isLoading: personasLoading } = usePersonas(workspaceId, explorationId);
  const { data: simulationList = [], isFetched: simulationsFetched } = usePopulationSimulations(workspaceId, explorationId);
  const simulatePopulationMutation = useSimulatePopulation();
  const generateQuestionnaireMutation = useGenerateQuestionnaire();
  const isPopulationConfirmed = phase !== 'setup';

  const { data: questionnairesData, isLoading: questionnairesLoading } = useQuestionnaires(
    workspaceId,
    explorationId,
    simulationId,
    isPopulationConfirmed,
  );

  useEffect(() => {
    if (personasData?.data) setPersonas(personasData.data);
  }, [personasData]);

  useEffect(() => {
    if (objectiveId) {
      trigger({ stage: 'population_simulation', event: 'ENTER_POPULATION', payload: {} });
    }
  }, [objectiveId]);

  useEffect(() => {
    if (questionnairesData?.data) setQuestionnaireData(questionnairesData.data);
  }, [questionnairesData]);

  // Restore latest saved population from DB
  useEffect(() => {
    if (restoredFromServerRef.current) return;
    if (!simulationsFetched || !workspaceId || !explorationId) return;
    if (!simulationList?.length || !personas?.length) return;

    let cancelled = false;

    (async () => {
      const sorted = [...simulationList].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );
      const latest = sorted[0];
      try {
        const qRes = await getAllQuestionnaires({ workspaceId, explorationId, simulationId: latest.id });
        const qData = qRes?.data;
        if (cancelled) return;
        if (!Array.isArray(qData) || qData.length === 0) return;

        restoredFromServerRef.current = true;

        const pids: string[] = latest.persona_ids || [];
        const idSet = new Set(pids);
        const selected = personas.filter((p) => idSet.has(p.id)).map((p) => ({ id: p.id, name: p.name }));
        const sd = latest.sample_distribution || {};
        const nextSizes: SampleSizes = { ...sd };
        selected.forEach((p) => { if (nextSizes[p.id] == null) nextSizes[p.id] = 50; });

        setSimulationId(latest.id);
        setSimulationResult({
          id: latest.id,
          workspace_id: latest.workspace_id,
          exploration_id: latest.exploration_id,
          persona_ids: latest.persona_ids,
          sample_distribution: latest.sample_distribution,
          persona_scores: latest.persona_scores,
          weighted_score: latest.weighted_score,
          global_insights: latest.global_insights,
        });
        setQuestionnaireData(qData);
        setSelectedPersonas(selected);
        setSampleSizes(nextSizes);
        setPhase('survey');
      } catch (e) {
        console.warn('Could not restore saved population/questionnaire', e);
      }
    })();

    return () => { cancelled = true; };
  }, [simulationsFetched, simulationList, personas, workspaceId, explorationId]);

  const handleSelectPersona = (persona: any) => {
    const isSelected = selectedPersonas.some((p) => p.id === persona.id);
    if (isSelected) {
      setSelectedPersonas((prev) => prev.filter((p) => p.id !== persona.id));
      const next = { ...sampleSizes };
      delete next[persona.id];
      setSampleSizes(next);
    } else {
      if (selectedPersonas.length >= 8) return; // Max 8 personas
      setSelectedPersonas((prev) => [...prev, { id: persona.id, name: persona.name }]);
      setSampleSizes((prev) => ({ ...prev, [persona.id]: 100 }));
    }
  };

  const handleSampleSizeChange = (personaId: string, size: string) => {
    const numericSize = parseInt(size, 10);
    if (isNaN(numericSize) || numericSize < 1) return;
    setSampleSizes((prev) => ({ ...prev, [personaId]: numericSize }));
  };

  const handleRemovePersona = (personaId: string) => {
    setSelectedPersonas((prev) => prev.filter((p) => p.id !== personaId));
    const next = { ...sampleSizes };
    delete next[personaId];
    setSampleSizes(next);
  };

  const handleStartSurvey = async () => {
    if (selectedPersonas.length === 0) return;
    if (!workspaceId || !explorationId) return;

    try {
      const personaIds = selectedPersonas.map((p) => p.id);
      const sampleDistribution = { ...sampleSizes };

      const simulationResponse = await simulatePopulationMutation.mutateAsync({
        workspaceId,
        explorationId,
        personaIds,
        sampleDistribution,
      });

      if (simulationResponse.status === 'success') {
        setSimulationResult(simulationResponse.data);
        setSimulationId(simulationResponse.data.id);

        trigger({ stage: 'questionnaire', event: 'QUESTIONAIRE_BUILD', payload: {} });

        // Move to survey phase immediately — globe shows while questionnaire generates
        setPhase('survey');

        const generateResponse = await generateQuestionnaireMutation.mutateAsync({
          workspaceId,
          explorationId,
          personaIds,
          simulationId: simulationResponse.data.id,
        });

        if (generateResponse.status === 'success') {
          // questionnaires query auto-refetches via simulationId
        }
      }
    } catch (error) {
      console.error('Error in population setup:', error);
    }
  };

  const handleSurveyComplete = () => {
    setPhase('insights');
  };

  const handleEditConfiguration = () => {
    setPhase('setup');
  };

  const handleLaunchSurvey = () => {
    if (!simulationResult || selectedPersonas.length === 0) return;

    trigger({ stage: 'survey-launch', event: 'SURVEY_LAUNCH', payload: {} });

    const surveyConfig = {
      explorationId,
      personaIds: selectedPersonas.map((p) => p.id),
      personaNames: selectedPersonas.map((p) => p.name),
      simulationId: simulationResult.id,
      sampleDistribution: sampleSizes,
      totalSampleSize: Object.values(sampleSizes).reduce((sum, size) => sum + size, 0),
      simulationData: simulationResult,
      questionnaireData,
    };

    navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/survey-results`, {
      state: { surveyConfig, fromPopulationBuilder: true, forceRerun: questionnaireModified },
    });
    setQuestionnaireModified(false);
  };

  if (personasLoading) return <LoadingSpinner />;

  return (
    <div className="pb-root">
      <AnimatePresence mode="wait">
        {phase === 'setup' && (
          <PopulationSetup
            key="setup"
            personas={personas}
            selectedPersonas={selectedPersonas}
            sampleSizes={sampleSizes}
            onSelectPersona={handleSelectPersona}
            onSampleSizeChange={handleSampleSizeChange}
            onRemovePersona={handleRemovePersona}
            onStartSurvey={handleStartSurvey}
            isPending={simulatePopulationMutation.isPending || generateQuestionnaireMutation.isPending}
          />
        )}

        {phase === 'survey' && (
          <SurveyInMotion
            key="survey"
            selectedPersonas={selectedPersonas}
            sampleSizes={sampleSizes}
            simulationResult={simulationResult}
            questionnaireData={questionnaireData}
            questionnairesLoading={questionnairesLoading}
            onSurveyComplete={handleSurveyComplete}
            onEditConfiguration={handleEditConfiguration}
            onModified={() => {
              setQuestionnaireModified(true);
              sessionStorage.setItem(`forceRerun_${explorationId}`, 'true');
            }}
            workspaceId={workspaceId ?? ''}
            explorationId={explorationId ?? ''}
          />
        )}

        {phase === 'insights' && (
          <InsightsGeneration
            key="insights"
            selectedPersonas={selectedPersonas}
            simulationResult={simulationResult}
            questionnaireData={questionnaireData}
            workspaceId={workspaceId ?? ''}
            explorationId={explorationId ?? ''}
            onLaunchSurvey={handleLaunchSurvey}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default PopulationBuilder;