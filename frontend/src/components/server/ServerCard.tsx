import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Cpu, HardDrive, MemoryStick, Thermometer, ArrowDown, ArrowUp, Layers, Server as ServerIcon } from 'lucide-react';
import type { ServerRuntime } from '@/types';
import { REACH_META, CAPABILITY_META, statusTextClass, statusDotClass } from '@/lib/constants';
import { INFRA_ICON_COMPONENTS } from '@/lib/icons';
import {
  classifyEntity,
  entityBadges,
  iconKeyFor,
  parentDisplayName,
  resolveDisplayName,
} from '@/lib/infrastructure/entity';
import { formatUptime, formatBytes, formatMbps, pct, cn } from '@/lib/utils';
import { useTelemetryStore, selectServers } from '@/store/telemetry';
import { useShallow } from 'zustand/react/shallow';
import { useClusters } from '@/hooks/useQueries';
import { Sparkline } from '@/components/ui/Sparkline';
import { Badge } from '@/components/ui/Badge';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

export function ServerCard({ server, index }: { server: ServerRuntime; index: number }) {
  const sparklines = useTelemetryStore((s) => s.sparklines[server.spec.id]);
  const fleet = useTelemetryStore(useShallow(selectServers));
  const { clusters } = useClusters();
  const s = server.spec;
  const profile = classifyEntity(server);
  const reach = REACH_META[server.reachability];
  const parentName = parentDisplayName(profile, fleet);
  const cluster = profile.clusterId ? clusters.find((c) => c.id === profile.clusterId) : undefined;
  const badges = entityBadges(profile, cluster?.name);
  const IconComponent = INFRA_ICON_COMPONENTS[iconKeyFor(profile)] ?? INFRA_ICON_COMPONENTS.physical;
  const tempTone = profile.temperature.available && profile.temperature.value! >= 75 ? 'crit' : profile.temperature.available && profile.temperature.value! >= 60 ? 'warn' : 'good';

  const cpuPct = server.cpu;
  const ramPct = pct(server.ramUsedGb, s.ramTotalGb);
  const diskPct = pct(server.diskUsedGb, s.diskTotalGb);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.35, delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      <Link to={`/servers/${s.id}`} className={cn('card card-hover flex h-[400px] flex-col overflow-hidden p-3 sm:p-4')}>
        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div className="flex items-start gap-2.5">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-surface-border bg-surface-elevated">
            {IconComponent && <IconComponent size={20} />}
            <span className={cn('absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-elevated', statusDotClass(server.status))} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-sm font-bold text-text-primary">{profile.displayName}</h3>
            <p className="truncate text-[11px] text-text-muted">{profile.platform}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {badges.map((b) =>
                b.cls ? (
                  <span key={b.label} className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium', b.cls)}>
                    {b.label}
                  </span>
                ) : (
                  <Badge key={b.label} tone={b.tone as 'neutral'} size="sm">{b.label}</Badge>
                ),
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className={cn('flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold', statusTextClass(server.status))}>
              <span className={cn('h-1.5 w-1.5 rounded-full', statusDotClass(server.status))} />
              {server.status.toUpperCase()}
            </span>
            <span className={cn('flex items-center gap-1 whitespace-nowrap text-[9px]', reach.text)}>
              <span className={cn('h-1 w-1 rounded-full', reach.dot)} />
              {reach.label}
            </span>
          </div>
        </div>

        {/* ── IDENTITY / LOCATION ────────────────────────────────── */}
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-surface-border/50 bg-surface-input/40 px-2.5 py-1.5 text-[10px] text-text-muted">
          <span className="whitespace-nowrap font-mono text-text-primary">{s.ip || '—'}</span>
          {parentName ? (
            <>
              <span className="h-2.5 w-px bg-surface-border" />
              <span className="min-w-0 truncate">
                <span className="text-text-muted/60">on </span>
                <span className="font-medium text-text-primary">{parentName}</span>
              </span>
            </>
          ) : (
            profile.category !== 'hypervisor' &&
            profile.category !== 'gateway' &&
            profile.category !== 'switch' &&
            profile.category !== 'physical' && (
              <>
                <span className="h-2.5 w-px bg-surface-border" />
                <span className="text-text-muted/60">Unknown parent</span>
              </>
            )
          )}
          <span className="ml-auto hidden whitespace-nowrap sm:inline">{s.location || '—'}</span>
        </div>

        {/* ── TAGS / CAPABILITIES ────────────────────────────────── */}
        <div className="mt-2 flex min-h-[20px] flex-wrap items-center gap-1">
          {(s.capabilities ?? []).map((cap) => (
            <span key={cap} className="whitespace-nowrap rounded border border-surface-border bg-surface-input px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-text-muted">
              {CAPABILITY_META[cap]?.label ?? cap}
            </span>
          ))}
        </div>

        {/* ── RESOURCE METRICS ───────────────────────────────────── */}
        <div className="mt-2.5 grid grid-cols-4 gap-2">
          <CompactMetric serverId={s.id} label="CPU" icon={Cpu} value={cpuPct} suffix="%" spark={sparklines?.cpu} color="var(--accent)" tone={cpuPct >= 85 ? 'crit' : cpuPct >= 70 ? 'warn' : 'good'} />
          <CompactMetric serverId={s.id} label="RAM" icon={MemoryStick} value={ramPct} suffix="%" spark={sparklines?.ram} color="#60A5FA" tone={ramPct >= 85 ? 'crit' : ramPct >= 70 ? 'warn' : 'good'} sub={`${formatBytes(server.ramUsedGb)} / ${formatBytes(s.ramTotalGb)}`} />
          <CompactMetric serverId={s.id} label="Disk" icon={HardDrive} value={diskPct} suffix="%" spark={sparklines?.disk} color="#F59E0B" tone={diskPct >= 85 ? 'crit' : diskPct >= 70 ? 'warn' : 'good'} sub={`${formatBytes(server.diskUsedGb)} / ${formatBytes(s.diskTotalGb)}`} />
          <CompactMetric serverId={s.id} label="Temp" icon={Thermometer} value={profile.temperature.value} suffix="°C" spark={sparklines?.temp} color="#F97316" tone={tempTone} unavailable={!profile.temperature.available} />
        </div>

        {/* ── OPERATIONAL METRICS ────────────────────────────────── */}
        <div className="mt-2 grid grid-cols-4 gap-2 text-center">
          <MiniMetric label="Uptime" value={formatUptime(server.uptimeSeconds)} />
          <MiniMetric label="Processes" value={<AnimatedNumber value={server.processes} className="text-text-primary" />} />
          <MiniMetric label="Load" value={<AnimatedNumber value={server.load} decimals={2} className="text-text-primary" />} />
          <MiniMetric
            label={profile.containerCount != null ? 'Containers' : 'VMs'}
            value={<AnimatedNumber value={profile.containerCount ?? profile.vmCount ?? 0} className="text-text-primary" />}
          />
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────── */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-surface-border pt-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-text-muted">
            <span className="flex items-center gap-1 whitespace-nowrap"><ArrowDown className="h-2.5 w-2.5 text-success" />{formatMbps(server.netDownMbps)}</span>
            <span className="flex items-center gap-1 whitespace-nowrap"><ArrowUp className="h-2.5 w-2.5 text-info" />{formatMbps(server.netUpMbps)}</span>
            {profile.containerCount != null ? (
              <span className="flex items-center gap-1 whitespace-nowrap"><Layers className="h-2.5 w-2.5" />{profile.containerCount} CTs</span>
            ) : (
              <span className="flex items-center gap-1 whitespace-nowrap"><Layers className="h-2.5 w-2.5" />{profile.vmCount ?? 0} VMs</span>
            )}
          </div>
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-accent">
            Details <ArrowUpRight className="h-2.5 w-2.5" />
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

function CompactMetric({
  serverId,
  label,
  icon: Icon,
  value,
  suffix,
  sub,
  spark,
  color,
  tone,
  unavailable,
}: {
  serverId: string;
  label: string;
  icon: typeof Cpu;
  value: number | null;
  suffix: string;
  sub?: string;
  spark?: number[];
  color: string;
  tone?: string;
  unavailable?: boolean;
}) {
  const displayValue = value ?? 0;
  const isNa = unavailable || value == null || value === 0;
  return (
    <div className="min-w-0 rounded-lg border border-surface-border/50 bg-surface-input/50 p-2">
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-text-muted">
          <Icon className="h-2.5 w-2.5" style={{ color }} />
          {label}
        </span>
        <span className={cn('truncate text-xs font-semibold tabular', tone)}>
          {isNa ? <span className="text-text-muted">—</span> : <><AnimatedNumber value={displayValue} decimals={displayValue < 10 ? 1 : 0} className="text-text-primary" /><span className="ml-0.5 text-[10px] font-normal text-text-muted">{suffix}</span></>}
        </span>
      </div>
      {sub && <div className="mt-0.5 truncate text-[9px] text-text-muted">{sub}</div>}
      <div className="mt-1" style={{ height: 20 }}>
        {!isNa && <Sparkline data={spark ?? []} color={color} height={20} width={100} id={`${label}-compact-${serverId}`} />}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-surface-border bg-surface-input/50 px-1.5 py-1">
      <div className="text-xs font-semibold tabular text-text-primary">{value}</div>
      <div className="text-[8px] uppercase tracking-widest text-text-muted">{label}</div>
    </div>
  );
}

export { resolveDisplayName };