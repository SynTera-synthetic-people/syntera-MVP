import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decisionRoomApi } from '../services/decisionRoomService';

// ── Query key factory ─────────────────────────────────────────────────────────

export const drKeys = {
  all: ['decision-room'],
  sessions: (wid, eid, flow) => [...drKeys.all, 'sessions', wid, eid, flow],
  session: (wid, eid, sid) => [...drKeys.all, 'session', wid, eid, sid],
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

export const useCreateDRSession = (workspaceId, explorationId) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (flow) => decisionRoomApi.createSession(workspaceId, explorationId, flow),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: drKeys.sessions(workspaceId, explorationId) });
    },
  });
};

export const useDRSessions = (workspaceId, explorationId, flow, options = {}) =>
  useQuery({
    queryKey: drKeys.sessions(workspaceId, explorationId, flow),
    queryFn: () => decisionRoomApi.listSessions(workspaceId, explorationId, flow),
    select: (res) => res.data || [],
    enabled: !!(workspaceId && explorationId),
    staleTime: 15_000,
    ...options,
  });

export const useDRSession = (workspaceId, explorationId, sessionId, options = {}) =>
  useQuery({
    queryKey: drKeys.session(workspaceId, explorationId, sessionId),
    queryFn: () => decisionRoomApi.getSession(workspaceId, explorationId, sessionId),
    select: (res) => res.data,
    enabled: !!(workspaceId && explorationId && sessionId),
    ...options,
  });

export const useSendDRMessage = (workspaceId, explorationId, sessionId) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text) =>
      decisionRoomApi.sendMessage(workspaceId, explorationId, sessionId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: drKeys.session(workspaceId, explorationId, sessionId),
      });
    },
  });
};

export const useDeleteDRSession = (workspaceId, explorationId) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId) =>
      decisionRoomApi.deleteSession(workspaceId, explorationId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: drKeys.sessions(workspaceId, explorationId) });
    },
  });
};

// ── Streaming send ─────────────────────────────────────────────────────────────
// Not a React Query hook — uses native fetch + ReadableStream for SSE.

export const streamDRMessage = async (
  workspaceId,
  explorationId,
  sessionId,
  text,
  { onDelta, onDone, onError },
) => {
  const token = localStorage.getItem('token');
  const url = decisionRoomApi.getStreamUrl(workspaceId, explorationId, sessionId);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    onError && onError('Network error: ' + err.message);
    return;
  }

  if (!res.ok || !res.body) {
    onError && onError(`Request failed: ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'delta') {
            onDelta && onDelta(event.delta);
          } else if (event.type === 'done') {
            onDone && onDone(event);
          } else if (event.type === 'error') {
            onError && onError(event.message || 'Stream error');
          }
        } catch (_) {
          // malformed SSE line — skip
        }
      }
    }
  } catch (err) {
    onError && onError('Stream read error: ' + err.message);
  }
};
