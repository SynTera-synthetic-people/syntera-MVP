import { useMemo } from "react";
import { useExploration } from "./useExplorations";
import { usePersonas } from "./useQuantitativeQueries";

// ── Types ────────────────────────────────────────────────────────────────────

export interface StepProgressResult {
  completedSteps: number[];
  currentStep: number;
  isStepUnlocked: (step: number) => boolean;
  isStepCompleted: (step: number) => boolean;
  isLoading: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Derives step completion state for the 4-step research flow.
 *
 * Step 1 — Research Objectives     : complete when exploration.research_objective exists (backend)
 * Step 2 — Persona Creation        : complete when at least 1 persona exists (backend)
 * Step 3 — Qualitative Exploration : complete when all 3 qual sub-steps are done (localStorage)
 * Step 4 — Quantitative Exploration: complete when all 4 quant sub-steps are done (localStorage)
 *
 * Step 3 is UNLOCKED when step 2 is done AND exploration.is_qualitative === true (approach chosen).
 * Step 4 is UNLOCKED when step 3 is done OR exploration.approach === "quantitative".
 */
export const useStepProgress = (
  workspaceId: string | undefined,
  explorationId: string | undefined
): StepProgressResult => {
  const { data: explorationData, isLoading: explorationLoading } =
    useExploration(explorationId);

  const { data: personasData, isLoading: personasLoading } = usePersonas(
    workspaceId,
    explorationId
  );

  const isLoading = explorationLoading || personasLoading;

  const exploration = (explorationData as any)?.data || explorationData;
  const personas: any[] = (personasData as any)?.data ?? [];

  // ── Step 1: backend driven ───────────────────────────────────────────────

  const step1Complete = useMemo((): boolean => {
    return !!(exploration?.research_objective);
  }, [exploration]);

  // ── Step 2: backend driven ───────────────────────────────────────────────

  const step2Complete = useMemo((): boolean => {
    return Array.isArray(personas) && personas.length > 0;
  }, [personas]);

  // ── Step 3: localStorage driven (sub-step granularity) ──────────────────
  // is_qualitative only means "approach chosen", NOT that qual work is done.
  // True completion requires all 3 qual sub-steps to be finished.

  const step3Complete = useMemo((): boolean => {
    if (!explorationId) return false;
    return (
      !!localStorage.getItem(`qualitative_sub1_${explorationId}`) &&
      !!localStorage.getItem(`qualitative_sub2_${explorationId}`) &&
      !!localStorage.getItem(`qualitative_sub3_${explorationId}`)
    );
  }, [explorationId]);

  // ── Step 4: localStorage driven (sub-step granularity) ──────────────────
  // is_quantitative only means "approach chosen", NOT that quant work is done.
  // True completion requires all 4 quant sub-steps to be finished.

  const step4Complete = useMemo((): boolean => {
    if (!explorationId) return false;
    return (
      !!localStorage.getItem(`quantitative_sub1_${explorationId}`) &&
      !!localStorage.getItem(`quantitative_sub2_${explorationId}`) &&
      !!localStorage.getItem(`quantitative_sub3_${explorationId}`) &&
      !!localStorage.getItem(`quantitative_sub4_${explorationId}`)
    );
  }, [explorationId]);

  // ── Derived completedSteps ───────────────────────────────────────────────

  const completedSteps = useMemo((): number[] => {
    const completed: number[] = [];
    if (step1Complete) completed.push(1);
    if (step2Complete) completed.push(2);
    if (step3Complete) completed.push(3);
    if (step4Complete) completed.push(4);
    return completed;
  }, [step1Complete, step2Complete, step3Complete, step4Complete]);

  // ── Unlock logic ─────────────────────────────────────────────────────────

  const isStepUnlocked = useMemo(
    () =>
      (step: number): boolean => {
        if (step === 1) return true;
        if (step === 2) return step1Complete;
        if (step === 3) return step1Complete && step2Complete;
        if (step === 4) return (
          step1Complete &&
          step2Complete &&
          (
            step3Complete ||                                      // qual fully done
            exploration?.is_qualitative === true ||              // qual approach chosen (mid-flow)
            exploration?.approach === "quantitative"             // quant-only flow
          )
        );
        return false;
      },
    [step1Complete, step2Complete, step3Complete, exploration]
  );

  const isStepCompleted = useMemo(
    () =>
      (step: number): boolean => {
        return completedSteps.includes(step);
      },
    [completedSteps]
  );

  // ── Current step ─────────────────────────────────────────────────────────

  const currentStep = useMemo((): number => {
    if (!step1Complete) return 1;
    if (!step2Complete) return 2;
    if (!step3Complete) return 3;
    return 4;
  }, [step1Complete, step2Complete, step3Complete]);

  return {
    completedSteps,
    currentStep,
    isStepUnlocked,
    isStepCompleted,
    isLoading,
  };
};