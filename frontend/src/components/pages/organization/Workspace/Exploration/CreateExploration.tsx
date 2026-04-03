import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { TbX, TbInfoCircle } from "react-icons/tb";
import "./CreateExplorationStyle.css";
import {
  useCreateExploration,
  useUpdateExploration,
  useExploration,
} from "../../../../../hooks/useExplorations";
import { useWorkspace } from "../../../../../hooks/useWorkspaces";
import UpgradeModal from "../../../Upgrade/UpgradeModal";

/* ── Types ── */
interface CreateExplorationProps {
  onClose?: () => void;
  workspaceId?: string;
  onTrialLimitReached?: () => void; // callback to parent when limit hit
}

interface FormErrors {
  title?: string;
  description?: string;
}

interface ExplorationData {
  id?: string;
  title?: string;
  description?: string;
  audience_type?: string;
}

interface CreatePayload {
  workspace_id: string | undefined;
  title: string;
  description: string;
  audience_type: "B2C" | "B2B";
}

interface UpdatePayload {
  id: string | undefined;
  data: {
    title: string;
    description: string;
    audience_type: "B2C" | "B2B";
  };
}

/* ── Component ── */
const CreateExploration: React.FC<CreateExplorationProps> = ({ onClose, workspaceId: workspaceIdProp, onTrialLimitReached }) => {
  const navigate = useNavigate();
  const { workspaceId: workspaceIdParam, explorationId } = useParams<{
    workspaceId: string;
    explorationId: string;
  }>();

  // Prop takes priority (modal context); fall back to URL param (route context)
  const workspaceId = workspaceIdProp ?? workspaceIdParam;

  const isEditMode = !!explorationId;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audienceType, setAudienceType] = useState<"B2C" | "B2B">("B2C");
  const [errors, setErrors] = useState<FormErrors>({});
  const [showUpgrade, setShowUpgrade] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);

  /* ── Data fetching ── */
  const { data: currentWorkspace } = useWorkspace(workspaceId);

  const {
    data: explorationRaw,
    isLoading: isLoadingExploration,
    error: fetchError,
  } = useExploration(explorationId, { enabled: isEditMode });

  // Cast to our known shape so TypeScript stops complaining
  const exploration = explorationRaw as ExplorationData | undefined;

  const createExplorationMutation = useCreateExploration({
    onTrialLimitReached: () => {
      onClose?.();
      onTrialLimitReached?.(); // notify parent (ExplorationList) to show overlay
      setShowUpgrade(true);
    },
  });
  const updateExplorationMutation = useUpdateExploration();

  /* ── Populate form in edit mode ── */
  useEffect(() => {
    if (isEditMode && exploration) {
      setTitle(exploration.title || "");
      setDescription(exploration.description || "");
      if (exploration.audience_type) {
        setAudienceType(exploration.audience_type as "B2C" | "B2B");
      }
    }
  }, [isEditMode, exploration]);

  /* ── Close on overlay click ── */
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) {
      handleClose();
    }
  };

  /* ── Close / cancel ── */
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigate(`/main/organization/workspace/explorations/${workspaceId}`);
    }
  };

  /* ── Submit ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!title.trim()) {
      setErrors({ title: "Exploration name is required" });
      return;
    }

    try {
      let result: any;

      if (isEditMode) {
        const updatePayload: UpdatePayload = {
          id: explorationId,
          data: {
            title: title.trim(),
            description: description.trim(),
            audience_type: audienceType,
          },
        };
        result = await updateExplorationMutation.mutateAsync(
          updatePayload as any
        );
      } else {
        const createPayload: CreatePayload = {
          workspace_id: workspaceId,
          title: title.trim(),
          description: description.trim(),
          audience_type: audienceType,
        };
        result = await createExplorationMutation.mutateAsync(
          createPayload as any
        );
      }

      // API returns { status, message, data: { id, ... } } or { id, ... } directly
      const expId =
        result?.data?.id ||
        result?.id ||
        explorationId;

      console.log("Navigation result:", result, "expId:", expId, "workspaceId:", workspaceId);

      if (!expId) {
        console.error("No exploration ID returned from mutation");
        return;
      }

      navigate(
        `/main/organization/workspace/research-objectives/${workspaceId}/${expId}/research-mode`
      );
    } catch (err: any) {
      // If upgrade_required, onTrialLimitReached already handled it
      if (err?.upgrade_required) return;
      console.error(`Failed to ${isEditMode ? "update" : "create"} exploration:`, err);
    }
  };

  const isSubmitting =
    createExplorationMutation.isPending || updateExplorationMutation.isPending;
  const isLoading = isEditMode
    ? isLoadingExploration || updateExplorationMutation.isPending
    : createExplorationMutation.isPending;

  /* ── Loading / error states (edit mode) ── */
  if (isEditMode && isLoadingExploration) {
    return (
      <div className="ce-overlay" ref={overlayRef} onClick={handleOverlayClick}>
        <div className="ce-modal">
          <div className="ce-loading">
            <div className="ce-spinner" />
            <p>Loading exploration...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isEditMode && fetchError) {
    return (
      <div className="ce-overlay" ref={overlayRef} onClick={handleOverlayClick}>
        <div className="ce-modal">
          <div className="ce-error">
            <p>Error loading exploration</p>
            <button className="ce-btn-cancel" onClick={handleClose}>
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        <motion.div
          className="ce-overlay"
          ref={overlayRef}
          onClick={handleOverlayClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="ce-modal"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Close button ── */}
            <button className="ce-close-btn" onClick={handleClose} aria-label="Close">
              <TbX size={18} />
            </button>

            {/* ── Header ── */}
            <div className="ce-header">
              <h2 className="ce-title">
                {isEditMode ? "Edit Research Exploration" : "Create Research Exploration"}
              </h2>
              <p className="ce-subtitle">
                Give your study a clear title and a short description so it's easy to
                find, recognize, and share
              </p>
            </div>

            {/* ── Form ── */}
            <form onSubmit={handleSubmit} className="ce-form">

              {/* Exploration Name */}
              <div className="ce-field">
                <label className="ce-label">
                  Exploration Name <span className="ce-required">*</span>
                </label>
                <input
                  type="text"
                  className={`ce-input ${errors.title ? "ce-input--error" : ""}`}
                  placeholder="Enter exploration name"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                  disabled={isLoading}
                  maxLength={100}
                />
                <div className="ce-field-footer">
                  {errors.title ? (
                    <span className="ce-error-msg">{errors.title}</span>
                  ) : (
                    <span />
                  )}
                  <span className="ce-char-count">{title.length}/100</span>
                </div>
              </div>

              {/* Audience Type */}
              <div className="ce-field">
                <label className="ce-label">
                  Select Audience Type{" "}
                  <span className="ce-required">*</span>
                  <span className="ce-info-icon" title="Choose the primary audience for this exploration">
                    <TbInfoCircle size={14} />
                  </span>
                </label>

                <div className="ce-radio-group">
                  {/* B2C */}
                  <label className="ce-radio-label">
                    <input
                      type="radio"
                      name="audienceType"
                      value="B2C"
                      checked={audienceType === "B2C"}
                      onChange={() => setAudienceType("B2C")}
                      disabled={isLoading}
                      className="ce-radio-input"
                    />
                    <span className={`ce-radio-dot ${audienceType === "B2C" ? "ce-radio-dot--checked" : ""}`} />
                    <span className="ce-radio-text">B2C</span>
                  </label>

                  {/* B2B — coming soon */}
                  <label className="ce-radio-label ce-radio-label--disabled">
                    <input
                      type="radio"
                      name="audienceType"
                      value="B2B"
                      disabled
                      className="ce-radio-input"
                    />
                    <span className="ce-radio-dot" />
                    <span className="ce-radio-text ce-radio-text--muted">B2B</span>
                    <span className="ce-coming-soon">Coming Soon</span>
                  </label>
                </div>
              </div>

              {/* Description */}
              <div className="ce-field">
                <label className="ce-label">
                  Description{" "}
                  <span className="ce-required">*</span>
                  <span className="ce-info-icon" title="Briefly describe the goal of this exploration">
                    <TbInfoCircle size={14} />
                  </span>
                </label>
                <textarea
                  className="ce-textarea"
                  placeholder="Describe the big research theme this workflow will cover - a cluster of related explorations around one problem, audience or initiative."
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 300))}
                  disabled={isLoading}
                  maxLength={300}
                  rows={4}
                />
                <div className="ce-field-footer">
                  <span />
                  <span className="ce-char-count">{description.length}/300</span>
                </div>
              </div>

              {/* Actions */}
              <div className="ce-actions">
                <button
                  type="button"
                  className="ce-btn-cancel"
                  onClick={handleClose}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ce-btn-submit"
                  disabled={isLoading || !title.trim()}
                >
                  {isSubmitting ? (
                    <span className="ce-btn-loading">
                      <span className="ce-btn-spinner" />
                      {isEditMode ? "Updating..." : "Creating..."}
                    </span>
                  ) : isEditMode ? (
                    "Update Exploration"
                  ) : (
                    "Begin Exploration"
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onUpgradeSuccess={() => setShowUpgrade(false)}
      />
    </>
  );
};

export default CreateExploration;