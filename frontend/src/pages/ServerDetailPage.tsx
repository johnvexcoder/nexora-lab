import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, ArrowDown, ArrowLeft, ArrowUp, Box, Clock, Cpu, HardDrive, MapPin, MemoryStick, Network, RefreshCw, Server, Thermometer } from 'lucide-react';
import { MetricChart } from '@/components/charts/MetricChart';
import { HardwareTelemetry } from '@/components/hardware/HardwareTelemetry';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Status';
import { useClusters } from '@/hooks/useQueries';
import { useServerEvents, useServerServices } from '@/hooks/useServerDetail';
import { useTelemetry } from '@/hooks/useTelemetry';
import { CAPABILITY_META, REACH_META } from '@/lib/constants';
import { classifyEntity, entityBadges, iconKeyFor, parentDisplayName } from '@/lib/infrastructure/entity';
import { INFRA_ICON_COMPONENTS } from '@/lib/icons';
import { cn, formatBytes, formatUptime, pct } from '@/lib/utils';
import type { HistoryRange, MetricKey, Notification } from '@/types';

const METRICS: Array<{ key: MetricKey; label: string }> = [
  { key: 'cpu', label: 'CPU' }, { key: 'ram', label: 'Memory' }, { key: 'disk', label: 'Storage' },
  { key: 'temp', label: 'Temperature' }, { key: 'netDown', label: 'Download' }, { key: 'netUp', label: 'Upload' },
];
const RANGES: HistoryRange[] = ['15m', '1h', '6h', '24h'];
const STALE_AFTER_MS = 30_000;

export default function ServerDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { servers, loading, error, connected } = useTelemetry();
  const { clusters } = useClusters();
  const server = servers.find((item) => item.spec.id === id);
  const { services, isLoading: servicesLoading } = useServerServices(server);
  const { events, refetch: refetchEvents, isLoading: eventsLoading } = useServerEvents(id);
  const [metric, setMetric] = useState<MetricKey>('cpu');
  const [range, setRange] = useState<HistoryRange>('1h');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading && !server) return <LoadingState />;
  if (error && !server) return <MessageState title="Server data unavailable" body="Nexora could not load this server. Check the Core connection and try again." />;
  if (!server) return <MessageState title="Server not found" body="This server is no longer present or you do not have access to it." />;

  const spec = server.spec;
  const profile = classifyEntity(server);
  const parentName = parentDisplayName(profile, servers);
  const IconComponent = INFRA_ICON_COMPONENTS[iconKeyFor(profile)];
  const ram = pct(server.ramUsedGb, spec.ramTotalGb);
  const disk = pct(server.diskUsedGb, spec.diskTotalGb);
  const stale = now - server.lastSeen > STALE_AFTER_MS;
  const cluster = spec.clusterId ? clusters.find((item) => item.id === spec.clusterId) : undefined;
  const statusTone = server.status === 'online' ? 'success' : server.status === 'degraded' ? 'warn' : 'crit';

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 pb-8" aria-labelledby="server-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/servers" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-text-muted transition hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Fleet
        </Link>
        <div className="flex items-center gap-2" aria-live="polite">
          {!connected && <Badge tone="warn">Live stream disconnected</Badge>}
          {stale && <Badge tone="neutral">Telemetry stale</Badge>}
          <Badge tone={statusTone} dot>{server.status}</Badge>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-surface-border bg-surface/90 shadow-xl shadow-black/10">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-accent/25 bg-accent/10 p-2 text-accent">{IconComponent && <IconComponent size={20} />}</span>
              {entityBadges(profile, cluster?.name).map((b) =>
                b.cls ? (
                  <span key={b.label} className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${b.cls}`}>{b.label}</span>
                ) : (
                  <Badge key={b.label} tone={b.tone as 'neutral'}>{b.label}</Badge>
                ),
              )}
              {parentName && <Badge tone="info">{parentName}</Badge>}
            </div>
            <h1 id="server-title" className="truncate font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">{profile.displayName}</h1>
            <p className="mt-1 text-sm text-text-secondary">{spec.description || 'Managed infrastructure node'} · {profile.platform}</p>
            <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-muted">
              <Meta icon={Server} label="Hostname" value={spec.hostname || spec.id} />
              <Meta icon={Network} label="Address" value={spec.ip || 'Not reported'} mono />
              <Meta icon={MapPin} label="Location" value={spec.location || 'Not set'} />
              <Meta icon={Clock} label="Uptime" value={formatUptime(server.uptimeSeconds)} />
            </dl>
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2" aria-label="Server health summary">
            <Summary label="Health" value={`${Math.round(server.health)}%`} />
            <Summary label="Reachability" value={REACH_META[server.reachability]?.label ?? server.reachability} />
            <Summary label="Load" value={server.load.toFixed(1)} />
            <Summary label="Processes" value={server.processes.toLocaleString()} />
          </dl>
        </div>
        <div className="border-t border-surface-border bg-surface-elevated/50 px-5 py-3 text-xs text-text-muted">Last telemetry {server.lastSeen ? new Date(server.lastSeen).toLocaleString() : 'has not been reported'}</div>
      </section>

      <section aria-labelledby="resources-title">
        <h2 id="resources-title" className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Live resources</h2>
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 lg:grid-cols-4">
          <Resource icon={Cpu} label="CPU" value={`${server.cpu.toFixed(1)}%`} detail={`${spec.cpuCores || '—'} cores`} percent={server.cpu} />
          <Resource icon={MemoryStick} label="Memory" value={`${ram.toFixed(1)}%`} detail={`${formatBytes(server.ramUsedGb)} / ${formatBytes(spec.ramTotalGb)}`} percent={ram} />
          <Resource icon={HardDrive} label="Storage" value={`${disk.toFixed(1)}%`} detail={`${formatBytes(server.diskUsedGb)} / ${formatBytes(spec.diskTotalGb)}`} percent={disk} />
          <Resource icon={Thermometer} label="Temperature" value={profile.temperature.available ? `${profile.temperature.value!.toFixed(1)} °C` : 'Not available'} detail={profile.temperature.available ? 'Current reading' : 'Capability not reported'} />
        </div>
      </section>

      <section className="rounded-2xl border border-surface-border bg-surface/90 p-4 sm:p-5" aria-labelledby="history-title">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 id="history-title" className="font-semibold text-text-primary">Telemetry history</h2><p className="text-xs text-text-muted">Observed values for this server</p></div>
          <div className="flex flex-wrap gap-1">{METRICS.map((item) => <Toggle key={item.key} active={metric === item.key} onClick={() => setMetric(item.key)}>{item.label}</Toggle>)}</div>
        </div>
        <MetricChart server={server} metric={metric} range={range} onRangeChange={setRange} height={250} />
        <div className="mt-2 flex justify-end gap-1" aria-label="History range">{RANGES.map((item) => <Toggle key={item} active={range === item} onClick={() => setRange(item)}>{item}</Toggle>)}</div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-surface-border bg-surface/90 p-4 sm:p-5" aria-labelledby="workloads-title">
          <div className="mb-4 flex items-center justify-between"><div><h2 id="workloads-title" className="font-semibold text-text-primary">Workloads & services</h2><p className="text-xs text-text-muted">Observed on this host</p></div><Badge>{servicesLoading ? 'Loading' : services.containers.length}</Badge></div>
          {servicesLoading ? <Skeleton className="h-28" /> : services.containers.length ? <ul className="space-y-2">{services.containers.map((container) => (
            <li key={container.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-surface-border bg-surface-elevated/50 p-3"><Box className="h-4 w-4 shrink-0 text-info" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-text-primary">{container.name}</p><p className="truncate text-xs text-text-muted">{container.image}</p></div><Badge tone={container.running ? 'success' : 'neutral'}>{container.running ? 'running' : 'stopped'}</Badge></li>
          ))}</ul> : <Empty copy={spec.profile.containers > 0 ? 'Workload count is reported, but detailed container inventory is unavailable.' : 'No container workloads are reported for this server.'} />}
        </section>

        <section className="rounded-2xl border border-surface-border bg-surface/90 p-4 sm:p-5" aria-labelledby="activity-title">
          <div className="mb-4 flex items-center justify-between"><div><h2 id="activity-title" className="font-semibold text-text-primary">Recent events</h2><p className="text-xs text-text-muted">Alerts associated with this server</p></div><button type="button" onClick={() => void refetchEvents()} className="rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Refresh server events"><RefreshCw className="h-4 w-4" /></button></div>
          {eventsLoading ? <Skeleton className="h-28" /> : events.length ? <ul className="space-y-2">{events.slice(0, 8).map((event) => <EventItem key={event.id} event={event} />)}</ul> : <Empty copy="No recent events are associated with this server." />}
        </section>
      </div>

      <section className="grid gap-2 sm:grid-cols-2" aria-label="Network throughput"><Throughput icon={ArrowDown} label="Inbound" value={server.netDownMbps} /><Throughput icon={ArrowUp} label="Outbound" value={server.netUpMbps} /></section>

      <section aria-labelledby="capabilities-title" className="rounded-2xl border border-surface-border bg-surface/90 p-4 sm:p-5">
        <h2 id="capabilities-title" className="font-semibold text-text-primary">Capabilities</h2>
        <div className="mt-3 flex flex-wrap gap-2">{spec.capabilities?.length ? spec.capabilities.map((capability) => <Badge key={capability}>{CAPABILITY_META[capability]?.label ?? capability}</Badge>) : <span className="text-sm text-text-muted">No capabilities reported.</span>}</div>
      </section>
      <HardwareTelemetry sensors={server.sensors ?? []} />
    </main>
  );
}

function LoadingState() { return <div className="space-y-4" aria-busy="true"><Skeleton className="h-9 w-32" /><Skeleton className="h-56" /><div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32" />)}</div><Skeleton className="h-80" /></div>; }
function MessageState({ title, body }: { title: string; body: string }) { return <div className="mx-auto flex max-w-lg flex-col items-center gap-3 py-24 text-center"><Activity className="h-10 w-10 text-text-muted" /><h1 className="text-xl font-bold text-text-primary">{title}</h1><p className="text-sm text-text-muted">{body}</p><Link to="/servers" className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background">Back to fleet</Link></div>; }
function Meta({ icon: Icon, label, value, mono }: { icon: typeof Server; label: string; value: string; mono?: boolean }) { return <div className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" aria-hidden="true" /><dt className="sr-only">{label}</dt><dd className={mono ? 'font-mono' : ''}>{value}</dd></div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="min-w-28 rounded-xl border border-surface-border bg-surface-elevated/60 p-3"><dt className="text-[10px] uppercase tracking-wider text-text-muted">{label}</dt><dd className="mt-1 truncate text-sm font-semibold text-text-primary">{value}</dd></div>; }
function Resource({ icon: Icon, label, value, detail, percent }: { icon: typeof Cpu; label: string; value: string; detail: string; percent?: number }) { const safe = Math.max(0, Math.min(100, percent ?? 0)); return <article className="rounded-xl border border-surface-border bg-surface/90 p-4"><div className="flex items-center gap-2 text-xs text-text-muted"><Icon className="h-4 w-4 text-accent" aria-hidden="true" />{label}</div><p className="mt-2 text-xl font-bold tabular-nums text-text-primary">{value}</p><p className="mt-1 truncate text-[11px] text-text-muted">{detail}</p>{percent !== undefined && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-elevated" aria-label={`${label} ${safe.toFixed(0)} percent`} role="progressbar" aria-valuenow={safe} aria-valuemin={0} aria-valuemax={100}><span className="block h-full rounded-full bg-accent" style={{ width: `${safe}%` }} /></div>}</article>; }
function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" aria-pressed={active} onClick={onClick} className={cn('min-h-9 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', active ? 'bg-accent/15 text-accent' : 'text-text-muted hover:bg-surface-hover hover:text-text-primary')}>{children}</button>; }
function Empty({ copy }: { copy: string }) { return <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-surface-border px-5 text-center text-sm text-text-muted">{copy}</div>; }
function EventItem({ event }: { event: Notification }) { const tone = event.severity === 'critical' ? 'crit' : event.severity === 'warning' ? 'warn' : event.severity === 'success' ? 'success' : 'info'; return <li className="rounded-xl border border-surface-border bg-surface-elevated/50 p-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-text-primary">{event.title}</p><Badge tone={tone}>{event.severity}</Badge></div><p className="mt-1 line-clamp-2 text-xs text-text-muted">{event.message}</p><time className="mt-2 block text-[10px] text-text-muted" dateTime={new Date(event.timestamp).toISOString()}>{new Date(event.timestamp).toLocaleString()}</time></li>; }
function Throughput({ icon: Icon, label, value }: { icon: typeof ArrowDown; label: string; value: number }) { return <article className="flex items-center gap-3 rounded-xl border border-surface-border bg-surface/90 p-4"><span className="rounded-lg bg-info/10 p-2 text-info"><Icon className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-xs text-text-muted">{label} throughput</p><p className="text-lg font-bold tabular-nums text-text-primary">{value.toFixed(1)} <span className="text-xs font-normal text-text-muted">Mb/s</span></p></div></article>; }
