import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TbArrowLeft,
  TbUserCircle,
  TbEdit,
  TbUserOff,
  TbTrash,
  TbKey,
  TbCheck,
  TbX,
  TbCopy,
  TbAlertTriangle,
  TbReload,
} from 'react-icons/tb';
import { adminService } from '../../../services/adminService';

// Modal showing new temp password after reset
const TempPasswordModal = ({ userId, tempPassword, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-sm bg-white dark:bg-[#1a1f2e] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 p-8"
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
          <TbX size={18} />
        </button>

        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Password Reset</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">New credentials have been emailed to the user.</p>

        <div className="flex items-start gap-2 p-3 mb-5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
          <TbAlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
            This temporary password will only be shown once.
          </p>
        </div>

        <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 mb-6">
          <code className="flex-1 text-sm font-mono text-gray-900 dark:text-white break-all select-all">
            {tempPassword}
          </code>
          <button
            onClick={handleCopy}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              copied
                ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400'
                : 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-500/30'
            }`}
          >
            {copied ? <TbCheck size={13} /> : <TbCopy size={13} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-lg shadow-blue-500/30 transition-all hover:shadow-blue-500/40">
          Done
        </button>
      </motion.div>
    </div>
  );
};

const InfoRow = ({ label, value }) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-1 py-3 border-b border-gray-100 dark:border-white/5 last:border-0">
    <span className="text-sm font-medium text-gray-500 dark:text-gray-400 sm:w-48 flex-shrink-0">{label}</span>
    <span className="text-sm text-gray-900 dark:text-white">{value ?? '—'}</span>
  </div>
);

const Badge = ({ children, color = 'blue' }) => {
  const colors = {
    blue: 'bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800',
    green: 'bg-green-50 dark:bg-green-500/20 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800',
    red: 'bg-red-50 dark:bg-red-500/20 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800',
    amber: 'bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800',
    gray: 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border ${colors[color]}`}>
      {children}
    </span>
  );
};

const AdminUserDetail = () => {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Action states
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);

  const fetchUser = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminService.getUserDetail(userId);
      if (response.status === 'success') {
        setUser(response.data);
      } else {
        setError(response.message || 'Failed to load user.');
      }
    } catch (err) {
      setError(err?.message || 'Failed to load user.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [userId]);

  const handleEditStart = () => {
    setEditForm({
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      user_type: user.user_type,
      is_trial: user.is_trial,
      trial_exploration_limit: user.trial_exploration_limit,
    });
    setEditError('');
    setIsEditing(true);
  };

  const handleEditSave = async () => {
    setIsSaving(true);
    setEditError('');
    try {
      const response = await adminService.updateUser(userId, editForm);
      if (response.status === 'success') {
        setUser(response.data);
        setIsEditing(false);
      } else {
        setEditError(response.message || 'Update failed.');
      }
    } catch (err) {
      setEditError(err?.message || 'Update failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Deactivate this user? They will no longer be able to log in.')) return;
    setIsDeactivating(true);
    try {
      const response = await adminService.deactivateUser(userId);
      if (response.status === 'success') {
        setUser((prev) => ({ ...prev, is_active: false }));
      }
    } catch (err) {
      alert(err?.message || 'Failed to deactivate user.');
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Permanently delete this user? This action cannot be undone.')) return;
    setIsDeleting(true);
    try {
      await adminService.deleteUser(userId);
      navigate('/admin/users', { replace: true });
    } catch (err) {
      alert(err?.message || 'Failed to delete user.');
      setIsDeleting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!window.confirm("Reset this user's password? They will receive a new temporary password via email.")) return;
    setIsResetting(true);
    try {
      const response = await adminService.resetUserPassword(userId);
      if (response.status === 'success') {
        setTempPassword(response.data.temporary_password);
        setUser((prev) => ({ ...prev, must_change_password: true }));
      }
    } catch (err) {
      alert(err?.message || 'Failed to reset password.');
    } finally {
      setIsResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 dark:text-gray-400 animate-pulse">Loading user profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
        <div className="flex gap-3">
          <button onClick={fetchUser} className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
            Retry
          </button>
          <button onClick={() => navigate('/admin/users')} className="px-4 py-2 border border-gray-300 dark:border-white/10 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
            Back to Users
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8 flex-wrap gap-4"
      >
        <div className="flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/admin/users')}
            className="p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors"
          >
            <TbArrowLeft className="w-5 h-5" />
          </motion.button>
          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <TbUserCircle size={30} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{user.full_name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isEditing ? (
            <button
              onClick={handleEditStart}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
            >
              <TbEdit size={16} /> Edit
            </button>
          ) : (
            <>
              <button
                onClick={handleEditSave}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60"
              >
                {isSaving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <TbCheck size={16} />}
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-white/10 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                <TbX size={16} /> Cancel
              </button>
            </>
          )}

          {user.is_active && (
            <button
              onClick={handleDeactivate}
              disabled={isDeactivating}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors disabled:opacity-60"
            >
              {isDeactivating ? <span className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /> : <TbUserOff size={16} />}
              Deactivate
            </button>
          )}

          <button
            onClick={handleResetPassword}
            disabled={isResetting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-transparent border border-gray-300 dark:border-white/10 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-60"
          >
            {isResetting ? <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : <TbKey size={16} />}
            Reset Password
          </button>

          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors disabled:opacity-60"
          >
            {isDeleting ? <span className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> : <TbTrash size={16} />}
            Delete
          </button>
        </div>
      </motion.div>

      {/* Profile card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden"
      >
        {/* Account Status */}
        <div className="p-6 border-b border-gray-100 dark:border-white/10 flex items-center gap-3 flex-wrap">
          <Badge color={user.is_active ? 'green' : 'red'}>
            {user.is_active ? 'Active' : 'Inactive'}
          </Badge>
          <Badge color={user.is_trial ? 'amber' : 'blue'}>
            {user.is_trial ? 'Trial' : 'Full Access'}
          </Badge>
          {user.must_change_password && (
            <Badge color="amber">Password Change Required</Badge>
          )}
          <Badge color="gray">{user.role}</Badge>
        </div>

        {/* Info / Edit section */}
        <div className="p-6">
          {editError && (
            <p className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-4 py-2">
              {editError}
            </p>
          )}

          {!isEditing ? (
            <div>
              <InfoRow label="Full Name" value={user.full_name} />
              <InfoRow label="Email" value={user.email} />
              <InfoRow label="Role" value={user.role} />
              <InfoRow label="User Type" value={user.user_type} />
              <InfoRow label="Account Status" value={user.is_active ? 'Active' : 'Inactive'} />
              <InfoRow label="Created" value={new Date(user.created_at).toLocaleString()} />
            </div>
          ) : (
            <div className="space-y-4">
              {[
                { name: 'full_name', label: 'Full Name', type: 'text' },
                { name: 'email', label: 'Email', type: 'email' },
              ].map(({ name, label, type }) => (
                <div key={name}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
                  <input
                    type={type}
                    value={editForm[name] || ''}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, [name]: e.target.value }))}
                    disabled={isSaving}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none disabled:opacity-50"
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Role</label>
                  <select
                    value={editForm.role || 'user'}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))}
                    disabled={isSaving}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-[#1a1f2e] text-gray-900 dark:text-white focus:border-blue-500 outline-none disabled:opacity-50"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">User Type</label>
                  <select
                    value={editForm.user_type || 'Student'}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, user_type: e.target.value }))}
                    disabled={isSaving}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-[#1a1f2e] text-gray-900 dark:text-white focus:border-blue-500 outline-none disabled:opacity-50"
                  >
                    <option value="Student">Student</option>
                    <option value="Startup">Startup</option>
                    <option value="Researcher">Researcher</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Trial section */}
        <div className="p-6 border-t border-gray-100 dark:border-white/10">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
            Trial Status
          </h3>
          {!isEditing ? (
            <div>
              <InfoRow label="Is Trial" value={user.is_trial ? 'Yes' : 'No'} />
              <InfoRow label="Explorations Used" value={`${user.exploration_count} / ${user.trial_exploration_limit}`} />
              <InfoRow label="Must Change Password" value={user.must_change_password ? 'Yes' : 'No'} />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Free Trial</p>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.is_trial ?? true}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, is_trial: e.target.checked }))}
                    disabled={isSaving}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Trial Exploration Limit
                </label>
                <input
                  type="number"
                  min="1"
                  value={editForm.trial_exploration_limit ?? 1}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, trial_exploration_limit: parseInt(e.target.value) || 1 }))}
                  disabled={isSaving}
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none disabled:opacity-50"
                />
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Temp password modal after reset */}
      <AnimatePresence>
        {tempPassword && (
          <TempPasswordModal
            userId={userId}
            tempPassword={tempPassword}
            onClose={() => setTempPassword(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminUserDetail;
