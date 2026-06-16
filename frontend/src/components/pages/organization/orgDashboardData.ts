// orgDashboardData.ts
// Chart point type interfaces shared across the enterprise dashboard.
// All data is sourced from GET /enterprise/organizations/{id}/analytics.

export interface LinePoint    { name: string; value: number; }
export interface DeptPoint    { dept: string; value: number; }
export interface StackedPoint { month: string; singleUser: number; multiUser: number; }

export interface ExplorationRecord {
  id: string;
  dept: string;
  timeToReportHrs: number;
  userCount: number;
  personaConfidence: number;
  personaCount: number;
  populationConfidence: number;
  peopleActionsAnalysed: number;
  conversationsAnalysed: number;
  sourcesAnalysed: number;
  humanStudyReplaced: boolean;
  humanSampleReduced: boolean;
  month: number;
}
