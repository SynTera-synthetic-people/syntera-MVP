// ══════════════════════════════════════════════════════════════════════════════
// getExplorationResumeRoute
//
// Returns the correct route for the "Continue" button on the exploration list.
//
// ROUTING PRIORITY:
//   1. Backend DB fields (current_step / qual_step / quant_step / is_qualitative /
//      is_quantitative) — DB-backed, device & browser independent. Always accurate.
//   2. localStorage milestones — used as a secondary signal for within-step
//      granularity when backend fields are absent (legacy / partial data).
//
// Step milestone keys in localStorage (all keyed by explorationId):
//   step1_done_{id}          Set when Research Objective is submitted
//   step2_done_{id}          Set when PersonaGenerationLoader completes
//   qualitative_sub1_{id}    Set when Discussion Guide step is COMPLETED
//   qualitative_sub2_{id}    Set when In-depth Interviews step is COMPLETED
//   qualitative_sub3_{id}    Set when Insights Generation is COMPLETED
//   approach_{id}            Set when user selects an exploration method
//
// Backend current_step values:
//   "step_1"    → no RO yet             → research-mode
//   "step_2"    → RO done, no personas  → persona-builder
//   "step_3"    → personas exist / qual → depth-interview | chatview | persona-builder
//   "step_4"    → quantitative active   → population-builder
//   "completed" → exploration ended     → (handled by is_end flag)
// ══════════════════════════════════════════════════════════════════════════════

interface ExplorationData {
  id?: string;
  research_objective?: boolean | string | null;
  personas?: unknown[] | null;
  is_qualitative?: boolean | null;
  is_quantitative?: boolean | null;
  qualitative_done?: boolean | null;
  quantitative_done?: boolean | null;
  // Backend-computed routing fields (primary source of truth — DB-backed)
  current_step?: string | null;  // "step_1"|"step_2"|"step_3"|"step_4"|"completed"
  qual_step?: string | null;     // "guide"|"interviews"|"insights"
  quant_step?: string | null;    // "questionnaire"|"population"|"survey"|"insights"
}

export const getExplorationResumeRoute = (
  exploration: ExplorationData,
  workspaceId: string
): string => {
  const id = exploration.id;
  if (!id || !workspaceId) return '/';

  const base = `/main/organization/workspace/research-objectives/${workspaceId}/${id}`;

  // ── 1. BACKEND DATA (primary — DB-backed, session/device-independent) ─────
  const currentStep = exploration.current_step;
  const qualStep    = exploration.qual_step;    // "guide"|"interviews"|"insights"
  // const quantStep   = exploration.quant_step; // reserved for future quant sub-routing

  // ── 2. LOCALSTORAGE (secondary — fine-grained within-session signals) ─────
  const step1Done  = !!localStorage.getItem(`step1_done_${id}`);
  const step2Done  = !!localStorage.getItem(`step2_done_${id}`);
  const sub1Done   = !!localStorage.getItem(`qualitative_sub1_${id}`);
  const sub2Done   = !!localStorage.getItem(`qualitative_sub2_${id}`);
  const sub3Done   = !!localStorage.getItem(`qualitative_sub3_${id}`);
  const approachLS = localStorage.getItem(`approach_${id}`);

  // ── Route: Step 4 — Quantitative active ───────────────────────────────────
  // Backend is_quantitative is the most reliable signal.
  // sub3Done + approach localStorage used as fallback for same-session.
  if (
    currentStep === 'step_4' ||
    exploration.is_quantitative ||
    (sub3Done && (approachLS === 'quantitative' || approachLS === 'both'))
  ) {
    return `${base}/population-builder`;
  }

  // ── Route: Step 3 — Qualitative method selected ───────────────────────────
  if (exploration.is_qualitative) {
    // Backend qual_step is the most accurate sub-step indicator.
    // "insights" means interviews are done → chatview (insight generation).
    // "guide" or "interviews" means still in depth-interview phase.
    if (qualStep === 'insights' || sub2Done) {
      return `${base}/chatview`;
    }
    return `${base}/depth-interview`;
  }

  // ── Route: Step 3 — Personas exist but method not yet selected ───────────
  // current_step="step_3" with is_qualitative=false + is_quantitative=false
  // means personas are built but approach hasn't been confirmed to the backend yet.
  if (currentStep === 'step_3') {
    // Check localStorage for approach selection (in-progress, not yet persisted)
    if (approachLS === 'quantitative') return `${base}/population-builder`;
    if (approachLS === 'qualitative' || approachLS === 'both') {
      if (qualStep === 'insights' || sub2Done) return `${base}/chatview`;
      return `${base}/depth-interview`;
    }
    // No approach selected → persona-builder grid (user needs to select approach)
    return `${base}/persona-builder`;
  }

  // ── Route: localStorage approach fallback (no backend step data available) ─
  // Handles the case where current_step is null/missing (older API responses).
  if (approachLS) {
    if (approachLS === 'quantitative') return `${base}/population-builder`;
    // qualitative or both
    if (qualStep === 'insights' || sub2Done) return `${base}/chatview`;
    if (sub1Done) return `${base}/depth-interview`;
    return `${base}/depth-interview`;
  }

  // ── Also check backend is_qualitative/is_quantitative without current_step ─
  if (exploration.is_qualitative) {
    return `${base}/depth-interview`;
  }
  if (exploration.is_quantitative) {
    return `${base}/population-builder`;
  }

  // ── Route: Step 2 — RO done, personas in progress ─────────────────────────
  // Backend current_step="step_2" OR research_objective flag OR localStorage.
  if (
    currentStep === 'step_2' ||
    step2Done ||
    step1Done ||
    exploration.research_objective
  ) {
    return `${base}/persona-builder`;
  }

  // ── Default: Step 1 → start from the beginning ────────────────────────────
  return `${base}/research-mode`;
};
