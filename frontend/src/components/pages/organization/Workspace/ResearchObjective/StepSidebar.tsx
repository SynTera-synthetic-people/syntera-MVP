import React from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import SpIcon from "../../../../SPIcon";
import "./StepSidebarStyle.css";

// ── Types ────────────────────────────────────────────────────────────────────

interface SubStepItem {
  number: number;
  label: string;
  name: string;
  path: string;
}

interface StepItem {
  number: number;
  label: string;
  name: string;
  path: string;
  subSteps?: SubStepItem[];
}

interface StepSidebarProps {
  completedSteps: number[];
  isStepUnlocked: (step: number) => boolean;
  /** Which qualitative sub-steps are done: 1=Discussion Guide, 2=Interviews, 3=Insights */
  completedSubSteps?: number[];
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS: StepItem[] = [
  {
    number: 1,
    label: "Step 1",
    name: "Research Objectives",
    path: "research-mode",
  },
  {
    number: 2,
    label: "Step 2",
    name: "Persona Creation",
    path: "persona-builder",
  },
  {
    number: 3,
    label: "Step 3",
    name: "Qualitative Exploration",
    path: "depth-interview",
    subSteps: [
      { number: 1, label: "Step 1", name: "Discussion Guide", path: "depth-interview" },
      { number: 2, label: "Step 2", name: "In-depth Interviews", path: "chatview" },
      { number: 3, label: "Step 3", name: "Insights Generation", path: "chatview" },
    ],
  },
  {
    number: 4,
    label: "Step 4",
    name: "Quantitative Exploration",
    path: "population-builder",
  },
];

// ── Active-step helpers ───────────────────────────────────────────────────────

const getActiveStep = (pathname: string): number => {
  if (pathname.includes("research-mode")) return 1;
  if (
    pathname.includes("persona-builder") ||
    pathname.includes("persona-generating") ||
    pathname.includes("persona/add") ||
    pathname.includes("persona-preview") ||
    pathname.includes("approach-selection")
  ) return 2;
  if (
    pathname.includes('depth-interview') ||
    pathname.includes('chatview') ||
    pathname.includes('insights')
  ) return 3;
  if (
    pathname.includes("population-builder") ||
    pathname.includes("survey-results") ||
    pathname.includes("questionnaire") ||
    pathname.includes("rebuttal-mode")
  ) return 4;
  return 1;
};

/**
 * Active qualitative sub-step from pathname + localStorage:
 *   depth-interview → sub-step 1
 *   chatview        → sub-step 2 (or 3 if insights phase reached)
 */
const getActiveSubStep = (pathname: string, currentId?: string): number => {
  if (pathname.includes("chatview")) {
    if (currentId && localStorage.getItem(`qualitative_sub3_${currentId}`)) return 3;
    return 2;
  }
  if (pathname.includes("depth-interview")) return 1;
  return 0;
};

// ── Component ─────────────────────────────────────────────────────────────────

const StepSidebar: React.FC<StepSidebarProps> = ({
  completedSteps,
  isStepUnlocked,
  completedSubSteps = [],
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { workspaceId, explorationId, objectiveId } = useParams<{
    workspaceId: string;
    explorationId: string;
    objectiveId: string;
  }>();

  const currentId = explorationId || objectiveId;
  const activeStep = getActiveStep(pathname);
  const activeSubStep = getActiveSubStep(pathname, currentId);

  // ── localStorage milestone flags (set by child components on completion) ───
  //    Source of truth for steps 1 & 2 — the useStepProgress hook may lag
  //    behind because it depends on backend cache invalidation.
  const lsStep1Done = !!currentId && !!localStorage.getItem(`step1_done_${currentId}`);
  const lsStep2Done = !!currentId && !!localStorage.getItem(`step2_done_${currentId}`);

  // ── Completion helpers ──────────────────────────────────────────────────────

  // A sub-step is completed only when its milestone was explicitly written to
  // localStorage by the owning component.  Never infer from active step number.
  const isSubStepCompleted = (n: number): boolean =>
    completedSubSteps.includes(n);

  const isStepCompleted = (stepNumber: number): boolean => {
    if (stepNumber === 1) {
      return lsStep1Done || completedSteps.includes(1);
    }
    if (stepNumber === 2) {
      // Also treat step 2 as done if approach_ is set — that key predates step2_done
      // and is proof the user finished personas and selected an exploration method.
      const approachSet = !!currentId && !!localStorage.getItem(`approach_${currentId}`);
      return lsStep2Done || approachSet || completedSteps.includes(2);
    }
    if (stepNumber === 3) {
      // Step 3 is only complete when ALL three sub-steps are explicitly done.
      // We intentionally ignore completedSteps.includes(3) from the hook here
      // because the backend marks step 3 as started (not done) when the approach
      // is selected — which was causing the green check to appear prematurely.
      return (
        completedSubSteps.includes(1) &&
        completedSubSteps.includes(2) &&
        completedSubSteps.includes(3)
      );
    }
    return completedSteps.includes(stepNumber);
  };

  // ── Navigation ──────────────────────────────────────────────────────────────

  const go = (path: string) =>
    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${currentId}/${path}`
    );

  const handleStepClick = (step: StepItem) => {
    if (!isStepUnlocked(step.number) || !workspaceId || !currentId) return;
    if (step.number === 3) {
      // Go to furthest reached sub-step
      go(isSubStepCompleted(1) ? "chatview" : "depth-interview");
      return;
    }
    go(step.path);
  };

  const handleSubStepClick = (sub: SubStepItem) => {
    if (!workspaceId || !currentId) return;
    if (sub.number > 1 && !isSubStepCompleted(sub.number - 1)) return;
    go(sub.path);
  };

  const handleBack = () => {
    if (workspaceId) navigate(`/main/organization/workspace/explorations/${workspaceId}`);
    else navigate(-1);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <aside className="step-sidebar">

      <button className="step-sidebar__back" onClick={handleBack}>
        <SpIcon name="sp-Arrow-Arrow_Left_SM" />
        <span>Back</span>
      </button>

      <h2 className="step-sidebar__title">Research Exploration</h2>

      <nav className="step-sidebar__steps">
        {STEPS.map((step) => {
          const completed = isStepCompleted(step.number);
          const active = activeStep === step.number;
          // A step is unlocked if the hook says so, OR if localStorage shows
          // the previous step is done (the hook may lag behind backend).
          const lsUnlocked =
            step.number === 1 ? true :
              step.number === 2 ? lsStep1Done :
                // Step 3 is unlocked if:
                //   a) step2_done is set (new key), OR
                //   b) approach_ is set (old key — users who went through the old flow), OR
                //   c) the user is currently active on a step-3 route (they got here somehow, let them stay)
                step.number === 3 ? (lsStep2Done || !!localStorage.getItem(`approach_${currentId}`) || activeStep === 3) :
                  step.number === 4 ? (!!localStorage.getItem(`qualitative_sub3_${currentId}`)) :
                    false;
          const locked = !isStepUnlocked(step.number) && !lsUnlocked;
          const showSubSteps =
            !!step.subSteps &&
            (active || isStepCompleted(step.number));

          return (
            <div key={step.number} className="step-sidebar__step-group">

              {/* ── Main step row ── */}
              <button
                className={[
                  "step-sidebar__step",
                  active ? "step-sidebar__step--active" : "",
                  completed ? "step-sidebar__step--completed" : "",
                  locked ? "step-sidebar__step--locked" : "",
                ].join(" ")}
                onClick={() => handleStepClick(step)}
                disabled={locked}
                aria-current={active ? "step" : undefined}
              >
                <div className={[
                  "step-sidebar__circle",
                  completed ? "step-sidebar__circle--completed" : "",
                  active && !completed ? "step-sidebar__circle--active" : "",
                  locked ? "step-sidebar__circle--locked" : "",
                ].join(" ")}>
                  {completed
                    ? <SpIcon name="sp-Interface-Check" size={14} />
                    : <span>{step.number}</span>
                  }
                </div>

                <div className="step-sidebar__text">
                  <span className="step-sidebar__label">{step.label}</span>
                  <span className="step-sidebar__name">{step.name}</span>
                </div>
              </button>

              {/* ── Sub-steps (Qualitative only) ── */}
              {showSubSteps && step.subSteps && (
                <div className="step-sidebar__substeps">
                  {step.subSteps.map((sub) => {
                    const subCompleted = isSubStepCompleted(sub.number);
                    const subActive = active && activeSubStep === sub.number;
                    const subLocked =
                      sub.number > 1 &&
                      !isSubStepCompleted(sub.number - 1) &&
                      activeSubStep < sub.number;

                    return (
                      <button
                        key={sub.number}
                        className={[
                          "step-sidebar__substep",
                          subActive ? "step-sidebar__substep--active" : "",
                          subCompleted ? "step-sidebar__substep--completed" : "",
                          subLocked ? "step-sidebar__substep--locked" : "",
                        ].join(" ")}
                        onClick={() => handleSubStepClick(sub)}
                        disabled={subLocked}
                      >
                        <div className={[
                          "step-sidebar__substep-circle",
                          subCompleted ? "step-sidebar__substep-circle--completed" : "",
                          subActive && !subCompleted ? "step-sidebar__substep-circle--active" : "",
                          subLocked ? "step-sidebar__substep-circle--locked" : "",
                        ].join(" ")}>
                          {subCompleted
                            ? <SpIcon name="sp-Interface-Check" size={10} />
                            : <span>{sub.number}</span>
                          }
                        </div>

                        <div className="step-sidebar__text">
                          <span className="step-sidebar__label">{sub.label}</span>
                          <span className="step-sidebar__name">{sub.name}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

            </div>
          );
        })}
      </nav>

    </aside>
  );
};

export default StepSidebar;