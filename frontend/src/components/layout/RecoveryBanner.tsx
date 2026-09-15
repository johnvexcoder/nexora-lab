import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, WifiOff, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/api/endpoints';
import { useTelemetryStore, realtimeStatus } from '@/store/telemetry';
import { useShallow } from 'zustand/react/shallow';
import { getWsState, retryWsNow } from '@/api/ws';
import { useClock } from '@/hooks/useClock';
import { cn, relativeTime } from '@/lib/utils';

/**
 * Global, non-intrusive recovery strip rendered under the topbar. Surfaces the
 * systemic failure/recovery conditions that are identical on every page:
 *
 *   reconnecting   — WS transport backoff is actively recovering
 *   disconnected   — WS transport is down
 *   provider       — telemetry provider reports errors (hidden on /servers,
 *                    which already renders the detailed diagnostics banner)
 *   stale          — last telemetry tick older than STALE_THRESHOLD_MS
 *   partial        — some known servers are not reporting telemetry
 *
 * Only the most severe active condition is shown at a time. Transport-critical
 * conditions are never dismissible; the rest are dismissible until the next
 * session.
 */

type Condition =
  | { id: 'reconnecting'; tone: string; dismissible: false }
  | { id: 'disconnected'; tone: string; dismissible: false }
  | { id: 'provider'; tone: string; dismissible: true }
  | { id: 'stale'; tone: string; dismissible: true }
  | { id: 'partial'; tone: string; dismissible: true };

const TONES: Record<Condition['id'], string> = {
  reconnecting: 'border-warn/30 bg-warn/10 text-warn',
  disconnected: 'border-crit/30 bg-crit/10 text-crit',
  provider: 'border-warn/30 bg-warn/10 text-warn',
  stale: 'border-warn/30 bg-warn/10 text-warn',
  partial: 'border-info/30 bg-info/10 text-info',
};

export function RecoveryBanner() {
  const location = useLocation();
  const now = useClock();
  // Re-renders once a second while mounted so the stale-age copy and the
  // reconnect countdown stay live (the store cannot notify on wall-clock time).
  const realtime = useTelemetryStore(useShallow((s) => realtimeStatus(s)));
  const { data: diagnostics } = useQuery({
    queryKey: ['diagnostics'],
    queryFn: endpoints.diagnostics,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const wsState = getWsState();

  const providerIssue = useMemo(() => {
    if (!diagnostics || diagnostics.mockMode) return false;
    const lastPollError = diagnostics.diagnostics?.lastPollError ?? diagnostics.lastPollError;
    if (lastPollError) return true;
    const endpointErrors = diagnostics.diagnostics?.endpointErrors ?? {};
    return Object.keys(endpointErrors).length > 0;
  }, [diagnostics]);

  const condition = useMemo<Condition | null>(() => {
    if (realtime.wsStatus === 'reconnecting') {
      return { id: 'reconnecting', tone: TONES.reconnecting, dismissible: false };
    }
    if (realtime.wsStatus === 'closed') {
      return { id: 'disconnected', tone: TONES.disconnected, dismissible: false };
    }
    if (providerIssue && location.pathname !== '/servers') {
      return { id: 'provider', tone: TONES.provider, dismissible: true };
    }
    if (realtime.stale && realtime.connected) {
      return { id: 'stale', tone: TONES.stale, dismissible: true };
    }
    if (realtime.partial && realtime.connected) {
      return { id: 'partial', tone: TONES.partial, dismissible: true };
    }
    return null;
  }, [realtime, providerIssue, location.pathname]);

  const dismissible = condition?.dismissible === true;
  const shown = condition != null && (!dismissible || !dismissed.has(condition.id));

  const copy = useMemo(() => {
    if (!condition || !shown) return null;
    switch (condition.id) {
      case 'reconnecting': {
        const secs = Math.max(1, Math.ceil(wsState.backoffMs / 1000));
        return `Live telemetry reconnecting… attempt ${wsState.attempt} · retry in ~${secs}s`;
      }
      case 'disconnected':
        return 'Live telemetry disconnected — data shown may be stale.';
      case 'provider':
        return 'Infrastructure provider is reporting errors — some telemetry may be missing.';
      case 'stale': {
        const lastTickAt = realtime.telemetryAgeMs != null ? now.getTime() - realtime.telemetryAgeMs : now.getTime();
        return `Telemetry is stale — last update was ${relativeTime(lastTickAt)} or later.`;
      }
      case 'partial':
        return `Partial telemetry — ${realtime.reportingServers} of ${realtime.totalServers} hosts reporting.`;
    }
  }, [condition, shown, wsState, realtime, now]);

  if (copy == null) return null;

  const icon =
    condition!.id === 'reconnecting' ? (
      <RefreshCw className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
    ) : condition!.id === 'disconnected' ? (
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
    ) : (
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
    );

  return (
    <div className="mx-auto w-full max-w-[1440px] px-3 sm:px-5 lg:px-24 xl:px-52">
      <AnimatePresence initial={false}>
        {shown && (
          <motion.div
            key={condition!.id}
            id="recovery-banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'mt-1.5 flex min-h-9 items-center gap-2.5 rounded-xl border px-3 py-1.5 text-xs font-medium',
              condition!.tone,
            )}
            role="status"
            aria-live="polite"
          >
            {icon}
            <span className="min-w-0 flex-1 truncate">{copy}</span>

            {(condition!.id === 'reconnecting' || condition!.id === 'disconnected') && (
              <button
                type="button"
                onClick={retryWsNow}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-current/30 bg-black/10 px-2.5 py-1 font-semibold transition-opacity hover:opacity-70 cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Retry now
              </button>
            )}

            {(condition!.id === 'provider' || condition!.id === 'partial') && (
              <Link
                to="/servers"
                className="hidden shrink-0 rounded-lg border border-current/30 bg-black/10 px-2.5 py-1 font-semibold transition-opacity hover:opacity-70 sm:inline-flex"
              >
                View fleet
              </Link>
            )}

            {dismissible && (
              <button
                type="button"
                onClick={() => setDismissed((prev) => new Set(prev).add(condition!.id))}
                className="shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100 cursor-pointer"
                aria-label="Dismiss notice"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}