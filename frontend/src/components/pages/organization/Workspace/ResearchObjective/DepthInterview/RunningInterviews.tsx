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

// ── Constants ─────────────────────────────────────────────────────────────────

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

    // currentPersonaIndex: which persona is currently being interviewed (set before each API call)
    // completedCount: how many personas have finished (success or fail), set after each API call
    const [currentPersonaIndex, setCurrentPersonaIndex] = useState<number>(0);
    const [completedCount, setCompletedCount] = useState<number>(0);
    const [interviewsComplete, setInterviewsComplete] = useState<boolean>(false);
    const [interviewError, setInterviewError] = useState<boolean>(false);

    const total = personas.length || 1;
    const ringProgress = (completedCount / total) * 100;
    const currentPersona = personas[currentPersonaIndex];

    const runInterviews = useCallback(async () => {
        if (!personas.length || !objectiveId) {
            setInterviewsComplete(true);
            return;
        }
        trigger({ stage: 'qualitative_exploration', event: 'INTERVIEWS_STARTED', payload: {} });
        let successCount = 0;
        for (let i = 0; i < personas.length; i++) {
            setCurrentPersonaIndex(i);
            try {
                await startInterviewMutation.mutateAsync({ personaId: personas[i].id });
                successCount++;
            } catch (err) {
                console.error(`Interview failed for persona ${personas[i].id}:`, err);
            }
            setCompletedCount(i + 1);
        }
        if (successCount === 0) setInterviewError(true);
        setInterviewsComplete(true);
    }, [personas, objectiveId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (personas.length > 0) runInterviews();
    }, [personas.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Navigate once all API calls are done (and at least one succeeded).
    useEffect(() => {
        if (!interviewsComplete || interviewError) return;
        if (objectiveId) localStorage.setItem(`qualitative_sub2_${objectiveId}`, '1');
        trigger({ stage: 'qualitative_exploration', event: 'INTERVIEWS_COMPLETE', payload: {} });
        navigate(
            `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/chatview`,
            { state: { interviewsDone: true } }
        );
    }, [interviewsComplete, interviewError]); // eslint-disable-line react-hooks/exhaustive-deps

    if (interviewError) {
        return (
            <div className="ri-page" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: '1.5rem' }}>
                <h1 className="ri-title">Interview Generation Failed</h1>
                <p className="ri-subtitle" style={{ color: '#f87171' }}>
                    All interviews failed to run. This may be a temporary server issue.
                    Please go back and try starting the interviews again.
                </p>
                <button
                    className="ri-retry-btn"
                    onClick={() => navigate(-1)}
                    style={{ marginTop: '1rem', padding: '0.75rem 2rem', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
                >
                    ← Go Back &amp; Retry
                </button>
            </div>
        );
    }

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
                            isActive={index === currentPersonaIndex}
                        />
                    ))
                ) : (
                    Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="ri-persona-avatar ri-persona-avatar--skeleton" />
                    ))
                )}
            </div>

            <motion.p
                key={currentPersonaIndex}
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
                    <p className="ri-step-label">Step {currentPersonaIndex + 1}/{personas.length || 1}</p>
                </div>
                <div className="ri-loader-card__divider" />
                <div className="ri-loader-card__right">
                    <AnimatePresence mode="wait">
                        <motion.p
                            key={currentPersonaIndex}
                            className="ri-step-text"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.3 }}
                        >
                            {currentPersona ? `Interviewing ${currentPersona.name ?? 'Persona'}...` : 'Initializing interviews...'}
                        </motion.p>
                    </AnimatePresence>
                </div>
            </div>

        </div>
    );
};

export default RunningInterviews;