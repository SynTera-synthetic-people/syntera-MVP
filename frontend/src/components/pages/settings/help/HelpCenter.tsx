import React, { useState } from 'react';
import './HelpCenterStyle.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HelpFormState {
  email: string;
  subject: string;
  description: string;
}

interface HelpFormErrors {
  email?: string;
  subject?: string;
  description?: string;
}

const SUBJECT_OPTIONS = [
  'General Inquiry',
  'Technical Issue',
  'Billing Question',
  'Feature Request',
  'Account Problem',
  'Other',
];

// ── Component ─────────────────────────────────────────────────────────────────

const HelpCentre: React.FC = () => {
  const [form, setForm] = useState<HelpFormState>({
    email: '',
    subject: '',
    description: '',
  });
  const [errors, setErrors] = useState<HelpFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validate = (): boolean => {
    const next: HelpFormErrors = {};
    if (!form.email.trim()) next.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      next.email = 'Enter a valid email address.';
    if (!form.subject) next.subject = 'Please select a subject.';
    if (!form.description.trim()) next.description = 'Description is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      // TODO: wire to actual API
      await new Promise((r) => setTimeout(r, 800));
      setSubmitted(true);
      setForm({ email: '', subject: '', description: '' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="hc-page">
      <div className="hc-card">
        {submitted && (
          <div className="hc-success">
            Your message has been sent. We'll get back to you shortly.
          </div>
        )}

        {/* Email */}
        <div className="hc-field">
          <label className="hc-label">
            Email Address <span className="hc-required">*</span>
          </label>
          <input
            type="email"
            name="email"
            className={`hc-input ${errors.email ? 'hc-input--error' : ''}`}
            placeholder="Enter your email address"
            value={form.email}
            onChange={handleChange}
          />
          {errors.email && <p className="hc-error-msg">{errors.email}</p>}
        </div>

        {/* Subject */}
        <div className="hc-field">
          <label className="hc-label">
            Subject <span className="hc-required">*</span>
            <span className="hc-info-icon" title="Choose the topic that best describes your inquiry">ⓘ</span>
          </label>
          <div className="hc-select-wrap">
            <select
              name="subject"
              className={`hc-select ${errors.subject ? 'hc-input--error' : ''}`}
              value={form.subject}
              onChange={handleChange}
            >
              <option value="">Select subject</option>
              {SUBJECT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <span className="hc-select-chevron">▾</span>
          </div>
          {errors.subject && <p className="hc-error-msg">{errors.subject}</p>}
        </div>

        {/* Description */}
        <div className="hc-field">
          <label className="hc-label">
            Description <span className="hc-required">*</span>
            <span className="hc-info-icon" title="Describe your issue in detail">ⓘ</span>
          </label>
          <textarea
            name="description"
            className={`hc-textarea ${errors.description ? 'hc-input--error' : ''}`}
            placeholder="Description"
            rows={6}
            maxLength={1000}
            value={form.description}
            onChange={handleChange}
          />
          <div className="hc-textarea-footer">
            <span className="hc-error-msg">{errors.description || ''}</span>
            <span className="hc-char-count">{form.description.length}/1,000</span>
          </div>
        </div>

        {/* Submit */}
        <div className="hc-actions">
          <button
            className="hc-submit-btn"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpCentre;