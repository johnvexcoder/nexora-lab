import { useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { History, ArrowRight } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { useNotificationStore } from '@/store/notifications';
import { endpoints } from '@/api/endpoints';
import { relativeTime, cn } from '@/lib/utils';
import { SEVERITY_META } from '@/lib/constants';
import { DashboardPanel } from './DashboardPanel';

export function RecentEventsPanel({ limit = 5 }: { limit?: number }) {
  const { items } = useNotifications(30);
  const markRead = useNotificationStore((s) => s.markRead);
  const navigate = useNavigate();

  const events = useMemo(() => items.slice(0, limit), [items, limit]);

  function openEvent(n: (typeof items)[number]) {
    markRead([n.id]);
    endpoints.notifications.read([n.id]).catch(() => undefined);
    navigate(`/alerts?highlight=${encodeURIComponent(n.id)}`);
  }

  return (
    <DashboardPanel
      icon={<History className="h-4 w-4" />}
      title="Recent Events"
      action={
        <Link
          to="/alerts"
          className="flex items-center gap-1 text-[11px] font-semibold text-text-muted transition-colors hover:text-accent"
        >
          View All <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      {events.length === 0 ? (
        <p className="py-2 text-center text-xs text-text-muted">No recent infrastructure events.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => openEvent(n)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-xl border border-surface-border/50 px-2.5 py-2 text-left transition-colors hover:bg-overlay/[0.03] cursor-pointer',
                  !n.read && 'border-accent/20 bg-accent/[0.04]',
                )}
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', SEVERITY_META[n.severity].dot)} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-xs font-semibold text-text-primary">{n.title}</span>
                  <span className="block truncate text-[10px] text-text-secondary">{n.message}</span>
                </span>
                <span className="shrink-0 text-[10px] tabular text-text-muted">{relativeTime(n.timestamp)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}