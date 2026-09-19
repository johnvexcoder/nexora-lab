import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { RecoveryBanner } from './RecoveryBanner';
import { BottomNav } from './BottomNav';
import { CommandPalette } from '@/components/search/CommandPalette';
import { NotificationToasts } from '@/components/notifications/NotificationToasts';
import { useAuthStore } from '@/store/auth';

/**
 * Application shell: a fixed full-height icon navigation rail on the left with
 * a header + scrollable content column to its right. The dashboard is rendered
 * full-bleed so its topology/greeting can fill the workspace; every other page
 * uses a bounded content container.
 */
export function AppLayout() {
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const location = useLocation();
  const isDashboard = location.pathname === '/';

  useEffect(() => {
    if (status === 'loading') void bootstrap();
  }, [status, bootstrap]);

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-text-primary focus:ring-2 focus:ring-accent">Skip to main content</a>

      {/* Integrated left navigation rail (desktop/tablet) */}
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <RecoveryBanner />

        <main
          id="main-content"
          tabIndex={-1}
          className={
            isDashboard
              ? 'min-h-0 flex-1 overflow-hidden'
              : 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden'
          }
        >
          {isDashboard ? (
            <Outlet />
          ) : (
            <div className="mx-auto w-full max-w-[1440px] px-4 py-5 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 lg:pb-8">
              <Outlet />
            </div>
          )}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />

      <CommandPalette />
      <NotificationToasts />
    </div>
  );
}