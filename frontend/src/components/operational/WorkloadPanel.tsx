import { useMemo } from 'react';
import { Cpu, MemoryStick, ArrowDown, ArrowUp } from 'lucide-react';
import { useQuickStats, useStatsHistory } from '@/hooks/useQueries';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { Sparkline } from '@/components/ui/Sparkline';
import { toneColor } from '@/components/ui/Progress';
import { cn, formatMbps } from '@/lib/utils';
import type { StatsHistoryPoint } from '@/types';

function pick(stat: { id: string; value: number; unit: string } | undefined, fallback = 0): number {
  return stat?.value ?? fallback;
}

/** Compact floating workload panel — aggregate CPU/RAM/network from real stats. */
export function WorkloadPanelContent() {
  const { stats } = useQuickStats();
  const { points } = useStatsHistory('15m');

  const cpu = useMemo(() => stats.find((s) => s.id === 'cpu'), [stats]);
  const ram = useMemo(() => stats.find((s) => s.id === 'ram'), [stats]);
  const down = useMemo(() => stats.find((s) => s.id === 'download'), [stats]);
  const up = useMemo(() => stats.find((s) => s.id === 'upload'), [stats]);

  const cpuPct = pick(cpu);
  const ramPct = pick(ram);

  const cpuSeries = useMemo(() => points.map((p: StatsHistoryPoint) => p.cpu).slice(-30), [points]);
  const ramSeries = useMemo(() => points.map((p: StatsHistoryPoint) => p.mem).slice(-30), [points]);
  const netSeries = useMemo(() => points.map((p: StatsHistoryPoint) => p.network).slice(-30), [points]);

  const net = (down?.value ?? 0) + (up?.value ?? 0);

  const bars = useMemo(
    () => [
      { icon: Cpu, label: 'CPU', value: cpuPct, unit: '%', series: cpuSeries, color: 'var(--info)' },
      { icon: MemoryStick, label: 'RAM', value: ramPct, unit: '%', series: ramSeries, color: 'var(--accent)' },
    ],
    [cpuPct, ramPct, cpuSeries, ramSeries],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {bars.map(({ icon: Icon, label, value, unit, series, color }) => (
          <div
            key={label}
            className="rounded-xl border border-surface-border/60 bg-surface-elevated/60 px-2.5 py-2"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-text-muted">
                <Icon className="h-3 w-3" /> {label}
              </span>
              <span className="font-display text-sm font-bold tabular text-text-primary">
                <AnimatedNumber value={value} decimals={value < 10 ? 1 : 0} />
                <span className="text-[10px] font-normal text-text-muted">{unit}</span>
              </span>
            </div>
            <div className="mt-2 flex items-end gap-2">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-border/60"
                role="progressbar"
                aria-valuenow={Math.round(value)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, value))}%`,
                    backgroundColor: toneColor(value),
                  }}
                />
              </div>
              {series.length >= 2 && (
                <Sparkline data={series} width={64} height={20} color={color} />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-surface-border/60 bg-surface-elevated/60 px-2.5 py-2">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-text-muted">
            <ArrowDown className="h-3 w-3 text-success" /> Down
          </span>
          <span className="font-mono text-xs font-semibold tabular text-text-primary">
            {formatMbps(down?.value ?? 0)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-surface-border/60 bg-surface-elevated/60 px-2.5 py-2">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-text-muted">
            <ArrowUp className="h-3 w-3 text-info" /> Up
          </span>
          <span className="font-mono text-xs font-semibold tabular text-text-primary">
            {formatMbps(up?.value ?? 0)}
          </span>
        </div>
      </div>

      {netSeries.length >= 2 && (
        <div className="flex items-center gap-2 rounded-xl border border-surface-border/60 bg-surface-elevated/60 px-2.5 py-1.5">
          <span className="text-[10px] uppercase tracking-widest text-text-muted">Traffic</span>
          <Sparkline data={netSeries} width={100} height={20} color="var(--accent)" />
        </div>
      )}
    </div>
  );
}

/** Compact one-line summary for the collapsed rail header. */
export function WorkloadSummary({ stats }: { stats: { id: string; value: number; unit: string }[] }) {
  const cpu = stats.find((s) => s.id === 'cpu');
  const ram = stats.find((s) => s.id === 'ram');
  const tone = (v: number) => (v >= 85 ? 'text-crit' : v >= 70 ? 'text-warn' : 'text-text-primary');
  return (
    <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] font-semibold tabular text-text-muted">
      <span className={cn('text-xs', cpu ? tone(cpu.value) : 'text-text-muted')}>
        {cpu ? `${Math.round(cpu.value)}%` : '—'}
      </span>
      <span className="text-text-muted/50">/</span>
      <span className={cn('text-xs', ram ? tone(ram.value) : 'text-text-muted')}>
        {ram ? `${Math.round(ram.value)}%` : '—'}
      </span>
    </span>
  );
}