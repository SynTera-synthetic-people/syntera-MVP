import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbPlus, TbAlertCircle, TbCheck } from 'react-icons/tb';
import SpIcon from '../../../../../../../SPIcon';
import AttributePillButton from './AttributePillButton';
import { getAttributeOptions, isMultiSelectAttribute } from '../data';
import './AttributeSelectionPanel.css';

interface AttributeSelectionPanelProps {
  attributeName: string;
  currentValue: string | string[] | undefined;
  onSelect: (value: string | string[]) => void;
  disabled?: boolean;
  warning?: string;
}

const GEO_ATTRIBUTE = 'Geography';

// ── Spell-check helpers ───────────────────────────────────────────────────────

// Simple Levenshtein distance
const levenshtein = (a: string, b: string): number => {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
  return dp[m]![n]!;
};

// All known geo values for spell-check — extend as API grows
const GEO_KNOWN_VALUES = [
  // Countries
  'India', 'USA', 'UK', 'Australia', 'Canada', 'Germany', 'France',
  'Japan', 'Singapore', 'UAE',
  // Indian states
  'Gujarat', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Telangana',
  'Rajasthan', 'Delhi', 'West Bengal', 'Uttar Pradesh', 'Kerala',
  // Indian cities — both common spellings/aliases
  'Dahod', 'Ahmedabad', 'Mumbai', 'Bombay', 'Delhi', 'New Delhi',
  'Bangalore', 'Bengaluru', 'Bengaluru', 'Chennai', 'Madras',
  'Kolkata', 'Calcutta', 'Hyderabad', 'Pune', 'Surat', 'Jaipur',
  'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal',
  'Patna', 'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik',
  'Faridabad', 'Meerut', 'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad',
  'Dhanbad', 'Amritsar', 'Navi Mumbai', 'Allahabad', 'Prayagraj',
  'Ranchi', 'Howrah', 'Coimbatore', 'Jabalpur', 'Gwalior', 'Vijayawada',
  'Jodhpur', 'Madurai', 'Raipur', 'Kochi', 'Cochin', 'Chandigarh',
  // US cities
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix',
  'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose',
  'Austin', 'Jacksonville', 'San Francisco', 'Seattle', 'Denver',
  // UK cities
  'London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow',
  'Liverpool', 'Bristol', 'Edinburgh', 'Sheffield', 'Leicester',
];

interface SpellCheckResult {
  type: 'exact' | 'suggestion' | 'unknown';
  suggestion?: string;
}

const spellCheck = (input: string): SpellCheckResult => {
  const trimmed = input.trim();

  // Exact match (case-insensitive)
  const exact = GEO_KNOWN_VALUES.find(
    v => v.toLowerCase() === trimmed.toLowerCase()
  );
  if (exact) return { type: 'exact', suggestion: exact };

  // Find closest match — increased threshold to 3 for longer city names
  let best: string | undefined;
  let bestDist = Infinity;
  for (const known of GEO_KNOWN_VALUES) {
    const dist = levenshtein(trimmed.toLowerCase(), known.toLowerCase());
    if (dist < bestDist) { bestDist = dist; best = known; }
  }

  // Scale threshold with input length: short inputs (≤5 chars) use 2, longer use 3
  const threshold = trimmed.length <= 5 ? 2 : 3;
  if (bestDist <= threshold && best) return { type: 'suggestion', suggestion: best };

  return { type: 'unknown' };
};

// ── Component ─────────────────────────────────────────────────────────────────

const AttributeSelectionPanel: React.FC<AttributeSelectionPanelProps> = ({
  attributeName,
  currentValue,
  onSelect,
  disabled = false,
  warning,
}) => {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Geography custom state
  const [geoCustomValue, setGeoCustomValue] = useState('');
  const [showGeoCustomInput, setShowGeoCustomInput] = useState(false);
  const [geoSpellCheck, setGeoSpellCheck] = useState<SpellCheckResult | null>(null);
  const [geoConfirmedCity, setGeoConfirmedCity] = useState('');

  // Dropdown state
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedCity, setSelectedCity] = useState('');

  const isMultiSelect = isMultiSelectAttribute(attributeName);
  const isGeo = attributeName === GEO_ATTRIBUTE;

  const selectedValues = Array.isArray(currentValue)
    ? currentValue
    : currentValue ? [currentValue] : [];

  // A value added through "Add Custom" isn't in the predefined list, so it has
  // no pill to light up: the panel looked empty even though the value was set
  // (visible whenever this panel remounts — switching sub-tabs, or coming back
  // to a restored draft). Append any such selection so it renders as selected.
  const presetOptions = getAttributeOptions(attributeName);
  const customSelections = selectedValues.filter(
    (value) => value && !presetOptions.includes(value)
  );
  const options = customSelections.length
    ? [...presetOptions, ...customSelections]
    : presetOptions;

  // ── Non-geo pill click ────────────────────────────────────────────────────
  const handlePillClick = (value: string) => {
    if (disabled) return;
    if (isMultiSelect) {
      const next = selectedValues.includes(value)
        ? selectedValues.filter(v => v !== value)
        : [...selectedValues, value];
      onSelect(next);
    } else {
      onSelect(selectedValues.includes(value) ? '' : value);
    }
  };

  // ── Non-geo custom add ────────────────────────────────────────────────────
  const handleAddCustom = () => {
    if (!customValue.trim()) return;
    if (isMultiSelect) {
      onSelect([...selectedValues, customValue.trim()]);
    } else {
      onSelect(customValue.trim());
    }
    setCustomValue('');
    setShowCustomInput(false);
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddCustom(); }
    if (e.key === 'Escape') { setCustomValue(''); setShowCustomInput(false); }
  };

  // ── Geography: dropdown change ────────────────────────────────────────────
  // We store only the city name (most specific) in the value, matching
  // how CategorySummaryCard displays it (single string label).
  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCountry(e.target.value);
    setSelectedState('');
    setSelectedCity('');
    // If no state/city yet, emit country as fallback
    if (e.target.value) onSelect(e.target.value);
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedState(e.target.value);
    setSelectedCity('');
    if (e.target.value) onSelect(e.target.value);
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCity(e.target.value);
    if (e.target.value) onSelect(e.target.value); // Only city shown in summary
  };

  // ── Geography: custom input ───────────────────────────────────────────────
  const handleGeoCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGeoCustomValue(e.target.value);
    setGeoSpellCheck(null); // reset on change
    setGeoConfirmedCity('');
  };

  const handleGeoCustomSubmit = () => {
    if (!geoCustomValue.trim()) return;

    const result = spellCheck(geoCustomValue.trim());
    setGeoSpellCheck(result);

    if (result.type === 'exact') {
      // Perfect match — auto-correct casing silently and commit
      const city = result.suggestion!;
      setGeoConfirmedCity(city);
      onSelect(city);
      setGeoCustomValue('');
      setShowGeoCustomInput(false);
      setGeoSpellCheck(null);
    } else if (result.type === 'suggestion') {
      // Show suggestion prompt — user must confirm or keep original
      setGeoConfirmedCity('');
    } else {
      // Unknown value — still allow, but warn
      setGeoConfirmedCity('');
    }
  };

  const handleGeoCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleGeoCustomSubmit(); }
    if (e.key === 'Escape') { setGeoCustomValue(''); setShowGeoCustomInput(false); setGeoSpellCheck(null); }
  };

  // User accepts the spell-check suggestion
  const handleAcceptSuggestion = () => {
    const city = geoSpellCheck?.suggestion!;
    onSelect(city);
    setGeoCustomValue('');
    setShowGeoCustomInput(false);
    setGeoSpellCheck(null);
    setGeoConfirmedCity(city);
  };

  // User keeps their original (unknown) value as-is
  const handleKeepOriginal = () => {
    const city = geoCustomValue.trim();
    onSelect(city);
    setGeoCustomValue('');
    setShowGeoCustomInput(false);
    setGeoSpellCheck(null);
    setGeoConfirmedCity(city);
  };

  const handleCancelGeoCustom = () => {
    setGeoCustomValue('');
    setShowGeoCustomInput(false);
    setGeoSpellCheck(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="attribute-selection">
      <h3 className="attribute-selection__title">
        Select {attributeName}
        {isMultiSelect && <span className="attribute-selection__badge">Multiple</span>}
        {warning && (
          <span
            className="attribute-selection__warning-icon"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            aria-label={warning}
          >
            <SpIcon name="sp-Warning-Triangle_Warning" />
            <AnimatePresence>
              {showTooltip && (
                <motion.div
                  ref={tooltipRef}
                  className="attribute-selection__tooltip"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                >
                  {warning}
                  <span className="attribute-selection__tooltip-arrow" />
                </motion.div>
              )}
            </AnimatePresence>
          </span>
        )}
      </h3>

      {isGeo ? (
        <div className="attribute-selection__geo-wrap">
          {/* ── Dropdowns row ── */}
          <div className="attribute-selection__geo-row">
            <select
              className="attribute-selection__geo-select"
              disabled={disabled}
              value={selectedCountry}
              onChange={handleCountryChange}
            >
              <option value="">Country</option>
              <option value="India">India</option>
              <option value="USA">USA</option>
              <option value="UK">UK</option>
            </select>

            <select
              className="attribute-selection__geo-select"
              disabled={disabled || !selectedCountry}
              value={selectedState}
              onChange={handleStateChange}
            >
              <option value="">State</option>
              <option value="Gujarat">Gujarat</option>
              <option value="Maharashtra">Maharashtra</option>
            </select>

            <select
              className="attribute-selection__geo-select"
              disabled={disabled || !selectedState}
              value={selectedCity}
              onChange={handleCityChange}
            >
              <option value="">City</option>
              <option value="Dahod">Dahod</option>
              <option value="Ahmedabad">Ahmedabad</option>
            </select>

            <span className="attribute-selection__or">or</span>

            {/* ── Add Custom toggle ── */}
            {!showGeoCustomInput && (
              <button
                className="attribute-selection__add-custom"
                disabled={disabled}
                onClick={() => setShowGeoCustomInput(true)}
              >
                <TbPlus size={14} />
                Add Custom
              </button>
            )}
          </div>

          {/* ── Custom city input ── */}
          <AnimatePresence>
            {showGeoCustomInput && (
              <motion.div
                key="geo-custom"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="attribute-selection__geo-custom-wrap"
              >
                <div className="attribute-selection__custom-input-wrapper">
                  <input
                    type="text"
                    value={geoCustomValue}
                    onChange={handleGeoCustomChange}
                    onKeyDown={handleGeoCustomKeyDown}
                    placeholder="Type a city, state or country…"
                    className={`attribute-selection__custom-input${geoSpellCheck?.type === 'suggestion' ? ' attribute-selection__custom-input--warn' :
                      geoSpellCheck?.type === 'unknown' ? ' attribute-selection__custom-input--warn' : ''
                      }`}
                    autoFocus
                    disabled={disabled}
                  />
                  <button
                    type="button"
                    onClick={handleGeoCustomSubmit}
                    disabled={!geoCustomValue.trim() || disabled}
                    className="attribute-selection__custom-btn attribute-selection__custom-btn--add"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelGeoCustom}
                    className="attribute-selection__custom-btn attribute-selection__custom-btn--cancel"
                  >
                    Cancel
                  </button>
                </div>

                {/* ── Spell-check feedback ── */}
                <AnimatePresence>
                  {geoSpellCheck?.type === 'suggestion' && (
                    <motion.div
                      className="attribute-selection__spell-prompt"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                    >
                      <TbAlertCircle size={15} className="attribute-selection__spell-icon" />
                      <span>
                        Did you mean <strong>{geoSpellCheck.suggestion}</strong>?
                      </span>
                      <button
                        className="attribute-selection__spell-btn attribute-selection__spell-btn--accept"
                        onClick={handleAcceptSuggestion}
                      >
                        <TbCheck size={13} /> Yes, use &ldquo;{geoSpellCheck.suggestion}&rdquo;
                      </button>
                      <button
                        className="attribute-selection__spell-btn attribute-selection__spell-btn--keep"
                        onClick={handleKeepOriginal}
                      >
                        Keep &ldquo;{geoCustomValue.trim()}&rdquo;
                      </button>
                    </motion.div>
                  )}

                  {geoSpellCheck?.type === 'unknown' && (
                    <motion.div
                      className="attribute-selection__spell-prompt attribute-selection__spell-prompt--unknown"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                    >
                      <TbAlertCircle size={15} className="attribute-selection__spell-icon" />
                      <span>
                        &ldquo;{geoCustomValue.trim()}&rdquo; doesn&rsquo;t match any known location.
                        Please check the spelling.
                      </span>
                      <button
                        className="attribute-selection__spell-btn attribute-selection__spell-btn--keep"
                        onClick={handleKeepOriginal}
                      >
                        Add anyway
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* ── All other attributes — pill buttons ── */
        <div className="attribute-selection__pills">
          {options.map((option, i) => (
            <AttributePillButton
              key={`${option}-${i}`}
              label={option}
              value={option}
              isSelected={selectedValues.includes(option)}
              onClick={handlePillClick}
              disabled={disabled}
            />
          ))}

          <span className="attribute-selection__or">or</span>

          <AnimatePresence mode="wait">
            {!showCustomInput ? (
              <motion.button
                key="add-btn"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                type="button"
                onClick={() => setShowCustomInput(true)}
                disabled={disabled}
                className="attribute-selection__add-custom"
              >
                <TbPlus size={14} />
                Add Custom
              </motion.button>
            ) : (
              <motion.div
                key="custom-input"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                className="attribute-selection__custom-input-wrapper"
              >
                <input
                  type="text"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyDown={handleCustomKeyDown}
                  onBlur={() => { if (!customValue.trim()) setShowCustomInput(false); }}
                  placeholder="Type and press Enter"
                  className="attribute-selection__custom-input"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddCustom}
                  disabled={!customValue.trim()}
                  className="attribute-selection__custom-btn attribute-selection__custom-btn--add"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setCustomValue(''); setShowCustomInput(false); }}
                  className="attribute-selection__custom-btn attribute-selection__custom-btn--cancel"
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {isMultiSelect && selectedValues.length > 0 && (
        <p className="attribute-selection__hint">{selectedValues.length} selected</p>
      )}
    </div>
  );
};

export default AttributeSelectionPanel;