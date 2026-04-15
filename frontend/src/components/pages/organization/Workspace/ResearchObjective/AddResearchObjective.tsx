import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from "framer-motion";
import {
  TbPaperclip,
  TbMicrophone,
  TbSend,
  TbRobot,
  TbUser,
  TbLoader,
  TbSparkles,
  TbPencil,
} from "react-icons/tb";
import { useTheme } from "../../../../../context/ThemeContext";
import {
  useInitializeOmiSession,
  useSendMessageToOmi,
  useCreateResearchObjective,
  useConversationHistory
} from "../../../../../hooks/useOmiChat";
import { useOmniWorkflow } from '../../../../../hooks/useOmiWorkflow';
// ── CHANGE 1: Import useAutoGeneratePersonas so we can fire the backend
//             persona generation the moment the user clicks "Create with Omi"
import { useAutoGeneratePersonas } from '../../../../../hooks/usePersonaBuilder';
import OmiGreet from '../../../../../assets/Omi Animations/OmiGreeting.mp4';
import OmiPencil from '../../../../../assets/Omi Animations/OmiPencil.mp4';
import OmiKeyboard from '../../../../../assets/Omi Animations/OmiKeyboard.mp4';
import OmiCaution from '../../../../../assets/Omi Animations/OmiCaution.mp4';
import "./AddResearchObjectiveStyle.css";

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  sender: 'omi' | 'user';
  text: string;
  timestamp: Date;
  sessionId?: string;
  file?: File | null;
  isError?: boolean;
  omiState?: string;
  suggestions?: any;
  nextSteps?: any;
  responseData?: any;
  workflowStage?: string;
  messageType?: string;
  originalData?: any;
}

interface Template {
  id: string;
  title: string;
  description: string;
  data?: { title?: string; description?: string };
}

interface ResearchObjectiveState {
  templates: Template[];
  selectedTemplate: Template | null;
  selectedObjective: any;
  objectives: any[];
  loading: boolean;
  error: any;
}

interface RootState {
  researchObjective: ResearchObjectiveState;
}

// ── Component ────────────────────────────────────────────────────────────────

const AddResearchObjective: React.FC = () => {
  const navigate = useNavigate();
  const { trigger } = useOmniWorkflow();
  const { theme } = useTheme();
  const { workspaceId, objectiveId } = useParams<{
    workspaceId: string;
    objectiveId: string;
  }>();
  const dispatch = useDispatch();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [omiAnimation, setOmiAnimation] = useState<"greeting" | "writing" | "typing" | "error">("greeting");
  const getOmiVideo = () => {
    switch (omiAnimation) {
      case "writing":
        return OmiPencil;
      case "typing":
        return OmiKeyboard;
      case "error":
        return OmiCaution;
      default:
        return OmiGreet;
    }
  };

  // TanStack Query Hooks
  const {
    data: sessionData,
    isLoading: sessionLoading,
    error: sessionError,
    refetch: refetchSession
  } = useInitializeOmiSession(objectiveId);

  // Conversation history hook
  const {
    data: conversationHistoryData,
    isLoading: isLoadingHistory,
    error: historyError,
    refetch: refetchHistory
  } = useConversationHistory(workspaceId, objectiveId);

  const sessionId = (sessionData as any)?.data?.session_id;
  const {
    mutate: sendMessage,
    isLoading: isSendingMessage
  } = useSendMessageToOmi(objectiveId, sessionId) as any;

  const { mutate: createResearchObjective } = useCreateResearchObjective() as any;

  // ── CHANGE 2: Add the hook with enabled:false so it doesn't fire on mount.
  //             We call triggerPersonaGeneration() manually in handleCreateWithOmi.
  const {
    refetch: triggerPersonaGeneration,
  } = useAutoGeneratePersonas(workspaceId, objectiveId, { enabled: false });

  // Redux state
  const {
    templates,
    selectedTemplate,
    selectedObjective,
    objectives,
    loading: templatesLoading,
    error: templatesError
  } = useSelector((state: RootState) => state.researchObjective);

  // Chat State
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [omiStatus, setOmiStatus] = useState<string>("Starting research insight shown here...");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showTemplates, setShowTemplates] = useState<boolean>(false);
  const [prevMessagesLength, setPrevMessagesLength] = useState<number>(0);
  const [hasTriggeredInitialEvent, setHasTriggeredInitialEvent] = useState<boolean>(false);

  // Transform API messages to component format
  const transformMessages = useCallback((apiMessages: any[]): Message[] => {
    if (!apiMessages || !Array.isArray(apiMessages)) return [];

    return apiMessages.map((msg: any, index: number) => ({
      id: msg.id || `msg-${index}`,
      sender: msg.role === 'omi' ? 'omi' : 'user',
      text: msg.content,
      timestamp: new Date(msg.created_at),
      omiState: msg.omi_state,
      workflowStage: msg.workflow_stage,
      messageType: msg.message_type,
      originalData: msg
    }));
  }, []);

  useEffect(() => {
    if (
      !isSubmitting &&
      !isSendingMessage &&
      omiAnimation !== "error" &&
      inputValue.trim().length === 0
    ) {
      setOmiAnimation("greeting");
    }
  }, [isSubmitting, isSendingMessage, omiAnimation, inputValue]);

  useEffect(() => {
    if (inputValue.trim().length > 0 && !isSubmitting) {
      setOmiAnimation("writing");
    }
  }, [inputValue, isSubmitting]);

  useEffect(() => {
    if (!hasTriggeredInitialEvent && sessionData) {
      trigger({
        stage: 'research_objective',
        event: 'RESEARCH_OBJECTIVE_INIT',
        payload: {},
      });
      setHasTriggeredInitialEvent(true);
    }
  }, [sessionData, hasTriggeredInitialEvent, objectiveId, workspaceId, trigger]);

  // Load conversation history when data is available
  useEffect(() => {
    if ((conversationHistoryData as any)?.status === "success" && (conversationHistoryData as any).data?.messages) {
      const transformedMessages = transformMessages((conversationHistoryData as any).data.messages);
      setMessages(transformedMessages);
      setPrevMessagesLength(transformedMessages.length);

      // Update status based on last message
      if (transformedMessages.length > 0) {
        const lastMessage = transformedMessages[transformedMessages.length - 1] as Message | undefined;
        if (lastMessage?.sender === 'omi') {
          setOmiStatus(lastMessage?.omiState === 'thinking'
            ? "Omi is processing..."
            : "Omi is ready");
        } else {
          setOmiStatus("Waiting for Omi's response...");
        }
      }
    }
  }, [conversationHistoryData, transformMessages]);

  // Initialize chat with Omi session greeting if no history exists
  useEffect(() => {
    if ((sessionData as any)?.data?.greeting && messages.length === 0 && !isLoadingHistory) {
      const initialMessage: Message = {
        id: 'greeting-1',
        sender: 'omi',
        text: (sessionData as any).data.greeting,
        timestamp: new Date(),
        sessionId: (sessionData as any).data.session_id
      };
      setMessages([initialMessage]);
      setPrevMessagesLength(1);
      setOmiStatus("Omi is ready to help with your research objective");
    }
  }, [sessionData, messages.length, isLoadingHistory]);

  const lastMessage = messages[messages.length - 1] as Message | undefined;
  const isObjectiveConfirmed = messages.length > 0 &&
    lastMessage?.sender === "omi" &&
    lastMessage?.text?.includes("carry this forward into personas");

  // Auto-adjust textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  // Auto-scroll to bottom of chat when new messages arrive
  useEffect(() => {
    if (messagesContainerRef.current) {
      if (messages.length > prevMessagesLength) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
      setPrevMessagesLength(messages.length);
    }
  }, [messages, prevMessagesLength]);

  const handleTemplateSelect = (template: Template) => {
    setShowTemplates(false);
  };

  useEffect(() => {
    if (selectedTemplate) {
      const templateData = (selectedTemplate as any).data || selectedTemplate;
      const descriptionValue = templateData.description || templateData.title || '';
      setInputValue(descriptionValue);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1] as Message | undefined;
    if (lastMessage?.sender === 'omi' &&
      lastMessage?.text?.includes("carry this forward into personas")) {

      setOmiStatus("Research objective defined! Ready to create personas...");

      trigger({
        stage: 'research_objective',
        event: 'RESEARCH_OBJECTIVE_SUMMARY_SHOWCASE',
        payload: {},
      });
    }
  }, [messages, objectiveId, workspaceId]);

  // ── CTA Handlers ────────────────────────────────────────────────────────

  // ── CHANGE 3: Fire persona generation API immediately on click, then
  //             navigate to the loader. The backend starts building personas
  //             while the user watches the ~7 min loader animation.
  //             By the time the loader finishes and navigates to PersonaBuilder,
  //             the personas are ready to fetch.
  const handleCreateWithOmi = () => {
    trigger({
      stage: 'persona_builder',
      event: 'PERSONA_WORKFLOW_LOADED',
      payload: {},
    });

    // Fire-and-forget: kick off backend generation now, don't await.
    // PersonaBuilder will fetch the completed result when the loader finishes.
    try {
      triggerPersonaGeneration();
    } catch (err) {
      console.error("Failed to kick off persona generation:", err);
    }

    const targetUrl = `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-generating`;
    navigate(targetUrl, { state: { flow: "omi" } });
  };

  const handleBuildManually = () => {
  trigger({
    stage: 'persona_builder',
    event: 'PERSONA_WORKFLOW_LOADED',
    payload: {},
  });
  const targetUrl = `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder/manual`;
  navigate(targetUrl, { state: { flow: "manual" } });
};

  // ── Message sending ──────────────────────────────────────────────────────

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setOmiAnimation("typing");
    if (inputValue.trim() === "" && !uploadedFile) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: inputValue,
      file: uploadedFile,
      timestamp: new Date(),
      sessionId,
    };

    setMessages(prev => [...prev, userMessage]);

    trigger({
      stage: 'research_objective',
      event: 'RESEARCH_OBJECTIVE_SUBMITTED',
      payload: {},
    });

    const messageToSend = inputValue;
    setInputValue("");
    setUploadedFile(null);
    setOmiStatus("Omi is thinking...");

    if (!sessionId) {
      setOmiAnimation("error");
      console.error('No session ID available');
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        sender: 'omi',
        text: "Session not initialized. Please try again.",
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
      setOmiStatus("Session error");
      return;
    }

    sendMessage(messageToSend, {
      onSuccess: (response: any) => {
        if (response.status === "success") {
          const omiMessage: Message = {
            id: `omi-${Date.now()}`,
            sender: 'omi',
            text: response.data.message,
            timestamp: new Date(),
            responseData: response.data,
            omiState: response.data.omi_state,
            suggestions: response.data.suggestions,
            nextSteps: response.data.next_steps
          };

          setMessages(prev => [...prev, omiMessage]);

          trigger({
            stage: 'research_objective',
            event: 'RESEARCH_OBJECTIVE_REFINING',
            payload: {},
          });

          switch (response.data.omi_state) {
            case 'thinking':
              setOmiStatus("Omi is processing your input...");
              break;
            case 'greeting':
              setOmiStatus("Omi is ready for the next step");
              break;
            default:
              setOmiStatus("Omi responded");
          }

          setTimeout(() => {
            refetchHistory();
          }, 500);
        } else {
          setOmiAnimation("error");

          const errorMessage: Message = {
            id: `error-${Date.now()}`,
            sender: 'omi',
            text: "Sorry, I encountered an error. Please try again.",
            timestamp: new Date(),
            isError: true
          };
          setMessages(prev => [...prev, errorMessage]);
          setOmiStatus("Error occurred");
        }
        setIsSubmitting(false);
      },
      onError: (error: any) => {
        setOmiAnimation("error");
        console.error('Failed to send message:', error);
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          sender: 'omi',
          text: "Sorry, I'm having trouble connecting. Please check your connection and try again.",
          timestamp: new Date(),
          isError: true
        };
        setMessages(prev => [...prev, errorMessage]);
        setOmiStatus("Connection error");
        setIsSubmitting(false);
      }
    });

    setIsSubmitting(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploadedFile(e.target.files[0] ?? null);
    }
  };

  const handleRefreshHistory = () => {
    refetchHistory();
  };

  useEffect(() => {
    if (sessionLoading) {
      setOmiStatus("Initializing Omi session...");
    }
    if (sessionError) {
      setOmiStatus("Failed to initialize Omi session");
    }
  }, [sessionLoading, sessionError]);

  const isLoading = sessionLoading || isLoadingHistory;

  // ── Text formatting ──────────────────────────────────────────────────────

  const formatText = (text: string): React.ReactNode => {
    if (!text) return null;

    const processBold = (str: string): React.ReactNode[] => {
      const parts = str.split(/(\*\*.*?\*\*)/g);
      return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-bold text-gray-900 dark:text-white">{part.slice(2, -2)}</strong>;
        }
        return part;
      });
    };

    const preparedText = text.replace(/(📌 Research Objective Summary:)/g, '\n$1\n');

    const lines = preparedText.split('\n');
    const elements: React.ReactNode[] = [];
    let currentList: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentList.length > 0) {
          elements.push(<ul key={`ul-${index}`} className="my-3 space-y-1">{currentList}</ul>);
          currentList = [];
        }
        elements.push(<div key={`br-${index}`} className="h-4" />);
        return;
      }

      const isListItem = trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ') || /^\d+\.\s/.test(trimmed);

      if (isListItem) {
        const content = trimmed.replace(/^([-*•]|\d+\.)\s+/, '');
        currentList.push(
          <li key={`li-${index}`} className="ml-5 list-disc marker:text-blue-500 pl-1 mb-1 leading-relaxed text-gray-800 dark:text-gray-200">
            {processBold(content)}
          </li>
        );
      } else {
        if (currentList.length > 0) {
          elements.push(<ul key={`ul-${index}`} className="my-3 space-y-1">{currentList}</ul>);
          currentList = [];
        }

        const isHeader = trimmed.includes('📌 Research Objective Summary:');

        if (!isHeader && trimmed.length > 300 && trimmed.split(/[.!?]\s/).length > 3) {
          const sentences = trimmed.split(/([.!?]\s)/);
          const midPoint = Math.ceil(sentences.length / 4) * 2;
          const firstPart = sentences.slice(0, midPoint).join('').trim();
          const secondPart = sentences.slice(midPoint).join('').trim();

          if (firstPart && secondPart) {
            elements.push(<p key={`p-${index}-a`} className="mb-4 leading-relaxed text-gray-800 dark:text-gray-200">{processBold(firstPart)}</p>);
            elements.push(<p key={`p-${index}-b`} className="mb-4 last:mb-0 leading-relaxed text-gray-800 dark:text-gray-200">{processBold(secondPart)}</p>);
            return;
          }
        }

        elements.push(
          <p
            key={`p-${index}`}
            className={`mb-4 last:mb-0 leading-relaxed text-gray-800 dark:text-gray-200 ${isHeader ? 'font-bold text-lg text-blue-600 dark:text-blue-400 mt-2' : ''}`}
          >
            {processBold(line)}
          </p>
        );
      }
    });

    if (currentList.length > 0) {
      elements.push(<ul key="ul-final" className="my-3 space-y-1">{currentList}</ul>);
    }

    return elements;
  };

  const renderMessageWithPersonaButton = (message: Message): React.ReactNode => {
    const text = message.text;

    if (message.sender === 'omi' && text.includes("carry this forward into personas")) {
      const parts = text.split("carry this forward into personas");

      return (
        <div className="space-y-1">
          {formatText(parts[0] ?? '')}
          <span className="font-bold text-gray-900 dark:text-white inline-block mt-2">carry this forward into personas</span>
          {formatText(parts[1] ?? '')}
        </div>
      );
    }

    return <div className="space-y-1">{formatText(text)}</div>;
  };

  const isSummaryMessage = (message: Message): boolean =>
    message.sender === 'omi' && message.text?.includes("carry this forward into personas");

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="aro-container">
      <div className="aro-chat-wrapper">

        {/* Messages List */}
        <div ref={messagesContainerRef} className="aro-messages">
          {isLoading ? (
            <div className="aro-state-center">
              <div className="aro-state-inner">
                <TbLoader className="aro-spinner" />
                <p className="aro-state-text">
                  {sessionLoading ? "Initializing Omi session..." : "Loading conversation history..."}
                </p>
              </div>
            </div>
          ) : sessionError ? (
            <div className="aro-state-center">
              <div className="aro-error-box">
                <p className="aro-error-text">Failed to initialize chat session.</p>
                <button onClick={() => refetchSession()} className="aro-retry-btn">
                  Try again
                </button>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="aro-state-center">
              <div className="aro-state-inner">
                <div className="aro-empty-avatar">
                  <TbRobot size={32} />
                </div>
                <p className="aro-state-text">Starting conversation with Omi...</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={`aro-message-row ${message.sender === 'user' ? 'aro-message-row--user' : 'aro-message-row--omi'}`}
                >
                  <div className={`aro-bubble-wrapper ${message.sender === 'user' ? 'aro-bubble-wrapper--user' : 'aro-bubble-wrapper--omi'}`}>
                    <div className={`aro-bubble ${
                      message.sender === 'omi'
                        ? message.isError
                          ? 'aro-bubble--omi-error'
                          : isSummaryMessage(message)
                            ? 'aro-bubble--omi-summary'
                            : 'aro-bubble--omi'
                        : 'aro-bubble--user'
                    }`}>
                      {message.sender === 'omi' && !isSummaryMessage(message) && (
                        <div className="aro-omi-avatar">
                          <video
                            key={message.isError ? "error" : omiAnimation}
                            className="aro-omi-video"
                            src={message.isError ? OmiCaution : getOmiVideo()}
                            autoPlay
                            loop
                            muted
                            playsInline
                          />
                        </div>
                      )}
                      <div className="aro-bubble-text">
                        {renderMessageWithPersonaButton(message)}
                        {message.file && (
                          <div className="aro-bubble-file">
                            <TbPaperclip size={16} />
                            <span className="aro-bubble-file-name">{(message.file as File).name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="aro-timestamp">
                      {message.sender === 'omi' ? 'Omi' : 'You'} • {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
              ))}
              <div ref={chatEndRef} />
            </>
          )}
        </div>

        {isObjectiveConfirmed ? (
          <motion.div
            className="aro-cta-section"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <p className="aro-cta-heading">
              All set. Now let's bring the personas to life.
            </p>
            <div className="aro-cta-buttons">
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                onClick={handleCreateWithOmi}
                className="aro-btn-omi"
              >
                <TbSparkles size={16} />
                <span>Create with Omi</span>
              </motion.button>

              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                onClick={handleBuildManually}
                className="aro-btn-manual"
              >
                <TbPencil size={16} />
                <span>Build Manually</span>
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <div className="aro-input-bar">
            <form onSubmit={handleSendMessage} className="aro-input-form">

              <label className="aro-input-file-label">
                <TbPaperclip size={20} />
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isSubmitting || isLoading || !sessionData}
                />
              </label>

              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Typing..."
                className="aro-textarea"
                rows={1}
                disabled={isSubmitting || isLoading || !sessionData}
              />

              <button
                type="button"
                className="aro-input-icon-btn"
                disabled={isSubmitting || isLoading || !sessionData}
              >
                <TbMicrophone size={20} />
              </button>

              <button
                type="submit"
                className="aro-send-btn"
                disabled={isSubmitting || isLoading || !sessionData || (inputValue.trim() === "" && !uploadedFile)}
              >
                {isSubmitting || isSendingMessage
                  ? <TbLoader className="aro-spinner" size={18} />
                  : <TbSend size={18} />
                }
              </button>
            </form>

            {uploadedFile && (
              <div className="aro-file-pill">
                <TbPaperclip size={14} />
                <span className="aro-file-pill-name">{uploadedFile.name}</span>
                <button
                  className="aro-file-pill-remove"
                  onClick={() => setUploadedFile(null)}
                  disabled={isSubmitting}
                >
                  ×
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AddResearchObjective;