import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom';
import { TbEdit, TbUsers, TbDotsVertical, TbTrash } from 'react-icons/tb';
import TabNavigation from '../../common/TabNavigation'
import Billing from './billing/Billing';
import Account from './account/Account';
import Notifications from './notifications/Notifications';
import Security from './security/Security';
import Privacy from './privacy/Privacy';
import { useWorkspaces, useDeleteWorkspace } from '../../../hooks/useWorkspaces';
import { useWorkspace as useWorkspaceContext } from '../../../context/WorkspaceContext';
import WorkspaceEditor from '../organization/Workspace/WorkspaceEditor';
import ManageUsers from '../organization/Workspace/ManageUsers';

const Settings = () => {
  const [activeSection, setActiveSection] = useState('settings');
  const [activeTab, setActiveTab] = useState('account');
  const { selectedWorkspace, setSelectedWorkspace } = useWorkspaceContext();
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const [workspaceActionMode, setWorkspaceActionMode] = useState('view');
  const [activeMenuId, setActiveMenuId] = useState(null);

  const { data: workspaces = [], isLoading, error, refetch } = useWorkspaces();
  const deleteMutation = useDeleteWorkspace();

  const tabs = [
    { id: 'account', label: 'Account' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'privacy', label: 'Privacy' },
    { id: 'security', label: 'Security' },
    { id: 'billing', label: 'Billing' },
  ];

  const handleWorkspaceSelect = (workspace) => {
    setSelectedWorkspace(workspace);
    setActiveSection('workspace');
    setWorkspaceActionMode('view');
    setWorkspaceDropdownOpen(false);
  };

  const handleWorkspaceEdit = (workspace, e) => {
    e.stopPropagation();
    setSelectedWorkspace(workspace);
    setActiveSection('workspace');
    setWorkspaceActionMode('edit');
    setWorkspaceDropdownOpen(false);
  };

  const handleWorkspaceManageUsers = (workspace, e) => {
    e.stopPropagation();
    setSelectedWorkspace(workspace);
    setActiveSection('workspace');
    setWorkspaceActionMode('manage');
    setWorkspaceDropdownOpen(false);
  };

  const handleSettingsClick = () => {
    setActiveSection('settings');
    setSelectedWorkspace(null);
    setWorkspaceActionMode('view');
    setWorkspaceDropdownOpen(false);
  };

  const toggleWorkspaceDropdown = () => {
    setWorkspaceDropdownOpen(!workspaceDropdownOpen);
  };

  return (
    <div className='flex min-h-screen relative overflow-x-hidden'>
      {/* Fixed Background Layer */}
      <div className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-blue-50/30 to-blue-100/20 dark:from-[#0a0e1a] dark:via-[#0f1419] dark:to-[#1a1f2e]" />
        <div className="absolute top-[-10%] left-[-5%] w-[50%] h-[50%] bg-gradient-to-br from-blue-400/30 to-blue-600/20 dark:from-blue-500/40 dark:to-blue-700/30 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-gradient-to-tl from-blue-300/25 to-cyan-500/15 dark:from-blue-400/35 dark:to-cyan-600/25 rounded-full blur-[100px]" />
      </div>

      {/* Sidebar */}
      <div className='w-64 bg-white/70 dark:bg-gray-800/80 backdrop-blur-xl border-r border-gray-200 dark:border-white/10 p-4 relative z-10'>
        <h2 className='text-lg font-semibold text-gray-800 dark:text-gray-200 mb-6'>Settings</h2>

        <div className='space-y-4'>
          {/* Settings Section */}
          <div>
            <button
              onClick={handleSettingsClick}
              className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${activeSection === 'settings'
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                : 'hover:bg-gray-100/50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300'
                }`}
            >
              <div className='flex items-center gap-2'>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className='font-medium'>Profile</span>
              </div>
              {activeSection === 'settings' && (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </div>

          {/* Org Users Section
          <div>
            <button
              onClick={() => {
                setActiveSection('users');
                setSelectedWorkspace(null);
                setWorkspaceActionMode('view');
                setWorkspaceDropdownOpen(false);
              }}
              className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${activeSection === 'users'
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                : 'hover:bg-gray-100/50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300'
                }`}
            >
              <div className='flex items-center gap-2'>
                <TbUsers size={20} />
                <span className='font-medium'>Users</span>
              </div>
              {activeSection === 'users' && (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </div> */}

          {/* Workspaces Dropdown Section */}
          <div>
            <button
              onClick={toggleWorkspaceDropdown}
              className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${activeSection === 'workspace'
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                : 'hover:bg-gray-100/50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300'
                }`}
            >
              <div className='flex items-center gap-2'>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className='font-medium'>Workspaces</span>
              </div>
              <svg
                className={`w-4 h-4 transform transition-transform ${workspaceDropdownOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown Content */}
            {workspaceDropdownOpen && (
              <div className="mt-1 ml-4 pl-3 border-l border-gray-300 dark:border-gray-600">
                <div className='space-y-1 py-1'>
                  {isLoading ? (
                    <div className="p-2 text-sm text-center text-gray-500 dark:text-gray-400">
                      Loading workspaces...
                    </div>
                  ) : error ? (
                    <div className="p-2 text-sm text-center text-red-500 dark:text-red-400">
                      Error loading workspaces
                    </div>
                  ) : workspaces.length === 0 ? (
                    <div className="p-2 text-sm text-center text-gray-500 dark:text-gray-400">
                      No workspaces found
                    </div>
                  ) : (
                    workspaces.map((workspace) => (
                      <div
                        key={workspace.id}
                        className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors group ${activeSection === 'workspace' && selectedWorkspace?.id === workspace.id
                          ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                          : 'hover:bg-gray-100/50 dark:hover:bg-white/5 text-gray-700 dark:text-gray-300'
                          }`}
                      >
                        <button
                          onClick={() => handleWorkspaceSelect(workspace)}
                          className='flex items-center gap-3 flex-1 text-left'
                        >
                          {workspace.icon && (
                            <span className="text-sm">{workspace.icon}</span>
                          )}
                          <div className="flex flex-col truncate">
                            <span className='text-sm truncate'>{workspace.name || workspace.title || "Untitled Workspace"}</span>
                            {workspace.department_name && (
                              <span className="text-[10px] text-blue-500 font-bold uppercase tracking-tight truncate">
                                {workspace.department_name}
                              </span>
                            )}
                          </div>
                        </button>

                        {/* Three-dot Menu */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === workspace.id ? null : workspace.id);
                            }}
                            className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors"
                            title="Actions"
                          >
                            <TbDotsVertical size={18} />
                          </button>

                          {/* Dropdown Menu */}
                          {activeMenuId === workspace.id && (
                            <>
                              <div
                                className="fixed inset-0 z-20"
                                onClick={() => setActiveMenuId(null)}
                              />
                              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 rounded-xl shadow-2xl z-30 py-2 backdrop-blur-xl animate-in fade-in zoom-in duration-200">
                                <button
                                  onClick={(e) => {
                                    handleWorkspaceEdit(workspace, e);
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                  <TbEdit size={16} />
                                  <span>Edit Workspace</span>
                                </button>
                                <button
                                  onClick={(e) => {
                                    handleWorkspaceManageUsers(workspace, e);
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-green-500/10 hover:text-green-600 dark:hover:text-green-400 transition-colors"
                                >
                                  <TbUsers size={16} />
                                  <span>Manage Users</span>
                                </button>
                                <div className="h-px bg-gray-200 dark:bg-white/10 my-1" />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Are you sure you want to delete "${workspace.name}"?`)) {
                                      deleteMutation.mutate(workspace.id, {
                                        onSuccess: () => {
                                          setActiveMenuId(null);
                                        }
                                      });
                                    }
                                  }}
                                  disabled={deleteMutation.isLoading}
                                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                                >
                                  {deleteMutation.isLoading ? (
                                    <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <TbTrash size={16} />
                                  )}
                                  <span>{deleteMutation.isLoading ? 'Deleting...' : 'Delete Workspace'}</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className='flex-1 p-6 relative z-10'>
        {activeSection === 'settings' ? (
          <>
            <div className='flex flex-col gap-2 mb-6'>
              <h1 className='text-2xl font-bold'>Profile</h1>
              <p className='text-gray-500 dark:text-gray-400'>
                Manage your account settings and preferences here.
              </p>
            </div>

            <div className='relative max-w-full'>
              <TabNavigation
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            </div>

            <div className='mt-6'>
              {activeTab === 'billing' && <Billing />}
              {activeTab === 'account' && <Account />}
              {activeTab === 'notifications' && <Notifications />}
              {activeTab === 'security' && <Security />}
              {activeTab === 'privacy' && <Privacy />}
            </div>
          </>
        ) : activeSection === 'users' ? (
          <ManageUsers onBack={handleSettingsClick} />
        ) : (
          <>
            {workspaceActionMode === 'edit' ? (
              <WorkspaceEditor
                workspace={selectedWorkspace}
                onBack={handleSettingsClick}
              />
            ) : workspaceActionMode === 'manage' ? (
              <ManageUsers
                workspaceId={selectedWorkspace?.id}
                onBack={handleSettingsClick}
              />
            ) : (
              <WorkspaceEditor
                workspace={selectedWorkspace}
                onBack={handleSettingsClick}
              />
            )}
          </>
        )}
      </div>
    </div>

  )
}

export default Settings