import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  TbEdit, TbPlus, TbLoader, TbUsers, TbDownload,
  TbChevronRight, TbEye, TbCopy, TbTrash, TbDotsVertical,
  TbMinus, TbInfoCircle, TbCheck, TbX, TbLock, TbSparkles,
} from 'react-icons/tb';
import SpIcon from '../../../../../../SPIcon';
import { motion, AnimatePresence } from 'framer-motion';
import {
  usePersonaBuilder,
  useAutoGeneratePersonas,
  useUpdatePersona,
  useDeletePersona,
  personaKeys,
  usePersonaPreview,
} from '../../../../../../../hooks/usePersonaBuilder';
import {
  useUpdateExplorationMethod,
  useExploration,
} from '../../../../../../../hooks/useExplorations';
import { personaService } from '../../../../../../../services/personaService';
import { useTheme } from '../../../../../../../context/ThemeContext';
import { useOmniWorkflow } from '../../../../../../../hooks/useOmiWorkflow';
import {
  optionData,
  contentData,
  traitGroupMapping,
  traitNameMapping,
  multiSelectAttributes,
} from './data';
import { downloadPersonaCardsFrontend } from './DownloadPersonaCard';
import {
  getConfidenceBarClass,
  getConfidenceScore,
  getConfidenceTextColor,
} from './PersonaBuilderShared';
import type { PersonaCardData } from './PersonaCardRenderer';
import AddPersonaModal from './AddPersonaModal';

import './PersonaBuilder.css';

import omiVideoSrc from '../../../../../../../assets/Omi Animations/Omi Micro-Celebration_Lite.mp4';
import omiDarkImg from '../../../../../../../assets/OMI_Dark.png';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SavedPersona {
  id: string;
  name?: string;
  auto_generated_persona?: boolean;
  created_by?: string;
  created_by_name?: string;
  created_at?: string;
  age_range?: string;
  gender?: string;
  geography?: string;
  location_country?: string;
  location_state?: string;
  confidence_scoring?: {
    weighted_score?: number;
    confidence_calculation_detail?: { weighted_total?: number };
    score?: number;
  };
  confidence_score?: number;
  calibration_confidence?: number;
  parent_persona_id?: string | null;
  persona_source?: string;
  replication_mode?: string;
  persona_details?: Record<string, unknown>;
  [key: string]: unknown;
}

type ReplicationMode = 'full_replication' | 'anchor_preview';

interface AnchorPreviewData {
  source_persona_id?: string;
  target_country?: string;
  psychographic_core?: Record<string, unknown>;
  market_context?: Record<string, unknown>;
  replication_metadata?: Record<string, unknown>;
  replication_artifacts?: Record<string, unknown>;
}

interface User {
  account_tier?: string;
  [key: string]: any;
}

interface RootState {
  auth: { user: User | null };
}

interface PersonaData {
  name: string;
  isAI?: boolean;
  isAIGenerated?: boolean;
  isSaved?: boolean;
  id?: string;
  backstory?: string;
  originalData?: SavedPersona;
  [key: string]: unknown;
}

interface EditingItem {
  category: string;
  item: string;
}

interface ValidationError {
  results?: unknown;
  total_response?: string;
  group?: string;
  fromTab?: string;
  toTab?: string;
}

interface DownloadPersonaCardModalProps {
  show: boolean;
  personas: SavedPersona[];
  onClose: () => void;
  onDownload: (selectedIds: string[]) => Promise<void>;
}

// free / tier1: hard cap of 2 personas per exploration
const FREE_PERSONA_LIMIT = 2;
// tier2 / enterprise: soft cap before showing the paid "add more" modal
const PERSONA_LIMIT = 4;

// ── Confidence helpers ────────────────────────────────────────────────────────

const DownloadPersonaCardModal: React.FC<DownloadPersonaCardModalProps> = ({
  show, personas, onClose, onDownload,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (show) setSelectedIds([]);
  }, [show]);

  const togglePersona = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleDownload = async () => {
    if (selectedIds.length === 0) return;
    setIsDownloading(true);
    try {
      await onDownload(selectedIds);
    } finally {
      setIsDownloading(false);
      onClose();
    }
  };

  if (!show) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pb-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="pb-modal-box pb-download-modal-box"
            initial={{ opacity: 0, scale: 0.93, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
          >
            <button className="pb-modal-close" onClick={onClose}><TbX size={18} /></button>

            <h2 className="pb-modal-title">Download Persona Cards</h2>
            <p className="pb-modal-subtitle">
              Select the personas you'd like to download and generate shareable profiles
            </p>

            <div className="pb-download-persona-list">
              {personas.map(persona => {
                const isSelected = selectedIds.includes(persona.id);
                return (
                  <button
                    key={persona.id}
                    className={`pb-download-persona-row${isSelected ? ' pb-download-persona-row--selected' : ''}`}
                    onClick={() => togglePersona(persona.id)}
                  >
                    <span className="pb-download-persona-name">
                      {persona.name ?? 'Unnamed Persona'}
                    </span>
                    <span className={`pb-download-persona-check${isSelected ? ' pb-download-persona-check--visible' : ''}`}>
                      <TbCheck size={16} />
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ── Select all row ── */}
            <div className="pb-download-divider" />
            <button
              className="pb-select-all-row"
              onClick={() => {
                if (selectedIds.length === personas.length) {
                  setSelectedIds([]);
                } else {
                  setSelectedIds(personas.map(p => p.id));
                }
              }}
            >
              <span
                className={`pb-select-all-cb${selectedIds.length === personas.length
                  ? ' pb-select-all-cb--checked'
                  : selectedIds.length > 0
                    ? ' pb-select-all-cb--indeterminate'
                    : ''
                  }`}
              >
                {selectedIds.length === personas.length && <TbCheck size={12} />}
                {selectedIds.length > 0 && selectedIds.length < personas.length && <TbMinus size={12} />}
              </span>
              <span className="pb-select-all-label">Select all</span>
              <span className="pb-select-all-count">
                {selectedIds.length} of {personas.length} selected
              </span>
            </button>

            <div className="pb-modal-actions pb-download-actions">
              <button className="pb-modal-cancel-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className={`pb-modal-primary-btn${selectedIds.length === 0 ? ' pb-modal-primary-btn--disabled' : ''}`}
                disabled={selectedIds.length === 0 || isDownloading}
                onClick={handleDownload}
              >
                {isDownloading
                  ? <TbLoader size={14} className="pb-btn-spinner" />
                  : null}
                Download Persona Card
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── DownloadSuccessToast ──────────────────────────────────────────────────────

const DownloadSuccessToast: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <AnimatePresence>
    <motion.div
      className="pb-download-toast"
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 40, scale: 0.95 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <span className="pb-download-toast-icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="white" strokeWidth="1.8" />
          <path d="M6 10.5l2.8 2.8 5-5.6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="pb-download-toast-label">Download Successful</span>
      <button className="pb-download-toast-close" onClick={onClose} aria-label="Dismiss">
        <TbX size={16} />
      </button>
    </motion.div>
  </AnimatePresence>
);

// ── KebabMenu ────────────────────────────────────────────────────────────────

interface KebabMenuProps {
  items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[];
}

const KebabMenu: React.FC<KebabMenuProps> = ({ items }) => {
  const [open, setOpen] = useState(false);

  // Render nothing when there are no actions to show
  if (items.length === 0) return null;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="pb-kebab-wrap" onClick={e => e.stopPropagation()}>
      <button
        className="pb-kebab-btn"
        onClick={() => setOpen(o => !o)}
      >
        <TbDotsVertical size={16} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="pb-kebab-menu"
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            {items.map((item, i) => (
              <button
                key={i}
                className={`pb-kebab-item${item.danger ? ' pb-kebab-item--danger' : ''}`}
                onClick={() => { item.onClick(); setOpen(false); }}
              >
                <span className="pb-kebab-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── AddNewPersonaModal ────────────────────────────────────────────────────────

interface AddNewPersonaModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: (count: number) => void;
}

interface DeletePersonaModalProps {
  persona: SavedPersona | null;
  isLoading: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}

const AddNewPersonaModal: React.FC<AddNewPersonaModalProps> = ({ show, onClose, onConfirm }) => {
  const [count, setCount] = useState(1);
  const pricePerPersona = 199;
  const total = count * pricePerPersona;

  if (!show) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pb-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="pb-modal-box"
            initial={{ opacity: 0, scale: 0.93, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
          >
            <button className="pb-modal-close" onClick={onClose}><TbX size={18} /></button>
            <h2 className="pb-modal-title">Add New Persona</h2>

            <div className="pb-modal-field">
              <label className="pb-modal-label">
                Number of personas
                <span className="pb-modal-info-icon"><TbInfoCircle size={14} /></span>
              </label>
              <div className="pb-counter-row">
                <button
                  className="pb-counter-btn"
                  onClick={() => setCount(c => Math.max(1, c - 1))}
                  disabled={count <= 1}
                >
                  <TbMinus size={16} />
                </button>
                <div className="pb-counter-value">{count}</div>
                <button
                  className="pb-counter-btn"
                  onClick={() => setCount(c => c + 1)}
                >
                  <TbPlus size={16} />
                </button>
              </div>
            </div>

            <div className="pb-pricing-box">
              <div className="pb-pricing-row">
                <span>Persona  x  {count}</span>
                <span>${pricePerPersona} each</span>
              </div>
              <div className="pb-pricing-divider" />
              <div className="pb-pricing-row pb-pricing-row--total">
                <span>Total</span>
                <span>${total}</span>
              </div>
            </div>

            <button
              className="pb-modal-confirm-btn"
              onClick={() => onConfirm(count)}
            >
              Add Persona and Continue
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── DeletePersonaModal ────────────────────────────────────────────────────────

const DeletePersonaModal: React.FC<DeletePersonaModalProps> = ({
  persona,
  isLoading,
  error,
  onClose,
  onConfirm,
}) => {
  if (!persona) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="pb-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={isLoading ? undefined : onClose}
      >
        <motion.div
          className="pb-modal-box pb-delete-modal-box"
          initial={{ opacity: 0, scale: 0.93, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 16 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={e => e.stopPropagation()}
        >
          <button className="pb-modal-close" onClick={onClose} disabled={isLoading}>
            <TbX size={18} />
          </button>
          <h2 className="pb-modal-title">Delete Persona</h2>
          <p className="pb-modal-subtitle">
            Delete "{persona.name || 'this persona'}"? This action cannot be undone.
          </p>

          <div className="pb-delete-warning-box">
            <TbTrash size={16} className="pb-delete-warning-icon" />
            <p className="pb-delete-warning-text">
              Related qualitative outputs for this exploration will be cleared.
            </p>
          </div>

          {error && <p className="pb-modal-error-text">{error}</p>}

          <div className="pb-modal-actions">
            <button className="pb-modal-cancel-btn" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button
              className="pb-modal-danger-btn"
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? <TbLoader size={14} className="pb-btn-spinner" /> : <TbTrash size={14} />}
              Delete Persona
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ── ReplicatePersonaModal ─────────────────────────────────────────────────────

interface ReplicatePersonaModalProps {
  show: boolean;
  personas: SavedPersona[];
  onClose: () => void;
  onConfirm: (
    selectedPersonaIds: string[],
    country: string,
    mode: ReplicationMode,
    seedInputs: string
  ) => void;
  isLoading?: boolean;
  preSelectedPersona?: SavedPersona | null;
  error?: string;
  anchorPreview?: AnchorPreviewData | null;
}

const COUNTRIES = [
  { code: 'US', name: 'USA', flag: '🇺🇸' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'GB', name: 'UK', flag: '🇬🇧' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪' },
];

const ReplicatePersonaModal: React.FC<ReplicatePersonaModalProps> = ({
  show, personas, onClose, onConfirm, isLoading, preSelectedPersona, error, anchorPreview
}) => {
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>(
    preSelectedPersona ? [preSelectedPersona.id] : []
  );
  const [selectedCountry, setSelectedCountry] = useState('');
  const [replicationMode, setReplicationMode] = useState<ReplicationMode>('full_replication');
  const [seedInputs, setSeedInputs] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [personaDropdownOpen, setPersonaDropdownOpen] = useState(false);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show) return;
    setSelectedPersonaIds(preSelectedPersona ? [preSelectedPersona.id] : []);
    setSelectedCountry('');
    setReplicationMode('full_replication');
    setSeedInputs('');
    setAgreed(false);
    setPersonaDropdownOpen(false);
    setCountryDropdownOpen(false);
  }, [show, preSelectedPersona]);

  useEffect(() => {
    if (!personaDropdownOpen && !countryDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPersonaDropdownOpen(false);
        setCountryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [personaDropdownOpen, countryDropdownOpen]);

  const togglePersona = (id: string) => {
    setSelectedPersonaIds(prev => {
      if (replicationMode === 'anchor_preview') {
        setPersonaDropdownOpen(false);
        return [id];
      }
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      if (next.length === personas.length) setPersonaDropdownOpen(false);
      return next;
    });
  };

  const removePersona = (id: string) => {
    setSelectedPersonaIds(prev => prev.filter(p => p !== id));
  };

  const selectedCountryObj = COUNTRIES.find(c => c.code === selectedCountry);
  const isAnchorPreview = replicationMode === 'anchor_preview';
  const additionalCount = selectedPersonaIds.length;
  const priceEach = 49;
  const totalPrice = isAnchorPreview ? 0 : additionalCount * priceEach;

  const canConfirm = selectedPersonaIds.length > 0 && selectedCountry && (isAnchorPreview || agreed);

  const handleModeChange = (mode: ReplicationMode) => {
    setReplicationMode(mode);
    if (mode === 'anchor_preview') {
      setSelectedPersonaIds(prev => prev.slice(0, 1));
      setAgreed(false);
    }
  };

  const renderPreviewValue = (value: unknown): string => {
    if (Array.isArray(value)) return value.filter(Boolean).join(', ');
    if (value && typeof value === 'object') return JSON.stringify(value);
    return String(value ?? '');
  };

  if (!show) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pb-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="pb-modal-box"
            initial={{ opacity: 0, scale: 0.93, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
          >
            <button className="pb-modal-close" onClick={onClose}><TbX size={18} /></button>
            <h2 className="pb-modal-title">Replicate Persona</h2>
            <p className="pb-modal-subtitle">
              Test the same audience in multiple countries to uncover how behavior, preferences, and decisions shift by market.
            </p>

            <div ref={dropdownRef}>
              {/* Persona selector */}
              <div className="pb-dropdown-wrap">
                <button
                  className="pb-dropdown-btn"
                  onClick={() => { setPersonaDropdownOpen(o => !o); setCountryDropdownOpen(false); }}
                >
                  <span className="pb-dropdown-placeholder">
                    {isAnchorPreview ? 'Choose Persona' : 'Choose Personas'}
                  </span>
                  <TbChevronRight size={16} className={`pb-dropdown-chevron${personaDropdownOpen ? ' pb-dropdown-chevron--open' : ''}`} />
                </button>
                <AnimatePresence>
                  {personaDropdownOpen && (
                    <motion.div
                      className="pb-dropdown-list"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                    >
                      {personas.map(p => (
                        <label key={p.id} className="pb-dropdown-option">
                          <input
                            type="checkbox"
                            checked={selectedPersonaIds.includes(p.id)}
                            onChange={() => togglePersona(p.id)}
                            className="pb-dropdown-checkbox"
                          />
                          <span>{p.name ?? 'Unnamed'}</span>
                        </label>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
                {selectedPersonaIds.length > 0 && (
                  <div className="pb-tag-row">
                    {selectedPersonaIds.map(id => {
                      const p = personas.find(p => p.id === id);
                      return (
                        <span key={id} className="pb-tag">
                          {p?.name ?? 'Persona'}
                          <button className="pb-tag-remove" onClick={() => removePersona(id)}><TbX size={10} /></button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Country selector */}
              <div className="pb-dropdown-wrap" style={{ marginTop: 12 }}>
                <button
                  className="pb-dropdown-btn"
                  onClick={() => { setCountryDropdownOpen(o => !o); setPersonaDropdownOpen(false); }}
                >
                  <span className="pb-dropdown-placeholder">
                    {selectedCountryObj
                      ? <>{selectedCountryObj.name} {selectedCountryObj.flag}</>
                      : 'Select Country'}
                  </span>
                  <TbChevronRight size={16} className={`pb-dropdown-chevron${countryDropdownOpen ? ' pb-dropdown-chevron--open' : ''}`} />
                </button>
                <AnimatePresence>
                  {countryDropdownOpen && (
                    <motion.div
                      className="pb-dropdown-list"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                    >
                      {COUNTRIES.map(c => (
                        <button
                          key={c.code}
                          className={`pb-dropdown-option pb-dropdown-option--btn${selectedCountry === c.code ? ' pb-dropdown-option--selected' : ''}`}
                          onClick={() => { setSelectedCountry(c.code); setCountryDropdownOpen(false); }}
                        >
                          {c.flag} {c.name}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="pb-replication-mode-box">
              <p className="pb-modal-label">Replication Mode</p>
              <div className="pb-replication-mode-options">
                <button
                  type="button"
                  className={`pb-replication-mode-btn${replicationMode === 'full_replication' ? ' pb-replication-mode-btn--active' : ''}`}
                  onClick={() => handleModeChange('full_replication')}
                >
                  <span>Full Replication</span>
                  <small>All 5 stages. Complete persona, divergence flags, confidence comparison.</small>
                </button>
                <button
                  type="button"
                  className={`pb-replication-mode-btn${replicationMode === 'anchor_preview' ? ' pb-replication-mode-btn--active' : ''}`}
                  onClick={() => handleModeChange('anchor_preview')}
                >
                  <span>Anchor-Only Preview</span>
                  <small>Stages 1-2 only. Shows locked core and target market context.</small>
                </button>
              </div>
            </div>

            <div className="pb-seed-input-box">
              <label className="pb-modal-label" htmlFor="replication-seed-inputs">
                Client Seed Inputs <span className="pb-seed-input-optional">(optional)</span>
              </label>
              <textarea
                id="replication-seed-inputs"
                className="pb-seed-textarea"
                value={seedInputs}
                maxLength={2000}
                onChange={e => setSeedInputs(e.target.value)}
                placeholder="Known target-market data, client notes, local constraints, or Source Bank hints..."
              />
            </div>

            {/* Pricing */}
            <div className="pb-pricing-box" style={{ marginTop: 16 }}>
              <div className="pb-pricing-row">
                <span>{isAnchorPreview ? 'Anchor-Only Preview' : `Additional Personas  x  ${additionalCount}`}</span>
                <span>{isAnchorPreview ? '$0' : `$${priceEach} each`}</span>
              </div>
              <div className="pb-pricing-divider" />
              <div className="pb-pricing-row pb-pricing-row--total">
                <span>Total</span>
                <span>${totalPrice}</span>
              </div>
            </div>

            {/* Warning */}
            <div className="pb-warning-box">
              <SpIcon name="sp-Warning-Octagon_Warning" size={16} className="pb-warning-icon" />
              <p className="pb-warning-text">
                {isAnchorPreview
                  ? 'Anchor-Only Preview does not create a persona or add billing. Run Full Replication when you are ready to commit.'
                  : 'Additional personas will be added to this exploration. The corresponding cost will be included in your next billing cycle.'}
              </p>
            </div>

            {/* Agreement */}
            {!isAnchorPreview && (
              <label className="pb-agree-row">
                <div
                  className={`pb-checkbox${agreed ? ' pb-checkbox--checked' : ''}`}
                  onClick={() => setAgreed(a => !a)}
                >
                  {agreed && <TbCheck size={12} />}
                </div>
                <span className="pb-agree-text">I understand and agree to the additional cost.</span>
              </label>
            )}

            {isAnchorPreview && anchorPreview && (
              <div className="pb-anchor-preview-box">
                <p className="pb-anchor-preview-title">Anchor-Only Preview</p>
                <div className="pb-anchor-preview-section">
                  <span>Psychographic Core</span>
                  {Object.entries(anchorPreview.psychographic_core ?? {}).slice(0, 8).map(([key, value]) => (
                    <p key={key}><strong>{key.replace(/_/g, ' ')}:</strong> {renderPreviewValue(value)}</p>
                  ))}
                </div>
                <div className="pb-anchor-preview-section">
                  <span>Market Context</span>
                  {Object.entries(anchorPreview.market_context ?? {}).slice(0, 9).map(([key, value]) => (
                    <p key={key}><strong>{key.replace(/_/g, ' ')}:</strong> {renderPreviewValue(value)}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Error message */}
            {error && <p className="pb-modal-error-text">{error}</p>}

            {/* Actions */}
            <div className="pb-modal-actions">
              <button className="pb-modal-cancel-btn" onClick={onClose}>Cancel</button>
              <button
                className={`pb-modal-primary-btn${!canConfirm ? ' pb-modal-primary-btn--disabled' : ''}`}
                disabled={!canConfirm || isLoading}
                onClick={() => canConfirm && onConfirm(
                  selectedPersonaIds,
                  selectedCountryObj?.name || selectedCountry,
                  replicationMode,
                  seedInputs.trim()
                )}
              >
                {isLoading ? <TbLoader size={14} className="pb-btn-spinner" /> : null}
                {isAnchorPreview ? 'Preview Anchors' : 'Run Full Replication'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── CreatePersonaMethodModal ──────────────────────────────────────────────────

interface CreatePersonaMethodModalProps {
  show: boolean;
  onClose: () => void;
  onCreateWithOmi: () => void;
  onBuildManually: () => void;
  /** When true the "Build Manually" option renders as locked */
  manualAllowed: boolean;
}

const CreatePersonaMethodModal: React.FC<CreatePersonaMethodModalProps> = ({
  show, onClose, onCreateWithOmi, onBuildManually, manualAllowed,
}) => {
  if (!show) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pb-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="pb-modal-box pb-method-modal-box"
            initial={{ opacity: 0, scale: 0.93, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
          >
            <button className="pb-modal-close" onClick={onClose}><TbX size={18} /></button>
            <h2 className="pb-modal-title">Create New Persona</h2>
            <p className="pb-modal-subtitle">Choose how you'd like to build your next persona.</p>

            <div className="pb-method-options">
              {/* Create with Omi */}
              <button
                className="pb-method-option pb-method-option--omi"
                onClick={() => { onClose(); onCreateWithOmi(); }}
              >
                <div className="pb-method-option-icon pb-method-option-icon--omi">
                  <TbSparkles size={20} />
                </div>
                <div className="pb-method-option-text">
                  <span className="pb-method-option-title">Create with Omi</span>
                  <span className="pb-method-option-desc">
                    Let Omi calibrate personas from your research objective.
                  </span>
                </div>
              </button>

              {/* Build Manually */}
              <button
                className={`pb-method-option pb-method-option--manual${!manualAllowed ? ' pb-method-option--locked' : ''}`}
                onClick={() => { onClose(); onBuildManually(); }}
                title={!manualAllowed ? 'Upgrade to Enterprise to build personas manually' : undefined}
              >
                <div className="pb-method-option-icon pb-method-option-icon--manual">
                  {manualAllowed ? <TbEdit size={20} /> : <TbLock size={20} />}
                </div>
                <div className="pb-method-option-text">
                  <span className="pb-method-option-title">
                    Build Manually
                    {!manualAllowed && (
                      <span className="pb-method-option-badge">Enterprise</span>
                    )}
                  </span>
                  <span className="pb-method-option-desc">
                    Configure traits step by step and craft personas tailored to your spec.
                  </span>
                </div>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── PersonaGridCard ───────────────────────────────────────────────────────────

interface PersonaGridCardProps {
  persona?: SavedPersona;
  onCardClick?: (persona: SavedPersona) => void;
  isCreateNew?: boolean;
  onCreateNew?: () => void;
  onViewPersona?: (persona: SavedPersona) => void;
  onReplicatePersona?: (persona: SavedPersona) => void;
  onDeletePersona?: (persona: SavedPersona) => void;
  isViewOnly?: boolean;
}

const PersonaGridCard: React.FC<PersonaGridCardProps> = ({
  persona,
  onCardClick,
  isCreateNew = false,
  onCreateNew,
  onViewPersona,
  onReplicatePersona,
  onDeletePersona,
  isViewOnly = false,
}) => {
  if (isCreateNew) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2 }}
        onClick={onCreateNew}
        className="pb-card pb-card--create"
      >
        <div className="pb-create-content">
          <div className="pb-create-icon-wrap">
            <TbPlus size={20} />
          </div>
          <span className="pb-create-label">Create New Persona</span>
        </div>
      </motion.div>
    );
  }

  if (!persona) return null;

  const confidenceScore = getConfidenceScore(persona);
  const displayScore = confidenceScore ?? 0;
  const barClass = getConfidenceBarClass(displayScore);
  const textColor = getConfidenceTextColor(displayScore);

  const locationStr = [
    persona.location_state,
    persona.geography ?? persona.location_country,
  ]
    .filter(Boolean)
    .join(', ') || 'Location unavailable';

  // Replicated personas are user-initiated (they have parent_persona_id set).
  // Even though auto_generated_persona=true on them, the Omi badge is wrong.
  const isAI = persona.auto_generated_persona && !persona.parent_persona_id;
  const createdBy = persona.created_by_name ?? persona.created_by ?? 'You';

  const kebabItems = [
    {
      label: 'View Persona',
      icon: <TbEye size={14} />,
      onClick: () => onViewPersona?.(persona),
    },
    ...(!isViewOnly ? [
      {
        label: 'Replicate Personas',
        icon: <TbCopy size={14} />,
        onClick: () => onReplicatePersona?.(persona),
      },
      {
        label: 'Delete Persona',
        icon: <TbTrash size={14} />,
        onClick: () => onDeletePersona?.(persona),
        danger: true,
      },
    ] : []),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      onClick={() => onCardClick?.(persona)}
      className="pb-card"
    >
      {/* Card top row: name + kebab */}
      <div className="pb-card-top-row">
        <p className="pb-card-name">{persona.name ?? 'Unnamed Persona'}</p>
        <KebabMenu items={kebabItems} />
      </div>

      {/* Location */}
      <p className="pb-card-location">{locationStr}</p>

      <div className="pb-card-spacer" />

      {/* ── Card bottom: confidence left, created-by right ── */}
      <div className="pb-card-bottom">
        {/* LEFT: confidence label + bar stacked */}
        <div className="pb-card-bottom-left">
          <div className="pb-bottom-top-row">
            <span className="pb-confidence-label">Calibration Confidence:</span>
            <span className="pb-confidence-value" style={{ color: textColor }}>
              {confidenceScore !== null ? `${displayScore}%` : '—'}
            </span>
          </div>
          <div className="pb-bottom-bar-row">
            <div className="pb-confidence-bar-track">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(displayScore, 100)}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className={`pb-confidence-bar-fill ${barClass}`}
              />
            </div>
          </div>
        </div>

        {/* RIGHT: Created By */}
        <div className="pb-created-col">
          <span className="pb-created-label">Created By</span>
          {isAI ? (
            <span className="pb-created-omi-pill">
              <span className="pb-omi-pill-avatar">
                <img src={omiDarkImg} alt="Omi" className="pb-omi-pill-video" />
              </span>
              Omi
            </span>
          ) : (
            <span className="pb-created-value">{createdBy}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// ── CountryGroup ──────────────────────────────────────────────────────────────

interface CountryGroupProps {
  country: string;
  personas: SavedPersona[];
  onPersonaClick: (persona: SavedPersona) => void;
  onCreateNew: () => void;
  onViewPersona: (persona: SavedPersona) => void;
  onReplicatePersona: (persona: SavedPersona) => void;
  onReplicateGroup: (country: string) => void;
  onDeletePersona: (persona: SavedPersona) => void;
  showCreateNew: boolean;
  totalPersonaCount: number;
  isViewOnly?: boolean;
}

const CountryGroup: React.FC<CountryGroupProps> = ({
  country,
  personas,
  onPersonaClick,
  onCreateNew,
  onViewPersona,
  onReplicatePersona,
  onReplicateGroup,
  onDeletePersona,
  showCreateNew,
  totalPersonaCount,
  isViewOnly = false,
}) => {
  const countryKebabItems = isViewOnly ? [] : [
    {
      label: 'Replicate Personas',
      icon: <TbCopy size={14} />,
      onClick: () => onReplicateGroup(country),
    },
  ];

  return (
    <div className="pb-country-group">
      <div className="pb-country-header">
        <span className="pb-country-name">{country}</span>
        <KebabMenu items={countryKebabItems} />
      </div>

      <div className="pb-personas-grid">
        {personas.map((persona, idx) => (
          <motion.div
            key={persona.id ?? idx}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + idx * 0.055 }}
          >
            <PersonaGridCard
              persona={persona}
              onCardClick={onPersonaClick}
              onViewPersona={onViewPersona}
              onReplicatePersona={onReplicatePersona}
              onDeletePersona={onDeletePersona}
              isViewOnly={isViewOnly}
            />
          </motion.div>
        ))}

        {showCreateNew && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + personas.length * 0.055 }}
          >
            <PersonaGridCard isCreateNew onCreateNew={onCreateNew} />
          </motion.div>
        )}
      </div>
    </div>
  );
};

// ── PersonasReadyGrid ─────────────────────────────────────────────────────────

interface PersonasReadyGridProps {
  savedPersonas: SavedPersona[];
  onPersonaClick: (persona: SavedPersona) => void;
  onCreateNew: () => void;
  onExplorationMethod: () => void;
  onDownload: () => void;
  isLoadingMethod: boolean;
  onViewPersona: (persona: SavedPersona) => void;
  onReplicatePersona: (persona: SavedPersona) => void;
  onReplicateGroup: (country: string) => void;
  onDeletePersona: (persona: SavedPersona) => void;
  isFreeUser: boolean;
  isViewOnly?: boolean;
}

const PersonasReadyGrid: React.FC<PersonasReadyGridProps> = ({
  savedPersonas,
  onPersonaClick,
  onCreateNew,
  onExplorationMethod,
  onDownload,
  isLoadingMethod,
  onViewPersona,
  onReplicatePersona,
  onReplicateGroup,
  onDeletePersona,
  isFreeUser,
  isViewOnly = false,
}) => {
  const getPersonaCountry = (persona: SavedPersona): string => {
    const rawCountry = persona.location_country ?? persona.geography ?? 'Other';
    const country = String(rawCountry).trim();
    return country || 'Other';
  };

  const isReplicatedPersona = (persona: SavedPersona): boolean => (
    Boolean(persona.parent_persona_id) ||
    persona.persona_source === 'replicated' ||
    Boolean(persona.replication_mode) ||
    Boolean((persona.persona_details as Record<string, unknown> | undefined)?.replication_mode)
  );

  const originalIndexById = new Map(
    savedPersonas.map((persona, index) => [persona.id, index])
  );

  const grouped = savedPersonas.reduce<Record<string, SavedPersona[]>>((acc, persona) => {
    const country = getPersonaCountry(persona);
    if (!acc[country]) acc[country] = [];
    acc[country].push(persona);
    return acc;
  }, {});

  for (const personas of Object.values(grouped)) {
    personas.sort((a, b) => {
      const replicatedDiff = Number(isReplicatedPersona(a)) - Number(isReplicatedPersona(b));
      if (replicatedDiff !== 0) return replicatedDiff;
      return (originalIndexById.get(a.id) ?? 0) - (originalIndexById.get(b.id) ?? 0);
    });
  }

  const countryKeys = Object.keys(grouped).sort((a, b) => {
    const aHasPrimary = grouped[a]!.some(persona => !isReplicatedPersona(persona));
    const bHasPrimary = grouped[b]!.some(persona => !isReplicatedPersona(persona));
    if (aHasPrimary !== bHasPrimary) return aHasPrimary ? -1 : 1;

    const firstIndex = (country: string) => Math.min(
      ...grouped[country]!.map(persona => originalIndexById.get(persona.id) ?? Number.MAX_SAFE_INTEGER)
    );
    return firstIndex(a) - firstIndex(b);
  });
  const totalCount = savedPersonas.length;

  const freeAtLimit = isFreeUser && totalCount >= FREE_PERSONA_LIMIT;

  return (
    <div className="pb-grid-page">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        className="pb-omi-avatar-wrap"
      >
        <video
          src={omiVideoSrc}
          autoPlay
          loop
          muted
          playsInline
          className="pb-omi-video"
        />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="pb-grid-heading"
      >
        Your Personas are ready
      </motion.h2>

      <div className="pb-groups-container">
        {countryKeys.map((country, groupIdx) => {
          const isLast = groupIdx === countryKeys.length - 1;
          const showCreateNew = isLast && !freeAtLimit && !isViewOnly;
          return (
            <motion.div
              key={country}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + groupIdx * 0.08 }}
            >
              <CountryGroup
                country={country}
                personas={grouped[country]!}
                onPersonaClick={onPersonaClick}
                onCreateNew={onCreateNew}
                onViewPersona={onViewPersona}
                onReplicatePersona={onReplicatePersona}
                onReplicateGroup={onReplicateGroup}
                onDeletePersona={onDeletePersona}
                showCreateNew={showCreateNew}
                totalPersonaCount={totalCount}
                isViewOnly={isViewOnly}
              />
            </motion.div>
          );
        })}

        {countryKeys.length === 0 && (
          <div className="pb-empty-state">
            <p className="pb-empty-state__title">No personas yet</p>
            <p className="pb-empty-state__subtitle">
              Get started by creating your first persona — Omi can build one for you.
            </p>
            {!isViewOnly && (
              <div className="pb-personas-grid">
                <PersonaGridCard isCreateNew onCreateNew={onCreateNew} />
              </div>
            )}
          </div>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="pb-action-bar"
      >
        <button className="pb-download-btn" onClick={onDownload}>
          Download Persona Card <SpIcon name="sp-File-Cloud_Download" />
        </button>

        <button
          onClick={onExplorationMethod}
          disabled={isLoadingMethod}
          className={`pb-exploration-btn${isLoadingMethod ? ' pb-exploration-btn--loading' : ''}`}
        >
          {isLoadingMethod && <TbLoader size={16} className="pb-btn-spinner" />}
          Exploration Method
          <TbChevronRight size={16} />
        </button>
      </motion.div>
    </div>
  );
};

// ── Main PersonaBuilder Component ─────────────────────────────────────────────

const PersonaBuilder: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaceId, objectiveId } = useParams<{
    workspaceId: string;
    objectiveId: string;
  }>();
  const { theme: _theme } = useTheme();

  const fromLoader = !!(location.state as Record<string, unknown>)?.fromLoader;
  const isViewOnly = Boolean((location.state as Record<string, unknown>)?.viewOnly);
  const [showGrid, setShowGrid] = useState(fromLoader);

  // ── Tier-gating ────────────────────────────────────────────────────────────
  const { user } = useSelector((state: RootState) => state.auth);
  const userTier = (user?.account_tier ?? 'free').toLowerCase().trim();
  const isFreeUser = userTier === 'free';
  const isTier1User = userTier === 'tier1' || userTier === 'explorer';
  const isFreeOrTier1 = isFreeUser || isTier1User;
  const basePersonaLimitForTier = isFreeOrTier1 ? FREE_PERSONA_LIMIT : PERSONA_LIMIT;

  // Enterprise users get the "Build Manually" option (mirrors AddResearchObjective)
  const isEnterpriseUser = userTier === 'enterprise' || userTier === 'enterprise_admin';

  // Modal for tier1 users who want to buy more personas ($49 each)
  const [showAddPersonaModal, setShowAddPersonaModal] = useState(false);

  const {
    personas: fetchedPersonas,
    personaQuota: fetchedPersonaQuota,
    refetchPersonaQuota,
    submitCompletePersona,
    isSubmitting,
    validateTraits,
  } = usePersonaBuilder(workspaceId, objectiveId);

  const {
    data: autoGeneratedData,
    isLoading: isGeneratingPersonas,
    refetch: generatePersonas,
  } = useAutoGeneratePersonas(workspaceId, objectiveId, { enabled: false });

  const savedPersonasFromAPI: SavedPersona[] = Array.isArray(fetchedPersonas)
    ? (fetchedPersonas as SavedPersona[])
    : (((fetchedPersonas as Record<string, unknown>)?.data as SavedPersona[]) ?? []);
  const quotaData = ((fetchedPersonaQuota as Record<string, unknown>)?.data ?? {}) as Record<string, unknown>;
  const personaLimitForTier = Number(quotaData.limit ?? basePersonaLimitForTier) || basePersonaLimitForTier;

  useEffect(() => {
    setShowGrid(true);
  }, []);

  const personaMap = useRef<Record<string, SavedPersona>>({});
  useEffect(() => {
    personaMap.current = savedPersonasFromAPI.reduce<Record<string, SavedPersona>>(
      (map, persona) => {
        if (persona.id) map[persona.id] = persona;
        return map;
      },
      {}
    );
  }, [savedPersonasFromAPI]);

  const { trigger } = useOmniWorkflow();

  useEffect(() => {
    if (objectiveId) {
      trigger({ stage: 'persona_builder', event: 'PERSONA_WORKFLOW_LOADED', payload: {} });
    }
  }, [objectiveId]);

  const tabs: string[] = ['Persona', ...Object.keys(contentData as Record<string, unknown>).filter(t => t !== 'Persona')];
  const [activeTab, setActiveTab] = useState<string>('Demographics');
  const [isTraitLoading, setIsTraitLoading] = useState(false);

  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [newPersonaName, setNewPersonaName] = useState('');
  const [isNewPersona, setIsNewPersona] = useState(false);
  const [showBackstoryPopup, setShowBackstoryPopup] = useState(false);
  const [backstory, setBackstory] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const [personaIds, setPersonaIds] = useState<string[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [personaDataById, setPersonaDataById] = useState<Record<string, PersonaData>>({});

  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);
  const [validationError, setValidationError] = useState<ValidationError | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [isNavigatingToPreview, setIsNavigatingToPreview] = useState(false);
  const [isMockGenerating, setIsMockGenerating] = useState(false);

  // Modal states
  const [showAddNewPersonaModal, setShowAddNewPersonaModal] = useState(false);
  const [showReplicateModal, setShowReplicateModal] = useState(false);
  const [replicatePreSelectedPersona, setReplicatePreSelectedPersona] = useState<SavedPersona | null>(null);
  const [isReplicating, setIsReplicating] = useState(false);
  const [replicateError, setReplicateError] = useState('');
  const [anchorPreview, setAnchorPreview] = useState<AnchorPreviewData | null>(null);
  const [deletingPersonaId, setDeletingPersonaId] = useState<string | null>(null);
  const [pendingDeletePersona, setPendingDeletePersona] = useState<SavedPersona | null>(null);
  const [deletePersonaError, setDeletePersonaError] = useState('');

  // ── NEW: method selection modal ────────────────────────────────────────────
  const [showMethodModal, setShowMethodModal] = useState(false);

  const processedPersonaRef = useRef(new Set<string>());
  const isReplicatingRef = useRef(false);
  const hasInitializedRef = useRef(false);

  const updatePersonaMutation = useUpdatePersona(workspaceId, objectiveId, selectedPersonaId);
  const isUpdating = updatePersonaMutation.isPending;
  const deletePersonaMutation = useDeletePersona(workspaceId, objectiveId);
  const updateExplorationMethodMutation = useUpdateExplorationMethod();
  const { data: explorationData } = useExploration(objectiveId);

  const exploration = (explorationData as Record<string, unknown>)?.data ?? explorationData as Record<string, unknown> | undefined;
  const currentApproach = (exploration as Record<string, unknown> | undefined)?.research_approach as string | undefined;
  const isApproachLocked = !!((exploration as Record<string, unknown> | undefined)?.is_qualitative || (exploration as Record<string, unknown> | undefined)?.is_quantitative);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showDownloadToast, setShowDownloadToast] = useState(false);

  const handleDownloadPersonaCards = async (selectedIds: string[]) => {
    await downloadPersonaCardsFrontend(
      selectedIds,
      savedPersonasFromAPI as unknown as PersonaCardData[]
    );
    setShowDownloadToast(true);
    setTimeout(() => setShowDownloadToast(false), 3500);
  };

  // ── formatPersonaData ───────────────────────────────────────────────────────

  const formatPersonaData = useCallback((persona: SavedPersona): PersonaData => {
    const details: Record<string, unknown> = (persona.persona_details ?? {}) as Record<string, unknown>;
    return {
      name: (persona.name ?? (details.name as string) ?? 'Unnamed Persona'),
      'Age': (persona.age_range ?? details.age_range ?? '') as string,
      'Gender': (persona.gender ?? details.gender ?? '') as string,
      'Geography': (persona.geography ?? persona.location_country ?? persona.location_state ?? details.geography ?? details.location_country ?? '') as string,
      'Education Level': ((persona as Record<string, unknown>).education_level ?? details.education_level ?? '') as string,
      'Occupation / Employment Type': ((persona as Record<string, unknown>).occupation ?? details.occupation ?? '') as string,
      'Income Level': ((persona as Record<string, unknown>).income_range ?? details.income_range ?? '') as string,
      'backstory': ((persona as Record<string, unknown>).backstory ?? details.backstory ?? '') as string,
      'id': persona.id,
      'Family Structure': ((persona as Record<string, unknown>).family_size ?? details.family_size ?? '') as string,
      'Lifestyle': ((persona as Record<string, unknown>).lifestyle ?? details.lifestyle ?? '') as string,
      'Hobbies': ((persona as Record<string, unknown>).hobbies ?? details.hobbies ?? '') as string,
      'Marital Status': ((persona as Record<string, unknown>).marital_status ?? details.marital_status ?? '') as string,
      'Daily Rhythm': ((persona as Record<string, unknown>).daily_rhythm ?? details.daily_rhythm ?? '') as string,
      'Values': ((persona as Record<string, unknown>).values ?? details.values ?? '') as string,
      'Personality': ((persona as Record<string, unknown>).personality ?? details.personality ?? '') as string,
      'Interests': ((persona as Record<string, unknown>).interests ?? details.interests ?? '') as string,
      'Motivations': ((persona as Record<string, unknown>).motivations ?? details.motivations ?? '') as string,
      'Brand Sensitivity': ((persona as Record<string, unknown>).brand_sensitivity ?? (persona as Record<string, unknown>).brand_sensitivity_detailed ?? details.brand_sensitivity ?? '') as string,
      'Price Sensitivity': ((persona as Record<string, unknown>).price_sensitivity ?? (persona as Record<string, unknown>).price_sensitivity_general ?? details.price_sensitivity ?? '') as string,
      'Preferences': ((persona as Record<string, unknown>).preferences ?? details.preferences ?? '') as string,
      'Digital Activity': ((persona as Record<string, unknown>).digital_activity ?? details.digital_activity ?? '') as string,
      'Professional Traits': ((persona as Record<string, unknown>).professional_traits ?? details.professional_traits ?? '') as string,
      'Mobility': ((persona as Record<string, unknown>).mobility ?? details.mobility ?? '') as string,
      'Home Ownership': ((persona as Record<string, unknown>).accommodation ?? details.accommodation ?? '') as string,
      'Decision Making Style': ((persona as Record<string, unknown>).decision_making_style ?? (persona as Record<string, unknown>).decision_making_style_1 ?? details.decision_making_style ?? '') as string,
      'Purchase Frequency': ((persona as Record<string, unknown>).purchase_frequency ?? details.purchase_frequency ?? '') as string,
      'Purchase Channel': ((persona as Record<string, unknown>).purchase_channel ?? (persona as Record<string, unknown>).purchase_channel_detailed ?? details.purchase_channel ?? '') as string,
      'Price Sensitivity Profile': ((persona as Record<string, unknown>).price_sensitivity_profile ?? details.price_sensitivity_profile ?? '') as string,
      'Loyalty / Switching Behavior': ((persona as Record<string, unknown>).loyalty_behavior ?? details.loyalty_behavior ?? '') as string,
      'Purchase Triggers & Occasions': ((persona as Record<string, unknown>).purchase_triggers ?? details.purchase_triggers ?? '') as string,
      'Purchase Barriers': ((persona as Record<string, unknown>).purchase_barriers ?? details.purchase_barriers ?? '') as string,
      'Decision-Making Style': ((persona as Record<string, unknown>).decision_making_style_2 ?? details.decision_making_style_2 ?? '') as string,
      'Media Consumption Patterns': ((persona as Record<string, unknown>).media_consumption ?? details.media_consumption ?? '') as string,
      'Digital Behavior': ((persona as Record<string, unknown>).digital_behavior ?? (persona as Record<string, unknown>).digital_behavior_detailed ?? details.digital_behavior ?? '') as string,
      'Purchase patterns': ((persona as Record<string, unknown>).purchase_patterns ?? details.purchase_patterns ?? '') as string,
      'Purchase channel': ((persona as Record<string, unknown>).purchase_channel ?? details.purchase_channel ?? '') as string,
      'isAI': (persona.auto_generated_persona ?? false),
      'isAIGenerated': (persona.auto_generated_persona ?? false),
      'isSaved': true,
    };
  }, []);

  // ── Initialize from saved personas ─────────────────────────────────────────

  useEffect(() => {
    if (savedPersonasFromAPI?.length > 0 && !hasInitializedRef.current) {
      const ids = savedPersonasFromAPI.map(p => p.id).filter((id): id is string => !!id);
      const initialPersonaData: Record<string, PersonaData> = {};
      savedPersonasFromAPI.forEach(p => {
        if (p.id && !initialPersonaData[p.id]) {
          initialPersonaData[p.id] = formatPersonaData(p);
        }
      });
      setPersonaIds(ids);
      setPersonaDataById(initialPersonaData);
      if (!selectedPersonaId && ids.length > 0) setSelectedPersonaId(ids[0] ?? null);
      hasInitializedRef.current = true;
    } else if (savedPersonasFromAPI?.length === 0) {
      hasInitializedRef.current = false;
    }
  }, [savedPersonasFromAPI, formatPersonaData, selectedPersonaId]);

  // ── Handle auto-generated personas ─────────────────────────────────────────

  useEffect(() => {
    const generated = ((autoGeneratedData as Record<string, unknown>)?.data as Record<string, unknown>)?.consumer_personas as Record<string, unknown>[] | undefined;
    if (!generated || generated.length === 0) return;

    const dataSignature = JSON.stringify(generated.map(p => p.name));
    if (processedPersonaRef.current.has(dataSignature)) return;

    const newPersonaData: Record<string, PersonaData> = {};
    const newPersonaIds: string[] = [];

    generated.forEach((persona, index) => {
      const personaId = `ai-generated-${Date.now()}-${index}`;
      const personaKey = `${persona.name as string}-${persona.age_range as string}`;
      if (processedPersonaRef.current.has(personaKey)) return;

      const isAlreadySaved = savedPersonasFromAPI.some(
        saved => saved.name === persona.name && (saved as Record<string, unknown>).age_range === persona.age_range
      );
      if (isAlreadySaved) return;

      newPersonaIds.push(personaId);
      processedPersonaRef.current.add(personaKey);

      newPersonaData[personaId] = {
        name: (persona.name as string) ?? 'AI Persona',
        'Age': (persona.age_range as string) ?? '',
        'Gender': (persona.gender as string) ?? '',
        'Geography': (persona.geography as string) ?? (persona.location_country as string) ?? (persona.location_state as string) ?? '',
        'Education Level': (persona.education_level as string) ?? '',
        'Occupation / Employment Type': (persona.occupation as string) ?? '',
        'Income Level': (persona.income_range as string) ?? '',
        'backstory': (persona.backstory as string) ?? '',
        'id': personaId,
        'isAI': true,
        'isAIGenerated': true,
        'isSaved': false,
        originalData: persona as unknown as SavedPersona,
      };
    });

    if (newPersonaIds.length > 0) {
      setPersonaIds(prev => [...prev, ...newPersonaIds]);
      setPersonaDataById(prev => ({ ...prev, ...newPersonaData }));
      const firstId = newPersonaIds[0];
      if (firstId) setSelectedPersonaId(firstId);
      setIsNewPersona(false);
      if (isNavigatingToPreview && firstId) {
        navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-preview/${firstId}`);
        setIsNavigatingToPreview(false);
      }
      processedPersonaRef.current.add(dataSignature);
    } else {
      setIsNavigatingToPreview(false);
    }
  }, [autoGeneratedData, savedPersonasFromAPI, isNavigatingToPreview, workspaceId, objectiveId, navigate]);

  useEffect(() => () => {
    processedPersonaRef.current.clear();
    hasInitializedRef.current = false;
  }, []);

  void isNewPersona;

  // ── Grid view handlers ──────────────────────────────────────────────────────

  const handleGridPersonaClick = useCallback((persona: SavedPersona) => {
    if (persona.id) {
      if (persona.calibration_status === 'draft') {
        navigate(
          `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-generating`,
          { state: { flow: 'manual', personaId: persona.id } }
        );
        return;
      }
      navigate(
        `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-preview/${persona.id}`,
        { state: { personaId: persona.id, personaName: persona.name, fromGrid: true } }
      );
    }
  }, [navigate, workspaceId, objectiveId]);

  const handleGridCreateNew = useCallback(() => {
    if (isFreeUser && savedPersonasFromAPI.length >= FREE_PERSONA_LIMIT) return;

    if (isTier1User && savedPersonasFromAPI.length >= personaLimitForTier) {
      setShowAddPersonaModal(true);
      return;
    }

    if (!isFreeOrTier1 && savedPersonasFromAPI.length >= personaLimitForTier) {
      setShowAddNewPersonaModal(true);
      return;
    }

    setShowMethodModal(true);
  }, [isFreeUser, isTier1User, isEnterpriseUser, savedPersonasFromAPI.length]);

  const handleCreateWithOmi = useCallback(() => {
    trigger({ stage: 'persona_builder', event: 'PERSONA_WORKFLOW_LOADED', payload: {} });

    try { generatePersonas(); } catch (err) { console.error('Failed to kick off persona generation:', err); }

    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-generating`,
      { state: { flow: 'omi' } }
    );
  }, [isFreeUser, isTier1User, isFreeOrTier1, personaLimitForTier, savedPersonasFromAPI.length, generatePersonas, navigate, workspaceId, objectiveId]);

  const handleBuildManually = useCallback(() => {
    if (!isEnterpriseUser) {
      return;
    }
    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder/manual`,
      { state: { flow: 'manual', viewOnly: isViewOnly } }
    );
  }, [isEnterpriseUser, navigate, workspaceId, objectiveId, isViewOnly]);

  const handleAddNewPersonaConfirm = async (count: number) => {
    if (!workspaceId || !objectiveId) return;

    try {
      await personaService.purchasePersonas(workspaceId, objectiveId, count);
      await refetchPersonaQuota();
      await queryClient.invalidateQueries({ queryKey: personaKeys.list(workspaceId, objectiveId) });
      setShowAddNewPersonaModal(false);
      setShowMethodModal(true);
    } catch (error) {
      console.error('Failed to add persona credits:', error);
    }
  };

  // ── Replicate handlers ──────────────────────────────────────────────────────

  const handleViewPersona = useCallback((persona: SavedPersona) => {
    handleGridPersonaClick(persona);
  }, [handleGridPersonaClick]);

  const handleReplicatePersona = useCallback((persona: SavedPersona) => {
    setReplicateError('');
    setAnchorPreview(null);
    setReplicatePreSelectedPersona(persona);
    setShowReplicateModal(true);
  }, []);

  const handleReplicateGroup = useCallback((_country: string) => {
    setReplicateError('');
    setAnchorPreview(null);
    setReplicatePreSelectedPersona(null);
    setShowReplicateModal(true);
  }, []);

  const extractReplicationError = (error: unknown): string => {
    const err = error as {
      message?: string;
      response?: {
        data?: {
          detail?: string | { message?: string; detail?: string };
          message?: string;
        };
      };
    };
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (detail && typeof detail === 'object') {
      if (typeof detail.message === 'string' && detail.message.trim()) return detail.message;
      if (typeof detail.detail === 'string' && detail.detail.trim()) return detail.detail;
    }
    const responseMessage = err?.response?.data?.message;
    if (typeof responseMessage === 'string' && responseMessage.trim()) return responseMessage;
    if (typeof err?.message === 'string' && err.message.trim()) return err.message;
    return 'Replication failed. Please try again.';
  };

  const handleDeletePersona = useCallback((persona: SavedPersona) => {
    if (!persona.id || deletingPersonaId) return;
    setDeletePersonaError('');
    setPendingDeletePersona(persona);
  }, [deletingPersonaId]);

  const handleConfirmDeletePersona = useCallback(async () => {
    const persona = pendingDeletePersona;
    if (!persona?.id || deletingPersonaId) return;

    setDeletingPersonaId(persona.id);
    setDeletePersonaError('');
    try {
      type DeleteFn = (id: string) => Promise<unknown>;
      await (deletePersonaMutation.mutateAsync as unknown as DeleteFn)(persona.id);

      setPersonaIds(prev => prev.filter(id => id !== persona.id));
      setPersonaDataById(prev => {
        const next = { ...prev };
        delete next[persona.id as string];
        return next;
      });

      if (selectedPersonaId === persona.id) {
        const nextPersona = savedPersonasFromAPI.find(p => p.id && p.id !== persona.id);
        setSelectedPersonaId(nextPersona?.id ?? null);
      }

      await queryClient.invalidateQueries({
        queryKey: personaKeys.list(workspaceId, objectiveId),
      });
      setPendingDeletePersona(null);
    } catch (error) {
      console.error('Failed to delete persona:', error);
      setDeletePersonaError('Failed to delete persona. Please try again.');
    } finally {
      setDeletingPersonaId(null);
    }
  }, [
    deletePersonaMutation.mutateAsync,
    deletingPersonaId,
    objectiveId,
    pendingDeletePersona,
    queryClient,
    savedPersonasFromAPI,
    selectedPersonaId,
    workspaceId,
  ]);

  const handleReplicateConfirm = async (
    selectedPersonaIds: string[],
    country: string,
    mode: ReplicationMode,
    seedInputs: string
  ) => {
    if (!workspaceId || !objectiveId || selectedPersonaIds.length === 0 || !country) return;
    if (isReplicatingRef.current) return;

    isReplicatingRef.current = true;
    setIsReplicating(true);
    setReplicateError('');
    setAnchorPreview(null);

    try { trigger({ stage: 'persona_builder', event: 'PERSONA_WORKFLOW_LOADED', payload: {} }); }
    catch (e) { console.warn('Workflow trigger failed (non-critical):', e); }

    try {
      if (mode === 'anchor_preview') {
        const previewPersonaId = selectedPersonaIds[0];
        if (!previewPersonaId) return;
        const response = await personaService.replicatePersona(
          workspaceId,
          objectiveId,
          previewPersonaId,
          country,
          { mode, seedInputs }
        );
        setAnchorPreview((response?.data ?? null) as AnchorPreviewData | null);
        return;
      }

      const results = await Promise.allSettled(
        selectedPersonaIds.map(personaId =>
          personaService.replicatePersona(
            workspaceId,
            objectiveId,
            personaId,
            country,
            { mode, seedInputs }
          )
        )
      );

      const succeeded = results.filter(
        (r): r is PromiseFulfilledResult<{ data?: { id?: string } }> => r.status === 'fulfilled'
      );
      const failed = results.filter(r => r.status === 'rejected');

      if (succeeded.length === 0) {
        const reason = (failed[0] as PromiseRejectedResult).reason;
        setReplicateError(extractReplicationError(reason));
        return;
      }

      if (failed.length > 0) {
        console.warn(`${failed.length} of ${results.length} replication(s) failed.`);
      }

      setShowReplicateModal(false);
      setReplicatePreSelectedPersona(null);
      setReplicateError('');

      await queryClient.invalidateQueries({
        queryKey: personaKeys.list(workspaceId, objectiveId),
      });

      setShowGrid(true);
      navigate(
        `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`,
        { replace: true }
      );
    } catch (error: unknown) {
      console.error('Unexpected error during replication:', error);
      setReplicateError(extractReplicationError(error));
    } finally {
      isReplicatingRef.current = false;
      setIsReplicating(false);
    }
  };

  // ── Persona builder handlers ────────────────────────────────────────────────

  const handleAddPersona = () => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newName = `Persona ${personaIds.length + 1}`;
    setPersonaIds(prev => [...prev, tempId]);
    setPersonaDataById(prev => ({
      ...prev,
      [tempId]: { name: newName, isAI: false, isAIGenerated: false, isSaved: false, id: tempId },
    }));
    setSelectedPersonaId(tempId);
    setIsNewPersona(true);
    trigger({ stage: 'persona_builder', event: 'TRAIT_SELECTION_STARTED', payload: {} });
  };

  const handleSelectPersona = (id: string) => {
    const persona = personaDataById[id];
    const savedPersona = savedPersonasFromAPI?.find(p => p.id?.toString() === id?.toString());
    const isAIType = !!(
      persona?.isAI || persona?.isAIGenerated ||
      savedPersona?.auto_generated_persona ||
      id?.toLowerCase().includes('ai') ||
      id?.toLowerCase().includes('mock')
    );
    if (isAIType) handlePreviewPersona(id);
    else { setSelectedPersonaId(id); setIsNewPersona(false); }
  };

  const handleAIGenerate = async () => {
    try {
      const usablePersonaCount = savedPersonasFromAPI.filter(p => p?.calibration_status !== "draft").length;
      if (usablePersonaCount >= personaLimitForTier) {
        setShowGrid(true);
        return;
      }

      setIsMockGenerating(true);
      setIsNavigatingToPreview(true);
      await generatePersonas();
      queryClient.invalidateQueries({ queryKey: personaKeys.list(workspaceId, objectiveId) });
    } catch (error) {
      console.error('Failed to generate AI personas:', error);
      setIsNavigatingToPreview(false);
    } finally {
      setIsMockGenerating(false);
    }
  };

  const personas = useCallback(
    () => personaIds.map(id => personaDataById[id]?.name ?? 'Unnamed'),
    [personaIds, personaDataById]
  );

  const handleBack = useCallback(
    () => navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/research-mode`),
    [navigate, workspaceId, objectiveId]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedHandleAIGenerate = useCallback(handleAIGenerate, [personaIds, personaDataById, generatePersonas]);

  const handleItemClick = (category: string, item: string) => {
    const persona = personaDataById[selectedPersonaId ?? ''];
    const isAIType = !!(
      persona?.isAI || persona?.isAIGenerated ||
      selectedPersonaId?.toLowerCase().includes('ai') ||
      selectedPersonaId?.toLowerCase().includes('mock')
    );
    if (isAIType) return;
    if (editingItem && editingItem.item === item) setEditingItem(null);
    else setEditingItem({ category, item });
  };

  const handleSave = (selectedOption: unknown) => {
    if (!selectedPersonaId || !editingItem) return;
    setPersonaDataById(prev => ({
      ...prev,
      [selectedPersonaId]: { ...prev[selectedPersonaId], [editingItem.item]: selectedOption } as PersonaData,
    }));
    if (!(multiSelectAttributes as string[]).includes(editingItem.item)) setEditingItem(null);
  };

  const handleTabChange = async (tab: string) => {
    if (tab === 'Persona' || tab === activeTab) {
      setIsTraitLoading(true);
      setActiveTab(tab);
      setEditingItem(null);
      setTimeout(() => setIsTraitLoading(false), 600);
      return;
    }
    setIsTraitLoading(true);
    setTimeout(() => setIsTraitLoading(false), 600);

    const currentData: PersonaData = personaDataById[selectedPersonaId ?? ''] ?? {} as PersonaData;
    const currentTraitGroup = (traitGroupMapping as Record<string, string>)[activeTab];
    const persona = personaDataById[selectedPersonaId ?? ''];
    const isAIType = !!(
      persona?.isAI || persona?.isAIGenerated ||
      selectedPersonaId?.toLowerCase().includes('ai') ||
      selectedPersonaId?.toLowerCase().includes('mock')
    );
    const hasSummary = (explorationData as Record<string, unknown>)?.data
      ? ((explorationData as Record<string, unknown>).data as Record<string, unknown>)?.summary
      : (explorationData as Record<string, unknown>)?.summary;

    if (!isAIType && hasSummary && currentTraitGroup && (contentData as Record<string, unknown>)[activeTab]) {
      const traitsToValidate: Record<string, unknown> = {};
      let hasTraitsToValidate = false;

      ((contentData as Record<string, { items: string[] }>)[activeTab])?.items?.forEach((traitName: string) => {
        if (currentData[traitName]) {
          const backendTraitName = (traitNameMapping as Record<string, string>)[traitName]
            ?? traitName.toLowerCase().replace(/ /g, '_');
          let value = currentData[traitName] as string;
          if (traitName === 'Gender') value = value.toLowerCase();
          if (traitName === 'Geography') value = value.toLowerCase();
          if (traitName === 'Income') value = value.replace(/\$|\+/g, '').trim();
          traitsToValidate[backendTraitName] = value;
          hasTraitsToValidate = true;
        }
      });

      if (hasTraitsToValidate) {
        try {
          type ValidateTraitsFn = (args: {
            objectiveId: string | undefined;
            traitGroup: string;
            traits: Record<string, unknown>;
          }) => Promise<{ group_valid: boolean; results: unknown; total_response: string; group: string }>;

          const result = await (validateTraits as unknown as ValidateTraitsFn)({
            objectiveId,
            traitGroup: currentTraitGroup,
            traits: traitsToValidate,
          });

          if (!result.group_valid) {
            setValidationError({
              results: result.results,
              total_response: result.total_response,
              group: result.group,
              fromTab: activeTab,
              toTab: tab,
            });
            if (result.total_response) {
              trigger({ stage: 'persona_builder', event: 'TRAIT_VALIDATION_RESULT', payload: { issue: [result.total_response] } });
            }
            setShowValidationModal(true);
            return;
          }
        } catch (error) {
          console.error(`Validation failed for ${currentTraitGroup}:`, error);
        }
      }
    }
    setActiveTab(tab);
    setEditingItem(null);
  };

  const handleValidationModalContinue = () => {
    if (validationError?.toTab) setActiveTab(validationError.toTab);
    setShowValidationModal(false);
    setValidationError(null);
    trigger({ stage: 'persona_builder', event: 'TRAIT_SELECTION_STARTED', payload: {} });
  };

  const handleValidationModalClose = () => {
    setShowValidationModal(false);
    setValidationError(null);
    trigger({ stage: 'persona_builder', event: 'TRAIT_SELECTION_STARTED', payload: {} });
  };

  const handleDoubleClick = (id: string) => {
    const persona = personaDataById[id];
    const isAIType = !!(
      persona?.isAI || persona?.isAIGenerated ||
      id?.toLowerCase().includes('ai') ||
      id?.toLowerCase().includes('mock')
    );
    if (isAIType) return;
    setEditingPersonaId(id);
    setNewPersonaName(personaDataById[id]?.name ?? '');
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => setNewPersonaName(e.target.value);

  const handleNameBlur = () => {
    if (!editingPersonaId) return;
    if (!newPersonaName.trim()) { setEditingPersonaId(null); return; }
    setPersonaDataById(prev => ({
      ...prev,
      [editingPersonaId]: { ...prev[editingPersonaId], name: newPersonaName.trim() } as PersonaData,
    }));
    setEditingPersonaId(null);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleNameBlur();
    if (e.key === 'Escape') setEditingPersonaId(null);
  };

  const handleSubmit = async () => {
    if (!selectedPersonaId) return;
    trigger({ stage: 'persona_builder', event: 'BACKSTORY_STARTED', payload: {} });
    const savedPersona = savedPersonasFromAPI?.find(p => p.id?.toString() === selectedPersonaId?.toString());
    const currentPersonaData = personaDataById[selectedPersonaId];
    const isAIType = !!(
      currentPersonaData?.isAI || currentPersonaData?.isAIGenerated ||
      selectedPersonaId?.toLowerCase().includes('ai') ||
      selectedPersonaId?.toLowerCase().includes('mock')
    );
    if (isAIType) {
      setBackstory((currentPersonaData?.backstory as string) ?? '');
      handleBackstorySubmit();
      return;
    }
    if (!savedPersona || currentPersonaData?.isSaved === false) {
      setPendingAction('submit');
      setShowBackstoryPopup(true);
      setBackstory((currentPersonaData?.backstory as string) ?? '');
    } else {
      setPendingAction('update');
      setBackstory((currentPersonaData?.backstory as string) ?? '');
      handleBackstorySubmit();
    }
  };

  const handleDiscussionGuidelines = () => {
    if (isApproachLocked) {
      if (
        (exploration as Record<string, unknown> | undefined)?.is_quantitative &&
        !(exploration as Record<string, unknown> | undefined)?.is_qualitative
      ) {
        navigate(
          `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/population-builder`,
          { state: { researchApproach: 'quantitative', viewOnly: isViewOnly } }
        );
      } else {
        navigate(
          `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/depth-interview`,
          {
            state: {
              researchApproach:
                (exploration as Record<string, unknown> | undefined)?.is_qualitative &&
                  (exploration as Record<string, unknown> | undefined)?.is_quantitative
                  ? 'both'
                  : 'qualitative',
              viewOnly: isViewOnly,
            },
          }
        );
      }
      return;
    }

    navigate(
      `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/approach-selection`,
      {
        state: {
          backPath: `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`,
        },
      }
    );
  };

  const handleApproachSelect = async (approach: string) => {
    try {
      const methodData = {
        is_qualitative: approach === 'qualitative' || approach === 'both',
        is_quantitative: approach === 'quantitative' || approach === 'both',
      };
      type UpdateFn = (args: { id: string | undefined; data: typeof methodData }) => Promise<unknown>;
      await (updateExplorationMethodMutation.mutateAsync as unknown as UpdateFn)({ id: objectiveId, data: methodData });
      if (objectiveId) localStorage.setItem(`approach_${objectiveId}`, approach.toLowerCase().trim());

      if (approach === 'quantitative') {
        navigate(
          `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/population-builder`,
          { state: { researchApproach: approach, viewOnly: isViewOnly } }
        );
      } else {
        navigate(
          `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/depth-interview`,
          { state: { researchApproach: approach, viewOnly: isViewOnly } }
        );
      }
      trigger({ stage: 'persona_builder', event: 'RESEARCH_APPROACH_SELECTED', payload: { approach } });
    } catch (error) {
      console.error('Failed to update research approach:', error);
    }
  };

  const handleBackstorySubmit = async () => {
    const data: PersonaData = personaDataById[selectedPersonaId ?? ''] ?? { name: selectedPersonaId ?? '' };
    const isAIType = !!(
      data?.isAI || data?.isAIGenerated ||
      selectedPersonaId?.toLowerCase().includes('ai') ||
      selectedPersonaId?.toLowerCase().includes('mock')
    );

    const personaPayload: Record<string, unknown> = {
      name: data.name ?? selectedPersonaId,
      age_range: (data['Age'] as string) ?? '',
      gender: (data['Gender'] as string) ?? '',
      location_country: (data['Geography'] as string) ?? '',
      location_state: '',
      education_level: (data['Education Level'] as string) ?? '',
      occupation: (data['Occupation / Employment Type'] as string) ?? '',
      income_range: (data['Income Level'] as string) ?? '',
      family_size: (data['Family Structure'] as string) ?? '',
      geography: (data['Geography'] as string) ?? '',
      lifestyle: (data['Lifestyle'] as string) ?? '',
      values: Array.isArray(data['Values']) ? data['Values'] : (data['Values'] ? [data['Values']] : []),
      personality: Array.isArray(data['Personality']) ? data['Personality'] : (data['Personality'] ? [data['Personality']] : []),
      interests: (data['Interests'] as string) ?? '',
      motivations: (data['Motivations'] as string) ?? '',
      brand_sensitivity: (data['Brand Sensitivity'] as string) ?? '',
      brand_sensitivity_detailed: (data['Brand Sensitivity'] as string) ?? '',
      price_sensitivity: (data['Price Sensitivity'] as string) ?? '',
      price_sensitivity_general: (data['Price Sensitivity'] as string) ?? '',
      decision_making_style: (data['Decision Making Style'] as string) ?? '',
      decision_making_style_1: (data['Decision Making Style'] as string) ?? '',
      purchase_patterns: (data['Purchase patterns'] as string) ?? '',
      purchase_channel: (data['Purchase Channel'] as string) ?? (data['Purchase channel'] as string) ?? '',
      purchase_channel_detailed: (data['Purchase Channel'] as string) ?? (data['Purchase channel'] as string) ?? '',
      mobility: (data['Mobility'] as string) ?? '',
      accommodation: (data['Accommodation'] as string) ?? (data['Home Ownership'] as string) ?? '',
      marital_status: (data['Marital Status'] as string) ?? '',
      daily_rhythm: (data['Daily Rhythm'] as string) ?? '',
      hobbies: (data['Hobbies & Interests'] as string) ?? '',
      professional_traits: (data['Professional Traits'] as string) ?? '',
      digital_activity: (data['Digital Activity'] as string) ?? '',
      preferences: (data['Preferences'] as string) ?? '',
      purchase_frequency: (data['Purchase Frequency'] as string) ?? '',
      price_sensitivity_profile: (data['Price Sensitivity Profile'] as string) ?? '',
      loyalty_behavior: (data['Loyalty / Switching Behavior'] as string) ?? '',
      purchase_triggers: (data['Purchase Triggers & Occasions'] as string) ?? '',
      purchase_barriers: (data['Purchase Barriers'] as string) ?? '',
      decision_making_style_2: (data['Decision-Making Style'] as string) ?? '',
      media_consumption: (data['Media Consumption Patterns'] as string) ?? '',
      digital_behavior: (data['Digital Behavior'] as string) ?? '',
      digital_behavior_detailed: (data['Digital Behavior'] as string) ?? '',
      research_objective_id: '',
      exploration_id: objectiveId,
      backstory: backstory || data.backstory || '',
      sample_size: 50,
      auto_generated_persona: isAIType,
    };

    try {
      const savedPersona = savedPersonasFromAPI?.find(p => p.id === selectedPersonaId);
      const currentPersonaData = personaDataById[selectedPersonaId ?? ''];

      if (!savedPersona || currentPersonaData?.isSaved === false) {
        trigger({ stage: 'persona_builder', event: 'PERSONA_CREATION_STARTED', payload: {} });
        type SubmitFn = (payload: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
        const result = await (submitCompletePersona as unknown as SubmitFn)(personaPayload);

        if (result && (result.data as Record<string, unknown>)?.id) {
          trigger({ stage: 'persona_builder', event: 'CREATE_PERSONA', payload: {} });
        }
        if (result && result.id) {
          const newId = result.id as string;
          setPersonaDataById(prev => ({
            ...prev,
            [selectedPersonaId!]: {
              ...prev[selectedPersonaId!], ...data,
              backstory: backstory || (data.backstory as string),
              id: newId, isSaved: true,
            } as PersonaData,
          }));
          if (newId !== selectedPersonaId) {
            setPersonaIds(prev => prev.map(id => id === selectedPersonaId ? newId : id));
            setSelectedPersonaId(newId);
          }
        }
        setShowBackstoryPopup(false);
        setBackstory('');
        hasInitializedRef.current = false;

        if (pendingAction === 'preview') {
          const finalId = (result?.id as string) ?? selectedPersonaId;
          navigate(
            `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-preview/${finalId}`,
            { state: { personaId: finalId, personaName: data.name, personaData: { ...data, backstory } } }
          );
        }
      } else {
        trigger({ stage: 'persona_builder', event: 'PERSONA_UPDATE_STARTED', payload: {} });
        personaPayload.id = selectedPersonaId;
        type UpdateFn = (payload: Record<string, unknown>) => Promise<unknown>;
        const result = await (updatePersonaMutation.mutateAsync as unknown as UpdateFn)(personaPayload);

        if (result) {
          trigger({ stage: 'persona_builder', event: 'PERSONA_UPDATED', payload: { personaId: selectedPersonaId } });
          setPersonaDataById(prev => ({
            ...prev,
            [selectedPersonaId!]: {
              ...prev[selectedPersonaId!], ...data,
              backstory: backstory || (data.backstory as string), isSaved: true,
            } as PersonaData,
          }));
          setShowBackstoryPopup(false);
          setBackstory('');
          hasInitializedRef.current = false;
          if (pendingAction === 'preview') {
            navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-preview/${selectedPersonaId}`);
          }
        }
      }
    } catch (error) {
      console.error(pendingAction === 'update' ? 'Failed to update persona:' : 'Failed to submit persona:', error);
    } finally {
      setPendingAction(null);
    }
  };

  const handlePreviewPersona = (id: string) => {
    const savedPersona = savedPersonasFromAPI?.find(p => p.id?.toString() === id?.toString());
    const personaData = personaDataById[id];

    if (!savedPersona || personaData?.isSaved === false) {
      const isAIType = !!(
        personaData?.isAI || personaData?.isAIGenerated ||
        id?.toLowerCase().includes('ai') ||
        id?.toLowerCase().includes('mock')
      );
      setSelectedPersonaId(id);
      setPendingAction('preview');
      if (isAIType) {
        setBackstory((personaData?.backstory as string) ?? '');
        handleBackstorySubmit();
      } else {
        setShowBackstoryPopup(true);
        setBackstory((personaData?.backstory as string) ?? '');
      }
    } else {
      navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-preview/${id}`);
    }
  };

  const currentPersonaData: PersonaData = personaDataById[selectedPersonaId ?? ''] ?? { name: '' };
  const hasSelectedTraits = Object.keys(optionData as Record<string, unknown>).some(trait => currentPersonaData[trait]);
  const isProcessing = isSubmitting || isUpdating;

  // ── Grid view ───────────────────────────────────────────────────────────────

  if (showGrid) {
    return (
      <>
        <PersonasReadyGrid
          savedPersonas={savedPersonasFromAPI}
          onPersonaClick={handleGridPersonaClick}
          onCreateNew={handleGridCreateNew}
          onExplorationMethod={handleDiscussionGuidelines}
          onDownload={() => setShowDownloadModal(true)}
          isLoadingMethod={updateExplorationMethodMutation.isPending}
          onViewPersona={handleViewPersona}
          onReplicatePersona={handleReplicatePersona}
          onReplicateGroup={handleReplicateGroup}
          onDeletePersona={handleDeletePersona}
          isFreeUser={isFreeUser}
          isViewOnly={isViewOnly}
        />

        <CreatePersonaMethodModal
          show={showMethodModal}
          onClose={() => setShowMethodModal(false)}
          onCreateWithOmi={handleCreateWithOmi}
          onBuildManually={handleBuildManually}
          manualAllowed={isEnterpriseUser}
        />

        <AddNewPersonaModal
          show={showAddNewPersonaModal}
          onClose={() => setShowAddNewPersonaModal(false)}
          onConfirm={handleAddNewPersonaConfirm}
        />

        <ReplicatePersonaModal
          show={showReplicateModal}
          personas={savedPersonasFromAPI}
          onClose={() => {
            if (isReplicating) return;
            isReplicatingRef.current = false;
            setShowReplicateModal(false);
            setReplicatePreSelectedPersona(null);
            setReplicateError('');
            setAnchorPreview(null);
          }}
          onConfirm={handleReplicateConfirm}
          isLoading={isReplicating}
          preSelectedPersona={replicatePreSelectedPersona}
          error={replicateError}
          anchorPreview={anchorPreview}
        />

        <DeletePersonaModal
          persona={pendingDeletePersona}
          isLoading={!!deletingPersonaId}
          error={deletePersonaError}
          onClose={() => {
            if (deletingPersonaId) return;
            setPendingDeletePersona(null);
            setDeletePersonaError('');
          }}
          onConfirm={handleConfirmDeletePersona}
        />

        {workspaceId && objectiveId && (
          <AddPersonaModal
            isOpen={showAddPersonaModal}
            onClose={() => setShowAddPersonaModal(false)}
            onSuccess={async () => {
              setShowAddPersonaModal(false);
              if (isTier1User) {
                navigate(
                  `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-generating`,
                  { state: { flow: "omi" } }
                );
                try {
                  await personaService.getAutoGeneratedPersonas(workspaceId, objectiveId);
                } catch (err) {
                  console.error("Failed to generate paid Omi persona:", err);
                }
              }
              await refetchPersonaQuota();
              await queryClient.invalidateQueries({ queryKey: personaKeys.list(workspaceId, objectiveId) });
              await queryClient.invalidateQueries({ queryKey: personaKeys.listGenerated(workspaceId, objectiveId) });
            }}
            workspaceId={workspaceId}
            objectiveId={objectiveId}
          />
        )}

        <DownloadPersonaCardModal
          show={showDownloadModal}
          personas={savedPersonasFromAPI}
          onClose={() => setShowDownloadModal(false)}
          onDownload={handleDownloadPersonaCards}
        />

        {showDownloadToast && (
          <DownloadSuccessToast onClose={() => setShowDownloadToast(false)} />
        )}
      </>
    );
  }

  return null;
};

export default PersonaBuilder;