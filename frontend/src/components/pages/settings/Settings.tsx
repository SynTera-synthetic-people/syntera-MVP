import React, { useState, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import SpIcon from '../../SPIcon';

import Billing from './billing/Billing';
import type { BillingView } from './billing/Billing';
import Notifications from './notifications/Notifications';
import Account from './account/Account';
import Privacy from './privacy/Privacy';
import ChangePassword from './ChangePassword/ChangePassword';

import { useWorkspace as useWorkspaceContext } from '../../../context/WorkspaceContext';
import ManageUsers from '../organization/Workspace/ManageUsers';
import Workspace from '../organization/Workspace/Workspace';
import UpgradePlanPage from '../Upgrade/Upgrade';
import HelpCentre from './help/HelpCenter';
import UsageManual from './help/UsageManual';
import TermsAndPolicies from './help/TermsAndPolicies';
import { LogoutModal, SubmitQueryModal } from './SettingModal';
import { logout } from '../../../redux/slices/authSlice';

import { useAutoSave } from '../../../hooks/useAutoSave';
import type { SaveStatus } from '../../../hooks/useAutoSave';
import './SettingStyles.css';

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

type ActiveView =
  | 'org-workspace'
  | 'org-team'
  | 'billing'
  | 'invoice'
  | 'settings-notification'
  | 'settings-profile'
  | 'settings-security'
  | 'settings-privacy'
  | 'settings-change-password'
  | 'help-centre'
  | 'help-manual'
  | 'help-terms'
  | 'upgrade';

interface OpenGroups {
  org: boolean;
  billing: boolean;
  settings: boolean;
  help: boolean;
}

interface RootState {
  auth: {
    user: {
      is_admin?: boolean;
      role?: string;
      account_tier?: string;
      is_trial?: boolean;
      email?: string;
    } | null;
  };
}

const isAdminUser = (user: RootState['auth']['user']): boolean => {
  if (!user) return false;
  if (user.is_admin !== undefined) return Boolean(user.is_admin);
  if (user.role) return user.role.toLowerCase().includes('admin');
  return false;
};

const showUpgradeTab = (user: RootState['auth']['user'], isAdmin: boolean): boolean => {
  if (isAdmin) return false;
  if (!user) return false;
  const tier = user.account_tier ?? '';
  const isTrial = user.is_trial === true && tier === 'free';
  const isExplorer = tier === 'tier1';
  return isTrial || isExplorer;
};

const AUTOSAVE_VIEWS: ActiveView[] = [
  'settings-notification',
  'settings-profile',
  'settings-security',
  'settings-privacy',
];

const SELF_HEADING_VIEWS: ActiveView[] = ['org-workspace', 'org-team', 'upgrade', 'billing', 'invoice'];

const HEADING: Record<string, string> = {
  'org-workspace':            'Workspace Management',
  'org-team':                 'Team Management',
  'upgrade':                  'Upgrade Plan to Continue Explorations',
  'billing':                  'Billing',
  'invoice':                  'Invoices',
  'settings-notification':    'Settings > Notification',
  'settings-profile':         'Settings > Profile',
  'settings-security':        'Settings > Security',
  'settings-privacy':         'Settings > Privacy',
  'settings-change-password': 'Settings > Change Password',
  'help-centre':              'Settings > Help Centre',
  'help-manual':              'Settings > Usage Manual',
  'help-terms':               'Settings > Terms & Policies',
};

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { selectedWorkspace } = useWorkspaceContext();
  const { user } = useSelector((state: RootState) => state.auth);

  const isAdmin    = isAdminUser(user);
  const canUpgrade = showUpgradeTab(user, isAdmin);

  const defaultView: ActiveView = isAdmin
    ? 'org-workspace'
    : canUpgrade
    ? 'upgrade'
    : 'billing';

  const [activeView, setActiveView] = useState<ActiveView>(defaultView);
  const [open, setOpen] = useState<OpenGroups>({
    org: true,
    billing: false,
    settings: false,
    help: false,
  });
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showSubmitQuery, setShowSubmitQuery] = useState(false);

  const { lastSavedLabel, status, triggerSave, recordSave } = useAutoSave();
  const showAutosave = AUTOSAVE_VIEWS.includes(activeView);

  const toggleGroup = (g: keyof OpenGroups) =>
    setOpen((prev) => ({ ...prev, [g]: !prev[g] }));

  const goTo = (view: ActiveView) => setActiveView(view);

  const renderContent = (): React.ReactNode => {
    switch (activeView) {
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
      case 'upgrade':
        return canUpgrade ? <UpgradePlanPage /> : null;
      case 'billing':
        return <Billing view="billing" />;
      case 'invoice':
        return <Billing view="invoice" />;
      case 'settings-notification':      return <Notifications />;
      case 'settings-profile':           return <Account />;
      case 'settings-privacy':           return <Privacy />;
      case 'settings-change-password':   return <ChangePassword />;
      case 'help-centre':                return <HelpCentre />;
      case 'help-manual':                return <UsageManual />;
      case 'help-terms':                 return <TermsAndPolicies />;
      default:                           return null;
    }
  };

  const isBillingView = activeView === 'billing' || activeView === 'invoice';

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
              <SpIcon name="sp-Navigation-Building_04" /> Organisation Control
            </span>
            <SpIcon name="sp-Arrow-Chevron_Down"
              className={`acc-nav-chevron ${open.org ? 'acc-nav-chevron--open' : ''}`}
            />
          </button>
          {open.org && (
            <div className="acc-nav-children">
              <button
                className={`acc-nav-child ${activeView === 'org-workspace' ? 'acc-nav-child--active' : ''}`}
                onClick={() => goTo('org-workspace')}
              >
                <SpIcon name="sp-Navigation-Building_04" /> Workspace
              </button>
              <button
                className={`acc-nav-child ${activeView === 'org-team' ? 'acc-nav-child--active' : ''}`}
                onClick={() => goTo('org-team')}
              >
                <SpIcon name="sp-User-Users" /> Team Management
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Upgrade Plan ── */}
      {canUpgrade && (
        <button
          className={`acc-nav-flat ${activeView === 'upgrade' ? 'acc-nav-flat--active' : ''}`}
          onClick={() => goTo('upgrade')}
        >
          <SpIcon name="sp-Arrow-Arrow_Circle_Up" /> Upgrade Plan
        </button>
      )}

      {/* ── Billing ── */}
      <div className="acc-nav-group">
        <button
          className={`acc-nav-item ${isBillingView || open.billing ? 'acc-nav-item--open' : ''}`}
          onClick={() => {
            toggleGroup('billing');
            goTo('billing');
          }}
        >
          <span className="acc-nav-item-left">
            <SpIcon name="sp-Interface-Credit_Card_01" /> Billing
          </span>
          <SpIcon
            name="sp-Arrow-Chevron_Down"
            className={`acc-nav-chevron ${open.billing ? 'acc-nav-chevron--open' : ''}`}
          />
        </button>
        {open.billing && (
          <div className="acc-nav-children">
            <button
              className={`acc-nav-child ${activeView === 'invoice' ? 'acc-nav-child--active' : ''}`}
              onClick={() => goTo('invoice')}
            >
              <SpIcon name="sp-File-File_Document" /> Payment Log
            </button>
          </div>
        )}
      </div>

      {/* ── Settings ── */}
      <div className="acc-nav-group">
        <button
          className={`acc-nav-item ${open.settings ? 'acc-nav-item--open' : ''}`}
          onClick={() => toggleGroup('settings')}
        >
          <span className="acc-nav-item-left">
            <SpIcon name="sp-Interface-Settings" /> Settings
          </span>
          <SpIcon name="sp-Arrow-Chevron_Down"
            className={`acc-nav-chevron ${open.settings ? 'acc-nav-chevron--open' : ''}`}
          />
        </button>
        {open.settings && (
          <div className="acc-nav-children">
            <button
              className={`acc-nav-child ${activeView === 'settings-notification' ? 'acc-nav-child--active' : ''}`}
              onClick={() => goTo('settings-notification')}
            >
              <SpIcon name="sp-Communication-Bell" /> Notification
            </button>
            <button
              className={`acc-nav-child ${activeView === 'settings-profile' ? 'acc-nav-child--active' : ''}`}
              onClick={() => goTo('settings-profile')}
            >
              <SpIcon name="sp-User-User_03" /> Profile
            </button>
            <button
              className={`acc-nav-child ${activeView === 'settings-change-password' ? 'acc-nav-child--active' : ''}`}
              onClick={() => goTo('settings-change-password')}
            >
              <SpIcon name="sp-Interface-Lock" /> Change Password
            </button>
          </div>
        )}
      </div>

      {/* ── Help ── */}
      <div className="acc-nav-group">
        <button
          className={`acc-nav-item ${open.help ? 'acc-nav-item--open' : ''}`}
          onClick={() => toggleGroup('help')}
        >
          <span className="acc-nav-item-left">
            <SpIcon name="sp-Warning-Shield_Check" /> Help
          </span>
          <SpIcon name="sp-Arrow-Chevron_Down"
            className={`acc-nav-chevron ${open.help ? 'acc-nav-chevron--open' : ''}`}
          />
        </button>
        {open.help && (
          <div className="acc-nav-children">
            <button
              className={`acc-nav-child ${activeView === 'help-centre' ? 'acc-nav-child--active' : ''}`}
              onClick={() => goTo('help-centre')}
            >
              <SpIcon name="sp-Environment-Sun" /> Help Centre
            </button>
            <button
              className={`acc-nav-child ${activeView === 'help-manual' ? 'acc-nav-child--active' : ''}`}
              onClick={() => goTo('help-manual')}
            >
              <SpIcon name="sp-Communication-Bell" /> Usage Manuel
            </button>
            <button
              className={`acc-nav-child ${activeView === 'help-terms' ? 'acc-nav-child--active' : ''}`}
              onClick={() => goTo('help-terms')}
            >
              <SpIcon name="sp-User-User_03" /> Terms &amp; Policies
            </button>
          </div>
        )}
      </div>

      {/* ── Logout ── */}
      <button className="acc-nav-flat" onClick={() => setShowLogoutModal(true)}>
        <SpIcon name="sp-Other-Logout" /> Logout
      </button>

      {/* ── Billing footer links — shown only on billing/invoice views ── */}
      {isBillingView && (
        <div className="acc-nav-billing-footer">
          <button
            className="acc-nav-billing-footer-link"
            onClick={() => setShowSubmitQuery(true)}
          >
            Contact our billing team
          </button>
          <button className="acc-nav-billing-footer-link">
            Learn more about usage &amp; billing
          </button>
        </div>
      )}
    </nav>
  );

  return (
    <AutoSaveContext.Provider value={{ recordSave, triggerSave, status }}>
      <div className="acc-shell">

        <div className="acc-topbar">
          <button className="acc-back-btn" onClick={() => navigate(-1)}>
            <SpIcon name="sp-Arrow-Arrow_Left_SM" /> Back
          </button>
          {showAutosave && (
            <div className={`acc-autosave acc-autosave--${status}`}>
              <SpIcon name="sp-System-Save" />
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

        <h1 className="acc-page-title">Account</h1>

        <div className="acc-body">
          {renderNav()}
          <div className="acc-content">
            {!SELF_HEADING_VIEWS.includes(activeView) && (
              <h2 className="acc-content-heading">{HEADING[activeView]}</h2>
            )}
            {renderContent()}
          </div>
        </div>
      </div>

      <LogoutModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        appName="Synthetic People"
        {...(user?.email ? { userEmail: user.email } : {})}
        onConfirm={async () => {
          dispatch(logout());
          navigate('/login', { replace: true });
        }}
      />

      <SubmitQueryModal
        isOpen={showSubmitQuery}
        onClose={() => setShowSubmitQuery(false)}
        onSubmit={async () => {
          await new Promise(r => setTimeout(r, 800));
        }}
      />
    </AutoSaveContext.Provider>
  );
};

export default Settings;