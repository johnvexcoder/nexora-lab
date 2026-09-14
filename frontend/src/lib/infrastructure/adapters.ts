import type { NetworkTopology, ServerRole, ServerRuntime } from '@/types';
import type {
  ContainerRuntime,
  InfraContainerEntity,
  InfraEntity,
  InfraHostEntity,
  InfraHypervisorEntity,
  InfraKind,
  InfraLink,
  InfraMetrics,
  InfraServiceEntity,
  InfraSource,
  InfraStorageEntity,
  InfraStatus,
  InfraVmEntity,
  LinkKind,
  RawService,
} from './types';

/**
 * Adapters that map provider payloads (simulator/Proxmox/Docker/Agent) into the
 * provider-neutral infra model. Consumers render the normalized `InfraEntity`
 * types and never poke at provider-specific shapes.
 */

export interface RawDockerContainer {
  id: string;
  name: string;
  running: boolean;
  image: string;
  ports?: string[];
}

export interface RawDockerProfile {
  hostName: string;
  hostIp: string;
  netDownMbps: number;
  netUpMbps: number;
  containers: RawDockerContainer[];
}

/** Node types that are NOT materialized as entities (boundary/household). */
const NON_ENTITY_NETWORK_TYPES = new Set<string>([
  'internet',
  'laptop',
  'desktop',
  'cloud',
  'ups',
]);

/** Node types whose links must be dropped (out of topology scope). */
const HOUSEHOLD_NETWORK_TYPES = new Set<string>(['laptop', 'desktop', 'cloud', 'ups']);

/** Map a topology node type onto the normalized kind (undefined = excluded). */
const NETWORK_KIND_MAP: Record<string, InfraKind | undefined> = {
  physical: 'host',
  gateway: 'host',
  switch: 'host',
  bridge: 'host',
  hypervisor: 'hypervisor',
  vm: 'vm',
  docker: 'vm',
  podman: 'vm',
  kubernetes: 'vm',
  firewall: 'vm',
  lxc: 'container',
  container: 'container',
  storage: 'storage',
  nas: 'storage',
};

const SERVER_ROLES: readonly ServerRole[] = [
  'hypervisor',
  'server',
  'vm',
  'lxc',
  'docker',
  'storage',
  'network',
  'gateway',
  'switch',
];

function isServerRole(value: string): value is ServerRole {
  return (SERVER_ROLES as readonly string[]).includes(value);
}

/**
 * Classify a server (spec role + physical/virtual placement) into a normalized
 * entity kind. Provider-agnostic: uses placement (parentId) rather than
 * assuming a specific hypervisor/Docker naming.
 */
export function classifyServer(role: ServerRole, isPhysical: boolean): InfraKind {
  switch (role) {
    case 'hypervisor':
      return 'hypervisor';
    case 'storage':
      return 'storage';
    case 'lxc':
      return 'container';
    case 'docker':
    case 'vm':
      return 'vm';
    case 'server':
    case 'network':
    case 'gateway':
    case 'switch':
      return isPhysical ? 'host' : 'vm';
    default:
      return 'host';
  }
}

function serverSource(): InfraSource {
  return 'configured';
}

function serverMetricsFromRuntime(rt: ServerRuntime): InfraMetrics {
  return {
    cpuPercent: rt.cpu ?? null,
    ramUsedGb: rt.ramUsedGb ?? null,
    ramTotalGb: rt.spec.ramTotalGb ?? null,
    diskUsedGb: rt.diskUsedGb ?? null,
    diskTotalGb: rt.spec.diskTotalGb ?? null,
    tempC: rt.tempC ?? null,
    netUpMbps: rt.netUpMbps ?? null,
    netDownMbps: rt.netDownMbps ?? null,
    load: rt.load ?? null,
    uptimeSeconds: rt.uptimeSeconds ?? null,
  };
}

/** Normalize a single `ServerRuntime` (any provider) into an `InfraEntity`. */
export function adaptServerRuntime(rt: ServerRuntime): InfraEntity {
  const { spec } = rt;
  const isPhysical = !spec.parentId;
  const kind = classifyServer(spec.role, isPhysical);

  const base = {
    id: spec.id,
    name: spec.name,
    status: rt.status as InfraStatus,
    health: rt.health,
    ip: spec.ip,
    source: serverSource(),
    metrics: serverMetricsFromRuntime(rt),
  };

  switch (kind) {
    case 'hypervisor':
      return {
        ...base,
        kind,
        hostname: spec.hostname,
        os: spec.os,
        capabilities: spec.capabilities,
        cpuCores: spec.cpuCores,
        vmCount: spec.profile.vms ?? null,
      } satisfies InfraHypervisorEntity;
    case 'host':
      return {
        ...base,
        kind,
        hostname: spec.hostname,
        os: spec.os,
        roles: [spec.role],
        capabilities: spec.capabilities,
        cpuCores: spec.cpuCores,
      } satisfies InfraHostEntity;
    case 'vm':
      return {
        ...base,
        kind,
        os: spec.os,
        hypervisorId: spec.parentId ?? null,
        containerRuntime: spec.role === 'docker' ? 'docker' : 'unknown',
        containerCount: spec.profile.containers ?? null,
        parentId: spec.parentId,
      } satisfies InfraVmEntity;
    case 'container':
      return {
        ...base,
        kind,
        runtime: spec.role === 'lxc' ? 'lxc' : 'unknown',
        parentHostId: spec.parentId,
        parentId: spec.parentId,
      } satisfies InfraContainerEntity;
    case 'storage':
      return {
        ...base,
        kind,
        storageType: spec.capabilities.includes('storage') ? 'nas' : 'disk',
        capacityGb: spec.diskTotalGb ?? null,
        usedGb: rt.diskUsedGb ?? null,
      } satisfies InfraStorageEntity;
    default:
      return {
        ...base,
        kind: 'host',
        hostname: spec.hostname,
        os: spec.os,
        roles: [spec.role],
      } satisfies InfraHostEntity;
  }
}

/** Normalize a batch of `ServerRuntime`s. */
export function adaptServerRuntimes(runtimes: ServerRuntime[]): InfraEntity[] {
  return runtimes.map(adaptServerRuntime);
}

/**
 * Normalize Docker host profiles into VM entities plus their container children
 * and intra-host virtual links. Hosts matching an existing server entity are
 * deduped by the caller (`buildInfraGraph`).
 */
export function adaptDockerProfiles(
  profiles: RawDockerProfile[],
): { entities: InfraEntity[]; links: InfraLink[] } {
  const entities: InfraEntity[] = [];
  const links: InfraLink[] = [];

  for (const profile of profiles) {
    const anyRunning = profile.containers.some((c) => c.running);
    const hostId = profile.hostName;

    entities.push({
      id: hostId,
      name: profile.hostName,
      kind: 'vm',
      status: anyRunning ? 'online' : 'offline',
      health: anyRunning ? 100 : 0,
      ip: profile.hostIp,
      source: 'docker',
      containerRuntime: 'docker',
      containerCount: profile.containers.length,
      metrics: {
        netUpMbps: profile.netUpMbps ?? null,
        netDownMbps: profile.netDownMbps ?? null,
      },
    } satisfies InfraVmEntity);

    for (const c of profile.containers) {
      entities.push({
        id: c.id,
        name: c.name,
        kind: 'container',
        status: c.running ? 'online' : 'offline',
        health: c.running ? 100 : 0,
        ip: profile.hostIp ?? null,
        source: 'docker',
        runtime: 'docker',
        image: c.image,
        ports: c.ports,
        parentId: hostId,
        parentHostId: hostId,
      } satisfies InfraContainerEntity);

      links.push({
        id: `${hostId}-${c.id}`,
        source: hostId,
        target: c.id,
        kind: 'virtual',
        status: c.running ? 'healthy' : 'warning',
        latencyMs: 0.05,
        throughputMbps: 1000,
        jitterMs: 0.01,
        packetLoss: 0,
      });
    }
  }

  return { entities, links };
}

function deriveLinkKind(srcKind: InfraKind | undefined, tgtKind: InfraKind | undefined): LinkKind {
  // Either endpoint unresolved → treat as uplink to an external boundary.
  if (srcKind === undefined || tgtKind === undefined) return 'uplink';
  const isVirtual = (k: InfraKind) => k === 'vm' || k === 'container';
  return isVirtual(srcKind) && isVirtual(tgtKind) ? 'virtual' : 'physical';
}

/**
 * Normalize the network topology payload into entities and links, dropping
 * household/client/cloud device types from the graph per the design scope
 * (topology is server-infrastructure only). Node types map onto the normalized
 * kinds; `entityById` (e.g. from `adaptServerRuntimes`) is reused when present
 * so spine nodes still get a lightweight entity of their own.
 */
export function adaptNetworkTopology(
  topology: NetworkTopology,
  entityById?: Map<string, InfraEntity>,
): { entities: InfraEntity[]; links: InfraLink[] } {
  const entities: InfraEntity[] = [];
  const nodeKind = new Map<string, InfraKind>();
  const nodeType = new Map<string, string>();

  for (const node of topology.nodes) {
    nodeType.set(node.id, node.type);
    if (NON_ENTITY_NETWORK_TYPES.has(node.type)) continue;
    const kind = NETWORK_KIND_MAP[node.type];
    if (!kind) continue;
    nodeKind.set(node.id, kind);

    const existing = entityById?.get(node.id);
    if (existing) {
      entities.push(existing);
      continue;
    }

    const base = {
      id: node.id,
      name: node.label,
      status: node.status as InfraStatus,
      health: node.health,
      ip: node.ip,
      source: 'topology' as InfraSource,
      parentId: node.parentId,
    };

    switch (kind) {
      case 'hypervisor':
        entities.push({ ...base, kind });
        break;
      case 'host':
        entities.push({
          ...base,
          kind,
          roles: isServerRole(node.type) ? [node.type] : [],
        });
        break;
      case 'vm':
        entities.push({ ...base, kind, hypervisorId: node.parentId ?? null });
        break;
      case 'container':
        entities.push({
          ...base,
          kind,
          runtime: (node.type as ContainerRuntime) ?? 'unknown',
          parentHostId: node.parentId,
        });
        break;
      case 'storage':
        entities.push({
          ...base,
          kind,
          storageType: node.type === 'nas' ? 'nas' : 'disk',
        });
        break;
      default:
        break;
    }
  }

  // A link is in scope when both endpoints resolve (internet counts as the
  // external uplink boundary); links touching household/client devices are
  // dropped entirely.
  const isScoped = (nodeId: string): boolean => {
    if (nodeKind.has(nodeId)) return true;
    const type = nodeType.get(nodeId);
    return type === 'internet' || (!type && Boolean(entityById?.get(nodeId)));
  };

  const links: InfraLink[] = topology.links
    .filter((link) => isScoped(link.source) && isScoped(link.target))
    .map((link) => {
      const srcKind = nodeKind.get(link.source) ?? entityById?.get(link.source)?.kind;
      const tgtKind = nodeKind.get(link.target) ?? entityById?.get(link.target)?.kind;
      return {
        id: link.id,
        source: link.source,
        target: link.target,
        kind: deriveLinkKind(srcKind, tgtKind),
        status: link.status,
        latencyMs: link.latencyMs,
        throughputMbps: link.throughputMbps,
        jitterMs: link.jitterMs,
        packetLoss: link.packetLoss,
      };
    });

  return { entities, links };
}

/** Normalize raw (agent-style) service reports into `InfraServiceEntity`s. */
export function adaptServices(rawServices: RawService[]): InfraServiceEntity[] {
  return rawServices.map((svc, i) => ({
    id: svc.id ?? `svc-${svc.hostId ?? 'unknown'}-${i}`,
    name: svc.name,
    kind: 'service',
    status: svc.status ?? 'unknown',
    health: svc.health ?? null,
    parentId: svc.hostId,
    source: 'agent',
    serviceType: svc.plugin,
    port: svc.port ?? null,
    endpoint: svc.endpoint ?? null,
  }));
}

export interface BuildInfraGraphOpts {
  servers?: ServerRuntime[];
  network?: NetworkTopology;
  dockerProfiles?: RawDockerProfile[];
  serviceReports?: RawService[];
}

/**
 * Combine every available source into a single normalized graph. Precedence:
 * server runtimes (richest telemetry) > docker profiles > network topology.
 * Entities are deduped by id so providers never duplicate a node.
 */
export function buildInfraGraph(opts: BuildInfraGraphOpts): {
  entities: InfraEntity[];
  links: InfraLink[];
  entityById: Map<string, InfraEntity>;
} {
  const entityById = new Map<string, InfraEntity>();
  const links: InfraLink[] = [];

  if (opts.servers) {
    for (const entity of adaptServerRuntimes(opts.servers)) {
      entityById.set(entity.id, entity);
    }
  }

  if (opts.dockerProfiles) {
    const docker = adaptDockerProfiles(opts.dockerProfiles);
    for (const entity of docker.entities) {
      if (!entityById.has(entity.id)) entityById.set(entity.id, entity);
    }
    links.push(...docker.links);
  }

  if (opts.network) {
    const topology = adaptNetworkTopology(opts.network, entityById);
    for (const entity of topology.entities) {
      if (!entityById.has(entity.id)) entityById.set(entity.id, entity);
    }
    links.push(...topology.links);
  }

  if (opts.serviceReports) {
    for (const entity of adaptServices(opts.serviceReports)) {
      entityById.set(entity.id, entity);
    }
  }

  return {
    entities: Array.from(entityById.values()),
    links,
    entityById,
  };
}