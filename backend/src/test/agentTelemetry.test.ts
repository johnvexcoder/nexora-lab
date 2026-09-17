/**
 * Cross-repository telemetry integration test (TASK-039).
 *
 * Runs the REAL Core app (HomeLab-OS backend) on an ephemeral port and drives
 * it with the EXACT wire format the Nexora Agent (HomeLab-Agent) produces —
 * including the v1 envelope built by the agent's transport — verifying end to
 * end: registration, X-Agent-Key authentication, capabilities, telemetry
 * integration into the agents table, events, missing-data behavior, and the
 * heartbeat-check offline path.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { Server } from 'node:http';

const ADMIN_PASSWORD = 'Zq7!mN4pRt9W';
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'homelab-agent-tt-'));

let app: http.RequestListener;
let server: Server;
let getDb: () => any;
let base = '';
let apiKey = '';

const HOST_ID = 't-host-1';

interface Jar {
  [key: string]: string;
}
function parseJar(header: string): Jar {
  const jar: Jar = {};
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    jar[part.slice(0, idx).trim()] = part.slice(idx + 1).split(';')[0].trim();
  }
  return jar;
}
const cookieHeader = (jar: Jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

async function postAgent(path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

const keyHeaders = (): Record<string, string> => ({ 'x-agent-key': apiKey, 'x-agent-version': '2.1.0' });

function v1Envelope(payload: unknown): Record<string, unknown> {
  return {
    protocolVersion: 1,
    agentVersion: '2.1.0',
    nodeId: HOST_ID,
    hostname: 't-host-1',
    timestamp: Date.now(),
    payload,
  };
}

const registerBody = {
  hostId: HOST_ID,
  hostName: 't-host-1',
  ip: '10.0.0.5',
  os: 'ubuntu',
  osId: 'ubuntu',
  kernel: '6.8.0',
  arch: 'amd64',
  hostType: 'vm',
  hypervisor: 'proxmox',
  platform: 'linux',
  manufacturer: 'QEMU',
  product: 'Standard PC',
  machineId: 'm-1',
  capabilities: ['cpu', 'memory', 'filesystem'],
  plugins: ['linux'],
};

const reportBody = {
  hostInfo: { hostId: HOST_ID, hostName: 't-host-1', ip: '10.0.0.5', os: 'ubuntu', kernel: '6.8.0', arch: 'amd64', hostType: 'vm', machineId: 'm-1' },
  capabilities: ['cpu', 'memory', 'filesystem'],
  plugins: [
    {
      plugin: 'linux',
      collectedAt: Date.now(),
      data: {
        cpu: { usagePercent: 42.5, cores: 4 },
        memory: { totalGb: 16, usedGb: 3.1 },
        disk: { root: { usedGb: 20, totalGb: 100 } },
        load: { avg1: 1.2 },
        network: { downMbps: 10, upMbps: 2 },
        processes: { total: 120 },
        uptime: 1000,
        tags: { docker: { installed: true, running: true } },
      },
    },
  ],
  events: [],
  reportedAt: Date.now(),
  agentVersion: '2.1.0',
};

const eventsBody = {
  hostId: HOST_ID,
  events: [
    { id: 'evt-1', timestamp: Date.now(), severity: 'warning', plugin: 'linux', resource: 'cpu', message: 'high cpu', previousState: 'normal', currentState: 'warning' },
  ],
};

before(async () => {
  process.env.MOCK_MODE = 'false';
  process.env.DATA_DIR = DATA_DIR;
  process.env.ADMIN_INITIAL_PASSWORD = ADMIN_PASSWORD;
  process.env.SECRET_ENCRYPTION_KEY = 'test-encryption-key-1234567890';

  const { createApp } = await import('../app');
  const { TelemetryEngine } = await import('../telemetry/engine');
  const { MockMetricsProvider } = await import('../providers/mockMetricsProvider');
  const { MockNotificationsProvider } = await import('../providers/mockNotificationsProvider');
  const { getDb: get } = await import('../db/database');
  const { bootstrapSecurity } = await import('../security/boot');
  getDb = get;
  getDb();
  bootstrapSecurity();

  app = createApp({ metrics: new MockMetricsProvider(new TelemetryEngine()), notifications: new MockNotificationsProvider() });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  // Login as admin (session + csrf), then create the agent (CSRF-exempt under /api/agent/).
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: ADMIN_PASSWORD }),
  });
  assert.equal(login.status, 200, 'admin login failed');
  const jar = parseJar(login.headers.get('set-cookie') || '');
  const created = await fetch(base + '/api/agent/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader(jar) },
    body: JSON.stringify({ hostId: HOST_ID, hostName: 't-host-1' }),
  });
  const createdBody = await created.text();
  assert.equal(created.status, 200, `agent create failed: ${createdBody}`);
  const createdJson = createdBody ? (JSON.parse(createdBody) as { apiKey?: string }) : { apiKey: '' };
  apiKey = createdJson.apiKey ?? '';
  assert.ok(apiKey.startsWith('hl_'), 'generated key uses the hl_ discriminator');
});

after(() => {
  server.close();
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

function agentRow(): any {
  return getDb().prepare('SELECT * FROM agents WHERE host_id = ?').get(HOST_ID);
}

describe('Core↔Agent cross-repository telemetry integration', () => {
  it('rejects an unknown agent key with 401', async () => {
    const r = await postAgent('/api/agent/report', reportBody, { 'x-agent-key': 'hl_wrongkey123', 'x-agent-version': '2.1.0' });
    assert.equal(r.status, 401);
  });

  it('v0 registration authenticates, echoes hostId and stores capabilities', async () => {
    const r = await postAgent('/api/agent/register', registerBody, keyHeaders());
    assert.equal(r.status, 200);
    assert.equal(r.json.hostId, HOST_ID);
    const row = agentRow();
    assert.equal(row.os, 'ubuntu');
    assert.equal(row.host_type, 'vm');
    assert.equal(row.capabilities_json, JSON.stringify(['cpu', 'memory', 'filesystem']));
  });

  it('v0 telemetry report integrates flat metrics into the agents table', async () => {
    const r = await postAgent('/api/agent/report', reportBody, keyHeaders());
    assert.equal(r.status, 200);
    const row = agentRow();
    assert.equal(row.cpu_usage, 42.5);
    assert.equal(row.cpu_cores, 4);
    assert.equal(row.ram_total_gb, 16);
    assert.equal(row.ram_used_gb, 3.1);
    assert.equal(row.disk_used_gb, 20);
    assert.equal(row.net_down_mbps, 10);
    assert.equal(row.load_1, 1.2);
    assert.equal(row.process_count, 120);
    assert.equal(row.status, 'online');
    const plugins = JSON.parse(row.plugins_json);
    assert.equal(plugins[0].plugin, 'linux');
  });

  it('v1 register/report/events unwrap through the envelope adapter', async () => {
    const reg = await postAgent('/api/agent/register', v1Envelope(registerBody), { ...keyHeaders(), 'x-protocol-version': '1' });
    assert.equal(reg.status, 200, `v1 register failed: ${JSON.stringify(reg.json)}`);

    const rep = await postAgent('/api/agent/report', v1Envelope({ ...reportBody, plugins: [{ ...reportBody.plugins[0], data: { ...reportBody.plugins[0].data, cpu: { usagePercent: 88.0, cores: 4 } } }] }), { ...keyHeaders(), 'x-protocol-version': '1' });
    assert.equal(rep.status, 200, `v1 report failed: ${JSON.stringify(rep.json)}`);
    assert.equal(agentRow().cpu_usage, 88.0, 'v1 report updated telemetry via the envelope payload');

    const evt = await postAgent('/api/agent/events', v1Envelope(eventsBody), { ...keyHeaders(), 'x-protocol-version': '1' });
    assert.equal(evt.status, 200, `v1 events failed: ${JSON.stringify(evt.json)}`);
  });

  it('a malformed v1 envelope is rejected with 400 (so the agent downgrades)', async () => {
    const r = await postAgent('/api/agent/report', { protocolVersion: 1, nodeId: HOST_ID }, { ...keyHeaders(), 'x-protocol-version': '1' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'invalid_envelope');
  });

  it('events are stored with a composite idempotent key', async () => {
    const r = await postAgent('/api/agent/events', eventsBody, keyHeaders());
    assert.equal(r.status, 200);
    const stored = getDb().prepare('SELECT * FROM agent_events WHERE agent_id = ? AND id LIKE ?').all(agentRow().id, `%:evt-1`);
    assert.ok(stored.length >= 1, 'event stored');
  });

  it('missing-data telemetry is handled gracefully (no crash, values fall back)', async () => {
    const sparse = {
      ...reportBody,
      plugins: [{ plugin: 'linux', collectedAt: Date.now(), data: { cpu: { usagePercent: 30 } } }],
    };
    const r = await postAgent('/api/agent/report', sparse, keyHeaders());
    assert.equal(r.status, 200, `sparse report must not fail: ${JSON.stringify(r.json)}`);
    const row = agentRow();
    assert.equal(row.cpu_usage, 30);
  });

  it('heartbeat-check marks stale agents offline', async () => {
    const db = getDb();
    db.prepare('UPDATE agents SET last_report_at = ? WHERE host_id = ?').run(Date.now() - 60_000, HOST_ID);
    const jar = parseJar((await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: ADMIN_PASSWORD }) })).headers.get('set-cookie') || '');
    const r = await fetch(base + '/api/agent/heartbeat-check', { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieHeader(jar) } });
    assert.equal(r.status, 200);
    const body = (await r.json()) as { markedOffline: number };
    assert.ok(body.markedOffline >= 1);
    assert.equal(agentRow().status, 'offline');
  });
});