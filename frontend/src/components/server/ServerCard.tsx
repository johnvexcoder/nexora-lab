import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Cpu, HardDrive, MemoryStick, Thermometer, ArrowDown, ArrowUp, Layers, Server as ServerIcon, Database, Box, Shield, Wifi } from 'lucide-react';
import type { ServerRuntime } from '@/types';
import { ROLE_META, REACH_META, CAPABILITY_META, CARD_LOCKED_HEIGHT_CLASS, systemTagToneClass, statusTextClass, statusDotClass, compactClusterLabel, getSecondaryRole } from '@/lib/constants';
import { INFRA_ICON_COMPONENTS } from '@/lib/icons';
import { formatUptime, formatBytes, formatMbps, pct, cn } from '@/lib/utils';
import { useTelemetryStore } from '@/store/telemetry';
import { useClusters } from '@/hooks/useQueries';
import { Sparkline } from '@/components/ui/Sparkline';
import { StatusDot } from '@/components/ui/Status';
import { Badge } from '@/components/ui/Badge';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

function inferProvider(server: ServerRuntime): { label: string; icon: React.ReactNode; tone: string } {
  const id = server.spec.id;
  if (id.startsWith('pve') && !id.includes('-g')) return { label: 'Proxmox', icon: <ServerIcon className="h-2.5 w-2.5" />, tone: 'bg-amber-500/15 text-amber-400 border-amber-500/20' };
  if (id.includes('-g')) return { label: 'Proxmox VM', icon: <Box className="h-2.5 w-2.5" />, tone: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' };
  if (id.startsWith('docker-')) return { label: 'Nexora Agent', icon: <Database className="h-2.5 w-2.5" />, tone: 'bg-blue-500/15 text-blue-400 border-blue-500/20' };
  if (id.startsWith('agent-')) return { label: 'Nexora Agent', icon: <Database className="h-2.5 w-2.5" />, tone: 'bg-blue-500/15 text-blue-400 border-blue-500/20' };
  if (id === 'gateway' || id === 'firewall01') return { label: 'Physical', icon: <Shield className="h-2.5 w-2.5" />, tone: 'bg-teal-500/15 text-teal-400 border-teal-500/20' };
  if (id === 'switch01') return { label: 'Physical', icon: <Wifi className="h-2.5 w-2.5" />, tone: 'bg-warn/15 text-amber-400 border-amber-500/20' };
  return { label: 'Unknown', icon: <ServerIcon className="h-2.5 w-2.5" />, tone: 'bg-surface-border text-text-muted' };
}

export function ServerCard({ server, index }: { server: ServerRuntime; index: number }) {
  const sparklines = useTelemetryStore((s) => s.sparklines[server.spec.id]);
  const { clusters } = useClusters();
  const s = server.spec;
  const role = ROLE_META[s.role];
  const reach = REACH_META[server.reachability];
  const secondaryRole = getSecondaryRole(server as any, clusters);
  const cluster = s.clusterId ? clusters.find((c) => c.id === s.clusterId) : undefined;
  const clusterLabel = cluster ? compactClusterLabel(cluster.name) : undefined;
  const IconComponent = INFRA_ICON_COMPONENTS[s.role] ?? INFRA_ICON_COMPONENTS.physical;
  const provider = inferProvider(server);

  const cpuPct = server.cpu;
  const ramPct = pct(server.ramUsedGb, s.ramTotalGb);
  const diskPct = pct(server.diskUsedGb, s.diskTotalGb);
  const tempAvailable = server.tempC > 0;
  const tempTone = tempAvailable && server.tempC >= 75 ? 'text-crit' : tempAvailable && server.tempC >= 60 ? 'text-warn' : 'text-text-primary';

  const isEnriched = server.sensors?.length > 0 || (server as any).spec._tempSource;
  const telemetrySource = (server as any).spec._tempSource ? `temp via ${(server as any).spec._tempSource}` : isEnriched ? 'agent' : 'proxmox';

  const row = (
    <div className="flex flex-col gap-2.5">
      {/* Identity + status + provider header */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-surface-border bg-surface-elevated">
            {IconComponent && <IconComponent size={20} />}
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-elevated',
                statusDotClass(server.status),
              )}
            />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-display text-sm font-bold text-text-primary">{s.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral" size="sm">{role.label}</Badge>
              {secondaryRole && (
                <span className={`inline-flex items-center gap-1 rounded-full border font-medium tracking-wide px-1.5 py-0.5 text-[9px] ${secondaryRole.tone}`}>
                  {secondaryRole.label}
                </span>
              )}
              {clusterLabel && (
                <span className="inline-flex items-center gap-1 rounded-full border border-crit/30 bg-crit/10 text-crit px-1.5 py-0.5 text-[9px] font-medium">
                  {clusterLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 min-w-[80px] shrink-0">
          <div className={cn('flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold', statusTextClass(server.status))}>
            <span className={cn('h-1.5 w-1.5 rounded-full', statusDotClass(server.status))} />
            {server.status.toUpperCase()}
          </div>
          <div className={cn('flex items-center gap-1 whitespace-nowrap text-[9px]', reach.text)}>
            <span className={cn('h-1 w-1 rounded-full', reach.dot)} />
            {reach.label}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 min-w-[70px] shrink-0">
          <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${provider.tone}`}>
            {provider.icon} {provider.label}
          </span>
          <span className="text-[9px] text-text-muted/70 font-mono tabular">{telemetrySource}</span>
        </div>
      </div>

      {/* Key specs row */}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-text-muted">
        <span className="flex items-center gap-1 whitespace-nowrap font-mono">{s.ip}</span>
        <span className="h-2.5 w-px bg-surface-border" />
        <span className="whitespace-nowrap">{s.location}</span>
        <span className="h-2.5 w-px bg-surface-border" />
        <span className="truncate max-w-[200px]">{s.hostname ?? s.id} · {s.os}</span>
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap items-center gap-1">
        {(s.capabilities ?? []).map((cap) => (
          <span
            key={cap}
            className="whitespace-nowrap rounded border border-surface-border bg-surface-input px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-text-muted"
          >
            {CAPABILITY_META[cap]?.label ?? cap}
          </span>
        ))}
      </div>

      {/* Core metrics grid - compact */}
      <div className="grid grid-cols-4 gap-2">
        <CompactMetric serverId={s.id} label="CPU" icon={Cpu} value={cpuPct} suffix="%" spark={sparklines?.cpu} color="var(--accent)" tone={cpuPct >= 85 ? 'crit' : cpuPct >= 70 ? 'warn' : 'good'} />
        <CompactMetric serverId={s.id} label="RAM" icon={MemoryStick} value={ramPct} suffix="%" spark={sparklines?.ram} color="#60A5FA" tone={ramPct >= 85 ? 'crit' : ramPct >= 70 ? 'warn' : 'good'} sub={`${formatBytes(server.ramUsedGb)} / ${formatBytes(s.ramTotalGb)}`} />
        <CompactMetric serverId={s.id} label="Disk" icon={HardDrive} value={diskPct} suffix="%" spark={sparklines?.disk} color="#F59E0B" tone={diskPct >= 85 ? 'crit' : diskPct >= 70 ? 'warn' : 'good'} sub={`${formatBytes(server.diskUsedGb)} / ${formatBytes(s.diskTotalGb)}`} />
        <CompactMetric serverId={s.id} label="Temp" icon={Thermometer} value={tempAvailable ? server.tempC : null} suffix="°C" spark={sparklines?.temp} color="#F97316" tone={tempTone} />
      </div>

      {/* Secondary metrics row */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <MiniMetric label="Uptime" value={formatUptime(server.uptimeSeconds)} />
        <MiniMetric label="Processes" value={<AnimatedNumber value={server.processes} className="text-text-primary" />} />
        <MiniMetric label="Load" value={<AnimatedNumber value={server.load} decimals={2} className="text-text-primary" />} />
        <MiniMetric
          label={s.profile.containers > 0 ? 'Containers' : 'VMs'}
          value={<AnimatedNumber value={s.profile.containers > 0 ? s.profile.containers : s.profile.vms} className="text-text-primary" />}
        />
      </div>

      {/* Network + link */}
      <div className="flex items-center justify-between gap-2 border-t border-surface-border pt-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-text-muted">
          <span className="flex items-center gap-1 whitespace-nowrap"><ArrowDown className="h-2.5 w-2.5 text-success" />{formatMbps(server.netDownMbps)}</span>
          <span className="flex items-center gap-1 whitespace-nowrap"><ArrowUp className="h-2.5 w-2.5 text-info" />{formatMbps(server.netUpMbps)}</span>
          {(s.role === 'docker' || s.role === 'vm' || s.role === 'lxc' || s.parentId) ? (
            <span className="flex items-center gap-1 whitespace-nowrap"><Layers className="h-2.5 w-2.5" />{s.profile.containers} CTs</span>
          ) : (
            <span className="flex items-center gap-1 whitespace-nowrap"><Layers className="h-2.5 w-2.5" />{s.profile.vms} VMs</span>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-accent">
          Details <ArrowUpRight className="h-2.5 w-2.5" />
        </span>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.35, delay: index * 0.03, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link to={`/servers/${s.id}`} className={cn('card card-hover block overflow-hidden p-3 sm:p-4', 'h-[340px]')}>
        {row}
      </Link>
    </motion.div>
  );
}

function CompactMetric({
  serverId,
  label,
  icon: Icon,
  value,
  suffix,
  sub,
  spark,
  color,
  tone,
}: {
  serverId: string;
  label: string;
  icon: typeof Cpu;
  value: number | null;
  suffix: string;
  sub?: string;
  spark?: number[];
  color: string;
  tone?: string;
}) {
  const displayValue = value ?? 0;
  const isNa = value == null || value === 0;
  return (
    <div className="min-w-0 rounded-lg border border-surface-border/50 bg-surface-input/50 p-2">
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-text-muted">
          <Icon className="h-2.5 w-2.5" style={{ color }} />
          {label}
        </span>
        <span className={cn('truncate text-xs font-semibold tabular', tone)}>
          {isNa ? <span className="text-text-muted">N/A</span> : <><AnimatedNumber value={displayValue} decimals={displayValue < 10 ? 1 : 0} className="text-text-primary" /><span className="ml-0.5 text-[10px] font-normal text-text-muted">{suffix}</span></>}
        </span>
      </div>
      {sub && <div className="mt-0.5 text-[9px] text-text-muted truncate">{sub}</div>}
      <div className="mt-1 overflow-visible" style={{ height: 20, filter: `drop-shadow(0 0 2px ${color.startsWith('#') ? `${color}44` : color})` }}>
        <Sparkline data={spark ?? []} color={color} height={20} width={100} id={`${label}-compact-${serverId}`} />
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded border border-surface-border bg-surface-input/50 px-1.5 py-1">
      <div className="text-xs font-semibold tabular text-text-primary">{value}</div>
      <div className="text-[8px] uppercase tracking-widest text-text-muted">{label}</div>
    </div>
  );
}