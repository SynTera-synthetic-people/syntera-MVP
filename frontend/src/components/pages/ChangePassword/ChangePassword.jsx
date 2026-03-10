import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { TbLock, TbAlertTriangle, TbCheck } from 'react-icons/tb';
import { authService } from '../../../services/authService';
import { updateUser } from '../../../redux/slices/authSlice';

const ChangePassword = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);

  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError('All fields are required.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.changePassword({
        current_password: form.currentPassword,
        new_password: form.newPassword,
        confirm_password: form.confirmPassword,
      });
      dispatch(updateUser({ must_change_password: false }));
      navigate('/landing', { replace: true });
    } catch (err) {
      const msg = err?.message || err?.detail || 'Failed to change password. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-blue-50/30 to-blue-100/20 dark:from-[#0a0e1a] dark:via-[#0f1419] dark:to-[#1a1f2e] p-4 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-gradient-to-br from-blue-400/30 to-blue-600/20 dark:from-blue-500/40 dark:to-blue-700/30 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-tl from-blue-300/25 to-cyan-500/15 dark:from-blue-400/35 dark:to-cyan-600/25 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Action Required Banner */}
        <div className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
          <TbAlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Action required: Please set a new password to continue.
          </p>
        </div>

        <div className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden p-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-500/30 text-white">
              <TbLock className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Set New Password
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Welcome{user?.full_name ? `, ${user.full_name}` : ''}. Create your secure password.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Current (Temporary) Password
              </label>
              <input
                type="password"
                name="currentPassword"
                value={form.currentPassword}
                onChange={handleChange}
                disabled={isSubmitting}
                placeholder="Enter the temporary password"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                New Password
              </label>
              <input
                type="password"
                name="newPassword"
                value={form.newPassword}
                onChange={handleChange}
                disabled={isSubmitting}
                placeholder="Min 8 chars, uppercase, lowercase, number"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Confirm New Password
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                disabled={isSubmitting}
                placeholder="Repeat new password"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none disabled:opacity-50"
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-4 py-2"
              >
                {error}
              </motion.p>
            )}

            <motion.button
              type="submit"
              whileHover={!isSubmitting ? { scale: 1.01 } : {}}
              whileTap={!isSubmitting ? { scale: 0.99 } : {}}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Updating Password...
                </>
              ) : (
                <>
                  <TbCheck size={20} />
                  Set New Password
                </>
              )}
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default ChangePassword;
