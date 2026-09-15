import type { MetricSnapshot, Notification } from '@/types';
import { useTelemetryStore } from '@/store/telemetry';
import { useNotificationStore } from '@/store/notifications';

const WS_URL = (import.meta.env.VITE_WS_URL ?? '').trim() || (() => {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
})();

const MAX_BACKOFF_MS = 15_000;
const INITIAL_BACKOFF_MS = 750;

type WsMessage =
  | { type: 'connected'; data: { timestamp: number } }
  | { type: 'telemetry'; data: MetricSnapshot[] }
  | { type: 'notifications'; data: Notification[] }
  | { type: 'ping'; data: { ts: number } }
  | { type: 'pong' };

let socket: WebSocket | null = null;
let reconnectTimer: number | undefined;
let reconnectDelay = INITIAL_BACKOFF_MS;
let running = true;
let reconnectAttempt = 0;
let nextRetryAt = 0;
let telemetryFrame: number | undefined;
const pendingSnapshots = new Map<string, MetricSnapshot>();

function flushTelemetry(): void {
  telemetryFrame = undefined;
  if (!running || pendingSnapshots.size === 0) return;
  const snapshots = [...pendingSnapshots.values()];
  pendingSnapshots.clear();
  useTelemetryStore.getState().applySnapshots(snapshots);
}

function clearPendingTelemetry(): void {
  if (telemetryFrame !== undefined) window.cancelAnimationFrame(telemetryFrame);
  telemetryFrame = undefined;
  pendingSnapshots.clear();
}

export type WsStatus = 'connecting' | 'open' | 'closed' | 'reconnecting';

export interface WsState {
  status: WsStatus;
  /** Consecutive reconnect attempts since the last successful open socket. */
  attempt: number;
  /** Backoff ms currently scheduled before the next attempt (0 when not reconnecting). */
  backoffMs: number;
}

const listeners = new Set<(state: WsState) => void>();

export function subscribeWs(cb: (state: WsState) => void): () => void {
  listeners.add(cb);
  cb(currentState());
  return () => listeners.delete(cb);
}

/** Latest WebSocket transport state — safe to read during render (updates only on transitions). */
export function getWsState(): WsState {
  return currentState();
}

function currentState(): WsState {
  let status: WsStatus = 'closed';
  if (running) {
    if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
      status = reconnectAttempt > 0 ? 'reconnecting' : 'connecting';
    } else if (socket.readyState === WebSocket.OPEN) {
      status = 'open';
    } else {
      status = 'connecting';
    }
  }
  const backoffMs = status === 'reconnecting' ? Math.max(0, nextRetryAt - Date.now()) : 0;
  return { status, attempt: reconnectAttempt, backoffMs };
}

function emit(state?: WsState): void {
  const s = state ?? currentState();
  listeners.forEach((cb) => cb(s));
}

/**
 * Singleton connection: safe to call multiple times (StrictMode double-mount,
 * route changes, etc.) — only one socket is ever created.
 */
export function connectWs(): void {
  running = true;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  if (reconnectTimer !== undefined) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  open();
}

function open(): void {
  if (!running) return;

  const ws = new WebSocket(WS_URL);
  socket = ws;
  emit({ status: 'connecting', attempt: reconnectAttempt, backoffMs: 0 });

  ws.onopen = () => {
    if (ws !== socket) return; // a newer socket took over
    reconnectDelay = INITIAL_BACKOFF_MS;
    reconnectAttempt = 0;
    nextRetryAt = 0;
    emit({ status: 'open', attempt: 0, backoffMs: 0 });
  };

  ws.onmessage = (event) => {
    if (ws !== socket) return;
    try {
      const msg = JSON.parse(event.data as string) as WsMessage;

      // App-level heartbeat echo (see backend/src/ws).
      if (msg.type === 'ping') {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
        return;
      }

      if (msg.type === 'telemetry') {
        // A burst of frames should produce one store update per paint. Keep
        // the newest reading for each server while preserving other servers.
        for (const snapshot of msg.data) pendingSnapshots.set(snapshot.serverId, snapshot);
        if (telemetryFrame === undefined) telemetryFrame = window.requestAnimationFrame(flushTelemetry);
      } else if (msg.type === 'notifications') {
        useNotificationStore.getState().ingest(msg.data);
      }
    } catch {
      // ignore malformed frames
    }
  };

  ws.onclose = () => {
    if (ws !== socket) return; // stale close from an older socket
    socket = null;
    clearPendingTelemetry();
    if (!running) return;
    reconnectAttempt += 1;
    nextRetryAt = Date.now() + reconnectDelay;
    emit({ status: 'reconnecting', attempt: reconnectAttempt, backoffMs: reconnectDelay });
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined;
      open();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_BACKOFF_MS);
  };

  ws.onerror = () => {
    // The close handler owns reconnection; just make sure it fires.
    if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
      ws.close();
    }
  };
}

export function disconnectWs(): void {
  running = false;
  clearPendingTelemetry();
  if (reconnectTimer !== undefined) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  const s = socket;
  socket = null;
  if (s) {
    s.onclose = null;
    s.close();
  }
  emit({ status: 'closed', attempt: reconnectAttempt, backoffMs: 0 });
}

/**
 * Force an immediate reconnect attempt (manual "Retry" affordance). Resets the
 * backoff to its initial value so a user action feels instant.
 */
export function retryWsNow(): void {
  if (!running) return;
  if (reconnectTimer !== undefined) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  reconnectDelay = INITIAL_BACKOFF_MS;
  nextRetryAt = 0;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    emit();
    return;
  }
  reconnectAttempt = 0;
  open();
}

/** Reconnect immediately if the tab becomes visible and we dropped offline. */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) connectWs();
  });
}
