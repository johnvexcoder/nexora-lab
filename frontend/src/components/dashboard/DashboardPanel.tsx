import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Fixed (non-collapsible) dashboard panel used in the right operational column.
 * A slim header with an icon + title and optional trailing action, over a
 * consistent elevated surface. Styling matches the Nexora design system.
 */
export function DashboardPanel({
  icon,
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-surface-border/60 bg-surface-input/70 shadow-card backdrop-blur-md',
        className,
      )}
    >
      <header className="flex min-h-11 items-center gap-2.5 border-b border-surface-border/50 px-4 py-2.5">
        {icon && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">{icon}</span>}
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{title}</h2>
        {action}
      </header>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}