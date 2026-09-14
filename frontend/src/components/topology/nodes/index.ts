/**
 * Reusable, accessible topology node components.
 *
 * - `TopologyNode` — generic base node button (accessible name + real status)
 * - `HostNode`, `HypervisorNode`, `VmNode`, `ContainerNode`, `StorageNode`,
 *   `ServiceNode` — kind-specific wrappers with a compact live-metric line
 */

export { TopologyNode } from './TopologyNode';
export type { TopologyNodeProps } from './TopologyNode';

export { StatusPill, getStatusMeta, STATUS_META } from './status';
export type { StatusMeta } from './status';

export type { NodeLayoutMetrics } from './types';

export {
  ContainerNode,
  HostNode,
  HypervisorNode,
  ServiceNode,
  StatusRow,
  StorageNode,
  VmNode,
  pickPrimaryMetric,
} from './kinds';

export type {
  ContainerNodeProps,
  HostNodeProps,
  HypervisorNodeProps,
  ServiceNodeProps,
  StorageNodeProps,
  VmNodeProps,
} from './kinds';