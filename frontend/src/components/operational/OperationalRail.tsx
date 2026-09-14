import { useState } from 'react';
import { ShieldCheck, Gauge, Boxes, HardDrive, BellRing, History } from 'lucide-react';
import { useTelemetryStore, selectServers, globalHealthFromServers } from '@/store/telemetry';
import { useShallow } from 'zustand/react/shallow';
import { useQuickStats, useDockerHosts } from '@/hooks/useQueries';
import { useNotifications } from '@/hooks/useNotifications';
import { PanelShell } from '@/components/operational/PanelShell';
import { HealthPanelContent, HealthSummary } from '@/components/operational/HealthPanel';
import { WorkloadPanelContent, WorkloadSummary } from '@/components/operational/WorkloadPanel';
import { ServicesPanelContent, ServicesSummary } from '@/components/operational/ServicesPanel';
import { StoragePanelContent, StorageSummary } from '@/components/operational/StoragePanel';
import { AlertsPanelContent, AlertsSummary } from '@/components/operational/AlertsPanel';
import { EventsPanelContent, EventsSummary } from '@/components/operational/EventsPanel';

const PANEL_DEFAULT_OPEN = ['health', 'workload'];

/**
 * Compact floating secondary-rail: health, workload, services, storage,
 * alerts and recent-events panels collapsible to one-line summaries. Every
 * panel body renders real live data streamed from the backend.
 */
export function OperationalRail() {
  const servers = useTelemetryStore(useShallow(selectServers));
  const { stats } = useQuickStats();
  const { profiles } = useDockerHosts();
  const { items, unread } = useNotifications(30);

  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PANEL_DEFAULT_OPEN.map((id) => [id, true])),
  );

  const toggle = (id: string) => setOpenPanels((prev) => ({ ...prev, [id]: !prev[id] }));

  const healthStatus = globalHealthFromServers(servers).status;

  const panels = [
    {
      id: 'health',
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
      title: 'Health',
      subtitle: 'Fleet health score',
      badge: <HealthSummary status={healthStatus} />,
      content: <HealthPanelContent />,
    },
    {
      id: 'workload',
      icon: <Gauge className="h-3.5 w-3.5" />,
      title: 'Workload',
      subtitle: 'Aggregate load',
      badge: <WorkloadSummary stats={stats} />,
      content: <WorkloadPanelContent />,
    },
    {
      id: 'services',
      icon: <Boxes className="h-3.5 w-3.5" />,
      title: 'Services',
      subtitle: 'Containers per host',
      badge: <ServicesSummary profiles={profiles} />,
      content: <ServicesPanelContent />,
    },
    {
      id: 'storage',
      icon: <HardDrive className="h-3.5 w-3.5" />,
      title: 'Storage',
      subtitle: 'Disk usage',
      badge: <StorageSummary servers={servers} />,
      content: <StoragePanelContent />,
    },
    {
      id: 'alerts',
      icon: <BellRing className="h-3.5 w-3.5" />,
      title: 'Alerts',
      subtitle: 'Notification severities',
      badge: <AlertsSummary unread={unread} />,
      content: <AlertsPanelContent />,
    },
    {
      id: 'events',
      icon: <History className="h-3.5 w-3.5" />,
      title: 'Recent events',
      subtitle: 'Latest activity',
      badge: <EventsSummary items={items} />,
      content: <EventsPanelContent />,
    },
  ];

  return (
    <div className="flex flex-col gap-2" aria-label="Operational panels">
      {panels.map((panel) => (
        <PanelShell
          key={panel.id}
          id={`op-${panel.id}`}
          icon={panel.icon}
          title={panel.title}
          subtitle={panel.subtitle}
          badge={panel.badge}
          open={openPanels[panel.id] ?? false}
          onToggle={() => toggle(panel.id)}
        >
          {panel.content}
        </PanelShell>
      ))}
    </div>
  );
}