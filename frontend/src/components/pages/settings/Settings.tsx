import React, { useState, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  TbChevronDown,
  TbBuilding,
  TbBriefcase,
  TbUsers,
  TbCreditCard,
  TbSettings,
  TbBell,
  TbUser,
  TbHelp,
  TbLogout,
  TbArrowLeft,
  TbDeviceFloppy,
  TbTool,
  TbBook,
  TbFileText,
  TbRocket,
} from 'react-icons/tb';

import Billing from './billing/Billing';
import Notifications from './notifications/Notifications';
import Account from './account/Account';
import Security from './security/Security';
import Privacy from './privacy/Privacy';

import { useWorkspace as useWorkspaceContext } from '../../../context/WorkspaceContext';
import ManageUsers from '../organization/Workspace/ManageUsers';
import Workspace from '../organization/Workspace/Workspace';
import UpgradePlanPage from '../Upgrade/Upgrade';
import HelpCentre from './help/HelpCenter';
import UsageManual from './help/UsageManual';
import TermsAndPolicies from './help/TermsAndPolicies';

import { useAutoSave } from '../../../hooks/useAutoSave';
import type { SaveStatus } from '../../../hooks/useAutoSave';
import './SettingStyles.css';

// ══════════════════════════════════════════════════════════════════════════════
// Auto-save context
// ══════════════════════════════════════════════════════════════════════════════

interface AutoSaveCtx {
  recordSave: () => void;
  triggerSave: (fn: () => Promise<void>) => Promise<void>;
  status: SaveStatus;
}

export const AutoSaveContext = createContext<AutoSaveCtx>({
  recordSave: () => {},
  triggerSave: async () => {},
  status: 'idle',
});

export const useAutoSaveContext = () => useContext(AutoSaveContext);

// ── Types ─────────────────────────────────────────────────────────────────────

// Admin views
type AdminView =
  | 'org-workspace'
  | 'org-team'
  | 'billing'
  | 'settings-notification'
  | 'settings-profile'
  | 'settings-security'
  | 'settings-privacy'
  | 'help-centre'
  | 'help-manual'
  | 'help-terms';

// Non-admin views (explorer / free trial)
type NonAdminView =
  | 'upgrade'
  | 'billing'
  | 'settings-notification'
  | 'settings-profile'
  | 'settings-security'
  | 'settings-privacy'
  | 'help-centre'
  | 'help-manual'
  | 'help-terms';

type ActiveView = AdminView | NonAdminView;

interface OpenGroups {
  org: boolean;
  settings: boolean;
  help: boolean;
}

interface RootState {
  auth: {
    user: {
      is_admin?: boolean;
      role?: string;
    } | null;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const isAdminUser = (user: RootState['auth']['user']): boolean => {
  if (!user) return false;
  if (user.is_admin !== undefined) return Boolean(user.is_admin);
  if (user.role) return user.role.toLowerCase().includes('admin');
  return false;
};

// Views that show the auto-save badge
const AUTOSAVE_VIEWS: ActiveView[] = [
  'settings-notification',
  'settings-profile',
  'settings-security',
  'settings-privacy',
];

// Views where component renders its own heading+button row
const SELF_HEADING_VIEWS: ActiveView[] = ['org-workspace', 'org-team', 'upgrade'];

// Content headings for all other views
const HEADING: Record<string, string> = {
  'org-workspace':         'Workspace Management',
  'org-team':              'Team Management',
  'upgrade':               'Upgrade Plan to Continue Explorations',
  'billing':               'Billing',
  'settings-notification': 'Settings > Notification',
  'settings-profile':      'Settings > Profile',
  'settings-security':     'Settings > Security',
  'settings-privacy':      'Settings > Privacy',
  'help-centre':           'Settings > Help Centre',
  'help-manual':           'Settings > Usage Manual',
  'help-terms':            'Settings > Terms & Policies',
};

// ══════════════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════════════

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { selectedWorkspace } = useWorkspaceContext();
  const { user } = useSelector((state: RootState) => state.auth);

  const isAdmin = isAdminUser(user);

  // Default view differs by role
  const [activeView, setActiveView] = useState<ActiveView>(
    isAdmin ? 'org-workspace' : 'upgrade'
  );
  const [open, setOpen] = useState<OpenGroups>({
    org: true,
    settings: false,
    help: false,
  });

  const { lastSavedLabel, status, triggerSave, recordSave } = useAutoSave();
  const showAutosave = AUTOSAVE_VIEWS.includes(activeView);

  const toggleGroup = (g: keyof OpenGroups) =>
    setOpen((prev) => ({ ...prev, [g]: !prev[g] }));

  const goTo = (view: ActiveView) => setActiveView(view);

  // ── Content renderer ──────────────────────────────────────────────────────

  const renderContent = (): React.ReactNode => {
    switch (activeView) {
      // ── Admin-only views ─────────────────────────────────────────────────
      case 'org-workspace':
        return <Workspace embedded />;
      case 'org-team':
        return (
          <ManageUsers
            workspaceId={selectedWorkspace?.id}
            workspaceName={selectedWorkspace?.name || (selectedWorkspace as any)?.title}
            onBack={() => goTo('org-workspace')}
            isEmbedded
            mode="team"
          />
        );

      // ── Non-admin only ────────────────────────────────────────────────────
      case 'upgrade':
        return <UpgradePlanPage />;

      // ── Shared views ──────────────────────────────────────────────────────
      case 'billing':               return <Billing />;
      case 'settings-notification': return <Notifications />;
      case 'settings-profile':      return <Account />;
      case 'settings-security':     return <Security />;
      case 'settings-privacy':      return <Privacy />;
      case 'help-centre':           return <HelpCentre />;
      case 'help-manual':           return <UsageManual />;
      case 'help-terms':            return <TermsAndPolicies />;
      default:                      return null;
    }
  };

  // ── Sidebar nav ───────────────────────────────────────────────────────────

  const renderNav = () => (
    <nav className="acc-nav">

      {/* ── ADMIN: Organisation Control ── */}
      {isAdmin && (
        <div className="acc-nav-group">
          <button
            className={`acc-nav-item ${open.org ? 'acc-nav-item--open' : ''}`}
            onClick={() => toggleGroup('org')}
          >
            <span className="acc-nav-item-left">
              <TbBuilding size={17} /> Organisation Control
            </span>
            <TbChevronDown
              size={13}
              className={`acc-nav-chevron ${open.org ? 'acc-nav-chevron--open' : ''}`}
            />
          </button>
          {open.org && (
            <div className="acc-nav-children">
              <button
                className={`acc-nav-child ${activeView === 'org-workspace' ? 'acc-nav-child--active' : ''}`}
                onClick={() => goTo('org-workspace')}
              >
                <TbBriefcase size={14} /> Workspace
              </button>
              <button
                className={`acc-nav-child ${activeView === 'org-team' ? 'acc-nav-child--active' : ''}`}
                onClick={() => goTo('org-team')}
              >
                <TbUsers size={14} /> Team Management
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── NON-ADMIN: Upgrade Plan ── */}
      {!isAdmin && (
        <button
          className={`acc-nav-flat ${activeView === 'upgrade' ? 'acc-nav-flat--active' : ''}`}
          onClick={() => goTo('upgrade')}
        >
          <TbRocket size={17} /> Upgrade Plan
        </button>
      )}

      {/* ── Billing (both) ── */}
      <button
        className={`acc-nav-flat ${activeView === 'billing' ? 'acc-nav-flat--active' : ''}`}
        onClick={() => goTo('billing')}
      >
        <TbCreditCard size={17} /> Billing
      </button>

      {/* ── Settings (both) ── */}
      <div className="acc-nav-group">
        <button
          className={`acc-nav-item ${open.settings ? 'acc-nav-item--open' : ''}`}
          onClick={() => toggleGroup('settings')}
        >
          <span className="acc-nav-item-left">
            <TbSettings size={17} /> Settings
          </span>
          <TbChevronDown
            size={13}
            className={`acc-nav-chevron ${open.settings ? 'acc-nav-chevron--open' : ''}`}
          />
        </button>
        {open.settings && (
          <div className="acc-nav-children">
            <button
              className={`acc-nav-child ${activeView === 'settings-notification' ? 'acc-nav-child--active' : ''}`}
              onClick={() => goTo('settings-notification')}
            >
              <TbBell size={14} /> Notification
            </button>
            <button
              className={`acc-nav-child ${activeView === 'settings-profile' ? 'acc-nav-child--active' : ''}`}
              onClick={() => goTo('settings-profile')}
            >
              <TbUser size={14} /> Profile
            </button>
          </div>
        )}
      </div>

      {/* ── Help (both) ── */}
      <div className="acc-nav-group">
        <button
          className={`acc-nav-item ${open.help ? 'acc-nav-item--open' : ''}`}
          onClick={() => toggleGroup('help')}
        >
          <span className="acc-nav-item-left">
            <TbHelp size={17} /> Help
          </span>
          <TbChevronDown
            size={13}
            className={`acc-nav-chevron ${open.help ? 'acc-nav-chevron--open' : ''}`}
          />
        </button>
        {open.help && (
          <div className="acc-nav-children">
            <button
              className={`acc-nav-child ${activeView === 'help-centre' ? 'acc-nav-child--active' : ''}`}
              onClick={() => goTo('help-centre')}
            >
              <TbTool size={14} /> Help Centre
            </button>
            <button
              className={`acc-nav-child ${activeView === 'help-manual' ? 'acc-nav-child--active' : ''}`}
              onClick={() => goTo('help-manual')}
            >
              <TbBook size={14} /> Usage Manuel
            </button>
            <button
              className={`acc-nav-child ${activeView === 'help-terms' ? 'acc-nav-child--active' : ''}`}
              onClick={() => goTo('help-terms')}
            >
              <TbFileText size={14} /> Terms &amp; Policies
            </button>
          </div>
        )}
      </div>

      <div className="acc-nav-divider" />

      {/* ── Logout (both) ── */}
      <button className="acc-nav-flat" onClick={() => navigate('/login')}>
        <TbLogout size={17} /> Logout
      </button>
    </nav>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AutoSaveContext.Provider value={{ recordSave, triggerSave, status }}>
      <div className="acc-shell">

        {/* Top bar */}
        <div className="acc-topbar">
          <button className="acc-back-btn" onClick={() => navigate(-1)}>
            <TbArrowLeft size={14} /> Back
          </button>

          {showAutosave && (
            <div className={`acc-autosave acc-autosave--${status}`}>
              <TbDeviceFloppy size={14} />
              {status === 'saving'
                ? 'Saving…'
                : status === 'error'
                  ? 'Save failed'
                  : lastSavedLabel
                    ? `Auto saved: ${lastSavedLabel}`
                    : 'Not saved yet'}
            </div>
          )}
        </div>

        {/* Page title */}
        <h1 className="acc-page-title">Account</h1>

        {/* Body */}
        <div className="acc-body">

          {renderNav()}

          {/* Content area */}
          <div className="acc-content">
            {/*
              Components that render their own heading+button row
              (org-workspace, org-team, upgrade) suppress the standalone heading
              to avoid duplication and layout gaps.
            */}
            {!SELF_HEADING_VIEWS.includes(activeView) && (
              <h2 className="acc-content-heading">
                {HEADING[activeView]}
              </h2>
            )}
            {renderContent()}
          </div>
        </div>
      </div>
    </AutoSaveContext.Provider>
  );
};

export default Settings;