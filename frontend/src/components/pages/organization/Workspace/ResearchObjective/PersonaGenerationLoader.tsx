import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import OmiKeyboard from '../../../../../assets/Omi Animations/OmiKeyboard.mp4';

import avatar1 from '../../../../../assets/Avatar/Avatar1.png';
import avatar2 from '../../../../../assets/Avatar/Avatar2.png';
import avatar3 from '../../../../../assets/Avatar/Avatar3.png';
import avatar4 from '../../../../../assets/Avatar/Avatar4.png';
import avatar5 from '../../../../../assets/Avatar/Avatar5.png';
import avatar6 from '../../../../../assets/Avatar/Avatar6.png';
import avatar7 from '../../../../../assets/Avatar/Avatar7.png';
import avatar8 from '../../../../../assets/Avatar/Avatar8.png';
import avatar9 from '../../../../../assets/Avatar/Avatar9.png';
import SpIcon from '../../../../SPIcon';

import "./PersonaGenerationLoader.css";

// ── Types ────────────────────────────────────────────────────────────────────

type FlowType = "omi" | "manual";

interface DynamicValues {
    datasetSize?: string;
    peopleCount?: string;
    neuroscienceCount?: string;
    sourcesCount?: string;
    conversationsCount?: string;
    platforms?: string;
}

interface Props {
    flow?: FlowType;
    dynamicValues?: DynamicValues;
}

interface StepData {
    title: string;
    description: string;
    items: string[];
    outcome: string;
}

const TICK_MS = 27_000;

const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ── Avatar frames array (index 0 = most blurry, index 8 = clear) ─────────────
const AVATAR_FRAMES = [
    avatar1, avatar2, avatar3, avatar4, avatar5,
    avatar6, avatar7, avatar8, avatar9,
];

const TOTAL_AVATAR_FRAMES = AVATAR_FRAMES.length; // 9

// ── Sub-components ────────────────────────────────────────────────────────────

const RingProgress: React.FC<{ progress: number }> = ({ progress }) => {
    const offset = RING_CIRCUMFERENCE - (progress / 100) * RING_CIRCUMFERENCE;
    return (
        <svg className="pgl-ring-svg" viewBox="0 0 120 120">
            <circle className="pgl-ring-track" cx="60" cy="60" r={RING_RADIUS} />
            <circle
                className="pgl-ring-progress"
                cx="60"
                cy="60"
                r={RING_RADIUS}
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={offset}
            />
        </svg>
    );
};

const CheckIcon: React.FC = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path
            d="M2 5l2.5 2.5L8 3"
            stroke="#22c55e"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

// ── Avatar with progressive reveal (manual flow) ──────────────────────────────
// Crossfades between frames as items complete.

interface ProgressiveAvatarProps {
    frameIndex: number; // 0–8
}

const ProgressiveAvatar: React.FC<ProgressiveAvatarProps> = ({ frameIndex }) => {
    const [displayedFrame, setDisplayedFrame] = useState(frameIndex);
    const [fadingIn, setFadingIn] = useState(false);

    useEffect(() => {
        if (frameIndex === displayedFrame) return;
        // Brief fade transition when frame changes
        setFadingIn(false);
        const t = setTimeout(() => {
            setDisplayedFrame(frameIndex);
            setFadingIn(true);
        }, 80);
        return () => clearTimeout(t);
    }, [frameIndex]);

    useEffect(() => {
        // Trigger fade-in after mount
        const t = setTimeout(() => setFadingIn(true), 50);
        return () => clearTimeout(t);
    }, []);

    return (
        <div className="pgl-character pgl-character--avatar">
            <img
                key={displayedFrame}
                src={AVATAR_FRAMES[displayedFrame]}
                alt={`Persona generating — frame ${displayedFrame + 1}`}
                className={`pgl-avatar-img ${fadingIn ? 'pgl-avatar-img--visible' : ''}`}
            />
            {/* Subtle shimmer overlay while not yet fully clear */}
            {displayedFrame < TOTAL_AVATAR_FRAMES - 1 && (
                <div className="pgl-avatar-shimmer" />
            )}
        </div>
    );
};

// ── Component ────────────────────────────────────────────────────────────────

const PersonaGenerationLoader: React.FC<Props> = ({
    flow: propFlow,
    dynamicValues,
}) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { workspaceId, objectiveId } = useParams<{
        workspaceId: string;
        objectiveId: string;
    }>();

    const flow: FlowType = propFlow || (location.state as any)?.flow || "omi";

    const [currentStep, setCurrentStep] = useState<number>(0);
    const [checkedItems, setCheckedItems] = useState<number[]>([]);
    const [isComplete, setIsComplete] = useState<boolean>(false);

    const values = {
        datasetSize: dynamicValues?.datasetSize || "ABC million",
        peopleCount: dynamicValues?.peopleCount || "ABC",
        neuroscienceCount: dynamicValues?.neuroscienceCount || "ABC million",
        sourcesCount: dynamicValues?.sourcesCount || "ABC",
        conversationsCount: dynamicValues?.conversationsCount || "ABC",
        platforms: dynamicValues?.platforms || "XYZ platforms",
    };

    const omiSteps: StepData[] = [
        {
            title: "Behavioural Grounding Layer",
            description: "Identifying real-world behavioural counterparts aligned to your research objective",
            items: [
                "Interpreting your research intent and contextual signals",
                `Scanning ${values.datasetSize} real people datasets to locate aligned population clusters`,
                `Identified ${values.peopleCount} relevant people and detecting shared traits across choices, actions, intent, and consumption patterns`,
                "Constructing archetypes based on how people act, not how they are described",
            ],
            outcome: "A grounded persona foundation built from behavioural alignment, not demographic approximation.",
        },
        {
            title: "Neuroscience Calibration",
            description: "Modelling how the persona feels, hesitates, and evaluates",
            items: [
                "Aligning foundational traits with our neuroscience dataset",
                `Calibrated ${values.neuroscienceCount} relevant emotional and physiological signal`,
                "Estimated cognitive and emotional load, sensitivity, and perceived patterns",
            ],
            outcome: "A persona that reacts with emotional realism, not surface-level sentiment.",
        },
        {
            title: "Contextual & Cognitive Enrichment",
            description: "Embedding real-world context into decision-making",
            items: [
                "Interpreting your research objective alongside foundational persona traits",
                `Scanning our knowledge base of ${values.sourcesCount} high-quality sources`,
                `Identified and analysed ${values.sourcesCount} relevant sources`,
                `Learning from ${values.conversationsCount} conversations from ${values.platforms}`,
                "Stress-testing consistency across scenarios and trade-offs",
            ],
            outcome: "A context-aware persona capable of nuanced reasoning, hesitation, and justification.",
        },
        {
            title: "Persona Synthesis",
            description: "Assembling all layers into a coherent, simulation-ready decision model",
            items: [
                "Merging behavioural, neurological, and contextual layers into a unified profile",
                "Validating internal consistency across emotional states and decision scenarios",
                "Finalising voice, motivation stack, and constraint framework",
                "Preparing persona for qualitative simulation and research interaction",
            ],
            outcome: "A fully assembled persona ready to think, respond, and reveal insight under research conditions.",
        },
    ];

    const manualSteps: StepData[] = [
        {
            title: "Behavioural Grounding Layer",
            description: "Grounding the persona in real-world patterns",
            items: [
                "Interpreting the traits and constraints you provided",
                `Matching against our ${values.datasetSize} peoples dataset`,
                `Identified ${values.peopleCount} people aligning with our persona traits`,
                "Analysing purchase patterns, intent signals, and behavioural trajectories",
                `Ingested ${values.conversationsCount} billion datapoints to frame decision tendencies, risk tolerance, and habit structures`,
                "Successfully created the foundational layer",
            ],
            outcome: "A foundational behavioural layer that reflects how this persona is likely to act, not just how they are described.",
        },
        {
            title: "Neuroscience Calibration",
            description: "Modelling how the persona feels, hesitates, and evaluates",
            items: [
                "Aligning foundational traits with our neuroscience dataset",
                `Calibrated ${values.neuroscienceCount} relevant emotional and physiological signal`,
                "Estimated cognitive and emotional load, sensitivity, and perceived patterns",
            ],
            outcome: "A persona that reacts with emotional realism, not surface-level sentiment.",
        },
        {
            title: "Contextual & Cognitive Enrichment",
            description: "Embedding real-world context into decision-making",
            items: [
                "Interpreting your research objective alongside foundational persona traits",
                `Scanning our knowledge base of ${values.sourcesCount} high-quality sources`,
                `Identified and analysed ${values.sourcesCount} relevant sources`,
                `Learning from ${values.conversationsCount} conversations from ${values.platforms}`,
                "Stress-testing consistency across scenarios and trade-offs",
            ],
            outcome: "A context-aware persona capable of nuanced reasoning, hesitation, and justification.",
        },
        {
            title: "Persona Synthesis",
            description: "Assembling all layers into a coherent, simulation-ready decision model",
            items: [
                "Merging behavioural, neurological, and contextual layers into a unified profile",
                "Validating internal consistency across emotional states and decision scenarios",
                "Finalising voice, motivation stack, and constraint framework",
                "Preparing persona for qualitative simulation and research interaction",
            ],
            outcome: "A fully assembled persona ready to think, respond, and reveal insight under research conditions.",
        },
    ];

    const steps = flow === "omi" ? omiSteps : manualSteps;

    // ── Total items (used to map checkedItems count → avatar frame) ───────────
    const totalItems = steps.reduce((acc, s) => acc + s.items.length, 0);

    // Avatar frame = floor(completedItemsCount * 9 / totalItems), clamped 0–8
    const avatarFrameIndex = Math.min(
        Math.floor((checkedItems.length * TOTAL_AVATAR_FRAMES) / totalItems),
        TOTAL_AVATAR_FRAMES - 1
    );

    // ── Auto-tick ─────────────────────────────────────────────────────────────

    useEffect(() => {
        let itemIndex = 0;
        let stepIndex = 0;

        const interval = setInterval(() => {
            const currentStepData = steps[stepIndex];
            if (!currentStepData) { clearInterval(interval); return; }

            const globalOffset = steps.slice(0, stepIndex).reduce((acc, s) => acc + s.items.length, 0);
            setCheckedItems((prev) => [...prev, globalOffset + itemIndex]);
            itemIndex++;

            if (itemIndex >= currentStepData.items.length) {
                stepIndex++;
                setCurrentStep(stepIndex);
                itemIndex = 0;
            }

            if (stepIndex >= steps.length) {
                clearInterval(interval);
                setTimeout(() => setIsComplete(true), 1000);
            }
        }, TICK_MS);

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Navigate when complete ────────────────────────────────────────────────

    useEffect(() => {
        if (!isComplete || !workspaceId || !objectiveId) return;

        const timer = setTimeout(() => {
            // Mark Step 2 (Persona Creation) as complete
            localStorage.setItem(`step2_done_${objectiveId}`, '1');

            navigate(
                `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`,
                { state: { fromLoader: true, flow } }
            );
        }, 2500);

        return () => clearTimeout(timer);
    }, [isComplete, workspaceId, objectiveId, navigate, flow]);

    // ── Derived values ─────────────────────────────────────────────────────────

    const activeStep = steps[currentStep] as StepData | undefined;

    const itemsBeforeCurrentStep = steps
        .slice(0, currentStep)
        .reduce((acc, s) => acc + s.items.length, 0);

    const currentStepItemsDone = checkedItems.filter(
        (i) => i >= itemsBeforeCurrentStep && i < itemsBeforeCurrentStep + (activeStep?.items.length ?? 0)
    ).length;

    const ringProgress = activeStep ? (currentStepItemsDone / activeStep.items.length) * 100 : 0;

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="pgl-container">

            {/* Header */}
            <div className="pgl-header">
                <h1 className="pgl-heading">
                    {flow === "omi" ? "Building from Signals to Simulated Choice" : "From Traits to Behavioural Depth"}
                </h1>
                {flow === "omi" ? (
                    <>
                        <p className="pgl-tagline-top">We don't assemble demographics.</p>
                        <p className="pgl-tagline-sub">
                            We infer behaviour from real-world patterns, context, and intent aligned to your objective.
                        </p>
                    </>
                ) : (
                    <>
                        <p className="pgl-tagline-top">You shared high-level attributes.</p>
                        <p className="pgl-tagline-sub">We now calibrate the underlying decision system.</p>
                    </>
                )}
            </div>

            {/* Step card */}
            {activeStep && !isComplete && (
                <div className="pgl-card">
                    <div className="pgl-card-left">
                        <div className="pgl-ring-wrapper">
                            <RingProgress progress={ringProgress} />

                            {/* ── Avatar: Omi video for omi flow, progressive images for manual ── */}
                            {flow === "manual" ? (
                                <ProgressiveAvatar frameIndex={avatarFrameIndex} />
                            ) : (
                                <div className="pgl-character">
                                    <video
                                        className="pgl-character-video"
                                        src={OmiKeyboard}
                                        autoPlay
                                        loop
                                        muted
                                        playsInline
                                    />
                                </div>
                            )}
                        </div>

                        <p className="pgl-step-label">Step {currentStep + 1}/{steps.length}</p>

                        {/* Progress label only for manual — tells user what's happening
                        {flow === "manual" && (
                            <p className="pgl-avatar-progress-label">
                                {avatarFrameIndex < 3
                                    ? "Identifying patterns…"
                                    : avatarFrameIndex < 6
                                    ? "Calibrating profile…"
                                    : avatarFrameIndex < 8
                                    ? "Almost ready…"
                                    : "Persona complete"}
                            </p>
                        )} */}
                    </div>

                    <div className="pgl-card-right">
                        <h3 className="pgl-step-title">{activeStep.title}</h3>
                        <p className="pgl-step-desc">{activeStep.description}</p>

                        <ul className="pgl-checklist">
                            {activeStep.items.map((item, itemIdx) => {
                                const globalIndex = itemsBeforeCurrentStep + itemIdx;
                                const isDone = checkedItems.includes(globalIndex);
                                const isVisible = itemIdx <= currentStepItemsDone;
                                const isActive = itemIdx === currentStepItemsDone;

                                if (!isVisible) return null;

                                return (
                                    <li
                                        key={globalIndex}
                                        className={`pgl-check-item ${isDone ? "pgl-check-item--done" : ""} ${isActive ? "pgl-check-item--active" : ""}`}
                                    >
                                        <div className="pgl-check-circle">
                                            <SpIcon name={isDone ? "sp-Warning-Circle_Check" : "sp-Interface-Radio_Unchecked"}
                                                className={isDone ? "pgl-icon-done" : "pgl-icon-default"}
                                            />
                                        </div>
                                        <span className="pgl-check-text">{item}</span>
                                    </li>
                                );
                            })}
                        </ul>

                        {currentStepItemsDone === activeStep.items.length && activeStep.outcome && (
                            <p className="pgl-outcome">{activeStep.outcome}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Final message */}
            {isComplete && (
                <div className="pgl-final">
                    {/* Show fully-clear avatar in final state for manual flow */}
                    {flow === "manual" && (
                        <div className="pgl-final-avatar">
                            <img
                                src={AVATAR_FRAMES[TOTAL_AVATAR_FRAMES - 1]}
                                alt="Persona ready"
                                className="pgl-final-avatar-img"
                            />
                        </div>
                    )}
                    <p>
                        This persona was inferred through behavioural signals, emotional calibration, and contextual grounding.
                    </p>
                    <p className="pgl-final-line2">
                        What you see next is not a demographic profile. It is a decision model designed to simulate how this person would actually think, feel, and choose under real-world constraints.
                    </p>
                    <div className="pgl-final-redirect">
                        <div className="pgl-final-spinner" />
                        <span>Taking you to your personas…</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PersonaGenerationLoader;