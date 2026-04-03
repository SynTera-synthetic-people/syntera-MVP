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

  // All child routes now use :objectiveId consistently (see App.tsx).
  // explorationId has been removed — objectiveId is always defined.
  const { completedSteps, isStepUnlocked, isLoading } = useStepProgress(
    workspaceId,
    objectiveId
  );

  // ── Temporary debug log ───────────────────────────────────────────────────
  // Remove this once sidebar steps are confirmed working correctly.
  // Check the browser console: if completedSteps is always [] even after
  // completing Step 1, the backend is not returning exploration.research_objective
  // and that field needs to be checked with the backend team.
  useEffect(() => {
    console.log('[StepProgress] workspaceId:', workspaceId);
    console.log('[StepProgress] objectiveId:', objectiveId);
    console.log('[StepProgress] isLoading:', isLoading);
    console.log('[StepProgress] completedSteps:', completedSteps);
  }, [workspaceId, objectiveId, isLoading, completedSteps]);

  return (
    <div className="rol-root">

      {/* ── Background ── */}
      <div className="rol-background">
        <div className="rol-bg-base" />
      </div>

      {/* ── Left: Step Sidebar ── */}
      <StepSidebar
        completedSteps={completedSteps}
        isStepUnlocked={isStepUnlocked}
      />

      {/* ── Right: Active step content ── */}
      <div className="rol-content">
        <Outlet />
      </div>

    </div>
  );
};

export default ResearchObjectiveLayout;