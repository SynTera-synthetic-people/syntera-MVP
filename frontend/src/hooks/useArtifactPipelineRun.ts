import { useCallback, useRef, useState } from 'react';
import { artifactPipelineService } from '../services/artifactPipelineService';

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = new Set(['completed', 'failed']);

// ── Types ────────────────────────────────────────────────────────────────────

export interface ArtifactRunPersonaProgress {
  completed: number;
  total: number;
}

export interface ArtifactRunStatus {
  run_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | string;
  stages_completed?: string[];
  persona_progress?: ArtifactRunPersonaProgress;
  [key: string]: unknown;
}

export interface SourceFileRef {
  id: string;
  extension?: string;
  [key: string]: unknown;
}

export interface StartArtifactRunParams {
  sourceFileIds: (SourceFileRef | string)[];
  personaIds: string[];
  instruction?: string;
  artifactCategory?: string;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Runs the artifact pipeline to completion (or failure) and resolves.
 * Does NOT throw on pipeline failure by default — caller decides whether
 * a failed artifact run should still allow interviews to proceed.
 */
export function useArtifactPipelineRun(workspaceId: string, objectiveId: string) {
  const [status, setStatus] = useState<ArtifactRunStatus | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const pollUntilDone = useCallback((runId: string): Promise<ArtifactRunStatus> => {
    return new Promise((resolve) => {
      const poll = async () => {
        try {
          const res = await artifactPipelineService.getRunStatus(workspaceId, objectiveId, runId);
          const data: ArtifactRunStatus = (res?.data ?? res) as ArtifactRunStatus;
          setStatus(data);
          if (TERMINAL_STATUSES.has(data?.status)) {
            resolve(data);
            return;
          }
        } catch (err) {
          console.error('Artifact run status poll failed:', err);
          // transient network error — keep polling rather than aborting the whole flow
        }
        pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
      };
      poll();
    });
  }, [workspaceId, objectiveId]);

  /**
   * Kicks off a run and resolves once it reaches a terminal state.
   * Returns null (and sets `error`) if the run couldn't even be created —
   * caller should decide whether to still proceed to interviews in that case.
   */
  const startAndAwaitRun = useCallback(async ({
    sourceFileIds,
    personaIds,
    instruction,
    artifactCategory,
  }: StartArtifactRunParams): Promise<ArtifactRunStatus | null> => {
    setError(null);
    setIsRunning(true);
    try {
      const isComparison = sourceFileIds.length > 1;
      const firstFile = sourceFileIds[0];
      const artifactType = sourceFileIds.length === 1
        ? ((typeof firstFile === 'object' && firstFile?.extension) || 'unknown')
        : 'mixed';

      const createRes = await artifactPipelineService.createRun(workspaceId, objectiveId, {
        source_file_ids: sourceFileIds.map((f) => (typeof f === 'object' ? f.id : f)),
        persona_ids: personaIds,
        instruction: instruction ?? 'Evaluate this artifact against the persona.',
        artifact_type: artifactType,
        artifact_category: artifactCategory ?? 'general',
        comparison_mode: isComparison,
      });

      const runId: string | undefined = createRes?.data?.run_id ?? createRes?.run_id;
      if (!runId) throw new Error('Artifact run did not return a run_id');

      const finalStatus = await pollUntilDone(runId);
      setIsRunning(false);
      return finalStatus;
    } catch (err) {
      console.error('Artifact pipeline failed to start:', err);
      setError(err);
      setIsRunning(false);
      return null;
    }
  }, [workspaceId, objectiveId, pollUntilDone]);

  return { status, isRunning, error, startAndAwaitRun, stopPolling };
}