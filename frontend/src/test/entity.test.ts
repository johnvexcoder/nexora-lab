import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ServerRuntime } from '@/types';
import {
  classifyEntity,
  resolveDisplayName,
  temperatureOf,
  entityBadges,
  iconKeyFor,
  parentDisplayName,
  classifyFleet,
} from '@/lib/infrastructure/entity';

function makeRuntime(overrides: Partial<ServerRuntime> = {}): ServerRuntime {
  return {
    spec: {
      id: 'pve0',
      serverId: 'pve0-uuid',
      hostname: 'pve0.lab',
      name: 'Primary Compute',
      logo: 'proxmox',
      os: 'Proxmox VE 8.2',
      description: 'Main hypervisor',
      role: 'hypervisor',
      capabilities: ['virtualization'],
      clusterId: 'cluster-main',
      parentId: '',
      ip: '192.168.1.10',
      location: 'rack-1',
      cpuModel: 'EPYC 7xx',
      cpuCores: 16,
      ramTotalGb: 128,
      diskTotalGb: 2000,
      sensors: [],
      profile: { baseCpu: 20, cpuAmplitude: 10, cpuNoise: 2, baseRamGb: 40, ramDriftGb: 5, baseTemp: 45, tempVariance: 3, baseNetUpMbps: 50, baseNetDownMbps: 500, netBurstRate: 0.5, processes: 200, containers: 0, vms: 4, reliability: 0.99 },
    },
    status: 'online',
    reachability: 'accessible',
    health: 95,
    load: 1.5,
    uptimeSeconds: 86400,
    cpu: 35,
    ramUsedGb: 60,
    diskUsedGb: 800,
    tempC: 48,
    netUpMbps: 40,
    netDownMbps: 420,
    processes: 300,
    lastSeen: Date.now(),
    sensors: [],
    history: { cpu: [], ram: [], disk: [], temp: [], netUp: [], netDown: [], load: [] },
    ...overrides,
  };
}

function withSpec(specOverrides: Partial<ServerRuntime['spec']>, runtimeOverrides: Partial<ServerRuntime> = {}) {
  return makeRuntime({ spec: { ...makeRuntime().spec, ...specOverrides }, ...runtimeOverrides });
}

describe('canonical entity model', () => {
  describe('resolveDisplayName', () => {
    it('uses Display Name first', () => {
      assert.equal(resolveDisplayName({ name: 'Media Host', hostname: 'docker01.lab', id: 'docker01' }), 'Media Host');
    });
    it('falls back to hostname then id', () => {
      assert.equal(resolveDisplayName({ hostname: 'media.lab', id: 'docker01' }), 'media.lab');
      assert.equal(resolveDisplayName({ id: 'docker01' }), 'docker01');
    });
  });

  describe('classification is not name-based', () => {
    it('a plain VM named "docker01" without container runtime is a VM, not a container host', () => {
      const rt = withSpec({ id: 'docker01', name: 'docker01', role: 'server', parentId: 'pve0', profile: { ...makeRuntime().spec.profile, containers: 0 } });
      const p = classifyEntity(rt);
      assert.equal(p.category, 'vm');
      assert.equal(iconKeyFor(p), 'vm');
      assert.equal(entityBadges(p).some((b) => b.label === 'VIRTUAL MACHINE'), true);
      assert.equal(entityBadges(p).some((b) => b.label === 'CONTAINERS'), false);
    });

    it('a hypervisor named "atlas" is still a hypervisor via role metadata', () => {
      const rt = withSpec({ id: 'atlas', name: 'atlas', role: 'hypervisor', os: 'Proxmox VE 8.2' });
      const p = classifyEntity(rt);
      assert.equal(p.category, 'hypervisor');
      assert.equal(iconKeyFor(p), 'hypervisor');
    });
  });

  describe('VM classification', () => {
    it('non-Docker VM with containers reports Container Host + CONTAINERS', () => {
      const rt = withSpec({
        id: 'media', name: 'Media Host', role: 'server', parentId: 'pve0',
        capabilities: ['containerization'],
        profile: { ...makeRuntime().spec.profile, containers: 5 },
      });
      const p = classifyEntity(rt);
      assert.equal(p.category, 'containerHost');
      assert.equal(p.containerCount, 5);
      assert.equal(iconKeyFor(p), 'docker');
      const labels = entityBadges(p).map((b) => b.label);
      assert.ok(labels.includes('Container Host'));
      assert.ok(labels.includes('CONTAINERS'));
    });

    it('ordinary VM without container runtime is a Server / VIRTUAL MACHINE', () => {
      const rt = withSpec({
        id: 'acct', name: 'Accounting Server', role: 'server', parentId: 'pve0',
        capabilities: ['monitoring'],
        profile: { ...makeRuntime().spec.profile, containers: 0 },
      });
      const p = classifyEntity(rt);
      assert.equal(p.category, 'vm');
      assert.equal(iconKeyFor(p), 'vm');
      const labels = entityBadges(p).map((b) => b.label);
      assert.ok(labels.includes('Server'));
      assert.ok(labels.includes('VIRTUAL MACHINE'));
      assert.ok(!labels.includes('CONTAINERS'));
    });

    it('LXC role is LXC, not Docker', () => {
      const rt = withSpec({ id: 'ct1', name: 'ct1', role: 'lxc', parentId: 'pve0' });
      const p = classifyEntity(rt);
      assert.equal(p.category, 'lxc');
      assert.equal(iconKeyFor(p), 'lxc');
      assert.equal(entityBadges(p)[0].label, 'LXC');
    });

    it('guest VM has isVirtual true and preserves parent', () => {
      const rt = withSpec({ id: 'media', name: 'Media Host', role: 'server', parentId: 'pve0' });
      const p = classifyEntity(rt);
      assert.equal(p.isVirtual, true);
      assert.equal(p.parentId, 'pve0');
    });
  });

  describe('physical / gateway / switch / storage', () => {
    it('gateway role → gateway category', () => {
      const p = classifyEntity(withSpec({ id: 'edge', name: 'Edge', role: 'gateway', parentId: '' }));
      assert.equal(p.category, 'gateway');
      assert.equal(iconKeyFor(p), 'gateway');
    });
    it('switch role → switch category', () => {
      const p = classifyEntity(withSpec({ id: 'sw', name: 'Switch', role: 'switch', parentId: '' }));
      assert.equal(p.category, 'switch');
      assert.equal(iconKeyFor(p), 'switch');
    });
    it('physical server without parent → physical', () => {
      const p = classifyEntity(withSpec({ id: 'bm', name: 'Bare Metal', role: 'server', parentId: '' }));
      assert.equal(p.category, 'physical');
      assert.equal(p.isVirtual, false);
    });
    it('storage role → storage', () => {
      const p = classifyEntity(withSpec({ id: 'nas', name: 'NAS', role: 'storage', parentId: 'pve0', os: 'TrueNAS SCALE' }));
      assert.equal(p.category, 'storage');
      assert.equal(iconKeyFor(p), 'storage');
    });
  });

  describe('Proxmox cluster badge rules', () => {
    it('cluster membership only on actual hypervisors', () => {
      const hv = classifyEntity(withSpec({ id: 'pve0', name: 'Compute A', role: 'hypervisor', clusterId: 'lab-proxmox' }));
      assert.ok(entityBadges(hv, 'Nexora Proxmox Cluster').some((b) => b.label === 'Nexora Proxmox Cluster'));

      const guest = classifyEntity(withSpec({ id: 'media', name: 'Media Host', role: 'server', parentId: 'pve0', clusterId: 'lab-proxmox' }));
      const guestLabels = entityBadges(guest, 'Nexora Proxmox Cluster').map((b) => b.label);
      assert.ok(!guestLabels.includes('Nexora Proxmox Cluster'), 'guest VM must not inherit cluster badge');
    });
  });

  describe('temperature', () => {
    it('bare-metal with sensors + reading is available', () => {
      const rt = withSpec({ id: 'pve0', name: 'Compute A', role: 'hypervisor', sensors: [{ kind: 'cpu_temp', label: 'CPU Temp', unit: '°C', value: 48, available: true }] }, { tempC: 48 });
      const t = temperatureOf(rt);
      assert.equal(t.available, true);
      assert.equal(t.value, 48);
      const p = classifyEntity(rt);
      assert.equal(p.temperature.available, true);
    });

    it('VM with no sensors has temperature unavailable even if parent reports temp', () => {
      const rt = withSpec({
        id: 'media', name: 'Media Host', role: 'server', parentId: 'pve0', sensors: [],
      }, { tempC: 51 });
      const t = temperatureOf(rt);
      assert.equal(t.available, false);
      assert.equal(t.value, null);
    });

    it('entity temperature is isolated — does not inherit parent', () => {
      const parent = classifyEntity(withSpec({ id: 'pve0', name: 'Compute A', role: 'hypervisor', sensors: [{ kind: 'cpu_temp', label: 'T', unit: '°C', value: 51, available: true }] }, { tempC: 51 }));
      const child = classifyEntity(withSpec({ id: 'media', name: 'Media Host', role: 'server', parentId: 'pve0', sensors: [] }, { tempC: 51 }));
      assert.equal(parent.temperature.value, 51);
      assert.equal(child.temperature.available, false, 'child must not inherit parent temp');
      assert.equal(child.temperature.value, null);
    });
  });

  describe('parent label resolution', () => {
    it('resolves parent display name from relationship', () => {
      const fleet = [
        makeRuntime({ spec: { ...makeRuntime().spec, id: 'pve0', name: 'Primary Compute', role: 'hypervisor' } }),
      ];
      const child = classifyEntity(withSpec({ id: 'media', name: 'Media Host', role: 'server', parentId: 'pve0' }));
      assert.equal(parentDisplayName(child, fleet), 'Primary Compute');
    });

    it('returns null when parent is unknown', () => {
      const child = classifyEntity(withSpec({ id: 'media', name: 'Media Host', role: 'server', parentId: 'nope' }));
      assert.equal(parentDisplayName(child, []), null);
    });
  });

  describe('zero vs unavailable', () => {
    it('containerCount is null when unknown, 0 is never fabricated', () => {
      const p = classifyEntity(withSpec({ id: 'vm1', name: 'VM', role: 'server', parentId: 'pve0', profile: { ...makeRuntime().spec.profile, containers: 0 } }));
      assert.equal(p.containerCount, null);
    });
  });

  describe('classifyFleet', () => {
    it('classifies a fleet and indexes by id', () => {
      const { profiles, byId } = classifyFleet([
        makeRuntime(),
        withSpec({ id: 'media', name: 'Media Host', role: 'server', parentId: 'pve0', capabilities: ['containerization'], profile: { ...makeRuntime().spec.profile, containers: 3 } }),
        withSpec({ id: 'acct', name: 'Accounting Server', role: 'server', parentId: 'pve0', profile: { ...makeRuntime().spec.profile, containers: 0 } }),
      ]);
      assert.equal(profiles.length, 3);
      assert.equal(byId.get('pve0')!.category, 'hypervisor');
      assert.equal(byId.get('media')!.category, 'containerHost');
      assert.equal(byId.get('acct')!.category, 'vm');
    });
  });
});