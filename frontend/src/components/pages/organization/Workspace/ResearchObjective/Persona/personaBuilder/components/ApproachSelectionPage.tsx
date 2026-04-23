// ══════════════════════════════════════════════════════════════════════════════
// ApproachSelectionPage — full page, not a modal overlay
// Navigated to when user clicks "Exploration Method"
// ══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TbMicrophone, TbChartBar, TbRotate, TbChevronRight, TbArrowLeft } from 'react-icons/tb';
import SpIcon from '../../../../../../../SPIcon';
import { useUpdateExplorationMethod, useExploration } from '../../../../../../../../hooks/useExplorations';
import { useOmniWorkflow } from '../../../../../../../../hooks/useOmiWorkflow';
import omiDarkImg from '../../../../../../../../assets/OMI_Dark.png';
import './ApproachSelectionPage.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type ApproachId = 'qualitative' | 'quantitative' | 'both';

interface ApproachOption {
  id: ApproachId;
  title: string;
  description: string;
  icon: React.ReactNode;
}

// ── Options ───────────────────────────────────────────────────────────────────

const OPTIONS: ApproachOption[] = [
  {
    id: 'qualitative',
    title: 'Qualitative',
    description: 'Uncover the why',
    icon: <SpIcon name="sp-Other-Mic" size={48}  />,
  },
  {
    id: 'quantitative',
    title: 'Quantitative',
    description: 'Measure the many',
    icon: <SpIcon name="sp-Interface-Chart_Bar_Vertical_01" size={48} />,
  },
  {
    id: 'both',
    title: 'Both',
    description: 'Ultimate combo',
    icon: <SpIcon name="sp-Edit-Undo" size={48} />,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

const ApproachSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaceId, objectiveId } = useParams<{
    workspaceId: string;
    objectiveId: string;
  }>();
  const { trigger } = useOmniWorkflow();

  const updateExplorationMethodMutation = useUpdateExplorationMethod();
  const { data: explorationData } = useExploration(objectiveId);

  const exploration =
    (explorationData as Record<string, unknown>)?.data ??
    (explorationData as Record<string, unknown> | undefined);

  const currentApproach = (exploration as Record<string, unknown> | undefined)
    ?.research_approach as string | undefined;

  const isApproachLocked = !!(
    (exploration as Record<string, unknown> | undefined)?.is_qualitative ||
    (exploration as Record<string, unknown> | undefined)?.is_quantitative
  );


  const [selected, setSelected] = useState<ApproachId | undefined>(
    currentApproach as ApproachId | undefined
  );

  useEffect(() => {
    setSelected(currentApproach as ApproachId | undefined);
  }, [currentApproach]);

  // If approach is already locked, navigate immediately to the right destination
  useEffect(() => {
    if (!isApproachLocked) return;

    const isQuant =
      (exploration as Record<string, unknown> | undefined)?.is_quantitative &&
      !(exploration as Record<string, unknown> | undefined)?.is_qualitative;

    if (isQuant) {
      navigate(
        `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/population-builder`,
        { state: { researchApproach: 'quantitative' } }
      );
    } else {
      const approach =
        (exploration as Record<string, unknown> | undefined)?.is_qualitative &&
          (exploration as Record<string, unknown> | undefined)?.is_quantitative
          ? 'both'
          : 'qualitative';
      navigate(
        `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/depth-interview`,
        { state: { researchApproach: approach } }
      );
    }
  }, [isApproachLocked, exploration, navigate, workspaceId, objectiveId]);

  const handleProceed = async () => {
    if (!selected || isApproachLocked || updateExplorationMethodMutation.isPending) return;

    try {
      const methodData = {
        is_qualitative: selected === 'qualitative' || selected === 'both',
        is_quantitative: selected === 'quantitative' || selected === 'both',
      };

      type UpdateFn = (args: { id: string | undefined; data: typeof methodData }) => Promise<unknown>;
      await (updateExplorationMethodMutation.mutateAsync as unknown as UpdateFn)({
        id: objectiveId,
        data: methodData,
      });

      if (objectiveId) {
        localStorage.setItem(`approach_${objectiveId}`, selected.toLowerCase().trim());
      }

      trigger({
        stage: 'persona_builder',
        event: 'RESEARCH_APPROACH_SELECTED',
        payload: { approach: selected },
      });

      if (selected === 'quantitative') {
        navigate(
          `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/population-builder`,
          { state: { researchApproach: selected } }
        );
      } else {
        navigate(
          `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/depth-interview`,
          { state: { researchApproach: selected } }
        );
      }
    } catch (error) {
      console.error('Failed to update research approach:', error);
    }
  };


  const isLoading = updateExplorationMethodMutation.isPending;

  // Filter options if approach is partially locked
  const visibleOptions = OPTIONS.filter((opt) => {
    if (currentApproach === 'quantitative' && opt.id === 'qualitative') return false;
    if (currentApproach === 'qualitative' && opt.id === 'quantitative') return false;
    return true;
  });

  return (
    <div className="asp-page">

      {/* ── Omi Avatar ── */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.35, type: 'spring', stiffness: 220 }}
        className="asp-avatar"
      >
        <img src={omiDarkImg} alt="Omi" className="asp-avatar-img" />
      </motion.div>

      {/* ── Heading ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="asp-header"
      >
        <h1 className="asp-title">Choose your research method</h1>
        <p className="asp-subtitle">Deep dive or Big Numbers?</p>
      </motion.div>

      {/* ── Cards ── */}
      <div className="asp-cards">
        {visibleOptions.map((opt, i) => {
          const Icon = opt.icon;
          const isSelected = selected === opt.id;
          const isDisabled =
            isLoading ||
            !!(
              currentApproach &&
              currentApproach !== 'both' &&
              opt.id !== 'both' &&
              currentApproach !== opt.id
            );

          return (
            <motion.button
              key={opt.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.07, duration: 0.3 }}
              onClick={() => !isDisabled && setSelected(opt.id)}
              disabled={isDisabled}
              className={`asp-card ${isSelected ? 'asp-card--selected' : ''} ${isDisabled ? 'asp-card--disabled' : ''}`}
            >
              <div className="asp-card-icon">
                {opt.icon}
              </div>

              <div className="asp-card-title">{opt.title}</div>
              <div className="asp-card-description">{opt.description}</div>
            </motion.button>
          );
        })}
      </div>

      {/* ── Footer — Next button bottom-right ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="asp-footer"
      >
        <button
          onClick={handleProceed}
          disabled={!selected || isLoading}
          className="asp-next-btn"
        >
          {isLoading ? (
            <>
              <span className="asp-spinner" />
              Setting up…
            </>
          ) : (
            <>
              Next
              <TbChevronRight size={16} />
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
};

export default ApproachSelectionPage;