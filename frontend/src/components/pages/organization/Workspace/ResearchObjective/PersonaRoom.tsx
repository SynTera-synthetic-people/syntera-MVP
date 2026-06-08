import React, { useState, useEffect, useRef } from 'react';
import {
  TbX, TbSend, TbMicrophone, TbLoader, TbChevronDown,
  TbMessageCircle, TbPaperclip, TbFileText, TbClock,
  TbPlus, TbTrash,
} from 'react-icons/tb';
import { motion, AnimatePresence } from 'framer-motion';
import SpIcon from '../../../../SPIcon';
import { usePersonaBuilder } from '../../../../../hooks/usePersonaBuilder';
import {
  useStartInterview,
  useSendMessage,
  useInterview,
} from '../../../../..//hooks/useInterview';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PersonaRoomProps {
  workspaceId: string;
  objectiveId: string;
  onClose: () => void;
  /** Sidebar open state is lifted so the shell can control the FAB */
  isSidebarOpen: boolean;
  onSidebarOpen: () => void;
  onSidebarClose: () => void;
}

interface Persona {
  id: string;
  name?: string;
  occupation?: string;
  image?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  isThinking?: boolean;
}

export interface ConversationThread {
  id: string;
  personaId: string;
  personaName: string;
  title: string;
  preview: string;
  startedAt: string;
  messages: ChatMessage[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const groupThreadsByDate = (threads: ConversationThread[]) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const todayGroup:   { label: string; threads: ConversationThread[] } = { label: 'Today',           threads: [] };
  const yestGroup:    { label: string; threads: ConversationThread[] } = { label: 'Yesterday',        threads: [] };
  const weekGroup:    { label: string; threads: ConversationThread[] } = { label: 'Previous 7 Days',  threads: [] };
  const olderGroup:   { label: string; threads: ConversationThread[] } = { label: 'Older',            threads: [] };

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

// ── Component ─────────────────────────────────────────────────────────────────

const PersonaRoom: React.FC<PersonaRoomProps> = ({
  workspaceId,
  objectiveId,
  onClose,
  isSidebarOpen,
  onSidebarOpen,
  onSidebarClose,
}) => {
  // ── Personas ──────────────────────────────────────────────────────────────

  const { personas: fetchedPersonas } = usePersonaBuilder(workspaceId, objectiveId);
  const personas: Persona[] = (fetchedPersonas?.data ?? []) as Persona[];

  // ── State ─────────────────────────────────────────────────────────────────

  const [selectedPersona,     setSelectedPersona]     = useState<string>('');
  const [selectedPersonaName, setSelectedPersonaName] = useState<string>('');
  const [isDropdownOpen,      setIsDropdownOpen]      = useState<boolean>(false);
  const [isChatActive,        setIsChatActive]        = useState<boolean>(false);
  const [messages,            setMessages]            = useState<ChatMessage[]>([]);
  const [inputValue,          setInputValue]          = useState<string>('');
  const [interviewId,         setInterviewId]         = useState<string | null>(null);
  const [threads,             setThreads]             = useState<ConversationThread[]>([]);
  const [activeThreadId,      setActiveThreadId]      = useState<string | null>(null);

  const chatEndRef  = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Hooks ─────────────────────────────────────────────────────────────────

  const startInterviewMutation = useStartInterview(workspaceId, objectiveId);
  const sendMessageMutation    = useSendMessage(workspaceId, objectiveId, interviewId ?? '');

  const { data: interviewData, isLoading: isInterviewLoading } = useInterview(
    workspaceId,
    objectiveId,
    interviewId ?? '',
    {
      enabled: !!interviewId,
      refetchInterval: isChatActive ? 5_000 : false,
    }
  );

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const apiMessages = (interviewData as any)?.data?.messages;
    if (!apiMessages) return;

    const visible   = apiMessages.filter((msg: any) => msg.role !== 'system');
    if (visible.length === 0) return;

    const formatted: ChatMessage[] = visible.map((msg: any) => ({
      sender:    msg.role === 'user' ? 'user' : 'bot',
      text:      msg.text || '',
      timestamp: msg.ts,
    }));
    setMessages(formatted);

    if (activeThreadId) {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeThreadId
            ? { ...t, messages: formatted, preview: formatted[formatted.length - 1]?.text?.slice(0, 60) ?? t.preview }
            : t
        )
      );
    }
  }, [interviewData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handlePersonaSelect = (id: string, name: string) => {
    setSelectedPersona(id);
    setSelectedPersonaName(name);
    setIsDropdownOpen(false);
    setIsChatActive(false);
    setMessages([]);
    setInputValue('');
    setInterviewId(null);
    setActiveThreadId(null);
  };

  const handleStartConversation = async () => {
    if (!selectedPersona) return;
    try {
      const result = await startInterviewMutation.mutateAsync({
        personaId: selectedPersona,
        forceNew:  true,
        lightweight: true,
      });
      const id = (result as any)?.data?.id;
      if (id) {
        const greeting: ChatMessage = {
          sender:    'bot',
          text:      `Hey, I'm ${selectedPersonaName}. I'm here and ready for all your what-ifs, curiosities, and tough questions.`,
          timestamp: new Date().toISOString(),
        };
        const newThread: ConversationThread = {
          id,
          personaId:   selectedPersona,
          personaName: selectedPersonaName,
          title:       `Chat with ${selectedPersonaName}`,
          preview:     greeting.text.slice(0, 60),
          startedAt:   new Date().toISOString(),
          messages:    [greeting],
        };
        setThreads((prev) => [newThread, ...prev]);
        setActiveThreadId(id);
        setMessages([greeting]);
        setInterviewId(id);
        setIsChatActive(true);
      }
    } catch (err) {
      console.error('Failed to start interview:', err);
    }
  };

  const handleLoadThread = (thread: ConversationThread) => {
    setSelectedPersona(thread.personaId);
    setSelectedPersonaName(thread.personaName);
    setActiveThreadId(thread.id);
    setInterviewId(thread.id);
    setMessages(thread.messages);
    setIsChatActive(true);
    setIsDropdownOpen(false);
  };

  const handleNewChat = () => {
    setIsChatActive(false);
    setMessages([]);
    setInputValue('');
    setInterviewId(null);
    setActiveThreadId(null);
  };

  const handleDeleteThread = (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (activeThreadId === threadId) handleNewChat();
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !interviewId) return;
    const text = inputValue.trim();

    const userMsg: ChatMessage = { sender: 'user', text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');

    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThreadId
          ? { ...t, preview: text.slice(0, 60), messages: [...t.messages, userMsg] }
          : t
      )
    );

    try {
      await sendMessageMutation.mutateAsync({ role: 'user', text });
      setMessages((prev) => [
        ...prev,
        { sender: 'bot', text: 'Thinking...', timestamp: new Date().toISOString(), isThinking: true },
      ]);
    } catch (err) {
      console.error('Send failed:', err);
      setMessages((prev) => [
        ...prev.filter((m) => !m.isThinking),
        { sender: 'bot', text: 'Sorry, there was an error. Please try again.', timestamp: new Date().toISOString() },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleDownloadConversation = () => {
    const content = messages
      .map((m) => `${m.sender === 'user' ? 'You' : selectedPersonaName}: ${m.text}`)
      .join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `conversation-${selectedPersonaName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const activePersona    = personas.find((p) => p.id === selectedPersona);
  const hasSelection     = !!selectedPersona;
  const isStarting       = startInterviewMutation.isPending;
  const sidebarThreads   = selectedPersona ? threads.filter((t) => t.personaId === selectedPersona) : threads;
  const groupedThreads   = groupThreadsByDate(sidebarThreads);

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="cs-body">

      {/* Floating history toggle */}
      {!isSidebarOpen && (
        <button
          className="cs-history-fab"
          onClick={onSidebarOpen}
          aria-label="Open history"
          title="Open conversation history"
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
              History
            </span>
            <div className="cs-sidebar__header-actions">
              {isChatActive && (
                <button className="cs-sidebar__new-btn" onClick={handleNewChat} title="New conversation">
                  <TbPlus size={15} />
                </button>
              )}
              <button className="cs-sidebar__close-btn" onClick={onSidebarClose} title="Close history">
                <TbX size={14} />
              </button>
            </div>
          </div>
          {selectedPersona && (
            <p className="cs-sidebar__filter-label">
              Showing threads for <strong>{selectedPersonaName}</strong>
            </p>
          )}
        </div>

        <div className="cs-sidebar__threads">
          {sidebarThreads.length === 0 ? (
            <div className="cs-sidebar__empty">
              <TbMessageCircle size={22} />
              <span>No conversations yet</span>
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
                    <div className="cs-thread-item__avatar">
                      {thread.personaName.charAt(0).toUpperCase()}
                    </div>
                    <div className="cs-thread-item__content">
                      <div className="cs-thread-item__top">
                        <span className="cs-thread-item__name">{thread.personaName}</span>
                        <span className="cs-thread-item__date">{formatThreadDate(thread.startedAt)}</span>
                      </div>
                      <p className="cs-thread-item__preview">{thread.preview}…</p>
                    </div>
                    <button
                      className="cs-thread-item__delete"
                      onClick={(e) => handleDeleteThread(e, thread.id)}
                      title="Delete thread"
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

        {/* Header row — persona switcher in persona room */}
        {hasSelection && (
          <div className="cs-persona-room-header">
            <div className="cs-dropdown-wrap cs-dropdown-wrap--inline" ref={dropdownRef}>
              <button
                className="cs-header-persona-btn"
                onClick={() => setIsDropdownOpen((v) => !v)}
              >
                <span>{selectedPersonaName}</span>
                <TbChevronDown
                  size={14}
                  className={`cs-dropdown-trigger__chevron ${isDropdownOpen ? 'cs-dropdown-trigger__chevron--open' : ''}`}
                />
              </button>
              <AnimatePresence>
                {isDropdownOpen && (
                  <motion.div
                    className="cs-dropdown-menu cs-dropdown-menu--right"
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                  >
                    {personas.map((p) => (
                      <button
                        key={p.id}
                        className="cs-dropdown-item"
                        onClick={() => handlePersonaSelect(p.id, p.name ?? 'Persona')}
                      >
                        <div className="cs-dropdown-item__avatar">
                          {(p.name ?? 'P').charAt(0).toUpperCase()}
                        </div>
                        <div className="cs-dropdown-item__text">
                          <span className="cs-dropdown-item__name">{p.name ?? 'Persona'}</span>
                          <span className="cs-dropdown-item__role">{p.occupation ?? ''}</span>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {!hasSelection ? (
          /* ── Picker state ── */
          <>
            <div className="cs-picker-state">
              <div className="cs-picker-card">
                <SpIcon name="sp-User-Users" size={40} className="cs-picker-card__icon" />
                <h3 className="cs-picker-card__title">Pick a persona to begin your conversation</h3>
                <div className="cs-dropdown-wrap" ref={dropdownRef}>
                  <button
                    className="cs-dropdown-trigger"
                    onClick={() => setIsDropdownOpen((v) => !v)}
                  >
                    <span>Select Persona</span>
                    <TbChevronDown
                      size={16}
                      className={`cs-dropdown-trigger__chevron ${isDropdownOpen ? 'cs-dropdown-trigger__chevron--open' : ''}`}
                    />
                  </button>
                  <AnimatePresence>
                    {isDropdownOpen && (
                      <motion.div
                        className="cs-dropdown-menu"
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                      >
                        {personas.length > 0 ? (
                          personas.map((p) => (
                            <button
                              key={p.id}
                              className="cs-dropdown-item"
                              onClick={() => handlePersonaSelect(p.id, p.name ?? 'Persona')}
                            >
                              <div className="cs-dropdown-item__avatar">
                                {(p.name ?? 'P').charAt(0).toUpperCase()}
                              </div>
                              <div className="cs-dropdown-item__text">
                                <span className="cs-dropdown-item__name">{p.name ?? 'Persona'}</span>
                                <span className="cs-dropdown-item__role">{p.occupation ?? ''}</span>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="cs-dropdown-empty">No personas found</div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
            <div className="cs-footer cs-footer--picker" />
          </>

        ) : (
          /* ── Chat state ── */
          <div className="cs-chat">
            <div className="cs-messages">
              {!isChatActive ? (
                <div className="cs-messages__empty">
                  <TbMessageCircle size={40} className="cs-messages__empty-icon" />
                  <h4 className="cs-messages__empty-title">Ready to deep dive?</h4>
                  <p className="cs-messages__empty-sub">
                    You're talking to <strong>{selectedPersonaName}</strong>.
                  </p>
                  <button
                    className="cs-start-btn"
                    onClick={handleStartConversation}
                    disabled={isStarting}
                  >
                    {isStarting ? (
                      <><TbLoader className="cs-start-btn__spinner" size={15} />Starting…</>
                    ) : (
                      'Start Interview'
                    )}
                  </button>
                </div>
              ) : messages.length === 0 && isInterviewLoading ? (
                <div className="cs-messages__loading">
                  <TbLoader size={28} className="cs-messages__loading-spinner" />
                  <span>Setting up the interview…</span>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`cs-bubble-row ${msg.sender === 'user' ? 'cs-bubble-row--user' : ''}`}
                    >
                      {msg.sender === 'bot' && (
                        <div className="cs-bubble-avatar">
                          {activePersona?.image ? (
                            <img src={activePersona.image as string} alt={selectedPersonaName} className="cs-bubble-avatar__img" />
                          ) : (
                            selectedPersonaName.charAt(0).toUpperCase()
                          )}
                        </div>
                      )}
                      <div className="cs-bubble-col">
                        <div className={`cs-bubble ${msg.sender === 'user' ? 'cs-bubble--user' : 'cs-bubble--bot'} ${msg.isThinking ? 'cs-bubble--thinking' : ''}`}>
                          {msg.isThinking ? (
                            <div className="cs-bubble__thinking">
                              <TbLoader size={14} className="cs-bubble__thinking-spinner" />
                              <span>{msg.text}</span>
                            </div>
                          ) : (
                            msg.text
                          )}
                        </div>
                        <div className={`cs-bubble-meta ${msg.sender === 'user' ? 'cs-bubble-meta--user' : ''}`}>
                          {msg.sender === 'bot' ? selectedPersonaName : 'You'} • {formatTime(msg.timestamp)}
                        </div>
                      </div>
                      {msg.sender === 'user' && (
                        <div className="cs-bubble-avatar cs-bubble-avatar--user" />
                      )}
                    </div>
                  ))}
                  {sendMessageMutation.isPending && (
                    <div className="cs-bubble-row">
                      <div className="cs-bubble-avatar">
                        {selectedPersonaName.charAt(0).toUpperCase()}
                      </div>
                      <div className="cs-bubble-col">
                        <div className="cs-bubble cs-bubble--bot cs-bubble--thinking">
                          <div className="cs-bubble__thinking">
                            <TbLoader size={14} className="cs-bubble__thinking-spinner" />
                            <span>Thinking…</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {isChatActive && interviewId && (
              <div className="cs-input-area">
                <div className="cs-input-row">
                  <button className="cs-input-attach" title="Attach file">
                    <TbPaperclip size={18} />
                  </button>
                  <div className="cs-input-wrap">
                    <textarea
                      className="cs-input"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={1}
                      autoFocus
                      placeholder="Ask anything…"
                    />
                  </div>
                  <button className="cs-input-voice" title="Voice input">
                    <TbMicrophone size={18} />
                  </button>
                  <button
                    className="cs-send-btn"
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() || sendMessageMutation.isPending}
                  >
                    {sendMessageMutation.isPending
                      ? <TbLoader size={18} className="cs-send-btn__spinner" />
                      : <TbSend size={18} />
                    }
                  </button>
                </div>
              </div>
            )}

            <div className="cs-footer">
              <button className="cs-footer__download" onClick={handleDownloadConversation}>
                <TbFileText size={16} />
                Download this Conversation
              </button>
              <button className="cs-footer__end" onClick={onClose}>
                End Exploration
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PersonaRoom;