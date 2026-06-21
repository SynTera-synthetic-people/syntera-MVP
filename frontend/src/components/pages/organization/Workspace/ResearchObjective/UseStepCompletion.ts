import { useMemo, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ExplorationData {
  id: string;
  title?: string;

  // Add these fields to your API response (see MIGRATION PLAN below if missing)
  completedSteps?: number[];
  qualSubStepsCompleted?: number[];
  quantSubStepsCompleted?: number[];
  approach?: "qualitative" | "quantitative" | "both" | null;

  // Alternative: if your API uses a different shape, map it in the hook below.
  // e.g. status fields, boolean flags, nested objects — adapt as needed.
}

export interface StepCompletionResult {
  /** Is top-level step N done? */
  isStepCompleted: (stepNumber: number) => boolean;
  /** Is qual sub-step N done? */
  isQualSubStepCompleted: (n: number) => boolean;
  /** Is quant sub-step N done? */
  isQuantSubStepCompleted: (n: number) => boolean;
  /** Is step N unlocked (navigable)? */
  isStepUnlocked: (stepNumber: number) => boolean;
  /** Write a completion event — persists to localStorage AND should trigger your API save */
  markComplete: (key: CompletionKey) => void;
}

export type CompletionKey =
  | "step1"
  | "step2"
  | "qualSub1" | "qualSub2" | "qualSub3"
  | "quantSub1" | "quantSub2" | "quantSub3" | "quantSub4";

// ── LocalStorage key helpers (scoped to explorationId) ────────────────────────

const LS = {
  step1:    (id: string) => `step1_done_${id}`,
  step2:    (id: string) => `step2_done_${id}`,
  approach: (id: string) => `approach_${id}`,
  qualSub1: (id: string) => `qualitative_sub1_${id}`,
  qualSub2: (id: string) => `qualitative_sub2_${id}`,
  qualSub3: (id: string) => `qualitative_sub3_${id}`,
  quantSub1:(id: string) => `quantitative_sub1_${id}`,
  quantSub2:(id: string) => `quant_sub2_${id}`,
  quantSub3:(id: string) => `quant_sub3_${id}`,
  quantSub4:(id: string) => `quant_sub4_${id}`,
};

function lsGet(key: string): boolean {
  try { return !!localStorage.getItem(key); }
  catch { return false; }
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useStepCompletion(
  exploration: ExplorationData | null | undefined,
  /** Pass explorationId or objectiveId from useParams */
  currentId: string | undefined,
): StepCompletionResult {

  // ── Qual sub-step completion ─────────────────────────────────────────────

  const isQualSubStepCompleted = useCallback((n: number): boolean => {
    if (!currentId) return false;

    // 1. Server data is authoritative
    if (exploration?.qualSubStepsCompleted?.includes(n)) return true;

    // 2. Fall back to localStorage (covers the current session before next API sync)
    const keys: Record<number, string> = {
      1: LS.qualSub1(currentId),
      2: LS.qualSub2(currentId),
      3: LS.qualSub3(currentId),
    };
    return lsGet(keys[n] ?? "");
  }, [exploration, currentId]);

  // ── Quant sub-step completion ────────────────────────────────────────────

  const isQuantSubStepCompleted = useCallback((n: number): boolean => {
    if (!currentId) return false;

    if (exploration?.quantSubStepsCompleted?.includes(n)) return true;

    const keys: Record<number, string> = {
      1: LS.quantSub1(currentId),
      2: LS.quantSub2(currentId),
      3: LS.quantSub3(currentId),
      4: LS.quantSub4(currentId),
    };
    return lsGet(keys[n] ?? "");
  }, [exploration, currentId]);

  // ── Top-level step completion ────────────────────────────────────────────

  const isStepCompleted = useCallback((stepNumber: number): boolean => {
    if (!currentId) return false;

    // Server-side completion flags — always check first
    if (exploration?.completedSteps?.includes(stepNumber)) return true;

    switch (stepNumber) {
      case 1:
        // Step 1 is done when the API says so (above) OR localStorage has the key
        return lsGet(LS.step1(currentId));

      case 2:
        // Step 2 done = persona saved OR approach selected
        return (
          lsGet(LS.step2(currentId)) ||
          lsGet(LS.approach(currentId))
        );

      case 3:
        // Step 3 done = all 3 qual sub-steps complete
        return (
          isQualSubStepCompleted(1) &&
          isQualSubStepCompleted(2) &&
          isQualSubStepCompleted(3)
        );

      case 4:
        // Step 4 done = all 4 quant sub-steps complete
        return (
          isQuantSubStepCompleted(1) &&
          isQuantSubStepCompleted(2) &&
          isQuantSubStepCompleted(3) &&
          isQuantSubStepCompleted(4)
        );

      default:
        return false;
    }
  }, [exploration, currentId, isQualSubStepCompleted, isQuantSubStepCompleted]);

  // ── Step unlock logic ────────────────────────────────────────────────────

  const isStepUnlocked = useCallback((stepNumber: number): boolean => {
    switch (stepNumber) {
      case 1: return true;
      case 2: return isStepCompleted(1);
      case 3: return isStepCompleted(2);
      case 4:
        return (
          isStepCompleted(3) ||
          exploration?.approach === "quantitative"
        );
      default: return false;
    }
  }, [isStepCompleted, exploration]);

  // ── markComplete — write-through to localStorage + call your API ─────────

  const markComplete = useCallback((key: CompletionKey) => {
    if (!currentId) return;

    const lsKeyMap: Record<CompletionKey, string> = {
      step1:    LS.step1(currentId),
      step2:    LS.step2(currentId),
      qualSub1: LS.qualSub1(currentId),
      qualSub2: LS.qualSub2(currentId),
      qualSub3: LS.qualSub3(currentId),
      quantSub1:LS.quantSub1(currentId),
      quantSub2:LS.quantSub2(currentId),
      quantSub3:LS.quantSub3(currentId),
      quantSub4:LS.quantSub4(currentId),
    };

    try { localStorage.setItem(lsKeyMap[key], "true"); } catch { /* ignore */ }

    // ── TODO: also fire your API call here so the server is updated.
    //    Example (adapt to your actual API client / mutation hook):
    //
    //    apiClient.patch(`/explorations/${currentId}/complete`, { step: key });
    //
    //    Once the API persists this, the next time the user logs in and
    //    your useExplorations() hook fetches the exploration, the
    //    completedSteps / qualSubStepsCompleted fields will be populated
    //    and localStorage won't even be needed.

  }, [currentId]);

  return useMemo(() => ({
    isStepCompleted,
    isQualSubStepCompleted,
    isQuantSubStepCompleted,
    isStepUnlocked,
    markComplete,
  }), [isStepCompleted, isQualSubStepCompleted, isQuantSubStepCompleted, isStepUnlocked, markComplete]);
}
