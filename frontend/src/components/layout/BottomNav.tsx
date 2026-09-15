import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Server,
  BellRing,
  Network,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/servers', label: 'Servers', icon: Server, end: false },
  { to: '/alerts', label: 'Alerts', icon: BellRing, end: false },
  { to: '/network', label: 'Network', icon: Network, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
];

function BottomNavItem({
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
    <NavLink to={to} end={end} className="min-w-0 flex-1" aria-label={label}>
      {({ isActive }) => (
        <div
          className={cn(
            'relative flex min-h-14 flex-col items-center justify-center gap-1 py-1.5 transition-colors',
            isActive ? 'text-accent' : 'text-text-muted',
          )}
        >
          {isActive && (
            <motion.span
              layoutId="bottomnav-active"
              className="absolute top-0 h-[2px] w-6 rounded-full bg-accent"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          )}
          <Icon className="h-5 w-5" strokeWidth={isActive ? 2.2 : 1.8} />
          <span className="text-[10px] font-medium leading-none">{label}</span>
        </div>
      )}
    </NavLink>
  );
}

export function BottomNav() {
  const isMobile = useMediaQuery('(max-width: 1023px)');

  if (!isMobile) return null;

  return (
    <nav
      aria-label="Navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-surface-border/60 bg-surface-input/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      {NAV_ITEMS.map((item) => (
        <BottomNavItem key={item.to} {...item} />
      ))}
    </nav>
  );
}
