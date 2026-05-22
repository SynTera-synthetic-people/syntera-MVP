import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseAutoSaveReturn {
  /** Human-readable label e.g. "just now", "30 sec ago", "2 min ago" */
  lastSavedLabel: string | null;
  /** Current save status */
  status: SaveStatus;
  /** Call this when a save is triggered (pass your async save fn) */
  triggerSave: (saveFn: () => Promise<void>) => Promise<void>;
  /** Call this to manually record a successful save at the current time */
  recordSave: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const getRelativeLabel = (savedAt: Date | null): string | null => {
  if (!savedAt) return null;

  const diffMs  = Date.now() - savedAt.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);

  if (diffSec < 5)  return 'just now';
  if (diffSec < 60) return `${diffSec} sec ago`;
  if (diffMin < 60) return `${diffMin} min ago`;

  // For anything older than 1 hour show wall-clock time
  return savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useAutoSave
 *
 * Tracks when the last save happened and exposes a human-readable relative
 * label that ticks every second. Also provides a `triggerSave` wrapper so
 * callers can fire an async save function and have status/timestamp updated
 * automatically.
 *
 * Usage:
 *   const { lastSavedLabel, status, triggerSave, recordSave } = useAutoSave();
 *
 *   // Option A — wrap your save function:
 *   triggerSave(() => api.saveProfile(data));
 *
 *   // Option B — record externally (e.g. after a mutation succeeds):
 *   onSuccess: () => recordSave()
 */
export const useAutoSave = (): UseAutoSaveReturn => {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [status, setStatus]   = useState<SaveStatus>('idle');
  const [label, setLabel]     = useState<string | null>(null);
  const tickRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick the label every second whenever we have a savedAt timestamp
  useEffect(() => {
    if (!savedAt) {
      setLabel(null);
      return;
    }

    // Update immediately
    setLabel(getRelativeLabel(savedAt));

    // Then update every second
    tickRef.current = setInterval(() => {
      setLabel(getRelativeLabel(savedAt));
    }, 1000);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [savedAt]);

  // Record a save right now
  const recordSave = useCallback(() => {
    setSavedAt(new Date());
    setStatus('saved');
  }, []);

  // Wrap an async save function — sets status & timestamp automatically
  const triggerSave = useCallback(async (saveFn: () => Promise<void>) => {
    setStatus('saving');
    try {
      await saveFn();
      setSavedAt(new Date());
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }, []);

  return {
    lastSavedLabel: label,
    status,
    triggerSave,
    recordSave,
  };
};

export default useAutoSave;