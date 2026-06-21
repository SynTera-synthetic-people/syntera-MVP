import React from 'react';
import { Outlet, useParams, useLocation } from 'react-router-dom';
import StepSidebar from './StepSidebar';
import { useStepProgress } from '../../../../../hooks/useStepProgress';
import { LoaderActiveProvider, useLoaderActive } from '../../../../../context/LoaderActiveContext';
import './ResearchObjectiveLayoutStyle.css';
import './StepSidebarStyle.css';

// ── Inner layout — reads loaderActive from context ────────────────────────────

const ResearchObjectiveLayoutInner: React.FC = () => {
  const { workspaceId, objectiveId } = useParams<{
    workspaceId: string;
    objectiveId: string;
  }>();
  const location = useLocation();
  const isViewOnly = Boolean((location.state as any)?.viewOnly);

  const { loaderActive } = useLoaderActive();

  // completedSteps and isStepUnlocked are now fully derived inside useStepProgress.
  // Steps 1 & 2 come from the backend (survive logout).
  // Steps 3 & 4 come from localStorage sub-step keys (written by child pages).
  // No filtering needed — useStepProgress now uses the correct completion signals.
  const { completedSteps, isStepUnlocked } = useStepProgress(
    workspaceId,
    objectiveId
  );

  // ── Read completed qualitative sub-steps from localStorage ───────────────
  //
  //   qualitative_sub1_{id}  → written by DepthInterview on "Proceed to Interviews"
  //   qualitative_sub2_{id}  → written by ChatView when all interviews are done
  //   qualitative_sub3_{id}  → written by ChatView on "Next" after Insights Generation
  //
  const completedSubSteps: number[] = [];
  if (objectiveId) {
    if (localStorage.getItem(`qualitative_sub1_${objectiveId}`)) completedSubSteps.push(1);
    if (localStorage.getItem(`qualitative_sub2_${objectiveId}`)) completedSubSteps.push(2);
    if (localStorage.getItem(`qualitative_sub3_${objectiveId}`)) completedSubSteps.push(3);
  }

  // ── Read completed quantitative sub-steps from localStorage ─────────────
  //
  //   quantitative_sub1_{id}  → written by Questionnaire page on completion
  //   quantitative_sub2_{id}  → written by PopulationBuilder on completion
  //   quantitative_sub3_{id}  → written by SurveyResults on completion
  //   quantitative_sub4_{id}  → written by RebuttalMode on completion
  //
  const completedQuantSubSteps: number[] = [];
  if (objectiveId) {
    if (localStorage.getItem(`quantitative_sub1_${objectiveId}`)) completedQuantSubSteps.push(1);
    if (localStorage.getItem(`quantitative_sub2_${objectiveId}`)) completedQuantSubSteps.push(2);
    if (localStorage.getItem(`quantitative_sub3_${objectiveId}`)) completedQuantSubSteps.push(3);
    if (localStorage.getItem(`quantitative_sub4_${objectiveId}`)) completedQuantSubSteps.push(4);
  }

  return (
    <div className="rol-root">

      <div className="rol-background">
        <div className="rol-bg-base" />
      </div>

      <StepSidebar
        completedSteps={completedSteps}
        isStepUnlocked={isStepUnlocked}
        completedSubSteps={completedSubSteps}
        completedQuantSubSteps={completedQuantSubSteps}
        isViewOnly={isViewOnly}
        hideBack={loaderActive}
      />

      <div className="rol-content">
        <div className="rol-page-inner">
          <Outlet />
        </div>
      </div>

    </div>
  );
};

// ── Outer layout — provides the context so children can write to it ───────────

const ResearchObjectiveLayout: React.FC = () => (
  <LoaderActiveProvider>
    <ResearchObjectiveLayoutInner />
  </LoaderActiveProvider>
);

export default ResearchObjectiveLayout;