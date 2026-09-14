import type { ReactNode } from 'react';
import type { InfraMetrics, InfraStatus } from '@/lib/infrastructure';
import { TopologyNode, type TopologyNodeProps } from './TopologyNode';
import { StatusPill, getEffectiveStatus } from './status';

/**
 * Kind-specific topology nodes. Each component fixes the `kind` and renders a
 * compact "real status" line (live metric + status text) so a node shows
 * meaningful telemetry, not status color alone. All of them are thin wrappers
 * around the accessible `TopologyNode` base and stay fully reusable.
 */

/** Shared secondary row: status pill on the left, live metric on the right. */
export function StatusRow({
  status,
  metric,
  metrics,
}: {
  status: InfraStatus;
  metric?: ReactNode;
  metrics?: InfraMetrics;
}) {
  const effectiveStatus = getEffectiveStatus(status, metrics);
  const showStale = effectiveStatus === 'stale';
  return (
    <div className="flex w-full items-center justify-between gap-1.5 leading-none text-text-secondary">
      <StatusPill status={effectiveStatus} showStale={showStale} />
      {metric != null && (
        <span className="shrink-0 truncate font-mono text-[9px]">{metric}</span>
      )}
    </div>
  );
}

/** First non-null preferred metric rendered compactly. */
export function pickPrimaryMetric(
  metrics: InfraMetrics | undefined,
  preferred: Array<'cpuPercent' | 'tempC' | 'ramUsedGb' | 'diskUsedGb'> = ['cpuPercent'],
): string | undefined {
  for (const key of preferred) {
    const value = metrics?.[key];
    if (value != null && typeof value === 'number') {
      switch (key) {
        case 'cpuPercent':
          return `${Math.round(value)}%`;
        case 'tempC':
          return `${Math.round(value)}°C`;
        case 'ramUsedGb': {
          const total = metrics?.ramTotalGb;
          return total != null
            ? `${Math.round(value)}/${Math.round(total)} GB`
            : `${Math.round(value)} GB`;
        }
        case 'diskUsedGb': {
          const total = metrics?.diskTotalGb;
          return total != null
            ? `${Math.round(value)}/${Math.round(total)} GB`
            : `${Math.round(value)} GB`;
        }
      }
    }
  }
  return undefined;
}

// ─── Physical Host ──────────────────────────────────────────────

export interface HostNodeProps extends Omit<TopologyNodeProps, 'kind'> {
  roles?: string[];
}

export function HostNode(props: HostNodeProps) {
  const metric = pickPrimaryMetric(props.metrics, ['cpuPercent', 'tempC']);
  return (
    <TopologyNode
      {...props}
      kind="host"
      secondary={<StatusRow status={props.status} metric={metric} metrics={props.metrics} />}
    />
  );
}

// ─── Hypervisor ─────────────────────────────────────────────────

export interface HypervisorNodeProps extends Omit<TopologyNodeProps, 'kind'> {
  vmCount?: number | null;
  hostname?: string;
}

export function HypervisorNode({ vmCount, hostname, ...props }: HypervisorNodeProps) {
  const metric =
    vmCount != null
      ? `${vmCount} VMs`
      : pickPrimaryMetric(props.metrics, ['cpuPercent', 'tempC']);
  return (
    <TopologyNode
      {...props}
      kind="hypervisor"
      secondary={<StatusRow status={props.status} metric={metric} metrics={props.metrics} />}
    />
  );
}

// ─── Virtual Machine ────────────────────────────────────────────

export interface VmNodeProps extends Omit<TopologyNodeProps, 'kind'> {
  containerCount?: number | null;
  containerRuntime?: string;
  os?: string;
}

export function VmNode({ containerCount, containerRuntime, ...props }: VmNodeProps) {
  const metric =
    containerCount != null
      ? `${containerCount} containers`
      : pickPrimaryMetric(props.metrics, [
          'cpuPercent',
          'ramUsedGb',
          'tempC',
        ]);
  return (
    <TopologyNode
      {...props}
      kind="vm"
      secondary={<StatusRow status={props.status} metric={metric} metrics={props.metrics} />}
    />
  );
}

// ─── Container ──────────────────────────────────────────────────

export interface ContainerNodeProps extends Omit<TopologyNodeProps, 'kind'> {
  image?: string | null;
  runtime?: string;
}

export function ContainerNode({ image, runtime, ...props }: ContainerNodeProps) {
  const shortImage = image?.split('/').pop()?.split(':')[0] ?? runtime;
  return (
    <TopologyNode
      {...props}
      kind="container"
      secondary={<StatusRow status={props.status} metric={shortImage} metrics={props.metrics} />}
    />
  );
}

// ─── Storage ────────────────────────────────────────────────────

export interface StorageNodeProps extends Omit<TopologyNodeProps, 'kind'> {
  storageType?: string;
  capacityGb?: number | null;
  usedGb?: number | null;
}

export function StorageNode({ capacityGb, usedGb, ...props }: StorageNodeProps) {
  const metric =
    capacityGb != null
      ? usedGb != null
        ? `${Math.round(usedGb)}/${Math.round(capacityGb)} GB`
        : `${Math.round(capacityGb)} GB`
      : pickPrimaryMetric(props.metrics, ['diskUsedGb']);
  return (
    <TopologyNode
      {...props}
      kind="storage"
      secondary={<StatusRow status={props.status} metric={metric} metrics={props.metrics} />}
    />
  );
}

// ─── Monitored Service ──────────────────────────────────────────

export interface ServiceNodeProps extends Omit<TopologyNodeProps, 'kind'> {
  port?: number | null;
  endpoint?: string | null;
  serviceType?: string;
}

export function ServiceNode({ port, endpoint, serviceType, ...props }: ServiceNodeProps) {
  const metric = port != null ? `:${port}` : serviceType ?? endpoint ?? undefined;
  return (
    <TopologyNode
      {...props}
      kind="service"
      secondary={<StatusRow status={props.status} metric={metric} metrics={props.metrics} />}
    />
  );
}