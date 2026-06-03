import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { TbX, TbSparkles, TbLoader } from "react-icons/tb";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  sender: "omi" | "user";
  text: string;
  timestamp: Date;
  [key: string]: any;
}

interface PillPos {
  top: number;
  left: number;
}

interface SummaryRefineBubbleProps {
  message: Message;
  isLocked: boolean;
  isSending: boolean;
  onRefine: (selectedText: string, instruction: string) => Promise<void>;
  renderMessageContent: (message: Message) => React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

const PILL_WIDTH = 90; // approximate pill width in px

const SummaryRefineBubble: React.FC<SummaryRefineBubbleProps> = ({
  message,
  isLocked,
  isSending,
  onRefine,
  renderMessageContent,
}) => {
  const textAreaRef = useRef<HTMLDivElement>(null);
  const pillRef     = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  const [selectedText, setSelectedText] = useState<string>("");
  const [pillPos,      setPillPos]      = useState<PillPos | null>(null);
  const [inputOpen,    setInputOpen]    = useState<boolean>(false);
  const [instruction,  setInstruction]  = useState<string>("");
  const [status,       setStatus]       = useState<"idle" | "sending" | "sent">("idle");

  // ── Show pill on text selection ───────────────────────────────────────────

  const handlePointerUp = useCallback(() => {
    if (isLocked) return;

    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;

      const raw = sel.toString().trim();
      if (!raw || raw.length < 3) return;

      const range = sel.getRangeAt(0);
      if (!textAreaRef.current?.contains(range.commonAncestorContainer)) return;

      const rangeRect = range.getBoundingClientRect();
      if (!rangeRect.width && !rangeRect.height) return;

      // Centre the pill above the selection
      const vpWidth = window.innerWidth;
      let left = rangeRect.left + rangeRect.width / 2 - PILL_WIDTH / 2;
      left = Math.max(8, Math.min(left, vpWidth - PILL_WIDTH - 8));

      // Pill sits just above the selection
      const top = rangeRect.top - 8;

      setSelectedText(raw);
      setPillPos({ top, left });
      setInputOpen(false);   // reset — user needs to click pill to open input
      setInstruction("");
      setStatus("idle");
    });
  }, [isLocked]);

  // ── Dismiss on outside click ──────────────────────────────────────────────

  useEffect(() => {
    if (!pillPos) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (pillRef.current?.contains(e.target as Node)) return;
      if (textAreaRef.current?.contains(e.target as Node)) return;
      dismiss();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [pillPos]);

  // ── Escape key ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!pillPos) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pillPos]);

  // ── Auto-focus input when it opens ───────────────────────────────────────

  useEffect(() => {
    if (inputOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [inputOpen]);

  // ── Dismiss ───────────────────────────────────────────────────────────────

  const dismiss = () => {
    setPillPos(null);
    setSelectedText("");
    setInputOpen(false);
    setInstruction("");
    setStatus("idle");
    window.getSelection()?.removeAllRanges();
  };

  // ── Open input panel when pill is clicked ────────────────────────────────

  const handlePillClick = () => {
    setInputOpen(true);
  };

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!instruction.trim() || !selectedText || status !== "idle") return;
    setStatus("sending");
    try {
      await onRefine(selectedText, instruction.trim());
      setStatus("sent");
      setTimeout(dismiss, 1200);
    } catch {
      setStatus("idle");
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ── Preview text ──────────────────────────────────────────────────────────

  const previewText =
    selectedText.length > 60 ? selectedText.slice(0, 57) + "…" : selectedText;

  // ── Portal ────────────────────────────────────────────────────────────────

  const portal = pillPos
    ? createPortal(
        <AnimatePresence>
          <motion.div
            key="srb-portal"
            ref={pillRef}
            className="srb-portal"
            style={{ top: pillPos.top, left: pillPos.left }}
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 3, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* ── Step 1: Pill button ── */}
            {!inputOpen ? (
              <>
                <button
                  className="srb-pill"
                  onClick={handlePillClick}
                  aria-label="Refine selected text with Omi"
                >
                  <TbSparkles size={12} />
                  <span>Explore another angle</span>
                </button>
                {/* Down arrow */}
                <div className="srb-arrow" />
              </>
            ) : (
              /* ── Step 2: Input panel (expands from pill) ── */
              <motion.div
                className="srb-input-panel"
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1,    y: 0   }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Header */}
                <div className="srb-panel-header">
                  <div className="srb-panel-header-left">
                    <TbSparkles size={12} />
                    <span>Refine with Omi</span>
                  </div>
                  <button className="srb-panel-close" onClick={dismiss} tabIndex={-1}>
                    <TbX size={12} />
                  </button>
                </div>

                {/* Selected text preview */}
                {/* <div className="srb-panel-preview">
                  <span className="srb-panel-preview-label">Selected</span>
                  <span className="srb-panel-preview-text">"{previewText}"</span>
                </div> */}

                {/* Input row */}
                <div className={`srb-panel-input-row${status !== "idle" ? " srb-panel-input-row--disabled" : ""}`}>
                  <input
                    ref={inputRef}
                    className="srb-panel-input"
                    type="text"
                    placeholder="Describe your change…"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    disabled={status !== "idle"}
                    maxLength={280}
                  />
                  <button
                    className={`srb-panel-submit${!instruction.trim() || status !== "idle" ? " srb-panel-submit--disabled" : ""}`}
                    onClick={handleSubmit}
                    disabled={!instruction.trim() || status !== "idle"}
                    aria-label="Apply refinement"
                  >
                    {status === "sending" ? (
                      <TbLoader size={13} className="srb-spin" />
                    ) : status === "sent" ? (
                      <span className="srb-check">✓</span>
                    ) : (
                      <TbSparkles size={13} />
                    )}
                  </button>
                </div>

                {/* Sent confirmation */}
                <AnimatePresence>
                  {status === "sent" && (
                    <motion.p
                      className="srb-panel-sent"
                      initial={{ opacity: 0, y: 2 }}
                      animate={{ opacity: 1,  y: 0 }}
                      exit={{ opacity: 0 }}
                    >
                      Done — updating summary…
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Down arrow */}
                <div className="srb-arrow" />
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>,
        document.body
      )
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="srb-bubble">
        <div
          ref={textAreaRef}
          className="srb-bubble-text"
          onPointerUp={handlePointerUp}
        >
          {renderMessageContent(message)}
        </div>

        {!isLocked && (
          <div className="srb-hint">
            <TbSparkles size={11} />
            <span>See something you'd like to improve? Just highlight and refine.</span>
          </div>
        )}
      </div>

      {portal}
    </>
  );
};

export default SummaryRefineBubble;