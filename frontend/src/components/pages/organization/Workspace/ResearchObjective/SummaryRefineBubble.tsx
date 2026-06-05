import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { TbX, TbSparkles, TbLoader } from "react-icons/tb";

interface Message {
  id: string;
  sender: "omi" | "user";
  text: string;
  timestamp: Date;
  [key: string]: any;
}

interface PillAnchor {
  /** Distance from viewport bottom to the TOP of the selection. Floater bottom = this + gap. */
  bottom: number;
  /** Distance from viewport left, centred over selection. */
  left: number;
}

interface SummaryRefineBubbleProps {
  message: Message;
  isLocked: boolean;
  isSending: boolean;
  onRefine: (selectedText: string, instruction: string) => Promise<void>;
  renderMessageContent: (message: Message) => React.ReactNode;
}

const PILL_WIDTH   = 180;
const PANEL_WIDTH  = 360;
const GAP          = 10; // px gap between floater bottom and selection top

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
  const [anchor,       setAnchor]       = useState<PillAnchor | null>(null);
  const [inputOpen,    setInputOpen]    = useState<boolean>(false);
  const [instruction,  setInstruction]  = useState<string>("");
  const [status,       setStatus]       = useState<"idle" | "sending" | "sent">("idle");

  // ── Show pill on pointerup ────────────────────────────────────────────────

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

      const vpWidth  = window.innerWidth;
      const vpHeight = window.innerHeight;

      // Centre pill over selection; clamp to viewport edges (use panel width
      // for clamping so the wider panel doesn't clip when it opens)
      let left = rangeRect.left + rangeRect.width / 2 - PILL_WIDTH / 2;
      left = Math.max(8, Math.min(left, vpWidth - PANEL_WIDTH - 8));

      // bottom = distance from viewport bottom to TOP of selection + gap
      // → floater bottom edge sits exactly GAP px above the selection top
      const bottom = vpHeight - rangeRect.top + GAP;

      setSelectedText(raw);
      setAnchor({ bottom, left });
      setInputOpen(false);
      setInstruction("");
      setStatus("idle");
    });
  }, [isLocked]);

  // ── Dismiss on outside click ──────────────────────────────────────────────

  useEffect(() => {
    if (!anchor) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (pillRef.current?.contains(e.target as Node)) return;
      if (textAreaRef.current?.contains(e.target as Node)) return;
      dismiss();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [anchor]);

  // ── Escape key ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [anchor]);

  // ── Auto-focus input when panel opens ────────────────────────────────────

  useEffect(() => {
    if (inputOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [inputOpen]);

  // ── Dismiss ───────────────────────────────────────────────────────────────

  const dismiss = () => {
    setAnchor(null);
    setSelectedText("");
    setInputOpen(false);
    setInstruction("");
    setStatus("idle");
    window.getSelection()?.removeAllRanges();
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

  const previewText =
    selectedText.length > 60 ? selectedText.slice(0, 57) + "…" : selectedText;

  // ── Portal ────────────────────────────────────────────────────────────────

  const portal = anchor
    ? createPortal(
        <AnimatePresence>
          <motion.div
            key="srb-portal"
            ref={pillRef}
            className="srb-portal"
            style={{ bottom: anchor.bottom, left: anchor.left }}
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1,  y:  0, scale: 1    }}
            exit={{    opacity: 0,  y: -3, scale: 0.97  }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* ── Step 1: Pill ── */}
            {!inputOpen ? (
              <>
                <button
                  className="srb-pill"
                  onClick={() => setInputOpen(true)}
                  aria-label="Refine selected text with Omi"
                >
                  <TbSparkles size={12} />
                  <span>Explore another angle</span>
                </button>
                <div className="srb-arrow" />
              </>
            ) : (
              /* ── Step 2: Input panel ── */
              <motion.div
                className="srb-input-panel"
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1,    y:  0  }}
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
                      initial={{ opacity: 0, height: 0      }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{    opacity: 0, height: 0      }}
                      transition={{ duration: 0.18 }}
                    >
                      Done — updating summary…
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Arrow — always last so it sits at the bottom */}
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