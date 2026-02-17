import React, { useState, useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from "framer-motion";
import {
  TbUsers,
  TbSearch,
  TbEye,
  TbUserOff,
  TbCalendar,
  TbMail,
  TbUserCircle,
  TbShieldCheck,
  TbX,
  TbBriefcase,
  TbTelescope,
  TbReload
} from "react-icons/tb";
import { useTheme } from "../../../context/ThemeContext";
import { adminService } from "../../../services/adminService";


// Custom Tooltip Button Component (from WorkspaceList)
const TooltipButton = ({ onClick, icon, label, colorClass, className }) => {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div className="relative flex items-center justify-center">
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`p-2 rounded-lg transition-colors relative ${colorClass} ${className || ''}`}
        aria-label={label}
      >
        {icon}
      </motion.button>

      {isHovered && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.8 }}
          animate={{ opacity: 1, y: -40, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.8 }}
          transition={{ duration: 0.15 }}
          className="absolute z-50 px-3 py-1.5 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded-lg shadow-xl whitespace-nowrap pointer-events-none"
        >
          {label}
          <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
        </motion.div>
      )}
    </div>
  );
};

const UserDetailsModal = ({ user, onClose, onToggleStatus }) => {
  const [stats, setStats] = useState({ workspaces: 0, explorations: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return;
      try {
        setStatsLoading(true);
        const userId = user.user_id || user.id;
        const response = await adminService.getUserStats(userId);
        if (response.status === "success") {
          setStats({
            workspaces: response.data.workspace_count,
            explorations: response.data.exploration_count
          });
        }
      } catch (err) {
        console.error("Error fetching user stats:", err);
        setStatsError("Failed to load statistics");
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();
  }, [user]);

  if (!user) return null;

  const fullName = user.full_name || user.fullName || "Unnamed User";
  const userType = user.user_type || user.userType || "User";
  const status = user.status || "Active";
  const userId = user.user_id || user.id;

  const handleToggle = async () => {
    setIsToggling(true);
    await onToggleStatus(userId, status);
    setIsToggling(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-lg bg-white dark:bg-[#1a1f2e] rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-white/10"
      >
        {/* Header Background */}
        <div className="h-32 bg-gradient-to-r from-blue-600 to-blue-800 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors"
          >
            <TbX size={20} />
          </button>
          <div className="absolute -bottom-12 left-8">
            <div className="w-24 h-24 rounded-full border-4 border-white dark:border-[#1a1f2e] bg-white dark:bg-gray-800 flex items-center justify-center shadow-lg">
              <TbUserCircle className="w-20 h-20 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        <div className="pt-16 px-8 pb-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{fullName}</h2>
            <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-1">
              <TbMail size={16} />
              {user.email}
            </p>
            <div className="flex gap-2 mt-3">
              <span className="px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-100 dark:border-blue-800">
                {userType}
              </span>
              <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${status === 'Active' || status === 'active'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800'
                }`}>
                {status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 hover:border-blue-200 dark:hover:border-blue-500/30 transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
                  <TbBriefcase size={20} />
                </div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Workspaces</span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white pl-1">
                {statsLoading ? (
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                ) : statsError ? (
                  <span className="text-xs text-red-500 font-normal">Error</span>
                ) : (
                  stats.workspaces
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 hover:border-purple-200 dark:hover:border-purple-500/30 transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400">
                  <TbTelescope size={20} />
                </div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Explorations</span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white pl-1">
                {statsLoading ? (
                  <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                ) : statsError ? (
                  <span className="text-xs text-red-500 font-normal">Error</span>
                ) : (
                  stats.explorations
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-white/10 flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isToggling}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-transparent border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleToggle}
              disabled={isToggling}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition-colors ${status === 'Suspended' || status === 'suspended'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-red-600 hover:bg-red-700'
                }`}
            >
              {isToggling ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <TbUserOff size={16} />
              )}
              {status === 'Suspended' || status === 'suspended' ? 'Activate User' : 'Suspend User'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const AdminUserList = () => {
  const { theme } = useTheme();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await adminService.getUsers();
      if (response.status === "success") {
        setUsers(response.data);
      } else {
        setError(response.message || "Failed to fetch users");
      }
    } catch (err) {
      console.error("User list error:", err);
      setError(err.message || "An error occurred while fetching users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleStatus = async (userId, currentStatus) => {
    try {
      setTogglingId(userId);
      const newActiveState = !(currentStatus === 'Active' || currentStatus === 'active');
      const response = await adminService.toggleUserStatus(userId, newActiveState);

      if (response.status === "success") {
        const newStatus = newActiveState ? 'Active' : 'Suspended';
        setUsers(prevUsers => prevUsers.map(u => {
          const uId = u.user_id || u.id;
          if (uId === userId) {
            return { ...u, status: newStatus };
          }
          return u;
        }));

        // Update selected user if modal is open
        if (selectedUser) {
          setSelectedUser(prev => ({ ...prev, status: newStatus }));
        }
      }
    } catch (err) {
      console.error("Toggle status error:", err);
      alert(err.message || "Failed to update user status");
    } finally {
      setTogglingId(null);
    }
  };

  const filteredUsers = users.filter(user => {
    const fullName = user.full_name || user.fullName || "";
    const email = user.email || "";
    return (
      fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 dark:text-gray-400 animate-pulse">Loading system users...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="p-4 rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400">
          <TbReload size={40} className="cursor-pointer hover:rotate-180 transition-transform duration-500" onClick={fetchUsers} />
        </div>
        <p className="text-red-600 dark:text-red-400 font-medium text-center max-w-md">{error}</p>
        <button
          onClick={fetchUsers}
          className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative z-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-500/30 text-white">
            <TbUsers className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              User Management
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {users.length} system users found
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
              <TbSearch className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-white/10 rounded-xl leading-5 bg-white/50 dark:bg-white/5 backdrop-blur-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
            />
          </div>
        </div>
      </motion.div>

      {/* Main Card Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden"
      >
        {/* List Header */}
        <div className="grid grid-cols-12 gap-4 p-6 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          <div className="col-span-12 md:col-span-3 pl-2">Full Name</div>
          <div className="col-span-12 md:col-span-3 flex items-center gap-2">
            <TbMail size={16} />
            Email Address
          </div>
          <div className="col-span-12 md:col-span-2">User Type</div>
          <div className="col-span-12 md:col-span-2">Joined Date</div>
          <div className="col-span-12 md:col-span-1">Status</div>
          <div className="col-span-12 md:col-span-1 text-right pr-2">Actions</div>
        </div>

        {/* User Rows */}
        <div className="divide-y divide-gray-200 dark:divide-white/10">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-16 px-4">
              <TbUsers className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {searchTerm ? "No users match your search" : "No users found"}
              </h3>
            </div>
          ) : (
            filteredUsers.map((user, index) => {
              const fullName = user.full_name || user.fullName || "Unnamed User";
              const userType = user.user_type || user.userType || "User";
              const createdAt = user.created_at || user.createdAt || new Date().toISOString();
              const userId = user.user_id || user.id;
              const status = user.status || 'Active';
              const isSuspended = status === 'Suspended' || status === 'suspended';

              return (
                <motion.div
                  key={userId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="grid grid-cols-12 gap-4 p-6 items-center hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group"
                >
                  {/* Full Name */}
                  <div className="col-span-12 md:col-span-3 flex items-center gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                      <TbUserCircle size={24} />
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {fullName}
                    </span>
                  </div>

                  {/* Email */}
                  <div className="col-span-12 md:col-span-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="truncate">{user.email}</span>
                  </div>

                  {/* User Type */}
                  <div className="col-span-12 md:col-span-2">
                    <span className="px-2 py-1 rounded-md bg-gray-100 dark:bg-white/10 text-xs font-medium text-gray-600 dark:text-gray-300">
                      {userType}
                    </span>
                  </div>

                  {/* Created Date */}
                  <div className="col-span-12 md:col-span-2 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <TbCalendar size={16} />
                      {new Date(createdAt).toLocaleDateString()}
                    </div>
                    <div className="text-[10px] ml-6 opacity-70">
                      {new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="col-span-12 md:col-span-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${!isSuspended
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                      {status}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="col-span-12 md:col-span-1 flex items-center justify-end gap-2">
                    <TooltipButton
                      onClick={() => setSelectedUser(user)}
                      icon={<TbEye size={18} />}
                      label="View Details"
                      colorClass="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20"
                    />
                    <TooltipButton
                      onClick={() => handleToggleStatus(userId, status)}
                      icon={togglingId === userId ? (
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <TbUserOff size={18} />
                      )}
                      label={isSuspended ? "Activate User" : "Suspend User"}
                      colorClass={!isSuspended
                        ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20"
                        : "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20"
                      }
                    />
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </motion.div>


      <AnimatePresence>
        {selectedUser && (
          <UserDetailsModal
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
            onToggleStatus={handleToggleStatus}
          />
        )}
      </AnimatePresence>
    </div >
  );
};

export default AdminUserList;
