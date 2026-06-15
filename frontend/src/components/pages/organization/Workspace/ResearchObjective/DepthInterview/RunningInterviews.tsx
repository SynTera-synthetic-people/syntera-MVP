import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { usePersonaBuilder } from '../../../../../../hooks/usePersonaBuilder';
import { useOmniWorkflow } from '../../../../../../hooks/useOmiWorkflow';
import { interviewService } from '../../../../../../services/interviewService';
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

type InterviewStatus = 'pending' | 'active' | 'done' | 'failed';

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
    status: InterviewStatus;
}

const PersonaAvatar: React.FC<PersonaAvatarProps> = ({ persona, index, status }) => {
    const isActive = status === 'active';
    const config = getAvatarConfig(persona as Record<string, unknown>);
    const accent = config.ringColor;
    const firstName = (persona.name ?? '').split(' ')[0]?.slice(0, 8) ?? '';

    const ringColor =
        status === 'done'   ? '#06A17B' :
        status === 'failed' ? '#ef4444' :
        accent;

    const ringBoxShadow =
        isActive            ? `0 0 0 3px ${accent}50, 0 0 20px ${accent}60` :
        status === 'done'   ? '0 0 12px rgba(6,161,123,0.45)' :
        status === 'failed' ? '0 0 10px rgba(239,68,68,0.35)' :
        `0 0 6px ${accent}20`;

    return (
        <motion.div
            className={`ri-persona-avatar ${isActive ? 'ri-persona-avatar--active' : ''}`}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.08, duration: 0.4, ease: 'easeOut' }}
        >
            <div
                className="ri-persona-ring"
                style={{
                    borderColor: ringColor,
                    boxShadow: ringBoxShadow,
                    opacity: status === 'pending' ? 0.4 : 1,
                    transition: 'border-color 0.4s, box-shadow 0.4s, opacity 0.4s',
                }}
            >
                {isActive && (
                    <>
                        <div className="ri-persona-ring__pulse ri-persona-ring__pulse--outermost" style={{ borderColor: `${accent}25` }} />
                        <div className="ri-persona-ring__pulse ri-persona-ring__pulse--outer"    style={{ borderColor: `${accent}80` }} />
                        <div className="ri-persona-ring__pulse ri-persona-ring__pulse--inner"    style={{ borderColor: `${accent}50` }} />
                    </>
                )}

                {/* Status badge — top-right of ring */}
                {(status === 'done' || status === 'failed') && (
                    <div className={`ri-status-badge ri-status-badge--${status}`}>
                        {status === 'done' ? '✓' : '✗'}
                    </div>
                )}

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

    // Per-persona status: 'pending' → 'active' → 'done' | 'failed'
    const [statuses, setStatuses] = useState<InterviewStatus[]>([]);
    const [interviewsDone, setInterviewsDone] = useState(false);
    const [failedCount, setFailedCount] = useState(0);

    const total = personas.length || 1;
    const completedCount = statuses.filter(s => s === 'done' || s === 'failed').length;
    const ringProgress = (completedCount / total) * 100;
    const allFailed = interviewsDone && statuses.length > 0 && statuses.every(s => s === 'failed');
    const partialFail = interviewsDone && failedCount > 0 && !allFailed;

    const runInterviews = useCallback(async () => {
        if (!personas.length || !workspaceId || !objectiveId) {
            setInterviewsDone(true);
            return;
        }
        // All interviews fire simultaneously — all statuses start as 'active'
        setStatuses(personas.map(() => 'active' as InterviewStatus));
        trigger({ stage: 'qualitative_exploration', event: 'INTERVIEWS_STARTED', payload: {} });

        const results = await Promise.allSettled(
            personas.map((persona, i) =>
                interviewService
                    .startInterview(workspaceId, objectiveId, persona.id)
                    .then((res: unknown) => {
                        setStatuses(prev => { const n = [...prev]; n[i] = 'done'; return n; });
                        return res;
                    })
                    .catch((err: unknown) => {
                        setStatuses(prev => { const n = [...prev]; n[i] = 'failed'; return n; });
                        console.error(`Interview failed for persona ${persona.id}:`, err);
                        throw err;
                    })
            )
        );

        const failed = results.filter(r => r.status === 'rejected').length;
        setFailedCount(failed);
        setInterviewsDone(true);
    }, [personas, workspaceId, objectiveId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (personas.length > 0) runInterviews();
    }, [personas.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // Navigate when done. Partial failures show a 3s warning before navigating.
    useEffect(() => {
        if (!interviewsDone || allFailed) return;
        if (objectiveId) localStorage.setItem(`qualitative_sub2_${objectiveId}`, '1');
        trigger({ stage: 'qualitative_exploration', event: 'INTERVIEWS_COMPLETE', payload: {} });
        const delay = partialFail ? 3000 : 500;
        const timer = setTimeout(() => {
            navigate(
                `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/chatview`,
                { state: { interviewsDone: true, failedCount } }
            );
        }, delay);
        return () => clearTimeout(timer);
    }, [interviewsDone, allFailed, partialFail]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── All failed — error screen ─────────────────────────────────────────────

    if (allFailed) {
        return (
            <div className="ri-page" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: '1.5rem' }}>
                <h1 className="ri-title">Interview Generation Failed</h1>
                <p className="ri-subtitle" style={{ color: '#f87171' }}>
                    All interviews failed to run. This may be a temporary server issue.
                    Please go back and try again.
                </p>
                <button
                    onClick={() => navigate(-1)}
                    style={{ marginTop: '1rem', padding: '0.75rem 2rem', borderRadius: '8px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
                >
                    ← Go Back &amp; Retry
                </button>
            </div>
        );
    }

    // ── Normal / partial-fail screen ──────────────────────────────────────────

    return (
        <div className="ri-page">

            <AnimatePresence>
                {partialFail && (
                    <motion.div
                        className="ri-warning-banner"
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        ⚠ {failedCount} of {personas.length} interview{failedCount !== 1 ? 's' : ''} failed — continuing with successful results.
                    </motion.div>
                )}
            </AnimatePresence>

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
                            status={statuses[index] ?? 'pending'}
                        />
                    ))
                ) : (
                    Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="ri-persona-avatar ri-persona-avatar--skeleton" />
                    ))
                )}
            </div>

            <motion.p
                key={completedCount}
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
                    <p className="ri-step-label">
                        {completedCount}/{personas.length} done
                    </p>
                </div>
                <div className="ri-loader-card__divider" />
                <div className="ri-loader-card__right">
                    <AnimatePresence mode="wait">
                        <motion.p
                            key={interviewsDone ? 'done' : completedCount}
                            className="ri-step-text"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.3 }}
                        >
                            {interviewsDone
                                ? partialFail
                                    ? `${failedCount} interview${failedCount !== 1 ? 's' : ''} failed — navigating with successful results...`
                                    : 'All interviews complete. Navigating...'
                                : `${completedCount} of ${personas.length} interviews complete`}
                        </motion.p>
                    </AnimatePresence>
                </div>
            </div>

        </div>
    );
};

export default RunningInterviews;
