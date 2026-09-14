import { useMemo } from 'react';
import { HardDrive, Database } from 'lucide-react';
import { useTelemetryStore, selectServers } from '@/store/telemetry';
import { useShallow } from 'zustand/react/shallow';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { toneColor } from '@/components/ui/Progress';
import { cn, formatBytes, pct } from '@/lib/utils';

/** Compact floating storage panel — real per-host disk usage. */
export function StoragePanelContent() {
  const servers = useTelemetryStore(useShallow(selectServers));

  const { usedGb, capacityGb, usedPct } = useMemo(() => {
    const usedGb = servers.reduce((a, s) => a + s.diskUsedGb, 0);
    const capacityGb = servers.reduce((a, s) => a + s.spec.diskTotalGb, 0);
    return { usedGb, capacityGb, usedPct: pct(usedGb, capacityGb) };
  }, [servers]);

  const hosts = useMemo(
    () =>
      servers
        .filter((s) => s.spec.diskTotalGb > 0)
        .sort((a, b) => b.diskUsedGb / b.spec.diskTotalGb - a.diskUsedGb / a.spec.diskTotalGb),
    [servers],
  );

  if (servers.length === 0) {
    return <p className="py-3 text-center text-xs text-text-muted">No storage data yet</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl border border-surface-border/60 bg-surface-elevated/60 px-2.5 py-2">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-text-muted">
          <Database className="h-3 w-3" /> Fleet storage
        </span>
        <span className="font-display text-sm font-bold tabular text-text-primary">
          {formatBytes(usedGb)}
          <span className="text-[10px] font-normal text-text-muted"> / {formatBytes(capacityGb)}</span>
        </span>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-border/60"
        role="progressbar"
        aria-valuenow={Math.round(usedPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Fleet storage ${Math.round(usedPct)}% used`}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, usedPct))}%`, backgroundColor: toneColor(usedPct) }}
        />
      </div>

      <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto pr-0.5">
        {hosts.map((s) => {
          const hostPct = pct(s.diskUsedGb, s.spec.diskTotalGb);
          return (
            <div key={s.spec.id} className="rounded-xl border border-surface-border/60 bg-surface-elevated/60 px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-text-primary">
                  <HardDrive className="h-3 w-3 shrink-0 text-text-muted" />
                  <span className="truncate">{s.spec.name}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular text-text-muted">
                  {formatBytes(s.diskUsedGb)} / {formatBytes(s.spec.diskTotalGb)}
                  <span
                    className={cn(
                      'ml-1.5 font-semibold',
                      hostPct >= 85 ? 'text-crit' : hostPct >= 70 ? 'text-warn' : 'text-text-primary',
                    )}
                  >
                    {Math.round(hostPct)}%
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-border/60">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, hostPct))}%`, backgroundColor: toneColor(hostPct) }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-text-muted">
        <AnimatedNumber value={hosts.length} /> storage volumes contributing across the fleet
      </p>
    </div>
  );
}

/** Compact one-line summary for the collapsed rail header. */
export function StorageSummary({ servers }: { servers: Array<{ diskUsedGb: number; spec: { diskTotalGb: number } }> }) {
  const used = servers.reduce((a, s) => a + s.diskUsedGb, 0);
  const capacity = servers.reduce((a, s) => a + s.spec.diskTotalGb, 0);
  const p = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
  return (
    <span
      className={cn(
        'ml-auto font-mono text-[10px] font-semibold tabular',
        p >= 85 ? 'text-crit' : p >= 70 ? 'text-warn' : 'text-text-muted',
      )}
    >
      {capacity > 0 ? `${formatBytes(used)} · ${p}%` : '—'}
    </span>
  );
}