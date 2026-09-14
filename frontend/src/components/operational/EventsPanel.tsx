import { useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { History, CheckCheck } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { useNotificationStore } from '@/store/notifications';
import { endpoints } from '@/api/endpoints';
import { relativeTime, cn } from '@/lib/utils';
import { SEVERITY_META } from '@/lib/constants';

/** Compact floating recent-events panel — latest real notifications. */
export function EventsPanelContent({ limit = 6 }: { limit?: number }) {
  const { items, refetch } = useNotifications(30);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const markRead = useNotificationStore((s) => s.markRead);
  const navigate = useNavigate();

  const events = useMemo(() => items.slice(0, limit), [items, limit]);

  function handleMarkAll() {
    markAllRead();
    endpoints.notifications.readAll().then(() => refetch()).catch(() => undefined);
  }

  function openEvent(n: (typeof items)[number]) {
    markRead([n.id]);
    endpoints.notifications.read([n.id]).catch(() => undefined);
    navigate(`/alerts?highlight=${encodeURIComponent(n.id)}`);
  }

  if (events.length === 0) {
    return (
      <p className="py-3 text-center text-xs text-text-muted">No recent events</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button
          onClick={handleMarkAll}
          className="flex items-center gap-1 text-[10px] font-semibold text-text-muted transition-colors hover:text-accent cursor-pointer"
          type="button"
        >
          <CheckCheck className="h-3 w-3" /> Mark all read
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {events.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => openEvent(n)}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-xl border border-surface-border/50 px-2.5 py-1.5 text-left transition-colors hover:bg-overlay/[0.03] cursor-pointer',
                !n.read && 'border-accent/20 bg-accent/[0.04]',
              )}
            >
              <span
                className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', SEVERITY_META[n.severity].dot)}
              />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[11px] font-semibold text-text-primary">
                  {n.title}
                </span>
                <span className="block truncate text-[10px] text-text-secondary">{n.message}</span>
              </span>
              <span className="shrink-0 text-[9px] tabular text-text-muted">
                {relativeTime(n.timestamp)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Link
        to="/alerts"
        className="flex items-center justify-center gap-1.5 rounded-xl border border-surface-border/70 px-2 py-1.5 text-[11px] font-semibold text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
      >
        View event history <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

/** Compact one-line summary for the collapsed rail header. */
export function EventsSummary({ items }: { items: Array<{ timestamp: number }> }) {
  const latest = items.length > 0 ? relativeTime(items[0].timestamp) : '—';
  return (
    <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold tabular text-text-muted">
      <History className="h-3 w-3" />
      {latest}
    </span>
  );
}