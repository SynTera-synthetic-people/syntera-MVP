import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  TbEdit, TbPlus, TbLoader, TbUsers, TbDownload,
  TbChevronRight, TbEye, TbCopy, TbTrash, TbDotsVertical,
  TbMinus, TbInfoCircle, TbCheck, TbX,
} from 'react-icons/tb';
import SpIcon from '../../../../../../SPIcon';
import { motion, AnimatePresence } from 'framer-motion';
import {
  usePersonaBuilder,
  useAutoGeneratePersonas,
  useUpdatePersona,
  personaKeys,
  usePersonaPreview,
} from '../../../../../../../hooks/usePersonaBuilder';
import {
  useUpdateExplorationMethod,
  useExploration,
} from '../../../../../../../hooks/useExplorations';
import { useTheme } from '../../../../../../../context/ThemeContext';
import { useOmniWorkflow } from '../../../../../../../hooks/useOmiWorkflow';
import {
  optionData,
  contentData,
  traitGroupMapping,
  traitNameMapping,
  multiSelectAttributes,
} from './data';

// Components
import Header from './components/Header';
import TabsNavigation from './components/TabsNavigation';
import EmptyState from './components/EmptyState';
import PersonaListItem from './components/PersonaListItem';
import BackstoryModal from './components/BackstoryModal';
import ValidationModal from './components/ValidationModal';
import ApproachSelectionModal from './components/ApproachSelectionPage';
import AttributeItem from './components/AttributeItem';
import SelectionPanel from './components/SelectionPanel';

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
  age_range?: string;
  gender?: string;
  geography?: string;
  location_country?: string;
  location_state?: string;
  confidence_scoring?: {
    confidence_calculation_detail?: { weighted_total?: number };
    score?: number;
  };
  confidence_score?: number;
  calibration_confidence?: number;
  persona_details?: Record<string, unknown>;
  [key: string]: unknown;
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
const getConfidenceScore = (persona: SavedPersona): number | null => {
  const raw =
    persona.confidence_scoring?.confidence_calculation_detail?.weighted_total ??
    persona.confidence_scoring?.score ??
    persona.confidence_score ??
    persona.calibration_confidence ??
    (persona as any).confidence ??
    null;
  if (raw === null || raw === undefined) return null;
  const num = Number(raw);
  if (isNaN(num)) return null;
  return Math.round(num <= 1 ? num * 100 : num);
};

const getConfidenceBarClass = (score: number): string => {
  if (score >= 80) return 'pb-confidence-bar--green';
  if (score >= 60) return 'pb-confidence-bar--amber';
  return 'pb-confidence-bar--red';
};

const getConfidenceTextColor = (score: number): string => {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
};

// ── KebabMenu ────────────────────────────────────────────────────────────────

interface KebabMenuProps {
  items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[];
}

const KebabMenu: React.FC<KebabMenuProps> = ({ items }) => {
  const [open, setOpen] = useState(false);
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

const AddNewPersonaModal: React.FC<AddNewPersonaModalProps> = ({ show, onClose, onConfirm }) => {
  const [count, setCount] = useState(1);
  const pricePerPersona = 199;
  const total = 99; // as shown in figma (discounted total)

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

// ── ReplicatePersonaModal ─────────────────────────────────────────────────────

interface ReplicatePersonaModalProps {
  show: boolean;
  personas: SavedPersona[];
  onClose: () => void;
  onConfirm: (selectedPersonaIds: string[], country: string) => void;
  isLoading?: boolean;
  preSelectedPersona?: SavedPersona | null;
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
  show, personas, onClose, onConfirm, isLoading, preSelectedPersona
}) => {
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>(
    preSelectedPersona ? [preSelectedPersona.id] : []
  );
  const [selectedCountry, setSelectedCountry] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [personaDropdownOpen, setPersonaDropdownOpen] = useState(false);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);

  useEffect(() => {
    if (preSelectedPersona) setSelectedPersonaIds([preSelectedPersona.id]);
  }, [preSelectedPersona]);

  const togglePersona = (id: string) => {
    setSelectedPersonaIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const removePersona = (id: string) => {
    setSelectedPersonaIds(prev => prev.filter(p => p !== id));
  };

  const selectedCountryObj = COUNTRIES.find(c => c.code === selectedCountry);
  const additionalCount = selectedPersonaIds.length || 3;
  const priceEach = 49;

  const canConfirm = selectedPersonaIds.length > 0 && selectedCountry && agreed;

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

            {/* Persona selector */}
            <div className="pb-dropdown-wrap">
              <button
                className="pb-dropdown-btn"
                onClick={() => { setPersonaDropdownOpen(o => !o); setCountryDropdownOpen(false); }}
              >
                <span className="pb-dropdown-placeholder">Choose Personas</span>
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
              {/* Tags */}
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

            {/* Pricing */}
            <div className="pb-pricing-box" style={{ marginTop: 16 }}>
              <div className="pb-pricing-row">
                <span>Additional Personas  x  {additionalCount}</span>
                <span>${priceEach} each</span>
              </div>
              <div className="pb-pricing-divider" />
              <div className="pb-pricing-row pb-pricing-row--total">
                <span>Total</span>
                <span>${priceEach}</span>
              </div>
            </div>

            {/* Warning */}
            <div className="pb-warning-box">
              <SpIcon name="sp-Warning-Octagon_Warning" size={16} className="pb-warning-icon" />
              <p className="pb-warning-text">
                Additional personas will be added to this exploration. The corresponding cost will be included in your next billing cycle.
              </p>
            </div>

            {/* Agreement */}
            <label className="pb-agree-row">
              <div
                className={`pb-checkbox${agreed ? ' pb-checkbox--checked' : ''}`}
                onClick={() => setAgreed(a => !a)}
              >
                {agreed && <TbCheck size={12} />}
              </div>
              <span className="pb-agree-text">I understand and agree to the additional cost.</span>
            </label>

            {/* Actions */}
            <div className="pb-modal-actions">
              <button className="pb-modal-cancel-btn" onClick={onClose}>Cancel</button>
              <button
                className={`pb-modal-primary-btn${!canConfirm ? ' pb-modal-primary-btn--disabled' : ''}`}
                disabled={!canConfirm || isLoading}
                onClick={() => canConfirm && onConfirm(selectedPersonaIds, selectedCountry)}
              >
                {isLoading ? <TbLoader size={14} className="pb-btn-spinner" /> : null}
                Add & Calibrate
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
}

const PersonaGridCard: React.FC<PersonaGridCardProps> = ({
  persona,
  onCardClick,
  isCreateNew = false,
  onCreateNew,
  onViewPersona,
  onReplicatePersona,
  onDeletePersona,
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

  const isAI = persona.auto_generated_persona;
  const createdBy = persona.created_by_name ?? persona.created_by ?? 'You';

  const kebabItems = [
    {
      label: 'View Persona',
      icon: <TbEye size={14} />,
      onClick: () => onViewPersona?.(persona),
    },
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

      <div className="pb-card-bottom">
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
}) => {
  const countryKebabItems = [
    {
      label: 'Replicate Personas',
      icon: <TbCopy size={14} />,
      onClick: () => onReplicateGroup(country),
    },
  ];

  return (
    <div className="pb-country-group">
      {/* Country header */}
      <div className="pb-country-header">
        <span className="pb-country-name">{country}</span>
        <KebabMenu items={countryKebabItems} />
      </div>

      {/* Cards grid */}
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
            />
          </motion.div>
        ))}

        {/* "Create New Persona" tile — only in last group or if showCreateNew */}
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
}) => {
  // Group personas by country — prefer location_country (clean country name),
  // fall back to geography only if location_country is absent.
  const grouped = savedPersonas.reduce<Record<string, SavedPersona[]>>((acc, persona) => {
    const country = persona.location_country ?? persona.geography ?? 'Other';
    if (!acc[country]) acc[country] = [];
    acc[country].push(persona);
    return acc;
  }, {});

  const countryKeys = Object.keys(grouped);
  const totalCount = savedPersonas.length;

  return (
    <div className="pb-grid-page">
      {/* Hero Omi avatar */}
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

      {/* Heading */}
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="pb-grid-heading"
      >
        Your Personas are ready
      </motion.h2>

      {/* Country groups */}
      <div className="pb-groups-container">
        {countryKeys.map((country, groupIdx) => {
          const isLast = groupIdx === countryKeys.length - 1;
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
                showCreateNew={isLast}
                totalPersonaCount={totalCount}
              />
            </motion.div>
          );
        })}

        {/* If no personas yet, just show create tile */}
        {countryKeys.length === 0 && (
          <div className="pb-personas-grid">
            <PersonaGridCard isCreateNew onCreateNew={onCreateNew} />
          </div>
        )}
      </div>

      {/* Bottom action bar */}
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
  const [showGrid, setShowGrid] = useState(fromLoader);

  const {
    personas: fetchedPersonas,
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

  useEffect(() => {
    if (fromLoader && savedPersonasFromAPI.length > 0) {
      setShowGrid(true);
    }
  }, [fromLoader, savedPersonasFromAPI.length]);

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

  // New modal states
  const [showAddNewPersonaModal, setShowAddNewPersonaModal] = useState(false);
  const [showReplicateModal, setShowReplicateModal] = useState(false);
  const [replicatePreSelectedPersona, setReplicatePreSelectedPersona] = useState<SavedPersona | null>(null);
  const [isReplicating, setIsReplicating] = useState(false);

  const processedPersonaRef = useRef(new Set<string>());
  const hasInitializedRef = useRef(false);

  const updatePersonaMutation = useUpdatePersona(workspaceId, objectiveId, selectedPersonaId);
  const isUpdating = updatePersonaMutation.isPending;
  const updateExplorationMethodMutation = useUpdateExplorationMethod();
  const { data: explorationData } = useExploration(objectiveId);

  const exploration = (explorationData as Record<string, unknown>)?.data ?? explorationData as Record<string, unknown> | undefined;
  const currentApproach = (exploration as Record<string, unknown> | undefined)?.research_approach as string | undefined;
  const isApproachLocked = !!((exploration as Record<string, unknown> | undefined)?.is_qualitative || (exploration as Record<string, unknown> | undefined)?.is_quantitative);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showDownloadToast, setShowDownloadToast] = useState(false);

  const handleDownloadPersonaCards = async (selectedIds: string[]) => {
    // TODO: trigger actual download/export logic here
    // e.g. await downloadPersonaCards(selectedIds);
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
      navigate(
        `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-preview/${persona.id}`,
        { state: { personaId: persona.id, personaName: persona.name, fromGrid: true } }
      );
    }
  }, [navigate, workspaceId, objectiveId]);

  // When "Create New Persona" tile clicked: check limit
  const handleGridCreateNew = useCallback(() => {
    if (savedPersonasFromAPI.length >= PERSONA_LIMIT) {
      setShowAddNewPersonaModal(true);
    } else {
      setShowGrid(false);
      handleAddPersona();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPersonasFromAPI.length]);

  const handleAddNewPersonaConfirm = (count: number) => {
    setShowAddNewPersonaModal(false);
    // Navigate to persona builder or handle paid persona creation
    setShowGrid(false);
    handleAddPersona();
  };

  // ── Replicate handlers ──────────────────────────────────────────────────────

  const handleViewPersona = useCallback((persona: SavedPersona) => {
    handleGridPersonaClick(persona);
  }, [handleGridPersonaClick]);

  const handleReplicatePersona = useCallback((persona: SavedPersona) => {
    setReplicatePreSelectedPersona(persona);
    setShowReplicateModal(true);
  }, []);

  const handleReplicateGroup = useCallback((_country: string) => {
    setReplicatePreSelectedPersona(null);
    setShowReplicateModal(true);
  }, []);

  const handleDeletePersona = useCallback((persona: SavedPersona) => {
    // TODO: implement delete API call
    console.log('Delete persona:', persona.id);
  }, []);

  const handleReplicateConfirm = async (selectedPersonaIds: string[], country: string) => {
    setIsReplicating(true);
    try {
      trigger({
        stage: 'persona_builder',
        event: 'PERSONA_WORKFLOW_LOADED',
        payload: {},
      });

      // Fire persona generation (same as "Create with Omi" in AddResearchObjective)
      try {
        await generatePersonas();
      } catch (err) {
        console.error('Failed to kick off persona generation:', err);
      }

      setShowReplicateModal(false);

      // Navigate to persona generation loader
      navigate(
        `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-generating`,
        { state: { flow: 'replicate', personaIds: selectedPersonaIds, country } }
      );
    } catch (error) {
      console.error('Failed to replicate personas:', error);
    } finally {
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
          { state: { researchApproach: 'quantitative' } }
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
          { state: { researchApproach: approach } }
        );
      } else {
        navigate(
          `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/depth-interview`,
          { state: { researchApproach: approach } }
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
        onDownload={() => setShowDownloadModal(true)}   // ← changed
        isLoadingMethod={updateExplorationMethodMutation.isPending}
        onViewPersona={handleViewPersona}
        onReplicatePersona={handleReplicatePersona}
        onReplicateGroup={handleReplicateGroup}
        onDeletePersona={handleDeletePersona}
      />

      <AddNewPersonaModal
        show={showAddNewPersonaModal}
        onClose={() => setShowAddNewPersonaModal(false)}
        onConfirm={handleAddNewPersonaConfirm}
      />

      <ReplicatePersonaModal
        show={showReplicateModal}
        personas={savedPersonasFromAPI}
        onClose={() => { setShowReplicateModal(false); setReplicatePreSelectedPersona(null); }}
        onConfirm={handleReplicateConfirm}
        isLoading={isReplicating}
        preSelectedPersona={replicatePreSelectedPersona}
      />

      {/* ── Download modal ── */}
      <DownloadPersonaCardModal
        show={showDownloadModal}
        personas={savedPersonasFromAPI}
        onClose={() => setShowDownloadModal(false)}
        onDownload={handleDownloadPersonaCards}
      />

      {/* ── Download success toast ── */}
      {showDownloadToast && (
        <DownloadSuccessToast onClose={() => setShowDownloadToast(false)} />
      )}
    </>
  );
}

  // ── Trait builder view ──────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-8 relative min-h-[calc(100vh-100px)] flex flex-col">
      <div className="max-w-7xl mx-auto relative z-10 w-full flex-grow flex flex-col">

        <Header
          personas={personas()}
          onBack={handleBack}
          onAIGenerate={memoizedHandleAIGenerate}
          isGeneratingAI={isGeneratingPersonas}
          showAIGenerate={personaIds.length > 0}
        />

        {savedPersonasFromAPI.length > 0 && (
          <button className="pb-view-all-btn" onClick={() => setShowGrid(true)}>
            <TbUsers size={14} />
            View all personas ({savedPersonasFromAPI.length})
          </button>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/95 dark:bg-white/5 backdrop-blur-xl border-2 border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden p-6 md:p-8 min-h-[600px] relative z-10"
        >
          {personaIds.length > 0 && (
            <TabsNavigation tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />
          )}

          {personaIds.length === 0 ? (
            <EmptyState
              onAddPersona={handleAddPersona}
              onAIGenerate={memoizedHandleAIGenerate}
              isGeneratingAI={isGeneratingPersonas || isMockGenerating}
            />
          ) : (
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="w-full lg:w-64 flex-shrink-0 space-y-4 bg-gray-50/50 dark:bg-black/10 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                <div className="space-y-2">
                  {personaIds.map(id => {
                    const persona = personaDataById[id];
                    if (!persona) return null;
                    return (
                      <PersonaListItem
                        key={id}
                        name={persona.name}
                        isSelected={selectedPersonaId === id}
                        isEditing={editingPersonaId === id}
                        newName={newPersonaName}
                        isAIPersona={!!(persona.isAI || persona.isAIGenerated)}
                        savedPersona={savedPersonasFromAPI?.find(p => p.id === id)}
                        onSelect={() => handleSelectPersona(id)}
                        onDoubleClick={() => handleDoubleClick(id)}
                        onNameChange={handleNameChange}
                        onNameBlur={handleNameBlur}
                        onNameKeyDown={handleNameKeyDown}
                        onPreview={() => handlePreviewPersona(id)}
                        onEditClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          handleDoubleClick(id);
                        }}
                      />
                    );
                  })}
                </div>

                <button
                  onClick={handleAddPersona}
                  className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed transition-all font-medium ${personaIds.length === 0
                    ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20'
                    : 'border-gray-300 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-blue-500 dark:hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-400'
                    }`}
                >
                  <TbPlus size={20} />
                  <span>{personaIds.length === 0 ? 'Create Your First Persona' : 'Add Persona'}</span>
                </button>
              </div>

              <div className="flex-grow flex flex-col gap-6">
                <div className="flex-grow flex flex-col md:flex-row gap-8 bg-gray-50/80 dark:bg-black/10 p-6 rounded-2xl border border-gray-100 dark:border-white/5 h-full relative min-h-[500px]">
                  {isTraitLoading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-gray-50/50 dark:bg-black/20 backdrop-blur-sm rounded-2xl">
                      <TbLoader className="animate-spin text-blue-600 dark:text-blue-400 mb-4" size={48} />
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400 animate-pulse">
                        Loading attributes...
                      </p>
                    </div>
                  ) : (
                    <>
                      {activeTab !== 'Persona' && (
                        <div className={`w-full flex-shrink-0 space-y-3 transition-all duration-300 ${editingItem ? 'md:w-64' : 'md:w-[440px]'}`}>
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Attributes</h3>
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={activeTab}
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -20 }}
                              className={`grid gap-3 transition-all duration-300 ${editingItem ? 'grid-cols-1' : 'grid-cols-2'}`}
                            >
                              {((contentData as Record<string, { items: string[] }>)[activeTab])?.items?.map((item: string) => {
                                const isAIPersona = !!(
                                  currentPersonaData?.isAI || currentPersonaData?.isAIGenerated ||
                                  selectedPersonaId?.toLowerCase().includes('ai') ||
                                  selectedPersonaId?.toLowerCase().includes('mock')
                                );
                                return (
                                  <AttributeItem
                                    key={item}
                                    item={item}
                                    currentValue={currentPersonaData[item]}
                                    isEditing={editingItem?.item === item}
                                    onClick={() => handleItemClick(activeTab, item)}
                                    disabled={isAIPersona}
                                  />
                                );
                              })}
                            </motion.div>
                          </AnimatePresence>
                        </div>
                      )}

                      <SelectionPanel
                        editingItem={editingItem}
                        currentValue={currentPersonaData[editingItem?.item ?? '']}
                        onSelect={handleSave}
                      />

                      {!editingItem && activeTab !== 'Persona' && (
                        <div className="flex-grow flex items-center justify-center p-12 text-center text-gray-500 dark:text-gray-400 bg-gray-50/50 dark:bg-white/5 rounded-2xl border border-dashed border-gray-200 dark:border-white/10">
                          <div>
                            <TbEdit size={48} className="mx-auto mb-4 opacity-20" />
                            <p>Select an attribute on the left to configure it.</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="flex gap-2 justify-end">
                  {!currentPersonaData?.isAI && !currentPersonaData?.isAIGenerated && (
                    <button
                      onClick={handleSubmit}
                      disabled={isProcessing || !hasSelectedTraits}
                      className="flex items-center gap-2 px-10 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? 'Processing...' : currentPersonaData.isSaved ? 'Update' : 'Submit'}
                    </button>
                  )}
                  {savedPersonasFromAPI.length > 0 && (
                    <button
                      onClick={handleDiscussionGuidelines}
                      disabled={updateExplorationMethodMutation.isPending}
                      className="flex items-center gap-2 px-10 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {updateExplorationMethodMutation.isPending ? 'Processing...' : 'Next step'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <BackstoryModal
        show={showBackstoryPopup}
        selectedPersona={currentPersonaData.name ?? selectedPersonaId}
        backstory={backstory}
        isSubmitting={isProcessing}
        onBackstoryChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBackstory(e.target.value)}
        onSubmit={handleBackstorySubmit}
        onClose={() => setShowBackstoryPopup(false)}
      />

      <ValidationModal
        show={showValidationModal}
        validationError={validationError}
        onContinue={handleValidationModalContinue}
        onClose={handleValidationModalClose}
      />
    </div>
  );
};

export default PersonaBuilder;