import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptServerRuntime,
  adaptServerRuntimes,
  adaptDockerProfiles,
  adaptNetworkTopology,
  adaptServices,
  buildInfraGraph,
  classifyServer,
  networkNodeKind,
} from '@/lib/infrastructure/adapters';
import {
  filterByKind,
  getEntityById,
  getChildren,
  getParent,
  byStatus,
} from '@/lib/infrastructure';
import type { ServerRuntime } from '@/types';

function makeRuntime(overrides: Partial<ServerRuntime> = {}): ServerRuntime {
  return {
    spec: {
      id: 'pve0',
      serverId: 'pve0-uuid',
      hostname: 'pve0.lab',
      name: 'pve0',
      logo: 'proxmox',
      os: 'Debian 12',
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

describe('infrastructure adapters', () => {
  describe('networkNodeKind', () => {
    it('maps physical to host', () => {
      assert.equal(networkNodeKind('physical'), 'host');
    });

    it('maps hypervisor to hypervisor', () => {
      assert.equal(networkNodeKind('hypervisor'), 'hypervisor');
    });

    it('maps vm/docker/podman to vm', () => {
      assert.equal(networkNodeKind('vm'), 'vm');
      assert.equal(networkNodeKind('docker'), 'vm');
      assert.equal(networkNodeKind('podman'), 'vm');
    });

    it('maps lxc/container to container', () => {
      assert.equal(networkNodeKind('lxc'), 'container');
      assert.equal(networkNodeKind('container'), 'container');
    });

    it('maps storage/nas to storage', () => {
      assert.equal(networkNodeKind('storage'), 'storage');
      assert.equal(networkNodeKind('nas'), 'storage');
    });

    it('excludes household/client devices', () => {
      assert.equal(networkNodeKind('laptop'), undefined);
      assert.equal(networkNodeKind('desktop'), undefined);
      assert.equal(networkNodeKind('cloud'), undefined);
      assert.equal(networkNodeKind('ups'), undefined);
    });

    it('excludes internet boundary', () => {
      assert.equal(networkNodeKind('internet'), undefined);
    });
  });

  describe('classifyServer', () => {
    it('always classifies hypervisor as hypervisor', () => {
      assert.equal(classifyServer('hypervisor', true), 'hypervisor');
      assert.equal(classifyServer('hypervisor', false), 'hypervisor');
    });

    it('classifies storage as storage', () => {
      assert.equal(classifyServer('storage', true), 'storage');
    });

    it('classifies lxc as container', () => {
      assert.equal(classifyServer('lxc', false), 'container');
    });

    it('classifies docker/vm as vm regardless of placement', () => {
      assert.equal(classifyServer('docker', false), 'vm');
      assert.equal(classifyServer('vm', false), 'vm');
      assert.equal(classifyServer('docker', true), 'vm');
    });

    it('classifies server/gateway/switch by physical placement', () => {
      assert.equal(classifyServer('server', true), 'host');
      assert.equal(classifyServer('server', false), 'vm');
      assert.equal(classifyServer('gateway', true), 'host');
      assert.equal(classifyServer('gateway', false), 'vm');
      assert.equal(classifyServer('network', true), 'host');
      assert.equal(classifyServer('switch', true), 'host');
    });
  });

  describe('adaptServerRuntime', () => {
    it('normalizes a bare-metal host without a parentId', () => {
      const entity = adaptServerRuntime(makeRuntime({ spec: { ...makeRuntime().spec, role: 'server', parentId: '' } }));
      assert.equal(entity.kind, 'host');
      assert.equal(entity.id, 'pve0');
      assert.equal(entity.status, 'online');
      assert.equal(entity.source, 'configured');
      assert.equal(entity.ip, '192.168.1.10');
      assert.ok(entity.metrics);
      assert.equal(entity.metrics.cpuPercent, 35);
      assert.equal(entity.metrics.ramUsedGb, 60);
      assert.equal(entity.metrics.ramTotalGb, 128);
    });

    it('normalizes a hypervisor with vmCount', () => {
      const entity = adaptServerRuntime(makeRuntime());
      assert.equal(entity.kind, 'hypervisor');
      assert.equal(entity.id, 'pve0');
      assert.equal(entity.vmCount, 4);
      assert.equal(entity.cpuCores, 16);
    });

    it('normalizes a VM with hypervisorId', () => {
      const entity = adaptServerRuntime(
        makeRuntime({
          spec: { ...makeRuntime().spec, id: 'vm1', role: 'vm', parentId: 'pve0', profile: { ...makeRuntime().spec.profile, containers: 0, vms: 0 } },
        }),
      );
      assert.equal(entity.kind, 'vm');
      assert.equal(entity.hypervisorId, 'pve0');
      assert.equal(entity.parentId, 'pve0');
      assert.equal(entity.containerCount, 0);
    });

    it('normalizes a container with runtime lxc', () => {
      const entity = adaptServerRuntime(
        makeRuntime({
          spec: { ...makeRuntime().spec, id: 'ct1', role: 'lxc', parentId: 'pve0' },
        }),
      );
      assert.equal(entity.kind, 'container');
      assert.equal(entity.runtime, 'lxc');
      assert.equal(entity.parentHostId, 'pve0');
    });

    it('normalizes storage entity with capacity', () => {
      const entity = adaptServerRuntime(
        makeRuntime({
          spec: { ...makeRuntime().spec, id: 'nas1', role: 'storage', capabilities: ['storage'], diskTotalGb: 8000 },
        }),
      );
      assert.equal(entity.kind, 'storage');
      assert.equal(entity.storageType, 'nas');
      assert.equal(entity.capacityGb, 8000);
      assert.equal(entity.usedGb, 800);
    });

    it('does not fabricate metrics — missing fields become null', () => {
      const rt = makeRuntime();
      rt.cpu = undefined as unknown as number;
      rt.diskUsedGb = undefined as unknown as number;
      rt.tempC = undefined as unknown as number;
      const entity = adaptServerRuntime(rt);
      assert.equal(entity.metrics?.cpuPercent ?? null, null);
      assert.equal(entity.metrics?.diskUsedGb ?? null, null);
      assert.equal(entity.metrics?.tempC ?? null, null);
    });

    it('adapts multiple runtimes preserving count', () => {
      const entities = adaptServerRuntimes([makeRuntime(), makeRuntime({ spec: { ...makeRuntime().spec, id: 'srv2', role: 'server' } })]);
      assert.equal(entities.length, 2);
    });
  });

  describe('adaptDockerProfiles', () => {
    const profile = {
      hostName: 'docker01',
      hostIp: '192.168.1.20',
      netDownMbps: 200,
      netUpMbps: 30,
      containers: [
        { id: 'c1', name: 'uptime-kuma', running: true, image: 'louislam/uptime-kuma:latest' },
        { id: 'c2', name: 'grafana', running: false, image: 'grafana/grafana:latest' },
      ],
    };

    it('creates host VM entity for docker host', () => {
      const { entities } = adaptDockerProfiles([profile]);
      const host = entities.find((e) => e.id === 'docker01');
      assert.ok(host);
      assert.equal(host.kind, 'vm');
      assert.equal(host.status, 'online'); // at least one running
      assert.equal(host.containerRuntime, 'docker');
      assert.equal(host.containerCount, 2);
      assert.equal(host.source, 'docker');
    });

    it('marks host offline when no container runs', () => {
      const { entities } = adaptDockerProfiles([
        { ...profile, containers: [{ id: 'c1', name: 'x', running: false, image: 'x' }] },
      ]);
      const host = entities.find((e) => e.id === 'docker01');
      assert.ok(host);
      assert.equal(host.status, 'offline');
      assert.equal(host.health, 0);
    });

    it('creates container children with correct parent', () => {
      const { entities } = adaptDockerProfiles([profile]);
      const c1 = entities.find((e) => e.id === 'c1');
      const c2 = entities.find((e) => e.id === 'c2');
      assert.ok(c1 && c2);
      assert.equal(c1.kind, 'container');
      assert.equal(c1.status, 'online');
      assert.equal(c1.parentId, 'docker01');
      assert.equal(c1.image, 'louislam/uptime-kuma:latest');
      assert.equal(c2.status, 'offline');
      if (c2.kind !== 'container') throw new Error('expected container entity');
      assert.equal(c2.parentHostId, 'docker01');
    });

    it('creates intra-host virtual links for each container', () => {
      const { links } = adaptDockerProfiles([profile]);
      assert.equal(links.length, 2);
      for (const link of links) {
        assert.equal(link.kind, 'virtual');
        assert.equal(link.source, 'docker01');
      }
      const runningLink = links.find((l) => l.target === 'c1');
      const stoppedLink = links.find((l) => l.target === 'c2');
      assert.ok(runningLink);
      assert.ok(stoppedLink);
      assert.equal(runningLink.status, 'healthy');
      assert.equal(stoppedLink.status, 'warning');
    });
  });

  describe('adaptNetworkTopology', () => {
    const topology = {
      nodes: [
        { id: 'net', label: 'Internet', type: 'internet', status: 'online', health: 100, x: 0, y: 0 },
        { id: 'gw', label: 'Gateway', type: 'gateway', status: 'online', health: 98, x: 1, y: 1, ip: '192.168.1.1' },
        { id: 'sw', label: 'Switch', type: 'switch', status: 'online', health: 97, x: 2, y: 1, ip: '192.168.1.2' },
        { id: 'pv0', label: 'PVE0', type: 'hypervisor', status: 'online', health: 95, x: 3, y: 1, ip: '192.168.1.10' },
        { id: 'vm1', label: 'vm1', type: 'vm', status: 'online', health: 90, x: 4, y: 2, parentId: 'pv0', ip: '192.168.1.50' },
        { id: 'laptop', label: 'Laptop', type: 'laptop', status: 'online', health: 100, x: 5, y: 3 },
        { id: 'nas-storage', label: 'NAS', type: 'nas', status: 'online', health: 85, x: 3, y: 3, ip: '192.168.1.30' },
      ],
      links: [
        { id: 'l1', source: 'net', target: 'gw', status: 'healthy' },
        { id: 'l2', source: 'gw', target: 'sw', status: 'healthy' },
        { id: 'l3', source: 'sw', target: 'pv0', status: 'healthy' },
        { id: 'l4', source: 'pv0', target: 'vm1', status: 'healthy' },
        { id: 'l5', source: 'gw', target: 'laptop', status: 'healthy' },
        { id: 'l6', source: 'sw', target: 'nas-storage', status: 'healthy' },
      ],
      icons: {},
    } as const;

    it('drops household/client devices entirely', () => {
      const { entities } = adaptNetworkTopology(topology as never);
      const ids = entities.map((e) => e.id);
      assert.ok(!ids.includes('laptop'), 'laptop should be excluded');
      assert.equal(ids.includes('net'), false); // internet excluded from entities
    });

    it('creates entities for in-scope nodes', () => {
      const { entities } = adaptNetworkTopology(topology as never);
      const ids = entities.map((e) => e.id);
      for (const id of ['gw', 'sw', 'pv0', 'vm1', 'nas-storage']) {
        assert.ok(ids.includes(id), `missing ${id}`);
      }
    });

    it('kinds reflect node type', () => {
      const { entities } = adaptNetworkTopology(topology as never);
      const byId = new Map(entities.map((e) => [e.id, e]));
      assert.equal(byId.get('gw')!.kind, 'host');
      assert.equal(byId.get('pv0')!.kind, 'hypervisor');
      assert.equal(byId.get('vm1')!.kind, 'vm');
      assert.equal(byId.get('nas-storage')!.kind, 'storage');
      const nas = byId.get('nas-storage')!;
      assert.equal(nas.kind, 'storage');
      assert.equal(nas.storageType, 'nas');
    });

    it('labels link kinds by endpoint virtuality', () => {
      const { links } = adaptNetworkTopology(topology as never);
      const byId = new Map(links.map((l) => [l.id, l]));
      // hypervisor → vm is physical (only vm→vm/container links are virtual)
      const vmLink = byId.get('l4')!;
      assert.equal(vmLink.kind, 'physical');
      const physical = byId.get('l3')!;
      assert.equal(physical.kind, 'physical'); // switch → hypervisor
      const uplink = byId.get('l1')!;
      assert.equal(uplink.kind, 'uplink'); // internet boundary
    });

    it('drops links touching household devices', () => {
      const { links } = adaptNetworkTopology(topology as never);
      const ids = links.map((l) => l.id);
      assert.ok(!ids.includes('l5'), 'laptop link should be dropped');
    });

    it('reuses existing entities from entityById when present', () => {
      const existing = adaptServerRuntime(
        makeRuntime({ spec: { ...makeRuntime().spec, id: 'pv0', role: 'hypervisor' } }),
      );
      const entityById = new Map([[existing.id, existing]]);
      const { entities } = adaptNetworkTopology(topology as never, entityById);
      const pv0 = entities.find((e) => e.id === 'pv0');
      assert.ok(pv0);
      assert.equal(pv0.source, 'configured'); // the richer server entity, not the topology one
    });
  });

  describe('adaptServices', () => {
    it('maps raw services to service entities', () => {
      const entities = adaptServices([
        { name: 'nginx', status: 'online', hostId: 'vm1', port: 80, plugin: 'linux' },
        { name: 'postgres', status: 'online', hostId: 'vm1', port: 5432, plugin: 'linux' },
      ]);
      assert.equal(entities.length, 2);
      assert.equal(entities[0].kind, 'service');
      assert.equal(entities[0].parentId, 'vm1');
      assert.equal(entities[0].port, 80);
      assert.equal(entities[0].source, 'agent');
      assert.equal(entities[0].serviceType, 'linux');
    });

    it('generates stable ids when id is absent', () => {
      const entities = adaptServices([{ name: 'nginx', hostId: 'vm1' }]);
      assert.equal(entities[0].id, 'svc-vm1-0');
    });

    it('defaults missing status to unknown and health to null', () => {
      const entities = adaptServices([{ name: 'no-status', hostId: 'vm1' }]);
      assert.equal(entities[0].status, 'unknown');
      assert.equal(entities[0].health, null);
      assert.equal(entities[0].port, null);
      assert.equal(entities[0].endpoint, null);
    });

    it('preserves provided id', () => {
      const entities = adaptServices([{ id: 'svc-abc', name: 'nginx', hostId: 'vm1' }]);
      assert.equal(entities[0].id, 'svc-abc');
    });
  });

  describe('buildInfraGraph', () => {
    it('precedence: servers win over docker and topology for same id', () => {
      const graph = buildInfraGraph({
        servers: [
          makeRuntime({ spec: { ...makeRuntime().spec, id: 'srv1', role: 'server', parentId: '' } }),
        ],
        dockerProfiles: [
          { hostName: 'srv1', hostIp: '10.0.0.1', netDownMbps: 100, netUpMbps: 10, containers: [] },
        ],
      });
      const entity = graph.entityById.get('srv1');
      assert.ok(entity);
      assert.equal(entity.source, 'configured'); // richer server source won
      assert.equal(entity.kind, 'host');
    });

    it('dedupes entities by id', () => {
      const graph = buildInfraGraph({
        servers: [
          makeRuntime({ spec: { ...makeRuntime().spec, id: 'srv1', role: 'server', parentId: '' } }),
        ],
        network: {
          nodes: [
            { id: 'srv1', label: 'srv1', type: 'physical', status: 'online', health: 90, x: 0, y: 0 },
          ],
          links: [],
          icons: {},
        } as never,
      });
      const ids = graph.entities.filter((e) => e.id === 'srv1');
      assert.equal(ids.length, 1, 'server entity should appear once');
    });

    it('merges docker, topology and services into one graph', () => {
      const graph = buildInfraGraph({
        servers: [makeRuntime()],
        dockerProfiles: [
          { hostName: 'docker01', hostIp: '10.0.0.2', netDownMbps: 100, netUpMbps: 10, containers: [{ id: 'c1', name: 'redis', running: true, image: 'redis' }] },
        ],
        network: {
          nodes: [
            { id: 'gw', label: 'Gateway', type: 'gateway', status: 'online', health: 98, x: 0, y: 0, ip: '10.0.0.1' },
          ],
          links: [],
          icons: {},
        } as never,
        serviceReports: [{ name: 'nginx', status: 'online', hostId: 'docker01' }],
      });
      assert.ok(graph.entityById.has('pve0'));
      assert.ok(graph.entityById.has('docker01'));
      assert.ok(graph.entityById.has('c1'));
      assert.ok(graph.entityById.has('gw'));
      assert.equal(graph.entities.length, 5);
    });

    it('returns empty graph for no sources', () => {
      const graph = buildInfraGraph({});
      assert.deepEqual(graph.entities, []);
      assert.deepEqual(graph.links, []);
      assert.equal(graph.entityById.size, 0);
    });
  });

  describe('selectors', () => {
    it('filterByKind only returns entities of the requested kind', () => {
      const graph = buildInfraGraph({
        servers: [
          makeRuntime(),
          makeRuntime({ spec: { ...makeRuntime().spec, id: 'vm1', role: 'vm', parentId: 'pve0' } }),
        ],
      });
      const vms = filterByKind(graph.entities, 'vm');
      assert.equal(vms.length, 1);
      assert.equal(vms[0]!.id, 'vm1');
    });

    it('getEntityById finds entities', () => {
      const graph = buildInfraGraph({ servers: [makeRuntime()] });
      assert.equal(getEntityById(graph, 'pve0')!.kind, 'hypervisor');
      assert.equal(getEntityById(graph, 'missing'), undefined);
    });

    it('getChildren returns entities whose parentId matches', () => {
      const graph = buildInfraGraph({
        servers: [
          makeRuntime(),
          makeRuntime({ spec: { ...makeRuntime().spec, id: 'vm1', role: 'vm', parentId: 'pve0' } }),
          makeRuntime({ spec: { ...makeRuntime().spec, id: 'vm2', role: 'vm', parentId: 'pve0' } }),
        ],
      });
      const children = getChildren(graph, 'pve0');
      assert.deepEqual(children.map((c) => c.id).sort(), ['vm1', 'vm2']);
    });

    it('getParent resolves the parent entity', () => {
      const graph = buildInfraGraph({
        servers: [
          makeRuntime(),
          makeRuntime({ spec: { ...makeRuntime().spec, id: 'vm1', role: 'vm', parentId: 'pve0' } }),
        ],
      });
      const parent = getParent(graph, 'vm1');
      assert.equal(parent?.id, 'pve0');
      assert.equal(getParent(graph, 'pve0'), undefined);
    });

    it('byStatus filters by status', () => {
      const runtimes = [
        makeRuntime(),
        makeRuntime({ spec: { ...makeRuntime().spec, id: 'srv-off', role: 'server', parentId: '' }, status: 'offline' }),
        makeRuntime({ spec: { ...makeRuntime().spec, id: 'srv-deg', role: 'server', parentId: '' }, status: 'degraded' }),
      ];
      const graph = buildInfraGraph({ servers: runtimes });
      assert.equal(byStatus(graph.entities, 'online').length, 1);
      assert.equal(byStatus(graph.entities, 'offline').length, 1);
      assert.equal(byStatus(graph.entities, 'degraded').length, 1);
    });
  });
});