import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ArrowRight, X } from 'lucide-react';
import { useNetwork } from '@/hooks/useQueries';
import { useTelemetryStore, selectServers } from '@/store/telemetry';
import { useShallow } from 'zustand/react/shallow';
import { TopologyCanvas } from '@/components/topology/TopologyCanvas';
import { CompactGreeting } from '@/components/dashboard/Greeting';
import { CompactQuickStats, HealthScore } from '@/components/dashboard/HealthScore';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { Hosts } from '@/components/dashboard/Hosts';

export default function DashboardPage() {
  const { topology, refetch, isLoading, error, isFetching } = useNetwork();
  const servers = useTelemetryStore(useShallow(selectServers));
  const [opsOpen, setOpsOpen] = useState(false);

  const nodes = topology?.nodes ?? [];
  const links = topology?.links ?? [];

  return (
    <div className="relative h-full w-full overflow-hidden bg-base">
      {/* ═══════════════════════════════════════════════════════════
          TOPOLOGY FIRST — full-bleed center background workspace
          ═══════════════════════════════════════════════════════════ */}
      <div className="absolute inset-0 z-0">
        <TopologyCanvas
          nodes={nodes}
          links={links}
          servers={servers}
          variant="workspace"
          showControls
          showLegend
          showStatusBar
          isLoading={isLoading}
          error={error}
          onRefresh={() => void refetch()}
          isRefreshing={isFetching}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════
          COMPACT FLOATING OVERLAYS
          ═══════════════════════════════════════════════════════════ */}

      {/* Top-left: compact greeting (clears icon rail on lg+) */}
      <div className="absolute left-3 top-3 z-20 lg:left-20">
        <CompactGreeting />
      </div>

      {/* Top-right: compact live stats (desktop/tablet only) */}
      <div className="absolute right-3 top-3 z-20 hidden max-w-[60vw] md:block lg:max-w-[480px]">
        <CompactQuickStats />
      </div>

      {/* ═══════════════════════════════════════════════════════════
          DESKTOP FLOATING OPERATIONS DOCK (right)
          ═══════════════════════════════════════════════════════════ */}
      <aside
        aria-label="Operations panel"
        className="absolute right-4 top-24 bottom-4 z-20 hidden w-80 flex-col gap-3 overflow-y-auto pr-1 lg:flex"
      >
        <div className="shrink-0">
          <HealthScore />
        </div>
        <div className="shrink-0">
          <QuickActions />
        </div>
        <div className="shrink-0">
          <Hosts />
        </div>
        <Link
          to="/servers"
          className="shrink-0 flex items-center justify-center gap-1.5 rounded-xl border border-surface-border/60 bg-surface-input/80 px-3 py-2.5 text-xs font-semibold text-text-secondary backdrop-blur-md transition-colors hover:border-accent/40 hover:text-accent"
        >
          <span>View all servers</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </aside>

      {/* ═══════════════════════════════════════════════════════════
          MOBILE OPERATIONS LAUNCHER + BOTTOM SHEET
          ═══════════════════════════════════════════════════════════ */}
      <div className="absolute bottom-24 right-4 z-30 lg:hidden">
        <button
          onClick={() => setOpsOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-surface-border/60 bg-surface-input/90 px-3.5 py-2.5 text-xs font-semibold text-text-primary shadow-2xl backdrop-blur-xl transition-colors hover:border-accent/40 hover:text-accent cursor-pointer"
          aria-label="Open operations panel"
          aria-expanded={opsOpen}
        >
          <Activity className="h-4 w-4 text-accent" />
          <span>Ops Panel</span>
        </button>
      </div>

      <AnimatePresence>
        {opsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setOpsOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-surface-border bg-surface-elevated p-4 pb-6"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Operations panel"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-border" />
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">
                  Operations
                </h2>
                <button
                  onClick={() => setOpsOpen(false)}
                  className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-overlay/5 hover:text-text-primary cursor-pointer"
                  aria-label="Close operations panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-4">
                <div className="shrink-0">
                  <HealthScore />
                </div>
                <div className="shrink-0">
                  <QuickActions />
                </div>
                <div className="shrink-0">
                  <Hosts />
                </div>
                <Link
                  to="/servers"
                  onClick={() => setOpsOpen(false)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-surface-border/60 bg-surface-input px-3 py-2.5 text-xs font-semibold text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
                >
                  <span>View all servers</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}