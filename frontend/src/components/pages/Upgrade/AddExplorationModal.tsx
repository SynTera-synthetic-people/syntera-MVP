import React, { useState, useEffect } from 'react';
import { TbX, TbPlus, TbMinus, TbInfoCircle } from 'react-icons/tb';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { updateUser } from '../../../redux/slices/authSlice';
import upgradeService from '../../../services/upgradeService';
import './AddExplorationModalStyles.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_COUNT      = 3;
const PRICE_PER_UNIT = 33;

// ── Types ─────────────────────────────────────────────────────────────────────

interface AddExplorationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const AddExplorationModal: React.FC<AddExplorationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const dispatch = useDispatch();

  const [count, setCount]   = useState<number>(MIN_COUNT);
  const [adding, setAdding] = useState(false);

  // Reset count every time the modal opens
  useEffect(() => {
    if (isOpen) setCount(MIN_COUNT);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const total = count * PRICE_PER_UNIT;

  const decrement = () => setCount((c) => Math.max(MIN_COUNT, c - 1));
  const increment = () => setCount((c) => c + 1);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseInt(e.target.value, 10);
    if (isNaN(raw)) return;
    setCount(Math.max(MIN_COUNT, raw));
  };

  const handleAdd = async () => {
    setAdding(true);
    try {
      const res = await (upgradeService as any).addExplorations({ count });
      dispatch(updateUser({
        exploration_count:       res.data.exploration_count,
        trial_exploration_limit: res.data.trial_exploration_limit,
        account_tier:            res.data.account_tier,
        is_trial:                res.data.is_trial,
      }));
      toast.success(`${count} exploration${count > 1 ? 's' : ''} added successfully!`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to add explorations. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="ae-overlay" onClick={onClose}>
      <div className="ae-modal" onClick={(e) => e.stopPropagation()}>

        {/* Close */}
        <button className="ae-close-btn" onClick={onClose} aria-label="Close">
          <TbX size={18} />
        </button>

        {/* Title */}
        <h2 className="ae-title">Add Additional Exploration</h2>

        {/* Counter field */}
        <div className="ae-field">
          <label className="ae-label">
            Number of Exploration
            <span
              className="ae-info-icon"
              title={`Minimum ${MIN_COUNT} explorations. Each costs $${PRICE_PER_UNIT}.`}
            >
              <TbInfoCircle size={14} />
            </span>
          </label>

          <div className="ae-counter">
            <button
              className="ae-counter-btn"
              onClick={decrement}
              disabled={count <= MIN_COUNT}
              aria-label="Decrease"
            >
              <TbMinus size={18} />
            </button>

            <input
              type="number"
              className="ae-counter-input"
              value={count}
              min={MIN_COUNT}
              onChange={handleInputChange}
              aria-label="Number of explorations"
            />

            <button
              className="ae-counter-btn"
              onClick={increment}
              aria-label="Increase"
            >
              <TbPlus size={18} />
            </button>
          </div>
        </div>

        {/*
          Unified price card — breakdown row + internal divider + total row
          all inside one .ae-breakdown box, matching the Figma layout exactly.
        */}
        <div className="ae-breakdown">
          <div className="ae-breakdown-row">
            <span className="ae-breakdown-label">Exploration × {count}</span>
            <span className="ae-breakdown-price">${PRICE_PER_UNIT} each</span>
          </div>

          <div className="ae-divider" />

          <div className="ae-total-row">
            <span className="ae-total-label">Total</span>
            <span className="ae-total-price">${total}</span>
          </div>
        </div>

        {/* CTA */}
        <button
          className="ae-cta-btn"
          onClick={handleAdd}
          disabled={adding}
        >
          {adding ? 'Processing…' : 'Add Explorations and Continue'}
        </button>

      </div>
    </div>
  );
};

export default AddExplorationModal;