import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Server, Boxes, Workflow, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useClock } from '@/hooks/useClock';
import { cn } from '@/lib/utils';
import type { FleetSummary } from '@/lib/fleet';

function greetingForHour(hour: number): string {
  if (hour < 5) return 'Burning the midnight oil';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function operationalLine(status: FleetSummary['status']): { text: string; tone: string } {
  switch (status) {
    case 'online':
      return { text: 'All systems operational.', tone: 'text-success' };
    case 'degraded':
      return { text: 'Some systems require attention.', tone: 'text-warn' };
    default:
      return { text: 'Infrastructure issues detected.', tone: 'text-crit' };
  }
}

function SummaryChip({
  icon,
  label,
  value,
  to,
  tone = 'text-text-primary',
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  to: string;
  tone?: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn('group flex items-center gap-2.5 rounded-xl border border-surface-border/60 bg-surface-input/80 px-3.5 py-2.5 backdrop-blur-md transition-colors hover:border-accent/40', className)}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        {icon}
      </span>
      <span className="leading-tight">
        <span className={cn('block font-display text-lg font-bold tabular', tone)}>{value}</span>
        <span className="block text-[10px] font-semibold uppercase tracking-widest text-text-muted">{label}</span>
      </span>
      <ArrowRight className="ml-1 h-3.5 w-3.5 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
    </Link>
  );
}

export function DashboardGreeting({ fleet, ready = true }: { fleet: FleetSummary; ready?: boolean }) {
  const now = useClock();
  const user = useAuthStore((s) => s.user);
  const title = user?.name || user?.username || 'Guest';
  const line = ready ? operationalLine(fleet.status) : { text: 'Loading infrastructure telemetry…', tone: 'text-text-muted' };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-4"
    >
      <div>
        <p className="text-sm font-medium text-text-muted">{greetingForHour(now.getHours())}</p>
        <h1 className="mt-1 fluid-h1 font-display font-bold tracking-tight text-text-primary">
          <span className="text-gradient">{title}</span>
        </h1>
        <p className={cn('mt-1.5 flex items-center gap-2 text-sm font-medium', line.tone)}>
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              !ready ? 'bg-text-muted' : fleet.status === 'online' ? 'bg-success' : fleet.status === 'degraded' ? 'bg-warn' : 'bg-crit',
            )}
            aria-hidden="true"
          />
          {line.text}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:items-center">
        <SummaryChip icon={<Server className="h-4 w-4" />} label="Servers" value={fleet.servers} to="/servers" />
        <SummaryChip icon={<Boxes className="h-4 w-4" />} label="Workloads" value={fleet.workloads} to="/network" />
        <SummaryChip icon={<Workflow className="h-4 w-4" />} label="Services" value={fleet.services} to="/servers" tone="text-accent" className="col-span-2 sm:col-span-1" />
      </div>
    </motion.section>
  );
}