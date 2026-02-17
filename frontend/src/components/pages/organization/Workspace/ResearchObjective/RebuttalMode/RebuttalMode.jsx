import React, { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from "framer-motion";
import {
  TbArrowLeft,
  TbSend,
  TbMessageChatbot,
  TbUser,
  TbLoader,
  TbChevronRight,
  TbChevronDown,
  TbCheck,
  TbInfoCircle,
  TbAlertCircle,
  TbMessage2,
  TbHistory,
  TbClock,
  TbMessages,
  TbX
} from "react-icons/tb";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTheme } from "../../../../../../context/ThemeContext";
import {
  useRebuttalQuestions,
  useStartRebuttal,
  useSendReply,
  useRebuttalSession,
  useRebuttalSessions
} from '../../../../../../hooks/useRebuttalQueries';
import logoForDark from "../../../../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../../../../assets/Logo_Light_bg.png";
import PremiumButton from '../../../../../common/PremiumButton';
import { BsRobot } from 'react-icons/bs';

const ChatBubble = ({ message, sender, metadata, timestamp }) => {
  const { theme } = useTheme();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-end gap-3 mb-6 ${sender === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      {sender === 'assistant' && (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white shadow-lg shrink-0">
          <TbMessageChatbot size={18} />
        </div>
      )}

      <div className={`px-5 py-3 rounded-2xl max-w-lg text-sm leading-relaxed shadow-sm ${sender === 'user'
        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-br-sm'
        : 'bg-white dark:bg-white/10 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-white/10 rounded-bl-sm backdrop-blur-sm'
        }`}>
        <div className="mb-1">{message}</div>

        {metadata?.explainers && metadata.explainers.length > 0 && (
          <div className={`mt-3 pt-3 border-t ${sender === 'user' ? 'border-blue-400/30' : 'border-gray-200 dark:border-white/10'}`}>
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Key Insights:</div>
            <ul className="space-y-1">
              {metadata.explainers.map((explainer, idx) => (
                <li key={idx} className="flex items-start text-xs text-gray-600 dark:text-gray-300">
                  <span className="mr-2 mt-0.5 text-blue-500">•</span>
                  <span>{explainer}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {timestamp && (
          <div className={`text-xs mt-2 ${sender === 'user' ? 'text-blue-200' : 'text-gray-500 dark:text-gray-400'}`}>
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {sender === 'user' && (
        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 shadow-lg shrink-0">
          <TbUser size={18} />
        </div>
      )}
    </motion.div>
  );
};

const SessionItem = ({ session, isActive, onClick }) => {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl mb-3 transition-all duration-200 border ${isActive
        ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30'
        : 'bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10'
        }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isActive
          ? 'bg-white/20'
          : 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
          }`}>
          <TbMessages size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate mb-1">{session.question_text}</div>
          <div className="flex items-center gap-3 text-xs opacity-80">
            <div className="flex items-center gap-1">
              <TbMessage2 size={12} />
              <span>{session.message_count} messages</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
};

const RebuttalMode = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId, objectiveId } = useParams();
  const location = useLocation();
  const { theme } = useTheme();
  const chatEndRef = useRef(null);
  const dropdownContainerRef = useRef(null);

  // Get parameters from navigation state
  const { personaId, simulationId, personaName, sampleSize, surveyResults } = location.state || {};

  // State for UI
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [showQuestionDropdown, setShowQuestionDropdown] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [localMessages, setLocalMessages] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isNewSessionMode, setIsNewSessionMode] = useState(true);

  // Use explorationId from params
  const explorationId = objectiveId;

  // TanStack Query hooks
  const {
    data: questionsData,
    isLoading: isLoadingQuestions,
    error: questionsError,
    refetch: refetchQuestions
  } = useRebuttalQuestions(workspaceId, explorationId, { simulation_id: simulationId, survey_simulation_id: surveyResults?.id }, true);

  const {
    data: sessionsData = [],
    isLoading: isLoadingSessions,
    error: sessionsError,
    refetch: refetchSessions
  } = useRebuttalSessions(workspaceId, explorationId, true);

  const startRebuttalMutation = useStartRebuttal();
  const sendReplyMutation = useSendReply();

  // Fetch session data if we have an active session
  const {
    data: sessionData,
    isLoading: isLoadingSession,
    refetch: refetchSession
  } = useRebuttalSession(
    workspaceId,
    explorationId,
    activeSessionId,
    !!activeSessionId
  );

  // Extract questions from API response
  const allQuestions = React.useMemo(() => {
    if (!questionsData || !Array.isArray(questionsData)) return [];

    return questionsData.flatMap(section =>
      (section.questions || []).map(q => ({
        ...q,
        sectionTitle: section.title
      }))
    );
  }, [questionsData]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showQuestionDropdown &&
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(event.target)) {
        setShowQuestionDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showQuestionDropdown]);

  // Process messages from session data
  useEffect(() => {
    if (sessionData?.messages) {
      const processedMessages = sessionData.messages.map(msg => ({
        sender: msg.role === 'user' ? 'user' : 'assistant',
        message: msg.text,
        metadata: msg.metadata,
        timestamp: msg.ts
      }));

      // Add starter message if not already in messages
      if (sessionData.starter_message && !processedMessages.find(m => m.message === sessionData.starter_message)) {
        processedMessages.unshift({
          sender: 'assistant',
          message: sessionData.starter_message,
          timestamp: sessionData.created_at
        });
      }

      setLocalMessages(processedMessages);
    } else if (activeSessionId && sessionData?.starter_message) {
      setLocalMessages([{
        sender: 'assistant',
        message: sessionData.starter_message,
        timestamp: sessionData.created_at
      }]);
    }
  }, [sessionData, activeSessionId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    // chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  // Reset to new session mode when question is selected from dropdown
  useEffect(() => {
    if (selectedQuestion) {
      setIsNewSessionMode(true);
    }
  }, [selectedQuestion]);

  const handleEndExploration = async () => {
    try {
      // Import explorationService
      const { explorationService } = await import('../../../../../../services/explorationService');

      // Call the API to end the exploration
      await explorationService.endExploration(objectiveId);

      // Invalidate the explorations list query to refresh the data
      queryClient.invalidateQueries({ queryKey: ['explorations'] });

      // Navigate to exploration list
      navigate(`/main/organization/workspace/explorations/${workspaceId}`);
    } catch (error) {
      console.error('Error ending exploration:', error);
      // Still navigate even if API call fails
      navigate(`/main/organization/workspace/explorations/${workspaceId}`);
    }
  };

  // Handle clicking on a session from sidebar
  const handleSessionClick = (session) => {
    setActiveSessionId(session.id);
    setSelectedQuestion({
      id: session.question_id,
      text: session.question_text
    });
    setIsNewSessionMode(false);
  };

  // Handle starting a new rebuttal session
  const handleStartRebuttal = async () => {
    if (!selectedQuestion || !personaId || !simulationId) return;

    try {
      const result = await startRebuttalMutation.mutateAsync({
        workspaceId,
        explorationId,
        data: {
          // exploration_id: explorationId,
          persona_id: personaId,
          simulation_id: simulationId,
          question_id: selectedQuestion.id
        }
      });

      if (result.session_id) {
        setActiveSessionId(result.session_id);
        setLocalMessages([{
          sender: 'assistant',
          message: result.starter_message,
          timestamp: new Date().toISOString()
        }]);

        // Refetch sessions to include the new one
        refetchSessions();
        setIsNewSessionMode(false);
      }
    } catch (error) {
      console.error('Failed to start rebuttal:', error);
    }
  };

  // Handle sending a message
  const handleSendMessage = async () => {
    if (!inputValue.trim() || !activeSessionId) return;

    const userMessage = inputValue.trim();

    // Add user message immediately
    const tempUserMessage = {
      sender: 'user',
      message: userMessage,
      timestamp: new Date().toISOString()
    };

    setLocalMessages(prev => [...prev, tempUserMessage]);
    setInputValue('');

    try {
      const result = await sendReplyMutation.mutateAsync({
        workspaceId,
        explorationId,
        data: {
          session_id: activeSessionId,
          user_message: userMessage
        }
      });

      if (result.llm_response) {
        // Add AI response
        const aiMessage = {
          sender: 'assistant',
          message: result.llm_response,
          metadata: result.metadata,
          timestamp: new Date().toISOString()
        };

        setLocalMessages(prev => [...prev, aiMessage]);

        // Refetch session and sessions list
        refetchSession();
        refetchSessions();
      }
    } catch (error) {
      console.error('Failed to send message:', error);

      setLocalMessages(prev => [...prev, {
        sender: 'assistant',
        message: 'Sorry, I encountered an error processing your message. Please try again.',
        timestamp: new Date().toISOString()
      }]);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle creating a new session
  const handleNewSession = () => {
    setActiveSessionId(null);
    setLocalMessages([]);
    setIsNewSessionMode(true);
  };

  const isCurrentTopicStarted = !!activeSessionId;
  const activeSession = sessionsData.find(s => s.id === activeSessionId);

  // Check if selected question is from active session
  const isSelectedQuestionFromActiveSession = activeSession &&
    selectedQuestion &&
    selectedQuestion.id === activeSession.question_id;

  // Loading state
  if (isLoadingQuestions && allQuestions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <TbLoader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 relative transition-colors duration-300 min-h-[calc(100vh-100px)] flex flex-col">
      <div className="max-w-7xl mx-auto relative z-10 w-full flex-grow flex flex-col">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => navigate(-1)}
                className="p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors"
                title="Go Back"
              >
                <TbArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Rebuttal Mode
                </h1>
              </div>
            </div>
            <p className="text-gray-600 dark:text-gray-400 max-w-2xl text-sm">
              Dive deeper into your research by challenging the persona with follow-up questions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <PremiumButton
              variant="primary"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700"
              onClick={handleEndExploration}
            >
              End Exploration
            </PremiumButton>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-sm"
            >
              <TbHistory size={18} />
              <span>{sidebarOpen ? 'Hide History' : 'Show History'}</span>
            </button>
          </div>
        </motion.div>

        {/* Main Content with Sidebar */}
        <div className="flex gap-6 flex-grow min-h-0">
          {/* Sidebar - Session History */}
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -20, width: 0 }}
                animate={{ opacity: 1, x: 0, width: 320 }}
                exit={{ opacity: 0, x: -20, width: 0 }}
                className="hidden md:block flex-shrink-0 overflow-hidden"
              >
                <div className="h-full bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
                      <TbHistory size={20} />
                      Session History
                    </h3>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">
                      {sessionsData?.length || 0} sessions
                    </span>
                  </div>

                  <div className="flex-grow overflow-y-auto custom-scrollbar pr-1">
                    {isLoadingSessions ? (
                      <div className="flex items-center justify-center py-10">
                        <TbLoader className="w-5 h-5 animate-spin text-blue-600" />
                        <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading...</span>
                      </div>
                    ) : sessionsError ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <TbAlertCircle className="w-8 h-8 mx-auto mb-2" />
                        <span className="text-xs">Failed to load sessions</span>
                      </div>
                    ) : sessionsData && sessionsData.length > 0 ? (
                      sessionsData.map(session => (
                        <SessionItem
                          key={session.id}
                          session={session}
                          isActive={activeSessionId === session.id}
                          onClick={() => handleSessionClick(session)}
                        />
                      ))
                    ) : (
                      <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                        <TbMessage2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-xs">No previous sessions</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col gap-6 min-w-0">
            {/* Question Selection */}
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl p-5 relative z-50"
            >
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-grow">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 block tracking-wider">
                    Select Question Topic
                  </label>
                  <div className="relative" ref={dropdownContainerRef}>
                    <button
                      onClick={() => setShowQuestionDropdown(!showQuestionDropdown)}
                      disabled={!personaId || !simulationId}
                      className={`w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl transition-all font-medium text-sm text-gray-800 dark:text-gray-100 shadow-sm hover:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${showQuestionDropdown ? 'border-blue-500 ring-2 ring-blue-500/20' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        {selectedQuestion ? (
                          <>
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 bg-blue-100 dark:bg-blue-500 text-blue-700 dark:text-white">
                              {selectedQuestion.id.substring(0, 3)}
                            </div>
                            <div className="text-left">
                              <div className="font-semibold truncate max-w-[400px]">{selectedQuestion.text}</div>
                              {selectedQuestion.sectionTitle && (
                                <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-tight">
                                  {selectedQuestion.sectionTitle}
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-500 italic">
                            {!personaId || !simulationId ? 'Select parameters first' : 'Choose a question topic and start conversation...'}
                          </span>
                        )}
                      </div>
                      <TbChevronDown className={`transform transition-transform duration-300 ${showQuestionDropdown ? 'rotate-180' : ''} text-gray-400`} />
                    </button>

                    <AnimatePresence>
                      {showQuestionDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-[#1a1f2e] border border-gray-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto z-[100] custom-scrollbar"
                        >
                          <div className="p-2 space-y-1">
                            {allQuestions.map(q => (
                              <button
                                key={q.id}
                                onClick={() => {
                                  setSelectedQuestion(q);
                                  setShowQuestionDropdown(false);
                                }}
                                className={`w-full text-left p-3 rounded-lg transition-all flex items-start gap-4 ${selectedQuestion?.id === q.id
                                  ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-900 dark:text-blue-100'
                                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/10'
                                  }`}
                              >
                                <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${selectedQuestion?.id === q.id
                                  ? 'bg-blue-100 dark:bg-blue-500 text-blue-700 dark:text-white'
                                  : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400'
                                  }`}>
                                  {q.id.substring(0, 3)}
                                </div>
                                <div className="flex-1 text-sm">
                                  <div className="font-semibold leading-snug">{q.text}</div>
                                  <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase mt-1 font-bold">
                                    {q.sectionTitle}
                                  </div>
                                </div>
                                {selectedQuestion?.id === q.id && <TbCheck className="text-blue-600 shrink-0 mt-1" />}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="md:pt-6">
                  <button
                    onClick={handleStartRebuttal}
                    disabled={
                      isLoadingQuestions ||
                      !selectedQuestion ||
                      !personaId ||
                      !simulationId ||
                      (isCurrentTopicStarted && isSelectedQuestionFromActiveSession) ||
                      startRebuttalMutation.isPending
                    }
                    className={`w-full md:w-auto flex items-center justify-center gap-2 py-4 px-8 rounded-xl font-bold shadow-lg transition-all ${!selectedQuestion || !personaId || !simulationId || (isCurrentTopicStarted && isSelectedQuestionFromActiveSession)
                      ? 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed shadow-none'
                      : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-[1.02]'
                      }`}
                  >
                    {startRebuttalMutation.isPending ? (
                      <>
                        <TbLoader className="w-5 h-5 animate-spin" />
                        <span>Starting...</span>
                      </>
                    ) : (
                      <>
                        <span>{isCurrentTopicStarted && isSelectedQuestionFromActiveSession ? 'Session Active' : 'Start Rebuttal'}</span>
                        {!(isCurrentTopicStarted && isSelectedQuestionFromActiveSession) && <TbChevronRight size={18} />}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Chat Interface */}
            <div className="flex-grow flex flex-col bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden relative min-h-0">
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-0.5 shadow-lg">
                    <div className="w-full h-full bg-white dark:bg-black rounded-[10px] flex items-center justify-center">
                      <BsRobot className="w-6 h-6 text-blue-500" />
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm">AI Research Moderator</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isCurrentTopicStarted ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">
                        {isCurrentTopicStarted ? 'Active Session' : 'Ready to start'}
                      </span>
                    </div>
                  </div>
                </div>

                {isCurrentTopicStarted && (
                  <button
                    onClick={handleNewSession}
                    className="p-2 hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-all rounded-lg"
                    title="End Current Session"
                  >
                    <TbX size={20} />
                  </button>
                )}
              </div>

              {/* Chat Area */}
              <div className="flex-grow overflow-y-auto p-6 space-y-2 custom-scrollbar flex flex-col min-h-0 bg-gray-50/20 dark:bg-black/10">
                {isLoadingSession ? (
                  <div className="flex-grow flex items-center justify-center">
                    <div className="text-center">
                      <TbLoader className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                      <p className="text-sm font-medium text-gray-500">Retrieving conversation...</p>
                    </div>
                  </div>
                ) : localMessages.length > 0 ? (
                  <>
                    <AnimatePresence>
                      {localMessages.map((msg, index) => (
                        <ChatBubble
                          key={index}
                          sender={msg.sender}
                          message={msg.message}
                          metadata={msg.metadata}
                          timestamp={msg.timestamp}
                        />
                      ))}
                    </AnimatePresence>

                    {sendReplyMutation.isPending && (
                      <div className="flex items-end gap-3 mb-6 justify-start">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white shadow-lg shrink-0">
                          <TbLoader className="animate-spin" size={16} />
                        </div>
                        <div className="px-5 py-3 rounded-2xl bg-white dark:bg-white/10 text-gray-400 border border-gray-100 dark:border-white/10 rounded-bl-sm backdrop-blur-sm shadow-sm text-xs italic">
                          Moderator is thinking...
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </>
                ) : (
                  <div className="flex-grow flex flex-col items-center justify-center text-center p-12 opacity-50">
                    <div className="w-24 h-24 bg-blue-50 dark:bg-blue-500/10 rounded-3xl flex items-center justify-center mb-6 rotate-3">
                      <TbMessage2 size={48} className="text-blue-500" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Start Your Research Rebuttal</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                      Select a survey question above to deep-dive into the persona's response and uncover the "why" behind their choices.
                    </p>
                  </div>
                )}
              </div>

              {/* Input Area */}
              <div className="p-4 bg-white dark:bg-[#0a0e1a] border-t border-gray-200 dark:border-white/10">
                <div className="flex items-center gap-3 relative max-w-5xl mx-auto">
                  <textarea
                    autoFocus
                    placeholder={
                      !isCurrentTopicStarted
                        ? "Start a session to enable chat"
                        : sendReplyMutation.isPending
                          ? "Moderator is responding..."
                          : "Type your follow-up question here..."
                    }
                    disabled={!isCurrentTopicStarted || sendReplyMutation.isPending}
                    className="w-full pl-5 pr-14 py-4 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 focus:border-blue-500/50 rounded-2xl outline-none transition-all text-sm text-gray-900 dark:text-white placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm resize-none min-h-[56px] max-h-[150px]"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyPress}
                    rows="1"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() || !isCurrentTopicStarted || sendReplyMutation.isPending}
                    className="absolute right-2.5 p-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/30 hover:bg-blue-700 disabled:opacity-0 disabled:scale-95 transition-all transform hover:scale-105"
                  >
                    <TbSend size={20} />
                  </button>
                </div>
                <div className="mt-2 text-[10px] text-center text-gray-500 dark:text-gray-500 font-medium">
                  Press Enter to send, Shift+Enter for new line
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
        dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
      `}} />
    </div>
  );
};

export default RebuttalMode;