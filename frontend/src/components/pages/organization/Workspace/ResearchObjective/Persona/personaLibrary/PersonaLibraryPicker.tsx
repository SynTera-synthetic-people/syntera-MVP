// ══════════════════════════════════════════════════════════════════════════════
// PersonaLibraryPicker — choose previously saved personas to reuse.
//
// Reached from the "Choose From Library" CTA after the Research Objective is
// confirmed. The library is a live view over every calibrated persona the
// organisation already owns — nothing has to be saved into it first. Selected
// personas are copied into this exploration, then the user lands on the
// existing PersonaBuilder grid where the normal flow continues unchanged
// (generate the rest with Omi, or build manually).
//
// Reuses PersonaBuilder.css so the page is visually identical to the persona
// grid; only the selection affordances live in PersonaLibraryPicker.css.
// ══════════════════════════════════════════════════════════════════════════════

import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  TbCheck, TbChevronLeft, TbChevronRight, TbLoader,
  TbAlertTriangle, TbSearch, TbBooks,
} from 'react-icons/tb';
import { toast } from 'react-toastify';

import {
  usePersonaLibrary,
  useImportPersonasFromLibrary,
} from '../../../../../../../hooks/usePersonaLibrary';
import { usePersonaQuota } from '../../../../../../../hooks/usePersonaBuilder';
import {
  getConfidenceBarClass,
  getConfidenceTextColor,
} from '../personaBuilder/PersonaBuilderShared';

import '../personaBuilder/PersonaBuilder.css';
import './PersonaLibraryPicker.css';

import omiVideoSrc from '../../../../../../../assets/Omi Animations/Omi Micro-Celebration_Lite.mp4';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LibraryItem {
  id: string;
  name?: string;
  description?: string | null;
  origin_exploration_title?: string | null;
  origin_workspace_name?: string | null;
  age_range?: string | null;
  gender?: string | null;
  location_state?: string | null;
  geography?: string | null;
  occupation?: string | null;
  income_range?: string | null;
  master_calibration_confidence?: number | null;
  times_reused?: number;
  created_by_name?: string | null;
  already_imported?: boolean;
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface CardProps {
  item: LibraryItem;
  selected: boolean;
  disabled: boolean;
  disabledReason?: string;
  onToggle: () => void;
}

const LibraryCard: React.FC<CardProps> = ({
  item, selected, disabled, disabledReason, onToggle,
}) => {
  const score = item.master_calibration_confidence ?? null;
  const displayScore = score ?? 0;
  const location =
    [item.location_state, item.geography].filter(Boolean).join(', ') || 'Location unavailable';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={disabled ? undefined : { y: -2 }}
      onClick={() => !disabled && onToggle()}
      role="checkbox"
      aria-checked={selected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
      }}
      title={disabled ? disabledReason : undefined}
      className={[
        'pb-card',
        'plb-card',
        selected ? 'plb-card--selected' : '',
        disabled ? 'plb-card--disabled' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="pb-card-top-row">
        <div className="plb-title-row">
          <span className={`plb-check ${selected ? 'plb-check--on' : ''}`}>
            {selected && <TbCheck size={13} strokeWidth={3} />}
          </span>
          <p className="pb-card-name">{item.name ?? 'Unnamed Persona'}</p>
        </div>

        {item.already_imported && (
          <span className="plb-pill plb-pill--added">
            <TbCheck size={11} /> Added
          </span>
        )}
      </div>

      <p className="pb-card-location">{location}</p>

      <p className="plb-origin">
        Used in:{' '}
        <span>{item.origin_exploration_title || 'Unknown exploration'}</span>
      </p>

      {(item.age_range || item.gender || item.occupation) && (
        <p className="plb-meta">
          {[item.age_range, item.gender, item.occupation].filter(Boolean).join(' · ')}
        </p>
      )}

      <div className="pb-card-spacer" />

      <div className="pb-card-bottom">
        <div className="pb-card-bottom-left">
          <div className="pb-bottom-top-row">
            <span className="pb-confidence-label">Calibration Confidence:</span>
            <span
              className="pb-confidence-value"
              style={{ color: getConfidenceTextColor(displayScore) }}
            >
              {score !== null ? `${displayScore}%` : '—'}
            </span>
          </div>
          <div className="pb-bottom-bar-row">
            <div className="pb-confidence-bar-track">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(displayScore, 100)}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className={`pb-confidence-bar-fill ${getConfidenceBarClass(displayScore)}`}
              />
            </div>
          </div>
        </div>

        <div className="pb-created-col">
          <span className="pb-created-label">Reused</span>
          <span className="pb-created-value">{item.times_reused ?? 0}×</span>
        </div>
      </div>
    </motion.div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const PersonaLibraryPicker: React.FC = () => {
  const navigate = useNavigate();
  const { workspaceId, objectiveId } = useParams<{
    workspaceId: string;
    objectiveId: string;
  }>();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const builderPath =
    `/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`;

  const {
    data: libraryResponse,
    isLoading,
    isError,
    error,
    refetch,
  } = usePersonaLibrary(workspaceId, { explorationId: objectiveId });

  const { data: quotaResponse } = usePersonaQuota(workspaceId, objectiveId);
  const importMutation = useImportPersonasFromLibrary(workspaceId, objectiveId);

  const items: LibraryItem[] = useMemo(() => {
    const data = (libraryResponse as Record<string, any>)?.data;
    return Array.isArray(data?.items) ? data.items : [];
  }, [libraryResponse]);

  const quota = ((quotaResponse as Record<string, any>)?.data ?? {}) as Record<string, number>;
  const limit = Number(quota.limit ?? 0) || 0;
  const used = Number(quota.used ?? 0) || 0;
  const remaining = limit > 0 ? Math.max(limit - used, 0) : Number.POSITIVE_INFINITY;

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) =>
      [i.name, i.origin_exploration_title, i.occupation, i.geography]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [items, search]);

  const atCapacity = selectedIds.length >= remaining;

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const disabledStateFor = (item: LibraryItem): string | undefined => {
    if (item.already_imported) return 'Already added to this exploration';
    if (!selectedIds.includes(item.id) && atCapacity) {
      return `This exploration allows ${limit} personas`;
    }
    return undefined;
  };

  const handleUseSelected = async () => {
    if (!selectedIds.length || importMutation.isPending) return;
    try {
      const response: any = await importMutation.mutateAsync(selectedIds);
      const payload = response?.data ?? {};
      const importedCount = Array.isArray(payload.imported) ? payload.imported.length : 0;
      const skipped = Array.isArray(payload.skipped) ? payload.skipped : [];

      if (importedCount > 0) {
        toast.success(response?.message ?? `${importedCount} personas added`);
      }
      // Surface the first skip reason so a partial import is never silent.
      if (skipped.length > 0) {
        toast.info(skipped[0]?.message ?? 'Some personas could not be added');
      }
      if (importedCount === 0) {
        return; // stay on the page so the user can adjust the selection
      }

      navigate(builderPath, { state: { fromLoader: true, flow: 'library' } });
    } catch (err: any) {
      const message =
        err?.response?.data?.detail?.message ??
        err?.response?.data?.message ??
        'Could not add personas from the library. Please try again.';
      toast.error(message);
    }
  };

  // ── States ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="pb-grid-page">
        <div className="plb-status">
          <TbLoader size={26} className="plb-spin" />
          <p className="plb-status-text">Loading your persona library…</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="pb-grid-page">
        <div className="plb-status">
          <TbAlertTriangle size={26} className="plb-status-icon-warn" />
          <p className="pb-empty-state__title">Couldn’t load the persona library</p>
          <p className="pb-empty-state__subtitle">
            {(error as any)?.response?.data?.detail?.message ??
              'Something went wrong fetching your saved personas.'}
          </p>
          <div className="pb-action-bar plb-action-bar--center">
            <button className="pb-download-btn" onClick={() => navigate(-1)}>
              <TbChevronLeft size={16} /> Back
            </button>
            <button className="pb-exploration-btn" onClick={() => refetch()}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const libraryIsEmpty = items.length === 0;

  return (
    <div className="pb-grid-page">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        className="pb-omi-avatar-wrap"
      >
        <video src={omiVideoSrc} autoPlay loop muted playsInline className="pb-omi-video" />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="pb-grid-heading"
      >
        Reuse a persona from your organisation
      </motion.h2>

      {libraryIsEmpty ? (
        <div className="pb-groups-container">
          <div className="pb-country-group">
            <div className="pb-empty-state">
              <TbBooks size={30} className="plb-empty-icon" />
              <p className="pb-empty-state__title">No personas to reuse yet</p>
              <p className="pb-empty-state__subtitle">
                Personas appear here automatically once they have been calibrated in another
                exploration in your organisation. Create your first set and they will be
                available to reuse next time.
              </p>
              <button className="pb-exploration-btn" onClick={() => navigate(builderPath)}>
                Go to personas <TbChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="plb-toolbar">
            <div className="plb-search">
              <TbSearch size={15} />
              <input
                type="text"
                value={search}
                placeholder="Search personas…"
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search persona library"
              />
            </div>

            <span className="plb-spacer" />

            {limit > 0 && (
              <span className="plb-counter">
                {selectedIds.length} selected · {Math.max(remaining - selectedIds.length, 0)} of{' '}
                {limit} slots left
              </span>
            )}
          </div>

          <div className="pb-groups-container">
            <div className="pb-country-group">
              {visible.length === 0 ? (
                <div className="pb-empty-state">
                  <p className="pb-empty-state__title">No matches</p>
                  <p className="pb-empty-state__subtitle">
                    No saved personas match “{search}”.
                  </p>
                </div>
              ) : (
                <div className="pb-personas-grid">
                  {visible.map((item, idx) => {
                    const reason = disabledStateFor(item);
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 + idx * 0.05 }}
                      >
                        <LibraryCard
                          item={item}
                          selected={selectedIds.includes(item.id)}
                          disabled={!!reason}
                          disabledReason={reason}
                          onToggle={() => toggle(item.id)}
                        />
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="pb-action-bar"
          >
            <button
              className="pb-download-btn"
              onClick={() => navigate(-1)}
              disabled={importMutation.isPending}
            >
              <TbChevronLeft size={16} /> Back
            </button>

            <button
              className="pb-exploration-btn"
              onClick={handleUseSelected}
              disabled={selectedIds.length === 0 || importMutation.isPending}
            >
              {importMutation.isPending ? (
                <>
                  <TbLoader size={16} className="plb-spin" /> Adding…
                </>
              ) : (
                <>
                  Use Selected {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
                  <TbChevronRight size={16} />
                </>
              )}
            </button>
          </motion.div>
        </>
      )}
    </div>
  );
};

export default PersonaLibraryPicker;
