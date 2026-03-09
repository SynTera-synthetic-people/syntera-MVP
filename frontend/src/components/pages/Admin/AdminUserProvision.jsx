import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TbUserPlus,
  TbArrowLeft,
  TbX,
  TbCopy,
  TbCheck,
  TbAlertTriangle,
} from 'react-icons/tb';
import { adminService } from '../../../services/adminService';

// Modal shown after successful provisioning
const TempPasswordModal = ({ email, tempPassword, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        className="relative w-full max-w-md bg-white dark:bg-[#1a1f2e] rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-white/10 p-8"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
        >
          <TbX size={20} />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-600 dark:text-green-400">
            <TbCheck size={22} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">User Created</h2>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          A welcome email with credentials has been sent to <strong>{email}</strong>. Save the temporary password below as a backup.
        </p>

        {/* Warning */}
        <div className="flex items-start gap-2 p-3 mb-5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
          <TbAlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
            This password will only be shown once. Copy it now.
          </p>
        </div>

        {/* Temp password display */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 mb-6">
          <code className="flex-1 text-base font-mono text-gray-900 dark:text-white break-all select-all">
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
            {copied ? <TbCheck size={14} /> : <TbCopy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-lg shadow-blue-500/30 transition-all hover:shadow-blue-500/40"
        >
          Done
        </button>
      </motion.div>
    </div>
  );
};

const AdminUserProvision = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    role: 'user',
    user_type: 'Student',
    is_trial: true,
    account_tier: 'free',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successData, setSuccessData] = useState(null); // { email, tempPassword }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setErrorMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!form.full_name.trim() || !form.email.trim()) {
      setErrorMsg('Full name and email are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await adminService.provisionUser(form);
      if (response.status === 'success') {
        setSuccessData({
          email: response.data.email,
          tempPassword: response.data.temporary_password,
        });
      } else {
        setErrorMsg(response.message || 'Failed to provision user.');
      }
    } catch (err) {
      setErrorMsg(err?.message || err?.detail || 'Failed to provision user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-8"
      >
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/admin/users')}
          className="p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors"
        >
          <TbArrowLeft className="w-5 h-5" />
        </motion.button>
        <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-500/30 text-white">
          <TbUserPlus className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Provision User</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Create a new account with a generated temporary password
          </p>
        </div>
      </motion.div>

      {/* Form card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl shadow-xl p-8"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              disabled={isSubmitting}
              placeholder="e.g. Jane Smith"
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none disabled:opacity-50"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              disabled={isSubmitting}
              placeholder="jane@example.com"
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none disabled:opacity-50"
            />
          </div>

          {/* Role + User Type row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Role
              </label>
              <select
                name="role"
                value={form.role}
                onChange={handleChange}
                disabled={isSubmitting}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-[#1a1f2e] text-gray-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none disabled:opacity-50"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                User Type
              </label>
              <select
                name="user_type"
                value={form.user_type}
                onChange={handleChange}
                disabled={isSubmitting}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-[#1a1f2e] text-gray-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none disabled:opacity-50"
              >
                <option value="Student">Student</option>
                <option value="Startup">Startup</option>
                <option value="Researcher">Researcher</option>
              </select>
            </div>
          </div>

          {/* Account Tier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Account Tier
            </label>
            <select
              name="account_tier"
              value={form.account_tier}
              onChange={handleChange}
              disabled={isSubmitting}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-[#1a1f2e] text-gray-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none disabled:opacity-50"
            >
              <option value="free">Free Trial (1 exploration)</option>
              <option value="tier1">Tier 1 (3 explorations)</option>
              <option value="enterprise">Enterprise (org-level quota)</option>
            </select>
          </div>

          {/* Trial toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Free Trial</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Limit user to 1 exploration until upgraded
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                name="is_trial"
                checked={form.is_trial}
                onChange={handleChange}
                disabled={isSubmitting}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500/30 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Error */}
          {errorMsg && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-4 py-2"
            >
              {errorMsg}
            </motion.p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <motion.button
              type="submit"
              whileHover={!isSubmitting ? { scale: 1.01 } : {}}
              whileTap={!isSubmitting ? { scale: 0.99 } : {}}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-lg shadow-blue-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating User...
                </>
              ) : (
                <>
                  <TbUserPlus size={18} />
                  Provision User
                </>
              )}
            </motion.button>
            <button
              type="button"
              onClick={() => navigate('/admin/users')}
              disabled={isSubmitting}
              className="px-6 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </motion.div>

      {/* Success modal */}
      <AnimatePresence>
        {successData && (
          <TempPasswordModal
            email={successData.email}
            tempPassword={successData.tempPassword}
            onClose={() => {
              setSuccessData(null);
              navigate('/admin/users');
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminUserProvision;
