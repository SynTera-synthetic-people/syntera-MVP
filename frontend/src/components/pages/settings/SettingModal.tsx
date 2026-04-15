import React, { useState, useEffect, useRef } from 'react';
import {
  TbX,
  TbPlus,
  TbLogout,
  TbUserX,
} from 'react-icons/tb';
import SpIcon from '../../SPIcon';
import { workspaceService } from '../../../services/workspaceService';
import './SettingModalStyle.css';

// ══════════════════════════════════════════════════════════════════════════════
// Shared primitives
// ══════════════════════════════════════════════════════════════════════════════

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: number;
}

const ModalShell: React.FC<ModalShellProps> = ({
  isOpen, onClose, title, subtitle, children, maxWidth = 480,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="sm-overlay" onClick={onClose}>
      <div
        className="sm-modal"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sm-modal-header">
          <div className="sm-modal-titles">
            <h2 className="sm-modal-title">{title}</h2>
            {subtitle && <p className="sm-modal-subtitle">{subtitle}</p>}
          </div>
          <button className="sm-close-btn" onClick={onClose} aria-label="Close">
            <TbX size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="sm-modal-body">{children}</div>
      </div>
    </div>
  );
};

/**
 * ConfirmShell — shared layout used by all 4 new confirmation modals.
 *
 * Renders:
 *   - blurred backdrop
 *   - centered card with close ✕
 *   - icon box (variant: 'danger' | 'primary') with a small ✕ badge on the icon
 *   - bold title + muted subtitle
 *   - two-button row (action + Cancel)
 */
interface ConfirmShellProps {
  isOpen: boolean;
  onClose: () => void;
  /** Icon rendered inside the coloured box */
  icon: React.ReactNode;
  /** 'danger' = red box, 'primary' = blue box */
  variant: 'danger' | 'primary';
  title: string;
  subtitle: string | React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  actionLoading?: boolean;
  maxWidth?: number;
}

const ConfirmShell: React.FC<ConfirmShellProps> = ({
  isOpen, onClose, icon, variant, title, subtitle,
  actionLabel, onAction, actionLoading = false, maxWidth = 300,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="sm-overlay" onClick={onClose}>
      <div
        className="sm-confirm-card"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — top-right of card */}
        <button className="sm-confirm-close" onClick={onClose} aria-label="Close">
          <TbX size={16} />
        </button>

        {/* Icon box */}
        <div className={`sm-confirm-icon-wrap sm-confirm-icon-wrap--${variant}`}>
          {icon}
        </div>

        {/* Title + subtitle */}
        <h2 className="sm-confirm-title">{title}</h2>
        <p className="sm-confirm-subtitle">{subtitle}</p>

        {/* Buttons */}
        <div className="sm-confirm-actions">
          <button
            className={`sm-confirm-action-btn sm-confirm-action-btn--${variant}`}
            onClick={onAction}
            disabled={actionLoading}
          >
            {actionLoading ? 'Please wait…' : actionLabel}
          </button>
          <button
            className="sm-confirm-cancel-btn"
            onClick={onClose}
            disabled={actionLoading}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 1.  MANAGE USERS MODAL  (existing — unchanged)
// ══════════════════════════════════════════════════════════════════════════════

interface ModalMember {
  id: string;
  full_name?: string;
  email: string;
  role?: string;
  accepted?: boolean;
}

interface ManageUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName?: string;
}

export const ManageUsersModal: React.FC<ManageUsersModalProps> = ({
  isOpen, onClose, workspaceId, workspaceName,
}) => {
  const [members, setMembers]     = useState<ModalMember[]>([]);
  const [loading, setLoading]     = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    if (!isOpen || !workspaceId) return;
    setLoading(true);
    setError('');
    workspaceService
      .getMembers(workspaceId)
      .then((res: any) => setMembers(res.data || []))
      .catch((err: any) => setError(err?.message || 'Failed to load members.'))
      .finally(() => setLoading(false));
  }, [isOpen, workspaceId]);

  const handleRemove = async (memberId: string) => {
    if (!window.confirm('Remove this member?')) return;
    setRemovingId(memberId);
    try {
      await workspaceService.removeMember(workspaceId, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err: any) {
      setError(err?.message || 'Failed to remove member.');
    } finally {
      setRemovingId(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (m: ModalMember) =>
    (m.full_name || m.email || '?')
      .split(' ').slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '').join('');

  return (
    <ModalShell
      isOpen={isOpen} onClose={onClose}
      title="Manage Users"
      subtitle={workspaceName ? `Members of ${workspaceName}` : 'Content goes here'}
      maxWidth={520}
    >
      {error && <p className="sm-error-msg">{error}</p>}

      {loading ? (
        <div className="sm-spinner-wrap"><div className="sm-spinner" /></div>
      ) : (
        <div className="sm-member-list">
          {members.map((member, idx) => (
            <div key={member.id} className="sm-member-row">
              <div className="sm-member-avatar">{getInitials(member)}</div>
              <div className="sm-member-info">
                <span className="sm-member-name">{member.full_name || member.email}</span>
                {idx === 0 && member.role?.toLowerCase() === 'admin' && (
                  <span className="sm-member-badge sm-member-badge--admin">Admin</span>
                )}
              </div>
              {idx !== 0 && (
                <button
                  className="sm-member-remove-btn"
                  onClick={() => handleRemove(member.id)}
                  disabled={removingId === member.id}
                  aria-label="Remove member"
                >
                  <TbX size={14} />
                </button>
              )}
            </div>
          ))}
          {members.length === 0 && <p className="sm-empty-text">No members yet.</p>}
        </div>
      )}

      <button className="sm-save-btn" onClick={handleSave} disabled={saving || loading}>
        <SpIcon name="sp-System-Save" />
        {saving ? 'Saving…' : 'Save'}
      </button>
    </ModalShell>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 2.  EDIT USER MODAL  (existing — unchanged)
// ══════════════════════════════════════════════════════════════════════════════

export interface EditUserData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: EditUserData | null;
  onSave: (updated: EditUserData) => Promise<void>;
}

interface EditUserErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  isOpen, onClose, user, onSave,
}) => {
  const [form, setForm]           = useState<EditUserData>({ id: '', firstName: '', lastName: '', email: '' });
  const [errors, setErrors]       = useState<EditUserErrors>({});
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (user) { setForm({ ...user }); setErrors({}); setSaveError(''); }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
    setSaveError('');
  };

  const validate = (): boolean => {
    const next: EditUserErrors = {};
    if (!form.firstName.trim()) next.firstName = 'Required';
    if (!form.lastName.trim())  next.lastName  = 'Required';
    if (!form.email.trim())     next.email     = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      next.email = 'Enter a valid email';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true); setSaveError('');
    try { await onSave(form); onClose(); }
    catch (err: any) { setSaveError(err?.message || 'Failed to save changes.'); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Edit User" maxWidth={420}>
      {saveError && <p className="sm-error-msg">{saveError}</p>}

      <div className="sm-form-row">
        <div className="sm-field">
          <label className="sm-label">First Name <span className="sm-required">*</span></label>
          <input name="firstName" className={`sm-input ${errors.firstName ? 'sm-input--error' : ''}`}
            value={form.firstName} onChange={handleChange} placeholder="First name" />
          {errors.firstName && <p className="sm-field-error">{errors.firstName}</p>}
        </div>
        <div className="sm-field">
          <label className="sm-label">Last Name <span className="sm-required">*</span></label>
          <input name="lastName" className={`sm-input ${errors.lastName ? 'sm-input--error' : ''}`}
            value={form.lastName} onChange={handleChange} placeholder="Last name" />
          {errors.lastName && <p className="sm-field-error">{errors.lastName}</p>}
        </div>
      </div>

      <div className="sm-field sm-field--full">
        <label className="sm-label">Email Address <span className="sm-required">*</span></label>
        <input name="email" type="email"
          className={`sm-input sm-input--disabled ${errors.email ? 'sm-input--error' : ''}`}
          value={form.email} onChange={handleChange} placeholder="email@example.com" readOnly />
        {errors.email && <p className="sm-field-error">{errors.email}</p>}
      </div>

      <button className="sm-save-btn sm-save-btn--full" onClick={handleSave} disabled={saving}>
        <SpIcon name="sp-System-Save" />
        {saving ? 'Saving…' : 'Save'}
      </button>
    </ModalShell>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 3.  SHARE INVOICE MODAL  (existing — unchanged)
// ══════════════════════════════════════════════════════════════════════════════

export interface ShareInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceTitle?: string;
  onSend: (invoiceId: string, emails: string[]) => Promise<void>;
}

const MAX_RECIPIENTS = 5;
const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

export const ShareInvoiceModal: React.FC<ShareInvoiceModalProps> = ({
  isOpen, onClose, invoiceId, invoiceTitle, onSend,
}) => {
  const [inputVal, setInputVal]   = useState('');
  const [emails, setEmails]       = useState<string[]>([]);
  const [inputError, setInputError] = useState('');
  const [sending, setSending]     = useState(false);
  const [sendError, setSendError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) { setEmails([]); setInputVal(''); setInputError(''); setSendError(''); }
  }, [isOpen]);

  const addEmail = () => {
    const val = inputVal.trim();
    if (!val) return;
    if (!isValidEmail(val))       { setInputError('Enter a valid email address.'); return; }
    if (emails.includes(val))     { setInputError('This email is already added.'); return; }
    if (emails.length >= MAX_RECIPIENTS) { setInputError(`Maximum ${MAX_RECIPIENTS} recipients allowed.`); return; }
    setEmails((prev) => [...prev, val]);
    setInputVal(''); setInputError('');
    inputRef.current?.focus();
  };

  const removeEmail = (email: string) => setEmails((prev) => prev.filter((e) => e !== email));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addEmail(); }
    if (e.key === 'Backspace' && inputVal === '' && emails.length > 0)
      setEmails((prev) => prev.slice(0, -1));
  };

  const handleSend = async () => {
    if (emails.length === 0) { setInputError('Add at least one email address.'); return; }
    setSending(true); setSendError('');
    try { await onSend(invoiceId, emails); onClose(); }
    catch (err: any) { setSendError(err?.message || 'Failed to send invoice.'); }
    finally { setSending(false); }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose}
      title="Share Invoice"
      subtitle="Share this invoice with your team or stakeholders for review and process."
      maxWidth={520}
    >
      {sendError && <p className="sm-error-msg">{sendError}</p>}

      <div className="sm-field sm-field--full">
        <label className="sm-label">Email Address <span className="sm-required">*</span></label>
        <div className="sm-email-input-row">
          <input ref={inputRef} type="email"
            className={`sm-input sm-input--chip-input ${inputError ? 'sm-input--error' : ''}`}
            placeholder="Enter email addresses to share this invoice"
            value={inputVal}
            onChange={(e) => { setInputVal(e.target.value); setInputError(''); }}
            onKeyDown={handleKeyDown}
            disabled={emails.length >= MAX_RECIPIENTS}
          />
          <button className="sm-add-email-btn" onClick={addEmail}
            disabled={emails.length >= MAX_RECIPIENTS} aria-label="Add email">
            <TbPlus size={16} />
          </button>
        </div>
        {inputError && <p className="sm-field-error">{inputError}</p>}
        {emails.length > 0 && (
          <div className="sm-chips-wrap">
            {emails.map((email) => (
              <div key={email} className="sm-chip">
                <span className="sm-chip-label">{email}</span>
                <button className="sm-chip-remove" onClick={() => removeEmail(email)}
                  aria-label={`Remove ${email}`}>
                  <TbX size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="sm-hint">You can share this invoice with up to {MAX_RECIPIENTS} recipients.</p>
      </div>

      <button className="sm-send-btn" onClick={handleSend} disabled={sending || emails.length === 0}>
        {sending ? 'Sending…' : 'Send Invoice'}
      </button>
    </ModalShell>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 4.  DELETE WORKSPACE MODAL  (new)
//     Triggered from Workspace Management tab → delete workspace action.
//     Calls onConfirm() which should invoke the workspace delete API.
// ══════════════════════════════════════════════════════════════════════════════

export interface DeleteWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName?: string;
  /** Should call the workspace delete API and resolve on success */
  onConfirm: () => Promise<void>;
}

export const DeleteWorkspaceModal: React.FC<DeleteWorkspaceModalProps> = ({
  isOpen, onClose, workspaceName, onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleDelete = async () => {
    setLoading(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete workspace. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmShell
      isOpen={isOpen}
      onClose={onClose}
      variant="danger"
      icon={<SpIcon name="sp-Interface-Trash_Empty" />}
      title="Delete Workspace"
      subtitle={
        <>
          This will permanently remove the workspace
          {workspaceName ? <> <strong>"{workspaceName}"</strong></> : ''} and all
          associated data — explorations, personas, reports, and logs.
          <br />This action cannot be reversed.
          {error && <span className="sm-confirm-inline-error">{error}</span>}
        </>
      }
      actionLabel="Delete"
      onAction={handleDelete}
      actionLoading={loading}
      maxWidth={320}
    />
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 5.  REMOVE USER MODAL  (new)
//     Triggered from Team Management tab → remove user action.
//     Calls onConfirm() which should invoke the remove-member API.
// ══════════════════════════════════════════════════════════════════════════════

export interface RemoveUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  /** Should call the remove-member API and resolve on success */
  onConfirm: () => Promise<void>;
}

export const RemoveUserModal: React.FC<RemoveUserModalProps> = ({
  isOpen, onClose, userName, onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleRemove = async () => {
    setLoading(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to remove user. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmShell
      isOpen={isOpen}
      onClose={onClose}
      variant="danger"
      icon={<SpIcon name="sp-User-User_Remove"  size={30}/>}
      title="Remove User"
      subtitle={
        <>
          Access to this workspace will be revoked
          {userName ? <> for <strong>{userName}</strong></> : ''}.
          {error && <span className="sm-confirm-inline-error">{error}</span>}
        </>
      }
      actionLabel="Yes, Remove"
      onAction={handleRemove}
      actionLoading={loading}
      maxWidth={300}
    />
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 6.  DELETE ACCOUNT MODAL  (new)
//     Triggered from Settings → Profile tab → "Delete Account" button.
//     Calls onConfirm() which should invoke the delete-account API,
//     then redirect to login.
// ══════════════════════════════════════════════════════════════════════════════

export interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Should call the delete-account API, clear auth, and navigate to /login */
  onConfirm: () => Promise<void>;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  isOpen, onClose, onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleDelete = async () => {
    setLoading(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmShell
      isOpen={isOpen}
      onClose={onClose}
      variant="danger"
      icon={<TbUserX size={26} />}
      title="Delete Account"
      subtitle={
        <>
          Access to this workspace will be revoked.
          {error && <span className="sm-confirm-inline-error">{error}</span>}
        </>
      }
      actionLabel="Yes, Remove"
      onAction={handleDelete}
      actionLoading={loading}
      maxWidth={280}
    />
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 7.  LOGOUT MODAL  (new)
//     Triggered from Settings sidebar → Logout button.
//     Shows the user's email. Calls onConfirm() which should clear auth
//     state and navigate to /login.
// ══════════════════════════════════════════════════════════════════════════════

export interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  appName?: string;
  userEmail?: string;
  /** Should clear auth state and navigate to /login */
  onConfirm: () => Promise<void>;
}

export const LogoutModal: React.FC<LogoutModalProps> = ({
  isOpen, onClose, appName = 'the app', userEmail, onConfirm,
}) => {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await onConfirm();
      // onConfirm is expected to navigate — no onClose() needed
    } catch {
      // Navigation already happened or will happen; swallow error
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmShell
      isOpen={isOpen}
      onClose={onClose}
      variant="primary"
      icon={<SpIcon name="sp-Other-Logout" size= {30} />}
      title="Logout"
      subtitle={
        userEmail
          ? `Log out of ${appName} as ${userEmail}?`
          : `Are you sure you want to log out?`
      }
      actionLabel="Logout"
      onAction={handleLogout}
      actionLoading={loading}
      maxWidth={300}
    />
  );
};