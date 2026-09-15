import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { endpoints } from '@/api/endpoints';

/**
 * Surfaces real-provider failures that would otherwise silently render as
 * zeroed metrics — e.g. a PVE API token that can list nodes but is missing
 * read privileges for per-node status, guests, sensors or RRD data, or an
 * agent/`composite` fallback whose upstream providers stopped polling.
 *
 * Uses the same `/api/diagnostics` payload the recovery banner reads, so both
 * stay in agreement.
 */
export function ProviderDiagnosticsBanner() {
  const { data } = useQuery({
    queryKey: ['diagnostics'],
    queryFn: endpoints.diagnostics,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const entries = data?.diagnostics ? Object.entries(data.diagnostics.endpointErrors ?? {}) : [];
  const pollError = data?.diagnostics?.lastPollError ?? data?.lastPollError ?? null;

  if (!pollError && entries.length === 0) return null;

  const providerLabel = data?.provider && data.provider !== 'unknown' ? data.provider : 'Infrastructure';
  const isProxmox = (data?.provider ?? '').toLowerCase().includes('proxmox') || data?.provider?.includes('pve');

  return (
    <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-warn">
        <AlertTriangle className="h-4 w-4" />
        {providerLabel} provider is reporting errors
      </div>
      {pollError && <p className="mt-1 text-xs text-text-secondary">Poll error: {pollError}</p>}
      {entries.length > 0 && (
        <ul className="mt-2 space-y-1">
          {entries.map(([path, message]) => (
            <li key={path} className="font-mono text-[11px] text-text-muted">
              <span className="mr-1 text-warn">✗</span>
              {path} — {message}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-text-muted">
        {isProxmox ? (
          <>
            Per-node data (CPU, memory, VMs, containers, sensors) comes from the PVE read-only API. This usually means the
            API token lacks read privileges — see SETUP.md Part 2 and give the token the{' '}
            <code className="font-mono">PVEAuditor</code> role.
          </>
        ) : (
          <>
            This provider is failing to report. Live telemetry may be missing or stale — check the provider connection and
            restart it if the errors persist.
          </>
        )}
      </p>
    </div>
  );
}