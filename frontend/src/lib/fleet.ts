/**
 * Canonical dashboard fleet state.
 *
 * Every dashboard summary component (greeting, summary chips, health status,
 * System Resources, Running Services, Storage) derives from THIS module so the
 * whole dashboard reads the same numbers from the same source. This is what
 * fixes the historic contradiction where one panel reported "14 nodes online"
 * while another reported "0 monitored / offline / score 0".
 *
 * Source of truth:
 *   - Topology network nodes = authoritative representation of *what exists*
 *     and its *state* (an infrastructure host is online/offline regardless of
 *     whether the live telemetry tick has arrived yet).
 *   - Telemetry server runtimes = live resource *metrics* (cpu/ram/storage).
 *
 * Metrics are only reported when a real reading exists. Missing telemetry is
 * represented as `null` / "Unavailable", NEVER as a fabricated 0%.
 */

import type { NetworkNode, NetworkNodeType, ServerRuntime, ServerStatus } from '@/types';
import { pct } from '@/lib/utils';

/** Boundary / non-infrastructure node types — never counted as a server. */
export const BOUNDARY_TYPES: ReadonlySet<NetworkNodeType> = new Set([
  'internet',
  'cloud',
  'laptop',
  'desktop',
  'ups',
]);

/** Infrastructure host types — counted in the "Servers" summary chip. */
export const INFRA_HOST_TYPES: ReadonlySet<NetworkNodeType> = new Set([
  'hypervisor',
  'physical',
  'gateway',
  'switch',
  'docker',
  'podman',
  'kubernetes',
  'storage',
  'nas',
  'firewall',
]);

/** Workload types — counted in the "Containers / VMs" summary chip. */
export const WORKLOAD_TYPES: ReadonlySet<NetworkNodeType> = new Set([
  'vm',
  'lxc',
  'container',
]);

export function isInfraHost(type: NetworkNodeType): boolean {
  return INFRA_HOST_TYPES.has(type);
}

export function isWorkload(type: NetworkNodeType): boolean {
  return WORKLOAD_TYPES.has(type);
}

/** True when the node participates in fleet health/counts. */
export function isMonitoredNode(type: NetworkNodeType): boolean {
  return isInfraHost(type) || isWorkload(type);
}

export interface FleetResources {
  /** Aggregate CPU utilisation (0-100) or null when no reading exists. */
  cpu: number | null;
  /** Aggregate RAM utilisation (0-100) or null when no reading exists. */
  ram: number | null;
  /** Aggregate storage used (GB) or null when no reading exists. */
  storageUsedGb: number | null;
  /** Aggregate storage capacity (GB) or null when no reading exists. */
  storageTotalGb: number | null;
  /** Aggregate storage utilisation (0-100) or null. */
  storagePct: number | null;
}

export interface FleetSummary {
  /** Total monitored infrastructure hosts (Servers chip). */
  servers: number;
  /** Total workloads (Containers / VMs chip). */
  workloads: number;
  /** Running service count (Running Services panel). */
  services: number;
  online: number;
  degraded: number;
  offline: number;
  unknown: number;
  /** Derived fleet operational status used by the greeting/health. */
  status: ServerStatus;
  /** True once real topology exists (distinguishes "0 nodes" from "not loaded"). */
  hasTopology: boolean;
  resources: FleetResources;
}

export const EMPTY_RESOURCES: FleetResources = {
  cpu: null,
  ram: null,
  storageUsedGb: null,
  storageTotalGb: null,
  storagePct: null,
};

export const EMPTY_SUMMARY: FleetSummary = {
  servers: 0,
  workloads: 0,
  services: 0,
  online: 0,
  degraded: 0,
  offline: 0,
  unknown: 0,
  status: 'offline',
  hasTopology: false,
  resources: { ...EMPTY_RESOURCES },
};

function nodesStatus(
  nodes: NetworkNode[],
): { online: number; degraded: number; offline: number; unknown: number } {
  let online = 0;
  let degraded = 0;
  let offline = 0;
  let unknown = 0;
  for (const n of nodes) {
    if (!isMonitoredNode(n.type)) continue;
    switch (n.status) {
      case 'online':
        online += 1;
        break;
      case 'degraded':
        degraded += 1;
        break;
      case 'offline':
        offline += 1;
        break;
      default:
        unknown += 1;
        break;
    }
  }
  return { online, degraded, offline, unknown };
}

function statusFromCounts(counts: {
  online: number;
  degraded: number;
  offline: number;
  unknown: number;
}): ServerStatus {
  if (counts.offline > 0) return 'offline';
  if (counts.degraded > 0) return 'degraded';
  if (counts.online > 0) return 'online';
  return 'offline';
}

function aggregateResources(servers: ServerRuntime[]): FleetResources {
  const known = servers.filter((s) => s.spec.diskTotalGb > 0);
  if (servers.length === 0) return { ...EMPTY_RESOURCES };

  // Only average metrics over hosts that actually reported a value.
  const cpus = servers.filter((s) => s.cpu != null).map((s) => s.cpu);
  const rams = servers
    .filter((s) => s.spec.ramTotalGb > 0)
    .map((s) => pct(s.ramUsedGb, s.spec.ramTotalGb));

  const cpu = cpus.length > 0 ? cpus.reduce((a, b) => a + b, 0) / cpus.length : null;
  const ram = rams.length > 0 ? rams.reduce((a, b) => a + b, 0) / rams.length : null;

  const storageUsedGb = known.reduce((a, s) => a + s.diskUsedGb, 0);
  const storageTotalGb = known.reduce((a, s) => a + s.spec.diskTotalGb, 0);
  const storagePct = storageTotalGb > 0 ? pct(storageUsedGb, storageTotalGb) : null;

  return {
    cpu: cpu == null ? null : Math.round(cpu * 10) / 10,
    ram: ram == null ? null : Math.round(ram * 10) / 10,
    storageUsedGb: storageUsedGb,
    storageTotalGb,
    storagePct: storagePct == null ? null : Math.round(storagePct * 10) / 10,
  };
}

/**
 * Derive a single, consistent fleet summary from the authoritative topology
 * nodes and the live telemetry servers.
 *
 * @param nodes   network topology nodes (authoritative existence/state)
 * @param servers telemetry server runtimes (authoritative live metrics)
 * @param services count of currently running services (0 = none discovered)
 */
export function deriveFleetSummary(
  nodes: NetworkNode[],
  servers: ServerRuntime[],
  services = 0,
): FleetSummary {
  const hasTopology = nodes.some((n) => isMonitoredNode(n.type));
  const counts = nodesStatus(nodes);

  return {
    servers: nodes.filter((n) => isInfraHost(n.type)).length,
    workloads: nodes.filter((n) => isWorkload(n.type)).length,
    services,
    ...counts,
    status: statusFromCounts(counts),
    hasTopology,
    resources: aggregateResources(servers),
  };
}