import { useMemo } from 'react';
import { useNetwork, useDockerHosts } from '@/hooks/useQueries';
import { useTelemetryStore, selectServers } from '@/store/telemetry';
import { useShallow } from 'zustand/react/shallow';
import { deriveFleetSummary } from '@/lib/fleet';
import { DashboardGreeting, DashboardSummaryCards } from '@/components/dashboard/DashboardGreeting';
import { InfrastructureTopology } from '@/components/dashboard/InfrastructureTopology';
import { MobileInfrastructureSummary } from '@/components/dashboard/MobileInfrastructureSummary';
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

  const nodes = useMemo(() => topology?.nodes ?? [], [topology]);
  const fleet = useMemo(
    () => deriveFleetSummary(nodes, servers, runningServices),
    [nodes, servers, runningServices],
  );

  // Data is "ready" once either the authoritative topology or telemetry exists.
  const ready = fleet.hasTopology || servers.length > 0;

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-base">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 lg:py-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <DashboardGreeting fleet={fleet} ready={ready} />

            {/* Center-left: topology (desktop/tablet) or compact summary (phone) */}
            <section className="mt-6 min-w-0">
              <div className="hidden lg:block">
                <InfrastructureTopology
                  nodes={nodes}
                  servers={servers}
                  loading={isLoading}
                  error={error}
                />
              </div>
              <div className="lg:hidden">
                <MobileInfrastructureSummary fleet={fleet} />
              </div>
            </section>
          </div>

          {/* Right operational column */}
          <aside className="flex min-w-0 flex-col gap-4" aria-label="Operational overview">
            <DashboardSummaryCards fleet={fleet} className="hidden lg:grid" />
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
