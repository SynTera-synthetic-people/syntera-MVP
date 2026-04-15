import React, { useState } from 'react';
import { TbDeviceFloppy, TbEye, TbEyeOff } from 'react-icons/tb';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { authService } from '../../../../services/authService';
import { updateUser } from '../../../../redux/slices/authSlice';
import './ChangePassword.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

const ChangePassword: React.FC = () => {
  const dispatch = useDispatch();

  const [form, setForm] = useState<PasswordForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isSubmitting, setIsSubmitting]       = useState(false);
  const [showCurrent, setShowCurrent]         = useState(false);
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);

  // ── Handlers — logic unchanged from Security.jsx ─────────────────────────

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      toast.error('Please fill in all password fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.changePassword({
        current_password: form.currentPassword,
        new_password:     form.newPassword,
        confirm_password: form.confirmPassword,
      });
      dispatch(updateUser({ must_change_password: false }));
      toast.success('Password changed successfully.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      const message = err?.message || err?.detail || 'Failed to change password.';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="cp-page">
      <form onSubmit={handleSubmit} className="cp-card">

        {/* Current Password */}
        <div className="cp-field">
          <label className="cp-label">
            Current Password <span className="cp-required">*</span>
          </label>
          <div className="cp-input-wrap">
            <input
              type={showCurrent ? 'text' : 'password'}
              name="currentPassword"
              value={form.currentPassword}
              onChange={handleChange}
              placeholder="Enter current password"
              className="cp-input"
              disabled={isSubmitting}
            />
            <button
              type="button"
              className="cp-eye-btn"
              onClick={() => setShowCurrent((v) => !v)}
              aria-label={showCurrent ? 'Hide password' : 'Show password'}
            >
              {showCurrent ? <TbEyeOff size={18} /> : <TbEye size={18} />}
            </button>
          </div>
        </div>

        {/* New Password */}
        <div className="cp-field">
          <label className="cp-label">
            New Password <span className="cp-required">*</span>
          </label>
          <div className="cp-input-wrap">
            <input
              type={showNew ? 'text' : 'password'}
              name="newPassword"
              value={form.newPassword}
              onChange={handleChange}
              placeholder="Min 8 chars, uppercase, lowercase, number"
              className="cp-input"
              disabled={isSubmitting}
            />
            <button
              type="button"
              className="cp-eye-btn"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew ? 'Hide password' : 'Show password'}
            >
              {showNew ? <TbEyeOff size={18} /> : <TbEye size={18} />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div className="cp-field">
          <label className="cp-label">
            Confirm Password <span className="cp-required">*</span>
          </label>
          <div className="cp-input-wrap">
            <input
              type={showConfirm ? 'text' : 'password'}
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm new password"
              className="cp-input"
              disabled={isSubmitting}
            />
            <button
              type="button"
              className="cp-eye-btn"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {showConfirm ? <TbEyeOff size={18} /> : <TbEye size={18} />}
            </button>
          </div>
        </div>

        {/* Save button */}
        <div className="cp-actions">
          <button
            type="submit"
            className="cp-save-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <div className="cp-spinner" />
                Saving…
              </>
            ) : (
              <>
                <TbDeviceFloppy size={16} />
                Save
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
};

export default ChangePassword;