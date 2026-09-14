import { useMemo } from 'react';
import { useTelemetry } from '@/hooks/useTelemetry';
import { useDockerHosts, useNetwork } from '@/hooks/useQueries';
import {
  buildInfraGraph,
  type InfraGraph,
  type RawDockerProfile,
} from '@/lib/infrastructure';

/**
 * Compose the live telemetry store, network topology and Docker profiles into a
 * single provider-neutral `InfraGraph` of entities + links. The normalized
 * graph is recomputed on each tick/refetch like any other selector.
 */
export function useInfrastructure(): { graph: InfraGraph; isLoading: boolean } {
  const { servers, loading: serversLoading } = useTelemetry();
  const { topology, isLoading: topoLoading } = useNetwork();
  const { profiles, isLoading: dockerLoading } = useDockerHosts();

  const graph = useMemo(
    () =>
      buildInfraGraph({
        servers,
        network: topology,
        dockerProfiles: profiles as RawDockerProfile[],
      }),
    [servers, topology, profiles],
  );

  const isLoading = serversLoading || topoLoading || dockerLoading;

  return { graph, isLoading };
}