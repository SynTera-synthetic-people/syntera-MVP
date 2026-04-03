import React, { useState, useRef, useEffect } from 'react';
import { TbPencil, TbTrash } from 'react-icons/tb';
import { useSelector } from 'react-redux';
import './AccountStyles.css';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * RootState — mirrors the auth slice shape used across Settings, UpgradeModal,
 * and Upgrade. All fields optional because the slice is populated incrementally.
 */
interface AuthUser {
  // Identity
  first_name?: string;
  last_name?: string;
  full_name?: string;    
  email?: string;
  phone?: string;

  // Role / tier
  role?: string;
  user_type?: string;
  account_tier?: string;
  is_admin?: boolean;
  is_trial?: boolean;

  // Quota
  exploration_count?: number;
  trial_exploration_limit?: number;

  // Profile
  avatar_url?: string;
  profile_picture?: string;  // alternate key some backends use
  created_at?: string;       // e.g. "2024-01-15T..."
  member_since?: string;     // pre-formatted alternative
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

/** Format an ISO date string → "Jan 2024" */
const formatMemberSince = (dateStr?: string): string => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

/**
 * Derive a human-readable role label from the user object.
 * Prefers explicit role/user_type strings; falls back to tier.
 */
const deriveRoleLabel = (user: AuthUser): string => {
  if (user.role) {
    // Capitalise first letter, replace underscores with spaces
    return user.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (user.user_type) {
    return user.user_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (user.account_tier) {
    return user.account_tier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return '';
};

/** Build ProfileState from the Redux user object. */
const buildProfileFromUser = (user: AuthUser | null): ProfileState => {
  if (!user) {
    return {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      role: '',
      memberSince: '',
      avatarUrl: null,
    };
  }

  // Support both split first/last and a single `name` field
  const firstName = user.first_name ?? (user.full_name?.split(' ')[0] ?? '');
  const lastName  = user.last_name  ?? (user.full_name?.split(' ').slice(1).join(' ') ?? '');

  return {
    firstName,
    lastName,
    email:       user.email       ?? '',
    phone:       user.phone       ?? '',          // blank if not provided
    role:        deriveRoleLabel(user),
    memberSince: user.member_since
      ? user.member_since
      : formatMemberSince(user.created_at),
    avatarUrl:   user.avatar_url ?? user.profile_picture ?? null,
  };
};

// ── Component ─────────────────────────────────────────────────────────────────

const Account: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);

  // Initialise from Redux; re-sync whenever the user object changes
  // (e.g. after a successful profile save that dispatches updateUser)
  const [profile, setProfile] = useState<ProfileState>(() =>
    buildProfileFromUser(user),
  );

  useEffect(() => {
    setProfile(buildProfileFromUser(user));
  }, [user]);

  const [errors, setErrors]   = useState<ProfileErrors>({});
  const [saving, setSaving]   = useState(false);
  const [savedAt]             = useState<string>('30 sec ago');
  const fileInputRef          = useRef<HTMLInputElement>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validate = (): boolean => {
    const next: ProfileErrors = {};
    if (!profile.firstName.trim()) next.firstName = 'First name is required.';
    if (!profile.lastName.trim())  next.lastName  = 'Last name is required.';
    if (!profile.email.trim())     next.email     = 'Email is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // TODO: wire to profile update API
      await new Promise((r) => setTimeout(r, 600));
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setProfile((prev) => ({ ...prev, avatarUrl: url }));
  };

  const handleDeleteAccount = () => {
    if (
      !window.confirm(
        'Permanently delete your account? This action is not reversible.',
      )
    )
      return;
    // TODO: wire to delete account API
  };

  return (
    <div className="ap-page">

      {/* Auto-save indicator */}
      <div className="ap-autosave">
        <span className="ap-autosave-dot" />
        Auto saved: {savedAt}
      </div>

      {/* Profile card */}
      <div className="ap-card">

        {/* Left — avatar + member since */}
        <div className="ap-avatar-col">
          <div className="ap-avatar-wrap">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Avatar" className="ap-avatar-img" />
            ) : (
              <div className="ap-avatar-placeholder">
                <svg viewBox="0 0 80 80" fill="none" className="ap-avatar-svg">
                  <circle cx="40" cy="30" r="18" fill="#374151" />
                  <ellipse cx="40" cy="68" rx="26" ry="18" fill="#374151" />
                </svg>
              </div>
            )}
            <button
              className="ap-avatar-edit-btn"
              onClick={handleAvatarClick}
              aria-label="Change avatar"
            >
              <TbPencil size={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
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

          {/* Email — read-only, populated from auth */}
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

          {/* Phone — left blank if not available from backend */}
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

          {/* Role — derived from user.role / user_type / account_tier */}
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
  );
};

export default Account;