import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import "./ExplorationStyle.css";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  TbSearch,
  TbChevronDown,
  TbX,
} from "react-icons/tb";
import SpIcon from '../../../../SPIcon';
import { useTheme } from "../../../../../context/ThemeContext";
import {
  useExplorations,
  useDeleteExploration,
} from "../../../../../hooks/useExplorations";
import { useWorkspace } from "../../../../../hooks/useWorkspaces";
import { formatDateToDDMMYYYY } from "../../../../../utils/formatDate";
import { getExplorationResumeRoute } from '../../../../../utils/getExplorationResumeRoute';
import {
  downloadLatestQuestionnaireCsvForExploration,
  alertQuestionnaireExportError,
} from "../../../../../utils/questionnaireExportFlow";
import UpgradeModal from "../../../Upgrade/UpgradeModal";
import CreateExploration from "./CreateExploration";
import InviteTeamModal from "../InviteTeamModal";
import WorkspacePopup from "../WorkspacePopup";

// ── Types ────────────────────────────────────────────────────────────────────

interface Exploration {
  id: string;
  title: string;
  description?: string;
  created_at: string;
  is_end?: boolean;
  audience_type?: string;
}

interface User {
  is_trial?: boolean;
  exploration_count?: number;
  trial_exploration_limit?: number;
  role?: string;
  is_admin?: boolean;
  can_create_workspace?: boolean;
  name?: string;
  full_name?: string;
  organization_id?: string | null;
  is_organization_member?: boolean;
}

interface AuthState {
  user: User | null;
}

interface RootState {
  auth: AuthState;
}

// ── MouseParticle ─────────────────────────────────────────────────────────────

const MouseParticle: React.FC<{
  mouseX: any;
  mouseY: any;
  damping: number;
  stiffness: number;
  offsetX?: number;
  offsetY?: number;
  className: string;
}> = ({ mouseX, mouseY, damping, stiffness, offsetX = 0, offsetY = 0, className }) => {
  const springX = useSpring(mouseX, { stiffness, damping });
  const springY = useSpring(mouseY, { stiffness, damping });
  const x = useTransform(springX, (value) => value + offsetX);
  const y = useTransform(springY, (value) => value + offsetY);
  return (
    <motion.div
      style={{ x, y }}
      className={`fixed top-0 left-0 pointer-events-none ${className}`}
    />
  );
};

// ── TooltipButton ─────────────────────────────────────────────────────────────

interface TooltipButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  colorClass: string;
  className?: string;
  disabled?: boolean;
}

const TooltipButton: React.FC<TooltipButtonProps> = ({
  onClick, icon, label, colorClass, className, disabled,
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  return (
    <div className="relative flex items-center justify-center">
      <motion.button
        whileHover={{ scale: disabled ? 1 : 1.1 }}
        whileTap={{ scale: disabled ? 1 : 0.9 }}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        disabled={disabled}
        className={`p-2 rounded-lg transition-colors relative ${colorClass} ${className || ""}`}
        aria-label={label}
      >
        {icon}
      </motion.button>
      {isHovered && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.8 }}
          animate={{ opacity: 1, y: -40, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.8 }}
          transition={{ duration: 0.15 }}
          className="absolute z-50 px-3 py-1.5 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded-lg shadow-xl whitespace-nowrap pointer-events-none"
        >
          {label}
          <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
        </motion.div>
      )}
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const getUserDisplayName = (user: User | null): string => {
  if (!user) return "";
  return user.name || user.full_name || "";
};

const isSoloUser = (user: User | null): boolean => {
  if (!user) return false;
  if (typeof user.is_organization_member === "boolean") return !user.is_organization_member;
  return !user.organization_id;
};

const getWorkspaceLabel = (user: User | null, workspaceName: string | undefined): string => {
  if (isSoloUser(user)) {
    const displayName = getUserDisplayName(user);
    if (displayName) {
      const possessive = displayName.endsWith("s")
        ? `${displayName}' Workspace`
        : `${displayName}'s Workspace`;
      return possessive;
    }
  }
  return workspaceName || "";
};

const isAdminUser = (user: User | null): boolean => {
  if (!user) return false;
  if (user.is_admin !== undefined) return Boolean(user.is_admin);
  if (user.role) return user.role.toLowerCase().includes("admin");
  return false;
};

// ── Component ─────────────────────────────────────────────────────────────────

const ExplorationList: React.FC = () => {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { theme } = useTheme();

  const { user } = useSelector((state: RootState) => state.auth);

  const userIsAdmin = isAdminUser(user);
  const canInviteTeam = Boolean(user?.can_create_workspace);

  // Trial state
  const isTrialMaxedFromRedux =
    user?.is_trial === true &&
      typeof user?.exploration_count === "number" &&
      typeof user?.trial_exploration_limit === "number"
      ? user.exploration_count >= user.trial_exploration_limit
      : false;

  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const effectivelyMaxed = isTrialMaxedFromRedux || upgradeRequired;

  // UI state
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isTooltipHovered, setIsTooltipHovered] = useState(false);
  const [csvDownloadingId, setCsvDownloadingId] = useState<string | null>(null);
  const [showEditWorkspace, setShowEditWorkspace] = useState(false);

  // Top-bar kebab (admin only)
  const [showTopKebab, setShowTopKebab] = useState(false);
  const topKebabRef = useRef<HTMLDivElement>(null);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ongoing" | "completed">("all");
  const [audienceFilter, setAudienceFilter] = useState<"all" | "B2B" | "B2C">("all");
  const [showStatusDrop, setShowStatusDrop] = useState(false);
  const [showAudienceDrop, setShowAudienceDrop] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const audienceRef = useRef<HTMLDivElement>(null);

  // Delete modal
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const [deleteModalTitle, setDeleteModalTitle] = useState<string>("");

  // Data fetching
  const { data: explorations, isLoading, error, refetch } = useExplorations(workspaceId);
  const deleteExplorationMutation = useDeleteExploration();
  const { data: currentWorkspace, refetch: refetchWorkspace } = useWorkspace(workspaceId);

  const workspaceHeading = getWorkspaceLabel(user, currentWorkspace?.name);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    mouseX.set(e.clientX);
    mouseY.set(e.clientY);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (topKebabRef.current && !topKebabRef.current.contains(e.target as Node))
        setShowTopKebab(false);
      if (statusRef.current && !statusRef.current.contains(e.target as Node))
        setShowStatusDrop(false);
      if (audienceRef.current && !audienceRef.current.contains(e.target as Node))
        setShowAudienceDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleDownloadQuestionnaireCsv = async (exploration: Exploration) => {
    try {
      setCsvDownloadingId(exploration.id);
      await downloadLatestQuestionnaireCsvForExploration({
        workspaceId,
        explorationId: exploration.id,
      });
    } catch (e) {
      console.error(e);
      alertQuestionnaireExportError(e);
    } finally {
      setCsvDownloadingId(null);
    }
  };

  const handleDelete = async (id: string, title?: string) => {
    setDeleteModalId(id);
    setDeleteModalTitle(title || "this exploration");
  };

  const confirmDelete = async () => {
    if (!deleteModalId) return;
    try {
      await deleteExplorationMutation.mutateAsync(deleteModalId as any);
      setOpenMenuId(null);
    } catch (error) {
      console.error("Failed to delete exploration:", error);
    } finally {
      setDeleteModalId(null);
      setDeleteModalTitle("");
    }
  };

  const toggleMenu = (id: string) => {
    setOpenMenuId(openMenuId === id ? null : id);
  };

  const visibleExplorations = ((explorations as Exploration[]) ?? [])
    .filter((exp) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q || exp.title?.toLowerCase().includes(q) || exp.description?.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "ongoing" && !exp.is_end) ||
        (statusFilter === "completed" && exp.is_end);
      const matchesAudience =
        audienceFilter === "all" || (exp.audience_type || "B2C") === audienceFilter;
      return matchesSearch && matchesStatus && matchesAudience;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // ── Loading / Error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="exploration-page">
        <div className="exploration-loading">
          <div className="loading-spinner-border"></div>
          <p>Loading explorations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="exploration-page">
        <div className="exploration-error">
          <p className="error-text">Error loading explorations</p>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => refetch()} className="retry-btn">
            Retry
          </motion.button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div onMouseMove={handleMouseMove} className="exploration-page">

      <div className="exploration-background">
        <div className="base-gradient" />
        <div className="gradient-orb gradient-orb-1" />
        <div className="gradient-orb gradient-orb-2" />
        <div className="gradient-orb gradient-orb-3" />
        <MouseParticle mouseX={mouseX} mouseY={mouseY} stiffness={150} damping={15} offsetX={-50} offsetY={-50} className="mouse-particle mouse-particle-large" />
        <MouseParticle mouseX={mouseX} mouseY={mouseY} stiffness={200} damping={10} offsetX={-10} offsetY={-10} className="mouse-particle mouse-particle-small" />
      </div>

      <div className="exploration-container">

        {/* ── Top Bar ── */}
        <div className="top-bar">
          <div className="top-bar-left">
            <span className="workspace-name">{workspaceHeading}</span>
            <span className="workspace-pill">Workspace</span>
          </div>

          <div className="top-bar-right">
            <button className="topbar-icon-btn bell-btn" aria-label="Notifications">
              <SpIcon name="sp-Communication-Bell" />
            </button>

            <div className="create-btn-wrapper">
              <motion.button
                whileHover={effectivelyMaxed ? {} : { scale: 1.02 }}
                whileTap={effectivelyMaxed ? {} : { scale: 0.98 }}
                onMouseEnter={() => !effectivelyMaxed && setIsTooltipHovered(true)}
                onMouseLeave={() => setIsTooltipHovered(false)}
                onClick={() => !effectivelyMaxed && setShowCreate(true)}
                disabled={effectivelyMaxed}
                className={`create-exploration-btn ${effectivelyMaxed ? "disabled" : ""}`}
              >
                <SpIcon name="sp-Edit-Add_Plus" />
                <span>Create Exploration</span>
              </motion.button>
              {isTooltipHovered && !effectivelyMaxed && (
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="create-tooltip">
                  Create a dedicated exploration for each research question or study.
                  <div className="tooltip-arrow" />
                </motion.div>
              )}
            </div>

            {/* Kebab — admin only */}
            {userIsAdmin && (
              <div className="topbar-kebab-wrapper" ref={topKebabRef}>
                <button
                  className="topbar-icon-btn"
                  aria-label="More options"
                  onClick={() => setShowTopKebab((v) => !v)}
                >
                  <SpIcon name="sp-Menu-More_Vertical" />
                </button>

                {showTopKebab && (
                  <div className="topbar-kebab-menu">
                    <div
                      className="menu-item"
                      onClick={() => { setShowTopKebab(false); navigate(`/main/organization/workspace/manage/${workspaceId}`); }}
                    >
                      <SpIcon name="sp-User-Users" />
                      Manage Users
                    </div>
                    <div
                      className="menu-item"
                      onClick={() => { setShowInviteModal(true); setShowTopKebab(false); }}
                    >
                      <SpIcon name="sp-User-User_Add" />
                      Invite People
                    </div>
                    <div
                      className="menu-item"
                      onClick={() => { setShowEditWorkspace(true); setShowTopKebab(false); }}
                    >
                      <SpIcon name="sp-Edit-Edit_Pencil_01" />
                      Edit Workspace
                    </div>
                    <div className="menu-item menu-item-delete">
                      <SpIcon name="sp-Interface-Trash_Empty" />
                      Delete Workspace
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Page Title ── */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="page-header">
          <h1 className="page-title">Research Exploration</h1>
        </motion.div>

        {/* ── Search + Filters ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="search-filter-row">
          <div className="search-wrapper">
            <SpIcon name="sp-Interface-Search_Magnifying_Glass" size={15} className="search-icon" />
            <input type="text" className="search-input" placeholder="Search here..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>

          <div className="filter-wrapper" ref={statusRef}>
            <button
              className={`filter-btn ${statusFilter !== "all" ? "filter-btn--active" : ""}`}
              onClick={() => { setShowStatusDrop((v) => !v); setShowAudienceDrop(false); }}
            >
              {statusFilter === "all" ? "Status" : statusFilter === "ongoing" ? "Ongoing" : "Completed"}
              <TbChevronDown size={14} className={`filter-chevron ${showStatusDrop ? "filter-chevron--open" : ""}`} />
            </button>
            {showStatusDrop && (
              <div className="filter-menu">
                {([
                  { value: "all", label: "All Statuses" },
                  { value: "ongoing", label: "Ongoing" },
                  { value: "completed", label: "Completed" },
                ] as const).map((opt) => (
                  <div
                    key={opt.value}
                    className={`filter-menu-item ${statusFilter === opt.value ? "filter-menu-item--active" : ""}`}
                    onClick={() => { setStatusFilter(opt.value); setShowStatusDrop(false); }}
                  >
                    {opt.value !== "all" && (
                      <span className={`filter-dot ${opt.value === "ongoing" ? "filter-dot--ongoing" : "filter-dot--completed"}`} />
                    )}
                    {opt.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="filter-wrapper" ref={audienceRef}>
            <button
              className={`filter-btn ${audienceFilter !== "all" ? "filter-btn--active" : ""}`}
              onClick={() => { setShowAudienceDrop((v) => !v); setShowStatusDrop(false); }}
            >
              {audienceFilter === "all" ? "Audience Type" : audienceFilter}
              <TbChevronDown size={14} className={`filter-chevron ${showAudienceDrop ? "filter-chevron--open" : ""}`} />
            </button>
            {showAudienceDrop && (
              <div className="filter-menu">
                {([
                  { value: "all", label: "All Types" },
                  { value: "B2C", label: "B2C" },
                  { value: "B2B", label: "B2B" },
                ] as const).map((opt) => (
                  <div
                    key={opt.value}
                    className={`filter-menu-item ${audienceFilter === opt.value ? "filter-menu-item--active" : ""}`}
                    onClick={() => { setAudienceFilter(opt.value); setShowAudienceDrop(false); }}
                  >
                    {opt.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* ── Main Table Card ── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="table-card">
          {visibleExplorations.length === 0 ? (
            <div className="empty-state">
              <h3 className="empty-title">
                {searchQuery || statusFilter !== "all" || audienceFilter !== "all"
                  ? "No explorations match your filters."
                  : "No research explorations… yet."}
              </h3>
              <p className="empty-description">
                {searchQuery || statusFilter !== "all" || audienceFilter !== "all"
                  ? "Try adjusting your search or filters."
                  : "Create your first exploration to group research initiatives by department, product, or market"}
              </p>
            </div>
          ) : (
            <>
              <div className="table-header">
                <div className="header-cell header-title">Title</div>
                <div className="header-cell header-description">Description</div>
                <div className="header-cell header-created">Created On</div>
                <div className="header-cell header-status">Status</div>
                <div className="header-cell header-audience">Audience Type</div>
                <div className="header-cell header-actions">Actions</div>
              </div>

              <div className="table-body">
                {visibleExplorations.map((exploration, index) => (
                  <motion.div
                    key={exploration.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="table-row"
                  >
                    <div className="row-cell cell-title">
                      <div className="cell-title-inner">
                        <span className="title-text">{exploration.title || "Untitled Exploration"}</span>
                      </div>
                    </div>
                    <div className="row-cell cell-description">{exploration.description || "No description provided."}</div>
                    <div className="row-cell cell-created">{formatDateToDDMMYYYY(exploration.created_at) || "N/A"}</div>
                    <div className="row-cell cell-status">
                      <span className={`status-badge ${exploration.is_end ? "status-completed" : "status-ongoing"}`}>
                        {exploration.is_end ? "Completed" : "Ongoing"}
                      </span>
                    </div>
                    <div className="row-cell cell-audience">{exploration.audience_type || "B2C"}</div>
                    <div className="row-cell cell-actions">
                      <button
                        className={`continue-exp-btn ${exploration.is_end ? "disabled" : ""}`}
                        disabled={exploration.is_end}
                        onClick={() => {
                          if (exploration.is_end) return; // extra safety
                          const path = getExplorationResumeRoute(exploration, workspaceId ?? '');
                          navigate(path);
                        }}
                      >
                        Continue <SpIcon name="sp-Arrow-Arrow_Right_SM" />
                      </button>
                      <div className="action-tooltip-group" />
                      <div className="kebab-menu-container">
                        <button className="kebab-btn" onClick={() => toggleMenu(exploration.id)}>
                          <SpIcon name="sp-Menu-More_Vertical" />
                        </button>
                        {openMenuId === exploration.id && (
                          <div className="kebab-menu">
                            <div className="menu-item" onClick={() => { navigate(`/main/organization/workspace/explorations/${workspaceId}/${exploration.id}/edit`); setOpenMenuId(null); }}>
                              <SpIcon name="sp-Edit-Edit_Pencil_01" />Edit
                            </div>
                            {exploration.is_end && (
                              <div className="menu-item" onClick={() => { handleDownloadQuestionnaireCsv(exploration); setOpenMenuId(null); }}>
                                <SpIcon name="sp-File-File_Blank" />Report
                              </div>
                            )}

                            {exploration.is_end && (
                              <div className="menu-item" onClick={() => { navigate(`/main/traceability/${workspaceId}/${exploration.id}`); setOpenMenuId(null); }}>
                                <SpIcon name="sp-File-File_Document" />Traceability
                              </div>
                            )}
                            <div className="menu-item menu-item-delete" onClick={() => handleDelete(exploration.id, exploration.title)}>
                              <SpIcon name="sp-Interface-Trash_Empty" />Delete
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          )}

          {/* Trial Limit Overlay — upgrade CTA lives here, banner above removed */}
          {effectivelyMaxed && (
            <motion.div className="trial-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
              <div className="trial-overlay-content">
                <h3 className="trial-overlay-title">Trial limit reached</h3>
                <p className="trial-overlay-subtitle">Upgrade to continue exploring behavioural insights without limits</p>
                <motion.button className="trial-overlay-btn" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => setShowUpgrade(true)}>
                 <SpIcon name="sp-Arrow-Arrow_Circle_Up"/> Upgrade Now 
                </motion.button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* ── Modals ── */}
      <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} onUpgradeSuccess={() => setShowUpgrade(false)} />

      <InviteTeamModal
        isOpen={showInviteModal}
        workspaceId={workspaceId}
        workspaceName={currentWorkspace?.name || "this workspace"}
        onSkip={() => setShowInviteModal(false)}
        onLaunch={() => setShowInviteModal(false)}
      />

      {showEditWorkspace && workspaceId && (
        <WorkspacePopup
          isOpen={showEditWorkspace}
          workspaceId={workspaceId}
          onClose={() => setShowEditWorkspace(false)}
          onSuccess={() => { setShowEditWorkspace(false); refetchWorkspace(); }}
        />
      )}

      {deleteModalId && (
        <motion.div
          className="delete-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setDeleteModalId(null)}
        >
          <motion.div
            className="delete-modal"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="delete-modal-close" onClick={() => setDeleteModalId(null)}>
              <TbX size={16} />
            </button>
            <div className="delete-modal-icon"><SpIcon name="sp-Interface-Trash_Empty" /></div>
            <h3 className="delete-modal-title">Delete Exploration</h3>
            <p className="delete-modal-subtitle">This will erase "{deleteModalTitle}"</p>
            <div className="delete-modal-actions">
              <button className="delete-modal-btn-confirm" onClick={confirmDelete} disabled={deleteExplorationMutation.isPending}>
                {deleteExplorationMutation.isPending ? "Deleting..." : "Delete"}
              </button>
              <button className="delete-modal-btn-cancel" onClick={() => setDeleteModalId(null)} disabled={deleteExplorationMutation.isPending}>
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {showCreate && (
        <CreateExploration
          onClose={() => { setShowCreate(false); refetch(); }}
          onTrialLimitReached={() => setUpgradeRequired(true)}
        />
      )}
    </div>
  );
};

export default ExplorationList;