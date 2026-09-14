import { motion } from 'framer-motion';
import { useClock } from '@/hooks/useClock';
import { useAuthStore } from '@/store/auth';
import { formatClock, formatDate } from '@/lib/utils';

function greetingForHour(hour: number): string {
  if (hour < 5) return 'Burning the midnight oil';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Greeting() {
  const now = useClock();
  const user = useAuthStore((s) => s.user);

  const title = user?.name || user?.username || 'Guest';

  return (
    <div className="flex flex-col gap-1">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-end justify-between gap-4"
      >
        <div>
          <p className="text-sm font-medium text-text-muted">
            {greetingForHour(now.getHours())}
          </p>
          <h1 className="mt-1 fluid-h1 font-display font-bold tracking-tight text-text-primary">
            Welcome back, <span className="text-gradient">{title}</span>
          </h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            Your infrastructure is operational. Here’s what’s happening right now.
          </p>
        </div>
        <div className="hidden text-right sm:block">
          <div className="font-display text-4xl font-bold tabular text-text-primary">
            {formatClock(now)}
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-text-muted">
            {formatDate(now)}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function CompactGreeting() {
  const now = useClock();
  const user = useAuthStore((s) => s.user);

  const title = user?.name || user?.username || 'Guest';

  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-border/60 bg-surface-input/80 px-3 py-2 backdrop-blur-md">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm text-accent">
        {title.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[11px] font-medium text-text-muted">
          {greetingForHour(now.getHours())}
        </p>
        <p className="truncate text-xs font-semibold text-text-primary">
          {title}
        </p>
      </div>
      <div className="ml-1 hidden text-right leading-tight sm:block">
        <div className="font-display text-sm font-bold tabular text-text-primary">
          {formatClock(now)}
        </div>
        <div className="text-[9px] uppercase tracking-[0.15em] text-text-muted">
          {formatDate(now)}
        </div>
      </div>
    </div>
  );
}
