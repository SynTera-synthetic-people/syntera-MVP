// orgDashboardData.ts
// ─────────────────────────────────────────────────────────────────────────
// Department-based mock data + calculation scaffolding for MyOrganization.
//
// Backend note: department/workspace names will come from the backend.
// Using "Sp Design", "Sp Development", etc. as placeholders for now
// (mirrors the "SP Des...", "SP Dev..." truncated labels seen in Figma).
// ─────────────────────────────────────────────────────────────────────────

export interface LinePoint { name: string; value: number; }
export interface DeptPoint { dept: string; value: number; }
export interface StackedPoint { month: string; singleUser: number; multiUser: number; }

// ─── Canonical department list (placeholder until backend supplies names) ──

export const DEPARTMENTS: string[] = [
  "Sp Design",
  "Sp Development",
  "Sp Product",
  "Sp Marketing",
  "Sp Business",
  "Sp New Dev",
];

export const MONTHS: string[] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

// ─── Raw per-exploration mock records ───────────────────────────────────────
// Shape approximates what the backend would eventually send per exploration.
// Each exploration belongs to a workspace -> department.

export interface ExplorationRecord {
  id: string;
  dept: string;
  /** Hours from RO (research objective) creation to report download */
  timeToReportHrs: number;
  /** Number of users collaborating on this exploration */
  userCount: number;
  /** Persona confidence score (0-100) captured for this exploration */
  personaConfidence: number;
  /** Number of personas this confidence score is based on */
  personaCount: number;
  /** Population confidence score (0-100) captured for this exploration */
  populationConfidence: number;
  /** Number of "real people's actions" data points analysed */
  peopleActionsAnalysed: number;
  /** Number of credible sources / conversations analysed */
  sourcesAnalysed: number;
  /** From feedback form: did this exploration replace a human study? */
  humanStudyReplaced: boolean;
  /** From feedback form: did this exploration reduce the human sample size? */
  humanSampleReduced: boolean;
  /** Month index 0-5 (Jan-Jun) this exploration's report was downloaded */
  month: number;
}

// Deterministic pseudo-random mock generator so values stay stable across renders.
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateMockExplorations(): ExplorationRecord[] {
  const records: ExplorationRecord[] = [];
  let seed = 1;
  DEPARTMENTS.forEach((dept, deptIdx) => {
    // Vary exploration count per department (3-6)
    const count = 3 + (deptIdx % 4);
    for (let i = 0; i < count; i++) {
      seed += 1;
      const r1 = seededRandom(seed * 3.1);
      const r2 = seededRandom(seed * 7.7);
      const r3 = seededRandom(seed * 11.3);
      const r4 = seededRandom(seed * 17.9);

      records.push({
        id: `${dept}-exp-${i + 1}`,
        dept,
        timeToReportHrs: 20 + Math.round(r1 * 60),
        userCount: r2 > 0.5 ? 1 + Math.round(r2 * 3) : 1,
        personaConfidence: 50 + Math.round(r3 * 45),
        personaCount: 5 + Math.round(r1 * 20),
        populationConfidence: 45 + Math.round(r4 * 50),
        peopleActionsAnalysed: 10 + Math.round(r2 * 90),
        sourcesAnalysed: 5 + Math.round(r3 * 40),
        humanStudyReplaced: r1 > 0.35,
        humanSampleReduced: r4 > 0.4,
        month: (deptIdx + i) % MONTHS.length,
      });
    }
  });
  return records;
}

export const MOCK_EXPLORATIONS: ExplorationRecord[] = generateMockExplorations();

// ─── Calculation functions (per dev notes) ──────────────────────────────────
// All functions accept an exploration list so they can later be swapped to
// operate on live API data without changing call sites.

/**
 * Dev note 1: Avg time spent on each exploration (RO -> report download),
 * per department, across the total lifetime use of SP.
 *
 * total time-to-report for dept explorations / number of explorations in dept
 */
export function calcAvgTimePerExploration(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): DeptPoint[] {
  // TODO: replace with live aggregation once backend exposes
  // per-exploration RO->report-download timestamps.
  return DEPARTMENTS.map((dept) => {
    const deptExps = explorations.filter((e) => e.dept === dept);
    const total = deptExps.reduce((sum, e) => sum + e.timeToReportHrs, 0);
    const value = deptExps.length > 0 ? Math.round(total / deptExps.length) : 0;
    return { dept, value };
  });
}

/**
 * Dev note 2: Number of explorations with more than 2 users (multi-user)
 * vs single user, per department, across the total lifetime use of SP.
 * Legend-1: Single User, Legend-2: Multiple Users
 */
export function calcCollaborationRate(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): StackedPoint[] {
  // TODO: replace with live aggregation once backend exposes per-exploration
  // collaborator counts. Currently grouped by month to match the Figma
  // stacked-bar-by-month layout; dept grouping can be swapped in if the
  // chart is later changed to a per-department view.
  return MONTHS.map((month, monthIdx) => {
    const monthExps = explorations.filter((e) => e.month === monthIdx);
    const singleUser = monthExps.filter((e) => e.userCount <= 2).length;
    const multiUser = monthExps.filter((e) => e.userCount > 2).length;
    return { month, singleUser, multiUser };
  });
}

/**
 * Dev note 3: Avg persona confidence per department.
 * total persona confidence score / total number of personas within dept.
 */
export function calcAvgPersonaConfidence(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): LinePoint[] {
  // TODO: confirm whether "total persona score" means sum(confidence * personaCount)
  // or sum(confidence) once backend data is available; using weighted avg for now.
  return DEPARTMENTS.map((dept) => {
    const deptExps = explorations.filter((e) => e.dept === dept);
    const totalPersonas = deptExps.reduce((sum, e) => sum + e.personaCount, 0);
    const totalScore = deptExps.reduce(
      (sum, e) => sum + e.personaConfidence * e.personaCount,
      0
    );
    const value = totalPersonas > 0 ? Math.round(totalScore / totalPersonas) : 0;
    return { name: dept, value };
  });
}

/**
 * Dev note 4: Avg population confidence per department.
 * total population score / total number of explorations within dept.
 */
export function calcAvgPopulationConfidence(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): LinePoint[] {
  // TODO: replace with live aggregation once backend exposes
  // per-exploration population confidence scores.
  return DEPARTMENTS.map((dept) => {
    const deptExps = explorations.filter((e) => e.dept === dept);
    const total = deptExps.reduce((sum, e) => sum + e.populationConfidence, 0);
    const value = deptExps.length > 0 ? Math.round(total / deptExps.length) : 0;
    return { name: dept, value };
  });
}

/**
 * Dev note 5: Avg real people's actions analysed per department.
 * total sum of all people analysed / total number of explorations within dept.
 */
export function calcAvgRealPeopleActions(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): LinePoint[] {
  // TODO: replace with live aggregation once backend exposes
  // per-exploration "people analysed" counts.
  return DEPARTMENTS.map((dept) => {
    const deptExps = explorations.filter((e) => e.dept === dept);
    const total = deptExps.reduce((sum, e) => sum + e.peopleActionsAnalysed, 0);
    const value = deptExps.length > 0 ? Math.round(total / deptExps.length) : 0;
    return { name: dept, value };
  });
}

/**
 * Dev note 6: Avg credible sources / multi-platform conversations analysed
 * per department. total count of all conversations / total number of
 * explorations within dept.
 */
export function calcAvgCredibleSources(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): LinePoint[] {
  // TODO: replace with live aggregation once backend exposes
  // per-exploration "sources/conversations analysed" counts.
  return DEPARTMENTS.map((dept) => {
    const deptExps = explorations.filter((e) => e.dept === dept);
    const total = deptExps.reduce((sum, e) => sum + e.sourcesAnalysed, 0);
    const value = deptExps.length > 0 ? Math.round(total / deptExps.length) : 0;
    return { name: dept, value };
  });
}

/**
 * Dev note 6 is reused above for "Multi-platform Conversation" as well —
 * both charts currently map to the same underlying "sources analysed"
 * style aggregation per the dev notes' description. Exposed separately so
 * the two charts can diverge once distinct backend fields exist.
 */
export function calcAvgMultiplatformConversation(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): LinePoint[] {
  // TODO: backend currently does not distinguish "multi-platform conversation"
  // from "credible sources" — using the same sources-analysed field as a
  // placeholder until a dedicated field is available.
  return calcAvgCredibleSources(explorations);
}

/**
 * Dev note 7: Human studies replaced ratio per department.
 * (explorations marked human-study-replaced / total explorations in dept) * 100
 * Returned as a stacked bar dataset: total explorations vs replaced count,
 * matching the "Total Explorations / Replaced Human Studies" legend in Figma.
 */
export function calcHumanStudiesReplaced(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): StackedPoint[] {
  // TODO: replace with live aggregation once backend exposes the feedback-form
  // "human study replaced" flag per exploration. Currently grouped by month
  // to match the Figma stacked-bar-by-month layout.
  return MONTHS.map((month, monthIdx) => {
    const monthExps = explorations.filter((e) => e.month === monthIdx);
    const total = monthExps.length;
    const replaced = monthExps.filter((e) => e.humanStudyReplaced).length;
    return { month, singleUser: total, multiUser: replaced };
  });
}

/**
 * Dev note 8: Human sample reduced ratio per department.
 * (explorations marked human-sample-reduced / total explorations in dept) * 100
 * Returned as a stacked bar dataset: total explorations vs reduced count,
 * matching the "Total Explorations / Reduced Human Sample" legend in Figma.
 */
export function calcHumanSampleReduced(
  explorations: ExplorationRecord[] = MOCK_EXPLORATIONS
): StackedPoint[] {
  // TODO: replace with live aggregation once backend exposes the feedback-form
  // "human sample reduced" flag per exploration. Currently grouped by month
  // to match the Figma stacked-bar-by-month layout.
  return MONTHS.map((month, monthIdx) => {
    const monthExps = explorations.filter((e) => e.month === monthIdx);
    const total = monthExps.length;
    const reduced = monthExps.filter((e) => e.humanSampleReduced).length;
    return { month, singleUser: total, multiUser: reduced };
  });
}

// ─── Generic per-department line/bar datasets used as additional chart mocks ─
// These mirror chart shapes seen in Figma that don't yet have a dedicated
// calc function defined in the dev notes (Explorations Launched, Personas
// Calibrated, Reports Downloaded, Active Users, Decision Influenced, etc.)
// They are kept here so all mock numbers live in one place.

export function deptBarMock(seedOffset: number): DeptPoint[] {
  return DEPARTMENTS.map((dept, i) => ({
    dept,
    value: 35 + Math.round(seededRandom((i + 1) * seedOffset) * 50),
  }));
}

export function deptLineMock(seedOffset: number): LinePoint[] {
  return DEPARTMENTS.map((dept, i) => ({
    name: dept,
    value: 35 + Math.round(seededRandom((i + 1) * seedOffset) * 50),
  }));
}

export function monthStackedMock(seedOffset: number): StackedPoint[] {
  return MONTHS.map((month, i) => ({
    month,
    singleUser: 30 + Math.round(seededRandom((i + 1) * seedOffset) * 50),
    multiUser: 10 + Math.round(seededRandom((i + 1) * seedOffset * 1.7) * 80),
  }));
}