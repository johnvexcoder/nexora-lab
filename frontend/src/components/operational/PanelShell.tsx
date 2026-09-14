import { useId, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Compact floating panel shell for the dashboard operations rail.
 * A slim header toggles an animated body. Styling matches the rest of
 * the Nexora floating overlays (surface-input tint + backdrop blur).
 */
export function PanelShell({
  id,
  icon,
  title,
  subtitle,
  badge,
  open,
  onToggle,
  children,
}: {
  id: string;
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = useId();
  return (
    <section
      id={id}
      className={cn(
        'rounded-2xl border border-surface-border/60 bg-surface-input/80 shadow-card backdrop-blur-md transition-colors',
        open && 'border-accent/25',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-overlay/[0.03] cursor-pointer"
      >
        {icon && (
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
              open ? 'bg-accent/15 text-accent' : 'bg-overlay/5 text-text-secondary',
            )}
          >
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-xs font-semibold text-text-primary">{title}</span>
          {subtitle && <span className="block truncate text-[10px] text-text-muted">{subtitle}</span>}
        </span>
        {badge}
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-text-muted transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={bodyId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}