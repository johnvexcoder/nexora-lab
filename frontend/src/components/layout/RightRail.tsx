import { useRef, useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Wifi, WifiOff, BellRing, Clock } from 'lucide-react';
import { useTelemetry } from '@/hooks/useTelemetry';
import { useClock } from '@/hooks/useClock';
import { useNotificationStore } from '@/store/notifications';
import { useUiStore } from '@/store/ui';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/api/endpoints';
import { formatClock, formatDate, cn } from '@/lib/utils';
import { SEVERITY_META } from '@/lib/constants';
import { useNavigate } from 'react-router-dom';

function StatusChip({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-surface-border/60 bg-surface-input/80 px-3 py-2 text-xs backdrop-blur-md">
      {children}
    </div>
  );
}

export function RightRail() {
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const { connected } = useTelemetry();
  const now = useClock();
  const unread = useNotificationStore((s) => s.unread);
  const items = useNotificationStore((s) => s.items);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const panelOpen = useUiStore((s) => s.notificationPanelOpen);
  const setPanelOpen = useUiStore((s) => s.setNotificationPanelOpen);
  const markRead = useNotificationStore((s) => s.markRead);
  const navigate = useNavigate();
  const { data: healthData } = useQuery({ queryKey: ['diagnostics'], queryFn: endpoints.diagnostics, staleTime: 30_000 });
  const isDemo = healthData?.mockMode ?? false;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setPanelOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [setPanelOpen]);

  function openNotification(n: (typeof items)[number]) {
    setPanelOpen(false);
    markRead([n.id]);
    endpoints.notifications.read([n.id]).catch(() => undefined);
    navigate(`/alerts?highlight=${encodeURIComponent(n.id)}`);
  }

  if (!isDesktop) return null;

  return (
    <div className="fixed right-4 top-1/2 z-30 -translate-y-1/2 hidden xl:flex flex-col items-end gap-2">
      {/* Connection status */}
      <StatusChip>
        {connected ? (
          <span className="flex items-center gap-1.5 text-accent">
            <Wifi className="h-3 w-3" />
            <span className="font-medium">{isDemo ? 'Demo' : 'Live'}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-warn">
            <WifiOff className="h-3 w-3" />
            <span className="font-medium">Offline</span>
          </span>
        )}
      </StatusChip>

      {/* Clock */}
      <StatusChip>
        <Clock className="h-3 w-3 text-text-muted" />
        <span className="font-display font-semibold tabular leading-none text-text-primary">
          {formatClock(now)}
        </span>
        <span className="hidden 2xl:inline text-[10px] text-text-muted">{formatDate(now)}</span>
      </StatusChip>

      {/* Notifications */}
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className={cn(
            'relative flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors cursor-pointer',
            panelOpen
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-surface-border/60 bg-surface-input/80 text-text-secondary hover:text-text-primary hover:border-accent/30',
          )}
          aria-label={panelOpen ? 'Close notifications' : 'Open notifications'}
          aria-expanded={panelOpen}
        >
          <BellRing className="h-3 w-3" />
          <span className="font-medium">
            {unread > 0 ? `${unread} new` : 'Alerts'}
          </span>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-[#04120D]"
            >
              {unread > 9 ? '9+' : unread}
            </motion.span>
          )}
        </button>

        <AnimatePresence>
          {panelOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="absolute right-0 top-12 w-[min(340px,calc(100vw-8rem))] overflow-hidden rounded-2xl border border-surface-border bg-surface-elevated shadow-card"
            >
              <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
                <span className="text-sm font-semibold text-text-primary">Notifications</span>
                <button
                  onClick={() => {
                    markAllRead();
                    endpoints.notifications.readAll().catch(() => undefined);
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-text-muted transition-colors hover:text-accent cursor-pointer"
                >
                  Mark all read
                </button>
              </div>
              <div className="max-h-[min(340px,calc(100dvh-8rem))] overflow-y-auto">
                {items.length === 0 && (
                  <div className="px-4 py-10 text-center text-sm text-text-muted">No notifications yet</div>
                )}
                {items.slice(0, 10).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className={cn(
                      'flex w-full items-start gap-3 border-b border-surface-border/60 px-4 py-3 text-left transition-colors hover:bg-overlay/[0.03] cursor-pointer',
                      !n.read && 'bg-accent/[0.03]',
                    )}
                  >
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', SEVERITY_META[n.severity].dot)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-text-primary">{n.title}</div>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-text-secondary">{n.message}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
