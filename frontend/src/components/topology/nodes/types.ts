/**
 * Layout metrics that topology node components receive from the canvas.
 * These are derived from the responsive presentation mode in `topologyLayout`
 * and drive node sizing so nodes stay consistent with the link/cable layer.
 */
export interface NodeLayoutMetrics {
  nodeWidth: number;
  nodeHeight: number;
  iconSize: number;
  fontSize: number;
  /** When false the node renders in minimal mode (secondary line omitted). */
  showIpOnNode: boolean;
}