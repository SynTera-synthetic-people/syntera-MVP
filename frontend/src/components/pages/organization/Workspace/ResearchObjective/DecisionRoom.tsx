import React, { useState, useEffect, useRef } from 'react';
import {
  TbSend, TbLoader, TbFileText, TbClock, TbPlus, TbTrash, TbX,
  TbBrain, TbSparkles,
} from 'react-icons/tb';
import { motion, AnimatePresence } from 'framer-motion';
import SpIcon from '../../../../SPIcon';

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
}

interface DecisionThread {
  id: string;
  title: string;
  preview: string;
  startedAt: string;
  messages: ChatMessage[];
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const groupThreadsByDate = (threads: DecisionThread[]) => {
  const now       = new Date();
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo   = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const todayGroup: { label: string; threads: DecisionThread[] } = { label: 'Today',           threads: [] };
  const yestGroup:  { label: string; threads: DecisionThread[] } = { label: 'Yesterday',       threads: [] };
  const weekGroup:  { label: string; threads: DecisionThread[] } = { label: 'Previous 7 Days', threads: [] };
  const olderGroup: { label: string; threads: DecisionThread[] } = { label: 'Older',           threads: [] };

  threads.forEach((t) => {
    const d   = new Date(t.startedAt);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day >= today)          todayGroup.threads.push(t);
    else if (day >= yesterday) yestGroup.threads.push(t);
    else if (day >= weekAgo)   weekGroup.threads.push(t);
    else                       olderGroup.threads.push(t);
  });

  return [todayGroup, yestGroup, weekGroup, olderGroup].filter((g) => g.threads.length > 0);
};

const generateThreadId = () => `dr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

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
  const [threads,        setThreads]        = useState<DecisionThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages,       setMessages]       = useState<ChatMessage[]>([]);
  const [inputValue,     setInputValue]     = useState<string>('');
  const [isChatActive,   setIsChatActive]   = useState<boolean>(false);
  const [isSending,      setIsSending]      = useState<boolean>(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const suggestedPrompts = flow === 'qual' ? QUAL_PROMPTS : QUANT_PROMPTS;

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-start a session when the Decision Room mounts (no persona selection needed)
  useEffect(() => {
    if (!isChatActive) {
      handleStartSession();
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Session management ────────────────────────────────────────────────────

  const handleStartSession = () => {
    const greeting: ChatMessage = {
      sender:    'analyst',
      text:      'Hi, I am your Strategy Partner for this exploration. I have read through the study and I am here to help you make sense of the signals, spot the opportunities, and decide what to do next.',
      timestamp: new Date().toISOString(),
    };

    const threadId = generateThreadId();
    const newThread: DecisionThread = {
      id:        threadId,
      title:     `Analysis Session`,
      preview:   greeting.text.slice(0, 60),
      startedAt: new Date().toISOString(),
      messages:  [greeting],
    };

    setThreads((prev) => [newThread, ...prev]);
    setActiveThreadId(threadId);
    setMessages([greeting]);
    setIsChatActive(true);
  };

  const handleNewSession = () => {
    handleStartSession();
  };

  const handleLoadThread = (thread: DecisionThread) => {
    setActiveThreadId(thread.id);
    setMessages(thread.messages);
    setIsChatActive(true);
  };

  const handleDeleteThread = (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (activeThreadId === threadId) {
      setMessages([]);
      setIsChatActive(false);
      setActiveThreadId(null);
    }
  };

  // ── Messaging ─────────────────────────────────────────────────────────────

  const sendToAnalyst = (text: string) => {
    const userMsg: ChatMessage = { sender: 'user', text, timestamp: new Date().toISOString() };

    // Append user message and clear input immediately
    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsSending(true);

    // Update thread preview in sidebar
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThreadId
          ? { ...t, preview: text.slice(0, 60), messages: [...t.messages, userMsg] }
          : t
      )
    );

    // TODO: wire up backend call here — response handling is owned by the backend team.
    // The backend should resolve to a ChatMessage with sender: 'analyst' and append it via setMessages.
    setIsSending(false);
  };

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
    // Feed into input box so user can review/edit before sending
    setInputValue(prompt);
    // Focus the textarea so user can continue typing or just hit Enter
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // ── Download ──────────────────────────────────────────────────────────────

  const handleDownload = () => {
    const content = messages
      .map((m) => `${m.sender === 'user' ? 'You' : 'Research Analyst'}: ${m.text}`)
      .join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
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

  const formatThreadDate = (ts: string) => {
    try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
    catch { return ''; }
  };

  const groupedThreads = groupThreadsByDate(threads);

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

      {/* Left sidebar — Decision Room sessions */}
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
          {threads.length === 0 ? (
            <div className="cs-sidebar__empty">
              <TbBrain size={22} />
              <span>No sessions yet</span>
            </div>
          ) : (
            groupedThreads.map((group) => (
              <div key={group.label} className="cs-sidebar__group">
                <p className="cs-sidebar__group-label">{group.label}</p>
                {group.threads.map((thread) => (
                  <button
                    key={thread.id}
                    className={`cs-thread-item ${activeThreadId === thread.id ? 'cs-thread-item--active' : ''}`}
                    onClick={() => handleLoadThread(thread)}
                  >
                    <div className="cs-thread-item__avatar cs-thread-item__avatar--dr">
                      <TbBrain size={14} />
                    </div>
                    <div className="cs-thread-item__content">
                      <div className="cs-thread-item__top">
                        <span className="cs-thread-item__name">{thread.title}</span>
                        <span className="cs-thread-item__date">{formatThreadDate(thread.startedAt)}</span>
                      </div>
                      <p className="cs-thread-item__preview">{thread.preview}…</p>
                    </div>
                    <button
                      className="cs-thread-item__delete"
                      onClick={(e) => handleDeleteThread(e, thread.id)}
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

        {/* Decision Room header strip — flow tag removed */}
        <div className="cs-dr-header">
          <div className="cs-dr-header__left">
          </div>
          <button className="cs-dr-header__new-btn" onClick={handleNewSession} title="Start new session">
            <TbPlus size={14} />
            New Session
          </button>
        </div>

        {/* Chat area */}
        <div className="cs-chat">
          <div className="cs-messages cs-messages--dr">

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`cs-bubble-row ${msg.sender === 'user' ? 'cs-bubble-row--user' : ''}`}
              >
                {msg.sender === 'analyst' && (
                  <div className="cs-bubble-avatar cs-bubble-avatar--dr">
                    <TbBrain size={16} />
                  </div>
                )}

                <div className="cs-bubble-col">
                  <div
                    className={`cs-bubble ${
                      msg.sender === 'user' ? 'cs-bubble--user' : 'cs-bubble--analyst'
                    } ${msg.isThinking ? 'cs-bubble--thinking' : ''}`}
                  >
                    {msg.isThinking ? (
                      <div className="cs-bubble__thinking">
                        <TbLoader size={14} className="cs-bubble__thinking-spinner" />
                        <span>{msg.text}</span>
                      </div>
                    ) : (
                      /* Render newlines from analyst replies */
                      msg.text.split('\n').map((line, li) => (
                        <React.Fragment key={li}>
                          {line}
                          {li < msg.text.split('\n').length - 1 && <br />}
                        </React.Fragment>
                      ))
                    )}
                  </div>
                  <div className={`cs-bubble-meta ${msg.sender === 'user' ? 'cs-bubble-meta--user' : ''}`}>
                    {msg.sender === 'analyst' ? 'Research Analyst' : 'You'} • {formatTime(msg.timestamp)}
                  </div>
                </div>

                {msg.sender === 'user' && (
                  <div className="cs-bubble-avatar cs-bubble-avatar--user" />
                )}
              </div>
            ))}

            <div ref={chatEndRef} />
          </div>

          {/* Suggested prompts — visible only before first send AND while input is empty */}
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