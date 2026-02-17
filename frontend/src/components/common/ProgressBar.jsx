import React, { useMemo } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { useExploration } from '../../hooks/useExplorations';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TbTarget,
  TbUser,
  TbMicrophone,
  TbChartBar,
  TbCheck
} from 'react-icons/tb';

const ProgressBar = () => {
  const { workspaceId: paramWorkspaceId, objectiveId: paramObjectiveId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  // Extract IDs from URL if params are missing
  const objectiveMatch = path.match(/\/research-objectives\/([^\/]+)\/([^\/]+)/);
  const workspaceId = paramWorkspaceId || (objectiveMatch ? objectiveMatch[1] : null);
  const rawId = paramObjectiveId || (objectiveMatch ? objectiveMatch[2] : null);
  const objectiveId = (rawId && rawId !== 'add') ? rawId : null;

  const { data: explorationData } = useExploration(objectiveId);

  // 1. Determine Research Approach
  const researchApproach = useMemo(() => {
    // 0. Check navigation state (transition state)
    if (location.state?.researchApproach) {
      return location.state.researchApproach.toLowerCase().trim();
    }

    // 1. Check API data first
    const fromData = explorationData?.data?.research_approach || explorationData?.research_approach;
    if (fromData) {
      const approach = fromData.toLowerCase().trim();
      if (objectiveId) localStorage.setItem(`approach_${objectiveId}`, approach);
      return approach;
    }

    // 2. Check localStorage (persistence across refreshes)
    if (objectiveId) {
      const cached = localStorage.getItem(`approach_${objectiveId}`);
      if (cached) return cached;
    }

    // 3. Fallback to URL path logic while loading or if data missing
    if (path.includes('depth-interview') || path.includes('chatview')) return 'qualitative';
    if (path.includes('population-builder') || path.includes('survey-results') || path.includes('rebuttal-mode')) return 'quantitative';

    return null;
  }, [explorationData, path, location.state, objectiveId]);

  // 2. Full Steps Definition
  const allPossibleSteps = [
    {
      id: 'objective',
      label: 'Objective',
      icon: TbTarget,
      path: (workspaceId && objectiveId)
        ? `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/research-mode`
        : workspaceId ? `/main/organization/workspace/research-objectives/${workspaceId}` : null
    },
    {
      id: 'persona',
      label: 'Persona',
      icon: TbUser,
      path: (workspaceId && objectiveId)
        ? `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`
        : null
    },
    {
      id: 'qualitative',
      label: 'Qualitative',
      icon: TbMicrophone,
      path: (workspaceId && objectiveId)
        ? `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/depth-interview`
        : null,
      subSteps: [
        { label: 'Discussion Guide Builder', suffix: 'depth-interview' },
        { label: 'Start In-Depth Interview', suffix: 'chatview' }
      ]
    },
    {
      id: 'quantitative',
      label: 'Quantitative',
      icon: TbChartBar,
      path: (workspaceId && objectiveId)
        ? `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/population-builder`
        : null,
      subSteps: [
        { label: 'Population & Questionnaire', suffix: 'population-builder' },
        { label: 'Survey Results', suffix: 'survey-results' },
        { label: 'Rebuttal Analysis', suffix: 'rebuttal-mode' }
      ]
    },
  ];

  // 3. Dynamic Filter Logic
  const steps = useMemo(() => {
    return allPossibleSteps.filter(step => {
      // Basic steps always visible
      if (['objective', 'persona'].includes(step.id)) return true;

      // Methodology visibility - ONLY show if an approach has been selected
      if (!researchApproach) return false;

      if (researchApproach === 'both') return true;
      if (step.id === 'qualitative') return researchApproach === 'qualitative';
      if (step.id === 'quantitative') return researchApproach === 'quantitative';

      return false;
    });
  }, [researchApproach, workspaceId, objectiveId]);

  // 4. Calculate Active Info
  const activeInfo = useMemo(() => {
    const sIdx = (id) => steps.findIndex(s => s.id === id);

    if (path.includes('research-mode') || path.includes('/add')) return { main: 0, sub: 0 };
    if (path.includes('persona-builder')) return { main: sIdx('persona'), sub: 0 };
    if (path.includes('persona-preview')) return { main: sIdx('persona'), sub: 1 };

    if (path.includes('depth-interview') || path.includes('chatview')) {
      return { main: sIdx('qualitative'), sub: path.includes('chatview') ? 1 : 0 };
    }

    if (path.includes('population-builder') || path.includes('survey-results') || path.includes('rebuttal-mode')) {
      let sub = 0;
      if (path.includes('survey-results')) sub = 1;
      if (path.includes('rebuttal-mode')) sub = 2;
      return { main: sIdx('quantitative'), sub };
    }

    return { main: -1, sub: -1 };
  }, [path, steps]);

  const { main: currentIndex, sub: subIndex } = activeInfo;

  const handleSubStepClick = (suffix) => {
    if (workspaceId && objectiveId) {
      navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/${suffix}`);
    }
  };

  return (
    <div className="absolute top-6 left-0 right-0 z-50 pointer-events-none flex flex-col items-center gap-4 px-4 sm:px-8">
      {/* Main Bar */}
      <motion.div
        layout
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        className="grid gap-1 sm:gap-2 p-1.5 sm:p-2 bg-white/90 dark:bg-black/60 backdrop-blur-2xl border border-gray-200/50 dark:border-white/10 rounded-full shadow-2xl pointer-events-auto w-full max-w-[580px]"
      >
        {steps.map((step, index) => {
          const isActive = index === currentIndex;
          const isCompleted = index < currentIndex;
          const isNavigable = !!step.path;
          return (
            <div key={step.id} className="relative w-full">
              <motion.div
                layout
                onClick={() => isNavigable && navigate(step.path)}
                className={`
                  relative h-9 sm:h-11 rounded-full flex items-center justify-center px-2 sm:px-3 gap-1.5 w-full transition-all duration-300
                  ${isActive ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500'}
                  ${isCompleted && !isActive ? 'text-blue-600 bg-blue-500/10' : ''}
                  ${isNavigable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-white/5' : 'cursor-not-allowed opacity-50'}
                  ${isActive ? 'hover:bg-blue-700' : ''}
                `}
              >
                <div className="flex items-center justify-center flex-shrink-0">
                  {isCompleted && !isActive ? <TbCheck size={20} strokeWidth={3} /> : <step.icon size={22} />}
                </div>
                <span className="hidden md:block font-bold text-xs xl:text-sm whitespace-nowrap">{step.label}</span>
                {isActive && (
                  <motion.div layoutId="activeStepGlow" className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full -z-10" />
                )}
              </motion.div>
            </div>
          );
        })}
      </motion.div>

      {/* Sub Steps */}
      <AnimatePresence mode="wait">
        {currentIndex !== -1 && steps[currentIndex]?.subSteps && (
          <motion.div
            key={`sub-${currentIndex}`}
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-center gap-8 sm:gap-12 px-6 py-2 bg-transparent pointer-events-auto relative mt-[-10px]"
          >
            <div className="absolute left-[15%] right-[15%] top-[14px] h-[1px] bg-gray-200 dark:bg-white/10 -z-0" />
            {steps[currentIndex].subSteps.map((sub, idx) => {
              const active = idx === subIndex;
              const done = idx < subIndex;
              return (
                <button
                  key={sub.label}
                  onClick={() => handleSubStepClick(sub.suffix)}
                  className="group relative flex flex-col items-center gap-3 z-10"
                >
                  <motion.div
                    animate={{ scale: active ? 1.2 : 1, backgroundColor: active || done ? '#2563EB' : 'transparent', borderColor: active || done ? '#2563EB' : 'currentColor' }}
                    className={`w-3 h-3 rounded-full border-2 bg-white dark:bg-[#0A0E1A] transition-colors duration-300 ${active ? 'shadow-[0_0_15px_rgba(37,99,235,0.6)]' : ''} ${!active && !done ? 'text-gray-300' : 'text-blue-600'}`}
                  />
                  <span className={`text-[10px] sm:text-xs font-bold uppercase transition-all duration-300 ${active ? 'text-blue-600 transform scale-105' : 'text-gray-400'}`}>
                    {sub.label}
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProgressBar;