import { Link } from 'react-router-dom';
import { Boxes, ArrowRight } from 'lucide-react';
import { useDockerHosts } from '@/hooks/useQueries';
import { DashboardPanel } from './DashboardPanel';
import { cn } from '@/lib/utils';

const RUN_COLOR = '#22C55E';

export function RunningServicesPanel() {
  const { profiles, isLoading } = useDockerHosts();

  const services = profiles.flatMap((p) =>
    p.containers
      .filter((c) => c.running)
      .map((c) => ({
        name: c.name,
        image: c.image,
        host: p.hostName,
      })),
  );

  const displayed = services.slice(0, 8);
  const hasServices = services.length > 0;

  return (
    <DashboardPanel
      icon={<Boxes className="h-4 w-4" />}
      title="Running Services"
      action={
        <Link
          to="/servers"
          className="flex items-center gap-1 text-[11px] font-semibold text-text-muted transition-colors hover:text-accent"
        >
          View All <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      {isLoading && profiles.length === 0 ? (
        <p className="py-2 text-center text-xs text-text-muted">Loading services…</p>
      ) : !hasServices ? (
        <p className="py-2 text-center text-xs text-text-muted">No monitored services.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {displayed.map((svc) => {
            const shortImage = svc.image?.split('/').pop()?.split(':')[0] ?? 'container';
            return (
              <li key={svc.host + svc.name} className="flex items-center gap-2.5">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-success/20 bg-success/10 text-[10px] font-bold uppercase text-success"
                  aria-hidden="true"
                >
                  {shortImage.slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-xs font-semibold text-text-primary">{svc.name}</div>
                  <div className="truncate font-mono text-[10px] text-text-muted">{svc.host}</div>
                </div>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                  )}
                  style={{ backgroundColor: `${RUN_COLOR}1a`, color: RUN_COLOR }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: RUN_COLOR }} aria-hidden="true" />
                  Running
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardPanel>
  );
}