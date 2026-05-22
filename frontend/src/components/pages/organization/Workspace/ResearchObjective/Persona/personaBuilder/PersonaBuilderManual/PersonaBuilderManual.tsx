// ══════════════════════════════════════════════════════════════════════════════
// PersonaBuilderManual Component — with PersonaSearch integrated
// ══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { TbLoader } from 'react-icons/tb';
import SpIcon from '../../../../../../../SPIcon';
import { useTheme } from '../../../../../../../../context/ThemeContext';
import { useOmniWorkflow } from '../../../../../../../../hooks/useOmiWorkflow';
import { usePersonaBuilder, useRealtimePlausibility } from '../../../../../../../../hooks/usePersonaBuilder';
import { useUpdateExplorationMethod, useExploration } from '../../../../../../../../hooks/useExplorations';

import type { PersonaFormData, MainCategory } from '../PersonaBuilderType';
import {
    mainCategories,
    contentData,
    getCategoryItems,
    isMultiSelectAttribute,
    traitNameMapping,
} from '../data';
import { buildManualPersonaPayload, validatePersonaData } from '../PersonaBuilderShared';

import SubTabNavigation from './SubTabNavigation';
import AttributeSelectionPanel from './AttributeSelectionPanel';
import PersonaSummaryView from './PersonaSummaryView';
import EditPersonaNameModal from './EditPersonaNameModal';
import PersonaSearch from '../PersonaSearch';
import PlausibilityCheckModal from '../components/PlausibilityCheckModal';
import type { PlausibilityWarning } from '../components/PlausibilityWarningStrip';

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

    const [completedSubTabs, setCompletedSubTabs] = useState<Set<string>>(new Set());

    // Submit-time modal warnings
    const [plausibilityWarnings, setPlausibilityWarnings] = useState<PlausibilityWarning[]>([]);
    const [showPlausibilityModal, setShowPlausibilityModal] = useState(false);

    // Real-time inline strip
    const [realtimeWarnings, setRealtimeWarnings] = useState<PlausibilityWarning[]>([]);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { mutateAsync: runPlausibilityCheck } = useRealtimePlausibility(workspaceId, objectiveId);

    // Flash-highlight state: briefly rings the sub-tab the search jumped to
    const [highlightedSubTab, setHighlightedSubTab] = useState<string | null>(null);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Init ───────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!objectiveId) return;
        trigger({ stage: 'persona_builder', event: 'PERSONA_WORKFLOW_LOADED', payload: {} });
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

    // ── Real-time plausibility (debounced) ────────────────────────────────────
    // Fire POST /validate 500ms after the last field change, but only once
    // age + gender are filled (the two required fields for the backend schema).

    useEffect(() => {
        if (!formData.age || !formData.gender) return;

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            try {
                const payload = buildManualPersonaPayload(formData);
                type CheckFn = (p: Record<string, unknown>) => Promise<{ data?: { warnings?: PlausibilityWarning[] } }>;
                const result = await (runPlausibilityCheck as unknown as CheckFn)(payload as Record<string, unknown>);
                const warnings: PlausibilityWarning[] = result?.data?.warnings ?? [];
                setRealtimeWarnings(warnings);
            } catch {
                // silently ignore network errors for real-time checks
            }
        }, 500);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [formData]);

    const handleCategoryChange = (category: MainCategory) => {
        setActiveCategory(category);
        trigger({ stage: 'persona_builder', event: 'TRAIT_SELECTION_STARTED', payload: { category } });
    };

    const handleSubTabChange = (subTabId: string) => {
        setActiveSubTab(subTabId);
    };

    // ── Attribute key mapping ─────────────────────────────────────────────────

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

    // ── Search navigation ─────────────────────────────────────────────────────
    //
    // Three result types, three behaviours:
    //  • category  → switch tab only
    //  • attribute → switch tab + jump to sub-tab + flash highlight
    //  • option    → all of the above + auto-select the option chip

    const handleSearchNavigate = useCallback(
        (category: MainCategory, subTab?: string, optionValue?: string) => {
            setActiveCategory(category);

            if (subTab) {
                setActiveSubTab(subTab);

                if (optionValue) {
                    const formKey = getFormDataKey(subTab);
                    const isMulti = isMultiSelectAttribute(subTab);

                    setFormData((prev) => {
                        const current = prev[formKey];
                        if (isMulti) {
                            const existing = Array.isArray(current) ? current : [];
                            const next = existing.includes(optionValue)
                                ? existing
                                : [...existing, optionValue];
                            return { ...prev, [formKey]: next };
                        }
                        return { ...prev, [formKey]: optionValue };
                    });

                    setCompletedSubTabs((prev) => new Set([...prev, subTab]));
                }

                // Flash the sub-tab so the user sees exactly where they landed
                if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
                setHighlightedSubTab(subTab);
                highlightTimerRef.current = setTimeout(() => setHighlightedSubTab(null), 1400);
            }
        },
        []
    );

    // ── Attribute selection ────────────────────────────────────────────────────

    const handleAttributeSelect = (attributeName: string, value: string | string[]) => {
        const formKey = getFormDataKey(attributeName);
        setFormData((prev) => ({ ...prev, [formKey]: value }));

        if (value && (Array.isArray(value) ? value.length > 0 : value.trim() !== '')) {
            setCompletedSubTabs((prev) => new Set([...prev, attributeName]));
        } else {
            setCompletedSubTabs((prev) => {
                const s = new Set(prev);
                s.delete(attributeName);
                return s;
            });
        }
    };

    const getCurrentAttributeValue = (): string | string[] | undefined => {
        const formKey = getFormDataKey(activeSubTab);
        return formData[formKey];
    };

    // ── Submit ─────────────────────────────────────────────────────────────────

    const navigateAfterSubmit = () => {
        navigate(
            `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-generating`,
            { state: { flow: 'manual' } }
        );
    };

    const handleCalibratePersona = async () => {
        const validation = validatePersonaData(formData);
        if (!validation.isValid) {
            alert(`Please fill in the following required fields: ${validation.missingFields.join(', ')}`);
            return;
        }

        trigger({ stage: 'persona_builder', event: 'PERSONA_CREATION_STARTED', payload: {} });

        const payload = buildManualPersonaPayload(formData, personaName, formativeExperience);

        try {
            type SubmitFn = (p: Record<string, unknown>) => Promise<{
                data?: { has_plausibility_warnings?: boolean; validation_warnings?: PlausibilityWarning[] };
            }>;
            const result = await (submitCompletePersona as unknown as SubmitFn)(payload);
            const warnings = result?.data?.validation_warnings ?? [];
            if (result?.data?.has_plausibility_warnings && warnings.length > 0) {
                setPlausibilityWarnings(warnings);
                setShowPlausibilityModal(true);
                return;
            }
        } catch (error) {
            console.error('Failed to create persona draft:', error);
        }

        navigateAfterSubmit();
    };

    // ── Navigation ────────────────────────────────────────────────────────────

    const handleApproachSelect = async (approach: string) => {
        if (objectiveId) localStorage.setItem(`step2_done_${objectiveId}`, '1');
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

    const handleRemoveAttribute = (key: keyof PersonaFormData, valueToRemove: string) => {
        setFormData((prev) => {
            const current = prev[key];
            if (Array.isArray(current)) {
                const updated = current.filter((v) => v !== valueToRemove);
                const newData = { ...prev, [key]: updated };
                if (updated.length === 0) delete newData[key];
                return newData;
            }
            const newData = { ...prev };
            delete newData[key];
            return newData;
        });

        setCompletedSubTabs((prev) => {
            const s = new Set(prev);
            const subtabName = Object.entries({
                'Age': 'age', 'Gender': 'gender', 'Income': 'income',
                'Education Level': 'educationLevel', 'Occupation Level': 'occupationLevel',
                'Marital Status': 'maritalStatus', 'Family Structure': 'familyStructure',
                'Geography': 'geography', 'Occupation': 'occupation', 'Industry': 'industry',
                'Category Awareness': 'categoryAwareness', 'Lifestyle': 'lifestyle',
                'Values': 'values', 'Personality': 'personality', 'Interest': 'interests',
                'Motivation': 'motivations', 'Decision Making Style': 'decisionMakingStyle',
                'Consumption Frequency': 'consumptionFrequency', 'Purchase Channel': 'purchaseChannel',
                'Price Sensitivity': 'priceSensitivity', 'Brand Sensitivity': 'brandSensitivity',
                'Switching Behaviour': 'switchingBehaviour', 'Purchase Triggers': 'purchaseTriggers',
                'Purchase Barriers': 'purchaseBarriers', 'Media Consumption Patterns': 'mediaConsumption',
                'Digital Behaviour': 'digitalBehaviour',
            } as Record<string, string>).find(([, v]) => v === key)?.[0];
            if (subtabName) s.delete(subtabName);
            return s;
        });
    };

    const handleRemoveFormativeExperience = () => setFormativeExperience('');

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

    // ── Render helpers ─────────────────────────────────────────────────────────

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

    // ── Resolve warning for the currently active sub-tab ─────────────────────
    // Backend shape: { rule, severity, message, fields: string[] }
    // e.g. fields: ["age_range", "income_range"]
    const getActiveWarning = (): string | undefined => {
        if (!realtimeWarnings.length) return undefined;

        const subTab = activeSubTab.toLowerCase().replace(/\s+/g, '_');

        const match = realtimeWarnings.find((w) => {
            const raw = w as unknown as Record<string, unknown>;
            const fields = raw.fields;
            if (Array.isArray(fields)) {
                const keyword = subTab.split('_')[0] ?? subTab;
                return fields.some((f: unknown) =>
                    typeof f === 'string' && f.toLowerCase().includes(keyword)
                );
            }
            return false;
        });

        if (!match) return undefined;
        const raw = match as unknown as Record<string, unknown>;
        return (raw.message as string | undefined) ?? 'Please review this field.';
    };

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
                    highlightedSubTab={highlightedSubTab}
                />
        <AttributeSelectionPanel
                    attributeName={activeSubTab}
                    currentValue={getCurrentAttributeValue()}
                    onSelect={(value) => handleAttributeSelect(activeSubTab, value)}
                    disabled={isSubmitting}
                    {...(getActiveWarning() !== undefined ? { warning: getActiveWarning()! } : {})}
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

                {/* ── Search Bar ── */}
                <PersonaSearch
                    onNavigate={handleSearchNavigate}
                    disabled={isSubmitting}
                />

                {/* ── Main Card ── */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="pbm-main-card"
                >
                    {renderCategoryTabs()}

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
                </motion.div>

                {/* ── Persona Summary ── */}
                <PersonaSummaryView
                    personaName={personaName}
                    formData={formData}
                    formativeExperience={formativeExperience}
                    onFormativeExperienceChange={setFormativeExperience}
                    onEditName={() => setShowEditNameModal(true)}
                    onRemoveAttribute={handleRemoveAttribute}
                    onRemoveFormativeExperience={handleRemoveFormativeExperience}
                />

                {/* ── Footer ── */}
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

            <EditPersonaNameModal
                isOpen={showEditNameModal}
                currentName={personaName}
                onSave={(name) => {
                    setPersonaName(name);
                    setShowEditNameModal(false);
                }}
                onClose={() => setShowEditNameModal(false)}
            />

            <PlausibilityCheckModal
                show={showPlausibilityModal}
                warnings={plausibilityWarnings as Parameters<typeof PlausibilityCheckModal>[0]['warnings']}
                onContinue={() => {
                    setShowPlausibilityModal(false);
                    navigateAfterSubmit();
                }}
            />
        </div>
    );
};

// ── Formative Experience inner tab ─────────────────────────────────────────

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