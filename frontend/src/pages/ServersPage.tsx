import { useState, useMemo } from 'react';
import { useTelemetry } from '@/hooks/useTelemetry';
import { useClusters } from '@/hooks/useQueries';
import { ServerCard } from '@/components/server/ServerCard';
import { ClusterCard } from '@/components/server/ClusterCard';
import { DockerProfileCards } from '@/components/dashboard/DockerProfileCard';
import { ProviderDiagnosticsBanner } from '@/components/provider/ProviderDiagnosticsBanner';
import { Skeleton } from '@/components/ui/Status';
import { Badge } from '@/components/ui/Badge';
import type { ServerRole } from '@/types';
import { cn } from '@/lib/utils';
import { Server as ServerIcon, Database, Box, Shield, Wifi, Filter, ChevronDown } from 'lucide-react';

const FILTERS: Array<{ id: ServerRole | 'all'; label: string; icon: React.ReactNode }> = [
  { id: 'all', label: 'All', icon: <ServerIcon className="h-3.5 w-3.5" /> },
  { id: 'hypervisor', label: 'Hypervisors', icon: <ServerIcon className="h-3.5 w-3.5" /> },
  { id: 'vm', label: 'VMs', icon: <Box className="h-3.5 w-3.5" /> },
  { id: 'lxc', label: 'LXC', icon: <Box className="h-3.5 w-3.5" /> },
  { id: 'docker', label: 'Containers', icon: <Database className="h-3.5 w-3.5" /> },
  { id: 'storage', label: 'Storage', icon: <Database className="h-3.5 w-3.5" /> },
  { id: 'gateway', label: 'Gateway', icon: <Shield className="h-3.5 w-3.5" /> },
  { id: 'switch', label: 'Switches', icon: <Wifi className="h-3.5 w-3.5" /> },
];

const PROVIDER_GROUPS = [
  { id: 'proxmox', label: 'Proxmox Cluster', icon: <ServerIcon className="h-3.5 w-3.5 text-amber-400" />, match: (s: any) => s.spec.id.startsWith('pve') && !s.spec.id.includes('-g') },
  { id: 'proxmox-vms', label: 'Proxmox VMs & LXC', icon: <Box className="h-3.5 w-3.5 text-emerald-400" />, match: (s: any) => s.spec.id.includes('-g') },
  { id: 'agent-docker', label: 'Agent Docker Hosts', icon: <Database className="h-3.5 w-3.5 text-blue-400" />, match: (s: any) => s.spec.id.startsWith('docker-') },
  { id: 'agent-standalone', label: 'Standalone Agents', icon: <Database className="h-3.5 w-3.5 text-cyan-400" />, match: (s: any) => s.spec.id.startsWith('agent-') },
  { id: 'physical', label: 'Physical Infrastructure', icon: <Shield className="h-3.5 w-3.5 text-teal-400" />, match: (s: any) => ['gateway', 'firewall01', 'switch01'].includes(s.spec.id) },
] as const;

export default function ServersPage() {
  const { servers, loading } = useTelemetry();
  const { clusters, isLoading: clustersLoading } = useClusters();
  const [filter, setFilter] = useState<ServerRole | 'all'>('all');
  const [groupByProvider, setGroupByProvider] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(PROVIDER_GROUPS.map(g => g.id)));

  const online = servers.filter((s) => s.status === 'online').length;
  const degraded = servers.filter((s) => s.status === 'degraded').length;
  const offline = servers.filter((s) => s.status === 'offline').length;

  const filteredServers = useMemo(() => {
    if (filter === 'all') return servers;
    if (filter === 'docker') return servers.filter((s) => s.spec.profile.containers > 0);
    return servers.filter((s) => s.spec.role === filter);
  }, [servers, filter]);

  const providerGroups = useMemo(() => {
    const groups = new Map<string, typeof servers>();
    for (const group of PROVIDER_GROUPS) {
      const matched = filteredServers.filter(group.match);
      if (matched.length > 0) groups.set(group.id, matched);
    }
    // Add unmatched servers to an "Other" group
    const allMatched = new Set(Array.from(groups.values()).flatMap(s => s.map(x => x.spec.id)));
    const unmatched = filteredServers.filter(s => !allMatched.has(s.spec.id));
    if (unmatched.length > 0) groups.set('other', unmatched);
    return groups;
  }, [filteredServers]);

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
            {servers.length} hosts · <span className="text-success">{online} online</span>
            {degraded > 0 && <> · <span className="text-warn">{degraded} degraded</span></>}
            {offline > 0 && <> · <span className="text-crit">{offline} offline</span></>}
            {isClustered
              ? <> · <span className="text-info">{clusters.length} cluster{clusters.length === 1 ? '' : 's'}</span></>
              : <> · <span className="text-text-secondary">standalone</span></>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
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

          {/* Role filter */}
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

      {/* Clusters section */}
      {isClustered && !groupByProvider && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted flex items-center gap-2">
            <ServerIcon className="h-3.5 w-3.5 text-amber-400" />
            Clusters
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clusters.map((cluster, i) => (
              <ClusterCard key={cluster.id} cluster={cluster} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Provider-grouped view */}
      {groupByProvider && (
        <div className="flex flex-col gap-3">
          {Array.from(providerGroups.entries()).map(([groupId, groupServers]) => {
            const groupDef = PROVIDER_GROUPS.find(g => g.id === groupId) || { id: 'other', label: 'Other', icon: <ServerIcon className="h-3.5 w-3.5" /> };
            const isExpanded = expandedGroups.has(groupId);
            return (
              <div key={groupId} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedGroups(prev => {
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
                    <Badge tone="neutral" size="sm">{groupServers.length}</Badge>
                  </div>
                  <div className="ml-auto flex items-center gap-2 text-text-muted">
                    <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded ? 'rotate-180' : '')} />
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-surface-border p-3 sm:p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xxl:grid-cols-4">
                      {groupServers.map((server, i) => (
                        <ServerCard key={server.spec.id} server={server} index={i} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Traditional flat view */}
      {!groupByProvider && filter === 'all' && (
        <>
          {standalone.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted flex items-center gap-2">
                <Box className="h-3.5 w-3.5 text-text-muted" />
                Standalone Nodes
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
                <ServerIcon className="h-3.5 w-3.5 text-amber-400" />
                Cluster Nodes
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

      {!groupByProvider && filter !== 'all' && filter !== 'docker' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xxl:grid-cols-4">
          {filteredServers.map((server, i) => (
            <ServerCard key={server.spec.id} server={server} index={i} />
          ))}
        </div>
      )}

      {!groupByProvider && filter === 'docker' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <DockerProfileCards />
        </div>
      )}

      {loading && servers.length === 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xxl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[340px]" />
          ))}
        </div>
      )}

      {servers.length === 0 && !loading && (
        <div className="flex flex-col items-center gap-4 py-16 text-center text-text-muted">
          <ServerIcon className="h-12 w-12 text-text-muted/50" />
          <p>No servers found</p>
        </div>
      )}
    </div>
  );
}