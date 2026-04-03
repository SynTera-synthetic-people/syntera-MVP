// src/components/Workspace/WorkspacePopup.tsx
import React, { useState, useEffect } from "react";
import { validateWorkspace } from "../../../../utils/validation";
import { useCreateWorkspace, useUpdateWorkspace, useWorkspace } from "../../../../hooks/useWorkspaces";
import { useDispatch, useSelector } from "react-redux";
import { validateStart } from "../../../../redux/slices/omiSlice";
import { motion, AnimatePresence } from "framer-motion";
import { TbX, TbEdit, TbBriefcase } from "react-icons/tb";
import "./WokspacePopupStyle.css";

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkspacePopupProps {
  isOpen?: boolean;
  onClose: () => void;
  onSuccess?: (data: any) => void;
  /**
   * Pass workspaceId to open in EDIT mode.
   * Omit (or pass undefined) to open in CREATE mode.
   */
  workspaceId?: string;
}

interface FormState {
  title: string;
  description: string;
  department_name: string;
}

interface FormErrors {
  title?: string;
  description?: string;
  department_name?: string;
  api?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Safely reads a value from an object by trying multiple key names. */
const getField = (obj: any, keys: string[]): string => {
  if (!obj) return "";
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return String(obj[key]);
  }
  // Also check nested .data
  if (obj.data) return getField(obj.data, keys);
  return "";
};

// ── Component ────────────────────────────────────────────────────────────────

const WorkspacePopup: React.FC<WorkspacePopupProps> = ({
  isOpen = true,
  onClose,
  onSuccess,
  workspaceId,
}) => {
  // Edit mode when workspaceId is provided
  const isEditMode = !!workspaceId;

  const createMutation = useCreateWorkspace() as any;
  const updateMutation = useUpdateWorkspace() as any;

  // Fetch existing workspace data in edit mode
  const { data: workspaceData, isLoading: isFetching } = useWorkspace(
    workspaceId,
    { enabled: isEditMode }
  ) as any;

  const loading: boolean =
    createMutation.isLoading ||
    createMutation.isPending ||
    updateMutation.isLoading ||
    updateMutation.isPending;

  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    department_name: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const dispatch = useDispatch();
  const { orgId } = useSelector((state: any) => state.omi);
  const { user } = useSelector((state: any) => state.auth);
  const { organizations } = useSelector((state: any) => state.organizations);

  const activeOrgId =
    organizations?.data?.id ||
    organizations?.organization_id ||
    orgId ||
    user?.organization_id ||
    user?.org_id ||
    "default-org";

  // ── Populate form in edit mode once workspace data arrives ────────────────

  useEffect(() => {
    if (isEditMode && workspaceData) {
      setForm({
        title:           getField(workspaceData, ["name", "title"]),
        description:     getField(workspaceData, ["description"]),
        department_name: getField(workspaceData, ["department_name", "departmentName", "department", "dept_name", "dept"]),
      });
    }
  }, [isEditMode, workspaceData]);

  // Reset form when popup closes so create mode starts fresh
  useEffect(() => {
    if (!isOpen && !isEditMode) {
      setForm({ title: "", description: "", department_name: "" });
      setErrors({});
    }
  }, [isOpen, isEditMode]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
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
        stage: "workspace_setup",
        data: {
          name: form.title,
          description: form.description,
          department_name: form.department_name,
        },
      })
    );

    const payload = {
      name: form.title,
      description: form.description,
      department_name: form.department_name,
    };

    if (isEditMode) {
      // ── UPDATE ──────────────────────────────────────────────────────────
      updateMutation.mutate(
        { id: workspaceId, data: payload },
        {
          onSuccess: (res: any) => {
            onSuccess?.(res?.data || res);
            onClose();
          },
          onError: (error: any) => {
            setErrors((prev) => ({
              ...prev,
              api:
                error?.response?.data?.message || "Failed to update workspace",
            }));
          },
        }
      );
    } else {
      // ── CREATE ──────────────────────────────────────────────────────────
      createMutation.mutate(payload, {
        onSuccess: (res: any) => {
          onSuccess?.(res?.data || res);
          onClose();
        },
        onError: (error: any) => {
          setErrors((prev) => ({
            ...prev,
            api:
              error?.response?.data?.message || "Failed to create workspace",
          }));
        },
      });
    }
  };

  const isFormValid =
    form.title.trim().length > 0 && form.department_name.trim().length > 0;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="wp-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="wp-card"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              className="wp-close"
              onClick={onClose}
              disabled={loading}
              aria-label="Close"
            >
              <TbX size={18} />
            </button>

            {/* Header */}
            <div className="wp-header">
              <h2 className="wp-title">
                {isEditMode ? "Update Workspace Details" : "Let's create a Workspace"}
              </h2>
              <p className="wp-subtitle">
                {isEditMode
                  ? "Make changes to your workspace"
                  : "Set up a new workspace to organize your research"}
              </p>
            </div>

            {/* Loading indicator in edit mode while fetching existing data */}
            {isEditMode && isFetching ? (
              <div className="wp-loading">
                <div className="wp-spinner" />
                <span>Loading workspace...</span>
              </div>
            ) : (
              <>
                {/* API Error */}
                {errors.api && (
                  <motion.div
                    className="wp-api-error"
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {errors.api}
                  </motion.div>
                )}

                {/* Form */}
                <form className="wp-form" onSubmit={handleSubmit}>

                  {/* Workspace Name */}
                  <div className="wp-field">
                    <label className="wp-label">
                      Workspace Name <span className="wp-required">*</span>
                    </label>
                    <input
                      className={`wp-input ${errors.title ? "wp-input--error" : ""}`}
                      name="title"
                      value={form.title}
                      onChange={handleChange}
                      placeholder="Enter workspace name"
                      disabled={loading}
                      autoFocus={!isEditMode}
                      autoComplete="off"
                    />
                    {errors.title && (
                      <div className="wp-field-footer">
                        <span className="wp-error-msg">{errors.title}</span>
                      </div>
                    )}
                  </div>

                  {/* Department Name */}
                  <div className="wp-field">
                    <label className="wp-label">
                      Department Name <span className="wp-required">*</span>
                    </label>
                    <input
                      className={`wp-input ${errors.department_name ? "wp-input--error" : ""}`}
                      name="department_name"
                      value={form.department_name}
                      onChange={handleChange}
                      placeholder="Enter department name (e.g. Marketing, Research)"
                      disabled={loading}
                      autoComplete="off"
                    />
                    <div className="wp-field-footer">
                      {errors.department_name && (
                        <span className="wp-error-msg">{errors.department_name}</span>
                      )}
                      <span className="wp-char-count">
                        {form.department_name.length}/100
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="wp-field">
                    <label className="wp-label">Description</label>
                    <textarea
                      className="wp-textarea"
                      name="description"
                      value={form.description}
                      onChange={handleChange}
                      placeholder="Describe the big research theme this workspace will cover."
                      rows={4}
                      disabled={loading}
                    />
                    <div className="wp-field-footer">
                      <span />
                      <span className="wp-char-count">
                        {form.description.length}/300
                      </span>
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    className={`wp-submit-btn ${isFormValid ? "wp-submit-btn--active" : ""}`}
                    disabled={loading || !isFormValid}
                  >
                    {loading ? (
                      <>
                        <div className="wp-spinner" />
                        <span>{isEditMode ? "Updating..." : "Creating..."}</span>
                      </>
                    ) : (
                      <span>
                        {isEditMode ? "Update Workspace →" : "Create Workspace →"}
                      </span>
                    )}
                  </button>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WorkspacePopup;