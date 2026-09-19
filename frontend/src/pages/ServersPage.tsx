import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTelemetry } from '@/hooks/useTelemetry';
import { useClusters } from '@/hooks/useQueries';
import { ApiError } from '@/api/client';
import { ServerCard } from '@/components/server/ServerCard';
import { ClusterCard } from '@/components/server/ClusterCard';
import { DockerProfileCards } from '@/components/dashboard/DockerProfileCard';
import { ProviderDiagnosticsBanner } from '@/components/provider/ProviderDiagnosticsBanner';
import { Skeleton } from '@/components/ui/Status';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, ForbiddenState } from '@/components/ui/StateViews';
import { cn } from '@/lib/utils';
import { classifyFleet, type EntityCategory } from '@/lib/infrastructure/entity';
import { Server as ServerIcon, Database, Box, Shield, Wifi, Filter, ChevronDown, ServerOff } from 'lucide-react';

type FilterId = EntityCategory | 'all';

const FILTERS: Array<{ id: FilterId; label: string; icon: React.ReactNode }> = [
  { id: 'all', label: 'All', icon: <ServerIcon className="h-3.5 w-3.5" /> },
  { id: 'hypervisor', label: 'Hypervisors', icon: <ServerIcon className="h-3.5 w-3.5" /> },
  { id: 'vm', label: 'VMs', icon: <Box className="h-3.5 w-3.5" /> },
  { id: 'lxc', label: 'LXC', icon: <Box className="h-3.5 w-3.5" /> },
  { id: 'containerHost', label: 'Containers', icon: <Database className="h-3.5 w-3.5" /> },
  { id: 'storage', label: 'Storage', icon: <Database className="h-3.5 w-3.5" /> },
  { id: 'gateway', label: 'Gateway', icon: <Shield className="h-3.5 w-3.5" /> },
  { id: 'switch', label: 'Switches', icon: <Wifi className="h-3.5 w-3.5" /> },
];

const CATEGORY_ICON: Record<EntityCategory, React.ReactNode> = {
  hypervisor: <ServerIcon className="h-3.5 w-3.5 text-amber-400" />,
  vm: <Box className="h-3.5 w-3.5 text-emerald-400" />,
  lxc: <Box className="h-3.5 w-3.5 text-blue-400" />,
  containerHost: <Database className="h-3.5 w-3.5 text-cyan-400" />,
  storage: <Database className="h-3.5 w-3.5 text-warn" />,
  gateway: <Shield className="h-3.5 w-3.5 text-teal-400" />,
  switch: <Wifi className="h-3.5 w-3.5 text-amber-400" />,
  physical: <ServerIcon className="h-3.5 w-3.5 text-text-secondary" />,
};

/** Canonical, category-driven provider groups (no hostname assumptions). */
const GROUPS: Array<{ id: string; label: string; icon: React.ReactNode; match: (c: EntityCategory) => boolean }> = [
  { id: 'hypervisors', label: 'Proxmox Cluster', icon: <ServerIcon className="h-3.5 w-3.5 text-amber-400" />, match: (c) => c === 'hypervisor' },
  { id: 'vms', label: 'VMs & LXC', icon: <Box className="h-3.5 w-3.5 text-emerald-400" />, match: (c) => c === 'vm' || c === 'lxc' },
  { id: 'containers', label: 'Container Hosts', icon: <Database className="h-3.5 w-3.5 text-cyan-400" />, match: (c) => c === 'containerHost' },
  { id: 'storage', label: 'Storage', icon: <Database className="h-3.5 w-3.5 text-warn" />, match: (c) => c === 'storage' },
  { id: 'physical', label: 'Physical Infrastructure', icon: <Shield className="h-3.5 w-3.5 text-teal-400" />, match: (c) => c === 'physical' || c === 'gateway' || c === 'switch' },
];

export default function ServersPage() {
  const { servers, loading, error, refetch, isRefetching } = useTelemetry();
  const { clusters, isLoading: clustersLoading } = useClusters();
  const [filter, setFilter] = useState<FilterId>('all');
  const [groupByProvider, setGroupByProvider] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(GROUPS.map((g) => g.id)));

  const forbidden = error instanceof ApiError && error.status === 403;
  const backendDown = !!error && !forbidden;
  const hostCount = servers.length;

  const online = servers.filter((s) => s.status === 'online').length;
  const degraded = servers.filter((s) => s.status === 'degraded').length;
  const offline = servers.filter((s) => s.status === 'offline').length;

  const { profiles } = useMemo(() => classifyFleet(servers), [servers]);
  const serverById = useMemo(() => new Map(servers.map((s) => [s.spec.id, s])), [servers]);

  const filteredProfiles = useMemo(() => {
    if (filter === 'all') return profiles;
    return profiles.filter((p) => p.category === filter);
  }, [profiles, filter]);

  const providerGroups = useMemo(() => {
    const groups = new Map<string, typeof profiles>();
    for (const group of GROUPS) {
      const matched = filteredProfiles.filter((p) => group.match(p.category));
      if (matched.length > 0) groups.set(group.id, matched);
    }
    return groups;
  }, [filteredProfiles]);

  const clusteredIds = new Set(clusters.flatMap((c) => c.serverIds));
  const standalone = servers.filter((s) => !clusteredIds.has(s.spec.id));
  const clusteredServers = servers.filter((s) => clusteredIds.has(s.spec.id));
  const isClustered = clusters.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="fluid-h1 font-display font-bold tracking-tight text-text-primary">Servers</h1>
          <p className="mt-1 text-sm text-text-muted">
            {loading && hostCount === 0 ? (
              'Loading fleet telemetry…'
            ) : (
              <>
                {hostCount} hosts · <span className="text-success">{online} online</span>
                {degraded > 0 && <> · <span className="text-warn">{degraded} degraded</span></>}
                {offline > 0 && <> · <span className="text-crit">{offline} offline</span></>}
                {isClustered
                  ? <> · <span className="text-info">{clusters.length} cluster{clusters.length === 1 ? '' : 's'}</span></>
                  : <> · <span className="text-text-secondary">standalone</span></>}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setGroupByProvider(!groupByProvider)}
            className={cn(
              'flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors cursor-pointer',
              groupByProvider ? 'bg-accent/15 text-accent' : 'bg-surface-border/50 text-text-muted hover:text-text-primary hover:bg-surface-border'
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            {groupByProvider ? 'By Provider' : 'By Role'}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-surface-border bg-surface p-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors cursor-pointer',
                  filter === f.id ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary',
                )}
              >
                {f.icon} {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ProviderDiagnosticsBanner />

      {isClustered && !groupByProvider && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted flex items-center gap-2">
            <ServerIcon className="h-3.5 w-3.5 text-amber-400" /> Clusters
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clusters.map((cluster, i) => (
              <ClusterCard key={cluster.id} cluster={cluster} index={i} />
            ))}
          </div>
        </div>
      )}

      {groupByProvider && (
        <div className="flex flex-col gap-3">
          {Array.from(providerGroups.entries()).map(([groupId, groupProfiles]) => {
            const groupDef = GROUPS.find((g) => g.id === groupId) ?? { id: groupId, label: 'Other', icon: <ServerIcon className="h-3.5 w-3.5" />, match: () => true };
            const isExpanded = expandedGroups.has(groupId);
            return (
              <div key={groupId} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(groupId)) next.delete(groupId);
                    else next.add(groupId);
                    return next;
                  })}
                  className="w-full flex items-center gap-3 p-3 sm:p-4 hover:bg-surface-hover transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    {groupDef.icon}
                    <span className="font-medium text-text-primary">{groupDef.label}</span>
                    <Badge tone="neutral" size="sm">{groupProfiles.length}</Badge>
                  </div>
                  <div className="ml-auto flex items-center gap-2 text-text-muted">
                    <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded ? 'rotate-180' : '')} />
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-surface-border p-3 sm:p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xxl:grid-cols-4">
                      {groupProfiles.map((p, i) => {
                        const server = serverById.get(p.id);
                        return server ? <ServerCard key={p.id} server={server} index={i} /> : null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!groupByProvider && filter === 'all' && (
        <>
          {standalone.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted flex items-center gap-2">
                <ServerIcon className="h-3.5 w-3.5 text-text-muted" /> Standalone Nodes
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xxl:grid-cols-4">
                {standalone.map((server, i) => (
                  <ServerCard key={server.spec.id} server={server} index={i} />
                ))}
                <DockerProfileCards />
              </div>
            </div>
          )}
          {clusteredServers.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted flex items-center gap-2">
                <ServerIcon className="h-3.5 w-3.5 text-amber-400" /> Cluster Nodes
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xxl:grid-cols-4">
                {clusteredServers.map((server, i) => (
                  <ServerCard key={server.spec.id} server={server} index={i} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!groupByProvider && filter !== 'all' && filter !== 'containerHost' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xxl:grid-cols-4">
          {filteredProfiles.map((p, i) => {
            const server = serverById.get(p.id);
            return server ? <ServerCard key={p.id} server={server} index={i} /> : null;
          })}
        </div>
      )}

      {!groupByProvider && filter === 'containerHost' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <DockerProfileCards />
        </div>
      )}

      {loading && servers.length === 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xxl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[400px]" />
          ))}
        </div>
      )}

      {hostCount === 0 && !loading && forbidden && (
        <ForbiddenState
          title="Fleet access denied"
          copy="Your account does not have permission to view the server fleet. This can happen when the Core is in configured mode and your role or guest scope excludes server data. Contact a super admin to request access."
        />
      )}

      {hostCount === 0 && !loading && backendDown && (
        <ErrorState
          title="Backend unreachable"
          copy="Nexora Core did not return the server fleet. The service may be starting, restarting, or temporarily unavailable."
          onRetry={() => void refetch()}
          retrying={isRefetching}
        />
      )}

      {hostCount === 0 && !loading && !forbidden && !backendDown && (
        <EmptyState
          title="No servers in the fleet"
          copy="No infrastructure nodes have been discovered yet. Connect the Agent or a Proxmox/Docker provider in the backend, or wait for the next discovery cycle."
          icon={<ServerOff className="h-6 w-6" aria-hidden="true" />}
          action={
            <Link
              to="/"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-surface-border bg-surface px-3.5 text-xs font-semibold text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
            >
              View topology
            </Link>
          }
        />
      )}
    </div>
  );
}