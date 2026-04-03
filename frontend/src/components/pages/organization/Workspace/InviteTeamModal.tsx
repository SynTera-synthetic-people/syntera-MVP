import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TbPlus, TbX } from "react-icons/tb";
import { workspaceService } from "../../../../services/workspaceService";
import "./InviteTeamModalStyle.css";

// ── Types ────────────────────────────────────────────────────────────────────

interface InviteTeamModalProps {
  isOpen: boolean;
  workspaceId: string | undefined;
  workspaceName: string;
  onSkip: () => void;
  onLaunch: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i;
const MAX_INVITES = 10;

// ── Component ─────────────────────────────────────────────────────────────────

const InviteTeamModal: React.FC<InviteTeamModalProps> = ({
  isOpen,
  workspaceId,
  workspaceName,
  onSkip,
  onLaunch,
}) => {
  const [emailInput, setEmailInput] = useState<string>("");
  const [emails, setEmails] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const canAdd = useMemo(
    () =>
      EMAIL_REGEX.test(emailInput.trim()) &&
      !emails.includes(emailInput.trim().toLowerCase()),
    [emailInput, emails]
  );

  const remainingSlots = MAX_INVITES - emails.length;

  if (!isOpen) return null;

  // ── Handlers (all logic preserved exactly) ───────────────────────────────

  const handleAddEmail = () => {
    const normalized = emailInput.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalized)) {
      setError("Enter a valid email address.");
      return;
    }
    if (emails.includes(normalized)) {
      setError("That email is already added.");
      return;
    }

    setEmails((prev) => [...prev, normalized]);
    setEmailInput("");
    setError("");
  };

  const handleRemoveEmail = (email: string) => {
    setEmails((prev) => prev.filter((item) => item !== email));
  };

  const handleLaunch = async () => {
    setSubmitting(true);
    setError("");

    try {
      await Promise.all(
        emails.map((email) =>
          workspaceService.inviteMember(workspaceId, { email, role: "user" })
        )
      );
      onLaunch();
    } catch (err: any) {
      setError(err?.message || "Failed to send one or more invitations.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      <div className="itm-overlay" onClick={onSkip}>
        <motion.div
          className="itm-card"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close */}
          <button className="itm-close" onClick={onSkip} aria-label="Close">
            <TbX size={18} />
          </button>

          {/* Header */}
          <div className="itm-header">
            <h2 className="itm-title">Collaborate With Your Team</h2>
            <p className="itm-subtitle">
              Invite team members by email to participate in this workshop
            </p>
          </div>

          {/* Email field */}
          <div className="itm-field">
            <label className="itm-label">
              Email Address <span className="itm-required">*</span>
            </label>

            <div className="itm-input-row">
              <input
                type="email"
                className="itm-input"
                value={emailInput}
                onChange={(e) => {
                  setEmailInput(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddEmail();
                  }
                }}
                placeholder={
                  emails.length === 0
                    ? "Ask emails to collaborate on this workshop"
                    : "Enter your team member email address"
                }
                disabled={submitting || emails.length >= MAX_INVITES}
              />
              <button
                type="button"
                className="itm-add-btn"
                onClick={handleAddEmail}
                disabled={!canAdd || submitting || emails.length >= MAX_INVITES}
                aria-label="Add email"
              >
                <TbPlus size={18} />
              </button>
            </div>
          </div>

          {/* Error */}
          {error && <div className="itm-error">{error}</div>}

          {/* Email chips */}
          {emails.length > 0 && (
            <>
              <div className="itm-chips">
                {emails.map((email) => (
                  <div key={email} className="itm-chip">
                    <span>{email}</span>
                    <button
                      type="button"
                      className="itm-chip-remove"
                      onClick={() => handleRemoveEmail(email)}
                      aria-label={`Remove ${email}`}
                    >
                      <TbX size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {remainingSlots > 0 && (
                <p className="itm-counter">You can add {remainingSlots} more</p>
              )}
            </>
          )}

          {/* Footer */}
          <div className="itm-footer">
            <button
              type="button"
              className="itm-btn-cancel"
              onClick={onSkip}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`itm-btn-invite ${emails.length > 0 ? "itm-btn-invite--active" : ""}`}
              onClick={handleLaunch}
              disabled={submitting || emails.length === 0}
            >
              {submitting
                ? "Sending invites..."
                : emails.length > 0
                ? "Invite All"
                : "Invite"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default InviteTeamModal;