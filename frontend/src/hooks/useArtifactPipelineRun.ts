import { useCallback, useRef, useState } from 'react';
import { artifactPipelineService } from '../services/artifactPipelineService';
import { getAxiosErrorMessage } from '../utils/axiosBlobError';

const POLL_INTERVAL_MS = 3000;
// Pipeline is now two phases (see artifact_pipeline_orchestrator.py): POST
// /runs only auto-runs Stages 1-3 and pauses at "questionnaire_ready" — Stage
// 4 (persona responses) requires a separate POST .../runs/{run_id}/personas.
// There's no review-gate UI yet, so startAndAwaitRun below auto-continues
// through that pause with the same personaIds it was called with.
const PHASE_1_PAUSE_STATUSES = new Set(['questionnaire_ready', 'failed']);
const TERMINAL_STATUSES = new Set(['completed', 'failed']);

// ── Types ────────────────────────────────────────────────────────────────────

export interface ArtifactRunPersonaProgress {
  completed: number;
  total: number;
}

export type ArtifactRunStage =
  | 'dissecting'
  | 'selecting_dimensions'
  | 'generating_guide'
  | 'questionnaire_ready'
  | 'generating_responses';

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
// Full state machine (see artifact_pipeline_orchestrator.py:600-639,676):
// pending -> dissecting -> selecting_dimensions -> generating_guide ->
// questionnaire_ready -> generating_responses -> completed | failed.
// "questionnaire_ready" is a run *status*, not a boolean flag in
// stages_completed (that dict only ever has the other four keys — see
// get_run_status()), so it never matches the completed[s] lookup below; it's
// listed here for state-machine documentation and getArtifactRunStageLabel
// resolves it directly from STAGE_LABELS instead, via status.status.
export const ARTIFACT_RUN_STAGE_ORDER: ArtifactRunStage[] = [
  'dissecting',
  'selecting_dimensions',
  'generating_guide',
  'questionnaire_ready',
  'generating_responses',
];

const STAGE_LABELS: Record<ArtifactRunStage, string> = {
  dissecting: 'Dissecting artifact',
  selecting_dimensions: 'Selecting dimensions',
  generating_guide: 'Generating guide',
  questionnaire_ready: 'Starting persona responses',
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

  // Generic poll loop, parameterized on which statuses should stop it —
  // reused for both the Phase 1 pause (questionnaire_ready/failed) and the
  // final Phase 2 wait (completed/failed).
  const pollUntil = useCallback((runId: string, stopStatuses: Set<string>): Promise<ArtifactRunStatus> => {
    return new Promise((resolve) => {
      const poll = async () => {
        try {
          const res = await artifactPipelineService.getRunStatus(workspaceId, objectiveId, runId);
          const data: ArtifactRunStatus = (res?.data ?? res) as ArtifactRunStatus;
          setStatus(data);
          if (stopStatuses.has(data?.status)) {
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
   *
   * Two-phase under the hood (see artifact_pipeline_orchestrator.py): POST
   * /runs only auto-runs Stages 1-3 and pauses at "questionnaire_ready" —
   * Stage 4 needs a separate POST .../personas. There's no review-gate UI
   * yet, so this auto-continues through that pause with the same personaIds
   * the caller passed in, keeping the UX identical to the old single-phase
   * flow from the caller's point of view.
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
      // No persona_ids here — create_run() no longer accepts them (Stages
      // 1-3 run with no persona involved); they're sent separately below,
      // once the run reaches questionnaire_ready.
      const payload: Record<string, unknown> = {
        source_file_ids: sourceFileIds.map((f) => (typeof f === 'object' ? f.id : f)),
        instruction: instruction ?? 'Evaluate this artifact against the persona.',
        artifact_type: artifactType,
      };
      if (artifactCategory) payload.artifact_category = artifactCategory;

      const createRes = await artifactPipelineService.createRun(workspaceId, objectiveId, payload);

      const runId: string | undefined = createRes?.data?.run_id ?? createRes?.run_id;
      if (!runId) throw new Error('Artifact run did not return a run_id');

      // Phase 1: wait for Stages 1-3 (auto-run server-side) to either pause
      // at questionnaire_ready or fail outright.
      const phase1Status = await pollUntil(runId, PHASE_1_PAUSE_STATUSES);
      if (phase1Status.status === 'failed') {
        setIsRunning(false);
        return phase1Status;
      }

      // Phase 2: no review gate yet, so immediately trigger Stage 4 with the
      // personas already selected. A failure here (network/4xx) must be
      // surfaced as a run failure, not left to hang — pollUntil above only
      // resolves on questionnaire_ready/failed, and nothing would otherwise
      // ever move this run to "generating_responses" or poll it further.
      try {
        await artifactPipelineService.triggerPersonaResponses(workspaceId, objectiveId, runId, personaIds);
      } catch (err) {
        console.error('Artifact pipeline: failed to trigger persona responses:', err);
        setError(err);
        setIsRunning(false);
        const message = await getAxiosErrorMessage(err, 'Failed to start persona response generation.');
        const failedStatus: ArtifactRunStatus = {
          ...phase1Status,
          status: 'failed',
          error_stage: 'generating_responses',
          error_message: message,
        };
        setStatus(failedStatus);
        return failedStatus;
      }

      const finalStatus = await pollUntil(runId, TERMINAL_STATUSES);
      setIsRunning(false);
      return finalStatus;
    } catch (err) {
      console.error('Artifact pipeline failed to start:', err);
      setError(err);
      setIsRunning(false);
      return null;
    }
  }, [workspaceId, objectiveId, pollUntil]);

  return { status, isRunning, error, startAndAwaitRun, stopPolling };
}