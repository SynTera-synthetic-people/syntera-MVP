import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbX } from 'react-icons/tb';
import { validateWorkspace } from '../../../utils/validation';
import { useCreateWorkspace } from '../../../hooks/useWorkspaces';
import { useDispatch, useSelector } from 'react-redux';
import { validateStart } from '../../../redux/slices/omiSlice';
import './WorkspaceFormModalStyle.css';

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkspaceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: any) => void;
}

interface FormState {
  title: string;
  department: string;
  description: string;
}

interface FormErrors {
  title?: string;
  department?: string;
  description?: string;
  api?: string;
}

interface RootState {
  omi: { orgId: string };
  auth: { user: any };
  organizations: any;
}

// ── Component ────────────────────────────────────────────────────────────────

const WorkspaceFormModal: React.FC<WorkspaceFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const createMutation = useCreateWorkspace() as any;
  const dispatch = useDispatch();
  const { orgId } = useSelector((state: RootState) => state.omi);
  const { user } = useSelector((state: RootState) => state.auth);
  const { organizations } = useSelector((state: RootState) => state.organizations);

  const activeOrgId =
    organizations?.data?.id ||
    (organizations as any)?.organization_id ||
    orgId ||
    user?.organization_id ||
    user?.org_id ||
    'default-org';

  const [form, setForm] = useState<FormState>({
    title: '',
    department: '',
    description: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const loading: boolean = createMutation.isLoading;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    // Enforce max lengths
    const maxLengths: Record<string, number> = {
      title: 100,
      department: 100,
      description: 100,
    };
    if (maxLengths[name] && value.length > maxLengths[name]) return;

    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validateWorkspace(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    dispatch(
      validateStart({
        orgId: activeOrgId,
        stage: 'workspace_setup',
        data: {
          name: form.title,
          department: form.department,
          description: form.description,
        },
      })
    );

    const payload = {
      name: form.title,
      department: form.department,
      description: form.description,
    };

    createMutation.mutate(payload, {
      onSuccess: (res: any) => {
        setForm({ title: '', department: '', description: '' });
        setErrors({});
        onSuccess(res.data);
      },
      onError: (error: any) => {
        setErrors((prev) => ({
          ...prev,
          api:
            error.response?.data?.message || 'Failed to create workspace',
        }));
      },
    });
  };

  const handleClose = () => {
    if (!loading) {
      setForm({ title: '', department: '', description: '' });
      setErrors({});
      onClose();
    }
  };

  const isFormValid =
    form.title.trim().length > 0 && form.department.trim().length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="wfm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="wfm-card"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              className="wfm-close"
              onClick={handleClose}
              disabled={loading}
              aria-label="Close"
            >
              <TbX size={18} />
            </button>

            {/* Header */}
            <div className="wfm-header">
              <h2 className="wfm-title">Let's create a Workspace</h2>
              <p className="wfm-subtitle">
                Set up a new workspace to organize your research
              </p>
            </div>

            {/* API Error */}
            {errors.api && (
              <motion.div
                className="wfm-api-error"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {errors.api}
              </motion.div>
            )}

            {/* Form */}
            <form className="wfm-form" onSubmit={handleSubmit}>

              {/* Workspace Name */}
              <div className="wfm-field">
                <label className="wfm-label">
                  Workspace Name <span className="wfm-required">*</span>
                </label>
                <input
                  className={`wfm-input ${errors.title ? 'wfm-input--error' : ''}`}
                  name="title"
                  value={form.title}
                  onChange={handleChange}
                  placeholder="Enter workspace name"
                  disabled={loading}
                  maxLength={100}
                  autoComplete="off"
                />
                <div className="wfm-field-footer">
                  {errors.title && (
                    <span className="wfm-error-msg">{errors.title}</span>
                  )}
                  <span className="wfm-char-count">{form.title.length}/100</span>
                </div>
              </div>

              {/* Department Name */}
              <div className="wfm-field">
                <label className="wfm-label">
                  Department Name <span className="wfm-required">*</span>
                </label>
                <input
                  className={`wfm-input ${errors.department ? 'wfm-input--error' : ''}`}
                  name="department"
                  value={form.department}
                  onChange={handleChange}
                  placeholder="Enter department name (e.g. Marketing, Research)"
                  disabled={loading}
                  maxLength={100}
                  autoComplete="off"
                />
                <div className="wfm-field-footer">
                  {errors.department && (
                    <span className="wfm-error-msg">{errors.department}</span>
                  )}
                  <span className="wfm-char-count">
                    {form.department.length}/100
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="wfm-field">
                <label className="wfm-label">Description</label>
                <textarea
                  className="wfm-textarea"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Describe the big research theme this workflow will cover - a cluster of related explorations around one problem, audience or initiative."
                  disabled={loading}
                  maxLength={100}
                  rows={4}
                />
                <div className="wfm-field-footer">
                  <span />
                  <span className="wfm-char-count">
                    {form.description.length}/100
                  </span>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                className={`wfm-submit-btn ${
                  isFormValid ? 'wfm-submit-btn--active' : ''
                }`}
                disabled={loading || !isFormValid}
              >
                {loading ? (
                  <>
                    <div className="wfm-spinner" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Create Workspace →</span>
                )}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WorkspaceFormModal;