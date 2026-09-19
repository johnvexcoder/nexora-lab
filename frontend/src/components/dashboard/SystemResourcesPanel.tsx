import { Gauge } from 'lucide-react';
import { DashboardPanel } from './DashboardPanel';
import type { FleetResources } from '@/lib/fleet';

const RING_COLORS = {
  cpu: '#22D3EE',
  ram: '#0EA5E9',
  storage: '#7C3AED',
};

function ResourceRing({
  value,
  label,
  color,
}: {
  value: number | null;
  label: string;
  color: string;
}) {
  const size = 84;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const known = value != null && Number.isFinite(value);
  const clamped = known ? Math.min(100, Math.max(0, value)) : 0;
  const offset = known ? circumference - (clamped / 100) * circumference : circumference;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-border)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={known ? color : 'var(--text-muted)'}
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100 100"
            strokeDashoffset={(offset / circumference) * 100}
            style={known ? { filter: `drop-shadow(0 0 6px ${color}66)` } : undefined}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {known ? (
            <span className="font-display text-xl font-bold tabular text-text-primary">{Math.round(clamped)}<span className="text-[11px] font-normal text-text-muted">%</span></span>
          ) : (
            <span className="font-display text-xl font-bold tabular text-text-muted">—</span>
          )}
        </div>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">{label}</span>
    </div>
  );
}

export function SystemResourcesPanel({ resources }: { resources: FleetResources }) {
  return (
    <DashboardPanel icon={<Gauge className="h-4 w-4" />} title="System Resources">
      <div className="flex items-start justify-around">
        <ResourceRing value={resources.cpu} label="CPU" color={RING_COLORS.cpu} />
        <ResourceRing value={resources.ram} label="RAM" color={RING_COLORS.ram} />
        <ResourceRing value={resources.storagePct} label="Storage" color={RING_COLORS.storage} />
      </div>
      {(resources.cpu == null && resources.ram == null && resources.storagePct == null) && (
        <p className="mt-3 text-center text-[11px] text-text-muted">Storage telemetry unavailable.</p>
      )}
    </DashboardPanel>
  );
}