import type { ServerCapability, ServerRole, ServerStatus } from '@/types';

/**
 * Provider-neutral infrastructure entity model.
 *
 * The Core exposes telemetry from several providers (simulator, Proxmox, Docker,
 * remote agents). This module defines a single normalized vocabulary the UI can
 * render against without knowing which provider produced a node:
 *
 *   host       — physical server / network appliance (gateway, switch, bare metal)
 *   hypervisor — physical node running VMs / LXC
 *   vm         — virtualized compute unit (VM, or a Docker/Podman host)
 *   container  — container runtime unit (Docker/LXC/Podman/…) attached to a parent
 *   storage    — storage appliance (NAS, ZFS server, backup target)
 *   service    — monitored service running on a host
 *
 * Missing or unmeasured fields are `null`/absent — never `0`. Operators are
 * expected to treat "unavailable" as distinct from "measured zero" (see
 * PROTOCOL-GUIDELINES.md).
 */

export type InfraKind = 'host' | 'hypervisor' | 'vm' | 'container' | 'storage' | 'service';

export type InfraStatus = ServerStatus | 'unknown' | 'stale';

/** Which backend produced this entity (diagnostic only — shape is identical). */
export type InfraSource =
  | 'simulator'
  | 'proxmox'
  | 'docker'
  | 'agent'
  | 'configured'
  | 'topology'
  | 'unknown';

/** Normalized utilization metrics. Every field is optional and nullable. */
export interface InfraMetrics {
  cpuPercent?: number | null;
  ramUsedGb?: number | null;
  ramTotalGb?: number | null;
  diskUsedGb?: number | null;
  diskTotalGb?: number | null;
  tempC?: number | null;
  netUpMbps?: number | null;
  netDownMbps?: number | null;
  load?: number | null;
  uptimeSeconds?: number | null;
  /** Unix timestamp of last telemetry update. Used to detect stale data. */
  lastSeen?: number | null;
}

/** Fields shared by every entity kind. */
export interface InfraEntityBase {
  /** Stable id within the normalized graph. */
  id: string;
  name: string;
  status: InfraStatus;
  health: number | null;
  ip?: string | null;
  parentId?: string;
  source: InfraSource;
  metrics?: InfraMetrics;
}

/** Physical server or network appliance. */
export interface InfraHostEntity extends InfraEntityBase {
  kind: 'host';
  hostname?: string;
  os?: string;
  /** Original (possibly provider-specific) role labels for display. */
  roles?: ServerRole[];
  capabilities?: ServerCapability[];
  cpuCores?: number;
}

/** Physical node that virtualizes compute (VM/LXC). */
export interface InfraHypervisorEntity extends InfraEntityBase {
  kind: 'hypervisor';
  hostname?: string;
  os?: string;
  capabilities?: ServerCapability[];
  cpuCores?: number;
  /** Number of VMs this hypervisor hosts; null when not reported. */
  vmCount?: number | null;
}

/** Virtualized compute unit (VM, or a containerized host such as a Docker VM). */
export interface InfraVmEntity extends InfraEntityBase {
  kind: 'vm';
  os?: string;
  /** The hypervisor (or parent) hosting this VM. */
  hypervisorId?: string | null;
  containerRuntime?: 'docker' | 'podman' | 'unknown';
  containerCount?: number | null;
}

export type ContainerRuntime =
  | 'docker'
  | 'lxc'
  | 'podman'
  | 'containerd'
  | 'kubernetes'
  | 'unknown';

/** A running/stopped container attached to a parent host. */
export interface InfraContainerEntity extends InfraEntityBase {
  kind: 'container';
  runtime?: ContainerRuntime;
  image?: string | null;
  ports?: string[];
  parentHostId?: string;
}

export type StorageType = 'disk' | 'zfs' | 'nas' | 'san' | 'network' | 'unknown';

/** Storage appliance or volume endpoint. */
export interface InfraStorageEntity extends InfraEntityBase {
  kind: 'storage';
  storageType?: StorageType;
  capacityGb?: number | null;
  usedGb?: number | null;
}

/** Monitored service running on a host. */
export interface InfraServiceEntity extends InfraEntityBase {
  kind: 'service';
  serviceType?: string;
  port?: number | null;
  endpoint?: string | null;
}

export type InfraEntity =
  | InfraHostEntity
  | InfraHypervisorEntity
  | InfraVmEntity
  | InfraContainerEntity
  | InfraStorageEntity
  | InfraServiceEntity;

export type LinkStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

/** How the link was observed/derived. */
export type LinkKind = 'physical' | 'virtual' | 'logical' | 'uplink';

export interface InfraLink {
  id: string;
  source: string;
  target: string;
  kind: LinkKind;
  status: LinkStatus;
  latencyMs?: number | null;
  throughputMbps?: number | null;
  jitterMs?: number | null;
  packetLoss?: number | null;
}

export interface InfraGraph {
  entities: InfraEntity[];
  links: InfraLink[];
  entityById: Map<string, InfraEntity>;
}

/**
 * Minimal raw service input accepted by `adaptServices()`. A provider that
 * reports monitored services (e.g. the agent `linux` plugin's `services`
 * capability) can be normalized downstream of this shape.
 */
export interface RawService {
  id?: string;
  name: string;
  status?: ServerStatus;
  health?: number | null;
  hostId?: string;
  port?: number | null;
  endpoint?: string | null;
  unitName?: string;
  plugin?: string;
}