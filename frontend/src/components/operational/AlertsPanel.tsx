import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, AlertTriangle, AlertOctagon, Info, CheckCircle2 } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { cn } from '@/lib/utils';
import type { Notification } from '@/types';

const SEVERITY_ROWS = [
  { key: 'critical' as const, label: 'Critical', icon: AlertOctagon, text: 'text-crit', border: 'border-crit/25 bg-crit/5' },
  { key: 'warning' as const, label: 'Warning', icon: AlertTriangle, text: 'text-warn', border: 'border-warn/25 bg-warn/5' },
  { key: 'success' as const, label: 'Success', icon: CheckCircle2, text: 'text-success', border: 'border-success/25 bg-success/5' },
  { key: 'info' as const, label: 'Info', icon: Info, text: 'text-info', border: 'border-info/25 bg-info/5' },
];

function countBySeverity(items: Notification[]): Record<string, number> {
  const counts: Record<string, number> = { critical: 0, warning: 0, success: 0, info: 0 };
  for (const n of items) {
    if (counts[n.severity] === undefined) continue;
    counts[n.severity] += 1;
  }
  return counts;
}

/** Compact floating alerts panel — real notification severity breakdown. */
export function AlertsPanelContent() {
  const { items, unread } = useNotifications(30);

  const counts = useMemo(() => countBySeverity(items), [items]);
  const criticalCount = counts.critical ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl border border-surface-border/60 bg-surface-elevated/60 px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <BellRing className="h-3 w-3 text-accent" />
          {unread > 0 ? (
            <>
              <span className="font-semibold text-text-primary">{unread}</span> unread alert
              {unread === 1 ? '' : 's'}
            </>
          ) : (
            'All caught up'
          )}
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            criticalCount > 0 ? 'bg-crit/10 text-crit' : 'bg-overlay/5 text-text-muted',
          )}
        >
          {criticalCount} critical
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {SEVERITY_ROWS.map(({ key, label, icon: Icon, text, border }) => {
          const count = counts[key] ?? 0;
          return (
            <div key={key} className={cn('flex items-center gap-2 rounded-xl border px-2 py-1.5', border)}>
              <Icon className={cn('h-3.5 w-3.5 shrink-0', text)} />
              <span className={cn('font-mono text-sm font-bold tabular', text)}>
                <AnimatedNumber value={count} />
              </span>
              <span className="ml-auto truncate text-[10px] uppercase tracking-widest text-text-muted">
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <Link
        to="/alerts"
        className="flex items-center justify-center gap-1.5 rounded-xl border border-surface-border/70 px-2 py-1.5 text-[11px] font-semibold text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
      >
        Open alerts center <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

/** Compact one-line summary for the collapsed rail header. */
export function AlertsSummary({ unread }: { unread: number }) {
  return (
    <span
      className={cn(
        'ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-bold tabular',
        unread > 0 ? 'bg-crit text-white' : 'bg-overlay/5 text-text-muted',
      )}
      aria-label={unread > 0 ? `${unread} unread alerts` : 'No unread alerts'}
    >
      {unread > 0 ? (unread > 9 ? '9+' : unread) : '0'}
    </span>
  );
}