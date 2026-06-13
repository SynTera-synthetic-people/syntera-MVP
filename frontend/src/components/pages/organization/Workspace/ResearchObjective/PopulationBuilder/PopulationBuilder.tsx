import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  usePersonas,
  useSimulatePopulation,
  useGenerateQuestionnaire,
  useQuestionnaires,
  usePopulationSimulations,
  useEnsureSurveySimulation,
} from '../../../../../../hooks/useQuantitativeQueries';
import { getAllQuestionnaires, getSurveySimulationBySource, getQuestionnaireGenerationStatus } from '../../../../../../services/quantitativeServices';
import PopulationSetup from './PopulationSetup';
import SurveyInMotion from './SurveyInMotion';
import InsightsGeneration from './InsightGeneration';
import LoadingSpinner from './LoadingSpinner';
import { useOmniWorkflow } from '../../../../../../hooks/useOmiWorkflow';
import './PopulationBuilder.css';
import { useLoaderActive } from '../../../../../../context/LoaderActiveContext';

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
  const location = useLocation();
  const isViewOnly = Boolean((location.state as any)?.viewOnly);
  const { workspaceId, objectiveId } = useParams<{ workspaceId: string; objectiveId: string }>();
  const explorationId = objectiveId;

  const [personas, setPersonas] = useState<any[]>([]);
  const [selectedPersonas, setSelectedPersonas] = useState<SelectedPersona[]>([]);
  const [sampleSizes, setSampleSizes] = useState<SampleSizes>({});
  const [phase, setPhase] = useState<PopulationPhase>('setup');
  const [surveyError, setSurveyError] = useState<string | null>(null); // ← NEW: track error state

  const { setLoaderActive } = useLoaderActive();
  useEffect(() => { setLoaderActive(phase === 'survey'); }, [phase, setLoaderActive]);
  useEffect(() => () => setLoaderActive(false), [setLoaderActive]);

  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [questionnaireData, setQuestionnaireData] = useState<any[]>([]);
  const [simulationId, setSimulationId] = useState<string | null>(null);
  const [surveySimulationId, setSurveySimulationId] = useState<string>('');
  const [questionnaireModified, setQuestionnaireModified] = useState(false);
  const { trigger } = useOmniWorkflow();
  const queryClient = useQueryClient();
  const restoredFromServerRef = useRef(false);
  const surveyEnsurePromiseRef = useRef<Promise<string> | null>(null);
  const questionnaireReadyRef = useRef(false);

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

  useEffect(() => {
    questionnaireReadyRef.current = hasQuestionnaireQuestions;
  }, [hasQuestionnaireQuestions]);

  useEffect(() => {
    if (explorationId && questionnairesData?.data?.length) {
      localStorage.setItem(`quant_sub1_${explorationId}`, '1');
    }
  }, [questionnairesData, explorationId]);

  useEffect(() => {
    if (explorationId && phase !== 'setup') {
      localStorage.setItem(`quant_sub2_${explorationId}`, '1');
    }
  }, [phase, explorationId]);

  // Restore latest saved population from DB
  useEffect(() => {
    console.log('[PB] restoration effect fired', {
      restoredRef: restoredFromServerRef.current,
      simulationsFetched,
      listLen: simulationList?.length,
      personasLen: personas?.length,
      workspaceId,
      explorationId,
    });
    if (restoredFromServerRef.current) return;
    if (!simulationsFetched || !workspaceId || !explorationId) return;
    if (!simulationList?.length || !personas?.length) return;

    let cancelled = false;

    (async () => {
      try {
        const SESSION_KEY = `activeSurveySim_${explorationId}`;
        const activeSimId = sessionStorage.getItem(SESSION_KEY);
        console.log('[PB] restoration: sessionStorage activeSimId =', activeSimId);
        if (activeSimId) {
          const activeSim = simulationList.find((s: any) => s.id === activeSimId);
          if (activeSim) {
            console.log('[PB] restoration: fast-path matched activeSim', activeSim.id, '→ setting phase=survey');
            restoredFromServerRef.current = true;
            const pids: string[] = activeSim.persona_ids || [];
            const idSet = new Set(pids);
            const selected = personas
              .filter((p) => idSet.has(p.id))
              .map((p) => ({ id: p.id, name: p.name }));
            const sd = activeSim.sample_distribution || {};
            const nextSizes: SampleSizes = { ...sd };
            selected.forEach((p) => { if (nextSizes[p.id] == null) nextSizes[p.id] = 50; });

            setSimulationId(activeSimId);
            setSimulationResult({
              id: activeSim.id,
              workspace_id: activeSim.workspace_id,
              exploration_id: activeSim.exploration_id,
              persona_ids: activeSim.persona_ids,
              sample_distribution: activeSim.sample_distribution,
              persona_scores: activeSim.persona_scores,
              weighted_score: activeSim.weighted_score,
              global_insights: activeSim.global_insights,
            });
            setSelectedPersonas(selected);
            setSampleSizes(nextSizes);
            setSurveySimulationId('');
            questionnaireReadyRef.current = false;
            setPhase('survey');
            return;
          }
          console.log('[PB] restoration: fast-path activeSimId not yet in simulationList, waiting');
          return;
        }

        const sorted = [...simulationList].sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
        );
        const simsToCheck = sorted.slice(0, 5);

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

        let insightCandidate: { sim: any; qData: any[]; surveyId: string } | null = null;
        let surveyCandidate: { sim: any; qData: any[] } | null = null;

        for (const check of checks) {
          if (check.qData.length === 0) continue;
          if (!surveyCandidate) surveyCandidate = { sim: check.sim, qData: check.qData };
          if (check.surveyId) {
            insightCandidate = check;
            break;
          }
        }

        const candidate = insightCandidate ?? surveyCandidate;
        console.log('[PB] restoration: scan complete', {
          insightCandidate: insightCandidate?.sim?.id ?? null,
          surveyCandidate: surveyCandidate?.sim?.id ?? null,
          chosen: candidate?.sim?.id ?? null,
        });
        if (!candidate) return;

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
        const restoredPhase = insightCandidate ? 'insights' : 'survey';
        console.log('[PB] restoration: setting phase =', restoredPhase, '| surveyId =', surveyId, '| simId =', candidate.sim.id);
        setPhase(restoredPhase);
      } catch (e) {
        console.warn('[PB] restoration: error during scan', e);
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

  // ── FIX 1: Navigate to survey phase IMMEDIATELY, run APIs in background ──
  const handleStartSurvey = async () => {
    if (selectedPersonas.length === 0) return;
    if (!workspaceId || !explorationId) return;

    console.log('[PB] handleStartSurvey: fired', {
      personaCount: selectedPersonas.length,
      personaIds: selectedPersonas.map((p) => p.id),
      sampleSizes,
      workspaceId,
      explorationId,
    });

    restoredFromServerRef.current = true;
    setSurveyError(null); // clear any previous error

    // ── Navigate immediately — don't wait for the API ──
    setPhase('survey');

    try {
      const personaIds = selectedPersonas.map((p) => p.id);
      const sampleDistribution = { ...sampleSizes };

      console.log('[PB] handleStartSurvey: calling simulatePopulation');
      const simulationResponse = await simulatePopulationMutation.mutateAsync({
        workspaceId,
        explorationId,
        personaIds,
        sampleDistribution,
      });

      console.log('[PB] handleStartSurvey: simulatePopulation response', {
        status: simulationResponse?.status,
        data: simulationResponse?.data,
        full: simulationResponse,
      });

      if (simulationResponse.status === 'success') {
        sessionStorage.setItem(`activeSurveySim_${explorationId}`, simulationResponse.data.id);

        console.log('[PB] handleStartSurvey: status=success, simId =', simulationResponse.data?.id);
        setSimulationResult(simulationResponse.data);
        setSimulationId(simulationResponse.data.id);
        setSurveySimulationId('');
        surveyEnsurePromiseRef.current = null;
        questionnaireReadyRef.current = false;

        localStorage.setItem(`quant_sub2_${explorationId}`, '1');
        trigger({ stage: 'questionnaire', event: 'QUESTIONAIRE_BUILD', payload: {} });

        console.log('[PB] handleStartSurvey: calling generateQuestionnaire');
        const generateResponse = await generateQuestionnaireMutation.mutateAsync({
          workspaceId,
          explorationId,
          personaIds,
          simulationId: simulationResponse.data.id,
        });

        console.log('[PB] handleStartSurvey: generateQuestionnaire response', {
          shouldPoll: generateResponse?.data?.should_poll,
          jobId: generateResponse?.data?.job_id,
          id: generateResponse?.data?.id,
          full: generateResponse,
        });

        const genJobId = (generateResponse?.data?.job_id ?? generateResponse?.data?.id) as string | undefined;
        if (generateResponse?.data?.should_poll && genJobId) {
          const jobId = genJobId;
          const MAX_ATTEMPTS = 40;
          let attempts = 0;
          const pollUntilDone = async (): Promise<void> => {
            if (attempts++ >= MAX_ATTEMPTS) return;
            try {
              const statusRes = await getQuestionnaireGenerationStatus({
                workspaceId,
                explorationId,
                jobId,
              });
              const status = statusRes?.data?.status as string | undefined;
              console.log('[PB] questionnaire job poll attempt', attempts, '| status =', status);
              if (status === 'completed') {
                console.log('[PB] questionnaire job completed, invalidating cache');
                queryClient.invalidateQueries({
                  queryKey: ['questionnaires', workspaceId, explorationId],
                });
                return;
              }
              if (status !== 'failed') {
                await new Promise<void>((res) => setTimeout(res, 3_000));
                return pollUntilDone();
              }
            } catch {
              await new Promise<void>((res) => setTimeout(res, 3_000));
              return pollUntilDone();
            }
          };
          void pollUntilDone();
        }
      } else {
        // ── FIX 2: simulatePopulation returned non-success — show error, let user retry ──
        console.error('[PB] handleStartSurvey: simulatePopulation non-success response', simulationResponse);
        setSurveyError('Population simulation failed. Please go back and try again.');
      }
    } catch (error: any) {
      console.error('[PB] handleStartSurvey: CAUGHT ERROR', {
        message: error?.message,
        status: error?.response?.status,
        responseData: error?.response?.data,
        full: error,
      });
      // ── FIX 3: API threw — show error with retry option instead of trapping user ──
      setSurveyError('Something went wrong starting the survey. Please go back and try again.');
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
    console.log('[PB] ensureSurveyRun called', {
      surveySimulationId,
      simulationResultId: simulationResult?.id,
      workspaceId,
      explorationId,
      hasExistingPromise: !!surveyEnsurePromiseRef.current,
    });
    if (surveySimulationId) return surveySimulationId;
    if (surveyEnsurePromiseRef.current) return surveyEnsurePromiseRef.current;
    if (!workspaceId || !explorationId || !simulationResult?.id) {
      console.error('[PB] ensureSurveyRun: missing context', { workspaceId, explorationId, simulationResultId: simulationResult?.id });
      throw new Error('Missing survey simulation context.');
    }

    const personaIds = getPersonaIdsForSurvey();
    const shouldForceRerun =
      questionnaireModified ||
      sessionStorage.getItem(`forceRerun_${explorationId}`) === 'true';

    console.log('[PB] ensureSurveyRun: firing mutateAsync', {
      personaIds,
      simulationId: simulationResult.id,
      shouldForceRerun,
    });

    const promise = ensureSurveySimulationMutation.mutateAsync({
      workspaceId,
      explorationId,
      personaIds,
      simulationId: simulationResult.id,
      forceRerun: shouldForceRerun,
    }).then((result) => {
      console.log('[PB] ensureSurveyRun: mutateAsync resolved', { result });
      const nextSurveySimulationId = result?.data?.id;
      if (!nextSurveySimulationId) {
        console.error('[PB] ensureSurveyRun: no id in result', result);
        throw new Error('Survey simulation did not return an ID.');
      }
      setSurveySimulationId(nextSurveySimulationId);
      localStorage.setItem(`quant_sub3_${explorationId}`, '1');
      sessionStorage.removeItem(`activeSurveySim_${explorationId}`);
      sessionStorage.removeItem(`forceRerun_${explorationId}`);
      setQuestionnaireModified(false);
      return nextSurveySimulationId;
    }).catch((err: any) => {
      console.error('[PB] ensureSurveyRun: CAUGHT ERROR', {
        message: err?.message,
        status: err?.response?.status,
        responseData: err?.response?.data,
      });
      throw err;
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

  // ── FIX 4: handleSurveyComplete — on failure go back to setup, never trap user ──
  const handleSurveyComplete = async () => {
    console.log('[PB] handleSurveyComplete: fired', {
      questionnaireReady: questionnaireReadyRef.current,
      surveySimulationId,
      simulationResultId: simulationResult?.id,
    });

    // If there was an error during handleStartSurvey, go back to setup
    if (surveyError) {
      setPhase('setup');
      setSurveyError(null);
      return;
    }

    try {
      if (!questionnaireReadyRef.current) {
        const WAIT_MS = 90_000;
        const TICK_MS = 2_000;
        let waited = 0;
        while (!questionnaireReadyRef.current && waited < WAIT_MS) {
          await new Promise<void>((r) => setTimeout(r, TICK_MS));
          waited += TICK_MS;
        }
      }

      // If still not ready after waiting, go back to setup instead of hanging
      if (!questionnaireReadyRef.current) {
        console.error('[PB] handleSurveyComplete: questionnaire never became ready after 90s');
        setSurveyError('Survey setup timed out. Please try again.');
        setPhase('setup');
        return;
      }

      console.log('[PB] handleSurveyComplete: questionnaire ready, calling ensureSurveyRun');
      await ensureSurveyRun();
      console.log('[PB] handleSurveyComplete: ensureSurveyRun done, setting phase = insights');
      setPhase('insights');
    } catch (error: any) {
      console.error('[PB] handleSurveyComplete: CAUGHT ERROR', {
        message: error?.message,
        status: error?.response?.status,
        responseData: error?.response?.data,
      });
      // ── FIX 5: Instead of alert + stuck forever, go back to setup with error ──
      setSurveyError('Survey simulation could not be completed. Please try again.');
      setPhase('setup');
    }
  };

  const handleEditConfiguration = () => {
    setSurveyError(null);
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
      state: { surveyConfig, fromPopulationBuilder: true, forceRerun: questionnaireModified, viewOnly: isViewOnly },
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

      {/* ── FIX 6: Error banner shown on setup page after being sent back ── */}
      {phase === 'setup' && surveyError && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#ff4444',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '8px',
          fontSize: '14px',
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {surveyError}
        </div>
      )}
    </div>
  );
};

export default PopulationBuilder;