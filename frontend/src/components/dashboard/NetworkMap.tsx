import { Network, RefreshCw } from 'lucide-react';
import { useNetwork } from '@/hooks/useQueries';
import { useTelemetryStore, selectServers } from '@/store/telemetry';
import { useShallow } from 'zustand/react/shallow';
import { Card, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { TopologyCanvas } from '@/components/topology/TopologyCanvas';

export function NetworkMap() {
  const { topology, refetch, isLoading, error, isFetching } = useNetwork();
  const servers = useTelemetryStore(useShallow(selectServers));

  const nodes = topology?.nodes ?? [];
  const links = topology?.links ?? [];

  return (
    <Card className="h-full">
      <CardHeader
        title="Network Map"
        subtitle="Live NOC infrastructure topology & traffic"
        icon={<Network className="h-[18px] w-[18px]" />}
        action={
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs font-medium text-text-muted transition-colors hover:text-accent cursor-pointer"
            disabled={isFetching}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} /> Refresh
          </button>
        }
      />

      <div className="relative overflow-hidden rounded-xl border border-surface-border bg-base/80 h-[560px] sm:h-[600px]">
        <TopologyCanvas
          nodes={nodes}
          links={links}
          servers={servers}
          variant="card"
          showControls
          showLegend
          showStatusBar
          isLoading={isLoading}
          error={error}
          onRefresh={() => void refetch()}
          isRefreshing={isFetching}
        />
      </div>
    </Card>
  );
}
