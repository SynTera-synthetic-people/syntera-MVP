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
  // Strip step 4 for the same reason — completion is determined exclusively
  // by the four quantitative sub-step localStorage keys inside StepSidebar.
  const completedSteps = (rawCompletedSteps ?? []).filter(
    (n: number) => n !== 3 && n !== 4
  );

  // ── One-time migration: clear stale sub-step keys ───────────────────────
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
      />

      <div className="rol-content">
        <Outlet />
      </div>

    </div>
  );
};

export default ResearchObjectiveLayout;