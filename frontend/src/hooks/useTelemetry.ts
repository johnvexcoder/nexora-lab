import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { connectWs, subscribeWs } from '@/api/ws';
import { endpoints } from '@/api/endpoints';
import {
  useTelemetryStore,
  realtimeStatus,
  selectServers,
  type RealtimeStatus,
} from '@/store/telemetry';

/**
 * Bootstraps the live pipeline: hydrates server list from REST, then streams
 * every telemetry tick over WebSocket into the zustand store.
 *
 * Surfaces the derived failure/recovery state (`realtime`) so consumers can
 * distinguish connecting → open → reconnecting → closed, stale telemetry and
 * partial (some hosts silent) coverage.
 */
export function useTelemetry() {
  // useShallow is required: selectServers returns a NEW array each call, and
  // zustand v5 feeds getSnapshot straight into useSyncExternalStore — without a
  // shallow equality check React loops on forceStoreRerender and throws
  // "Maximum update depth exceeded", unmounting the whole app (black screen).
  const servers = useTelemetryStore(useShallow(selectServers));
  const hydrate = useTelemetryStore((s) => s.hydrate);
  const connected = useTelemetryStore((s) => s.connected);
  const setConnected = useTelemetryStore((s) => s.setConnected);
  const wsStatus = useTelemetryStore((s) => s.wsStatus);
  const setWsStatus = useTelemetryStore((s) => s.setWsStatus);
  const backendError = useTelemetryStore((s) => s.backendError);
  const setBackendError = useTelemetryStore((s) => s.setBackendError);
  const realtime = useTelemetryStore(useShallow((s) => realtimeStatus(s)));

  const { data, isInitialLoading, error, isRefetching, refetch } = useQuery({
    queryKey: ['servers'],
    queryFn: endpoints.servers.list,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (data) hydrate(data);
  }, [data, hydrate]);

  useEffect(() => {
    if (error) setBackendError(error);
    else if (data) setBackendError(null);
  }, [error, data, setBackendError]);

  useEffect(() => {
    connectWs();
    // The WS client is a page-lifetime singleton: do NOT disconnect here.
    // StrictMode double-mounts would otherwise flap the connection (and cause
    // proxy ECONNRESETs). Just subscribe to status changes.
    const unsub = subscribeWs((state) => {
      setConnected(state.status === 'open');
      setWsStatus(state.status);
    });
    return () => unsub();
  }, [setConnected, setWsStatus]);

  return {
    servers,
    loading: isInitialLoading,
    error,
    refetch,
    isRefetching,
    connected,
    wsStatus,
    backendError,
    realtime,
  };
}

export type { RealtimeStatus };