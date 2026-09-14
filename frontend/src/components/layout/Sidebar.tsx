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
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <motion.div
          whileHover={{ scale: 1.08 }}
          className={cn(
            'group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors',
            isActive
              ? 'bg-accent/12 text-accent'
              : 'text-text-secondary hover:text-text-primary hover:bg-overlay/5',
          )}
          title={label}
          aria-label={label}
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

export function Sidebar() {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const unread = useNotificationStore((s) => s.unread);

  if (!isDesktop) return null;

  return (
    <aside
      aria-label="Main navigation"
      className="fixed left-4 top-1/2 z-30 -translate-y-1/2 flex-col items-center rounded-2xl border border-surface-border/60 bg-surface-input/80 px-2 py-3 shadow-card backdrop-blur-xl hidden lg:flex"
    >
      <div className="mb-2 flex items-center justify-center p-1">
        <BrandMark variant="core" className="h-8 w-8" />
      </div>

      <nav className="flex flex-col items-center gap-1.5 py-2">
        {NAV_ITEMS.map((item) => (
          <RailIcon key={item.to} {...item} />
        ))}
      </nav>

      <div className="mt-3 flex flex-col items-center gap-1.5 border-t border-surface-border/60 pt-3">
        {BOTTOM_ITEMS.map((item) => (
          <RailIcon key={item.to} {...item} />
        ))}
      </div>

      {unread > 0 && (
        <motion.div
          className="absolute -right-1 top-6 h-2 w-2 rounded-full bg-accent shadow-glow"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
        />
      )}
    </aside>
  );
}
