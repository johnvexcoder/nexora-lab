import { useMemo } from 'react';
import { useNetwork, useDockerHosts } from '@/hooks/useQueries';
import { useTelemetryStore, selectServers } from '@/store/telemetry';
import { useShallow } from 'zustand/react/shallow';
import { deriveFleetSummary } from '@/lib/fleet';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { InfrastructureTopology } from '@/components/dashboard/InfrastructureTopology';
import { SystemResourcesPanel } from '@/components/dashboard/SystemResourcesPanel';
import { RunningServicesPanel } from '@/components/dashboard/RunningServicesPanel';
import { StorageUsagePanel } from '@/components/dashboard/StorageUsagePanel';
import { RecentEventsPanel } from '@/components/dashboard/RecentEventsPanel';

export default function DashboardPage() {
  const { topology, isLoading, error } = useNetwork();
  const servers = useTelemetryStore(useShallow(selectServers));
  const { profiles } = useDockerHosts();

  const runningServices = useMemo(
    () =>
      profiles.reduce(
        (a, p) => a + p.containers.filter((c) => c.running).length,
        0,
      ),
    [profiles],
  );

  const nodes = topology?.nodes ?? [];
  const fleet = useMemo(
    () => deriveFleetSummary(nodes, servers, runningServices),
    [nodes, servers, runningServices],
  );

  // Data is "ready" once either the authoritative topology or telemetry exists.
  const ready = fleet.hasTopology || servers.length > 0;

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-base">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:py-6">
        <DashboardGreeting fleet={fleet} ready={ready} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* Center-left: topology */}
          <section className="min-w-0">
            <InfrastructureTopology
              nodes={nodes}
              servers={servers}
              loading={isLoading}
              error={error}
            />
          </section>

          {/* Right operational column */}
          <aside className="flex min-w-0 flex-col gap-4" aria-label="Operational overview">
            <SystemResourcesPanel resources={fleet.resources} />
            <RunningServicesPanel />
            <StorageUsagePanel resources={fleet.resources} />
            <RecentEventsPanel />
          </aside>
        </div>
      </div>
    </div>
  );
}