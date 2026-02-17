import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from "framer-motion";
import {
  TbArrowLeft,
  TbPaperclip,
  TbMicrophone,
  TbBulb,
  TbSend,
  TbRobot,
  TbUser,
  TbLoader,
  TbRefresh,
  TbSparkles
} from "react-icons/tb";
import { useTheme } from "../../../../../context/ThemeContext";
import {
  useInitializeOmiSession,
  useSendMessageToOmi,
  useCreateResearchObjective,
  useConversationHistory
} from "../../../../../hooks/useOmiChat";
import { useOmniWorkflow } from '../../../../../hooks/useOmiWorkflow';

const AddResearchObjective = () => {
  const navigate = useNavigate();
  const { trigger } = useOmniWorkflow();
  const { theme } = useTheme();
  const { workspaceId, explorationId } = useParams();
  const dispatch = useDispatch();
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesContainerRef = useRef(null); // Ref for messages container

  // TanStack Query Hooks
  const {
    data: sessionData,
    isLoading: sessionLoading,
    error: sessionError,
    refetch: refetchSession
  } = useInitializeOmiSession(explorationId);

  // Conversation history hook
  const {
    data: conversationHistoryData,
    isLoading: isLoadingHistory,
    error: historyError,
    refetch: refetchHistory
  } = useConversationHistory(workspaceId, explorationId);

  const sessionId = sessionData?.data?.session_id;
  const {
    mutate: sendMessage,
    isLoading: isSendingMessage
  } = useSendMessageToOmi(explorationId, sessionId);

  const { mutate: createResearchObjective } = useCreateResearchObjective();

  // Redux state
  const {
    templates,
    selectedTemplate,
    selectedObjective,
    objectives,
    loading: templatesLoading,
    error: templatesError
  } = useSelector((state) => state.researchObjective);

  // Chat State
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [omiStatus, setOmiStatus] = useState("Starting research insight shown here...");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [prevMessagesLength, setPrevMessagesLength] = useState(0); // Track previous messages length
  const [hasTriggeredInitialEvent, setHasTriggeredInitialEvent] = useState(false);

  // Transform API messages to component format
  const transformMessages = useCallback((apiMessages) => {
    if (!apiMessages || !Array.isArray(apiMessages)) return [];

    return apiMessages.map((msg, index) => ({
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
    if (!hasTriggeredInitialEvent && sessionData) {
      trigger({
        stage: 'research_objective',
        event: 'RESEARCH_OBJECTIVE_INIT',
        payload: {},
      });
      setHasTriggeredInitialEvent(true);
    }
  }, [sessionData, hasTriggeredInitialEvent, explorationId, workspaceId, trigger]);

  // Load conversation history when data is available
  useEffect(() => {
    if (conversationHistoryData?.status === "success" && conversationHistoryData.data?.messages) {
      const transformedMessages = transformMessages(conversationHistoryData.data.messages);
      setMessages(transformedMessages);
      setPrevMessagesLength(transformedMessages.length);

      // Update status based on last message
      if (transformedMessages.length > 0) {
        const lastMessage = transformedMessages[transformedMessages.length - 1];
        if (lastMessage.sender === 'omi') {
          setOmiStatus(lastMessage.omiState === 'thinking'
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
    if (sessionData?.data?.greeting && messages.length === 0 && !isLoadingHistory) {
      const initialMessage = {
        id: 'greeting-1',
        sender: 'omi',
        text: sessionData.data.greeting,
        timestamp: new Date(),
        sessionId: sessionData.data.session_id
      };
      setMessages([initialMessage]);
      setPrevMessagesLength(1);
      setOmiStatus("Omi is ready to help with your research objective");
    }
  }, [sessionData, messages.length, isLoadingHistory]);
  const isObjectiveConfirmed = messages.length > 0 &&
    messages[messages.length - 1].sender === "omi" &&
    messages[messages.length - 1].text?.includes("carry this forward into personas");

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
      // Only scroll if new messages were added (not on initial load)
      if (messages.length > prevMessagesLength) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
      setPrevMessagesLength(messages.length);
    }
  }, [messages, prevMessagesLength]);

  const handleTemplateSelect = (template) => {
    // Your existing template selection logic
    setShowTemplates(false);
  };

  useEffect(() => {
    if (selectedTemplate) {
      const templateData = selectedTemplate.data || selectedTemplate;
      const descriptionValue = templateData.description || templateData.title || '';
      setInputValue(descriptionValue);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.sender === 'omi' &&
      lastMessage?.text?.includes("carry this forward into personas")) {

      setOmiStatus("Research objective defined! Ready to create personas...");

      trigger({
        stage: 'research_objective',
        event: 'RESEARCH_OBJECTIVE_SUMMARY_SHOWCASE',
        payload: {},
      });
    }
  }, [messages, explorationId, workspaceId]);

  const handleCreatePersonas = () => {
    // createResearchObjective(explorationId, {
    //   onSuccess: () => {
    //     trigger({
    //       stage: 'persona_builder',
    //       event: 'PERSONA_WORKFLOW_LOADED',
    //       payload: {},
    //     });

    //     const targetUrl = `/main/organization/workspace/research-objectives/${workspaceId}/${explorationId}/persona-builder`;
    //     navigate(targetUrl);
    //   },
    //   onError: (error) => {
    //     console.error('Failed to create research objective:', error);
    //   }
    // });
    trigger({
      stage: 'persona_builder',
      event: 'PERSONA_WORKFLOW_LOADED',
      payload: {},
    });

    const targetUrl = `/main/organization/workspace/research-objectives/${workspaceId}/${explorationId}/persona-builder`;
    navigate(targetUrl);
  };

  const handleSendMessage = (e) => {
    if (e) e.preventDefault();
    if (inputValue.trim() === "" && !uploadedFile) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: inputValue,
      file: uploadedFile,
      timestamp: new Date(),
      sessionId,
    };

    setMessages(prev => [...prev, userMessage]);

    // Trigger RESEARCH_OBJECTIVE_SUBMITTED event
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
      console.error('No session ID available');
      const errorMessage = {
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

    // Send message to Omi API
    sendMessage(messageToSend, {
      onSuccess: (response) => {
        if (response.status === "success") {
          const omiMessage = {
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

          // Trigger RESEARCH_OBJECTIVE_REFINING event after getting response
          trigger({
            stage: 'research_objective',
            event: 'RESEARCH_OBJECTIVE_REFINING',
            payload: {},
          });

          // Update Omi status based on state
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

          // Refetch conversation history to get updated messages
          setTimeout(() => {
            refetchHistory();
          }, 500);
        } else {
          // Handle error response
          const errorMessage = {
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
      onError: (error) => {
        console.error('Failed to send message:', error);
        const errorMessage = {
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

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setUploadedFile(e.target.files[0]);
    }
  };

  // Handle refresh conversation history
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

  // Helper to format text with bullet points and bolding
  const formatText = (text) => {
    if (!text) return null;

    // Match bold text: **text**
    const processBold = (str) => {
      const parts = str.split(/(\*\*.*?\*\*)/g);
      return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-bold text-gray-900 dark:text-white">{part.slice(2, -2)}</strong>;
        }
        return part;
      });
    };

    // Pre-process: Ensure the summary header starts on a new line
    const preparedText = text.replace(/(📌 Research Objective Summary:)/g, '\n$1\n');

    const lines = preparedText.split('\n');
    const elements = [];
    let currentList = [];

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

      // Detect bullet points or numbered lists
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

        // Special handling for the summary header line
        const isHeader = trimmed.includes('📌 Research Objective Summary:');

        // If the paragraph is very long (no newlines from backend), split it into 2 paragraphs after 3-4 sentences
        if (!isHeader && trimmed.length > 300 && trimmed.split(/[.!?]\s/).length > 3) {
          const sentences = trimmed.split(/([.!?]\s)/);
          const midPoint = Math.ceil(sentences.length / 4) * 2; // Rough halfway point
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

  // Function to render message with persona builder button
  const renderMessageWithPersonaButton = (message) => {
    const text = message.text;

    if (message.sender === 'omi' && text.includes("carry this forward into personas")) {
      // Split the text to find where to insert the button
      const parts = text.split("carry this forward into personas");

      return (
        <div>
          <div className="space-y-1">
            {formatText(parts[0])}
            <span className="font-bold text-gray-900 dark:text-white inline-block mt-2">carry this forward into personas</span>
            {formatText(parts[1])}
          </div>

          {/* Persona Builder Button */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            onClick={handleCreatePersonas}
            className="mt-4 flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all active:scale-95 group"
          >
            <TbSparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            <span>Create Personas</span>
          </motion.button>

          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Click to start building personas based on your research objective
          </p>
        </div>
      );
    }

    return <div className="space-y-1">{formatText(text)}</div>;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] max-w-7xl mx-auto px-4 py-2 relative">
      <div className="flex justify-between items-center mb-0 flex-shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => navigate(`/main/organization/workspace/explorations/${workspaceId}`)}
              className="p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors"
              title="Go to Explorations"
            >
              <TbArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Research Objective
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Set the purpose, coverage, and hypotheses for this exploration.
          </p>
        </div>

        <div className="relative">
          <AnimatePresence>
            {showTemplates && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 mt-3 w-80 bg-white dark:bg-[#1a1f2e] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
              >
                <div className="p-4 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-gray-50/50 dark:bg-white/5">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">Choose a Template</span>
                  <button onClick={() => setShowTemplates(false)} className="text-gray-400 hover:text-gray-600">×</button>
                </div>
                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                  {templatesLoading ? (
                    <div className="p-6 text-center text-gray-500 text-sm">Loading templates...</div>
                  ) : (
                    templates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleTemplateSelect(t)}
                        className="w-full text-left p-4 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors border-b last:border-0 border-gray-100 dark:border-white/5 group"
                      >
                        <h4 className="font-bold text-gray-900 dark:text-white text-sm mb-1 group-hover:text-blue-600 transition-colors">{t.title}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{t.description}</p>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex-grow bg-white/40 dark:bg-white/5 backdrop-blur-md border border-gray-200 dark:border-white/10 rounded-3xl shadow-xl flex flex-col overflow-hidden">
        {/* Messages List */}
        <div
          ref={messagesContainerRef} // Attach ref here
          className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar"
        >
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <div className="text-center">
                <TbLoader className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-500" />
                <p className="text-gray-500 dark:text-gray-400">
                  {sessionLoading ? "Initializing Omi session..." : "Loading conversation history..."}
                </p>
              </div>
            </div>
          ) : sessionError ? (
            <div className="flex justify-center items-center h-full">
              <div className="text-center p-4 bg-red-50 dark:bg-red-500/10 rounded-xl">
                <p className="text-red-600 dark:text-red-400">Failed to initialize chat session.</p>
                <button
                  onClick={() => refetchSession()}
                  className="mt-2 text-sm text-blue-500 hover:text-blue-600"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex justify-center items-center h-full">
              <div className="text-center">
                <TbRobot className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-500 dark:text-gray-400">Starting conversation with Omi...</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={`flex items-start gap-3 ${message.sender === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border ${message.sender === 'omi'
                    ? 'bg-blue-100 dark:bg-blue-500/20 border-blue-200 dark:border-blue-500/30 text-blue-600'
                    : 'bg-white/80 dark:bg-black/20 border-gray-200 dark:border-white/10 text-gray-600 dark:text-white'
                    }`}>
                    {message.sender === 'omi' ? <TbRobot size={22} /> : <TbUser size={22} />}
                  </div>

                  <div className={`flex flex-col max-w-[80%] ${message.sender === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`p-4 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed ${message.sender === 'omi'
                      ? message.isError
                        ? 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-300'
                        : 'bg-white dark:bg-[#1e2536] border border-gray-100 dark:border-white/10 rounded-tl-none text-gray-800 dark:text-gray-200'
                      : 'bg-blue-600 text-white rounded-tr-none'
                      }`}>
                      {renderMessageWithPersonaButton(message)}
                      {message.file && (
                        <div className="mt-2 p-2 bg-white/10 rounded-lg flex items-center gap-2 border border-white/20">
                          <TbPaperclip size={16} />
                          <span className="text-xs truncate max-w-[200px]">{message.file.name}</span>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 mt-1 uppercase font-medium tracking-wider">
                      {message.sender === 'omi' ? 'omi' : 'you'} • {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
              ))}
              <div ref={chatEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-gray-50/50 dark:bg-black/20 border-t border-gray-100 dark:border-white/5 mb-4">
          <form onSubmit={handleSendMessage} className="relative flex items-end gap-3 bg-white dark:bg-[#0d121f]/80 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-blue-500/30 transition-all">
            <div className="flex h-12 items-center px-2">
              <label className="cursor-pointer p-2 text-gray-400 hover:text-blue-500 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                <TbPaperclip size={22} />
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isSubmitting || isLoading || !sessionData || isObjectiveConfirmed}
                />
              </label>
            </div>

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
              placeholder="Type your research objective here..."
              className="flex-grow bg-transparent border-none focus:ring-0 outline-none resize-none py-3 text-sm md:text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 min-h-[48px] custom-scrollbar h-auto"
              rows={1}
              disabled={isSubmitting || isLoading || !sessionData || isObjectiveConfirmed}
            />

            <div className="flex gap-2 p-1">
              <button
                type="button"
                className="p-2.5 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-all disabled:opacity-50"
                disabled={isSubmitting || isLoading || !sessionData || isObjectiveConfirmed}
              >
                <TbMicrophone size={22} />
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isLoading || !sessionData || isObjectiveConfirmed || (inputValue.trim() === "" && !uploadedFile)}
                className="flex items-center justify-center w-11 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/20 disabled:bg-gray-300 dark:disabled:bg-gray-800 disabled:shadow-none transition-all"
              >
                {isSubmitting || isSendingMessage ? <TbLoader className="animate-spin" size={20} /> : <TbSend size={20} />}
              </button>
            </div>
          </form>

          {uploadedFile && (
            <div className="mt-2 flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-500/10 rounded-full w-fit border border-blue-100 dark:border-blue-500/20">
              <TbPaperclip size={14} className="text-blue-600" />
              <span className="text-xs text-blue-700 dark:text-blue-400 font-medium truncate max-w-[150px]">{uploadedFile.name}</span>
              <button
                onClick={() => setUploadedFile(null)}
                className="text-blue-600 hover:text-red-500 ml-1"
                disabled={isSubmitting}
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); }
      `}} />
    </div>
  );
};

export default AddResearchObjective;