import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  useTelemetryStore,
  selectServers,
  serverStatusCount,
  globalHealthFromServers,
  realtimeStatus,
} from '@/store/telemetry';
import type { ServerRuntime, MetricSnapshot } from '@/types';

function makeRuntime(id: string, overrides: Partial<ServerRuntime> = {}): ServerRuntime {
  return {
    spec: {
      id,
      serverId: `${id}-uuid`,
      hostname: `${id}.lab`,
      name: id,
      logo: 'proxmox',
      os: 'Debian 12',
      description: id,
      role: 'server',
      capabilities: [],
      clusterId: null,
      parentId: '',
      ip: '192.168.1.10',
      location: 'rack-1',
      cpuModel: 'EPYC',
      cpuCores: 8,
      ramTotalGb: 64,
      diskTotalGb: 1000,
      sensors: [],
      profile: { baseCpu: 10, cpuAmplitude: 5, cpuNoise: 1, baseRamGb: 16, ramDriftGb: 2, baseTemp: 40, tempVariance: 2, baseNetUpMbps: 10, baseNetDownMbps: 100, netBurstRate: 0.5, processes: 100, containers: 0, vms: 0, reliability: 1 },
    },
    status: 'online',
    reachability: 'accessible',
    health: 100,
    load: 1,
    uptimeSeconds: 10000,
    cpu: 20,
    ramUsedGb: 16,
    diskUsedGb: 500,
    tempC: 42,
    netUpMbps: 5,
    netDownMbps: 50,
    processes: 100,
    lastSeen: Date.now(),
    sensors: [],
    history: { cpu: [], ram: [], disk: [], temp: [], netUp: [], netDown: [], load: [] },
    ...overrides,
  };
}

function makeSnapshot(serverId: string, overrides: Partial<MetricSnapshot> = {}): MetricSnapshot {
  return {
    serverId,
    timestamp: Date.now(),
    cpu: 20,
    cpuCores: 8,
    ramUsedGb: 16,
    ramTotalGb: 64,
    diskUsedGb: 500,
    diskTotalGb: 1000,
    tempC: 42,
    netUpMbps: 5,
    netDownMbps: 50,
    load: 1,
    uptimeSeconds: 10000,
    processes: 100,
    status: 'online',
    reachability: 'accessible',
    health: 100,
    sensors: [],
    ...overrides,
  };
}

describe('telemetry store helpers', () => {
  describe('globalHealthFromServers', () => {
    it('returns zeroed offline health for an empty fleet', () => {
      const health = globalHealthFromServers([]);
      assert.deepEqual(health, {
        score: 0,
        status: 'offline',
        totalServers: 0,
        onlineServers: 0,
        degradedServers: 0,
        offlineServers: 0,
        activeAlerts: 0,
        avgCpu: 0,
        avgRam: 0,
        totalUptimePercent: 0,
      });
    });

    it('is online when all servers are online', () => {
      const health = globalHealthFromServers([
        makeRuntime('s1', { status: 'online', health: 100 }),
        makeRuntime('s2', { status: 'online', health: 80 }),
      ]);
      assert.equal(health.status, 'online');
      assert.equal(health.totalServers, 2);
      assert.equal(health.onlineServers, 2);
      assert.equal(health.score, 90);
      assert.equal(health.totalUptimePercent, 100);
    });

    it('is degraded when any server is degraded and none offline', () => {
      const health = globalHealthFromServers([
        makeRuntime('s1', { status: 'online', health: 100 }),
        makeRuntime('s2', { status: 'degraded', health: 60 }),
      ]);
      assert.equal(health.status, 'degraded');
      assert.equal(health.degradedServers, 1);
    });

    it('is offline when any server is offline regardless of degraded', () => {
      const health = globalHealthFromServers([
        makeRuntime('s1', { status: 'degraded', health: 60 }),
        makeRuntime('s2', { status: 'offline', health: 0 }),
      ]);
      assert.equal(health.status, 'offline');
      assert.equal(health.offlineServers, 1);
    });

    it('computes rounded average cpu and ram', () => {
      const health = globalHealthFromServers([
        makeRuntime('s1', { cpu: 10.05, ramUsedGb: 25 }),
        makeRuntime('s2', { cpu: 20.05, ramUsedGb: 25 }),
      ]);
      assert.equal(health.avgCpu, 15.1);
      // avgRam: pct(25, 64) = 39.06 → avg = 39.06 → rounded to 39.1
      assert.equal(health.avgRam, 39.1);
    });

    it('computes uptime percent from online share', () => {
      const health = globalHealthFromServers([
        makeRuntime('s1', { status: 'online' }),
        makeRuntime('s2', { status: 'online' }),
        makeRuntime('s3', { status: 'offline' }),
        makeRuntime('s4', { status: 'degraded' }),
      ]);
      assert.equal(health.totalUptimePercent, 50);
    });
  });

  describe('serverStatusCount', () => {
    it('counts servers per status', () => {
      const servers = [
        makeRuntime('s1', { status: 'online' }),
        makeRuntime('s2', { status: 'offline' }),
        makeRuntime('s3', { status: 'online' }),
      ];
      assert.equal(serverStatusCount(servers, 'online'), 2);
      assert.equal(serverStatusCount(servers, 'offline'), 1);
      assert.equal(serverStatusCount(servers, 'degraded'), 0);
    });
  });

  describe('realtimeStatus', () => {
    function stateWith(partial: Partial<ReturnType<typeof useTelemetryStore.getState>>) {
      return { ...useTelemetryStore.getState(), ...partial };
    }

    beforeEach(() => {
      useTelemetryStore.setState({
        servers: {},
        snapshots: {},
        lastTickAt: null,
        connected: false,
        wsStatus: 'connecting',
        backendError: null,
        sparklines: {},
      });
    });

    it('empty fleet: not connected, no tick, not stale', () => {
      const status = realtimeStatus(stateWith({}));
      assert.equal(status.connected, false);
      assert.equal(status.wsStatus, 'connecting');
      assert.equal(status.totalServers, 0);
      assert.equal(status.reportingServers, 0);
      assert.equal(status.missingServers, 0);
      assert.equal(status.partial, false);
      assert.equal(status.telemetryAgeMs, null);
      assert.equal(status.stale, false);
    });

    it('hydrated servers that never ticked are missing', () => {
      const servers = { s1: makeRuntime('s1'), s2: makeRuntime('s2') };
      const status = realtimeStatus(stateWith({ servers, connected: true }));
      assert.equal(status.totalServers, 2);
      assert.equal(status.reportingServers, 0);
      assert.equal(status.missingServers, 2);
      assert.equal(status.partial, false); // nothing reporting yet
    });

    it('partial when some but not all servers report', () => {
      const servers = { s1: makeRuntime('s1'), s2: makeRuntime('s2') };
      const snapshots = { s1: {} as MetricSnapshot };
      const status = realtimeStatus(stateWith({ servers, snapshots, connected: true }));
      assert.equal(status.totalServers, 2);
      assert.equal(status.reportingServers, 1);
      assert.equal(status.missingServers, 1);
      assert.equal(status.partial, true);
    });

    it('full reporting is not partial', () => {
      const servers = { s1: makeRuntime('s1'), s2: makeRuntime('s2') };
      const snapshots = { s1: {} as MetricSnapshot, s2: {} as MetricSnapshot };
      const status = realtimeStatus(stateWith({ servers, snapshots, connected: true }));
      assert.equal(status.partial, false);
      assert.equal(status.missingServers, 0);
    });

    it('stale when the last tick is older than the threshold', () => {
      const oldTick = Date.now() - 31_000;
      const status = realtimeStatus(stateWith({ lastTickAt: oldTick }));
      assert.equal(status.stale, true);
      assert.ok(status.telemetryAgeMs && status.telemetryAgeMs > 30_000);
    });

    it('not stale while the last tick is fresh', () => {
      const status = realtimeStatus(stateWith({ lastTickAt: Date.now() }));
      assert.equal(status.stale, false);
      assert.ok(status.telemetryAgeMs != null && status.telemetryAgeMs < 1_000);
    });

    it('connected reflects the stored transport boolean', () => {
      assert.equal(realtimeStatus(stateWith({ connected: true, wsStatus: 'open' })).connected, true);
      assert.equal(realtimeStatus(stateWith({ connected: false, wsStatus: 'open' })).connected, false);
      // wsStatus is reported as-is
      assert.equal(realtimeStatus(stateWith({ connected: true, wsStatus: 'reconnecting' })).wsStatus, 'reconnecting');
    });
  });

  describe('applySnapshots store action', () => {
    beforeEach(() => {
      useTelemetryStore.setState({
        servers: { s1: makeRuntime('s1') },
        snapshots: {},
        lastTickAt: null,
        connected: false,
        wsStatus: 'connecting',
        backendError: null,
        sparklines: {},
      });
    });

    it('ignores snapshots for unknown servers but still stamps the tick time', () => {
      useTelemetryStore.getState().applySnapshots([makeSnapshot('ghost')]);
      const state = useTelemetryStore.getState();
      assert.equal(Object.keys(state.snapshots).length, 0);
      assert.equal(Object.keys(state.sparklines).length, 0);
      assert.ok(state.lastTickAt != null, 'applySnapshots stamps lastTickAt on every call');
    });

    it('patches the runtime from the snapshot', () => {
      useTelemetryStore.getState().applySnapshots([makeSnapshot('s1', { cpu: 77, status: 'degraded' })]);
      const server = useTelemetryStore.getState().servers['s1'];
      assert.equal(server.cpu, 77);
      assert.equal(server.status, 'degraded');
      assert.equal(server.lastSeen, useTelemetryStore.getState().snapshots['s1'].timestamp);
    });

    it('builds bounded sparkline ring buffers with the most recent value last', () => {
      const pulses = Array.from({ length: 100 }, (_, i) => makeSnapshot('s1', { cpu: i, ramUsedGb: 32, ramTotalGb: 64, diskUsedGb: 500, diskTotalGb: 1000, tempC: 41, netUpMbps: 2, netDownMbps: 20, load: 1 }));
      useTelemetryStore.getState().applySnapshots(pulses);
      const rings = useTelemetryStore.getState().sparklines['s1'];
      // Ring buffer caps near HISTORY_LEN (91 entries at steady state) and drops oldest
      assert.ok(rings.cpu.length <= 91, `expected bounded ring, got ${rings.cpu.length}`);
      assert.ok(rings.cpu.length >= 90, `expected at least 90 samples, got ${rings.cpu.length}`);
      assert.equal(rings.cpu.at(-1), 99, 'newest sample retained');
      assert.equal(rings.cpu[0], 9, 'oldest sample aged out');
    });

    it('sets lastTickAt on successful application', () => {
      useTelemetryStore.getState().applySnapshots([makeSnapshot('s1')]);
      assert.ok(useTelemetryStore.getState().lastTickAt != null);
    });
  });

  describe('hydrate/patchServer store actions', () => {
    beforeEach(() => {
      useTelemetryStore.setState({ servers: {}, snapshots: {}, lastTickAt: null, connected: false, wsStatus: 'connecting', backendError: null, sparklines: {} });
    });

    it('hydrate adds servers keyed by spec.id', () => {
      useTelemetryStore.getState().hydrate([makeRuntime('s1'), makeRuntime('s2')]);
      const servers = selectServers(useTelemetryStore.getState());
      assert.equal(servers.length, 2);
      assert.ok(useTelemetryStore.getState().servers['s1']);
    });

    it('patchServer merges a single server', () => {
      useTelemetryStore.getState().patchServer(makeRuntime('s1'));
      const server = useTelemetryStore.getState().servers['s1'];
      assert.equal(server.spec.id, 's1');
    });

    it('setBackendError stores and clears errors', () => {
      const err = new Error('boom');
      useTelemetryStore.getState().setBackendError(err);
      assert.equal(useTelemetryStore.getState().backendError, err);
      useTelemetryStore.getState().setBackendError(null);
      assert.equal(useTelemetryStore.getState().backendError, null);
    });

    it('setWsStatus forces connected off unless open', () => {
      useTelemetryStore.getState().setConnected(true);
      useTelemetryStore.getState().setWsStatus('reconnecting');
      assert.equal(useTelemetryStore.getState().connected, false);
      // Opening does not synthesize a connection — the app marks freshness separately
      useTelemetryStore.getState().setWsStatus('open');
      assert.equal(useTelemetryStore.getState().connected, false);
      useTelemetryStore.getState().setConnected(true);
      assert.equal(useTelemetryStore.getState().connected, true);
    });
  });
});