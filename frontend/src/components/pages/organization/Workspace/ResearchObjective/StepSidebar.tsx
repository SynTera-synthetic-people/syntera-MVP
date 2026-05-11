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
  completedSubSteps?: number[];
  completedQuantSubSteps?: number[];
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
    path: "questionnaire",
    subSteps: [
      { number: 1, label: "Step 1", name: "Questionnaire Design", path: "questionnaire" },
      { number: 2, label: "Step 2", name: "Population Calibration", path: "population-builder" },
      { number: 3, label: "Step 3", name: "Survey Execution", path: "survey-results" },
      { number: 4, label: "Step 4", name: "Insights Generation", path: "rebuttal-mode" },
    ],
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
    pathname.includes("depth-interview") ||
    pathname.includes("chatview") ||
    pathname.includes("insights")
  ) return 3;
  if (
    pathname.includes("population-builder") ||
    pathname.includes("survey-results") ||
    pathname.includes("questionnaire") ||
    pathname.includes("rebuttal-mode")
  ) return 4;
  return 1;
};

const getActiveQualSubStep = (pathname: string, currentId?: string): number => {
  if (pathname.includes("chatview")) {
    if (currentId && localStorage.getItem(`qualitative_sub3_${currentId}`)) return 3;
    if (currentId && localStorage.getItem(`qualitative_sub2_${currentId}`)) return 3;
    return 2;
  }
  if (pathname.includes("depth-interview")) return 1;
  return 0;
};

const getActiveQuantSubStep = (pathname: string, currentId?: string): number => {
  if (pathname.includes("rebuttal-mode")) return 4;
  if (pathname.includes("survey-results")) return 3;
  if (pathname.includes("population-builder")) {
    if (currentId && localStorage.getItem(`quant_sub3_${currentId}`)) return 4;
    if (currentId && localStorage.getItem(`quant_sub2_${currentId}`)) return 3;
    return 2;
  }
  if (pathname.includes("questionnaire")) return 1;
  return 0;
};

// ── Component ─────────────────────────────────────────────────────────────────

const StepSidebar: React.FC<StepSidebarProps> = ({
  completedSteps,
  isStepUnlocked,
  completedSubSteps = [],
  completedQuantSubSteps = [],
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
  const activeQualSubStep = getActiveQualSubStep(pathname, currentId);
  const activeQuantSubStep = getActiveQuantSubStep(pathname);

  const lsStep1Done = !!currentId && !!localStorage.getItem(`step1_done_${currentId}`);
  const lsStep2Done = !!currentId && !!localStorage.getItem(`step2_done_${currentId}`);

  // ── Completion helpers ──────────────────────────────────────────────────────

  const isQualSubStepCompleted = (n: number): boolean => {
    if (completedSubSteps.includes(n)) return true;
    if (!currentId) return false;
    if (n === 1) return !!localStorage.getItem(`qualitative_sub1_${currentId}`);
    if (n === 2) return !!localStorage.getItem(`qualitative_sub2_${currentId}`);
    if (n === 3) return !!localStorage.getItem(`qualitative_sub3_${currentId}`);
    return false;
  };

  const isQuantSubStepCompleted = (n: number): boolean =>
    completedQuantSubSteps.includes(n);

  const isStepCompleted = (stepNumber: number): boolean => {
    if (stepNumber === 1) return lsStep1Done || completedSteps.includes(1);
    if (stepNumber === 2) {
      const approachSet = !!currentId && !!localStorage.getItem(`approach_${currentId}`);
      return lsStep2Done || approachSet || completedSteps.includes(2);
    }
    if (stepNumber === 3) {
      return (
        isQualSubStepCompleted(1) &&
        isQualSubStepCompleted(2) &&
        isQualSubStepCompleted(3)
      );
    }
    if (stepNumber === 4) {
      return (
        completedQuantSubSteps.includes(1) &&
        completedQuantSubSteps.includes(2) &&
        completedQuantSubSteps.includes(3) &&
        completedQuantSubSteps.includes(4)
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
    if (!isStepUnlocked(step.number) && !isStepCompleted(step.number)) return;
    if (!workspaceId || !currentId) return;

    if (step.number === 3) {
      go(isQualSubStepCompleted(1) ? "chatview" : "depth-interview");
      return;
    }

    if (step.number === 4) {
      if (isQuantSubStepCompleted(3)) go("rebuttal-mode");
      else if (isQuantSubStepCompleted(2)) go("survey-results");
      else if (isQuantSubStepCompleted(1)) go("population-builder");
      else go("questionnaire");
      return;
    }

    go(step.path);
  };

  const handleSubStepClick = (step: StepItem, sub: SubStepItem) => {
    if (!workspaceId || !currentId) return;

    if (sub.number > 1) {
      const prevDone =
        step.number === 3
          ? isQualSubStepCompleted(sub.number - 1)
          : isQuantSubStepCompleted(sub.number - 1);
      if (!prevDone) return;
    }

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

          const lsUnlocked =
            step.number === 1 ? true :
              step.number === 2 ? lsStep1Done :
                step.number === 3
                  ? (lsStep2Done || !!localStorage.getItem(`approach_${currentId}`) || activeStep === 3)
                  : step.number === 4
                    ? (
                      activeStep === 4 ||
                      !!localStorage.getItem(`qualitative_sub3_${currentId}`) ||
                      localStorage.getItem(`approach_${currentId}`) === 'quantitative'
                    )
                    : false;

          const locked = !isStepUnlocked(step.number) && !lsUnlocked;

          const showSubSteps =
            !!step.subSteps && (
              active ||
              completed ||
              (step.number === 3 && activeStep === 3) ||
              (step.number === 4 && activeStep === 4)
            );

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

              {/* ── Sub-steps ── */}
              {showSubSteps && step.subSteps && (
                <div className="step-sidebar__substeps">
                  {step.subSteps.map((sub) => {
                    const isQual = step.number === 3;

                    const subCompleted = isQual
                      ? isQualSubStepCompleted(sub.number)
                      : isQuantSubStepCompleted(sub.number);

                    const activeSubStep = isQual ? activeQualSubStep : activeQuantSubStep;
                    const subActive = active && activeSubStep === sub.number;

                    const subLocked =
                      sub.number > 1 &&
                      !(isQual
                        ? isQualSubStepCompleted(sub.number - 1)
                        : isQuantSubStepCompleted(sub.number - 1)) &&
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
                        onClick={() => handleSubStepClick(step, sub)}
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