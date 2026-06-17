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
import { initializeSessionStart } from "../../../redux/slices/omiSlice";
import { enterpriseService } from "../../../services/enterpriseService";
import { getPostLoginPath } from "../../../utils/authRouting";
import { useWorkspaces } from "../../../hooks/useWorkspaces";
import { useExplorations } from "../../../hooks/useExplorations";
import {
  downloadLatestQuestionnaireCsvForExploration,
  alertQuestionnaireExportError,
} from "../../../utils/questionnaireExportFlow";
import type { LinePoint, DeptPoint, StackedPoint } from "./orgDashboardData";
import styles from "./MyOrganization.module.css";

// ─── Redux state shape ────────────────────────────────────────────────────────

interface AuthState {
  user?: {
    account_tier?: string;
    organization_id?: string | null;
    org_id?: string | null;
  } | null;
}
interface OmiState {
  isInitialized?: boolean;
}
interface RootState {
  auth: AuthState;
  omi: OmiState;
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
  banner: {
    totalExplorations: number;
    decisionsInfluenced: number;
    researchTimeUnlockedHrs: number;
    researchSpendSavedUsd: number;
  };
}

// ─── API response shape ───────────────────────────────────────────────────────

interface OrgAnalyticsApi {
  usage_metrics: { total_workspaces: number; total_explorations: number; total_users: number; };
  outcome_influenced: {
    decisions_influenced: number; decisions_influenced_pct: number;
    human_studies_replaced: number; human_sample_reduced: number;
  };
  economics: { research_time_unlocked_hrs: number; research_spend_saved_usd: number; };
  adoption: {
    workspaces_created: number; explorations_launched: number;
    personas_calibrated: number; reports_downloaded: number;
    chart_workspaces_created: DeptPoint[];
    chart_explorations_launched: DeptPoint[];
    chart_personas_calibrated: StackedPoint[];
    chart_reports_downloaded: LinePoint[];
  };
  user_engagement: {
    registered_users: number; active_users: number;
    avg_time_per_exploration_hrs: number; collaboration_rate_pct: number;
    chart_registered_users: LinePoint[];
    chart_active_users: LinePoint[];
    chart_avg_time_per_exploration: DeptPoint[];
    chart_collaboration_rate: StackedPoint[];
  };
  conviction: {
    avg_persona_confidence_pct: number; avg_population_confidence_pct: number;
    total_rebuttal_sessions: number; total_interviews: number; total_traceability_records: number;
    chart_persona_confidence: LinePoint[];
    chart_population_confidence: LinePoint[];
    chart_rebuttal_sessions: LinePoint[];
    chart_interviews: LinePoint[];
    chart_traceability_records: LinePoint[];
  };
  value_delivered: {
    decisions_influenced_pct: number; time_saved_hrs: number;
    research_spend_saved_usd: number; human_studies_replaced: number; human_sample_reduced: number;
    chart_decisions_influenced: StackedPoint[];
    chart_time_saved: LinePoint[];
    chart_research_spend_saved: LinePoint[];
    chart_human_studies_replaced: StackedPoint[];
    chart_human_sample_reduced: StackedPoint[];
  };
  banner: {
    total_explorations: number; decisions_influenced: number;
    research_time_unlocked_hrs: number; research_spend_saved_usd: number;
  };
}

// ─── Map API → DashboardStats ─────────────────────────────────────────────────

function mapApiToStats(api: OrgAnalyticsApi): DashboardStats {
  const fmt = (n: number) => n.toLocaleString();
  return {
    usageMetrics: {
      totalWorkspace:   { value: api.usage_metrics.total_workspaces,  trend: "up"      },
      totalExploration: { value: api.usage_metrics.total_explorations, trend: "up"      },
      totalUsers:       { value: api.usage_metrics.total_users,        trend: "neutral" },
    },
    outcomeInfluenced: {
      decisionsInfluenced:  { value: `${api.outcome_influenced.decisions_influenced_pct}%`, trend: "up" },
      humanStudiesReplaced: { value: api.outcome_influenced.human_studies_replaced,         trend: "up" },
      humanSampleReduced:   { value: api.outcome_influenced.human_sample_reduced,           trend: "up" },
    },
    economics: {
      researchTimeUnlocked: { value: api.economics.research_time_unlocked_hrs, unit: "hrs" },
      researchSpendSaved:   { value: `$${fmt(api.economics.research_spend_saved_usd)}`      },
    },
    adoption: {
      workspacesCreated:    api.adoption.workspaces_created,
      explorationsLaunched: api.adoption.explorations_launched,
      personasCalibrated:   api.adoption.personas_calibrated,
      reportsDownloaded:    api.adoption.reports_downloaded,
    },
    userEngagement: {
      registeredUsers:       { value: api.user_engagement.registered_users                      },
      activeUsers:           { value: api.user_engagement.active_users                          },
      avgTimePerExploration: { value: api.user_engagement.avg_time_per_exploration_hrs          },
      collaborationRate:     { value: `${api.user_engagement.collaboration_rate_pct}%`          },
    },
    conviction: {
      personaConfidence:         { value: `${api.conviction.avg_persona_confidence_pct}%` },
      populationConfidence:       api.conviction.avg_population_confidence_pct,
      realPeoplesActions:         api.conviction.total_rebuttal_sessions,
      multiplatformConversation:  api.conviction.total_interviews,
      credibleSources:            api.conviction.total_traceability_records,
    },
    valueDelivered: {
      decisionInfluenced: { value: `${api.value_delivered.decisions_influenced_pct}%`         },
      timeSaved:          { value: api.value_delivered.time_saved_hrs,      unit: "hrs"       },
      researchSpendSaved: { value: `$${fmt(api.value_delivered.research_spend_saved_usd)}`    },
      humanStudiesReplaced: api.value_delivered.human_studies_replaced,
      humanSampleReduced:   api.value_delivered.human_sample_reduced,
    },
    kpi: {
      totalWorkflows:     String(api.adoption.workspaces_created),
      totalExplorations:  String(api.adoption.explorations_launched),
      totalUsers:         String(api.user_engagement.registered_users),
      outcomeInfluenced:  `${api.outcome_influenced.decisions_influenced_pct}%`,
      hoursSaved:         String(api.economics.research_time_unlocked_hrs),
      reportsDownloaded:  String(api.adoption.reports_downloaded),
      humanStudiesAvoided: String(api.outcome_influenced.human_studies_replaced),
    },
    charts: {
      workspacesCreated:       api.adoption.chart_workspaces_created,
      explorationsLaunched:    api.adoption.chart_explorations_launched,
      personasCalibrated:      api.adoption.chart_personas_calibrated,
      reportsDownloaded:       api.adoption.chart_reports_downloaded,
      registeredUsers:         api.user_engagement.chart_registered_users,
      activeUsers:             api.user_engagement.chart_active_users,
      avgTimePerExploration:   api.user_engagement.chart_avg_time_per_exploration,
      collaborationRate:       api.user_engagement.chart_collaboration_rate,
      avgPersonaConfidence:    api.conviction.chart_persona_confidence,
      populationConfidence:    api.conviction.chart_population_confidence,
      realPeoplesActions:      api.conviction.chart_rebuttal_sessions,
      multiplatformConversation: api.conviction.chart_interviews,
      credibleSources:         api.conviction.chart_traceability_records,
      decisionInfluenced:      api.value_delivered.chart_decisions_influenced,
      timeSaved:               api.value_delivered.chart_time_saved,
      researchSpendSaved:      api.value_delivered.chart_research_spend_saved,
      humanStudiesReplaced:    api.value_delivered.chart_human_studies_replaced,
      humanSampleReduced:      api.value_delivered.chart_human_sample_reduced,
    },
    banner: {
      totalExplorations:        api.banner.total_explorations,
      decisionsInfluenced:      api.banner.decisions_influenced,
      researchTimeUnlockedHrs:  api.banner.research_time_unlocked_hrs,
      researchSpendSavedUsd:    api.banner.research_spend_saved_usd,
    },
  };
}

// ─── Zero stats shown while loading ──────────────────────────────────────────

const ZERO_STATS: DashboardStats = {
  usageMetrics: {
    totalWorkspace:   { value: "—" },
    totalExploration: { value: "—" },
    totalUsers:       { value: "—" },
  },
  outcomeInfluenced: {
    decisionsInfluenced:  { value: "—" },
    humanStudiesReplaced: { value: "—" },
    humanSampleReduced:   { value: "—" },
  },
  economics: {
    researchTimeUnlocked: { value: "—", unit: "hrs" },
    researchSpendSaved:   { value: "—"              },
  },
  adoption: { workspacesCreated: 0, explorationsLaunched: 0, personasCalibrated: 0, reportsDownloaded: 0 },
  userEngagement: {
    registeredUsers: { value: "—" }, activeUsers: { value: "—" },
    avgTimePerExploration: { value: "—" }, collaborationRate: { value: "—" },
  },
  conviction: {
    personaConfidence: { value: "—" }, populationConfidence: 0,
    realPeoplesActions: 0, multiplatformConversation: 0, credibleSources: 0,
  },
  valueDelivered: {
    decisionInfluenced: { value: "—" }, timeSaved: { value: "—", unit: "hrs" },
    researchSpendSaved: { value: "—" }, humanStudiesReplaced: 0, humanSampleReduced: 0,
  },
  kpi: { totalWorkflows: "0", totalExplorations: "0", totalUsers: "0", outcomeInfluenced: "0%", hoursSaved: "0", reportsDownloaded: "0", humanStudiesAvoided: "0" },
  charts: {
    workspacesCreated: [], explorationsLaunched: [], personasCalibrated: [], reportsDownloaded: [],
    registeredUsers: [], activeUsers: [], avgTimePerExploration: [], collaborationRate: [],
    avgPersonaConfidence: [], populationConfidence: [], realPeoplesActions: [],
    multiplatformConversation: [], credibleSources: [], decisionInfluenced: [],
    timeSaved: [], researchSpendSaved: [], humanStudiesReplaced: [], humanSampleReduced: [],
  },
  banner: { totalExplorations: 0, decisionsInfluenced: 0, researchTimeUnlockedHrs: 0, researchSpendSavedUsd: 0 },
};

// ─── Chart shared config ──────────────────────────────────────────────────────

const C = {
  barBlue:   "#3b7eff",
  barPurple: "#7c6fdb",
  barTeal:   "#4ecdc4",
  line:      "#6c7fdb",
  grid:      "rgba(255,255,255,0.06)",
} as const;

const TTStyle: React.CSSProperties = {
  background: "#161b27",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: 12,
  color: "#e8eaf0",
};

const tickStyle      = { fontSize: 10, fill: "#5c6880" } as const;

// ─── Axis label styles ────────────────────────────────────────────────────────
// fontSize kept at 10/9 to match Figma; fill matches tick colour.
const axisLabelStyle   = { fontSize: 10, fill: "#5c6880" } as const;
const axisLabelStyleSm = { fontSize: 9,  fill: "#5c6880" } as const;

// ─── Chart margins ─────────────────────────────────────────────────────────────
// left: 60 gives the rotated Y-axis label enough SVG space to render fully.
// YAxis width={56} allocates 56 px of that for tick numbers + rotated label.
// No negative CSS margin-left needed — overflow: visible on .chartArea handles clipping.
const CHART_MARGIN         = { top: 10, right: 10, left: 60, bottom: 28 } as const;
const CHART_MARGIN_NO_XLAB = { top: 10, right: 10, left: 60, bottom: 4  } as const;
const CHART_MARGIN_WIDE    = { top: 10, right: 10, left: 68, bottom: 4  } as const;

// ─── Period option types ──────────────────────────────────────────────────────

interface PeriodOption { value: string; label: string; }

const PERIOD_MAP: Record<string, string> = {
  annually: "1_year", half_year: "6_months", monthly: "1_month", weekly: "1_week",
  annually_2026: "1_year", annually_2025: "1_year", hours: "all_time", days: "all_time",
};

const ANNUAL_OPTS: PeriodOption[]         = [{ value: "annually", label: "Annually" }, { value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" }];
const ANNUAL_VARIANT_OPTS: PeriodOption[] = [{ value: "annually", label: "Annual"  }, { value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" }];
const HALF_YEAR_OPTS: PeriodOption[]      = [{ value: "half_year", label: "Half Year" }, { value: "annually", label: "Annually" }, { value: "monthly", label: "Monthly" }];
const ANNUAL_2026_OPTS: PeriodOption[]    = [{ value: "annually_2026", label: "Annually (2026)" }, { value: "annually_2025", label: "Annually (2025)" }];
const HOURS_OPTS: PeriodOption[]          = [{ value: "hours", label: "Hours" }, { value: "days", label: "Days" }];

// ─── Shared sub-components ────────────────────────────────────────────────────

interface ChartCtrlProps {
  title: string; value: string; onChange: (v: string) => void;
  options?: PeriodOption[]; wide?: boolean;
}

const ChartCtrl: React.FC<ChartCtrlProps> = ({ title, value, onChange, options = ANNUAL_OPTS, wide }) => (
  <div className={styles.chartBlockTitleRow}>
    <span className={styles.chartBlockTitle}>
      {title} <TbChevronDown size={13} className={styles.chevron} />
    </span>
    <select
      className={`${styles.periodSelect} ${wide ? styles.periodSelectWide : ""}`}
      value={value} onChange={(e) => onChange(e.target.value)}
      aria-label={`Period for ${title}`}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const StackedLegend: React.FC<{ a: string; b: string; colorA?: string; colorB?: string }> = ({
  a, b, colorA = C.barBlue, colorB = C.barTeal,
}) => (
  <div className={styles.chartLegend}>
    <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: colorA }} />{a}</div>
    <div className={styles.legendItem}><span className={styles.legendDot} style={{ background: colorB }} />{b}</div>
  </div>
);

const EmptyChart: React.FC = () => (
  <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "#5c6880", fontSize: 13 }}>
    No data available yet
  </div>
);

// ─── Notification dropdown ────────────────────────────────────────────────────

interface NotifItem { id: number; name: string; desc: string; time: string; cta?: boolean; unread?: boolean; }

const NOTIFS: NotifItem[] = [
  { id: 1, name: "Notification Name", desc: "Notification Name", time: "12:00 AM", cta: true,  unread: true  },
  { id: 2, name: "Notification Name", desc: "Notification Name", time: "12:00 AM",             unread: true  },
  { id: 3, name: "Notification Name", desc: "Notification Name", time: "12:00 AM"                            },
  { id: 4, name: "Notification Name", desc: "Notification Name", time: "12:00 AM"                            },
  { id: 5, name: "Notification Name", desc: "Notification Name", time: "12:00 AM"                            },
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
          {n.cta   && <span className={styles.notifCta}>Button CTA <TbArrowRight size={12} /></span>}
          {n.unread && <span className={styles.notifUnread} />}
        </div>
      </div>
    ))}
  </div>
);

// ─── Period state ─────────────────────────────────────────────────────────────

interface Periods {
  workspacesCreated: string; explorationsLaunched: string; personasCalibrated: string;
  reportsDownloaded: string; registeredUsers: string; activeUsers: string; avgTime: string;
  collaboration: string; avgPersonaConf: string; populationConf: string; realPeople: string;
  multiplatform: string; credible: string; decisionInfluenced: string; timeSaved: string;
  researchSpend: string; humanStudies: string; humanSample: string;
}

const INIT_PERIODS: Periods = {
  workspacesCreated: "annually", explorationsLaunched: "half_year", personasCalibrated: "half_year",
  reportsDownloaded: "annually_2026", registeredUsers: "annually", activeUsers: "annually",
  avgTime: "annually", collaboration: "annually", avgPersonaConf: "annually",
  populationConf: "annually", realPeople: "annually", multiplatform: "annually",
  credible: "annually", decisionInfluenced: "annually", timeSaved: "hours",
  researchSpend: "hours", humanStudies: "annually", humanSample: "annually",
};

interface ActiveTabs { adoption: number; engagement: number; conviction: number; value: number; }
interface Workspace  { id: string; name?: string; }
interface Exploration { id: string; title?: string; }

// ─── Main component ───────────────────────────────────────────────────────────

const MyOrganization: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const auth = useSelector((s: RootState) => s.auth);
  const omi  = useSelector((s: RootState) => s.omi);

  const orgId = auth?.user?.organization_id || auth?.user?.org_id || "";
  const [orgName, setOrgName] = useState<string>("My Organisation");

  useEffect(() => {
    if (auth?.user && auth.user.account_tier !== "enterprise") {
      navigate(getPostLoginPath(auth.user), { replace: true });
    }
  }, [auth?.user, navigate]);

  const [showNotif,  setShowNotif]  = useState<boolean>(false);
  const [moreOpen,   setMoreOpen]   = useState<boolean>(false);
  const [periods,    setPeriods]    = useState<Periods>(INIT_PERIODS);
  const [activeTabs, setActiveTabs] = useState<ActiveTabs>({ adoption: 0, engagement: 0, conviction: 0, value: 0 });
  const [stats,      setStats]      = useState<DashboardStats>(ZERO_STATS);
  const [loading,    setLoading]    = useState<boolean>(false);
  const [error,      setError]      = useState<string | null>(null);
  const [csvOpen,    setCsvOpen]    = useState<boolean>(false);
  const [csvWsId,    setCsvWsId]    = useState<string>("");
  const [csvExId,    setCsvExId]    = useState<string>("");
  const [csvBusy,    setCsvBusy]    = useState<boolean>(false);

  const [analyticsPeriod, setAnalyticsPeriod] = useState<string>("all_time");

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
    if (orgId && !omi.isInitialized) dispatch(initializeSessionStart({ orgId }));
  }, [orgId, dispatch, omi.isInitialized]);

  const fetchData = useCallback(async (period: string = "all_time") => {
    if (!orgId) {
      setLoading(false);
      setError("Organisation ID not found. Please log out and log back in.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const [orgData, analyticsData] = await Promise.all([
        enterpriseService.getOrg(orgId),
        enterpriseService.getOrgAnalytics(orgId, period),
      ]);
      const name = orgData?.data?.name ?? orgData?.name;
      if (name) setOrgName(name);
      setStats(mapApiToStats(analyticsData as OrgAnalyticsApi));
    } catch (err: unknown) {
      const msg = (err as { detail?: string })?.detail
        ?? (err instanceof Error ? err.message : "Failed to load dashboard data");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchData(analyticsPeriod); }, [fetchData, analyticsPeriod]);

  const setPeriod = useCallback(
    (key: keyof Periods) => (v: string) => {
      setPeriods((p) => ({ ...p, [key]: v }));
      const apiPeriod = PERIOD_MAP[v] ?? "all_time";
      setAnalyticsPeriod(apiPeriod);
    },
    []
  );
  const setTab = useCallback(
    (section: keyof ActiveTabs) => (idx: number) => setActiveTabs((p) => ({ ...p, [section]: idx })),
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
    } finally { setCsvBusy(false); }
  };

  const openCsvModal = (): void => { setCsvOpen(true); setCsvWsId(""); setCsvExId(""); setMoreOpen(false); };

  if (loading) return (
    <div className={styles.loadingState}>
      <div className={styles.spinner} />
      <span>Loading dashboard…</span>
    </div>
  );
  if (error) return (
    <div className={styles.errorState}>
      <span className={styles.errorText}>{error}</span>
      <button className={styles.retryBtn} onClick={() => fetchData(analyticsPeriod)}>Retry</button>
    </div>
  );

  // ─── Adoption tab definitions ───────────────────────────────────────────────

  const adoptionTabs = [
    { value: stats.adoption.workspacesCreated,                          label: "Workspaces Created"    },
    { value: stats.adoption.explorationsLaunched,                       label: "Explorations Launched" },
    { value: stats.adoption.personasCalibrated,                         label: "Personas Calibrated"   },
    { value: String(stats.adoption.reportsDownloaded).padStart(3, "0"), label: "Reports Downloaded"    },
  ];

  const renderAdoptionChart = (): React.ReactNode => {
    const idx = activeTabs.adoption;

    if (idx === 0) return (
      <>
        <ChartCtrl title="Workspaces Created" value={periods.workspacesCreated} onChange={setPeriod("workspacesCreated")} />
        {stats.charts.workspacesCreated.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.charts.workspacesCreated} barSize={28} margin={CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis
                  dataKey="dept"
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  label={{ value: "Department Name", position: "insideBottom", offset: -14, style: axisLabelStyle }}
                />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  label={{ value: "Number of workspaces", angle: -90, position: "insideLeft", offset: 0, dx: -14, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="value" name="Workspaces" fill={C.barBlue} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );

    if (idx === 1) return (
      <>
        <ChartCtrl title="Explorations Launched" value={periods.explorationsLaunched} onChange={setPeriod("explorationsLaunched")} options={HALF_YEAR_OPTS} />
        {stats.charts.explorationsLaunched.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.charts.explorationsLaunched} barSize={28} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="dept" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  label={{ value: "Count of explorations", angle: -90, position: "insideLeft", offset: 0, dx: -14, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="value" name="Explorations" fill={C.barPurple} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );

    if (idx === 2) return (
      <>
        <ChartCtrl title="Personas Calibrated" value={periods.personasCalibrated} onChange={setPeriod("personasCalibrated")} options={HALF_YEAR_OPTS} />
        {stats.charts.personasCalibrated.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.charts.personasCalibrated} barSize={28} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  label={{ value: "Number of Personas", angle: -90, position: "insideLeft", offset: 0, dx: -14, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Bar dataKey="singleUser" name="OMI Personas"    stackId="a" fill={C.barPurple} />
                <Bar dataKey="multiUser"  name="Manual Personas" stackId="a" fill={C.barTeal} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <StackedLegend a="OMI Personas" b="Manual Personas" colorA={C.barPurple} colorB={C.barTeal} />
      </>
    );

    return (
      <>
        <ChartCtrl title="Reports Downloaded" value={periods.reportsDownloaded} onChange={setPeriod("reportsDownloaded")} options={ANNUAL_2026_OPTS} wide />
        {stats.charts.reportsDownloaded.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.charts.reportsDownloaded} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  label={{ value: "Reports Downloaded", angle: -90, position: "insideLeft", offset: 0, dx: -14, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Line type="monotone" dataKey="value" name="Reports Downloaded" stroke={C.line} strokeWidth={2}
                  dot={{ r: 4, fill: C.line, strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );
  };

  // ─── Engagement tab definitions ─────────────────────────────────────────────

  const engagementTabs = [
    { value: stats.userEngagement.registeredUsers.value,       label: "Registered Users"             },
    { value: stats.userEngagement.activeUsers.value,           label: "Active Users"                  },
    { value: stats.userEngagement.avgTimePerExploration.value, label: "hrs Avg. Time per Exploration" },
    { value: stats.userEngagement.collaborationRate.value,     label: "Collaboration Rate"            },
  ];

  const renderEngagementChart = (): React.ReactNode => {
    const idx = activeTabs.engagement;

    if (idx === 0) return (
      <>
        <ChartCtrl title="Registered Users" value={periods.registeredUsers} onChange={setPeriod("registeredUsers")} options={ANNUAL_VARIANT_OPTS} />
        {stats.charts.registeredUsers.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.charts.registeredUsers} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  label={{ value: "Registered Users", angle: -90, position: "insideLeft", offset: 0, dx: -14, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Line type="monotone" dataKey="value" name="Registered Users" stroke={C.line} strokeWidth={2}
                  dot={{ r: 4, fill: C.line, strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );

    if (idx === 1) return (
      <>
        <ChartCtrl title="Active Users" value={periods.activeUsers} onChange={setPeriod("activeUsers")} options={ANNUAL_VARIANT_OPTS} />
        {stats.charts.activeUsers.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.charts.activeUsers} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  label={{ value: "Active Users", angle: -90, position: "insideLeft", offset: 0, dx: -14, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Line type="monotone" dataKey="value" name="Active Users" stroke={C.line} strokeWidth={2}
                  dot={{ r: 4, fill: C.line, strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );

    if (idx === 2) return (
      <>
        <ChartCtrl title="Avg. Time per Exploration" value={periods.avgTime} onChange={setPeriod("avgTime")} options={ANNUAL_VARIANT_OPTS} />
        {stats.charts.avgTimePerExploration.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.charts.avgTimePerExploration} barSize={28} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="dept" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  label={{ value: "Avg hrs / Exploration", angle: -90, position: "insideLeft", offset: 0, dx: -14, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="value" name="Avg hrs per Exploration" fill={C.barPurple} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );

    return (
      <>
        <ChartCtrl title="Collaboration Rate" value={periods.collaboration} onChange={setPeriod("collaboration")} options={ANNUAL_VARIANT_OPTS} />
        {stats.charts.collaborationRate.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.charts.collaborationRate} barSize={28} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  label={{ value: "Explorations", angle: -90, position: "insideLeft", offset: 0, dx: -14, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Bar dataKey="singleUser" name="Single User"    stackId="a" fill={C.barBlue} />
                <Bar dataKey="multiUser"  name="Multiple Users" stackId="a" fill={C.barTeal} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <StackedLegend a="Single User" b="Multiple Users" />
      </>
    );
  };

  // ─── Conviction tab definitions ─────────────────────────────────────────────

  const convictionTabs = [
    { value: stats.conviction.personaConfidence.value,     label: "Persona Confidence"               },
    { value: stats.conviction.populationConfidence,         label: "Population Confidence"            },
    { value: stats.conviction.realPeoplesActions,           label: "Real People's Actions Calibrated" },
    { value: stats.conviction.multiplatformConversation,    label: "Multi-platform Conversation"      },
    { value: stats.conviction.credibleSources,              label: "Credible Sources Contextualised"  },
  ];

  const renderConvictionChart = (): React.ReactNode => {
    const idx = activeTabs.conviction;

    if (idx === 0) return (
      <>
        <ChartCtrl title="Avg. Persona Confidence" value={periods.avgPersonaConf} onChange={setPeriod("avgPersonaConf")} />
        {stats.charts.avgPersonaConfidence.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.charts.avgPersonaConfidence} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  width={60}
                  label={{ value: "Persona Confidence (%)", angle: -90, position: "insideLeft", offset: 0, dx: -16, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Line type="monotone" dataKey="value" name="Avg Persona Confidence (%)" stroke={C.line} strokeWidth={2}
                  dot={{ r: 4, fill: C.line, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );

    if (idx === 1) return (
      <>
        <ChartCtrl title="Population Confidence" value={periods.populationConf} onChange={setPeriod("populationConf")} />
        {stats.charts.populationConfidence.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.charts.populationConfidence} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  width={60}
                  label={{ value: "Population Confidence (%)", angle: -90, position: "insideLeft", offset: 0, dx: -16, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Line type="monotone" dataKey="value" name="Avg Population Confidence (%)" stroke={C.line} strokeWidth={2}
                  dot={{ r: 4, fill: C.line, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );

    if (idx === 2) return (
      <>
        <ChartCtrl title="Avg. Real People's Actions Calibrated" value={periods.realPeople} onChange={setPeriod("realPeople")} />
        {stats.charts.realPeoplesActions.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.charts.realPeoplesActions} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  label={{ value: "Actions Calibrated", angle: -90, position: "insideLeft", offset: 0, dx: -14, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Line type="monotone" dataKey="value" name="Real People's Actions" stroke={C.line} strokeWidth={2}
                  dot={{ r: 4, fill: C.line, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );

    if (idx === 3) return (
      <>
        <ChartCtrl title="Avg. Multi-platform Conversation" value={periods.multiplatform} onChange={setPeriod("multiplatform")} />
        {stats.charts.multiplatformConversation.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.charts.multiplatformConversation} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  label={{ value: "Conversations", angle: -90, position: "insideLeft", offset: 0, dx: -14, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Line type="monotone" dataKey="value" name="Multi-platform Conversation" stroke={C.line} strokeWidth={2}
                  dot={{ r: 4, fill: C.line, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );

    return (
      <>
        <ChartCtrl title="Avg. Credible Sources Contextualized" value={periods.credible} onChange={setPeriod("credible")} />
        {stats.charts.credibleSources.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.charts.credibleSources} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  label={{ value: "Credible Sources", angle: -90, position: "insideLeft", offset: 0, dx: -14, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Line type="monotone" dataKey="value" name="Credible Sources" stroke={C.line} strokeWidth={2}
                  dot={{ r: 4, fill: C.line, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );
  };

  // ─── Value Delivered tab definitions ────────────────────────────────────────

  const valueTabs = [
    { value: stats.valueDelivered.decisionInfluenced.value,        label: "Decision Influenced"     },
    { value: `${stats.valueDelivered.timeSaved.value} hrs`,        label: "Time Saved"              },
    { value: stats.valueDelivered.researchSpendSaved.value,        label: "Research Spend Saved"    },
    { value: stats.valueDelivered.humanStudiesReplaced,            label: "Human Studies Replaced"  },
    { value: stats.valueDelivered.humanSampleReduced,              label: "Human Sample Reduced"    },
  ];

  const renderValueChart = (): React.ReactNode => {
    const idx = activeTabs.value;

    if (idx === 0) return (
      <>
        <ChartCtrl title="Decision Influenced" value={periods.decisionInfluenced} onChange={setPeriod("decisionInfluenced")} />
        {stats.charts.decisionInfluenced.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.charts.decisionInfluenced} barSize={28} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  label={{ value: "Count of explorations", angle: -90, position: "insideLeft", offset: 0, dx: -14, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Bar dataKey="singleUser" name="Total Explorations"  stackId="a" fill={C.barBlue} />
                <Bar dataKey="multiUser"  name="Decision Influenced" stackId="a" fill={C.barTeal} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <StackedLegend a="Total Explorations" b="Decision Influenced" />
      </>
    );

    if (idx === 1) return (
      <>
        <ChartCtrl title="Time Saved" value={periods.timeSaved} onChange={setPeriod("timeSaved")} options={HOURS_OPTS} />
        {stats.charts.timeSaved.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.charts.timeSaved} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  label={{ value: "Time saved (hrs)", angle: -90, position: "insideLeft", offset: 0, dx: -14, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Line type="monotone" dataKey="value" name="Time Saved (hrs)" stroke={C.line} strokeWidth={2}
                  dot={{ r: 4, fill: C.line, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );

    if (idx === 2) return (
      <>
        <ChartCtrl title="Research Spend Saved" value={periods.researchSpend} onChange={setPeriod("researchSpend")} options={HOURS_OPTS} />
        {stats.charts.researchSpendSaved.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.charts.researchSpendSaved} margin={CHART_MARGIN_NO_XLAB}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="name" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${v}`}
                  width={60}
                  label={{ value: "Cost saved ($)", angle: -90, position: "insideLeft", offset: 0, dx: -16, style: axisLabelStyle }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Line type="monotone" dataKey="value" name="Research Spend Saved ($)" stroke={C.line} strokeWidth={2}
                  dot={{ r: 4, fill: C.line, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </>
    );

    if (idx === 3) return (
      <>
        <ChartCtrl title="Human Studies Replaced" value={periods.humanStudies} onChange={setPeriod("humanStudies")} />
        {stats.charts.humanStudiesReplaced.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.charts.humanStudiesReplaced} barSize={28} margin={CHART_MARGIN_WIDE}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  label={{ value: "Explorations replacing studies", angle: -90, position: "insideLeft", offset: 0, dx: -16, style: axisLabelStyleSm }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Bar dataKey="singleUser" name="Total Explorations"     stackId="a" fill={C.barBlue} />
                <Bar dataKey="multiUser"  name="Replaced Human Studies" stackId="a" fill={C.barTeal} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <StackedLegend a="Total Explorations" b="Replaced Human Studies" />
      </>
    );

    return (
      <>
        <ChartCtrl title="Human Sample Reduced" value={periods.humanSample} onChange={setPeriod("humanSample")} />
        {stats.charts.humanSampleReduced.length === 0 ? <EmptyChart /> : (
          <div className={styles.chartArea}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.charts.humanSampleReduced} barSize={28} margin={CHART_MARGIN_WIDE}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.grid} />
                <XAxis dataKey="month" tick={tickStyle} axisLine={false} tickLine={false} interval={0} />
                <YAxis
                  tick={tickStyle}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  label={{ value: "Explorations reducing sampling", angle: -90, position: "insideLeft", offset: 0, dx: -16, style: axisLabelStyleSm }}
                />
                <Tooltip contentStyle={TTStyle} />
                <Bar dataKey="singleUser" name="Total Explorations"   stackId="a" fill={C.barBlue} />
                <Bar dataKey="multiUser"  name="Reduced Human Sample" stackId="a" fill={C.barTeal} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <StackedLegend a="Total Explorations" b="Reduced Human Sample" />
      </>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const { banner } = stats;

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
                <button className={styles.csvBtn} onClick={openCsvModal}>
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
          Synthetic-People has powered{" "}
          <strong>{banner.totalExplorations}</strong> strategic explorations, influenced{" "}
          <strong>{banner.decisionsInfluenced}</strong> decisions, and unlocked{" "}
          <strong>{banner.researchTimeUnlockedHrs.toLocaleString()}</strong> research hours while saving{" "}
          <strong>${banner.researchSpendSavedUsd.toLocaleString()}</strong> research spend across your organisation
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
                <div className={styles.metricValue}>{stats.usageMetrics.totalExploration.value}<span className={styles.trendUp}>↗</span></div>
                <div className={styles.metricLabel}>Total Exploration</div>
              </div>
              <div className={styles.metricItem}>
                <div className={styles.metricValue}>{stats.usageMetrics.totalUsers.value}</div>
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
                <div className={styles.metricValue}>{stats.outcomeInfluenced.decisionsInfluenced.value}<span className={styles.trendUp}>↗</span></div>
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
                <div className={styles.metricValue}>{stats.economics.researchSpendSaved.value}</div>
                <div className={styles.metricLabel}>Research Spend Saved</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Adoption Dynamics + User Engagement ─────────────── */}
        <div className={styles.sectionGrid2}>

          <div className={styles.sectionPanel}>
            <div className={styles.sectionPanelTitle}>Adoption Dynamics</div>
            <div className={`${styles.tabStrip} ${styles.tabStrip4}`}>
              {adoptionTabs.map((tab, i) => (
                <button key={i}
                  className={`${styles.tabCard} ${activeTabs.adoption === i ? styles.tabCardActive : ""}`}
                  onClick={() => setTab("adoption")(i)}>
                  <div className={styles.tabValue}>{tab.value}</div>
                  <div className={styles.tabLabel}>{tab.label}</div>
                </button>
              ))}
            </div>
            {renderAdoptionChart()}
          </div>

          <div className={styles.sectionPanel}>
            <div className={styles.sectionPanelTitle}>User Engagement</div>
            <div className={`${styles.tabStrip} ${styles.tabStrip4}`}>
              {engagementTabs.map((tab, i) => (
                <button key={i}
                  className={`${styles.tabCard} ${activeTabs.engagement === i ? styles.tabCardActive : ""}`}
                  onClick={() => setTab("engagement")(i)}>
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

          <div className={styles.sectionPanel}>
            <div className={styles.sectionPanelTitle}>Conviction Measurement</div>
            <div className={`${styles.tabStrip} ${styles.tabStrip5}`}>
              {convictionTabs.map((tab, i) => (
                <button key={i}
                  className={`${styles.tabCard} ${activeTabs.conviction === i ? styles.tabCardActive : ""}`}
                  onClick={() => setTab("conviction")(i)}>
                  <div className={styles.tabValue}>{tab.value}</div>
                  <div className={styles.tabLabel}>{tab.label}</div>
                </button>
              ))}
            </div>
            {renderConvictionChart()}
          </div>

          <div className={styles.sectionPanel}>
            <div className={styles.sectionPanelTitle}>Value Delivered</div>
            <div className={`${styles.tabStrip} ${styles.tabStrip5}`}>
              {valueTabs.map((tab, i) => (
                <button key={i}
                  className={`${styles.tabCard} ${activeTabs.value === i ? styles.tabCardActive : ""}`}
                  onClick={() => setTab("value")(i)}>
                  <div className={styles.tabValue}>{tab.value}</div>
                  <div className={styles.tabLabel}>{tab.label}</div>
                </button>
              ))}
            </div>
            {renderValueChart()}
          </div>
        </div>

      </div>

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
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name ?? w.id}</option>)}
            </select>
            <label htmlFor="csv-ex" className={styles.modalLabel}>Exploration</label>
            <select id="csv-ex" className={styles.modalSelect} value={csvExId}
              onChange={(e) => setCsvExId(e.target.value)} disabled={!csvWsId || exLoading}>
              <option value="">{exLoading ? "Loading…" : "Choose exploration…"}</option>
              {explorations.map((ex) => <option key={ex.id} value={ex.id}>{ex.title ?? ex.id}</option>)}
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