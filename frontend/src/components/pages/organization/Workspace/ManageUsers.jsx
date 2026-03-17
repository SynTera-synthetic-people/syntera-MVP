import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  TbUsers,
  TbArrowLeft,
  TbMail,
  TbTrash,
  TbCheck,
  TbClock,
} from "react-icons/tb";

import PremiumInput from "../../../common/PremiumInput";
import PremiumButton from "../../../common/PremiumButton";
import { workspaceService } from "../../../../services/workspaceService";
import { validateInvite } from "../../../../utils/validation";

const formatMemberName = (member) => member.full_name || member.email;

const ManageUsers = ({ workspaceId: propWorkspaceId, onBack: propOnBack }) => {
  const { id: paramId } = useParams();
  const navigate = useNavigate();

  const workspaceId = propWorkspaceId || paramId;
  const isEmbedded = Boolean(propWorkspaceId);
  const handleBack = propOnBack || (() => navigate("/main/organization/workspace"));

  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteErrors, setInviteErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const acceptedMembers = useMemo(
    () => members.filter((member) => member.accepted),
    [members],
  );
  const pendingMembers = useMemo(
    () => members.filter((member) => !member.accepted),
    [members],
  );

  const fetchMembers = async () => {
    if (!workspaceId) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await workspaceService.getMembers(workspaceId);
      setMembers(response.data || []);
    } catch (err) {
      setError(err?.message || "Failed to load workspace members.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [workspaceId]);

  const handleInviteUser = async () => {
    const validationErrors = validateInvite({ email: inviteEmail });
    if (Object.keys(validationErrors).length > 0) {
      setInviteErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    setInviteErrors({});
    setError("");
    setSuccessMessage("");

    try {
      await workspaceService.inviteMember(workspaceId, {
        email: inviteEmail.trim().toLowerCase(),
        role: "user",
      });
      setInviteEmail("");
      setSuccessMessage("Invitation sent successfully.");
      await fetchMembers();
    } catch (err) {
      setError(err?.message || "Failed to send invite.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveUser = async (memberId) => {
    if (!window.confirm("Remove this member from the workspace?")) {
      return;
    }

    setRemovingId(memberId);
    setError("");
    setSuccessMessage("");

    try {
      await workspaceService.removeMember(workspaceId, memberId);
      setMembers((prev) => prev.filter((member) => member.id !== memberId));
      setSuccessMessage("Member removed successfully.");
    } catch (err) {
      setError(err?.message || "Failed to remove member.");
    } finally {
      setRemovingId(null);
    }
  };

  const renderMemberCard = (member, index) => (
    <motion.div
      key={member.id}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className="bg-gray-50 dark:bg-white/5 border-2 border-gray-200 dark:border-white/10 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:border-blue-400 dark:hover:border-blue-500/30 transition-all"
    >
      <div className="flex-1">
        <p className="font-semibold text-gray-900 dark:text-white">{formatMemberName(member)}</p>
        <p className="text-gray-600 dark:text-gray-400 text-sm">{member.email}</p>
        <div className="flex items-center gap-2 mt-2 text-xs">
          <span className="px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 capitalize">
            {member.role}
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${
              member.accepted
                ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300"
                : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300"
            }`}
          >
            {member.accepted ? <TbCheck size={14} /> : <TbClock size={14} />}
            {member.accepted ? "Accepted" : "Pending"}
          </span>
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => handleRemoveUser(member.id)}
        disabled={removingId === member.id}
        className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg transition-colors font-medium text-sm disabled:opacity-60"
      >
        <TbTrash size={16} />
        {removingId === member.id ? "Removing..." : "Remove"}
      </motion.button>
    </motion.div>
  );

  const renderContent = () => (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
          <TbMail size={20} />
          Invite a User
        </h2>

        <div className="flex gap-3 flex-col sm:flex-row">
          <div className="flex-1">
            <PremiumInput
              placeholder="Enter user email"
              type="email"
              name="inviteEmail"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setInviteErrors({});
                setError("");
                setSuccessMessage("");
              }}
              error={inviteErrors.email}
            />
          </div>

          <PremiumButton onClick={handleInviteUser} variant="primary" disabled={submitting}>
            {submitting ? "Sending..." : "Send Invite"}
          </PremiumButton>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {successMessage && (
          <p className="mt-4 text-sm text-green-600 dark:text-green-400">
            {successMessage}
          </p>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Members
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No users in this workspace yet.
          </p>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                Active Members
              </p>
              {acceptedMembers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No accepted members yet.</p>
              ) : (
                <div className="grid gap-3">
                  {acceptedMembers.map(renderMemberCard)}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                Pending Invitations
              </p>
              {pendingMembers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No pending invites.</p>
              ) : (
                <div className="grid gap-3">
                  {pendingMembers.map((member, index) => renderMemberCard(member, index))}
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </>
  );

  if (isEmbedded) {
    return (
      <div className="flex flex-col gap-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4"
        >
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-lg shadow-blue-500/30">
            <TbUsers className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Manage Users</h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">Workspace access and invitations</p>
          </div>
        </motion.div>

        {renderContent()}
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 relative overflow-x-hidden">
      <div className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-blue-50/30 to-blue-100/20 dark:from-[#0a0e1a] dark:via-[#0f1419] dark:to-[#1a1f2e]" />
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-gradient-to-br from-blue-400/30 to-blue-600/20 dark:from-blue-500/40 dark:to-blue-700/30 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-tl from-blue-300/25 to-cyan-500/15 dark:from-blue-400/35 dark:to-cyan-600/25 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-6">
            <motion.button
              whileHover={{ scale: 1.05, backgroundColor: "rgba(255, 255, 255, 0.1)" }}
              whileTap={{ scale: 0.95 }}
              onClick={handleBack}
              className="w-14 h-14 rounded-[1.25rem] flex items-center justify-center bg-white/5 backdrop-blur-xl border border-gray-300/20 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-blue-500 transition-all shadow-lg shadow-black/5"
              title="Back"
            >
              <TbArrowLeft size={24} />
            </motion.button>

            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white flex-shrink-0">
                <TbUsers className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-none mb-2">
                  Manage Users
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
                  Workspace access and invitations
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="flex flex-col gap-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default ManageUsers;
