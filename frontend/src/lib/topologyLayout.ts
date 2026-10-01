/**
 * Hierarchical layout for the network topology map.
 *
 * Fully dynamic: Works for arbitrary live setups (Proxmox, Standalone Agents, Docker, Mixed)
 * - Tree-Aware Clustering: Children naturally cluster vertically near their parent
 * - Fixed lanes and rows keep cards from overlapping
 * - Safe Boundary Insets: Prevents any node from exceeding the left, right, top, or bottom edges
 * - Continuous Bezier Curves: Connects 100% of links with smooth non-inverting curves
 * - Deterministic Stability: Telemetry-only updates do not move nodes
 */

import type { NetworkLink, NetworkNode } from '@/types';

export type PresentationMode = 'full' | 'compact' | 'minimal';

export interface LayoutMetrics {
  nodeWidth: number;
  nodeHeight: number;
  iconSize: number;
  fontSize: number;
  isVertical: boolean;
  mode: PresentationMode;
  showIpOnNode: boolean;
}

export interface LayoutedNode {
  id: string;
  x: number;
  y: number;
  depth: number;
}

export interface CableLayout {
  dIn: string;
  dOut: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number;
}

export interface TopologyLayout {
  width: number;
  height: number;
  metrics: LayoutMetrics;
  nodes: Map<string, LayoutedNode>;
  cables: Map<string, CableLayout>;
}

/**
 * Produce a stable structural key from topology data.
 * Only node identity (id, type, parentId) and link connectivity (source, target)
 * are included — telemetry values (cpu, status, temp, etc.) are excluded so
 * position-preserving memoisation can skip recomputation on metric updates.
 */
export function topologyStructureKey(
  nodes: NetworkNode[],
  links: NetworkLink[],
): string {
  const nk = nodes
    .map((n) => `${n.id}:${n.type}:${n.parentId ?? ''}`)
    .sort()
    .join(',');
  const lk = links
    .map((l) => `${l.source}:${l.target}`)
    .sort()
    .join(',');
  return `${nk}|${lk}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Standard depth levels based on device role/type */
function getDefaultDepth(type: NetworkNode['type']): number {
  switch (type) {
    case 'internet': return 0;
    case 'gateway': return 1;
    case 'switch': return 1;
    case 'hypervisor':
    case 'physical': return 2;
    case 'vm':
    case 'lxc':
    case 'docker':
    case 'storage':
    case 'nas':
    case 'firewall': return 3;
    case 'container':
    case 'podman':
    case 'kubernetes': default: return 4;
  }
}

export function getPresentationMode(w: number, h: number): {
  mode: PresentationMode;
  nodeWidth: number;
  nodeHeight: number;
  iconSize: number;
  fontSize: number;
  showIpOnNode: boolean;
  isVertical: boolean;
} {
  const isVertical = w < 680;

  if (w < 680) {
    return {
      mode: 'minimal',
      nodeWidth: 96,
      nodeHeight: 38,
      iconSize: 16,
      fontSize: 10,
      showIpOnNode: false,
      isVertical: true,
    };
  }

  if (w < 1100) {
    return {
      mode: 'compact',
      nodeWidth: 120,
      nodeHeight: 44,
      iconSize: 18,
      fontSize: 10,
      showIpOnNode: true,
      isVertical: false,
    };
  }

  return {
    mode: 'full',
    nodeWidth: 134,
    nodeHeight: 48,
    iconSize: 20,
    fontSize: 11,
    showIpOnNode: true,
    isVertical: false,
  };
}

export function computeTopologyLayout(
  nodes: NetworkNode[],
  links: NetworkLink[],
  containerWidth: number = 1000,
  containerHeight: number = 540,
): TopologyLayout {
  const w = Math.max(320, containerWidth);
  const h = Math.max(460, containerHeight);

  const { mode, nodeWidth, nodeHeight, iconSize, fontSize, showIpOnNode, isVertical } = getPresentationMode(w, h);

  if (nodes.length === 0) {
    return {
      width: w,
      height: h,
      metrics: { nodeWidth, nodeHeight, iconSize, fontSize, isVertical, mode, showIpOnNode },
      nodes: new Map(),
      cables: new Map(),
    };
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const positions = new Map<string, LayoutedNode>();
  let computedWidth = w;
  let computedHeight = h;

  // 1. Build parent-child relationships (deterministic order)
  const parentMap = new Map<string, string>();
  const childrenMap = new Map<string, string[]>();

  for (const n of nodes) {
    if (n.parentId && nodeMap.has(n.parentId) && n.parentId !== n.id) {
      parentMap.set(n.id, n.parentId);
      if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []);
      childrenMap.get(n.parentId)!.push(n.id);
    }
  }

  // Deterministic child order within each parent
  for (const kids of childrenMap.values()) {
    kids.sort();
  }

  // Infer missing parent links from topology connections
  for (const link of links) {
    if (!nodeMap.has(link.source) || !nodeMap.has(link.target)) continue;
    const src = nodeMap.get(link.source)!;
    const tgt = nodeMap.get(link.target)!;
    const srcDepth = getDefaultDepth(src.type);
    const tgtDepth = getDefaultDepth(tgt.type);

    if (srcDepth < tgtDepth && !parentMap.has(tgt.id)) {
      parentMap.set(tgt.id, src.id);
      if (!childrenMap.has(src.id)) childrenMap.set(src.id, []);
      if (!childrenMap.get(src.id)!.includes(tgt.id)) {
        childrenMap.get(src.id)!.push(tgt.id);
      }
    }
  }

  // 2. Compute depths
  const depths = new Map<string, number>();
  const visiting = new Set<string>();

  const getDepth = (node: NetworkNode): number => {
    if (depths.has(node.id)) return depths.get(node.id)!;
    if (visiting.has(node.id)) return getDefaultDepth(node.type);
    visiting.add(node.id);

    let d = getDefaultDepth(node.type);
    const pId = parentMap.get(node.id);
    if (pId && nodeMap.has(pId)) {
      d = Math.max(d, getDepth(nodeMap.get(pId)!) + 1);
    }
    visiting.delete(node.id);
    depths.set(node.id, d);
    return d;
  };

  for (const n of nodes) getDepth(n);

  // Group nodes by depth level (deterministic order)
  const levels = new Map<number, NetworkNode[]>();
  for (const n of nodes) {
    const d = depths.get(n.id) ?? getDefaultDepth(n.type);
    if (!levels.has(d)) levels.set(d, []);
    levels.get(d)!.push(n);
  }

  // Sort each level by parentId then id for deterministic layout
  for (const nodesInLevel of levels.values()) {
    nodesInLevel.sort((a, b) => {
      const pa = parentMap.get(a.id) ?? '';
      const pb = parentMap.get(b.id) ?? '';
      if (pa !== pb) return pa.localeCompare(pb);
      return a.id.localeCompare(b.id);
    });
  }

  const sortedDepths = [...levels.keys()].sort((a, b) => a - b);

  if (!isVertical) {
    // ══════════════════════════════════════════════════════════════════════
    // DESKTOP & LAPTOP HORIZONTAL LAYOUT (No Overlaps, Zero Clipping)
    // ══════════════════════════════════════════════════════════════════════
    const padX = clamp(w * 0.05, 45, 75);
    const padY = 32;
    const minY = padY + nodeHeight / 2;
    const maxY = h - padY - nodeHeight / 2;

    const rowGap = 12;
    const laneGap = 18;
    const maxRows = Math.max(1, Math.floor((maxY - minY + rowGap) / (nodeHeight + rowGap)));
    const laneCountByDepth = new Map<number, number>();
    for (const depth of sortedDepths) {
      laneCountByDepth.set(depth, Math.max(1, Math.ceil((levels.get(depth)?.length ?? 0) / maxRows)));
    }
    const totalLanes = [...laneCountByDepth.values()].reduce((sum, count) => sum + count, 0);
    const requiredWidth = padX * 2 + totalLanes * nodeWidth + Math.max(0, totalLanes - 1) * laneGap;
    const desktopWidth = Math.max(w, requiredWidth);
    computedWidth = desktopWidth;
    const usableW = desktopWidth - padX * 2 - nodeWidth;
    const laneStep = totalLanes > 1 ? usableW / (totalLanes - 1) : 0;
    let laneIndex = 0;

    // Each hierarchy depth gets as many compact lanes as it needs. A lane
    // never receives more nodes than can fit vertically, so cards cannot
    // collapse onto the same bottom coordinate or escape the world bounds.
    for (const depth of sortedDepths) {
      const depthNodes = levels.get(depth) ?? [];
      const laneCount = laneCountByDepth.get(depth) ?? 1;
      for (let localLane = 0; localLane < laneCount; localLane += 1) {
        const laneNodes = depthNodes.slice(localLane * maxRows, (localLane + 1) * maxRows);
        const x = round1(padX + nodeWidth / 2 + laneIndex * laneStep);
        const span = Math.max(0, laneNodes.length - 1) * (nodeHeight + rowGap);
        const parentCenters = laneNodes
          .map((node) => parentMap.get(node.id))
          .map((parentId) => parentId ? positions.get(parentId)?.y : undefined)
          .filter((value): value is number => value !== undefined);
        const preferredCenter = parentCenters.length
          ? parentCenters.reduce((sum, value) => sum + value, 0) / parentCenters.length
          : h / 2;
        const startY = clamp(preferredCenter - span / 2, minY, maxY - span);

        laneNodes.forEach((node, rowIndex) => {
          positions.set(node.id, {
            id: node.id,
            x,
            y: round1(startY + rowIndex * (nodeHeight + rowGap)),
            depth,
          });
        });
        laneIndex += 1;
      }
    }

  } else {
    // ══════════════════════════════════════════════════════════════════════
    // SMARTPHONE VERTICAL LAYOUT (Responsive Top-to-Bottom Flow)
    // ══════════════════════════════════════════════════════════════════════
    const padY = 28;
    const padX = 18;
    const columnGap = 10;
    const rowGap = 16;
    const levelGap = 28;
    const columns = Math.max(1, Math.floor((w - 2 * padX + columnGap) / (nodeWidth + columnGap)));
    const totalRows = sortedDepths.reduce((sum, depth) => sum + Math.ceil((levels.get(depth)?.length ?? 0) / columns), 0);
    computedHeight = Math.max(h, 2 * padY + totalRows * nodeHeight + Math.max(0, totalRows - sortedDepths.length) * rowGap + Math.max(0, sortedDepths.length - 1) * levelGap);
    let nextY = padY + nodeHeight / 2;

    for (const depth of sortedDepths) {
      const levelNodes = levels.get(depth) ?? [];
      for (let offset = 0; offset < levelNodes.length; offset += columns) {
        const rowNodes = levelNodes.slice(offset, offset + columns);
        const rowWidth = rowNodes.length * nodeWidth + (rowNodes.length - 1) * columnGap;
        const startX = (w - rowWidth) / 2 + nodeWidth / 2;
        rowNodes.forEach((node, column) => {
          positions.set(node.id, { id: node.id, x: round1(startX + column * (nodeWidth + columnGap)), y: round1(nextY), depth });
        });
        nextY += nodeHeight + rowGap;
      }
      nextY += levelGap - rowGap;
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // SMOOTH BEZIER CABLE GENERATOR (100% Connected Links)
  // ══════════════════════════════════════════════════════════════════════
  const cables = new Map<string, CableLayout>();

  for (const link of links) {
    const a = positions.get(link.source);
    const b = positions.get(link.target);
    if (!a || !b) continue;

    let dIn = '';

    if (!isVertical) {
      // Horizontal mode
      const dx = Math.abs(b.x - a.x);
      if (dx > 15) {
        const dir = b.x > a.x ? 1 : -1;
        const hx = clamp(dx * 0.48, 18, 90);
        dIn = `M ${a.x} ${a.y} C ${round1(a.x + dir * hx)} ${a.y}, ${round1(b.x - dir * hx)} ${b.y}, ${b.x} ${b.y}`;
      } else {
        const dy = b.y - a.y;
        dIn = `M ${a.x} ${a.y} C ${round1(a.x + 30)} ${round1(a.y + dy * 0.3)}, ${round1(b.x + 30)} ${round1(b.y - dy * 0.3)}, ${b.x} ${b.y}`;
      }
    } else {
      // Vertical mode
      const dy = Math.abs(b.y - a.y);
      if (dy > 15) {
        const dir = b.y > a.y ? 1 : -1;
        const hy = clamp(dy * 0.48, 15, 60);
        dIn = `M ${a.x} ${a.y} C ${a.x} ${round1(a.y + dir * hy)}, ${b.x} ${round1(b.y - dir * hy)}, ${b.x} ${b.y}`;
      } else {
        const dx = b.x - a.x;
        dIn = `M ${a.x} ${a.y} C ${round1(a.x + dx * 0.3)} ${round1(a.y + 22)}, ${round1(b.x - dx * 0.3)} ${round1(b.y + 22)}, ${b.x} ${b.y}`;
      }
    }

    const mx = round1((a.x + b.x) / 2);
    const my = round1((a.y + b.y) / 2);

    cables.set(link.id, {
      dIn,
      dOut: dIn,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      mx,
      my,
    });
  }

  return {
    width: computedWidth,
    height: computedHeight,
    metrics: { nodeWidth, nodeHeight, iconSize, fontSize, isVertical, mode, showIpOnNode },
    nodes: positions,
    cables,
  };
}
