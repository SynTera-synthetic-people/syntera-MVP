import React, { useState } from 'react';
import { TbCheck, TbBuilding, TbRocket } from 'react-icons/tb';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { updateUser } from '../../../redux/slices/authSlice';
import upgradeService from '../../../services/upgradeService';
import AddExplorationModal from './AddExplorationModal';  // ← was missing
import './UpgradeStyle.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type PageView = 'plans' | 'loading' | 'thankyou';

interface RootState {
  auth: {
    user: {
      is_trial?: boolean;
      account_tier?: string;
      exploration_count?: number;
      trial_exploration_limit?: number;
    } | null;
  };
}

// ── Feature lists ─────────────────────────────────────────────────────────────

const EXPLORER_FEATURES = [
  'Three Research Explorations',
  'Two Recommended Personas / Manual creation',
  'Qual and Quant Study',
  'Unlimited Follow-up Conversations',
  'Unlimited Sample Size in Quant',
  'Download In-depth Report',
  'Traceability Log',
];

const ENTERPRISE_FEATURES = [
  '10 Fixed research exploration: $299 / Each',
  'Additional research exploration: $199 / each',
  '4 Recommended personas/manual creation',
  'Qual and Quant study',
  'Unlimited follow-up conversations',
  'Unlimited sample size in quant',
  'Download In-depth report',
  'Traceability Log',
  'First Party Data ingestion',
  'Integration with internal systems',
  'Dedicated Account Manager',
  'Priority Tech/Analyst Support',
];

// ── Component ─────────────────────────────────────────────────────────────────

const Upgrade: React.FC = () => {
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.auth);
  const [view, setView] = useState<PageView>('plans');
  const [showAddExploration, setShowAddExploration] = useState(false); // ← was missing

  // ── Derived state ─────────────────────────────────────────────────────────

  // Trial user: is_trial=true AND account_tier='free'
  const isTrialCase = user?.is_trial === true && user?.account_tier === 'free';

  // Explorer pack exhausted: not on trial, account_tier='explorer',
  // and exploration_count has reached the limit (3)
  const EXPLORER_LIMIT = 3;
  const explorationCount = user?.exploration_count ?? 0;
  const isExplorerExhausted =
    !isTrialCase &&
    user?.account_tier === 'explorer' &&
    explorationCount >= EXPLORER_LIMIT;

  const explorerBtnLabel = isTrialCase ? 'Upgrade Now' : 'Renew Explorer Pack';

  // ── Contextual heading — only shown when the user has hit a limit ─────────
  const title = isTrialCase
    ? 'Your Free Trial is Complete'
    : isExplorerExhausted
    ? 'Explorer Pack Complete'
    : null;

  const subtitle = isTrialCase
    ? "You've completed your free exploration. Your research, reports, and traceability logs remain available. Upgrade to continue running behavioural simulations to uncover why customers choose, hesitate, or switch."
    : isExplorerExhausted
    ? 'You have completed 3 research explorations. Your reports and traceability logs remain available in your workspace. Continue running behavioural simulations to uncover why customers choose, hesitate, or switch.'
    : null;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleExplorerUpgrade = async () => {
    // Any explorer user clicking "Renew Explorer Pack" → open AddExplorationModal.
    // The modal handles purchasing more explorations regardless of current count.
    // Only trial users (isTrialCase) go through the direct upgradeToExplorer API.
    if (!isTrialCase) {
      setShowAddExploration(true);
      return;
    }

    // Trial case → standard upgrade API call
    setView('loading');
    try {
      const res = await upgradeService.upgradeToExplorer();
      dispatch(updateUser({
        account_tier:            res.data.account_tier,
        is_trial:                res.data.is_trial,
        exploration_count:       res.data.exploration_count,
        trial_exploration_limit: res.data.trial_exploration_limit,
      }));
      toast.success('Explorer Pack activated!');
      setView('plans');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Upgrade failed. Please try again.');
      setView('plans');
    }
  };

  const handleEnterpriseContact = async () => {
    try {
      await upgradeService.contactEnterprise();
      setView('thankyou');
    } catch {
      toast.error('Something went wrong. Please try again.');
    }
  };

  // ── Thank you state ───────────────────────────────────────────────────────

  if (view === 'thankyou') {
    return (
      <div className="up-thankyou">
        <div className="up-thankyou-icon">
          <TbCheck size={32} />
        </div>
        <h2 className="up-thankyou-title">Thank you!</h2>
        <p className="up-thankyou-desc">
          Our team will contact you shortly to set up your Enterprise Pack.
        </p>
        <button className="up-thankyou-btn" onClick={() => setView('plans')}>
          Back to Plans
        </button>
      </div>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (view === 'loading') {
    return (
      <div className="up-loading">
        <div className="up-spinner" />
        <p className="up-loading-text">Activating your Explorer Pack…</p>
      </div>
    );
  }

  // ── Plans view ────────────────────────────────────────────────────────────

  return (
    <>
      <div className="up-page">

        {/* Page heading */}
        <div className="up-page-header">
          <h2 className="up-page-heading">Upgrade Plan to Continue Explorations</h2>
        </div>

        {/* Contextual subtitle — only rendered when user has hit a limit */}
        {title && subtitle && (
          <div className="up-subtitle-block">
            <h3 className="up-subtitle-title">{title}</h3>
            <p className="up-subtitle-desc">{subtitle}</p>
          </div>
        )}

        {/* Cards row */}
        <div className="up-cards-row">

          {/* ── Explorer Pack ── */}
          <div className="up-card up-card--featured">

            {/* Most Popular badge — absolute, centered, straddling top border */}
            <div className="up-badge-wrap">
              <span className="up-badge">MOST POPULAR</span>
            </div>

            <div className="up-card-header">
              <TbRocket size={20} className="up-card-icon up-card-icon--blue" />
              <h3 className="up-card-title">
                {isTrialCase ? 'Explorer Pack' : 'Renew Explorer Pack'}
              </h3>
            </div>

            <p className="up-card-desc">
              For teams beginning their behavioral discovery
            </p>

            <ul className="up-feature-list">
              {EXPLORER_FEATURES.map((f) => (
                <li key={f} className="up-feature-item">
                  <TbCheck size={14} className="up-feature-check up-feature-check--blue" />
                  {f}
                </li>
              ))}
            </ul>

            <button
              className="up-cta-btn up-cta-btn--primary"
              onClick={handleExplorerUpgrade}
            >
              {explorerBtnLabel}
            </button>
          </div>

          {/* ── Enterprise Pack ── */}
          <div className="up-card up-card--default">
            <div className="up-card-header">
              <TbBuilding size={20} className="up-card-icon up-card-icon--muted" />
              <h3 className="up-card-title">Enterprise Pack</h3>
            </div>
            <p className="up-card-desc">
              For customer-obsessed teams running continuous behavioural intelligence
            </p>

            <ul className="up-feature-list">
              {ENTERPRISE_FEATURES.map((f) => (
                <li key={f} className="up-feature-item">
                  <TbCheck size={14} className="up-feature-check up-feature-check--muted" />
                  {f}
                </li>
              ))}
            </ul>

            <button
              className="up-cta-btn up-cta-btn--secondary"
              onClick={handleEnterpriseContact}
            >
              <TbBuilding size={16} />
              Contact Us
            </button>
          </div>

        </div>
      </div>

      {/* Add Exploration modal — opens when explorer pack is exhausted */}
      <AddExplorationModal
        isOpen={showAddExploration}
        onClose={() => setShowAddExploration(false)}
        onSuccess={() => setShowAddExploration(false)}
      />
    </>
  );
};

export default Upgrade;