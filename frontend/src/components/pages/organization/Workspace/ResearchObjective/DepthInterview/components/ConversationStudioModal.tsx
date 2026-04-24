import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbX, TbSend, TbMicrophone, TbLoader, TbChevronDown, TbMessageCircle, TbPaperclip, TbFileText } from 'react-icons/tb';
import SpIcon from '../../../../../../SPIcon';
import { usePersonaBuilder } from '../../../../../../../hooks/usePersonaBuilder';
import {
  useStartInterview,
  useSendMessage,
  useInterview,
  useInterviewByPersona,
} from '../../../../../../../hooks/useInterview';
import './ConversationStudioModal.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConversationStudioModalProps {
  workspaceId: string;
  objectiveId: string;
  onClose: () => void;
}
interface Interview {
  id: string;
  messages?: any[];
  // add more fields if needed
}

interface Persona {
  id: string;
  name?: string;
  occupation?: string;
  image?: string;
  [key: string]: unknown;
}

interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  isThinking?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

const ConversationStudioModal: React.FC<ConversationStudioModalProps> = ({
  workspaceId,
  objectiveId,
  onClose,
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

  const chatEndRef    = useRef<HTMLDivElement>(null);
  const dropdownRef   = useRef<HTMLDivElement>(null);

  // ── Hooks ─────────────────────────────────────────────────────────────────

  const startInterviewMutation = useStartInterview(workspaceId, objectiveId);
  const sendMessageMutation    = useSendMessage(workspaceId, objectiveId, interviewId ?? '');

  // Check if an interview already exists for the selected persona before
  // starting a new one — prevents unnecessary LLM re-runs on re-visit.
  const {
    data: existingInterviewData,
    isLoading: isCheckingExisting,
    isFetched: existingInterviewFetched,
  } = useInterviewByPersona(workspaceId, objectiveId, selectedPersona);

  // Fetch messages for an active interview. When restoring an existing interview
  // we do NOT poll (refetchInterval: false) — we only need a one-time load.
  // When the user is actively chatting we poll every 5 s to pick up new replies.
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

  // Sync messages from polling / one-time restore fetch
  useEffect(() => {
    const apiMessages = (interviewData as any)?.data?.messages;
    if (!apiMessages) return;
    const formatted: ChatMessage[] = apiMessages.map((msg: any) => ({
      sender: msg.role === 'user' ? 'user' : 'bot',
      text: msg.text || '',
      timestamp: msg.ts,
    }));
    setMessages(formatted);
  }, [interviewData]);

  // Scroll to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close dropdown on outside click
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
    // Reset chat state so the restore / start logic runs fresh for this persona
    setIsChatActive(false);
    setMessages([]);
    setInputValue('');
    setInterviewId(null);
  };

  const handleStartConversation = async () => {
    if (!selectedPersona) return;

    try {
      // If an existing interview is found for this persona, restore it directly
      // without re-running the LLM. Messages are populated automatically by the
      // useInterview hook once interviewId is set (one-time fetch, no polling).
     const existingInterview = existingInterviewData?.data as Interview | null;

      if (existingInterview?.id) {
        setInterviewId(existingInterview.id);
        setIsChatActive(true);
        // Messages will be populated by the useInterview useEffect above.
        return;
      }

      // No existing interview — start a fresh one (LLM call).
      const result = await startInterviewMutation.mutateAsync(selectedPersona);
      const id = (result as any)?.data?.id;

      if (id) {
        setInterviewId(id);
        setIsChatActive(true);
        setMessages([
          {
            sender: 'bot',
            text: `Hello! I'm ${selectedPersonaName}. You can ask me questions about my experiences and perspectives.`,
            timestamp: new Date().toISOString(),
          },
          {
            sender: 'bot',
            text: 'You can type your questions below, or use the microphone for voice input.',
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.error('Failed to start interview:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !interviewId) return;
    const text = inputValue.trim();

    const userMsg: ChatMessage = {
      sender: 'user',
      text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');

    try {
      await sendMessageMutation.mutateAsync({ role: 'user', content: text });
      setMessages((prev) => [
        ...prev,
        { sender: 'bot', text: 'Thinking...', timestamp: new Date().toISOString(), isThinking: true },
      ]);
    } catch (err) {
      console.error('Send failed:', err);
      setMessages((prev) => [
        ...prev.filter((m) => !m.isThinking),
        {
          sender: 'bot',
          text: 'Sorry, there was an error. Please try again.',
          timestamp: new Date().toISOString(),
        },
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

  const handleEndExploration = () => {
    onClose();
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const activePersona = personas.find((p) => p.id === selectedPersona);
  const hasSelection  = !!selectedPersona;

  // The "Start Interview" button should be disabled while:
  //   1. We're still checking whether an existing interview exists, or
  //   2. A new interview is being created.
  const isStarting = isCheckingExisting || startInterviewMutation.isPending;

  // ── Format timestamp ──────────────────────────────────────────────────────

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return '';
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <motion.div
      className="cs-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="cs-panel"
        initial={{ opacity: 0, y: 32, scale: 0.98 }}
        animate={{ opacity: 1, y: 0,   scale: 1    }}
        exit={{   opacity: 0, y: 32,   scale: 0.98 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Panel header ── */}
        <div className="cs-panel-header">
          <div className="cs-panel-header__text">
            <h2 className="cs-panel-header__title">Conversation Studio</h2>
            <p className="cs-panel-header__subtitle">
              {isChatActive ? 'Content goes here...' : 'Test scenarios. Validate assumptions. Explore what-ifs.'}
            </p>
          </div>
          <div className="cs-panel-header__actions">
            {/* Persona switcher in header — only when a persona is selected */}
            {hasSelection && (
              <div className="cs-dropdown-wrap cs-dropdown-wrap--header" ref={dropdownRef}>
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
                      animate={{ opacity: 1, y: 0,   scale: 1    }}
                      exit={{   opacity: 0, y: -6,   scale: 0.97 }}
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
            )}
            <button className="cs-close" onClick={onClose} aria-label="Close">
              <TbX size={20} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="cs-body">

          {/* ── Persona picker state (no persona selected) ── */}
          {!hasSelection ? (
            <>
              <div className="cs-picker-state">
                <div className="cs-picker-card">
                  <SpIcon name="sp-User-Users" size={40} className="cs-picker-card__icon" />
                  <h3 className="cs-picker-card__title">
                    Pick a persona to begin your conversation
                  </h3>
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
                          animate={{ opacity: 1, y: 0,   scale: 1    }}
                          exit={{   opacity: 0, y: -6,   scale: 0.97 }}
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

              {/* ── Footer (picker state) ── */}
              <div className="cs-footer cs-footer--picker" />
            </>

          ) : (
            /* ── Chat state ── */
            <div className="cs-chat">

              {/* Messages */}
              <div className="cs-messages">
                {!isChatActive ? (
                  /* Ready to start — show spinner if still checking for existing interview */
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
                        <>
                          <TbLoader className="cs-start-btn__spinner" size={15} />
                          Starting…
                        </>
                      ) : (
                        'Start Interview'
                      )}
                    </button>
                  </div>
                ) : messages.length === 0 && (isInterviewLoading || isCheckingExisting) ? (
                  /* Loading state: restoring existing interview messages */
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
                              <img src={activePersona.image} alt={selectedPersonaName} className="cs-bubble-avatar__img" />
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

              {/* Input */}
              {isChatActive && interviewId && (
                <div className="cs-input-area">
                  <div className="cs-input-row">
                    <button className="cs-input-attach" title="Attach file">
                      <TbPaperclip size={18} />
                    </button>
                    <div className="cs-input-wrap">
                      <textarea
                        className="cs-input"
                        placeholder="Typing..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        autoFocus
                      />
                    </div>
                    <button className="cs-input-voice" title="Voice input" onClick={() => {}}>
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

              {/* ── Footer (chat state) ── */}
              <div className="cs-footer">
                <button className="cs-footer__download" onClick={handleDownloadConversation}>
                  <TbFileText size={16} />
                  Download this Conversation
                </button>
                <button className="cs-footer__end" onClick={handleEndExploration}>
                  End Exploration
                </button>
              </div>

            </div>
          )}
        </div>

      </motion.div>
    </motion.div>
  );
};

export default ConversationStudioModal;