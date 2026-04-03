import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { TbPlus } from "react-icons/tb";
import { useSelector } from "react-redux";
import { useTheme } from "../../../context/ThemeContext";
import WorkspacePopup from "../organization/Workspace/WorkspacePopup";
import { useWorkspace as useWorkspaceContext } from "../../../context/WorkspaceContext";
import CreateExploration from "../organization/Workspace/Exploration/CreateExploration";
import IdleState from "../../../assets/Omi Animations/IdleStateMotion_Lite.mp4";
import "./LandingPage.css";

interface User {
  user_type?: string;
  role?: string;
  account_tier?: string;
  exploration_count?: number;
  trial_exploration_limit?: number;
  preferred_workspace_id?: string | null;
  default_workspace_id?: string | null;
  has_accessible_workspaces?: boolean;
  can_create_workspace?: boolean;
  landing_type?: string;
}

interface AuthState {
  user: User | null;
}

interface RootState {
  auth: AuthState;
}

interface Workspace {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { user } = useSelector((state: RootState) => state.auth);
  const { setSelectedWorkspace, selectedWorkspace } = useWorkspaceContext();

  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [showCreateExploration, setShowCreateExploration] = useState(false);

  // Workspace ID — from user object set by backend on login via buildAuthUser
  const workspaceId =
    user?.preferred_workspace_id ||
    user?.default_workspace_id ||
    selectedWorkspace?.id;

  // Only admins with can_create_workspace flag can create workspaces
  const canCreateWorkspace = user?.can_create_workspace === true;

  // User has an accessible workspace if flag is set or we have a workspace ID
  const hasWorkspace = !!(user?.has_accessible_workspaces || workspaceId);

  // Redirect super admin
  useEffect(() => {
    const isSuperAdmin =
      user?.user_type === "Super Admin" ||
      user?.user_type === "super_admin" ||
      user?.role === "Super Admin" ||
      user?.role === "super_admin";

    if (isSuperAdmin) {
      navigate("/admin/dashboard");
    }
  }, [user, navigate]);

  const handleWorkspaceCreated = (newWorkspace: Workspace) => {
    setShowWorkspaceModal(false);
    if (newWorkspace?.id) {
      setSelectedWorkspace(newWorkspace);
      setShowCreateExploration(true);
    }
  };

  return (
    <div className="landing-page">
      {/* Background orbs */}
      <div className="landing-bg">
        <div className="landing-orb landing-orb-1" />
        <div className="landing-orb landing-orb-2" />
      </div>

      {/* Top Bar */}
      <div className="landing-top-bar">
        <div className="landing-top-bar-left">
          <span className="landing-workspace-name">
            {selectedWorkspace?.name || "Workspace"}
          </span>
          <span className="landing-workspace-pill">Workspace</span>
        </div>
      </div>

      {/* Centered card */}
      <motion.div
        className="landing-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* Avatar */}
        <motion.div
          className="landing-avatar-wrapper"
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
        >
          <div className="landing-avatar-ring">
            <video src={IdleState} autoPlay
              loop
              muted
              playsInline className="landing-avatar-img" />
          </div>
        </motion.div>

        {/* Text */}
        <motion.div
          className="landing-text"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4 }}
        >
          <h1 className="landing-heading">
            Begin Your First Research Exploration
          </h1>
          <p className="landing-subheading">
            Launch an exploration to simulate customer behaviour - not just stated opinions
          </p>
        </motion.div>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          {!hasWorkspace && canCreateWorkspace ? (
            // Admin with no workspace → create workspace first
            <button
              className="landing-cta-btn"
              onClick={() => setShowWorkspaceModal(true)}
            >
              <TbPlus size={18} />
              <span>Create Workspace</span>
            </button>
          ) : (
            // Normal user or user with workspace → create exploration
            <button
              className="landing-cta-btn"
              onClick={() => setShowCreateExploration(true)}
            >
              <TbPlus size={18} />
              <span>Create Exploration</span>
            </button>
          )}
        </motion.div>
      </motion.div>

      {/* Workspace creation modal */}
      <WorkspacePopup
        isOpen={showWorkspaceModal}
        onClose={() => setShowWorkspaceModal(false)}
        onSuccess={handleWorkspaceCreated}
      />

      {/* Create Exploration modal */}
      {showCreateExploration && (
        <CreateExploration
          workspaceId={workspaceId}
          onClose={() => setShowCreateExploration(false)}
        />
      )}
    </div>
  );
};

export default LandingPage;