import { useCallback, useRef, useState } from 'react';
import { artifactPipelineService } from '../services/artifactPipelineService';

const POLL_INTERVAL_MS = 3000;
const TERMINAL_STATUSES = new Set(['completed', 'failed']);

// ── Types ────────────────────────────────────────────────────────────────────

export interface ArtifactRunPersonaProgress {
  completed: number;
  total: number;
}

export type ArtifactRunStage = 'dissecting' | 'selecting_dimensions' | 'generating_guide' | 'generating_responses';

export interface ArtifactRunStatus {
  id: string;
  status: ArtifactRunStage | 'completed' | 'failed' | string;
  error_stage?: string | null;
  error_message?: string | null;
  // Backend sends this as an object of booleans per stage, not an array —
  // e.g. { dissecting: false, selecting_dimensions: false, ... }.
  stages_completed?: Partial<Record<ArtifactRunStage, boolean>>;
  persona_progress?: ArtifactRunPersonaProgress;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// Ordered so we can find the furthest-along stage for display purposes.
export const ARTIFACT_RUN_STAGE_ORDER: ArtifactRunStage[] = [
  'dissecting',
  'selecting_dimensions',
  'generating_guide',
  'generating_responses',
];

const STAGE_LABELS: Record<ArtifactRunStage, string> = {
  dissecting: 'Dissecting artifact',
  selecting_dimensions: 'Selecting dimensions',
  generating_guide: 'Generating guide',
  generating_responses: 'Generating responses',
};

/** Human-readable label for the current stage, given the raw status payload. */
export function getArtifactRunStageLabel(status: ArtifactRunStatus | null): string {
  if (!status) return 'Preparing artifact context for your personas…';
  if (status.status === 'failed') {
    return `Artifact processing failed${status.error_stage ? ` at "${status.error_stage}"` : ''}.`;
  }
  const completed = status.stages_completed ?? {};
  // Last stage that's true, or fall back to whatever `status.status` says is in progress.
  const lastDone = [...ARTIFACT_RUN_STAGE_ORDER].reverse().find((s) => completed[s]);
  const current = (status.status as ArtifactRunStage) in STAGE_LABELS
    ? STAGE_LABELS[status.status as ArtifactRunStage]
    : (lastDone ? STAGE_LABELS[lastDone] : 'Preparing artifact context for your personas…');
  return `${current}…`;
}

export interface SourceFileRef {
  id: string;
  // Shape returned by artifactPipelineService.getAvailableFiles() —
  // see list_artifact_files() in artifact_pipeline_orchestrator.py.
  has_file?: boolean;
  source_url?: string | null;
  artifact_category?: string | null;
  comparison_mode?: string | null;
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
      // Uploaded files are always images today — video artifacts only exist
      // as pasted links (see _resolve_asset's KNOWN GAP comment in
      // artifact_pipeline_orchestrator.py: the upload allowlist doesn't
      // accept video files yet). has_file distinguishes the two.
      const artifactType = sourceFileIds.every(
        (f) => typeof f === 'object' && f !== null && (f as SourceFileRef).has_file === false
      ) ? 'url' : 'image';

      // artifact_category / comparison_mode are intentionally omitted unless
      // the caller explicitly knows them. create_run() already derives both
      // from the selected files' own stored ResearchObjectivesFile values
      // (set once at Framer upload time) when omitted, and raises a clear
      // 400 if the selected files disagree. Guessing here (e.g. a hardcoded
      // 'general' category, or file-count > 1 => comparison_mode) would
      // either fail schema validation (comparison_mode is a strict enum,
      // not a boolean) or silently produce a wrong run.
      const payload: Record<string, unknown> = {
        source_file_ids: sourceFileIds.map((f) => (typeof f === 'object' ? f.id : f)),
        persona_ids: personaIds,
        instruction: instruction ?? 'Evaluate this artifact against the persona.',
        artifact_type: artifactType,
      };
      if (artifactCategory) payload.artifact_category = artifactCategory;

      const createRes = await artifactPipelineService.createRun(workspaceId, objectiveId, payload);

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