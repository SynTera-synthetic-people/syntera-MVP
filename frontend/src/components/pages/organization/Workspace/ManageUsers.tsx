import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  TbArrowLeft,
  TbTrash,
  TbSearch,
  TbDotsVertical,
  TbUserPlus,
  TbEdit,
} from "react-icons/tb";

import { workspaceService } from "../../../../services/workspaceService";
import InviteTeamModal from "./InviteTeamModal";
import { EditUserModal, RemoveUserModal } from "../../settings/SettingModal";  // ← added RemoveUserModal
import type { EditUserData } from "../../settings/SettingModal";
import "./ManageUsersStyle.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  full_name?: string;
  email: string;
  role: string;
  accepted: boolean;
  workspace_name?: string;
  invited_at?: string;
  accepted_at?: string;
}

interface ManageUsersProps {
  workspaceId?: string;
  workspaceName?: string;
  onBack?: () => void;
  /**
   * When true the component is rendered inside the Settings panel.
   * Back button is hidden; heading + Add User button appear on one line.
   */
  isEmbedded?: boolean;
  /**
   * "workspace" (default) — full 7-column table for a specific workspace's members.
   * "team"               — 4-column table (USER NAME | EMAIL ADDRESS | ACTIVE WORKSPACE | ACTIONS)
   *                        for Settings > Team Management, showing ALL org members.
   */
  mode?: "workspace" | "team";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatMemberName = (member: Member): string =>
  member.full_name || member.email;

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

// ── Component ─────────────────────────────────────────────────────────────────

const ManageUsers: React.FC<ManageUsersProps> = ({
  workspaceId: propWorkspaceId,
  workspaceName: propWorkspaceName,
  onBack: propOnBack,
  isEmbedded = false,
  mode = "workspace",
}) => {
  const { id: paramId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const workspaceId = propWorkspaceId || paramId;
  const handleBack = propOnBack || (() => navigate(-1));

  const [members, setMembers]               = useState<Member[]>([]);
  const [loading, setLoading]               = useState(true);
  const [removingId, setRemovingId]         = useState<string | null>(null);
  const [error, setError]                   = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchQuery, setSearchQuery]       = useState("");
  const [openMenuId, setOpenMenuId]         = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editUser, setEditUser]             = useState<EditUserData | null>(null);

  // ── NEW: tracks which member's "Remove" was clicked — drives RemoveUserModal ──
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return members.filter(
      (m) =>
        !q ||
        formatMemberName(m).toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.workspace_name || propWorkspaceName || "").toLowerCase().includes(q)
    );
  }, [members, searchQuery, propWorkspaceName]);

  // ── Data fetching — team mode fetches all org members ────────────────────

  const fetchMembers = async () => {
    setLoading(true);
    setError("");
    try {
      let response: any;
      if (mode === "team") {
        response = workspaceId
          ? await workspaceService.getMembers(workspaceId)
          : await (workspaceService as any).getOrganisationMembers?.() ?? { data: [] };
      } else {
        if (!workspaceId) return;
        response = await workspaceService.getMembers(workspaceId);
      }
      setMembers(response.data || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load members.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMembers(); }, [workspaceId, mode]);

  // Close kebab on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".mu-kebab-wrap")) setOpenMenuId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  /**
   * Called when "Remove" is clicked in the kebab menu.
   * Sets pendingRemoveId → opens RemoveUserModal.
   * Replaces the old window.confirm approach.
   */
  const handleRemoveClick = (memberId: string) => {
    setOpenMenuId(null);           // close kebab first
    setPendingRemoveId(memberId);  // open modal
  };

  /**
   * Called when user confirms inside RemoveUserModal.
   * Performs the actual API call.
   */
  const handleRemoveConfirm = async () => {
    if (!pendingRemoveId) return;
    setRemovingId(pendingRemoveId);
    setError("");
    setSuccessMessage("");
    try {
      await workspaceService.removeMember(workspaceId!, pendingRemoveId);
      setMembers((prev) => prev.filter((m) => m.id !== pendingRemoveId));
      setSuccessMessage("Member removed successfully.");
    } catch (err: any) {
      setError(err?.message || "Failed to remove member.");
    } finally {
      setRemovingId(null);
      setPendingRemoveId(null);
    }
  };

  const handleEditUser = (member: Member) => {
    const nameParts = (member.full_name || "").trim().split(" ");
    setEditUser({
      id:        member.id,
      firstName: nameParts[0] ?? "",
      lastName:  nameParts.slice(1).join(" ") || "",
      email:     member.email,
    });
    setOpenMenuId(null);
  };

  const handleSaveEditUser = async (updated: EditUserData) => {
    // TODO: wire to actual PATCH/PUT API
    await new Promise((r) => setTimeout(r, 600));
    setMembers((prev) =>
      prev.map((m) =>
        m.id === updated.id
          ? {
              ...m,
              full_name: `${updated.firstName} ${updated.lastName}`.trim(),
              email: updated.email,
            }
          : m
      )
    );
    setSuccessMessage("User updated successfully.");
  };

  const toggleMenu = (id: string) =>
    setOpenMenuId(openMenuId === id ? null : id);

  // ── Kebab dropdown ────────────────────────────────────────────────────────

  const renderKebabMenu = (member: Member) => (
    openMenuId === member.id && (
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="mu-kebab-menu"
      >
        <div className="mu-menu-item" onClick={() => handleEditUser(member)}>
          <TbEdit size={14} /> Edit User
        </div>
        <div className="mu-menu-divider" />
        <div
          className="mu-menu-item mu-menu-item--danger"
          onClick={() => handleRemoveClick(member.id)}  // ← was handleRemoveUser(member.id)
        >
          <TbTrash size={14} />
          {removingId === member.id ? "Removing..." : "Remove"}
        </div>
      </motion.div>
    )
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  // Derive the pending member's display name for the modal subtitle
  const pendingMember = members.find((m) => m.id === pendingRemoveId);

  return (
    <>
      <div className={`mu-page ${isEmbedded ? 'mu-page--embedded' : ''}`}>

        <div className="mu-top-bar">
          <div className="mu-top-bar-left">
            {!isEmbedded && (
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="mu-back-btn"
                onClick={handleBack}
              >
                <TbArrowLeft size={14} />
                Back
              </motion.button>
            )}
            <h1 className="mu-title">
              {mode === "team" ? "Team Management" : "Manage Users"}
            </h1>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="mu-add-btn"
            onClick={() => setShowInviteModal(true)}
          >
            <TbUserPlus size={17} />
            Add User
          </motion.button>
        </div>

        {/* Feedback */}
        {successMessage && (
          <p className="mu-feedback mu-feedback--success">{successMessage}</p>
        )}
        {error && !showInviteModal && (
          <p className="mu-feedback mu-feedback--error">{error}</p>
        )}

        {/* Search */}
        <div className="mu-search-wrapper">
          <TbSearch size={15} className="mu-search-icon" />
          <input
            type="text"
            className="mu-search-input"
            placeholder="Search here..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="mu-table-card">
          {loading ? (
            <div className="mu-loading"><div className="mu-spinner" /></div>
          ) : filteredMembers.length === 0 ? (
            <div className="mu-empty-state">
              <h3 className="mu-empty-title">
                {searchQuery ? "No users match your search." : "No users found."}
              </h3>
              <p className="mu-empty-description">
                {searchQuery ? "Try adjusting your search." : "Click 'Add User' to invite someone."}
              </p>
            </div>
          ) : mode === "team" ? (

            /* ── TEAM mode — 4-column layout ── */
            <>
              <div className="mu-table-header mu-table-header--team">
                <div className="mu-hcell">USER NAME</div>
                <div className="mu-hcell">EMAIL ADDRESS</div>
                <div className="mu-hcell">ACTIVE WORKSPACE</div>
                <div className="mu-hcell mu-hcell-actions">ACTIONS</div>
              </div>

              <div className="mu-table-body">
                {filteredMembers.map((member, index) => (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.04 }}
                    className="mu-table-row mu-table-row--team"
                  >
                    <div className="mu-cell mu-cell-name">
                      {formatMemberName(member)}
                    </div>
                    <div className="mu-cell mu-cell-secondary">
                      {member.email}
                    </div>
                    <div className="mu-cell mu-cell-secondary">
                      {member.workspace_name || propWorkspaceName || "—"}
                    </div>
                    <div className="mu-cell mu-cell-actions">
                      <div className="mu-kebab-wrap">
                        <button
                          className="mu-kebab-btn"
                          onClick={() => toggleMenu(member.id)}
                          aria-label="Row actions"
                        >
                          <TbDotsVertical size={17} />
                        </button>
                        {renderKebabMenu(member)}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </>

          ) : (

            /* ── WORKSPACE mode — full 7-column layout ── */
            <>
              <div className="mu-table-header">
                <div className="mu-hcell">USER NAME</div>
                <div className="mu-hcell">WORKSPACE NAME</div>
                <div className="mu-hcell">EMAIL</div>
                <div className="mu-hcell">INVITED ON</div>
                <div className="mu-hcell">STATUS</div>
                <div className="mu-hcell">ACCEPTED ON</div>
                <div className="mu-hcell mu-hcell-actions">ACTIONS</div>
              </div>

              <div className="mu-table-body">
                {filteredMembers.map((member, index) => (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.04 }}
                    className="mu-table-row"
                  >
                    <div className="mu-cell mu-cell-name">{formatMemberName(member)}</div>
                    <div className="mu-cell mu-cell-secondary">
                      {member.workspace_name || propWorkspaceName || "—"}
                    </div>
                    <div className="mu-cell mu-cell-secondary">{member.email}</div>
                    <div className="mu-cell mu-cell-secondary">{formatDate(member.invited_at)}</div>
                    <div className="mu-cell">
                      <span className={`mu-status-badge ${
                        member.accepted ? "mu-status-badge--accepted" : "mu-status-badge--pending"
                      }`}>
                        {member.accepted ? "Accepted" : "Pending"}
                      </span>
                    </div>
                    <div className="mu-cell mu-cell-secondary">
                      {member.accepted ? formatDate(member.accepted_at) : "—"}
                    </div>
                    <div className="mu-cell mu-cell-actions">
                      <div className="mu-kebab-wrap">
                        <button
                          className="mu-kebab-btn"
                          onClick={() => toggleMenu(member.id)}
                          aria-label="Row actions"
                        >
                          <TbDotsVertical size={17} />
                        </button>
                        {renderKebabMenu(member)}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Invite modal */}
        <InviteTeamModal
          isOpen={showInviteModal}
          workspaceId={workspaceId}
          workspaceName={propWorkspaceName || "this workspace"}
          onSkip={() => setShowInviteModal(false)}
          onLaunch={() => {
            setShowInviteModal(false);
            fetchMembers();
            setSuccessMessage("Invitations sent successfully.");
          }}
        />

        {/* Edit user modal */}
        <EditUserModal
          isOpen={editUser !== null}
          onClose={() => setEditUser(null)}
          user={editUser}
          onSave={handleSaveEditUser}
        />
      </div>

      {/*
        Remove user confirmation modal — rendered OUTSIDE mu-page so it
        sits at the top of the stacking context and is never clipped.
        Opens when pendingRemoveId is set; closes on cancel or after confirm.
      */}
      <RemoveUserModal
        isOpen={pendingRemoveId !== null}
        onClose={() => setPendingRemoveId(null)}
        {...(pendingMember
          ? { userName: pendingMember.full_name || pendingMember.email }
          : {})}
        onConfirm={handleRemoveConfirm}
      />
    </>
  );
};

export default ManageUsers;