/**
 * useStepCompletion.ts
 *
 * PROBLEM BEING SOLVED:
 * ---------------------
 * Step completion was stored only in localStorage, which is wiped on logout,
 * browser clear, or when a user switches devices. This caused completed steps
 * to appear incomplete after re-login, also blocking sidebar navigation.
 *
 * SOLUTION:
 * ---------
 * Derive completion from backend API data (the exploration object itself),
 * with localStorage as a WRITE-THROUGH CACHE only — never as the source of truth.
 *
 * HOW TO USE:
 * -----------
 * 1. Replace all the inline localStorage checks in StepSidebar with this hook.
 * 2. Pass the exploration object from your existing useExplorations() hook data.
 * 3. The hook returns isStepCompleted / isSubStepCompleted functions that check
 *    the server data first, falling back to localStorage for in-session optimism.
 *
 * BACKEND CONTRACT (adjust field names to match your actual API response):
 * -------------------------------------------------------------------------
 * Your exploration object should carry completion metadata. Minimal example:
 *
 *   {
 *     id: "abc123",
 *     title: "AI Automation...",
 *     completedSteps: [1, 2],                    // top-level steps done
 *     qualSubStepsCompleted: [1, 2, 3],          // qual sub-steps done
 *     quantSubStepsCompleted: [1, 2],            // quant sub-steps done
 *     approach: "qualitative" | "quantitative" | "both" | null,
 *     status: "draft" | "active" | "complete",
 *   }
 *
 * If your API doesn't return this yet, see MIGRATION PLAN at the bottom.
 */

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

/*
 * ════════════════════════════════════════════════════════════════════════════
 * MIGRATION PLAN — what to change when you don't control the API yet
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PHASE 1 (today, zero backend changes):
 *   - Drop this hook into StepSidebar. It still reads localStorage as before,
 *     but now ALL reads go through one place instead of scattered inline checks.
 *   - This alone doesn't fix logout data loss, but it sets up Phase 2.
 *
 * PHASE 2 (add one API field):
 *   - Ask your backend to return `completedSteps: number[]` on the exploration
 *     object (e.g. stored as a JSONB column or a related table).
 *   - Update the ExplorationData interface here to match.
 *   - The hook will automatically prefer server data over localStorage.
 *   - Users who log out and back in will now see correct step state.
 *
 * PHASE 3 (full persistence):
 *   - Add qualSubStepsCompleted and quantSubStepsCompleted to the API too.
 *   - Call markComplete() wherever you currently call localStorage.setItem()
 *     in your step pages (ResearchMode, PersonaBuilder, depth-interview, etc).
 *   - localStorage becomes a pure in-session cache; server is ground truth.
 *   - Delete the localStorage fallbacks in this hook once confident.
 *
 * ════════════════════════════════════════════════════════════════════════════
 */