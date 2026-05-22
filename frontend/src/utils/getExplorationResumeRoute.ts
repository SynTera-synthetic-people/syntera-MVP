// ══════════════════════════════════════════════════════════════════════════════
// getExplorationResumeRoute
//
// Returns the correct route for the "Continue" button on the exploration list.
//
// Step milestone keys stored in localStorage (all keyed by explorationId /
// objectiveId — the same UUID used throughout the research flow):
//
//   step1_done_{id}          Set when Research Objective is submitted
//   step2_done_{id}          Set when PersonaGenerationLoader completes &
//                            navigates to persona-builder
//   qualitative_sub1_{id}    Set when Discussion Guide step is COMPLETED
//                            (user clicks "Proceed to Interviews" in DepthInterview)
//   qualitative_sub2_{id}    Set when In-depth Interviews step is COMPLETED
//                            (user reaches insights phase in ChatView)
//   qualitative_sub3_{id}    Set when Insights Generation is COMPLETED
//                            (user clicks "Next" from ChatView → quantitative /
//                             population-builder)
//   approach_{id}            Set when user selects an exploration method
//
// Resume priority (highest → lowest):
//   Step 4  – qualitative sub3 done & quantitative selected → population-builder
//   Step 3b – qualitative sub2 done (interviews started)    → chatview
//   Step 3a – qualitative sub1 done (guide started)         → depth-interview
//   Step 3  – approach selected but sub1 not done yet       → depth-interview (or population-builder for quant-only)
//   Step 2  – RO done (step1_done set)                      → persona-builder
//   Default – nothing done                                   → research-mode
// ══════════════════════════════════════════════════════════════════════════════

interface ExplorationData {
  id?: string;
  research_objective?: boolean | string | null;
  personas?: unknown[] | null;
  is_qualitative?: boolean | null;
  is_quantitative?: boolean | null;
  qualitative_done?: boolean | null;
  quantitative_done?: boolean | null;
}

export const getExplorationResumeRoute = (
  exploration: ExplorationData,
  workspaceId: string
): string => {
  const id = exploration.id;
  if (!id || !workspaceId) return '/';

  const base = `/main/organization/workspace/research-objectives/${workspaceId}/${id}`;

  // ── Read localStorage milestones ──────────────────────────────────────────

  const step1Done = !!localStorage.getItem(`step1_done_${id}`);
  const step2Done = !!localStorage.getItem(`step2_done_${id}`);
  const sub1Done  = !!localStorage.getItem(`qualitative_sub1_${id}`);
  const sub2Done  = !!localStorage.getItem(`qualitative_sub2_${id}`);
  const sub3Done  = !!localStorage.getItem(`qualitative_sub3_${id}`);
  const approach  = localStorage.getItem(`approach_${id}`);

  // ── Step 4: Qualitative fully done, quantitative selected ────────────────
  if (sub3Done && (exploration.is_quantitative || approach === 'quantitative' || approach === 'both')) {
    return `${base}/population-builder`;
  }

  // ── Step 3 sub-step 2+: Interviews started / insights phase ──────────────
  if (sub2Done) {
    return `${base}/chatview`;
  }

  // ── Step 3 sub-step 1: Discussion guide started ───────────────────────────
  if (sub1Done) {
    return `${base}/depth-interview`;
  }

  // ── Step 3: Approach selected but haven't started sub-steps yet ──────────
  if (approach) {
    if (approach === 'quantitative') {
      return `${base}/population-builder`;
    }
    // qualitative or both — land on depth-interview
    return `${base}/depth-interview`;
  }

  // ── Also fall back to backend flags for approach (if no localStorage) ─────
  if (exploration.is_qualitative || exploration.is_quantitative) {
    if (exploration.is_qualitative) return `${base}/depth-interview`;
    if (exploration.is_quantitative) return `${base}/population-builder`;
  }

  // ── Step 2: Research objective done → persona builder grid ───────────────
  //    Only go to persona-builder if step2 is explicitly done (personas exist).
  //    If step1 is done but step2 isn't, go to persona-builder so user can
  //    continue building personas.
  if (step2Done) {
    // Persona creation is complete — go to the grid so they can proceed
    return `${base}/persona-builder`;
  }

  if (step1Done || exploration.research_objective) {
    // RO is done but persona step may not be — go to persona-builder to continue
    return `${base}/persona-builder`;
  }

  // ── Default: start from the beginning ────────────────────────────────────
  return `${base}/research-mode`;
};