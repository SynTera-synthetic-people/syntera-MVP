// Renders nothing unless the neuroscience layer is enabled and has recorded
// state for this exploration.
import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import neuroService from '../../../services/neuroService';
import './NeuroPanel.css';

const confidenceBucket = (value) => {
  if (value >= 0.65) return { label: 'High', className: 'neuro-badge--high' };
  if (value >= 0.35) return { label: 'Moderate', className: 'neuro-badge--mid' };
  return { label: 'Low', className: 'neuro-badge--low' };
};

const NeuroPanel = ({ workspaceId, explorationId }) => {
  const [visible, setVisible] = useState(false);
  const [personas, setPersonas] = useState([]);
  const [selectedPersona, setSelectedPersona] = useState('');
  const [events, setEvents] = useState([]);
  const [latestState, setLatestState] = useState(null);
  const [effectiveN, setEffectiveN] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!workspaceId || !explorationId) return;
      const status = await neuroService.getStatus();
      if (cancelled || !status?.enabled) return;
      const [personaList, counts] = await Promise.all([
        neuroService.listPersonas(workspaceId, explorationId),
        neuroService.getEffectiveN(workspaceId, explorationId),
      ]);
      if (cancelled) return;
      const list = Array.isArray(personaList) ? personaList : [];
      setPersonas(list);
      setEffectiveN(counts);
      const recordedAnything = (counts?.totals?.responses ?? 0) > 0;
      setVisible(recordedAnything);
      if (list.length > 0) setSelectedPersona(list[0].id);
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, explorationId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!visible || !selectedPersona) return;
      setLoading(true);
      const [eventData, stateData] = await Promise.all([
        neuroService.getConversationEvents(workspaceId, explorationId, selectedPersona),
        neuroService.getConversationState(workspaceId, explorationId, selectedPersona),
      ]);
      if (cancelled) return;
      setEvents(Array.isArray(eventData) ? eventData : []);
      setLatestState(stateData?.state ?? null);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [visible, selectedPersona, workspaceId, explorationId]);

  const trajectory = useMemo(() => {
    const byTurn = new Map();
    events
      .filter((e) => !e.error && e.state?.summary)
      .forEach((e) => {
        const existing = byTurn.get(e.turn_index);
        if (!existing || e.created_at >= existing.created_at) byTurn.set(e.turn_index, e);
      });
    return Array.from(byTurn.values())
      .sort((a, b) => a.turn_index - b.turn_index)
      .map((e) => ({
        turn: e.turn_index,
        valence: Number(e.state.summary.valence.toFixed(3)),
        arousal: Number(e.state.summary.arousal.toFixed(3)),
        abstained: Boolean(e.state.abstain),
      }));
  }, [events]);

  if (!visible) return null;

  const abstained = Boolean(latestState?.abstain);
  const confValue = Number(latestState?.confidence ?? 0);
  const bucket = confidenceBucket(confValue);
  const terms = latestState?.confidence_terms || null;
  const totals = effectiveN?.totals || null;

  return (
    <section className="neuro-panel" data-testid="neuro-panel">
      <header className="neuro-panel__header">
        <div>
          <h3 className="neuro-panel__title">Emotional state (shadow)</h3>
          <p className="neuro-panel__subtitle">
            Computed per question; recorded only — responses are unaffected.
          </p>
        </div>
        {personas.length > 0 && (
          <select
            className="neuro-panel__select"
            value={selectedPersona}
            onChange={(e) => setSelectedPersona(e.target.value)}
            aria-label="Select persona"
          >
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}
              </option>
            ))}
          </select>
        )}
      </header>

      {latestState && (
        <div className="neuro-panel__badges">
          {abstained ? (
            <span className="neuro-badge neuro-badge--abstained">
              Declined to answer — evidence below threshold
            </span>
          ) : (
            <span className={`neuro-badge ${bucket.className}`}>
              Confidence: {bucket.label} ({confValue.toFixed(2)})
            </span>
          )}
          {terms && (
            <span className="neuro-panel__terms">
              plausibility {Number(terms.plausibility).toFixed(2)} · certainty{' '}
              {Number(terms.certainty).toFixed(2)} · evidence{' '}
              {Number(terms.evidence).toFixed(2)}
            </span>
          )}
        </div>
      )}

      {loading && <p className="neuro-panel__loading">Loading trajectory…</p>}

      {!loading && trajectory.length > 0 && (
        <div className="neuro-panel__chart">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trajectory} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
              <XAxis dataKey="turn" label={{ value: 'Question', position: 'insideBottom', offset: -2 }} />
              <YAxis domain={[-1, 1]} tickCount={5} />
              <Tooltip
                formatter={(value, name) => [value, name === 'valence' ? 'Valence' : 'Arousal']}
                labelFormatter={(turn) => `Question ${Number(turn) + 1}`}
              />
              <Legend />
              <ReferenceLine y={0} strokeOpacity={0.5} />
              <Line type="monotone" dataKey="valence" stroke="#2563eb" dot={{ r: 3 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="arousal" stroke="#f59e0b" dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && trajectory.length === 0 && (
        <p className="neuro-panel__empty">No recorded turns for this persona yet.</p>
      )}

      {totals && totals.responses > 0 && (
        <footer className="neuro-panel__footer">
          Effective responses across the guide: {totals.answered} answered
          {totals.abstained > 0 && `, ${totals.abstained} declined`} · {totals.questions}{' '}
          question{totals.questions === 1 ? '' : 's'}
        </footer>
      )}
    </section>
  );
};

export default NeuroPanel;
