import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import OmiKeyboard from '../../../../../assets/Omi Animations/OmiKeyboard.mp4';
import axiosInstance from "../../../../../utils/axiosConfig";

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

// Each item takes this long before being marked done and the next one appears
const TICK_MS = 27_000;

// /calibrate runs several sequential LLM calls (RO extraction, trait auto-fill,
// evidence collection, brain assignment, predominant-pattern scoring) and can
// legitimately take well over the default 30s axios timeout — give it room.
// Measured real-world runs land around ~180s (one evidence-collection LLM call
// alone can take 100s+), so 180s cut it too close — same order of magnitude as
// REPLICATION_TIMEOUT_MS elsewhere in the codebase for another slow persona op.
const CALIBRATION_TIMEOUT_MS = 300_000;

const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ── Avatar frames array (index 0 = most blurry, index 8 = clear) ─────────────
const AVATAR_FRAMES = [
    new URL('../../../../../assets/Avatar/Avatar1.png', import.meta.url).href,
    new URL('../../../../../assets/Avatar/Avatar2.png', import.meta.url).href,
    new URL('../../../../../assets/Avatar/Avatar3.png', import.meta.url).href,
    new URL('../../../../../assets/Avatar/Avatar4.png', import.meta.url).href,
    new URL('../../../../../assets/Avatar/Avatar5.png', import.meta.url).href,
    new URL('../../../../../assets/Avatar/Avatar6.png', import.meta.url).href,
    new URL('../../../../../assets/Avatar/Avatar7.png', import.meta.url).href,
    new URL('../../../../../assets/Avatar/Avatar8.png', import.meta.url).href,
    new URL('../../../../../assets/Avatar/Avatar9.png', import.meta.url).href,
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

// ── Avatar with progressive reveal (manual flow) ──────────────────────────────

interface ProgressiveAvatarProps {
    frameIndex: number; // 0–8
}

const ProgressiveAvatar: React.FC<ProgressiveAvatarProps> = ({ frameIndex }) => {
    const [displayedFrame, setDisplayedFrame] = useState(frameIndex);
    const [fadingIn, setFadingIn] = useState(false);

    useEffect(() => {
        if (frameIndex === displayedFrame) return;
        setFadingIn(false);
        const t = setTimeout(() => {
            setDisplayedFrame(frameIndex);
            setFadingIn(true);
        }, 80);
        return () => clearTimeout(t);
    }, [frameIndex]);

    useEffect(() => {
        const t = setTimeout(() => setFadingIn(true), 50);
        return () => clearTimeout(t);
    }, []);

    const frameSrc = AVATAR_FRAMES[displayedFrame] || AVATAR_FRAMES[0];

    return (
        <div className="pgl-character pgl-character--avatar">
            <img
                key={displayedFrame}
                src={frameSrc}
                alt={`Persona generating — frame ${displayedFrame + 1}`}
                className={`pgl-avatar-img ${fadingIn ? 'pgl-avatar-img--visible' : ''}`}
            />
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
    // personaId is passed from PersonaBuilderManual after draft creation (manual flow only)
    const draftPersonaId: string | undefined = (location.state as any)?.personaId;

    // ── State ─────────────────────────────────────────────────────────────────
    const [globalCheckedCount, setGlobalCheckedCount] = useState<number>(0);
    const [isComplete, setIsComplete] = useState<boolean>(false);
    const [backendDynamicValues, setBackendDynamicValues] = useState<DynamicValues | null>(null);
    // Calibration tracking (manual flow only)
    const [calibrationDone, setCalibrationDone] = useState<boolean>(false);
    const [calibratedPersonaId, setCalibratedPersonaId] = useState<string | null>(null);

    // Keep a ref to the interval so we can clear it reliably
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Backend context fetch ─────────────────────────────────────────────────
    useEffect(() => {
        if (!workspaceId || !objectiveId) return;
        let cancelled = false;

        const loadLoaderContext = async () => {
            try {
                const response = await axiosInstance.get(
                    `/workspaces/${workspaceId}/explorations/${objectiveId}/personas/loader-context`
                );
                const contextValues = response.data?.data?.dynamic_values;
                if (!cancelled && contextValues) {
                    setBackendDynamicValues(contextValues);
                }
            } catch (error) {
                console.warn("Persona loader context unavailable; using local fallback copy.", error);
            }
        };

        loadLoaderContext();
        return () => { cancelled = true; };
    }, [workspaceId, objectiveId]);

    // ── Phase 2 Calibration (manual flow only) ────────────────────────────────
    // Triggered immediately on mount. The animation plays while the API call runs.
    // When calibration finishes, animation fast-forwards to completion.
    useEffect(() => {
        if (flow !== 'manual' || !draftPersonaId || !workspaceId || !objectiveId) return;

        const runCalibration = async () => {
            try {
                await axiosInstance.post(
                    `/workspaces/${workspaceId}/explorations/${objectiveId}/personas/${draftPersonaId}/calibrate`,
                    undefined,
                    { timeout: CALIBRATION_TIMEOUT_MS }
                );
                setCalibratedPersonaId(draftPersonaId);
            } catch (error) {
                console.error('Persona calibration failed:', error);
                // Calibration failed — we'll navigate back to persona-builder so user can retry
            } finally {
                setCalibrationDone(true);
            }
        };

        runCalibration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flow, draftPersonaId, workspaceId, objectiveId]);

    // ── Fast-forward animation when calibration finishes ─────────────────────
    useEffect(() => {
        if (!calibrationDone || isComplete) return;
        // Jump animation to end so the completion screen shows promptly
        if (intervalRef.current) clearInterval(intervalRef.current);
        setGlobalCheckedCount((prev) => {
            // Only fast-forward if we haven't already reached the end naturally
            return prev;
        });
        setTimeout(() => setIsComplete(true), 800);
    }, [calibrationDone, isComplete]);

    // ── Resolve dynamic copy values ───────────────────────────────────────────
    const resolvedDynamicValues = {
        ...(backendDynamicValues || {}),
        ...(dynamicValues || {}),
    };

    const values = {
        datasetSize: resolvedDynamicValues.datasetSize || "available behavioural datasets",
        peopleCount: resolvedDynamicValues.peopleCount || "matching behavioural clusters",
        sourcesCount: resolvedDynamicValues.sourcesCount || "available",
        conversationsCount: resolvedDynamicValues.conversationsCount || "available",
        platforms: resolvedDynamicValues.platforms || "source-bank channels",
    };

    // ── Step definitions (PDF-accurate, neuroscience omitted) ─────────────────

    const omiSteps: StepData[] = [
        {
            title: "Behavioural Grounding Layer",
            description: "Identifying real-world behavioural counterparts aligned to your research objective",
            items: [
                "Interpreting your research intent and contextual signals",
                `Scanning ${values.datasetSize} to locate aligned population clusters`,
                `Identified ${values.peopleCount} across choices, actions, intent, and consumption patterns`,
                "Constructing archetypes based on how people act, not how they are described",
            ],
            outcome: "A grounded persona foundation built from behavioural alignment, not demographic approximation.",
        },
        {
            title: "Contextual & Cognitive Enrichment",
            description: "Embedding real-world context into decision-making",
            items: [
                "Interpreting your research objective alongside foundational persona traits",
                `Scanning our knowledge base across ${values.sourcesCount} high-quality sources`,
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
            ],
            outcome: "",
        },
    ];

    const manualSteps: StepData[] = [
        {
            title: "Behavioural Grounding Layer",
            description: "Grounding the persona in real-world patterns",
            items: [
                "Interpreting the traits and constraints you provided",
                `Matching against our ${values.datasetSize}`,
                `Identified ${values.peopleCount} aligning with your persona traits`,
                "Analysing purchase patterns, intent signals, and behavioural trajectories",
                `Ingested ${values.conversationsCount} evidence signals to frame decision tendencies, risk tolerance, and habit structures`,
                "Successfully created the foundational layer",
            ],
            outcome: "A foundational behavioural layer that reflects how this persona is likely to act, not just how they are described.",
        },
        {
            title: "Contextual & Cognitive Enrichment",
            description: "Embedding real-world context into decision-making",
            items: [
                "Interpreting your research objective alongside foundational persona traits",
                `Scanning our knowledge base across ${values.sourcesCount} high-quality sources`,
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
                "Merging behavioural and contextual layers into a unified profile",
                "Validating internal consistency across emotional states and decision scenarios",
                "Finalising voice, motivation stack, and constraint framework",
                "Preparing persona for qualitative simulation and research interaction",
            ],
            outcome: "A fully assembled persona ready to think, respond, and reveal insight under research conditions.",
        },
    ];

    const steps = flow === "omi" ? omiSteps : manualSteps;

    // ── Derived totals ────────────────────────────────────────────────────────
    const totalItems = steps.reduce((acc, s) => acc + s.items.length, 0);

    // Which step are we currently in?
    // Walk through steps accumulating item counts until we find where globalCheckedCount sits.
    const currentStep = (() => {
        let acc = 0;
        for (let i = 0; i < steps.length; i++) {
            acc += steps[i]!.items.length;
            if (globalCheckedCount < acc) return i;
        }
        return steps.length - 1;
    })();

    const activeStep = steps[currentStep] as StepData | undefined;

    // How many items have been checked within the current step?
    const itemsBeforeCurrentStep = steps
        .slice(0, currentStep)
        .reduce((acc, s) => acc + s.items.length, 0);

    const currentStepItemsDone = globalCheckedCount - itemsBeforeCurrentStep;

    // Ring progress = ratio of done items within current step
    const ringProgress = activeStep
        ? Math.min((currentStepItemsDone / activeStep.items.length) * 100, 100)
        : 0;

    // Avatar frame for manual flow
    const avatarFrameIndex = Math.min(
        Math.floor((globalCheckedCount * TOTAL_AVATAR_FRAMES) / totalItems),
        TOTAL_AVATAR_FRAMES - 1
    );

    // ── Auto-tick — advances one item every TICK_MS ───────────────────────────
    useEffect(() => {
        // Clear any existing interval before starting a new one
        if (intervalRef.current) clearInterval(intervalRef.current);

        if (isComplete) return;

        intervalRef.current = setInterval(() => {
            setGlobalCheckedCount((prev) => {
                const next = prev + 1;

                if (next >= totalItems) {
                    // All items done — stop ticking, trigger completion
                    if (intervalRef.current) clearInterval(intervalRef.current);
                    setTimeout(() => setIsComplete(true), 1000);
                    return totalItems; // clamp
                }

                return next;
            });
        }, TICK_MS);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
        // totalItems is stable (derived from steps which don't change after mount)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [totalItems]);

    // ── Navigate when complete ────────────────────────────────────────────────
    useEffect(() => {
        if (!isComplete || !workspaceId || !objectiveId) return;

        const timer = setTimeout(() => {
            localStorage.setItem(`step2_done_${objectiveId}`, '1');

            if (flow === 'manual' && calibratedPersonaId) {
                // Calibration succeeded → go straight to persona preview
                navigate(
                    `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-preview/${calibratedPersonaId}`,
                    { state: { fromLoader: true, flow } }
                );
            } else {
                // Omi flow OR manual calibration failed → go back to persona-builder list
                navigate(
                    `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`,
                    { state: { fromLoader: true, flow } }
                );
            }
        }, 2500);

        return () => clearTimeout(timer);
    }, [isComplete, workspaceId, objectiveId, navigate, flow, calibratedPersonaId]);

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="pgl-container">

            {/* Header */}
            <div className="pgl-header">
                <h1 className="pgl-heading">
                    {flow === "omi"
                        ? "Building from Signals to Simulated Choice"
                        : "From Traits to Behavioural Depth"}
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

                        <p className="pgl-step-label">
                            Step {currentStep + 1}/{steps.length}
                        </p>
                    </div>

                    <div className="pgl-card-right">
                        <h3 className="pgl-step-title">{activeStep.title}</h3>
                        <p className="pgl-step-desc">{activeStep.description}</p>

                        <ul className="pgl-checklist">
                            {activeStep.items.map((item, itemIdx) => {
                                // An item is visible once the previous item is done
                                // (first item is always visible)
                                const isVisible = itemIdx <= currentStepItemsDone;
                                if (!isVisible) return null;

                                // An item is done once globalCheckedCount has moved past it
                                const globalIndex = itemsBeforeCurrentStep + itemIdx;
                                const isDone = globalCheckedCount > globalIndex;

                                // The item currently in progress
                                const isActive = globalCheckedCount === globalIndex;

                                return (
                                    <li
                                        key={globalIndex}
                                        className={[
                                            "pgl-check-item",
                                            isDone  ? "pgl-check-item--done"   : "",
                                            isActive ? "pgl-check-item--active" : "",
                                        ].join(" ").trim()}
                                    >
                                        <div className="pgl-check-circle">
                                            <SpIcon
                                                name={isDone
                                                    ? "sp-Warning-Circle_Check"
                                                    : "sp-Interface-Radio_Unchecked"}
                                                className={isDone
                                                    ? "pgl-icon-done"
                                                    : "pgl-icon-default"}
                                            />
                                        </div>
                                        <span className="pgl-check-text">{item}</span>
                                    </li>
                                );
                            })}
                        </ul>

                        {/* Outcome appears once all items in this step are done */}
                        {currentStepItemsDone >= activeStep.items.length && activeStep.outcome && (
                            <p className="pgl-outcome">{activeStep.outcome}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Final message */}
            {isComplete && (
                <div className="pgl-final">
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
