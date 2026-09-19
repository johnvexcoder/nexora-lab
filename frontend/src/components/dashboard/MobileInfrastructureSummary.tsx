import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Globe, ShieldCheck, Server, ArrowRight } from 'lucide-react';
import type { FleetSummary } from '@/lib/fleet';

/**
 * Compact infrastructure summary shown on phones in place of the full node
 * topology (which would otherwise stack every device into an endless list).
 * Presents a tiny high-level hierarchy + a clear path to Servers/Network.
 */
export function MobileInfrastructureSummary({ fleet }: { fleet: FleetSummary }) {
  const statusDot =
    fleet.status === 'online' ? 'bg-success' : fleet.status === 'degraded' ? 'bg-warn' : 'bg-crit';

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-surface-border/40 bg-surface/20 p-4"
      aria-label="Infrastructure summary"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Server className="h-4 w-4 text-accent" />
          Infrastructure
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-text-muted">
          <span className={`h-2 w-2 rounded-full ${statusDot}`} aria-hidden="true" />
          {fleet.servers + fleet.workloads} nodes · {fleet.online} online
        </span>
      </div>

      {/* Tiny hierarchy */}
      <div className="mt-4 flex flex-col items-center py-1">
        <span className="flex items-center gap-1.5 text-xs text-text-secondary">
          <Globe className="h-3.5 w-3.5 text-cyan-400" /> Internet
        </span>
        <span className="my-1 h-4 w-px rounded-full bg-accent/40" aria-hidden="true" />
        <span className="flex items-center gap-1.5 text-xs text-text-secondary">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" /> Gateway
        </span>
        <span className="my-1 h-4 w-px rounded-full bg-accent/40" aria-hidden="true" />
        <span className="text-xs font-medium text-text-primary">{fleet.servers + fleet.workloads} Nodes</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          to="/servers"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-surface-border bg-surface-input/80 px-3 py-2.5 text-xs font-semibold text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
        >
          View Infrastructure <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          to="/network"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-surface-border bg-surface-input/80 px-3 py-2.5 text-xs font-semibold text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
        >
          Network <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </motion.section>
  );
}