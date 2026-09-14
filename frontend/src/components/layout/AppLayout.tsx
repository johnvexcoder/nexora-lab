import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
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

  useEffect(() => {
    if (status === 'loading') void bootstrap();
  }, [status, bootstrap]);

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden">
      <Topbar />

      <div className="relative min-h-0 flex-1 overflow-x-hidden">
        {/* Center workspace — full width, padded to avoid rails on desktop, nav on mobile */}
        <main className="h-full overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-5 sm:py-5 lg:pl-24 lg:pr-48 xl:pl-24 xl:pr-52 pb-20 lg:pb-4">
            <Outlet />
          </div>
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
