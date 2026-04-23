import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePersonaBuilder } from '../../../../../../hooks/usePersonaBuilder';
import { useStartInterview } from '../../../../../../hooks/useInterview';
import { useOmniWorkflow } from '../../../../../../hooks/useOmiWorkflow';
import OmiKeyboard from '../../../../../../assets/Omi Animations/OmiKeyboard.mp4';
import DefaultAvatar from '../../../../../../assets/Avatar/Avatar6.png';
import './RunningInterviews.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Persona {
    id: string;
    name?: string;
    image?: string;
    occupation?: string;
    [key: string]: unknown;
}

interface InterviewLoaderStep {
    label: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LOADER_STEPS: InterviewLoaderStep[] = [
    { label: 'Initiating Interviews...' },
    { label: 'Capturing Responses...' },
    { label: 'Probing Behavioral Depth...' },
    { label: 'Resolving Contradictions...' },
    { label: 'Structuring Transcripts...' },
];

const TOTAL_STEPS = LOADER_STEPS.length;
// Each step holds for this duration before advancing.
// We space the visual animation so it feels proportional to actual
// backend processing time. Total visible duration ≈ 25s which gives the
// sequential startInterview calls time to complete in the background.
const STEP_MS = 5_000;
const RING_RADIUS = 54;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

// ── Ring SVG ──────────────────────────────────────────────────────────────────

const RingProgress: React.FC<{ progress: number }> = ({ progress }) => {
    const offset = RING_CIRC - (progress / 100) * RING_CIRC;
    return (
        <svg className="ri-ring-svg" viewBox="0 0 120 120">
            <circle className="ri-ring-track" cx="60" cy="60" r={RING_RADIUS} />
            <circle
                className="ri-ring-progress"
                cx="60" cy="60" r={RING_RADIUS}
                strokeDasharray={RING_CIRC}
                strokeDashoffset={offset}
            />
        </svg>
    );
};

// ── Persona Avatar ────────────────────────────────────────────────────────────

interface PersonaAvatarProps {
    persona: Persona;
    index: number;
    isActive: boolean;
}

const PersonaAvatar: React.FC<PersonaAvatarProps> = ({ persona, index, isActive }) => (
    <motion.div
        className={`ri-persona-avatar ${isActive ? 'ri-persona-avatar--active' : ''}`}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.08, duration: 0.4, ease: 'easeOut' }}
    >
        {/* Pulsing green ring */}
        <div className="ri-persona-ring">
            {isActive && (
                <>
                    <div className="ri-persona-ring__pulse ri-persona-ring__pulse--outer" />
                    <div className="ri-persona-ring__pulse ri-persona-ring__pulse--inner" />
                </>
            )}
            {/* Avatar circle */}
            <div className="ri-persona-circle">
                <img
                    src={persona.image || DefaultAvatar}
                    alt={persona.name ?? 'Persona'}
                    className="ri-persona-img"
                />
            </div>
        </div>
    </motion.div>
);

// ── Component ─────────────────────────────────────────────────────────────────

const RunningInterviews: React.FC = () => {
    const navigate = useNavigate();
    const { workspaceId, objectiveId } = useParams<{
        workspaceId: string;
        objectiveId: string;
    }>();
    const { trigger } = useOmniWorkflow();

    // ── Data ──────────────────────────────────────────────────────────────────

    const { personas: fetchedPersonas } = usePersonaBuilder(workspaceId, objectiveId);
    const personas: Persona[] = (fetchedPersonas?.data ?? []) as Persona[];

    // We create a single startInterview mutation — we'll call it sequentially
    // once per persona in the background while the visual loader plays.
    const startInterviewMutation = useStartInterview(workspaceId, objectiveId);

    // ── Loader state ──────────────────────────────────────────────────────────

    const [currentStep, setCurrentStep] = useState<number>(0);
    const [done, setDone] = useState<boolean>(false);
    const [activePersonaIndex, setActivePersonaIndex] = useState<number>(0);

    const ringProgress = ((currentStep + 1) / TOTAL_STEPS) * 100;

    // ── Background: kick off interviews for all personas sequentially ─────────
    // We fire these calls as soon as the component mounts. The UI animation
    // runs independently — it doesn't wait for these to resolve. This mirrors
    // how the DiscussionGuideLoader fires `generateGuide()` fire-and-forget.

    const runInterviewsInBackground = useCallback(async () => {
        if (!personas.length || !objectiveId) return;
        trigger({
            stage: 'qualitative_exploration',
            event: 'INTERVIEWS_STARTED',
            payload: {},
        });
        for (const persona of personas) {
            try {
                await startInterviewMutation.mutateAsync(persona.id);
            } catch (err) {
                // Individual failures are non-fatal — the visual loader continues.
                // The InsightGeneration page will handle cases where some interviews
                // are missing when the user tries to generate outputs.
                console.error(`Interview failed for persona ${persona.id}:`, err);
            }
        }
    }, [personas, objectiveId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Kick off background interviews once personas are loaded
    useEffect(() => {
        if (personas.length > 0) {
            runInterviewsInBackground();
        }
    }, [personas.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Visual loader: auto-advance through 5 steps ───────────────────────────

    useEffect(() => {
        if (done) return;

        const timer = setTimeout(() => {
            if (currentStep < TOTAL_STEPS - 1) {
                setCurrentStep((s) => s + 1);
                // Cycle active persona highlight with each step
                setActivePersonaIndex((i) => (i + 1) % Math.max(personas.length, 1));
            } else {
                setDone(true);
                setTimeout(() => {
                    // Mark sub-step 2 (In-depth Interviews) as complete
                    if (objectiveId) {
                        localStorage.setItem(`qualitative_sub2_${objectiveId}`, '1');
                    }
                    trigger({
                        stage: 'qualitative_exploration',
                        event: 'INTERVIEWS_COMPLETE',
                        payload: {},
                    });
                    // Navigate to the "Interviews Completed" state — same route, different
                    // view driven by the parent (ChatView replacement). We pass state so
                    // the receiving component knows to show the "Generate Insights" screen.
                    navigate(
                        `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/chatview`,
                        { state: { interviewsDone: true } }
                    );
                }, 1_200);
            }
        }, STEP_MS);

        return () => clearTimeout(timer);
    }, [currentStep, done, personas.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const step = LOADER_STEPS[currentStep]!;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="ri-page">

            {/* ── Header ── */}
            <div className="ri-header">
                <h1 className="ri-title">Running Interviews</h1>
                <p className="ri-subtitle">
                    Your personas are actively participating in qualitative interviews.
                    Each persona is responding based on their unique behavioral patterns
                    and psychographic profiles.
                </p>
            </div>

            {/* ── Persona Grid ── */}
            <div className="ri-persona-grid">
                {personas.length > 0 ? (
                    personas.map((persona, index) => (
                        <PersonaAvatar
                            key={persona.id}
                            persona={persona}
                            index={index}
                            isActive={index === activePersonaIndex}
                        />
                    ))
                ) : (
                    // Skeleton placeholders while personas load
                    Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="ri-persona-avatar ri-persona-avatar--skeleton" />
                    ))
                )}
            </div>

            {/* ── Statement ── */}
            <motion.p
                key={currentStep}
                className="ri-statement"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
            >
                I am conducting structured conversations with the personas
                to uncover real decision behaviour.
            </motion.p>

            {/* ── Step Card ── */}
            <div className="ri-loader-card">

                {/* Left: Omi + ring + step label */}
                <div className="ri-loader-card__left">
                    <div className="ri-ring-wrapper">
                        <RingProgress progress={ringProgress} />
                        <div className="ri-omi">
                            <video
                                className="ri-omi__video"
                                src={OmiKeyboard}
                                autoPlay
                                loop
                                muted
                                playsInline
                            />
                        </div>
                    </div>
                    <p className="ri-step-label">Step {currentStep + 1}/{TOTAL_STEPS}</p>
                </div>

                {/* Divider */}
                <div className="ri-loader-card__divider" />

                {/* Right: current step label */}
                <div className="ri-loader-card__right">
                    <AnimatePresence mode="wait">
                        <motion.p
                            key={currentStep}
                            className="ri-step-text"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.3 }}
                        >
                            {step.label}
                        </motion.p>
                    </AnimatePresence>
                </div>

            </div>

        </div>
    );
};

export default RunningInterviews;