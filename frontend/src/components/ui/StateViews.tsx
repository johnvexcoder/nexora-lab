import type { ReactNode } from 'react';
import { AlertTriangle, Ban, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Reusable failure / recovery / empty state views. Per the design system,
 * states never rely on color alone: every view carries a text title and copy,
 * and interactive actions expose real buttons with accessible labels.
 */

interface EmptyStateProps {
  title: string;
  copy?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Dashed-border placeholder for "nothing to show yet" (empty fleet, filtered view). */
export function EmptyState({ title, copy, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-2xl border border-dashed border-surface-border px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-surface-border bg-surface-elevated/50 text-text-muted">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {copy && <p className="mt-1 max-w-md text-xs leading-relaxed text-text-muted">{copy}</p>}
      </div>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  copy?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

/** Backend / data load failure with an optional retry action. */
export function ErrorState({
  title = 'Unable to load data',
  copy = 'The backend service did not respond as expected. Try again, and check the Core service if this persists.',
  onRetry,
  retrying = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-2xl border border-crit/25 bg-crit/5 px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-crit/25 bg-crit/10 text-crit">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-text-muted">{copy}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg border border-surface-border bg-surface px-3.5 text-xs font-semibold text-text-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', retrying && 'animate-spin')} aria-hidden="true" />
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      )}
    </div>
  );
}

interface ForbiddenStateProps {
  title?: string;
  copy?: string;
  icon?: ReactNode;
  className?: string;
}

/** RBAC denial — the viewer exists but lacks permission for this surface. */
export function ForbiddenState({
  title = 'Access denied',
  copy = 'Your account does not have permission to view this data. Contact a super admin to request access.',
  icon,
  className,
}: ForbiddenStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-2xl border border-warn/25 bg-warn/5 px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-warn/25 bg-warn/10 text-warn">
        {icon ?? <Ban className="h-6 w-6" aria-hidden="true" />}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-text-muted">{copy}</p>
      </div>
    </div>
  );
}