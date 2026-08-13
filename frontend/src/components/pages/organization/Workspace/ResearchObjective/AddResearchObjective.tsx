import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from "framer-motion";
import FileUploadModal from "./FileUploadModal";
import type { FileUploadModalValue } from "./FileUploadModal";
import {
  TbPaperclip,
  TbRobot,
  TbLoader,
  TbSparkles,
  TbPencil,
  TbLock,
  TbX,
  TbFileTypePdf,
  TbFileTypeDoc,
  TbFileTypeXls,
  TbAlertCircle,
} from "react-icons/tb";
import SpIcon from "../../../../SPIcon";
import { useTheme } from "../../../../../context/ThemeContext";
import { toast } from "react-toastify";
import {
  useInitializeOmiSession,
  useSendMessageToOmi,
  useCreateResearchObjective,
  useConversationHistory,
  usePatchResearchObjectiveSummary,
  usePatchOmiMessageContent,
  useSubmitFramerMaterialSection,
} from "../../../../../hooks/useOmiChat";
import { useOmniWorkflow } from '../../../../../hooks/useOmiWorkflow';
import { useAutoGeneratePersonas, usePersonas } from '../../../../../hooks/usePersonaBuilder';
import UpgradeModal from "../../../Upgrade/UpgradeModal";
import SummaryRefineBubble from "./SummaryRefineBubble";
import OmiGreet from '../../../../../assets/Omi Animations/OmiIdle.mp4';
import OmiPencil from '../../../../../assets/Omi Animations/OmiPencil.mp4';
import OmiKeyboard from '../../../../../assets/Omi Animations/OmiKeyboard.mp4';
import OmiCaution from '../../../../../assets/Omi Animations/OmiCaution.mp4';
import "./AddResearchObjectiveStyle.css";
import "./SummaryRefineBubble.css";

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

interface User {
  account_tier?: string;
  [key: string]: any;
}

interface RootState {
  researchObjective: ResearchObjectiveState;
  auth: { user: User | null };
}

// ── File upload constants ─────────────────────────────────────────────────────

const ACCEPTED_FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};

const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
const ACCEPTED_MIME_TYPES = Object.keys(ACCEPTED_FILE_TYPES);
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// ── Helpers ───────────────────────────────────────────────────────────────────

const canBuildManually = (tier: string | undefined): boolean => {
  const t = (tier ?? '').toLowerCase().trim();
  return t === 'enterprise' || t === 'enterprise_admin';
};

const MAX_SUMMARY_EDITS = 5;

const isInternalRefinePrompt = (text: unknown): boolean =>
  typeof text === 'string' &&
  text.includes("Here is the current Research Objective Summary in full") &&
  text.includes("do NOT change any part of it except");

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const validateFile = (file: File): string | null => {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  const mimeOk = ACCEPTED_MIME_TYPES.includes(file.type);
  const extOk = ACCEPTED_EXTENSIONS.includes(ext);
  if (!mimeOk && !extOk) return `Only PDF, DOC, DOCX, XLS, and XLSX files are supported.`;
  if (file.size > MAX_FILE_SIZE_BYTES) return `File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`;
  return null;
};

const getFileTypeLabel = (file: File): string => {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return 'PDF';
  if (file.name.toLowerCase().endsWith('.docx')) return 'DOCX';
  if (file.name.toLowerCase().endsWith('.doc')) return 'DOC';
  if (file.name.toLowerCase().endsWith('.xlsx')) return 'XLSX';
  if (file.name.toLowerCase().endsWith('.xls')) return 'XLS';
  return 'File';
};

const truncateHostname = (url: string): string => {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
  } catch {
    return url.length > 30 ? url.slice(0, 30) + '…' : url;
  }
};

// ── Component ────────────────────────────────────────────────────────────────

const AddResearchObjective: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isViewOnly = Boolean((location.state as any)?.viewOnly);
  const { trigger } = useOmniWorkflow();
  const { theme } = useTheme();
  const { workspaceId, objectiveId } = useParams<{
    workspaceId: string;
    objectiveId: string;
  }>();
  const dispatch = useDispatch();
  const [showFileModal, setShowFileModal] = useState(false);
  const [uploadedMaterial, setUploadedMaterial] = useState<FileUploadModalValue | null>(null);

  // Tracks whether the "Add supporting material" submission (from the modal)
  // is still in flight. Drives the Omi typing indicator in the chat window
  // between clicking "Done" and the success/error toast appearing.
  const [isProcessingMaterial, setIsProcessingMaterial] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Auth / tier ────────────────────────────────────────────────────────────
  const { user } = useSelector((state: RootState) => state.auth);
  const userTier = user?.account_tier ?? 'free';
  const manualAllowed = canBuildManually(userTier);

  // ── Upgrade modal ──────────────────────────────────────────────────────────
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // ── Omi animation ──────────────────────────────────────────────────────────
  const [omiAnimation, setOmiAnimation] = useState<"greeting" | "writing" | "error">("greeting");

  const getOmiVideo = (forError = false) => {
    if (forError) return OmiCaution;
    switch (omiAnimation) {
      case "writing": return OmiPencil;
      case "error": return OmiCaution;
      default: return OmiGreet;
    }
  };

  // ── File upload ────────────────────────────────────────────────────────────
  const [fileError, setFileError] = useState<string | null>(null);

  // ── Persona flow lock ──────────────────────────────────────────────────────
  const [personaFlowStarted, setPersonaFlowStarted] = useState(false);

  // ── Summary edit count ─────────────────────────────────────────────────────
  const [summaryEditCount, setSummaryEditCount] = useState<number>(0);

  useEffect(() => {
    if (objectiveId) {
      const stored = localStorage.getItem(`summary_edit_count_${objectiveId}`);
      if (stored) setSummaryEditCount(parseInt(stored, 10) || 0);
    }
  }, [objectiveId]);

  const incrementSummaryEditCount = useCallback(() => {
    setSummaryEditCount(prev => {
      const next = prev + 1;
      if (objectiveId) localStorage.setItem(`summary_edit_count_${objectiveId}`, String(next));
      return next;
    });
  }, [objectiveId]);

  // ── RO Framer submission detection ─────────────────────────────────────────
  //
  // IMPORTANT: This is intentionally NOT based on the framer *draft* key
  // (`ro_framer_draft_${objectiveId}`). That draft key is written on every
  // keystroke while the user is filling out the Framer and is cleared the
  // moment the final Submit succeeds — so it is truthy mid-fill and falsy
  // right after a real submission, which is the opposite of what we want to
  // show here.
  //
  // Instead we read a separate `ro_framer_submitted_${objectiveId}` flag
  // that ResearchObjectiveFramer only sets inside its saveFramer onSuccess
  // handler — i.e. only once the user has actually pressed Submit on the
  // last step of the Framer. This is what should drive the
  // "Review your research framing →" entry point below.
  const [hasSubmittedFramer, setHasSubmittedFramer] = useState<boolean>(false);

  useEffect(() => {
    if (!objectiveId) { setHasSubmittedFramer(false); return; }
    try {
      const raw = localStorage.getItem(`ro_framer_submitted_${objectiveId}`);
      setHasSubmittedFramer(Boolean(raw));
    } catch {
      setHasSubmittedFramer(false);
    }
    // Re-check whenever we land back on this screen (e.g. after returning
    // from the framer), since location.pathname changes on navigation back.
  }, [objectiveId, location.pathname]);

  // ── TanStack Query hooks ───────────────────────────────────────────────────
  const {
    data: sessionData,
    isLoading: sessionLoading,
    error: sessionError,
    refetch: refetchSession,
  } = useInitializeOmiSession(objectiveId);

  const {
    data: conversationHistoryData,
    isLoading: isLoadingHistory,
    refetch: refetchHistory,
  } = useConversationHistory(workspaceId, objectiveId);

  const sessionId = (sessionData as any)?.data?.session_id;
  const { mutate: sendMessage, isLoading: isSendingMessage } =
    useSendMessageToOmi(objectiveId, sessionId) as any;

  const { mutate: createResearchObjective } = useCreateResearchObjective() as any;
  const { mutate: persistSummaryEdit } = usePatchResearchObjectiveSummary(workspaceId, objectiveId) as any;
  const { mutate: persistOmiMessage } = usePatchOmiMessageContent() as any;
  const { mutateAsync: submitMaterialSection } = useSubmitFramerMaterialSection(workspaceId, objectiveId) as any;

  const { refetch: triggerPersonaGeneration } = useAutoGeneratePersonas(workspaceId, objectiveId, { enabled: false });
  const { data: existingPersonasData, refetch: refetchExistingPersonas } =
    usePersonas(workspaceId, objectiveId);

  const personasExist = (() => {
    const data = (existingPersonasData as any)?.data;
    const arr = Array.isArray(data)
      ? data
      : Array.isArray(existingPersonasData)
        ? existingPersonasData
        : [];
    return arr.length > 0;
  })();

  // ── Redux ──────────────────────────────────────────────────────────────────
  const {
    templates,
    selectedTemplate,
    selectedObjective,
    objectives,
    loading: templatesLoading,
    error: templatesError,
  } = useSelector((state: RootState) => state.researchObjective);

  // ── Chat state ─────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [omiStatus, setOmiStatus] = useState<string>("Starting research insight shown here...");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showTemplates, setShowTemplates] = useState<boolean>(false);
  const [prevMessagesLength, setPrevMessagesLength] = useState<number>(0);
  const [hasTriggeredInitialEvent, setHasTriggeredInitialEvent] = useState<boolean>(false);
  const isFreshFirstInteraction =
    !isViewOnly &&
    messages.length <= 1 &&
    inputValue.trim() === "" &&
    !uploadedFile &&
    !messages.some(m => m.sender === 'user');

  // ── Thinking phrase cycling ────────────────────────────────────────────────
  const thinkingPhrases = ["Working on a response", "Thinking", "Analyzing your input", "Processing"];
  const [thinkingPhraseIndex, setThinkingPhraseIndex] = useState(0);

  useEffect(() => {
    if (!isSendingMessage && !isSubmitting) return;
    const interval = setInterval(() => {
      setThinkingPhraseIndex(i => (i + 1) % thinkingPhrases.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [isSendingMessage, isSubmitting]);

  useEffect(() => {
    const drafted = (location.state as any)?.roFramerObjective as string | undefined;
    if (drafted?.trim()) {
      setInputValue(drafted.trim());
      navigate(location.pathname, {
        replace: true,
        state: {
          ...((location.state as any) ?? {}),
          roFramerObjective: undefined,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const transformMessages = useCallback((apiMessages: any[]): Message[] => {
    if (!apiMessages || !Array.isArray(apiMessages)) return [];
    return apiMessages
      .filter((msg: any) => !isInternalRefinePrompt(msg?.content))
      .map((msg: any, index: number) => ({
        id: msg.id || `msg-${index}`,
        sender: msg.role === 'omi' ? 'omi' : 'user',
        text: msg.content,
        timestamp: new Date(msg.created_at),
        omiState: msg.omi_state,
        workflowStage: msg.workflow_stage,
        messageType: msg.message_type,
        originalData: msg,
      }));
  }, []);

  useEffect(() => {
    if (!isSubmitting && !isSendingMessage && omiAnimation !== "error" && inputValue.trim().length === 0) {
      setOmiAnimation("greeting");
    }
  }, [isSubmitting, isSendingMessage, omiAnimation, inputValue]);

  useEffect(() => {
    if (inputValue.trim().length > 0 && !isSubmitting) setOmiAnimation("writing");
  }, [inputValue, isSubmitting]);

  useEffect(() => {
    if (!isViewOnly && !hasTriggeredInitialEvent && sessionData) {
      trigger({ stage: 'research_objective', event: 'RESEARCH_OBJECTIVE_INIT', payload: {} });
      setHasTriggeredInitialEvent(true);
    }
  }, [isViewOnly, sessionData, hasTriggeredInitialEvent, objectiveId, workspaceId, trigger]);

  useEffect(() => {
    if ((conversationHistoryData as any)?.status === "success" && (conversationHistoryData as any).data?.messages) {
      const transformed = transformMessages((conversationHistoryData as any).data.messages);
      setMessages(transformed);
      setPrevMessagesLength(transformed.length);
      if (transformed.length > 0) {
        const last = transformed[transformed.length - 1] as Message | undefined;
        if (last?.sender === 'omi') {
          setOmiStatus(last?.omiState === 'thinking' ? "Omi is processing..." : "Omi is ready");
        } else {
          setOmiStatus("Waiting for Omi's response...");
        }
      }
    }
  }, [conversationHistoryData, transformMessages]);

  useEffect(() => {
    if ((sessionData as any)?.data?.greeting && messages.length === 0 && !isLoadingHistory) {
      const initialMessage: Message = {
        id: 'greeting-1',
        sender: 'omi',
        text: (sessionData as any).data.greeting,
        timestamp: new Date(),
        sessionId: (sessionData as any).data.session_id,
      };
      setMessages([initialMessage]);
      setPrevMessagesLength(1);
      setOmiStatus("Omi is ready to help with your research objective");
    }
  }, [sessionData, messages.length, isLoadingHistory]);

  const lastMessage = messages[messages.length - 1] as Message | undefined;
  const isObjectiveConfirmed =
    messages.length > 0 &&
    lastMessage?.sender === "omi" &&
    lastMessage?.text?.includes("carry this forward into personas");

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  useEffect(() => {
    if (messagesContainerRef.current && messages.length > prevMessagesLength) {
      messagesContainerRef.current.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
    setPrevMessagesLength(messages.length);
  }, [messages, prevMessagesLength]);

  useEffect(() => {
    if (messagesContainerRef.current && (isSendingMessage || isSubmitting || isProcessingMaterial)) {
      messagesContainerRef.current.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [isSendingMessage, isSubmitting, isProcessingMaterial]);

  const handleTemplateSelect = (template: Template) => { setShowTemplates(false); };

  useEffect(() => {
    if (selectedTemplate) {
      const templateData = (selectedTemplate as any).data || selectedTemplate;
      const descriptionValue = templateData.description || templateData.title || '';
      setInputValue(descriptionValue);
    }
  }, [selectedTemplate]);

  useEffect(() => {
    const last = messages[messages.length - 1] as Message | undefined;
    if (last?.sender === 'omi' && last?.text?.includes("carry this forward into personas")) {
      setOmiStatus("Research objective defined! Ready to create personas...");
      trigger({ stage: 'research_objective', event: 'RESEARCH_OBJECTIVE_SUMMARY_SHOWCASE', payload: {} });
    }
  }, [messages, objectiveId, workspaceId]);

  // ── Summary refinement handler ─────────────────────────────────────────────
  const handleRefineRequest = async (
    selectedText: string,
    instruction: string,
  ): Promise<void> => {
    if (!sessionId) throw new Error("No active session");

    if (summaryEditCount >= MAX_SUMMARY_EDITS) {
      setOmiStatus(`You've reached the maximum of ${MAX_SUMMARY_EDITS} edits for this summary.`);
      return;
    }
    if (personasExist || isViewOnly) {
      setOmiStatus("This research objective is locked — personas have already been created.");
      return;
    }

    const summaryMessage = [...messages].reverse().find(m =>
      m.sender === 'omi' && m.text?.includes("carry this forward into personas")
    );
    const currentSummaryFull = summaryMessage?.text ?? "";

    const trimmedInstruction = instruction.trim();
    const changeToPattern = /^(?:change|replace)\s+["']?(.+?)["']?\s+(?:to|with)\s+["']?(.+?)["']?$/i;
    const useInsteadPattern = /^use\s+["']?(.+?)["']?(?:\s+instead(?:\s+of\s+["']?.+?["']?)?)?$/i;
    const changeThisToPattern = /^i\s+(?:want\s+to\s+)?(?:change|update|replace)\s+(?:this|it)\s+(?:to|with)\s+(.+)$/i;

    let replacement: string | null = null;
    const changeMatch = trimmedInstruction.match(changeToPattern);
    const useMatch = trimmedInstruction.match(useInsteadPattern);
    const changeThisMatch = trimmedInstruction.match(changeThisToPattern);

    if (changeMatch) replacement = changeMatch[2]!.trim();
    else if (useMatch) replacement = useMatch[1]!.trim();
    else if (changeThisMatch) replacement = changeThisMatch[1]!.trim();
    else if (
      !/\b(rephrase|rewrite|expand|...)\b/i.test(trimmedInstruction) &&
      trimmedInstruction.split(/\s+/).length <= 6
    ) {
      replacement = trimmedInstruction;
    }

    if (replacement !== null && currentSummaryFull.includes(selectedText)) {
      const updatedText = currentSummaryFull.replace(selectedText, replacement);
      if (summaryMessage) {
        setMessages(prev =>
          prev.map(m => m.id === summaryMessage.id ? { ...m, text: updatedText } : m)
        );
        persistOmiMessage(
          { messageId: summaryMessage.id, content: updatedText },
          { onError: () => setOmiStatus("Save failed — please retry") }
        );
      }
      persistSummaryEdit(updatedText, { onError: () => setOmiStatus("Save failed — please retry") });
      setOmiStatus("Summary updated");
      incrementSummaryEditCount();
      return;
    }

    const prompt =
      `Here is the current Research Objective Summary in full — do NOT change any part of it except the specific passage called out below:\n\n` +
      `---\n${currentSummaryFull}\n---\n\n` +
      `The user has selected only this passage:\n"${selectedText}"\n\n` +
      `Apply ONLY this change to that passage: ${instruction}\n\n` +
      `Rules:\n` +
      `- Every sentence outside the selected passage must be returned word-for-word unchanged.\n` +
      `- Only the selected passage may be reworded, and only as minimally as the instruction requires.\n` +
      `- Output the complete updated summary text only — no preamble, no commentary, no sign-off.\n` +
      `- Do NOT add new sentences, remove existing sentences, or change the overall length significantly.`;

    setOmiStatus("Omi is applying the change…");

    await new Promise<void>((resolve, reject) => {
      sendMessage(prompt, {
        onSuccess: (response: any) => {
          if (response.status === "success") {
            const updatedText: string = response.data.message;
            if (summaryMessage) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === summaryMessage.id
                    ? { ...m, text: updatedText, omiState: response.data.omi_state }
                    : m
                )
              );
              persistOmiMessage(
                { messageId: summaryMessage.id, content: updatedText },
                { onError: () => setOmiStatus("Save failed — please retry") }
              );
            }
            persistSummaryEdit(updatedText, { onError: () => setOmiStatus("Save failed — please retry") });
            setOmiStatus("Summary updated");
            incrementSummaryEditCount();
            resolve();
          } else {
            reject(new Error("Refinement failed"));
          }
        },
        onError: (err: any) => {
          setOmiAnimation("error");
          reject(err);
        },
      });
    });
  };

  // ── CTA Handlers ───────────────────────────────────────────────────────────

  const handleCreateWithOmi = async () => {
    setPersonaFlowStarted(true);
    trigger({ stage: 'persona_builder', event: 'PERSONA_WORKFLOW_LOADED', payload: {} });
    if (objectiveId) localStorage.setItem(`step1_done_${objectiveId}`, '1');

    const currentPersonas =
      Array.isArray((existingPersonasData as any)?.data)
        ? (existingPersonasData as any).data
        : Array.isArray(existingPersonasData)
          ? existingPersonasData
          : [];

    const refreshed = currentPersonas.length
      ? { data: existingPersonasData }
      : await refetchExistingPersonas();

    const savedPersonas =
      Array.isArray((refreshed.data as any)?.data)
        ? (refreshed.data as any).data
        : Array.isArray(refreshed.data)
          ? refreshed.data
          : [];

    if (savedPersonas.some((p: any) => p?.calibration_status !== "draft")) {
      navigate(
        `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`,
        { state: { fromLoader: true, flow: "omi", reusedExisting: true, viewOnly: isViewOnly } }
      );
      return;
    }

    try { triggerPersonaGeneration(); } catch (err) { console.error("Failed to kick off persona generation:", err); }

    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-generating`,
      { state: { flow: "omi", viewOnly: isViewOnly } }
    );
  };

  const handleBuildManually = () => {
    if (!manualAllowed) { setShowUpgradeModal(true); return; }
    setPersonaFlowStarted(true);
    trigger({ stage: 'persona_builder', event: 'PERSONA_WORKFLOW_LOADED', payload: {} });
    if (objectiveId) localStorage.setItem(`step1_done_${objectiveId}`, '1');
    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder/manual`,
      { state: { flow: "manual", viewOnly: isViewOnly } }
    );
  };

  const handleOpenROFramer = () => {
    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/frame-objective`,
      { state: { returnTo: location.pathname } }
    );
  };

  const handleViewROFramerSummary = () => {
    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/frame-objective`,
      { state: { returnTo: location.pathname, initialTab: "review" } }
    );
  };

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) return;
    const error = validateFile(file);
    if (error) { setFileError(error); return; }
    setUploadedFile(file);
  };

  const handleMaterialDone = async (value: FileUploadModalValue) => {
    const tasks: Promise<any>[] = [];
    if (value.briefFile || value.briefLink) {
      tasks.push(submitMaterialSection({
        kind: "brief",
        file: value.briefFile,
        links: value.briefLink ? [value.briefLink] : [],
      }));
    }
    if (value.artifactFiles.length > 0 || value.artifactLinks.length > 0) {
      tasks.push(submitMaterialSection({
        kind: "artifact",
        files: value.artifactFiles,
        links: value.artifactLinks,
        category: value.artifactCategory,
        artifact_category: value.artifactContentCategory,
      }));
    }

    if (tasks.length === 0) {
      setUploadedMaterial(value);
      return;
    }

    // Show the Omi "processing" indicator in the chat window while the
    // upload is in flight, and clear it the moment we know the outcome —
    // right before the corresponding toast is fired.
    setIsProcessingMaterial(true);
    try {
      await Promise.all(tasks);
      setUploadedMaterial(value);
      toast.success("Material added — Omi will use this as context.");
    } catch (error: any) {
      toast.error(
        error?.response?.data?.detail ?? "Couldn't save your material. Please try again."
      );
    } finally {
      setIsProcessingMaterial(false);
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Derive material summary for the strip ─────────────────────────────────

  const materialItems: {
    key: string;
    type: 'file' | 'link';
    label: string;
    badge: string;
    onRemove: () => void;
  }[] = [];

  if (uploadedMaterial) {
    if (uploadedMaterial.briefFile) {
      materialItems.push({
        key: 'bf', type: 'file', label: uploadedMaterial.briefFile.name, badge: 'Brief',
        onRemove: () => setUploadedMaterial(prev => prev ? { ...prev, briefFile: null } : null),
      });
    }
    if (uploadedMaterial.briefLink?.trim()) {
      materialItems.push({
        key: 'bl', type: 'link', label: truncateHostname(uploadedMaterial.briefLink), badge: 'Brief',
        onRemove: () => setUploadedMaterial(prev => prev ? { ...prev, briefLink: '' } : null),
      });
    }
    uploadedMaterial.artifactFiles.forEach((file, i) => {
      materialItems.push({
        key: `af-${i}`, type: 'file', label: file.name, badge: 'Artifact',
        onRemove: () => setUploadedMaterial(prev => {
          if (!prev) return null;
          const updated = prev.artifactFiles.filter((_, idx) => idx !== i);
          const isEmpty = !prev.briefFile && !prev.briefLink?.trim() &&
            updated.length === 0 && prev.artifactLinks.filter(Boolean).length === 0;
          return isEmpty ? null : { ...prev, artifactFiles: updated };
        }),
      });
    });
    uploadedMaterial.artifactLinks.filter(Boolean).forEach((link, i) => {
      materialItems.push({
        key: `al-${i}`, type: 'link', label: truncateHostname(link), badge: 'Artifact',
        onRemove: () => setUploadedMaterial(prev => {
          if (!prev) return null;
          const updated = prev.artifactLinks.filter((_, idx) => idx !== i);
          const isEmpty = !prev.briefFile && !prev.briefLink?.trim() &&
            prev.artifactFiles.length === 0 && updated.filter(Boolean).length === 0;
          return isEmpty ? null : { ...prev, artifactLinks: updated };
        }),
      });
    });
  }

  const clearAllMaterial = () => setUploadedMaterial(null);

  // ── Message sending ────────────────────────────────────────────────────────

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const hasText = inputValue.trim() !== "";
    const hasFile = uploadedFile !== null;
    if (!hasText && !hasFile) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: inputValue,
      file: uploadedFile,
      timestamp: new Date(),
      sessionId,
    };

    setMessages(prev => [...prev, userMessage]);
    trigger({ stage: 'research_objective', event: 'RESEARCH_OBJECTIVE_SUBMITTED', payload: {} });

    const messageToSend = inputValue;
    const fileToSend = uploadedFile;

    setInputValue("");
    setUploadedFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setOmiAnimation("greeting");
    setOmiStatus("Omi is thinking...");

    if (!sessionId) {
      setOmiAnimation("error");
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`, sender: 'omi',
        text: "Session not initialized. Please try again.",
        timestamp: new Date(), isError: true,
      }]);
      setOmiStatus("Session error");
      return;
    }

    let payload: any = messageToSend;

    if (fileToSend) {
      try {
        const base64Data = await fileToBase64(fileToSend);
        payload = {
          message: messageToSend,
          file: { name: fileToSend.name, type: fileToSend.type, size: fileToSend.size, data: base64Data },
        };
      } catch {
        setOmiAnimation("error");
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`, sender: 'omi',
          text: "Failed to read the uploaded file. Please try again.",
          timestamp: new Date(), isError: true,
        }]);
        setOmiStatus("File read error");
        return;
      }
    }

    setIsSubmitting(true);

    sendMessage(payload, {
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
            nextSteps: response.data.next_steps,
          };
          setMessages(prev => [...prev, omiMessage]);
          trigger({ stage: 'research_objective', event: 'RESEARCH_OBJECTIVE_REFINING', payload: {} });
          switch (response.data.omi_state) {
            case 'thinking': setOmiStatus("Omi is processing your input..."); break;
            case 'greeting': setOmiStatus("Omi is ready for the next step"); break;
            default: setOmiStatus("Omi responded");
          }
          setTimeout(() => { refetchHistory(); }, 500);
        } else {
          setOmiAnimation("error");
          setMessages(prev => [...prev, {
            id: `error-${Date.now()}`, sender: 'omi',
            text: "Sorry, I encountered an error. Please try again.",
            timestamp: new Date(), isError: true,
          }]);
          setOmiStatus("Error occurred");
        }
        setIsSubmitting(false);
      },
      onError: (error: any) => {
        setOmiAnimation("error");
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`, sender: 'omi',
          text: "Sorry, I'm having trouble connecting. Please check your connection and try again.",
          timestamp: new Date(), isError: true,
        }]);
        setOmiStatus("Connection error");
        setIsSubmitting(false);
      },
    });
  };

  useEffect(() => {
    if (sessionLoading) setOmiStatus("Initializing Omi session...");
    if (sessionError) setOmiStatus("Failed to initialize Omi session");
  }, [sessionLoading, sessionError]);

  const isLoading = sessionLoading || isLoadingHistory;

  const lastOmiMessageIndex = messages.reduce(
    (lastIdx, msg, idx) => (msg.sender === 'omi' ? idx : lastIdx), -1
  );

  // ── Text formatting ────────────────────────────────────────────────────────

  const formatText = (text: string): React.ReactNode => {
    if (!text) return null;

    const processBold = (str: string): React.ReactNode[] =>
      str.split(/(\*\*.*?\*\*)/g).map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i} className="font-bold aro-chat-text-bold">{part.slice(2, -2)}</strong>;
        return part;
      });

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
      const isListItem =
        trimmed.startsWith('- ') || trimmed.startsWith('* ') ||
        trimmed.startsWith('• ') || /^\d+\.\s/.test(trimmed);
      if (isListItem) {
        const content = trimmed.replace(/^([-*•]|\d+\.)\s+/, '');
        currentList.push(
          <li key={`li-${index}`} className="ml-5 list-disc marker:text-blue-500 pl-1 mb-1 leading-relaxed aro-chat-text">
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
            elements.push(<p key={`p-${index}-a`} className="mb-4 leading-relaxed aro-chat-text">{processBold(firstPart)}</p>);
            elements.push(<p key={`p-${index}-b`} className="mb-4 last:mb-0 leading-relaxed aro-chat-text">{processBold(secondPart)}</p>);
            return;
          }
        }
        elements.push(
          <p key={`p-${index}`} className={`mb-4 last:mb-0 leading-relaxed aro-chat-text ${isHeader ? 'font-bold text-lg text-blue-600 dark:text-blue-400 mt-2' : ''}`}>
            {processBold(line)}
          </p>
        );
      }
    });

    if (currentList.length > 0)
      elements.push(<ul key="ul-final" className="my-3 space-y-1">{currentList}</ul>);
    return elements;
  };

  const renderMessageWithPersonaButton = (message: Message): React.ReactNode => {
    const text = message.text;
    if (message.sender === 'omi' && text.includes("carry this forward into personas")) {
      const markerMatch = text.match(/I['']ll carry this forward into personas\.?/);
      const splitIndex = markerMatch?.index ?? -1;
      const markerLen = markerMatch ? markerMatch[0].length : 0;
      const beforeRaw = splitIndex > -1 ? text.slice(0, splitIndex).trim() : text.trim();
      const afterRaw = splitIndex > -1 ? text.slice(splitIndex + markerLen).trim() : '';
      return (
        <div className="space-y-1">
          {beforeRaw ? formatText(beforeRaw) : null}
          {afterRaw ? formatText(afterRaw) : null}
        </div>
      );
    }
    return <div className="space-y-1">{formatText(text)}</div>;
  };

  const isSummaryMessage = (message: Message): boolean =>
    message.sender === 'omi' && message.text?.includes("carry this forward into personas");

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="aro-container">
        <div className="aro-chat-wrapper">

          {/* Messages */}
          <div ref={messagesContainerRef} className="aro-messages">
            {isLoading && !isViewOnly ? (
              <div className="aro-state-center">
                <div className="aro-state-inner">
                  <TbLoader className="aro-spinner" />
                  <p className="aro-state-text">
                    {sessionLoading ? "Initializing Omi session..." : "Loading conversation history..."}
                  </p>
                </div>
              </div>
            ) : sessionError && !isViewOnly ? (
              <div className="aro-state-center">
                <div className="aro-error-box">
                  <p className="aro-error-text">Failed to initialize chat session.</p>
                  <button onClick={() => refetchSession()} className="aro-retry-btn">Try again</button>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="aro-state-center">
                <div className="aro-state-inner">
                  <div className="aro-empty-avatar"><TbRobot size={32} /></div>
                  <p className="aro-state-text">Starting conversation with Omi...</p>
                </div>
              </div>
            ) : (
              <>
                {messages
                  .filter(message => !isInternalRefinePrompt(message.text))
                  .map((message, index, filteredMessages) => {
                    const isLatestOmi =
                      message.sender === 'omi' &&
                      index === filteredMessages.reduce(
                        (lastIdx, msg, idx) => (msg.sender === 'omi' ? idx : lastIdx), -1
                      );
                    const isSummary = isSummaryMessage(message);

                    return (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className={`aro-message-row ${message.sender === 'user' ? 'aro-message-row--user' : 'aro-message-row--omi'}`}
                      >
                        <div className={`aro-bubble-wrapper ${message.sender === 'user' ? 'aro-bubble-wrapper--user' : 'aro-bubble-wrapper--omi'}`}>
                          {isSummary ? (
                            <SummaryRefineBubble
                              message={message}
                              isLocked={personaFlowStarted || isViewOnly || personasExist}
                              isSending={isSendingMessage || isSubmitting}
                              onRefine={handleRefineRequest}
                              renderMessageContent={renderMessageWithPersonaButton}
                              editCount={summaryEditCount}
                              maxEdits={MAX_SUMMARY_EDITS}
                            />
                          ) : (
                            <div className={`aro-bubble ${message.sender === 'omi'
                              ? message.isError ? 'aro-bubble--omi-error' : 'aro-bubble--omi'
                              : 'aro-bubble--user'
                              }`}>
                              {message.sender === 'omi' && (
                                <div className="aro-omi-avatar">
                                  {isLatestOmi ? (
                                    <video
                                      key={message.isError ? "error" : omiAnimation}
                                      className="aro-omi-video"
                                      src={message.isError ? OmiCaution : getOmiVideo()}
                                      autoPlay loop muted playsInline
                                    />
                                  ) : (
                                    <video
                                      className="aro-omi-video aro-omi-video--static"
                                      src={message.isError ? OmiCaution : OmiGreet}
                                      muted playsInline
                                    />
                                  )}
                                </div>
                              )}
                              <div className="aro-bubble-text">
                                {renderMessageWithPersonaButton(message)}
                                {message.file && (
                                  <div className="aro-bubble-file">
                                    {(message.file as File).name.toLowerCase().endsWith('.pdf')
                                      ? <TbFileTypePdf size={15} />
                                      : (message.file as File).name.toLowerCase().endsWith('.xls') ||
                                        (message.file as File).name.toLowerCase().endsWith('.xlsx')
                                        ? <TbFileTypeXls size={15} />
                                        : <TbFileTypeDoc size={15} />
                                    }
                                    <span className="aro-bubble-file-name">{(message.file as File).name}</span>
                                    <span className="aro-bubble-file-type">{getFileTypeLabel(message.file as File)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          <span className="aro-timestamp">
                            {message.sender === 'omi' ? 'Omi' : 'You'} •{' '}
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}

                {/* Thinking / processing indicator — shown while Omi is responding
                    to a chat message OR while the "Add supporting material" modal
                    submission is in flight. */}
                <AnimatePresence>
                  {(isSendingMessage || isSubmitting || isProcessingMaterial) && (
                    <motion.div
                      key="typing-indicator"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.2 }}
                      className="aro-message-row aro-message-row--omi"
                    >
                      <div className="aro-bubble-wrapper aro-bubble-wrapper--omi">
                        <div className="aro-typing-indicator">
                          <div className="aro-omi-avatar">
                            <video className="aro-omi-video" src={OmiKeyboard} autoPlay loop muted playsInline />
                          </div>
                          <div className="aro-typing-text-wrap">
                            <AnimatePresence mode="wait">
                              <motion.span
                                key={isProcessingMaterial ? 'processing-material' : thinkingPhraseIndex}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.25 }}
                                className="aro-typing-text"
                              >
                                {isProcessingMaterial ? "Adding your material…" : thinkingPhrases[thinkingPhraseIndex]}
                              </motion.span>
                            </AnimatePresence>
                            <span className="aro-typing-dots">
                              <span /><span /><span />
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div ref={chatEndRef} />
              </>
            )}
          </div>

          {/* CTA / input bar */}
          {isViewOnly ? (
            <motion.div
              className="aro-cta-section"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <p className="aro-cta-heading">
                {isObjectiveConfirmed
                  ? 'Research objective recorded. View the personas below.'
                  : 'This is a view-only walkthrough — the conversation above is read-only.'}
              </p>
              <div className="aro-cta-buttons">
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  onClick={() =>
                    navigate(
                      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`,
                      { state: { viewOnly: true } }
                    )
                  }
                  className="aro-btn-omi"
                >
                  <TbSparkles size={16} />
                  <span>View Personas</span>
                </motion.button>
              </div>
            </motion.div>

          ) : isObjectiveConfirmed ? (
            <motion.div
              className="aro-cta-section"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {hasSubmittedFramer && (
                <button
                  className="aro-ro-framer-btn"
                  type="button"
                  onClick={handleViewROFramerSummary}
                  title="Review what you entered in the research framer"
                >
                  Review your research framing →
                </button>
              )}
              <p className="aro-cta-heading">All set. Now let's bring the personas to life.</p>
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

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="aro-btn-manual-wrap"
                  title={!manualAllowed ? "Upgrade to Enterprise to build personas manually" : undefined}
                >
                  <button
                    onClick={handleBuildManually}
                    className={`aro-btn-manual ${!manualAllowed ? 'aro-btn-manual--locked' : ''}`}
                  >
                    {!manualAllowed ? <TbLock size={15} /> : <TbPencil size={16} />}
                    <span>Build Manually</span>
                  </button>
                </motion.div>
              </div>
            </motion.div>

          ) : (
            <div className="aro-input-bar">

              {/* ── Material strip — shows what was uploaded via the modal ── */}
              <AnimatePresence>
                {materialItems.length > 0 && (
                  <motion.div
                    className="aro-material-strip"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.18 }}
                  >
                    <div className="aro-material-strip__pills">
                      <AnimatePresence>
                        {materialItems.map(item => (
                          <motion.span
                            key={item.key}
                            className="aro-material-pill"
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.88 }}
                            transition={{ duration: 0.15 }}
                          >
                            {item.type === 'file'
                              ? <TbFileTypeDoc size={13} />
                              : <TbPaperclip size={13} />
                            }
                            <span className="aro-material-pill__name">{item.label}</span>
                            <span className="aro-material-pill__badge">{item.badge}</span>
                            <button
                              type="button"
                              className="aro-material-pill__remove"
                              onClick={item.onRemove}
                              aria-label={`Remove ${item.label}`}
                            >
                              <TbX size={10} />
                            </button>
                          </motion.span>
                        ))}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* File preview pill (chat file attach — separate from modal material) */}
              <AnimatePresence>
                {uploadedFile && (
                  <motion.div
                    className="aro-file-pill"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.15 }}
                  >
                    {uploadedFile.name.toLowerCase().endsWith('.pdf')
                      ? <TbFileTypePdf size={14} />
                      : uploadedFile.name.toLowerCase().endsWith('.xls') ||
                        uploadedFile.name.toLowerCase().endsWith('.xlsx')
                        ? <TbFileTypeXls size={14} />
                        : <TbFileTypeDoc size={14} />
                    }
                    <span className="aro-file-pill-name">{uploadedFile.name}</span>
                    <span className="aro-file-pill-badge">{getFileTypeLabel(uploadedFile)}</span>
                    <button
                      className="aro-file-pill-remove"
                      onClick={handleRemoveFile}
                      disabled={isSubmitting}
                      aria-label="Remove file"
                    >
                      <TbX size={13} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* File error */}
              <AnimatePresence>
                {fileError && (
                  <motion.div
                    className="aro-file-error"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <TbAlertCircle size={14} />
                    <span>{fileError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {isFreshFirstInteraction && (
                <button
                  className="aro-ro-framer-btn"
                  type="button"
                  onClick={handleOpenROFramer}
                  title="Frame your Research Objective step by step"
                >
                  Guide me through research framing →
                </button>
              )}

              {hasSubmittedFramer && (
                <button
                  className="aro-ro-framer-btn"
                  type="button"
                  onClick={handleViewROFramerSummary}
                  title="Review what you entered in the research framer"
                >
                  Review your research framing →
                </button>
              )}

              <form onSubmit={handleSendMessage} className="aro-input-form">
                <button
                  type="button"
                  className="aro-input-file-label"
                  title="Add supporting material"
                  onClick={() => setShowFileModal(true)}
                  disabled={isSubmitting || isLoading || isProcessingMaterial || !sessionData}
                >
                  <SpIcon name="sp-Edit-Paperclip_Attechment_Tilt" />
                </button>

                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
                  }}
                  className="aro-textarea"
                  rows={1}
                  disabled={isSubmitting || isLoading || isProcessingMaterial || !sessionData}
                  placeholder={uploadedFile ? "Add a message about your file (optional)…" : undefined}
                />

                {/* mic to be added later */}
                {/* <button
                  type="button"
                  className="aro-input-icon-btn"
                  disabled={isSubmitting || isLoading || !sessionData}
                >
                  <SpIcon name="sp-Other-Mic" />
                </button> */}

                <button
                  type="submit"
                  className="aro-send-btn"
                  disabled={isSubmitting || isLoading || isProcessingMaterial || !sessionData || (inputValue.trim() === "" && !uploadedFile)}
                >
                  <SpIcon name="sp-Communication-Paper_Plane" size={16} />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      <FileUploadModal
        isOpen={showFileModal}
        onClose={() => setShowFileModal(false)}
        onDone={handleMaterialDone}
        initialValue={uploadedMaterial ?? {}}
      />

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onUpgradeSuccess={() => setShowUpgradeModal(false)}
        showEnterpriseOnly={true}
      />
    </>
  );
};

export default AddResearchObjective;