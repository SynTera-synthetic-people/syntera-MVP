import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { validateInvite } from "../../../../utils/validation";
import PremiumInput from "../../../common/PremiumInput";
import PremiumButton from "../../../common/PremiumButton";
import { motion } from "framer-motion";
import { TbUsers, TbArrowLeft, TbMail, TbTrash } from "react-icons/tb";
import { useTheme } from "../../../../context/ThemeContext";

const ManageUsers = ({ workspaceId: propWorkspaceId, onBack: propOnBack }) => {
  const { id: paramId } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();

  // Use prop workspaceId if provided (for Settings panel), otherwise use URL param
  const id = propWorkspaceId || paramId;
  const isEmbedded = !!propWorkspaceId; // If workspaceId is passed as prop, we're in embedded mode
  const handleBack = propOnBack || (() => navigate("/main/organization/workspace"));

  const [users, setUsers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteErrors, setInviteErrors] = useState({});

  const fetchUsers = async () => {
    try {
      // const res = await getWorkspaceUsers(id);
      // setUsers(res.data || []);
      // Mock data for now
      setUsers([]);
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  };

  const handleInviteUser = async () => {
    const validationErrors = validateInvite({ email: inviteEmail });
    if (Object.keys(validationErrors).length > 0) {
      setInviteErrors(validationErrors);
      return;
    }
    setInviteErrors({});

    try {
      // await inviteUserToWorkspace(id, inviteEmail, inviteRole);
      alert("Invitation sent!");
      setInviteEmail("");
      fetchUsers();
    } catch (err) {
      console.error("Error inviting user:", err);
      alert("Error sending invite.");
    }
  };

  const removeUser = async (userId) => {
    if (!window.confirm("Are you sure you want to remove this user?")) return;

    try {
      // await removeUserFromWorkspace(id, userId);
      fetchUsers();
    } catch (err) {
      console.error("Error removing user:", err);
    }
  };

  useEffect(() => {
    if (id) {
      fetchUsers();
    }
  }, [id]);

  // Embedded mode (for Settings panel) - simplified layout
  if (isEmbedded) {
    return (
      <div className="flex flex-col gap-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4"
        >
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-lg shadow-blue-500/30">
            <TbUsers className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Manage Users
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Organization access and permissions
            </p>
          </div>
        </motion.div>

        {/* Invite User Section */}
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

          <div className="flex gap-3">
            <div className="flex-1">
              <PremiumInput
                placeholder="Enter user email"
                type="email"
                name="inviteEmail"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                error={inviteErrors.email}
              />
            </div>

            <PremiumButton onClick={handleInviteUser} variant="primary">
              Send Invite
            </PremiumButton>
          </div>
        </motion.div>

        {/* Users List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl p-6 shadow-lg"
        >
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
            Members
          </h2>

          {users.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No users found.
            </p>
          ) : (
            <div className="grid gap-3">
              {users.map((u, index) => (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-gray-50 dark:bg-white/5 border-2 border-gray-200 dark:border-white/10 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:border-blue-400 dark:hover:border-blue-500/30 transition-all"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white">{u.name}</p>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">{u.email}</p>
                    <p className="text-gray-500 dark:text-gray-500 text-xs capitalize mt-1">
                      Role: {u.role}
                    </p>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => removeUser(u.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg transition-colors font-medium text-sm"
                  >
                    <TbTrash size={16} />
                    Remove
                  </motion.button>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // Full-page mode (standalone route) - original layout with background
  return (
    <div className="min-h-screen p-4 md:p-8 relative overflow-x-hidden">
      {/* Fixed Background Layer */}
      <div className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden z-0">
        {/* Base Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-blue-50/30 to-blue-100/20 dark:from-[#0a0e1a] dark:via-[#0f1419] dark:to-[#1a1f2e]" />

        {/* Background Gradient Orbs */}
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-gradient-to-br from-blue-400/30 to-blue-600/20 dark:from-blue-500/40 dark:to-blue-700/30 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-tl from-blue-300/25 to-cyan-500/15 dark:from-blue-400/35 dark:to-cyan-600/25 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header */}
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
                  Workspace access and permissions
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Invite User Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl p-6 shadow-lg mb-6"
        >
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
            <TbMail size={24} />
            Invite a User
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <PremiumInput
                placeholder="Enter user email"
                type="email"
                name="inviteEmail"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                error={inviteErrors.email}
              />
            </div>

            <PremiumButton onClick={handleInviteUser} variant="primary">
              Send Invite
            </PremiumButton>
          </div>
        </motion.div>

        {/* Users List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl p-6 shadow-lg"
        >
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Workspace Members
          </h2>

          {users.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              No users in this workspace yet.
            </p>
          ) : (
            <div className="grid gap-3">
              {users.map((u, index) => (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-gray-50 dark:bg-white/5 border-2 border-gray-200 dark:border-white/10 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 hover:border-blue-400 dark:hover:border-blue-500/30 transition-all"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white">{u.name}</p>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">{u.email}</p>
                    <p className="text-gray-500 dark:text-gray-500 text-xs capitalize mt-1">
                      Role: {u.role}
                    </p>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => removeUser(u.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg transition-colors font-medium text-sm"
                  >
                    <TbTrash size={16} />
                    Remove
                  </motion.button>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default ManageUsers;
