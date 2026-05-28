import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePersonaBuilder } from '../../../../../../hooks/usePersonaBuilder';
import { useStartInterview } from '../../../../../../hooks/useInterview';
import { useOmniWorkflow } from '../../../../../../hooks/useOmiWorkflow';
import OmiKeyboard from '../../../../../../assets/Omi Animations/OmiKeyboard.mp4';
import PersonaDynamicAvatar from './PersonaDynamicAvatar';
import { getAvatarConfig } from './PersonaAvatarUtils';
import './RunningInterviews.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Persona {
    id: string;
    name?: string;
    image?: string;
    gender?: string;
    sex?: string;
    occupation?: string;
    age?: number | string;
    description?: string;
    bio?: string;
    demographics?: string;
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

const PersonaAvatar: React.FC<PersonaAvatarProps> = ({ persona, index, isActive }) => {
    const config = getAvatarConfig(persona as Record<string, unknown>);
    const accent = config.ringColor;

    // Truncate name to first name only, max 8 chars
    const firstName = (persona.name ?? '').split(' ')[0]?.slice(0, 8) ?? '';

    return (
        <motion.div
            className={`ri-persona-avatar ${isActive ? 'ri-persona-avatar--active' : ''}`}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.08, duration: 0.4, ease: 'easeOut' }}
        >
            {/* Ring wrapper */}
            <div
                className="ri-persona-ring"
                style={{
                    borderColor: accent,
                    boxShadow: isActive
                        ? `0 0 0 3px ${accent}50, 0 0 20px ${accent}60`
                        : `0 0 10px ${accent}50`,
                }}
            >
                {isActive && (
                    <>
                        <div className="ri-persona-ring__pulse ri-persona-ring__pulse--outermost" style={{ borderColor: `${accent}25` }} />
                        <div className="ri-persona-ring__pulse ri-persona-ring__pulse--outer"    style={{ borderColor: `${accent}80` }} />
                        <div className="ri-persona-ring__pulse ri-persona-ring__pulse--inner"    style={{ borderColor: `${accent}50` }} />
                    </>
                )}

                {/* Avatar image or dynamic silhouette */}
                {persona.image ? (
                    <div className="ri-persona-circle">
                        <img src={persona.image} alt={persona.name ?? 'Persona'} className="ri-persona-img" />
                    </div>
                ) : (
                    <PersonaDynamicAvatar
                        persona={persona as Record<string, unknown>}
                        size={86}
                        className="ri-persona-circle"
                    />
                )}
            </div>

            {/* Name label — OUTSIDE the ring, below it */}
            {firstName && (
                <p className="ri-persona-name">{firstName}</p>
            )}
        </motion.div>
    );
};

// ── Component ─────────────────────────────────────────────────────────────────

const RunningInterviews: React.FC = () => {
    const navigate = useNavigate();
    const { workspaceId, objectiveId } = useParams<{
        workspaceId: string;
        objectiveId: string;
    }>();
    const { trigger } = useOmniWorkflow();

    const { personas: fetchedPersonas } = usePersonaBuilder(workspaceId, objectiveId);
    const personas: Persona[] = (fetchedPersonas?.data ?? []) as Persona[];

    const startInterviewMutation = useStartInterview(workspaceId, objectiveId);

    const [currentStep, setCurrentStep] = useState<number>(0);
    const [done, setDone] = useState<boolean>(false);
    const [activePersonaIndex, setActivePersonaIndex] = useState<number>(0);

    const ringProgress = ((currentStep + 1) / TOTAL_STEPS) * 100;

    const runInterviewsInBackground = useCallback(async () => {
        if (!personas.length || !objectiveId) return;
        trigger({ stage: 'qualitative_exploration', event: 'INTERVIEWS_STARTED', payload: {} });
        for (const persona of personas) {
            try {
                await startInterviewMutation.mutateAsync({ personaId: persona.id });
            } catch (err) {
                console.error(`Interview failed for persona ${persona.id}:`, err);
            }
        }
    }, [personas, objectiveId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (personas.length > 0) runInterviewsInBackground();
    }, [personas.length]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (done) return;
        const timer = setTimeout(() => {
            if (currentStep < TOTAL_STEPS - 1) {
                setCurrentStep((s) => s + 1);
                setActivePersonaIndex((i) => (i + 1) % Math.max(personas.length, 1));
            } else {
                setDone(true);
                setTimeout(() => {
                    if (objectiveId) localStorage.setItem(`qualitative_sub2_${objectiveId}`, '1');
                    trigger({ stage: 'qualitative_exploration', event: 'INTERVIEWS_COMPLETE', payload: {} });
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

    return (
        <div className="ri-page">

            <div className="ri-header">
                <h1 className="ri-title">Running Interviews</h1>
                <p className="ri-subtitle">
                    Your personas are actively participating in qualitative interviews.
                    Each persona is responding based on their unique behavioral patterns
                    and psychographic profiles.
                </p>
            </div>

            <div className={`ri-persona-grid ${personas.length <= 2 ? 'ri-persona-grid--few' : ''}`}>
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
                    Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="ri-persona-avatar ri-persona-avatar--skeleton" />
                    ))
                )}
            </div>

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

            <div className="ri-loader-card">
                <div className="ri-loader-card__left">
                    <div className="ri-ring-wrapper">
                        <RingProgress progress={ringProgress} />
                        <div className="ri-omi">
                            <video className="ri-omi__video" src={OmiKeyboard} autoPlay loop muted playsInline />
                        </div>
                    </div>
                    <p className="ri-step-label">Step {currentStep + 1}/{TOTAL_STEPS}</p>
                </div>
                <div className="ri-loader-card__divider" />
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