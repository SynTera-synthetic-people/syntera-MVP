import React, { useEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import StepSidebar from './StepSidebar';
import { useStepProgress } from '../../../../../hooks/useStepProgress';
import './ResearchObjectiveLayoutStyle.css';
import './StepSidebarStyle.css';

const ResearchObjectiveLayout: React.FC = () => {
  const { workspaceId, objectiveId } = useParams<{
    workspaceId: string;
    objectiveId: string;
  }>();

  const { completedSteps: rawCompletedSteps, isStepUnlocked } = useStepProgress(
    workspaceId,
    objectiveId
  );

  // Strip step 3 from the hook's completedSteps — the backend marks step 3 as
  // "started" (not truly done) the moment an approach is selected, which caused
  // the Qualitative Exploration circle to show a premature green check.
  // Step 3 completion is determined exclusively by the three sub-step localStorage
  // keys (qualitative_sub1/2/3) inside StepSidebar's isStepCompleted().
  const completedSteps = (rawCompletedSteps ?? []).filter((n: number) => n !== 3);

  // ── One-time migration: clear stale sub-step keys ───────────────────────
  //
  // A previous version of this layout set qualitative_sub1/sub2 just by
  // visiting the route (not on completion).  Those stale keys make the
  // sidebar show a green check for steps the user never finished.
  //
  // On first mount for each exploration we check a version sentinel.
  // If it's absent, we clear ALL three sub-step keys so they can only be
  // re-written by the components that own each completion action.
  // This runs once per exploration per browser and is a no-op thereafter.
  useEffect(() => {
    if (!objectiveId) return;
    const versionKey = `sub_steps_v2_${objectiveId}`;
    if (!localStorage.getItem(versionKey)) {
      localStorage.removeItem(`qualitative_sub1_${objectiveId}`);
      localStorage.removeItem(`qualitative_sub2_${objectiveId}`);
      localStorage.removeItem(`qualitative_sub3_${objectiveId}`);
      localStorage.setItem(versionKey, '1');
    }
  }, [objectiveId]);

  // ── Read completed sub-steps from localStorage ────────────────────────────
  //
  // Sub-step milestones are written ONLY by the components that own the
  // "completion" action for that sub-step — never inferred from the current
  // URL.  This prevents all sub-steps from lighting up green just because
  // the user navigated to a later page.
  //
  //   qualitative_sub1_{id}  → written by DepthInterview when the user
  //                             clicks "Proceed to Interviews"
  //   qualitative_sub2_{id}  → written by ChatView when all interviews are done
  //   qualitative_sub3_{id}  → written by ChatView when user clicks "Next"
  //                             after Insights Generation
  //
  const completedSubSteps: number[] = [];
  if (objectiveId) {
    if (localStorage.getItem(`qualitative_sub1_${objectiveId}`)) completedSubSteps.push(1);
    if (localStorage.getItem(`qualitative_sub2_${objectiveId}`)) completedSubSteps.push(2);
    if (localStorage.getItem(`qualitative_sub3_${objectiveId}`)) completedSubSteps.push(3);
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
      />

      <div className="rol-content">
        <Outlet />
      </div>

    </div>
  );
};

export default ResearchObjectiveLayout;