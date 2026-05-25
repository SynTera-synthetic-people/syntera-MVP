import React, { useState, useRef, useEffect } from 'react';
import { TbTrash } from 'react-icons/tb';
import SpIcon from '../../../SPIcon';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { DeleteAccountModal } from '../SettingModal';
import { updateUser, logout } from '../../../../redux/slices/authSlice';
import axiosInstance from '../../../../utils/axiosConfig';
import { useQueryClient } from '@tanstack/react-query';
import { useAutoSaveContext } from '../Settings';
import './AccountStyles.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthUser {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  role?: string;
  user_type?: string;
  account_tier?: string;
  is_admin?: boolean;
  is_trial?: boolean;
  exploration_count?: number;
  trial_exploration_limit?: number;
  avatar_url?: string;
  profile_picture?: string;
  created_at?: string;
  member_since?: string;
}

interface RootState {
  auth: {
    user: AuthUser | null;
  };
}

interface ProfileState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  memberSince: string;
  avatarUrl: string | null;
}

interface ProfileErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatMemberSince = (dateStr?: string): string => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const deriveRoleLabel = (user: AuthUser): string => {
  if (user.role) return user.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  if (user.user_type) return user.user_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  if (user.account_tier) return user.account_tier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return '';
};

const buildProfileFromUser = (user: AuthUser | null): ProfileState => {
  if (!user) {
    return { firstName: '', lastName: '', email: '', phone: '', role: '', memberSince: '', avatarUrl: null };
  }
  const firstName = user.first_name ?? (user.full_name?.split(' ')[0] ?? '');
  const lastName = user.last_name ?? (user.full_name?.split(' ').slice(1).join(' ') ?? '');
  return {
    firstName,
    lastName,
    email: user.email ?? '',
    phone: user.phone ?? '',
    role: deriveRoleLabel(user),
    memberSince: user.member_since ? user.member_since : formatMemberSince(user.created_at),
    avatarUrl: user.avatar_url ?? user.profile_picture ?? null,
  };
};

// ── Component ─────────────────────────────────────────────────────────────────

const Account: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const { user } = useSelector((state: RootState) => state.auth);

  // Notify the parent Settings topbar autosave indicator
  const { recordSave } = useAutoSaveContext();

  const [profile, setProfile] = useState<ProfileState>(() => buildProfileFromUser(user));

  // ── Keep a ref always pointing at the latest profile so the debounced
  //    save callback never reads a stale closure value ─────────────────────
  const profileRef = useRef<ProfileState>(profile);
  useEffect(() => {
    profileRef.current = profile;
  });

  // ── Only initialise from Redux on first mount, never overwrite user edits ─
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (!hasInitializedRef.current && user) {
      setProfile(buildProfileFromUser(user));
      hasInitializedRef.current = true;
    }
  }, [user]);

  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cleanup debounce on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // ── Save — always reads from profileRef so it gets the latest values ─────
  const handleSave = async () => {
    const currentProfile = profileRef.current;

    // Inline validation against the latest profile
    const next: ProfileErrors = {};
    if (!currentProfile.firstName.trim()) next.firstName = 'First name is required.';
    if (!currentProfile.lastName.trim()) next.lastName = 'Last name is required.';
    if (!currentProfile.email.trim()) next.email = 'Email is required.';
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await axiosInstance.patch('/auth/me', {
        first_name: currentProfile.firstName,
        last_name: currentProfile.lastName,
        phone: currentProfile.phone || null,
      });
      if (res.data?.data) {
        // Update Redux but do NOT reset local profile state — user may still
        // be typing. The ref pattern above keeps everything in sync.
        dispatch(updateUser({
          full_name: res.data.data.full_name,
          first_name: res.data.data.first_name,
          last_name: res.data.data.last_name,
          phone: res.data.data.phone,
        }));
      }
      // Tell the parent Settings topbar to update "Auto saved: X sec ago"
      recordSave();
    } catch (err: any) {
      setSaveError(err?.message || err?.response?.data?.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  // ── Change handler with debounced autosave ────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));

    // Debounce: fire save 1.5s after the user stops typing.
    // handleSave reads from profileRef so it always sees the latest value.
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 1500);
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setProfile((prev) => ({ ...prev, avatarUrl: url }));
  };

  const handleDeleteAccount = () => setShowDeleteModal(true);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="ap-page">

        {/* Inline save error only — the autosave indicator lives in Settings topbar */}
        {saveError && (
          <p className="ap-save-error">{saveError}</p>
        )}

        {/* Profile card */}
        <div className="ap-card">

          {/* Left — avatar + member since */}
          <div className="ap-avatar-col">
            <div className="ap-avatar-wrap">
              <div className="ap-avatar">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="Avatar" />
                ) : (
                  <div className="ap-avatar-placeholder">
                    <SpIcon name="sp-User-User_03" size={100} />
                  </div>
                )}
              </div>

              <button
                className="ap-avatar-edit-btn"
                onClick={handleAvatarClick}
                aria-label="Change avatar"
              >
                <SpIcon name="sp-Edit-Edit_Pencil_01" size={16} />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleAvatarChange}
              />
            </div>
            {profile.memberSince && (
              <p className="ap-member-since">Member Since: {profile.memberSince}</p>
            )}
          </div>

          {/* Right — form fields */}
          <div className="ap-form-col">
            <div className="ap-row">

              {/* First Name */}
              <div className="ap-field">
                <label className="ap-label">
                  First Name <span className="ap-required">*</span>
                </label>
                <input
                  name="firstName"
                  className={`ap-input ${errors.firstName ? 'ap-input--error' : ''}`}
                  value={profile.firstName}
                  onChange={handleChange}
                  placeholder="First name"
                />
                {errors.firstName && <p className="ap-error">{errors.firstName}</p>}
              </div>

              {/* Last Name */}
              <div className="ap-field">
                <label className="ap-label">
                  Last Name <span className="ap-required">*</span>
                </label>
                <input
                  name="lastName"
                  className={`ap-input ${errors.lastName ? 'ap-input--error' : ''}`}
                  value={profile.lastName}
                  onChange={handleChange}
                  placeholder="Last name"
                />
                {errors.lastName && <p className="ap-error">{errors.lastName}</p>}
              </div>
            </div>

            {/* Email — read-only */}
            <div className="ap-field">
              <label className="ap-label">
                Email Address <span className="ap-required">*</span>
              </label>
              <input
                name="email"
                type="email"
                className={`ap-input ap-input--disabled ${errors.email ? 'ap-input--error' : ''}`}
                value={profile.email}
                onChange={handleChange}
                placeholder="you@example.com"
                readOnly
              />
              {errors.email && <p className="ap-error">{errors.email}</p>}
            </div>

            {/* Phone */}
            <div className="ap-field">
              <label className="ap-label">Phone Number</label>
              <input
                name="phone"
                className="ap-input"
                value={profile.phone}
                onChange={handleChange}
                placeholder="Enter your phone number"
              />
            </div>

            {/* Role */}
            <div className="ap-field">
              <label className="ap-label">Your Role</label>
              <textarea
                name="role"
                className="ap-textarea"
                value={profile.role}
                onChange={handleChange}
                placeholder="Describe your role and how you use behavioural insights to drive decisions."
                rows={4}
                maxLength={100}
              />
              <div className="ap-textarea-footer">
                <p className="ap-error">{errors.role || ''}</p>
                <span className="ap-char-count">{profile.role.length}/100</span>
              </div>
            </div>
          </div>
        </div>

        {/* Delete account section */}
        <div className="ap-danger-section">
          <h3 className="ap-danger-title">Delete your Account?</h3>
          <p className="ap-danger-desc">
            Permanently delete your account and all of your content. This action is not reversible.
          </p>
          <button className="ap-danger-btn" onClick={handleDeleteAccount}>
            <TbTrash size={14} />
            Delete Account
          </button>
        </div>
      </div>

      <DeleteAccountModal
        isOpen={showDeleteModal}
        onClose={() => !deleting && setShowDeleteModal(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await axiosInstance.delete('/auth/me');
            queryClient.clear();
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            dispatch(logout());
            navigate('/login');
          } catch (err: any) {
            setSaveError(
              err?.response?.data?.message || 'Failed to delete account. Please try again.'
            );
            setShowDeleteModal(false);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </>
  );
};

export default Account;