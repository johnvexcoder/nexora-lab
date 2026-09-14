import { useMemo } from 'react';
import { Activity, Cpu, MemoryStick, Clock } from 'lucide-react';
import { useTelemetry } from '@/hooks/useTelemetry';
import { globalHealthFromServers } from '@/store/telemetry';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Badge } from '@/components/ui/Badge';
import { healthColor, ProgressRing } from '@/components/ui/Progress';
import { cn } from '@/lib/utils';

const STATUS_PILLS = [
  { key: 'onlineServers' as const, label: 'Online', tone: 'text-success' },
  { key: 'degradedServers' as const, label: 'Degraded', tone: 'text-warn' },
  { key: 'offlineServers' as const, label: 'Offline', tone: 'text-crit' },
];

/** Compact floating health panel built from live telemetry servers. */
export function HealthPanelContent() {
  const { servers } = useTelemetry();
  const health = globalHealthFromServers(servers);

  const ringColor = healthColor(Math.max(0, Math.min(100, health.score)));

  const rows = useMemo(
    () => [
      { icon: Cpu, label: 'Avg CPU', value: `${Math.round(health.avgCpu)}%` },
      { icon: MemoryStick, label: 'Avg RAM', value: `${Math.round(health.avgRam)}%` },
      {
        icon: Clock,
        label: 'Uptime',
        value:
          health.totalUptimePercent > 0
            ? `${Math.round(health.totalUptimePercent)}% online`
            : '—',
      },
    ],
    [health],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <ProgressRing
            value={health.score}
            size={72}
            stroke={6}
            color={ringColor}
            label="Score"
          />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-primary">Fleet status</span>
            <Badge
              tone={health.status === 'online' ? 'success' : health.status === 'degraded' ? 'warn' : 'crit'}
              dot
            >
              {health.status.toUpperCase()}
            </Badge>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {STATUS_PILLS.map(({ key, label, tone }) => (
              <div
                key={key}
                className="rounded-xl border border-surface-border/70 bg-surface-elevated px-1.5 py-1.5 text-center"
              >
                <div className={cn('font-display text-base font-bold tabular', tone)}>
                  <AnimatedNumber value={health[key]} />
                </div>
                <div className="text-[9px] uppercase tracking-widest text-text-muted">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {rows.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="flex items-center gap-1.5 rounded-xl border border-surface-border/60 bg-surface-elevated/60 px-2 py-1.5"
          >
            <Icon className="h-3 w-3 shrink-0 text-text-muted" />
            <div className="min-w-0 leading-tight">
              <div className="truncate font-mono text-[11px] font-semibold tabular text-text-primary">{value}</div>
              <div className="truncate text-[9px] uppercase tracking-widest text-text-muted">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 rounded-xl border border-surface-border/60 bg-surface-elevated/60 px-2.5 py-2 text-[11px] text-text-muted">
        <Activity className="h-3 w-3 shrink-0 text-accent" />
        <span>
          <AnimatedNumber value={health.totalServers} /> monitored{' '}
          {health.totalServers === 1 ? 'node' : 'nodes'}
          {health.avgCpu > 0 ? ` · ${Math.round(health.avgCpu)}% avg CPU load` : ''}
        </span>
      </div>
    </div>
  );
}

/** Compact status label shown on the collapsed rail header. */
export function HealthSummary({ status }: { status: string }) {
  const meta =
    status === 'online'
      ? { label: 'Online', tone: 'success' as const }
      : status === 'degraded'
        ? { label: 'Degraded', tone: 'warn' as const }
        : { label: 'Offline', tone: 'crit' as const };
  return (
    <Badge tone={meta.tone} size="sm" dot>
      {meta.label}
    </Badge>
  );
}