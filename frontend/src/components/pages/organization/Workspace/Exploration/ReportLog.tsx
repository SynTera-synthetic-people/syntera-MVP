import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TbX } from "react-icons/tb";
import SpIcon from "../../../../SPIcon";
import "./ReportLog.css";


// ── Props ─────────────────────────────────────────────────────────────────────

interface ReportLogProps {
    isOpen: boolean;
    explorationName?: string | undefined;
    onClose: () => void;
    onDownload?: (itemId: string, itemLabel: string) => void;
    onView?: (itemId: string, itemLabel: string) => void;
}

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
    isParent?: boolean;
    expanded?: boolean;
    onToggle?: () => void;
    onDownload: () => void;
    onView: () => void;
}> = ({ label, indent, isParent, expanded, onToggle, onDownload, onView }) => (
    <div className={`rl-row${indent ? " rl-row--indent" : ""}`}>
        <div className="rl-row-left">
            {isParent && (
                <button className={`rl-chevron${expanded ? " rl-chevron--open" : ""}`} onClick={onToggle} aria-label="Toggle">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            )}
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
    onClose,
    onDownload,
    onView,
}) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [toast, setToast] = useState<string | null>(null);
    const [dataPlaygroundOpen, setDataPlaygroundOpen] = useState(true);

    const showToast = (label: string) => {
        setToast(`${label} Downloaded Successfully`);
        setTimeout(() => setToast(null), 3000);
    };

    const dl = (id: string, label: string) => { showToast(label); onDownload?.(id, label); };
    const vw = (id: string, label: string) => { onView?.(id, label); };

    const q = searchQuery.toLowerCase().trim();

    const matches = (label: string) => !q || label.toLowerCase().includes(q);

    const modalTitle = explorationName ? `${explorationName} Report Log` : "<Exploration Name> Report Log";

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
                        {/* ── Header (sticky, never scrolls) ── */}
                        <div className="rl-header">
                            <h2 className="rl-title">{modalTitle}</h2>
                            <button className="rl-close-btn" onClick={onClose} aria-label="Close"><TbX size={18} /></button>
                        </div>

                        {/* ── Scrollable area: search + all sections ── */}
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

                            {/* ══ PERSONA ══════════════════════════════════════════════════ */}
                            {matches("Persona Card") && (
                                <div className="rl-section">
                                    <div className="rl-section-hd"><span className="rl-section-label">PERSONA</span></div>
                                    <Row label="Persona Card"
                                        onDownload={() => dl("persona-card", "Persona Card")}
                                        onView={() => vw("persona-card", "Persona Card")} />
                                </div>
                            )}

                            {/* ══ QUAL ═════════════════════════════════════════════════════ */}
                            {(matches("Discussion Guide") || matches("Interview Verbatim") || matches("Decision Intelligence") || matches("Behaviour Archaeology") || matches("Conversation Studio Chats")) && (
                                <div className="rl-section">
                                    <div className="rl-section-hd"><span className="rl-section-label">QUAL</span></div>

                                    {matches("Discussion Guide") && (
                                        <Row label="Discussion Guide"
                                            onDownload={() => dl("discussion-guide", "Discussion Guide")}
                                            onView={() => vw("discussion-guide", "Discussion Guide")} />
                                    )}
                                    {matches("Interview Verbatim") && (
                                        <Row label="Interview Verbatim"
                                            onDownload={() => dl("interview-verbatim", "Interview Verbatim")}
                                            onView={() => vw("interview-verbatim", "Interview Verbatim")} />
                                    )}
                                    {matches("Decision Intelligence") && (
                                        <Row label="Decision Intelligence"
                                            onDownload={() => dl("qual-decision-intelligence", "Decision Intelligence")}
                                            onView={() => vw("qual-decision-intelligence", "Decision Intelligence")} />
                                    )}
                                    {matches("Behaviour Archaeology") && (
                                        <Row label="Behaviour Archaeology"
                                            onDownload={() => dl("qual-behaviour-archaeology", "Behaviour Archaeology")}
                                            onView={() => vw("qual-behaviour-archaeology", "Behaviour Archaeology")} />
                                    )}
                                    {matches("Conversation Studio Chats") && (
                                        <Row label="Conversation Studio Chats"
                                            onDownload={() => dl("qual-conversation-studio", "Conversation Studio Chats")}
                                            onView={() => vw("qual-conversation-studio", "Conversation Studio Chats")} />
                                    )}
                                </div>
                            )}

                            {/* ══ QUANT ════════════════════════════════════════════════════ */}
                            {(matches("Questionnaire") || matches("Raw Data Shell") || matches("Decision Intelligence") || matches("Behaviour Archaeology") ||
                                matches("Data Playground") || matches("Frequency Table") || matches("Cross Tabs") || matches("Charts/Visuals") ||
                                matches("Insights/Summary") || matches("Coded Data") || matches("Labelled Data") || matches("Conversation Studio Chats")) && (
                                    <div className="rl-section">
                                        <div className="rl-section-hd"><span className="rl-section-label">QUANT</span></div>

                                        {matches("Questionnaire") && (
                                            <Row label="Questionnaire"
                                                onDownload={() => dl("questionnaire", "Questionnaire")}
                                                onView={() => vw("questionnaire", "Questionnaire")} />
                                        )}
                                        {matches("Raw Data Shell") && (
                                            <Row label="Raw Data Shell"
                                                onDownload={() => dl("raw-data-shell", "Raw Data Shell")}
                                                onView={() => vw("raw-data-shell", "Raw Data Shell")} />
                                        )}
                                        {matches("Decision Intelligence") && (
                                            <Row label="Decision Intelligence"
                                                onDownload={() => dl("quant-decision-intelligence", "Decision Intelligence")}
                                                onView={() => vw("quant-decision-intelligence", "Decision Intelligence")} />
                                        )}
                                        {matches("Behaviour Archaeology") && (
                                            <Row label="Behaviour Archaeology"
                                                onDownload={() => dl("quant-behaviour-archaeology", "Behaviour Archaeology")}
                                                onView={() => vw("quant-behaviour-archaeology", "Behaviour Archaeology")} />
                                        )}

                                        {/* Data Playground — collapsible parent */}
                                        {(matches("Data Playground") || matches("Frequency Table") || matches("Cross Tabs") || matches("Charts/Visuals") || matches("Insights/Summary") || matches("Coded Data") || matches("Labelled Data")) && (
                                            <>
                                                <Row label="Data Playground"
                                                    isParent
                                                    expanded={dataPlaygroundOpen}
                                                    onToggle={() => setDataPlaygroundOpen((v) => !v)}
                                                    onDownload={() => dl("data-playground", "Data Playground")}
                                                    onView={() => vw("data-playground", "Data Playground")} />

                                                {(dataPlaygroundOpen || q) && (
                                                    <>
                                                        {matches("Frequency Table") && (
                                                            <Row label="Frequency Table" indent
                                                                onDownload={() => dl("frequency-table", "Frequency Table")}
                                                                onView={() => vw("frequency-table", "Frequency Table")} />
                                                        )}
                                                        {matches("Cross Tabs") && (
                                                            <Row label="Cross Tabs" indent
                                                                onDownload={() => dl("cross-tabs", "Cross Tabs")}
                                                                onView={() => vw("cross-tabs", "Cross Tabs")} />
                                                        )}
                                                        {matches("Charts/Visuals") && (
                                                            <Row label="Charts/Visuals" indent
                                                                onDownload={() => dl("charts-visuals", "Charts/Visuals")}
                                                                onView={() => vw("charts-visuals", "Charts/Visuals")} />
                                                        )}
                                                        {matches("Insights/Summary") && (
                                                            <Row label="Insights/Summary" indent
                                                                onDownload={() => dl("insights-summary", "Insights/Summary")}
                                                                onView={() => vw("insights-summary", "Insights/Summary")} />
                                                        )}
                                                        {matches("Coded Data") && (
                                                            <Row label="Coded Data" indent
                                                                onDownload={() => dl("coded-data", "Coded Data")}
                                                                onView={() => vw("coded-data", "Coded Data")} />
                                                        )}
                                                        {matches("Labelled Data") && (
                                                            <Row label="Labelled Data" indent
                                                                onDownload={() => dl("labelled-data", "Labelled Data")}
                                                                onView={() => vw("labelled-data", "Labelled Data")} />
                                                        )}
                                                    </>
                                                )}
                                            </>
                                        )}

                                        {matches("Conversation Studio Chats") && (
                                            <Row label="Conversation Studio Chats"
                                                onDownload={() => dl("quant-conversation-studio", "Conversation Studio Chats")}
                                                onView={() => vw("quant-conversation-studio", "Conversation Studio Chats")} />
                                        )}
                                    </div>
                                )}

                        </div>{/* end rl-scroll */}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default ReportLog;