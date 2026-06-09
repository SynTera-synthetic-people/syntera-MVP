import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TbX, TbArrowLeft } from 'react-icons/tb';
import SpIcon from '../../../../../../SPIcon';
import PersonaRoom from '../../PersonaRoom';
import DecisionRoom, { type FlowType } from '../../DecisionRoom';
import './ConversationStudioModal.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type RoomMode = null | 'persona' | 'decision';

interface ConversationStudioModalProps {
  workspaceId: string;
  objectiveId: string;
  /** Pass 'qual' for qualitative flow, 'quant' for quantitative flow.
   *  Defaults to 'qual' so existing call-sites without this prop keep working. */
  flow?: FlowType;
  onClose: () => void;
}

// ── Room option card data ─────────────────────────────────────────────────────

const ROOM_OPTIONS = [
  {
    id:          'decision' as const,
    icon:        'sp-Environment-Bulb' as const,
    title:       'Decision Room',
    subtitle:    'Turn insights into decisions.',
    description: 'Like having a strategy consultant who has already read the entire study. Ask follow-up questions, identify opportunities, challenge assumptions, and define next steps.',
    cardClass:   'cs-room-card--decision',
  },
  {
    id:          'persona' as const,
    icon:        'sp-User-Users' as const,
    title:       'Persona Room',
    subtitle:    "Step into your customer's world",
    description: 'Like sitting across the table from your customers. Ask follow-up questions, explore motivations, uncover hidden tensions, and understand how decisions actually form.',
    cardClass:   'cs-room-card--persona',
  },
] as const;

// ── Subtitle per mode ─────────────────────────────────────────────────────────

const SUBTITLE: Record<NonNullable<RoomMode>, string> = {
  decision: 'Decision Room understands your research objectives, personas, findings, contradictions, and recommendations. Think of it as having a strategy consultant who has already read every page of your study and is available whenever you need them.',
  persona:  'Persona Room allows you to have dynamic conversations with behavior-grounded audiences built for this study. Ask follow-up questions, probe deeper into motivations, explore trade-offs, test reactions, investigate contradictions, and understand how customers think through decisions.',
};

// ── Component ─────────────────────────────────────────────────────────────────

const ConversationStudioModal: React.FC<ConversationStudioModalProps> = ({
  workspaceId,
  objectiveId,
  flow = 'qual',
  onClose,
}) => {
  const [mode,          setMode]          = useState<RoomMode>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  const handleSelectMode = (selected: NonNullable<RoomMode>) => {
    setMode(selected);
    setIsSidebarOpen(false);
  };

  const handleBack = () => {
    setMode(null);
    setIsSidebarOpen(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <motion.div
      className="cs-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="cs-panel"
        initial={{ opacity: 0, y: 32, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 32, scale: 0.98 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Panel header ── */}
        <div className="cs-panel-header">
          <div className="cs-panel-header__text">
            {/* Back button — shown when inside a room */}
            {mode !== null && (
              <button className="cs-back-btn" onClick={handleBack} aria-label="Back to room selection">
                <TbArrowLeft size={16} />
                <span>Back</span>
              </button>
            )}
            <h2 className="cs-panel-header__title">
              Conversation Studio
              {mode !== null && (
                <>
                  <span className="cs-panel-header__title-sep"> : </span>
                  <span className="cs-panel-header__title-room">
                    {mode === 'decision' ? 'Decision Room' : 'Persona Room'}
                  </span>
                </>
              )}
            </h2>
            <p className="cs-panel-header__subtitle">
              {mode !== null ? SUBTITLE[mode] : 'Choose how you want to explore your research.'}
            </p>
          </div>

          <div className="cs-panel-header__actions">
            <button className="cs-close" onClick={onClose} aria-label="Close">
              <TbX size={20} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <AnimatePresence mode="wait">

          {/* ── Landing — room selection ── */}
          {mode === null && (
            <motion.div
              key="landing"
              className="cs-landing"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
            >
              <div className="cs-landing__inner">
                <p className="cs-landing__eyebrow">Select a room to begin</p>
                <div className="cs-landing__cards">
                  {ROOM_OPTIONS.map((room, i) => (
                    <motion.button
                      key={room.id}
                      className={`cs-room-card ${room.cardClass}`}
                      onClick={() => handleSelectMode(room.id)}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08, duration: 0.22 }}
                    >
                      {/* Accent glow orb */}
                      <div className="cs-room-card__glow" />

                      {/* Icon */}
                      <div className="cs-room-card__icon">
                        <SpIcon name={room.icon} size={40} />
                      </div>

                      {/* Title */}
                      <h3 className="cs-room-card__title">{room.title}</h3>

                      {/* Subtitle (previously "description") */}
                      <p className="cs-room-card__subtitle">{room.subtitle}</p>

                      {/* New longer description */}
                      <p className="cs-room-card__desc">{room.description}</p>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Persona Room ── */}
          {mode === 'persona' && (
            <motion.div
              key="persona"
              className="cs-room-wrapper"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.2 }}
            >
              <PersonaRoom
                workspaceId={workspaceId}
                objectiveId={objectiveId}
                onClose={onClose}
                isSidebarOpen={isSidebarOpen}
                onSidebarOpen={() => setIsSidebarOpen(true)}
                onSidebarClose={() => setIsSidebarOpen(false)}
              />
            </motion.div>
          )}

          {/* ── Decision Room ── */}
          {mode === 'decision' && (
            <motion.div
              key="decision"
              className="cs-room-wrapper"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.2 }}
            >
              <DecisionRoom
                workspaceId={workspaceId}
                objectiveId={objectiveId}
                flow={flow}
                onClose={onClose}
                isSidebarOpen={isSidebarOpen}
                onSidebarOpen={() => setIsSidebarOpen(true)}
                onSidebarClose={() => setIsSidebarOpen(false)}
              />
            </motion.div>
          )}

        </AnimatePresence>

      </motion.div>
    </motion.div>
  );
};

export default ConversationStudioModal;