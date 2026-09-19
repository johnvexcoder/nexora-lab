/**
 * Canonical infrastructure entity model.
 *
 * Every Nexora surface (Dashboard, Servers, Network, Inventory, Inspector,
 * Search) derives its presentation from THIS single classification instead of
 * writing route-specific exceptions or inferring identity from hostnames.
 *
 * Classification is driven by authoritative metadata:
 *   - role            (provider-reported entity role)
 *   - parentId        (explicit parent relationship → whether this is a guest)
 *   - capabilities    (virtualization, containerization, storage, gateway…)
 *   - profile.containers / profile.vms (reported workload counts)
 *   - sensors         (temperature capability — belongs to the entity that reports it)
 *   - clusterId       (Proxmox cluster membership)
 *
 * The user's chosen names (docker01, pve0, …) are LABELS, never classification
 * rules. Display Name is what humans see.
 */

import type { ServerCapability, ServerRole, ServerRuntime, ServerStatus } from '@/types';
import { ContainerRuntime } from './types';

export type EntityCategory =
  | 'hypervisor'
  | 'physical'
  | 'vm'
  | 'lxc'
  | 'containerHost'
  | 'storage'
  | 'gateway'
  | 'switch';

export interface EntityProfile {
  id: string;
  /** Authoritative human-readable name. */
  displayName: string;
  hostname: string;
  os: string;
  role: ServerRole;
  category: EntityCategory;
  platform: string;
  /** True when this entity is a guest of a parent (VM/LXC) rather than bare metal. */
  isVirtual: boolean;
  parentId?: string;
  clusterId: string | null;
  capabilities: ServerCapability[];
  status: ServerStatus;
  ip?: string;
  containerRuntime?: ContainerRuntime;
  containerCount: number | null;
  vmCount: number | null;
  /** This entity's own reported temperature (never inherited from a parent). */
  temperature: { available: boolean; value: number | null };
  location: string;
  cpuCores: number;
}

const PLATFORM_BY_OS: Array<[RegExp, string]> = [
  [/Proxmox/i, 'Proxmox VE'],
  [/TrueNAS/i, 'TrueNAS'],
  [/OPNsense/i, 'OPNsense'],
  [/Ubiquiti|UniFi/i, 'UniFi'],
  [/Docker/i, 'Docker'],
];

function platformFromOs(os: string | undefined, fallback: string): string {
  if (!os) return fallback;
  for (const [re, label] of PLATFORM_BY_OS) {
    if (re.test(os)) return label;
  }
  return os;
}

/** Resolve the authoritative display name: Display Name → hostname → id. */
export function resolveDisplayName(spec: {
  name?: string;
  hostname?: string;
  id?: string;
}): string {
  if (spec.name) return spec.name;
  if (spec.hostname) return spec.hostname;
  return spec.id ?? 'Unknown';
}

/**
 * Classify a provider-reported entity (ServerRuntime) into the canonical
 * `EntityProfile`. Uses role + parentId + capabilities + workload counts —
 * never the entity's name/id.
 */
export function classifyEntity(runtime: ServerRuntime): EntityProfile {
  const spec = runtime.spec;
  const role = spec.role;
  const isVirtual = Boolean(spec.parentId);
  const caps = spec.capabilities ?? [];
  const hasContainerRuntime =
    role === 'docker' || caps.includes('containerization');
  const containerCount = spec.profile.containers > 0 ? spec.profile.containers : null;
  const vmCount = spec.profile.vms > 0 ? spec.profile.vms : null;

  let category: EntityCategory;
  let platform: string;
  let containerRuntime: ContainerRuntime | undefined;

  switch (role) {
    case 'hypervisor':
      category = 'hypervisor';
      platform = platformFromOs(spec.os, 'Proxmox VE');
      break;
    case 'gateway':
      category = 'gateway';
      platform = platformFromOs(spec.os, 'Router / Firewall');
      break;
    case 'switch':
      category = 'switch';
      platform = platformFromOs(spec.os, 'Switch');
      break;
    case 'storage':
      category = 'storage';
      platform = platformFromOs(spec.os, 'Storage');
      break;
    case 'docker':
      category = 'containerHost';
      platform = 'Docker Host';
      containerRuntime = 'docker';
      break;
    case 'network':
      // A "network" role is a virtual firewall/gateway appliance when it is a
      // guest; otherwise it is physical gateway infrastructure.
      category = isVirtual ? 'vm' : 'gateway';
      platform = platformFromOs(spec.os, isVirtual ? 'Firewall / Gateway' : 'Router / Firewall');
      break;
    case 'lxc':
      category = 'lxc';
      platform = 'Proxmox LXC';
      containerRuntime = 'lxc';
      break;
    case 'server':
    default:
      category = isVirtual ? 'vm' : 'physical';
      platform = platformFromOs(spec.os, isVirtual ? 'Virtual Machine' : 'Physical Server');
      break;
  }

  // A VM that reports a container runtime with >= 1 discovered container is a
  // Container Host operationally.
  if (
    category === 'vm' &&
    hasContainerRuntime &&
    containerCount != null &&
    containerCount > 0
  ) {
    category = 'containerHost';
    platform = 'Docker Host';
    containerRuntime = containerRuntime ?? 'docker';
  }

  return {
    id: spec.id,
    displayName: resolveDisplayName(spec),
    hostname: spec.hostname,
    os: spec.os,
    role,
    category,
    platform,
    isVirtual,
    parentId: spec.parentId,
    clusterId: spec.clusterId ?? null,
    capabilities: caps,
    status: runtime.status,
    ip: spec.ip,
    containerRuntime,
    containerCount,
    vmCount,
    temperature: temperatureOf(runtime),
    location: spec.location,
    cpuCores: spec.cpuCores,
  };
}

/**
 * Temperature belongs to the entity that reports it. It is available only when
 * the entity advertises a temperature capability and produced a reading.
 * A guest VM never inherits its parent's temperature.
 */
export function temperatureOf(runtime: ServerRuntime): {
  available: boolean;
  value: number | null;
} {
  const spec = runtime.spec;
  const hasSensor =
    (spec.sensors?.length ?? 0) > 0 || Boolean((spec as { _tempSource?: string })._tempSource);
  const reported = typeof runtime.tempC === 'number' && runtime.tempC > 0;
  return {
    available: hasSensor && reported,
    value: hasSensor && reported ? runtime.tempC : null,
  };
}

/** Canonical icon key for an entity profile (see lib/icons). */
export function iconKeyFor(profile: EntityProfile): string {
  switch (profile.category) {
    case 'hypervisor':
      return 'hypervisor';
    case 'containerHost':
      return 'docker';
    case 'vm':
      return 'vm';
    case 'lxc':
      return 'lxc';
    case 'storage':
      return 'storage';
    case 'gateway':
      return 'gateway';
    case 'switch':
      return 'switch';
    case 'physical':
      return 'physical';
    default:
      return 'physical';
  }
}

export interface EntityBadge {
  label: string;
  /** tone class like 'accent' | 'info' | 'crit' | 'neutral' … */
  tone: 'neutral' | 'info' | 'accent' | 'warn' | 'crit' | 'success';
  /** tailwind text/border class for custom badges. */
  cls?: string;
}

/**
 * Canonical badge set for an entity. Proxmox cluster membership appears only
 * on actual hypervisors, never inherited by guest VMs.
 */
export function entityBadges(profile: EntityProfile, clusterName?: string): EntityBadge[] {
  const badges: EntityBadge[] = [];
  switch (profile.category) {
    case 'hypervisor':
      badges.push({ label: 'Hypervisor', tone: 'neutral' });
      break;
    case 'containerHost':
      badges.push({ label: 'Container Host', tone: 'neutral' });
      badges.push({ label: 'CONTAINERS', tone: 'accent', cls: 'bg-accent/10 text-accent border-accent/20' });
      break;
    case 'vm':
      badges.push({ label: 'Server', tone: 'neutral' });
      badges.push({ label: 'VIRTUAL MACHINE', tone: 'success', cls: 'bg-success/10 text-success border-success/20' });
      break;
    case 'lxc':
      badges.push({ label: 'LXC', tone: 'info' });
      break;
    case 'storage':
      badges.push({ label: 'Storage', tone: 'neutral' });
      break;
    case 'gateway':
      badges.push({ label: 'Gateway', tone: 'neutral' });
      break;
    case 'switch':
      badges.push({ label: 'Switch', tone: 'neutral' });
      break;
    case 'physical':
      badges.push({ label: 'Physical', tone: 'neutral' });
      break;
    default:
      break;
  }
  // Only actual hypervisors display cluster membership.
  if (profile.category === 'hypervisor' && profile.clusterId && clusterName) {
    badges.push({ label: clusterName, tone: 'warn' });
  }
  return badges;
}

/** Resolve the parent entity's display name (relationship-driven). */
export function parentDisplayName(
  profile: EntityProfile,
  servers: ServerRuntime[],
): string | null {
  if (!profile.parentId) return null;
  const parent = servers.find((s) => s.spec.id === profile.parentId);
  if (!parent) return null;
  return resolveDisplayName(parent.spec);
}

/** Convenience: build profiles + a lookup by id for a fleet. */
export function classifyFleet(servers: ServerRuntime[]): {
  profiles: EntityProfile[];
  byId: Map<string, EntityProfile>;
} {
  const profiles = servers.map(classifyEntity);
  return { profiles, byId: new Map(profiles.map((p) => [p.id, p])) };
}

export type { ContainerRuntime };
export type { ServerCapability, ServerRole };