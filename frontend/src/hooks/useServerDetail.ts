import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/api/endpoints';
import type { ServerRuntime } from '@/types';

export interface ServerServices {
  containers: Array<{ id: string; name: string; running: boolean; image: string; ports?: string[] }>;
}

export function useServerServices(server: ServerRuntime | undefined) {
  const { data: dockerHosts } = useQuery({
    queryKey: ['docker-hosts'],
    queryFn: () => endpoints.docker.hosts(),
    refetchInterval: 30_000,
    staleTime: 20_000,
    enabled: !!server,
  });

  const services = useMemo(() => {
    if (!server || !dockerHosts?.profiles) return { containers: [] };

    const profile = dockerHosts.profiles.find(
      (p) => p.hostName === server.spec.hostname || p.hostIp === server.spec.ip
    );

    return { containers: profile?.containers ?? [] };
  }, [server, dockerHosts]);

  return { services, isLoading: !dockerHosts };
}

export function useServerEvents(serverId: string, limit = 20) {
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['server-events', serverId, limit],
    queryFn: () => endpoints.notifications.list(100).then((notifications) =>
      notifications.filter((n) => n.serverId === serverId).slice(0, limit)
    ),
    refetchInterval: 30_000,
    staleTime: 20_000,
    enabled: !!serverId,
  });

  return { events: data ?? [], refetch, isLoading };
}

export function useServerHistory(serverId: string, range: '15m' | '1h' | '6h' | '24h' = '1h') {
  const { data, isLoading } = useQuery({
    queryKey: ['server-history', serverId, range],
    queryFn: () => endpoints.servers.history(serverId, range),
    refetchInterval: 30_000,
    staleTime: 20_000,
    enabled: !!serverId,
  });

  return { points: data?.points ?? [], isLoading };
}
