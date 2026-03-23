import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { initializeSessionStart } from "../../../redux/slices/omiSlice";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  TbBuildingSkyscraper,
  TbUsers,
  TbFolders,
  TbPlus,
  TbArrowRight,
  TbSettings,
  TbActivity,
  TbChartBar,
  TbCurrencyDollar,
  TbClock,
  TbCalendar,
  TbTarget,
  TbBriefcase,
  TbChevronDown,
  TbDownload,
  TbUserPlus,
  TbUserCheck,
  TbHourglass,
  TbShare,
  TbBulb
} from "react-icons/tb";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ComposedChart,
  PieChart,
  Pie
} from "recharts";
import logoForDark from "../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../assets/Logo_Light_bg.png";
import { useTheme } from "../../../context/ThemeContext";
import { adminService } from "../../../services/adminService";

// Internal component for individual floating particles
const MouseParticle = ({ mouseX, mouseY, damping, stiffness, offsetX = 0, offsetY = 0, className }) => {
  const springX = useSpring(mouseX, { stiffness, damping });
  const springY = useSpring(mouseY, { stiffness, damping });

  const x = useTransform(springX, (value) => value + offsetX);
  const y = useTransform(springY, (value) => value + offsetY);

  return (
    <motion.div
      style={{ x, y }}
      className={`fixed top-0 left-0 pointer-events-none ${className}`}
    />
  );
};

const KeyNumber = ({ label, value, icon: Icon }) => (
  <div className="flex flex-col items-center justify-center p-4 border-r border-gray-200 dark:border-white/10 last:border-r-0">
    <span className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-1 tracking-tighter">{value}</span>
    <span className="text-[10px] md:text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 font-bold text-center leading-tight h-8 flex items-center">{label}</span>
  </div>
);

const KeyNumbersCard = ({ delay }) => {
  const stats = [
    { label: "Total Workflows", value: "70" },
    { label: "Total Explorations", value: "160" },
    { label: "Total Users", value: "81" },
    { label: "Outcome Influenced", value: "68%" },
    { label: "Hours Saved", value: "487" },
    { label: "Cost Saved", value: "$60,000" },
    { label: "Human Studies Avoided", value: "18" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.6 }}
      className="bg-white dark:bg-white/5 backdrop-blur-xl rounded-2xl p-8 mt-8 border-2 border-gray-300/60 dark:border-white/10 shadow-xl overflow-hidden relative group"
    >
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-30 group-hover:opacity-100 transition-opacity duration-500" />

      <h3 className="text-gray-500 dark:text-gray-400 text-[10px] font-white mb-8 px-2 tracking-[0.4em] flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        Key Performance Metrics
      </h3>


      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 md:gap-0">
        {stats.map((stat, index) => (
          <KeyNumber key={index} label={stat.label} value={stat.value} />
        ))}
      </div>
    </motion.div>
  );
};

const CustomChartTooltip = ({ active, payload, description, theme }) => {
  if (active && payload && payload.length) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        className="bg-[#0a0f1a]/95 backdrop-blur-md border border-blue-500/30 p-4 rounded-lg shadow-[0_0_20px_rgba(59,130,246,0.2)] min-w-[200px] z-[100] relative"
      >
        {/* Neon Accent Corner */}
        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-blue-500/50 rounded-tr-lg" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-blue-500/50 rounded-bl-lg" />

        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-blue-400 uppercase tracking-widest opacity-70">
              {payload[0].payload.name}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-[9px] font-mono text-gray-500 uppercase tracking-tighter">Value</span>
              <span className="text-3xl font-mono font-bold text-white tracking-widest">
                {payload[0].value.toLocaleString()}
              </span>
            </div>
            {payload[0].payload.average && (
              <div className="flex flex-col items-end">
                <span className="text-[9px] font-mono text-gray-500 uppercase tracking-tighter">Avg</span>
                <span className="text-lg font-mono text-blue-400/80">{payload[0].payload.average}</span>
              </div>
            )}
          </div>

          <div className="h-px bg-blue-500/20 w-full" />

          <p className="text-[10px] font-mono leading-tight text-gray-400 opacity-60 uppercase italic">
            // {description}
          </p>
        </div>
      </motion.div>
    );
  }
  return null;
};

const DashboardCard = ({ title, subtitle, config, selectedKey, onSelect, isDropdownOpen, setIsDropdownOpen, delay, theme, description, className = "" }) => {
  const current = config[selectedKey];
  const Icon = current.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl p-6 shadow-xl relative group flex flex-col min-h-[420px] ${className}`}
    >
      {/* Dynamic Glow Effect */}
      <div className={`absolute top-0 right-0 w-32 h-32 opacity-0 group-hover:opacity-20 transition-opacity duration-1000 rounded-full blur-3xl`} style={{ backgroundColor: current.color }} />

      <div className="flex justify-between items-start mb-8 relative z-30">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3 text-gray-400 dark:text-white font-black text-[9px] uppercase tracking-[0.4em]">
            <div className={`p-2 rounded-xl bg-gray-100 dark:bg-white/5 shadow-inner`}>
              <Icon size={14} style={{ color: current.color }} />
            </div>
            {title}
          </div>
          <h4 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">
            {current.chartTitle}
          </h4>
        </div>

        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-3 bg-gray-100 dark:bg-white/5 pl-5 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-white/10 transition-all font-black text-[10px] tracking-widest shadow-sm group/btn"
          >
            {current.label}
            <TbChevronDown className={`transition-transform duration-300 text-blue-500 ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="absolute right-0 mt-3 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] z-50 overflow-hidden p-3 backdrop-blur-3xl">
                {Object.keys(config).map((key) => (
                  <button
                    key={key}
                    onClick={(e) => { e.stopPropagation(); onSelect(key); setIsDropdownOpen(false); }}
                    className={`w-full text-left px-5 py-4 text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-between rounded-2xl mb-1 last:mb-0
                      ${selectedKey === key
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:translate-x-1'}`}
                  >
                    <div className="flex items-center gap-4">
                      {React.createElement(config[key].icon, { size: 18, style: { color: selectedKey === key ? 'white' : config[key].color } })}
                      {config[key].label}
                    </div>
                    {selectedKey === key && <div className="w-2 h-2 rounded-full bg-white shadow-glow" />}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 w-full relative z-10 min-h-[250px] mt-auto">
        {(!current.data || current.data.length === 0 || current.data.every(d => d.value === 0)) ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <span className="text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest text-[10px] leading-relaxed">
              {current.emptyMessage || `No ${current.label} Recorded Yet`}
            </span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {current.type === 'line' ? (
              <LineChart data={current.data} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid vertical={false} stroke={theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'} strokeDasharray="3 3" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 11, fontWeight: '800' }} dy={15} />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip cursor={{ stroke: 'rgba(59, 130, 246, 0.3)', strokeWidth: 2 }} content={(props) => <CustomChartTooltip {...props} description={current.description} theme={theme} />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={current.color}
                  strokeWidth={5}
                  dot={{ r: 4, fill: current.color, strokeWidth: 0 }}
                  activeDot={{ r: 8, fill: current.color, stroke: '#fff', strokeWidth: 4, shadow: '0 0 20px rgba(59, 130, 246, 0.5)' }}
                  animationDuration={2000}
                  key={selectedKey}
                />
              </LineChart>
            ) : current.type === 'area' ? (
              <AreaChart data={current.data} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                <defs>
                  <linearGradient id={`gradient-${selectedKey}-${delay}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={current.color} stopOpacity={0.5} />
                    <stop offset="50%" stopColor={current.color} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={current.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'} strokeDasharray="3 3" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 11, fontWeight: '800' }} dy={15} />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip cursor={{ stroke: 'rgba(59, 130, 246, 0.3)', strokeWidth: 2 }} content={(props) => <CustomChartTooltip {...props} description={current.description} theme={theme} />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={current.color}
                  strokeWidth={5}
                  fill={`url(#gradient-${selectedKey}-${delay})`}
                  dot={{ r: 4, fill: current.color, strokeWidth: 0 }}
                  activeDot={{ r: 8, fill: current.color, stroke: '#fff', strokeWidth: 4 }}
                  animationDuration={2000}
                  key={selectedKey}
                />
              </AreaChart>
            ) : current.type === 'composed' ? (
              <ComposedChart data={current.data} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid vertical={false} stroke={theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'} strokeDasharray="3 3" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 11, fontWeight: '800' }} dy={15} />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }} content={(props) => <CustomChartTooltip {...props} description={current.description} theme={theme} />} />
                <Bar dataKey="value" fill={current.color} radius={[12, 12, 0, 0]} barSize={32} animationDuration={2000} key={`${selectedKey}-bar`} />
                <Line type="monotone" dataKey="average" stroke={theme === 'dark' ? '#94a3b8' : '#64748b'} strokeWidth={3} strokeDasharray="8 8" dot={false} animationDuration={2000} key={`${selectedKey}-line`} />
              </ComposedChart>
            ) : current.type === 'pie' ? (
              <PieChart>
                <Tooltip content={(props) => <CustomChartTooltip {...props} description={current.description} theme={theme} />} />
                <Pie
                  data={current.data}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={10}
                  dataKey="value"
                  animationDuration={2000}
                  key={selectedKey}
                  stroke="none"
                >
                  {current.data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLLAB_COLORS[index % COLLAB_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            ) : (
              <BarChart data={current.data} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid vertical={false} stroke={theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'} strokeDasharray="3 3" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 11, fontWeight: '800' }} dy={15} />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }} content={(props) => <CustomChartTooltip {...props} description={current.description} theme={theme} />} />
                <Bar dataKey="value" radius={[10, 10, 10, 10]} barSize={40} animationDuration={2000} key={selectedKey}>
                  {current.data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={current.color} fillOpacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
};

const QuickAction = ({ title, description, icon: Icon, onClick, delay, primary, className = "" }) => (
  <motion.button
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay, duration: 0.5 }}
    onClick={onClick}
    className={`w-full text-left p-6 rounded-2xl border-2 transition-all duration-500 group relative overflow-hidden backdrop-blur-xl shadow-xl
      ${primary
        ? "bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 border-white/20 text-white shadow-blue-500/20 shadow-xl"
        : "bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 hover:border-blue-500/50 text-gray-900 dark:text-white"
      } ${className}`}
  >
    <div className="flex items-center gap-4 relative z-10">
      <div className={`p-3 rounded-xl shadow-inner ${primary ? "bg-white/10" : "bg-gray-100 dark:bg-white/5 group-hover:bg-blue-500/10 transition-colors duration-500"}`}>
        <Icon size={20} className={`${primary ? "text-white" : "text-gray-400 group-hover:text-blue-500 transition-colors duration-500"}`} />
      </div>
      <div className="flex-1">
        <h4 className="font-black text-[10px] tracking-[0.2em] uppercase mb-0.5">{title}</h4>
        <p className={`text-[11px] font-bold ${primary ? "text-blue-100/80" : "text-gray-500 dark:text-gray-400"}`}>{description}</p>
      </div>
    </div>
    {primary && <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-to-br from-white/10 to-transparent rotate-45 pointer-events-none group-hover:translate-x-10 transition-transform duration-1000" />}
  </motion.button>
);



const metricsConfig = {
  explorations: {
    label: "Total No of Explorations",
    chartTitle: "Monthly Research Momentum",
    description: "Distinct studies started, including both completed and in-progress explorations",
    data: [],
    icon: TbActivity,
    color: "#0ea5e9",
    type: "area"
  },
  workflows: {
    label: "Total No of Workflows",
    chartTitle: "Workflow Creation Velocity",
    description: "Number of functions or teams that have created workflows",
    data: [],
    icon: TbFolders,
    color: "#3b82f6",
    type: "line"
  },
  downloads: {
    label: "Reports Downloaded",
    chartTitle: "Insight Export Volume",
    description: "Insight reports exported for presentations and decision meetings",
    data: [],
    icon: TbDownload,
    color: "#8b5cf6",
    type: "bar"
  }
};

const userRegData = [
  { name: 'Jan', value: 120 },
  { name: 'Feb', value: 210 },
  { name: 'Mar', value: 180 },
  { name: 'Apr', value: 250 },
  { name: 'May', value: 320 },
  { name: 'Jun', value: 410 },
];

const activeUserData = [
  { name: 'Jan', value: 85 },
  { name: 'Feb', value: 75 },
  { name: 'Mar', value: 95 },
  { name: 'Apr', value: 110 },
  { name: 'May', value: 130 },
  { name: 'Jun', value: 145 },
  { name: 'Jul', value: 135 }, { name: 'Aug', value: 120 }, { name: 'Sep', value: 95 },
  { name: 'Oct', value: 80 }, { name: 'Nov', value: 65 }, { name: 'Dec', value: 50 }
];

const avgTimeData = [
  { name: 'Marketing', value: 45, average: 40 },
  { name: 'Design', value: 30, average: 40 },
  { name: 'Engineering', value: 55, average: 40 },
  { name: 'Product', value: 40, average: 40 },
  { name: 'Sales', value: 25, average: 40 },
  { name: 'Legal', value: 15, average: 40 },
];

const collabRateData = [
  { name: 'Solo', value: 45 },
  { name: '2 Users', value: 35 },
  { name: '3+ Users', value: 20 },
];

const COLLAB_COLORS = ['#3b82f6', '#8b5cf6', '#f472b6', '#0ea5e9'];

const userMetricsConfig = {
  active: {
    label: "Monthly Active Users",
    chartTitle: "Community Engagement Pulse",
    description: "Users who engaged with Synthetic-People in the last 30 days",
    data: activeUserData,
    icon: TbUserCheck,
    color: "#f472b6",
    type: "bar"
  },
  registered: {
    label: "Growth of registered users",
    chartTitle: "Total Ecosystem Expansion",
    description: "All initiated users, including researchers and stakeholders",
    data: userRegData,
    icon: TbUserPlus,
    color: "#8b5cf6",
    type: "area"
  },
  avgTime: {
    label: "Avg. Exploration Time",
    chartTitle: "Efficiency by Department",
    description: "Average time from exploration creation to first insights viewed",
    data: avgTimeData,
    icon: TbHourglass,
    color: "#fbbf24",
    type: "composed"
  },
  collaboration: {
    label: "Collaboration Rate",
    chartTitle: "Inter-departmental Synergy",
    description: "% of explorations with 1+ collaborators—indicates cross-team research usage.",
    data: collabRateData,
    icon: TbShare,
    color: "#f43f5e",
    type: "pie"
  }
};

const efficiencyData = [
  { name: 'Jan', efficiency: 65 },
  { name: 'Feb', efficiency: 72 },
  { name: 'Mar', efficiency: 85 },
  { name: 'Apr', efficiency: 78 },
  { name: 'May', efficiency: 92 },
  { name: 'Jun', efficiency: 98 },
];

const efficiencyConfig = {
  hours: {
    label: "Total Hours Saved",
    chartTitle: "Time Optimization Yield",
    description: "Time recovered by automating manual research tasks",
    data: [
      { name: 'W1', value: 45 }, { name: 'W2', value: 52 }, { name: 'W3', value: 48 },
      { name: 'W4', value: 65 }, { name: 'W5', value: 58 }, { name: 'W6', value: 72 },
    ],
    icon: TbClock,
    color: "#0ea5e9",
    type: "area"
  },
  cost: {
    label: "Total Cost Saved",
    chartTitle: "Fiscal Impact Analysis",
    description: "Direct financial impact of optimized research workflows",
    data: [
      { name: 'Jan', value: 8000 }, { name: 'Feb', value: 12000 }, { name: 'Mar', value: 10500 },
      { name: 'Apr', value: 15000 }, { name: 'May', value: 18000 }, { name: 'Jun', value: 22000 },
    ],
    icon: TbCurrencyDollar,
    color: "#10b981",
    type: "bar"
  }
};

const strategicConfig = {
  impact: {
    label: "Outcome Influenced",
    chartTitle: "Strategic Decision Impact",
    description: "Percentage of strategic meetings citing Synthetic-People insights",
    data: [
      { name: 'Jan', value: 45 }, { name: 'Feb', value: 48 }, { name: 'Mar', value: 55 },
      { name: 'Apr', value: 62 }, { name: 'May', value: 65 }, { name: 'Jun', value: 68 },
    ],
    icon: TbTarget,
    color: "#f59e0b",
    type: "area"
  },
  accuracy: {
    label: "Research Accuracy",
    chartTitle: "Fidelity vs. Human Benchmarks",
    description: "Alignment percentage with traditional human-led study results",
    data: [
      { name: 'Jan', value: 88, average: 85 }, { name: 'Feb', value: 90, average: 85 },
      { name: 'Mar', value: 92, average: 85 }, { name: 'Apr', value: 91, average: 85 },
      { name: 'May', value: 94, average: 85 }, { name: 'Jun', value: 95, average: 85 },
    ],
    icon: TbActivity,
    color: "#f43f5e",
    type: "composed"
  }
};

const outputConfig = {
  studies: {
    label: "Studies Avoided",
    chartTitle: "Physical Research Mitigation",
    description: "Traditional studies replaced by high-fidelity synthetic populations",
    data: [
      { name: 'Jan', value: 2 }, { name: 'Feb', value: 3 }, { name: 'Mar', value: 4 },
      { name: 'Apr', value: 3 }, { name: 'May', value: 5 }, { name: 'Jun', value: 6 },
    ],
    icon: TbUsers,
    color: "#6366f1",
    type: "bar"
  },
  productivity: {
    label: "Productivity Index",
    chartTitle: "Operational Throughput",
    description: "Volume of actionable insights generated per researcher",
    data: [
      { name: 'Jan', value: 1.2 }, { name: 'Feb', value: 1.5 }, { name: 'Mar', value: 1.8 },
      { name: 'Apr', value: 2.1 }, { name: 'May', value: 2.4 }, { name: 'Jun', value: 2.8 },
    ],
    icon: TbActivity,
    color: "#14b8a6",
    type: "area"
  }
};

const confidenceData = [
  { name: 'Marketing', value: 82 },
  { name: 'Design', value: 78 },
  { name: 'Eng', value: 91 },
  { name: 'Product', value: 85 },
  { name: 'Sales', value: 72 },
  { name: 'Legal', value: 68 },
];

const simulationData = [
  { name: 'Marketing', value: 450 },
  { name: 'Design', value: 320 },
  { name: 'Eng', value: 890 },
  { name: 'Product', value: 610 },
  { name: 'Sales', value: 210 },
  { name: 'Legal', value: 45 },
];

const qualityLogConfig = {
  personaConfidence: {
    label: "Avg Persona Confidence",
    chartTitle: "Persona Alignment",
    description: "Confidence score across all personas in use (70%+ = high alignment with research objectives)",
    data: confidenceData,
    icon: TbUserCheck,
    color: "#0ea5e9",
    type: "area"
  },
  populationConfidence: {
    label: "Avg Population Confidence",
    chartTitle: "Population Validity",
    description: "Confidence score across populations simulated (70%+ = high alignment with research objectives)",
    data: confidenceData.map(d => ({ ...d, value: d.value - 5 })),
    icon: TbUsers,
    color: "#8b5cf6",
    type: "area"
  },
  personaSimulated: {
    label: "Total Personas Simulated",
    chartTitle: "Persona Generation",
    description: "Unique personas built across all explorations by departments",
    data: simulationData,
    icon: TbUserPlus,
    color: "#f472b6",
    type: "bar"
  },
  populationSimulated: {
    label: "Total Populations Simulated",
    chartTitle: "Population Volume",
    description: "Audience populations simulated across all explorations by departments",
    data: simulationData.map(d => ({ ...d, value: Math.floor(d.value / 10) })),
    icon: TbTarget,
    color: "#14b8a6",
    type: "bar"
  }
};

const businessImpactConfig = {
  modalityMix: {
    label: "Research Modality Mix",
    chartTitle: "Methodology Distribution",
    description: "Breakdown of qualitative interviews, quantitative simulations, and mixed-method studies conducted organization-wide",
    data: [
      { name: 'Qual Only', value: 35 },
      { name: 'Quant Only', value: 45 },
      { name: 'Both', value: 20 },
    ],
    icon: TbChartBar,
    color: "#8b5cf6",
    type: "pie"
  },
  outcomesInfluenced: {
    label: "No of Outcomes Influenced",
    chartTitle: "Decision Impact",
    description: "Count of explorations tagged 'Helpful' by users—shows direct influence in decision making",
    data: [
      { name: 'Marketing', value: 45 },
      { name: 'Design', value: 32 },
      { name: 'Eng', value: 67 },
      { name: 'Product', value: 54 },
      { name: 'Sales', value: 28 },
      { name: 'Legal', value: 12 },
    ],
    icon: TbTarget,
    color: "#f59e0b",
    type: "bar"
  },
  topThemes: {
    label: "Top Research Themes",
    chartTitle: "Popular Research Objectives",
    description: "Most popular research objectives (Pricing Test, Concept Test, Message Test, etc.) ranked by exploration count",
    data: [
      { name: 'Pricing Test', value: 85 },
      { name: 'Concept Test', value: 72 },
      { name: 'Message Test', value: 58 },
      { name: 'UX Research', value: 45 },
      { name: 'Other', value: 30 },
    ],
    icon: TbBulb,
    color: "#06b6d4",
    type: "pie"
  }
};

const valueDeliveredConfig = {
  timeSaving: {
    label: "Total Time Saving",
    chartTitle: "Time Saved",
    description: "Hours saved from research brief to insights vs. traditional human study timelines (focus groups, surveys, panels)",
    data: [
      { name: 'Marketing', value: 120 },
      { name: 'Design', value: 85 },
      { name: 'Eng', value: 156 },
      { name: 'Product', value: 98 },
      { name: 'Sales', value: 45 },
      { name: 'Legal', value: 23 },
    ],
    icon: TbClock,
    color: "#0ea5e9",
    type: "bar"
  },
  costSavings: {
    label: "Total Cost Savings",
    chartTitle: "Cost Savings",
    description: "Estimated savings vs. traditional research rate cards (focus groups, surveys, panels) based on industry benchmarks",
    data: [
      { name: 'Marketing', value: 15000 },
      { name: 'Design', value: 8500 },
      { name: 'Eng', value: 22000 },
      { name: 'Product', value: 12500 },
      { name: 'Sales', value: 6000 },
      { name: 'Legal', value: 3500 },
    ],
    icon: TbCurrencyDollar,
    color: "#10b981",
    type: "bar"
  },
  studiesAvoided: {
    label: "Human Studies Avoided",
    chartTitle: "Studies Avoided",
    description: "Explorations delivering sufficient confidence to completely skip human validation studies",
    data: [
      { name: 'Marketing', value: 12 },
      { name: 'Design', value: 8 },
      { name: 'Eng', value: 18 },
      { name: 'Product', value: 14 },
      { name: 'Sales', value: 6 },
      { name: 'Legal', value: 3 },
    ],
    icon: TbUsers,
    color: "#6366f1",
    type: "bar"
  },
  sampleOptimization: {
    label: "Human Sample Optimization",
    chartTitle: "Sample Reduction",
    description: "Studies where synthetic pre-screening reduced required human sample size (e.g., 1,200 → 400 participants)",
    data: [
      { name: 'Marketing', value: 8 },
      { name: 'Design', value: 5 },
      { name: 'Eng', value: 12 },
      { name: 'Product', value: 9 },
      { name: 'Sales', value: 4 },
      { name: 'Legal', value: 2 },
    ],
    icon: TbActivity,
    color: "#f59e0b",
    type: "bar"
  }
};

const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MyOrganization = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { theme } = useTheme();
  const auth = useSelector((state) => state.auth);
  const omi = useSelector((state) => state.omi);
  const { organizations } = useSelector((state) => state.organizations);
  const organizationName = organizations?.data?.name || "My Organization";
  const orgId = organizations?.data?.id || "default-org";

  // Enterprise perspective dropdown states
  const [selectedMetric, setSelectedMetric] = React.useState('explorations');
  const [isDropdownOpen, setIsDropdownOpen] = React.useState(false);

  const [selectedUserMetric, setSelectedUserMetric] = React.useState('active');
  const [isUserDropdownOpen, setIsUserDropdownOpen] = React.useState(false);

  const [selectedStrategicMetric, setSelectedStrategicMetric] = React.useState('modalityMix');
  const [isStrategicDropdownOpen, setIsStrategicDropdownOpen] = React.useState(false);

  const [selectedOutputMetric, setSelectedOutputMetric] = React.useState('timeSaving');
  const [isOutputDropdownOpen, setIsOutputDropdownOpen] = React.useState(false);

  // Time Filter State
  const [timeFilter, setTimeFilter] = React.useState('6_month');
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = React.useState(false);

  const timeFilterOptions = {
    '6_month': 'Last 6 Months',
    '1_year': 'Last 1 Year',
    'all_time': 'All Time'
  };

  const filterData = (data) => {
    if (timeFilter === '6_month') return data.slice(-6);
    if (timeFilter === '1_year') return data.slice(-12);
    return data;
  };

  // Quality Log dropdown state
  const [qKey1, setQKey1] = React.useState('personaConfidence');
  const [qOpen1, setQOpen1] = React.useState(false);

  // API Data State
  const [dashboardData, setDashboardData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const data = await adminService.getAdminDashboardData(timeFilter);
      setDashboardData(data);
      setError(null);
    } catch (err) {
      console.error("Dashboard error:", err);
      setError(err?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [timeFilter]);

  // Derived Configs based on API data
  const chartMetricsConfig = React.useMemo(() => {
    const mapMonthly = (monthlyData) => monthlyData?.map(d => ({
      name: monthNames[d.month] || `M${d.month}`,
      value: d.count
    }));

    const exData = mapMonthly(dashboardData?.active_chart?.explorations_monthly);
    const wfData = mapMonthly(dashboardData?.active_chart?.workspaces_monthly);
    const dlData = mapMonthly(dashboardData?.active_chart?.report_downloads_monthly);

    return {
      explorations: {
        ...metricsConfig.explorations,
        data: exData && exData.length > 0 ? exData : []
      },
      workflows: {
        ...metricsConfig.workflows,
        data: wfData && wfData.length > 0 ? wfData : []
      },
      downloads: {
        ...metricsConfig.downloads,
        data: dlData && dlData.length > 0 ? dlData : []
      }
    };
  }, [dashboardData, timeFilter]);

  const chartUserMetricsConfig = React.useMemo(() => ({
    active: {
      ...userMetricsConfig.active,
      data: filterData(activeUserData)
    },
    registered: {
      ...userMetricsConfig.registered,
      data: filterData(userRegData)
    },
    avgTime: userMetricsConfig.avgTime,
    collaboration: userMetricsConfig.collaboration
  }), [timeFilter]);

  const chartQualityLogConfig = React.useMemo(() => {
    const personaSimulatedData = dashboardData?.quality_logs?.total_persona_simulated?.map(d => ({
      name: d.workspace_name || "Unknown",
      value: d.total_count
    })) || simulationData;

    const populationSimulatedData = dashboardData?.quality_logs?.total_population_simulated?.map(d => ({
      name: d.workspace_name || "Unknown",
      value: d.total_count
    })) || simulationData.map(d => ({ ...d, value: Math.floor(d.value / 10) }));

    const personaConfidenceData = dashboardData?.quality_logs?.avg_persona_confidence?.map(d => ({
      name: d.workspace_name || "Unknown",
      value: d.avg_confidence
    })) || confidenceData;

    const populationConfidenceData = dashboardData?.quality_logs?.avg_population_confidence?.map(d => ({
      name: d.workspace_name || "Unknown",
      value: d.avg_confidence
    })) || confidenceData.map(d => ({ ...d, value: d.value - 5 }));

    return {
      personaConfidence: {
        ...qualityLogConfig.personaConfidence,
        data: personaConfidenceData
      },
      populationConfidence: {
        ...qualityLogConfig.populationConfidence,
        data: populationConfidenceData
      },
      personaSimulated: {
        ...qualityLogConfig.personaSimulated,
        data: personaSimulatedData
      },
      populationSimulated: {
        ...qualityLogConfig.populationSimulated,
        data: populationSimulatedData
      }
    };
  }, [dashboardData]);

  const chartBusinessImpactConfig = React.useMemo(() => ({
    modalityMix: {
      ...businessImpactConfig.modalityMix,
      data: [
        { name: 'Qual Only', value: dashboardData?.business_impact?.qualitative_count || 0 },
        { name: 'Quant Only', value: dashboardData?.business_impact?.quantitative_count || 0 },
        { name: 'Both', value: dashboardData?.business_impact?.both_count || 0 },
      ]
    },
    outcomesInfluenced: businessImpactConfig.outcomesInfluenced,
    topThemes: businessImpactConfig.topThemes
  }), [dashboardData]);

  // Mouse Follow Logic
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e) => {
    mouseX.set(e.clientX);
    mouseY.set(e.clientY);
  };

  useEffect(() => {
    if (orgId && !omi.isInitialized) {
      dispatch(initializeSessionStart({ orgId }));
    }
  }, [orgId, dispatch, omi.isInitialized]);

  return (
    <div
      onMouseMove={handleMouseMove}
      className="min-h-screen p-4 md:p-8 relative overflow-x-hidden"
    >
      {/* Fixed Background Layer */}
      <div className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen pointer-events-none overflow-hidden z-0">
        {/* Base Gradient matching WorkspaceList */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-blue-50/30 to-blue-100/20 dark:from-[#0a0e1a] dark:via-[#0f1419] dark:to-[#1a1f2e]" />

        {/* Background Gradient Orbs */}
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-gradient-to-br from-blue-400/30 to-blue-600/20 dark:from-blue-500/40 dark:to-blue-700/30 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-tl from-blue-300/25 to-cyan-500/15 dark:from-blue-400/35 dark:to-cyan-600/25 rounded-full blur-[100px]" />
        <div className="absolute top-[30%] right-[10%] w-[35%] h-[35%] bg-gradient-to-bl from-cyan-400/20 to-blue-500/15 dark:from-cyan-500/30 dark:to-blue-600/20 rounded-full blur-[80px]" />

        <MouseParticle
          mouseX={mouseX} mouseY={mouseY}
          stiffness={150} damping={15} offsetX={-50} offsetY={-50}
          className="w-[100px] h-[100px] bg-cyan-400/20 dark:bg-cyan-400/20 rounded-full blur-[30px]"
        />

        <MouseParticle
          mouseX={mouseX} mouseY={mouseY}
          stiffness={200} damping={10} offsetX={-10} offsetY={-10}
          className="w-[20px] h-[20px] bg-white/40 dark:bg-white/20 rounded-full blur-[15px]"
        />
      </div>

      <div className="max-w-7xl mx-auto relative z-10 flex flex-col gap-8">
        {/* Header Section - Exactly matching WorkspaceList header style */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-500/30 text-white">
              <TbBuildingSkyscraper className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
                  {organizationName} : Dashboard
                </h1>
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Enterprise Analytics Hub • Global Operations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setIsTimeDropdownOpen(!isTimeDropdownOpen)}
                className="flex items-center gap-3 bg-white dark:bg-white/5 pl-5 pr-4 py-3 rounded-2xl border-2 border-gray-300/60 dark:border-white/10 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-all font-black text-[10px] tracking-widest shadow-xl group/btn"
              >
                <TbCalendar size={18} className="text-blue-500" />
                {timeFilterOptions[timeFilter]}
                <TbChevronDown className={`transition-transform duration-300 text-blue-500 ${isTimeDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isTimeDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsTimeDropdownOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="absolute right-0 mt-3 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.5)] z-50 overflow-hidden p-3 backdrop-blur-3xl"
                  >
                    {Object.entries(timeFilterOptions).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => {
                          setTimeFilter(key);
                          setIsTimeDropdownOpen(false);
                        }}
                        className={`w-full text-left px-5 py-4 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-between rounded-2xl mb-1 last:mb-0
                          ${timeFilter === key
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:translate-x-1'}`}
                      >
                        {label}
                        {timeFilter === key && <div className="w-2 h-2 rounded-full bg-white shadow-glow" />}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </div>

            <QuickAction
              title="New Workspace" icon={TbPlus} primary delay={0.1}
              onClick={() => navigate("/main/organization/workspace/add")}
              className="!p-4 !rounded-2xl hover:scale-105 !shadow-blue-500/20"
            />
            <QuickAction
              title="Settings" icon={TbSettings} delay={0.2} onClick={() => navigate("/main/settings")}
              className="!p-4 !rounded-2xl hover:scale-105"
            />
          </div>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-6">
          {[
            { label: "Total Workflows", value: dashboardData?.kpi_cards?.total_workspaces?.toString() || "0", color: "text-blue-500" },
            { label: "Total Explorations", value: dashboardData?.kpi_cards?.total_explorations?.toString() || "0", color: "text-cyan-500" },
            { label: "Total Users", value: "81", color: "text-indigo-500" },
            { label: "Outcome Influenced", value: "68%", color: "text-rose-500" },
            { label: "Hours Saved", value: "487", color: "text-amber-500" },
            { label: "Reports Downloaded", value: (dashboardData?.active_chart?.report_downloads_monthly?.reduce((acc, curr) => acc + curr.count, 0) || 0).toString(), color: "text-emerald-500" },
            { label: "Human Studies Avoided", value: "18", color: "text-purple-500" },
          ].map((stat, i) => (
            <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 * i }}
              className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 p-6 rounded-2xl flex flex-col items-center justify-center text-center group hover:border-blue-500/50 hover:-translate-y-1 transition-all shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className={`text-4xl font-black ${stat.color} tracking-tighter mb-1 select-none`}>{stat.value}</span>
              <span className="text-[9px] font-black text-gray-400 dark:text-white uppercase tracking-[0.2em] select-none">{stat.label}</span>
            </motion.div>
          ))}
        </div>

        <div className="flex flex-col gap-8">
          {/* Top Row: 2 Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <DashboardCard
              title="Activity Log"
              config={chartMetricsConfig}
              selectedKey={selectedMetric}
              onSelect={setSelectedMetric}
              isDropdownOpen={isDropdownOpen}
              setIsDropdownOpen={setIsDropdownOpen}
              delay={0.4}
              theme={theme}
            />
            <DashboardCard
              title="User Intelligence"
              config={chartUserMetricsConfig}
              selectedKey={selectedUserMetric}
              onSelect={setSelectedUserMetric}
              isDropdownOpen={isUserDropdownOpen}
              setIsDropdownOpen={setIsUserDropdownOpen}
              delay={0.5}
              theme={theme}
            />
          </div>

          {/* Bottom Row: 3 Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <DashboardCard
              title="Quality Log"
              config={chartQualityLogConfig}
              selectedKey={qKey1}
              onSelect={setQKey1}
              isDropdownOpen={qOpen1}
              setIsDropdownOpen={setQOpen1}
              delay={0.6}
              theme={theme}
            />
            <DashboardCard
              title="Business Impact"
              config={chartBusinessImpactConfig}
              selectedKey={selectedStrategicMetric}
              onSelect={setSelectedStrategicMetric}
              isDropdownOpen={isStrategicDropdownOpen}
              setIsDropdownOpen={setIsStrategicDropdownOpen}
              delay={0.7}
              theme={theme}
            />
            <DashboardCard
              title="Value Delivered"
              config={Object.fromEntries(Object.entries(valueDeliveredConfig).map(([k, v]) => [k, { ...v, data: filterData(v.data) }]))}
              selectedKey={selectedOutputMetric}
              onSelect={setSelectedOutputMetric}
              isDropdownOpen={isOutputDropdownOpen}
              setIsDropdownOpen={setIsOutputDropdownOpen}
              delay={0.8}
              theme={theme}
            />
          </div>
        </div>
      </div >


    </div >
  );
};

export default MyOrganization;
