import { useMemo } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import type { Severity } from '@/types';

export interface AlertCounts {
  critical: number;
  warning: number;
  info: number;
  success: number;
  total: number;
  unread: number;
}

export interface AlertsByNodeMap {
  [serverId: string]: AlertCounts;
}

const SEVERITIES: Severity[] = ['critical', 'warning', 'success', 'info'];

function emptyCounts(): AlertCounts {
  return { critical: 0, warning: 0, info: 0, success: 0, total: 0, unread: 0 };
}

export function useAlertsByNode(): AlertsByNodeMap {
  const { items } = useNotifications(200);

  return useMemo(() => {
    const map: AlertsByNodeMap = {};

    for (const n of items) {
      if (!n.serverId) continue;
      const existing = map[n.serverId] ?? emptyCounts();
      existing[n.severity] += 1;
      existing.total += 1;
      if (!n.read) existing.unread += 1;
      map[n.serverId] = existing;
    }

    return map;
  }, [items]);
}

export function useAlertsForNode(serverId: string | undefined): AlertCounts {
  const map = useAlertsByNode();
  return useMemo(() => (serverId ? map[serverId] ?? emptyCounts() : emptyCounts()), [map, serverId]);
}

export function getHighestSeverity(counts: AlertCounts): Severity | null {
  if (counts.critical > 0) return 'critical';
  if (counts.warning > 0) return 'warning';
  if (counts.success > 0) return 'success';
  if (counts.info > 0) return 'info';
  return null;
}