// ══════════════════════════════════════════════════════════════════════════════
// PersonaBuilderManual Component — Figma Accurate (no sidebar, parent handles it)
// ══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TbLoader,
} from 'react-icons/tb';
import SpIcon from '../../../../../../../SPIcon';
import { useTheme } from '../../../../../../../../context/ThemeContext';
import { useOmniWorkflow } from '../../../../../../../../hooks/useOmiWorkflow';
import { usePersonaBuilder } from '../../../../../../../../hooks/usePersonaBuilder';
import { useUpdateExplorationMethod, useExploration } from '../../../../../../../../hooks/useExplorations';

import type { PersonaFormData, MainCategory } from '../PersonaBuilderType';
import {
  mainCategories,
  contentData,
  getCategoryItems,
  isMultiSelectAttribute,
  traitNameMapping,
} from '../data';
import { transformFormDataToAPIPayload, validatePersonaData } from '../PersonaBuilderShared';

import SubTabNavigation from './SubTabNavigation';
import AttributeSelectionPanel from './AttributeSelectionPanel';
import PersonaSummaryView from './PersonaSummaryView';
import EditPersonaNameModal from './EditPersonaNameModal';

import './PersonaBuilderManual.css';

// ══════════════════════════════════════════════════════════════════════════════

const PersonaBuilderManual: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { trigger: rawTrigger } = useOmniWorkflow();
  const trigger = useCallback(rawTrigger, []);
  const { workspaceId, objectiveId } = useParams<{
    workspaceId: string;
    objectiveId: string;
  }>();

  // ── Hooks ──────────────────────────────────────────────────────────────────

  const { submitCompletePersona, isSubmitting } = usePersonaBuilder(workspaceId, objectiveId);
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

  // ── State ──────────────────────────────────────────────────────────────────

  const [activeCategory, setActiveCategory] = useState<MainCategory>('Demographics');
  const [activeSubTab, setActiveSubTab] = useState<string>('Age');

  const [personaName, setPersonaName] = useState<string>('Persona 1');
  const [showEditNameModal, setShowEditNameModal] = useState<boolean>(false);

  const [formData, setFormData] = useState<PersonaFormData>({});
  const [formativeExperience, setFormativeExperience] = useState<string>('');

  const [showBackstoryModal, setShowBackstoryModal] = useState<boolean>(false);
  const [showApproachModal, setShowApproachModal] = useState<boolean>(false);

  const [completedSubTabs, setCompletedSubTabs] = useState<Set<string>>(new Set());

  // ── Init ───────────────────────────────────────────────────────────────────

useEffect(() => {
  if (!objectiveId) return;

  trigger({
    stage: 'persona_builder',
    event: 'PERSONA_WORKFLOW_LOADED',
    payload: {},
  });
}, [objectiveId]);

  // ── Category & Sub-Tab ────────────────────────────────────────────────────

  const getCurrentCategoryItems = useCallback((): string[] => {
    return getCategoryItems(activeCategory);
  }, [activeCategory]);

  useEffect(() => {
    const items = getCurrentCategoryItems();
    if (items.length > 0 && activeCategory !== 'Formative Experience') {
      setActiveSubTab(items[0] ?? 'Age');
    }
  }, [activeCategory, getCurrentCategoryItems]);

  const handleCategoryChange = (category: MainCategory) => {
    setActiveCategory(category);
    trigger({ stage: 'persona_builder', event: 'TRAIT_SELECTION_STARTED', payload: { category } });
  };

  const handleSubTabChange = (subTabId: string) => {
    setActiveSubTab(subTabId);
  };

  // ── Attribute Selection ────────────────────────────────────────────────────

  const getFormDataKey = (attributeName: string): keyof PersonaFormData => {
    const mapping: Record<string, keyof PersonaFormData> = {
      'Age': 'age',
      'Gender': 'gender',
      'Income': 'income',
      'Education Level': 'educationLevel',
      'Occupation Level': 'occupationLevel',
      'Marital Status': 'maritalStatus',
      'Family Structure': 'familyStructure',
      'Geography': 'geography',
      'Occupation': 'occupation',
      'Industry': 'industry',
      'Category Awareness': 'categoryAwareness',
      'Lifestyle': 'lifestyle',
      'Values': 'values',
      'Personality': 'personality',
      'Interest': 'interests',
      'Motivation': 'motivations',
      'Decision Making Style': 'decisionMakingStyle',
      'Consumption Frequency': 'consumptionFrequency',
      'Purchase Channel': 'purchaseChannel',
      'Price Sensitivity': 'priceSensitivity',
      'Brand Sensitivity': 'brandSensitivity',
      'Switching Behaviour': 'switchingBehaviour',
      'Purchase Triggers': 'purchaseTriggers',
      'Purchase Barriers': 'purchaseBarriers',
      'Media Consumption Patterns': 'mediaConsumption',
      'Digital Behaviour': 'digitalBehaviour',
    };
    return mapping[attributeName] ?? (attributeName as keyof PersonaFormData);
  };

  const handleAttributeSelect = (attributeName: string, value: string | string[]) => {
    const formKey = getFormDataKey(attributeName);
    setFormData((prev) => ({ ...prev, [formKey]: value }));

    if (value && (Array.isArray(value) ? value.length > 0 : value.trim() !== '')) {
      setCompletedSubTabs((prev) => new Set([...prev, attributeName]));
    } else {
      setCompletedSubTabs((prev) => {
        const newSet = new Set(prev);
        newSet.delete(attributeName);
        return newSet;
      });
    }
  };

  const getCurrentAttributeValue = (): string | string[] | undefined => {
    const formKey = getFormDataKey(activeSubTab);
    return formData[formKey];
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

// AFTER
const handleCalibratePersona = () => {
  const validation = validatePersonaData(formData);
  if (!validation.isValid) {
    alert(`Please fill in the following required fields: ${validation.missingFields.join(', ')}`);
    return;
  }

  trigger({ stage: 'persona_builder', event: 'PERSONA_CREATION_STARTED', payload: {} });

  const payload = transformFormDataToAPIPayload(
    { ...formData, formativeExperience },
    personaName,
    objectiveId
  );

  // Fire-and-forget — submit in background while user watches the loader.
  // PersonaBuilder grid view will fetch the completed persona when the loader finishes.
  try {
    (submitCompletePersona as unknown as (p: Record<string, unknown>) => Promise<unknown>)(payload);
  } catch (error) {
    console.error('Failed to kick off persona creation:', error);
  }

  navigate(
    `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-generating`,
    { state: { flow: 'manual' } }
  );
};

  // ── Navigation ────────────────────────────────────────────────────────────

  const handleExplorationMethod = () => {
    if (isApproachLocked) {
      if (
        (exploration as Record<string, unknown> | undefined)?.is_quantitative &&
        !(exploration as Record<string, unknown> | undefined)?.is_qualitative
      ) {
        navigate(
          `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/population-builder`,
          { state: { researchApproach: 'quantitative' } }
        );
      } else {
        navigate(
          `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/depth-interview`,
          {
            state: {
              researchApproach:
                (exploration as Record<string, unknown> | undefined)?.is_qualitative &&
                (exploration as Record<string, unknown> | undefined)?.is_quantitative
                  ? 'both'
                  : 'qualitative',
            },
          }
        );
      }
      return;
    }
    setShowApproachModal(true);
  };

  const handleApproachSelect = async (approach: string) => {
    try {
      const methodData = {
        is_qualitative: approach === 'qualitative' || approach === 'both',
        is_quantitative: approach === 'quantitative' || approach === 'both',
      };
      type UpdateFn = (args: { id: string | undefined; data: typeof methodData }) => Promise<unknown>;
      await (updateExplorationMethodMutation.mutateAsync as unknown as UpdateFn)({
        id: objectiveId,
        data: methodData,
      });
      if (objectiveId) {
        localStorage.setItem(`approach_${objectiveId}`, approach.toLowerCase().trim());
      }
      if (approach === 'quantitative') {
        navigate(
          `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/population-builder`,
          { state: { researchApproach: approach } }
        );
      } else {
        navigate(
          `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/depth-interview`,
          { state: { researchApproach: approach } }
        );
      }
      trigger({ stage: 'persona_builder', event: 'RESEARCH_APPROACH_SELECTED', payload: { approach } });
    } catch (error) {
      console.error('Failed to update research approach:', error);
    }
  };

  const handleBack = () => {
    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/research-mode`
    );
  };

  // ── Progress ──────────────────────────────────────────────────────────────

  const calculateProgress = (): number => {
    const allSubTabs = Object.keys(contentData).reduce<string[]>((acc, category) => {
      if (category === 'Formative Experience') return acc;
      const categoryData = contentData[category];
      if (!categoryData) return acc;
      return [...acc, ...categoryData.items];
    }, []);

    if (allSubTabs.length === 0) return 0;
    const completed = allSubTabs.filter((tab) => completedSubTabs.has(tab)).length;
    return Math.round((completed / allSubTabs.length) * 100);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderCategoryTabs = () => (
    <div className="pbm-category-tabs">
      {mainCategories.map((category) => {
        const isActive = activeCategory === category;
        return (
          <button
            key={category}
            onClick={() => handleCategoryChange(category)}
            className={`pbm-category-tab ${isActive ? 'pbm-category-tab--active' : ''}`}
          >
            <span className="pbm-category-tab__label">{category}</span>
          </button>
        );
      })}
    </div>
  );

  const renderContent = () => {
    if (activeCategory === 'Formative Experience') {
      return (
        <FormativeExperienceTabContent
          formativeExperience={formativeExperience}
          onFormativeExperienceChange={setFormativeExperience}
        />
      );
    }

    const categoryItems = getCurrentCategoryItems();

    return (
      <div className="pbm-content-area">
        <SubTabNavigation
          subTabs={categoryItems.map((item) => ({ id: item, label: item, attributeName: item }))}
          activeSubTab={activeSubTab}
          onSubTabChange={handleSubTabChange}
          completedSubTabs={Array.from(completedSubTabs)}
        />
        <AttributeSelectionPanel
          attributeName={activeSubTab}
          currentValue={getCurrentAttributeValue()}
          onSelect={(value) => handleAttributeSelect(activeSubTab, value)}
          disabled={isSubmitting}
        />
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="pbm-container">
      <div className="pbm-wrapper">

        {/* ── Section Title ── */}
        <h2 className="pbm-section-title">Key Attributes</h2>

        {/* ── Main Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="pbm-main-card"
        >
          {/* Category Tabs */}
          {renderCategoryTabs()}

          {/* Content */}
          <div className="pbm-content">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeCategory}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>
          {/* ← No footer inside the card anymore */}
        </motion.div>

        {/* ── Persona Summary — always visible below the main card ── */}
        <PersonaSummaryView
          personaName={personaName}
          formData={formData}
          formativeExperience={formativeExperience}
          onFormativeExperienceChange={setFormativeExperience}
          onEditName={() => setShowEditNameModal(true)}
        />

        {/* ── Footer — lives below summary, sticky to bottom ── */}
        <div className="pbm-footer">
          <div className="pbm-footer-left">
            <button className="pbm-back-link" onClick={handleBack}>
              <SpIcon name="sp-Arrow-Arrow_Left_SM" />
              Back to List of the personas
            </button>
          </div>

          {activeCategory === 'Formative Experience' ? (
            <button
              onClick={handleCalibratePersona}
              disabled={isSubmitting}
              className="pbm-btn-calibrate pbm-btn-calibrate--active"
            >
              {isSubmitting ? (
                <>
                  <TbLoader size={16} className="pbm-spinner" />
                  Creating Persona...
                </>
              ) : (
                <>
                  Calibrate Persona
                  <SpIcon name="sp-Arrow-Arrow_Right_SM" />
                </>
              )}
            </button>
          ) : (
            <button className="pbm-btn-calibrate" disabled>
              Calibrate Persona
              <SpIcon name="sp-Arrow-Arrow_Right_SM" />
            </button>
          )}
        </div>

      </div>

      {/* ── Edit Persona Name Modal ── */}
      <EditPersonaNameModal
        isOpen={showEditNameModal}
        currentName={personaName}
        onSave={(name) => {
          setPersonaName(name);
          setShowEditNameModal(false);
        }}
        onClose={() => setShowEditNameModal(false)}
      />
    </div>
  );
};

// ── Formative Experience tab inner content ─────────────────────────────────

import FormativeExperienceInput from './FormativeExpInput';

interface FormativeExpTabProps {
  formativeExperience: string;
  onFormativeExperienceChange: (v: string) => void;
}

const FormativeExperienceTabContent: React.FC<FormativeExpTabProps> = ({
  formativeExperience,
  onFormativeExperienceChange,
}) => (
  <div className="pbm-formative-tab">
    <FormativeExperienceInput
      value={formativeExperience}
      onChange={onFormativeExperienceChange}
    />
  </div>
);

export default PersonaBuilderManual;