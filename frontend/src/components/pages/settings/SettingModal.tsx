import React, { useState, useEffect, useRef } from 'react';
import {
  TbX,
  TbDeviceFloppy,
  TbTrash,
  TbPlus,
  TbMail,
  TbSend,
  TbUsers,
} from 'react-icons/tb';
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
  // Close on Escape
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

// ══════════════════════════════════════════════════════════════════════════════
// 1.  MANAGE USERS MODAL
//     Opens from Workspace table kebab → "Manage Users" in Settings context.
//     Shows existing members with remove option + Save.
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
  const [members, setMembers] = useState<ModalMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fetch members when the modal opens
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
      // TODO: wire to bulk-update API if needed
      await new Promise((r) => setTimeout(r, 400));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (m: ModalMember) =>
    (m.full_name || m.email || '?')
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
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
              <div className="sm-member-avatar">
                {getInitials(member)}
              </div>
              <div className="sm-member-info">
                <span className="sm-member-name">
                  {member.full_name || member.email}
                </span>
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

          {members.length === 0 && (
            <p className="sm-empty-text">No members yet.</p>
          )}
        </div>
      )}

      {/* Save */}
      <button
        className="sm-save-btn"
        onClick={handleSave}
        disabled={saving || loading}
      >
        <TbDeviceFloppy size={16} />
        {saving ? 'Saving…' : 'Save'}
      </button>
    </ModalShell>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 2.  EDIT USER MODAL
//     Opens from Team Management table in Settings context.
//     Edits First Name, Last Name, Email Address.
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
  const [form, setForm] = useState<EditUserData>({
    id: '', firstName: '', lastName: '', email: '',
  });
  const [errors, setErrors] = useState<EditUserErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Sync form when user prop changes
  useEffect(() => {
    if (user) {
      setForm({ ...user });
      setErrors({});
      setSaveError('');
    }
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
    setSaving(true);
    setSaveError('');
    try {
      await onSave(form);
      onClose();
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Edit User" maxWidth={420}>
      {saveError && <p className="sm-error-msg">{saveError}</p>}

      {/* First Name + Last Name row */}
      <div className="sm-form-row">
        <div className="sm-field">
          <label className="sm-label">
            First Name <span className="sm-required">*</span>
          </label>
          <input
            name="firstName"
            className={`sm-input ${errors.firstName ? 'sm-input--error' : ''}`}
            value={form.firstName}
            onChange={handleChange}
            placeholder="First name"
          />
          {errors.firstName && <p className="sm-field-error">{errors.firstName}</p>}
        </div>

        <div className="sm-field">
          <label className="sm-label">
            Last Name <span className="sm-required">*</span>
          </label>
          <input
            name="lastName"
            className={`sm-input ${errors.lastName ? 'sm-input--error' : ''}`}
            value={form.lastName}
            onChange={handleChange}
            placeholder="Last name"
          />
          {errors.lastName && <p className="sm-field-error">{errors.lastName}</p>}
        </div>
      </div>

      {/* Email */}
      <div className="sm-field sm-field--full">
        <label className="sm-label">
          Email Address <span className="sm-required">*</span>
        </label>
        <input
          name="email"
          type="email"
          className={`sm-input sm-input--disabled ${errors.email ? 'sm-input--error' : ''}`}
          value={form.email}
          onChange={handleChange}
          placeholder="email@example.com"
          // Email is read-only — shown greyed out matching Figma
          readOnly
        />
        {errors.email && <p className="sm-field-error">{errors.email}</p>}
      </div>

      {/* Save */}
      <button
        className="sm-save-btn sm-save-btn--full"
        onClick={handleSave}
        disabled={saving}
      >
        <TbDeviceFloppy size={16} />
        {saving ? 'Saving…' : 'Save'}
      </button>
    </ModalShell>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 3.  SHARE INVOICE MODAL
//     Opens from Billing table share button.
//     Email chip input — add via + button or Enter, remove with ×.
//     Max 5 recipients.
// ══════════════════════════════════════════════════════════════════════════════

export interface ShareInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceTitle?: string;
  onSend: (invoiceId: string, emails: string[]) => Promise<void>;
}

const MAX_RECIPIENTS = 5;

const isValidEmail = (val: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

export const ShareInvoiceModal: React.FC<ShareInvoiceModalProps> = ({
  isOpen, onClose, invoiceId, invoiceTitle, onSend,
}) => {
  const [inputVal, setInputVal] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [inputError, setInputError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setEmails([]);
      setInputVal('');
      setInputError('');
      setSendError('');
    }
  }, [isOpen]);

  const addEmail = () => {
    const val = inputVal.trim();
    if (!val) return;
    if (!isValidEmail(val)) {
      setInputError('Enter a valid email address.');
      return;
    }
    if (emails.includes(val)) {
      setInputError('This email is already added.');
      return;
    }
    if (emails.length >= MAX_RECIPIENTS) {
      setInputError(`Maximum ${MAX_RECIPIENTS} recipients allowed.`);
      return;
    }
    setEmails((prev) => [...prev, val]);
    setInputVal('');
    setInputError('');
    inputRef.current?.focus();
  };

  const removeEmail = (email: string) => {
    setEmails((prev) => prev.filter((e) => e !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addEmail(); }
    if (e.key === 'Backspace' && inputVal === '' && emails.length > 0) {
      setEmails((prev) => prev.slice(0, -1));
    }
  };

  const handleSend = async () => {
    if (emails.length === 0) {
      setInputError('Add at least one email address.');
      return;
    }
    setSending(true);
    setSendError('');
    try {
      await onSend(invoiceId, emails);
      onClose();
    } catch (err: any) {
      setSendError(err?.message || 'Failed to send invoice.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Share Invoice"
      subtitle="Share this invoice with your team or stakeholders for review and process."
      maxWidth={520}
    >
      {sendError && <p className="sm-error-msg">{sendError}</p>}

      {/* Email input */}
      <div className="sm-field sm-field--full">
        <label className="sm-label">
          Email Address <span className="sm-required">*</span>
        </label>

        <div className="sm-email-input-row">
          <input
            ref={inputRef}
            type="email"
            className={`sm-input sm-input--chip-input ${inputError ? 'sm-input--error' : ''}`}
            placeholder="Enter email addresses to share this invoice"
            value={inputVal}
            onChange={(e) => { setInputVal(e.target.value); setInputError(''); }}
            onKeyDown={handleKeyDown}
            disabled={emails.length >= MAX_RECIPIENTS}
          />
          <button
            className="sm-add-email-btn"
            onClick={addEmail}
            disabled={emails.length >= MAX_RECIPIENTS}
            aria-label="Add email"
          >
            <TbPlus size={16} />
          </button>
        </div>

        {inputError && <p className="sm-field-error">{inputError}</p>}

        {/* Email chips */}
        {emails.length > 0 && (
          <div className="sm-chips-wrap">
            {emails.map((email) => (
              <div key={email} className="sm-chip">
                <span className="sm-chip-label">{email}</span>
                <button
                  className="sm-chip-remove"
                  onClick={() => removeEmail(email)}
                  aria-label={`Remove ${email}`}
                >
                  <TbX size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="sm-hint">
          You can share this invoice with up to {MAX_RECIPIENTS} recipients.
        </p>
      </div>

      {/* Send */}
      <button
        className="sm-send-btn"
        onClick={handleSend}
        disabled={sending || emails.length === 0}
      >
        {sending ? 'Sending…' : 'Send Invoice'}
      </button>
    </ModalShell>
  );
};