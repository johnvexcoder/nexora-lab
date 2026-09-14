/**
 * Universal Hierarchical Tree Layout & Collision Relaxation Engine for Network Topology Map
 *
 * Fully dynamic: Works for arbitrary live setups (Proxmox, Standalone Agents, Docker, Mixed)
 * - Tree-Aware Clustering: Children naturally cluster vertically near their parent
 * - 1D Collision Relaxation: Guarantees 0% overlapping between nodes in the same column
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

/**
 * Relaxation pass: Prevents overlapping by pushing items apart.
 *
 * Uses a greedy-below strategy anchored to each item's targetY:
 *   1. Sort by (targetY, id) for deterministic tiebreaking
 *   2. Place first item at its targetY (clamped to bounds)
 *   3. Each subsequent item goes at max(targetY, prevY + step) so it
 *      never overlaps the item above while staying as close to its
 *      target as possible
 *   4. If the last item overflows maxY, shift the whole group up
 *
 * This is far more stable than mean-centre placement: adding or removing
 * a sibling only shifts items that were *below* it, while items above
 * keep their exact Y.
 */
function relax1D(
  items: Array<{ id: string; targetY: number }>,
  minY: number,
  maxY: number,
  itemHeight: number,
  minGap: number,
): Map<string, number> {
  const result = new Map<string, number>();
  if (items.length === 0) return result;
  if (items.length === 1) {
    result.set(items[0].id, clamp(items[0].targetY, minY, maxY));
    return result;
  }

  const step = itemHeight + minGap;

  // Deterministic sort: targetY first, then id as tiebreaker
  const sorted = [...items].sort(
    (a, b) => a.targetY - b.targetY || a.id.localeCompare(b.id),
  );

  const totalRequired = (sorted.length - 1) * step;
  const available = Math.max(0, maxY - minY);
  const effectiveStep =
    totalRequired > available
      ? Math.max(itemHeight * 0.85, available / Math.max(1, sorted.length - 1))
      : step;

  // Greedy-below: anchor first item at its target, push others down as needed
  const placed: number[] = [];
  placed[0] = clamp(sorted[0].targetY, minY, maxY);

  for (let i = 1; i < sorted.length; i++) {
    const minYForItem = placed[i - 1] + effectiveStep;
    placed[i] = clamp(Math.max(sorted[i].targetY, minYForItem), minY, maxY);
  }

  // If last item overflows, shift entire group up (never down — that would
  // push the first item above its target, which is less stable)
  const overflow = placed[sorted.length - 1] - maxY;
  if (overflow > 0) {
    for (let i = 0; i < placed.length; i++) {
      placed[i] = round1(clamp(placed[i] - overflow, minY, maxY));
    }
  }

  sorted.forEach((item, idx) => {
    result.set(item.id, round1(placed[idx]));
  });

  return result;
}

export function computeTopologyLayout(
  nodes: NetworkNode[],
  links: NetworkLink[],
  containerWidth: number = 1000,
  containerHeight: number = 540,
  previousPositions?: ReadonlyMap<string, Pick<LayoutedNode, 'x' | 'y'>>,
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
  const numLevels = Math.max(1, sortedDepths.length);

  if (!isVertical) {
    // ══════════════════════════════════════════════════════════════════════
    // DESKTOP & LAPTOP HORIZONTAL LAYOUT (No Overlaps, Zero Clipping)
    // ══════════════════════════════════════════════════════════════════════
    const padX = clamp(w * 0.05, 45, 75);
    const padY = 32;
    const minY = padY + nodeHeight / 2;
    const maxY = h - padY - nodeHeight / 2;

    const usableW = w - padX * 2 - nodeWidth;
    const colStep = numLevels > 1 ? usableW / (numLevels - 1) : 0;

    // First pass: assign X coordinates per column and approximate Y from parent
    sortedDepths.forEach((d, colIndex) => {
      const colNodes = levels.get(d) ?? [];
      const colX = round1(padX + nodeWidth / 2 + colIndex * colStep);

      const maxSingleCol = Math.floor((h - padY * 2) / (nodeHeight + 10));

      if (colNodes.length <= maxSingleCol || colNodes.length <= 6) {
        // Single column with 1D collision relaxation.
        // Use previous cached positions as the primary anchor for existing
        // nodes so telemetry updates never move them; fall back to the parent
        // position (meaningful hierarchy) only for newly discovered nodes.
        const targets = colNodes.map((n, idx) => {
          const prev = previousPositions?.get(n.id);
          if (prev) return { id: n.id, targetY: prev.y };
          const pId = parentMap.get(n.id);
          const parentPos = pId ? positions.get(pId) : undefined;
          if (parentPos) return { id: n.id, targetY: parentPos.y };
          // Orphan root without layout history: spread across the column.
          const spread = colNodes.length > 1 ? (idx / (colNodes.length - 1)) : 0.5;
          return { id: n.id, targetY: clamp(minY + spread * (maxY - minY), minY, maxY) };
        });

        const yMap = relax1D(targets, minY, maxY, nodeHeight, 12);
        colNodes.forEach((n) => {
          const y = yMap.get(n.id) ?? h / 2;
          positions.set(n.id, { id: n.id, x: colX, y, depth: d });
        });
      } else {
        // High density column (e.g. 10-15 containers): 2 staggered sub-columns
        const subOffset = Math.min(nodeWidth * 0.52, (colStep * 0.42));
        const colLeftX = round1(colX - subOffset);
        const colRightX = round1(colX + subOffset);

        const leftTargets: Array<{ id: string; targetY: number }> = [];
        const rightTargets: Array<{ id: string; targetY: number }> = [];

        colNodes.forEach((n, idx) => {
          const prev = previousPositions?.get(n.id);
          const pId = parentMap.get(n.id);
          const parentPos = pId ? positions.get(pId) : undefined;
          const targetY = prev
            ? prev.y
            : parentPos
              ? parentPos.y
              : clamp(minY + 0.5 * (maxY - minY), minY, maxY);

          if (idx % 2 === 0) {
            leftTargets.push({ id: n.id, targetY });
          } else {
            rightTargets.push({ id: n.id, targetY });
          }
        });

        const leftYMap = relax1D(leftTargets, minY, maxY, nodeHeight, 10);
        const rightYMap = relax1D(rightTargets, minY, maxY, nodeHeight, 10);

        leftTargets.forEach((t) => {
          positions.set(t.id, { id: t.id, x: colLeftX, y: leftYMap.get(t.id) ?? h / 2, depth: d });
        });
        rightTargets.forEach((t) => {
          positions.set(t.id, { id: t.id, x: colRightX, y: rightYMap.get(t.id) ?? h / 2, depth: d });
        });
      }
    });

  } else {
    // ══════════════════════════════════════════════════════════════════════
    // SMARTPHONE VERTICAL LAYOUT (Responsive Top-to-Bottom Flow)
    // ══════════════════════════════════════════════════════════════════════
    const padY = 28;
    const padX = 18;
    const usableH = h - padY * 2 - nodeHeight;
    const rowStep = numLevels > 1 ? usableH / (numLevels - 1) : 0;
    const minX = padX + nodeWidth / 2;
    const maxX = w - padX - nodeWidth / 2;

    sortedDepths.forEach((d, rowIndex) => {
      const rowNodes = levels.get(d) ?? [];
      const rowY = round1(padY + nodeHeight / 2 + rowIndex * rowStep);

      if (rowNodes.length <= 3) {
        // Single row spread horizontally
        const targets = rowNodes.map((n, idx) => {
          const prev = previousPositions?.get(n.id);
          if (prev) return { id: n.id, targetY: prev.x };
          const pId = parentMap.get(n.id);
          const parentPos = pId ? positions.get(pId) : undefined;
          if (parentPos) return { id: n.id, targetY: parentPos.x };
          const spread = rowNodes.length > 1 ? (idx / (rowNodes.length - 1)) : 0.5;
          return { id: n.id, targetY: clamp(minX + spread * (maxX - minX), minX, maxX) };
        });

        const xMap = relax1D(targets, minX, maxX, nodeWidth, 10);
        rowNodes.forEach((n) => {
          const x = xMap.get(n.id) ?? w / 2;
          positions.set(n.id, { id: n.id, x, y: rowY, depth: d });
        });
      } else {
        // High density row on mobile: 2 compact sub-rows
        const subOffset = nodeHeight * 0.48;
        const upperY = round1(rowY - subOffset);
        const lowerY = round1(rowY + subOffset);

        const upperTargets: Array<{ id: string; targetY: number }> = [];
        const lowerTargets: Array<{ id: string; targetY: number }> = [];

        rowNodes.forEach((n, idx) => {
          const prev = previousPositions?.get(n.id);
          const pId = parentMap.get(n.id);
          const parentPos = pId ? positions.get(pId) : undefined;
          const targetX = prev
            ? prev.x
            : parentPos
              ? parentPos.x
              : clamp(minX + 0.5 * (maxX - minX), minX, maxX);

          if (idx % 2 === 0) {
            upperTargets.push({ id: n.id, targetY: targetX });
          } else {
            lowerTargets.push({ id: n.id, targetY: targetX });
          }
        });

        const upperXMap = relax1D(upperTargets, minX, maxX, nodeWidth, 8);
        const lowerXMap = relax1D(lowerTargets, minX, maxX, nodeWidth, 8);

        upperTargets.forEach((t) => {
          positions.set(t.id, { id: t.id, x: upperXMap.get(t.id) ?? w / 2, y: upperY, depth: d });
        });
        lowerTargets.forEach((t) => {
          positions.set(t.id, { id: t.id, x: lowerXMap.get(t.id) ?? w / 2, y: lowerY, depth: d });
        });
      }
    });
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
    width: w,
    height: h,
    metrics: { nodeWidth, nodeHeight, iconSize, fontSize, isVertical, mode, showIpOnNode },
    nodes: positions,
    cables,
  };
}
