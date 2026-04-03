import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  TbPlus,
  TbEdit,
  TbTrash,
  TbUsers,
  TbSearch,
  TbDotsVertical,
} from 'react-icons/tb';

import { useWorkspaces, useDeleteWorkspace, useWorkspace } from '../../../../hooks/useWorkspaces';
import WorkspacePopup from './WorkspacePopup';
import { ManageUsersModal } from '../../settings/SettingModal';
import './WorkspaceStyle.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkspaceUser {
  id: string;
  full_name?: string;
  email?: string;
  [key: string]: unknown;
}

interface WorkspaceItem {
  id: string;
  name?: string;
  title?: string;
  icon?: string;
  department_name?: string;
  description?: string;
  created_at?: string;
  users?: WorkspaceUser[];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface WorkspaceProps {
  /**
   * When true the component is embedded inside the Settings panel.
   * In this mode "Manage Users" opens a modal instead of navigating away,
   * keeping the user inside the Settings flow.
   */
  embedded?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const getWorkspaceName = (ws: WorkspaceItem): string =>
  ws.name || ws.title || 'Untitled Workspace';

const getAvatarSeeds = (ws: WorkspaceItem): string[] => {
  if (ws.users && ws.users.length > 0) {
    return ws.users.slice(0, 2).map((u) =>
      (u.full_name?.[0] ?? u.email?.[0] ?? '?').toUpperCase()
    );
  }
  const words = getWorkspaceName(ws).split(' ').filter(Boolean);
  return words.slice(0, 2).map((w) => (w[0] ?? '?').toUpperCase());
};

const getExtraCount = (ws: WorkspaceItem): number =>
  Math.max(0, (ws.users?.length ?? 0) - 2);

// ── Component ─────────────────────────────────────────────────────────────────

const Workspace: React.FC<WorkspaceProps> = ({ embedded = false }) => {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data: currentWorkspace, refetch: refetchWorkspace } = useWorkspace(workspaceId);

  const {
    data: rawData,
    isLoading,
    error,
    refetch,
  } = useWorkspaces();

  const workspaces: WorkspaceItem[] = (rawData as WorkspaceItem[] | undefined) ?? [];
  const deleteMutation = useDeleteWorkspace();

  // ── Local UI state ────────────────────────────────────────────────────────
  const [search, setSearch]         = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editWorkspaceId, setEditWorkspaceId] = useState<string | null>(null);

  // Modal state — only used when embedded === true
  const [manageUsersWs, setManageUsersWs] = useState<WorkspaceItem | null>(null);

  // Close kebab menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.ws-kebab-wrap')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Derived list ──────────────────────────────────────────────────────────

  const sorted = [...workspaces].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });

  const filtered = sorted.filter((ws) => {
    const q = search.toLowerCase();
    return (
      !q ||
      getWorkspaceName(ws).toLowerCase().includes(q) ||
      (ws.department_name || '').toLowerCase().includes(q) ||
      (ws.description || '').toLowerCase().includes(q)
    );
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleEdit = (ws: WorkspaceItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    // Always use popup regardless of embedded
    setEditWorkspaceId(ws.id);
  };

  const handleManageUsers = (ws: WorkspaceItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    if (embedded) {
      // Settings context → open modal, stay in settings
      setManageUsersWs(ws);
    } else {
      // Standalone page → navigate as before
      navigate(`/main/organization/workspace/manage/${ws.id}`);
    }
  };

  const handleDelete = (ws: WorkspaceItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    if (window.confirm(`Are you sure you want to delete "${getWorkspaceName(ws)}"?`)) {
      deleteMutation.mutate(ws.id as any, {
        onSuccess: () => refetch(),
      });
    }
  };

  const handleCreate = () => {
    navigate('/main/organization/workspace');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="ws-page">

      {/* ── Section header ── */}
      <div className="ws-header">
        <h2 className="ws-title">Workspace Management</h2>
        <button className="ws-create-btn" onClick={handleCreate}>
          <TbPlus size={15} />
          Create Workspace
        </button>
      </div>

      {/* ── Search ── */}
      <div className="ws-search-wrap">
        <TbSearch size={14} className="ws-search-icon" />
        <input
          type="text"
          className="ws-search-input"
          placeholder="Search here..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── Table card ── */}
      <div className="ws-table-card">

        {isLoading && (
          <div className="ws-loading"><div className="ws-spinner" /></div>
        )}

        {!isLoading && error && (
          <div className="ws-error">
            Failed to load workspaces.{' '}
            <button className="ws-retry-btn" onClick={() => refetch()}>Retry</button>
          </div>
        )}

        {!isLoading && !error && (
          <>
            <div className="ws-table-header">
              <div className="ws-hcell">WORKSPACE NAME</div>
              <div className="ws-hcell">DEPARTMENT</div>
              <div className="ws-hcell">DESCRIPTION</div>
              <div className="ws-hcell">ACTIVE USERS</div>
              <div className="ws-hcell ws-hcell--right">ACTIONS</div>
            </div>

            <div className="ws-table-body">
              {filtered.length === 0 ? (
                <div className="ws-empty">
                  {search
                    ? 'No workspaces match your search.'
                    : 'No workspaces yet. Click "Create Workspace" to get started.'}
                </div>
              ) : (
                filtered.map((ws) => {
                  const avatars = getAvatarSeeds(ws);
                  const extra   = getExtraCount(ws);

                  return (
                    <div key={ws.id} className="ws-table-row">

                      <div className="ws-cell ws-cell--name">
                        {ws.icon && <span className="ws-icon">{ws.icon}</span>}
                        {getWorkspaceName(ws)}
                      </div>

                      <div className="ws-cell ws-cell--muted">
                        {ws.department_name || '—'}
                      </div>

                      <div className="ws-cell ws-cell--muted ws-cell--clamp">
                        {ws.description || '—'}
                      </div>

                      <div className="ws-cell">
                        <div className="ws-avatars">
                          {avatars.map((letter, i) => (
                            <span key={i} className="ws-avatar">{letter}</span>
                          ))}
                          {extra > 0 && (
                            <span className="ws-avatar-more">+{extra}</span>
                          )}
                        </div>
                      </div>

                      <div className="ws-cell ws-cell--actions">
                        <div className="ws-kebab-wrap">
                          <button
                            className="ws-kebab-btn"
                            onClick={() =>
                              setOpenMenuId(openMenuId === ws.id ? null : ws.id)
                            }
                            aria-label="Workspace actions"
                          >
                            <TbDotsVertical size={17} />
                          </button>

                          {openMenuId === ws.id && (
                            <div className="ws-kebab-menu">
                              <div
                                className="ws-menu-item"
                                onClick={() => {
                                  setEditWorkspaceId(ws.id);
                                  setOpenMenuId(null);
                                }}
                              >
                                <TbEdit size={14} /> Edit Workspace
                              </div>
                              <div
                                className="ws-menu-item"
                                onClick={(e) => handleManageUsers(ws, e)}
                              >
                                <TbUsers size={14} /> Manage Users
                              </div>
                              <div className="ws-menu-divider" />
                              <div
                                className={`ws-menu-item ws-menu-item--danger ${
                                  (deleteMutation as any).isPending ? 'ws-menu-item--disabled' : ''
                                }`}
                                onClick={(e) => {
                                  if (!(deleteMutation as any).isPending) handleDelete(ws, e);
                                }}
                              >
                                {(deleteMutation as any).isPending ? (
                                  <div className="ws-mini-spinner" />
                                ) : (
                                  <TbTrash size={14} />
                                )}
                                {(deleteMutation as any).isPending ? 'Deleting…' : 'Delete Workspace'}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Edit workspace popup (both contexts) */}
      {editWorkspaceId && (
        <WorkspacePopup
          isOpen={true}
          workspaceId={editWorkspaceId}
          onClose={() => setEditWorkspaceId(null)}
          onSuccess={() => {
            setEditWorkspaceId(null);
            refetch();
          }}
        />
      )}

      {/* Manage Users modal — Settings/embedded context only */}
      {embedded && manageUsersWs && (
        <ManageUsersModal
          isOpen={true}
          onClose={() => setManageUsersWs(null)}
          workspaceId={manageUsersWs.id}
          workspaceName={manageUsersWs.name || manageUsersWs.title || 'Untitled Workspace'}
        />
      )}
    </div>
  );
};

export default Workspace;