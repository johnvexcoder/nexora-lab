import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  WifiOff, X,
  Plus, Minus, Maximize2, RefreshCw,
} from 'lucide-react';
import { INFRA_ICON_COMPONENTS } from '@/lib/icons';
import { networkNodeKind } from '@/lib/infrastructure';
import type { NetworkNode, NetworkLink, ServerRuntime } from '@/types';
import { cn, clamp, formatMbps } from '@/lib/utils';
import {
  computeTopologyLayout,
  topologyStructureKey,
  type TopologyLayout,
  type CableLayout,
} from '@/lib/topologyLayout';
import {
  TopologyNode,
  HostNode,
  HypervisorNode,
  VmNode,
  ContainerNode,
  StorageNode,
  ServiceNode,
  getStatusMeta,
  type TopologyNodeProps,
} from '@/components/topology/nodes';
import { getEffectiveStatus, isStale } from '@/components/topology/nodes/status';
import {
  NodeInspector,
  type NodeInspectorAnchor,
} from '@/components/topology/NodeInspector';
import type { InfraMetrics } from '@/lib/infrastructure';
import { useTopologyStore, selectSelectedNodeId, selectFocusedNodeId, selectNode, selectFocusNode } from '@/store/topology';
import { useShallow } from 'zustand/react/shallow';
import { useAlertsByNode } from '@/hooks/useAlertsByNode';

// ── Constants ──────────────────────────────────────────────────────

const ZOOM_WORKSPACE = { min: 0.15, max: 4 };
const ZOOM_CARD = { min: 0.3, max: 1.5 };
const ZOOM_STEP = 1.2;

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
        setSize((previous) => previous.width === entry.width && previous.height === entry.height
          ? previous : { width: entry.width, height: entry.height });
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
  const prefersReducedMotion = useReducedMotion();
  const zoomLimits = variant === 'workspace' ? ZOOM_WORKSPACE : ZOOM_CARD;

  // ── Layout computation ────────────────────────────────────────
  // The layout depends only on the topology *structure* (node ids, types,
  // parents and link connectivity), never on telemetry values. Telemetry
  // updates therefore reuse the previous computed positions — nodes cannot
  // jump from a metric refresh. Previous positions also anchor existing nodes
  // when a structural change (node added/removed) does force recomputation.

  const boardWidth = containerSize.width || 1000;
  const boardHeight = containerSize.height || 500;

  const structureKey = useMemo(
    () => topologyStructureKey(nodes, links),
    [nodes, links],
  );

  const prevLayoutRef = useRef<TopologyLayout | null>(null);
  const prevBoardRef = useRef({ boardWidth, boardHeight });

  // Always-current snapshot for use inside the memo (satisfies exhaustive-deps
  // while keeping the memo keyed on structure only).
  const layoutInputRef = useRef({ boardWidth, boardHeight });
  layoutInputRef.current = { boardWidth, boardHeight };

  const layout: TopologyLayout = useMemo(() => {
    const { boardWidth: bw, boardHeight: bh } = layoutInputRef.current;
    const boardUnchanged =
      prevBoardRef.current.boardWidth === bw && prevBoardRef.current.boardHeight === bh;
    const next = computeTopologyLayout(
      nodes,
      links,
      bw,
      bh,
      // Anchor existing nodes to their prior position on structural changes
      // (e.g. a container appears/disappears) so unrelated nodes never jump.
      // On a resize the layout reflows freely to the new container.
      boardUnchanged ? prevLayoutRef.current?.nodes : undefined,
    );
    prevLayoutRef.current = next;
    prevBoardRef.current = { boardWidth: bw, boardHeight: bh };
    return next;
    // Re-compute only when structure or container size changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey, boardWidth, boardHeight]);

  const { width: layoutW, height: layoutH, nodes: finalPositions, cables } = layout;

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const serverByNodeId = useMemo(() => {
    const m = new Map<string, ServerRuntime>();
    const byId = new Map(servers.map((server) => [server.spec.id, server]));
    const byHostname = new Map(servers.map((server) => [server.spec.hostname, server]));
    const byIp = new Map(servers.filter((server) => server.spec.ip).map((server) => [server.spec.ip, server]));
    for (const n of nodes) {
      const match = byId.get(n.id) ?? byHostname.get(n.label) ?? (n.ip ? byIp.get(n.ip) : undefined);
      if (match) m.set(n.id, match);
    }
    return m;
  }, [nodes, servers]);

  // ── Alert counts per server ───────────────────────────────────
  const alertsByServer = useAlertsByNode();

  // Map alert counts to node IDs (containers inherit from parent server)
  const alertCountsByNodeId = useMemo(() => {
    const map = new Map<string, { critical: number; warning: number; info: number; success: number; total: number; unread: number }>();
    for (const n of nodes) {
      const server = serverByNodeId.get(n.id);
      const serverId = server?.spec.id ?? n.id;
      const counts = alertsByServer[serverId];
      if (counts && (counts.total > 0)) {
        map.set(n.id, counts);
      } else if (n.parentId) {
        // Containers and child nodes inherit parent's alerts
        const parentCounts = map.get(n.parentId) ?? alertsByServer[n.parentId];
        if (parentCounts && parentCounts.total > 0) {
          map.set(n.id, parentCounts);
        }
      }
    }
    return map;
  }, [nodes, serverByNodeId, alertsByServer]);

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

  // Auto-fit when topology structure changes (not on resize or telemetry updates)
  const dataKey = structureKey;
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
  const [hoveredLink, setHoveredLink] = useState<NetworkLink | null>(null);
  const [selectedLink, setSelectedLink] = useState<NetworkLink | null>(null);

  const selectedNodeId = useTopologyStore(useShallow(selectSelectedNodeId));
  const focusedNodeId = useTopologyStore(useShallow(selectFocusedNodeId));
  const storeSelectNode = useTopologyStore(useShallow(selectNode));
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  // ── Focus node (pan/zoom to center) ───────────────────────────────
  const prevFocusedNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (focusedNodeId && focusedNodeId !== prevFocusedNodeIdRef.current) {
      prevFocusedNodeIdRef.current = focusedNodeId;
      const node = nodes.find((n) => n.id === focusedNodeId);
      if (node && finalPositions.has(node.id)) {
        const p = finalPositions.get(node.id)!;
        // Select the node in the store
        storeSelectNode(focusedNodeId);
        // Pan to center the node with a comfortable zoom level
        const targetZoom = Math.min(Math.max(zoomLimits.min, 1.0), zoomLimits.max);
        const c = clampPan(p.x, p.y, targetZoom);
        setZoom(targetZoom);
        setPanX(c.x);
        setPanY(c.y);
      }
    } else if (!focusedNodeId) {
      prevFocusedNodeIdRef.current = null;
    }
  }, [focusedNodeId, nodes, finalPositions, zoomLimits.min, zoomLimits.max, clampPan, storeSelectNode]);

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
                    storeSelectNode(null);
                  }}
                />
              );
            })}

            {!prefersReducedMotion && <MovingLightPackets links={links} cables={cables} />}
          </svg>

          {/* ── HTML Layer (Device Cards) ──────────────────── */}
          {nodes.map((node) => {
            const p = finalPositions.get(node.id);
            if (!p) return null;

            const isHovered = hoveredNode?.id === node.id;
            const isSelected = selectedNode?.id === node.id;
            const server = serverByNodeId.get(node.id);
            const IconComponent = INFRA_ICON_COMPONENTS[node.type];
            const kind = networkNodeKind(node.type);
            const compact = !layout.metrics.showIpOnNode;

            const baseProps = {
              id: node.id,
              name: node.label,
              status: node.status,
              ip: node.ip,
              metrics: {
                cpuPercent: node.cpuPercent ?? server?.cpu ?? null,
                ramUsedGb: server?.ramUsedGb ?? null,
                ramTotalGb: server?.spec.ramTotalGb ?? null,
                diskUsedGb: server?.diskUsedGb ?? null,
                diskTotalGb: server?.spec.diskTotalGb ?? null,
                tempC: node.tempC ?? server?.tempC ?? null,
                load: server?.load ?? null,
                uptimeSeconds: server?.uptimeSeconds ?? null,
                netUpMbps: server?.netUpMbps ?? null,
                netDownMbps: server?.netDownMbps ?? null,
                lastSeen: server?.lastSeen ?? node.lastSeen ?? null,
              },
              layout: layout.metrics,
              compact,
              icon: IconComponent ? (
                <IconComponent size={layout.metrics.iconSize} />
              ) : undefined,
              selected: isSelected,
              hovered: isHovered,
              alertCounts: alertCountsByNodeId.get(node.id),
              onSelect: () => {
                storeSelectNode(node.id);
                setSelectedLink(null);
              },
              onHoverStart: () => setHoveredNode(node),
              onHoverEnd: () =>
                setHoveredNode((h) => (h?.id === node.id ? null : h)),
            } satisfies Omit<TopologyNodeProps, 'kind'>;

            let nodeElement: React.ReactNode;
            switch (kind) {
              case 'host':
                nodeElement = <HostNode {...baseProps} />;
                break;
              case 'hypervisor':
                nodeElement = <HypervisorNode {...baseProps} />;
                break;
              case 'vm':
                nodeElement = <VmNode {...baseProps} />;
                break;
              case 'container':
                nodeElement = <ContainerNode {...baseProps} />;
                break;
              case 'storage':
                nodeElement = <StorageNode {...baseProps} />;
                break;
              case 'service':
                nodeElement = <ServiceNode {...baseProps} />;
                break;
              default:
                // Boundary nodes (internet) and any unmapped types
                nodeElement = <TopologyNode {...baseProps} kind="host" />;
                break;
            }

            return (
              <div
                key={node.id}
                className="absolute"
                style={{
                  left: p.x,
                  top: p.y,
                  transform: 'translate(-50%, -50%)',
                  transition: 'left 350ms ease, top 350ms ease, opacity 250ms ease',
                }}
              >
                {nodeElement}
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
          SELECTED NODE INSPECTOR (contextual details)
          Desktop: compact panel beside the node · Mobile: bottom sheet
          ═══════════════════════════════════════════════════════════ */}

      <AnimatePresence>
        {selectedNode &&
          !selectedLink &&
          (() => {
            const p = finalPositions.get(selectedNode.id);
            const rect = containerRef.current?.getBoundingClientRect();
            if (!p || !rect) return null;
            const s = worldToScreen(p.x, p.y);
            const anchor: NodeInspectorAnchor = {
              x: rect.left + s.x,
              y: rect.top + s.y,
              canvasLeft: rect.left,
              canvasTop: rect.top,
              canvasRight: rect.right,
              canvasBottom: rect.bottom,
            };
            return (
              <NodeInspector
                key={selectedNode.id}
                node={selectedNode}
                server={serverByNodeId.get(selectedNode.id)}
                nodeById={nodeById}
                anchor={anchor}
                onClose={() => storeSelectNode(null)}
              />
            );
          })()}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════
          SELECTED CONNECTION DETAIL PANEL
          ═══════════════════════════════════════════════════════════ */}

      {selectedLink && (
        <AnimatePresence>
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            className="absolute bottom-3 right-3 z-30 w-80 rounded-xl border border-surface-border bg-surface-elevated/95 p-4 shadow-2xl backdrop-blur-md"
          >
            <div className="mb-3 flex items-center justify-between border-b border-surface-border pb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Connection Details
              </span>
              <button
                type="button"
                onClick={() => setSelectedLink(null)}
                className="min-h-9 min-w-9 rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
            type="button"
            onClick={zoomIn}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-surface-border bg-surface-elevated/90 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={zoomOut}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-surface-border bg-surface-elevated/90 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={fitToView}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-surface-border bg-surface-elevated/90 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
            <span className="flex items-center gap-1.5 text-[11px] text-text-muted animate-pulse">
              <span className="h-2 w-2 rounded-full border-2 border-dashed border-slate-500 bg-transparent" />
              Stale / Awaiting data
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
        role="button"
        tabIndex={0}
        aria-label={`Connection from ${link.source} to ${link.target}, ${st}`}
        aria-pressed={selected}
        onMouseEnter={onHover}
        onMouseLeave={onUnhover}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick?.();
          }
        }}
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
  const metrics: InfraMetrics | undefined = server
    ? {
        cpuPercent: server.cpu ?? null,
        ramUsedGb: server.ramUsedGb ?? null,
        ramTotalGb: server.spec.ramTotalGb ?? null,
        diskUsedGb: server.diskUsedGb ?? null,
        diskTotalGb: server.spec.diskTotalGb ?? null,
        tempC: server.tempC ?? null,
        load: server.load ?? null,
        uptimeSeconds: server.uptimeSeconds ?? null,
        netUpMbps: server.netUpMbps ?? null,
        netDownMbps: server.netDownMbps ?? null,
        lastSeen: server.lastSeen ?? node.lastSeen ?? null,
      }
    : { lastSeen: node.lastSeen ?? null };

  const effectiveStatus = getEffectiveStatus(node.status, metrics);
  const stale = isStale(metrics);
  const statusColor = getStatusMeta(effectiveStatus).color;
  const statusLabel = getStatusMeta(effectiveStatus).label;
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
          className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            stale && 'animate-pulse',
          )}
          style={{
            backgroundColor: `${statusColor}22`,
            color: statusColor,
          }}
        >
          {statusLabel}
          {stale && <span className="ml-1 text-[8px]" aria-label="Stale data">⏱</span>}
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
            {stale && (
              <div className="flex justify-between text-warn">
                <span>Data Freshness</span>
                <span className="font-mono">{'Stale (>30s)'}</span>
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

// ─── Cable Detail Panels ───────────────────────────────────────────

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
