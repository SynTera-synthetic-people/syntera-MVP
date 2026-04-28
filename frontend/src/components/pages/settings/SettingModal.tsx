import React, { useState, useEffect, useRef } from 'react';
import {
  TbX,
  TbPlus,
  TbLogout,
  TbUserX,
  TbChevronDown,
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

interface ConfirmShellProps {
  isOpen: boolean;
  onClose: () => void;
  icon: React.ReactNode;
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
        <button className="sm-confirm-close" onClick={onClose} aria-label="Close">
          <TbX size={16} />
        </button>

        <div className={`sm-confirm-icon-wrap sm-confirm-icon-wrap--${variant}`}>
          {icon}
        </div>

        <h2 className="sm-confirm-title">{title}</h2>
        <p className="sm-confirm-subtitle">{subtitle}</p>

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
// 1.  MANAGE USERS MODAL
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
  const [members, setMembers]       = useState<ModalMember[]>([]);
  const [loading, setLoading]       = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

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
// 2.  EDIT USER MODAL
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
// 3.  SHARE INVOICE MODAL
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
  const [inputVal, setInputVal]     = useState('');
  const [emails, setEmails]         = useState<string[]>([]);
  const [inputError, setInputError] = useState('');
  const [sending, setSending]       = useState(false);
  const [sendError, setSendError]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) { setEmails([]); setInputVal(''); setInputError(''); setSendError(''); }
  }, [isOpen]);

  const addEmail = () => {
    const val = inputVal.trim();
    if (!val) return;
    if (!isValidEmail(val))               { setInputError('Enter a valid email address.'); return; }
    if (emails.includes(val))             { setInputError('This email is already added.'); return; }
    if (emails.length >= MAX_RECIPIENTS)  { setInputError(`Maximum ${MAX_RECIPIENTS} recipients allowed.`); return; }
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
// 4.  DELETE WORKSPACE MODAL
// ══════════════════════════════════════════════════════════════════════════════

export interface DeleteWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName?: string;
  onConfirm: () => Promise<void>;
}

export const DeleteWorkspaceModal: React.FC<DeleteWorkspaceModalProps> = ({
  isOpen, onClose, workspaceName, onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleDelete = async () => {
    setLoading(true); setError('');
    try { await onConfirm(); onClose(); }
    catch (err: any) { setError(err?.message || 'Failed to delete workspace. Please try again.'); }
    finally { setLoading(false); }
  };

  return (
    <ConfirmShell
      isOpen={isOpen} onClose={onClose}
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
// 5.  REMOVE USER MODAL
// ══════════════════════════════════════════════════════════════════════════════

export interface RemoveUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  onConfirm: () => Promise<void>;
}

export const RemoveUserModal: React.FC<RemoveUserModalProps> = ({
  isOpen, onClose, userName, onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleRemove = async () => {
    setLoading(true); setError('');
    try { await onConfirm(); onClose(); }
    catch (err: any) { setError(err?.message || 'Failed to remove user. Please try again.'); }
    finally { setLoading(false); }
  };

  return (
    <ConfirmShell
      isOpen={isOpen} onClose={onClose}
      variant="danger"
      icon={<SpIcon name="sp-User-User_Remove" size={30} />}
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
// 6.  DELETE ACCOUNT MODAL
// ══════════════════════════════════════════════════════════════════════════════

export interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  isOpen, onClose, onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleDelete = async () => {
    setLoading(true); setError('');
    try { await onConfirm(); onClose(); }
    catch (err: any) { setError(err?.message || 'Failed to delete account. Please try again.'); }
    finally { setLoading(false); }
  };

  return (
    <ConfirmShell
      isOpen={isOpen} onClose={onClose}
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
// 7.  LOGOUT MODAL
// ══════════════════════════════════════════════════════════════════════════════

export interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  appName?: string;
  userEmail?: string;
  onConfirm: () => Promise<void>;
}

export const LogoutModal: React.FC<LogoutModalProps> = ({
  isOpen, onClose, appName = 'the app', userEmail, onConfirm,
}) => {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try { await onConfirm(); }
    catch { /* navigation already happened */ }
    finally { setLoading(false); }
  };

  return (
    <ConfirmShell
      isOpen={isOpen} onClose={onClose}
      variant="primary"
      icon={<SpIcon name="sp-Other-Logout" size={30} />}
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

// ══════════════════════════════════════════════════════════════════════════════
// 8.  HOW BILLING WORKS MODAL  (new)
//     Triggered by "How billing works?" link in the Billing tab header.
// ══════════════════════════════════════════════════════════════════════════════

export interface HowBillingWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HowBillingWorksModal: React.FC<HowBillingWorksModalProps> = ({
  isOpen, onClose,
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
        className="sm-modal sm-modal--how-billing"
        style={{ maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — centered title, X top-right */}
        <div className="sm-hbw-header">
          <button className="sm-close-btn sm-hbw-close" onClick={onClose} aria-label="Close">
            <TbX size={18} />
          </button>
          <h2 className="sm-hbw-title">How Billing Works</h2>
        </div>

        {/* Body */}
        <div className="sm-hbw-body">

          {/* "1 Exploration includes" section */}
          <div className="sm-hbw-includes">
            <p className="sm-hbw-includes-heading">1 Exploration includes</p>
            <ul className="sm-hbw-includes-list">
              <li>4 manual/OMI generate personas</li>
              <li>Unlimited sample size</li>
              <li>Unlimited conversations</li>
              <li>Decision intelligence reports</li>
              <li>Data playground and more</li>
            </ul>
          </div>

          {/* Pricing columns */}
          <div className="sm-hbw-pricing-row">
            <div className="sm-hbw-pricing-col">
              <p className="sm-hbw-pricing-label">Explorations</p>
              <p className="sm-hbw-pricing-sub">Add as many as you need</p>
              <div className="sm-hbw-pricing-amount">
                <span className="sm-hbw-price">$2499</span>
                <span className="sm-hbw-price-unit">/ Exploration</span>
              </div>
            </div>
            <div className="sm-hbw-pricing-col">
              <p className="sm-hbw-pricing-label">Additional Personas</p>
              <p className="sm-hbw-pricing-sub">Add as many as you need</p>
              <div className="sm-hbw-pricing-amount">
                <span className="sm-hbw-price">$49</span>
                <span className="sm-hbw-price-unit">/ Additional Persona</span>
              </div>
            </div>
          </div>

          {/* Summary table */}
          <div className="sm-hbw-summary">
            <p className="sm-hbw-summary-title">Summary (May 2026)</p>
            <div className="sm-hbw-summary-rows">
              <div className="sm-hbw-summary-row">
                <span>Exploration (200 x #2,499)</span>
                <span>$499,800</span>
              </div>
              <div className="sm-hbw-summary-row">
                <span>Additional Personas (24 x $49)</span>
                <span>$499,800</span>
              </div>
            </div>
            <div className="sm-hbw-summary-divider" />
            <div className="sm-hbw-summary-rows">
              <div className="sm-hbw-summary-row sm-hbw-summary-row--muted">
                <span>Subtotal</span>
                <span>$6,176</span>
              </div>
              <div className="sm-hbw-summary-row sm-hbw-summary-row--muted">
                <span>Tax (18%)</span>
                <span>$1,111</span>
              </div>
            </div>
            <div className="sm-hbw-summary-divider" />
            <div className="sm-hbw-summary-row sm-hbw-summary-total">
              <span>Total</span>
              <span>$7,285</span>
            </div>
          </div>

          {/* CTA */}
          <button className="sm-hbw-cta" onClick={onClose}>
            Ok, Got It
          </button>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// 9.  SUBMIT QUERY MODAL  (new)
//     Triggered by "Contact our billing team" link at the bottom of Billing tab.
//     Renders the "Submit Your Query" modal as shown in Figma (Image 4).
// ══════════════════════════════════════════════════════════════════════════════

export interface SubmitQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (subject: string, description: string) => Promise<void>;
}

const QUERY_SUBJECTS = [
  'Payment issue',
  'Invoice request',
  'Billing discrepancy',
  'Plan upgrade',
  'Refund request',
  'Other',
];

export const SubmitQueryModal: React.FC<SubmitQueryModalProps> = ({
  isOpen, onClose, onSubmit,
}) => {
  const [subject, setSubject]         = useState('');
  const [description, setDescription] = useState('');
  const [subjectDropOpen, setSubjectDropOpen] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [errors, setErrors]           = useState<{ subject?: string; description?: string }>({});
  const [submitError, setSubmitError] = useState('');
  const dropRef = useRef<HTMLDivElement>(null);

  const MAX_DESC = 1000;

  useEffect(() => {
    if (isOpen) {
      setSubject(''); setDescription(''); setErrors({}); setSubmitError('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setSubjectDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const validate = () => {
    const next: typeof errors = {};
    if (!subject)          next.subject     = 'Please select a subject.';
    if (!description.trim()) next.description = 'Please enter a description.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true); setSubmitError('');
    try {
      await onSubmit(subject, description);

    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to submit query. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="sm-overlay" onClick={onClose}>
      <div
        className="sm-modal sm-modal--query"
        style={{ maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sm-query-header">
          <button className="sm-close-btn sm-close-btn--query" onClick={onClose} aria-label="Close">
            <TbX size={18} />
          </button>
          <h2 className="sm-query-title">Submit Your Query</h2>
        </div>

        {/* Body */}
        <div className="sm-modal-body sm-modal-body--query">
          {submitError && <p className="sm-error-msg">{submitError}</p>}

          {/* Subject */}
          <div className="sm-field sm-field--full">
            <label className="sm-label">
              Subject <span className="sm-required">*</span>
            </label>
            <div className="sm-query-select-wrap" ref={dropRef}>
              <button
                className={`sm-query-select-btn ${errors.subject ? 'sm-query-select-btn--error' : ''}`}
                onClick={() => setSubjectDropOpen(v => !v)}
                type="button"
              >
                <span className={subject ? 'sm-query-select-value' : 'sm-query-select-placeholder'}>
                  {subject || 'Select subject'}
                </span>
                <TbChevronDown
                  size={15}
                  className={`sm-query-chevron ${subjectDropOpen ? 'sm-query-chevron--open' : ''}`}
                />
              </button>
              {subjectDropOpen && (
                <div className="sm-query-dropdown">
                  {QUERY_SUBJECTS.map(s => (
                    <div
                      key={s}
                      className={`sm-query-dropdown-item ${subject === s ? 'sm-query-dropdown-item--active' : ''}`}
                      onClick={() => {
                        setSubject(s);
                        setSubjectDropOpen(false);
                        setErrors(({ subject: _s, ...rest }) => rest);
                      }}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sm-query-counter">{subject.length}/100</div>
            {errors.subject && <p className="sm-field-error">{errors.subject}</p>}
          </div>

          {/* Description */}
          <div className="sm-field sm-field--full">
            <label className="sm-label">
              Description <span className="sm-required">*</span>
            </label>
            <textarea
              className={`sm-query-textarea ${errors.description ? 'sm-query-textarea--error' : ''}`}
              placeholder="Description"
              value={description}
              onChange={e => {
                if (e.target.value.length <= MAX_DESC) setDescription(e.target.value);
                setErrors(({ description: _d, ...rest }) => rest);
              }}
              rows={5}
            />
            <div className="sm-query-counter">{description.length}/{MAX_DESC}</div>
            {errors.description && <p className="sm-field-error">{errors.description}</p>}
          </div>

          {/* Actions */}
          <div className="sm-query-actions">
            <button
              className="sm-query-cancel-btn"
              onClick={onClose}
              disabled={submitting}
              type="button"
            >
              Cancel
            </button>
            <button
              className="sm-query-submit-btn"
              onClick={handleSubmit}
              disabled={submitting}
              type="button"
            >
              {submitting ? 'Submitting…' : 'Submit →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export interface QuerySuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  queryNo?: string;
}
 
export const QuerySuccessModal: React.FC<QuerySuccessModalProps> = ({
  isOpen, onClose, queryNo = 'XYZ',
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
        className="sm-modal sm-qs-modal"
        style={{ maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="sm-close-btn sm-qs-close" onClick={onClose} aria-label="Close">
          <TbX size={18} />
        </button>
 
        <div className="sm-qs-body">
          <div className="sm-qs-icon-wrap">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
 
          <h2 className="sm-qs-title">Thank you!</h2>
          <p className="sm-qs-desc">
            Query submitted successfully. Our team will come back within 48 hours.
          </p>
          <p className="sm-qs-query-no">Query No.: {queryNo}</p>
        </div>
      </div>
    </div>
  );
};