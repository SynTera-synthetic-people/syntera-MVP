import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbChevronDown, TbX, TbInfoCircle, TbPlus, TbArrowRight, TbLoader, TbChevronUp } from 'react-icons/tb';
import OmiKeyboard from '../../../../../../assets/Omi Animations/OmiKeyboard.mp4';
import './PopulationSetup.css';

interface Persona {
    id: string;
    name: string;
}

interface SelectedPersona {
    id: string;
    name: string;
}

interface SampleSizes {
    [personaId: string]: number;
}

interface PopulationSetupProps {
    personas: Persona[];
    selectedPersonas: SelectedPersona[];
    sampleSizes: SampleSizes;
    onSelectPersona: (persona: Persona) => void;
    onSampleSizeChange: (personaId: string, size: string) => void;
    onRemovePersona: (personaId: string) => void;
    onStartSurvey: () => void;
    isPending: boolean;
}

const SETUP_STEPS = [
    { step: 1, label: 'Understanding your objective, context, and decision focus.' },
    { step: 2, label: 'Mapping your personas to real-world behavioural profiles.' },
    { step: 3, label: 'Calibrating sample distribution across the population.' },
    { step: 4, label: 'Preparing your survey for deployment.' },
];

const MAX_PERSONAS = 8;
const PREVIEW_COUNT = 4;

const PopulationSetup: React.FC<PopulationSetupProps> = ({
    personas = [],
    selectedPersonas = [],
    sampleSizes = {},
    onSelectPersona,
    onSampleSizeChange,
    onRemovePersona,
    onStartSurvey,
    isPending = false,
}) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [showAll, setShowAll] = useState(false);

    // Dropdown open state: null = all closed, 'add' = add-new row, number = row index
    const [openDropdown, setOpenDropdown] = useState<'add' | number | null>(null);

    const rowDropdownRefs = useRef<(HTMLDivElement | null)[]>([]);
    const addDropdownRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    const hasValidSelection =
        selectedPersonas.length > 0 &&
        selectedPersonas.every((p) => (sampleSizes[p.id] ?? 0) > 0);

    // Step cycling
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentStep((prev) => (prev + 1) % SETUP_STEPS.length);
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            const insideAdd = addDropdownRef.current?.contains(target);
            const insideRow = rowDropdownRefs.current.some((ref) => ref?.contains(target));
            if (!insideAdd && !insideRow) setOpenDropdown(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const atLimit = selectedPersonas.length >= MAX_PERSONAS;
    const visiblePersonas = showAll ? selectedPersonas : selectedPersonas.slice(0, PREVIEW_COUNT);
    const hasMore = selectedPersonas.length > PREVIEW_COUNT;
    const badgeNum = selectedPersonas.length > 0 ? selectedPersonas.length : 1;

    // Personas available for the "add new" row
    const availableForNew = personas.filter(
        (p) => !selectedPersonas.some((sp) => sp.id === p.id),
    );

    // Personas available for an existing row (own + unselected)
    const getAvailableForRow = (rowPersonaId: string) =>
        personas.filter(
            (p) => p.id === rowPersonaId || !selectedPersonas.some((sp) => sp.id === p.id),
        );

    const handleAddPersona = (persona: Persona) => {
        onSelectPersona(persona);
        setOpenDropdown(null);
        // Auto-expand so newly added row is visible
        if (selectedPersonas.length >= PREVIEW_COUNT) setShowAll(true);
    };

    return (
        <motion.div
            className="ps-root"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
        >
            {/* ── Page header ─────────────────────────────────── */}
            <div className="ps-header">
                <div>
                    <h1 className="ps-title">Calibrate Your Population</h1>
                    <p className="ps-subtitle">
                        Select personas and set sample sizes to reflect real-world distribution and decision context
                    </p>
                </div>
            </div>

            {/* ── Main card ────────────────────────────────────── */}
            <div className="ps-card">

                {/* Header badge */}
                <div className="ps-persona-block__header">
                    <span className="ps-persona-block__num">{badgeNum}</span>
                    <span className="ps-persona-block__label">Persona</span>
                    <TbInfoCircle size={14} className="ps-persona-block__info" />
                </div>

                {/* Column labels */}
                <div className="ps-col-labels">
                    <div className="ps-col-label">
                        Select Persona <span className="ps-field__req">*</span>
                        <TbInfoCircle size={12} className="ps-field__info-icon" />
                    </div>
                    <div className="ps-col-label">
                        Sample Size <span className="ps-field__req">*</span>
                        <TbInfoCircle size={12} className="ps-field__info-icon" />
                    </div>
                </div>

                {/* ── Add-new row: always rendered — shown as empty state OR when "Add New Persona" clicked ── */}
                {(selectedPersonas.length === 0 || openDropdown === 'add') && (
                    <div className="ps-persona-entry">
                        <div className="ps-fields-row">
                            <div className="ps-dropdown" ref={addDropdownRef}>
                                <button
                                    className="ps-dropdown__trigger"
                                    onClick={() =>
                                        setOpenDropdown(openDropdown === 'add' ? null : 'add')
                                    }
                                >
                                    <span className="ps-dropdown__value">Select Persona</span>
                                    <TbChevronDown
                                        size={15}
                                        className={`ps-dropdown__chevron ${openDropdown === 'add' ? 'ps-dropdown__chevron--open' : ''}`}
                                    />
                                </button>
                                <AnimatePresence>
                                    {openDropdown === 'add' && (
                                        <motion.div
                                            className="ps-dropdown__menu"
                                            initial={{ opacity: 0, y: -6, scaleY: 0.96 }}
                                            animate={{ opacity: 1, y: 0, scaleY: 1 }}
                                            exit={{ opacity: 0, y: -6, scaleY: 0.96 }}
                                            transition={{ duration: 0.13 }}
                                        >
                                            {availableForNew.length === 0 ? (
                                                <div className="ps-dropdown__empty">
                                                    {atLimit ? `Maximum ${MAX_PERSONAS} reached` : 'All personas selected'}
                                                </div>
                                            ) : (
                                                availableForNew.map((persona) => (
                                                    <button
                                                        key={persona.id}
                                                        className="ps-dropdown__item"
                                                        onClick={() => handleAddPersona(persona)}
                                                    >
                                                        {persona.name}
                                                    </button>
                                                ))
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                            <div className="ps-sample-row">
                                <input
                                    className="ps-sample-input"
                                    type="number"
                                    min={1}
                                    placeholder="100"
                                    readOnly
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* ── One row per selected persona ── */}
                <AnimatePresence initial={false}>
                    {visiblePersonas.map((persona, idx) => {
                        const available = getAvailableForRow(persona.id);
                        return (
                            <motion.div
                                key={persona.id}
                                className="ps-persona-entry"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="ps-fields-row">
                                    {/* Per-row persona dropdown */}
                                    <div
                                        className="ps-dropdown"
                                        ref={(el) => { rowDropdownRefs.current[idx] = el; }}
                                    >
                                        <button
                                            className="ps-dropdown__trigger ps-dropdown__trigger--filled"
                                            onClick={() =>
                                                setOpenDropdown(openDropdown === idx ? null : idx)
                                            }
                                        >
                                            <span className="ps-dropdown__value ps-dropdown__value--selected">
                                                {persona.name}
                                            </span>
                                            <TbChevronDown
                                                size={15}
                                                className={`ps-dropdown__chevron ${openDropdown === idx ? 'ps-dropdown__chevron--open' : ''}`}
                                            />
                                        </button>
                                        <AnimatePresence>
                                            {openDropdown === idx && (
                                                <motion.div
                                                    className="ps-dropdown__menu"
                                                    initial={{ opacity: 0, y: -6, scaleY: 0.96 }}
                                                    animate={{ opacity: 1, y: 0, scaleY: 1 }}
                                                    exit={{ opacity: 0, y: -6, scaleY: 0.96 }}
                                                    transition={{ duration: 0.13 }}
                                                >
                                                    {available.map((p) => (
                                                        <button
                                                            key={p.id}
                                                            className={`ps-dropdown__item ${p.id === persona.id ? 'ps-dropdown__item--active' : ''}`}
                                                            onClick={() => {
                                                                if (p.id !== persona.id) {
                                                                    onRemovePersona(persona.id);
                                                                    onSelectPersona(p);
                                                                }
                                                                setOpenDropdown(null);
                                                            }}
                                                        >
                                                            {p.name}
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Sample size + remove */}
                                    <div className="ps-sample-row">
                                        <input
                                            className="ps-sample-input"
                                            type="number"
                                            min={1}
                                            value={sampleSizes[persona.id] ?? ''}
                                            onChange={(e) =>
                                                onSampleSizeChange(persona.id, e.target.value)
                                            }
                                        />
                                        <button
                                            className="ps-persona-remove"
                                            onClick={() => onRemovePersona(persona.id)}
                                            aria-label="Remove persona"
                                        >
                                            <TbX size={13} />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {/* Footer: Add New Persona + View More/Less */}
                <div className="ps-card-footer">
                    {!atLimit && selectedPersonas.length > 0 && (
                        <button
                            className="ps-add-btn"
                            onClick={() => setOpenDropdown('add')}
                        >
                            <TbPlus size={15} />
                            Add New Persona
                        </button>
                    )}
                    {hasMore && (
                        <button
                            className="ps-view-toggle"
                            onClick={() => setShowAll((v) => !v)}
                        >
                            {showAll ? (
                                <>View Less <TbChevronUp size={14} /></>
                            ) : (
                                <>View More <TbChevronDown size={14} /></>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* ── Start Survey button ── */}
            <div className="ps-action-row">
                <button
                    className="ps-start-btn"
                    disabled={!hasValidSelection || isPending}
                    onClick={onStartSurvey}
                >
                    {isPending && <TbLoader className="ps-start-btn__spinner" />}
                    Start Survey
                    {!isPending && <TbArrowRight size={16} />}
                </button>
            </div>

            {/* ── Omi step card ────────────────────────────────── */}
            <div className="ps-omi-card">
                {/* Left: arc + video + step label */}
                <div className="ps-omi-card__left">
                    <div className="ps-omi-arc-wrap">
                        <video
                            ref={videoRef}
                            src={OmiKeyboard}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="ps-omi-card__video"
                        />
                    </div>
                    {/* <span className="ps-omi-card__step-label">
                        Step {SETUP_STEPS[currentStep]!.step}/{SETUP_STEPS.length}
                    </span> */}
                </div>

                {/* Right: animated text + dots */}
                <div className="ps-omi-card__content">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.35 }}
                            className="ps-omi-card__step-text"
                        >
                            {SETUP_STEPS[currentStep]!.label}
                        </motion.div>
                    </AnimatePresence>

                </div>
            </div>
        </motion.div>
    );
};

export default PopulationSetup;