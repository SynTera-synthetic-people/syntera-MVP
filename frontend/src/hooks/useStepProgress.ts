import { useMemo } from "react";
import { useExploration } from "./useExplorations";
import { usePersonas } from "./useQuantitativeQueries";

// ── Types ────────────────────────────────────────────────────────────────────

export interface StepProgressResult {
  /** Steps that have been fully completed, e.g. [1, 2] */
  completedSteps: number[];
  /** The current active step (lowest unlocked incomplete step) */
  currentStep: number;
  /** Whether a given step number can be navigated to */
  isStepUnlocked: (step: number) => boolean;
  /** Whether a given step number has been completed */
  isStepCompleted: (step: number) => boolean;
  /** True while exploration or personas are still loading */
  isLoading: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Derives step completion state for the 4-step research flow.
 *
 * Step 1 — Research Objectives  : complete when exploration.research_objective exists
 * Step 2 — Persona Creation     : complete when at least 1 persona exists
 * Step 3 — Qualitative Exploration : complete when exploration.is_qualitative === true
 * Step 4 — Quantitative Exploration: complete when exploration.is_quantitative === true
 *
 * A step is "unlocked" when all previous steps are complete.
 * Step 1 is always unlocked.
 */
export const useStepProgress = (
  workspaceId: string | undefined,
  explorationId: string | undefined
): StepProgressResult => {
  // useExploration accepts the explorationId (called objectiveId in some components)
  const { data: explorationData, isLoading: explorationLoading } =
    useExploration(explorationId);

  // usePersonas returns { data: { data: Persona[] }, isLoading }
  const { data: personasData, isLoading: personasLoading } = usePersonas(
    workspaceId,
    explorationId
  );

  const isLoading = explorationLoading || personasLoading;

  // Resilient unwrap — matches the pattern used in PersonaBuilder.jsx
  const exploration = (explorationData as any)?.data || explorationData;

  // Persona array — matches the pattern used in PopulationBuilder.jsx
  const personas: any[] = (personasData as any)?.data ?? [];

  // ── Completion checks ───────────────────────────────────────────────────

  const step1Complete = useMemo((): boolean => {
    // Step 1 is done when Omi has confirmed a research objective on the backend
    return !!(exploration?.research_objective);
  }, [exploration]);

  const step2Complete = useMemo((): boolean => {
    // Step 2 is done when at least one persona has been created
    return Array.isArray(personas) && personas.length > 0;
  }, [personas]);

  const step3Complete = useMemo((): boolean => {
    // Step 3 (Qualitative) is done when the approach has been locked to qualitative
    return exploration?.is_qualitative === true;
  }, [exploration]);

  const step4Complete = useMemo((): boolean => {
    // Step 4 (Quantitative) is done when the approach has been locked to quantitative
    return exploration?.is_quantitative === true;
  }, [exploration]);

  // ── Derived values ──────────────────────────────────────────────────────

  const completedSteps = useMemo((): number[] => {
    const completed: number[] = [];
    if (step1Complete) completed.push(1);
    if (step2Complete) completed.push(2);
    if (step3Complete) completed.push(3);
    if (step4Complete) completed.push(4);
    return completed;
  }, [step1Complete, step2Complete, step3Complete, step4Complete]);

  /**
   * A step is unlocked when all steps before it are complete.
   * Step 1 is always unlocked (entry point).
   */
  const isStepUnlocked = useMemo(
    () =>
      (step: number): boolean => {
        if (step === 1) return true;
        if (step === 2) return step1Complete;
        if (step === 3) return step1Complete && step2Complete;
        if (step === 4) return step1Complete && step2Complete && step3Complete;
        return false;
      },
    [step1Complete, step2Complete, step3Complete]
  );

  const isStepCompleted = useMemo(
    () =>
      (step: number): boolean => {
        return completedSteps.includes(step);
      },
    [completedSteps]
  );

  /**
   * currentStep = the lowest step that is unlocked but not yet completed.
   * Falls back to step 4 if all steps are done.
   */
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