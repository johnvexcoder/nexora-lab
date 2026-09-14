import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Archive,
  Cable,
  KeyRound,
  LogOut,
  ScrollText,
  Settings,
  Shield,
  Users,
  AlertTriangle,
  Zap,
  Palette,
  Server,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { APP_VERSION } from '@/lib/version';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AccessSettings } from '@/components/config/AccessSettings';
import { SecuritySettings } from '@/components/config/SecuritySettings';
import { FeatureFlags } from '@/components/config/FeatureFlags';
import { QuickActionsManager } from '@/components/config/QuickActionsManager';
import { UsersManager } from '@/components/config/UsersManager';
import { IntegrationsManager } from '@/components/config/IntegrationsManager';
import { BackupsManager } from '@/components/config/BackupsManager';
import { AuditLog } from '@/components/config/AuditLog';
import { AccountPanel } from '@/components/config/AccountPanel';
import { ThemePanel } from '@/components/config/ThemePanel';
import { AgentManager } from '@/components/config/AgentManager';

type TabId =
  | 'access'
  | 'security'
  | 'features'
  | 'quick-actions'
  | 'users'
  | 'integrations'
  | 'agents'
  | 'backups'
  | 'audit'
  | 'theme'
  | 'account';

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; permission?: string }> = [
  { id: 'account', label: 'Account', icon: Settings },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'access', label: 'Access', icon: KeyRound, permission: 'settings.view' },
  { id: 'security', label: 'Security', icon: Shield, permission: 'settings.view' },
  { id: 'features', label: 'Features', icon: Activity, permission: 'settings.view' },
  { id: 'quick-actions', label: 'Actions', icon: Zap, permission: 'settings.view' },
  { id: 'users', label: 'Users', icon: Users, permission: 'users.view' },
  { id: 'integrations', label: 'Integrations', icon: Cable, permission: 'integrations.view' },
  { id: 'agents', label: 'Agents', icon: Server, permission: 'settings.view' },
  { id: 'backups', label: 'Backups', icon: Archive, permission: 'backups.view' },
  { id: 'audit', label: 'Audit', icon: ScrollText, permission: 'audit.view' },
];

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const modes = useAuthStore((s) => s.modes);
  const logout = useAuthStore((s) => s.logout);
  const has = useAuthStore((s) => s.has);
  const [tab, setTab] = useState<TabId>('account');

  useEffect(() => {
    if (user?.mustChangePassword) setTab('account');
  }, [user?.mustChangePassword]);

  const visible = TABS.filter((t) => !t.permission || has(t.permission));
  const mustChange = user?.mustChangePassword ?? false;

  useEffect(() => {
    if (!visible.some((item) => item.id === tab)) setTab('account');
  }, [tab, visible]);

  const render = () => {
    switch (tab) {
      case 'access':    return <AccessSettings />;
      case 'security':  return <SecuritySettings />;
      case 'features':  return <FeatureFlags />;
      case 'quick-actions': return <QuickActionsManager />;
      case 'users':     return <UsersManager />;
      case 'integrations': return <IntegrationsManager />;
      case 'agents':      return <AgentManager />;
      case 'backups':   return <BackupsManager />;
      case 'audit':     return <AuditLog />;
      case 'theme':     return <ThemePanel />;
      case 'account':   return <AccountPanel />;
      default:          return null;
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 pb-8 sm:gap-5" aria-labelledby="configuration-title">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 id="configuration-title" className="fluid-h1 font-display font-bold tracking-tight text-text-primary">Settings & administration</h1>
            <p className="mt-0.5 text-xs sm:text-sm text-text-muted">
              Signed in as <b className="text-text-secondary">{user?.username}</b>
              {user?.name && <> ({user.name})</>} · <Badge tone="accent">{user?.role}</Badge>
              <span className="mx-1.5 text-text-muted/40">·</span>
              <span className="text-text-muted">v{APP_VERSION}</span>
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void logout()}>
          <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>

      {/* Alerts */}
      {modes?.mockMode && (
        <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-text-primary">
          <Shield className="h-4 w-4 shrink-0 text-accent" />
          <div>
            <span className="font-semibold text-accent">Demo Mode Active:</span> Nexora is currently running on simulated infrastructure. Theme & visual preferences can be customized freely, but modifying passwords, user accounts, and infrastructure credentials is disabled.
          </div>
        </div>
      )}
      {mustChange && (
        <div className="flex items-center gap-3 rounded-xl border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-warn">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Your password must be changed before you can configure anything. Set a new one in the Account tab.
        </div>
      )}
      {modes?.readOnly && (
        <div className="flex items-center gap-3 rounded-xl border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-warn">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Read-only mode is active — settings can be viewed but changes are blocked server-side.
        </div>
      )}
      {modes?.safeMode && (
        <div className="flex items-center gap-3 rounded-xl border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-warn" role="status">
          <Shield className="h-4 w-4 shrink-0" /> Safe mode is active. High-risk operations remain blocked server-side.
        </div>
      )}
      {modes?.emergencyLock && (
        <div className="flex items-center gap-3 rounded-xl border border-crit/30 bg-crit/10 px-4 py-3 text-sm text-crit" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Emergency lock is active. Review security controls before restoring changes.
        </div>
      )}
      {modes?.guest && (
        <div className="flex items-center gap-3 rounded-xl border border-info/25 bg-info/10 px-4 py-3 text-sm text-info" role="status">
          <Users className="h-4 w-4 shrink-0" /> Guest access is enabled. Review its scopes under Access.
        </div>
      )}

      {/* Navigation — compact pill bar, wraps on all viewports */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-surface-border bg-surface p-1" role="tablist" aria-label="Settings sections">
        {visible.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              type="button"
              role="tab"
              id={`settings-tab-${t.id}`}
              aria-selected={active}
              aria-controls="settings-panel"
              key={t.id}
              onClick={() => setTab(t.id)}
              disabled={mustChange && t.id !== 'account'}
              className={cn(
                'relative flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40',
                active ? 'text-accent' : 'text-text-muted hover:text-text-secondary',
              )}
            >
              {active && (
                <motion.span
                  layoutId="config-tab"
                  className="absolute inset-0 rounded-lg bg-accent/10"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className="relative h-3.5 w-3.5 shrink-0" />
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          id="settings-panel"
          role="tabpanel"
          aria-labelledby={`settings-tab-${tab}`}
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          {render()}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
