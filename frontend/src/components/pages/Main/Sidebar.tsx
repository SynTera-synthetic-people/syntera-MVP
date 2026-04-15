import React, { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../../../redux/slices/authSlice";
import logoForLight from "../../../assets/Logo_Light_bg.png";
import logoForDark from "../../../assets/synlogo-dark.svg";
import syntheticLogoForLight from "../../../assets/SyntheticLogo_Light_bg.png";
import { useTheme } from "../../../context/ThemeContext";
import {
  TbChevronDown,
  TbCheck,
} from "react-icons/tb";
import SpIcon from "../../SPIcon";
import { useWorkspaces } from "../../../hooks/useWorkspaces";
import { useWorkspace as useWorkspaceContext } from "../../../context/WorkspaceContext";
import WorkspacePopup from "../organization/Workspace/WorkspacePopup";
import UpgradeModal from "../Upgrade/UpgradeModal";
import "./Sidebar.css";

interface Workspace {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

interface User {
  full_name?: string;
  email?: string;
  user_type?: string;
  role?: string;
  account_tier?: string;
  // Split name fields — some backends send these separately
  first_name?: string;
  name?: string;
}

interface AuthState {
  user: User | null;
}

interface RootState {
  auth: AuthState;
}

interface Tooltip {
  visible: boolean;
  content: string;
  x: number;
  y: number;
}

/* ── helpers ── */
const getPlanLabel = (user: User | null): string => {
  switch (user?.account_tier) {
    case "tier1":      return "Explorer";
    case "enterprise": return "Enterprise";
    case "free":
    default:           return "Free Trial";
  }
};

const getPlanClass = (user: User | null): string => {
  switch (user?.account_tier) {
    case "tier1":      return "plan-pill--explorer";
    case "enterprise": return "plan-pill--enterprise";
    case "free":
    default:           return "plan-pill--free";
  }
};

const isAdminUser = (user: User | null): boolean =>
  user?.role === "enterprise_admin" || user?.user_type === "enterprise_admin";

/**
 * Returns the display name for a workspace.
 *
 * Admin / enterprise users → use the real workspace name (set by the org admin).
 * Individual / solo users  → the backend auto-creates a workspace during
 *   onboarding so its stored name is often a UUID or generic string.
 *   We instead build a friendly label from the user's onboarding name:
 *   "Shreyas's Workspace" / "James' Workspace".
 *
 * For individual users who belong to multiple workspaces (edge case),
 * we fall back to the real workspace name for every workspace beyond
 * the first — since those were likely explicitly named.
 *
 * @param ws          The workspace object
 * @param user        The Redux auth user
 * @param isFirst     Whether this is the user's primary / first workspace
 */
const getWorkspaceDisplayName = (
  ws: Workspace,
  user: User | null,
  isFirst: boolean = false
): string => {
  // Admins always see the real workspace name they set.
  if (isAdminUser(user)) return ws.name;

  // For individual users, only override the primary (auto-created) workspace.
  // Any additional workspace they've been explicitly added to keeps its real name.
  if (!isFirst) return ws.name;

  // Build "{FirstName}'s Workspace" from the onboarding name.
  // Prefer first_name, fall back to splitting full_name / name.
  const rawFirst =
    user?.first_name ||
    user?.full_name?.split(" ")[0] ||
    user?.name?.split(" ")[0] ||
    null;

  if (!rawFirst) return ws.name; // No name available — don't override.

  const apostrophe = rawFirst.endsWith("s") ? "'" : "'s";
  return `${rawFirst}${apostrophe} Workspace`;
};

const Sidebar: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state: RootState) => state.auth);
  const { theme, toggleTheme } = useTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const [tooltip, setTooltip] = useState<Tooltip>({ visible: false, content: "", x: 0, y: 0 });
  const [showWorkspacePopup, setShowWorkspacePopup] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const { selectedWorkspace, setSelectedWorkspace } = useWorkspaceContext();

  const sidebarRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const workspaceDropdownRef = useRef<HTMLDivElement>(null);
  const collapseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMouseInSidebarRef = useRef(false);
  const isMouseInProfilePopupRef = useRef(false);

  const { data: workspaces = [], isLoading, refetch } = useWorkspaces() as {
    data: Workspace[];
    isLoading: boolean;
    error: any;
    refetch: () => void;
  };

  // Sort workspaces once so we can reliably identify the "first" (primary) one.
  // The primary workspace is the oldest — it's the one the backend auto-created
  // during onboarding for individual users.
  const sortedWorkspaces = [...workspaces].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const primaryWorkspaceId = sortedWorkspaces[0]?.id;

  // Auto-select first workspace (most recent for navigation UX, unchanged).
  useEffect(() => {
    if (workspaces.length > 0 && !selectedWorkspace) {
      const sorted = [...workspaces].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setSelectedWorkspace(sorted[0]);
    }
  }, [workspaces, selectedWorkspace, setSelectedWorkspace]);

  /* ── hover expand / collapse ── */
  const handleSidebarMouseEnter = () => {
    isMouseInSidebarRef.current = true;
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    setIsCollapsed(false);
  };

  const handleSidebarMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    isMouseInSidebarRef.current = false;
    const relatedTarget = e.relatedTarget as Node | null;
    const movingToProfile = relatedTarget ? profileMenuRef.current?.contains(relatedTarget) : false;
    if (!movingToProfile && !showProfileMenu) {
      collapseTimeoutRef.current = setTimeout(() => {
        if (!isMouseInSidebarRef.current && !isMouseInProfilePopupRef.current) {
          setIsCollapsed(true);
          setShowWorkspaceDropdown(false);
        }
      }, 300);
    }
  };

  useEffect(() => {
    const handleProfilePopupEnter = () => {
      isMouseInProfilePopupRef.current = true;
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
        collapseTimeoutRef.current = null;
      }
    };
    const handleProfilePopupLeave = () => {
      isMouseInProfilePopupRef.current = false;
      if (!isMouseInSidebarRef.current) {
        collapseTimeoutRef.current = setTimeout(() => {
          setIsCollapsed(true);
          setShowWorkspaceDropdown(false);
        }, 200);
      }
    };
    const popup = profileMenuRef.current?.querySelector('[class*="profile-popup"]');
    if (popup && showProfileMenu) {
      popup.addEventListener("mouseenter", handleProfilePopupEnter);
      popup.addEventListener("mouseleave", handleProfilePopupLeave);
    }
    return () => {
      if (popup) {
        popup.removeEventListener("mouseenter", handleProfilePopupEnter);
        popup.removeEventListener("mouseleave", handleProfilePopupLeave);
      }
    };
  }, [showProfileMenu]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node))
        setShowProfileMenu(false);
      if (workspaceDropdownRef.current && !workspaceDropdownRef.current.contains(e.target as Node))
        setShowWorkspaceDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
    };
  }, []);

  /* ── actions ── */
  const handleLogout = () => {
    dispatch(logout() as any);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const toggleWorkspaceDropdown = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setTimeout(() => setShowWorkspaceDropdown(true), 100);
    } else {
      setShowWorkspaceDropdown((v) => !v);
    }
  };

  const handleProfileMenuClick = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setTimeout(() => setShowProfileMenu(true), 100);
    } else {
      setShowProfileMenu((v) => !v);
    }
  };

  const handleWorkspaceSelect = (workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    setShowWorkspaceDropdown(false);
    navigate(`/main/organization/workspace/explorations/${workspace.id}`);
    if (window.innerWidth < 768) setIsOpen(false);
  };

  const handleCreateWorkspace = () => {
    setShowWorkspacePopup(true);
    setShowWorkspaceDropdown(false);
    if (window.innerWidth < 768) setIsOpen(false);
  };

  /* ── tooltip ── */
  const showTooltip = (content: string, e: React.MouseEvent<HTMLElement>) => {
    if (!isCollapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ visible: true, content, x: rect.right + 8, y: rect.top + rect.height / 2 });
  };
  const hideTooltip = () => setTooltip({ visible: false, content: "", x: 0, y: 0 });

  /* ── logo ── */
  const getLogo = () => {
    if (isCollapsed) return syntheticLogoForLight;
    return theme === "dark" ? logoForDark : logoForLight;
  };

  const planLabel = getPlanLabel(user);
  const planClass = getPlanClass(user);
  const userIsAdmin = isAdminUser(user);
  const isEnterprise = user?.account_tier === "enterprise";

  return (
    <>
      {/* Mobile Hamburger */}
      <button onClick={() => setIsOpen(!isOpen)} className="mobile-hamburger">
        <svg className="hamburger-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {isOpen && <div className="mobile-overlay" onClick={() => setIsOpen(false)} />}

      {/* Tooltip */}
      {tooltip.visible && (
        <div className="sidebar-tooltip" style={{ left: tooltip.x, top: tooltip.y, transform: "translateY(-50%)" }}>
          {tooltip.content}
          <div className="tooltip-arrow" />
        </div>
      )}

      <div className="sidebar-wrapper">
        <div
          ref={sidebarRef}
          onMouseEnter={handleSidebarMouseEnter}
          onMouseLeave={handleSidebarMouseLeave}
          className={`sidebar ${isOpen ? "sidebar-open" : ""} ${isCollapsed ? "sidebar-collapsed" : "sidebar-expanded"}`}
        >
          {/* ── Top: Logo + Nav ── */}
          <div className="sidebar-top">
            {/* Logo */}
            <div className="sidebar-logo-container">
              <div className={`sidebar-logo ${isCollapsed ? "logo-collapsed" : "logo-expanded"}`} onMouseLeave={hideTooltip}>
                <img src={getLogo()} alt="Logo" className={`logo-image ${isCollapsed ? "logo-small" : "logo-large"}`} />
              </div>
            </div>

            <nav className="sidebar-nav">
              {/* Dashboard — admin only */}
              {userIsAdmin && (
                <NavLink
                  to="/main/organization"
                  onClick={() => setIsOpen(false)}
                  onMouseEnter={(e) => isCollapsed && showTooltip("Dashboard", e)}
                  onMouseLeave={hideTooltip}
                  className={({ isActive }) =>
                    `nav-item ${isCollapsed ? "nav-item-collapsed" : ""} ${isActive ? "nav-item-active" : ""}`
                  }
                  end
                >
                  <SpIcon name="sp-Other-Dashboard" className="nav-icon" />
                  {!isCollapsed && <span className="nav-text">Dashboard</span>}
                </NavLink>
              )}

              {/* Workspace section */}
              <div ref={workspaceDropdownRef} className="workspace-section">
                {/* Workspace toggle header */}
                <button
                  onClick={toggleWorkspaceDropdown}
                  onMouseEnter={(e) => isCollapsed && showTooltip("Workspace", e)}
                  onMouseLeave={hideTooltip}
                  className={`workspace-toggle ${showWorkspaceDropdown ? "workspace-toggle-active" : ""} ${isCollapsed ? "workspace-toggle-collapsed" : ""}`}
                >
                  <div className="workspace-toggle-left">
                    <SpIcon name="sp-Navigation-Building_04" className="nav-icon" />
                    {!isCollapsed && <span className="nav-text">Workspaces</span>}
                  </div>
                  {!isCollapsed && (
                    <TbChevronDown className={`chevron-icon ${showWorkspaceDropdown ? "chevron-rotated" : ""}`} />
                  )}
                </button>

                {/* Selected workspace card (when dropdown closed) */}
                {!isCollapsed && !showWorkspaceDropdown && selectedWorkspace && (
                  <button
                    onClick={() => handleWorkspaceSelect(selectedWorkspace)}
                    className="selected-workspace-btn"
                  >
                    <div className="workspace-icon-container">
                      <SpIcon name="sp-Navigation-Building_04" className="nav-icon" />
                    </div>
                    <div className="workspace-info">
                      {/*
                        Display name for the currently selected workspace.
                        Individual users see "{FirstName}'s Workspace" for
                        their primary (auto-created) workspace.
                        Admin users and secondary workspaces show the real name.
                      */}
                      <p className="workspace-name-text">
                        {getWorkspaceDisplayName(
                          selectedWorkspace,
                          user,
                          selectedWorkspace.id === primaryWorkspaceId
                        )}
                      </p>
                      <p className="workspace-desc">
                        {selectedWorkspace.description || "No descripicon-defaulttion"}
                      </p>
                    </div>
                  </button>
                )}

                {/* Workspace dropdown list */}
                {showWorkspaceDropdown && !isCollapsed && (
                  <div className="workspace-dropdown">
                    <div className="workspace-dropdown-scroll">
                      <div className="workspace-list">
                        {isLoading ? (
                          <div className="workspace-loading">
                            <div className="loading-spinner" />
                            <span className="loading-text">Loading...</span>
                          </div>
                        ) : workspaces.length === 0 ? (
                          <div className="workspace-empty">No workspaces found</div>
                        ) : (
                          workspaces.map((ws: Workspace) => (
                            <button
                              key={ws.id}
                              onClick={() => handleWorkspaceSelect(ws)}
                              className={`workspace-item ${selectedWorkspace?.id === ws.id ? "workspace-item-selected" : ""}`}
                            >
                              <div className={`workspace-item-icon ${selectedWorkspace?.id === ws.id ? "workspace-item-icon-selected" : ""}`}>
                                <SpIcon name="sp-Navigation-Building_04" className={selectedWorkspace?.id === ws.id ? "icon-selected" : "icon-default"} />
                              </div>
                              <div className="workspace-item-info">
                                <div className="workspace-item-header">
                                  {/*
                                    Same logic in the dropdown list.
                                    Primary workspace → friendly name.
                                    All others        → real API name.
                                  */}
                                  <p className="workspace-item-name">
                                    {getWorkspaceDisplayName(
                                      ws,
                                      user,
                                      ws.id === primaryWorkspaceId
                                    )}
                                  </p>
                                </div>
                                <p className="workspace-item-desc">
                                  {ws.description || "No description"}
                                </p>
                              </div>
                            </button>
                          ))
                        )}
                      </div>

                      {/* Create Workspace — admin only (unchanged) */}
                      {userIsAdmin && <div className="workspace-divider" />}
                      {userIsAdmin && (
                        <div className="create-workspace-container">
                          <button onClick={handleCreateWorkspace} className="create-workspace-btn">
                            <SpIcon name="sp-Edit-Add_Plus" />
                            <span>Create Workspace</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </nav>
          </div>

          {/* ── Bottom: Profile + Plan + Upgrade ── */}
          <div className="sidebar-bottom-section">
            <div className="sidebar-profile-section" ref={profileMenuRef}>
              <button
                onClick={handleProfileMenuClick}
                className={`profile-btn ${showProfileMenu ? "profile-btn-active" : ""} ${isCollapsed ? "profile-btn-collapsed" : ""}`}
              >
                {/* Avatar */}
                <div className="profile-avatar">
                  {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
                  {isCollapsed && !isEnterprise && <span className="" />}
                </div>

                {!isCollapsed && (
                  <>
                    <div className="profile-identity">
                      <p className="profile-name">{user?.full_name || "User"}</p>
                      <span className={`plan-pill ${planClass}`}>{planLabel}</span>
                    </div>

                    {!isEnterprise && (
                      <div
                        className="sidebar-upgrade-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowUpgradeModal(true);
                        }}
                      >
                        Upgrade
                      </div>
                    )}
                  </>
                )}
              </button>

              {/* Profile popup menu */}
              {showProfileMenu && (
                <div className={`profile-popup ${isCollapsed ? "profile-popup-collapsed" : "profile-popup-expanded"}`}>
                  <div className="profile-menu">
                    <button onClick={toggleTheme} className="profile-menu-item">
                      <span className="menu-icon">{theme === "dark" ? <SpIcon name="sp-Environment-Sun" /> : <SpIcon name="sp-Environment-Moon" />}</span>
                      {theme === "dark" ? "Light Mode" : "Dark Mode"}
                    </button>
                    <button onClick={() => navigate("/main/settings")} className="profile-menu-item">
                      <span className="menu-icon"><SpIcon name="sp-Interface-Settings" /></span>
                      Settings
                    </button>
                    {/* <div className="profile-menu-divider" /> */}
                    <button onClick={handleLogout} className="profile-menu-item profile-menu-logout">
                      <SpIcon name="sp-Interface-Log_Out" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {showWorkspacePopup && (
          <WorkspacePopup
            onClose={() => setShowWorkspacePopup(false)}
            onSuccess={(newWS: Workspace) => {
              refetch();
              if (newWS?.id) {
                setSelectedWorkspace(newWS);
                navigate(`/main/organization/workspace/explorations/${newWS.id}`);
              }
            }}
          />
        )}
      </div>

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onUpgradeSuccess={() => setShowUpgradeModal(false)}
      />
    </>
  );
};

export default Sidebar;