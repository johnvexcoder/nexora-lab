import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import type { TelemetryBroadcaster } from '../providers/types';
import type { MetricSnapshot, Notification } from '../types';
import { loadSessionByCookieHeader, type SessionUser } from '../security/session';
import { getBoolSetting } from '../security/settings';
import { config } from '../config';
import { applySensorFlags } from '../security/features';

/**
 * Heartbeat tuning. The liveness check uses an APP-LEVEL ping/pong exchanged as
 * regular text frames — these traverse Vite's dev proxy and nginx reliably,
 * unlike WS control-frame pings which some proxies eat (causing spurious
 * ECONNRESET and reconnect storms). Clients echo `{ type: 'pong' }`.
 */
const HEARTBEAT_INTERVAL_MS = 15_000;
const CLIENT_TIMEOUT_MS = 60_000;

interface WsClient {
  socket: WebSocket;
  lastActive: number;
  user: SessionUser | null;
  cookie: string | undefined;
}

interface RequestWithAuth {
  auth?: SessionUser | null;
}

type PushMessage =
  | { type: 'connected'; data: { timestamp: number; user?: { username: string; role: string } | null } }
  | { type: 'telemetry'; data: MetricSnapshot[] }
  | { type: 'notifications'; data: Notification[] }
  | { type: 'ping'; data: { ts: number } };

/**
 * WebSocket push server. Broadcasts every telemetry tick (default 2s) to all
 * connected clients. Message envelope:
 *   { type: 'telemetry', data: MetricSnapshot[] }
 *   { type: 'notifications', data: Notification[] }
 *   { type: 'ping', data: { ts } }   → clients reply { type: 'pong' }
 *
 * Connections are closed GRACEFULLY (close frame + FIN) on timeout so proxies
 * never observe a reset socket.
 */
export interface WsHandles {
  wss: WebSocketServer;
  /** Push notifications to all connected WS clients (used for Docker events
   *  that bypass the Proxmox notification pipeline). */
  broadcastNotifications(notifications: Notification[]): void;
}

export function attachWebSocket(httpServer: HttpServer, broadcaster: TelemetryBroadcaster): WsHandles {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    perMessageDeflate: false,
    maxPayload: 4096,
    verifyClient: (info, done) => {
      // Every WS connection must present a valid session cookie, or guest mode
      // must be enabled. Telemetry is only pushed to authenticated/guest feeds.
      const origin = info.req.headers.origin;
      if (origin && !config.corsOrigin.split(',').map((value) => value.trim()).includes(origin)) {
        done(false, 403, 'origin_not_allowed');
        return;
      }
      const ctx = loadSessionByCookieHeader(info.req.headers.cookie);
      const guest = getBoolSetting('access.guest.enabled');
      if (ctx || guest) {
        (info.req as RequestWithAuth).auth = ctx?.user ?? null;
        done(true);
        return;
      }
      done(false, 401, 'unauthorized');
    },
  });
  const clients = new Set<WsClient>();

  wss.on('connection', (socket, request) => {
    const user = (request as RequestWithAuth).auth ?? null;
    const client: WsClient = { socket, lastActive: Date.now(), user, cookie: request.headers.cookie };
    clients.add(client);

    socket.on('message', () => {
      client.lastActive = Date.now();
    });
    socket.on('close', () => {
      clients.delete(client);
    });
    socket.on('error', () => {
      clients.delete(client);
    });

    send(client, { type: 'connected', data: { timestamp: Date.now(), user: user ? { username: user.username, role: user.role } : null } });
  });

  broadcaster.onTick((snapshots: MetricSnapshot[]) => {
    broadcast(clients, { type: 'telemetry', data: snapshots.map((s) => ({ ...s, sensors: applySensorFlags(s.sensors) })) });
  });

  broadcaster.onNotifications((notifications: Notification[]) => {
    broadcast(clients, { type: 'notifications', data: notifications });
  });

  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const client of clients) {
      if (now - client.lastActive > CLIENT_TIMEOUT_MS) {
        client.socket.close(1000, 'Heartbeat timeout');
        clients.delete(client);
        continue;
      }
      send(client, { type: 'ping', data: { ts: now } });
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();
  wss.on('close', () => clearInterval(heartbeat));

  return { wss, broadcastNotifications: (notifications: Notification[]) => broadcast(clients, { type: 'notifications', data: notifications }) };
}

function send(client: WsClient, message: PushMessage): void {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(message));
  }
}

function broadcast(clients: Set<WsClient>, message: PushMessage): void {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    const session = loadSessionByCookieHeader(client.cookie);
    if (!session && (client.user || !getBoolSetting('access.guest.enabled'))) {
      client.socket.close(1008, 'Session expired or revoked');
      clients.delete(client);
      continue;
    }
    if (client.socket.bufferedAmount > 1024 * 1024) {
      client.socket.terminate();
      clients.delete(client);
      continue;
    }
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(payload);
    }
  }
}
