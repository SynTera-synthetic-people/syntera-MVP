import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TbMail, TbPlus, TbX } from "react-icons/tb";

import { workspaceService } from "../../../../services/workspaceService";

const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/i;

export default function InviteTeamModal({
  isOpen,
  workspaceId,
  workspaceName,
  onSkip,
  onLaunch,
}) {
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canAdd = useMemo(
    () => EMAIL_REGEX.test(emailInput.trim()) && !emails.includes(emailInput.trim().toLowerCase()),
    [emailInput, emails],
  );

  if (!isOpen) {
    return null;
  }

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

  const handleRemoveEmail = (email) => {
    setEmails((prev) => prev.filter((item) => item !== email));
  };

  const handleLaunch = async () => {
    setSubmitting(true);
    setError("");

    try {
      await Promise.all(
        emails.map((email) =>
          workspaceService.inviteMember(workspaceId, { email, role: "user" }),
        ),
      );
      onLaunch();
    } catch (err) {
      setError(err?.message || "Failed to send one or more invitations.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-xl rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#10141e] shadow-2xl p-8 text-gray-900 dark:text-white"
        >
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-3xl font-bold leading-tight">Collaborate With Your Team</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Invite team members by email to participate in{" "}
                <span className="font-semibold text-gray-800 dark:text-gray-200">{workspaceName}</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={onSkip}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            >
              <TbX size={20} />
            </button>
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-medium">
              Email Address <span className="text-red-500">*</span>
            </label>

            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <TbMail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
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
                  placeholder="Enter your team member email address"
                  className="w-full rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 py-3 pl-12 pr-4 outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={handleAddEmail}
                disabled={!canAdd}
                className={`h-12 w-12 rounded-xl flex items-center justify-center transition-colors ${
                  canAdd
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-gray-200 dark:bg-white/10 text-gray-400 cursor-not-allowed"
                }`}
              >
                <TbPlus size={20} />
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            {emails.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {emails.map((email) => (
                  <div
                    key={email}
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-white/10 px-3 py-2 text-sm"
                  >
                    <span>{email}</span>
                    <button type="button" onClick={() => handleRemoveEmail(email)} className="text-gray-400 hover:text-red-500">
                      <TbX size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-8 flex items-center gap-3">
            <button
              type="button"
              onClick={onSkip}
              disabled={submitting}
              className="px-5 py-3 rounded-xl border border-gray-300 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleLaunch}
              disabled={submitting}
              className="flex-1 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-60"
            >
              {submitting ? "Sending invites..." : "Launch Workspace"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
