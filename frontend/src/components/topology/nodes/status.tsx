import type { InfraStatus } from '@/lib/infrastructure';
import { cn } from '@/lib/utils';

/**
 * Compact status visuals for topology nodes.
 *
 * Per the design system, status must never rely on color alone: every node
 * button exposes the status in its accessible name, and the `StatusPill`
 * renders a text label next to the color dot whenever space allows.
 */

export interface StatusMeta {
  /** Status dot / accent color. */
  color: string;
  /** Subtle badge background tint for the state. */
  bgColor: string;
  /** Human-readable label (used for accessible names and pills). */
  label: string;
}

export const STATUS_META: Record<InfraStatus, StatusMeta> = {
  online: { color: '#22C55E', bgColor: 'rgba(34,197,94,0.12)', label: 'Online' },
  degraded: { color: '#F59E0B', bgColor: 'rgba(245,158,11,0.12)', label: 'Degraded' },
  offline: { color: '#EF4444', bgColor: 'rgba(239,68,68,0.12)', label: 'Offline' },
  unknown: { color: '#64748B', bgColor: 'rgba(100,116,139,0.12)', label: 'Unknown' },
};

export function getStatusMeta(status: InfraStatus): StatusMeta {
  return STATUS_META[status] ?? STATUS_META.unknown;
}

export function StatusPill({
  status,
  compact = false,
  className,
}: {
  status: InfraStatus;
  /** Dot only — text omitted (status still exposed via the node accessible name). */
  compact?: boolean;
  className?: string;
}) {
  const meta = getStatusMeta(status);
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 font-semibold uppercase tracking-wider',
        compact ? 'py-px text-[7px] leading-[10px]' : 'py-[1px] text-[8px] leading-[11px]',
        className,
      )}
      style={{ backgroundColor: meta.bgColor, color: meta.color }}
      aria-hidden="true"
    >
      <span
        className="h-[5px] w-[5px] shrink-0 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {!compact && <span>{meta.label}</span>}
    </span>
  );
}