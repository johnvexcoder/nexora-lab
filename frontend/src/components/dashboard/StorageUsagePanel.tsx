import { HardDrive } from 'lucide-react';
import { DashboardPanel } from './DashboardPanel';
import { toneColor } from '@/components/ui/Progress';
import { formatBytes } from '@/lib/utils';
import type { FleetResources } from '@/lib/fleet';

export function StorageUsagePanel({ resources }: { resources: FleetResources }) {
  const known =
    resources.storageTotalGb != null && resources.storageTotalGb > 0 && resources.storageUsedGb != null;
  const used = resources.storageUsedGb ?? 0;
  const total = resources.storageTotalGb ?? 0;
  const pctVal = resources.storagePct ?? 0;
  const free = known ? total - used : null;

  return (
    <DashboardPanel icon={<HardDrive className="h-4 w-4" />} title="Storage Usage">
      {!known ? (
        <p className="py-3 text-center text-xs text-text-muted">Storage telemetry unavailable.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between">
            <span className="font-display text-xl font-bold tabular text-text-primary">
              {formatBytes(used)}
              <span className="text-sm font-normal text-text-muted"> / {formatBytes(total)}</span>
            </span>
            <span
              className="font-display text-lg font-bold tabular"
              style={{ color: toneColor(pctVal) }}
            >
              {Math.round(pctVal)}%
            </span>
          </div>

          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-surface-border/50"
            role="progressbar"
            aria-valuenow={Math.round(pctVal)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Storage ${Math.round(pctVal)}% used`}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(0, pctVal))}%`,
                backgroundColor: toneColor(pctVal),
                boxShadow: `0 0 12px ${toneColor(pctVal)}55`,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              {formatBytes(used)} used
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-surface-active" aria-hidden="true" />
              {free != null ? `${formatBytes(free)} free` : '— free'}
            </span>
          </div>
        </div>
      )}
    </DashboardPanel>
  );
}