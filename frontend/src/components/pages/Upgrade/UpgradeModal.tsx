import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TbX, TbStar, TbCheck, TbBuilding, TbRocket } from 'react-icons/tb';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { updateUser } from '../../../redux/slices/authSlice';
import upgradeService from '../../../services/upgradeService';
import AddExplorationModal from './AddExplorationModal';
import './UpgradeModalStyle.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgradeSuccess?: () => void;
}

type ModalView = 'plans' | 'loading' | 'thankyou';

/**
 * AuthUser — the shape of the authenticated user stored in Redux.
 *
 * Kept in sync with:
 *  - authSlice.updateUser payload
 *  - Upgrade.tsx (same fields, same optional markers)
 *  - Login.tsx (user_type / role used for routing)
 *
 * All fields are optional because the slice may be populated incrementally
 * (e.g. after a partial API response).
 */
interface AuthUser {
  // ── Identity / access control ────────────────────────────────────────────
  /** Coarse role string sent by the backend (e.g. "admin", "member"). */
  role?: string;
  /**
   * Finer-grained user type used for post-login routing in Login.tsx
   * (e.g. "enterprise_admin", "explorer", "trial").
   */
  user_type?: string;

  // ── Subscription tier ────────────────────────────────────────────────────
  /** "free" | "explorer" | "enterprise" */
  account_tier?: string;

  // ── Trial / exploration quota ─────────────────────────────────────────────
  is_trial?: boolean;
  /** How many explorations the user has created so far. */
  exploration_count?: number;
  /** Maximum explorations allowed on the current plan. */
  trial_exploration_limit?: number;
}

interface RootState {
  auth: {
    user: AuthUser | null;
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
  'Ten Fixed Research Explorations (USD 299/each)',
  'Additional Exploration: USD 199/each',
  'Four Recommended Personas / Manual Creation',
  'Qual and Quant Study',
  'Unlimited Follow-up Conversations',
  'Unlimited Sample Size in Quant',
  'Download In-depth Report',
  'Traceability Log',
  'First Party Data Ingestion',
];

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPLORER_LIMIT = 3;

// ── Component ─────────────────────────────────────────────────────────────────

const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  onUpgradeSuccess,
}) => {
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.auth);
  const [view, setView] = useState<ModalView>('plans');
  const [showAddExploration, setShowAddExploration] = useState(false);

  // ── Derived state ─────────────────────────────────────────────────────────

  /**
   * isTrialCase: user is on the free trial (not yet purchased any pack).
   * This matches the check used in Login.tsx — user_type / account_tier combo.
   */
  const isTrialCase = user?.is_trial === true && user?.account_tier === 'free';

  /**
   * isExplorerExhausted: user has already purchased the Explorer Pack but
   * has used up all 3 included explorations.
   *
   * exploration_count is now properly typed on AuthUser so this access
   * is safe without any type assertion.
   */
  const explorationCount = user?.exploration_count ?? 0;
  const isExplorerExhausted =
    !isTrialCase &&
    user?.account_tier === 'explorer' &&
    explorationCount >= EXPLORER_LIMIT;

  // ── Copy ──────────────────────────────────────────────────────────────────

  const title = isTrialCase ? 'Trial Complete' : 'Explorer Pack Complete';

  const subtitle = isTrialCase
    ? 'Your first exploration is complete. Continue running behavioural simulations to uncover why customers choose, hesitate, or switch.'
    : 'You have completed 3 research explorations. Your reports and traceability logs remain available in your workspace. Continue running behavioural simulations to uncover why customers choose, hesitate, or switch.';

  const explorerBtnLabel = isTrialCase ? 'Instant access' : 'Renew Explorer Pack';

  // ── Handlers ─────────────────────────────────────────────────────────────

  /**
   * Explorer CTA:
   * - Trial users        → standard upgradeToExplorer API call
   * - Explorer exhausted → open AddExplorationModal to buy more
   */
  const handleExplorerUpgrade = async () => {
    if (isExplorerExhausted) {
      setShowAddExploration(true);
      return;
    }

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
      onUpgradeSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { message?: string } } })
              ?.response?.data?.message ?? 'Upgrade failed. Please try again.';
      toast.error(message);
      setView('plans');
    }
  };

  const handleEnterpriseContact = async () => {
    try {
      await upgradeService.contactEnterprise();
      setView('thankyou');
    } catch (err: unknown) {
      toast.error('Something went wrong. Please try again.');
    }
  };

  const handleClose = () => {
    if (view === 'loading') return;
    setView('plans');
    onClose();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">

            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="fixed inset-0 bg-black/70 backdrop-blur-md"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-3xl bg-white dark:bg-[#0a0e1a] rounded-3xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden"
            >
              {/* Close button */}
              {view !== 'loading' && (
                <button
                  onClick={handleClose}
                  className="absolute top-4 right-4 z-10 p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors"
                >
                  <TbX className="w-5 h-5 text-gray-400" />
                </button>
              )}

              {/* ── THANK YOU VIEW ── */}
              {view === 'thankyou' && (
                <div className="p-10 text-center">
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                    <TbCheck className="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                    Thank you!
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-8">
                    Our team will contact you shortly to set up your Enterprise Pack.
                  </p>
                  <button
                    onClick={handleClose}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold shadow-lg hover:from-blue-700 hover:to-blue-800 transition-all"
                  >
                    Back to workspace
                  </button>
                </div>
              )}

              {/* ── LOADING VIEW ── */}
              {view === 'loading' && (
                <div className="p-10 text-center">
                  <div className="w-16 h-16 flex items-center justify-center mx-auto mb-6">
                    <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Activating your Explorer Pack…
                  </h2>
                </div>
              )}

              {/* ── PLANS VIEW ── */}
              {view === 'plans' && (
                <>
                  {/* Header — only shown when user has hit a limit */}
                  {(isTrialCase || isExplorerExhausted) && (
                    <div className="px-8 pt-8 pb-4 text-center">
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        {title}
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
                        {subtitle}
                      </p>
                    </div>
                  )}

                  {/* Cards */}
                  <div className="px-8 pb-8 grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">

                    {/* Explorer Pack */}
                    <div className="relative rounded-2xl border-2 border-blue-500 bg-blue-50/50 dark:bg-blue-900/10 p-6 flex flex-col">

                      {/*
                        ── "MOST POPULAR" badge — Figma style ──────────────────
                        Sits on top edge of the card, centred, hot-pink pill with
                        uppercase bold text. No icon, no rounded-full — matches
                        the flat pill style in the Figma screenshot exactly.
                      */}
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                        <span className="inline-block bg-[#E91E8C] text-white text-[10px] font-bold tracking-widest uppercase px-4 py-1 rounded-md shadow-lg whitespace-nowrap">
                          MOST POPULAR
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mb-1 mt-2">
                        <TbRocket className="w-5 h-5 text-blue-600" />
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                          {isTrialCase ? 'Explorer Pack' : 'Renew Explorer Pack'}
                        </h3>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                        For teams beginning their behavioral discovery
                      </p>

                      <ul className="space-y-2 flex-1 mb-6">
                        {EXPLORER_FEATURES.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <TbCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      <div className="mb-4">
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">USD 899</span>
                      </div>

                      <button
                        onClick={handleExplorerUpgrade}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-blue-500/30"
                      >
                        {explorerBtnLabel}
                      </button>
                    </div>

                    {/* Enterprise Pack */}
                    <div className="rounded-2xl border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 flex flex-col">
                      <div className="flex items-center gap-2 mb-1">
                        <TbBuilding className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                          Enterprise Pack
                        </h3>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                        For customer-obsessed teams running continuous behavioural intelligence
                      </p>

                      <ul className="space-y-2 flex-1 mb-6">
                        {ENTERPRISE_FEATURES.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <TbCheck className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>

                      <button
                        onClick={handleEnterpriseContact}
                        className="w-full py-3 border-2 border-gray-300 dark:border-white/20 text-gray-700 dark:text-gray-200 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                      >
                        Contact Sales
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        </div>
      )}

      {/* Add Exploration modal — opens when explorer pack is exhausted */}
      <AddExplorationModal
        isOpen={showAddExploration}
        onClose={() => setShowAddExploration(false)}
        onSuccess={() => {
          setShowAddExploration(false);
          onUpgradeSuccess?.();
          onClose();
        }}
      />
    </AnimatePresence>
  );
};

export default UpgradeModal;