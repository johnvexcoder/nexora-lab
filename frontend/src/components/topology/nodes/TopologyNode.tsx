import { useMemo, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Bell } from 'lucide-react';
import type { InfraKind, InfraMetrics, InfraStatus } from '@/lib/infrastructure';
import { INFRA_ICON_COMPONENTS } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { getStatusMeta, isStale, getEffectiveStatus } from './status';
import type { NodeLayoutMetrics } from './types';
import type { AlertCounts } from '@/hooks/useAlertsByNode';

const KIND_LABELS: Record<InfraKind, string> = {
  host: 'Host',
  hypervisor: 'Hypervisor',
  vm: 'VM',
  container: 'Container',
  storage: 'Storage',
  service: 'Service',
};

/** Canonical icon key for an infra kind (fallback when no explicit icon given). */
function kindIconKey(kind: InfraKind): string {
  switch (kind) {
    case 'host':
      return 'physical';
    case 'hypervisor':
      return 'hypervisor';
    case 'vm':
      return 'vm';
    case 'container':
      return 'container';
    case 'storage':
      return 'storage';
    case 'service':
      return 'service';
  }
}

/**
 * Builds a screen-reader friendly description of a node so status is never
 * communicated through color alone. Combines name, kind, status and any known
 * live metrics into a single sentence-style label.
 */
export function accessibleNodeLabel(opts: {
  name: string;
  kind: InfraKind;
  status: InfraStatus;
  ip?: string | null;
  metrics?: InfraMetrics;
}): string {
  const meta = getStatusMeta(opts.status);
  const parts = [opts.name, KIND_LABELS[opts.kind], `status ${meta.label}`];
  if (opts.ip) parts.push(opts.ip);

  const m = opts.metrics;
  if (m?.cpuPercent != null) parts.push(`${Math.round(m.cpuPercent)}% cpu`);
  if (m?.ramUsedGb != null && m?.ramTotalGb != null) {
    parts.push(`${Math.round(m.ramUsedGb)} of ${Math.round(m.ramTotalGb)} gb ram`);
  }
  if (m?.diskUsedGb != null && m?.diskTotalGb != null) {
    parts.push(`${Math.round(m.diskUsedGb)} of ${Math.round(m.diskTotalGb)} gb disk`);
  }
  if (m?.tempC != null) parts.push(`${Math.round(m.tempC)} degrees`);

  return parts.join(', ');
}

export interface TopologyNodeProps {
  id: string;
  kind: InfraKind;
  name: string;
  status: InfraStatus;
  ip?: string | null;
  metrics?: InfraMetrics;
  health?: number | null;
  layout: NodeLayoutMetrics;
  /** Minimal mode — secondary/status row omitted (mobile). */
  compact?: boolean;
  /** Override the default kind icon. */
  icon?: ReactNode;
  /** Secondary line content (kind-specific real status, tooltips, etc.). */
  secondary?: ReactNode;
  selected?: boolean;
  hovered?: boolean;
  /** Alert counts for this node's server. */
  alertCounts?: AlertCounts;
  onSelect?: () => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}

/**
 * Reusable base topology node: an accessible, keyboard-navigable button used by
 * all kind-specific nodes (Host/Hypervisor/VM/Container/Storage/Service).
 * Pointer-down is stopped so the parent canvas can pan/drag without fighting the
 * node button.
 */
export function TopologyNode({
  kind,
  name,
  status,
  ip,
  metrics,
  layout,
  compact = false,
  icon,
  secondary,
  selected,
  hovered,
  alertCounts,
  onSelect,
  onHoverStart,
  onHoverEnd,
}: TopologyNodeProps) {
  const effectiveStatus = getEffectiveStatus(status, metrics);
  const stale = isStale(metrics);
  const meta = getStatusMeta(effectiveStatus);
  const prefersReduced = useReducedMotion();

  const ariaLabel = useMemo(
    () => accessibleNodeLabel({ name, kind, status: effectiveStatus, ip, metrics }),
    [name, kind, effectiveStatus, ip, metrics],
  );

  const resolvedIcon = icon ?? (() => {
    const IconComp = INFRA_ICON_COMPONENTS[kindIconKey(kind)] as
      | React.FC<{ size?: number }>
      | undefined;
    return IconComp ? <IconComp size={layout.iconSize} /> : null;
  })();

  const isStaleStatus = effectiveStatus === 'stale';

  const highestAlertSeverity = alertCounts
    ? (alertCounts.critical > 0
        ? 'critical'
        : alertCounts.warning > 0
        ? 'warning'
        : alertCounts.success > 0
        ? 'success'
        : alertCounts.info > 0
        ? 'info'
        : null)
    : null;

  const ALERT_COLOR: Record<string, string> = {
    critical: '#EF4444',
    warning: '#F59E0B',
    success: '#22C55E',
    info: '#0EA5E9',
  };

  return (
    <motion.button
      type="button"
      initial={prefersReduced ? false : { opacity: 0, scale: 0.8 }}
      animate={{ opacity: isStaleStatus && !prefersReduced ? 0.7 : 1, scale: 1 }}
      transition={{ duration: prefersReduced ? 0 : 0.3, ease: 'easeOut' }}
      aria-label={ariaLabel}
      aria-pressed={onSelect ? (selected ?? false) : undefined}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onClick={onSelect}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-xl border bg-surface-elevated/90 px-2.5 py-1.5 text-left shadow-lg backdrop-blur-md transition-all duration-200 select-none',
        'outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-base',
        selected || hovered
          ? '-translate-y-0.5 border-accent ring-2 ring-accent/30'
          : 'border-surface-border hover:border-surface-border/80 hover:bg-surface-input',
        isStaleStatus && 'border-dashed animate-pulse',
      )}
      style={{
        width: layout.nodeWidth,
        height: layout.nodeHeight,
        opacity: isStaleStatus ? 0.85 : 1,
        boxShadow:
          selected || hovered
            ? `0 0 20px ${meta.color}33`
            : undefined,
      }}
      tabIndex={0}
    >
      <div
        className="relative flex shrink-0 items-center justify-center rounded-lg border border-surface-border bg-black/40"
        style={{
          width: layout.iconSize + 8,
          height: layout.iconSize + 8,
          borderColor: `${meta.color}44`,
        }}
      >
        {resolvedIcon}
        <span
          className={cn(
            'absolute -right-1 -top-1 h-2 w-2 rounded-full border-2 border-surface-elevated',
            isStaleStatus && 'animate-pulse',
          )}
          style={{ backgroundColor: meta.color }}
          aria-hidden="true"
        />
        {isStaleStatus && !prefersReduced && (
          <span
            className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-surface-elevated flex items-center justify-center text-[8px] animate-pulse"
            aria-label="Stale telemetry data"
          >
            ⏱
          </span>
        )}
        {highestAlertSeverity && !prefersReduced && (
          <span
            className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface-elevated"
            style={{ backgroundColor: ALERT_COLOR[highestAlertSeverity] }}
            aria-label={`${alertCounts?.total} active alert${alertCounts?.total === 1 ? '' : 's'} (${highestAlertSeverity})`}
          >
            <Bell className="h-2.5 w-2.5 text-white" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 pr-0.5">
        <div
          className="truncate font-semibold text-text-primary group-hover:text-accent"
          style={{ fontSize: layout.fontSize }}
        >
          {name}
        </div>
        {!compact && secondary && <div className="mt-0.5">{secondary}</div>}
      </div>
    </motion.button>
  );
}