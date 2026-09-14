import { create } from 'zustand';
import type { NetworkNode } from '@/types';

interface TopologyState {
  selectedNodeId: string | null;
  focusedNodeId: string | null;

  selectNode: (nodeId: string | null) => void;
  focusNode: (nodeId: string | null) => void;
  clearSelection: () => void;
}

export const useTopologyStore = create<TopologyState>((set) => ({
  selectedNodeId: null,
  focusedNodeId: null,

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  focusNode: (nodeId) => set({ focusedNodeId: nodeId }),
  clearSelection: () => set({ selectedNodeId: null, focusedNodeId: null }),
}));

export function selectSelectedNodeId(state: TopologyState): string | null {
  return state.selectedNodeId;
}

export function selectFocusedNodeId(state: TopologyState): string | null {
  return state.focusedNodeId;
}

export function selectNode(state: TopologyState): (nodeId: string | null) => void {
  return state.selectNode;
}

export function selectFocusNode(state: TopologyState): (nodeId: string | null) => void {
  return state.focusNode;
}