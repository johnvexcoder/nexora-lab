# Nexora Lab — Agent Protocol

Status: active (versioned migration defined in the Nexora workspace spec)
Source of truth: `nexora-workspace/docs/CORE-AGENT-PROTOCOL.md`

## Endpoints served

All under `/api/agent`, mounted at `backend/src/routes/agent.ts`. The agent-only endpoints are exempt from CSRF (they authenticate via API-key header, not cookies):

### Agent-facing

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/report` | `X-Agent-Key` | Telemetry (full report on first boot, deltas after) |
| POST | `/register` | `X-Agent-Key` | Host identity + capabilities |
| POST | `/events` | `X-Agent-Key` | Batched state-change events |

### Admin-facing

| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| GET | `/` | settings.view | List agents |
| POST | `/` | settings.manage | Create agent (generates `hl_*` API key) |
| DELETE | `/:id` | settings.manage | Delete agent + its events |
| POST | `/:id/rotate-key` | settings.manage | Rotate API key |
| POST | `/heartbeat-check` | settings.manage | Mark stale agents offline (>30 s) |
| GET | `/:id/events` | settings.view | Read agent events |

## Authentication

`X-Agent-Key` header, `hl_` prefix, SHA-256 hashed and matched against `agents.api_key_hash`. Plaintext keys are never stored. Key rotation produces a new hash; in-flight old keys are rejected once the row updates.

## Ingestion behavior (`POST /report`)

Zod-validated (`AgentReportSchema`, `.passthrough()`). Steps:

1. **Flat metric extraction** (`extractFlatMetrics`): `plugins[].data` keys map to the `agents` table columns for quick dashboard display (cpu, ram, disk, net, temp, containers, tags, etc.). Missing `undefined` fields fall back to previously stored values — a missing metric is never forced to zero.
2. **Delta merge**: incoming `plugins[]` replace-by-plugin into stored `plugins_json`.
3. **Capabilities** stored to `capabilities_json`.
4. **Container state-change detection**: stopped/started/added containers generate notifications.
5. Single `UPDATE` marking `status='online'`, `last_report_at=now`.

## Ingestion behavior (`POST /register`)

Zod-validated (`AgentRegistrationSchema`, `.strict()`). Persists identity fields (host_name, ip, os, host_type, machine_id, mac, virt_type, hypervisor), `capabilities_json`, and `agent_version`. The agent row must pre-exist (created by admin); registration claims it.

## Ingestion behavior (`POST /events`)

Zod-validated (`AgentEventsSchema`, `.strict()`). Verifies `body.hostId === agent.host_id` (else `403 agent_identity_mismatch`). Dedupes by composite key `{agent_id}:{event.id}` via `INSERT OR IGNORE` inside a transaction. Responds `{ ok: true, accepted: N }`.

## Offline detection

`POST /heartbeat-check` flips `online` agents to `offline` when `last_report_at` is older than 30 s. `AgentMetricsProvider` reconciles agent rows when constructing `MetricSnapshot[]`.

## Versioning contract

Current wire format is **v0, implicit** — the Core derives format from convention, not from an explicit `protocolVersion`. The `X-Agent-Version` header is sent by the Agent but is not currently read by the ingest routes.

The Nexora target is a **versioned v1 envelope**:

```json
{ "protocolVersion": 1, "agentVersion": "…", "nodeId": "…", "hostname": "…", "timestamp": 1234567890, "payload": { … } }
```

Backward-compatibility rules that the Core must honor:

1. Requests without `protocolVersion` (or `X-Protocol-Version`) are v0 — accept as today, forever during migration.
2. The Core must not reject requests that carry an explicit `protocolVersion`; schemas already tolerate it where `.passthrough()` and are explicitly widened for the `.strict()` schemas to accept an optional `protocolVersion` integer.
3. Unknown future versions are accepted but not acted on beyond logging (no silent reinterpretation).
4. Missing metrics stay distinct from zero — never reinterpret `null`/absent as `0`.

Required backward-compatibility adapters (identified):

| Adapter | Where | Status |
|---------|-------|--------|
| Accept optional `protocolVersion` in strict schemas (register/events) | `backend/src/routes/agent.ts` | readied in this task |
| Parse `X-Protocol-Version` header to select parser | agent routes (future) | pending — gated behind agent adoption |
| Unwrap v1 `payload` and reuse existing v0 handlers | agent routes (future) | pending |
| Persist negotiated protocol version / deprecation log for v0 | agent routes (future) | pending |
| Mirror agent protocols through `AgentMetricsProvider` unmodified | provider layer | no change needed |

See `docs/CURRENT-CORE-ARCHITECTURE.md` §7 for the audit snapshot of this
surface.
