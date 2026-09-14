import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Cpu,
  HardDrive,
  Layers,
  Thermometer,
  X,
} from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { NETWORK_NODE_ICONS_FRONTEND } from '@/lib/constants';
import { INFRA_ICON_COMPONENTS } from '@/lib/icons';
import { getStatusMeta } from '@/components/topology/nodes';
import { clamp, cn } from '@/lib/utils';
import type { NetworkNode, ServerRuntime } from '@/types';

/**
 * Responsive node inspector for the topology canvas.
 *
 * Desktop (lg+): a compact contextual panel floats beside the selected node,
 * clamped to the visible canvas so it never goes off-screen. The panel slides
 * in from the right, reads live telemetry and links out to the full server page.
 *
 * Mobile (<lg): the same details render as a bottom sheet (grab handle,
 * backdrop, Escape/backdrop to dismiss) so the topology stays primary on small
 * screens per the design system.
 *
 * The inspector is portalled to `document.body` so it escapes the canvas
 * stacking context and always floats above the operational rails.
 */

/** Viewport-space anchor describing where to dock the contextual panel. */
export interface NodeInspectorAnchor {
  /** Selected node centre in viewport coordinates. */
  x: number;
  y: number;
  /** Canvas bounding box in viewport coordinates (clamping bounds). */
  canvasLeft: number;
  canvasTop: number;
  canvasRight: number;
  canvasBottom: number;
}

export interface NodeInspectorProps {
  node: NetworkNode;
  server?: ServerRuntime;
  nodeById: Map<string, NetworkNode>;
  anchor?: NodeInspectorAnchor;
  onClose: () => void;
}

const DESKTOP_WIDTH = 288;
const DESKTOP_MAX_H = 460;
const GAP = 16;
const MIN_VISIBLE_H = 260;

function desktopPlacement(a: NodeInspectorAnchor) {
  const availableH = a.canvasBottom - a.canvasTop - GAP * 2;
  const maxHeight = Math.min(
    DESKTOP_MAX_H,
    Math.max(MIN_VISIBLE_H, Math.floor(availableH)),
  );

  const fitsRight = a.canvasRight - a.x >= DESKTOP_WIDTH + GAP;
  const fitsLeft = a.x - a.canvasLeft >= DESKTOP_WIDTH + GAP;
  let left: number;
  if (fitsRight) left = a.x + GAP;
  else if (fitsLeft) left = a.x - DESKTOP_WIDTH - GAP;
  else left = a.x - DESKTOP_WIDTH / 2;
  left = clamp(
    left,
    a.canvasLeft + GAP,
    Math.max(a.canvasLeft + GAP, a.canvasRight - DESKTOP_WIDTH - GAP),
  );

  const top = clamp(
    a.y - maxHeight / 2,
    a.canvasTop + GAP,
    Math.max(a.canvasTop + GAP, a.canvasBottom - maxHeight - GAP),
  );

  return { left, top, maxHeight };
}

export function NodeInspector({
  node,
  server,
  nodeById,
  anchor,
  onClose,
}: NodeInspectorProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const prefersReduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus the panel when it opens so keyboard users land inside, and restore
  // focus (back to the clicked node) when it closes.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus();
  }, [node.id]);

  const transition = prefersReduced
    ? { duration: 0 }
    : { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const };

  const body = useMemo(
    () => <NodeDetailPanel node={node} server={server} nodeById={nodeById} />,
    [node, server, nodeById],
  );

  if (isDesktop) {
    if (!anchor) return null;
    const { left, top, maxHeight } = desktopPlacement(anchor);

    return (
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-label={`${node.label} details`}
        tabIndex={-1}
        initial={prefersReduced ? { opacity: 0 } : { opacity: 0, x: 14 }}
        animate={{ opacity: 1, x: 0 }}
        exit={prefersReduced ? { opacity: 0 } : { opacity: 0, x: 14 }}
        transition={transition}
        className="fixed z-40 flex max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-surface-border bg-surface-elevated/95 shadow-card outline-none backdrop-blur-md"
        style={{ left, top, width: DESKTOP_WIDTH, maxHeight }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-surface-border/70 py-2 pl-3.5 pr-2">
          <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Device details
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-overlay/5 hover:text-text-primary cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label="Close node details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-3">{body}</div>
      </motion.div>
    );
  }

  return createPortal(
    <motion.div
      initial={prefersReduced ? { opacity: 0 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={prefersReduced ? { duration: 0 } : { duration: 0.2 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${node.label} details`}
        tabIndex={-1}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={transition}
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border border-b-0 border-surface-border bg-surface-elevated pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-card outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-1 mt-2.5 h-1 w-10 rounded-full bg-surface-border"
          aria-hidden="true"
        />
        <div className="flex items-center justify-between gap-3 px-4 py-1.5">
          <h2 className="min-w-0 truncate text-sm font-semibold text-text-primary">
            {node.label}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-overlay/5 hover:text-text-primary cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label="Close node details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[min(68dvh,600px)] overflow-y-auto px-4 pb-2 pt-1">
          {body}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ═══════════════════════════════════════════════════════════════════
// PANEL BODY
// ═══════════════════════════════════════════════════════════════════

function NodeDetailPanel({
  node,
  server,
  nodeById,
}: {
  node: NetworkNode;
  server?: ServerRuntime;
  nodeById: Map<string, NetworkNode>;
}) {
  const statusColor = getStatusMeta(node.status).color;
  const statusLabel = getStatusMeta(node.status).label;
  const IconComponent = INFRA_ICON_COMPONENTS[node.type];
  const parentNode = node.parentId ? nodeById.get(node.parentId) : undefined;

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-surface-input"
          style={{ borderColor: `${statusColor}55` }}
        >
          {IconComponent ? (
            <IconComponent size={22} />
          ) : (
            <span>{NETWORK_NODE_ICONS_FRONTEND[node.type] ?? '📦'}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-text-primary">
            {node.label}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span className="capitalize">{node.type}</span>
            <span className="h-1 w-1 rounded-full bg-surface-border" />
            <span className="font-mono">
              {node.ip ?? server?.spec.ip ?? 'No IP'}
            </span>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: `${statusColor}22`,
            color: statusColor,
          }}
        >
          {statusLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-surface-border/70 bg-surface-input/50 p-2.5 text-[11px]">
        <div>
          <span className="text-text-muted">Parent Host</span>
          <div className="mt-0.5 truncate font-medium text-text-primary">
            {parentNode?.label ?? 'None (Root)'}
          </div>
        </div>
        <div>
          <span className="text-text-muted">Health Score</span>
          <div className="mt-0.5 font-medium text-text-primary">
            {Math.round(node.health)} / 100
          </div>
        </div>
      </div>

      {server && (
        <div className="space-y-2 rounded-xl border border-surface-border/70 bg-surface-input/50 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Live Metrics
          </div>
          <MetricBar
            icon={<Cpu className="h-3 w-3 text-info" />}
            label="CPU"
            value={Math.round(server.cpu)}
            unit="%"
            color="bg-info"
          />
          <MetricBar
            icon={<Layers className="h-3 w-3 text-accent" />}
            label="RAM"
            value={
              server.spec.ramTotalGb > 0
                ? Math.round((server.ramUsedGb / server.spec.ramTotalGb) * 100)
                : 0
            }
            unit={`% (${server.ramUsedGb.toFixed(1)} / ${server.spec.ramTotalGb.toFixed(1)} GB)`}
            color="bg-accent"
          />
          <MetricBar
            icon={<HardDrive className="h-3 w-3 text-warn" />}
            label="Disk"
            value={
              server.spec.diskTotalGb > 0
                ? Math.round(
                    (server.diskUsedGb / server.spec.diskTotalGb) * 100,
                  )
                : 0
            }
            unit={`% (${server.diskUsedGb.toFixed(1)} / ${server.spec.diskTotalGb.toFixed(1)} GB)`}
            color="bg-warn"
          />
          {server.tempC > 0 && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 text-text-muted">
                <Thermometer className="h-3 w-3 text-warn" /> Temp
              </span>
              <span className="font-mono font-semibold text-text-primary">
                {Math.round(server.tempC)}°C
              </span>
            </div>
          )}
        </div>
      )}

      {(() => {
        const containers = (server as any)?.containers as
          | Array<{ id: string; name: string; running: boolean }>
          | undefined;
        if (!containers || containers.length === 0) return null;
        const runningCount = containers.filter((c) => c.running).length;
        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-text-muted">
              <span>Containers ({containers.length})</span>
              <span className="text-emerald-400">{runningCount} running</span>
            </div>
            <div className="max-h-28 space-y-1 overflow-y-auto pr-1 text-[11px]">
              {containers.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-surface-border/50 bg-surface-input px-2 py-1"
                >
                  <span className="truncate font-medium text-text-primary">
                    {c.name}
                  </span>
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      c.running ? 'bg-emerald-400' : 'bg-crit',
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {server && (
        <div className="pt-1">
          <Link
            to={`/servers/${server.spec.id}`}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
          >
            <span>View Server Details</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

function MetricBar({
  icon,
  label,
  value,
  unit,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1 text-text-muted">
          {icon} {label}
        </span>
        <span className="font-mono font-semibold text-text-primary">
          {unit}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-border">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            color,
          )}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}