// orgDashboardData.ts
// ─────────────────────────────────────────────────────────────────────────
// Department-based mock data + calculation scaffolding for MyOrganization.
//
// Backend note: department/workspace names will come from the backend.
// DEPT_LABELS mirrors the truncated "SP Des...", "SP Dev..." labels seen
// in Figma on the x-axis of department charts.
// ─────────────────────────────────────────────────────────────────────────

export interface LinePoint  { name: string; value: number; }
export interface DeptPoint  { dept: string; value: number; }
export interface StackedPoint { month: string; singleUser: number; multiUser: number; }

// ─── Canonical department list ────────────────────────────────────────────────
// These are the truncated labels shown on chart x-axes in Figma.
// Backend will supply full names; swap DEPT_LABELS for the API response
// workspace/department names when integrating.

export const DEPARTMENTS: string[] = [
  "Sp Design",
  "Sp Development",
  "Sp Product",
  "Sp Marketing",
  "Sp Business",
  "Sp New Dev",
];

// Truncated labels exactly matching Figma x-axis tick text
export const DEPT_LABELS: string[] = [
  "SP Des...",
  "SP Dev...",
  "SP Prod...",
  "SP Marketi...",
  "SP Business...",
  "SP New Dev...",
];

// Workspace-style labels used in charts that group by workspace rather than dept
// (Explorations Launched, Reports Downloaded — Figma shows workspace names)
export const WORKSPACE_LABELS: string[] = [
  "Innovation...",
  "Customer S...",
  "Product Dev...",
  "Marketing S...",
  "Sales Opera...",
  "Human Res...",
];

export const MONTHS: string[] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

// ─── Raw per-exploration mock records ─────────────────────────────────────────

export interface ExplorationRecord {
  id: string;
  dept: string;
  /** Hours from RO creation to report download */
  timeToReportHrs: number;
  /** Number of users collaborating on this exploration */
  userCount: number;
  /** Persona confidence score (0–100) */
  personaConfidence: number;
  /** Number of personas this score is based on */
  personaCount: number;
  /** Population confidence score (0–100) */
  populationConfidence: number;
  /** Number of real people's actions data points analysed */
  peopleActionsAnalysed: number;
  /** Number of conversation threads analysed */
  conversationsAnalysed: number;
  /** Number of credible sources analysed */
  sourcesAnalysed: number;
  /** From feedback form: did this exploration replace a human study? */
  humanStudyReplaced: boolean;
  /** From feedback form: did this exploration reduce the human sample size? */
  humanSampleReduced: boolean;
  /** Month index 0–5 (Jan–Jun) when this exploration's report was downloaded */
  month: number;
}

// Deterministic pseudo-random so values stay stable across renders
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateMockExplorations(): ExplorationRecord[] {
  const records: ExplorationRecord[] = [];
  let seed = 1;
  DEPARTMENTS.forEach((dept, deptIdx) => {
    const count = 3 + (deptIdx % 4);
    for (let i = 0; i < count; i++) {
      seed += 1;
      const r1 = seededRandom(seed * 3.1);
      const r2 = seededRandom(seed * 7.7);
      const r3 = seededRandom(seed * 11.3);
      const r4 = seededRandom(seed * 17.9);
      const r5 = seededRandom(seed * 23.1);

      records.push({
        id: `${dept}-exp-${i + 1}`,
        dept,
        timeToReportHrs:       20  + Math.round(r1 * 60),
        userCount:              r2 > 0.5 ? 1 + Math.round(r2 * 3) : 1,
        personaConfidence:      50  + Math.round(r3 * 45),
        personaCount:           5   + Math.round(r1 * 20),
        populationConfidence:   45  + Math.round(r4 * 50),
        peopleActionsAnalysed:  10  + Math.round(r2 * 90),
        conversationsAnalysed:  8   + Math.round(r5 * 70),
        sourcesAnalysed:        5   + Math.round(r3 * 40),
        humanStudyReplaced:     r1 > 0.35,
        humanSampleReduced:     r4 > 0.4,
        month:                  (deptIdx + i) % MONTHS.length,
      });
    }
  });
  return records;
}

export const MOCK_EXPLORATIONS: ExplorationRecord[] = generateMockExplorations();

// ─── Calculation functions (per dev notes) ────────────────────────────────────

/**
 * Dev note 1: Avg time spent on each exploration (RO → report download),
 * per department, across the total lifetime use of SP.
 * total time-to-report / number of explorations in dept
 */
export function calcAvgTimePerExploration(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): DeptPoint[] {
  return DEPT_LABELS.map((label, idx) => {
    const dept = DEPARTMENTS[idx] ?? label;
    const deptExps = explorations.filter((e) => e.dept === dept);
    const total = deptExps.reduce((sum, e) => sum + e.timeToReportHrs, 0);
    const value = deptExps.length > 0 ? Math.round(total / deptExps.length) : 0;
    return { dept: label, value };
  });
}

/**
 * Dev note 2: Number of explorations with more than 2 users (multi-user)
 * vs single/2-user, per month, across total lifetime use of SP.
 * Legend-1: Single User, Legend-2: Multiple Users
 */
export function calcCollaborationRate(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): StackedPoint[] {
  return MONTHS.map((month, monthIdx) => {
    const monthExps = explorations.filter((e) => e.month === monthIdx);
    const singleUser = monthExps.filter((e) => e.userCount <= 2).length;
    const multiUser  = monthExps.filter((e) => e.userCount > 2).length;
    return { month, singleUser, multiUser };
  });
}

/**
 * Dev note 3: Avg persona confidence per department.
 * total persona confidence score (weighted) / total personas in dept.
 */
export function calcAvgPersonaConfidence(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): LinePoint[] {
  return DEPT_LABELS.map((label, idx) => {
    const dept = DEPARTMENTS[idx] ?? label;
    const deptExps = explorations.filter((e) => e.dept === dept);
    const totalPersonas = deptExps.reduce((sum, e) => sum + e.personaCount, 0);
    const totalScore    = deptExps.reduce((sum, e) => sum + e.personaConfidence * e.personaCount, 0);
    const value = totalPersonas > 0 ? Math.round(totalScore / totalPersonas) : 0;
    return { name: label, value };
  });
}

/**
 * Dev note 4: Avg population confidence per department.
 * total population score / total explorations in dept.
 */
export function calcAvgPopulationConfidence(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): LinePoint[] {
  return DEPT_LABELS.map((label, idx) => {
    const dept = DEPARTMENTS[idx] ?? label;
    const deptExps = explorations.filter((e) => e.dept === dept);
    const total = deptExps.reduce((sum, e) => sum + e.populationConfidence, 0);
    const value = deptExps.length > 0 ? Math.round(total / deptExps.length) : 0;
    return { name: label, value };
  });
}

/**
 * Dev note 5: Avg real people's actions analysed per department.
 * total people analysed / total explorations in dept.
 */
export function calcAvgRealPeopleActions(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): LinePoint[] {
  return DEPT_LABELS.map((label, idx) => {
    const dept = DEPARTMENTS[idx] ?? label;
    const deptExps = explorations.filter((e) => e.dept === dept);
    const total = deptExps.reduce((sum, e) => sum + e.peopleActionsAnalysed, 0);
    const value = deptExps.length > 0 ? Math.round(total / deptExps.length) : 0;
    return { name: label, value };
  });
}

/**
 * Dev note 6: Avg multi-platform conversation threads per department.
 * total conversation threads / total explorations in dept.
 */
export function calcAvgMultiplatformConversation(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): LinePoint[] {
  return DEPT_LABELS.map((label, idx) => {
    const dept = DEPARTMENTS[idx] ?? label;
    const deptExps = explorations.filter((e) => e.dept === dept);
    const total = deptExps.reduce((sum, e) => sum + e.conversationsAnalysed, 0);
    const value = deptExps.length > 0 ? Math.round(total / deptExps.length) : 0;
    return { name: label, value };
  });
}

/**
 * Dev note 6b: Avg credible sources contextualised per department.
 * total sources / total explorations in dept.
 */
export function calcAvgCredibleSources(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): LinePoint[] {
  return DEPT_LABELS.map((label, idx) => {
    const dept = DEPARTMENTS[idx] ?? label;
    const deptExps = explorations.filter((e) => e.dept === dept);
    const total = deptExps.reduce((sum, e) => sum + e.sourcesAnalysed, 0);
    const value = deptExps.length > 0 ? Math.round(total / deptExps.length) : 0;
    return { name: label, value };
  });
}

/**
 * Dev note 7: Human studies replaced per month.
 * Stacked bar: singleUser = total explorations, multiUser = replaced count.
 */
export function calcHumanStudiesReplaced(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): StackedPoint[] {
  return MONTHS.map((month, monthIdx) => {
    const monthExps = explorations.filter((e) => e.month === monthIdx);
    const singleUser = monthExps.length;
    const multiUser  = monthExps.filter((e) => e.humanStudyReplaced).length;
    return { month, singleUser, multiUser };
  });
}

/**
 * Dev note 8: Human sample reduced per month.
 * Stacked bar: singleUser = total explorations, multiUser = reduced count.
 */
export function calcHumanSampleReduced(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): StackedPoint[] {
  return MONTHS.map((month, monthIdx) => {
    const monthExps = explorations.filter((e) => e.month === monthIdx);
    const singleUser = monthExps.length;
    const multiUser  = monthExps.filter((e) => e.humanSampleReduced).length;
    return { month, singleUser, multiUser };
  });
}

// ─── Generic dept bar/line mocks ──────────────────────────────────────────────
// Used for charts that don't yet have a dedicated calc function.
// deptBarMock  → uses DEPT_LABELS  (SP Des..., SP Dev..., etc.)
// wsBarMock    → uses WORKSPACE_LABELS (Innovation..., Customer S..., etc.)

export function deptBarMock(seedOffset: number): DeptPoint[] {
  return DEPT_LABELS.map((dept, i) => ({
    dept,
    value: 35 + Math.round(seededRandom((i + 1) * seedOffset) * 50),
  }));
}

export function deptLineMock(seedOffset: number): LinePoint[] {
  return DEPT_LABELS.map((dept, i) => ({
    name: dept,
    value: 35 + Math.round(seededRandom((i + 1) * seedOffset) * 50),
  }));
}

// Workspace-name variants (used by Explorations Launched, Reports Downloaded)
export function wsBarMock(seedOffset: number): DeptPoint[] {
  return WORKSPACE_LABELS.map((dept, i) => ({
    dept,
    value: 35 + Math.round(seededRandom((i + 1) * seedOffset) * 50),
  }));
}

export function wsLineMock(seedOffset: number): LinePoint[] {
  return WORKSPACE_LABELS.map((name, i) => ({
    name,
    value: 35 + Math.round(seededRandom((i + 1) * seedOffset) * 50),
  }));
}

export function monthStackedMock(seedOffset: number): StackedPoint[] {
  return MONTHS.map((month, i) => ({
    month,
    singleUser: 30 + Math.round(seededRandom((i + 1) * seedOffset) * 50),
    multiUser:  10 + Math.round(seededRandom((i + 1) * seedOffset * 1.7) * 80),
  }));
}