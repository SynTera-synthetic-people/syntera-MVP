import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    TbSend, TbLoader, TbFileText, TbClock, TbPlus, TbTrash, TbX,
    TbBrain, TbSparkles,
} from 'react-icons/tb';
import { motion, AnimatePresence } from 'framer-motion';
import SpIcon from '../../../../SPIcon';
import {
    useCreateDRSession,
    useDRSessions,
    useDeleteDRSession,
    streamDRMessage,
    drKeys,
} from '../../../../../hooks/useDecisionRoom';
import { decisionRoomApi } from '../../../../../services/decisionRoomService';
import { useQueryClient } from '@tanstack/react-query';

// ── Types ─────────────────────────────────────────────────────────────────────

export type FlowType = 'qual' | 'quant';

interface DecisionRoomProps {
    workspaceId: string;
    objectiveId: string;
    flow: FlowType;
    onClose: () => void;
    isSidebarOpen: boolean;
    onSidebarOpen: () => void;
    onSidebarClose: () => void;
}

interface ChatMessage {
    sender: 'user' | 'analyst';
    text: string;
    timestamp: string;
    isThinking?: boolean;
    isStreaming?: boolean;
}

interface SessionSummary {
    id: string;
    title: string | null;
    flow: string;
    status: string;
    message_count: number;
    cost_usd_total: number;
    created_at: string | null;
    updated_at: string | null;
}

// ── Suggested prompts per flow ────────────────────────────────────────────────

const QUAL_PROMPTS = [
    'What are the top 3 recurring themes across all interviews?',
    'What unmet needs did participants express most strongly?',
    'Which interview insights should directly influence our next decision?',
    'Are there any contradictions between what participants said and did?',
];

const QUANT_PROMPTS = [
    'What does the data tell us about the most significant behavioral segments?',
    'Which survey responses show the strongest statistical signals?',
    'What are the key barriers to adoption based on the data?',
    'How do different personas compare on the top decision drivers?',
];

// ── Thinking phrases (mirrors AddResearchObjective) ────────────────────────────

const THINKING_PHRASES = [
    'Working on a response',
    'Thinking',
    'Analyzing your input',
    'Processing',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const groupSessionsByDate = (sessions: SessionSummary[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

    const todayGroup: { label: string; sessions: SessionSummary[] } = { label: 'Today', sessions: [] };
    const yestGroup: { label: string; sessions: SessionSummary[] } = { label: 'Yesterday', sessions: [] };
    const weekGroup: { label: string; sessions: SessionSummary[] } = { label: 'Previous 7 Days', sessions: [] };
    const olderGroup: { label: string; sessions: SessionSummary[] } = { label: 'Older', sessions: [] };

    for (const s of sessions) {
        const d = new Date(s.updated_at ?? s.created_at ?? '');
        const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        if (day >= today) todayGroup.sessions.push(s);
        else if (day >= yesterday) yestGroup.sessions.push(s);
        else if (day >= weekAgo) weekGroup.sessions.push(s);
        else olderGroup.sessions.push(s);
    }

    return [todayGroup, yestGroup, weekGroup, olderGroup].filter((g) => g.sessions.length > 0);
};

const messagesFromApi = (apiMessages: any[]): ChatMessage[] =>
    (apiMessages ?? []).map((m) => ({
        sender: m.role === 'user' ? 'user' : 'analyst' as 'user' | 'analyst',
        text: m.content,
        timestamp: m.created_at ?? new Date().toISOString(),
    }));

// ── Component ─────────────────────────────────────────────────────────────────

const DecisionRoom: React.FC<DecisionRoomProps> = ({
    workspaceId,
    objectiveId,
    flow,
    onClose,
    isSidebarOpen,
    onSidebarOpen,
    onSidebarClose,
}) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState<string>('');
    const [isChatActive, setIsChatActive] = useState<boolean>(false);
    const [isSending, setIsSending] = useState<boolean>(false);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

    // ── Thinking phrase cycling ────────────────────────────────────────────────
    const [thinkingPhraseIndex, setThinkingPhraseIndex] = useState(0);

    // Accumulate streamed text without triggering re-renders mid-stream
    const streamBufferRef = useRef<string>('');

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const queryClient = useQueryClient();
    const suggestedPrompts = flow === 'qual' ? QUAL_PROMPTS : QUANT_PROMPTS;

    // ── React Query hooks ──────────────────────────────────────────────────────

    const createSession = useCreateDRSession(workspaceId, objectiveId);
    const deleteSession = useDeleteDRSession(workspaceId, objectiveId);
    const { data: sessionList = [] } = useDRSessions(workspaceId, objectiveId, flow);

    // ── Smart auto-scroll ──────────────────────────────────────────────────────
    // Only scrolls to bottom when the user is already within 120 px of it,
    // so manual upward scrolling is never hijacked.
    const scrollToBottomIfNear = useCallback(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceFromBottom < 120) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        }
    }, []);

    // ── Effects ────────────────────────────────────────────────────────────────

    useEffect(() => {
        scrollToBottomIfNear();
    }, [messages, isSending, scrollToBottomIfNear]);

    useEffect(() => {
        if (!isChatActive) {
            handleStartSession();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!activeSessionId) return;
        const timer = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: drKeys.sessions(workspaceId, objectiveId, flow) });
        }, 8000);
        return () => clearTimeout(timer);
    }, [activeSessionId, workspaceId, objectiveId, flow, queryClient]);

    // ── Thinking phrase cycling — runs while isSending ────────────────────────
    useEffect(() => {
        if (!isSending) return;
        const interval = setInterval(() => {
            setThinkingPhraseIndex((i) => (i + 1) % THINKING_PHRASES.length);
        }, 2000);
        return () => clearInterval(interval);
    }, [isSending]);

    // ── Session management ─────────────────────────────────────────────────────

    const handleStartSession = useCallback(async () => {
        try {
            const res = await (createSession.mutateAsync as unknown as (v: string) => Promise<unknown>)(flow);
            const { session_id, greeting } = (res as any).data?.data ?? (res as any).data ?? {};
            setActiveSessionId(session_id ?? null);
            setMessages([{
                sender: 'analyst',
                text: greeting ?? 'Hi, I am your Strategy Partner for this exploration. I have read through the study and I am here to help you make sense of the signals, spot the opportunities, and decide what to do next.',
                timestamp: new Date().toISOString(),
            }]);
            setIsChatActive(true);
        } catch {
            setMessages([{
                sender: 'analyst',
                text: 'Hi, I am your Strategy Partner for this exploration. I have read through the study and I am here to help you make sense of the signals, spot the opportunities, and decide what to do next.',
                timestamp: new Date().toISOString(),
            }]);
            setIsChatActive(true);
        }
    }, [createSession, flow]);

    const handleNewSession = () => {
        setActiveSessionId(null);
        setMessages([]);
        setIsChatActive(false);
        handleStartSession();
    };

    const handleLoadThread = async (session: SessionSummary) => {
        try {
            const res = await queryClient.fetchQuery({
                queryKey: drKeys.session(workspaceId, objectiveId, session.id),
                queryFn: () => decisionRoomApi.getSession(workspaceId, objectiveId, session.id),
            });
            const detail = (res as any).data?.data ?? (res as any).data;
            setActiveSessionId(session.id);
            setMessages(messagesFromApi(detail?.messages ?? []));
            setIsChatActive(true);
        } catch {
            setActiveSessionId(session.id);
            setIsChatActive(true);
        }
        onSidebarClose();
    };

    const handleDeleteThread = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        try {
            await (deleteSession.mutateAsync as unknown as (v: string) => Promise<unknown>)(sessionId);
        } catch {
            // non-critical
        }
        if (activeSessionId === sessionId) {
            setMessages([]);
            setIsChatActive(false);
            setActiveSessionId(null);
        }
    };

    // ── Messaging (streaming under the hood, but shown all at once) ────────────
    //
    // The stream is still consumed in full — we just buffer deltas silently in
    // a ref instead of pushing each chunk to state.  Once `onDone` fires we
    // commit the complete text in a single setState call, so the message
    // appears instantly and fully formed rather than character-by-character.

    const sendToAnalyst = useCallback(async (text: string) => {
        if (!activeSessionId || isSending) return;

        const userMsg: ChatMessage = { sender: 'user', text, timestamp: new Date().toISOString() };
        setMessages((prev) => [...prev, userMsg]);
        setInputValue('');
        setIsSending(true);
        setThinkingPhraseIndex(0);

        // Reset the stream buffer
        streamBufferRef.current = '';

        await streamDRMessage(
            workspaceId,
            objectiveId,
            activeSessionId,
            text,
            {
                onDelta: (delta: string) => {
                    // Accumulate silently — no state update here
                    streamBufferRef.current += delta;
                },
                onDone: () => {
                    // Commit the full buffered response in one go
                    const fullText = streamBufferRef.current;
                    streamBufferRef.current = '';

                    setMessages((prev) => [
                        ...prev,
                        {
                            sender: 'analyst',
                            text: fullText,
                            timestamp: new Date().toISOString(),
                        },
                    ]);

                    queryClient.invalidateQueries({
                        queryKey: drKeys.sessions(workspaceId, objectiveId, flow),
                    });
                    setIsSending(false);
                },
                onError: (_err: string) => {
                    streamBufferRef.current = '';
                    setIsSending(false);
                },
            },
        );
    }, [activeSessionId, isSending, workspaceId, objectiveId, flow, queryClient]);

    const handleSend = () => {
        if (!inputValue.trim() || isSending) return;
        sendToAnalyst(inputValue.trim());
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSuggestedPrompt = (prompt: string) => {
        if (isSending) return;
        setInputValue(prompt);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    // ── Download ──────────────────────────────────────────────────────────────

    const handleDownload = () => {
        const content = messages
            .map((m) => `${m.sender === 'user' ? 'You' : 'Research Analyst'}: ${m.text}`)
            .join('\n\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `decision-room-${flow}-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Helpers ───────────────────────────────────────────────────────────────

    const formatTime = (ts: string) => {
        try {
            const d = new Date(ts);
            return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
        } catch { return ''; }
    };

    const formatThreadDate = (ts: string | null) => {
        if (!ts) return '';
        try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
        catch { return ''; }
    };

    const groupedSessions = groupSessionsByDate(sessionList as SessionSummary[]);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="cs-body">

            {/* Floating history toggle */}
            {!isSidebarOpen && (
                <button
                    className="cs-history-fab"
                    onClick={onSidebarOpen}
                    aria-label="Open history"
                    title="Open session history"
                >
                    <SpIcon name="sp-Menu-Hamburger_MD" size={16} />
                </button>
            )}

            {/* Left sidebar */}
            <aside className={`cs-sidebar ${isSidebarOpen ? 'cs-sidebar--open' : ''}`}>
                <div className="cs-sidebar__header">
                    <div className="cs-sidebar__header-top">
                        <span className="cs-sidebar__title">
                            <TbClock size={14} />
                            Sessions
                        </span>
                        <div className="cs-sidebar__header-actions">
                            <button className="cs-sidebar__new-btn" onClick={handleNewSession} title="New session">
                                <TbPlus size={15} />
                            </button>
                            <button className="cs-sidebar__close-btn" onClick={onSidebarClose} title="Close history">
                                <TbX size={14} />
                            </button>
                        </div>
                    </div>
                    <p className="cs-sidebar__filter-label">
                        Decision Room · <strong>{flow === 'qual' ? 'Qualitative' : 'Quantitative'}</strong>
                    </p>
                </div>

                <div className="cs-sidebar__threads">
                    {(sessionList as SessionSummary[]).length === 0 ? (
                        <div className="cs-sidebar__empty">
                            <TbBrain size={22} />
                            <span>No sessions yet</span>
                        </div>
                    ) : (
                        groupedSessions.map((group) => (
                            <div key={group.label} className="cs-sidebar__group">
                                <p className="cs-sidebar__group-label">{group.label}</p>
                                {group.sessions.map((session) => (
                                    <button
                                        key={session.id}
                                        className={`cs-thread-item ${activeSessionId === session.id ? 'cs-thread-item--active' : ''}`}
                                        onClick={() => handleLoadThread(session)}
                                    >
                                        <div className="cs-thread-item__avatar cs-thread-item__avatar--dr">
                                            <TbBrain size={14} />
                                        </div>
                                        <div className="cs-thread-item__content">
                                            <div className="cs-thread-item__top">
                                                <span className="cs-thread-item__name">
                                                    {session.title ?? 'Analysis Session'}
                                                </span>
                                                <span className="cs-thread-item__date">
                                                    {formatThreadDate(session.updated_at ?? session.created_at)}
                                                </span>
                                            </div>
                                            <p className="cs-thread-item__preview">
                                                {session.message_count} message{session.message_count !== 1 ? 's' : ''}
                                            </p>
                                        </div>
                                        <button
                                            className="cs-thread-item__delete"
                                            onClick={(e) => handleDeleteThread(e, session.id)}
                                            title="Delete session"
                                        >
                                            <TbTrash size={13} />
                                        </button>
                                    </button>
                                ))}
                            </div>
                        ))
                    )}
                </div>
            </aside>

            {/* Main content */}
            <div className="cs-main">

                {/* Header strip */}
                <div className="cs-dr-header">
                    <div className="cs-dr-header__left" />
                    <button className="cs-dr-header__new-btn" onClick={handleNewSession} title="Start new session">
                        <TbPlus size={14} />
                        New Session
                    </button>
                </div>

                {/* Chat area */}
                <div className="cs-chat">
                    <div ref={messagesContainerRef} className="cs-messages cs-messages--dr">

                        {messages.map((msg, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                className={`cs-bubble-row ${msg.sender === 'user' ? 'cs-bubble-row--user' : ''}`}
                            >
                                {msg.sender === 'analyst' && (
                                    <div className="cs-bubble-avatar cs-bubble-avatar--dr">
                                        <TbBrain size={16} />
                                    </div>
                                )}

                                <div className="cs-bubble-col">
                                    <div
                                        className={`cs-bubble ${msg.sender === 'user' ? 'cs-bubble--user' : 'cs-bubble--analyst'}`}
                                    >
                                        {msg.text.split('\n').map((line, li) => (
                                            <React.Fragment key={li}>
                                                {line}
                                                {li < msg.text.split('\n').length - 1 && <br />}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                    <div className={`cs-bubble-meta ${msg.sender === 'user' ? 'cs-bubble-meta--user' : ''}`}>
                                        {msg.sender === 'analyst' ? 'Research Analyst' : 'You'} • {formatTime(msg.timestamp)}
                                    </div>
                                </div>

                                {msg.sender === 'user' && (
                                    <div className="cs-bubble-avatar cs-bubble-avatar--user" />
                                )}
                            </motion.div>
                        ))}

                        {/* ── Thinking indicator — shown while streaming ── */}
                        <AnimatePresence>
                            {isSending && (
                                <motion.div
                                    key="dr-thinking"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 4 }}
                                    transition={{ duration: 0.2 }}
                                    className="cs-bubble-row"
                                >
                                    <div className="cs-bubble-avatar cs-bubble-avatar--dr cs-bubble-avatar--thinking">
                                        <TbBrain size={16} />
                                    </div>
                                    <div className="cs-bubble-col">
                                        <div className="cs-bubble cs-bubble--analyst cs-bubble--thinking-indicator">
                                            <AnimatePresence mode="wait">
                                                <motion.span
                                                    key={thinkingPhraseIndex}
                                                    initial={{ opacity: 0, y: 4 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -4 }}
                                                    transition={{ duration: 0.25 }}
                                                    className="cs-thinking-phrase"
                                                >
                                                    {THINKING_PHRASES[thinkingPhraseIndex]}
                                                </motion.span>
                                            </AnimatePresence>
                                            <span className="cs-thinking-dots">
                                                <span /><span /><span />
                                            </span>
                                        </div>
                                        <div className="cs-bubble-meta">Research Analyst</div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                    </div>

                    {/* Suggested prompts */}
                    {isChatActive && messages.filter((m) => m.sender === 'user').length === 0 && !isSending && inputValue.trim() === '' && (
                        <div className="cs-dr-suggestions">
                            <p className="cs-dr-suggestions__label">
                                <TbSparkles size={13} />
                                Suggested questions
                            </p>
                            <div className="cs-dr-suggestions__list">
                                {suggestedPrompts.map((prompt, i) => (
                                    <button
                                        key={i}
                                        className="cs-dr-suggestion-chip"
                                        onClick={() => handleSuggestedPrompt(prompt)}
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Input */}
                    <div className="cs-input-area">
                        <div className="cs-input-row">
                            <div className="cs-input-wrap">
                                <textarea
                                    ref={inputRef}
                                    className="cs-input"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    rows={1}
                                    autoFocus
                                    placeholder="Ask your Research Analyst anything about the findings…"
                                    disabled={isSending}
                                />
                            </div>
                            <button
                                className="cs-send-btn cs-send-btn--dr"
                                onClick={handleSend}
                                disabled={!inputValue.trim() || isSending}
                            >
                                {isSending
                                    ? <TbLoader size={18} className="cs-send-btn__spinner" />
                                    : <TbSend size={18} />
                                }
                            </button>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="cs-footer">
                        <button className="cs-footer__download" onClick={handleDownload}>
                            <TbFileText size={16} />
                            Download this Session
                        </button>
                        <button className="cs-footer__end" onClick={onClose}>
                            End Exploration
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DecisionRoom;