import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTraceability, useExploration } from '../../../hooks/useExplorations';
import TraceabilityScore from './components/TraceabilityScore';
import PersonaTraceability from './components/PersonaTraceability';
import QuantitativeTraceability from './components/QuantitativeTraceability';
import QualitativeTraceability from './components/QualitativeTraceability';
import {
  TbTargetArrow,
  TbUserPlus,
  TbChartBar,
  TbMessageDots,
  TbChevronDown,
  TbCalendar,
  TbUser,
  TbDatabase,
  TbFileText,
  TbTelescope,
  TbCheck,
  TbAlertTriangle,
  TbRefresh,
  TbX,
  TbCircleCheck,
  TbArrowLeft
} from 'react-icons/tb';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import AuditTable from './components/AuditTable';

const StatusIcon = ({ status }) => {
  switch (status?.toLowerCase()) {
    case 'clear':
      return (
        <div className="w-6 h-6 rounded bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500 shadow-[0_0_10px_rgba(34,197,94,0.2)]">
          <TbCircleCheck size={16} strokeWidth={2.5} />
        </div>
      );
    case 'partial':
      return (
        <div className="w-6 h-6 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
          <TbAlertTriangle size={14} strokeWidth={3} />
        </div>
      );
    case 'inferred':
      return (
        <div className="w-6 h-6 rounded bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.2)]">
          <TbRefresh size={14} strokeWidth={3} />
        </div>
      );
    case 'missing':
      return (
        <div className="w-6 h-6 rounded bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
          <TbX size={14} strokeWidth={3} />
        </div>
      );
    default:
      return null;
  }
};

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

const Traceability = () => {
  const { workspaceId, explorationId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('research');

  const { data: explorationData, isLoading: isExplorationLoading } = useExploration(explorationId);
  const { data: apiData, isLoading: isTraceabilityLoading, error } = useTraceability(
    workspaceId,
    explorationId,
    {
      is_quantitative: explorationData?.is_quantitative,
      is_qualitative: explorationData?.is_qualitative
    },
    { enabled: !!explorationData }
  );

  const isLoading = isExplorationLoading || isTraceabilityLoading;

  // Mouse Follow Logic
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e) => {
    mouseX.set(e.clientX);
    mouseY.set(e.clientY);
  };

  // Filter tabs based on exploration data flags
  const allTabs = [
    { id: 'research', label: 'Research Objective', icon: TbTargetArrow },
    { id: 'persona', label: 'Persona Builder', icon: TbUserPlus },
    { id: 'quantitative', label: 'Quantitative', icon: TbChartBar },
    { id: 'qualitative', label: 'Qualitative Questionnaire', icon: TbMessageDots },
  ];

  const tabs = allTabs.filter(tab => {
    // Always show research and persona tabs
    if (tab.id === 'research' || tab.id === 'persona') return true;

    // Show quantitative tab only if is_quantitative is true
    if (tab.id === 'quantitative') return explorationData?.is_quantitative === true;

    // Show qualitative tab only if is_qualitative is true
    if (tab.id === 'qualitative') return explorationData?.is_qualitative === true;

    return true;
  });

  // Map API data or fallback to detailed mock for research
  const auditData = {
    research: apiData?.data?.ro_traceability?.components || [],
    persona: apiData?.data?.persona_traceability?.data || {},
    quantitative: apiData?.data?.quant_traceability || {},
    qualitative: apiData?.data?.qual_traceability || {}
  };

  const calculateResearchSummary = (components) => {
    if (!components) return { completed: 0, total: 0, clear: 0, partial: 0, inferred: 0, missing: 0 };

    const summary = {
      completed: 0,
      total: components.length,
      clear: 0,
      partial: 0,
      inferred: 0,
      missing: 0
    };

    components.forEach(item => {
      const status = item.status?.toLowerCase();
      if (summary.hasOwnProperty(status)) {
        summary[status]++;
      }
      if (status !== 'missing') {
        summary.completed++;
      }
    });

    return summary;
  };

  const researchSummary = calculateResearchSummary(auditData.research);

  const getScoreLabel = (score) => {
    if (score >= 90) return 'EXCELLENT';
    if (score >= 70) return 'GOOD';
    if (score >= 50) return 'ACCEPTABLE';
    return 'POOR';
  };

  const roScore = apiData?.data?.ro_traceability?.ro_score || 0;

  const researchScore = {
    score: roScore / 100,
    label: getScoreLabel(roScore),
    percentage: roScore,
    breakdown: [
      { label: 'Completeness', value: Math.min(100, Math.round((researchSummary.completed / (researchSummary.total || 1)) * 100)), weight: 60 },
      { label: 'Specificity', value: 85, weight: 25 }, // Placeholder as API doesn't provide this yet
      { label: 'Evidence', value: 80, weight: 15 }     // Placeholder as API doesn't provide this yet
    ]
  };

  const columns = {
    research: [
      {
        header: 'Component', accessor: 'component', className: 'w-1/4', render: (row) => (
          <span className="font-bold text-gray-900 dark:text-white text-sm whitespace-normal">{row.component}</span>
        )
      },
      {
        header: 'Value', accessor: 'value', className: 'w-2/3', render: (row) => (
          <span className="text-gray-600 dark:text-gray-400 text-sm italic font-medium whitespace-normal leading-relaxed">
            {row.value || 'Not specified'}
          </span>
        )
      },
      {
        header: 'Status', accessor: 'status', className: 'w-16 text-center', render: (row) => (
          <div className="flex justify-center">
            <StatusIcon status={row.status} />
          </div>
        )
      },
    ],
    persona: [
      { header: 'Date & Time', accessor: 'date' },
      { header: 'Action', accessor: 'action' },
      { header: 'User', accessor: 'user' },
      {
        header: 'Persona Name', accessor: 'personaName', render: (row) => (
          <div className="flex items-center gap-2">
            <TbUser className="text-blue-500" />
            <span className="font-bold text-xs">{row.personaName}</span>
          </div>
        )
      },
      {
        header: 'Details', accessor: 'details', render: (row) => (
          <span className="text-xs text-gray-500 dark:text-gray-400 italic font-medium">// {row.details}</span>
        )
      },
    ],
    quantitative: [
      { header: 'Date & Time', accessor: 'date' },
      { header: 'Action', accessor: 'action' },
      { header: 'User', accessor: 'user' },
      {
        header: 'Survey ID', accessor: 'surveyId', render: (row) => (
          <span className="font-mono text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/5 px-2 py-1 rounded border border-purple-500/10">
            {row.surveyId}
          </span>
        )
      },
      {
        header: 'Data Source', accessor: 'dataSource', render: (row) => (
          <div className="flex items-center gap-2">
            <TbDatabase className="text-amber-500" />
            <span className="font-black text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-400">{row.dataSource}</span>
          </div>
        )
      },
    ],
    qualitative: [
      { header: 'Date & Time', accessor: 'date' },
      { header: 'Action', accessor: 'action' },
      { header: 'User', accessor: 'user' },
      {
        header: 'ID', accessor: 'questionnaireId', render: (row) => (
          <span className="font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400">{row.questionnaireId}</span>
        )
      },
      {
        header: 'Responses', accessor: 'responseCount', render: (row) => (
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 rounded-lg bg-blue-500/10 text-blue-600 font-black text-xs border border-blue-500/20 shadow-inner">
              {row.responseCount}
            </div>
            <span className="text-[9px] uppercase font-black tracking-tighter opacity-40 text-gray-400">Respondents</span>
          </div>
        )
      },
    ]
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      className="min-h-screen p-4 md:p-8 relative overflow-x-hidden"
    >
      {/* Fixed Background Layer */}
      <div className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen pointer-events-none overflow-hidden z-0">
        {/* Base Gradient */}
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
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-2"
        >
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => navigate(`/main/organization/workspace/explorations/${workspaceId}`)}
              className="p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-all hover:scale-105 active:scale-95"
              title="Go Back to Explorations"
            >
              <TbArrowLeft className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-3 text-gray-400 dark:text-white font-black text-[9px] uppercase tracking-[0.4em]">
              <div className="p-2 rounded-xl bg-gray-100 dark:bg-white/5 shadow-inner">
                <TbFileText size={14} className="text-blue-500" />
              </div>
              Audit Transcription
            </div>
          </div>
          <h1 className="text-4xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
            Traceability Logs

          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-3 font-medium text-sm max-w-2xl leading-relaxed">
            Comprehensive transparency for every synthetic generation step. Audit every parameter, model choice, and validation metric across the platform.
          </p>
        </motion.div>

        {/* Premium Tabs */}
        <div className="flex flex-wrap gap-2 mb-2 bg-gray-100/50 dark:bg-white/5 p-1.5 rounded-2xl border-2 border-gray-300/60 dark:border-white/10 w-fit backdrop-blur-xl">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all duration-500 relative overflow-hidden group
                  ${isActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                    : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-white dark:hover:bg-white/5"
                  }`}
              >
                <Icon size={18} className={`${isActive ? "text-white" : "text-gray-400 group-hover:text-blue-500 transition-colors"}`} />
                <span className={`text-[10px] uppercase tracking-widest font-black ${isActive ? "text-white" : ""}`}>{tab.label}</span>

                {isActive && (
                  <motion.div
                    layoutId="glow"
                    className="absolute inset-0 bg-white/10 pointer-events-none"
                  />
                )}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            {(!workspaceId || !explorationId) ? (
              <div className="text-center py-20 bg-white/50 dark:bg-white/5 rounded-2xl border-2 border-dashed border-blue-200/50 dark:border-white/10 backdrop-blur-xl">
                <TbTelescope className="w-12 h-12 text-blue-400 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 tracking-tight">
                  No Exploration Selected
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs mx-auto">
                  Please select a completed exploration from your workspace to view its traceability logs.
                </p>
              </div>
            ) : error ? (
              <div className="text-center py-20 bg-white/50 dark:bg-white/5 rounded-2xl border-2 border-dashed border-red-200 dark:border-red-500/20 backdrop-blur-xl">
                <TbTelescope className="w-12 h-12 text-red-400 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 tracking-tight">
                  Failed to load audit trails
                </h3>
                <p className="text-red-500/60 text-xs font-medium uppercase tracking-widest">
                  {error.message || 'Please try again later.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {activeTab === 'research' && (
                  <>
                    {/* User Input Summary Card */}
                    {apiData?.data?.ro_traceability?.summary && (
                      <div className="mb-6 bg-gradient-to-br from-blue-50/80 via-white to-blue-50/50 dark:from-blue-950/20 dark:via-gray-900/40 dark:to-blue-950/10 rounded-2xl border-2 border-blue-200/60 dark:border-blue-500/20 p-6 shadow-lg backdrop-blur-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 shadow-inner">
                            <TbFileText size={18} className="text-blue-500" />
                          </div>
                          <h3 className="text-sm font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                            User Input
                          </h3>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                          {apiData.data.ro_traceability.summary}
                        </p>
                      </div>
                    )}

                    {/* Status Summary */}
                    <div className="flex flex-wrap items-center gap-4 text-[10px] font-black uppercase tracking-widest pb-2">
                      <span className="text-gray-400 dark:text-gray-500">{researchSummary.completed}/{researchSummary.total} Completed</span>
                      <div className="flex items-center gap-4 border-l border-gray-300 dark:border-white/10 pl-4">
                        <div className="flex items-center gap-1.5 text-green-500">
                          <TbCircleCheck size={14} />
                          <span>{researchSummary.clear} Clear</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-amber-500">
                          <TbAlertTriangle size={14} />
                          <span>{researchSummary.partial} Partial</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-blue-500">
                          <TbRefresh size={14} />
                          <span>{researchSummary.inferred} Inferred</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-red-500">
                          <TbX size={14} />
                          <span>{researchSummary.missing} Missing</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {activeTab !== 'persona' && activeTab !== 'quantitative' && activeTab !== 'qualitative' && (
                  <AuditTable
                    columns={columns[activeTab]}
                    data={auditData[activeTab]}
                    loading={isLoading}
                    emptyMessage={`No ${tabs.find(t => t.id === activeTab).label} audit logs found`}
                  />
                )}

                {activeTab === 'persona' && (
                  <div className="mt-8">
                    <PersonaTraceability data={auditData.persona} />
                  </div>
                )}

                {activeTab === 'quantitative' && (
                  <div className="mt-8">
                    <QuantitativeTraceability data={auditData.quantitative} />
                  </div>
                )}

                {activeTab === 'qualitative' && (
                  <div className="mt-8">
                    <QualitativeTraceability data={auditData.qualitative} />
                  </div>
                )}

                {activeTab === 'research' && (
                  <TraceabilityScore {...researchScore} />
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Traceability;

