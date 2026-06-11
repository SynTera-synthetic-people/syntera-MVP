import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { TbLock, TbAlertTriangle, TbCheck } from 'react-icons/tb';
import { authService } from '../../../services/authService';
import { setCredentials } from '../../../redux/slices/authSlice';
import { buildAuthUser, getPostLoginPath } from '../../../utils/authRouting';
import HalfGlobe from '../Login/HalfGlobe';
import Logo from '../../common/Logo';
import './changePassword.css';

interface AuthState {
  user: {
    full_name?: string;
  } | null;
  token: string | null;
}

interface RootState {
  auth: AuthState;
}

interface FormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const ChangePassword: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite_token');
  const { user, token } = useSelector((state: RootState) => state.auth);

  const [form, setForm] = useState<FormState>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
      const meResponse = await authService.fetchMe();
      const updatedUser = buildAuthUser(meResponse?.data || {});
      localStorage.setItem('user', JSON.stringify(updatedUser));
      dispatch(setCredentials({ user: updatedUser, token }));

      if (inviteToken) {
        navigate(`/accept-invitation?token=${encodeURIComponent(inviteToken)}`, { replace: true });
        return;
      }

      navigate(getPostLoginPath(updatedUser), { replace: true });
    } catch (err: any) {
      const msg = err?.message || err?.detail || 'Failed to change password. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="change-password-page">
      <Logo />

      {/* Half Globe Background */}
      <div className="globe-container">
        <HalfGlobe />
      </div>

      {/* Gradient Overlays */}
      <div className="gradient-top" />
      <div className="gradient-bottom" />

      {/* Card */}
      <div className="change-password-card-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="change-password-card"
        >
          {/* Action Required Banner */}
          <div className="action-banner">
            <TbAlertTriangle className="action-banner-icon" />
            <p className="action-banner-text">
              Action required: Please set a new password to continue.
            </p>
          </div>

          {/* Header */}
          <div className="card-header">
            <div className="lock-icon-wrapper">
              <TbLock className="lock-icon" />
            </div>
            <div className="card-header-text">
              <h1>Set New Password</h1>
              <p className="subtitle">
                Welcome{user?.full_name ? `, ${user.full_name}` : ''}. Create your secure password.
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="card-body">
            <div className="form-group">
              <label>
                Current (Temporary) Password <span>*</span>
              </label>
              <input
                type="password"
                name="currentPassword"
                value={form.currentPassword}
                onChange={handleChange}
                disabled={isSubmitting}
                placeholder="Enter the temporary password"
              />
            </div>

            <div className="form-group">
              <label>
                New Password <span>*</span>
              </label>
              <input
                type="password"
                name="newPassword"
                value={form.newPassword}
                onChange={handleChange}
                disabled={isSubmitting}
                placeholder="Min 8 chars, uppercase, lowercase, number"
              />
            </div>

            <div className="form-group">
              <label>
                Confirm New Password <span>*</span>
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                disabled={isSubmitting}
                placeholder="Repeat new password"
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="error-banner"
              >
                {error}
              </motion.div>
            )}

            <motion.button
              type="submit"
              whileHover={!isSubmitting ? { scale: 1.01 } : {}}
              whileTap={!isSubmitting ? { scale: 0.99 } : {}}
              disabled={isSubmitting}
              className={`submit-btn ${!isSubmitting ? 'active' : ''}`}
            >
              {isSubmitting ? (
                <div className="loading-spinner">
                  <div className="spinner" />
                  <span>Updating Password...</span>
                </div>
              ) : (
                <span className="submit-content">
                  <TbCheck className="submit-icon" />
                  Set New Password
                </span>
              )}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default ChangePassword;