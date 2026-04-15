import React from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { TbArrowLeft, TbCheck } from "react-icons/tb";
import "./StepSidebarStyle.css";

// ── Types ────────────────────────────────────────────────────────────────────

interface StepItem {
  number: number;
  label: string;
  name: string;
  path: string;
}

interface StepSidebarProps {
  completedSteps: number[];
  isStepUnlocked: (step: number) => boolean;
}

// ── Step definitions ─────────────────────────────────────────────────────────

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
  },
  {
    number: 4,
    label: "Step 4",
    name: "Quantitative Exploration",
    path: "population-builder",
  },
];

// ── Component ────────────────────────────────────────────────────────────────

const StepSidebar: React.FC<StepSidebarProps> = ({
  completedSteps,
  isStepUnlocked,
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { workspaceId, explorationId, objectiveId } = useParams<{
    workspaceId: string;
    explorationId: string;
    objectiveId: string;
  }>();

  // explorationId is used in research-mode route, objectiveId in all others
  const currentId = explorationId || objectiveId;

  // Determine active step from current pathname
  const getActiveStep = (): number => {
    if (pathname.includes("research-mode")) return 1;
    if (
      pathname.includes("persona-builder") ||
      pathname.includes("persona-generating") ||
      pathname.includes("persona/add") ||
      pathname.includes("persona-preview")
    )
      return 2;
    if (
      pathname.includes("depth-interview") ||
      pathname.includes("chatview")
    )
      return 3;
    if (
      pathname.includes("population-builder") ||
      pathname.includes("survey-results") ||
      pathname.includes("questionnaire") ||
      pathname.includes("rebuttal-mode")
    )
      return 4;
    return 1;
  };

  const activeStep = getActiveStep();

  /**
   * A step is considered completed if:
   * 1. It's explicitly in the completedSteps array, OR
   * 2. The user has progressed past it (activeStep is greater than this step).
   *    This handles the case where the backend hasn't yet pushed the step into
   *    completedSteps but the user is clearly on a later step.
   */
  const isStepCompleted = (stepNumber: number): boolean =>
    completedSteps.includes(stepNumber) || activeStep > stepNumber;

  const handleStepClick = (step: StepItem) => {
    if (!isStepUnlocked(step.number)) return;
    if (!workspaceId || !currentId) return;

    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${currentId}/${step.path}`
    );
  };

  const handleBack = () => {
    if (workspaceId) {
      navigate(`/main/organization/workspace/explorations/${workspaceId}`);
    } else {
      navigate(-1);
    }
  };

  return (
    <aside className="step-sidebar">
      {/* Back button */}
      <button className="step-sidebar__back" onClick={handleBack}>
        <TbArrowLeft size={14} />
        <span>Back</span>
      </button>

      {/* Title */}
      <h2 className="step-sidebar__title">Research Exploration</h2>

      {/* Steps */}
      <nav className="step-sidebar__steps">
        {STEPS.map((step) => {
          const completed = isStepCompleted(step.number);
          const active = activeStep === step.number;
          const unlocked = isStepUnlocked(step.number);
          const locked = !unlocked;

          return (
            <button
              key={step.number}
              className={`step-sidebar__step
                ${active ? "step-sidebar__step--active" : ""}
                ${completed ? "step-sidebar__step--completed" : ""}
                ${locked ? "step-sidebar__step--locked" : ""}
              `}
              onClick={() => handleStepClick(step)}
              disabled={locked}
              aria-current={active ? "step" : undefined}
            >
              {/* Circle indicator */}
              <div
                className={`step-sidebar__circle
                  ${completed ? "step-sidebar__circle--completed" : ""}
                  ${active && !completed ? "step-sidebar__circle--active" : ""}
                  ${locked ? "step-sidebar__circle--locked" : ""}
                `}
              >
                {completed ? (
                  <TbCheck size={14} strokeWidth={2.5} />
                ) : (
                  <span>{step.number}</span>
                )}
              </div>

              {/* Step text */}
              <div className="step-sidebar__text">
                <span className="step-sidebar__label">{step.label}</span>
                <span className="step-sidebar__name">{step.name}</span>
              </div>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default StepSidebar;