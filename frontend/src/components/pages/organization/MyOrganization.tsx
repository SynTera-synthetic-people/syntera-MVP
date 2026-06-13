import React, { useEffect, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TbBell,
  TbDots,
  TbPlus,
  TbInfoCircle,
  TbChevronDown,
  TbArrowRight,
  TbDownload,
} from "react-icons/tb";
import { HiUserGroup } from "react-icons/hi";
import { initializeSessionStart } from "../../../redux/slices/omiSlice";
import { adminService } from "../../../services/adminService";
import { getPostLoginPath } from "../../../utils/authRouting";
import { useWorkspaces } from "../../../hooks/useWorkspaces";
import { useExplorations } from "../../../hooks/useExplorations";
import {
  downloadLatestQuestionnaireCsvForExploration,
  alertQuestionnaireExportError,
} from "../../../utils/questionnaireExportFlow";
import {
  DEPARTMENTS,
  MONTHS,
  calcAvgTimePerExploration,
  calcCollaborationRate,
  calcAvgPersonaConfidence,
  calcAvgPopulationConfidence,
  calcAvgRealPeopleActions,
  calcAvgCredibleSources,
  calcAvgMultiplatformConversation,
  calcHumanStudiesReplaced,
  calcHumanSampleReduced,
  deptBarMock,
  deptLineMock,
  monthStackedMock,
  type LinePoint,
  type DeptPoint,
  type StackedPoint,
} from "./orgDashboardData";
import styles from "./MyOrganization.module.css";

// ─── Redux state shape ────────────────────────────────────────────────────────

interface AuthState {
  user?: { account_tier?: string } | null;
}
interface OmiState {
  isInitialized?: boolean;
}
interface OrganizationsState {
  organizations?: { data?: { name?: string; id?: string } };
}
interface RootState {
  auth: AuthState;
  omi: OmiState;
  organizations: OrganizationsState;
}

// ─── Domain types ─────────────────────────────────────────────────────────────

type Trend = "up" | "down" | "neutral";
interface TrendValue { value: string | number; unit?: string; trend?: Trend; }

interface DashboardStats {
  usageMetrics: {
    totalWorkspace: TrendValue;
    totalExploration: TrendValue;
    totalUsers: TrendValue;
  };
  outcomeInfluenced: {
    decisionsInfluenced: TrendValue;
    humanStudiesReplaced: TrendValue;
    humanSampleReduced: TrendValue;
  };
  economics: {
    researchTimeUnlocked: TrendValue;
    researchSpendSaved: TrendValue;
  };
  adoption: {
    workspacesCreated: number;
    explorationsLaunched: number;
    personasCalibrated: number;
    reportsDownloaded: number;
  };
  userEngagement: {
    registeredUsers: TrendValue;
    activeUsers: TrendValue;
    avgTimePerExploration: TrendValue;
    collaborationRate: TrendValue;
  };
  conviction: {
    personaConfidence: TrendValue;
    populationConfidence: number;
    realPeoplesActions: number;
    multiplatformConversation: number;
    credibleSources: number;
  };
  valueDelivered: {
    decisionInfluenced: TrendValue;
    timeSaved: TrendValue;
    researchSpendSaved: TrendValue;
    humanStudiesReplaced: number;
    humanSampleReduced: number;
  };
  kpi: {
    totalWorkflows: string;
    totalExplorations: string;
    totalUsers: string;
    outcomeInfluenced: string;
    hoursSaved: string;
    reportsDownloaded: string;
    humanStudiesAvoided: string;
  };
  charts: {
    workspacesCreated: DeptPoint[];
    explorationsLaunched: DeptPoint[];
    personasCalibrated: StackedPoint[];
    reportsDownloaded: LinePoint[];
    registeredUsers: LinePoint[];
    activeUsers: LinePoint[];
    avgTimePerExploration: DeptPoint[];
    collaborationRate: StackedPoint[];
    avgPersonaConfidence: LinePoint[];
    populationConfidence: LinePoint[];
    realPeoplesActions: LinePoint[];
    multiplatformConversation: LinePoint[];
    credibleSources: LinePoint[];
    decisionInfluenced: StackedPoint[];
    timeSaved: LinePoint[];
    researchSpendSaved: LinePoint[];
    humanStudiesReplaced: StackedPoint[];
    humanSampleReduced: StackedPoint[];
  };
}

// ─── API response shape ───────────────────────────────────────────────────────

interface MonthlyCount { month: number; count: number; }
interface WorkspaceQuality { workspace_name?: string; total_count?: number; avg_confidence?: number; }
interface ApiResponse {
  kpi_cards?: { total_workspaces?: number; total_explorations?: number; };
  active_chart?: {
    explorations_monthly?: MonthlyCount[];
    workspaces_monthly?: MonthlyCount[];
    report_downloads_monthly?: MonthlyCount[];
  };
  quality_logs?: {
    avg_persona_confidence?: WorkspaceQuality[];
    avg_population_confidence?: WorkspaceQuality[];
  };
  business_impact?: {
    qualitative_count?: number;
    quantitative_count?: number;
    both_count?: number;
  };
}

interface Workspace { id: string; name?: string; }
interface Exploration { id: string; title?: string; }

const MONTH_NAMES: string[] = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Mock chart data ──────────────────────────────────────────────────────────

const MOCK_CHARTS: DashboardStats["charts"] = {
  workspacesCreated: deptBarMock(3.1),
  explorationsLaunched: deptBarMock(5.3),
  personasCalibrated: monthStackedMock(2.9),
  reportsDownloaded: deptLineMock(7.1),
  registeredUsers: deptLineMock(4.2),
  activeUsers: deptLineMock(4.6),
  avgTimePerExploration: calcAvgTimePerExploration(),
  collaborationRate: calcCollaborationRate(),
  avgPersonaConfidence: calcAvgPersonaConfidence(),
  populationConfidence: calcAvgPopulationConfidence(),
  realPeoplesActions: calcAvgRealPeopleActions(),
  multiplatformConversation: calcAvgMultiplatformConversation(),
  credibleSources: calcAvgCredibleSources(),
  decisionInfluenced: monthStackedMock(6.4),
  timeSaved: deptLineMock(8.8),
  researchSpendSaved: deptLineMock(9.3),
  humanStudiesReplaced: calcHumanStudiesReplaced(),
  humanSampleReduced: calcHumanSampleReduced(),
};

const INITIAL_STATS: DashboardStats = {
  usageMetrics: {
    totalWorkspace:   { value: "000", trend: "up" },
    totalExploration: { value: "000", trend: "down" },
    totalUsers:       { value: "000", trend: "up" },
  },
  outcomeInfluenced: {
    decisionsInfluenced:  { value: "000%", trend: "down" },
    humanStudiesReplaced: { value: "000",  trend: "up" },
    humanSampleReduced:   { value: "000",  trend: "up" },
  },
  economics: {
    researchTimeUnlocked: { value: "000", unit: "hrs" },
    researchSpendSaved:   { value: "$000" },
  },
  adoption: {
    workspacesCreated: 123,
    explorationsLaunched: 234,
    personasCalibrated: 234,
    reportsDownloaded: 12,
  },
  userEngagement: {
    registeredUsers:       { value: "000%" },
    activeUsers:           { value: "000" },
    avgTimePerExploration: { value: "000" },
    collaborationRate:     { value: "000" },
  },
  conviction: {
    personaConfidence: { value: "000%" },
    populationConfidence: 0,
    realPeoplesActions: 0,
    multiplatformConversation: 0,
    credibleSources: 0,
  },
  valueDelivered: {
    decisionInfluenced: { value: "000%" },
    timeSaved:          { value: "000", unit: "hrs" },
    researchSpendSaved: { value: "000" },
    humanStudiesReplaced: 0,
    humanSampleReduced: 0,
  },
  kpi: {
    totalWorkflows: "0",
    totalExplorations: "0",
    totalUsers: "81",
    outcomeInfluenced: "68%",
    hoursSaved: "487",
    reportsDownloaded: "0",
    humanStudiesAvoided: "18",
  },
  charts: MOCK_CHARTS,
};

function mergeApiData(api: ApiResponse, prev: DashboardStats): DashboardStats {
  const mapMonthly = (arr?: MonthlyCount[]): LinePoint[] =>
    (arr ?? []).map((d) => ({ name: MONTH_NAMES[d.month] ?? `M${d.month}`, value: d.count }));

  const totalDownloads =
    api.active_chart?.report_downloads_monthly?.reduce((s, d) => s + d.count, 0) ?? 0;

  const personaConfData: LinePoint[] =
    api.quality_logs?.avg_persona_confidence?.map((d) => ({
      name: d.workspace_name ?? "Unknown",
      value: d.avg_confidence ?? 0,
    })) ?? prev.charts.avgPersonaConfidence;

  const popConfData: LinePoint[] =
    api.quality_logs?.avg_population_confidence?.map((d) => ({
      name: d.workspace_name ?? "Unknown",
      value: d.avg_confidence ?? 0,
    })) ?? prev.charts.populationConfidence;

  const exData = mapMonthly(api.active_chart?.explorations_monthly);
  const wsData = mapMonthly(api.active_chart?.workspaces_monthly);
  const reportsData = mapMonthly(api.active_chart?.report_downloads_monthly);

  return {
    ...prev,
    kpi: {
      ...prev.kpi,
      totalWorkflows: String(api.kpi_cards?.total_workspaces ?? prev.kpi.totalWorkflows),
      totalExplorations: String(api.kpi_cards?.total_explorations ?? prev.kpi.totalExplorations),
      reportsDownloaded: String(totalDownloads),
    },
    charts: {
      ...prev.charts,
      workspacesCreated:
        wsData.length > 0 ? wsData.map((p) => ({ dept: p.name, value: p.value })) : prev.charts.workspacesCreated,
      explorationsLaunched:
        exData.length > 0 ? exData.map((p) => ({ dept: p.name, value: p.value })) : prev.charts.explorationsLaunched,
      reportsDownloaded: reportsData.length > 0 ? reportsData : prev.charts.reportsDownloaded,
      avgPersonaConfidence: personaConfData,
      populationConfidence: popConfData,
    },
  };
}

// ─── Chart shared config ──────────────────────────────────────────────────────

const C = {
  barBlue:   "#6c7fdb",
  barTeal:   "#4ecdc4",
  barPurple: "#9b8cf0",
  line:      "#6c7fdb",
  grid:      "rgba(255,255,255,0.05)",
} as const;

const TTStyle: React.CSSProperties = {
  background: "#161b27",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: 12,
  color: "#e8eaf0",
};

const tickStyle = { fontSize: 10, fill: "#5c6880" } as const;

// ─── Period option types ──────────────────────────────────────────────────────

interface PeriodOption { value: string; label: string; }

const ANNUAL_OPTS: PeriodOption[] = [
  { value: "annually", label: "Annually" },
  { value: "monthly",  label: "Monthly"  },
  { value: "weekly",   label: "Weekly"   },
];
const ANNUAL_VARIANT_OPTS: PeriodOption[] = [
  { value: "annually", label: "Annual"  },
  { value: "monthly",  label: "Monthly" },
  { value: "weekly",   label: "Weekly"  },
];
const HALF_YEAR_OPTS: PeriodOption[] = [
  { value: "half_year", label: "Half Year" },
  { value: "annually",  label: "Annually"  },
  { value: "monthly",   label: "Monthly"   },
];
const ANNUAL_2026_OPTS: PeriodOption[] = [
  { value: "annually_2026", label: "Annually (2026)" },
  { value: "annually_2025", label: "Annually (2025)" },
];
const HOURS_OPTS: PeriodOption[] = [
  { value: "hours", label: "Hours" },
  { value: "days",  label: "Days"  },
];

// ─── Shared chart header ──────────────────────────────────────────────────────

interface ChartCtrlProps {
  title: string;
  value: string;
  onChange: (v: string) => void;
  options?: PeriodOption[];
  wide?: boolean;
}

const ChartCtrl: React.FC<ChartCtrlProps> = ({ title, value, onChange, options = ANNUAL_OPTS, wide }) => (
  <div className={styles.chartBlockTitleRow}>
    <span className={styles.chartBlockTitle}>
      {title} <TbChevronDown size={13} className={styles.chevron} />
    </span>
    <select
      className={`${styles.periodSelect} ${wide ? styles.periodSelectWide : ""}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`Period for ${title}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
);

const StackedLegend: React.FC<{ a: string; b: string }> = ({ a, b }) => (
  <div className={styles.chartLegend}>
    <div className={styles.legendItem}>
      <span className={styles.legendDot} style={{ background: C.barBlue }} />{a}
    </div>
    <div className={styles.legendItem}>
      <span className={styles.legendDot} style={{ background: C.barTeal }} />{b}
    </div>
  </div>
);

// ─── Notification items ───────────────────────────────────────────────────────

interface NotifItem { id: number; name: string; desc: string; time: string; cta?: boolean; unread?: boolean; }

const NOTIFS: NotifItem[] = [
  { id: 1, name: "Notification Name", desc: "Notification Name", time: "12:00 AM", cta: true, unread: true },
  { id: 2, name: "Notification Name", desc: "Notification Name", time: "12:00 AM", unread: true },
  { id: 3, name: "Notification Name", desc: "Notification Name", time: "12:00 AM" },
  { id: 4, name: "Notification Name", desc: "Notification Name", time: "12:00 AM" },
  { id: 5, name: "Notification Name", desc: "Notification Name", time: "12:00 AM" },
];

const NotifDropdown: React.FC = () => (
  <div className={styles.notifDropdown}>
    <div className={styles.notifHeader}>Notification Module</div>
    {NOTIFS.map((n) => (
      <div key={n.id} className={styles.notifItem}>
        <div className={styles.notifContent}>
          <span className={styles.notifName}>{n.name}</span>
          <span className={styles.notifDesc}>{n.desc}</span>
          <span className={styles.notifTime}>{n.time}</span>
        </div>
        <div className={styles.notifRight}>
          {n.cta && (
            <span className={styles.notifCta}>
              Button CTA <TbArrowRight size={12} />
            </span>
          )}
          {n.unread && <span className={styles.notifUnread} />}
        </div>
      </div>
    ))}
  </div>
);

// ─── Period state ─────────────────────────────────────────────────────────────

interface Periods {
  workspacesCreated: string;
  explorationsLaunched: string;
  personasCalibrated: string;
  reportsDownloaded: string;
  registeredUsers: string;
  activeUsers: string;
  avgTime: string;
  collaboration: string;
  avgPersonaConf: string;
  populationConf: string;
  realPeople: string;
  multiplatform: string;
  credible: string;
  decisionInfluenced: string;
  timeSaved: string;
  researchSpend: string;
  humanStudies: string;
  humanSample: string;
}

const INIT_PERIODS: Periods = {
  workspacesCreated: "annually",
  explorationsLaunched: "half_year",
  personasCalibrated: "half_year",
  reportsDownloaded: "annually_2026",
  registeredUsers: "annually",
  activeUsers: "annually",
  avgTime: "annually",
  collaboration: "annually",
  avgPersonaConf: "annually",
  populationConf: "annually",
  realPeople: "annually",
  multiplatform: "annually",
  credible: "annually",
  decisionInfluenced: "annually",
  timeSaved: "hours",
  researchSpend: "hours",
  humanStudies: "annually",
  humanSample: "annually",
};

// ─── Tab index state ──────────────────────────────────────────────────────────

interface ActiveTabs {
  adoption: number;
  engagement: number;
  conviction: number;
  value: number;
}

// ─── Main component ───────────────────────────────────────────────────────────

const MyOrganization: React.FC = () => {
  const navigate  = useNavigate();
  const dispatch  = useDispatch();

  const auth          = useSelector((s: RootState) => s.auth);
  const omi           = useSelector((s: RootState) => s.omi);
  const { organizations } = useSelector((s: RootState) => s.organizations);
  const orgName = organizations?.data?.name ?? "{Enterprise Name}";
  const orgId   = organizations?.data?.id   ?? "default-org";

  useEffect(() => {
    if (auth?.user && auth.user.account_tier !== "enterprise") {
      navigate(getPostLoginPath(auth.user), { replace: true });
    }
  }, [auth?.user, navigate]);

  const [showNotif, setShowNotif] = useState<boolean>(false);
  const [periods,   setPeriods]   = useState<Periods>(INIT_PERIODS);
  const [activeTabs, setActiveTabs] = useState<ActiveTabs>({
    adoption: 0, engagement: 0, conviction: 0, value: 0,
  });

  const [stats,   setStats]   = useState<DashboardStats>(INITIAL_STATS);
  const [loading, setLoading] = useState<boolean>(true);
  const [error,   setError]   = useState<string | null>(null);

  const [csvOpen,  setCsvOpen]  = useState<boolean>(false);
  const [csvWsId,  setCsvWsId]  = useState<string>("");
  const [csvExId,  setCsvExId]  = useState<string>("");
  const [csvBusy,  setCsvBusy]  = useState<boolean>(false);
  const [moreOpen, setMoreOpen] = useState<boolean>(false);

  const { data: wsRaw } = useWorkspaces() as { data: Workspace[] | { data: Workspace[] } | null };
  const workspaces = useMemo<Workspace[]>(() => {
    if (!wsRaw) return [];
    if (Array.isArray(wsRaw)) return wsRaw;
    return (wsRaw as { data: Workspace[] }).data ?? [];
  }, [wsRaw]);

  const { data: exRaw, isLoading: exLoading } = useExplorations(csvWsId, {
    enabled: csvOpen && !!csvWsId,
  }) as { data: Exploration[] | { data: Exploration[] } | null; isLoading: boolean };
  const explorations = useMemo<Exploration[]>(() => {
    if (!exRaw) return [];
    if (Array.isArray(exRaw)) return exRaw;
    return (exRaw as { data: Exploration[] }).data ?? [];
  }, [exRaw]);

  useEffect(() => { setCsvExId(""); }, [csvWsId]);

  useEffect(() => {
    if (orgId && !omi.isInitialized) {
      dispatch(initializeSessionStart({ orgId }));
    }
  }, [orgId, dispatch, omi.isInitialized]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const api: ApiResponse = await adminService.getAdminDashboardData("all_time");
      setStats((prev) => mergeApiData(api, prev));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load dashboard";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setPeriod = useCallback(
    (key: keyof Periods) => (v: string) => setPeriods((p) => ({ ...p, [key]: v })),
    []
  );

  const setTab = useCallback(
    (section: keyof ActiveTabs) => (idx: number) =>
      setActiveTabs((p) => ({ ...p, [section]: idx })),
    []
  );

  const handleCsvDownload = async (): Promise<void> => {
    if (!csvWsId || !csvExId) return;
    try {
      setCsvBusy(true);
      await downloadLatestQuestionnaireCsvForExploration({ workspaceId: csvWsId, explorationId: csvExId });
      setCsvOpen(false);
    } catch (e) {
      console.error(e);
      alertQuestionnaireExportError(e);
    } finally {
      setCsvBusy(false);
    }
  };

  const openCsvModal = (): void => { setCsvOpen(true); setCsvWsId(""); setCsvExId(""); setMoreOpen(false); };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <div className={styles.spinner} />
        <span>Loading dashboard…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <span className={styles.errorText}>{error}</span>
        <button className={styles.retryBtn} onClick={fetchData}>Retry</button>
      </div>
    );
  }

  // ─── Adoption tab definitions ─────────────────────────────────────────────

  const adoptionTabs = [
    { value: stats.adoption.workspacesCreated,    label: "Workspaces Created"    },
    { value: stats.adoption.explorationsLaunched, label: "Explorations Launched" },
    { value: stats.adoption.personasCalibrated,   label: "Personas Calibrated"   },
    { value: String(stats.adoption.reportsDownloaded).padStart(3, "0"), label: "Reports Downloaded" },
  ];

  const renderAdoptionChart = (): React.ReactNode => {
    const idx = activeTabs.adoption;
    if (idx === 0) return (
      <>
        <ChartCtrl title="Workspaces Created" value={periods.workspacesCreated} onChange={setPeriod("workspacesCreated")} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.charts.workspacesCreated} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
              <XAxis dataKey="dept" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={TTStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="value" name="Workspaces" fill={C.barBlue} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>
    );
    if (idx === 1) return (
      <>
        <ChartCtrl title="Explorations Launched" value={periods.explorationsLaunched} onChange={setPeriod("explorationsLaunched")} options={HALF_YEAR_OPTS} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.charts.explorationsLaunched} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
              <XAxis dataKey="dept" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 150]} />
              <Tooltip contentStyle={TTStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="value" name="Explorations" fill={C.barPurple} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>
    );
    if (idx === 2) return (
      <>
        <ChartCtrl title="Personas Calibrated" value={periods.personasCalibrated} onChange={setPeriod("personasCalibrated")}
          options={[{ value: "half_year_range", label: "Half Year (Jan 2026 - Jun 2026)" }, ...HALF_YEAR_OPTS]} wide />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.charts.personasCalibrated} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
              <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 150]} />
              <Tooltip contentStyle={TTStyle} />
              <Bar dataKey="singleUser" name="Standard Personas" stackId="a" fill={C.barBlue} />
              <Bar dataKey="multiUser"  name="Additional Personas" stackId="a" fill={C.barTeal} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <StackedLegend a="Standard Personas" b="Additional Personas" />
      </>
    );
    return (
      <>
        <ChartCtrl title="Reports Downloaded" value={periods.reportsDownloaded} onChange={setPeriod("reportsDownloaded")} options={ANNUAL_2026_OPTS} wide />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.charts.reportsDownloaded}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
              <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={TTStyle} />
              <Line type="monotone" dataKey="value" name="Reports Downloaded" stroke={C.line} strokeWidth={2}
                dot={{ r: 4, fill: C.line, strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
    );
  };

  // ─── Engagement tab definitions ───────────────────────────────────────────

  const engagementTabs = [
    { value: stats.userEngagement.registeredUsers.value,       label: "Registered Users"          },
    { value: stats.userEngagement.activeUsers.value,           label: "Active Users"               },
    { value: stats.userEngagement.avgTimePerExploration.value, label: "hrs Avg. Time per Exploration" },
    { value: stats.userEngagement.collaborationRate.value,     label: "Collaboration Rate"         },
  ];

  const renderEngagementChart = (): React.ReactNode => {
    const idx = activeTabs.engagement;
    if (idx === 0) return (
      <>
        <ChartCtrl title="Registered Users" value={periods.registeredUsers} onChange={setPeriod("registeredUsers")} options={ANNUAL_VARIANT_OPTS} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.charts.registeredUsers}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
              <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={TTStyle} />
              <Line type="monotone" dataKey="value" name="Registered Users" stroke={C.line} strokeWidth={2}
                dot={{ r: 4, fill: C.line, strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <StackedLegend a="Single User" b="Multiple Users" />
      </>
    );
    if (idx === 1) return (
      <>
        <ChartCtrl title="Active Users" value={periods.activeUsers} onChange={setPeriod("activeUsers")} options={ANNUAL_VARIANT_OPTS} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.charts.activeUsers}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
              <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={TTStyle} />
              <Line type="monotone" dataKey="value" name="Active Users" stroke={C.line} strokeWidth={2}
                dot={{ r: 4, fill: C.line, strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
    );
    if (idx === 2) return (
      <>
        <ChartCtrl title="Avg. Time per Exploration" value={periods.avgTime} onChange={setPeriod("avgTime")} options={ANNUAL_VARIANT_OPTS} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.charts.avgTimePerExploration} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
              <XAxis dataKey="dept" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={TTStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="value" name="Avg hrs per Exploration" fill={C.barPurple} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>
    );
    return (
      <>
        <ChartCtrl title="Collaboration Rate" value={periods.collaboration} onChange={setPeriod("collaboration")} options={ANNUAL_VARIANT_OPTS} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.charts.collaborationRate} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
              <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 150]} />
              <Tooltip contentStyle={TTStyle} />
              <Bar dataKey="singleUser" name="Single User"     stackId="a" fill={C.barBlue} />
              <Bar dataKey="multiUser"  name="Multiple Users"  stackId="a" fill={C.barTeal} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <StackedLegend a="Single User" b="Multiple Users" />
      </>
    );
  };

  // ─── Conviction tab definitions ───────────────────────────────────────────

  const convictionTabs = [
    { value: stats.conviction.personaConfidence.value,      label: "Persona Confidence"                  },
    { value: stats.conviction.populationConfidence,          label: "Population Confidence"               },
    { value: stats.conviction.realPeoplesActions,            label: "Real People's Actions Calibrated"    },
    { value: stats.conviction.multiplatformConversation,     label: "Multi-platform Conversation"         },
    { value: stats.conviction.credibleSources,               label: "Credible Sources Contextualised"     },
  ];

  const renderConvictionChart = (): React.ReactNode => {
    const idx = activeTabs.conviction;
    if (idx === 0) return (
      <>
        <ChartCtrl title="Avg. Persona Confidence" value={periods.avgPersonaConf} onChange={setPeriod("avgPersonaConf")} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.charts.avgPersonaConfidence}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={TTStyle} />
              <Line type="monotone" dataKey="value" name="Avg Persona Confidence (%)" stroke={C.line} strokeWidth={2} dot={{ r: 4, fill: C.line, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
    );
    if (idx === 1) return (
      <>
        <ChartCtrl title="Population Confidence" value={periods.populationConf} onChange={setPeriod("populationConf")} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.charts.populationConfidence}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={TTStyle} />
              <Line type="monotone" dataKey="value" name="Avg Population Confidence (%)" stroke={C.line} strokeWidth={2} dot={{ r: 4, fill: C.line, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
    );
    if (idx === 2) return (
      <>
        <ChartCtrl title="Avg. Real People's Actions Calibrated" value={periods.realPeople} onChange={setPeriod("realPeople")} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.charts.realPeoplesActions}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={TTStyle} />
              <Line type="monotone" dataKey="value" name="Real People's Actions Calibrated" stroke={C.line} strokeWidth={2} dot={{ r: 4, fill: C.line, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
    );
    if (idx === 3) return (
      <>
        <ChartCtrl title="Avg. Multi-platform Conversation" value={periods.multiplatform} onChange={setPeriod("multiplatform")} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.charts.multiplatformConversation}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={TTStyle} />
              <Line type="monotone" dataKey="value" name="Multi-platform Conversation" stroke={C.line} strokeWidth={2} dot={{ r: 4, fill: C.line, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
    );
    return (
      <>
        <ChartCtrl title="Avg. Credible Sources Contextualized" value={periods.credible} onChange={setPeriod("credible")} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.charts.credibleSources}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={TTStyle} />
              <Line type="monotone" dataKey="value" name="Credible Sources Contextualized" stroke={C.line} strokeWidth={2} dot={{ r: 4, fill: C.line, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
    );
  };

  // ─── Value Delivered tab definitions ─────────────────────────────────────

  const valueTabs = [
    { value: stats.valueDelivered.decisionInfluenced.value,  label: "Decision Influenced"      },
    { value: `${stats.valueDelivered.timeSaved.value} hrs`,  label: "Time Saved"               },
    { value: `$ ${stats.valueDelivered.researchSpendSaved.value}`, label: "Research Spend Saved" },
    { value: stats.valueDelivered.humanStudiesReplaced,      label: "Human Studies Replaced"   },
    { value: stats.valueDelivered.humanSampleReduced,        label: "Human Sample Reduced"     },
  ];

  const renderValueChart = (): React.ReactNode => {
    const idx = activeTabs.value;
    if (idx === 0) return (
      <>
        <ChartCtrl title="Decision Influenced" value={periods.decisionInfluenced} onChange={setPeriod("decisionInfluenced")} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.charts.decisionInfluenced} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
              <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 150]} />
              <Tooltip contentStyle={TTStyle} />
              <Bar dataKey="singleUser" name="Total Explorations" stackId="a" fill={C.barBlue} />
              <Bar dataKey="multiUser"  name="Decision Influenced" stackId="a" fill={C.barTeal} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <StackedLegend a="Total Explorations" b="Decision Influenced" />
      </>
    );
    if (idx === 1) return (
      <>
        <ChartCtrl title="Time Saved" value={periods.timeSaved} onChange={setPeriod("timeSaved")} options={HOURS_OPTS} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.charts.timeSaved}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={TTStyle} />
              <Line type="monotone" dataKey="value" name="Time Saved (hrs)" stroke={C.line} strokeWidth={2} dot={{ r: 4, fill: C.line, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
    );
    if (idx === 2) return (
      <>
        <ChartCtrl title="Research Spend Saved" value={periods.researchSpend} onChange={setPeriod("researchSpend")} options={HOURS_OPTS} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.charts.researchSpendSaved}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip contentStyle={TTStyle} />
              <Line type="monotone" dataKey="value" name="Research Spend Saved ($)" stroke={C.line} strokeWidth={2} dot={{ r: 4, fill: C.line, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>
    );
    if (idx === 3) return (
      <>
        <ChartCtrl title="Human Studies Replaced" value={periods.humanStudies} onChange={setPeriod("humanStudies")} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.charts.humanStudiesReplaced} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
              <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 150]} />
              <Tooltip contentStyle={TTStyle} />
              <Bar dataKey="singleUser" name="Total Explorations"   stackId="a" fill={C.barBlue} />
              <Bar dataKey="multiUser"  name="Replaced Human Studies" stackId="a" fill={C.barTeal} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <StackedLegend a="Total Explorations" b="Replaced Human Studies" />
      </>
    );
    return (
      <>
        <ChartCtrl title="Human Sample Reduced" value={periods.humanSample} onChange={setPeriod("humanSample")} />
        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.charts.humanSampleReduced} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
              <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} domain={[0, 150]} />
              <Tooltip contentStyle={TTStyle} />
              <Bar dataKey="singleUser" name="Total Explorations"  stackId="a" fill={C.barBlue} />
              <Bar dataKey="multiUser"  name="Reduced Human Sample" stackId="a" fill={C.barTeal} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <StackedLegend a="Total Explorations" b="Reduced Human Sample" />
      </>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>

      {/* ── Top Bar ─────────────────────────────────────────── */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <span className={styles.topBarTitle}>{orgName} Dashboard</span>
        </div>
        <div className={styles.topBarActions}>
          <div className={styles.notifWrapper}>
            <button className={styles.iconBtn} onClick={() => setShowNotif((s) => !s)}
              aria-label="Notifications" aria-expanded={showNotif}>
              <TbBell size={16} />
            </button>
            {showNotif && <NotifDropdown />}
          </div>
          <button className={styles.createBtn} onClick={() => navigate("/main/organization/workspace/add")}>
            <TbPlus size={14} /> Create Exploration
          </button>
          <div className={styles.notifWrapper}>
            <button className={styles.iconBtn} aria-label="More options"
              aria-expanded={moreOpen} onClick={() => setMoreOpen((s) => !s)}>
              <TbDots size={16} />
            </button>
            {moreOpen && (
              <div className={styles.notifDropdown} role="menu">
                <div className={styles.notifHeader}>More Options</div>
                <button className={styles.csvBtn}
                  style={{ width: "calc(100% - 32px)", margin: "12px 16px" }}
                  onClick={openCsvModal}>
                  <TbDownload size={14} /> Download Questionnaire CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Banner ──────────────────────────────────────────── */}
      <div className={styles.banner}>
        <TbInfoCircle size={14} className={styles.bannerIcon} />
        <span>
          Synthetic-People has powered ABC strategic explorations, influenced XYZ decisions,
          and unlocked 1234 research hours while saving $1234 research spend across your organisation
        </span>
      </div>

      {/* ── Page content ────────────────────────────────────── */}
      <div className={styles.content}>

        {/* ── Usage Metrics · Outcome Influenced · Economics ── */}
        <div className={styles.combinedMetricsPanel}>
          <div className={styles.metricPanel}>
            <div className={styles.metricPanelTitle}>
              Usage Metrics <TbInfoCircle size={12} className={styles.infoIcon} />
            </div>
            <div className={styles.metricItems}>
              <div className={styles.metricItem}>
                <div className={styles.metricValue}>{stats.usageMetrics.totalWorkspace.value}<span className={styles.trendUp}>↗</span></div>
                <div className={styles.metricLabel}>Total Workspace</div>
              </div>
              <div className={styles.metricItem}>
                <div className={styles.metricValue}>{stats.usageMetrics.totalExploration.value}<span className={styles.trendDown}>↘</span></div>
                <div className={styles.metricLabel}>Total Exploration</div>
              </div>
              <div className={styles.metricItem}>
                <div className={styles.metricValue}>{stats.usageMetrics.totalUsers.value}<span className={styles.trendUp}>↗</span></div>
                <div className={styles.metricLabel}>Total Users</div>
              </div>
            </div>
          </div>
          <div className={styles.metricPanel}>
            <div className={styles.metricPanelTitle}>
              Outcome Influenced <TbInfoCircle size={12} className={styles.infoIcon} />
            </div>
            <div className={styles.metricItems}>
              <div className={styles.metricItem}>
                <div className={styles.metricValue}>{stats.outcomeInfluenced.decisionsInfluenced.value}<span className={styles.trendDown}>↘</span></div>
                <div className={styles.metricLabel}>Decisions Influenced</div>
              </div>
              <div className={styles.metricItem}>
                <div className={styles.metricValue}>{stats.outcomeInfluenced.humanStudiesReplaced.value}<span className={styles.trendUp}>↗</span></div>
                <div className={styles.metricLabel}>Human Studies Replaced</div>
              </div>
              <div className={styles.metricItem}>
                <div className={styles.metricValue}>{stats.outcomeInfluenced.humanSampleReduced.value}<span className={styles.trendUp}>↗</span></div>
                <div className={styles.metricLabel}>Human Sample Reduced</div>
              </div>
            </div>
          </div>
          <div className={styles.metricPanel}>
            <div className={styles.metricPanelTitle}>
              Economics <TbInfoCircle size={12} className={styles.infoIcon} />
            </div>
            <div className={styles.metricItems}>
              <div className={styles.metricItem}>
                <div className={styles.metricValue}>{stats.economics.researchTimeUnlocked.value}<span className={styles.metricUnit}> hrs</span></div>
                <div className={styles.metricLabel}>Research Time Unlocked</div>
              </div>
              <div className={styles.metricItem}>
                <div className={styles.metricValue}>{stats.economics.researchSpendSaved.value}<TbChevronDown size={12} className={styles.chevron} /></div>
                <div className={styles.metricLabel}>Research Spend Saved</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Adoption Dynamics + User Engagement ─────────────── */}
        <div className={styles.sectionGrid2}>

          {/* Adoption Dynamics */}
          <div className={styles.sectionPanel}>
            <div className={styles.sectionPanelTitle}>Adoption Dynamics</div>
            <div className={`${styles.tabStrip} ${styles.tabStrip4}`}>
              {adoptionTabs.map((tab, i) => (
                <button
                  key={i}
                  className={`${styles.tabCard} ${activeTabs.adoption === i ? styles.tabCardActive : ""}`}
                  onClick={() => setTab("adoption")(i)}
                >
                  <div className={styles.tabValue}>{tab.value}</div>
                  <div className={styles.tabLabel}>{tab.label}</div>
                </button>
              ))}
            </div>
            {renderAdoptionChart()}
          </div>

          {/* User Engagement */}
          <div className={styles.sectionPanel}>
            <div className={styles.sectionPanelTitle}>User Engagement</div>
            <div className={`${styles.tabStrip} ${styles.tabStrip4}`}>
              {engagementTabs.map((tab, i) => (
                <button
                  key={i}
                  className={`${styles.tabCard} ${activeTabs.engagement === i ? styles.tabCardActive : ""}`}
                  onClick={() => setTab("engagement")(i)}
                >
                  <div className={styles.tabValue}>{tab.value}</div>
                  <div className={styles.tabLabel}>{tab.label}</div>
                </button>
              ))}
            </div>
            {renderEngagementChart()}
          </div>
        </div>

        {/* ── Conviction Measurement + Value Delivered ─────────── */}
        <div className={styles.sectionGrid2}>

          {/* Conviction Measurement */}
          <div className={styles.sectionPanel}>
            <div className={styles.sectionPanelTitle}>Conviction Measurement</div>
            <div className={`${styles.tabStrip} ${styles.tabStrip5}`}>
              {convictionTabs.map((tab, i) => (
                <button
                  key={i}
                  className={`${styles.tabCard} ${activeTabs.conviction === i ? styles.tabCardActive : ""}`}
                  onClick={() => setTab("conviction")(i)}
                >
                  <div className={styles.tabValue}>{tab.value}</div>
                  <div className={styles.tabLabel}>{tab.label}</div>
                </button>
              ))}
            </div>
            {renderConvictionChart()}
          </div>

          {/* Value Delivered */}
          <div className={styles.sectionPanel}>
            <div className={styles.sectionPanelTitle}>Value Delivered</div>
            <div className={`${styles.tabStrip} ${styles.tabStrip5}`}>
              {valueTabs.map((tab, i) => (
                <button
                  key={i}
                  className={`${styles.tabCard} ${activeTabs.value === i ? styles.tabCardActive : ""}`}
                  onClick={() => setTab("value")(i)}
                >
                  <div className={styles.tabValue}>{tab.value}</div>
                  <div className={styles.tabLabel}>{tab.label}</div>
                </button>
              ))}
            </div>
            {renderValueChart()}
          </div>
        </div>

      </div>{/* /content */}

      {/* ── CSV Modal ────────────────────────────────────────── */}
      {csvOpen && (
        <>
          <div className={styles.modalOverlay} onClick={() => !csvBusy && setCsvOpen(false)} aria-hidden="true" />
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="csv-modal-title">
            <h3 id="csv-modal-title" className={styles.modalTitle}>Download questionnaire CSV</h3>
            <p className={styles.modalSubtitle}>
              Choose the workspace and exploration that has a saved population run and questionnaire.
            </p>
            <label htmlFor="csv-ws" className={styles.modalLabel}>Workspace</label>
            <select id="csv-ws" className={styles.modalSelect} value={csvWsId} onChange={(e) => setCsvWsId(e.target.value)}>
              <option value="">Choose workspace…</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name ?? w.id}</option>
              ))}
            </select>
            <label htmlFor="csv-ex" className={styles.modalLabel}>Exploration</label>
            <select id="csv-ex" className={styles.modalSelect} value={csvExId}
              onChange={(e) => setCsvExId(e.target.value)} disabled={!csvWsId || exLoading}>
              <option value="">{exLoading ? "Loading…" : "Choose exploration…"}</option>
              {explorations.map((ex) => (
                <option key={ex.id} value={ex.id}>{ex.title ?? ex.id}</option>
              ))}
            </select>
            <div className={styles.modalActions}>
              <button className={styles.modalCancelBtn} onClick={() => setCsvOpen(false)} disabled={csvBusy}>Cancel</button>
              <button className={styles.modalDownloadBtn} onClick={handleCsvDownload} disabled={csvBusy || !csvWsId || !csvExId}>
                {csvBusy && <span className={styles.spinnerSm} aria-hidden="true" />}
                Download
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MyOrganization;