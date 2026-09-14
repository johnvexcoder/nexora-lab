import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Cable, Filter, Network, RefreshCw, Search, Server } from 'lucide-react';
import { TopologyCanvas } from '@/components/topology/TopologyCanvas';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Status';
import { useInfrastructure } from '@/hooks/useInfrastructure';
import { useNetwork } from '@/hooks/useQueries';
import { useTelemetry } from '@/hooks/useTelemetry';
import { adaptNetworkTopology, type InfraEntity, type InfraKind } from '@/lib/infrastructure';
import { cn, formatMbps } from '@/lib/utils';

const FILTERS: Array<{ id: InfraKind | 'all'; label: string }> = [
  { id: 'all', label: 'All infrastructure' }, { id: 'host', label: 'Hosts' },
  { id: 'hypervisor', label: 'Hypervisors' }, { id: 'vm', label: 'VMs' },
  { id: 'container', label: 'Containers' }, { id: 'storage', label: 'Storage' },
  { id: 'service', label: 'Services' },
];

export default function NetworkPage() {
  const { topology, refetch, isLoading, error, isFetching } = useNetwork();
  const { servers, connected } = useTelemetry();
  const { graph } = useInfrastructure();
  const [filter, setFilter] = useState<InfraKind | 'all'>('all');
  const [query, setQuery] = useState('');

  const scoped = useMemo(() => {
    if (!topology) return { nodes: [], links: [] };
    const normalized = adaptNetworkTopology(topology);
    const allowed = new Set(normalized.entities.map((entity) => entity.id));
    // Preserve an explicit internet boundary only when it uplinks to scoped infrastructure.
    for (const link of topology.links) {
      if (allowed.has(link.source) && topology.nodes.find((node) => node.id === link.target)?.type === 'internet') allowed.add(link.target);
      if (allowed.has(link.target) && topology.nodes.find((node) => node.id === link.source)?.type === 'internet') allowed.add(link.source);
    }
    return {
      nodes: topology.nodes.filter((node) => allowed.has(node.id)),
      links: topology.links.filter((link) => allowed.has(link.source) && allowed.has(link.target)),
    };
  }, [topology]);

  const inventory = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return graph.entities.filter((entity) => (filter === 'all' || entity.kind === filter) && (!needle || `${entity.name} ${entity.ip ?? ''} ${entity.kind}`.toLowerCase().includes(needle)));
  }, [filter, graph.entities, query]);
  const totalDown = servers.reduce((sum, item) => sum + (item.netDownMbps || 0), 0);
  const totalUp = servers.reduce((sum, item) => sum + (item.netUpMbps || 0), 0);
  const unhealthyLinks = scoped.links.filter((link) => link.status !== 'healthy').length;

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 pb-8" aria-labelledby="network-title">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="flex items-center gap-2"><Network className="h-5 w-5 text-accent" aria-hidden="true" /><h1 id="network-title" className="font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">Infrastructure network</h1></div><p className="mt-1 text-sm text-text-muted">Server topology, relationships, link health and observed traffic</p></div>
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          {!connected && <Badge tone="warn">Live telemetry disconnected</Badge>}
          <Badge tone={unhealthyLinks ? 'warn' : 'success'}>{unhealthyLinks ? `${unhealthyLinks} links need attention` : 'Links healthy'}</Badge>
          <button type="button" onClick={() => void refetch()} disabled={isFetching} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-surface-border bg-surface px-3 text-xs font-semibold text-text-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"><RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} aria-hidden="true" />Refresh</button>
        </div>
      </header>

      <section className="relative min-h-[520px] flex-1 overflow-hidden rounded-2xl border border-surface-border bg-base/80 shadow-2xl shadow-black/20 sm:min-h-[640px]" aria-label="Infrastructure topology workspace">
        <TopologyCanvas nodes={scoped.nodes} links={scoped.links} servers={servers} variant="workspace" showControls showLegend showStatusBar isLoading={isLoading} error={error} onRefresh={() => void refetch()} isRefreshing={isFetching} />
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Network summary">
        <Stat icon={Server} label="Infrastructure" value={String(graph.entities.length)} detail="scoped entities" />
        <Stat icon={Cable} label="Links" value={String(scoped.links.length)} detail={`${unhealthyLinks} non-healthy`} />
        <Stat icon={ArrowDown} label="Inbound" value={formatMbps(totalDown)} detail="aggregate observed" />
        <Stat icon={ArrowUp} label="Outbound" value={formatMbps(totalUp)} detail="aggregate observed" />
      </section>

      <section className="rounded-2xl border border-surface-border bg-surface/90 p-4 sm:p-5" aria-labelledby="inventory-title">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 id="inventory-title" className="font-semibold text-text-primary">Infrastructure inventory</h2><p className="text-xs text-text-muted">Ordinary client and household devices are excluded</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative"><span className="sr-only">Search infrastructure</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search nodes" className="min-h-10 w-full rounded-lg border border-surface-border bg-surface-input pl-9 pr-3 text-sm text-text-primary outline-none focus:border-accent sm:w-56" /></label>
            <label className="relative"><span className="sr-only">Filter infrastructure type</span><Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" /><select value={filter} onChange={(event) => setFilter(event.target.value as InfraKind | 'all')} className="min-h-10 w-full appearance-none rounded-lg border border-surface-border bg-surface-input pl-9 pr-8 text-sm text-text-primary outline-none focus:border-accent sm:w-48">{FILTERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          </div>
        </div>
        {isLoading ? <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-20" />)}</div> : inventory.length ? <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{inventory.map((entity) => <InventoryItem key={entity.id} entity={entity} />)}</ul> : <div className="mt-4 rounded-xl border border-dashed border-surface-border py-10 text-center text-sm text-text-muted">No infrastructure matches this view.</div>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-surface-border bg-surface/90" aria-labelledby="links-title">
        <div className="border-b border-surface-border p-4 sm:p-5"><h2 id="links-title" className="font-semibold text-text-primary">Link observations</h2><p className="text-xs text-text-muted">Unavailable measurements remain unavailable rather than appearing as zero</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-surface-elevated/60 text-[10px] uppercase tracking-wider text-text-muted"><tr><th className="px-4 py-3">Relationship</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Latency</th><th className="px-4 py-3">Throughput</th><th className="px-4 py-3">Loss / jitter</th></tr></thead><tbody>{scoped.links.map((link) => <tr key={link.id} className="border-t border-surface-border/70"><td className="px-4 py-3 font-mono text-xs text-text-primary">{link.source} → {link.target}</td><td className="px-4 py-3"><Badge tone={link.status === 'healthy' ? 'success' : link.status === 'warning' ? 'warn' : link.status === 'critical' ? 'crit' : 'neutral'}>{link.status}</Badge></td><td className="px-4 py-3 text-xs text-text-muted">{link.state ?? 'unknown'}</td><td className="px-4 py-3 text-text-secondary">{link.latencyMs == null ? 'Unavailable' : `${link.latencyMs.toFixed(1)} ms`}</td><td className="px-4 py-3 text-text-secondary">{link.throughputMbps == null ? 'Unavailable' : formatMbps(link.throughputMbps)}</td><td className="px-4 py-3 text-text-secondary">{link.packetLoss == null ? '—' : `${link.packetLoss.toFixed(1)}%`} / {link.jitterMs == null ? '—' : `${link.jitterMs.toFixed(1)} ms`}</td></tr>)}</tbody></table></div>
        {!scoped.links.length && !isLoading && <div className="p-8 text-center text-sm text-text-muted">No server-infrastructure links are reported.</div>}
      </section>
    </main>
  );
}

function Stat({ icon: Icon, label, value, detail }: { icon: typeof Server; label: string; value: string; detail: string }) { return <article className="rounded-xl border border-surface-border bg-surface/90 p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Icon className="h-4 w-4 text-accent" />{label}</div><p className="mt-2 text-xl font-bold text-text-primary">{value}</p><p className="text-[11px] text-text-muted">{detail}</p></article>; }
function InventoryItem({ entity }: { entity: InfraEntity }) { const tone = entity.status === 'online' ? 'success' : entity.status === 'degraded' ? 'warn' : entity.status === 'offline' ? 'crit' : 'neutral'; return <li className="flex min-w-0 items-center gap-3 rounded-xl border border-surface-border bg-surface-elevated/40 p-3"><span className="rounded-lg bg-accent/10 p-2 text-accent"><Server className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-text-primary">{entity.name}</p><p className="truncate text-xs text-text-muted">{entity.kind}{entity.ip ? ` · ${entity.ip}` : ''} · {entity.source}</p></div><Badge tone={tone}>{entity.status}</Badge></li>; }
