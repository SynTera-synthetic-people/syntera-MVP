import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import { FaTimes, FaMinus, FaPaperPlane } from "react-icons/fa";
import { BsRobot } from "react-icons/bs";
import { sendMessageStart, chatWithOmiStart, getGuidanceStart, updateStateStart } from "../../redux/slices/omiSlice";

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const location = useLocation();
  const dispatch = useDispatch();
  const messagesEndRef = useRef(null);

  // Get Omi state and user info from Redux
  const omi = useSelector((state) => state.omi);
  const auth = useSelector((state) => state.auth);
  // const user = auth?.user;
  // const orgId = user?.organization_id || user?.org_id || "default-org";
  const { organizations } = useSelector((state) => state.organizations);

  const orgId = organizations?.data?.id ||
    organizations?.organization_id ||
    auth.user?.organization_id ||
    auth.user?.org_id ||
    "default-org";

  console.log("the organization:", organizations);

  const [currentStage, setCurrentStage] = useState("Dashboard");
  const [currentPageDescription, setCurrentPageDescription] = useState("");
  // const previousPathRef = useRef(location.pathname); // Removed in favor of lastSentPathRef
  const lastSentPathRef = useRef(null); // Track the last path we successfully sent an update for
  const [completedStages, setCompletedStages] = useState([]); // Track completed stages locally

  // Determine current page context
  useEffect(() => {
    const path = location.pathname;
    let stage = "Dashboard";
    let description = "";

    // Check more specific paths first (order matters!)
    if (path.includes("/organization/workspace/research-objectives")) {
      stage = "Research Objective";
      description = "You're viewing a research objective. I can help you manage personas, questionnaires, and analyze survey results.";
    } else if (path.includes("/organization/workspace/add") || path.includes("/organization/workspace/edit")) {
      stage = "Workspace Setup";
      description = "You're setting up a workspace. I can guide you through the configuration process.";

    } else if (path.includes("/organization/workspace/manage")) {
      stage = "Manage Workspace Users";
      description = "You're managing workspace users. I can help you add or remove team members.";
    } else if (path.includes("/organization/workspace")) {
      stage = "Workspace List";
      description = "You're viewing your workspaces. I can help you create, edit, or manage workspaces.";
    } else if (path.includes("/organization")) {
      stage = "Organization";
      description = "You're on the organization page. I can help you manage workspaces and organizational settings.";
    } else {
      stage = "Dashboard";
      description = "You're on the main dashboard. I can help you navigate to different sections.";
    }

    // Handle Stage Transitions for "Completed" status
    if (stage !== currentStage && currentStage !== "Dashboard") {
      setCompletedStages(prev => {
        if (!prev.includes(currentStage)) {
          return [...prev, currentStage];
        }
        return prev;
      });
    }

    setCurrentStage(stage);
    setCurrentPageDescription(description);

    // Backend Enum Mapping
    const STAGE_MAPPING = {
      "Organization": "organization_setup",
      "Workspace List": "organization_setup", // closest fit
      "Workspace Setup": "workspace_setup",
      "Manage Workspace Users": "workspace_setup", // closest fit
      "Research Objective": "research_objectives",
      "Persona": "persona_builder",
      "Questionnaire": "survey_builder",
      "Chat": "rebuttal_mode", // validation needed on frontend names, but usually chat is rebuttal
      "Insights": "insights"
    };

    // DEBUG LOGS
    console.log("DEBUG: Navigation Check", {
      isInitialized: omi.isInitialized,
      sessionId: omi.sessionId,
      path,
      lastSentPath: lastSentPathRef.current,
      orgId,
      conditionMet: orgId && orgId !== "default-org" && lastSentPathRef.current !== path
    });

    // Valid Org ID and path changed/not sent yet
    if (orgId && orgId !== "default-org" && lastSentPathRef.current !== path) {

      const backendStage = STAGE_MAPPING[stage];

      if (backendStage) {
        console.log(`DEBUG: Dispatching updateStateStart for stage: ${stage} -> ${backendStage}`);

        // Calculate what the completed stages WOULD be for this update
        let payloadCompletedStages = [...completedStages];
        if (currentStage !== "Dashboard" && stage !== currentStage && !payloadCompletedStages.includes(currentStage)) {
          payloadCompletedStages.push(currentStage);
        }

        // Map completed stages to backend enums and filter out any that don't map
        const mappedCompletedStages = payloadCompletedStages
          .map(s => STAGE_MAPPING[s])
          .filter((s, index, self) => s && self.indexOf(s) === index); // Filter valid & unique

        // Send context update to Omi via PUT /state
        dispatch(updateStateStart({
          orgId,
          data: {
            state: 'thinking',
            stage: backendStage,
            completed_stages: mappedCompletedStages,
            context: {
              page: stage,
              route: path,
              description
            }
          }
        }));
      } else {
        console.log(`DEBUG: Skipping updateStateStart - No backend mapping for stage: ${stage}`);
      }

      // Update the ref so we don't send again for this path unless it changes
      lastSentPathRef.current = path;
    }

  }, [location.pathname, omi.isInitialized, omi.sessionId, dispatch, orgId, currentStage, completedStages]);

  // Proactive Guidance Trigger
  useEffect(() => {
    console.log("Guidance Trigger Check:", { currentStage, orgId });
    // Only trigger if we have a valid Org ID and match the stage
    if (currentStage === "Workspace Setup" && orgId && orgId !== "default-org") {
      console.log("Dispatching getGuidanceStart...");
      dispatch(getGuidanceStart({
        orgId,
        stage: "organization_setup",
        userInput: { intent: "create_workspace" }
      }));
    }
  }, [currentStage, orgId, dispatch]);


  // Set context-aware initial greeting when chatbot opens
  useEffect(() => {
    if (isOpen && messages.length === 0 && currentPageDescription) {
      const greeting = {
        id: Date.now(),
        text: `Hello! I'm Omi, your AI assistant. ${currentPageDescription}`,
        sender: "bot"
      };
      setMessages([greeting]);
    }
  }, [isOpen, messages.length, currentPageDescription]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      // messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isMinimized]);

  // Listen for Omi responses
  useEffect(() => {
    if (omi.messages && omi.messages.length > 0) {
      const latestOmiMessage = omi.messages[omi.messages.length - 1];
      if (latestOmiMessage && latestOmiMessage.response) {
        setIsTyping(false);
        const botResponse = {
          id: Date.now(),
          text: latestOmiMessage.response,
          sender: "bot",
        };
        setMessages((prev) => [...prev, botResponse]);
      }
    }
  }, [omi.messages]);

  // Handle Omi errors
  useEffect(() => {
    if (omi.error && isTyping) {
      setIsTyping(false);
      const errorMessage = {
        id: Date.now(),
        text: `Sorry, I encountered an error: ${omi.error}. Please try again.`,
        sender: "bot",
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  }, [omi.error, isTyping]);

  // Effect to display Guidance when received
  useEffect(() => {
    console.log("Guidance Data received:", omi.guidanceData);
    if (omi.guidanceData) {
      const guidanceMsg = {
        id: Date.now(),
        text: omi.guidanceData.guidance || "I have some guidance for you.",
        sender: "bot",
        type: "guidance", // custom type
        data: omi.guidanceData
      };
      setMessages(prev => [...prev, guidanceMsg]);
    }
  }, [omi.guidanceData]);

  // Effect to display Validation results
  useEffect(() => {
    if (omi.validationData) {
      console.log("Validation Data received:", omi.validationData);

      // Determine invalid status to maybe style differently?
      // response: { valid: false, message: "...", omi_state: "concerned" }

      const validationMsg = {
        id: Date.now(),
        text: omi.validationData.message || "Validation completed.",
        sender: "bot",
        type: "validation",
        data: omi.validationData
      };
      setMessages(prev => [...prev, validationMsg]);
      setIsOpen(true); // Auto-open chat to show validation
    }
  }, [omi.validationData]);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    // Add user message to chat
    const newUserMsg = { id: Date.now(), text: inputValue, sender: "user" };
    setMessages((prev) => [...prev, newUserMsg]);

    const messageText = inputValue;
    setInputValue("");

    // Stateless chat - no session check needed
    // if (!omi.isInitialized || !omi.sessionId) { ... }

    // Show typing indicator
    setIsTyping(true);

    // Dispatch message to Omi API with context
    // Dispatch message to Omi API with context
    dispatch(chatWithOmiStart({
      orgId,
      message: messageText,
      context: {
        page: currentStage,
        route: location.pathname,
        action: 'user_message',
        description: currentPageDescription,
      },
    }));
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
    setIsMinimized(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">

      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto bg-white dark:bg-neutral-800 w-80 md:w-96 h-[500px] rounded-2xl shadow-2xl border border-gray-200 dark:border-neutral-700 flex flex-col overflow-hidden mb-4"
          >
            <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-4 flex items-center justify-between text-white shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">Omi AI Assistant</h3>
                  {omi.isInitialized && (
                    <span className="flex h-2 w-2">
                      <span className="animate-ping absolute h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative rounded-full h-2 w-2 bg-green-500"></span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-blue-100 flex items-center gap-1">
                  {omi.isInitialized ? (
                    <>Connected • Context: <span className="font-medium bg-white/20 px-1.5 py-0.5 rounded">{currentStage}</span></>
                  ) : (
                    <span className="text-yellow-200">⚠ Not connected - Visit organization page</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsMinimized(true)}
                  className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                  aria-label="Minimize"
                >
                  <FaMinus size={12} />
                </button>
                <button
                  onClick={toggleChat}
                  className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                  aria-label="Close"
                >
                  <FaTimes size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-neutral-900/50">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.sender === "user"
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-white dark:bg-neutral-700 text-gray-800 dark:text-gray-100 rounded-bl-none border border-gray-100 dark:border-neutral-600"
                      }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {/* Typing Indicator */}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm bg-white dark:bg-neutral-700 text-gray-800 dark:text-gray-100 rounded-bl-none border border-gray-100 dark:border-neutral-600">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 bg-white dark:bg-neutral-800 border-t border-gray-100 dark:border-neutral-700 shrink-0">
              <div className="relative flex items-center bg-gray-100 dark:bg-neutral-900 rounded-full px-4 py-2 border border-transparent focus-within:border-blue-500 transition-colors">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className={`ml-2 p-2 rounded-full transition-all ${inputValue.trim()
                    ? "text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    : "text-gray-400 dark:text-gray-600 cursor-not-allowed"
                    }`}
                >
                  <FaPaperPlane size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(!isOpen || isMinimized) && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setIsOpen(true);
              setIsMinimized(false);
            }}
            className="pointer-events-auto bg-gradient-to-r from-blue-600 to-blue-500 text-white p-4 rounded-full shadow-lg hover:shadow-2xl transition-shadow flex items-center justify-center group"
            aria-label="Open Chat"
          >
            <BsRobot size={24} className="group-hover:animate-pulse" />
            {isMinimized && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Chatbot;
