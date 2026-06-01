import React, { useState, useEffect } from 'react';
import { TbX, TbPlus, TbMinus, TbInfoCircle, TbAlertCircle } from 'react-icons/tb';
import { toast } from 'react-toastify';
import { personaService } from '../../../../../../../services/personaService';
import './AddPersonaModalStyles.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_COUNT      = 1;
const PRICE_PER_UNIT = 49;

// ── Types ─────────────────────────────────────────────────────────────────────

interface AddPersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful purchase so the parent can refetch personas */
  onSuccess?: (count: number) => void | Promise<void>;
  workspaceId?: string;
  objectiveId?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

const AddPersonaModal: React.FC<AddPersonaModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  workspaceId,
  objectiveId,
}) => {
  const [count, setCount]   = useState<number>(MIN_COUNT);
  const [agreed, setAgreed] = useState(false);
  const [adding, setAdding] = useState(false);

  // Reset count and agreement every time the modal opens
  useEffect(() => {
    if (isOpen) {
      setCount(MIN_COUNT);
      setAgreed(false);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
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
    if (!workspaceId || !objectiveId || !agreed) return;

    setAdding(true);
    try {
      await personaService.purchasePersonas(workspaceId, objectiveId, count);
      toast.success(`${count} persona${count > 1 ? 's' : ''} added successfully!`);
      if (onSuccess) {
        await onSuccess(count);
      } else {
        onClose();
      }
    } catch (err: any) {
      console.error('Failed to add personas:', err);
      toast.error(err?.response?.data?.detail?.message || 'Failed to add personas. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="apm-overlay" onClick={onClose}>
      <div className="apm-modal" onClick={(e) => e.stopPropagation()}>

        {/* Close */}
        <button className="apm-close-btn" onClick={onClose} aria-label="Close">
          <TbX size={18} />
        </button>

        {/* Title */}
        <h2 className="apm-title">Add New Persona</h2>

        {/* Counter field */}
        <div className="apm-field">
          <label className="apm-label">
            Number of Personas
            <span className="apm-info-icon" title={`Minimum ${MIN_COUNT} persona. Each costs $${PRICE_PER_UNIT}.`}>
              <TbInfoCircle size={14} />
            </span>
          </label>

          <div className="apm-counter">
            <button className="apm-counter-btn" onClick={decrement} disabled={count <= MIN_COUNT} aria-label="Decrease">
              <TbMinus size={18} />
            </button>

            <input
              type="number"
              className="apm-counter-input"
              value={count}
              min={MIN_COUNT}
              onChange={handleInputChange}
              aria-label="Number of personas"
            />

            <button className="apm-counter-btn" onClick={increment} aria-label="Increase">
              <TbPlus size={18} />
            </button>
          </div>
        </div>

        {/* Price breakdown */}
        <div className="apm-breakdown">
          <div className="apm-breakdown-row">
            <span className="apm-breakdown-label">Additional Personas x {count}</span>
            <span className="apm-breakdown-price">${PRICE_PER_UNIT} each</span>
          </div>
          <div className="apm-divider" />
          <div className="apm-total-row">
            <span className="apm-total-label">Total</span>
            <span className="apm-total-price">${total}</span>
          </div>
        </div>

        {/* Warning banner */}
        <div className="apm-warning-banner">
          <TbAlertCircle size={16} className="apm-warning-icon" />
          <p className="apm-warning-text">
            Additional personas will be added to this exploration. The corresponding
            cost will be included in your next billing cycle.
          </p>
        </div>

        {/* Consent checkbox */}
        <label className="apm-checkbox-row">
          <input
            type="checkbox"
            className="apm-checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="apm-checkbox-label">I understand and agree to the additional cost.</span>
        </label>

        {/* CTA */}
        <button className="apm-cta-btn" onClick={handleAdd} disabled={adding || !agreed}>
          {adding ? 'Processing…' : 'Add Persona and Continue'}
        </button>

      </div>
    </div>
  );
};

export default AddPersonaModal;