/**
 * Provider-neutral infrastructure model — public surface.
 *
 * Build normalized `InfraEntity` data from any provider via `buildInfraGraph`,
 * then query it with the selectors below. Consumers never touch raw provider
 * payload shapes.
 */

export type {
  ContainerRuntime,
  InfraContainerEntity,
  InfraEntity,
  InfraEntityBase,
  InfraGraph,
  InfraHostEntity,
  InfraHypervisorEntity,
  InfraKind,
  InfraLink,
  InfraMetrics,
  InfraServiceEntity,
  InfraSource,
  InfraStatus,
  InfraStorageEntity,
  InfraVmEntity,
  LinkKind,
  LinkStatus,
  RawService,
  StorageType,
} from './types';

export {
  adaptDockerProfiles,
  adaptNetworkTopology,
  adaptServerRuntime,
  adaptServerRuntimes,
  adaptServices,
  buildInfraGraph,
  classifyServer,
  networkNodeKind,
  type BuildInfraGraphOpts,
  type RawDockerContainer,
  type RawDockerProfile,
} from './adapters';

import type { InfraEntity, InfraGraph, InfraKind, InfraStatus } from './types';

/** All entities of a given kind, preserving graph order. */
export function filterByKind<K extends InfraKind>(
  entities: InfraEntity[],
  kind: K,
): Array<Extract<InfraEntity, { kind: K }>> {
  return entities.filter((e): e is Extract<InfraEntity, { kind: K }> => e.kind === kind);
}

/** Look up a single entity by id. */
export function getEntityById(graph: InfraGraph, id: string): InfraEntity | undefined {
  return graph.entityById.get(id);
}

/** Direct children of `parentId` (e.g. containers with a VM parent). */
export function getChildren(graph: InfraGraph, parentId: string): InfraEntity[] {
  return graph.entities.filter((e) => e.parentId === parentId);
}

/** Parent entity of `entityId`, if one is present. */
export function getParent(graph: InfraGraph, entityId: string): InfraEntity | undefined {
  const entity = graph.entityById.get(entityId);
  if (!entity?.parentId) return undefined;
  return graph.entityById.get(entity.parentId);
}

/** Entities with the given status. */
export function byStatus(entities: InfraEntity[], status: InfraStatus): InfraEntity[] {
  return entities.filter((e) => e.status === status);
}