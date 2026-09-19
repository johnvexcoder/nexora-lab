import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, ShieldCheck, Cpu, MemoryStick, HardDrive, Thermometer } from 'lucide-react';
import type { NetworkNode, ServerRuntime } from '@/types';
import { getStatusMeta } from '@/components/topology/nodes';
import { cn, pct } from '@/lib/utils';
import { classifyEntity, iconKeyFor } from '@/lib/infrastructure/entity';
import { INFRA_ICON_COMPONENTS } from '@/lib/icons';
import {
  INFRA_HOST_TYPES,
  isWorkload,
} from '@/lib/fleet';

/** Node types that map to a top-level host card under the gateway. */
const HOST_CARD_TYPES: ReadonlySet<NetworkNode['type']> = INFRA_HOST_TYPES;

const PLATFORM_LABEL: Record<string, string> = {
  hypervisor: 'Hypervisor',
  physical: 'Physical Server',
  gateway: 'Gateway',
  switch: 'Switch',
  docker: 'Docker Host',
  podman: 'Podman Host',
  kubernetes: 'Kubernetes',
  storage: 'Storage',
  nas: 'NAS',
  firewall: 'Firewall',
  vm: 'Virtual Machine',
  lxc: 'Container',
  container: 'Container',
};

function statusMeta(status: NetworkNode['status']) {
  return getStatusMeta(status);
}

function buildServerLookup(servers: ServerRuntime[]): Map<string, ServerRuntime> {
  const m = new Map<string, ServerRuntime>();
  for (const s of servers) {
    m.set(s.spec.id, s);
    m.set(s.spec.hostname, s);
    if (s.spec.ip) m.set(s.spec.ip, s);
  }
  return m;
}

function MetricBar({
  label,
  value,
  color,
  icon,
  suffix = '%',
}: {
  label: string;
  value: number | null;
  color: string;
  icon: React.ReactNode;
  suffix?: string;
}) {
  const known = value != null && Number.isFinite(value);
  const clamped = known ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-9 shrink-0 items-center gap-1 text-text-muted">
        <span className="shrink-0 text-[10px]">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </span>
      <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-border/50" aria-hidden="true">
        {known && (
          <span
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
            style={{ width: `${clamped}%`, backgroundColor: color }}
          />
        )}
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular text-text-primary">
        {known ? `${Math.round(value)}${suffix}` : '—'}
      </span>
    </div>
  );
}

function HostCard({
  node,
  server,
  children = [],
  onSelect,
}: {
  node: NetworkNode;
  server?: ServerRuntime;
  children?: NetworkNode[];
  onSelect: () => void;
}) {
  const meta = statusMeta(node.status);
  const profile = server ? classifyEntity(server) : null;
  const IconComponent = INFRA_ICON_COMPONENTS[profile ? iconKeyFor(profile) : 'physical'];
  const displayName = profile?.displayName ?? node.label;
  const platform = profile?.platform ?? PLATFORM_LABEL[node.type] ?? node.type;
  const ramPct =
    server && server.spec.ramTotalGb > 0
      ? pct(server.ramUsedGb, server.spec.ramTotalGb)
      : null;
  const diskPct =
    server && server.spec.diskTotalGb > 0
      ? pct(server.diskUsedGb, server.spec.diskTotalGb)
      : null;
  const cpu = node.cpuPercent ?? server?.cpu ?? null;
  const temp = profile?.temperature;

  const vmCount = server ? server.spec.profile.vms ?? 0 : null;
  const containerCount = server ? server.spec.profile.containers ?? 0 : null;

  const childLabels = children.map((c) => c.label).slice(0, 8);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative flex w-56 flex-col gap-2.5 rounded-2xl border border-surface-border/60 bg-surface-elevated/90 p-3 text-left shadow-card backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      aria-label={`${displayName}, ${platform}, ${meta.label}${server?.spec.ip ? `, ${server.spec.ip}` : ''}`}
      aria-describedby={`rel-${node.id}`}
    >
      {/* Relationship popover (hover + focus accessible) */}
      <div
        id={`rel-${node.id}`}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-56 -translate-x-1/2 rounded-xl border border-surface-border bg-black/95 p-3 text-left shadow-2xl backdrop-blur-md group-hover:block group-focus-within:block"
      >
        <div className="text-xs font-semibold text-text-primary">{displayName}</div>
        <div className="font-mono text-[10px] text-text-secondary">{server?.spec.ip ?? node.ip ?? '—'}</div>
        <div className="mt-0.5 text-[10px] text-text-muted">Online</div>
        <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Children</div>
        {childLabels.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-0.5 text-[11px] text-text-secondary">
            {childLabels.map((label) => (
              <li key={label} className="truncate">• {label}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-text-muted">Empty</p>
        )}
      </div>
      <div className="flex items-start gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
          style={{ backgroundColor: `${meta.color}1a`, borderColor: `${meta.color}44`, color: meta.color }}
        >
          {IconComponent && <IconComponent size={18} />}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold text-text-primary group-hover:text-accent">{displayName}</div>
          <div className="truncate text-[11px] text-text-muted">{platform}</div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-text-secondary">{server?.spec.ip ?? node.ip ?? '—'}</div>
        </div>
        <span
          className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: meta.bgColor, color: meta.color }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden="true" />
          {meta.label}
        </span>
      </div>

      {(vmCount != null || containerCount != null) && (
        <div className="grid grid-cols-2 gap-1.5">
          {vmCount != null && (
            <div className="rounded-lg border border-surface-border/60 bg-surface-input/60 px-2 py-1 text-center">
              <div className="font-display text-sm font-bold tabular text-text-primary">{vmCount}</div>
              <div className="text-[9px] uppercase tracking-widest text-text-muted">VMs</div>
            </div>
          )}
          {containerCount != null && (
            <div className="rounded-lg border border-surface-border/60 bg-surface-input/60 px-2 py-1 text-center">
              <div className="font-display text-sm font-bold tabular text-text-primary">{containerCount}</div>
              <div className="text-[9px] uppercase tracking-widest text-text-muted">CTs</div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5 border-t border-surface-border/40 pt-2">
        <MetricBar label="CPU" value={cpu} color="#22D3EE" icon={<Cpu className="h-2.5 w-2.5" />} />
        <MetricBar label="RAM" value={ramPct} color="#0EA5E9" icon={<MemoryStick className="h-2.5 w-2.5" />} />
        <MetricBar label="Disk" value={diskPct} color="#7C3AED" icon={<HardDrive className="h-2.5 w-2.5" />} />
        <MetricBar label="Temp" value={temp?.available ? temp.value : null} suffix="°C" color="#F97316" icon={<Thermometer className="h-2.5 w-2.5" />} />
      </div>
    </button>
  );
}

export function InfrastructureTopology({
  nodes,
  servers,
  loading,
  error,
  className,
}: {
  nodes: NetworkNode[];
  servers: ServerRuntime[];
  loading?: boolean;
  error?: Error | null;
  className?: string;
}) {
  const navigate = useNavigate();
  const serverByNodeId = useMemo(() => buildServerLookup(servers), [servers]);

  const internet = nodes.find((n) => n.type === 'internet');
  const gateway = nodes.find((n) => n.type === 'gateway');
  const hosts = useMemo(
    () =>
      nodes.filter((n) => HOST_CARD_TYPES.has(n.type) && n.type !== 'gateway' && n.type !== 'switch'),
    [nodes],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, NetworkNode[]>();
    for (const n of nodes) {
      if (!n.parentId) continue;
      const arr = map.get(n.parentId) ?? [];
      arr.push(n);
      map.set(n.parentId, arr);
    }
    return map;
  }, [nodes]);
  const workloadCount = nodes.filter((n) => isWorkload(n.type)).length;

  function selectHost(node: NetworkNode) {
    const server = serverByNodeId.get(node.id) ?? serverByNodeId.get(node.label) ?? (node.ip ? serverByNodeId.get(node.ip) : undefined);
    if (server) {
      navigate(`/servers/${encodeURIComponent(server.spec.id)}`);
    } else {
      navigate(`/network?node=${encodeURIComponent(node.id)}`);
    }
  }

  if (loading && hosts.length === 0 && !gateway) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-surface-border/40 text-sm text-text-muted">
        Loading infrastructure…
      </div>
    );
  }

  if (!loading && error && hosts.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-surface-border/40 px-6 text-center text-sm text-text-secondary">
        Unable to load infrastructure topology.
      </div>
    );
  }

  if (!loading && !error && hosts.length === 0 && !gateway) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-surface-border/40 text-sm text-text-muted">
        No infrastructure nodes discovered.
      </div>
    );
  }

  const internetMeta = internet ? statusMeta(internet.status) : undefined;
  const gatewayMeta = gateway ? statusMeta(gateway.status) : undefined;

  return (
    <div className={cn('relative flex h-full min-h-[26rem] flex-col items-center overflow-hidden rounded-2xl border border-surface-border/40 bg-surface/20 px-4 py-6', className)}>
      {/* Atmospheric background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(34,211,238,0.08), transparent 55%)' }} />
        <div className="grid-backdrop absolute inset-0 opacity-20" />
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-cyan-500/30 via-accent/20 to-transparent" />
      </div>

      {/* Internet */}
      {internet && (
        <div className="relative z-10 flex flex-col items-center">
          <div className="flex flex-col items-center gap-1 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-6 py-3 backdrop-blur-md">
            <Globe className="h-8 w-8 text-cyan-400" style={{ filter: 'drop-shadow(0 0 10px rgba(34,211,238,0.4))' }} />
            <span className="text-sm font-semibold text-text-primary">Internet</span>
            <span className="text-[10px] uppercase tracking-widest text-text-muted">Upstream</span>
          </div>
          <span className="mt-1 h-5 w-0.5 rounded-full bg-accent/40" aria-hidden="true" />
        </div>
      )}

      {/* Gateway */}
      {gateway && (
        <div className="relative z-10 mt-0.5 flex flex-col items-center">
          <div className="flex items-center gap-3 rounded-2xl border border-accent/25 bg-surface-elevated/90 px-6 py-3 shadow-card backdrop-blur-md">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${gatewayMeta?.color ?? '#22D3EE'}1a`, color: gatewayMeta?.color ?? '#22D3EE' }}
            >
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-text-primary">Router / Firewall</div>
              <div className="font-mono text-[11px] text-text-secondary">
                {(servers.find((s) => s.spec.role === 'gateway')?.spec.ip) ?? '—'}
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ backgroundColor: `${gatewayMeta?.color ?? '#22C55E'}1a`, color: gatewayMeta?.color ?? '#22C55E' }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: gatewayMeta?.color ?? '#22C55E' }} aria-hidden="true" />
              {gatewayMeta?.label ?? 'Unknown'}
            </span>
          </div>
        </div>
      )}

      {/* Branch connectors */}
      {hosts.length > 0 && (
        <div className="relative z-10 flex flex-col items-center" aria-hidden="true">
          <span className="h-5 w-0.5 rounded-full bg-accent/40" />
          <span className="h-px w-3/4 max-w-md rounded-full bg-accent/30" />
        </div>
      )}

      {/* Host row */}
      {hosts.length > 0 && (
        <div className="relative z-10 mt-4 flex max-w-full flex-wrap items-stretch justify-center gap-3">
          {hosts.map((node) => (
            <HostCard
              key={node.id}
              node={node}
              server={serverByNodeId.get(node.id) ?? serverByNodeId.get(node.label) ?? (node.ip ? serverByNodeId.get(node.ip) : undefined)}
              children={childrenByParent.get(node.id) ?? []}
              onSelect={() => selectHost(node)}
            />
          ))}
        </div>
      )}

      {hosts.length > 0 && workloadCount > 0 && (
        <p className="relative z-10 mt-4 text-[11px] text-text-muted">
          {workloadCount} workload{workloadCount === 1 ? '' : 's'} (VMs / containers) across this infrastructure
        </p>
      )}
    </div>
  );
}