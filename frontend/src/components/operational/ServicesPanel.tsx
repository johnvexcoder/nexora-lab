import { useMemo } from 'react';
import { Boxes, Server, Play, Square } from 'lucide-react';
import { useDockerHosts } from '@/hooks/useQueries';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { cn } from '@/lib/utils';

/** Compact floating services panel — real container inventory per host. */
export function ServicesPanelContent() {
  const { profiles, isLoading } = useDockerHosts();

  const { total, running, stopped } = useMemo(() => {
    let total = 0;
    let running = 0;
    for (const p of profiles) {
      for (const c of p.containers) {
        total += 1;
        if (c.running) running += 1;
      }
    }
    return { total, running, stopped: total - running };
  }, [profiles]);

  if (isLoading && profiles.length === 0) {
    return <p className="py-3 text-center text-xs text-text-muted">Loading services…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-1.5">
        <div className="rounded-xl border border-surface-border/70 bg-surface-elevated px-2 py-1.5 text-center">
          <div className="font-display text-base font-bold tabular text-text-primary">
            <AnimatedNumber value={total} />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-muted">Services</div>
        </div>
        <div className="rounded-xl border border-surface-border/70 bg-surface-elevated px-2 py-1.5 text-center">
          <div className="font-display text-base font-bold tabular text-success">
            <AnimatedNumber value={running} />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-muted">Running</div>
        </div>
        <div className="rounded-xl border border-surface-border/70 bg-surface-elevated px-2 py-1.5 text-center">
          <div className="font-display text-base font-bold tabular text-crit">
            <AnimatedNumber value={stopped} />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-muted">Stopped</div>
        </div>
      </div>

      {profiles.length === 0 ? (
        <p className="rounded-xl border border-surface-border/60 bg-surface-elevated/60 px-2.5 py-2.5 text-[11px] text-text-muted">
          No container hosts reported by the provider.
        </p>
      ) : (
        <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-0.5">
          {profiles.map((p) => {
            const run = p.containers.filter((c) => c.running).length;
            const stop = p.containers.length - run;
            return (
              <div
                key={p.hostName}
                className="flex items-center gap-2.5 rounded-xl border border-surface-border/60 bg-surface-elevated/60 px-2.5 py-1.5"
              >
                <Server className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                <div className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[11px] font-semibold text-text-primary">
                    {p.hostName}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-text-muted">
                    {p.hostIp}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[10px] font-mono tabular">
                  <span className="flex items-center gap-1 text-success">
                    <Play className="h-2.5 w-2.5" /> {run}
                  </span>
                  <span className={cn('flex items-center gap-1', stop > 0 ? 'text-crit' : 'text-text-muted')}>
                    <Square className="h-2.5 w-2.5" /> {stop}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Compact one-line summary for the collapsed rail header. */
export function ServicesSummary({ profiles }: { profiles: Array<{ containers: unknown[] }> }) {
  const running = profiles.reduce(
    (a, p) => a + p.containers.filter((c) => (c as { running: boolean }).running).length,
    0,
  );
  const total = profiles.reduce((a, p) => a + p.containers.length, 0);
  return (
    <span className="ml-auto flex items-center gap-1 font-mono text-[10px] font-semibold tabular text-text-muted">
      <Boxes className="h-3 w-3 text-success" />
      {running}/{total} up
    </span>
  );
}