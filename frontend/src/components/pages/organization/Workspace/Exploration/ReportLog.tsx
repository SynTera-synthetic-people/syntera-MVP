import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TbX } from "react-icons/tb";
import { useParams } from "react-router-dom";
import SpIcon from "../../../../SPIcon";
import "./ReportLog.css";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ReportLogProps {
    isOpen: boolean;
    explorationName?: string | undefined;
    /**
     * The exploration / objective ID — used to read localStorage keys written
     * by InsightGeneration. Also accepted as `explorationId`.
     * Falls back to the `objectiveId` URL param if neither prop is provided.
     */
    objectiveId?: string | undefined;
    explorationId?: string | undefined;
    /** Whether the user selected Qualitative as a research method. */
    isQualitative?: boolean;
    /** Whether the user selected Quantitative as a research method. */
    isQuantitative?: boolean;
    onClose: () => void;
    onDownload?: (itemId: string, itemLabel: string) => void;
    onView?: (itemId: string, itemLabel: string) => void;
}

// ── localStorage helpers ──────────────────────────────────────────────────────

/**
 * Resolve the objective ID to use for localStorage lookups.
 *
 * Priority: explicit prop → URL param.
 *
 * If after all that we still have nothing, we fall back to scanning every
 * localStorage key that matches the pattern and returning true if ANY of them
 * is set. This handles the edge case where ReportLog is mounted outside the
 * router context (e.g. inside Traceability) and no ID prop was forwarded.
 */
const resolveQualReady = (
    cardId: "verbatim" | "decision" | "behaviour",
    id: string | undefined
): boolean => {
    // Fast path: we have an ID — check the exact key
    if (id) {
        return localStorage.getItem(`qual_${cardId}_ready_${id}`) === "1";
    }
    // Fallback: scan for any matching key across all explorations
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) ?? "";
        if (key.startsWith(`qual_${cardId}_ready_`) && localStorage.getItem(key) === "1") {
            return true;
        }
    }
    return false;
};

const resolveQuantReady = (
    cardId: "raw" | "decision" | "behaviour",
    id: string | undefined
): boolean => {
    if (id) {
        return localStorage.getItem(`quant_insight_${cardId}_ready_${id}`) === "1";
    }
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) ?? "";
        if (key.startsWith(`quant_insight_${cardId}_ready_`) && localStorage.getItem(key) === "1") {
            return true;
        }
    }
    return false;
};

// ── Toast ─────────────────────────────────────────────────────────────────────

const Toast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => (
    <motion.div
        className="rl-toast"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.22 }}
    >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="9" cy="9" r="9" fill="#22c55e" />
            <path d="M5.5 9.2l2.3 2.3 4.2-4.2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="rl-toast__msg">{message}</span>
        <button className="rl-toast__close" onClick={onClose}><TbX size={14} /></button>
    </motion.div>
);

// ── Row ───────────────────────────────────────────────────────────────────────

const Row: React.FC<{
    label: string;
    indent?: boolean;
    onDownload: () => void;
    onView: () => void;
}> = ({ label, indent, onDownload, onView }) => (
    <div className={`rl-row${indent ? " rl-row--indent" : ""}`}>
        <div className="rl-row-left">
            <span className="rl-row-label">{label}</span>
        </div>
        <div className="rl-row-actions">
            <button className="rl-action-btn" onClick={onDownload} title={`Download ${label}`}><SpIcon name="sp-File-File_Download" /></button>
            <button className="rl-action-btn" onClick={onView} title={`View ${label}`}><SpIcon name="sp-Edit-Show" /></button>
        </div>
    </div>
);

// ── Component ─────────────────────────────────────────────────────────────────

const ReportLog: React.FC<ReportLogProps> = ({
    isOpen,
    explorationName,
    objectiveId: objectiveIdProp,
    explorationId: explorationIdProp,
    isQualitative = false,
    isQuantitative = false,
    onClose,
    onDownload,
    onView,
}) => {
    // ── Resolve the ID ────────────────────────────────────────────────────────
    const { objectiveId: objectiveIdParam } = useParams<{ objectiveId?: string }>();
    const resolvedId: string | undefined =
        objectiveIdProp || explorationIdProp || objectiveIdParam || undefined;

    // ── Method visibility ─────────────────────────────────────────────────────
    // If the parent hasn't explicitly opted into either method, show both as a
    // safe fallback. If at least one is explicitly selected, show ONLY the
    // selected ones — never show a section the user didn't opt into.
    const neitherSelected = !isQualitative && !isQuantitative;
    const showQual  = neitherSelected ? true : isQualitative;
    const showQuant = neitherSelected ? true : isQuantitative;

    // ── Generated insight availability — re-read on every open ───────────────
    // We store these in state and re-evaluate when isOpen changes so that if
    // the user generates a report and then opens the modal, they see it
    // immediately without a full page reload.
    const [qualVerbatimReady,  setQualVerbatimReady]  = useState(false);
    const [qualDecisionReady,  setQualDecisionReady]  = useState(false);
    const [qualBehaviourReady, setQualBehaviourReady] = useState(false);
    const [quantRawReady,      setQuantRawReady]      = useState(false);
    const [quantDecisionReady, setQuantDecisionReady] = useState(false);
    const [quantBehaviourReady,setQuantBehaviourReady]= useState(false);

    useEffect(() => {
        if (!isOpen) return;
        // Re-read localStorage every time the modal opens
        setQualVerbatimReady (resolveQualReady("verbatim",  resolvedId));
        setQualDecisionReady (resolveQualReady("decision",  resolvedId));
        setQualBehaviourReady(resolveQualReady("behaviour", resolvedId));
        setQuantRawReady      (resolveQuantReady("raw",       resolvedId));
        setQuantDecisionReady (resolveQuantReady("decision",  resolvedId));
        setQuantBehaviourReady(resolveQuantReady("behaviour", resolvedId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, resolvedId]);

    // ── Search ────────────────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState("");
    const q = searchQuery.toLowerCase().trim();
    const matches = useCallback((label: string) => !q || label.toLowerCase().includes(q), [q]);

    // ── Toast ─────────────────────────────────────────────────────────────────
    const [toast, setToast] = useState<string | null>(null);
    const showToast = (label: string) => {
        setToast(`${label} Downloaded Successfully`);
        setTimeout(() => setToast(null), 3000);
    };
    const dl = (id: string, label: string) => { showToast(label); onDownload?.(id, label); };
    const vw = (id: string, label: string) => { onView?.(id, label); };

    const modalTitle = explorationName ? `${explorationName} Report Log` : "<Exploration Name> Report Log";

    // ── Section visibility ────────────────────────────────────────────────────
    const qualSectionVisible = showQual && (
        matches("Discussion Guide") ||
        (qualVerbatimReady  && matches("Interview Verbatim")) ||
        (qualDecisionReady  && matches("Decision Intelligence")) ||
        (qualBehaviourReady && matches("Behaviour Archaeology")) ||
        matches("Conversation Studio Chats")
    );

    const quantSectionVisible = showQuant && (
        matches("Questionnaire") ||
        (quantRawReady       && matches("Raw Data Shell")) ||
        (quantDecisionReady  && matches("Decision Intelligence")) ||
        (quantBehaviourReady && matches("Behaviour Archaeology")) ||
        matches("Conversation Studio Chats")
    );

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div className="rl-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />

                    <div className="rl-toast-wrap">
                        <AnimatePresence>
                            {toast && <Toast key={toast} message={toast} onClose={() => setToast(null)} />}
                        </AnimatePresence>
                    </div>

                    <motion.div
                        className="rl-modal"
                        style={{ x: "-50%", y: "-50%" }}
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* ── Header ── */}
                        <div className="rl-header">
                            <h2 className="rl-title">{modalTitle}</h2>
                            <button className="rl-close-btn" onClick={onClose} aria-label="Close"><TbX size={18} /></button>
                        </div>

                        {/* ── Scrollable body ── */}
                        <div className="rl-scroll">

                            {/* Search */}
                            <div className="rl-search-wrap">
                                <svg className="rl-search-icon" width="15" height="15" viewBox="0 0 15 15" fill="none">
                                    <circle cx="6.5" cy="6.5" r="5" stroke="#6b7280" strokeWidth="1.4" />
                                    <path d="M10.5 10.5L13 13" stroke="#6b7280" strokeWidth="1.4" strokeLinecap="round" />
                                </svg>
                                <input
                                    className="rl-search-input"
                                    type="text"
                                    placeholder="Search by Report Name"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            {/* ══ PERSONA — always present ════════════════════════════════ */}
                            {matches("Persona Card") && (
                                <div className="rl-section">
                                    <div className="rl-section-hd"><span className="rl-section-label">PERSONA</span></div>
                                    <Row label="Persona Card"
                                        onDownload={() => dl("persona-card", "Persona Card")}
                                        onView={() => vw("persona-card", "Persona Card")} />
                                </div>
                            )}

                            {/* ══ QUAL ════════════════════════════════════════════════════ */}
                            {qualSectionVisible && (
                                <div className="rl-section">
                                    <div className="rl-section-hd"><span className="rl-section-label">QUAL</span></div>

                                    {/* Auto-generated — always shown */}
                                    {matches("Discussion Guide") && (
                                        <Row label="Discussion Guide"
                                            onDownload={() => dl("discussion-guide", "Discussion Guide")}
                                            onView={() => vw("discussion-guide", "Discussion Guide")} />
                                    )}

                                    {/* Only after user generates */}
                                    {qualVerbatimReady && matches("Interview Verbatim") && (
                                        <Row label="Interview Verbatim"
                                            onDownload={() => dl("interview-verbatim", "Interview Verbatim")}
                                            onView={() => vw("interview-verbatim", "Interview Verbatim")} />
                                    )}
                                    {qualDecisionReady && matches("Decision Intelligence") && (
                                        <Row label="Decision Intelligence"
                                            onDownload={() => dl("qual-decision-intelligence", "Decision Intelligence")}
                                            onView={() => vw("qual-decision-intelligence", "Decision Intelligence")} />
                                    )}
                                    {qualBehaviourReady && matches("Behaviour Archaeology") && (
                                        <Row label="Behaviour Archaeology"
                                            onDownload={() => dl("qual-behaviour-archaeology", "Behaviour Archaeology")}
                                            onView={() => vw("qual-behaviour-archaeology", "Behaviour Archaeology")} />
                                    )}

                                    {/* Always shown for qual */}
                                    {matches("Conversation Studio Chats") && (
                                        <Row label="Conversation Studio Chats"
                                            onDownload={() => dl("qual-conversation-studio", "Conversation Studio Chats")}
                                            onView={() => vw("qual-conversation-studio", "Conversation Studio Chats")} />
                                    )}
                                </div>
                            )}

                            {/* ══ QUANT ═══════════════════════════════════════════════════ */}
                            {quantSectionVisible && (
                                <div className="rl-section">
                                    <div className="rl-section-hd"><span className="rl-section-label">QUANT</span></div>

                                    {/* Auto-generated — always shown */}
                                    {matches("Questionnaire") && (
                                        <Row label="Questionnaire"
                                            onDownload={() => dl("questionnaire", "Questionnaire")}
                                            onView={() => vw("questionnaire", "Questionnaire")} />
                                    )}

                                    {/* Only after user generates */}
                                    {quantRawReady && matches("Raw Data Shell") && (
                                        <Row label="Raw Data Shell"
                                            onDownload={() => dl("raw-data-shell", "Raw Data Shell")}
                                            onView={() => vw("raw-data-shell", "Raw Data Shell")} />
                                    )}
                                    {quantDecisionReady && matches("Decision Intelligence") && (
                                        <Row label="Decision Intelligence"
                                            onDownload={() => dl("quant-decision-intelligence", "Decision Intelligence")}
                                            onView={() => vw("quant-decision-intelligence", "Decision Intelligence")} />
                                    )}
                                    {quantBehaviourReady && matches("Behaviour Archaeology") && (
                                        <Row label="Behaviour Archaeology"
                                            onDownload={() => dl("quant-behaviour-archaeology", "Behaviour Archaeology")}
                                            onView={() => vw("quant-behaviour-archaeology", "Behaviour Archaeology")} />
                                    )}

                                    {/* Always shown for quant */}
                                    {matches("Conversation Studio Chats") && (
                                        <Row label="Conversation Studio Chats"
                                            onDownload={() => dl("quant-conversation-studio", "Conversation Studio Chats")}
                                            onView={() => vw("quant-conversation-studio", "Conversation Studio Chats")} />
                                    )}
                                </div>
                            )}

                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default ReportLog;