import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Server,
  BellRing,
  Network,
  Settings,
} from 'lucide-react';
import { BrandMark } from '@/components/branding/BrandMark';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { useNotificationStore } from '@/store/notifications';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/servers', label: 'Servers', icon: Server, end: false },
  { to: '/alerts', label: 'Alerts', icon: BellRing, end: false },
  { to: '/network', label: 'Network', icon: Network, end: false },
];

const BOTTOM_ITEMS = [{ to: '/settings', label: 'Settings', icon: Settings, end: false }];

function RailIcon({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
}) {
  return (
    <NavLink to={to} end={end} className="group relative block w-full" title={label} aria-label={label}>
      {({ isActive }) => (
        <motion.div
          whileHover={{ scale: 1.05 }}
          className={cn(
            'relative flex h-11 w-full items-center justify-center rounded-xl transition-colors',
            isActive
              ? 'bg-accent/12 text-accent'
              : 'text-text-secondary hover:text-text-primary hover:bg-overlay/5',
          )}
        >
          {isActive && (
            <motion.span
              layoutId="rail-active"
              className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent shadow-glow"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          )}
          <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
        </motion.div>
      )}
    </NavLink>
  );
}

/**
 * Integrated full-height left navigation rail. Sits flush against the app edge
 * (not a floating centered capsule) so it reads as part of the dashboard shell.
 * Logo at top, primary navigation in the middle, account/settings at the bottom.
 */
export function Sidebar() {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const unread = useNotificationStore((s) => s.unread);

  if (!isDesktop) return null;

  return (
    <aside
      aria-label="Main navigation"
      className="hidden h-full w-16 shrink-0 flex-col items-center border-r border-surface-border bg-surface/40 backdrop-blur-xl lg:flex"
    >
      <div className="flex h-16 w-full shrink-0 items-center justify-center border-b border-surface-border/60">
        <BrandMark variant="core" className="h-8 w-8" />
      </div>

      <nav className="flex flex-col items-center gap-1.5 py-4">
        {NAV_ITEMS.map((item) => (
          <RailIcon key={item.to} {...item} />
        ))}
      </nav>

      <div className="mt-auto flex w-full flex-col items-center gap-1.5 border-t border-surface-border/60 py-4">
        {BOTTOM_ITEMS.map((item) => (
          <RailIcon key={item.to} {...item} />
        ))}
        <div
          className="mt-1 flex h-1.5 w-1.5 rounded-full bg-accent shadow-glow"
          title="Live telemetry"
          aria-hidden="true"
        />
      </div>

      {unread > 0 && (
        <motion.span
          className="absolute right-1 top-[4.25rem] h-2 w-2 rounded-full bg-accent shadow-glow"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
        />
      )}
    </aside>
  );
}