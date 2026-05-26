import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  usePersonas,
  useSimulatePopulation,
  useGenerateQuestionnaire,
  useQuestionnaires,
  usePopulationSimulations,
  useEnsureSurveySimulation,
} from '../../../../../../hooks/useQuantitativeQueries';
import { getAllQuestionnaires, getSurveySimulationBySource } from '../../../../../../services/quantitativeServices';
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
  const [surveySimulationId, setSurveySimulationId] = useState<string>('');
  const [questionnaireModified, setQuestionnaireModified] = useState(false);
  const { trigger } = useOmniWorkflow();
  const restoredFromServerRef = useRef(false);
  const surveyEnsurePromiseRef = useRef<Promise<string> | null>(null);

  const { data: personasData, isLoading: personasLoading } = usePersonas(workspaceId, explorationId);
  const { data: simulationList = [], isFetched: simulationsFetched } = usePopulationSimulations(workspaceId, explorationId);
  const simulatePopulationMutation = useSimulatePopulation();
  const generateQuestionnaireMutation = useGenerateQuestionnaire();
  const ensureSurveySimulationMutation = useEnsureSurveySimulation();
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

  const hasQuestionnaireQuestions = Array.isArray(questionnaireData)
    && questionnaireData.some(
      (section) => Array.isArray(section?.questions) && section.questions.length > 0,
    );

  // Mark quant sub-step 1 (Questionnaire Design) done when questionnaire data loads
  useEffect(() => {
    if (explorationId && questionnairesData?.data?.length) {
      localStorage.setItem(`quant_sub1_${explorationId}`, '1');
    }
  }, [questionnairesData, explorationId]);

  // Mark quant sub-step 2 (Population Calibration) done when phase leaves setup
  useEffect(() => {
    if (explorationId && phase !== 'setup') {
      localStorage.setItem(`quant_sub2_${explorationId}`, '1');
    }
  }, [phase, explorationId]);

  // Restore latest saved population from DB
  useEffect(() => {
    if (restoredFromServerRef.current) return;
    if (!simulationsFetched || !workspaceId || !explorationId) return;
    if (!simulationList?.length || !personas?.length) return;

    let cancelled = false;

    (async () => {
      // Sort newest first and limit to 5 most recent to avoid excessive API calls.
      const sorted = [...simulationList].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );
      const simsToCheck = sorted.slice(0, 5);

      try {
        // ── Parallel scan: check questionnaire + survey existence for each sim ──
        // This finds the newest sim with a COMPLETED survey (questionnaire + survey sim)
        // so users always land on their latest finished work rather than an in-progress one.
        const checks = await Promise.all(
          simsToCheck.map(async (sim) => {
            try {
              const [qRes, surveyRes] = await Promise.all([
                getAllQuestionnaires({ workspaceId, explorationId, simulationId: sim.id }),
                getSurveySimulationBySource({
                  workspaceId,
                  explorationId,
                  simulationSourceId: sim.id,
                }).catch(() => null),
              ]);
              return {
                sim,
                qData: Array.isArray(qRes?.data) ? qRes.data : [] as any[],
                surveyId: (surveyRes as any)?.data?.id ?? '',
              };
            } catch {
              return { sim, qData: [] as any[], surveyId: '' };
            }
          }),
        );

        if (cancelled) return;

        // Pick best candidate: newest sim with both questionnaire AND completed survey.
        // Fall back to newest sim with questionnaire only (will show survey animation).
        let insightCandidate: { sim: any; qData: any[]; surveyId: string } | null = null;
        let surveyCandidate: { sim: any; qData: any[] } | null = null;

        for (const check of checks) {
          // checks is already sorted newest-first
          if (check.qData.length === 0) continue;
          if (!surveyCandidate) surveyCandidate = { sim: check.sim, qData: check.qData };
          if (check.surveyId) {
            insightCandidate = check;
            break;
          }
        }

        const candidate = insightCandidate ?? surveyCandidate;
        if (!candidate) return; // Nothing restorable — stay in setup

        restoredFromServerRef.current = true;

        const { sim, qData } = candidate;
        const surveyId = insightCandidate?.surveyId ?? '';

        const pids: string[] = sim.persona_ids || [];
        const idSet = new Set(pids);
        const selected = personas.filter((p) => idSet.has(p.id)).map((p) => ({ id: p.id, name: p.name }));
        const sd = sim.sample_distribution || {};
        const nextSizes: SampleSizes = { ...sd };
        selected.forEach((p) => { if (nextSizes[p.id] == null) nextSizes[p.id] = 50; });

        setSimulationId(sim.id);
        setSimulationResult({
          id: sim.id,
          workspace_id: sim.workspace_id,
          exploration_id: sim.exploration_id,
          persona_ids: sim.persona_ids,
          sample_distribution: sim.sample_distribution,
          persona_scores: sim.persona_scores,
          weighted_score: sim.weighted_score,
          global_insights: sim.global_insights,
        });
        setQuestionnaireData(qData);
        setSelectedPersonas(selected);
        setSampleSizes(nextSizes);
        setSurveySimulationId(surveyId);
        setPhase(insightCandidate ? 'insights' : 'survey');
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
      if (selectedPersonas.length >= 8) return;
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
        setSurveySimulationId('');
        surveyEnsurePromiseRef.current = null;

        // Mark sub-step 2 done (Population Calibration confirmed)
        localStorage.setItem(`quant_sub2_${explorationId}`, '1');

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

  const getPersonaIdsForSurvey = useCallback(() => {
    const selectedIds = selectedPersonas.map((p) => p.id).filter(Boolean);
    if (selectedIds.length > 0) return selectedIds;

    if (Array.isArray(simulationResult?.persona_ids)) {
      return simulationResult.persona_ids.filter(Boolean);
    }

    if (Array.isArray(simulationResult?.persona_id)) {
      return simulationResult.persona_id.filter(Boolean);
    }

    return [];
  }, [selectedPersonas, simulationResult]);

  const ensureSurveyRun = useCallback(async () => {
    if (surveySimulationId) return surveySimulationId;
    if (surveyEnsurePromiseRef.current) return surveyEnsurePromiseRef.current;
    if (!workspaceId || !explorationId || !simulationResult?.id) {
      throw new Error('Missing survey simulation context.');
    }

    const personaIds = getPersonaIdsForSurvey();
    const shouldForceRerun =
      questionnaireModified ||
      sessionStorage.getItem(`forceRerun_${explorationId}`) === 'true';

    const promise = ensureSurveySimulationMutation.mutateAsync({
      workspaceId,
      explorationId,
      personaIds,
      simulationId: simulationResult.id,
      forceRerun: shouldForceRerun,
    }).then((result) => {
      const nextSurveySimulationId = result?.data?.id;
      if (!nextSurveySimulationId) {
        throw new Error('Survey simulation did not return an ID.');
      }

      setSurveySimulationId(nextSurveySimulationId);
      localStorage.setItem(`quant_sub3_${explorationId}`, '1');
      sessionStorage.removeItem(`forceRerun_${explorationId}`);
      setQuestionnaireModified(false);
      return nextSurveySimulationId;
    }).finally(() => {
      surveyEnsurePromiseRef.current = null;
    });

    surveyEnsurePromiseRef.current = promise;
    return promise;
  }, [
    surveySimulationId,
    workspaceId,
    explorationId,
    simulationResult,
    getPersonaIdsForSurvey,
    questionnaireModified,
    ensureSurveySimulationMutation,
  ]);

  useEffect(() => {
    if (phase !== 'survey') return;
    if (!hasQuestionnaireQuestions) return;
    if (!simulationResult?.id) return;

    void ensureSurveyRun().catch((error) => {
      console.error('Error pre-running survey simulation:', error);
    });
  }, [phase, hasQuestionnaireQuestions, simulationResult?.id, ensureSurveyRun]);

  const handleSurveyComplete = async () => {
    try {
      await ensureSurveyRun();
      setPhase('insights');
    } catch (error) {
      console.error('Error completing survey simulation:', error);
      alert('Survey simulation could not be completed. Please try again.');
    }
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
              setSurveySimulationId('');
              surveyEnsurePromiseRef.current = null;
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
            initialSurveySimulationId={surveySimulationId}
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
