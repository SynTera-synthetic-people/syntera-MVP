import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { TbArrowLeft, TbMessageCircle, TbSend, TbMicrophone, TbLoader, TbAlertCircle, TbDownload, TbEye } from "react-icons/tb";
import { motion } from "framer-motion";
import { useTheme } from "../../../../../../context/ThemeContext";
import PremiumButton from "../../../../../common/PremiumButton";
import logoForDark from "../../../../../../assets/Logo_Dark_bg.png";
import logoForLight from "../../../../../../assets/Logo_Light_bg.png";
import { usePersonaBuilder } from '../../../../../../hooks/usePersonaBuilder';
import { useStartInterview, useSendMessage, useInterview, useExportInterviewReport, useExportAllInterviewsPdf } from '../../../../../../hooks/useInterview';
import PreviewReportModal from './components/PreviewReportModal';
import AllInterviewsPreviewModal from './components/AllInterviewsPreviewModal';
import { useOmniWorkflow } from '../../../../../../hooks/useOmiWorkflow';
import { useExploration } from '../../../../../../hooks/useExplorations';

const ChatView = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspaceId, objectiveId } = useParams();
  const { theme } = useTheme();
  const [personas, setPersonas] = useState([]);
  const [personaData, setPersonaData] = useState({});
  const [selectedPersona, setSelectedPersona] = useState('');
  const [selectedPersonaName, setSelectedPersonaName] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isChatActive, setIsChatActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [interviewId, setInterviewId] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showAllInterviewsPreview, setShowAllInterviewsPreview] = useState(false);
  const chatEndRef = useRef(null);
  const { trigger } = useOmniWorkflow();

  const {
    personas: fetchedPersonas,
  } = usePersonaBuilder(workspaceId, objectiveId);

  // Interview API hooks
  const startInterviewMutation = useStartInterview(workspaceId, objectiveId);
  const sendMessageMutation = useSendMessage(workspaceId, objectiveId, interviewId);
  const exportInterviewReportMutation = useExportInterviewReport(workspaceId, objectiveId);
  const exportAllInterviewsMutation = useExportAllInterviewsPdf(workspaceId, objectiveId);

  const { data: interviewData, isLoading: isInterviewLoading } = useInterview(workspaceId, objectiveId, interviewId, {
    enabled: !!interviewId,
    refetchInterval: isChatActive ? 5000 : false,
  });

  const { data: explorationData } = useExploration(objectiveId);
  const researchApproach = (
    explorationData?.data?.research_approach ||
    explorationData?.research_approach ||
    localStorage.getItem(`approach_${objectiveId}`) ||
    ""
  ).toLowerCase().trim();

  useEffect(() => {
    if (fetchedPersonas) {
      setPersonas(fetchedPersonas?.data || []);
      if (fetchedPersonas?.data) {
        const dataMap = {};
        fetchedPersonas.data.forEach(persona => {
          dataMap[persona.id] = persona;
        });
        setPersonaData(dataMap);
      }
    }
  }, [fetchedPersonas]);

  useEffect(() => {
    // chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (interviewData?.data?.messages) {
      const formattedMessages = interviewData.data.messages.map(msg => {
        const role = msg.role === 'persona' ? 'bot' :
          msg.role === 'user' ? 'user' :
            msg.role === 'system' ? 'bot' : 'bot';

        let text = msg.text;
        if (msg.role === 'persona' && !text && msg.meta?.question) {
          const generatedAnswers = interviewData.data.generated_answers || {};
          text = generatedAnswers[msg.meta.question]?.persona_answer || "Thinking about that...";
        }

        return {
          sender: role,
          text: text || '',
          timestamp: msg.ts,
          meta: msg.meta,
          originalRole: msg.role
        };
      });
      setMessages(formattedMessages);
    }
  }, [interviewData]);

  const handlePersonaSelect = (personaId, personaName) => {
    setSelectedPersona(personaId);
    setSelectedPersonaName(personaName);
    setIsDropdownOpen(false);
    setIsChatActive(false);
    setMessages([]);
    setInputValue('');
    setInterviewId(null);
  };

  const handleEndExploration = async () => {
    try {
      // Import explorationService at the top if not already imported
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

  const handlePopulationSimulation = () => {
    navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/population-builder`)
    trigger({
      stage: 'population_simulation',
      event: 'ENTER_POPULATION',
      payload: {},
    });
  };

  const handlePreviewReport = () => {
    if (!interviewId || !selectedPersonaName) return;
    setShowPreviewModal(true);
  };

  const handleDownloadReport = async () => {
    if (!interviewId || !selectedPersonaName) return;

    try {
      await exportInterviewReportMutation.mutateAsync({
        interviewId,
        personaName: selectedPersonaName
      });
    } catch (error) {
      console.error("Failed to download report:", error);
      alert('Failed to download report. Please try again.');
    }
  };

  const handlePreviewAllReports = () => {
    if (!workspaceId || !objectiveId) return;
    setShowAllInterviewsPreview(true);
  };

  const handleDownloadAllInsights = async () => {
    try {
      await exportAllInterviewsMutation.mutateAsync();
    } catch (error) {
      console.error("Failed to download all insights:", error);
      alert('Failed to download all insights report. Please try again.');
    }
  };

  const handleStartConversation = async () => {
    if (selectedPersona) {
      try {
        const result = await startInterviewMutation.mutateAsync(selectedPersona);

        if (result.data?.id) {
          setInterviewId(result.data.id);
          setIsChatActive(true);

          setMessages([
            {
              sender: 'bot',
              text: `Hello! I'm ${selectedPersonaName}. You can ask me questions about my experiences and perspectives.`,
              timestamp: new Date().toISOString()
            },
            {
              sender: 'bot',
              text: 'You can type your questions below, or use the microphone for voice input.',
              timestamp: new Date().toISOString()
            }
          ]);
        }
      } catch (error) {
        console.error("Failed to start interview:", error);
        setMessages([
          {
            sender: 'bot',
            text: 'Sorry, there was an error starting the interview. Please try again.',
            timestamp: new Date().toISOString()
          }
        ]);
      }
    }
  };

  const handleSendMessage = async () => {
    if (inputValue.trim() === '' || !interviewId) return;

    const userMessage = {
      sender: 'user',
      text: inputValue,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');

    const payload = {
      role: 'user',
      text: inputValue
    }

    try {
      await sendMessageMutation.mutateAsync(payload);

      const thinkingMessage = {
        sender: 'bot',
        text: 'Thinking...',
        timestamp: new Date().toISOString(),
        isThinking: true
      };
      setMessages(prev => [...prev, thinkingMessage]);

    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMessage = {
        sender: 'bot',
        text: 'Sorry, there was an error sending your message. Please try again.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev.filter(m => !m.isThinking), errorMessage]);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleVoiceInput = () => {
    alert('Voice input functionality would be implemented here');
  };

  const getPersonaDisplayName = (personaId) => {
    return personaData[personaId]?.name || 'Unknown Persona';
  };

  const getPersonaOccupation = (personaId) => {
    return personaData[personaId]?.occupation || 'Professional';
  };

  const activePersona = personaData[selectedPersona];

  return (
    <div className="p-4 md:p-8 relative transition-colors duration-300 min-h-[calc(100vh-100px)] flex flex-col">
      <div className="max-w-[1400px] w-full mx-auto relative z-10 flex flex-col flex-grow">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-2">
            <button
              onClick={() => navigate(-1)}
              className="p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors"
            >
              <TbArrowLeft className="w-6 h-6" />
            </button>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              Start In-Depth Interview
            </h2>
          </div>
        </motion.div>



        <div
          className={`transition-all duration-500 ${selectedPersona ? 'w-full' : 'max-w-3xl w-full'} mx-auto flex flex-col flex-grow`}
          style={{ height: selectedPersona ? 'calc(100vh - 90px)' : 'auto', minHeight: selectedPersona ? '600px' : 'auto' }}
        >
          {/* Persona Selection Center */}
          {!selectedPersona && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
            >
              <div className="bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-8 shadow-xl">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-center">
                  Select Persona to Start Interview
                </label>
                <div className="relative mb-6">
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full p-4 bg-gray-50/50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl text-left flex justify-between items-center hover:border-blue-500 transition-all"
                  >
                    <span className="text-gray-400">Choose a persona...</span>
                    <svg className={`h-5 w-5 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {isDropdownOpen && (
                    <div className="absolute w-full mt-2 bg-white dark:bg-[#1a1f2e] border border-gray-200 dark:border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                      {personas.length > 0 ? (
                        personas.map((persona) => (
                          <button
                            key={persona.id}
                            onClick={() => handlePersonaSelect(persona.id, persona.name)}
                            className="w-full text-left p-4 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-gray-700 dark:text-gray-200 transition-colors border-b last:border-0 border-gray-100 dark:border-white/5 flex items-center gap-3"
                          >
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">
                              {persona.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium">{persona.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {persona.occupation || 'No occupation specified'}
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center text-gray-500">No personas found</div>
                      )}
                    </div>
                  )}
                </div>
                <PremiumButton
                  onClick={handleStartConversation}
                  className="w-full"
                  disabled={!selectedPersona || startInterviewMutation.isPending}
                >
                  {startInterviewMutation.isPending ? 'Starting Interview...' : 'Start Interview'}
                </PremiumButton>
              </div>
            </motion.div>
          )}

          {/* Chat Area */}
          {selectedPersona && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full flex-1 flex flex-col min-h-0"
            >
              <div className="bg-white/80 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl flex flex-col flex-1 overflow-hidden min-h-0">
                {/* Header with Persona Selection */}
                <div className="px-6 py-4 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 flex flex-wrap justify-between items-center gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white dark:border-white/10 shadow-sm bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                      {activePersona?.image ? (
                        <img src={activePersona.image} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {selectedPersonaName.charAt(0)}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-none">{selectedPersonaName}</h3>
                        {isChatActive && <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
                        {startInterviewMutation.isPending && (
                          <TbLoader className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                        )}
                      </div>
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                        {getPersonaOccupation(selectedPersona)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* {interviewId && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-1 rounded">
                        ID: {interviewId.substring(0, 8)}...
                      </div>
                    )} */}

                    {/* Dropdown */}
                    <div className="relative">
                      <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="px-4 py-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-white/10 transition-all"
                      >
                        <span>Switch Persona</span>
                        <svg className={`h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                      {isDropdownOpen && (
                        <div className="absolute right-0 mt-2 min-w-80 w-auto bg-white dark:bg-[#1a1f2e] border border-gray-200 dark:border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                          {personas.map((persona) => (
                            <button
                              key={persona.id}
                              onClick={() => handlePersonaSelect(persona.id, persona.name)}
                              className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-500/10 text-sm text-gray-700 dark:text-gray-200 transition-colors border-b last:border-0 border-gray-100 dark:border-white/5 flex items-center gap-3"
                            >
                              <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-bold flex-shrink-0">
                                {persona.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium whitespace-normal">{persona.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-normal">
                                  {persona.occupation || 'No occupation'}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Preview Report Button */}
                    {interviewId && (
                      <PremiumButton
                        onClick={handlePreviewReport}
                        variant="primary"
                        className="min-w-[180px] shadow-lg shadow-blue-500/30 h-10 flex items-center justify-center gap-2"
                      >
                        <TbEye className="w-4 h-4" />
                        Preview Report
                      </PremiumButton>
                    )}
                  </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {isChatActive ? (
                    <>
                      {messages.length === 0 && (isInterviewLoading || startInterviewMutation.isPending) ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                          <TbLoader className="w-12 h-12 animate-spin text-blue-600 dark:text-blue-400 mb-4" />
                          <p className="text-gray-500 dark:text-gray-400">Setting up the interview...</p>
                        </div>
                      ) : messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                          <div className="w-20 h-20 bg-blue-50 dark:bg-blue-500/10 rounded-full flex items-center justify-center mb-6 shadow-inner">
                            <TbMessageCircle className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                          </div>
                          <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Ready to deep dive?</h4>
                          <p className="text-gray-500 dark:text-gray-400 max-w-sm mb-8">
                            You're talking to <strong>{selectedPersonaName}</strong>. Click the button below to start the in-depth interview.
                          </p>
                          <PremiumButton
                            onClick={handleStartConversation}
                            variant="primary"
                            className="min-w-[200px] shadow-lg shadow-blue-500/30"
                            disabled={startInterviewMutation.isPending}
                          >
                            {startInterviewMutation.isPending ? 'Starting...' : 'Start Interview'}
                          </PremiumButton>
                        </div>
                      ) : (
                        <>
                          {messages.map((message, index) => (
                            <div key={index} className={`flex items-end gap-3 ${message.sender === 'user' ? 'justify-end' : ''}`}>
                              {message.sender === 'bot' && (
                                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">
                                  {selectedPersonaName.charAt(0)}
                                </div>
                              )}
                              <div
                                className={`max-w-[70%] p-4 rounded-2xl ${message.sender === 'user'
                                  ? 'bg-blue-600 text-white rounded-br-none'
                                  : 'bg-gray-100 dark:bg-white/10 text-gray-800 dark:text-gray-200 rounded-bl-none'
                                  } ${message.isThinking ? 'opacity-70 italic' : ''}`}
                              >
                                {message.isThinking ? (
                                  <div className="flex items-center gap-2">
                                    <TbLoader className="animate-spin" />
                                    <span>{message.text}</span>
                                  </div>
                                ) : (
                                  <p className="leading-relaxed">{message.text}</p>
                                )}
                                {message.meta?.section && (
                                  <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      Section: {message.meta.section}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {message.sender === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 font-bold text-sm">
                                  You
                                </div>
                              )}
                            </div>
                          ))}
                          {(sendMessageMutation.isPending || isInterviewLoading) && (
                            <div className="flex items-end gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">
                                {selectedPersonaName.charAt(0)}
                              </div>
                              <div className="max-w-[70%] p-4 rounded-2xl bg-gray-100 dark:bg-white/10 text-gray-800 dark:text-gray-200 rounded-bl-none">
                                <div className="flex items-center gap-2">
                                  <TbLoader className="animate-spin" size={16} />
                                  <span className="italic">Thinking...</span>
                                </div>
                              </div>
                            </div>
                          )}
                          <div ref={chatEndRef} />
                        </>
                      )}
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                      <div className="w-20 h-20 bg-blue-50 dark:bg-blue-500/10 rounded-full flex items-center justify-center mb-6 shadow-inner">
                        <TbMessageCircle className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                      </div>
                      <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Ready to deep dive?</h4>
                      <p className="text-gray-500 dark:text-gray-400 max-w-sm mb-8">
                        You're talking to <strong>{selectedPersonaName}</strong>. Click the button below to start the in-depth interview.
                      </p>
                      <PremiumButton
                        onClick={handleStartConversation}
                        variant="primary"
                        className="min-w-[200px] shadow-lg shadow-blue-500/30"
                        disabled={startInterviewMutation.isPending}
                      >
                        {startInterviewMutation.isPending ? 'Starting...' : 'Start Interview'}
                      </PremiumButton>
                    </div>
                  )}
                </div>

                {/* Input Area */}
                {isChatActive && interviewId && (
                  <div className="p-4 border-t border-gray-200 dark:border-white/10 bg-white dark:bg-black/20">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <textarea
                          placeholder="Type your question here..."
                          className="w-full p-4 pr-12 bg-gray-100 dark:bg-white/5 border border-transparent focus:bg-white dark:focus:bg-black/40 border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500/50 outline-none transition-all text-gray-900 dark:text-white resize-none min-h-[60px] max-h-[120px]"
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={handleKeyPress}
                          autoFocus
                          rows="2"
                        />
                        <button
                          onClick={handleVoiceInput}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-blue-500 transition-colors"
                          title="Voice Input"
                        >
                          <TbMicrophone size={20} />
                        </button>
                      </div>
                      <button
                        onClick={handleSendMessage}
                        disabled={!inputValue.trim() || sendMessageMutation.isPending}
                        className="p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30 flex items-center justify-center"
                      >
                        {sendMessageMutation.isPending ? (
                          <TbLoader className="w-5 h-5 animate-spin" />
                        ) : (
                          <TbSend size={20} />
                        )}
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <TbAlertCircle size={12} />
                      Press Enter to send, Shift+Enter for new line
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Footer Buttons */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-8 pb-8">
            <div>
              <div className="flex items-center gap-2">
                {interviewId && (
                  <PremiumButton
                    variant="primary"
                    className="w-full sm:w-auto flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700"
                    onClick={handleEndExploration}
                  >
                    End Exploration
                  </PremiumButton>
                )}
                {researchApproach === 'both' && interviewId && (
                  <PremiumButton
                    variant="secondary"
                    onClick={handlePopulationSimulation}
                    className="w-full sm:w-auto"
                  >
                    Switch to Population Survey
                  </PremiumButton>
                )}
              </div>
            </div>
            {interviewId && (
              <PremiumButton
                variant="primary"
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700"
                onClick={handlePreviewAllReports}
                disabled={exportAllInterviewsMutation.isPending}
              >
                {exportAllInterviewsMutation.isPending ? (
                  <>
                    <TbLoader className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <TbEye className="w-4 h-4" />
                    Preview All Insights Report
                  </>
                )}
              </PremiumButton>
            )}
          </div>
        </div>
      </div>


      <AllInterviewsPreviewModal
        isOpen={showAllInterviewsPreview}
        onClose={() => setShowAllInterviewsPreview(false)}
        workspaceId={workspaceId}
        explorationId={objectiveId}
        onDownload={handleDownloadAllInsights}
        exportAllInterviewsMutation={exportAllInterviewsMutation}
      />

      {/* Preview Report Modal */}
      <PreviewReportModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        workspaceId={workspaceId}
        explorationId={objectiveId}
        interviewId={interviewId}
        personaName={selectedPersonaName}
        onDownload={handleDownloadReport}
        exportInterviewReportMutation={exportInterviewReportMutation}
      />
    </div>
  );
};

export default ChatView;