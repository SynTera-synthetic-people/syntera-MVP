import React, { useState } from 'react';
import './NotificationStyle.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotifState {
  taskAlerts: boolean;
  usageAlert: boolean;
  completionPersona: boolean;
  newExploration: boolean;
  completionResearch: boolean;
  userModified: boolean;
  completionExploration: boolean;
  deleted: boolean;
}

// ── Toggle component ──────────────────────────────────────────────────────────

interface ToggleProps {
  enabled: boolean;
  onChange: () => void;
  label: string;
}

const NotifToggle: React.FC<ToggleProps> = ({ enabled, onChange, label }) => (
  <div className="nf-toggle-card">
    <span className="nf-toggle-label">{label}</span>
    <button
      role="switch"
      aria-checked={enabled}
      className={`nf-toggle ${enabled ? 'nf-toggle--on' : ''}`}
      onClick={onChange}
      aria-label={label}
    >
      <span className="nf-toggle-thumb" />
    </button>
  </div>
);

// ── Component ─────────────────────────────────────────────────────────────────

const Notifications: React.FC = () => {
  const [notifs, setNotifs] = useState<NotifState>({
    taskAlerts: true,
    usageAlert: true,
    completionPersona: true,
    newExploration: false,
    completionResearch: false,
    userModified: false,
    completionExploration: true,
    deleted: false,
  });

  const toggle = (key: keyof NotifState) =>
    setNotifs((prev) => ({ ...prev, [key]: !prev[key] }));

  const LEFT_ITEMS: Array<{ key: keyof NotifState; label: string }> = [
    { key: 'taskAlerts',           label: 'Task Alerts' },
    { key: 'completionPersona',    label: 'Completion of persona' },
    { key: 'completionResearch',   label: 'Completion of Research Technique (Qual or Quant)' },
    { key: 'completionExploration',label: 'Completion of Exploration' },
  ];

  const RIGHT_ITEMS: Array<{ key: keyof NotifState; label: string }> = [
    { key: 'usageAlert',     label: 'Usage Alert' },
    { key: 'newExploration', label: 'New exploration created' },
    { key: 'userModified',   label: 'User has modified' },
    { key: 'deleted',        label: 'deleted' },
  ];

  return (
    <div className="nf-grid">
      {/* Left column */}
      <div className="nf-col">
        {LEFT_ITEMS.map(({ key, label }) => (
          <NotifToggle
            key={key}
            label={label}
            enabled={notifs[key]}
            onChange={() => toggle(key)}
          />
        ))}
      </div>

      {/* Right column */}
      <div className="nf-col">
        {RIGHT_ITEMS.map(({ key, label }) => (
          <NotifToggle
            key={key}
            label={label}
            enabled={notifs[key]}
            onChange={() => toggle(key)}
          />
        ))}
      </div>
    </div>
  );
};

export default Notifications;