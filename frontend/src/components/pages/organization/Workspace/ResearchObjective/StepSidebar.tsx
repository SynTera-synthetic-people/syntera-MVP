import React from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import SpIcon from "../../../../SPIcon";
import { useExplorations } from "../../../../../hooks/useExplorations";
import { useStepCompletion } from "./UsestepCompletion"; 
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
  // NOTE: completedSteps / isStepUnlocked props are kept for backward compat
  // but the hook now derives these from server data. You can remove the props
  // once all parent components are updated to not pass them.
  completedSteps?: number[];
  isStepUnlocked?: (step: number) => boolean;
  completedSubSteps?: number[];
  completedQuantSubSteps?: number[];
  isViewOnly?: boolean;
  hideBack?: boolean;
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
      { number: 1, label: "Step 1", name: "Discussion Guide",    path: "depth-interview" },
      { number: 2, label: "Step 2", name: "In-depth Interviews", path: "chatview" },
      { number: 3, label: "Step 3", name: "Insights Generation", path: "insights" },
    ],
  },
  {
    number: 4,
    label: "Step 4",
    name: "Quantitative Exploration",
    path: "questionnaire",
    subSteps: [
      { number: 1, label: "Step 1", name: "Questionnaire Design",    path: "questionnaire" },
      { number: 2, label: "Step 2", name: "Population Calibration",  path: "population-builder" },
      { number: 3, label: "Step 3", name: "Survey Execution",        path: "population-builder" },
      { number: 4, label: "Step 4", name: "Insights Generation",     path: "population-builder" },
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
    pathname.includes("questionnaire")
  ) return 4;
  return 1;
};

const getActiveQualSubStep = (pathname: string, currentId?: string): number => {
  if (pathname.includes("chatview")) {
    try {
      if (currentId && localStorage.getItem(`qualitative_sub3_${currentId}`)) return 3;
      if (currentId && localStorage.getItem(`qualitative_sub2_${currentId}`)) return 3;
    } catch { /* ignore */ }
    return 2;
  }
  if (pathname.includes("depth-interview")) return 1;
  return 0;
};

const getActiveQuantSubStep = (pathname: string, currentId?: string): number => {
  if (pathname.includes("population-builder")) {
    try {
      if (currentId && localStorage.getItem(`quant_sub4_${currentId}`)) return 4;
      if (currentId && localStorage.getItem(`quant_sub3_${currentId}`)) return 3;
      if (currentId && localStorage.getItem(`quant_sub2_${currentId}`)) return 2;
    } catch { /* ignore */ }
    return 2;
  }
  if (pathname.includes("survey-results")) {
    try {
      if (currentId && localStorage.getItem(`quant_sub3_${currentId}`)) return 4;
    } catch { /* ignore */ }
    return 3;
  }
  if (pathname.includes("questionnaire")) return 1;
  return 0;
};

// ── Component ─────────────────────────────────────────────────────────────────

const StepSidebar: React.FC<StepSidebarProps> = ({
  isViewOnly = false,
  hideBack = false,
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
  const activeQuantSubStep = getActiveQuantSubStep(pathname, currentId);

  // ── Fetch exploration data ────────────────────────────────────────────────
  const { data: explorationsData } = useExplorations(workspaceId);

  const exploration = React.useMemo(() => {
    if (!explorationsData || !currentId) return null;
    // explorationsData is your existing array — find the current one
    return (explorationsData as Array<{ id: string; title: string; [key: string]: unknown }>)
      .find((e) => e.id === currentId) ?? null;
  }, [explorationsData, currentId]);

  const explorationTitle = exploration?.title ?? null;

  // ── Step completion — single source of truth ──────────────────────────────
  //
  //    useStepCompletion checks server data (exploration object) first,
  //    then falls back to localStorage for in-session optimism.
  //    After logout/login the server data will be authoritative.
  //
  const {
    isStepCompleted,
    isQualSubStepCompleted,
    isQuantSubStepCompleted,
    isStepUnlocked,
  } = useStepCompletion(exploration, currentId);

  // ── Detect route-based loader screens ────────────────────────────────────

  let isBackEnabled = isStepCompleted(activeStep);

  const interviewsStillRunning =
    pathname.includes("chatview") &&
    !!currentId &&
    !isQualSubStepCompleted(2);

  const isRouteLoader =
    pathname.includes("persona-generating") ||
    interviewsStillRunning;

  const shouldHideBack = hideBack || isRouteLoader;

  // ── Navigation ─────────────────────────────────────────────────────────────

  const go = (path: string) =>
    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${currentId}/${path}`,
      { state: { viewOnly: isViewOnly } }
    );

  const handleStepClick = (step: StepItem) => {
    if (!isStepUnlocked(step.number) && !isStepCompleted(step.number)) return;
    if (!workspaceId || !currentId) return;

    if (step.number === 3) {
      if (isQualSubStepCompleted(3) || isQualSubStepCompleted(1)) {
        go("chatview");
      } else {
        go("depth-interview");
      }
      return;
    }

    if (step.number === 4) {
      go(isQuantSubStepCompleted(1) ? "population-builder" : "questionnaire");
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

      {!shouldHideBack && (
        <button
          className="step-sidebar__back"
          onClick={handleBack}
          title={!isBackEnabled ? "Complete the current step to go back" : undefined}
        >
          <SpIcon name="sp-Arrow-Arrow_Left_SM" />
          <span>Back</span>
        </button>
      )}

      <h2 className="step-sidebar__title">
        Research Exploration :
      </h2>
      {explorationTitle && (
        <p className="step-sidebar__exploration-name" title={explorationTitle}>
          {explorationTitle}
        </p>
      )}

      <nav className="step-sidebar__steps">
        {STEPS.map((step) => {
          const completed = isStepCompleted(step.number);
          const active    = activeStep === step.number;
          const locked    = !isStepUnlocked(step.number) && !completed;
          const showSubSteps = !!step.subSteps && active;

          return (
            <div key={step.number} className="step-sidebar__step-group">

              <button
                className={[
                  "step-sidebar__step",
                  active     ? "step-sidebar__step--active"    : "",
                  completed  ? "step-sidebar__step--completed" : "",
                  locked     ? "step-sidebar__step--locked"    : "",
                ].join(" ")}
                onClick={() => handleStepClick(step)}
                disabled={locked}
                aria-current={active ? "step" : undefined}
              >
                <div className={[
                  "step-sidebar__circle",
                  completed            ? "step-sidebar__circle--completed" : "",
                  active && !completed ? "step-sidebar__circle--active"    : "",
                  locked               ? "step-sidebar__circle--locked"    : "",
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

              {showSubSteps && step.subSteps && (
                <div className="step-sidebar__substeps">
                  {step.subSteps.map((sub) => {
                    const isQual = step.number === 3;

                    const subCompleted  = isQual
                      ? isQualSubStepCompleted(sub.number)
                      : isQuantSubStepCompleted(sub.number);

                    const activeSubStep = isQual ? activeQualSubStep : activeQuantSubStep;
                    const subActive     = activeSubStep === sub.number;

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
                          subActive     ? "step-sidebar__substep--active"    : "",
                          subCompleted  ? "step-sidebar__substep--completed" : "",
                          subLocked     ? "step-sidebar__substep--locked"    : "",
                        ].join(" ")}
                        onClick={() => handleSubStepClick(step, sub)}
                        disabled={subLocked}
                      >
                        <div className={[
                          "step-sidebar__substep-circle",
                          subCompleted               ? "step-sidebar__substep-circle--completed" : "",
                          subActive && !subCompleted ? "step-sidebar__substep-circle--active"    : "",
                          subLocked                  ? "step-sidebar__substep-circle--locked"    : "",
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