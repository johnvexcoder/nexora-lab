import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { RightRail } from './RightRail';
import { BottomNav } from './BottomNav';
import { CommandPalette } from '@/components/search/CommandPalette';
import { NotificationToasts } from '@/components/notifications/NotificationToasts';
import { useAuthStore } from '@/store/auth';

export function AppLayout() {
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const location = useLocation();
  const isDashboard = location.pathname === '/';

  useEffect(() => {
    if (status === 'loading') void bootstrap();
  }, [status, bootstrap]);

  return (
    <div className="flex h-dvh min-h-0 w-full flex-col overflow-hidden">
      <Topbar />

      <div className="relative min-h-0 flex-1 overflow-x-hidden">
        {/* Center workspace — full-bleed for the topology-first dashboard,
            padded to avoid rails on desktop, nav on mobile for all other pages */}
        <main className={isDashboard ? 'h-full overflow-hidden' : 'h-full overflow-y-auto overflow-x-hidden'}>
          {isDashboard ? (
            <Outlet />
          ) : (
            <div className="mx-auto w-full max-w-[1440px] px-3 py-3 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-5 lg:pb-4 lg:pl-24 lg:pr-48 xl:pl-24 xl:pr-52">
              <Outlet />
            </div>
          )}
        </main>

        {/* Floating rails */}
        <Sidebar />
        <RightRail />
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />

      <CommandPalette />
      <NotificationToasts />
    </div>
  );
}
