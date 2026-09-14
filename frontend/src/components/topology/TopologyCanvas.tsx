import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  WifiOff, X, Cpu, Thermometer, HardDrive, ArrowUpRight, Layers,
  Plus, Minus, Maximize2, RefreshCw,
} from 'lucide-react';
import { NETWORK_NODE_ICONS_FRONTEND } from '@/lib/constants';
import { INFRA_ICON_COMPONENTS } from '@/lib/icons';
import type { NetworkNode, NetworkLink, ServerRuntime } from '@/types';
import { cn, clamp, formatMbps } from '@/lib/utils';
import {
  computeTopologyLayout,
  type TopologyLayout,
  type CableLayout,
} from '@/lib/topologyLayout';

// ── Constants ──────────────────────────────────────────────────────

const ZOOM_WORKSPACE = { min: 0.15, max: 4 };
const ZOOM_CARD = { min: 0.3, max: 1.5 };
const ZOOM_STEP = 1.2;

const STATUS_COLOR: Record<string, string> = {
  online: '#10B981',
  degraded: '#F59E0B',
  offline: '#EF4444',
  unknown: '#6B7280',
};

const STATUS_LABEL: Record<string, string> = {
  online: 'Online',
  degraded: 'Degraded',
  offline: 'Offline',
};

const LINK_COLOR: Record<string, string> = {
  healthy: '#10B981',
  warning: '#F59E0B',
  critical: '#EF4444',
  unknown: '#6B7280',
};

type LinkStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

function normalizeStatus(status: NetworkLink['status'] | undefined): LinkStatus {
  if (!status) return 'unknown';
  return status in LINK_COLOR ? (status as LinkStatus) : 'unknown';
}

// ── Props ──────────────────────────────────────────────────────────

export interface TopologyCanvasProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
  servers?: ServerRuntime[];
  variant?: 'card' | 'workspace';
  showControls?: boolean;
  showLegend?: boolean;
  showStatusBar?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isLoading?: boolean;
  error?: Error | null;
  className?: string;
}

// ── Hook: element size via ResizeObserver ───────────────────────────

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      setSize({ width: r.width, height: r.height });
    }
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]?.contentRect;
      if (entry && entry.width > 0 && entry.height > 0) {
        setSize({ width: entry.width, height: entry.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

// ── Main Component ─────────────────────────────────────────────────

export function TopologyCanvas({
  nodes,
  links,
  servers = [],
  variant = 'card',
  showControls = false,
  showLegend = false,
  showStatusBar = false,
  onRefresh,
  isRefreshing = false,
  isLoading = false,
  error = null,
  className,
}: TopologyCanvasProps) {
  const { ref: containerRef, size: containerSize } = useElementSize<HTMLDivElement>();
  const zoomLimits = variant === 'workspace' ? ZOOM_WORKSPACE : ZOOM_CARD;

  // ── Layout computation ────────────────────────────────────────

  const boardWidth = containerSize.width || 1000;
  const boardHeight = containerSize.height || 500;

  const layout: TopologyLayout = useMemo(
    () => computeTopologyLayout(nodes, links, boardWidth, boardHeight),
    [nodes, links, boardWidth, boardHeight],
  );

  const { width: layoutW, height: layoutH, nodes: finalPositions, cables } = layout;

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const serverByNodeId = useMemo(() => {
    const m = new Map<string, ServerRuntime>();
    for (const n of nodes) {
      const match = servers.find(
        (s) =>
          s.spec.id === n.id ||
          s.spec.hostname === n.label ||
          (n.ip && s.spec.ip === n.ip),
      );
      if (match) m.set(n.id, match);
    }
    return m;
  }, [nodes, servers]);

  // ── Auto-fit zoom ─────────────────────────────────────────────

  const fitZoom = useMemo(() => {
    if (boardWidth === 0 || boardHeight === 0 || layoutW === 0 || layoutH === 0) return 1;
    const scaleX = boardWidth / layoutW;
    const scaleY = boardHeight / layoutH;
    return Math.min(
      Math.max(Math.min(scaleX, scaleY), zoomLimits.min),
      variant === 'card' ? 1.0 : zoomLimits.max,
    );
  }, [boardWidth, boardHeight, layoutW, layoutH, zoomLimits.min, zoomLimits.max, variant]);

  // ── Pan / Zoom state ──────────────────────────────────────────
  // panX, panY = world coords of viewport center
  // zoom = scale factor

  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const fitAppliedRef = useRef(false);
  const hadRealSizeRef = useRef(false);

  // Refs so wheel handler avoids stale closures
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const zoomRef = useRef(1);

  panXRef.current = panX;
  panYRef.current = panY;
  zoomRef.current = zoom;

  // Force a re-fit once the container reports a real (non-fallback) size
  useEffect(() => {
    if (containerSize.width > 0 && !hadRealSizeRef.current) {
      hadRealSizeRef.current = true;
      fitAppliedRef.current = false;
    }
  }, [containerSize.width, containerSize.height]);

  // Auto-fit when topology data changes (not on resize)
  const dataKey = useMemo(
    () => nodes.map((n) => n.id).sort().join(',') + '|' + links.map((l) => l.id).sort().join(','),
    [nodes, links],
  );
  const prevDataKeyRef = useRef(dataKey);

  useEffect(() => {
    if (dataKey !== prevDataKeyRef.current || !fitAppliedRef.current) {
      prevDataKeyRef.current = dataKey;
      fitAppliedRef.current = true;
      setZoom(fitZoom);
      setPanX(layoutW / 2);
      setPanY(layoutH / 2);
    }
  }, [dataKey, fitZoom, layoutW, layoutH]);

  // ── Clamp helper ──────────────────────────────────────────────

  const clampPan = useCallback(
    (px: number, py: number, z: number) => {
      const hw = boardWidth / (2 * z);
      const hh = boardHeight / (2 * z);
      return {
        x: clamp(px, -hw, layoutW + hw),
        y: clamp(py, -hh, layoutH + hh),
      };
    },
    [boardWidth, boardHeight, layoutW, layoutH],
  );

  // ── Wheel zoom (non-passive listener) ─────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left - boardWidth / 2;
      const cy = e.clientY - rect.top - boardHeight / 2;
      const prevZ = zoomRef.current;
      const newZ = clamp(
        e.deltaY < 0 ? prevZ * ZOOM_STEP : prevZ / ZOOM_STEP,
        zoomLimits.min,
        zoomLimits.max,
      );
      const npx = panXRef.current + cx * (1 / prevZ - 1 / newZ);
      const npy = panYRef.current + cy * (1 / prevZ - 1 / newZ);
      const c = clampPan(npx, npy, newZ);
      setZoom(newZ);
      setPanX(c.x);
      setPanY(c.y);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [containerRef, boardWidth, boardHeight, zoomLimits.min, zoomLimits.max, clampPan]);

  // ── Pointer drag ──────────────────────────────────────────────

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPanX: panXRef.current,
        startPanY: panYRef.current,
      };
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const z = zoomRef.current;
      const npx = dragRef.current.startPanX - dx / z;
      const npy = dragRef.current.startPanY - dy / z;
      const c = clampPan(npx, npy, z);
      setPanX(c.x);
      setPanY(c.y);
    },
    [clampPan],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handlePointerCancel = useCallback(() => {
    dragRef.current = null;
  }, []);

  // ── Touch pinch ───────────────────────────────────────────────

  const pinchRef = useRef<{
    dist: number;
    zoom: number;
    panX: number;
    panY: number;
  } | null>(null);

  const resetPinch = useCallback(() => {
    pinchRef.current = null;
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 2) return;
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      pinchRef.current = { dist, zoom: zoomRef.current, panX: panXRef.current, panY: panYRef.current };
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      e.preventDefault();
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const ratio = dist / pinchRef.current.dist;
      const newZ = clamp(
        pinchRef.current.zoom * ratio,
        zoomLimits.min,
        zoomLimits.max,
      );
      setZoom(newZ);
      setPanX(pinchRef.current.panX);
      setPanY(pinchRef.current.panY);
    },
    [zoomLimits.min, zoomLimits.max],
  );

  const handleTouchEnd = useCallback(() => {
    resetPinch();
  }, [resetPinch]);

  // ── Controls ──────────────────────────────────────────────────

  const fitToView = useCallback(() => {
    setZoom(fitZoom);
    setPanX(layoutW / 2);
    setPanY(layoutH / 2);
  }, [fitZoom, layoutW, layoutH]);

  const zoomIn = useCallback(() => {
    setZoom((z) => clamp(z * ZOOM_STEP, zoomLimits.min, zoomLimits.max));
  }, [zoomLimits.min, zoomLimits.max]);

  const zoomOut = useCallback(() => {
    setZoom((z) => clamp(z / ZOOM_STEP, zoomLimits.min, zoomLimits.max));
  }, [zoomLimits.min, zoomLimits.max]);

  // ── Selection state ───────────────────────────────────────────

  const [hoveredNode, setHoveredNode] = useState<NetworkNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [hoveredLink, setHoveredLink] = useState<NetworkLink | null>(null);
  const [selectedLink, setSelectedLink] = useState<NetworkLink | null>(null);

  // ── World → screen mapping ────────────────────────────────────

  const worldToScreen = useCallback(
    (wx: number, wy: number) => ({
      x: (wx - panX) * zoom + boardWidth / 2,
      y: (wy - panY) * zoom + boardHeight / 2,
    }),
    [panX, panY, zoom, boardWidth, boardHeight],
  );

  // ── Throughput ────────────────────────────────────────────────

  const totalTx = useMemo(
    () =>
      Math.round(
        servers.reduce((a, s) => a + (s.netDownMbps || 0) + (s.netUpMbps || 0), 0) * 10,
      ) / 10,
    [servers],
  );

  // ── CSS transform ─────────────────────────────────────────────

  const worldTransform = `translate(${boardWidth / 2 - panX * zoom}px, ${boardHeight / 2 - panY * zoom}px) scale(${zoom})`;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={cn('relative h-full w-full overflow-hidden select-none', className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => { handlePointerUp(); resetPinch(); }}
      onPointerCancel={() => { handlePointerCancel(); resetPinch(); }}
      onPointerLeave={() => { handlePointerCancel(); resetPinch(); }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        cursor: dragRef.current ? 'grabbing' : 'grab',
        touchAction: variant === 'workspace' ? 'none' : 'pan-y',
      }}
    >
      {/* Grid backdrop */}
      <div className="grid-backdrop absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-base/60" />

      {/* ═══════════════════════════════════════════════════════════
          WORLD CONTAINER (pan + zoom)
          ═══════════════════════════════════════════════════════════ */}

      {nodes.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: layoutW,
            height: layoutH,
            transformOrigin: '0 0',
            transform: worldTransform,
          }}
        >
          {/* ── SVG Layer (Cables & Light Pulses) ─────────────── */}
          <svg
            width={layoutW}
            height={layoutH}
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            <defs>
              <style>{`
                @keyframes net-cable-pulse {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.35; }
                }
                .net-base { transition: stroke 400ms ease, stroke-opacity 400ms ease; }
                .net-cable-pulse { animation: net-cable-pulse 4s ease-in-out infinite; }
              `}</style>
            </defs>

            {links.map((link) => {
              const cab = cables.get(link.id);
              if (!cab) return null;
              return (
                <CableLayer
                  key={link.id}
                  link={link}
                  cable={cab}
                  hovered={hoveredLink?.id === link.id}
                  selected={selectedLink?.id === link.id}
                  onHover={() => setHoveredLink(link)}
                  onUnhover={() =>
                    setHoveredLink((h) => (h?.id === link.id ? null : h))
                  }
                  onClick={() => {
                    setSelectedLink(link);
                    setSelectedNode(null);
                  }}
                />
              );
            })}

            <MovingLightPackets links={links} cables={cables} />
          </svg>

          {/* ── HTML Layer (Device Cards) ──────────────────── */}
          {nodes.map((node) => {
            const p = finalPositions.get(node.id);
            if (!p) return null;

            const isHovered = hoveredNode?.id === node.id;
            const isSelected = selectedNode?.id === node.id;
            const statusColor = STATUS_COLOR[node.status] ?? STATUS_COLOR.online;
            const IconComponent = INFRA_ICON_COMPONENTS[node.type];
            const server = serverByNodeId.get(node.id);

            return (
              <div
                key={node.id}
                className="absolute"
                style={{
                  left: p.x,
                  top: p.y,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={cn(
                    'group flex cursor-pointer items-center gap-2 rounded-xl border bg-surface-elevated/90 px-2.5 py-1.5 text-left shadow-lg backdrop-blur-md transition-all duration-200 select-none outline-none',
                    isHovered || isSelected
                      ? 'border-accent ring-2 ring-accent/30 shadow-accent/20 translate-y-[-2px]'
                      : 'border-surface-border hover:border-surface-border/80 hover:bg-surface-input',
                  )}
                  style={{
                    width: layout.metrics.nodeWidth,
                    height: layout.metrics.nodeHeight,
                    boxShadow:
                      isHovered || isSelected
                        ? `0 0 20px ${statusColor}33`
                        : undefined,
                  }}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() =>
                    setHoveredNode((h) => (h?.id === node.id ? null : h))
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNode(node);
                    setSelectedLink(null);
                  }}
                >
                  <div
                    className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-surface-border bg-black/40"
                    style={{ borderColor: `${statusColor}44` }}
                  >
                    {IconComponent ? (
                      <IconComponent size={layout.metrics.iconSize} />
                    ) : (
                      <span className="text-sm">
                        {NETWORK_NODE_ICONS_FRONTEND[node.type] ?? '📦'}
                      </span>
                    )}
                    <span
                      className="absolute -right-1 -top-1 h-2 w-2 rounded-full border-2 border-surface-elevated"
                      style={{ backgroundColor: statusColor }}
                    />
                  </div>

                  <div className="min-w-0 flex-1 pr-0.5">
                    <div
                      className="truncate font-semibold text-text-primary group-hover:text-accent"
                      style={{ fontSize: layout.metrics.fontSize }}
                    >
                      {node.label}
                    </div>
                    {layout.metrics.showIpOnNode && (
                      <div className="mt-0.5 flex items-center gap-1 text-[9px] text-text-muted">
                        <span className="truncate font-mono">
                          {node.ip ?? (server?.spec.ip || node.type)}
                        </span>
                      </div>
                    )}
                  </div>
                </motion.button>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          HOVER TOOLTIPS (screen-space)
          ═══════════════════════════════════════════════════════════ */}

      {hoveredNode && !selectedNode && !selectedLink && (() => {
        const p = finalPositions.get(hoveredNode.id);
        if (!p) return null;
        const s = worldToScreen(p.x, p.y);
        const nearTop = s.y < 120;
        const server = serverByNodeId.get(hoveredNode.id);
        return (
          <div
            className={cn(
              'pointer-events-none absolute z-20 -translate-x-1/2',
              nearTop ? 'translate-y-[25%]' : '-translate-y-[125%]',
            )}
            style={{ left: s.x, top: s.y }}
          >
            <div className="w-56 rounded-xl border border-surface-border bg-black/90 p-3 shadow-2xl backdrop-blur-md">
              <NodeHoverTooltip node={hoveredNode} server={server} />
            </div>
          </div>
        );
      })()}

      {hoveredLink &&
        !hoveredNode &&
        !selectedNode &&
        !selectedLink &&
        (() => {
          const cab = cables.get(hoveredLink.id);
          if (!cab) return null;
          const s = worldToScreen(cab.mx, cab.my);
          const nearTop = s.y < 120;
          const srcNode = nodeById.get(hoveredLink.source);
          const tgtNode = nodeById.get(hoveredLink.target);
          return (
            <div
              className={cn(
                'pointer-events-none absolute z-20 -translate-x-1/2',
                nearTop ? 'translate-y-[25%]' : '-translate-y-[125%]',
              )}
              style={{ left: s.x, top: s.y }}
            >
              <div className="w-60 rounded-xl border border-surface-border bg-black/90 p-3 shadow-2xl backdrop-blur-md">
                <CableHoverTooltip
                  link={hoveredLink}
                  srcNode={srcNode}
                  tgtNode={tgtNode}
                />
              </div>
            </div>
          );
        })()}

      {/* ═══════════════════════════════════════════════════════════
          SELECTED NODE DETAIL PANEL
          ═══════════════════════════════════════════════════════════ */}

      {selectedNode && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-3 right-3 z-30 w-80 rounded-xl border border-surface-border bg-surface-elevated/95 p-4 shadow-2xl backdrop-blur-md"
          >
            <div className="mb-3 flex items-center justify-between border-b border-surface-border pb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Complete Device Details
              </span>
              <button
                onClick={() => setSelectedNode(null)}
                className="rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary cursor-pointer"
                aria-label="Close details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NodeDetailPanel
              node={selectedNode}
              server={serverByNodeId.get(selectedNode.id)}
              nodeById={nodeById}
            />
          </motion.div>
        </AnimatePresence>
      )}

      {/* ═══════════════════════════════════════════════════════════
          SELECTED CONNECTION DETAIL PANEL
          ═══════════════════════════════════════════════════════════ */}

      {selectedLink && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-3 right-3 z-30 w-80 rounded-xl border border-surface-border bg-surface-elevated/95 p-4 shadow-2xl backdrop-blur-md"
          >
            <div className="mb-3 flex items-center justify-between border-b border-surface-border pb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Connection Details
              </span>
              <button
                onClick={() => setSelectedLink(null)}
                className="rounded-lg p-1 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary cursor-pointer"
                aria-label="Close details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <CableDetailPanel
              link={selectedLink}
              srcNode={nodeById.get(selectedLink.source)}
              tgtNode={nodeById.get(selectedLink.target)}
            />
          </motion.div>
        </AnimatePresence>
      )}

      {/* ═══════════════════════════════════════════════════════════
          ZOOM CONTROLS (bottom-left)
          ═══════════════════════════════════════════════════════════ */}

      {showControls && nodes.length > 0 && (
        <div className="absolute bottom-3 left-3 z-30 flex flex-col gap-1">
          <button
            onClick={zoomIn}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border bg-surface-elevated/90 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary cursor-pointer"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={zoomOut}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border bg-surface-elevated/90 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary cursor-pointer"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={fitToView}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border bg-surface-elevated/90 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary cursor-pointer"
            aria-label="Fit to view"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          LOADING / ERROR / EMPTY STATES
          ═══════════════════════════════════════════════════════════ */}

      {isLoading && nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <span className="text-xs text-text-muted">Loading topology…</span>
        </div>
      )}

      {!isLoading && error && nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center z-10">
          <WifiOff className="h-8 w-8 text-warn/60" />
          <div className="text-sm font-semibold text-text-secondary">
            Unable to load topology
          </div>
          <p className="max-w-xs text-xs text-text-muted">
            The backend service is unreachable. Check status and retry.
          </p>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="flex items-center gap-1.5 rounded-xl border border-surface-border px-3.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-accent/40 hover:text-accent cursor-pointer"
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')}
              />{' '}
              Retry
            </button>
          )}
        </div>
      )}

      {!isLoading && !error && nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <span className="text-xs text-text-muted">
            No topology nodes discovered
          </span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          LEGEND (bottom-center)
          ═══════════════════════════════════════════════════════════ */}

      {showLegend && nodes.length > 0 && (
        <div className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-t-xl border border-b-0 border-surface-border bg-black/40 px-4 py-2.5">
            <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Online
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <span className="h-2 w-2 rounded-full bg-warn" />
              Warning / Degraded
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <span className="h-2 w-2 rounded-full bg-crit" />
              Offline / Unreachable
            </span>
            {showStatusBar && (
              <span className="ml-auto font-mono text-[11px] text-text-muted">
                {totalTx.toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })}{' '}
                Mb/s aggregate throughput
              </span>
            )}
          </div>
        </div>
      )}

      {/* Status badge when no legend but showStatusBar */}
      {showStatusBar && nodes.length > 0 && !showLegend && (
        <div className="absolute bottom-3 right-3 z-20">
          <div className="rounded-lg border border-surface-border/60 bg-black/40 px-3 py-1.5 font-mono text-[11px] text-text-muted backdrop-blur-md">
            {totalTx.toLocaleString(undefined, { maximumFractionDigits: 1 })} Mb/s
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════

// ─── Moving Light Packets ──────────────────────────────────────────

function MovingLightPackets({
  links,
  cables,
}: {
  links: NetworkLink[];
  cables: Map<string, CableLayout>;
}) {
  return (
    <g className="pointer-events-none">
      {links.map((link, idx) => {
        const cab = cables.get(link.id);
        if (!cab) return null;
        const st = normalizeStatus(link.status);
        if (st === 'critical') return null;

        const isWarning = st === 'warning';
        const colorIn = isWarning ? '#F59E0B' : '#00F0FF';
        const colorOut = isWarning ? '#F59E0B' : '#3B82F6';

        const dur1 = `${(0.45 + ((idx * 0.11) % 0.35)).toFixed(2)}s`;
        const dur2 = `${(0.55 + ((idx * 0.13) % 0.35)).toFixed(2)}s`;
        const begin1 = `${((idx * 0.17) % 0.6).toFixed(2)}s`;
        const begin2 = `${(((idx * 0.23) + 0.3) % 0.7).toFixed(2)}s`;

        return (
          <g key={`flow-${link.id}`}>
            <g>
              <circle r={2.5} fill={colorIn}>
                <animateMotion
                  path={cab.dIn}
                  begin={begin1}
                  dur={dur1}
                  repeatCount="indefinite"
                  calcMode="linear"
                />
              </circle>
              <circle r={5.5} fill={colorIn} opacity={0.35}>
                <animateMotion
                  path={cab.dIn}
                  begin={begin1}
                  dur={dur1}
                  repeatCount="indefinite"
                  calcMode="linear"
                />
              </circle>
            </g>

            <g>
              <circle r={2.2} fill={colorOut}>
                <animateMotion
                  path={cab.dIn}
                  begin={begin2}
                  dur={dur2}
                  keyPoints="1;0"
                  keyTimes="0;1"
                  repeatCount="indefinite"
                  calcMode="linear"
                />
              </circle>
              <circle r={5} fill={colorOut} opacity={0.3}>
                <animateMotion
                  path={cab.dIn}
                  begin={begin2}
                  dur={dur2}
                  keyPoints="1;0"
                  keyTimes="0;1"
                  repeatCount="indefinite"
                  calcMode="linear"
                />
              </circle>
            </g>
          </g>
        );
      })}
    </g>
  );
}

// ─── Cable Layer ───────────────────────────────────────────────────

function CableLayer({
  link,
  cable,
  hovered,
  selected,
  onHover,
  onUnhover,
  onClick,
}: {
  link: NetworkLink;
  cable: CableLayout;
  hovered?: boolean;
  selected?: boolean;
  onHover?: () => void;
  onUnhover?: () => void;
  onClick?: () => void;
}) {
  const st = normalizeStatus(link.status);
  const strokeColor = LINK_COLOR[st];
  const isOffLink = st === 'critical';

  const baseWidth = hovered || selected ? 3.5 : 2;
  const baseOpacity = isOffLink ? 0.2 : hovered || selected ? 0.9 : 0.45;

  return (
    <g>
      {(hovered || selected) && (
        <path
          d={cable.dIn}
          fill="none"
          stroke={strokeColor}
          strokeOpacity={0.25}
          strokeWidth={10}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${strokeColor})` }}
        />
      )}

      <path
        d={cable.dIn}
        fill="none"
        stroke={strokeColor}
        strokeOpacity={baseOpacity}
        strokeWidth={baseWidth}
        strokeLinecap="round"
        className={cn('net-base', st === 'healthy' && 'net-cable-pulse')}
      />

      <path
        d={cable.dIn}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        strokeLinecap="round"
        className="cursor-pointer pointer-events-auto"
        onMouseEnter={onHover}
        onMouseLeave={onUnhover}
        onClick={onClick}
      />
    </g>
  );
}

// ─── Tooltips ──────────────────────────────────────────────────────

function NodeHoverTooltip({
  node,
  server,
}: {
  node: NetworkNode;
  server?: ServerRuntime;
}) {
  const statusColor = STATUS_COLOR[node.status] ?? STATUS_COLOR.online;
  const IconComponent = INFRA_ICON_COMPONENTS[node.type];

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2 border-b border-surface-border/60 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0">
            {IconComponent ? (
              <IconComponent size={16} />
            ) : (
              '📦'
            )}
          </span>
          <span className="truncate font-semibold text-text-primary">
            {node.label}
          </span>
        </div>
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{
            backgroundColor: `${statusColor}22`,
            color: statusColor,
          }}
        >
          {STATUS_LABEL[node.status] ?? node.status}
        </span>
      </div>

      <div className="space-y-1 text-[11px] text-text-muted">
        <div className="flex justify-between">
          <span>Role</span>
          <span className="font-medium text-text-secondary capitalize">
            {node.type}
          </span>
        </div>
        <div className="flex justify-between">
          <span>IP Address</span>
          <span className="font-mono text-text-primary">
            {node.ip ?? server?.spec.ip ?? '–'}
          </span>
        </div>
        {server && (
          <>
            <div className="flex justify-between">
              <span>CPU Usage</span>
              <span className="font-mono text-text-primary">
                {Math.round(server.cpu)}%
              </span>
            </div>
            {server.tempC > 0 && (
              <div className="flex justify-between">
                <span>Temperature</span>
                <span className="font-mono text-text-primary">
                  {Math.round(server.tempC)}°C
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CableHoverTooltip({
  link,
  srcNode,
  tgtNode,
}: {
  link: NetworkLink;
  srcNode?: NetworkNode;
  tgtNode?: NetworkNode;
}) {
  const st = normalizeStatus(link.status);
  const color = LINK_COLOR[st];

  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center justify-between gap-2 border-b border-surface-border/60 pb-1.5">
        <span className="truncate font-semibold text-text-primary">
          {srcNode?.label ?? link.source} → {tgtNode?.label ?? link.target}
        </span>
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: `${color}22`, color }}
        >
          {st}
        </span>
      </div>

      <div className="space-y-1 text-[11px] text-text-muted">
        <div className="flex justify-between">
          <span>Throughput</span>
          <span className="font-mono font-semibold text-text-primary">
            {link.throughputMbps != null
              ? formatMbps(link.throughputMbps)
              : 'N/A'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Latency</span>
          <span className="font-mono text-text-primary">
            {link.latencyMs != null
              ? `${link.latencyMs.toFixed(1)} ms`
              : 'N/A'}
          </span>
        </div>
        {link.jitterMs != null && link.jitterMs > 0 && (
          <div className="flex justify-between">
            <span>Jitter</span>
            <span className="font-mono text-text-primary">
              {link.jitterMs.toFixed(1)} ms
            </span>
          </div>
        )}
        {link.packetLoss != null && link.packetLoss > 0 && (
          <div className="flex justify-between">
            <span>Packet Loss</span>
            <span className="font-mono text-text-primary">
              {(link.packetLoss * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detail Panels ─────────────────────────────────────────────────

function NodeDetailPanel({
  node,
  server,
  nodeById,
}: {
  node: NetworkNode;
  server?: ServerRuntime;
  nodeById: Map<string, NetworkNode>;
}) {
  const statusColor = STATUS_COLOR[node.status] ?? STATUS_COLOR.online;
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
          {STATUS_LABEL[node.status] ?? node.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-surface-border/70 bg-surface-input/50 p-2.5 text-[11px]">
        <div>
          <span className="text-text-muted">Parent Host</span>
          <div className="mt-0.5 font-medium text-text-primary truncate">
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
            <div className="max-h-28 overflow-y-auto space-y-1 pr-1 text-[11px]">
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
  icon: React.ReactNode;
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
        <span className="font-mono font-semibold text-text-primary">{unit}</span>
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

function CableDetailPanel({
  link,
  srcNode,
  tgtNode,
}: {
  link: NetworkLink;
  srcNode?: NetworkNode;
  tgtNode?: NetworkNode;
}) {
  const st = normalizeStatus(link.status);
  const color = LINK_COLOR[st];

  return (
    <div className="space-y-3 text-xs">
      <div className="rounded-xl border border-surface-border/70 bg-surface-input/50 p-2.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Endpoints
        </div>
        <div className="mt-2 flex items-center justify-between font-semibold text-text-primary">
          <span>{srcNode?.label ?? link.source}</span>
          <span className="text-text-muted">→</span>
          <span>{tgtNode?.label ?? link.target}</span>
        </div>
      </div>

      <dl className="space-y-2 text-[11px]">
        <div className="flex items-center justify-between border-b border-surface-border/50 pb-1.5">
          <span className="text-text-muted">Connection Status</span>
          <span
            className="font-bold uppercase tracking-wider"
            style={{ color }}
          >
            {st}
          </span>
        </div>
        <div className="flex items-center justify-between border-b border-surface-border/50 pb-1.5">
          <span className="text-text-muted">Throughput</span>
          <span className="font-mono font-bold text-text-primary">
            {link.throughputMbps != null
              ? formatMbps(link.throughputMbps)
              : 'N/A'}
          </span>
        </div>
        <div className="flex items-center justify-between border-b border-surface-border/50 pb-1.5">
          <span className="text-text-muted">Latency</span>
          <span className="font-mono text-text-primary">
            {link.latencyMs != null
              ? `${link.latencyMs.toFixed(1)} ms`
              : 'N/A'}
          </span>
        </div>
        <div className="flex items-center justify-between border-b border-surface-border/50 pb-1.5">
          <span className="text-text-muted">Jitter</span>
          <span className="font-mono text-text-primary">
            {link.jitterMs != null ? `${link.jitterMs.toFixed(1)} ms` : 'N/A'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-text-muted">Packet Loss</span>
          <span className="font-mono text-text-primary">
            {link.packetLoss != null
              ? `${(link.packetLoss * 100).toFixed(1)}%`
              : 'N/A'}
          </span>
        </div>
      </dl>
    </div>
  );
}
