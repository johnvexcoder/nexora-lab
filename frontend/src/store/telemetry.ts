import { create } from 'zustand';
import type { WsStatus } from '@/api/ws';
import type { MetricSnapshot, ServerRuntime, ServerStatus, GlobalHealth } from '@/types';
import { pct } from '@/lib/utils';
import { STALE_THRESHOLD_MS } from '@/lib/constants';

interface TelemetryState {
  servers: Record<string, ServerRuntime>;
  snapshots: Record<string, MetricSnapshot>;
  lastTickAt: number | null;
  connected: boolean;
  /** Live WebSocket transport state. */
  wsStatus: WsStatus;
  /** Most recent REST query failure (backend unreachable, 5xx, forbidden, …). */
  backendError: Error | null;
  /** ring buffers keyed by serverId for sparklines */
  sparklines: Record<string, Record<'cpu' | 'ram' | 'disk' | 'temp' | 'netUp' | 'netDown' | 'load', number[]>>;

  applySnapshots: (snapshots: MetricSnapshot[]) => void;
  hydrate: (servers: ServerRuntime[]) => void;
  patchServer: (server: ServerRuntime) => void;
  setConnected: (connected: boolean) => void;
  setWsStatus: (status: WsStatus) => void;
  setBackendError: (error: Error | null) => void;
}

const HISTORY_LEN = 90;

function emptyRings(): Record<'cpu' | 'ram' | 'disk' | 'temp' | 'netUp' | 'netDown' | 'load', number[]> {
  return { cpu: [], ram: [], disk: [], temp: [], netUp: [], netDown: [], load: [] };
}

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  servers: {},
  snapshots: {},
  lastTickAt: null,
  connected: false,
  wsStatus: 'connecting',
  backendError: null,
  sparklines: {},

  applySnapshots: (snapshots) =>
    set((state) => {
      const servers = { ...state.servers };
      const snapMap = { ...state.snapshots };
      const sparklines = { ...state.sparklines };

      for (const snap of snapshots) {
        const runtime = servers[snap.serverId];
        if (!runtime) continue;

        snapMap[snap.serverId] = snap;

        servers[snap.serverId] = {
          ...runtime,
          status: snap.status,
          reachability: snap.reachability,
          health: snap.health,
          load: snap.load,
          uptimeSeconds: snap.uptimeSeconds,
          cpu: snap.cpu,
          ramUsedGb: snap.ramUsedGb,
          diskUsedGb: snap.diskUsedGb,
          tempC: snap.tempC,
          netUpMbps: snap.netUpMbps,
          netDownMbps: snap.netDownMbps,
          processes: snap.processes,
          lastSeen: snap.timestamp,
          sensors: snap.sensors,
        };

        const rings = sparklines[snap.serverId] ?? emptyRings();
        sparklines[snap.serverId] = {
          cpu: [...rings.cpu.slice(-HISTORY_LEN), snap.cpu],
          ram: [...rings.ram.slice(-HISTORY_LEN), pct(snap.ramUsedGb, snap.ramTotalGb)],
          disk: [...rings.disk.slice(-HISTORY_LEN), pct(snap.diskUsedGb, snap.diskTotalGb)],
          temp: [...rings.temp.slice(-HISTORY_LEN), snap.tempC],
          netUp: [...rings.netUp.slice(-HISTORY_LEN), snap.netUpMbps],
          netDown: [...rings.netDown.slice(-HISTORY_LEN), snap.netDownMbps],
          load: [...rings.load.slice(-HISTORY_LEN), snap.load],
        };
      }

      return { servers, snapshots: snapMap, sparklines, lastTickAt: Date.now() };
    }),

  hydrate: (servers) =>
    set((state) => {
      const map: Record<string, ServerRuntime> = {};
      for (const s of servers) map[s.spec.id] = s;
      return { servers: { ...state.servers, ...map } };
    }),

  patchServer: (server) =>
    set((state) => ({
      servers: { ...state.servers, [server.spec.id]: server },
    })),

  setConnected: (connected) => set({ connected }),

  setWsStatus: (wsStatus) =>
    set((state) => ({
      wsStatus,
      // While the socket is not open the store can never be freshly connected.
      connected: wsStatus === 'open' ? state.connected : false,
    })),

  setBackendError: (backendError) => set({ backendError }),
}));

export function selectServers(state: TelemetryState): ServerRuntime[] {
  return Object.values(state.servers);
}

export function selectServer(state: TelemetryState, id: string): ServerRuntime | undefined {
  return state.servers[id];
}

export function serverStatusCount(servers: ServerRuntime[], status: ServerStatus): number {
  return servers.filter((s) => s.status === status).length;
}

export function globalHealthFromServers(servers: ServerRuntime[]): GlobalHealth {
  if (servers.length === 0) {
    return { score: 0, status: 'offline', totalServers: 0, onlineServers: 0, degradedServers: 0, offlineServers: 0, activeAlerts: 0, avgCpu: 0, avgRam: 0, totalUptimePercent: 0 };
  }
  const online = serverStatusCount(servers, 'online');
  const degraded = serverStatusCount(servers, 'degraded');
  const offline = serverStatusCount(servers, 'offline');
  const score = servers.reduce((a, s) => a + s.health, 0) / servers.length;
  const avgCpu = servers.reduce((a, s) => a + s.cpu, 0) / servers.length;
  const avgRam = servers.reduce((a, s) => a + pct(s.ramUsedGb, s.spec.ramTotalGb), 0) / servers.length;
  return {
    score: Math.round(score * 10) / 10,
    status: offline > 0 ? 'offline' : degraded > 0 ? 'degraded' : 'online',
    totalServers: servers.length,
    onlineServers: online,
    degradedServers: degraded,
    offlineServers: offline,
    activeAlerts: 0,
    avgCpu: Math.round(avgCpu * 10) / 10,
    avgRam: Math.round(avgRam * 10) / 10,
    totalUptimePercent: Math.round((online / servers.length) * 1000) / 10,
  };
}

/** Derived failure/recovery state of the live telemetry pipeline. */
export interface RealtimeStatus {
  connected: boolean;
  wsStatus: WsStatus;
  /** Servers known from the REST hydration. */
  totalServers: number;
  /** Servers that produced at least one WebSocket telemetry snapshot. */
  reportingServers: number;
  /** Known but silent servers (never ticked or lost). */
  missingServers: number;
  /** Some servers known, fewer actually reporting. */
  partial: boolean;
  /** Milliseconds since the last telemetry tick (null before the first tick). */
  telemetryAgeMs: number | null;
  /** True when the last tick is older than STALE_THRESHOLD_MS. */
  stale: boolean;
}

// Memoization guard for `realtimeStatus` (see below). Because `realtimeStatus`
// derives `telemetryAgeMs`/`stale` from the wall clock (`Date.now()`), calling
// it unconditionally returns a NEW object on every call — even when the store
// has not changed. React's `useSyncExternalStore` (which zustand feeds) requires
// `getSnapshot` to return the SAME reference for an unchanged store, otherwise it
// throws "The result of getSnapshot should be cached to avoid an infinite loop"
// and unmounts the whole app (blank page). Caching by the store-state reference
// keeps the snapshot stable until the store actually changes.
let _lastRealtimeState: TelemetryState | null = null;
let _lastRealtimeStatus: RealtimeStatus | null = null;

export function realtimeStatus(state: TelemetryState): RealtimeStatus {
  if (_lastRealtimeState === state && _lastRealtimeStatus) {
    return _lastRealtimeStatus;
  }
  _lastRealtimeState = state;
  const totalServers = Object.keys(state.servers).length;
  const reportingServers = Object.keys(state.snapshots).length;
  const telemetryAgeMs = state.lastTickAt == null ? null : Date.now() - state.lastTickAt;
  _lastRealtimeStatus = {
    connected: state.connected,
    wsStatus: state.wsStatus,
    totalServers,
    reportingServers,
    missingServers: Math.max(0, totalServers - reportingServers),
    partial: totalServers > 0 && reportingServers > 0 && reportingServers < totalServers,
    telemetryAgeMs,
    stale: telemetryAgeMs != null ? telemetryAgeMs > STALE_THRESHOLD_MS : false,
  };
  return _lastRealtimeStatus;
}
