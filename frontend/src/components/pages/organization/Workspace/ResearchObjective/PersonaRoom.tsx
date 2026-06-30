import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  TbX, TbSend, TbMicrophone, TbLoader, TbChevronDown,
  TbMessageCircle, TbPaperclip, TbFileText, TbClock,
  TbPlus, TbTrash, TbUsers,
} from 'react-icons/tb';
import { motion, AnimatePresence } from 'framer-motion';
import SpIcon from '../../../../SPIcon';
import { usePersonaBuilder } from '../../../../../hooks/usePersonaBuilder';
import {
  useStartInterview,
  useSendMessage,
  useInterview,
  useInterviews,
  useDeleteInterview,
  interviewKeys,
} from '../../../../../hooks/useInterview';
import { interviewService } from '../../../../../services/interviewService';
import { useQueryClient } from '@tanstack/react-query';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PersonaRoomProps {
  workspaceId: string;
  objectiveId: string;
  onClose: () => void;
  isSidebarOpen: boolean;
  onSidebarOpen: () => void;
  onSidebarClose: () => void;
  /** Callback to render the persona switcher into the parent panel header */
  onHeaderSlot?: (node: React.ReactNode) => void;
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
  personaName?: string; // which persona spoke (for combined mode)
}

interface BackendInterview {
  id: string;
  persona_id?: string;
  personaId?: string;
  messages?: Array<{ role: string; text: string; ts: string }>;
  created_at?: string;
  [key: string]: unknown;
}

interface Thread {
  id: string;
  personaId: string;
  personaName: string;
  title: string;
  preview: string;
  startedAt: string;
  messages: ChatMessage[];
  isAllPersonas?: boolean;
  groupInterviews?: Array<{ id: string; personaId: string; personaName: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALL_PERSONAS_ID = '__all__';

const toFrontendMessages = (apiMessages: Array<{ role: string; text: string; ts: string }> = []): ChatMessage[] =>
  apiMessages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      sender: m.role === 'user' ? 'user' : 'bot' as 'user' | 'bot',
      text: m.text || '',
      timestamp: m.ts,
    }));

// Each persona in a group has its own interview with an identical [user, persona]
// turn structure (one round = one user message + that persona's reply). Re-interleave
// them round-by-round so the group reads like a single combined transcript.
const mergeGroupMessages = (
  groupIvs: BackendInterview[],
  personaNames: string[],
): ChatMessage[] => {
  const perIvTurns = groupIvs.map((iv) =>
    ((iv.messages as any) ?? []).filter((m: any) => m.role !== 'system')
  );
  const maxRounds = Math.max(0, ...perIvTurns.map((t) => Math.ceil(t.length / 2)));
  const merged: ChatMessage[] = [];

  for (let r = 0; r < maxRounds; r++) {
    const userIdx = 2 * r;
    const userTurn = perIvTurns.find((t) => t[userIdx])?.[userIdx];
    if (userTurn) {
      merged.push({ sender: 'user', text: userTurn.text || '', timestamp: userTurn.ts });
    }
    perIvTurns.forEach((turns, i) => {
      const replyTurn = turns[userIdx + 1];
      if (replyTurn) {
        merged.push({
          sender: 'bot',
          text: replyTurn.text || '',
          timestamp: replyTurn.ts,
          personaName: personaNames[i] ?? 'Persona',
        });
      }
    });
  }
  return merged;
};

const groupByDate = (items: Thread[]) => {
  const now       = new Date();
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo   = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

  const todayGroup:   { label: string; items: Thread[] } = { label: 'Today',           items: [] };
  const yestGroup:    { label: string; items: Thread[] } = { label: 'Yesterday',        items: [] };
  const weekGroup:    { label: string; items: Thread[] } = { label: 'Previous 7 Days',  items: [] };
  const olderGroup:   { label: string; items: Thread[] } = { label: 'Older',            items: [] };

  for (const item of items) {
    const d   = new Date(item.startedAt);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day >= today)          todayGroup.items.push(item);
    else if (day >= yesterday) yestGroup.items.push(item);
    else if (day >= weekAgo)   weekGroup.items.push(item);
    else                       olderGroup.items.push(item);
  }

  return [todayGroup, yestGroup, weekGroup, olderGroup].filter((g) => g.items.length > 0);
};

// ── Component ─────────────────────────────────────────────────────────────────

const PersonaRoom: React.FC<PersonaRoomProps> = ({
  workspaceId,
  objectiveId,
  onClose,
  isSidebarOpen,
  onSidebarOpen,
  onSidebarClose,
  onHeaderSlot,
}) => {
  // ── Personas ──────────────────────────────────────────────────────────────

  const { personas: fetchedPersonas } = usePersonaBuilder(workspaceId, objectiveId);
  const personas: Persona[] = (fetchedPersonas?.data ?? []) as Persona[];

  // ── State ─────────────────────────────────────────────────────────────────

  const [selectedPersona,     setSelectedPersona]     = useState<string>('');
  const [selectedPersonaName, setSelectedPersonaName] = useState<string>('');
  const [isAllPersonas,       setIsAllPersonas]       = useState<boolean>(false);
  const [isDropdownOpen,      setIsDropdownOpen]      = useState<boolean>(false);
  const [isChatActive,        setIsChatActive]        = useState<boolean>(false);
  const [messages,            setMessages]            = useState<ChatMessage[]>([]);
  const [inputValue,          setInputValue]          = useState<string>('');
  const [interviewId,         setInterviewId]         = useState<string | null>(null);
  // For combined mode we hold one interviewId per persona
  const [allInterviewIds,     setAllInterviewIds]     = useState<Record<string, string>>({});
  const [activeThreadId,      setActiveThreadId]      = useState<string | null>(null);
  // Combined mode: persona ids still waiting on a reply for the current question
  const [pendingPersonaIds,   setPendingPersonaIds]   = useState<Set<string>>(new Set());

  const chatEndRef      = useRef<HTMLDivElement>(null);
  const dropdownRef     = useRef<HTMLDivElement>(null);
  const queryClient     = useQueryClient();

  // ── Backend hooks ─────────────────────────────────────────────────────────

  const startInterviewMutation = useStartInterview(workspaceId, objectiveId);
  const sendMessageMutation    = useSendMessage(workspaceId, objectiveId, interviewId ?? '');
  const deleteInterview        = useDeleteInterview(workspaceId, objectiveId);

  const { data: interviewsRaw } = useInterviews(workspaceId, objectiveId, {
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });

  const { data: interviewData, isLoading: isInterviewLoading } = useInterview(
    workspaceId,
    objectiveId,
    interviewId ?? '',
    { enabled: !!interviewId && !isAllPersonas, refetchInterval: isChatActive ? 4_000 : false },
  );

  // ── Derive threads from backend list ──────────────────────────────────────

  const rawInterviews: BackendInterview[] =
    (interviewsRaw as any)?.data ?? (Array.isArray(interviewsRaw) ? interviewsRaw : []);

  const singleInterviews: BackendInterview[] = [];
  const groupedInterviews = new Map<string, BackendInterview[]>();
  for (const iv of rawInterviews) {
    const gid = iv.session_group_id as string | undefined;
    if (gid) {
      const list = groupedInterviews.get(gid) ?? [];
      list.push(iv);
      groupedInterviews.set(gid, list);
    } else {
      singleInterviews.push(iv);
    }
  }

  const singleThreads: Thread[] = singleInterviews.map((iv) => {
    const pid     = iv.persona_id ?? iv.personaId ?? '';
    const persona = personas.find((p) => p.id === pid);
    const pName   = persona?.name ?? 'Persona';
    const msgs    = toFrontendMessages((iv.messages as any) ?? []);
    const lastMsg = msgs.filter((m) => m.sender !== 'bot' || msgs.indexOf(m) > 0).at(-1);
    return {
      id:          iv.id,
      personaId:   pid,
      personaName: pName,
      title:       `Chat with ${pName}`,
      preview:     lastMsg?.text?.slice(0, 60) ?? '',
      startedAt:   iv.created_at ?? new Date().toISOString(),
      messages:    msgs,
    };
  });

  const groupThreads: Thread[] = Array.from(groupedInterviews.entries()).map(([gid, ivs]) => {
    const groupInterviews = ivs.map((iv) => {
      const pid     = iv.persona_id ?? iv.personaId ?? '';
      const persona = personas.find((p) => p.id === pid);
      return { id: iv.id, personaId: pid, personaName: persona?.name ?? 'Persona' };
    });
    const merged   = mergeGroupMessages(ivs, groupInterviews.map((g) => g.personaName));
    const lastMsg  = merged.at(-1);
    const earliest = ivs.reduce<string | undefined>((min, iv) => {
      const ts = iv.created_at as string | undefined;
      return !min || (ts && ts < min) ? ts : min;
    }, undefined);
    return {
      id:               gid,
      personaId:        ALL_PERSONAS_ID,
      personaName:      'All Personas',
      title:            `All Personas (${ivs.length})`,
      preview:          lastMsg?.text?.slice(0, 60) ?? '',
      startedAt:        earliest ?? new Date().toISOString(),
      messages:         merged,
      isAllPersonas:    true,
      groupInterviews,
    };
  });

  const threads: Thread[] = [...singleThreads, ...groupThreads];

  const sidebarThreads = !selectedPersona
    ? threads
    : isAllPersonas
      ? threads.filter((t) => t.isAllPersonas)
      : threads.filter((t) => t.personaId === selectedPersona && !t.isAllPersonas);

  const groupedThreads = groupByDate(sidebarThreads);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isAllPersonas) return; // combined mode manages messages itself
    const apiMessages = (interviewData as any)?.data?.messages;
    if (!apiMessages) return;
    const formatted = toFrontendMessages(apiMessages);
    if (formatted.length === 0) return;
    setMessages(formatted);
  }, [interviewData, isAllPersonas]);

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

  const resetChat = () => {
    setIsChatActive(false);
    setMessages([]);
    setInputValue('');
    setInterviewId(null);
    setAllInterviewIds({});
    setActiveThreadId(null);
    setPendingPersonaIds(new Set());
  };

  const handlePersonaSelect = (id: string, name: string) => {
    resetChat();
    setSelectedPersona(id);
    setSelectedPersonaName(name);
    setIsDropdownOpen(false);
    setIsAllPersonas(id === ALL_PERSONAS_ID);
  };

  const handleStartConversation = async () => {
    if (!selectedPersona) return;

    // ── Combined "All Personas" mode ──────────────────────────────────────
    if (isAllPersonas) {
      try {
        const idMap: Record<string, string> = {};
        const greetings: ChatMessage[] = [];
        const sessionGroupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

        await Promise.all(
          personas.map(async (p) => {
            const result = await startInterviewMutation.mutateAsync({
              personaId:   p.id,
              forceNew:    true,
              lightweight: true,
              sessionGroupId,
            });
            const id = (result as any)?.data?.id;
            if (id) {
              idMap[p.id] = id;
              greetings.push({
                sender:      'bot',
                text:        `Hey, I'm ${p.name ?? 'Persona'}. Ready for your questions!`,
                timestamp:   new Date().toISOString(),
                personaName: p.name ?? 'Persona',
              });
            }
          })
        );

        setAllInterviewIds(idMap);
        setMessages(greetings);
        setIsChatActive(true);
        // Representative interview id for display only; the group itself is
        // identified by sessionGroupId for sidebar/active-thread tracking.
        const firstId = Object.values(idMap)[0] ?? null;
        setInterviewId(firstId);
        setActiveThreadId(sessionGroupId);
      } catch (err) {
        console.error('Failed to start combined interview:', err);
      }
      return;
    }

    // ── Single persona mode ───────────────────────────────────────────────
    try {
      const result = await startInterviewMutation.mutateAsync({
        personaId:   selectedPersona,
        forceNew:    true,
        lightweight: true,
      });
      const id = (result as any)?.data?.id;
      if (id) {
        const greeting: ChatMessage = {
          sender:    'bot',
          text:      `Hey, I'm ${selectedPersonaName}. I'm here and ready for all your what-ifs, curiosities, and tough questions.`,
          timestamp: new Date().toISOString(),
        };
        setActiveThreadId(id);
        setMessages([greeting]);
        setInterviewId(id);
        setIsChatActive(true);
      }
    } catch (err) {
      console.error('Failed to start interview:', err);
    }
  };

  const handleLoadThread = useCallback(async (thread: Thread) => {
    setMessages([]);
    setInterviewId(null);
    setAllInterviewIds({});
    setIsChatActive(false);
    setIsDropdownOpen(false);
    setActiveThreadId(thread.id);

    // ── Grouped "All Personas" thread ─────────────────────────────────────
    if (thread.isAllPersonas && thread.groupInterviews) {
      setSelectedPersona(ALL_PERSONAS_ID);
      setSelectedPersonaName('All Personas');
      setIsAllPersonas(true);

      try {
        const fresh = await Promise.all(
          thread.groupInterviews.map((g) =>
            queryClient.fetchQuery({
              queryKey: interviewKeys.detail(workspaceId, objectiveId, g.id),
              queryFn:  () => interviewService.getInterview(workspaceId, objectiveId, g.id),
              staleTime: 0,
            })
          )
        );
        const freshIvs = fresh.map((r: any) => r?.data ?? r);
        setMessages(mergeGroupMessages(freshIvs, thread.groupInterviews.map((g) => g.personaName)));
      } catch {
        setMessages(thread.messages);
      }

      const idMap: Record<string, string> = {};
      thread.groupInterviews.forEach((g) => { idMap[g.personaId] = g.id; });
      setAllInterviewIds(idMap);
      setInterviewId(thread.groupInterviews[0]?.id ?? null);
      setIsChatActive(true);
      onSidebarClose();
      return;
    }

    // ── Single persona thread ──────────────────────────────────────────────
    setIsAllPersonas(false);
    setSelectedPersona(thread.personaId);
    setSelectedPersonaName(thread.personaName);

    try {
      const res = await queryClient.fetchQuery({
        queryKey: interviewKeys.detail(workspaceId, objectiveId, thread.id),
        queryFn:  () => interviewService.getInterview(workspaceId, objectiveId, thread.id),
        staleTime: 0,
      });
      const apiMessages = (res as any)?.data?.messages ?? (res as any)?.messages ?? [];
      setMessages(toFrontendMessages(apiMessages));
    } catch {
      if (thread.messages.length > 0) setMessages(thread.messages);
    }

    setInterviewId(thread.id);
    setIsChatActive(true);
    onSidebarClose();
  }, [workspaceId, objectiveId, queryClient, onSidebarClose]);

  const handleNewChat = () => resetChat();

  const handleDeleteThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    const thread = threads.find((t) => t.id === threadId);
    try {
      if (thread?.isAllPersonas && thread.groupInterviews) {
        await Promise.all(thread.groupInterviews.map((g) => deleteInterview.mutateAsync(g.id)));
      } else {
        await deleteInterview.mutateAsync(threadId);
      }
    } catch {
      // non-critical
    }
    if (activeThreadId === threadId) handleNewChat();
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    const text = inputValue.trim();

    const userMsg: ChatMessage = { sender: 'user', text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');

    // ── Combined mode: fan out to all personas ────────────────────────────
    if (isAllPersonas) {
      const targets = personas.filter((p) => allInterviewIds[p.id]);
      setPendingPersonaIds(new Set(targets.map((p) => p.id)));

      // Fire independently — each persona's bubble lands the moment its own
      // reply is ready instead of waiting for every persona to finish.
      targets.forEach((p) => {
        const iid = allInterviewIds[p.id];
        (async () => {
          try {
            const res = await interviewService.sendMessage(workspaceId, objectiveId, iid, { role: 'user', text });
            const replyText = (res as any)?.data?.text ?? '…';
            setMessages((prev) => [
              ...prev,
              { sender: 'bot', text: replyText, timestamp: new Date().toISOString(), personaName: p.name ?? 'Persona' },
            ]);
          } catch (err) {
            console.error(`Send failed for persona ${p.id}:`, err);
            setMessages((prev) => [
              ...prev,
              { sender: 'bot', text: 'Sorry, there was an error. Please try again.', timestamp: new Date().toISOString(), personaName: p.name ?? 'Persona' },
            ]);
          } finally {
            setPendingPersonaIds((prev) => {
              const next = new Set(prev);
              next.delete(p.id);
              return next;
            });
          }
        })();
      });
      return;
    }

    // ── Single persona mode ───────────────────────────────────────────────
    if (!interviewId) return;
    try {
      const result = await sendMessageMutation.mutateAsync({ role: 'user', text });
      const replyText = (result as any)?.data?.text;
      if (replyText) {
        setMessages((prev) => [...prev, { sender: 'bot', text: replyText, timestamp: new Date().toISOString() }]);
      }
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
      .map((m) => {
        const label = m.sender === 'user' ? 'You' : (m.personaName ?? selectedPersonaName);
        return `${label}: ${m.text}`;
      })
      .join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `conversation-${isAllPersonas ? 'all-personas' : selectedPersonaName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const activePersona = personas.find((p) => p.id === selectedPersona);
  const hasSelection  = !!selectedPersona;
  const isStarting    = startInterviewMutation.isPending;
  const canSend       = isAllPersonas
    ? Object.keys(allInterviewIds).length > 0
    : !!interviewId;

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

  // Avatar for a bot message (combined or single)
  const getBotAvatar = (msg: ChatMessage) => {
    if (isAllPersonas && msg.personaName) {
      return msg.personaName.charAt(0).toUpperCase();
    }
    if (activePersona?.image) {
      return (
        <img src={activePersona.image as string} alt={selectedPersonaName} className="cs-bubble-avatar__img" />
      );
    }
    return selectedPersonaName.charAt(0).toUpperCase();
  };

  // ── Push persona switcher into parent header ──────────────────────────────

  const personaSwitcher = hasSelection ? (
    <div className="cs-dropdown-wrap cs-dropdown-wrap--header" ref={dropdownRef}>
      <button
        className="cs-header-persona-btn"
        onClick={() => setIsDropdownOpen((v) => !v)}
      >
        {isAllPersonas && <TbUsers size={14} />}
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
            <button
              className="cs-dropdown-item cs-dropdown-item--all"
              onClick={() => handlePersonaSelect(ALL_PERSONAS_ID, 'All Personas')}
            >
              <div className="cs-dropdown-item__avatar cs-dropdown-item__avatar--all">
                <TbUsers size={16} />
              </div>
              <div className="cs-dropdown-item__text">
                <span className="cs-dropdown-item__name">All Personas</span>
                <span className="cs-dropdown-item__role">Talk to everyone at once</span>
              </div>
            </button>
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
  ) : null;

  useEffect(() => {
    onHeaderSlot?.(personaSwitcher);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPersona, isDropdownOpen, isAllPersonas, personas]);

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
          {selectedPersona && selectedPersona !== ALL_PERSONAS_ID && (
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
                {group.items.map((thread) => (
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
                          <>
                            {/* All Personas option */}
                            <button
                              className="cs-dropdown-item cs-dropdown-item--all"
                              onClick={() => handlePersonaSelect(ALL_PERSONAS_ID, 'All Personas')}
                            >
                              <div className="cs-dropdown-item__avatar cs-dropdown-item__avatar--all">
                                <TbUsers size={16} />
                              </div>
                              <div className="cs-dropdown-item__text">
                                <span className="cs-dropdown-item__name">All Personas</span>
                                <span className="cs-dropdown-item__role">Talk to everyone at once</span>
                              </div>
                            </button>

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
                          </>
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
                  {isAllPersonas ? (
                    <TbUsers size={40} className="cs-messages__empty-icon" />
                  ) : (
                    <TbMessageCircle size={40} className="cs-messages__empty-icon" />
                  )}
                  <h4 className="cs-messages__empty-title">Ready to deep dive?</h4>
                  <p className="cs-messages__empty-sub">
                    {isAllPersonas
                      ? <>You're talking to <strong>all {personas.length} personas</strong> simultaneously.</>
                      : <>You're talking to <strong>{selectedPersonaName}</strong>.</>
                    }
                  </p>
                  {isAllPersonas && (
                    <p className="cs-messages__empty-hint">
                      Each persona will respond independently to your questions.
                    </p>
                  )}
                  <button
                    className="cs-start-btn"
                    onClick={handleStartConversation}
                    disabled={isStarting}
                  >
                    {isStarting ? (
                      <><TbLoader className="cs-start-btn__spinner" size={15} />Starting…</>
                    ) : (
                      isAllPersonas ? 'Start Group Interview' : 'Start Interview'
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
                          {getBotAvatar(msg)}
                        </div>
                      )}
                      <div className="cs-bubble-col">
                        {/* In combined mode show which persona is speaking above the bubble */}
                        {isAllPersonas && msg.sender === 'bot' && msg.personaName && (
                          <span className="cs-bubble-persona-label">{msg.personaName}</span>
                        )}
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
                          {msg.sender === 'bot'
                            ? (msg.personaName ?? selectedPersonaName)
                            : 'You'} • {formatTime(msg.timestamp)}
                        </div>
                      </div>
                      {msg.sender === 'user' && (
                        <div className="cs-bubble-avatar cs-bubble-avatar--user" />
                      )}
                    </div>
                  ))}
                  {sendMessageMutation.isPending && !isAllPersonas && (
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
                  {isAllPersonas && Array.from(pendingPersonaIds).map((pid) => {
                    const pName = personas.find((p) => p.id === pid)?.name ?? 'Persona';
                    return (
                      <div className="cs-bubble-row" key={`thinking-${pid}`}>
                        <div className="cs-bubble-avatar">{pName.charAt(0).toUpperCase()}</div>
                        <div className="cs-bubble-col">
                          <span className="cs-bubble-persona-label">{pName}</span>
                          <div className="cs-bubble cs-bubble--bot cs-bubble--thinking">
                            <div className="cs-bubble__thinking">
                              <TbLoader size={14} className="cs-bubble__thinking-spinner" />
                              <span>Thinking…</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {isChatActive && canSend && (
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
                      placeholder={isAllPersonas ? 'Ask all personas…' : 'Ask anything…'}
                    />
                  </div>
                  <button className="cs-input-voice" title="Voice input">
                    <TbMicrophone size={18} />
                  </button>
                  <button
                    className="cs-send-btn"
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() || (isAllPersonas ? pendingPersonaIds.size > 0 : sendMessageMutation.isPending)}
                  >
                    {(isAllPersonas ? pendingPersonaIds.size > 0 : sendMessageMutation.isPending)
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