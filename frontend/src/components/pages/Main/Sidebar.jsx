import React, { useState, useRef, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../../../redux/slices/authSlice";
import logoForLight from "../../../assets/Logo_Light_bg.png";
import logoForDark from "../../../assets/Logo_Dark_bg.png";
import syntheticLogoForLight from "../../../assets/SyntheticLogo_Light_bg.png";
import syntheticLogoForDark from "../../../assets/SyntheticLogo_Dark_bg.png";
import { useTheme } from "../../../context/ThemeContext";
import {
  TbMoon,
  TbSun,
  TbLayoutDashboard,
  TbFolders,
  TbTargetArrow,
  TbUserCircle,
  TbBriefcase,
  TbChevronDown,
  TbChevronUp,
  TbLogout,
  TbListCheck,
  TbFileText,
  TbSettings,
  TbTelescope,
  TbPlus,
  TbCheck
} from "react-icons/tb";
import { useWorkspaces } from "../../../hooks/useWorkspaces";
import { useWorkspace as useWorkspaceContext } from "../../../context/WorkspaceContext";
import WorkspacePopup from "../organization/Workspace/WorkspacePopup";

const Sidebar = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { theme, toggleTheme } = useTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [expandedMenu, setExpandedMenu] = useState("workspace");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const [tooltip, setTooltip] = useState({ visible: false, content: "", x: 0, y: 0 });
  const { selectedWorkspace, setSelectedWorkspace } = useWorkspaceContext();
  const [showWorkspacePopup, setShowWorkspacePopup] = useState(false);

  // Add these refs and timeout
  const sidebarRef = useRef(null);
  const profileMenuRef = useRef(null);
  const workspaceDropdownRef = useRef(null);
  const collapseTimeoutRef = useRef(null);
  const isMouseInSidebarRef = useRef(false);
  const isMouseInProfilePopupRef = useRef(false);

  // Fetch workspaces using hook
  const { data: workspaces = [], isLoading, error, refetch } = useWorkspaces();

  // Set first workspace as selected on initial load if none selected
  useEffect(() => {
    if (workspaces.length > 0 && !selectedWorkspace) {
      const sortedWorkspaces = [...workspaces].sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      );
      setSelectedWorkspace(sortedWorkspaces[0]);
    }
  }, [workspaces, selectedWorkspace, setSelectedWorkspace]);

  // Handle sidebar mouse enter
  const handleSidebarMouseEnter = () => {
    isMouseInSidebarRef.current = true;
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    setIsCollapsed(false);
  };

  // Handle sidebar mouse leave
  const handleSidebarMouseLeave = (e) => {
    isMouseInSidebarRef.current = false;

    // Check if mouse is moving to profile popup
    const relatedTarget = e.relatedTarget;
    const isMovingToProfilePopup = profileMenuRef.current?.contains(relatedTarget);

    if (!isMovingToProfilePopup && !showProfileMenu) {
      collapseTimeoutRef.current = setTimeout(() => {
        if (!isMouseInSidebarRef.current && !isMouseInProfilePopupRef.current) {
          setIsCollapsed(true);
          setExpandedMenu(null);
          setShowWorkspaceDropdown(false);
        }
      }, 300); // Increased delay to 300ms
    }
  };

  // Handle profile popup mouse enter/leave
  useEffect(() => {
    const handleProfilePopupMouseEnter = () => {
      isMouseInProfilePopupRef.current = true;
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
        collapseTimeoutRef.current = null;
      }
    };

    const handleProfilePopupMouseLeave = () => {
      isMouseInProfilePopupRef.current = false;
      if (!isMouseInSidebarRef.current) {
        collapseTimeoutRef.current = setTimeout(() => {
          setIsCollapsed(true);
          setExpandedMenu(null);
          setShowWorkspaceDropdown(false);
        }, 200);
      }
    };

    const profilePopup = profileMenuRef.current?.querySelector('[class*="absolute bottom-full"]');
    if (profilePopup && showProfileMenu) {
      profilePopup.addEventListener('mouseenter', handleProfilePopupMouseEnter);
      profilePopup.addEventListener('mouseleave', handleProfilePopupMouseLeave);
    }

    return () => {
      if (profilePopup) {
        profilePopup.removeEventListener('mouseenter', handleProfilePopupMouseEnter);
        profilePopup.removeEventListener('mouseleave', handleProfilePopupMouseLeave);
      }
    };
  }, [showProfileMenu]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      if (workspaceDropdownRef.current && !workspaceDropdownRef.current.contains(event.target)) {
        setShowWorkspaceDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
      }
    };
  }, []);

  const handleLogout = () => {
    dispatch(logout());
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const toggleSidebar = () => {
    setIsOpen(!isOpen);
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
    if (!isCollapsed) {
      setExpandedMenu(null);
      setShowWorkspaceDropdown(false);
    }
  };

  const toggleMenu = (menu) => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setTimeout(() => setExpandedMenu(menu), 100);
    } else {
      setExpandedMenu(expandedMenu === menu ? null : menu);
    }
  };

  const toggleWorkspaceDropdown = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setTimeout(() => setShowWorkspaceDropdown(true), 100);
    } else {
      setShowWorkspaceDropdown(!showWorkspaceDropdown);
    }
  };

  const handleProfileMenuClick = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setTimeout(() => setShowProfileMenu(true), 100);
    } else {
      setShowProfileMenu(!showProfileMenu);
    }
  };

  const handleWorkspaceSelect = (workspace) => {
    setSelectedWorkspace(workspace);
    setShowWorkspaceDropdown(false);
    navigate(`/main/organization/workspace/explorations/${workspace.id}`);
    if (window.innerWidth < 768) {
      setIsOpen(false);
    }
  };

  const handleCreateWorkspace = () => {
    setShowWorkspacePopup(true);
    setShowWorkspaceDropdown(false);
    if (window.innerWidth < 768) {
      setIsOpen(false);
    }
  };

  // Tooltip functions
  const showTooltip = (content, event) => {
    if (!isCollapsed) return;

    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      content,
      x: rect.right + 8,
      y: rect.top + (rect.height / 2)
    });
  };

  const hideTooltip = () => {
    setTooltip({ visible: false, content: "", x: 0, y: 0 });
  };

  // Logo Logic
  const getLogo = () => {
    if (isCollapsed) {
      return theme === 'dark' ? syntheticLogoForDark : syntheticLogoForLight;
    }
    return theme === 'dark' ? logoForDark : logoForLight;
  };

  return (
    <>
      {/* Mobile Hamburger Button */}
      <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-50 p-2 bg-sidebar text-white rounded-lg md:hidden hover:bg-primary-dark shadow-lg hover:shadow-glow transition"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Premium Tooltip */}
      {tooltip.visible && (
        <div
          className="fixed z-50 px-3 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg shadow-xl border border-blue-500/30 backdrop-blur-sm"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateY(-50%)'
          }}
        >
          {tooltip.content}
          <div className="absolute top-1/2 -left-1 w-2 h-2 bg-blue-600 border-l border-t border-blue-500/30 transform -translate-y-1/2 rotate-45"></div>
        </div>
      )}

      {/* Sidebar Container */}
      <div className="relative">
        {/* Sidebar */}
        <div
          ref={sidebarRef}
          onMouseEnter={handleSidebarMouseEnter}
          onMouseLeave={handleSidebarMouseLeave}
          className={`fixed md:relative h-full backdrop-blur-sm p-5 flex flex-col justify-between z-40 transform transition-all duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
          ${isCollapsed ? "w-20" : "w-64"}
          bg-gradient-to-br from-gray-50 via-blue-50/30 to-blue-100/20 dark:from-[#0a0e1a] dark:via-[#0f1419] dark:to-[#1a1f2e]
          border-r border-gray-200/50 dark:border-white/5
          `}
        >

          {/* Top Section: Logo & Navigation */}
          <div className="flex flex-col gap-8">
            {/* Logo */}
            <div className="flex items-center justify-center py-4">
              <div
                className={`flex items-center justify-center transition-all duration-300 ${isCollapsed ? "w-12" : "w-full"}`}
                onMouseLeave={hideTooltip}
              >
                <img
                  src={getLogo()}
                  alt="Logo"
                  className={`object-contain transition-all duration-300 ${isCollapsed ? "h-8" : "h-14"}`}
                />
              </div>
            </div>

            <nav className="flex flex-col space-y-1.5">
              {/* Research Dashboard */}
              <NavLink
                to="/main/organization"
                onClick={() => setIsOpen(false)}
                onMouseEnter={(e) => isCollapsed && showTooltip("Research Dashboard", e)}
                onMouseLeave={hideTooltip}
                className={({ isActive }) =>
                  `flex items-center gap-4 px-4 py-3 rounded-xl transition-all font-medium group relative
                        ${isCollapsed ? "justify-center" : "text-sm"}
                        ${isActive
                    ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10"
                  }
                  ${isActive && !isCollapsed ? "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-8 before:bg-white before:rounded-r-full" : ""}
                  `
                }
                end
              >
                <TbLayoutDashboard size={22} className="flex-shrink-0" />
                {!isCollapsed && <span>Research Dashboard</span>}
              </NavLink>

              {/* Workspace Section with Dropdown */}
              <div ref={workspaceDropdownRef} className="relative">
                {/* Workspace Header */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={toggleWorkspaceDropdown}
                    onMouseEnter={(e) => isCollapsed && showTooltip("Workspace", e)}
                    onMouseLeave={hideTooltip}
                    className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all font-medium group
                    ${expandedMenu === "workspace" || showWorkspaceDropdown ? "bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10"}
                    ${isCollapsed ? "justify-center" : "justify-between"}`}
                  >
                    <div className="flex items-center gap-4">
                      <TbBriefcase size={22} className="flex-shrink-0" />
                      {!isCollapsed && <span className="text-sm">Workspace</span>}
                    </div>
                    {!isCollapsed && (
                      <TbChevronDown
                        className={`w-4 h-4 transition-transform duration-200 ${showWorkspaceDropdown ? "rotate-180" : ""}`}
                      />
                    )}
                  </button>

                  {/* Selected Workspace in Sidebar */}
                  {!isCollapsed && selectedWorkspace && (
                    <button
                      onClick={() => handleWorkspaceSelect(selectedWorkspace)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all hover:bg-gray-100 dark:hover:bg-white/5 text-sm text-gray-700 dark:text-gray-300 group border border-gray-200 dark:border-white/10"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-500/20 dark:to-blue-600/20 flex items-center justify-center flex-shrink-0">
                        <TbBriefcase size={18} className="text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate text-gray-900 dark:text-white">
                          {selectedWorkspace.name}
                          {showWorkspaceDropdown && (
                            <span className="ml-2 text-blue-600 dark:text-blue-400">
                              <TbCheck size={14} className="inline" />
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {selectedWorkspace.description || "No description"}
                        </p>
                      </div>
                      {!showWorkspaceDropdown && (
                        <TbTelescope size={16} className="text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0" />
                      )}
                    </button>
                  )}
                </div>

                {/* Workspace Dropdown */}
                {showWorkspaceDropdown && !isCollapsed && (
                  <div className="absolute left-0 right-0 mt-2 bg-white/95 dark:bg-[#1a1f2e]/95 backdrop-blur-xl rounded-xl shadow-xl border-2 border-gray-300/60 dark:border-white/10 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                    <div className="max-h-72 overflow-y-auto">
                      {/* Workspaces List */}
                      <div className="p-1">
                        {isLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading...</span>
                          </div>
                        ) : workspaces.length === 0 ? (
                          <div className="px-3 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                            No workspaces found
                          </div>
                        ) : (
                          workspaces.map((workspace) => (
                            <button
                              key={workspace.id}
                              onClick={() => handleWorkspaceSelect(workspace)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors group
                                ${selectedWorkspace?.id === workspace.id
                                  ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400"
                                  : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5"
                                }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                                ${selectedWorkspace?.id === workspace.id
                                  ? "bg-blue-100 dark:bg-blue-500/20"
                                  : "bg-gray-100 dark:bg-white/10 group-hover:bg-blue-100 dark:group-hover:bg-blue-500/20"
                                }`}>
                                <TbBriefcase size={16}
                                  className={selectedWorkspace?.id === workspace.id
                                    ? "text-blue-600 dark:text-blue-400"
                                    : "text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400"
                                  }
                                />
                              </div>
                              <div className="flex-1 text-left overflow-hidden">
                                <div className="flex items-center justify-between">
                                  <p className="font-medium truncate">{workspace.name}</p>
                                  {selectedWorkspace?.id === workspace.id && (
                                    <TbCheck size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0 ml-2" />
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {workspace.description || "No description"}
                                </p>
                              </div>
                            </button>
                          ))
                        )}
                      </div>

                      {/* Divider */}
                      <div className="h-px bg-gray-200 dark:bg-white/10 mx-3"></div>

                      {/* Create Workspace Button at Bottom */}
                      <div className="p-3">
                        <button
                          onClick={handleCreateWorkspace}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg transition-all duration-200 font-medium text-sm shadow-lg shadow-blue-500/30"
                        >
                          <TbPlus size={18} />
                          <span>Create Workspace</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </nav>
          </div>

          {/* Premium Profile Section */}
          <div className="relative pt-4 border-t border-gray-200/50 dark:border-white/5" ref={profileMenuRef}>
            <button
              onClick={handleProfileMenuClick}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200
                ${showProfileMenu
                  ? "bg-gray-100 dark:bg-white/10"
                  : "hover:bg-gray-100 dark:hover:bg-white/10"
                }
                ${isCollapsed ? "justify-center p-2" : ""}`}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm shadow-lg flex-shrink-0">
                {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              {!isCollapsed && (
                <>
                  <div className="flex-1 text-left overflow-hidden">
                    <p className="text-gray-900 dark:text-white font-semibold text-sm truncate">{user?.full_name || "User"}</p>
                    <p className="text-gray-500 dark:text-gray-500 text-xs truncate">{user?.email || "user@example.com"}</p>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showProfileMenu ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </>
              )}
            </button>

            {showProfileMenu && (
              <div className={`absolute bottom-full left-0 mb-2 bg-white/95 dark:bg-[#1a1f2e]/95 backdrop-blur-xl rounded-xl shadow-xl border-2 border-gray-300/60 dark:border-white/10 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 ${isCollapsed ? "w-48 left-full ml-2" : "w-full"}`}>
                <div className="p-1">
                  <button
                    onClick={toggleTheme}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <span className="text-lg">{theme === 'dark' ? <TbSun size={20} /> : <TbMoon size={20} />}</span>
                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </button>
                  <button
                    onClick={() => navigate('/main/settings')}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                  >
                    <span className="text-lg"><TbSettings size={20} /></span>
                    Settings
                  </button>

                  <div className="h-px bg-gray-100 dark:bg-white/10 my-1" />

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <TbLogout size={20} />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {showWorkspacePopup && (
          <WorkspacePopup
            onClose={() => setShowWorkspacePopup(false)}
            onSuccess={(newWS) => {
              refetch();
              if (newWS?.id) {
                setSelectedWorkspace(newWS);
                navigate(`/main/organization/workspace/explorations/${newWS.id}`);
              }
            }}
          />
        )}
      </div>
    </>
  );
};

export default Sidebar;