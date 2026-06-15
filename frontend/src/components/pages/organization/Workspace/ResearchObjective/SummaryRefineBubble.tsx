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
  /** Distance from viewport left — left edge of the floater panel/pill. */
  left: number;
  /** Arrow offset from the left edge of the floater — points at selection centre. */
  arrowOffset: number;
  /** The centre X of the selection in viewport coords — used to recompute arrowOffset after panel expands. */
  selectionCentreX: number;
}

interface SummaryRefineBubbleProps {
  message: Message;
  isLocked: boolean;
  isSending: boolean;
  onRefine: (selectedText: string, instruction: string) => Promise<void>;
  renderMessageContent: (message: Message) => React.ReactNode;
  /** Number of refinements already applied to this summary */
  editCount: number;
  /** Maximum number of refinements allowed (default 5) */
  maxEdits?: number;
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
  editCount,
  maxEdits = 10,
}) => {
  const textAreaRef    = useRef<HTMLDivElement>(null);
  const pillRef        = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  // Saved range — lets us restore the highlight after the pill steals focus
  const savedRangeRef  = useRef<Range | null>(null);
  // Fake-highlight <mark> element injected into the DOM
  const markRef        = useRef<HTMLElement | null>(null);

  const [selectedText, setSelectedText] = useState<string>("");
  const [anchor,       setAnchor]       = useState<PillAnchor | null>(null);
  const [inputOpen,    setInputOpen]    = useState<boolean>(false);
  const [instruction,  setInstruction]  = useState<string>("");
  const [status,       setStatus]       = useState<"idle" | "sending" | "sent">("idle");

  // ── Edit-limit helpers ────────────────────────────────────────────────────
  const limitReached     = editCount >= maxEdits;
  const remainingEdits   = Math.max(0, maxEdits - editCount);
  const effectivelyLocked = isLocked || limitReached;

  // ── Fake highlight helpers ────────────────────────────────────────────────

  /** Wrap the saved range in a <mark class="srb-highlight"> so the selection
   *  stays visible even after the native selection is cleared by button clicks. */
  const applyFakeHighlight = useCallback(() => {
    removeFakeHighlight();
    const range = savedRangeRef.current;
    if (!range) return;
    try {
      const mark = document.createElement("mark");
      mark.className = "srb-highlight";
      range.surroundContents(mark);
      markRef.current = mark;
    } catch {
      // surroundContents throws if the range crosses element boundaries — safe to ignore
    }
  }, []);

  /** Unwrap the <mark> and restore its text content in-place. */
  const removeFakeHighlight = useCallback(() => {
    const mark = markRef.current;
    if (!mark || !mark.parentNode) return;
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
    markRef.current = null;
  }, []);

  // ── Show pill on pointerup ────────────────────────────────────────────────

  const handlePointerUp = useCallback(() => {
    if (effectivelyLocked) return;

    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;

      const raw = sel.toString().trim();
      if (!raw || raw.length < 3) return;

      const range = sel.getRangeAt(0);
      if (!textAreaRef.current?.contains(range.commonAncestorContainer)) return;

      const rangeRect = range.getBoundingClientRect();
      if (!rangeRect.width && !rangeRect.height) return;

      // Save the range so we can restore highlight after button clicks
      savedRangeRef.current = range.cloneRange();

      const vpWidth  = window.innerWidth;
      const vpHeight = window.innerHeight;

      // Centre the selection — used to point the arrow
      const selectionCentreX = rangeRect.left + rangeRect.width / 2;

      // Position floater left edge: try to centre pill over selection,
      // clamp so the wider panel never clips the viewport edge
      let left = selectionCentreX - PILL_WIDTH / 2;
      left = Math.max(8, Math.min(left, vpWidth - PANEL_WIDTH - 8));

      // Arrow offset = how far the selection centre is from the floater's left edge
      const arrowOffset = Math.max(12, Math.min(selectionCentreX - left, PANEL_WIDTH - 12));

      // bottom = viewport bottom → TOP of selection + gap
      const bottom = vpHeight - rangeRect.top + GAP;

      setSelectedText(raw);
      setAnchor({ bottom, left, arrowOffset, selectionCentreX });
      setInputOpen(false);
      setInstruction("");
      setStatus("idle");
    });
  }, [effectivelyLocked]);

  // Apply fake highlight as soon as anchor is set (pill appears)
  useEffect(() => {
    if (anchor) {
      applyFakeHighlight();
      // Clear native selection — highlight is now handled by the <mark>
      window.getSelection()?.removeAllRanges();
    } else {
      removeFakeHighlight();
    }
  }, [anchor, applyFakeHighlight, removeFakeHighlight]);

  // Recalculate arrow offset when panel expands (pill → panel width change)
  const arrowOffset = anchor
    ? Math.max(12, Math.min(anchor.selectionCentreX - anchor.left, (inputOpen ? PANEL_WIDTH : PILL_WIDTH) - 12))
    : 0;

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
    removeFakeHighlight();
    savedRangeRef.current = null;
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
    if (limitReached) {
      dismiss();
      return;
    }
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
                {/* Arrow points at selection centre */}
                <div className="srb-arrow" style={{ marginLeft: arrowOffset - 6 }} />
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
                      {remainingEdits > 0
                        ? `Done — updating summary… (${remainingEdits} edit${remainingEdits === 1 ? "" : "s"} left)`
                        : "Done — updating summary… (edit limit reached)"}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Arrow — points at selection centre */}
                <div className="srb-arrow" style={{ marginLeft: arrowOffset - 6 }} />
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

        {!effectivelyLocked && (
          <div className="srb-hint">
            <TbSparkles size={11} />
            <span>
              See something you'd like to improve? Just highlight and refine.
              {remainingEdits <= 2 && (
                <> ({remainingEdits} edit{remainingEdits === 1 ? "" : "s"} left)</>
              )}
            </span>
          </div>
        )}

        {!isLocked && limitReached && (
          <div className="srb-hint srb-hint--limit">
            <TbSparkles size={11} />
            <span>You've reached the maximum of {maxEdits} edits for this summary.</span>
          </div>
        )}
      </div>

      {portal}
    </>
  );
};

export default SummaryRefineBubble;