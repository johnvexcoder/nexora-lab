import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useTopologyStore, selectSelectedNodeId, selectFocusedNodeId } from '@/store/topology';
import {
  hasObservation,
  isStale,
  getEffectiveStatus,
  getStatusMeta,
  STATUS_META,
  STALE_THRESHOLD_MS,
} from '@/components/topology/nodes/status';
import type { InfraStatus } from '@/lib/infrastructure';
import { computeTopologyLayout } from '@/lib/topologyLayout';
import type { NetworkLink, NetworkNode } from '@/types';

describe('topology store', () => {
  beforeEach(() => {
    useTopologyStore.setState({ selectedNodeId: null, focusedNodeId: null });
  });

  it('initializes with no selection or focus', () => {
    const state = useTopologyStore.getState();
    assert.equal(state.selectedNodeId, null);
    assert.equal(state.focusedNodeId, null);
  });

  it('selectNode sets selectedNodeId', () => {
    useTopologyStore.getState().selectNode('node-1');
    const state = useTopologyStore.getState();
    assert.equal(state.selectedNodeId, 'node-1');
    assert.equal(selectSelectedNodeId(state), 'node-1');
  });

  it('selectNode(null) clears selection', () => {
    useTopologyStore.getState().selectNode('node-1');
    useTopologyStore.getState().selectNode(null);
    assert.equal(useTopologyStore.getState().selectedNodeId, null);
  });

  it('focusNode sets focusedNodeId without changing selection', () => {
    useTopologyStore.getState().selectNode('node-1');
    useTopologyStore.getState().focusNode('node-2');
    const state = useTopologyStore.getState();
    assert.equal(state.selectedNodeId, 'node-1');
    assert.equal(state.focusedNodeId, 'node-2');
    assert.equal(selectFocusedNodeId(state), 'node-2');
  });

  it('clearSelection resets both selection and focus', () => {
    useTopologyStore.getState().selectNode('node-1');
    useTopologyStore.getState().focusNode('node-2');
    useTopologyStore.getState().clearSelection();
    const state = useTopologyStore.getState();
    assert.equal(state.selectedNodeId, null);
    assert.equal(state.focusedNodeId, null);
  });
});

describe('topology node status', () => {
  describe('STATUS_META', () => {
    it('covers every InfraStatus', () => {
      const statuses: InfraStatus[] = ['online', 'degraded', 'offline', 'unknown', 'stale'];
      for (const s of statuses) {
        assert.ok(STATUS_META[s], `missing meta for ${s}`);
      }
    });

    it('each meta has color, bgColor and label', () => {
      for (const [status, meta] of Object.entries(STATUS_META)) {
        assert.ok(meta.color.startsWith('#'), `${status} color should be hex`);
        assert.ok(meta.bgColor.startsWith('rgba'), `${status} bgColor should be rgba`);
        assert.ok(meta.label.length > 0, `${status} label should be non-empty`);
      }
    });

    it('unknown and stale share the neutral visual but keep distinct labels', () => {
      assert.equal(STATUS_META.unknown.color, STATUS_META.stale.color);
      assert.equal(STATUS_META.unknown.label, 'Unknown');
      assert.equal(STATUS_META.stale.label, 'Stale');
    });

    it('uses distinct colors across the semantic statuses', () => {
      const colors = ['online', 'degraded', 'offline'].map((s) => STATUS_META[s as InfraStatus].color);
      assert.equal(new Set(colors).size, 3, 'status colors must be distinct');
    });

    it('getStatusMeta falls back to unknown for invalid status', () => {
      assert.deepEqual(getStatusMeta('invalid-status' as InfraStatus), STATUS_META.unknown);
    });
  });

  describe('hasObservation', () => {
    it('is false when metrics are undefined', () => {
      assert.equal(hasObservation(undefined), false);
    });

    it('is false when lastSeen is absent/null/0', () => {
      assert.equal(hasObservation({}), false);
      assert.equal(hasObservation({ lastSeen: null }), false);
      assert.equal(hasObservation({ lastSeen: 0 }), false);
    });

    it('is true when lastSeen is set', () => {
      assert.equal(hasObservation({ lastSeen: Date.now() }), true);
    });
  });

  describe('isStale', () => {
    it('is false when there is no observation', () => {
      assert.equal(isStale(undefined), false);
      assert.equal(isStale({}), false);
    });

    it('is false for recent observations', () => {
      assert.equal(isStale({ lastSeen: Date.now() }), false);
    });

    it('is true when observation age exceeds the threshold', () => {
      const old = Date.now() - STALE_THRESHOLD_MS - 1000;
      assert.equal(isStale({ lastSeen: old }), true);
    });

    it('is false exactly at the threshold boundary', () => {
      const boundary = Date.now() - STALE_THRESHOLD_MS;
      assert.equal(isStale({ lastSeen: boundary }), false);
    });
  });

  describe('getEffectiveStatus', () => {
    it('returns unknown when never observed, ignoring provider status', () => {
      assert.equal(getEffectiveStatus('online', undefined), 'unknown');
      assert.equal(getEffectiveStatus('offline', {}), 'unknown');
    });

    it('returns stale when observed but aged', () => {
      const old = Date.now() - STALE_THRESHOLD_MS - 5000;
      assert.equal(getEffectiveStatus('online', { lastSeen: old }), 'stale');
      assert.equal(getEffectiveStatus('degraded', { lastSeen: old }), 'stale');
    });

    it('returns provider status when observed and fresh', () => {
      const now = Date.now();
      assert.equal(getEffectiveStatus('online', { lastSeen: now }), 'online');
      assert.equal(getEffectiveStatus('offline', { lastSeen: now }), 'offline');
      assert.equal(getEffectiveStatus('degraded', { lastSeen: now }), 'degraded');
    });

    it('never reports missing data as measured zero', () => {
      const now = Date.now();
      assert.equal(getEffectiveStatus('unknown', { lastSeen: now }), 'unknown');
    });
  });

  describe('status selectors', () => {
    it('selectSelectedNodeId and selectFocusedNodeId return current values', () => {
      useTopologyStore.getState().selectNode('a');
      useTopologyStore.getState().focusNode('b');
      const state = useTopologyStore.getState();
      assert.equal(selectSelectedNodeId(state), 'a');
      assert.equal(selectFocusedNodeId(state), 'b');
    });
  });
});

describe('topology layout', () => {
  it('keeps a dense infrastructure tree inside the world without overlapping cards', () => {
    const makeNode = (id: string, type: NetworkNode['type'], parentId?: string): NetworkNode => ({
      id, label: id, type, parentId, status: 'online', health: 100, x: 0, y: 0,
    });
    const nodes: NetworkNode[] = [
      makeNode('internet', 'internet'),
      makeNode('gateway', 'gateway', 'internet'),
      makeNode('switch', 'switch', 'gateway'),
      ...Array.from({ length: 3 }, (_, i) => makeNode(`host-${i}`, 'hypervisor', 'switch')),
      ...Array.from({ length: 9 }, (_, i) => makeNode(`vm-${i}`, 'vm', `host-${i % 3}`)),
      ...Array.from({ length: 15 }, (_, i) => makeNode(`container-${i}`, 'container', `vm-${i % 9}`)),
    ];
    const links: NetworkLink[] = nodes
      .filter((node) => node.parentId)
      .map((node) => ({ id: `${node.parentId}-${node.id}`, source: node.parentId!, target: node.id, status: 'healthy' }));
    for (const width of [1112, 390]) {
      const layout = computeTopologyLayout(nodes, links, width, 510);
      const { nodeWidth, nodeHeight } = layout.metrics;
      const positions = [...layout.nodes.values()];

      for (const position of positions) {
      assert.ok(position.x - nodeWidth / 2 >= 0, `${position.id} exceeds left edge`);
      assert.ok(position.x + nodeWidth / 2 <= layout.width, `${position.id} exceeds right edge`);
      assert.ok(position.y - nodeHeight / 2 >= 0, `${position.id} exceeds top edge`);
      assert.ok(position.y + nodeHeight / 2 <= layout.height, `${position.id} exceeds bottom edge`);
      }
      for (let i = 0; i < positions.length; i += 1) {
        for (let j = i + 1; j < positions.length; j += 1) {
        const a = positions[i];
        const b = positions[j];
        const overlaps = Math.abs(a.x - b.x) < nodeWidth && Math.abs(a.y - b.y) < nodeHeight;
        assert.equal(overlaps, false, `${a.id} overlaps ${b.id}`);
        }
      }
    }
  });
});
